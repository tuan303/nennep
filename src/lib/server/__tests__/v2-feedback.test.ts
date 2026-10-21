/**
 * REQ_V2 §5.4 – Biện pháp xử lý / khắc phục through POST /api/incidents/:id/feedback: who may write what, by/at fields,
 * no-op rules, audit, GVCN redaction, and workbook re-imports that never silently drop a remediation.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { GET as datasetGET } from "@/app/api/dataset/route";
import { POST as commitPOST } from "@/app/api/imports/workbook/commit/route";
import { POST as previewPOST } from "@/app/api/imports/workbook/preview/route";
import { POST as feedbackPOST } from "@/app/api/incidents/[id]/feedback/route";
import { DELETE as incDELETE } from "@/app/api/incidents/[id]/route";
import { POST as incidentPOST } from "@/app/api/incidents/route";
import type { ApiErrorBody, GvcnFeedbackInput, WorkbookCommitResult, WorkbookPayload, WorkbookPreview } from "../../contract";
import { addDays, compactDate, todayVN } from "../../engine/dates";
import type { AuditLog, Incident, LevelDataset } from "../../types";
import { APP_CHANGED_SKIP_MESSAGE } from "../admin/workbook-incidents";
import { readVersion } from "../versions";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-v2-feedback";
const yesterday = addDays(todayVN(), -1);
const t = { admin: "", editor: "", editorTh: "", viewer: "", gvcn: "", gvcnOther: "" };

const newIncident = async (classCode = "6A01") => {
  const res = await callRoute<Incident>(incidentPOST, {
    method: "POST",
    url: "/api/incidents",
    token: t.admin,
    body: { levelId: "THCS", date: yesterday, classCode, errorCode: "L02", scope: "Tập thể", occurrenceCount: 1 },
  });
  expect(res.status).toBe(201);
  return res.body;
};
const feedback = (token: string, id: string, b: GvcnFeedbackInput) =>
  callRoute<Incident & ApiErrorBody>(feedbackPOST, { method: "POST", url: `/api/incidents/${id}/feedback`, token, params: { id }, body: b });
/** GVCN_FEEDBACK audits of an incident, oldest first (auto ids are random: never rely on the listing order). */
const audits = async (entityId: string) =>
  (await listDocs<AuditLog>("auditLogs"))
    .filter((a) => a.action === "GVCN_FEEDBACK" && a.entityId === entityId)
    .sort((a, b) => a.ts.localeCompare(b.ts));

