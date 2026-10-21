/**
 * Server-render smoke test of the presentational parts of Học sinh vi phạm (no providers needed).
 */
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { studentStats } from "@/lib/engine";
import type { GlobalFilters } from "@/lib/types";
import { DEFAULT_ROW_FILTER, summarizeStudents } from "../lib/students-model";
import { StudentCard } from "../student-cells";
import { StudentsSummaryCards } from "../students-summary";
import { StudentsTable } from "../students-table";

// tsconfig keeps JSX for Next ("preserve"), so vitest compiles it to React.createElement: expose React globally.
Object.assign(globalThis, { React });

const ALL: GlobalFilters = { period: { mode: "all" } };
const noop = () => undefined;

describe("Học sinh render", () => {
  const ds = makeFixtureDataset();
  const stats = studentStats(ds, ALL, FIXTURE_TODAY);

  it("renders the 4 summary cards", () => {
    const html = renderToStaticMarkup(
      createElement(StudentsSummaryCards, { summary: summarizeStudents(stats, ds.students, ALL), config: ds.config, alert: "ALL", onAlert: noop }),
    );
    for (const label of ["Số HS vi phạm", "HS tái phạm", "HS cảnh báo đỏ", "Tỷ lệ HS có vi phạm", "HS đang học"]) expect(html).toContain(label);
  });

  it("renders the table with toolbar, chips and alert badges", () => {
    const html = renderToStaticMarkup(
      createElement(StudentsTable, {
        rows: stats,
        total: stats.length,
        filter: DEFAULT_ROW_FILTER,
        onFilter: noop,
        onResetFilter: noop,
        catalog: ds.catalog,
        config: ds.config,
        onOpen: noop,
        emptyScope: null,
      }),
    );
    for (const text of ["Mã HS", "Họ tên", "Số lượt", "Loại lỗi", "Gần nhất", "Cảnh báo", "Phạm Thiện Khôi", "Cảnh báo đỏ", "Từ 2 lượt", "Tái phạm"]) {
      expect(html).toContain(text);
    }
    // Pages of 50 rows with "Xem thêm".
    expect(html.includes("Xem thêm")).toBe(stats.length > 50);
  });

  it("renders the empty toolbar state", () => {
    const html = renderToStaticMarkup(
      createElement(StudentsTable, {
        rows: [],
        total: stats.length,
        filter: { ...DEFAULT_ROW_FILTER, query: "zzz" },
        onFilter: noop,
        onResetFilter: noop,
        catalog: ds.catalog,
        config: ds.config,
        onOpen: noop,
        emptyScope: null,
      }),
    );
    expect(html).toContain("Không có học sinh phù hợp");
  });

  it("renders the phone card", () => {
    const khoi = stats.find((s) => s.id === FIXTURE_STUDENT_IDS.khoi);
    if (!khoi) throw new Error("fixture student missing");
    const html = renderToStaticMarkup(createElement(StudentCard, { s: khoi, catalog: ds.catalog }));
    expect(html).toContain("Lớp 6A03");
    expect(html).toContain("Gần nhất");
  });
});
