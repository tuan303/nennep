/**
 * REQ_V2 §5.2 – Đợt kiểm tra: permissions per role, validation messages, DKT codes, idempotency, edit/delete rules
 * (ADMIN any, EDITOR own ≤ 24 h, baseRev), monthly digests, dataset inclusion + GVCN redaction, digest rebuild.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { POST as rebuildPOST } from "@/app/api/admin/rebuild-digests/route";
import { GET as datasetGET } from "@/app/api/dataset/route";
import { DELETE as insDELETE, PATCH as insPATCH } from "@/app/api/inspections/[id]/route";
import { POST as insPOST } from "@/app/api/inspections/route";
import type { ApiErrorBody, InspectionCreateInput } from "../../contract";
import { addDays, compactDate, mondayOf, todayVN } from "../../engine/dates";
import type { AuditLog, Inspection, LevelDataset } from "../../types";
import { invalidateDatasetCache } from "../dataset";
import { db } from "../firebase-admin";
import { readVersion } from "../versions";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-v2-inspections";
const today = todayVN();
const yesterday = addDays(today, -1);
/** ≥ 33 days before Monday(yesterday): always another digest month. */
const older = addDays(today, -40);
const t = { admin: "", editor: "", editor2: "", viewer: "", gvcn: "", editorTh: "" };

const body = (over: Partial<InspectionCreateInput> = {}): InspectionCreateInput => ({
  levelId: "THCS",
  date: yesterday,
  shift: "Sáng",
  category: "Nề nếp lớp học",
  classCodes: ["6A02", "6A01"],
  ...over,
});
const create = (token: string, over: Partial<InspectionCreateInput> = {}) =>
  callRoute<Inspection & ApiErrorBody>(insPOST, { method: "POST", url: "/api/inspections", token, body: body(over) });
const patch = (token: string, id: string, b: Record<string, unknown>) =>
  callRoute<Inspection & ApiErrorBody>(insPATCH, { method: "PATCH", url: `/api/inspections/${id}`, token, params: { id }, body: b });
const remove = (token: string, id: string, reason = "Ghi nhầm đợt") =>
  callRoute<ApiErrorBody & { ok: true }>(insDELETE, { method: "DELETE", url: `/api/inspections/${id}`, token, params: { id }, body: { reason } });
const monthDigest = async (date: string) =>
  (await getDoc<{ kind: string; month: string; items: Inspection[] }>("digests", `THCS__ins__${mondayOf(date).slice(0, 7)}`))?.items ?? [];
const audits = async (action: AuditLog["action"], entityId?: string) =>
  (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === action && (!entityId || a.entityId === entityId));
const dataset = async (token: string) => (await callRoute<LevelDataset>(datasetGET, { url: "/api/dataset?level=THCS", token })).body;

