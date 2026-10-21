import { describe, expect, it } from "vitest";
import type { StudentLite } from "../../types";
import { FIXTURE_STUDENT_IDS as IDS, makeFixtureDataset } from "../__fixtures__/dataset";
import { formatNumberVN, formatPercentVN, matchesSearch, nameSuggestions, naturalCompare, normalizeVN } from "../text";

describe("normalizeVN", () => {
  it("strips diacritics incl. đ/Đ, lowercases, trims and collapses spaces", () => {
    expect(normalizeVN("Đỗ Văn Đạt")).toBe("do van dat");
    expect(normalizeVN("  Nguyễn   Thị  Ánh  ")).toBe("nguyen thi anh");
    expect(normalizeVN("TRƯỜNG PHÚC")).toBe("truong phuc");
    expect(normalizeVN("")).toBe("");
  });
});

describe("matchesSearch", () => {
  it("every query token must be a substring of the normalized text", () => {
    expect(matchesSearch("Nguyễn Trường Phúc", "truong phuc")).toBe(true);
    expect(matchesSearch("Nguyễn Trường Phúc", "Phúc trường")).toBe(true);
    expect(matchesSearch("Nguyễn Trường Phúc", "khoi")).toBe(false);
    expect(matchesSearch("Đỗ Văn Đạt 7A01", "dat 7a")).toBe(true);
    expect(matchesSearch("anything", "   ")).toBe(true);
  });
});

describe("nameSuggestions", () => {
  const students = makeFixtureDataset().students;

  it('"Trường Phúc": names ending with it first, then names containing all tokens', () => {
    const s = nameSuggestions("Trường Phúc", students);
    expect(s.map((x) => x.name)).toEqual(["Đinh Trường Phúc", "Nguyễn Trường Phúc", "Nguyễn Phúc Trường"]);
    expect(s.map((x) => x.id)).toEqual([IDS.truongPhuc7A02, IDS.truongPhuc6A01, IDS.phucTruong7A01]);
    expect(s.some((x) => x.name === "Hồ Hạnh Phúc" || x.name === "Nghiêm Xuân Trường")).toBe(false);
  });

  it("works without diacritics, honours limit, empty input → []", () => {
    expect(nameSuggestions("truong phuc", students, 1).map((x) => x.name)).toEqual(["Đinh Trường Phúc"]);
    expect(nameSuggestions("phuc", students).length).toBeLessThanOrEqual(5);
    expect(nameSuggestions("phuc", students)[0].name.endsWith("Phúc")).toBe(true);
    expect(nameSuggestions("  ", students)).toEqual([]);
  });

  it("exact match first, ACTIVE before others inside a tier", () => {
    const list: StudentLite[] = [
      { id: "1", name: "Lê Văn An", classCode: "6A01", grade: 6, status: "TRANSFERRED_OUT" },
      { id: "2", name: "Trần Văn An", classCode: "6A02", grade: 6, status: "ACTIVE" },
      { id: "3", name: "Văn An", classCode: "6A03", grade: 6, status: "ACTIVE" },
      { id: "4", name: "Văn Anh", classCode: "6A03", grade: 6, status: "ACTIVE" },
    ];
    expect(nameSuggestions("Văn An", list).map((x) => x.id)).toEqual(["3", "2", "1", "4"]);
  });
});

describe("naturalCompare & number formatting", () => {
  it("sorts class codes naturally", () => {
    expect(["6A10", "6A2", "6A1", "10A1", "7A01"].sort(naturalCompare)).toEqual(["6A1", "6A2", "6A10", "7A01", "10A1"]);
  });
  it("formats numbers the Vietnamese way", () => {
    expect(formatNumberVN(1234.5)).toBe("1.234,5");
    expect(formatNumberVN(25.666)).toBe("25,67");
    expect(formatNumberVN(-3)).toBe("-3");
    expect(formatNumberVN(12)).toBe("12");
    expect(formatPercentVN(0.5)).toBe("50%");
    expect(formatPercentVN(1)).toBe("100%");
  });
});
