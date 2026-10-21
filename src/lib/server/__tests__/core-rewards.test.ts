import { beforeAll, describe, expect, it } from "vitest";
import { POST as createPOST, GET as listGET } from "@/app/api/rewards/route";
import { DELETE as rwDELETE, PATCH as rwPATCH } from "@/app/api/rewards/[id]/route";
import { POST as restorePOST } from "@/app/api/rewards/[id]/restore/route";
import type { ApiErrorBody, ListResponse, RewardCreateInput } from "../../contract";
import { addDays, mondayOf, todayVN } from "../../engine/dates";
import type { AuditLog, Reward } from "../../types";
import { db } from "../firebase-admin";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-core-rewards";
const today = todayVN();
const yesterday = addDays(today, -1);
const t = { admin: "", editor: "", editor2: "", viewer: "" };

function body(over: Partial<RewardCreateInput> = {}): RewardCreateInput {
  return { levelId: "THPT", date: yesterday, classCode: "10A1", points: 5, reason: "Đạt giải nhất hội diễn", ...over };
}
const create = (token: string, over: Partial<RewardCreateInput> = {}) =>
  callRoute<Reward & ApiErrorBody>(createPOST, { method: "POST", url: "/api/rewards", token, body: body(over) });
/** Every reward in the THPT monthly reward digests (`THPT__rew__yyyy-mm`). */
const digestItems = async () =>
  (await listDocs<{ levelId: string; kind: string; items: Reward[] }>("digests")).filter((d) => d.levelId === "THPT" && d.kind === "rew").flatMap((d) => d.items);
const audits = async (action: AuditLog["action"], id: string) =>
  (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === action && a.entityId === id);

