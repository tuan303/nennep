import { describe, expect, it } from "vitest";
import { FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { buildRanking } from "@/lib/engine/ranking";
import { periodOptions } from "@/lib/engine/period";
import { exportLevelWorkbook, loadExcelJS, parseNshmWorkbook } from "@/lib/excel";
import { buildHtmlSnapshot } from "@/lib/excel/html-snapshot";
import type { Period } from "@/lib/types";
import { keyForMode, rankingExportRows, snapshotFileName, snapshotInput, studentExportRows, workbookContents, workbookFileName } from "../lib/export-model";
import { defaultOptions, payloadCounts } from "../lib/import-model";
import { TEMPLATE_SHEETS } from "../lib/template-spec";

const ds = makeFixtureDataset();
const october: Period = { mode: "month", key: "2026-10" };

describe("export rows", () => {
  it("flattens the engine ranking", () => {
    const rows = rankingExportRows(ds, october, FIXTURE_TODAY);
    const ranking = buildRanking(ds, october, FIXTURE_TODAY);
    expect(rows).toHaveLength(ranking.grades.reduce((n, g) => n + g.rows.length, 0));
    const r6a03 = rows.find((r) => r.classCode === "6A03")!;
    expect(r6a03.rag).toBe("RED");
    expect(r6a03.homeroomTeacher).toBe("Lê Văn Hùng");
  });

  it("builds student report rows with error breakdown text", () => {
    const rows = studentExportRows(ds, october, FIXTURE_TODAY);
    const khoi = rows.find((r) => r.id === FIXTURE_STUDENT_IDS.khoi)!;
    expect(khoi.alert).toBe("WEEKLY_RED");
    expect(khoi.errors).toMatch(/\(\d+\)/);
  });

  it("picks the current option when the period mode changes", () => {
    const lists = periodOptions(ds.weeks, ds.config.semesters, FIXTURE_TODAY);
    expect(keyForMode(lists, "week")).toBe("2026-10-19");
    expect(keyForMode(lists, "month")).toBe("2026-10");
    expect(keyForMode(lists, "semester")).toBe("HK1");
    expect(keyForMode(lists, "all")).toBeUndefined();
    const noCurrent = { ...lists, weeks: lists.weeks.map((w) => ({ ...w, isCurrent: false })) };
    expect(keyForMode(noCurrent, "week")).toBe("2026-10-19");
  });

  it("names files by level and date", () => {
    expect(workbookFileName("THCS", FIXTURE_TODAY)).toBe("NSHM_NenNep_THCS_2026-10-21.xlsx");
    expect(snapshotFileName("TH", FIXTURE_TODAY)).toBe("NSHM_NenNep_TH_BanChup_2026-10-21.html");
    expect(workbookContents(ds)[0]).toEqual({ label: "sự việc", value: ds.incidents.length });
  });
});

describe("HTML snapshot input", () => {
  it("formats KPIs and keeps the ranking per grade", () => {
    const input = snapshotInput(ds, october, FIXTURE_TODAY, "2026-10-21T03:00:00.000Z");
    expect(input.periodLabel).toBe("Tháng 10/2026");
    expect(input.kpis.map((k) => k.label)).toEqual(["Sự việc", "Học sinh liên quan", "Điểm trừ", "Điểm thưởng", "Lớp phát sinh", "Độ tin cậy dữ liệu"]);
    expect(input.kpis[4].value).toMatch(/^\d+\/8$/);
    expect(input.rankingByGrade.map((g) => g.grade)).toEqual([6, 7]);
    expect(input.topClasses[0].classCode).toBe("6A03");
    expect(input.topIssues.length).toBeGreaterThan(0);
    const html = buildHtmlSnapshot(input);
    expect(html).toContain("6A03");
    expect(html).toContain("Tháng 10/2026");
    expect(html).not.toMatch(/<script/i);
  });
});

describe("workbook template", () => {
  it("matches the sheets and headers of a real export and round-trips through the parser", async () => {
    const bytes = await exportLevelWorkbook(ds, { today: FIXTURE_TODAY, levelName: "Trung học cơ sở" });
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    for (const sheet of TEMPLATE_SHEETS) {
      const ws = wb.getWorksheet(sheet.name);
      expect(ws, sheet.name).toBeDefined();
      let headers: string[] = [];
      for (let r = 1; r <= 8 && headers.length === 0; r++) {
        const values = (ws!.getRow(r).values as unknown[]).map((v) => (typeof v === "string" ? v.trim() : ""));
        if (values.includes(sheet.columns[0])) headers = values;
      }
      for (const col of sheet.columns) expect(headers, `${sheet.name} › ${col}`).toContain(col);
    }

    const { payload } = await parseNshmWorkbook(bytes, "NSHM_NenNep_THCS_2026-10-21.xlsx");
    expect(payload.levelId).toBe("THCS");
    const counts = payloadCounts(payload);
    expect(counts.incidents).toBe(ds.incidents.length);
    expect(counts.rewards).toBe(ds.rewards.length);
    expect(counts.classes).toBe(ds.classes.length);
    expect(defaultOptions(payload)).toMatchObject({ incidents: true, rewards: true, config: false });
  });
});
