import { describe, expect, it } from "vitest";
import { nextPageLimit } from "./table-paging";

describe("nextPageLimit (DataTable 'Xem thêm')", () => {
  it("shows everything without a page size", () => {
    expect(nextPageLimit({ rowCount: 10, key: undefined, limit: Infinity }, { rowCount: 12, key: undefined }, undefined)).toBe(Infinity);
  });

  it("keeps the opened rows when a live refresh only swaps the rows array (same resetKey)", () => {
    // BGH opened 4 × 50 rows on /du-lieu; someone records an incident → new array, one row more (or less).
    const opened = { rowCount: 500, key: "TH|week:12|q:", limit: 200 };
    expect(nextPageLimit(opened, { rowCount: 501, key: "TH|week:12|q:" }, 50)).toBe(200);
    expect(nextPageLimit(opened, { rowCount: 499, key: "TH|week:12|q:" }, 50)).toBe(200);
    expect(nextPageLimit(opened, { rowCount: 120, key: "TH|week:12|q:" }, 50)).toBe(200);
  });

  it("goes back to the first page when the list inputs (resetKey) change", () => {
    const opened = { rowCount: 500, key: "q:", limit: 200 };
    expect(nextPageLimit(opened, { rowCount: 500, key: "q:nguyen" }, 50)).toBe(50);
  });

  it("without resetKey: keeps the limit while the refreshed list still fills the visible rows", () => {
    const opened = { rowCount: 500, key: undefined, limit: 200 };
    expect(nextPageLimit(opened, { rowCount: 501, key: undefined }, 50)).toBe(200);
    expect(nextPageLimit(opened, { rowCount: 200, key: undefined }, 50)).toBe(200);
    // Filters narrowed the list below what was visible → first page again.
    expect(nextPageLimit(opened, { rowCount: 150, key: undefined }, 50)).toBe(50);
  });

  it("never goes below one page", () => {
    expect(nextPageLimit({ rowCount: 10, key: "a", limit: 8 }, { rowCount: 30, key: "a" }, 20)).toBe(20);
    expect(nextPageLimit({ rowCount: 3, key: undefined, limit: 20 }, { rowCount: 2, key: undefined }, 20)).toBe(20);
  });
});
