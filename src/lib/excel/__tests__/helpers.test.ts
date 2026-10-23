import { describe, expect, it } from "vitest";
import { asIsoDate, asMonth, asNumber, asText, cellScalar, serialToIso } from "../cells";
import { catalogChoiceText, leadingClassesNote, rankingRuleNote, top90Label, topGroupLabel } from "../format";
import { levelFromFileName, levelFromGrades, levelFromTitle } from "../level-detect";
import { headerKey } from "../normalize";
import { buildCatalogIndex, extractErrorCode, resolveErrorCode } from "../parse-incidents";
import { splitStudentChoice } from "../parse-links";
import { parseUnit } from "../parse-reference";
import { makeClassResolver } from "../roster-rows";
import { rankingColumns, RANKING_COLUMNS, sortRanking } from "../report-columns";
import { matchColumns } from "../sheet-reader";

describe("cell values", () => {
  it("unwraps formulas, shared formulas, rich text, hyperlinks and errors", () => {
    expect(cellScalar({ formula: "A1", result: "NN-1" })).toBe("NN-1");
    expect(cellScalar({ sharedFormula: "L5", result: 2 })).toBe(2);
    expect(cellScalar({ sharedFormula: "L5" })).toBeNull();
    expect(cellScalar({ formula: "X", result: { error: "#N/A" } })).toBeNull();
    expect(cellScalar({ richText: [{ text: "Trần " }, { text: "Bình" }] })).toBe("Trần Bình");
    expect(cellScalar({ text: "ảnh", hyperlink: "https://x.vn/a.jpg" })).toBe("ảnh");
    expect(cellScalar({ error: "#REF!" })).toBeNull();
    const d = new Date(Date.UTC(2026, 8, 23));
    expect(cellScalar({ formula: "B5", result: d })).toBe(d);
  });

  it("converts text, numbers and dates", () => {
    expect(asText(99050001)).toBe("99050001");
    expect(asText("  9B04  ")).toBe("9B04");
    expect(asNumber("2,5")).toBe(2.5);
    expect(asNumber(" 10 ")).toBe(10);
    expect(asNumber("hai")).toBeUndefined();
    expect(asIsoDate(new Date(Date.UTC(2026, 8, 23)))).toBe("2026-09-23");
    expect(asIsoDate("05/09/2015")).toBe("2015-09-05");
    expect(asIsoDate("2026-10-02T00:00:00Z")).toBe("2026-10-02");
    expect(asIsoDate("31/02/2026")).toBe("");
    expect(serialToIso(46251)).toBe("2026-08-17"); // value cached in the TH Dashboard for 'Lịch tuần'!A5
    expect(asIsoDate(46251)).toBe("2026-08-17");
    expect(asMonth(new Date(Date.UTC(2026, 8, 1)))).toBe("2026-09");
    expect(asMonth("Tháng 9/2026")).toBe("2026-09");
    expect(asMonth("2026-10")).toBe("2026-10");
  });
});

describe("header matching", () => {
  it("normalises headers with accents, line breaks and hints", () => {
    expect(headerKey("Số lần vi phạm\n(chỉ dùng lỗi /lần)")).toBe("so lan vi pham");
    expect(headerKey("SĐT GVCN")).toBe("sdt gvcn");
    expect(headerKey("Điểm cơ sở / lớp / tuần")).toBe("diem co so lop tuan");
    expect(headerKey("Mã HS (tự động)")).toBe("ma hs");
  });

  it("prefers exact aliases and only prefix-matches aliases ending with *", () => {
    const keys = new Map([
      [1, "ngay sinh"],
      [2, "minh chung bang hinh anh"],
      [3, "lop su viec"],
      [4, "lop"],
    ]);
    const cols = matchColumns(keys, [
      { key: "date", aliases: ["Ngày"] },
      { key: "evidence", aliases: ["Minh chứng", "Minh chứng*"] },
      { key: "classCode", aliases: ["Lớp"] },
    ]);
    expect(cols).toEqual({ evidence: 2, classCode: 4 });
  });
});