describe("rewards API", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THPT", { classes: ["10A1", "11A1", { code: "12A9", active: false }] });
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR", displayName: "Cô Hằng" })).token;
    t.editor2 = (await createTestUser({ uid: "editor2", role: "EDITOR" })).token;
    t.viewer = (await createTestUser({ uid: "viewer", role: "VIEWER" })).token;
  });

  it("EDITOR creates a reward (201) with server-derived fields, digest and audit", async () => {
    const res = await create(t.editor, { status: "Đang xác minh", grade: 3, week: "x" } as Partial<RewardCreateInput>);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      levelId: "THPT",
      classCode: "10A1",
      grade: 10,
      points: 5,
      week: mondayOf(yesterday),
      status: "Đang xác minh",
      createdBy: "editor",
      createdByName: "Cô Hằng",
      source: "app",
    });
    expect(res.body.code).toMatch(/^KT-\d{8}-0001$/);
    expect((await digestItems()).map((r) => r.id)).toEqual([res.body.id]);
    expect(await audits("CREATE_REWARD", res.body.id)).toHaveLength(1);
  });

  it("status 'Đã xác nhận' requires reward.verify (EDITOR 403, ADMIN ok)", async () => {
    const denied = await create(t.editor, { status: "Đã xác nhận" });
    expect(denied.status).toBe(403);
    expect(denied.body.error.message).toContain("Đã xác nhận");
    const ok = await create(t.admin, { status: "Đã xác nhận" });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe("Đã xác nhận");

    const mine = (await create(t.editor)).body;
    const params = { id: mine.id };
    const upgrade = await callRoute<ApiErrorBody>(rwPATCH, { method: "PATCH", url: "/x", params, token: t.editor, body: { status: "Đã xác nhận" } });
    expect(upgrade.status).toBe(403);
    const toVerify = await callRoute<Reward>(rwPATCH, { method: "PATCH", url: "/x", params, token: t.editor, body: { status: "Đang xác minh", points: 7 } });
    expect(toVerify.status).toBe(200);
    expect(toVerify.body).toMatchObject({ status: "Đang xác minh", points: 7 });
    const verified = await callRoute<Reward>(rwPATCH, { method: "PATCH", url: "/x", params, token: t.admin, body: { status: "Đã xác nhận" } });
    expect(verified.body.status).toBe("Đã xác nhận");
    const locked = await callRoute<ApiErrorBody>(rwPATCH, { method: "PATCH", url: "/x", params, token: t.editor, body: { points: 9 } });
    expect(locked.status).toBe(403);
    expect((await digestItems()).find((r) => r.id === mine.id)?.status).toBe("Đã xác nhận");
    const upd = await audits("UPDATE_REWARD", mine.id);
    expect(upd).toHaveLength(2);
    expect(upd.some((a) => (a.detail?.changes as Record<string, unknown>)?.points !== undefined)).toBe(true);
  });

  it("validates class (exists & active), date (not future) and points (> 0)", async () => {
    expect((await create(t.editor, { classCode: "9Z9" })).body.error.message).toContain('Lớp "9Z9" không có trong danh mục');
    expect((await create(t.editor, { classCode: "12A9" })).body.error.message).toContain("đã ngừng hoạt động");
    const future = await create(t.editor, { date: addDays(today, 2) });
    expect(future.status).toBe(400);
    expect(future.body.error.message).toContain("tương lai");
    expect((await create(t.editor, { points: 0 })).status).toBe(400);
    expect((await create(t.editor, { points: -3 })).status).toBe(400);
    expect((await create(t.viewer)).status).toBe(403);
  });

  it("editor edit window: other editor 403; own after 24h 403", async () => {
    const mine = (await create(t.editor)).body;
    const params = { id: mine.id };
    const other = await callRoute<ApiErrorBody>(rwPATCH, { method: "PATCH", url: "/x", params, token: t.editor2, body: { reason: "Sửa nội dung thưởng" } });
    expect(other.status).toBe(403);
    expect(other.body.error.message).toBe("Chỉ được sửa bản ghi của mình trong 24 giờ");
    await db().collection("rewards").doc(mine.id).update({ createdAt: new Date(Date.now() - 30 * 3_600_000).toISOString() });
    expect((await callRoute(rwPATCH, { method: "PATCH", url: "/x", params, token: t.editor, body: { reason: "Sửa nội dung thưởng" } })).status).toBe(403);
    const moved = await callRoute<Reward>(rwPATCH, { method: "PATCH", url: "/x", params, token: t.admin, body: { classCode: "11A1", note: "Chuyển lớp" } });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ classCode: "11A1", grade: 11, note: "Chuyển lớp", updatedBy: "admin@nshm.test" });
  });

  it("idempotent create, soft delete, list deleted and restore", async () => {
    const key = "rw-req-12345678";
    const a = await create(t.editor, { clientRequestId: key });
    const b = await create(t.editor, { clientRequestId: key });
    expect([a.status, b.status]).toEqual([201, 200]);
    expect(b.body.id).toBe(a.body.id);
    const params = { id: a.body.id };

    expect((await callRoute(rwDELETE, { method: "DELETE", url: "/x", params, token: t.editor, body: { reason: "Trùng" } })).status).toBe(403);
    const del = await callRoute(rwDELETE, { method: "DELETE", url: "/x", params, token: t.admin, body: { reason: "Ghi trùng" } });
    expect(del.status).toBe(200);
    expect((await digestItems()).some((r) => r.id === a.body.id)).toBe(false);
    expect((await getDoc<Reward>("rewards", a.body.id))?.deleteReason).toBe("Ghi trùng");

    const list = await callRoute<ListResponse<Reward>>(listGET, { url: "/api/rewards?level=THPT&deleted=1", token: t.admin });
    expect(list.body.items.map((r) => r.id)).toEqual([a.body.id]);
    expect((await callRoute(listGET, { url: "/api/rewards?level=THPT", token: t.admin })).status).toBe(400);

    const restored = await callRoute<Reward>(restorePOST, { method: "POST", url: "/x", params, token: t.admin });
    expect(restored.status).toBe(200);
    expect(restored.body.deletedAt).toBeUndefined();
    expect((await digestItems()).filter((r) => r.id === a.body.id)).toHaveLength(1);
    expect(await audits("DELETE_REWARD", a.body.id)).toHaveLength(1);
    expect(await audits("RESTORE_REWARD", a.body.id)).toHaveLength(1);
  });
});