describe("feedback & remediation (REQ_V2 §5.4)", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", { classes: ["6A01", "6A02"] });
    await seedReference("TH", { classes: ["1A1"] });
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN", displayName: "Quản trị" })).token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR", displayName: "Nguyễn Văn A" })).token;
    t.editorTh = (await createTestUser({ uid: "editorTh", role: "EDITOR", levels: ["TH"] })).token;
    t.viewer = (await createTestUser({ uid: "viewer", role: "VIEWER" })).token;
    t.gvcn = (await createTestUser({ uid: "gvcn", role: "GVCN", displayName: "Trần Thị B", gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }] })).token;
    t.gvcnOther = (await createTestUser({ uid: "gvcnOther", role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "6A02" }] })).token;
  });

  it("GVCN of the class: note + status + remediation, with by/at fields and one audit", async () => {
    const i = await newIncident();
    const res = await feedback(t.gvcn, i.id, { note: "Đã nhắc nhở", status: "Đang xử lý", remediation: "Lớp trực nhật bổ sung 1 tuần" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      gvcnNote: "Đã nhắc nhở",
      status: "Đang xử lý",
      remediation: "Lớp trực nhật bổ sung 1 tuần",
      remediationBy: "Trần Thị B",
      gvcnNoteBy: "Trần Thị B",
      rev: 2,
    });
    expect(res.body.remediationAt).toBeTruthy();
    expect(res.body.gvcnNoteAt).toBe(res.body.remediationAt);
    const stored = await getDoc<Incident>("incidents", i.id);
    expect(stored?.remediation).toBe("Lớp trực nhật bổ sung 1 tuần");
    const digest = (await getDoc<{ items: Incident[] }>("digests", `THCS__inc__${i.week}`))?.items ?? [];
    expect(digest.find((x) => x.id === i.id)?.remediation).toBe("Lớp trực nhật bổ sung 1 tuần");
    const log = await audits(i.id);
    expect(log).toHaveLength(1);
    expect((log[0].detail as { changes: Record<string, unknown> }).changes).toMatchObject({
      remediation: { before: null, after: "Lớp trực nhật bổ sung 1 tuần" },
      gvcnNote: { before: null, after: "Đã nhắc nhở" },
    });
  });

  it("remediation only: gvcnNoteBy/At untouched; the same values again write nothing", async () => {
    const i = await newIncident();
    const res = await feedback(t.gvcn, i.id, { remediation: "Viết bản cam kết" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ remediation: "Viết bản cam kết", remediationBy: "Trần Thị B" });
    expect("gvcnNoteBy" in res.body).toBe(false);
    const v0 = await readVersion("THCS");
    const same = await feedback(t.gvcn, i.id, { remediation: "Viết bản cam kết", status: i.status });
    expect(same.status).toBe(200);
    expect(same.body.rev).toBe(res.body.rev);
    expect(await readVersion("THCS")).toBe(v0);
    expect(await audits(i.id)).toHaveLength(1);
  });

  it("EDITOR (incident.remediate): remediation + status on any class of its level, never the GVCN note", async () => {
    const i = await newIncident("6A02");
    const res = await feedback(t.editor, i.id, { remediation: "Nhắc nhở trước toàn trường", status: "Đã đóng" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ remediation: "Nhắc nhở trước toàn trường", remediationBy: "Nguyễn Văn A", status: "Đã đóng" });
    expect("gvcnNoteBy" in res.body).toBe(false);
    const note = await feedback(t.editor, i.id, { note: "Ghi chú của cán bộ" });
    expect(note.status).toBe(403);
    expect(note.body.error.message).toBe("Chỉ GVCN của lớp được ghi phản hồi GVCN.");
    expect((await feedback(t.editor, i.id, { note: "", remediation: "Khác" })).status).toBe(403);
    expect((await getDoc<Incident>("incidents", i.id))?.remediation).toBe("Nhắc nhở trước toàn trường");
    expect((await feedback(t.editorTh, i.id, { remediation: "Cấp khác" })).status).toBe(403);
  });

  it("other GVCN, VIEWER → 403; ADMIN may write everything; empty body → 400", async () => {
    const i = await newIncident();
    const other = await feedback(t.gvcnOther, i.id, { remediation: "Không phải lớp mình" });
    expect(other.status).toBe(403);
    expect(other.body.error.message).toBe("Chỉ GVCN của lớp hoặc quản trị viên mới được phản hồi sự việc này.");
    expect((await feedback(t.viewer, i.id, { remediation: "Người xem" })).status).toBe(403);
    const empty = await feedback(t.gvcn, i.id, {});
    expect(empty.status).toBe(400);
    expect(empty.body.error.message).toBe("Cần nhập phản hồi, biện pháp khắc phục hoặc trạng thái");
    const admin = await feedback(t.admin, i.id, { note: "Ý kiến BGH", remediation: "Gặp phụ huynh", status: "Đang xử lý" });
    expect(admin.status).toBe(200);
    expect(admin.body).toMatchObject({ gvcnNote: "Ý kiến BGH", gvcnNoteBy: "Quản trị", remediation: "Gặp phụ huynh", remediationBy: "Quản trị" });
  });

  it('"" clears the remediation (by/at record who cleared it); deleted incidents → 409', async () => {
    const i = await newIncident();
    await feedback(t.gvcn, i.id, { remediation: "Tạm thời" });
    const cleared = await feedback(t.editor, i.id, { remediation: "" });
    expect(cleared.status).toBe(200);
    expect("remediation" in cleared.body).toBe(false);
    expect(cleared.body.remediationBy).toBe("Nguyễn Văn A");
    const log = await audits(i.id);
    expect(log).toHaveLength(2);
    // Same-millisecond timestamps are possible: look the clearing entry up by content, not by position.
    expect(log.map((a) => a.detail)).toContainEqual(expect.objectContaining({ changes: { remediation: { before: "Tạm thời", after: null } } }));
    await callRoute(incDELETE, { method: "DELETE", url: "/x", params: { id: i.id }, token: t.admin, body: { reason: "Ghi trùng" } });
    const del = await feedback(t.gvcn, i.id, { remediation: "Sau khi xóa" });
    expect(del.status).toBe(409);
  });

  it("dataset: remediation visible to the class GVCN and staff, stripped for another class's GVCN", async () => {
    const i = await newIncident();
    await feedback(t.gvcn, i.id, { remediation: "Biện pháp riêng của lớp" });
    const own = (await callRoute<LevelDataset>(datasetGET, { url: "/api/dataset?level=THCS", token: t.gvcn })).body;
    expect(own.incidents.find((x) => x.id === i.id)).toMatchObject({ remediation: "Biện pháp riêng của lớp", remediationBy: "Trần Thị B" });
    const viewer = (await callRoute<LevelDataset>(datasetGET, { url: "/api/dataset?level=THCS", token: t.viewer })).body;
    expect(viewer.incidents.find((x) => x.id === i.id)?.remediation).toBe("Biện pháp riêng của lớp");
    const other = (await callRoute<LevelDataset>(datasetGET, { url: "/api/dataset?level=THCS", token: t.gvcnOther })).body;
    const redacted = other.incidents.find((x) => x.id === i.id);
    expect(redacted).toBeDefined();
    expect(["remediation", "remediationBy", "remediationAt"].filter((k) => k in (redacted as object))).toEqual([]);
  });

  it("workbook re-import: a remediation counts as an app change (skipped with a warning) and survives an overwrite", async () => {
    const code = `NN-${compactDate(yesterday)}-0901`;
    const id = `THCS_${code}`;
    const payload = (detail: string): WorkbookPayload => ({
      levelId: "THCS",
      sourceFileName: "so-nen-nep.xlsx",
      classes: [],
      catalog: [],
      weeks: [],
      students: [],
      incidents: [{ rowNumber: 5, code, date: yesterday, classCode: "6A01", errorCode: "L02", scope: "Tập thể", occurrenceCount: 1, detail }],
      links: [],
      rewards: [],
    });
    const importAll = async (p: WorkbookPayload, overwriteAppChanges?: boolean) => {
      const pv = await callRoute<WorkbookPreview>(previewPOST, { method: "POST", url: "/x", token: t.admin, body: { payload: p, overwriteAppChanges } });
      expect(pv.status).toBe(200);
      const res = await callRoute<WorkbookCommitResult>(commitPOST, { method: "POST", url: "/x", token: t.admin, body: { payload: p, previewHash: pv.body.previewHash, overwriteAppChanges } });
      expect(res.status).toBe(200);
      return pv.body;
    };
    await importAll(payload("Bản gốc"));
    expect((await feedback(t.gvcn, id, { remediation: "Lao động vệ sinh sân trường" })).status).toBe(200);

    const skipped = await importAll(payload("Bản sửa trong file"));
    expect(skipped.issues.filter((x) => x.key === code).flatMap((x) => x.messages)).toContain(APP_CHANGED_SKIP_MESSAGE);
    expect(await getDoc<Incident>("incidents", id)).toMatchObject({ detail: "Bản gốc", remediation: "Lao động vệ sinh sân trường" });

    await importAll(payload("Bản sửa trong file"), true);
    expect(await getDoc<Incident>("incidents", id)).toMatchObject({ detail: "Bản sửa trong file", remediation: "Lao động vệ sinh sân trường", remediationBy: "Trần Thị B" });
  });
});