describe("legacy value parsing", () => {
  const idx = buildCatalogIndex([
    { code: "L04", category: "Chuyên cần – vệ sinh", issue: "Giày dép để lộn xộn", penalty: 2, unit: "/HS" },
    { code: "L43", category: "Chuyên cần – vệ sinh", issue: "Đi chân đất/ không đi giày dép", penalty: 2, unit: "/lần" },
  ]);

  it("extracts the last Lxx token of a choice", () => {
    expect(extractErrorCode("Giày dép để lộn xộn | Chuyên cần – vệ sinh | 2 điểm/HS | L04")).toBe("L04");
    expect(extractErrorCode("Lỗi L1 rồi sửa thành l43")).toBe("L43");
    expect(extractErrorCode("Đi học muộn")).toBeUndefined();
  });

  it("falls back to issue text, then to the Mã lỗi column", () => {
    expect(resolveErrorCode("giày dép để lộn xộn", "", "", idx)).toBe("L04");
    expect(resolveErrorCode("", "Đi chân đất/ không đi giày dép", "", idx)).toBe("L43");
    expect(resolveErrorCode("Không rõ", "", "l4", idx)).toBe("L04");
    expect(resolveErrorCode("Không rõ", "", "", idx)).toBe("");
  });

  it("splits combined student choices", () => {
    expect(splitStudentChoice("Học Sinh Mẫu Chi | 5A6 | 05/09/2015 | 99050001")).toEqual({ name: "Học Sinh Mẫu Chi", classCode: "5A6", id: "99050001" });
    expect(splitStudentChoice("HỌC SINH MẪU GIANG")).toEqual({ name: "HỌC SINH MẪU GIANG" });
    expect(splitStudentChoice("")).toEqual({});
  });

  it("parses units and resolves class codes loosely", () => {
    expect(parseUnit("/HS")).toBe("/HS");
    expect(parseUnit("điểm/ lần")).toBe("/lần");
    expect(parseUnit("/lượt")).toBe("/lần");
    expect(parseUnit("kg")).toBeUndefined();
    const resolve = makeClassResolver(["6A0H", "9B04"]);
    expect(resolve("9b04 ")).toBe("9B04");
    expect(resolve("6A0 H")).toBe("6A0H");
    expect(resolve("7Z9")).toBe("7Z9");
  });

  it("builds legacy choice texts", () => {
    expect(catalogChoiceText({ code: "L04", issue: "Giày dép để lộn xộn", category: "Chuyên cần – vệ sinh", penalty: 2, unit: "/HS" })).toBe(
      "Giày dép để lộn xộn | Chuyên cần – vệ sinh | 2 điểm/HS | L04",
    );
    expect(catalogChoiceText({ code: "L09", issue: "X", category: "Y", penalty: 2.5, unit: "/lần" })).toBe("X | Y | 2,5 điểm/lần | L09");
  });
});

describe("level detection", () => {
  it("reads titles, grades and file names", () => {
    expect(levelFromTitle("NHẬP LIỆU SỰ VIỆC NỀN NẾP – TIỂU HỌC")).toBe("TH");
    expect(levelFromTitle("NHẬP LIỆU SỰ VIỆC NỀN NẾP – THCS")).toBe("THCS");
    expect(levelFromTitle("DANH MỤC LỚP THPT")).toBe("THPT");
    expect(levelFromTitle("NHẬP LIỆU – TRUNG HỌC CƠ SỞ (THCS)")).toBe("THCS");
    expect(levelFromTitle("CẤU HÌNH THI ĐUA")).toBeUndefined();
    expect(levelFromGrades([{ grade: 10 }, { grade: 11 }, { grade: 6 }])).toBe("THPT");
    expect(levelFromFileName("NenNep_THCS_2026.xlsx")).toBe("THCS");
    expect(levelFromFileName("TH.xlsx")).toBe("TH");
    expect(levelFromFileName("bao-cao.xlsx")).toBeUndefined();
  });
});