describe("inspections API (REQ_V2 §5.2)", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", { classes: ["6A01", "6A02", "7A01", { code: "7A09", active: false }] });
    await seedReference("TH", { classes: ["1A1"] });
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN", displayName: "Quản trị" })).token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR", displayName: "Nguyễn Văn A" })).token;
    t.editor2 = (await createTestUser({ uid: "editor2", role: "EDITOR", displayName: "Trần Thị B" })).token;
    t.editorTh = (await createTestUser({ uid: "editorTh", role: "EDITOR", levels: ["TH"] })).token;
    t.viewer = (await createTestUser({ uid: "viewer", role: "VIEWER" })).token;
    t.gvcn = (await createTestUser({ uid: "gvcn", role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }] })).token;
  });

  it("VIEWER and GVCN cannot record inspections (403, nothing written); an EDITOR of another level neither", async () => {
    const v0 = await readVersion("THCS");
    for (const token of [t.viewer, t.gvcn, t.editorTh]) {
      const res = await create(token);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
    expect(await listDocs("inspections")).toHaveLength(0);
    expect(await readVersion("THCS")).toBe(v0);
  });

  it("EDITOR records a round: DKT code, ordered unique classes, default inspector, digest, version bump and audit", async () => {
    const v0 = await readVersion("THCS");
    const res = await create(t.editor, { classCodes: ["7A01", "6A02", "6A01", "6A02"], note: "Kiểm tra giờ truy bài" });
    expect(res.status).toBe(201);
    const x = res.body;
    expect(x.code).toBe(`DKT-${compactDate(yesterday)}-001`);
    expect(x).toMatchObject({
      id: `THCS_${x.code}`,
      levelId: "THCS",
      date: yesterday,
      week: mondayOf(yesterday),
      month: mondayOf(yesterday).slice(0, 7),
      semester: "HK1",
      shift: "Sáng",
      category: "Nề nếp lớp học",
      classCodes: ["6A01", "6A02", "7A01"],
      inspector: "Nguyễn Văn A",
      note: "Kiểm tra giờ truy bài",
      createdBy: "editor",
      createdByName: "Nguyễn Văn A",
      rev: 1,
    });
    expect(await getDoc<Inspection>("inspections", x.id)).toMatchObject({ code: x.code, classCodes: ["6A01", "6A02", "7A01"] });
    expect((await monthDigest(yesterday)).map((i) => i.id)).toEqual([x.id]);
    expect((await getDoc<{ kind: string }>("digests", `THCS__ins__${x.month}`))?.kind).toBe("ins");
    expect(await readVersion("THCS")).toBe(v0 + 1);
    const log = await audits("CREATE_INSPECTION", x.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ entity: "inspection", levelId: "THCS" });
    expect(log[0].detail).toMatchObject({ code: x.code, date: yesterday, classCodes: ["6A01", "6A02", "7A01"], category: "Nề nếp lớp học" });

    const second = await create(t.editor, { classCodes: ["6A01"] });
    expect(second.body.code).toBe(`DKT-${compactDate(yesterday)}-002`);
  });

  it('"" shift / category are omitted (kiểm tra chung); an explicit inspector is kept', async () => {
    const res = await create(t.admin, { shift: "", category: "", inspector: "Lê Văn C", classCodes: ["7A01"] });
    expect(res.status).toBe(201);
    expect(res.body.inspector).toBe("Lê Văn C");
    expect("shift" in res.body).toBe(false);
    expect("category" in res.body).toBe(false);
    expect("note" in res.body).toBe(false);
    const stored = await getDoc<Inspection>("inspections", res.body.id);
    expect(stored && "category" in stored).toBe(false);
  });

  it("validates date, calendar, classes and Mảng with Vietnamese messages", async () => {
    const future = await create(t.editor, { date: addDays(today, 1) });
    expect(future.status).toBe(400);
    expect(future.body.error.message).toBe("Không thể ghi nhận đợt kiểm tra ở ngày trong tương lai.");
    const outside = await create(t.editor, { date: addDays(today, -200) });
    expect(outside.status).toBe(400);
    expect(outside.body.error.message).toContain("không thuộc lịch tuần");
    const unknown = await create(t.editor, { classCodes: ["6A01", "9Z99"] });
    expect(unknown.body.error.message).toBe('Lớp "9Z99" không có trong danh mục.');
    const inactive = await create(t.editor, { classCodes: ["7A09"] });
    expect(inactive.body.error.message).toBe("Lớp 7A09 đã ngừng hoạt động.");
    const cat = await create(t.editor, { category: "Mảng lạ" });
    expect(cat.body.error.message).toBe('Mảng "Mảng lạ" không có trong danh mục lỗi.');
    const none = await create(t.editor, { classCodes: [] });
    expect(none.status).toBe(400);
    expect(none.body.error.message).toContain("Chọn ít nhất 1 lớp được kiểm tra");
    const shift = await callRoute<ApiErrorBody>(insPOST, { method: "POST", url: "/x", token: t.editor, body: { ...body(), shift: "Tối" } });
    expect(shift.status).toBe(400);
  });

  it("is idempotent per clientRequestId (201 then 200 with the same round)", async () => {
    const key = "ins-req-12345678";
    const a = await create(t.editor, { clientRequestId: key, classCodes: ["6A02"] });
    const b = await create(t.editor, { clientRequestId: key, classCodes: ["6A02"] });
    expect([a.status, b.status]).toEqual([201, 200]);
    expect(b.body.id).toBe(a.body.id);
    expect((await listDocs<{ kind: string }>("idempotency")).filter((d) => d.kind === "inspection")).toHaveLength(1);
  });

  it("edit rules: own EDITOR ≤ 24 h, other EDITOR 403, ADMIN any, baseRev 409, no-op without bump", async () => {
    const x = (await create(t.editor, { classCodes: ["6A01", "6A02"] })).body;
    const other = await patch(t.editor2, x.id, { inspector: "Người khác" });
    expect(other.status).toBe(403);
    expect(other.body.error.message).toBe("Chỉ được sửa bản ghi của mình trong 24 giờ");
    expect((await patch(t.gvcn, x.id, { note: "x" })).status).toBe(403);
    expect((await patch(t.viewer, x.id, { note: "x" })).status).toBe(403);

    const v0 = await readVersion("THCS");
    const ok = await patch(t.editor, x.id, { shift: "Chiều", note: "Bổ sung ghi chú", classCodes: ["6A02", "7A01"], baseRev: 1 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ shift: "Chiều", note: "Bổ sung ghi chú", classCodes: ["6A02", "7A01"], rev: 2, updatedBy: "editor@nshm.test" });
    expect((await monthDigest(yesterday)).find((i) => i.id === x.id)?.classCodes).toEqual(["6A02", "7A01"]);
    expect(await readVersion("THCS")).toBe(v0 + 1);
    const upd = await audits("UPDATE_INSPECTION", x.id);
    expect(upd).toHaveLength(1);
    expect(Object.keys((upd[0].detail as { changes: Record<string, unknown> }).changes).sort()).toEqual(["classCodes", "note", "shift"]);

    const stale = await patch(t.editor, x.id, { note: "Sửa từ bản cũ", baseRev: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.message).toContain("Đợt kiểm tra đã được người khác cập nhật");

    const same = await patch(t.editor, x.id, { shift: "Chiều", baseRev: 2 });
    expect(same.status).toBe(200);
    expect(same.body.rev).toBe(2);
    expect(await readVersion("THCS")).toBe(v0 + 1);

    // "" clears optional fields; an emptied inspector falls back to the creator's display name.
    const cleared = await patch(t.editor, x.id, { shift: "", category: "", note: "", inspector: "" });
    expect(cleared.status).toBe(200);
    expect(cleared.body.inspector).toBe("Nguyễn Văn A");
    expect(["shift", "category", "note"].filter((k) => k in cleared.body)).toEqual([]);

    // After 24 h only ADMIN may edit.
    await db().collection("inspections").doc(x.id).update({ createdAt: new Date(Date.now() - 30 * 3_600_000).toISOString() });
    expect((await patch(t.editor, x.id, { note: "Quá hạn" })).status).toBe(403);
    const admin = await patch(t.admin, x.id, { inspector: "Phạm Văn D" });
    expect(admin.status).toBe(200);
    expect(admin.body).toMatchObject({ inspector: "Phạm Văn D", updatedBy: "admin@nshm.test" });
  });

  it("edit validation: a class deactivated since stays allowed; a new inactive class, a future or out-of-calendar date are refused", async () => {
    const x = (await create(t.admin, { classCodes: ["6A01", "7A01"] })).body;
    await db().collection("digests").doc("THCS__ref").update({
      classes: [
        { code: "6A01", levelId: "THCS", grade: 6, active: true, order: 0 },
        { code: "6A02", levelId: "THCS", grade: 6, active: true, order: 1 },
        { code: "7A01", levelId: "THCS", grade: 7, active: false, order: 2 },
        { code: "7A09", levelId: "THCS", grade: 7, active: false, order: 3 },
      ],
    });
    try {
      const keep = await patch(t.admin, x.id, { note: "Lớp 7A01 đã ngừng hoạt động" });
      expect(keep.status).toBe(200);
      expect(keep.body.classCodes).toEqual(["6A01", "7A01"]);
      const added = await patch(t.admin, x.id, { classCodes: ["6A01", "7A01", "7A09"] });
      expect(added.body.error.message).toBe("Lớp 7A09 đã ngừng hoạt động.");
      expect((await patch(t.admin, x.id, { date: addDays(today, 2) })).body.error.message).toBe("Không thể ghi nhận đợt kiểm tra ở ngày trong tương lai.");
      expect((await patch(t.admin, x.id, { date: addDays(today, -200) })).body.error.message).toContain("không thuộc lịch tuần");
    } finally {
      await db().collection("digests").doc("THCS__ref").update({
        classes: [
          { code: "6A01", levelId: "THCS", grade: 6, active: true, order: 0 },
          { code: "6A02", levelId: "THCS", grade: 6, active: true, order: 1 },
          { code: "7A01", levelId: "THCS", grade: 7, active: true, order: 2 },
          { code: "7A09", levelId: "THCS", grade: 7, active: false, order: 3 },
        ],
      });
    }
  });

  it("re-dating into another month moves the round between monthly digests", async () => {
    const x = (await create(t.admin, { classCodes: ["6A02"] })).body;
    const moved = await patch(t.admin, x.id, { date: older });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ date: older, week: mondayOf(older), month: mondayOf(older).slice(0, 7) });
    expect((await monthDigest(yesterday)).some((i) => i.id === x.id)).toBe(false);
    expect((await monthDigest(older)).map((i) => i.id)).toContain(x.id);
  });

  it("soft delete: own EDITOR / ADMIN, reason required, 409 twice, removed from the digest, audited", async () => {
    const x = (await create(t.editor, { classCodes: ["6A01"] })).body;
    expect((await remove(t.editor2, x.id)).status).toBe(403);
    expect((await remove(t.gvcn, x.id)).status).toBe(403);
    expect((await remove(t.editor, x.id, "x")).status).toBe(400);
    const v0 = await readVersion("THCS");
    const del = await remove(t.editor, x.id, "Ghi nhầm đợt kiểm tra");
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ ok: true });
    expect(await getDoc<Inspection>("inspections", x.id)).toMatchObject({ deletedBy: "editor@nshm.test", deleteReason: "Ghi nhầm đợt kiểm tra", rev: 2 });
    expect((await monthDigest(yesterday)).some((i) => i.id === x.id)).toBe(false);
    expect(await readVersion("THCS")).toBe(v0 + 1);
    expect((await audits("DELETE_INSPECTION", x.id))[0].detail).toMatchObject({ code: x.code, reason: "Ghi nhầm đợt kiểm tra" });
    const again = await remove(t.admin, x.id);
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe("Đợt kiểm tra này đã bị xóa trước đó.");
    const edit = await patch(t.admin, x.id, { note: "Sửa bản đã xóa" });
    expect(edit.status).toBe(409);
    expect((await patch(t.admin, "THCS_DKT-20000101-001", { note: "x" })).status).toBe(404);
  });

  it("dataset: non-deleted rounds sorted by date then code; GVCN loses only the note; VIEWER keeps it", async () => {
    const live = (await listDocs<Inspection>("inspections")).filter((x) => x.levelId === "THCS" && !x.deletedAt);
    const expected = [...live].sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code)).map((x) => x.id);
    const full = await dataset(t.admin);
    expect(full.inspections?.map((x) => x.id)).toEqual(expected);
    expect(full.inspections?.some((x) => x.note)).toBe(true);
    expect((await dataset(t.viewer)).inspections?.some((x) => x.note)).toBe(true);
    const gv = await dataset(t.gvcn);
    expect(gv.redacted).toBe(true);
    expect(gv.inspections?.map((x) => x.id)).toEqual(expected);
    expect(gv.inspections?.some((x) => "note" in x)).toBe(false);
    expect(gv.inspections?.[0]).toMatchObject({ classCodes: expect.any(Array), inspector: expect.any(String) });
    // A level without any round: always an array.
    expect((await callRoute<LevelDataset>(datasetGET, { url: "/api/dataset?level=TH", token: t.admin })).body.inspections).toEqual([]);
  });

  it("rebuild-digests restores __ins__* from canonical docs and deletes stale ones", async () => {
    const live = (await listDocs<Inspection>("inspections")).filter((x) => x.levelId === "THCS" && !x.deletedAt);
    const insDigests = async () => (await listDocs<{ levelId: string; kind: string }>("digests")).filter((d) => d.levelId === "THCS" && d.kind === "ins");
    const months = new Set(live.map((x) => x.week.slice(0, 7)));
    for (const d of await insDigests()) await db().collection("digests").doc(d.__id).delete();
    await db().collection("digests").doc("THCS__ins__2000-01").set({ levelId: "THCS", kind: "ins", month: "2000-01", items: [], updatedAt: "x" });
    invalidateDatasetCache();
    const res = await callRoute<{ ok: true; results: Record<string, { inspections: number }> }>(rebuildPOST, {
      method: "POST",
      url: "/api/admin/rebuild-digests",
      token: t.admin,
      body: { levelId: "THCS" },
    });
    expect(res.status).toBe(200);
    expect(res.body.results.THCS.inspections).toBe(live.length);
    expect((await insDigests()).map((d) => d.__id).sort()).toEqual([...months].map((m) => `THCS__ins__${m}`).sort());
    expect((await dataset(t.admin)).inspections).toHaveLength(live.length);
  });
});
