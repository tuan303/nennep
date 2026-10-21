import { beforeAll, describe, expect, it } from "vitest";
import { POST as rebuildPOST } from "@/app/api/admin/rebuild-digests/route";
import { POST as resetPOST } from "@/app/api/admin/reset-level/route";
import { POST as restorePOST } from "@/app/api/admin/restore-reset/route";
import { GET as datasetGET } from "@/app/api/dataset/route";
import { DELETE as incidentDELETE } from "@/app/api/incidents/[id]/route";
import { POST as incidentPOST } from "@/app/api/incidents/route";
import { POST as rewardPOST } from "@/app/api/rewards/route";
import type { ApiErrorBody } from "../../contract";
import { addDays, todayVN } from "../../engine/dates";
import type { AuditLog, Incident, LevelDataset, Reward } from "../../types";
import { db } from "../firebase-admin";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-admin-maint";
const day = addDays(todayVN(), -2);
const t = { admin: "", editor: "" };
const ids: string[] = [];

type ResetResult = { batchId: string; incidents: number; rewards: number } & ApiErrorBody;
const dataset = async () => (await callRoute<LevelDataset>(datasetGET, { url: "/api/dataset?level=THCS", token: t.admin })).body;
const reset = (body: unknown, token = t.admin) => callRoute<ResetResult>(resetPOST, { method: "POST", url: "/api/admin/reset-level", token, body });
const restore = (body: unknown) => callRoute<ResetResult>(restorePOST, { method: "POST", url: "/api/admin/restore-reset", token: t.admin, body });

describe("maintenance: reset-level, restore-reset, rebuild-digests", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", { classes: ["6A01"], students: [{ id: "S1", name: "Nguyễn An", classCode: "6A01" }] });
    await seedReference("TH", { classes: ["1A1"] });
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR" })).token;
    for (const body of [
      { levelId: "THCS", date: day, classCode: "6A01", errorCode: "L01", scope: "Cá nhân", studentIds: ["S1"] },
      { levelId: "THCS", date: day, classCode: "6A01", errorCode: "L02", scope: "Tập thể" },
      { levelId: "THCS", date: day, classCode: "6A01", errorCode: "L04", scope: "Tập thể" },
      { levelId: "TH", date: day, classCode: "1A1", errorCode: "L02", scope: "Tập thể" },
    ]) {
      const res = await callRoute<Incident>(incidentPOST, { method: "POST", url: "/api/incidents", token: t.admin, body });
      expect(res.status).toBe(201);
      ids.push(res.body.id);
    }
    const rw = await callRoute<Reward>(rewardPOST, { method: "POST", url: "/api/rewards", token: t.admin, body: { levelId: "THCS", date: day, classCode: "6A01", points: 5, reason: "Lớp sạch đẹp" } });
    expect(rw.status).toBe(201);
    const del = await callRoute(incidentDELETE, { method: "DELETE", url: `/api/incidents/${ids[2]}`, token: t.admin, params: { id: ids[2] }, body: { reason: "Ghi nhầm lớp" } });
    expect(del.status).toBe(200);
  });

  it("reset-level requires data.reset and the exact confirmation text", async () => {
    expect((await reset({ levelId: "THCS", confirmText: "XOA THCS" }, t.editor)).status).toBe(403);
    const wrong = await reset({ levelId: "THCS", confirmText: "xoa thcs" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toBe('Nhập chính xác "XOA THCS" để xác nhận xóa dữ liệu.');
    expect((await dataset()).incidents).toHaveLength(2);
  });

  let batchId = "";

  it("soft-deletes every live incident/reward of the level only", async () => {
    const res = await reset({ levelId: "THCS", confirmText: "XOA THCS" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ incidents: 2, rewards: 1 });
    batchId = res.body.batchId;
    const ds = await dataset();
    expect(ds.incidents).toHaveLength(0);
    expect(ds.rewards).toHaveLength(0);
    expect((await getDoc<Incident>("incidents", ids[0]))).toMatchObject({ deleteReason: `RESET:${batchId}`, deletedBy: "admin@nshm.test" });
    expect((await getDoc<Incident>("incidents", ids[2]))?.deleteReason).toBe("Ghi nhầm lớp");
    expect((await getDoc<Incident>("incidents", ids[3]))?.deletedAt).toBeUndefined();
    expect(await getDoc("importBatches", batchId)).toMatchObject({ kind: "reset", levelId: "THCS", incidents: 2, rewards: 1 });
    const audit = (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === "RESET_DATA");
    expect(audit[0]).toMatchObject({ entityId: batchId, levelId: "THCS" });
  });

  it("restore-reset brings back exactly that batch", async () => {
    expect((await restore({ levelId: "THCS", batchId: "khong-ton-tai" })).status).toBe(404);
    expect((await restore({ levelId: "TH", batchId })).status).toBe(404);
    const res = await restore({ levelId: "THCS", batchId });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ incidents: 2, rewards: 1 });
    const ds = await dataset();
    expect(ds.incidents.map((i) => i.id).sort()).toEqual([ids[0], ids[1]].sort());
    expect(ds.rewards).toHaveLength(1);
    const restored = await getDoc<Incident>("incidents", ids[0]);
    expect(restored?.deletedAt).toBeUndefined();
    expect(restored?.deleteReason).toBeUndefined();
    expect((await getDoc<Incident>("incidents", ids[2]))?.deleteReason).toBe("Ghi nhầm lớp");
    expect((await restore({ levelId: "THCS", batchId })).status).toBe(409);
  });

  it("rebuild-digests recreates missing digests and audits", async () => {
    await db().collection("digests").doc("THCS__stu").delete();
    const res = await callRoute<{ ok: boolean; results: Record<string, { students: number; incidents: number }> }>(rebuildPOST, {
      method: "POST",
      url: "/api/admin/rebuild-digests",
      token: t.admin,
      body: { levelId: "THCS" },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.results.THCS).toMatchObject({ students: 1, incidents: 2 });
    expect((await getDoc<{ items: unknown[] }>("digests", "THCS__stu"))?.items).toHaveLength(1);
    const all = await callRoute<{ results: Record<string, unknown> }>(rebuildPOST, { method: "POST", url: "/api/admin/rebuild-digests", token: t.admin, body: {} });
    expect(Object.keys(all.body.results).sort()).toEqual(["TH", "THCS", "THPT"]);
    expect((await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === "REBUILD_DIGESTS")).toHaveLength(4);
    expect((await callRoute(rebuildPOST, { method: "POST", url: "/api/admin/rebuild-digests", token: t.editor, body: {} })).status).toBe(403);
  });
});
