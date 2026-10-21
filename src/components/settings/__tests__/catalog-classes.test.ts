import { describe, expect, it } from "vitest";
import { CatalogPutSchema, ClassesPutSchema } from "@/lib/contract";
import { makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import {
  catalogCategories,
  catalogChanges,
  catalogPayload,
  changeSummaryText,
  filterCatalogRows,
  newCatalogRow,
  nextCatalogCode,
  rowsFromCatalog,
  validateCatalogRows,
} from "../lib/catalog-edit";
import {
  classChanges,
  classesPayload,
  codeTakenByOther,
  filterClassRows,
  gvcnEmailCoverage,
  newClassRow,
  renumberClassOrder,
  rowsFromClasses,
  validateClassRows,
} from "../lib/classes-edit";
import { duplicateCodes, parseNumberText, sameValue, stableJson } from "../lib/draft";

describe("draft helpers", () => {
  it("compares values regardless of key order", () => {
    expect(stableJson({ b: 1, a: [{ y: 2, x: 1 }] })).toBe(stableJson({ a: [{ x: 1, y: 2 }], b: 1 }));
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it("parses numbers typed with a decimal comma", () => {
    expect(parseNumberText("2,5")).toBe(2.5);
    expect(parseNumberText(" 10 ")).toBe(10);
    expect(parseNumberText("")).toBeUndefined();
    expect(parseNumberText("2đ")).toBeUndefined();
  });

  it("finds duplicate codes ignoring case and spaces", () => {
    expect([...duplicateCodes(["L01", "l01 ", "L02", ""])]).toEqual(["L01"]);
  });
});

describe("catalog editor", () => {
  const rows = () => rowsFromCatalog(makeFixtureDataset().catalog);

  it("builds a valid payload from the fixture catalog", () => {
    const r = rows();
    expect(validateCatalogRows(r)).toEqual({});
    const payload = catalogPayload(r);
    expect(CatalogPutSchema.safeParse(payload).success).toBe(true);
    expect(payload.items[0]).toMatchObject({ code: "L01", penalty: 2, unit: "/HS", is5S: false, active: true });
  });

  it("suggests the next code and validates new rows", () => {
    const r = rows();
    expect(nextCatalogCode(r)).toBe("L36");
    const added = newCatalogRow(r, "Chuyên cần – vệ sinh");
    const errors = validateCatalogRows([...r, { ...added, code: "l01" }]);
    expect(errors[added.key]).toEqual({ code: "Mã lỗi bị trùng.", issue: "Nhập nội dung lỗi.", penaltyText: "Nhập mức trừ." });
    expect(errors["c:L01"]?.code).toBe("Mã lỗi bị trùng.");
    const neg = validateCatalogRows([{ ...added, issue: "Mới", penaltyText: "-1" }]);
    expect(neg[added.key]).toEqual({ penaltyText: "Từ 0 đến 1.000." });
  });

  it("summarises changes", () => {
    const base = rows();
    const next = base.map((x) => (x.code === "L02" ? { ...x, penaltyText: "3" } : x.code === "L35" ? { ...x, active: false } : x));
    const added = { ...newCatalogRow(base), issue: "Lỗi mới", category: "Khác", penaltyText: "1" };
    const s = catalogChanges([...next, added], base);
    expect(s).toEqual({ added: 1, updated: 1, deactivated: 1 });
    expect(changeSummaryText(s, { item: "lỗi" })).toBe("1 lỗi mới · 1 lỗi sửa · 1 lỗi ngừng dùng");
    expect(catalogChanges(base, base)).toEqual({ added: 0, updated: 0, deactivated: 0 });
  });

  it("filters by category and accent-insensitive search, keeping new rows", () => {
    const r = rows();
    expect(catalogCategories(r)).toHaveLength(4);
    expect(filterCatalogRows(r, { category: "Bán trú – xe buýt" }).map((x) => x.code)).toEqual(["L11", "L14"]);
    expect(filterCatalogRows(r, { query: "di hoc muon" }).map((x) => x.code)).toEqual(["L01"]);
    const added = newCatalogRow(r);
    expect(filterCatalogRows([...r, added], { query: "zzz" })).toEqual([added]);
  });
});

describe("classes editor", () => {
  const rows = () => rowsFromClasses(makeFixtureDataset().classes);

  it("builds a valid payload in display order", () => {
    const r = rows();
    expect(r.map((x) => x.code).slice(0, 3)).toEqual(["6A01", "6A02", "6A03"]);
    expect(validateClassRows(r, "THCS")).toEqual({});
    const payload = classesPayload(r);
    expect(ClassesPutSchema.safeParse(payload).success).toBe(true);
    expect(payload.items.find((c) => c.code === "7A04")?.active).toBe(false);
  });

  it("validates grade, email, size, order and duplicates", () => {
    const r = rows();
    const bad = { ...newClassRow(r, "THCS", 10), code: "6a01", homeroomEmail: "abc@", sourceSizeText: "300", orderText: "-1" };
    const e = validateClassRows([...r, bad], "THCS")[bad.key];
    expect(e).toEqual({
      code: "Mã lớp bị trùng.",
      grade: "Khối không thuộc cấp Trung học cơ sở.",
      homeroomEmail: "Email không hợp lệ.",
      sourceSizeText: "Sĩ số là số nguyên từ 0 đến 200.",
      orderText: "Thứ tự là số nguyên ≥ 0.",
    });
    expect(codeTakenByOther(r, bad)).toBe(true);
  });

  it("adds a class after the last order and renumbers", () => {
    const r = rows();
    const added = { ...newClassRow(r, "THCS", 6), code: "6A06" };
    expect(added.orderText).toBe(String(Math.max(...r.map((x) => Number(x.orderText))) + 1));
    const renum = renumberClassOrder([...r, added]);
    expect(renum.find((x) => x.code === "6A06")?.orderText).toBe("6");
    expect(renum.find((x) => x.code === "7A01")?.orderText).toBe("7");
  });

  it("lowercases emails, omits empty optional fields and counts changes", () => {
    const base = rows();
    const next = base.map((x) => (x.code === "6A01" ? { ...x, homeroomEmail: "Ha.NT@Nshm.EDU.vn" } : x));
    const item = classesPayload(next).items.find((c) => c.code === "6A01");
    expect(item?.homeroomEmail).toBe("ha.nt@nshm.edu.vn");
    expect(item && "system" in item).toBe(false);
    expect(classChanges(next, base)).toEqual({ added: 0, updated: 1, deactivated: 0 });
  });

  it("filters by grade and teacher name", () => {
    const r = rows();
    expect(filterClassRows(r, { grade: 7 }).map((x) => x.code)).toEqual(["7A01", "7A02", "7A03", "7A04"]);
    expect(filterClassRows(r, { query: "le van hung" }).map((x) => x.code)).toEqual(["6A03"]);
  });

  it("measures GVCN email coverage for bulk account creation", () => {
    const ds = makeFixtureDataset();
    ds.classes[0].homeroomEmail = "ha@nshm.edu.vn";
    ds.classes[1].homeroomEmail = "sai-email";
    const c = gvcnEmailCoverage(ds.classes);
    expect(c).toMatchObject({ active: 8, withEmail: 1, invalid: 1 });
    expect(c.missing).toHaveLength(6);
  });
});
