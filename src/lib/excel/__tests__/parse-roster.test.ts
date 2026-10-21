import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { RosterRowSchema } from "../../contract";
import { ExcelParseError } from "../loader";
import { parseRosterSheet } from "../parse-roster";
import { hasSeed, readSeed } from "./fixtures";
import { buildLegacyWorkbook, LEGACY_EXPECTED, LEGACY_PEOPLE } from "./legacy-workbook";

describe("parseRosterSheet – legacy DS Học sinh sheets (synthetic)", () => {
  it.each(["TH", "THCS", "THPT"] as const)("%s → reads “DS Học sinh” (not the report sheets)", async (level) => {
    const res = await parseRosterSheet(await buildLegacyWorkbook(level), `${level}.xlsx`);
    expect(res.sheetName).toBe("DS Học sinh");
    expect(res.rows).toHaveLength(LEGACY_EXPECTED[level].students);
    expect(res.warnings).toEqual([]);
    expect(res.rows.every((r) => RosterRowSchema.safeParse(r).success)).toBe(true);
    expect(res.rows.every((r) => typeof r.id === "string" && r.id.length > 0 && r.classCode.length > 0)).toBe(true);
  });

  it("reads dates of birth and numeric ids (TH) and status texts (THCS)", async () => {
    const th = await parseRosterSheet(await buildLegacyWorkbook("TH"), "TH.xlsx");
    expect(th.rows[0]).toEqual({ rowNumber: 5, ...LEGACY_PEOPLE.th.firstStudent });
    const thcs = await parseRosterSheet(await buildLegacyWorkbook("THCS"), "THCS.xlsx");
    const statuses = new Set(thcs.rows.map((r) => r.statusText));
    expect(statuses).toEqual(new Set(["Đang học", "Chuyển đến HKI", "Chuyển lớp nội bộ"]));
  });
});

/** Real rosters (git-ignored data/seed, local machines only): counts and shapes, never concrete people. */
describe.skipIf(!hasSeed())("parseRosterSheet – real seed rosters (counts and shapes only)", () => {
  it.each([
    ["TH", 2123],
    ["THCS", 1647],
    ["THPT", 669],
  ] as const)("%s → %i students", async (level, count) => {
    const res = await parseRosterSheet(readSeed(level), `${level}.xlsx`);
    expect(res.sheetName).toBe("DS Học sinh");
    expect(res.rows).toHaveLength(count);
    expect(res.warnings).toEqual([]);
    expect(res.rows.every((r) => RosterRowSchema.safeParse(r).success)).toBe(true);
    expect(res.rows.every((r) => typeof r.id === "string" && /^\d+$/.test(r.id) && r.classCode.length > 0)).toBe(true);
  });

  it("dates of birth (TH) and status texts (THCS)", async () => {
    const th = await parseRosterSheet(readSeed("TH"), "TH.xlsx");
    expect(th.rows.filter((r) => r.dob).length).toBeGreaterThan(th.rows.length * 0.9);
    expect(th.rows.every((r) => r.dob === undefined || /^\d{4}-\d{2}-\d{2}$/.test(r.dob))).toBe(true);
    const thcs = await parseRosterSheet(readSeed("THCS"), "THCS.xlsx");
    expect(new Set(thcs.rows.map((r) => r.statusText))).toEqual(new Set(["Đang học", "Chuyển đến HKI", "Chuyển lớp nội bộ"]));
  });
});

async function buildRosterFile(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Hướng dẫn").getCell("A1").value = "Không có dữ liệu ở đây";
  const ws = wb.addWorksheet("Lớp 6");
  ws.getCell("A1").value = "DANH SÁCH HỌC SINH NĂM HỌC 2026–2027";
  ws.getRow(2).values = ["STT", "Mã học sinh", "Họ tên", "Ngày sinh", "Giới tính", "Lớp", "Tình trạng"];
  ws.getRow(3).values = [1, 99150001, "Học Sinh Mẫu An", "05/09/2014", "Nam", "6A01", "Đang học"];
  ws.getRow(4).values = [2, "99150002", { richText: [{ text: "Học Sinh " }, { text: "Mẫu Bình" }] }, new Date(Date.UTC(2014, 0, 2)), "Nữ", " 6A02 ", ""];
  ws.getRow(5).values = [3, "", "Không mã", "01/01/2014", "Nam", "6A01", ""];
  ws.getRow(6).values = [4, 99150001, "Trùng mã", "01/01/2014", "Nam", "6A01", ""];
  ws.getRow(7).values = [5, "99150003", "Học Sinh Mẫu Chi", "31/02/2014", "Nữ", "6A03", ""];
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("parseRosterSheet – flexible headers", () => {
  it("finds the header row anywhere in rows 1–10 and maps aliases", async () => {
    const res = await parseRosterSheet(await buildRosterFile(), "ds.xlsx");
    expect(res.sheetName).toBe("Lớp 6");
    expect(res.rows).toEqual([
      { rowNumber: 3, id: "99150001", name: "Học Sinh Mẫu An", dob: "2014-09-05", gender: "Nam", classCode: "6A01", statusText: "Đang học" },
      { rowNumber: 4, id: "99150002", name: "Học Sinh Mẫu Bình", dob: "2014-01-02", gender: "Nữ", classCode: "6A02" },
      { rowNumber: 7, id: "99150003", name: "Học Sinh Mẫu Chi", gender: "Nữ", classCode: "6A03" },
    ]);
    expect(res.warnings).toHaveLength(3); // missing id, duplicate id, invalid date
    expect(res.warnings.join("\n")).toMatch(/Thiếu Mã HS/);
    expect(res.warnings.join("\n")).toMatch(/trùng với dòng 3/);
  });

  it("can be forced to a sheet and fails clearly without the required columns", async () => {
    const bytes = await buildRosterFile();
    await expect(parseRosterSheet(bytes, "ds.xlsx", { sheetName: "Hướng dẫn" })).rejects.toBeInstanceOf(ExcelParseError);
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("A").getRow(1).values = ["Tên", "Tuổi"];
    await expect(parseRosterSheet(new Uint8Array(await wb.xlsx.writeBuffer()), "x.xlsx")).rejects.toThrow(/Mã HS, Họ và tên, Lớp/);
  });
});
