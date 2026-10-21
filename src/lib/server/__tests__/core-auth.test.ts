import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as healthGET } from "@/app/api/health/route";
import { POST as loginFailedPOST } from "@/app/api/auth/login-failed/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { POST as sessionPOST } from "@/app/api/auth/session/route";
import { GET as meGET } from "@/app/api/me/route";
import type { ApiErrorBody, MeResponse, OkResponse } from "../../contract";
import type { AuditLog, UserProfile } from "../../types";
import { todayVN } from "../../engine/dates";
import { invalidateProfileCache } from "../auth";
import { LOGIN_FAILED_DAILY_CAP } from "../session";
import { db } from "../firebase-admin";
import { callRoute, createTestUser, getDoc, listDocs, setupTestProject, tokenFor } from "./helpers";

const PROJECT = "demo-test-core-auth";
const savedBootstrap = process.env.BOOTSTRAP_ADMIN_EMAILS;

async function auditsOf(action: AuditLog["action"]): Promise<AuditLog[]> {
  return (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === action);
}

describe("auth & session routes", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    process.env.BOOTSTRAP_ADMIN_EMAILS = "Boss@NSHM.test, other@nshm.test";
  });
  afterAll(() => {
    process.env.BOOTSTRAP_ADMIN_EMAILS = savedBootstrap;
  });

  it("GET /api/health is public", async () => {
    const res = await callRoute<{ ok: boolean; time: string }>(healthGET, { url: "/api/health" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Date.parse(res.body.time)).not.toBeNaN();
  });

  it("rejects missing and invalid tokens with 401", async () => {
    const none = await callRoute<ApiErrorBody>(meGET, { url: "/api/me" });
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe("UNAUTHENTICATED");
    const bad = await callRoute<ApiErrorBody>(meGET, { url: "/api/me", token: "not-a-jwt" });
    expect(bad.status).toBe(401);
    expect(bad.body.error.message).toMatch(/đăng nhập/);
  });

  it("returns 403 for a signed-in user without profile (not bootstrap)", async () => {
    const token = await tokenFor("stranger", "stranger@nshm.test");
    const res = await callRoute<ApiErrorBody>(sessionPOST, { method: "POST", url: "/api/auth/session", token });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("Tài khoản chưa được cấp quyền. Vui lòng liên hệ quản trị.");
    expect(await getDoc("users", "stranger")).toBeUndefined();
  });

  it("bootstraps an ADMIN profile for BOOTSTRAP_ADMIN_EMAILS and audits LOGIN (AC-001)", async () => {
    const token = await tokenFor("boss", "boss@nshm.test");
    const res = await callRoute<MeResponse>(sessionPOST, {
      method: "POST",
      url: "/api/auth/session",
      token,
      headers: { "x-forwarded-for": "198.51.100.9, 10.0.0.1" },
    });
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ uid: "boss", email: "boss@nshm.test", role: "ADMIN", levels: [], active: true });
    expect(res.body.accessibleLevels).toEqual(["TH", "THCS", "THPT"]);
    expect(res.body.profile.lastLoginAt).toBeTruthy();

    const stored = await getDoc<UserProfile>("users", "boss");
    expect(stored?.role).toBe("ADMIN");
    expect(stored?.lastLoginAt).toBe(res.body.profile.lastLoginAt);

    const logins = (await auditsOf("LOGIN")).filter((a) => a.uid === "boss");
    expect(logins).toHaveLength(1);
    expect(logins[0]).toMatchObject({ email: "boss@nshm.test", role: "ADMIN", ip: "198.51.100.9", entity: "user", entityId: "boss" });
    expect((await auditsOf("CREATE_USER")).some((a) => a.entityId === "boss" && a.detail?.bootstrap === true)).toBe(true);
  });

  it("GET /api/me returns accessible levels by role (GVCN → levels of own classes)", async () => {
    const gv = await createTestUser({ uid: "gv1", role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "7A01" }] });
    const res = await callRoute<MeResponse>(meGET, { url: "/api/me", token: gv.token });
    expect(res.status).toBe(200);
    expect(res.body.accessibleLevels).toEqual(["THCS"]);
    const viewer = await createTestUser({ uid: "v1", role: "VIEWER", levels: ["TH", "THPT"] });
    const res2 = await callRoute<MeResponse>(meGET, { url: "/api/me", token: viewer.token });
    expect(res2.body.accessibleLevels).toEqual(["TH", "THPT"]);
  });

  it("blocks inactive accounts with 403 'Tài khoản đã bị khóa'", async () => {
    const u = await createTestUser({ uid: "locked", role: "EDITOR", active: false });
    const res = await callRoute<ApiErrorBody>(meGET, { url: "/api/me", token: u.token });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe("Tài khoản đã bị khóa");
  });

  it("re-reads the profile after invalidateProfileCache (deactivation takes effect)", async () => {
    const u = await createTestUser({ uid: "soon-locked", role: "VIEWER" });
    expect((await callRoute(meGET, { url: "/api/me", token: u.token })).status).toBe(200);
    await db().collection("users").doc(u.uid).update({ active: false });
    invalidateProfileCache(u.uid);
    expect((await callRoute(meGET, { url: "/api/me", token: u.token })).status).toBe(403);
  });

  it("POST /api/auth/logout audits LOGOUT", async () => {
    const u = await createTestUser({ uid: "ed-out", role: "EDITOR" });
    const res = await callRoute<OkResponse>(logoutPOST, { method: "POST", url: "/api/auth/logout", token: u.token });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect((await auditsOf("LOGOUT")).some((a) => a.uid === "ed-out" && a.role === "EDITOR")).toBe(true);
  });

  it("POST /api/auth/login-failed is public, audits a valid email once per 10 min and rate-limits 5/min per IP", async () => {
    const post = (ip: string, body: unknown) => callRoute<OkResponse & ApiErrorBody>(loginFailedPOST, { method: "POST", url: "/api/auth/login-failed", headers: { "x-forwarded-for": ip }, body });
    const first = await post("192.0.2.50", { email: "  Someone@NSHM.test ", reason: "auth/wrong-password" });
    expect(first.status).toBe(200);
    const failed = await auditsOf("LOGIN_FAILED");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ uid: "", role: "", email: "someone@nshm.test", ip: "192.0.2.50" });
    expect(failed[0].detail).toEqual({ reason: "auth/wrong-password" });

    // Same e-mail again (another IP): answered, not stored again; invalid e-mails are never stored.
    expect((await post("192.0.2.60", { email: "someone@nshm.test", reason: "auth/wrong-password" })).status).toBe(200);
    expect((await post("192.0.2.60", { email: "không phải email" })).status).toBe(200);
    // Free-text reasons are reduced to "other".
    expect((await post("192.0.2.60", { email: "boss@nshm.test", reason: "Mật khẩu của sếp là 123" })).status).toBe(200);
    const stored = await auditsOf("LOGIN_FAILED");
    expect(stored).toHaveLength(2);
    expect(stored.find((a) => a.email === "boss@nshm.test")?.detail).toEqual({ reason: "other" });

    for (let i = 0; i < 4; i++) expect((await post("192.0.2.50", { email: `x${i}@nshm.test` })).status).toBe(200);
    const limited = await post("192.0.2.50", { email: "x9@nshm.test" });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await post("192.0.2.51", { email: "y@nshm.test" })).status).toBe(200);

    // IPv6: one /64 is one client (rotating the interface id gives no fresh limit).
    for (let i = 1; i <= 5; i++) expect((await post(`2001:db8:1:2::${i}`, { email: `v6-${i}@nshm.test` })).status).toBe(200);
    expect((await post("2001:db8:1:2:ffff::9", { email: "v6-9@nshm.test" })).status).toBe(429);
  });

  it("login-failed: at most LOGIN_FAILED_DAILY_CAP stored entries per day for the whole school (quota protection)", async () => {
    const day = todayVN().replaceAll("-", "");
    await db().collection("counters").doc(`LOGIN_FAILED_${day}`).set({ count: LOGIN_FAILED_DAILY_CAP - 1 });
    const before = (await auditsOf("LOGIN_FAILED")).length;
    const post = (ip: string, email: string) => callRoute(loginFailedPOST, { method: "POST", url: "/api/auth/login-failed", headers: { "x-forwarded-for": ip }, body: { email } });
    expect((await post("198.51.100.20", "cap-1@nshm.test")).status).toBe(200);
    expect((await post("198.51.100.21", "cap-2@nshm.test")).status).toBe(200);
    expect((await post("198.51.100.22", "cap-3@nshm.test")).status).toBe(200);
    const after = await auditsOf("LOGIN_FAILED");
    expect(after).toHaveLength(before + 1);
    expect(after.find((a) => a.email === "cap-1@nshm.test")?.detail).toMatchObject({ dailyCapReached: true });
    expect((await getDoc<{ count: number }>("counters", `LOGIN_FAILED_${day}`))?.count).toBe(LOGIN_FAILED_DAILY_CAP);
  });

  it("maps invalid JSON and schema errors to 400 VALIDATION with details", async () => {
    const bad = await callRoute<ApiErrorBody>(loginFailedPOST, {
      method: "POST",
      url: "/api/auth/login-failed",
      headers: { "x-forwarded-for": "192.0.2.77" },
      body: "{not json",
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION");
    const missing = await callRoute<ApiErrorBody>(loginFailedPOST, {
      method: "POST",
      url: "/api/auth/login-failed",
      headers: { "x-forwarded-for": "192.0.2.77" },
      body: {},
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details).toEqual([{ path: "email", message: 'Thiếu trường "email".' }]);
  });
});
