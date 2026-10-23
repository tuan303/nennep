/**
 * "Công tác phối hợp tuần/tháng mới" (Báo cáo tuần/tháng, section 5): GET/PUT /api/report-plans – permissions per role
 * and level, period keys (Monday / yyyy-mm), canonical doc, rev chain + baseRev 409, clearing, audit UPDATE_REPORT_PLAN.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { GET as planGET, PUT as planPUT } from "@/app/api/report-plans/route";
import type { ApiErrorBody, ReportPlanPutInput, ReportPlanResponse } from "../../contract";
import { reportPlanId } from "../../firestore-paths";
import type { AuditLog, ReportPlan } from "../../types";
import { callRoute, createTestUser, getDoc, listDocs, setupTestProject } from "./helpers";

const PROJECT = "demo-test-report-plans";
const WEEK = "2026-10-19"; // Monday
const t = { admin: "", editor: "", viewer: "", gvcn: "", editorTh: "" };

const put = (token: string, b: ReportPlanPutInput | Record<string, unknown>) =>
  callRoute<ReportPlan & ApiErrorBody>(planPUT, { method: "PUT", url: "/api/report-plans", token, body: b });
const get = (token: string, query: string) => callRoute<ReportPlanResponse & ApiErrorBody>(planGET, { url: `/api/report-plans?${query}`, token });
const weekBody = (over: Partial<ReportPlanPutInput> = {}): ReportPlanPutInput =>
  ({ levelId: "THCS", mode: "week", key: WEEK, items: [{ content: "Tổng vệ sinh lớp học", owner: "GVCN khối 6", due: "Thứ Hai" }], ...over }) as ReportPlanPutInput;
const audits = async (entityId: string) =>
  (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === "UPDATE_REPORT_PLAN" && a.entityId === entityId);

describe("report plans API (Công tác phối hợp tuần/tháng mới)", () => {
  const weekId = reportPlanId("THCS", "week", WEEK);

  beforeAll(async () => {
    await setupTestProject(PROJECT);
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN", displayName: "Quản trị" })).token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR", displayName: "Nguyễn Văn A" })).token;
    t.editorTh = (await createTestUser({ uid: "editorTh", role: "EDITOR", levels: ["TH"] })).token;
    t.viewer = (await createTestUser({ uid: "viewer", role: "VIEWER" })).token;
    t.gvcn = (await createTestUser({ uid: "gvcn", role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }] })).token;
  });

  it("GET returns { plan: null } before anything was saved (viewers and GVCN included)", async () => {
    for (const token of [t.admin, t.viewer, t.gvcn]) {
      const res = await get(token, `level=THCS&mode=week&key=${WEEK}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ plan: null });
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("ADMIN saves a plan: canonical doc (trimmed, empty owner/due/note omitted), rev 1, author fields and audit", async () => {
    const res = await put(
      t.admin,
      weekBody({
        items: [
          { content: "  Tổng vệ sinh lớp học  ", owner: " GVCN khối 6 ", due: "Thứ Hai 27/10" },
          { content: "Chuẩn bị chào cờ", owner: "", due: "  " },
        ],
        note: "   ",
      }),
    );
    expect(res.status).toBe(200);
    const plan = res.body;
    expect(plan).toMatchObject({
      id: weekId,
      levelId: "THCS",
      mode: "week",
      key: WEEK,
      items: [{ content: "Tổng vệ sinh lớp học", owner: "GVCN khối 6", due: "Thứ Hai 27/10" }, { content: "Chuẩn bị chào cờ" }],
      rev: 1,
      updatedBy: "admin@nshm.test",
      updatedByName: "Quản trị",
    });
    expect(Object.keys(plan.items[1])).toEqual(["content"]);
    expect("note" in plan).toBe(false);
    expect(Date.parse(plan.updatedAt)).not.toBeNaN();
    const stored = await getDoc<ReportPlan>("reportPlans", weekId);
    expect(stored).toEqual(plan);

    const log = await audits(weekId);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ entity: "reportPlan", levelId: "THCS", email: "admin@nshm.test", role: "ADMIN", ip: "203.0.113.7" });
    expect(log[0].detail).toEqual({ mode: "week", key: WEEK, items: 2 });
  });

  it("EDITOR saves on top of the current rev (rev +1); VIEWER and GVCN can read it", async () => {
    const res = await put(t.editor, weekBody({ baseRev: 1, note: "Phối hợp với Đoàn trường." }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rev: 2, note: "Phối hợp với Đoàn trường.", updatedBy: "editor@nshm.test", updatedByName: "Nguyễn Văn A" });
    expect(res.body.items).toEqual([{ content: "Tổng vệ sinh lớp học", owner: "GVCN khối 6", due: "Thứ Hai" }]);
    expect(await audits(weekId)).toHaveLength(2);

    for (const token of [t.viewer, t.gvcn]) {
      const read = await get(token, `level=THCS&mode=week&key=${WEEK}`);
      expect(read.status).toBe(200);
      expect(read.body.plan).toEqual(res.body);
    }
  });

  it("VIEWER and GVCN cannot save (403, nothing written)", async () => {
    for (const token of [t.viewer, t.gvcn]) {
      const res = await put(token, weekBody({ baseRev: 2, items: [] }));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
    expect((await getDoc<ReportPlan>("reportPlans", weekId))?.rev).toBe(2);
    expect(await audits(weekId)).toHaveLength(2);
  });

  it("a level-limited user gets 403 for another level (read and write); a GVCN only reads levels of their classes", async () => {
    const write = await put(t.editorTh, weekBody({ baseRev: 2 }));
    expect(write.status).toBe(403);
    expect(write.body.error.message).toBe("Bạn không có quyền truy cập dữ liệu của cấp học này.");
    const read = await get(t.editorTh, `level=THCS&mode=week&key=${WEEK}`);
    expect(read.status).toBe(403);
    const own = await put(t.editorTh, weekBody({ levelId: "TH" }));
    expect(own.status).toBe(200);
    expect(own.body.id).toBe(reportPlanId("TH", "week", WEEK));
    expect((await get(t.gvcn, `level=TH&mode=week&key=${WEEK}`)).status).toBe(403);
    expect((await getDoc<ReportPlan>("reportPlans", weekId))?.rev).toBe(2);
  });

  it("a week key must be a Monday, a month key a real month (400 with Vietnamese messages, read and write)", async () => {
    const tuesday = await put(t.admin, weekBody({ key: "2026-10-20" }));
    expect(tuesday.status).toBe(400);
    expect(tuesday.body.error.code).toBe("VALIDATION");
    expect(tuesday.body.error.message).toBe("Tuần báo cáo phải bắt đầu từ Thứ Hai: ngày 20/10/2026 là Thứ Ba.");
    const badMonth = await put(t.admin, { levelId: "THCS", mode: "month", key: "2026-13", items: [] });
    expect(badMonth.status).toBe(400);
    expect(badMonth.body.error.message).toBe("Tháng không hợp lệ (yyyy-mm).");
    const shape = await put(t.admin, { levelId: "THCS", mode: "month", key: WEEK, items: [] });
    expect(shape.status).toBe(400);
    expect(shape.body.error.message).toContain("Tháng không hợp lệ");
    expect(await listDocs("reportPlans")).toHaveLength(2);

    expect((await get(t.admin, "level=THCS&mode=week&key=2026-10-25")).status).toBe(400);
    for (const q of ["level=THCS&mode=week", "level=THCS&key=2026-10", "level=XX&mode=month&key=2026-10", "mode=month&key=2026-10", "level=THCS&mode=year&key=2026"]) {
      const res = await get(t.admin, q);
      expect(res.status, q).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION");
    }
  });

  it("validates items: content required, at most 30", async () => {
    const empty = await put(t.admin, weekBody({ baseRev: 2, items: [{ content: "   " }] }));
    expect(empty.status).toBe(400);
    expect(empty.body.error.message).toContain("Nhập nội dung công việc");
    const tooMany = await put(t.admin, weekBody({ baseRev: 2, items: Array.from({ length: 31 }, (_, i) => ({ content: `Việc ${i + 1}` })) }));
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.error.message).toContain("Tối đa 30 công việc");
    expect((await getDoc<ReportPlan>("reportPlans", weekId))?.rev).toBe(2);
  });

  it("a month report has its own plan (key yyyy-mm), independent of the week plans", async () => {
    const monthId = reportPlanId("THCS", "month", "2026-10");
    expect((await get(t.admin, "level=THCS&mode=month&key=2026-10")).body).toEqual({ plan: null });
    const res = await put(t.editor, { levelId: "THCS", mode: "month", key: "2026-10", items: [{ content: "Sơ kết tháng 11", due: "30/11" }] });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: monthId, mode: "month", key: "2026-10", rev: 1, items: [{ content: "Sơ kết tháng 11", due: "30/11" }] });
    expect((await get(t.viewer, "level=THCS&mode=month&key=2026-10")).body.plan).toEqual(res.body);
    expect((await audits(monthId))[0].detail).toEqual({ mode: "month", key: "2026-10", items: 1 });
    expect((await getDoc<ReportPlan>("reportPlans", weekId))?.rev).toBe(2);
  });

  it("a stale or missing baseRev on an existing plan → 409 (nothing written)", async () => {
    for (const baseRev of [1, 0, undefined, 5]) {
      const res = await put(t.editor, weekBody({ baseRev, items: [{ content: "Bản cũ" }] }));
      expect(res.status, String(baseRev)).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
      expect(res.body.error.message).toBe(
        "Công tác phối hợp của kỳ báo cáo này vừa được người khác cập nhật. Vui lòng tải lại để xem bản mới nhất rồi nhập tiếp.",
      );
    }
    const stored = await getDoc<ReportPlan>("reportPlans", weekId);
    expect(stored?.rev).toBe(2);
    expect(stored?.items[0].content).toBe("Tổng vệ sinh lớp học");
    expect(await audits(weekId)).toHaveLength(2);
  });

  it("saving the same content writes nothing (same rev, no audit)", async () => {
    const res = await put(t.admin, weekBody({ baseRev: 2, note: " Phối hợp với Đoàn trường. " }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rev: 2, updatedBy: "editor@nshm.test" });
    expect(await audits(weekId)).toHaveLength(2);
  });

  it("an empty list without note clears the section but keeps the doc, so the rev chain continues", async () => {
    const cleared = await put(t.admin, weekBody({ baseRev: 2, items: [], note: "" }));
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ id: weekId, items: [], rev: 3, updatedBy: "admin@nshm.test" });
    expect("note" in cleared.body).toBe(false);
    const stored = await getDoc<ReportPlan>("reportPlans", weekId);
    expect(stored).toEqual(cleared.body);
    expect((await get(t.gvcn, `level=THCS&mode=week&key=${WEEK}`)).body.plan).toEqual(cleared.body);
    const log = await audits(weekId);
    expect(log).toHaveLength(3);
    expect(log.map((a) => a.detail?.items).sort()).toEqual([0, 1, 2]);

    expect((await put(t.admin, weekBody({ items: [{ content: "Viết lại" }] }))).status).toBe(409);
    const again = await put(t.editor, weekBody({ baseRev: 3, items: [{ content: "Viết lại" }] }));
    expect(again.status).toBe(200);
    expect(again.body.rev).toBe(4);
  });

  it("two editors saving the same revision at once: one wins, the other gets 409", async () => {
    const results = await Promise.all([
      put(t.admin, weekBody({ baseRev: 4, items: [{ content: "Bản của quản trị" }] })),
      put(t.editor, weekBody({ baseRev: 4, items: [{ content: "Bản của giáo viên" }] })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.status === 200)!.body;
    const stored = await getDoc<ReportPlan>("reportPlans", weekId);
    expect(stored).toEqual(winner);
    expect(stored?.rev).toBe(5);
    expect(await audits(weekId)).toHaveLength(5);
  });
});
