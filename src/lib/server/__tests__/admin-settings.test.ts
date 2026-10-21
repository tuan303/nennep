import { beforeAll, describe, expect, it } from "vitest";
import { PUT as catalogPUT } from "@/app/api/settings/[level]/catalog/route";
import { PUT as classesPUT } from "@/app/api/settings/[level]/classes/route";
import { PUT as configPUT } from "@/app/api/settings/[level]/config/route";
import { PUT as weeksPUT } from "@/app/api/settings/[level]/weeks/route";
import type { ApiErrorBody, ListResponse } from "../../contract";
import { addDays } from "../../engine/dates";
import type { AuditLog, CatalogItem, ClassInfo, LevelConfig, SchoolWeek } from "../../types";
import { readVersion } from "../versions";
import { callRoute, createTestUser, getDoc, listDocs, seedReference, setupTestProject, TEST_CATALOG } from "./helpers";

const PROJECT = "demo-test-admin-settings";
let admin = "";
let editor = "";

type Ref = { catalog: CatalogItem[]; classes: ClassInfo[]; config: LevelConfig; weeks: SchoolWeek[] };
const refDigest = async () => (await getDoc<Ref>("digests", "THCS__ref")) as Ref;
const put = <T>(handler: typeof catalogPUT, part: string, body: unknown, token = admin, level = "THCS") =>
  callRoute<T & ApiErrorBody>(handler, { method: "PUT", url: `/api/settings/${level}/${part}`, token, params: { level }, body });
const audits = async (action: AuditLog["action"]) => (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === action);

