/**
 * Regression tests: optimistic concurrency of incident/reward edits (INTEGRITY-6) and evidence photo lifecycle
 * (INTEGRITY-12).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { POST as evidenceAdminPOST } from "@/app/api/admin/evidence/route";
import { POST as evidencePOST } from "@/app/api/evidence/route";
import { POST as feedbackPOST } from "@/app/api/incidents/[id]/feedback/route";
import { PATCH as incPATCH } from "@/app/api/incidents/[id]/route";
import { POST as incidentPOST } from "@/app/api/incidents/route";
import { PATCH as rwPATCH } from "@/app/api/rewards/[id]/route";
import { POST as rewardPOST } from "@/app/api/rewards/route";
import type { ApiErrorBody, EvidenceMaintenanceResult } from "../../contract";
import { addDays, todayVN } from "../../engine/dates";
import type { AuditLog, Incident, Reward } from "../../types";
import { db } from "../firebase-admin";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-fix-records";
const yesterday = addDays(todayVN(), -1);
const t = { admin: "", editor: "", gvcn: "" };

function jpeg(size: number): Buffer {
  const b = Buffer.alloc(size, 0x41);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  return b;
}
const upload = async () =>
  (await callRoute<{ id: string }>(evidencePOST, { method: "POST", url: "/api/evidence", token: t.editor, body: { levelId: "THCS", dataUrl: `data:image/jpeg;base64,${jpeg(2000).toString("base64")}` } })).body.id;
const createIncident = (over: Record<string, unknown> = {}) =>
  callRoute<Incident & ApiErrorBody>(incidentPOST, {
    method: "POST",
    url: "/api/incidents",
    token: t.editor,
    body: { levelId: "THCS", date: yesterday, classCode: "7A01", errorCode: "L01", scope: "Cá nhân", studentIds: ["S1"], ...over },
  });

describe("records fixes", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", { classes: ["7A01"], students: [{ id: "S1", name: "Nguyễn An", classCode: "7A01" }] });
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR" })).token;
    t.gvcn = (await createTestUser({ uid: "gv", role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "7A01" }] })).token;
  });

  describe("INTEGRITY-6: a stale edit form cannot revert someone else's change", () => {
    it("GVCN closes the incident, then an edit based on the older revision is refused (409)", async () => {
      const inc = await createIncident();
      expect(inc.body.rev).toBe(1);
      const fb = await callRoute<Incident>(feedbackPOST, { method: "POST", url: `/api/incidents/${inc.body.id}/feedback`, token: t.gvcn, params: { id: inc.body.id }, body: { status: "Đã đóng", note: "Đã xử lý" } });
      expect(fb.body.rev).toBe(2);
      const patch = (body: Record<string, unknown>) => callRoute<Incident & ApiErrorBody>(incPATCH, { method: "PATCH", url: `/api/incidents/${inc.body.id}`, token: t.editor, params: { id: inc.body.id }, body });
      const stale = await patch({ baseRev: 1, status: "Mới ghi nhận", detail: "Thêm chi tiết" });
      expect(stale.status).toBe(409);
      expect(stale.body.error.message).toContain("đã được người khác cập nhật");
      expect((await getDoc<Incident>("incidents", inc.body.id))?.status).toBe("Đã đóng");
      const fresh = await patch({ baseRev: 2, detail: "Thêm chi tiết" });
      expect(fresh.status).toBe(200);
      expect(fresh.body).toMatchObject({ status: "Đã đóng", detail: "Thêm chi tiết", rev: 3 });
      // Without baseRev (older clients) the edit is still accepted.
      expect((await patch({ detail: "Lần nữa" })).status).toBe(200);
    });

    it("rewards too", async () => {
      const r = await callRoute<Reward>(rewardPOST, { method: "POST", url: "/api/rewards", token: t.admin, body: { levelId: "THCS", date: yesterday, classCode: "7A01", points: 3, reason: "Lớp sạch" } });
      const first = await callRoute<Reward>(rwPATCH, { method: "PATCH", url: `/api/rewards/${r.body.id}`, token: t.admin, params: { id: r.body.id }, body: { baseRev: 1, status: "Đã xác nhận" } });
      expect(first.status).toBe(200);
      const stale = await callRoute(rwPATCH, { method: "PATCH", url: `/api/rewards/${r.body.id}`, token: t.admin, params: { id: r.body.id }, body: { baseRev: 1, status: "Mới ghi nhận" } });
      expect(stale.status).toBe(409);
      expect((await getDoc<Reward>("rewards", r.body.id))?.status).toBe("Đã xác nhận");
    });
  });

  describe("INTEGRITY-12: evidence photos are linked to their record; orphans can be purged", () => {
    it("links on save, unlinks on removal, and the purge deletes only unattached old photos", async () => {
      const kept = await upload();
      const removed = await upload();
      const abandoned = await upload();
      const legacy = await upload();
      const inc = await createIncident({ photoIds: [kept, removed] });
      expect(inc.status).toBe(201);
      expect((await getDoc<{ attachedTo?: string }>("evidence", kept))?.attachedTo).toBe(inc.body.id);
      const edit = await callRoute(incPATCH, { method: "PATCH", url: `/api/incidents/${inc.body.id}`, token: t.editor, params: { id: inc.body.id }, body: { photoIds: [kept] } });
      expect(edit.status).toBe(200);
      expect((await getDoc<{ attachedTo?: string }>("evidence", removed))?.attachedTo).toBeUndefined();

      // A photo uploaded before records marked their photos, still used by a record.
      const legacyInc = await createIncident();
      await db().collection("incidents").doc(legacyInc.body.id).update({ photoIds: [legacy] });
      const old = new Date(Date.now() - 72 * 3_600_000).toISOString();
      for (const id of [removed, abandoned, legacy]) await db().collection("evidence").doc(id).update({ createdAt: old });

      const dry = await callRoute<EvidenceMaintenanceResult>(evidenceAdminPOST, { method: "POST", url: "/api/admin/evidence", token: t.admin, body: { levelId: "THCS" } });
      expect(dry.status).toBe(200);
      expect(dry.body).toMatchObject({ dryRun: true, total: 4, attached: 2, orphaned: 2, deleted: 0 });
      expect(await getDoc("evidence", abandoned)).toBeDefined();

      const run = await callRoute<EvidenceMaintenanceResult>(evidenceAdminPOST, { method: "POST", url: "/api/admin/evidence", token: t.admin, body: { levelId: "THCS", dryRun: false } });
      expect(run.body).toMatchObject({ dryRun: false, orphaned: 2, deleted: 2 });
      expect(await getDoc("evidence", abandoned)).toBeUndefined();
      expect(await getDoc("evidence", removed)).toBeUndefined();
      expect(await getDoc("evidence", kept)).toBeDefined();
      expect((await getDoc<{ attachedTo?: string }>("evidence", legacy))?.attachedTo).toBe(legacyInc.body.id);
      const audit = (await listDocs<AuditLog>("auditLogs")).find((a) => a.action === "RESET_DATA" && a.entity === "evidence");
      expect(audit?.detail).toMatchObject({ purgeEvidence: true, deleted: 2, relinked: 1 });

      expect((await callRoute(evidenceAdminPOST, { method: "POST", url: "/api/admin/evidence", token: t.editor, body: { levelId: "THCS" } })).status).toBe(403);
    });
  });
});
