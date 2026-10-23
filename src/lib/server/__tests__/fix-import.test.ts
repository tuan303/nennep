/**
 * Regression tests of the workbook import: history-aware links (RULES-2), catalog snapshot kept (RULES-3), BR-POINT-04
 * on import (RULES-6), reward status (RULES-9), app changes never reverted silently (INTEGRITY-2), code collisions
 * (INTEGRITY-5), crash recovery (INTEGRITY-8), re-scoring stored incidents with a new error table (RESCORE).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { POST as commitPOST } from "@/app/api/imports/workbook/commit/route";
import { POST as previewPOST } from "@/app/api/imports/workbook/preview/route";
import { POST as feedbackPOST } from "@/app/api/incidents/[id]/feedback/route";
import { PATCH as incPATCH } from "@/app/api/incidents/[id]/route";
import { POST as incidentPOST } from "@/app/api/incidents/route";
import { PUT as catalogPUT } from "@/app/api/settings/[level]/catalog/route";
import { POST as transferPOST } from "@/app/api/students/[id]/transfer/route";
import type { ApiErrorBody, WorkbookCommitResult, WorkbookPayload, WorkbookPreview } from "../../contract";
import { addDays, compactDate, mondayOf, todayVN } from "../../engine/dates";
import type { Incident, Reward, Student } from "../../types";
import { db } from "../firebase-admin";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject, TEST_CATALOG } from "./helpers";

const PROJECT = "demo-test-fix-import";
const today = todayVN();
const d = addDays(today, -1);
const code = (n: number, date = d) => `NN-${compactDate(date)}-${String(n).padStart(4, "0")}`;
const t = { admin: "", gvcn: "", editor: "" };

type Row = WorkbookPayload["incidents"][number];
type Link = WorkbookPayload["links"][number];
function payload(parts: { incidents?: Row[]; links?: Link[]; rewards?: WorkbookPayload["rewards"]; students?: WorkbookPayload["students"] }): WorkbookPayload {
  return { levelId: "THCS", sourceFileName: "so-nen-nep.xlsx", classes: [], catalog: [], weeks: [], students: parts.students ?? [], incidents: parts.incidents ?? [], links: parts.links ?? [], rewards: parts.rewards ?? [] };
}
const row = (n: number, over: Partial<Row> = {}): Row => ({ rowNumber: 4 + n, code: code(n), date: d, classCode: "7A01", errorCode: "L01", scope: "Cá nhân", ...over });

async function preview(p: WorkbookPayload, overwriteAppChanges?: boolean) {
  const res = await callRoute<WorkbookPreview & ApiErrorBody>(previewPOST, { method: "POST", url: "/api/imports/workbook/preview", token: t.admin, body: { payload: p, overwriteAppChanges } });
  expect(res.status).toBe(200);
  return res.body;
}
async function importAll(p: WorkbookPayload, overwriteAppChanges?: boolean) {
  const pv = await preview(p, overwriteAppChanges);
  const res = await callRoute<WorkbookCommitResult & ApiErrorBody>(commitPOST, { method: "POST", url: "/api/imports/workbook/commit", token: t.admin, body: { payload: p, previewHash: pv.previewHash, overwriteAppChanges } });
  expect(res.status).toBe(200);
  return { preview: pv, result: res.body };
}
const incident = async (n: number, date = d) => (await getDoc<Incident>("incidents", `THCS_${code(n, date)}`)) as Incident;
const messages = (pv: WorkbookPreview, key: string) => pv.issues.filter((i) => i.key === key).flatMap((i) => i.messages);

describe("workbook import fixes", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", {
      classes: ["7A01", "7A02"],
      students: [
        { id: "S1", name: "Nguyễn An", classCode: "7A01" },
        { id: "S2", name: "Lê Bình", classCode: "7A01" },
      ],
    });
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR" })).token;
    t.gvcn = (await createTestUser({ uid: "gv", role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "7A01" }] })).token;
  });

  it("RULES-2: a transfer after the incident neither rewrites history nor flags it, and the record stays editable", async () => {
    const p = payload({ incidents: [row(1)], links: [{ rowNumber: 5, incidentCode: code(1), studentId: "S1", studentClass: "7A01" }] });
    await importAll(p);
    expect((await incident(1)).students).toEqual([{ id: "S1", name: "Nguyễn An", classCode: "7A01" }]);
    const tr = await callRoute(transferPOST, { method: "POST", url: "/api/students/S1/transfer", token: t.admin, params: { id: "S1" }, body: { toClassCode: "7A02", effectiveDate: today } });
    expect(tr.status).toBe(200);

    const again = await preview(p);
    expect(again.sections.incidents).toMatchObject({ willUpdate: 0, warning: 0 });
    expect(again.sections.links.warning).toBe(0);
    expect(await incident(1)).toMatchObject({ dataCheck: "OK", students: [{ id: "S1", classCode: "7A01" }] });
    const edit = await callRoute(incPATCH, { method: "PATCH", url: `/api/incidents/THCS_${code(1)}`, token: t.admin, params: { id: `THCS_${code(1)}` }, body: { detail: "Ghi chú thêm" } });
    expect(edit.status).toBe(200);

    // A NEW row dated before the transfer, linking S1 in the class S1 was in at that date (history), is fine too.
    const p2 = payload({ incidents: [row(2)], links: [{ rowNumber: 6, incidentCode: code(2), studentId: "S1", studentClass: "7A01" }] });
    await importAll(p2);
    expect(await incident(2)).toMatchObject({ dataCheck: "OK", students: [{ id: "S1", classCode: "7A01" }] });
  });

  it("RULES-3: re-importing after a catalog penalty change keeps the penalty of the time of recording", async () => {
    const p = payload({ incidents: [row(3, { pointsInFile: 2 })], links: [{ rowNumber: 7, incidentCode: code(3), studentId: "S2" }] });
    await importAll(p);
    expect(await incident(3)).toMatchObject({ penalty: 2, points: 2 });
    const items = TEST_CATALOG.map((c) => (c.code === "L01" ? { ...c, penalty: 3 } : c));
    expect((await callRoute(catalogPUT, { method: "PUT", url: "/api/settings/THCS/catalog", token: t.admin, params: { level: "THCS" }, body: { items } })).status).toBe(200);

    const same = await preview(p);
    expect(same.sections.incidents.willUpdate).toBe(0);
    const changed = payload({ incidents: [row(3, { pointsInFile: 2, detail: "Bổ sung" })], links: p.links });
    const res = await importAll(changed);
    expect(res.preview.sections.incidents.willUpdate).toBe(1);
    expect(messages(res.preview, code(3)).join(" ")).toContain("Bảng điểm hiện tại 3 điểm/HS; giữ mức 2 điểm/HS lúc ghi nhận.");
    expect(await incident(3)).toMatchObject({ penalty: 2, points: 2, dataCheck: "OK", detail: "Bổ sung" });
  });

  it("RULES-6: a 'Cá nhân' row without any named student goes to review", async () => {
    await importAll(payload({ incidents: [row(4, { errorCode: "L02" })] }));
    const inc = await incident(4);
    expect(inc.dataCheck).toBe("REVIEW");
    expect(inc.dataIssues.map((i) => i.code)).toContain("MISSING_STUDENTS");
  });

  it("INTEGRITY-2: GVCN feedback and review fixes made in the app are not reverted by re-importing the same file", async () => {
    const p = payload({ incidents: [row(5, { errorCode: "L02" })] });
    await importAll(p);
    const id = `THCS_${code(5)}`;
    const fb = await callRoute(feedbackPOST, { method: "POST", url: `/api/incidents/${id}/feedback`, token: t.gvcn, params: { id }, body: { status: "Đã đóng", note: "Đã nhắc nhở" } });
    expect(fb.status).toBe(200);

    const changed = payload({ incidents: [row(5, { errorCode: "L02", detail: "Theo sổ" })] });
    const kept = await importAll(changed);
    expect(kept.preview.sections.incidents.willUpdate).toBe(0);
    expect(messages(kept.preview, code(5))[0]).toContain("đã được cập nhật trong phần mềm");
    expect(await incident(5)).toMatchObject({ status: "Đã đóng", gvcnNote: "Đã nhắc nhở" });
    expect((await incident(5)).detail).toBeUndefined();

    // Explicit overwrite: the file wins, but a blank status cell still keeps the stored status.
    const forced = await importAll(changed, true);
    expect(forced.preview.sections.incidents.willUpdate).toBe(1);
    expect(await incident(5)).toMatchObject({ status: "Đã đóng", gvcnNote: "Đã nhắc nhở", detail: "Theo sổ" });

    // A transfer made in the app is not undone by an older class in "DS Học sinh".
    await callRoute(transferPOST, { method: "POST", url: "/api/students/S2/transfer", token: t.admin, params: { id: "S2" }, body: { toClassCode: "7A02", effectiveDate: today } });
    const students = await importAll(payload({ students: [{ rowNumber: 3, id: "S2", name: "Lê Bình", classCode: "7A01" }] }));
    expect(students.preview.sections.students).toMatchObject({ willUpdate: 0, warning: 1 });
    expect((await getDoc<Student>("students", "S2"))?.classCode).toBe("7A02");
  });

  it("INTEGRITY-5: a row whose code belongs to another incident (other class / error) is an ERROR, never an overwrite", async () => {
    const d2 = addDays(today, -2);
    const app = await callRoute<Incident>(incidentPOST, {
      method: "POST",
      url: "/api/incidents",
      token: t.editor,
      body: { levelId: "THCS", date: d2, classCode: "7A01", errorCode: "L02", scope: "Tập thể", detail: "Ghi trong app" },
    });
    expect(app.status).toBe(201);
    const pv = await preview(payload({ incidents: [{ rowNumber: 9, code: app.body.code, date: d2, classCode: "7A02", errorCode: "L04", scope: "Tập thể", detail: "Dòng trong file cũ" }] }));
    expect(pv.sections.incidents).toMatchObject({ error: 1, willUpdate: 0 });
    expect(messages(pv, app.body.code)[0]).toContain("đã thuộc một sự việc khác");
    expect(await getDoc<Incident>("incidents", app.body.id)).toMatchObject({ classCode: "7A01", errorCode: "L02", detail: "Ghi trong app" });
  });

  it("RULES-9: an unknown or blank reward status never silently un-verifies a reward", async () => {
    const kt = `KT-${compactDate(d)}-0001`;
    await importAll(payload({ rewards: [{ rowNumber: 3, code: kt, date: d, classCode: "7A01", reason: "Lớp sạch", points: 5, status: "Đã xác nhận" }] }));
    expect((await getDoc<Reward>("rewards", `THCS_${kt}`))?.status).toBe("Đã xác nhận");
    const blank = await preview(payload({ rewards: [{ rowNumber: 3, code: kt, date: d, classCode: "7A01", reason: "Lớp sạch", points: 5 }] }));
    expect(blank.sections.rewards).toMatchObject({ willUpdate: 0, warning: 0 });
    const unknown = await importAll(payload({ rewards: [{ rowNumber: 3, code: kt, date: d, classCode: "7A01", reason: "Lớp sạch đẹp", points: 5, status: "Đã duyệt" }] }));
    expect(messages(unknown.preview, kt)[0]).toContain("Trạng thái “Đã duyệt” không hợp lệ");
    expect(await getDoc<Reward>("rewards", `THCS_${kt}`)).toMatchObject({ status: "Đã xác nhận", reason: "Lớp sạch đẹp" });
    const downgrade = await preview(payload({ rewards: [{ rowNumber: 3, code: kt, date: d, classCode: "7A01", reason: "Lớp sạch đẹp", points: 5, status: "Mới ghi nhận" }] }));
    expect(messages(downgrade, kt).join(" ")).toContain("Trạng thái đổi từ “Đã xác nhận” sang “Mới ghi nhận”");
  });

  it("INTEGRITY-8: a commit that died before rebuilding the digests is repaired by the next commit, even with nothing to write", async () => {
    const p = payload({ incidents: [row(9, { errorCode: "L02", scope: "Tập thể" })] });
    const first = await importAll(p);
    expect(await getDoc("importBatches", first.result.batchId)).toMatchObject({ status: "done" });
    // Simulate the crash window: records written, digests not rebuilt, batch left "running".
    const week = mondayOf(d);
    const digestRef = db().collection("digests").doc(`THCS__inc__${week}`);
    const items = ((await digestRef.get()).get("items") as Incident[]).filter((i) => i.code !== code(9));
    await digestRef.update({ items });
    const dead = db().collection("importBatches").doc("dead-batch");
    await dead.set({ id: "dead-batch", kind: "workbook", status: "running", levelId: "THCS", createdAt: new Date(Date.now() - 10 * 60_000).toISOString() });

    const retry = await importAll(p);
    expect(retry.preview.sections.incidents).toMatchObject({ willCreate: 0, willUpdate: 0 });
    const digest = (await digestRef.get()).get("items") as Incident[];
    expect(digest.some((i) => i.code === code(9))).toBe(true);
    expect(await getDoc("importBatches", "dead-batch")).toMatchObject({ status: "interrupted", repairedBy: retry.result.batchId });
    expect((await listDocs<{ status?: string }>("importBatches")).filter((b) => b.status === "running")).toHaveLength(0);
  });

  it("RESCORE: 'Tính lại sự việc đã ghi' re-scores stored incidents with the file's new error table; without it the snapshot stays", async () => {
    // L03 is 1 điểm/HS: a collective row without named students scores 0; with 2 unnamed students it scores 2.
    const d3 = addDays(today, -3);
    const old = payload({
      incidents: [
        row(20, { errorCode: "L03", scope: "Tập thể", pointsInFile: 0 }),
        row(21, { errorCode: "L03", scope: "Tập thể", pointsInFile: 0 }),
        row(22, { errorCode: "L03", scope: "Tập thể", unnamedCount: 2, pointsInFile: 2 }),
      ],
    });
    await importAll(old);
    expect(await incident(20)).toMatchObject({ penalty: 1, unit: "/HS", points: 0 });
    expect(await incident(22)).toMatchObject({ unnamedCount: 2, points: 2 });
    // An incident recorded in the app (no import hash) with the same error.
    const app = await callRoute<Incident>(incidentPOST, {
      method: "POST",
      url: "/api/incidents",
      token: t.editor,
      body: { levelId: "THCS", date: d3, classCode: "7A01", errorCode: "L03", scope: "Tập thể", unnamedCount: 1 },
    });
    expect(app.status).toBe(201);

    // The school changes L03 to 5 điểm/lần in its workbook ("Bảng điểm lỗi"). Row 20's sheet shows the new score,
    // rows 21/22 still hold the recorded score (e.g. a system export).
    const l03 = TEST_CATALOG.find((c) => c.code === "L03")!;
    const next: WorkbookPayload = {
      ...payload({
        incidents: [
          row(20, { errorCode: "L03", scope: "Tập thể", pointsInFile: 5 }),
          row(21, { errorCode: "L03", scope: "Tập thể", pointsInFile: 0 }),
          row(22, { errorCode: "L03", scope: "Tập thể", unnamedCount: 2, pointsInFile: 2 }),
          { rowNumber: 30, code: app.body.code, date: d3, classCode: "7A01", errorCode: "L03", scope: "Tập thể", unnamedCount: 1 },
        ],
      }),
      catalog: [{ code: "L03", category: l03.category, issue: "Không đeo thẻ học sinh", penalty: 5, unit: "/lần" }],
    };
    const kept = await preview(next);
    expect(messages(kept, code(20)).join(" ")).toContain("giữ mức 1 điểm/HS lúc ghi nhận");

    const body = { payload: next, rescoreExisting: true };
    const pv = await callRoute<WorkbookPreview & ApiErrorBody>(previewPOST, { method: "POST", url: "/api/imports/workbook/preview", token: t.admin, body });
    expect(pv.status).toBe(200);
    expect(pv.body.previewHash).not.toBe(kept.previewHash);
    expect(pv.body.sections.incidents.willUpdate).toBe(3);
    expect(messages(pv.body, code(20)).join(" ")).toContain("Tính lại theo bảng điểm hiện tại 5 điểm/lần (lúc ghi nhận: 1 điểm/HS).");
    expect(messages(pv.body, code(22)).join(" ")).toContain("Đổi đơn vị /HS → /lần: 2 HS chưa rõ tên không còn được tính.");
    expect(messages(pv.body, "L03").join(" ")).toContain("tính lại các sự việc đã ghi có trong file");
    // The app-recorded incident is not reverted without "Ghi đè" – and the admin is told why it was not re-scored.
    expect(messages(pv.body, app.body.code).join(" ")).toContain("chỉ được tính lại khi chọn cả “Ghi đè thay đổi trong phần mềm”");

    // The flag is part of the preview hash: committing without it is refused.
    const mismatch = await callRoute<ApiErrorBody>(commitPOST, { method: "POST", url: "/api/imports/workbook/commit", token: t.admin, body: { payload: next, previewHash: pv.body.previewHash } });
    expect(mismatch.status).toBe(409);
    const res = await callRoute<WorkbookCommitResult & ApiErrorBody>(commitPOST, { method: "POST", url: "/api/imports/workbook/commit", token: t.admin, body: { ...body, previewHash: pv.body.previewHash } });
    expect(res.status).toBe(200);
    // Only penalty/unit are re-scored: the recorded error text stays ("Không đeo thẻ").
    expect(await incident(20)).toMatchObject({ errorCode: "L03", issue: "Không đeo thẻ", penalty: 5, unit: "/lần", occurrenceCount: 1, points: 5, dataCheck: "OK" });
    // A file holding the recorded score is not a points mismatch (no review queue for every re-scored incident).
    const r21 = await incident(21);
    expect(r21).toMatchObject({ points: 5, dataCheck: "OK" });
    expect(r21.dataIssues.map((i) => i.code)).not.toContain("POINTS_MISMATCH_IMPORT");
    expect(await incident(22)).toMatchObject({ unit: "/lần", unnamedCount: 0, points: 5 });
    expect(await getDoc<Incident>("incidents", app.body.id)).toMatchObject({ penalty: 1, unit: "/HS", unnamedCount: 1 });

    // Idempotent: the same request again changes nothing.
    const again = await callRoute<WorkbookPreview & ApiErrorBody>(previewPOST, { method: "POST", url: "/api/imports/workbook/preview", token: t.admin, body });
    expect(again.body.sections.incidents.willUpdate).toBe(0);
  });
});
