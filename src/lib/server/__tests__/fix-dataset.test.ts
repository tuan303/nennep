/**
 * Regression tests: rewards scoped to the school year (INTEGRITY-1), monthly reward digests + legacy migration
 * (INTEGRITY-4), dataset memo per version / no-op bumps (INTEGRITY-3), GVCN student scope (INTEGRITY-13).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { POST as rebuildPOST } from "@/app/api/admin/rebuild-digests/route";
import { GET as datasetGET } from "@/app/api/dataset/route";
import { POST as feedbackPOST } from "@/app/api/incidents/[id]/feedback/route";
import { POST as incidentPOST } from "@/app/api/incidents/route";
import { GET as rankingsGET } from "@/app/api/rankings/route";
import { POST as rewardPOST } from "@/app/api/rewards/route";
import { PUT as configPUT } from "@/app/api/settings/[level]/config/route";
import { PUT as weeksPUT } from "@/app/api/settings/[level]/weeks/route";
import { GET as studentGET } from "@/app/api/students/[id]/route";
import { POST as withdrawPOST } from "@/app/api/students/[id]/withdraw/route";
import { POST as bulkPOST } from "@/app/api/users/bulk-gvcn/route";
import type { BulkGvcnResult, RankingsResponse } from "../../contract";
import { addDays, mondayOf, todayVN } from "../../engine/dates";
import type { Incident, LevelDataset, Reward, UserProfile } from "../../types";
import { buildLevelDataset } from "../dataset";
import { db } from "../firebase-admin";
import { readVersion } from "../versions";
import { commitInChunks, sized } from "../write";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-fix-dataset";
const today = todayVN();
let admin = "";

const dataset = async (level: string, token = admin) => (await callRoute<LevelDataset>(datasetGET, { url: `/api/dataset?level=${level}`, token })).body;
const rewardDigests = async (level: string) =>
  (await listDocs<{ levelId: string; kind: string; month?: string; items: Reward[] }>("digests")).filter((d) => d.levelId === level && d.kind === "rew");

describe("dataset & digests fixes", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
  });

  describe("INTEGRITY-1/4: rewards of another school year never count", () => {
    beforeAll(async () => {
      await seedReference("THPT", { classes: ["10A1", "10A2"] });
    });

    it("rewards live in monthly digests and a rollover leaves last year's rewards out of the dataset and rankings", async () => {
      const r = await callRoute<Reward>(rewardPOST, {
        method: "POST",
        url: "/api/rewards",
        token: admin,
        body: { levelId: "THPT", date: addDays(today, -1), classCode: "10A1", points: 50, reason: "Giải nhất", status: "Đã xác nhận" },
      });
      expect(r.status).toBe(201);
      const docs = await rewardDigests("THPT");
      expect(docs.map((d) => d.month)).toEqual([r.body.week.slice(0, 7)]);
      expect((await dataset("THPT")).rewards.map((x) => x.id)).toEqual([r.body.id]);

      // Rollover as documented: next school year config, then regenerate the calendar (confirmed).
      const next = addDays(today, 365);
      const nextMonday = mondayOf(next);
      const cfg = await callRoute(configPUT, {
        method: "PUT",
        url: "/api/settings/THPT/config",
        token: admin,
        params: { level: "THPT" },
        body: {
          firstWeek: nextMonday,
          semesters: [
            { code: "HK1", name: "Học kỳ I", start: nextMonday, end: addDays(nextMonday, 120) },
            { code: "HK2", name: "Học kỳ II", start: addDays(nextMonday, 121), end: addDays(nextMonday, 260) },
          ],
        },
      });
      expect(cfg.status).toBe(200);
      const regen = await callRoute(weeksPUT, { method: "PUT", url: "/api/settings/THPT/weeks?allowHidingRecords=1", token: admin, params: { level: "THPT" }, body: { regenerate: true } });
      expect(regen.status).toBe(200);

      const ds = await dataset("THPT");
      expect(ds.rewards).toHaveLength(0);
      for (const mode of ["all", "semester"]) {
        const q = mode === "all" ? "mode=all" : "mode=semester&key=HK1";
        const rk = await callRoute<RankingsResponse>(rankingsGET, { url: `/api/rankings?level=THPT&${q}`, token: admin });
        expect(rk.status).toBe(200);
        const row = rk.body.grades.flatMap((g) => g.rows).find((x) => x.classCode === "10A1");
        expect(row?.rewardPoints).toBe(0);
      }
      // Canonical record kept.
      expect((await getDoc<Reward>("rewards", r.body.id))?.deletedAt).toBeUndefined();
    });

    it("a legacy single __rew digest keeps working until the next rebuild, which migrates it to monthly docs", async () => {
      await seedReference("TH", { classes: ["1A1"] });
      const legacyReward = {
        id: "TH_KT-LEGACY-1",
        code: "KT-LEGACY-1",
        levelId: "TH",
        date: addDays(today, -2),
        week: mondayOf(addDays(today, -2)),
        month: mondayOf(addDays(today, -2)).slice(0, 7),
        semester: "HK1",
        classCode: "1A1",
        grade: 1,
        points: 4,
        reason: "Cũ",
        evidenceUrls: [],
        photoIds: [],
        status: "Đã xác nhận",
        source: "app",
        createdBy: "admin",
        createdByName: "Quản trị",
        createdAt: new Date().toISOString(),
      } satisfies Reward;
      await db().collection("rewards").doc(legacyReward.id).set(legacyReward);
      await db().collection("digests").doc("TH__rew").set({ levelId: "TH", kind: "rew", items: [legacyReward], updatedAt: new Date().toISOString() });

      const created = await callRoute<Reward>(rewardPOST, {
        method: "POST",
        url: "/api/rewards",
        token: admin,
        body: { levelId: "TH", date: addDays(today, -1), classCode: "1A1", points: 2, reason: "Mới" },
      });
      expect(created.status).toBe(201);
      // Legacy mode: the new reward went into the legacy doc (complete), no partial monthly doc.
      expect((await getDoc<{ items: Reward[] }>("digests", "TH__rew"))?.items.map((x) => x.id).sort()).toEqual([created.body.id, legacyReward.id].sort());
      expect((await rewardDigests("TH")).filter((d) => d.month)).toHaveLength(0);
      expect((await dataset("TH")).rewards.map((x) => x.id).sort()).toEqual([created.body.id, legacyReward.id].sort());

      const rebuilt = await callRoute(rebuildPOST, { method: "POST", url: "/api/admin/rebuild-digests", token: admin, body: { levelId: "TH" } });
      expect(rebuilt.status).toBe(200);
      expect(await getDoc("digests", "TH__rew")).toBeUndefined();
      expect((await rewardDigests("TH")).every((d) => d.month)).toBe(true);
      expect((await dataset("TH")).rewards.map((x) => x.id).sort()).toEqual([created.body.id, legacyReward.id].sort());
    });
  });

  describe("INTEGRITY-3: one dataset build per version, no bump without change", () => {
    beforeAll(async () => {
      await seedReference("THCS", {
        classes: [
          { code: "6A1", homeroomEmail: "gv.moi@nshm.test" },
          { code: "6A2", homeroomEmail: "gv.6a2@nshm.test" },
        ],
        students: [
          { id: "G1", name: "Học Sinh Cũ", classCode: "6A1", status: "GRADUATED", leftAt: addDays(today, -400) },
          { id: "A1", name: "Đang Học", classCode: "6A1" },
          { id: "W1", name: "Vừa Chuyển", classCode: "6A1" },
        ],
      });
    });

    it("memoises the dataset per version (shared by every request) and rebuilds after a write", async () => {
      const v = await readVersion("THCS");
      const a = await buildLevelDataset("THCS", v);
      const b = await buildLevelDataset("THCS", v);
      expect(b).toBe(a);
      const inc = await callRoute<Incident>(incidentPOST, {
        method: "POST",
        url: "/api/incidents",
        token: admin,
        body: { levelId: "THCS", date: addDays(today, -1), classCode: "6A1", errorCode: "L01", scope: "Cá nhân", studentIds: ["W1"] },
      });
      expect(inc.status).toBe(201);
      const c = await buildLevelDataset("THCS");
      expect(c).not.toBe(a);
      expect(c.incidents.map((i) => i.id)).toContain(inc.body.id);
    });

    it("GVCN feedback that changes nothing writes nothing (no version bump, no audit)", async () => {
      const gv = await createTestUser({ uid: "gv-6a1", role: "GVCN", email: "gv.moi@nshm.test", gvcnClasses: [{ levelId: "THCS", classCode: "6A1" }] });
      const id = (await buildLevelDataset("THCS")).incidents[0].id;
      const send = () => callRoute<Incident>(feedbackPOST, { method: "POST", url: `/api/incidents/${id}/feedback`, token: gv.token, params: { id }, body: { note: "Đã nhắc", status: "Đang xử lý" } });
      expect((await send()).status).toBe(200);
      const v = await readVersion("THCS");
      const again = await send();
      expect(again.status).toBe(200);
      expect(await readVersion("THCS")).toBe(v);
      expect((await listDocs("auditLogs")).filter((a) => (a as { action?: string }).action === "GVCN_FEEDBACK")).toHaveLength(1);
    });
  });

  describe("INTEGRITY-13: a GVCN only gets the students of their classes this school year", () => {
    it("last year's graduates of a reused class code are neither in the dataset nor openable; this year's named leavers are", async () => {
      const gv = await createTestUser({ uid: "gv-6a1b", role: "GVCN", email: "gv.moi2@nshm.test", gvcnClasses: [{ levelId: "THCS", classCode: "6A1" }] });
      const withdraw = await callRoute(withdrawPOST, { method: "POST", url: "/api/students/W1/withdraw", token: admin, params: { id: "W1" }, body: { date: today, reason: "Chuyển trường" } });
      expect(withdraw.status).toBe(200);
      const ds = await dataset("THCS", gv.token);
      expect(ds.redacted).toBe(true);
      expect(ds.students.map((s) => s.id).sort()).toEqual(["A1", "W1"]);
      expect((await callRoute(studentGET, { url: "/api/students/G1", token: gv.token, params: { id: "G1" } })).status).toBe(403);
      expect((await callRoute(studentGET, { url: "/api/students/W1", token: gv.token, params: { id: "W1" } })).status).toBe(200);
      expect((await callRoute(studentGET, { url: "/api/students/A1", token: gv.token, params: { id: "A1" } })).status).toBe(200);
      // Admins (all classes) still open every student.
      expect((await callRoute(studentGET, { url: "/api/students/G1", token: admin, params: { id: "G1" } })).status).toBe(200);
      // The admin roster (all statuses) still lists the former student.
      expect((await dataset("THCS")).students.map((s) => s.id)).toContain("G1");
    });

    it("bulk GVCN sync removes class assignments that no longer match the class list", async () => {
      await createTestUser({ uid: "gv-old", role: "GVCN", email: "gv.cu@nshm.test", gvcnClasses: [{ levelId: "THCS", classCode: "6A2" }] });
      const res = await callRoute<BulkGvcnResult>(bulkPOST, { method: "POST", url: "/api/users/bulk-gvcn", token: admin, body: { levelId: "THCS", sync: true } });
      expect(res.status).toBe(200);
      expect(res.body.unassigned).toContainEqual({ email: "gv.cu@nshm.test", classCode: "6A2" });
      expect((await getDoc<UserProfile>("users", "gv-old"))?.gvcnClasses).toEqual([]);
      // The current homeroom teacher of 6A1 keeps the class.
      expect((await getDoc<UserProfile>("users", "gv-6a1"))?.gvcnClasses).toEqual([{ levelId: "THCS", classCode: "6A1" }]);
    });
  });

  describe("INTEGRITY-11: batches are split by size", () => {
    it("commitInChunks starts a new batch before the payload limit", async () => {
      const ops = Array.from({ length: 5 }, (_, i) => sized((b) => void b.set(db().collection("scratch").doc(`d${i}`), { i }), 400));
      expect(await commitInChunks(ops, undefined, 0, 1000)).toBe(3);
      expect(await commitInChunks(ops.map((o) => sized(o, 0)))).toBe(1);
    });
  });
});
