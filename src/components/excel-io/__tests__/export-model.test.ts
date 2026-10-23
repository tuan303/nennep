import { describe, expect, it } from "vitest";
import type { Workbook } from "exceljs";
import { FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { makeClass, makeDataset, makeIncident } from "@/lib/engine/__tests__/builders";
import { buildRanking, LEVEL_RANKING_GROUP } from "@/lib/engine/ranking";
import { periodOptions } from "@/lib/engine/period";
import { exportLevelWorkbook, loadExcelJS, parseNshmWorkbook } from "@/lib/excel";
import { buildHtmlSnapshot } from "@/lib/excel/html-snapshot";
import type { Period, StudentRef } from "@/lib/types";
import { keyForMode, rankingExportRows, snapshotFileName, snapshotInput, studentExportRows, workbookContents, workbookFileName } from "../lib/export-model";
import { defaultOptions, payloadCounts } from "../lib/import-model";
import { TEMPLATE_SHEETS } from "../lib/template-spec";

const ds = makeFixtureDataset();
const october: Period = { mode: "month", key: "2026-10" };

async function openWorkbook(bytes: Uint8Array): Promise<Workbook> {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return wb;
}

const stu = (n: number): StudentRef[] => Array.from({ length: n }, (_, i) => ({ id: `S${i}`, name: `HS ${i}`, classCode: "x" }));
const WEEK: Period = { mode: "week", key: "2026-10-19" };

/** THPT week of 19/10: 10A1, 11A1 = 100 (clean, same rank) · 12A1 = 96 (1 lượt) · 10A2 = 96 (2 lượt) · 11A2 = 90. */
function thptDataset() {
  return makeDataset({
    levelId: "THPT",
    classes: [makeClass("10A1", 10), makeClass("10A2", 10), makeClass("11A1", 11), makeClass("11A2", 11), makeClass("12A1", 12)],
    incidents: [
      makeIncident({ date: "2026-10-20", classCode: "12A1", grade: 12, penalty: 4, points: 4, unit: "/lần" }),
      makeIncident({ date: "2026-10-20", classCode: "10A2", grade: 10, penalty: 2, students: stu(2) }),
      makeIncident({ date: "2026-10-21", classCode: "11A2", grade: 11, penalty: 5, students: stu(2) }),
    ],
  });
}

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
    const wb = await openWorkbook(bytes);
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

describe("ranking per khối vs THPT level-wide ranking", () => {
  it("THCS: Xếp hạng sheet grouped by khối, no Lượt vi phạm column, no top 3 line", async () => {
    const rows = rankingExportRows(ds, october, FIXTURE_TODAY);
    const wb = await openWorkbook(await exportLevelWorkbook(ds, { today: FIXTURE_TODAY, levelName: "Trung học cơ sở", rankingRows: rows, periodLabel: "Tháng 10/2026" }));
    const ws = wb.getWorksheet("Xếp hạng")!;
    const headers = (ws.getRow(4).values as unknown[]).slice(1);
    expect(headers).not.toContain("Lượt vi phạm");
    expect(String(ws.getCell("A2").value)).toContain("Xếp hạng trong từng khối; Top 90% tính theo số lớp của khối.");
    expect(ws.getCell("A3").value).toBeNull();
    const grades = rows.map((_, i) => Number(ws.getCell(5 + i, 1).value));
    expect(grades).toEqual([...grades].sort((a, b) => a - b));
  });

  it("THPT: one level-wide table, rows keep their khối, ties broken by lượt vi phạm, top 3 named", async () => {
    const thpt = thptDataset();
    const ranking = buildRanking(thpt, WEEK, "2026-10-21");
    expect(ranking.grades.map((g) => g.grade)).toEqual([LEVEL_RANKING_GROUP]);

    const rows = rankingExportRows(thpt, WEEK, "2026-10-21");
    expect(rows.map((r) => [r.classCode, r.grade, r.score, r.violationTurns, r.rank])).toEqual([
      ["10A1", 10, 100, 0, 1],
      ["11A1", 11, 100, 0, 1],
      ["12A1", 12, 96, 1, 3],
      ["10A2", 10, 96, 2, 4],
      ["11A2", 11, 90, 2, 5],
    ]);

    const bytes = await exportLevelWorkbook(thpt, { today: "2026-10-21", levelName: "Trung học phổ thông", rankingRows: [...rows].reverse(), periodLabel: "Tuần 19/10" });
    const wb = await openWorkbook(bytes);
    const ws = wb.getWorksheet("Xếp hạng")!;
    const headers = (ws.getRow(4).values as unknown[]).slice(1);
    expect(headers.indexOf("Lượt vi phạm")).toBe(headers.indexOf("Điểm thi đua") + 1);
    expect(headers.indexOf("Hạng")).toBe(headers.indexOf("Lượt vi phạm") + 1);
    const col = (h: string) => headers.indexOf(h) + 1;
    // Sorted by rank across khối (not grouped by khối).
    expect([5, 6, 7, 8, 9].map((r) => ws.getCell(r, col("Lớp")).value)).toEqual(["10A1", "11A1", "12A1", "10A2", "11A2"]);
    expect([5, 6, 7, 8, 9].map((r) => ws.getCell(r, col("Khối")).value)).toEqual([10, 11, 12, 10, 11]);
    expect([5, 6, 7, 8, 9].map((r) => ws.getCell(r, col("Lượt vi phạm")).value)).toEqual([0, 0, 1, 2, 2]);
    expect([5, 6, 7, 8, 9].map((r) => ws.getCell(r, col("Hạng")).value)).toEqual([1, 1, 3, 4, 5]);
    expect(String(ws.getCell("A2").value)).toContain("Xếp hạng chung toàn cấp (không chia khối)");
    expect(String(ws.getCell("A2").value)).toContain("lớp ít lượt vi phạm hơn xếp trên");
    expect(String(ws.getCell("A2").value)).toContain("Top 90% tính theo số lớp toàn cấp");
    expect(ws.getCell("A3").value).toBe("★ Top 3 toàn cấp: 10A1 (hạng 1), 11A1 (hạng 1), 12A1 (hạng 3).");
    // The report sheet does not disturb the re-import of the data sheets.
    const { payload } = await parseNshmWorkbook(bytes, "NSHM_NenNep_THPT_2026-10-21.xlsx");
    expect(payload.levelId).toBe("THPT");
    expect(payloadCounts(payload).incidents).toBe(thpt.incidents.length);
  });

  it("THPT snapshot: one Toàn cấp card with Lượt vi phạm and the top 3", () => {
    const thpt = thptDataset();
    const input = snapshotInput(thpt, WEEK, "2026-10-21", "2026-10-21T03:00:00.000Z");
    expect(input.rankingByGrade.map((g) => g.grade)).toEqual([LEVEL_RANKING_GROUP]);
    expect(input.rankingLayout).toMatchObject({ scope: "level", tieBreak: "violationTurns", topCount: 3 });
    expect(input.rankingByGrade[0].rows.map((r) => r.violationTurns)).toEqual([0, 0, 1, 2, 2]);
    const html = buildHtmlSnapshot(input);
    expect(html).toContain("Xếp hạng thi đua toàn cấp");
    expect(html).toContain("<h3>Toàn cấp<small>5 lớp</small></h3>");
    expect(html).not.toContain("Khối 0");
    expect(html).toContain("<th class=\"num\">Lượt vi phạm</th>");
    expect(html).toContain("Top 3 toàn cấp: 10A1 (hạng 1), 11A1 (hạng 1), 12A1 (hạng 3).");

    const thcs = buildHtmlSnapshot(snapshotInput(ds, october, FIXTURE_TODAY, "2026-10-21T03:00:00.000Z"));
    expect(thcs).toContain("Xếp hạng thi đua theo khối");
    expect(thcs).toContain("<h3>Khối 6<small>");
    expect(thcs).not.toContain("Lượt vi phạm");
    expect(thcs).not.toContain("Top 3 toàn cấp");
  });
});
