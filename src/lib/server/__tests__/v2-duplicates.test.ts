/**
 * REQ_V2 §5.5 – "Không trùng" reviews: `notDuplicateOf` on create ("Không trùng, vẫn lưu") and
 * POST /api/incidents/:id/not-duplicate (pairs of {id} ∪ otherIds, only changed members written, one audit).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { POST as notDupPOST } from "@/app/api/incidents/[id]/not-duplicate/route";
import { DELETE as incDELETE, PATCH as incPATCH } from "@/app/api/incidents/[id]/route";
import { POST as incidentPOST } from "@/app/api/incidents/route";
import type { ApiErrorBody, IncidentCreateInput, ListResponse } from "../../contract";
import { addDays, todayVN } from "../../engine/dates";
import type { AuditLog, Incident } from "../../types";
import { readVersion } from "../versions";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-v2-duplicates";
const yesterday = addDays(todayVN(), -1);
const t = { admin: "", editor: "", editorTh: "", viewer: "", gvcn: "" };
const MSG_MISSING = "Không tìm thấy sự việc để đánh dấu “không trùng”.";

const create = async (over: Partial<IncidentCreateInput> = {}, levelId: IncidentCreateInput["levelId"] = "THCS", classCode = "6A01") =>
  callRoute<Incident & ApiErrorBody>(incidentPOST, {
    method: "POST",
    url: "/api/incidents",
    token: t.editor,
    body: { levelId, date: yesterday, classCode, errorCode: "L02", scope: "Tập thể", occurrenceCount: 1, ...over },
  });
const mark = (token: string, id: string, otherIds: string[]) =>
  callRoute<ListResponse<Incident> & ApiErrorBody>(notDupPOST, { method: "POST", url: `/api/incidents/${id}/not-duplicate`, token, params: { id }, body: { otherIds } });
const stored = async (id: string) => (await getDoc<Incident>("incidents", id)) as Incident;
const updateAudits = async (entityId: string) => (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === "UPDATE_INCIDENT" && a.entityId === entityId);

describe("possible duplicates – reviews (REQ_V2 §5.5)", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", { classes: ["6A01", "6A02"] });
    await seedReference("TH", { classes: ["1A1"] });
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR" })).token;
    t.editorTh = (await createTestUser({ uid: "editorTh", role: "EDITOR", levels: ["TH"] })).token;
    t.viewer = (await createTestUser({ uid: "viewer", role: "VIEWER" })).token;
    t.gvcn = (await createTestUser({ uid: "gvcn", role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }] })).token;
  });

  it("create with notDuplicateOf: stored sorted and unique; other level / unknown ids → 400", async () => {
    const a = (await create()).body;
    const b = (await create()).body;
    const res = await create({ notDuplicateOf: [b.id, a.id, b.id] });
    expect(res.status).toBe(201);
    expect(res.body.notDuplicateOf).toEqual([a.id, b.id].sort());
    expect((await stored(res.body.id)).notDuplicateOf).toEqual([a.id, b.id].sort());
    // The reviewed side is not rewritten (a pair is reviewed when either side lists the other).
    expect((await stored(a.id)).notDuplicateOf).toBeUndefined();

    const plain = await create({ notDuplicateOf: [] });
    expect("notDuplicateOf" in plain.body).toBe(false);

    const th = (await create({}, "TH", "1A1")).body;
    const otherLevel = await create({ notDuplicateOf: [a.id, th.id] });
    expect(otherLevel.status).toBe(400);
    expect(otherLevel.body.error.message).toBe(MSG_MISSING);
    const unknown = await create({ notDuplicateOf: ["THCS_NN-20000101-0001"] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.message).toBe(MSG_MISSING);
    expect((await create({ notDuplicateOf: Array.from({ length: 21 }, (_, i) => `THCS_x${i}`) })).status).toBe(400);

    // PATCH never changes the list (the field is not part of IncidentUpdateSchema) and keeps it.
    const edited = await callRoute<Incident>(incPATCH, { method: "PATCH", url: "/x", params: { id: res.body.id }, token: t.editor, body: { detail: "Sửa chi tiết", notDuplicateOf: [] } });
    expect(edited.status).toBe(200);
    expect(edited.body.notDuplicateOf).toEqual([a.id, b.id].sort());
  });

  it("marks every pair of the group; only changed members are written; one audit; repeat = no-op", async () => {
    const a = (await create({}, "THCS", "6A02")).body;
    const b = (await create({}, "THCS", "6A02")).body;
    const c = (await create({ notDuplicateOf: [a.id] }, "THCS", "6A02")).body;
    const v0 = await readVersion("THCS");
    const res = await mark(t.editor, a.id, [b.id, c.id]);
    expect(res.status).toBe(200);
    expect(res.body.items.map((x) => x.id)).toEqual([a.id, b.id, c.id].sort((x, y) => x.localeCompare(y)));
    const sa = await stored(a.id);
    const sb = await stored(b.id);
    const sc = await stored(c.id);
    expect(sa.notDuplicateOf).toEqual([b.id, c.id].sort());
    expect(sb.notDuplicateOf).toEqual([a.id, c.id].sort());
    expect(sc.notDuplicateOf).toEqual([a.id, b.id].sort());
    expect([sa.rev, sb.rev, sc.rev]).toEqual([2, 2, 2]);
    expect(sa.updatedBy).toBe("editor@nshm.test");
    const digest = (await getDoc<{ items: Incident[] }>("digests", `THCS__inc__${a.week}`))?.items ?? [];
    expect(digest.find((x) => x.id === b.id)?.notDuplicateOf).toEqual([a.id, c.id].sort());
    expect(await readVersion("THCS")).toBe(v0 + 1);
    const log = await updateAudits(a.id);
    expect(log).toHaveLength(1);
    expect(log[0].detail).toEqual({ code: a.code, notDuplicate: [a.code, b.code, c.code].sort() });

    const again = await mark(t.admin, b.id, [a.id, c.id]);
    expect(again.status).toBe(200);
    expect(again.body.items).toHaveLength(3);
    expect(await readVersion("THCS")).toBe(v0 + 1);
    expect(await updateAudits(b.id)).toHaveLength(0);
    expect((await stored(a.id)).rev).toBe(2);
  });

  it("soft-deleted members are ignored (neither written nor listed)", async () => {
    const a = (await create()).body;
    const d = (await create()).body;
    const e = (await create()).body;
    await callRoute(incDELETE, { method: "DELETE", url: "/x", params: { id: d.id }, token: t.admin, body: { reason: "Ghi trùng" } });
    const res = await mark(t.editor, a.id, [d.id, e.id]);
    expect(res.status).toBe(200);
    expect(res.body.items.map((x) => x.id).sort()).toEqual([a.id, e.id].sort());
    expect((await stored(a.id)).notDuplicateOf).toEqual([e.id]);
    expect((await stored(e.id)).notDuplicateOf).toEqual([a.id]);
    expect((await stored(d.id)).notDuplicateOf).toBeUndefined();
  });

  it("permissions (data.inspect + level) and validation", async () => {
    const a = (await create()).body;
    const b = (await create()).body;
    expect((await mark(t.gvcn, a.id, [b.id])).status).toBe(403);
    expect((await mark(t.viewer, a.id, [b.id])).status).toBe(403);
    expect((await mark(t.editorTh, a.id, [b.id])).status).toBe(403);
    const th = (await create({}, "TH", "1A1")).body;
    const otherLevel = await mark(t.editor, a.id, [th.id]);
    expect(otherLevel.status).toBe(400);
    expect(otherLevel.body.error.message).toBe(MSG_MISSING);
    expect((await mark(t.editor, a.id, ["THCS_NN-20000101-0009"])).body.error.message).toBe(MSG_MISSING);
    const self = await mark(t.editor, a.id, [a.id]);
    expect(self.status).toBe(400);
    expect(self.body.error.message).toBe("Chọn ít nhất một sự việc khác để đánh dấu “không trùng”.");
    expect((await mark(t.editor, a.id, [])).status).toBe(400);
    expect((await mark(t.editor, "THCS_NN-20000101-0007", [a.id])).status).toBe(404);
    expect((await stored(a.id)).notDuplicateOf).toBeUndefined();
  });
});
