/**
 * REQ_V2 §5.6 – early-warning thresholds (PUT /api/settings/:level/early-warning): persistence in the canonical config
 * and `__ref`, audit, no-op, validation, permissions; putConfig and the workbook config import keep them.
 * Also the new export kind "report" (Báo cáo tuần/tháng) of POST /api/exports/log.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { GET as datasetGET } from "@/app/api/dataset/route";
import { POST as exportLogPOST } from "@/app/api/exports/log/route";
import { POST as commitPOST } from "@/app/api/imports/workbook/commit/route";
import { POST as previewPOST } from "@/app/api/imports/workbook/preview/route";
import { PUT as configPUT } from "@/app/api/settings/[level]/config/route";
import { PUT as earlyPUT } from "@/app/api/settings/[level]/early-warning/route";
import type { ApiErrorBody, EarlyWarningPutInput, WorkbookCommitResult, WorkbookPayload, WorkbookPreview } from "../../contract";
import type { AuditLog, EarlyWarningConfig, LevelConfig, LevelDataset } from "../../types";
import { readVersion } from "../versions";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject } from "./helpers";

const PROJECT = "demo-test-v2-settings";
const t = { admin: "", adminTh: "", editor: "" };

const EW: EarlyWarningPutInput = {
  seriousMinPenalty: 8,
  seriousGroups: ["Nhóm 4", "Nhóm 3", "Nhóm 4"],
  prolongedWeeks: 4,
  risingBaselineWeeks: 3,
  risingMinPoints: 5,
  risingPct: 60,
};
const STORED: EarlyWarningConfig = {
  risingPct: 60,
  risingMinPoints: 5,
  risingBaselineWeeks: 3,
  prolongedWeeks: 4,
  seriousGroups: ["Nhóm 4", "Nhóm 3"],
  seriousMinPenalty: 8,
};
const put = (body: unknown, token = t.admin, level = "THCS") =>
  callRoute<LevelConfig & ApiErrorBody>(earlyPUT, { method: "PUT", url: `/api/settings/${level}/early-warning`, token, params: { level }, body });
const configAudits = async () => (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === "UPDATE_CONFIG" && a.levelId === "THCS");
const storedConfig = async () => (await getDoc<{ config: LevelConfig }>("levels", "THCS"))?.config;
const refConfig = async () => (await getDoc<{ config: LevelConfig }>("digests", "THCS__ref"))?.config;

describe("early-warning settings (REQ_V2 §5.6)", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", { classes: ["6A01"] });
    await seedReference("TH", { classes: ["1A1"] });
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
    t.adminTh = (await createTestUser({ uid: "adminTh", role: "ADMIN", levels: ["TH"] })).token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR" })).token;
  });

  it("saves the thresholds (normalised) in the canonical config, __ref and the dataset; audit UPDATE_CONFIG; version bump", async () => {
    const v0 = await readVersion("THCS");
    const res = await put(EW);
    expect(res.status).toBe(200);
    expect(res.body.earlyWarning).toEqual(STORED);
    expect(res.body).toMatchObject({ levelId: "THCS", updatedBy: "admin@nshm.test" });
    expect((await storedConfig())?.earlyWarning).toEqual(STORED);
    expect((await refConfig())?.earlyWarning).toEqual(STORED);
    expect(await readVersion("THCS")).toBe(v0 + 1);
    const ds = (await callRoute<LevelDataset>(datasetGET, { url: "/api/dataset?level=THCS", token: t.admin })).body;
    expect(ds.config.earlyWarning).toEqual(STORED);
    const logs = await configAudits();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ entity: "config", entityId: "THCS" });
    expect(logs[0].detail).toEqual({ changes: { earlyWarning: { before: null, after: STORED } } });
  });

  it("the same thresholds again write nothing", async () => {
    const v0 = await readVersion("THCS");
    const res = await put({ ...EW, seriousGroups: ["Nhóm 4", "Nhóm 3"] });
    expect(res.status).toBe(200);
    expect(res.body.earlyWarning).toEqual(STORED);
    expect(await readVersion("THCS")).toBe(v0);
    expect(await configAudits()).toHaveLength(1);
  });

  it("validates every field (400) and needs settings.manage on that level (403)", async () => {
    for (const bad of [
      { ...EW, risingPct: 5 },
      { ...EW, risingPct: 50.5 },
      { ...EW, prolongedWeeks: 1 },
      { ...EW, risingBaselineWeeks: 13 },
      { ...EW, seriousMinPenalty: -1 },
      { ...EW, seriousGroups: [""] },
      { ...EW, seriousGroups: Array.from({ length: 11 }, (_, i) => `Nhóm ${i}`) },
      { risingPct: 50 },
    ]) {
      const res = await put(bad);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION");
    }
    expect((await put(EW, t.editor)).status).toBe(403);
    expect((await put(EW, t.adminTh)).status).toBe(403);
    expect((await put(EW, t.admin, "XYZ")).status).toBe(400);
    expect((await storedConfig())?.earlyWarning).toEqual(STORED);
  });

  it("an empty serious-group list and a 0 penalty threshold are valid (rule disabled)", async () => {
    const res = await put({ ...EW, seriousGroups: [], seriousMinPenalty: 0 });
    expect(res.status).toBe(200);
    expect(res.body.earlyWarning).toMatchObject({ seriousGroups: [], seriousMinPenalty: 0 });
    expect((await put(EW)).body.earlyWarning).toEqual(STORED);
  });

  it("PUT config keeps earlyWarning (it merges over the stored config)", async () => {
    const res = await callRoute<LevelConfig>(configPUT, { method: "PUT", url: "/api/settings/THCS/config", token: t.admin, params: { level: "THCS" }, body: { baseScorePerWeek: 110 } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ baseScorePerWeek: 110, earlyWarning: STORED });
    expect((await storedConfig())?.earlyWarning).toEqual(STORED);
    expect((await refConfig())?.earlyWarning).toEqual(STORED);
  });

  it("PUT config with unchanged nested values writes nothing (stored maps come back with sorted keys)", async () => {
    const body = {
      rag: { yellow: 12, red: 30, approved: false, minConfidence: 0.8 },
      studentAlert: { perWeek: 3, repeatWindowWeeks: 4, repeatMin: 2 },
      actionSlaDays: { High: 3, Medium: 7, Low: 14 },
    };
    const putConfig = () => callRoute<LevelConfig>(configPUT, { method: "PUT", url: "/api/settings/THCS/config", token: t.admin, params: { level: "THCS" }, body });
    expect((await putConfig()).status).toBe(200);
    const v0 = await readVersion("THCS");
    const n0 = (await configAudits()).length;
    const again = await putConfig();
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ ...body, earlyWarning: STORED });
    expect(await readVersion("THCS")).toBe(v0);
    expect(await configAudits()).toHaveLength(n0);
  });

  it("the workbook config import keeps earlyWarning", async () => {
    const payload: WorkbookPayload = {
      levelId: "THCS",
      sourceFileName: "cau-hinh.xlsx",
      classes: [],
      catalog: [],
      config: { baseScorePerWeek: 95 },
      weeks: [],
      students: [],
      incidents: [],
      links: [],
      rewards: [],
    };
    const options = { config: true };
    const pv = await callRoute<WorkbookPreview>(previewPOST, { method: "POST", url: "/x", token: t.admin, body: { payload, options } });
    expect(pv.status).toBe(200);
    expect(pv.body.sections.config.willUpdate).toBe(1);
    const res = await callRoute<WorkbookCommitResult>(commitPOST, { method: "POST", url: "/x", token: t.admin, body: { payload, options, previewHash: pv.body.previewHash } });
    expect(res.status).toBe(200);
    expect(await storedConfig()).toMatchObject({ baseScorePerWeek: 95, earlyWarning: STORED });
    expect((await refConfig())?.earlyWarning).toEqual(STORED);
  });

  it('export log accepts kind "report" (Báo cáo tuần/tháng)', async () => {
    const res = await callRoute(exportLogPOST, {
      method: "POST",
      url: "/api/exports/log",
      token: t.admin,
      body: { levelId: "THCS", kind: "report", detail: { mode: "week", key: "2026-10-19", to: "bgh", rows: 12 } },
    });
    expect(res.status).toBe(200);
    const log = (await listDocs<AuditLog>("auditLogs")).find((a) => a.action === "EXPORT_EXCEL" && a.entityId === "report");
    expect(log?.detail).toMatchObject({ kind: "report", to: "bgh", rows: 12 });
  });
});