describe("settings API", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    await seedReference("THCS", { classes: ["6A01", "6A02"] });
    admin = (await createTestUser({ uid: "admin", role: "ADMIN" })).token;
    editor = (await createTestUser({ uid: "editor", role: "EDITOR" })).token;
  });

  it("catalog: replace semantics – missing items become inactive, never deleted", async () => {
    const v0 = await readVersion("THCS");
    const [l01, l02] = TEST_CATALOG;
    const items = [{ ...l01, penalty: 3 }, l02, { code: "L06", category: "Vệ sinh", issue: "Xả rác", penalty: 2, unit: "/HS", is5S: true, active: true }];
    const res = await put<ListResponse<CatalogItem>>(catalogPUT, "catalog", { items });
    expect(res.status).toBe(200);
    const byCode = new Map(res.body.items.map((c) => [c.code, c]));
    expect(res.body.items).toHaveLength(6);
    expect(byCode.get("L01")?.penalty).toBe(3);
    expect(byCode.get("L03")?.active).toBe(false);
    expect(byCode.get("L04")?.active).toBe(false);
    expect(byCode.get("L05")?.active).toBe(false);
    expect(byCode.get("L06")).toMatchObject({ is5S: true, active: true });
    expect((await listDocs("levels/THCS/catalog")).length).toBe(6);
    expect((await refDigest()).catalog.find((c) => c.code === "L04")?.active).toBe(false);
    expect(await readVersion("THCS")).toBe(v0 + 1);
    expect((await audits("UPDATE_CATALOG"))[0].detail).toEqual({ added: ["L06"], updated: ["L01"], deactivated: ["L03", "L04"] });

    const same = await put<ListResponse<CatalogItem>>(catalogPUT, "catalog", { items });
    expect(same.status).toBe(200);
    expect(await audits("UPDATE_CATALOG")).toHaveLength(1);
    const dup = await put(catalogPUT, "catalog", { items: [l01, l01] });
    expect(dup.status).toBe(400);
    expect(dup.body.error.message).toBe("Mã lỗi bị trùng: L01.");
  });

  it("classes: replace semantics, grade must belong to the level", async () => {
    const res = await put<ListResponse<ClassInfo>>(classesPUT, "classes", {
      items: [
        { code: "6A01", grade: 6, homeroomTeacher: "Cô Lan", homeroomEmail: "Co.Lan@NSHM.test", active: true, order: 0 },
        { code: "7A01", grade: 7, active: true, order: 1 },
      ],
    });
    expect(res.status).toBe(200);
    const byCode = new Map(res.body.items.map((c) => [c.code, c]));
    expect(byCode.get("6A01")).toMatchObject({ homeroomEmail: "co.lan@nshm.test", levelId: "THCS" });
    expect(byCode.get("6A02")?.active).toBe(false);
    expect(byCode.get("7A01")?.active).toBe(true);
    const bad = await put(classesPUT, "classes", { items: [{ code: "10A1", grade: 10, active: true, order: 0 }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain("khối 10 không thuộc cấp Trung học cơ sở");
  });

  it("config: merge + validate, audit UPDATE_CONFIG with before/after", async () => {
    const res = await put<LevelConfig>(configPUT, "config", { rag: { yellow: 12, red: 30, approved: true, minConfidence: 0.75 }, baseScorePerWeek: 120 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ baseScorePerWeek: 120, rag: { yellow: 12, red: 30, approved: true }, levelId: "THCS", updatedBy: "admin@nshm.test" });
    expect((await refDigest()).config.rag.approved).toBe(true);
    const detail = (await audits("UPDATE_CONFIG"))[0].detail as { changes: Record<string, { before: unknown; after: unknown }> };
    expect(detail.changes.baseScorePerWeek).toEqual({ before: 100, after: 120 });
    expect(Object.keys(detail.changes).sort()).toEqual(["baseScorePerWeek", "rag"]);

    const tuesday = addDays(res.body.firstWeek, 1);
    const bad = await put(configPUT, "config", { firstWeek: tuesday });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain("Thứ Hai");
    const badRag = await put(configPUT, "config", { rag: { yellow: 30, red: 10, approved: true, minConfidence: 0.8 } });
    expect(badRag.status).toBe(400);
    const noop = await put<LevelConfig>(configPUT, "config", { baseScorePerWeek: 120 });
    expect(noop.status).toBe(200);
    expect(await audits("UPDATE_CONFIG")).toHaveLength(1);
  });

  it("weeks: replace, then regenerate keeps counted flags", async () => {
    const current = (await refDigest()).weeks;
    const holiday = current[2].weekStart;
    // Holiday flagged, and the last (empty) week dropped: allowed, it holds no record.
    const edited = current.slice(0, -1).map((w) => (w.weekStart === holiday ? { ...w, counted: false, note: "Nghỉ lễ" } : w));
    const res = await put<ListResponse<SchoolWeek>>(weeksPUT, "weeks", { items: edited });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(current.length - 1);
    expect(res.body.items.find((w) => w.weekStart === holiday)).toMatchObject({ counted: false, note: "Nghỉ lễ" });

    const regen = await put<ListResponse<SchoolWeek>>(weeksPUT, "weeks", { regenerate: true });
    expect(regen.status).toBe(200);
    expect(regen.body.items).toHaveLength(current.length);
    expect(regen.body.items.find((w) => w.weekStart === holiday)).toMatchObject({ counted: false, note: "Nghỉ lễ" });
    const audit = await audits("UPDATE_WEEKS");
    expect(audit).toHaveLength(2);
    expect(audit.find((a) => a.detail?.regenerated === true)?.detail).toMatchObject({ notCounted: [holiday], count: current.length });

    // Regenerating an unchanged calendar writes nothing (no audit, no version bump → no refetch in every tab).
    const v = await readVersion("THCS");
    expect((await put<ListResponse<SchoolWeek>>(weeksPUT, "weeks", { regenerate: true })).status).toBe(200);
    expect(await audits("UPDATE_WEEKS")).toHaveLength(2);
    expect(await readVersion("THCS")).toBe(v);

    const notMonday = await put(weeksPUT, "weeks", { items: [{ ...current[0], weekStart: addDays(current[0].weekStart, 2) }] });
    expect(notMonday.status).toBe(400);
  });

  it("rejects bad levels and non-admins", async () => {
    expect((await put(configPUT, "config", { baseScorePerWeek: 90 }, admin, "XYZ")).status).toBe(400);
    expect((await put(configPUT, "config", { baseScorePerWeek: 90 }, editor)).status).toBe(403);
  });
});
