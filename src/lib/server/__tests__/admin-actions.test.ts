import { beforeAll, describe, expect, it } from "vitest";
import { PATCH as actionPATCH } from "@/app/api/actions/[id]/route";
import { GET as actionsGET, POST as actionsPOST } from "@/app/api/actions/route";
import type { ActionCreateInput, ApiErrorBody, ListResponse } from "../../contract";
import { addDays, compactDate, todayVN } from "../../engine/dates";
import type { ActionItem, AuditLog } from "../../types";
import { callRoute, createTestUser, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-admin-actions";
const today = todayVN();
const t = { admin: "", viewer: "", gvcn: "" };

type Res = ActionItem & ApiErrorBody;
const create = (body: Partial<ActionCreateInput>, token = t.admin) =>
  callRoute<Res>(actionsPOST, {
    method: "POST",
    url: "/api/actions",
    token,
    body: { levelId: "THCS", title: "Họp lớp 6A01", priority: "High", owner: "GVCN 6A01", deadline: addDays(today, 3), ...body },
  });
const patch = (id: string, body: unknown) => callRoute<Res>(actionPATCH, { method: "PATCH", url: `/api/actions/${id}`, token: t.admin, params: { id }, body });

describe("actions API", () => {
  let first: ActionItem;

  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", { classes: ["6A01"] });
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
    t.viewer = (await createTestUser({ uid: "viewer", role: "VIEWER" })).token;
    t.gvcn = (await createTestUser({ uid: "gvcn", role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }] })).token;
  });

  it("creates actions with HD codes, Open status and history", async () => {
    const res = await create({ scopeClass: "6A01", sourceWeek: addDays(today, -1) });
    expect(res.status).toBe(201);
    first = res.body;
    expect(first.code).toBe(`HD-${compactDate(today)}-001`);
    expect(first).toMatchObject({ status: "Open", scopeClass: "6A01", createdBy: "admin" });
    expect(first.history).toEqual([expect.objectContaining({ toStatus: "Open", by: "admin@nshm.test" })]);
    expect((await create({ title: "Kiểm tra vệ sinh", priority: "Low", deadline: addDays(today, 1) })).body.code).toBe(`HD-${compactDate(today)}-002`);
    expect((await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === "CREATE_ACTION")).toHaveLength(2);
    expect((await create({ scopeClass: "9Z9" })).status).toBe(400);
    expect((await create({}, t.viewer)).status).toBe(403);
  });

  it("AC-014: cannot move to Done without evidence", async () => {
    const res = await patch(first.id, { status: "Done" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Cần nhập minh chứng hoàn tất trước khi chuyển sang Hoàn thành");
    expect((await patch(first.id, { status: "Done", evidence: "   " })).status).toBe(400);

    const doing = await patch(first.id, { status: "Doing", note: "Đã liên hệ phụ huynh" });
    expect(doing.status).toBe(200);
    expect(doing.body.history.at(-1)).toMatchObject({ fromStatus: "Open", toStatus: "Doing", note: "Đã liên hệ phụ huynh" });

    const done = await patch(first.id, { status: "Done", evidence: "Biên bản họp lớp ngày 20/10" });
    expect(done.status).toBe(200);
    expect(done.body.closedAt).toBeTruthy();
    expect(done.body.history.at(-1)).toMatchObject({ fromStatus: "Doing", toStatus: "Done" });
    expect((await patch(first.id, { evidence: "" })).status).toBe(400);

    const reopened = await patch(first.id, { status: "Doing" });
    expect(reopened.body.closedAt).toBeUndefined();
    const audit = (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === "UPDATE_ACTION");
    expect(audit).toHaveLength(3);
  });

  it("lists by status then deadline for actions.view holders only", async () => {
    await create({ title: "Việc đã xong", deadline: addDays(today, -5) }).then((r) => patch(r.body.id, { status: "Done", evidence: "Đã xong" }));
    const res = await callRoute<ListResponse<ActionItem>>(actionsGET, { url: "/api/actions?level=THCS", token: t.viewer });
    expect(res.status).toBe(200);
    expect(res.body.items.map((a) => a.status)).toEqual(["Open", "Doing", "Done"]);
    expect((await callRoute(actionsGET, { url: "/api/actions?level=THCS", token: t.gvcn })).status).toBe(403);
    expect((await patch("THCS_HD-00000000-999", { title: "Không có" })).status).toBe(404);
  });
});
