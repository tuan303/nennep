/**
 * Regression tests: account pre-hijacking (SECURITY-3), level-limited admins (SECURITY-4), bootstrap admin
 * (SECURITY-5), session revocation (SECURITY-8), rate-limit keys (SECURITY-6).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as auditGET } from "@/app/api/audit-logs/route";
import { POST as sessionPOST } from "@/app/api/auth/session/route";
import { GET as meGET } from "@/app/api/me/route";
import { POST as resetPOST } from "@/app/api/users/[uid]/reset-password/route";
import { PATCH as userPATCH } from "@/app/api/users/[uid]/route";
import { GET as usersGET, POST as usersPOST } from "@/app/api/users/route";
import { hasPermission } from "../../constants";
import type { ApiErrorBody, MeResponse, UserCreateResult } from "../../contract";
import type { AuditLog, UserProfile } from "../../types";
import { AUTH_MSG, invalidateProfileCache } from "../auth";
import { adminAuth, db } from "../firebase-admin";
import { checkRateLimit, ipRateKey, MAX_KEYS, rateLimitKeyCount, resetRateLimits } from "../rate-limit";
import { callRoute, createTestUser, getDoc, listDocs, mintEmulatorIdToken, setupTestProject, tokenFor } from "./helpers";

const PROJECT = "demo-test-fix-security";
const AUTH_HOST = () => process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const TEMP_RE = /^Nshm-[A-Za-z2-9]{4}-[2-9]{4}$/;
const savedBootstrap = process.env.BOOTSTRAP_ADMIN_EMAILS;

/**
 * Password currently stored for an account of the TEST project (the Auth emulator keeps it readable in
 * `passwordHash`). Never use the keyed client REST endpoints here: they target the emulator's default project.
 */
