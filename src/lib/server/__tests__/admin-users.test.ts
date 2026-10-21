import { beforeAll, describe, expect, it } from "vitest";
import { GET as meGET } from "@/app/api/me/route";
import { POST as resetPOST } from "@/app/api/users/[uid]/reset-password/route";
import { PATCH as userPATCH } from "@/app/api/users/[uid]/route";
import { POST as bulkPOST } from "@/app/api/users/bulk-gvcn/route";
import { GET as usersGET, POST as usersPOST } from "@/app/api/users/route";
import type { ApiErrorBody, BulkGvcnResult, ListResponse, UserCreateInput, UserCreateResult } from "../../contract";
import type { AuditLog, UserProfile } from "../../types";
import { adminAuth } from "../firebase-admin";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject, tokenFor } from "./helpers";

const PROJECT = "demo-test-admin-users";
const TEMP_RE = /^Nshm-[A-Za-z2-9]{4}-[2-9]{4}$/;
let admin = "";

const createUser = (body: Partial<UserCreateInput>, token = admin) =>
  callRoute<UserCreateResult & ApiErrorBody>(usersPOST, { method: "POST", url: "/api/users", token, body: { displayName: "Người Dùng", role: "EDITOR", ...body } });
const patchUser = (uid: string, body: unknown, token = admin) =>
  callRoute<UserProfile & ApiErrorBody>(userPATCH, { method: "PATCH", url: `/api/users/${uid}`, token, params: { uid }, body });

