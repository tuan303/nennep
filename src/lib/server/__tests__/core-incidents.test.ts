import { beforeAll, describe, expect, it } from "vitest";
import { POST as createPOST, GET as listGET } from "@/app/api/incidents/route";
import { DELETE as incDELETE, GET as incGET, PATCH as incPATCH } from "@/app/api/incidents/[id]/route";
import { POST as feedbackPOST } from "@/app/api/incidents/[id]/feedback/route";
import { POST as restorePOST } from "@/app/api/incidents/[id]/restore/route";
import type { ApiErrorBody, IncidentCreateInput, ListResponse } from "../../contract";
import { addDays, mondayOf, todayVN } from "../../engine/dates";
import type { AuditLog, Incident } from "../../types";
import { readVersion } from "../versions";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-core-incidents";
const today = todayVN();
const yesterday = addDays(today, -1);

type Tokens = Record<"admin" | "editor" | "editor2" | "viewer" | "gvcn", string>;
const t = {} as Tokens;

function body(over: Partial<IncidentCreateInput> = {}): IncidentCreateInput {
  return { levelId: "THCS", date: yesterday, classCode: "7A01", errorCode: "L01", scope: "Cá nhân", studentIds: ["S1"], ...over };
}

async function create(token: string, over: Partial<IncidentCreateInput> = {}) {
  return callRoute<Incident & ApiErrorBody>(createPOST, { method: "POST", url: "/api/incidents", token, body: body(over) });
}

async function weekDigest(week: string): Promise<Incident[]> {
  return (await getDoc<{ items: Incident[] }>("digests", `THCS__inc__${week}`))?.items ?? [];
}

async function audits(action: AuditLog["action"], entityId?: string): Promise<AuditLog[]> {
  return (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === action && (!entityId || a.entityId === entityId));
}

