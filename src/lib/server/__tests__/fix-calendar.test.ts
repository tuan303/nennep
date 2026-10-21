/**
 * Regression tests RULES-1 / INTEGRITY-7: records dated outside the school-week calendar used to be stored but were
 * invisible in the dataset, rankings and exports (rewards on the same dates still counted).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { GET as datasetGET } from "@/app/api/dataset/route";
import { POST as previewPOST } from "@/app/api/imports/workbook/preview/route";
import { DELETE as incDELETE, PATCH as incPATCH } from "@/app/api/incidents/[id]/route";
import { POST as incRestorePOST } from "@/app/api/incidents/[id]/restore/route";
import { POST as incidentPOST } from "@/app/api/incidents/route";
import { POST as rewardPOST } from "@/app/api/rewards/route";
import { PUT as configPUT } from "@/app/api/settings/[level]/config/route";
import { PUT as weeksPUT } from "@/app/api/settings/[level]/weeks/route";
import type { ApiErrorBody, ListResponse, WorkbookPayload, WorkbookPreview } from "../../contract";
import { addDays, formatDateVN, generateWeeks, mondayOf, todayVN } from "../../engine/dates";
import type { AuditLog, Incident, LevelDataset, Reward, SchoolWeek } from "../../types";
import { saveReferenceParts } from "../reference";
import { callRoute, createTestUser, listDocs, seedReference, setupTestProject, TEST_CATALOG, testConfig } from "./helpers";

const PROJECT = "demo-test-fix-calendar";
const today = todayVN();
let admin = "";

const incident = (date: string, over: Record<string, unknown> = {}) =>
  callRoute<Incident & ApiErrorBody>(incidentPOST, {
    method: "POST",
    url: "/api/incidents",
    token: admin,
    body: { levelId: "THCS", date, classCode: "7A01", errorCode: "L02", scope: "Tập thể", ...over },
  });
const reward = (date: string, levelId = "THCS", classCode = "7A01") =>
  callRoute<Reward & ApiErrorBody>(rewardPOST, { method: "POST", url: "/api/rewards", token: admin, body: { levelId, date, classCode, points: 4, reason: "Lớp sạch đẹp" } });
const dataset = async (level = "THCS") => (await callRoute<LevelDataset>(datasetGET, { url: `/api/dataset?level=${level}`, token: admin })).body;

describe("calendar rules", () => {
  let weeks: SchoolWeek[] = [];

  beforeAll(async () => {
    await setupTestProject(PROJECT);
    const ref = await seedReference("THCS", { classes: ["7A01", "7A02"] });
    weeks = ref.weeks;
    admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
  });

  it("rejects incidents and rewards dated before the first calendar week (they would be invisible)", async () => {
    const before = addDays(weeks[0].weekStart, -5);
    const inc = await incident(before);
    expect(inc.status).toBe(400);
    expect(inc.body.error.message).toContain(`Ngày ${formatDateVN(before)} không thuộc lịch tuần của năm học`);
    const rew = await reward(before);
    expect(rew.status).toBe(400);
    expect(rew.body.error.message).toContain("không thuộc lịch tuần");
    expect(await listDocs("incidents")).toHaveLength(0);
    expect(await listDocs("rewards")).toHaveLength(0);
  });

  it("an edit may not move a record out of the calendar, but other fields of an unchanged date stay editable", async () => {
    const created = await incident(addDays(today, -1));
    expect(created.status).toBe(201);
    const moved = await callRoute<ApiErrorBody>(incPATCH, {
      method: "PATCH",
      url: `/api/incidents/${created.body.id}`,
      token: admin,
      params: { id: created.body.id },
      body: { date: addDays(weeks[0].weekStart, -400) },
    });
    expect(moved.status).toBe(400);
    expect(moved.body.error.message).toContain("không thuộc lịch tuần");
    const detail = await callRoute<Incident>(incPATCH, {
      method: "PATCH",
      url: `/api/incidents/${created.body.id}`,
      token: admin,
      params: { id: created.body.id },
      body: { detail: "Bổ sung" },
    });
    expect(detail.status).toBe(200);
  });

  it("removing a calendar week that holds records needs an explicit confirmation; restore of such a record is refused", async () => {
    const week = weeks[1].weekStart;
    const inc = await incident(addDays(week, 2));
    expect(inc.status).toBe(201);
    const rew = await reward(addDays(week, 1));
    expect(rew.status).toBe(201);
    const without = weeks.filter((w) => w.weekStart !== week);

    const refused = await callRoute<ApiErrorBody>(weeksPUT, { method: "PUT", url: "/api/settings/THCS/weeks", token: admin, params: { level: "THCS" }, body: { items: without } });
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toContain("1 sự việc và 1 điểm thưởng");
    expect(refused.body.error.details).toMatchObject({ weeks: [week], incidents: [inc.body.code], rewards: [rew.body.code] });
    expect((await dataset()).weeks).toHaveLength(weeks.length);

    const del = await callRoute(incDELETE, { method: "DELETE", url: `/api/incidents/${inc.body.id}`, token: admin, params: { id: inc.body.id }, body: { reason: "Ghi nhầm" } });
    expect(del.status).toBe(200);

    const confirmed = await callRoute<ListResponse<SchoolWeek>>(weeksPUT, {
      method: "PUT",
      url: "/api/settings/THCS/weeks?allowHidingRecords=1",
      token: admin,
      params: { level: "THCS" },
      body: { items: without },
    });
    expect(confirmed.status).toBe(200);
    const audit = (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === "UPDATE_WEEKS").at(-1);
    expect(audit?.detail).toMatchObject({ removed: 1, hiddenRecords: { weeks: [week], incidents: 0, rewards: 1 } });
    const ds = await dataset();
    expect(ds.rewards.some((r) => r.id === rew.body.id)).toBe(false);

    const restore = await callRoute<ApiErrorBody>(incRestorePOST, { method: "POST", url: `/api/incidents/${inc.body.id}/restore`, token: admin, params: { id: inc.body.id } });
    expect(restore.status).toBe(409);
    expect(restore.body.error.message).toContain("không còn trong lịch tuần");
  });

  it("a config change that moves a generated calendar is checked the same way", async () => {
    // TH: config + classes + catalog stored, weeks NOT stored → the calendar is generated from the config.
    const config = testConfig("TH");
    await saveReferenceParts("TH", { config, classes: [{ code: "1A1", levelId: "TH", grade: 1, active: true, order: 0 }], catalog: TEST_CATALOG });
    const first = generateWeeks(config.firstWeek, config.semesters)[0].weekStart;
    const rew = await reward(addDays(first, 1), "TH", "1A1");
    expect(rew.status).toBe(201);
    const later = addDays(first, 7);
    const refused = await callRoute<ApiErrorBody>(configPUT, { method: "PUT", url: "/api/settings/TH/config", token: admin, params: { level: "TH" }, body: { firstWeek: later } });
    expect(refused.status).toBe(409);
    const ok = await callRoute(configPUT, { method: "PUT", url: "/api/settings/TH/config?allowHidingRecords=1", token: admin, params: { level: "TH" }, body: { firstWeek: later } });
    expect(ok.status).toBe(200);
    expect((await dataset("TH")).weeks[0].weekStart).toBe(later);
  });

  it("workbook rows dated outside the calendar are ERROR rows (never imported)", async () => {
    const outside = addDays(weeks[0].weekStart, -3);
    const payload: WorkbookPayload = {
      levelId: "THCS",
      sourceFileName: "lich.xlsx",
      classes: [],
      catalog: [],
      weeks: [],
      students: [],
      incidents: [{ rowNumber: 5, code: `NN-${outside.replaceAll("-", "")}-0001`, date: outside, classCode: "7A01", errorCode: "L02", scope: "Tập thể" }],
      links: [],
      rewards: [{ rowNumber: 5, code: "", date: outside, classCode: "7A01", reason: "Thưởng", points: 3 }],
    };
    const res = await callRoute<WorkbookPreview>(previewPOST, { method: "POST", url: "/api/imports/workbook/preview", token: admin, body: { payload } });
    expect(res.status).toBe(200);
    expect(res.body.sections.incidents).toMatchObject({ error: 1, willCreate: 0 });
    expect(res.body.sections.rewards).toMatchObject({ error: 1, willCreate: 0 });
    expect(res.body.issues.find((i) => i.sheet === "Nhập liệu")?.messages[0]).toContain("không thuộc lịch tuần");
    expect(mondayOf(outside) < weeks[0].weekStart).toBe(true);
  });
});
