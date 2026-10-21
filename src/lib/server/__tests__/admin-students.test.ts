import { beforeAll, describe, expect, it } from "vitest";
import { POST as createIncidentPOST } from "@/app/api/incidents/route";
import { POST as reinstatePOST } from "@/app/api/students/[id]/reinstate/route";
import { GET as studentGET, PATCH as studentPATCH } from "@/app/api/students/[id]/route";
import { POST as transferPOST } from "@/app/api/students/[id]/transfer/route";
import { POST as withdrawPOST } from "@/app/api/students/[id]/withdraw/route";
import { POST as studentPOST } from "@/app/api/students/route";
import type { ApiErrorBody, StudentCreateInput } from "../../contract";
import { addDays, todayVN } from "../../engine/dates";
import type { AuditLog, Incident, Student, StudentLite } from "../../types";
import { readVersion } from "../versions";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-admin-students";
const today = todayVN();
const yesterday = addDays(today, -1);
const t = { admin: "", editor: "", gvcn1: "", gvcn2: "" };

type Res = Student & ApiErrorBody;
const create = (body: Partial<StudentCreateInput>, token = t.admin) =>
  callRoute<Res>(studentPOST, {
    method: "POST",
    url: "/api/students",
    token,
    body: { levelId: "THCS", classCode: "7A01", enrollDate: today, enrollType: "NEW", ...body },
  });
const post = (handler: typeof transferPOST, id: string, body: unknown, token = t.admin) =>
  callRoute<Res>(handler, { method: "POST", url: `/api/students/${id}/x`, token, params: { id }, body });

async function stuDigest(levelId = "THCS"): Promise<StudentLite[]> {
  return (await getDoc<{ items: StudentLite[] }>("digests", `${levelId}__stu`))?.items ?? [];
}
async function audits(action: AuditLog["action"]): Promise<AuditLog[]> {
  return (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === action);
}