describe("UX-3: Top group label follows config.top90Ratio", () => {
  it("names the group from the ratio (spec default 90%)", () => {
    expect(topGroupLabel()).toBe("Top 90%");
    expect(topGroupLabel(0.8)).toBe("Top 80%");
    expect(topGroupLabel(0.875)).toBe("Top 87,5%");
    expect(top90Label(true, 0.8)).toBe("Thuộc Top 80%");
    expect(top90Label(false)).toBe("Ngoài Top 90%");
  });

  it("ranking export column header and cells use it", () => {
    const top = rankingColumns(0.8).find((c) => c.header.startsWith("Top"));
    expect(top?.header).toBe("Top 80%");
    expect(RANKING_COLUMNS.some((c) => c.header === "Top 90%")).toBe(true);
  });
});

describe("ranking layout: per khối or – THPT – the whole level", () => {
  const THPT = { scope: "level", tieBreak: "violationTurns", topCount: 3 } as const;
  const rows = [
    { grade: 11, classCode: "11A2", rank: 3 },
    { grade: 10, classCode: "10A1", rank: 1 },
    { grade: 12, classCode: "12A1", rank: 1 },
    { grade: 10, classCode: "10A2", rank: 4 },
    { grade: 11, classCode: "11A1", rank: 5 },
  ];

  it("explains the rule of the table", () => {
    expect(rankingRuleNote(undefined)).toBe("Xếp hạng trong từng khối; Top 90% tính theo số lớp của khối.");
    expect(rankingRuleNote({ scope: "grade", tieBreak: "none" }, 0.8)).toBe("Xếp hạng trong từng khối; Top 80% tính theo số lớp của khối.");
    expect(rankingRuleNote(THPT)).toBe(
      "Xếp hạng chung toàn cấp (không chia khối); bằng điểm thì lớp ít lượt vi phạm hơn xếp trên, bằng cả điểm và lượt vi phạm thì đồng hạng; Top 90% tính theo số lớp toàn cấp.",
    );
  });

  it("names the top classes with every class tied at the cut", () => {
    expect(leadingClassesNote(rows, THPT)).toBe("Top 3 toàn cấp: 10A1 (hạng 1), 12A1 (hạng 1), 11A2 (hạng 3).");
    const tiedAtCut = rows.map((r) => (r.classCode === "10A2" ? { ...r, rank: 3 } : r));
    expect(leadingClassesNote(tiedAtCut, THPT)).toBe("Top 3 toàn cấp: 10A1 (hạng 1), 12A1 (hạng 1), 10A2 (hạng 3), 11A2 (hạng 3).");
    // A small table covered by the Top 3 is still listed; every class sharing one rank is said so (engine namedTop).
    expect(leadingClassesNote(rows.slice(0, 3), THPT)).toBe("Top 3 toàn cấp: 10A1 (hạng 1), 12A1 (hạng 1), 11A2 (hạng 3).");
    expect(leadingClassesNote(rows.map((r) => ({ ...r, rank: 1 })), THPT)).toBe(`Top 3 toàn cấp: tất cả ${rows.length} lớp đồng hạng 1.`);
    expect(leadingClassesNote(rows, { scope: "grade", tieBreak: "none" })).toBeUndefined();
    expect(leadingClassesNote([], THPT)).toBeUndefined();
  });

  it("sorts by khối then rank, or by rank across khối", () => {
    expect(sortRanking(rows).map((r) => r.classCode)).toEqual(["10A1", "10A2", "11A2", "11A1", "12A1"]);
    expect(sortRanking(rows, THPT).map((r) => r.classCode)).toEqual(["10A1", "12A1", "11A2", "10A2", "11A1"]);
  });

  it("adds the Lượt vi phạm column only with the violationTurns tie-break", () => {
    expect(rankingColumns(0.9).some((c) => c.header === "Lượt vi phạm")).toBe(false);
    const headers = rankingColumns(0.9, THPT).map((c) => c.header);
    expect(headers.slice(6, 9)).toEqual(["Điểm thi đua", "Lượt vi phạm", "Hạng"]);
  });
});