describe("incidents API", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", {
      classes: ["7A01", "7A02", { code: "7A03", active: false }],
      students: [
        { id: "S1", name: "Nguyễn Văn An", classCode: "7A01" },
        { id: "S2", name: "Trần Thị Bình", classCode: "7A01" },
        { id: "S3", name: "Lê Minh Châu", classCode: "7A01" },
        { id: "S4", name: "Phạm Đức Dũng", classCode: "7A01" },
        { id: "S5", name: "Hoàng Gia Huy", classCode: "7A02" },
        { id: "S9", name: "Đỗ Quang Khải", classCode: "7A01", status: "TRANSFERRED_OUT" },
      ],
    });
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN", displayName: "Quản trị" })).token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR", displayName: "Cô Lan" })).token;
    t.editor2 = (await createTestUser({ uid: "editor2", role: "EDITOR" })).token;
    t.viewer = (await createTestUser({ uid: "viewer", role: "VIEWER" })).token;
    t.gvcn = (await createTestUser({ uid: "gvcn", role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "7A01" }] })).token;
  });

  it("AC-002: VIEWER cannot create incidents (403, nothing written)", async () => {
    const v0 = await readVersion("THCS");
    const res = await create(t.viewer);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(await listDocs("incidents")).toHaveLength(0);
    expect(await listDocs("counters")).toHaveLength(0);
    expect(await readVersion("THCS")).toBe(v0);
  });

  it("AC-003: rejects students of another class or not ACTIVE", async () => {
    const other = await create(t.editor, { studentIds: ["S1", "S5"] });
    expect(other.status).toBe(400);
    expect(other.body.error.code).toBe("VALIDATION");
    expect(other.body.error.message).toContain("Hoàng Gia Huy (7A02) không thuộc lớp 7A01");
    const inactive = await create(t.editor, { studentIds: ["S9"] });
    expect(inactive.status).toBe(400);
    expect(inactive.body.error.message).toContain("không còn ở trạng thái Đang học");
    const unknown = await create(t.editor, { studentIds: ["NOPE"] });
    expect(unknown.body.error.message).toContain("Không tìm thấy học sinh mã NOPE");
    const inactiveClass = await create(t.editor, { classCode: "7A03", studentIds: [] , scope: "Tập thể", errorCode: "L02" });
    expect(inactiveClass.status).toBe(400);
    expect(await listDocs("incidents")).toHaveLength(0);
  });

  it("AC-004: /HS error 2 points × 3 students = 6 points, server-built snapshot and code", async () => {
    const res = await create(t.editor, { studentIds: ["S1", "S2", "S3"], points: 999 } as Partial<IncidentCreateInput>);
    expect(res.status).toBe(201);
    const inc = res.body;
    expect(inc.points).toBe(6);
    expect(inc.relatedStudentCount).toBe(3);
    expect(inc.code).toBe(`NN-${yesterday.replaceAll("-", "")}-0001`);
    expect(inc.id).toBe(`THCS_${inc.code}`);
    expect(inc.week).toBe(mondayOf(yesterday));
    expect(inc).toMatchObject({ unit: "/HS", penalty: 2, issue: "Đi học muộn", group: "Nhóm 1", grade: 7, dataCheck: "OK", source: "app" });
    expect(inc.students).toEqual([
      { id: "S1", name: "Nguyễn Văn An", classCode: "7A01" },
      { id: "S2", name: "Trần Thị Bình", classCode: "7A01" },
      { id: "S3", name: "Lê Minh Châu", classCode: "7A01" },
    ]);
    expect(inc.createdBy).toBe("editor");
    expect(inc.createdByName).toBe("Cô Lan");
    expect(inc.reporter).toBe("Cô Lan");
    expect(await getDoc<Incident>("incidents", inc.id)).toEqual(inc);
    expect((await weekDigest(inc.week)).map((i) => i.id)).toContain(inc.id);
  });

  it("AC-005: /HS without students is refused with a clear reason", async () => {
    const res = await create(t.editor, { studentIds: [], scope: "Tập thể" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("Lỗi tính theo học sinh (/HS) cần ít nhất 1 học sinh");
    const personal = await create(t.editor, { studentIds: [] });
    expect(personal.body.error.message).toContain("Phạm vi Cá nhân phải chọn học sinh liên quan.");
    expect(Array.isArray(personal.body.error.details)).toBe(true);
  });

  it("AC-006: /lần error 5 points × occurrenceCount", async () => {
    const one = await create(t.editor, { errorCode: "L02", scope: "Tập thể", studentIds: [], occurrenceCount: 1 });
    expect(one.status).toBe(201);
    expect(one.body.points).toBe(5);
    const three = await create(t.editor, { errorCode: "L02", scope: "Cá nhân", studentIds: ["S1", "S2"], occurrenceCount: 3 });
    expect(three.body.points).toBe(15);
    expect(three.body.relatedStudentCount).toBe(2);
  });

  it("AC-013: Tập thể /lần incident without students is accepted", async () => {
    const res = await create(t.editor, { errorCode: "L04", scope: "Tập thể", studentIds: [] });
    expect(res.status).toBe(201);
    expect(res.body.students).toEqual([]);
    expect(res.body.scope).toBe("Tập thể");
    expect(res.body.points).toBe(3);
  });

  it("unnamedCount: /HS + Tập thể counts unnamed students and flags THIEU_TEN_HS", async () => {
    const res = await create(t.editor, { scope: "Tập thể", studentIds: ["S4"], unnamedCount: 2 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ points: 6, relatedStudentCount: 3, unnamedCount: 2, dataCheck: "THIEU_TEN_HS" });
    expect(res.body.dataIssues.map((d) => d.code)).toEqual(["UNNAMED_STUDENTS"]);
    const refused = await create(t.editor, { scope: "Cá nhân", studentIds: ["S4"], unnamedCount: 2 });
    expect(refused.status).toBe(400);
  });

  it("rejects future dates, unknown/inactive errors and missing fields", async () => {
    expect((await create(t.editor, { date: addDays(today, 1) })).body.error.message).toContain("tương lai");
    expect((await create(t.editor, { errorCode: "L99" })).body.error.message).toContain('Mã lỗi "L99"');
    expect((await create(t.editor, { errorCode: "L05" })).body.error.message).toContain("ngừng sử dụng");
    const xss = await create(t.editor, { evidenceUrls: ["javascript:alert(1)"] });
    expect(xss.status).toBe(400);
    expect(xss.body.error.message).toContain("http://");
    const missing = await callRoute<ApiErrorBody>(createPOST, { method: "POST", url: "/api/incidents", token: t.editor, body: { levelId: "THCS" } });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: "date" })]));
  });

  it("AC-015: CREATE_INCIDENT audit with user, time and entity", async () => {
    const res = await create(t.editor, { studentIds: ["S2"] });
    const logs = await audits("CREATE_INCIDENT", res.body.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ uid: "editor", email: "editor@nshm.test", role: "EDITOR", entity: "incident", levelId: "THCS", ip: "203.0.113.7" });
    expect(Date.parse(logs[0].ts)).toBeGreaterThan(Date.now() - 60_000);
    expect(logs[0].detail).toMatchObject({ code: res.body.code, points: 2, studentIds: ["S2"] });
  });

  it("clientRequestId makes creation idempotent", async () => {
    const key = "req-0f9c2b7e-1111";
    const first = await create(t.editor, { studentIds: ["S3"], clientRequestId: key });
    const second = await create(t.editor, { studentIds: ["S3"], clientRequestId: key });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    const all = await listDocs<Incident>("incidents");
    expect(all.filter((i) => i.id === first.body.id)).toHaveLength(1);
    expect((await weekDigest(first.body.week)).filter((i) => i.id === first.body.id)).toHaveLength(1);
    expect(await audits("CREATE_INCIDENT", first.body.id)).toHaveLength(1);
  });

  it("editor edit rule: own records within 24h only; admin edits anything", async () => {
    const created = (await create(t.editor, { studentIds: ["S1", "S2", "S3"] })).body;
    const url = `/api/incidents/${created.id}`;
    const params = { id: created.id };

    const other = await callRoute<ApiErrorBody>(incPATCH, { method: "PATCH", url, params, token: t.editor2, body: { detail: "x" } });
    expect(other.status).toBe(403);
    expect(other.body.error.message).toBe("Chỉ được sửa bản ghi của mình trong 24 giờ");

    const own = await callRoute<Incident>(incPATCH, { method: "PATCH", url, params, token: t.editor, body: { studentIds: ["S1", "S2"], detail: "Đi muộn 10 phút" } });
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ points: 4, relatedStudentCount: 2, detail: "Đi muộn 10 phút", updatedBy: "editor@nshm.test", code: created.code });
    const upd = await audits("UPDATE_INCIDENT", created.id);
    expect(upd).toHaveLength(1);
    expect(upd[0].detail?.changes).toMatchObject({ points: { before: 6, after: 4 }, detail: { before: null, after: "Đi muộn 10 phút" } });

    const { db } = await import("../firebase-admin");
    await db().collection("incidents").doc(created.id).update({ createdAt: new Date(Date.now() - 25 * 3_600_000).toISOString() });
    const late = await callRoute<ApiErrorBody>(incPATCH, { method: "PATCH", url, params, token: t.editor, body: { detail: "y" } });
    expect(late.status).toBe(403);
    expect(late.body.error.message).toBe("Chỉ được sửa bản ghi của mình trong 24 giờ");

    const viewer = await callRoute<ApiErrorBody>(incPATCH, { method: "PATCH", url, params, token: t.viewer, body: { detail: "y" } });
    expect(viewer.status).toBe(403);

    const admin = await callRoute<Incident>(incPATCH, { method: "PATCH", url, params, token: t.admin, body: { detail: "" } });
    expect(admin.status).toBe(200);
    expect(admin.body.detail).toBeUndefined();
  });

  it("PATCH recomputes derived fields and moves the incident between week digests", async () => {
    const created = (await create(t.editor, { errorCode: "L02", scope: "Tập thể", studentIds: [] })).body;
    const lastWeekDate = addDays(mondayOf(yesterday), -3);
    const res = await callRoute<Incident>(incPATCH, {
      method: "PATCH",
      url: `/api/incidents/${created.id}`,
      params: { id: created.id },
      token: t.admin,
      body: { date: lastWeekDate, errorCode: "L01", studentIds: ["S1"], scope: "Cá nhân" },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ week: mondayOf(lastWeekDate), unit: "/HS", penalty: 2, points: 2, students: [{ id: "S1", name: "Nguyễn Văn An", classCode: "7A01" }] });
    expect((await weekDigest(created.week)).some((i) => i.id === created.id)).toBe(false);
    const moved = (await weekDigest(mondayOf(lastWeekDate))).find((i) => i.id === created.id);
    expect(moved?.points).toBe(2);

    const bad = await callRoute<ApiErrorBody>(incPATCH, {
      method: "PATCH",
      url: `/api/incidents/${created.id}`,
      params: { id: created.id },
      token: t.admin,
      body: { studentIds: ["S5"] },
    });
    expect(bad.status).toBe(400);
  });

  it("soft delete + restore keep canonical doc and digest consistent", async () => {
    const created = (await create(t.editor, { studentIds: ["S4"] })).body;
    const url = `/api/incidents/${created.id}`;
    const params = { id: created.id };

    expect((await callRoute(incDELETE, { method: "DELETE", url, params, token: t.editor, body: { reason: "Nhập nhầm" } })).status).toBe(403);
    expect((await callRoute(incDELETE, { method: "DELETE", url, params, token: t.admin, body: {} })).status).toBe(400);

    const v0 = await readVersion("THCS");
    const del = await callRoute(incDELETE, { method: "DELETE", url, params, token: t.admin, body: { reason: "Nhập nhầm lớp" } });
    expect(del.status).toBe(200);
    expect(await readVersion("THCS")).toBe(v0 + 1);
    const stored = await getDoc<Incident>("incidents", created.id);
    expect(stored).toMatchObject({ deleteReason: "Nhập nhầm lớp", deletedBy: "admin@nshm.test" });
    expect((await weekDigest(created.week)).some((i) => i.id === created.id)).toBe(false);
    expect(await audits("DELETE_INCIDENT", created.id)).toHaveLength(1);

    const again = await callRoute<ApiErrorBody>(incDELETE, { method: "DELETE", url, params, token: t.admin, body: { reason: "Lần hai" } });
    expect(again.status).toBe(409);

    const list = await callRoute<ListResponse<Incident>>(listGET, { url: "/api/incidents?level=THCS&deleted=1", token: t.admin });
    expect(list.status).toBe(200);
    expect(list.body.items.map((i) => i.id)).toContain(created.id);
    expect((await callRoute(listGET, { url: "/api/incidents?level=THCS&deleted=1", token: t.editor })).status).toBe(403);

    expect((await callRoute(incGET, { url, params, token: t.viewer })).status).toBe(404);
    expect((await callRoute<Incident>(incGET, { url, params, token: t.admin })).body.deletedAt).toBeTruthy();
    expect((await callRoute(incPATCH, { method: "PATCH", url, params, token: t.admin, body: { detail: "z" } })).status).toBe(409);

    const restored = await callRoute<Incident>(restorePOST, { method: "POST", url: `${url}/restore`, params, token: t.admin });
    expect(restored.status).toBe(200);
    expect(restored.body.deletedAt).toBeUndefined();
    expect((await getDoc<Incident>("incidents", created.id))?.deletedAt).toBeUndefined();
    expect((await weekDigest(created.week)).filter((i) => i.id === created.id)).toHaveLength(1);
    expect(await audits("RESTORE_INCIDENT", created.id)).toHaveLength(1);
    expect((await callRoute(restorePOST, { method: "POST", url: `${url}/restore`, params, token: t.admin })).status).toBe(409);
  });

  it("GVCN feedback only on own class; GET /:id needs class detail access", async () => {
    const own = (await create(t.editor, { studentIds: ["S1"] })).body;
    const other = (await create(t.editor, { classCode: "7A02", studentIds: ["S5"] })).body;

    const ok = await callRoute<Incident>(feedbackPOST, {
      method: "POST",
      url: `/api/incidents/${own.id}/feedback`,
      params: { id: own.id },
      token: t.gvcn,
      body: { note: "Đã nhắc nhở học sinh", status: "Đang xử lý" },
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ gvcnNote: "Đã nhắc nhở học sinh", status: "Đang xử lý", gvcnNoteBy: "Người dùng gvcn" });
    expect(ok.body.gvcnNoteAt).toBeTruthy();
    expect((await weekDigest(own.week)).find((i) => i.id === own.id)?.gvcnNote).toBe("Đã nhắc nhở học sinh");
    expect(await audits("GVCN_FEEDBACK", own.id)).toHaveLength(1);

    const denied = await callRoute<ApiErrorBody>(feedbackPOST, {
      method: "POST",
      url: `/api/incidents/${other.id}/feedback`,
      params: { id: other.id },
      token: t.gvcn,
      body: { note: "x" },
    });
    expect(denied.status).toBe(403);
    expect((await callRoute(feedbackPOST, { method: "POST", url: "/x", params: { id: own.id }, token: t.viewer, body: { note: "x" } })).status).toBe(403);
    expect((await callRoute(feedbackPOST, { method: "POST", url: "/x", params: { id: own.id }, token: t.gvcn, body: {} })).status).toBe(400);
    const byAdmin = await callRoute<Incident>(feedbackPOST, { method: "POST", url: "/x", params: { id: other.id }, token: t.admin, body: { status: "Đã đóng" } });
    expect(byAdmin.body.status).toBe("Đã đóng");

    expect((await callRoute(incGET, { url: "/x", params: { id: own.id }, token: t.gvcn })).status).toBe(200);
    expect((await callRoute(incGET, { url: "/x", params: { id: other.id }, token: t.gvcn })).status).toBe(403);
    expect((await callRoute(incGET, { url: "/x", params: { id: other.id }, token: t.viewer })).status).toBe(200);
    expect((await callRoute(incGET, { url: "/x", params: { id: "THCS_NN-00000000-0000" }, token: t.viewer })).status).toBe(404);
  });

  it("users without access to the level are refused", async () => {
    const thOnly = await createTestUser({ uid: "editor-th", role: "EDITOR", levels: ["TH"] });
    const res = await create(thOnly.token);
    expect(res.status).toBe(403);
  });
});