describe("students API", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", {
      classes: ["7A01", "7A02", { code: "7A03", active: false }],
      students: [
        { id: "S1", name: "Nguyễn Văn An", classCode: "7A01" },
        { id: "S2", name: "Trần Thị Bình", classCode: "7A01" },
      ],
    });
    await seedReference("THPT", { classes: ["10A1"], students: [{ id: "P1", name: "Lê Văn Phú", classCode: "10A1" }] });
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR" })).token;
    t.gvcn1 = (await createTestUser({ uid: "gvcn1", role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "7A01" }] })).token;
    t.gvcn2 = (await createTestUser({ uid: "gvcn2", role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "7A02" }] })).token;
  });

  it("creates a student with history, digest entry, version bump and audit", async () => {
    const v0 = await readVersion("THCS");
    const res = await create({ id: "S3", name: "Lê Minh Châu", dob: "2013-05-02", enrollType: "TRANSFER_IN", note: "Từ trường khác" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: "S3", classCode: "7A01", grade: 7, status: "ACTIVE", enrolledAt: today, levelId: "THCS" });
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0]).toMatchObject({ type: "TRANSFER_IN", toClass: "7A01", date: today, by: "admin@nshm.test" });
    expect((await stuDigest()).find((s) => s.id === "S3")).toMatchObject({ classCode: "7A01", status: "ACTIVE", dob: "2013-05-02" });
    expect(await readVersion("THCS")).toBe(v0 + 1);
    expect((await audits("ADD_STUDENT"))[0]).toMatchObject({ entityId: "S3", levelId: "THCS" });
  });

  it("rejects duplicate ids across the school (409), bad classes (400) and non-admins (403)", async () => {
    const dup = await create({ id: "S1", name: "Ai Đó" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe("Mã HS đã tồn tại (lớp 7A01)");
    const otherLevel = await create({ id: "P1", name: "Ai Đó" });
    expect(otherLevel.status).toBe(409);
    expect(otherLevel.body.error.message).toBe("Mã HS đã tồn tại (lớp 10A1)");
    const inactive = await create({ id: "S9", name: "Ai Đó", classCode: "7A03" });
    expect(inactive.status).toBe(400);
    const unknown = await create({ id: "S9", name: "Ai Đó", classCode: "9Z9" });
    expect(unknown.body.error.message).toContain("không có trong danh mục lớp");
    expect((await create({ id: "S9", name: "Ai Đó" }, t.editor)).status).toBe(403);
    expect(await getDoc("students", "S9")).toBeUndefined();
  });

  it("GET needs detail access to the current class", async () => {
    expect((await callRoute<Res>(studentGET, { url: "/api/students/S1", token: t.admin, params: { id: "S1" } })).status).toBe(200);
    expect((await callRoute<Res>(studentGET, { url: "/api/students/S1", token: t.gvcn1, params: { id: "S1" } })).status).toBe(200);
    expect((await callRoute<Res>(studentGET, { url: "/api/students/S1", token: t.gvcn2, params: { id: "S1" } })).status).toBe(403);
    expect((await callRoute<Res>(studentGET, { url: "/api/students/NOPE", token: t.admin, params: { id: "NOPE" } })).status).toBe(404);
  });

  it("PATCH updates personal info only (history UPDATE + audit), no-op is silent", async () => {
    const res = await callRoute<Res>(studentPATCH, { method: "PATCH", url: "/api/students/S2", token: t.admin, params: { id: "S2" }, body: { name: "Trần Thị Bình An", gender: "Nữ" } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Trần Thị Bình An", gender: "Nữ", classCode: "7A01" });
    expect(res.body.history.at(-1)).toMatchObject({ type: "UPDATE", note: "Cập nhật: Họ tên, Giới tính" });
    const audit = (await audits("UPDATE_STUDENT"))[0];
    expect(audit.detail?.changes).toMatchObject({ name: { before: "Trần Thị Bình", after: "Trần Thị Bình An" } });
    const v = await readVersion("THCS");
    const again = await callRoute<Res>(studentPATCH, { method: "PATCH", url: "/api/students/S2", token: t.admin, params: { id: "S2" }, body: { name: "Trần Thị Bình An" } });
    expect(again.status).toBe(200);
    expect(await readVersion("THCS")).toBe(v);
    expect(await audits("UPDATE_STUDENT")).toHaveLength(1);
  });

  it("AC-019: transfer changes the current class but past incidents keep their snapshot", async () => {
    const inc = await callRoute<Incident>(createIncidentPOST, {
      method: "POST",
      url: "/api/incidents",
      token: t.editor,
      body: { levelId: "THCS", date: yesterday, classCode: "7A01", errorCode: "L01", scope: "Cá nhân", studentIds: ["S1"] },
    });
    expect(inc.status).toBe(201);

    const moved = await post(transferPOST, "S1", { toClassCode: "7A02", effectiveDate: today, note: "Theo nguyện vọng" });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ classCode: "7A02", grade: 7, status: "ACTIVE" });
    expect(moved.body.history.at(-1)).toMatchObject({ type: "TRANSFER_CLASS", fromClass: "7A01", toClass: "7A02", date: today, note: "Theo nguyện vọng" });

    const stored = await getDoc<Incident>("incidents", inc.body.id);
    expect(stored?.classCode).toBe("7A01");
    expect(stored?.students).toEqual([{ id: "S1", name: "Nguyễn Văn An", classCode: "7A01" }]);
    expect((await stuDigest()).find((s) => s.id === "S1")?.classCode).toBe("7A02");
    expect((await audits("TRANSFER_STUDENT"))[0].detail).toMatchObject({ from: "7A01", to: "7A02" });

    // Detail access follows the CURRENT class.
    expect((await callRoute<Res>(studentGET, { url: "/api/students/S1", token: t.gvcn1, params: { id: "S1" } })).status).toBe(403);
    expect((await callRoute<Res>(studentGET, { url: "/api/students/S1", token: t.gvcn2, params: { id: "S1" } })).status).toBe(200);

    expect((await post(transferPOST, "S1", { toClassCode: "7A02", effectiveDate: today })).status).toBe(400);
    expect((await post(transferPOST, "S1", { toClassCode: "7A03", effectiveDate: today })).status).toBe(400);
  });

  it("withdraw → TRANSFER_OUT history; reinstate → ACTIVE again", async () => {
    const out = await post(withdrawPOST, "S2", { date: today, status: "TRANSFERRED_OUT", reason: "Chuyển trường Hà Nội" });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ status: "TRANSFERRED_OUT", leftAt: today, leftReason: "Chuyển trường Hà Nội" });
    expect(out.body.history.at(-1)).toMatchObject({ type: "TRANSFER_OUT", fromClass: "7A01" });
    expect((await stuDigest()).find((s) => s.id === "S2")?.status).toBe("TRANSFERRED_OUT");
    expect((await post(withdrawPOST, "S2", { date: today, reason: "Lần nữa" })).status).toBe(409);
    expect((await post(transferPOST, "S2", { toClassCode: "7A02", effectiveDate: today })).status).toBe(409);

    const back = await post(reinstatePOST, "S2", { classCode: "7A02", date: today, note: "Quay lại trường" });
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ status: "ACTIVE", classCode: "7A02" });
    expect(back.body.leftAt).toBeUndefined();
    expect(back.body.leftReason).toBeUndefined();
    expect(back.body.history.at(-1)).toMatchObject({ type: "REINSTATE", fromClass: "7A01", toClass: "7A02" });
    expect((await post(reinstatePOST, "S2", { classCode: "7A02", date: today })).status).toBe(409);
    expect(await audits("WITHDRAW_STUDENT")).toHaveLength(1);
    expect(await audits("REINSTATE_STUDENT")).toHaveLength(1);
    expect((await post(withdrawPOST, "S2", { date: today, reason: "x y" }, t.editor)).status).toBe(403);
  });
});