async function storedPassword(email: string): Promise<string | undefined> {
  const res = await fetch(`http://${AUTH_HOST()}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify({ email: [email] }),
  });
  const body = (await res.json()) as { users?: Array<{ passwordHash?: string }> };
  return /password=(.*)$/.exec(body.users?.[0]?.passwordHash ?? "")?.[1];
}

const pastToken = (uid: string, email: string, secondsAgo: number) => {
  const t = Math.floor(Date.now() / 1000) - secondsAgo;
  return mintEmulatorIdToken(uid, email, { auth_time: t, iat: t, exp: t + 3600 });
};

describe("server security fixes", () => {
  let root = "";

  beforeAll(async () => {
    await setupTestProject(PROJECT);
    root = (await createTestUser({ uid: "root", role: "ADMIN", displayName: "Quản trị trường" })).token;
  });
  afterAll(() => {
    process.env.BOOTSTRAP_ADMIN_EMAILS = savedBootstrap;
  });

  describe("SECURITY-3: linking an Auth account that existed before the profile", () => {
    it("re-secures a self-registered password account: new temp password, old password and old sessions void", async () => {
      // Same result as the public sign-up API with the web API key: an unverified password account.
      const attackerUid = (await adminAuth().createUser({ email: "teacher@nshm.test", password: "attackerPw123" })).uid;
      expect(await storedPassword("teacher@nshm.test")).toBe("attackerPw123");
      const attackerToken = pastToken(attackerUid, "teacher@nshm.test", 30);

      const res = await callRoute<UserCreateResult>(usersPOST, {
        method: "POST",
        url: "/api/users",
        token: root,
        body: { email: "teacher@nshm.test", displayName: "Cô giáo", role: "EDITOR" },
      });
      expect(res.status).toBe(201);
      expect(res.body.profile.uid).toBe(attackerUid);
      expect(res.body.tempPassword).toMatch(TEMP_RE);
      expect(res.body.profile.sessionsValidAfter).toBeTruthy();

      expect(await storedPassword("teacher@nshm.test")).toBe(res.body.tempPassword);
      const me = await callRoute<ApiErrorBody>(meGET, { url: "/api/me", token: attackerToken });
      expect(me.status).toBe(401);
      const audit = (await listDocs<AuditLog>("auditLogs")).find((a) => a.action === "CREATE_USER" && a.entityId === attackerUid);
      expect(audit?.detail).toMatchObject({ linkedExistingAuth: true, resecuredExistingAuth: true });
    });

    it("links a verified Google account of the same address as it is (no password reset)", async () => {
      await adminAuth().importUsers([
        { uid: "g-user", email: "gv.google@nshm.test", emailVerified: true, providerData: [{ uid: "google-123", providerId: "google.com", email: "gv.google@nshm.test" }] },
      ]);
      const res = await callRoute<UserCreateResult>(usersPOST, {
        method: "POST",
        url: "/api/users",
        token: root,
        body: { email: "gv.google@nshm.test", displayName: "Thầy Google", role: "VIEWER" },
      });
      expect(res.status).toBe(201);
      expect(res.body.profile.uid).toBe("g-user");
      expect(res.body.tempPassword).toBeUndefined();
      expect(res.body.profile.sessionsValidAfter).toBeUndefined();
      expect((await adminAuth().getUser("g-user")).providerData.map((p) => p.providerId)).toEqual(["google.com"]);
    });

    it("an unverified Google account (or any foreign provider) is re-secured and its provider unlinked", async () => {
      await adminAuth().importUsers([
        { uid: "g-unverified", email: "gv.la@nshm.test", emailVerified: false, providerData: [{ uid: "google-999", providerId: "google.com", email: "gv.la@nshm.test" }] },
      ]);
      const res = await callRoute<UserCreateResult>(usersPOST, {
        method: "POST",
        url: "/api/users",
        token: root,
        body: { email: "gv.la@nshm.test", displayName: "Giáo viên", role: "VIEWER" },
      });
      expect(res.status).toBe(201);
      expect(res.body.tempPassword).toMatch(TEMP_RE);
      expect((await adminAuth().getUser("g-unverified")).providerData.map((p) => p.providerId)).toEqual(["password"]);
    });
  });

  describe("SECURITY-4: users.manage and audit.view are school-wide", () => {
    let thcsAdmin = "";

    beforeAll(async () => {
      thcsAdmin = (await createTestUser({ uid: "adm-thcs", role: "ADMIN", levels: ["THCS"] })).token;
    });

    it("hasPermission withholds the school-wide permissions from level-limited profiles", () => {
      expect(hasPermission({ role: "ADMIN", active: true, levels: ["THCS"] }, "users.manage")).toBe(false);
      expect(hasPermission({ role: "ADMIN", active: true, levels: ["THCS"] }, "audit.view")).toBe(false);
      expect(hasPermission({ role: "ADMIN", active: true, levels: ["THCS"] }, "settings.manage")).toBe(true);
      expect(hasPermission({ role: "ADMIN", active: true, levels: [] }, "users.manage")).toBe(true);
      expect(hasPermission({ role: "ADMIN", active: true }, "audit.view")).toBe(true);
    });

    it("a THCS-only admin can neither list/reset/edit accounts (incl. itself) nor read the audit log", async () => {
      expect((await callRoute(usersGET, { url: "/api/users", token: thcsAdmin })).status).toBe(403);
      const reset = await callRoute(resetPOST, { method: "POST", url: "/api/users/root/reset-password", token: thcsAdmin, params: { uid: "root" } });
      expect(reset.status).toBe(403);
      const widen = await callRoute(userPATCH, { method: "PATCH", url: "/api/users/adm-thcs", token: thcsAdmin, params: { uid: "adm-thcs" }, body: { levels: [] } });
      expect(widen.status).toBe(403);
      const lock = await callRoute(userPATCH, { method: "PATCH", url: "/api/users/root", token: thcsAdmin, params: { uid: "root" }, body: { active: false } });
      expect(lock.status).toBe(403);
      expect((await callRoute(auditGET, { url: "/api/audit-logs?level=TH", token: thcsAdmin })).status).toBe(403);
      expect((await getDoc<UserProfile>("users", "adm-thcs"))?.levels).toEqual(["THCS"]);
      expect((await getDoc<UserProfile>("users", "root"))?.active).toBe(true);
    });

    it("admins cannot change their own levels, and the last school-wide admin cannot be restricted", async () => {
      const self = await callRoute<ApiErrorBody>(userPATCH, { method: "PATCH", url: "/api/users/root", token: root, params: { uid: "root" }, body: { levels: ["TH"] } });
      expect(self.status).toBe(400);
      // adm-thcs is an ADMIN but not school-wide: root is still the last one that can manage accounts.
      expect(self.body.error.message).toBe("Không thể bỏ quyền hoặc khóa quản trị viên cuối cùng.");
      const second = await createTestUser({ uid: "root2", role: "ADMIN" });
      const selfAgain = await callRoute<ApiErrorBody>(userPATCH, { method: "PATCH", url: "/api/users/root", token: root, params: { uid: "root" }, body: { levels: ["TH"] } });
      expect(selfAgain.status).toBe(400);
      expect(selfAgain.body.error.message).toBe("Bạn không thể tự thay đổi cấp học của tài khoản mình.");
      const restrict = await callRoute<UserProfile>(userPATCH, { method: "PATCH", url: "/api/users/root2", token: root, params: { uid: "root2" }, body: { levels: ["TH"] } });
      expect(restrict.status).toBe(200);
      expect(restrict.body.levels).toEqual(["TH"]);
      // root2 is now level-limited → it lost users.manage.
      invalidateProfileCache("root2");
      expect((await callRoute(usersGET, { url: "/api/users", token: second.token })).status).toBe(403);
    });
  });

  describe("SECURITY-5: bootstrap admin", () => {
    it("needs a verified e-mail and a school without active admin", async () => {
      process.env.BOOTSTRAP_ADMIN_EMAILS = "boss@nshm.test";
      // Unverified address (anyone can register it through the public sign-up API).
      await tokenFor("boss-unverified", "boss@nshm.test");
      const unverified = mintEmulatorIdToken("boss-unverified", "boss@nshm.test", { email_verified: false });
      const r1 = await callRoute<ApiErrorBody>(sessionPOST, { method: "POST", url: "/api/auth/session", token: unverified });
      expect(r1.status).toBe(403);
      // Verified, but the school already has an active admin (root).
      const verified = mintEmulatorIdToken("boss-unverified", "boss@nshm.test");
      const r2 = await callRoute<ApiErrorBody>(sessionPOST, { method: "POST", url: "/api/auth/session", token: verified });
      expect(r2.status).toBe(403);
      expect(r2.body.error.message).toBe(AUTH_MSG.noProfile);
      expect(await getDoc("users", "boss-unverified")).toBeUndefined();
    });
  });

  describe("SECURITY-8: sessions end on password reset / lock", () => {
    it("a token issued before the reset is rejected even though the ID token itself is still valid", async () => {
      const u = await createTestUser({ uid: "ed-reset", role: "EDITOR" });
      const before = pastToken("ed-reset", u.email, 20);
      expect((await callRoute(meGET, { url: "/api/me", token: before })).status).toBe(200);
      const res = await callRoute<{ tempPassword: string }>(resetPOST, { method: "POST", url: "/api/users/ed-reset/reset-password", token: root, params: { uid: "ed-reset" } });
      expect(res.status).toBe(200);
      expect((await getDoc<UserProfile>("users", "ed-reset"))?.sessionsValidAfter).toBeTruthy();
      const after = await callRoute<ApiErrorBody>(meGET, { url: "/api/me", token: before });
      expect(after.status).toBe(401);
      expect(after.body.error.message).toBe(AUTH_MSG.revoked);
    });

    it("authenticate() enforces profile.sessionsValidAfter by itself (production has no per-request revocation check)", async () => {
      const u = await createTestUser({ uid: "ed-cut", role: "EDITOR" });
      const cutoff = new Date(Math.floor(Date.now() / 1000) * 1000 - 10_000).toISOString();
      await db().collection("users").doc("ed-cut").update({ sessionsValidAfter: cutoff });
      invalidateProfileCache("ed-cut");
      const old = await callRoute<ApiErrorBody>(meGET, { url: "/api/me", token: pastToken("ed-cut", u.email, 60) });
      expect(old.status).toBe(401);
      const fresh = await callRoute<MeResponse>(meGET, { url: "/api/me", token: pastToken("ed-cut", u.email, 1) });
      expect(fresh.status).toBe(200);
    });

    it("locking an account voids its sessions also after a later unlock", async () => {
      const u = await createTestUser({ uid: "ed-lock", role: "EDITOR" });
      const before = pastToken("ed-lock", u.email, 20);
      await callRoute(userPATCH, { method: "PATCH", url: "/api/users/ed-lock", token: root, params: { uid: "ed-lock" }, body: { active: false } });
      await callRoute(userPATCH, { method: "PATCH", url: "/api/users/ed-lock", token: root, params: { uid: "ed-lock" }, body: { active: true } });
      expect((await callRoute(meGET, { url: "/api/me", token: before })).status).toBe(401);
    });
  });

  describe("SECURITY-6: rate-limit keys and memory", () => {
    it("keys IPv6 clients by /64 and IPv4-mapped addresses by the IPv4 address", () => {
      expect(ipRateKey("203.0.113.7")).toBe("203.0.113.7");
      expect(ipRateKey("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
      expect(ipRateKey("2001:0db8:0001:0002:abcd:1:2:3")).toBe("2001:db8:1:2::/64");
      expect(ipRateKey("::ffff:198.51.100.4")).toBe("198.51.100.4");
      expect(ipRateKey("")).toBe("unknown");
    });

    it("never tracks more than MAX_KEYS keys", () => {
      resetRateLimits();
      const now = Date.now();
      for (let i = 0; i < MAX_KEYS + 500; i++) checkRateLimit(`k${i}`, 5, 60_000, now);
      expect(rateLimitKeyCount()).toBeLessThanOrEqual(MAX_KEYS);
      resetRateLimits();
    });
  });
});