describe("users API", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", {
      classes: [
        { code: "6A01", homeroomTeacher: "Nguyễn Thị Lụa", homeroomEmail: "Co.Lan@NSHM.test" },
        { code: "6A02", homeroomTeacher: "Nguyễn Thị Lụa", homeroomEmail: "co.lan@nshm.test" },
        { code: "6A03", homeroomTeacher: "Trần Văn Bình", homeroomEmail: "thay.binh@nshm.test" },
        { code: "6A04", homeroomTeacher: "Chưa Có Email" },
        { code: "6A05", homeroomEmail: "khong-phai-email" },
        { code: "6A06", homeroomEmail: "lop.nghi@nshm.test", active: false },
        { code: "6A07", homeroomEmail: "editor1@nshm.test" },
      ],
    });
    admin = (await createTestUser({ uid: "admin", role: "ADMIN", displayName: "Quản trị" })).token;
  });

  it("creates an Auth user + profile and returns a readable temporary password once", async () => {
    const res = await createUser({ email: " Editor1@NSHM.test ", displayName: "Cô Hạnh", role: "EDITOR", levels: ["THCS", "TH", "THCS"] });
    expect(res.status).toBe(201);
    expect(res.body.tempPassword).toMatch(TEMP_RE);
    expect(res.body.profile).toMatchObject({ email: "editor1@nshm.test", role: "EDITOR", levels: ["TH", "THCS"], active: true });
    const auth = await adminAuth().getUserByEmail("editor1@nshm.test");
    expect(auth.uid).toBe(res.body.profile.uid);
    expect(await getDoc<UserProfile>("users", auth.uid)).toMatchObject({ displayName: "Cô Hạnh" });
    const audit = (await listDocs<AuditLog>("auditLogs")).find((a) => a.action === "CREATE_USER" && a.entityId === auth.uid);
    expect(JSON.stringify(audit)).not.toContain(res.body.tempPassword ?? "-");

    const dup = await createUser({ email: "editor1@nshm.test" });
    expect(dup.status).toBe(409);
  });

  it("links an existing Auth user (re-secured with a new temporary password) and validates GVCN classes", async () => {
    const existing = await adminAuth().createUser({ email: "da.co@nshm.test", password: "MatKhau@123" });
    const res = await createUser({ email: "da.co@nshm.test", role: "VIEWER" });
    expect(res.status).toBe(201);
    expect(res.body.profile.uid).toBe(existing.uid);
    // A password account that existed before the admin created the profile may belong to anyone (public sign-up).
    expect(res.body.tempPassword).toMatch(TEMP_RE);

    expect((await createUser({ email: "g1@nshm.test", role: "GVCN" })).status).toBe(400);
    const unknown = await createUser({ email: "g1@nshm.test", role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "9Z9" }] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.message).toContain("9Z9");
    const ok = await createUser({ email: "g1@nshm.test", role: "GVCN", password: "GiaoVien@2026", gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }] });
    expect(ok.status).toBe(201);
    expect(ok.body.profile).toMatchObject({ role: "GVCN", levels: ["THCS"], gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }] });
    expect(ok.body.tempPassword).toBeUndefined();
  });

  it("protects the last active admin and admins themselves", async () => {
    const lastAdmin = await patchUser("admin", { role: "VIEWER" });
    expect(lastAdmin.status).toBe(400);
    expect(lastAdmin.body.error.message).toBe("Không thể bỏ quyền hoặc khóa quản trị viên cuối cùng.");

    const second = await createUser({ email: "admin2@nshm.test", role: "ADMIN", displayName: "Quản trị 2" });
    expect(second.status).toBe(201);
    const self = await patchUser("admin", { active: false });
    expect(self.status).toBe(400);
    expect(self.body.error.message).toBe("Bạn không thể tự bỏ quyền quản trị hoặc tự khóa tài khoản của mình.");

    const demoted = await patchUser(second.body.profile.uid, { role: "EDITOR", levels: ["THPT"] });
    expect(demoted.status).toBe(200);
    expect(demoted.body).toMatchObject({ role: "EDITOR", levels: ["THPT"] });
    expect((await getDoc<UserProfile>("users", "admin"))?.role).toBe("ADMIN");
  });

  it("deactivation disables the Auth user and takes effect immediately", async () => {
    const u = await createTestUser({ uid: "viewer1", role: "VIEWER" });
    expect((await callRoute(meGET, { url: "/api/me", token: u.token })).status).toBe(200);
    const res = await patchUser("viewer1", { active: false });
    expect(res.status).toBe(200);
    expect((await adminAuth().getUser("viewer1")).disabled).toBe(true);
    const audit = (await listDocs<AuditLog>("auditLogs")).find((a) => a.action === "UPDATE_USER" && a.entityId === "viewer1");
    expect(audit?.detail).toMatchObject({ changes: { active: { before: true, after: false } } });
    const after = await callRoute<ApiErrorBody>(meGET, { url: "/api/me", token: await tokenFor("viewer1") });
    expect(after.status).toBe(403);
    expect((await patchUser("nope", { active: false })).status).toBe(404);
  });

  it("reset-password returns a new temp password and audits without it", async () => {
    const uid = (await adminAuth().getUserByEmail("editor1@nshm.test")).uid;
    const res = await callRoute<{ tempPassword: string }>(resetPOST, { method: "POST", url: `/api/users/${uid}/reset-password`, token: admin, params: { uid } });
    expect(res.status).toBe(200);
    expect(res.body.tempPassword).toMatch(TEMP_RE);
    const audit = (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === "RESET_PASSWORD");
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0])).not.toContain(res.body.tempPassword);
  });

  it("bulk-gvcn groups classes by email, links existing accounts and skips classes without a valid email", async () => {
    await adminAuth().createUser({ email: "thay.binh@nshm.test" });
    const res = await callRoute<BulkGvcnResult>(bulkPOST, { method: "POST", url: "/api/users/bulk-gvcn", token: admin, body: { levelId: "THCS" } });
    expect(res.status).toBe(200);
    // thay.binh had an Auth account without profile (not a verified Google/Microsoft one) → re-secured, temp password.
    expect(res.body.created).toHaveLength(2);
    expect(res.body.created[0]).toMatchObject({ email: "co.lan@nshm.test", displayName: "Nguyễn Thị Lụa", classCode: "6A01, 6A02" });
    expect(res.body.created[0].tempPassword).toMatch(TEMP_RE);
    expect(res.body.created[1]).toMatchObject({ email: "thay.binh@nshm.test", classCode: "6A03" });
    expect(res.body.created[1].tempPassword).toMatch(TEMP_RE);
    expect(res.body.linkedExisting).toEqual([{ email: "editor1@nshm.test", classCode: "6A07" }]);
    expect(res.body.skipped.map((s) => s.classCode).sort()).toEqual(["6A04", "6A05"]);

    const lan = (await listDocs<UserProfile>("users")).find((u) => u.email === "co.lan@nshm.test");
    expect(lan).toMatchObject({ role: "GVCN", levels: ["THCS"], gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }, { levelId: "THCS", classCode: "6A02" }] });
    const editor = (await listDocs<UserProfile>("users")).find((u) => u.email === "editor1@nshm.test");
    expect(editor?.role).toBe("EDITOR");
    expect(editor?.gvcnClasses).toEqual([{ levelId: "THCS", classCode: "6A07" }]);

    const again = await callRoute<BulkGvcnResult>(bulkPOST, { method: "POST", url: "/api/users/bulk-gvcn", token: admin, body: { levelId: "THCS" } });
    expect(again.body.created).toHaveLength(0);
    expect(again.body.linkedExisting).toHaveLength(4);
  });

  it("lists users for admins only", async () => {
    const res = await callRoute<ListResponse<UserProfile>>(usersGET, { url: "/api/users", token: admin });
    expect(res.status).toBe(200);
    expect(res.body.items[0].role).toBe("ADMIN");
    expect(res.body.items.some((u) => u.email === "co.lan@nshm.test")).toBe(true);
    const editor = await createTestUser({ uid: "editor9", role: "EDITOR" });
    expect((await callRoute(usersGET, { url: "/api/users", token: editor.token })).status).toBe(403);
  });
});
