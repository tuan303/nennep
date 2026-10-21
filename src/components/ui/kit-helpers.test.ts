import { describe, expect, it } from "vitest";
import { foldVN, matchesFolded, buildSearchIndex, searchOptions, groupOptions } from "./search";
import { compareSortValues, firstSortDir, nextSort, sortRows } from "./table-sort";
import { formatCompactVN, formatNumberVN, formatPercentVN, formatSignedVN } from "./format";

describe("foldVN", () => {
  it("strips Vietnamese diacritics incl. đ/Đ, lowercases, collapses spaces", () => {
    expect(foldVN("  Nguyễn   Đức Anh ")).toBe("nguyen duc anh");
    expect(foldVN("Trường Ngôi Sao Hoàng Mai")).toBe("truong ngoi sao hoang mai");
    expect(foldVN("ĐỖ THỊ HƯƠNG")).toBe("do thi huong");
  });
  it("handles decomposed (NFD) input the same as composed", () => {
    expect(foldVN("Phúc".normalize("NFD"))).toBe("phuc");
  });
});

describe("matchesFolded", () => {
  it("requires every token, accent-insensitive", () => {
    expect(matchesFolded("Nguyễn Trường Phúc", "truong phuc")).toBe(true);
    expect(matchesFolded("Nguyễn Trường Phúc", "phuc nguyen")).toBe(true);
    expect(matchesFolded("Nguyễn Trường Phúc", "phuc an")).toBe(false);
    expect(matchesFolded("bất kỳ", "")).toBe(true);
  });
});

describe("searchOptions", () => {
  const options = [
    { value: "6A01", label: "6A01", group: "Khối 6", keywords: ["Cô Lan"] },
    { value: "6A10", label: "6A10", group: "Khối 6" },
    { value: "7A01", label: "7A01", group: "Khối 7", description: "GVCN: Thầy Đức" },
    { value: "L01", label: "Đi học muộn", group: "Chuyên cần" },
    { value: "L02", label: "Không đeo thẻ học sinh", group: "Tác phong" },
  ];
  const index = buildSearchIndex(options);

  it("returns everything (capped by limit) for an empty query", () => {
    expect(searchOptions(index, "").total).toBe(5);
    expect(searchOptions(index, "", 2).items.map((o) => o.value)).toEqual(["6A01", "6A10"]);
  });
  it("matches keywords, descriptions and groups without accents", () => {
    expect(searchOptions(index, "co lan").items.map((o) => o.value)).toEqual(["6A01"]);
    expect(searchOptions(index, "thay duc").items.map((o) => o.value)).toEqual(["7A01"]);
    expect(searchOptions(index, "chuyen can").items.map((o) => o.value)).toEqual(["L01"]);
  });
  it("ranks exact and prefix label matches first", () => {
    const r = searchOptions(index, "6a1").items.map((o) => o.value);
    expect(r[0]).toBe("6A10");
    expect(searchOptions(index, "di hoc").items[0].value).toBe("L01");
  });
  it("reports the full match count when limited", () => {
    const r = searchOptions(index, "a0", 1);
    expect(r.items).toHaveLength(1);
    expect(r.total).toBe(2);
  });
});

describe("groupOptions", () => {
  it("keeps first-appearance order of groups", () => {
    const g = groupOptions([{ group: "B" }, { group: "A" }, { group: "B" }, {}]);
    expect(g.map((x) => [x.group, x.items.length])).toEqual([
      ["B", 2],
      ["A", 1],
      ["", 1],
    ]);
  });
});

describe("table sorting", () => {
  it("sorts class codes naturally in Vietnamese collation", () => {
    const rows = ["6A10", "6A2", "6A01", "Đ1", "D2"];
    expect(sortRows(rows, (r) => r, "asc")).toEqual(["6A01", "6A2", "6A10", "D2", "Đ1"]);
  });
  it("puts empty values last in both directions and is stable", () => {
    const rows = [
      { k: "a", v: 2 },
      { k: "b", v: null },
      { k: "c", v: 5 },
      { k: "d", v: 2 },
    ];
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.k)).toEqual(["c", "a", "d", "b"]);
    expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.k)).toEqual(["a", "d", "c", "b"]);
    expect(compareSortValues(undefined, 1, "asc")).toBe(1);
  });
  it("first click: numbers descending, text ascending; same column flips", () => {
    expect(firstSortDir([{ v: 3 }], (r) => r.v)).toBe("desc");
    expect(firstSortDir([{ v: "x" }], (r) => r.v)).toBe("asc");
    expect(nextSort(null, "score", "desc")).toEqual({ key: "score", dir: "desc" });
    expect(nextSort({ key: "score", dir: "desc" }, "score", "desc")).toEqual({ key: "score", dir: "asc" });
    expect(nextSort({ key: "score", dir: "asc" }, "class", "asc")).toEqual({ key: "class", dir: "asc" });
  });
});

describe("VN number formatting", () => {
  it("uses dot thousands and comma decimals", () => {
    expect(formatNumberVN(1234.5)).toBe("1.234,5");
    expect(formatPercentVN(0.964)).toBe("96,4%");
    expect(formatSignedVN(12)).toBe("+12");
    expect(formatSignedVN(-3.5)).toBe("−3,5");
    expect(formatSignedVN(0)).toBe("0");
    expect(formatCompactVN(9999)).toBe("9.999");
    expect(formatNumberVN(Number.NaN)).toBe("–");
  });
});
