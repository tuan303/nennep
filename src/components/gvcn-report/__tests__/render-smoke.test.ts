/**
 * Server-render smoke test of the presentational parts of Báo GVCN (no providers needed):
 * catches broken imports / invalid markup and checks the key Vietnamese copy.
 */
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import type { Period } from "@/lib/types";
import { ClassRewards } from "../class-rewards";
import { IncidentCard } from "../incident-cells";
import { IncidentTable } from "../incident-table";
import { ReportClassBar } from "../class-selector";
import { buildGvcnReport, ignoredReportFilters } from "../lib/report-model";
import { PrintSignatures } from "../print-parts";
import { ReportHeader } from "../report-header";
import { ReportKpis } from "../report-kpis";
import { StudentConcerns } from "../student-concerns";

// tsconfig keeps JSX for Next ("preserve"), so vitest compiles it to React.createElement: expose React globally.
Object.assign(globalThis, { React });

const WEEK: Period = { mode: "week", key: "2026-10-12" };
const noop = () => undefined;

describe("Báo GVCN render", () => {
  const ds = makeFixtureDataset();
  const report = buildGvcnReport(ds, "6A03", WEEK, FIXTURE_TODAY);

  it("renders the official header", () => {
    const html = renderToStaticMarkup(
      createElement(ReportHeader, {
        levelId: ds.levelId,
        schoolYear: ds.config.schoolYear,
        classCode: "6A03",
        classInfo: report.classInfo,
        classSize: report.activeStudents,
        periodText: "Tuần 12/10 – 18/10/2026",
        today: FIXTURE_TODAY,
      }),
    );
    expect(html).toContain("TRƯỜNG NGÔI SAO HOÀNG MAI");
    expect(html).toContain("BÁO CÁO NỀN NẾP LỚP 6A03");
    expect(html).toContain("Lê Văn Hùng");
    expect(html).toContain("21/10/2026");
  });

  it("renders the KPIs (shared vocabulary) with rank and badges", () => {
    const html = renderToStaticMarkup(createElement(ReportKpis, { report, periodMode: "week" }));
    for (const label of ["Sự việc", "Lượt vi phạm", "Số HS vi phạm", "HS liên quan", "Điểm trừ", "Điểm thưởng", "Điểm thi đua", "Hạng khối 6"]) expect(html).toContain(label);
    // Tooltips come from KPI_TERMS (identical on every screen).
    expect(html).toContain("mỗi em chỉ đếm 1 lần");
    expect(html).toContain(`${report.ranking?.rank}/5`);
    expect(html).toContain("so với tuần trước");
    expect(html).toContain("Chỉ tính điểm thưởng ở trạng thái “Đã xác nhận”.");
    // UX-12: a level that also counts "Đang xác minh".
    const custom = renderToStaticMarkup(createElement(ReportKpis, { report: { ...report, countedStatuses: ["Đang xác minh", "Đã xác nhận"] }, periodMode: "week" }));
    expect(custom).toContain("Chỉ tính điểm thưởng ở trạng thái “Đang xác minh” hoặc “Đã xác nhận”.");
    expect(custom).not.toContain("đã được xác nhận");
  });

  it("renders the detail table with the collective subject and feedback", () => {
    const html = renderToStaticMarkup(
      createElement(IncidentTable, {
        classCode: "6A03",
        periodText: "Tuần 12/10 – 18/10/2026",
        incidents: report.incidents,
        onOpen: noop,
        onFeedback: noop,
        canFeedback: () => true,
        isGvcn: true,
      }),
    );
    expect(html).toContain("Chi tiết sự việc");
    expect(html).toContain("Tập thể lớp");
    expect(html).toContain("Đã mời phụ huynh");
    expect(html).toContain("Sửa phản hồi");
    expect(html).toContain("Phản hồi GVCN");
    expect(html).toContain("Khắc phục");
    expect(html).toMatch(/Cá nhân|Tập thể/);
  });

  it("shows the remediation column and the 'Khắc phục' row action for allowed users", () => {
    const fixed = report.incidents.map((i, k) => (k === 0 ? { ...i, remediation: "Học sinh viết bản cam kết.", remediationBy: "Lê Thị C", remediationAt: "2026-10-21T03:05:00.000Z" } : i));
    const props = { classCode: "6A03", periodText: "Tuần 12/10 – 18/10/2026", incidents: fixed, onOpen: noop, onFeedback: noop, canFeedback: () => false, isGvcn: false };
    const editor = renderToStaticMarkup(createElement(IncidentTable, { ...props, onRemediate: noop, canRemediate: () => true }));
    expect(editor).toContain("Học sinh viết bản cam kết.");
    expect(editor).toContain("Lê Thị C · 21/10/2026 10:05");
    expect(editor).toContain("Sửa khắc phục");
    expect(editor).toMatch(/>Khắc phục<\/button>|Khắc phục<\/span><\/button>/);
    const viewer = renderToStaticMarkup(createElement(IncidentTable, props));
    expect(viewer).not.toContain("Sửa khắc phục");
    expect(viewer).toContain("Chưa có");
    expect(renderToStaticMarkup(createElement(IncidentCard, { incident: fixed[0], canFeedback: false }))).toContain("Khắc phục: Học sinh viết bản cam kết.");
  });

  it("renders the empty table state", () => {
    const html = renderToStaticMarkup(
      createElement(IncidentTable, { classCode: "6A03", periodText: "Tuần 17/08 – 23/08/2026", incidents: [], onOpen: noop, onFeedback: noop, canFeedback: () => false, isGvcn: false }),
    );
    expect(html).toContain("Chưa có sự việc trong kỳ này");
  });

  it("renders the phone card, students and rewards", () => {
    expect(renderToStaticMarkup(createElement(IncidentCard, { incident: report.incidents[4], canFeedback: true }))).toContain("Tập thể lớp");
    const students = renderToStaticMarkup(createElement(StudentConcerns, { students: report.students, onOpen: noop }));
    expect(students).toContain("Phạm Thiện Khôi");
    expect(students).toContain("Cảnh báo đỏ");
    const rewards = renderToStaticMarkup(
      createElement(ClassRewards, { rewards: buildGvcnReport(ds, "6A03", { mode: "week", key: "2026-10-19" }, FIXTURE_TODAY).rewards, countedStatuses: ds.config.rewardCountedStatuses }),
    );
    expect(rewards).toContain("chưa tính vào điểm thi đua");
    expect(rewards).toContain("“Đã xác nhận”");
    expect(renderToStaticMarkup(createElement(ClassRewards, { rewards: [], countedStatuses: ["Đã xác nhận"] }))).toContain("Chưa có điểm thưởng trong kỳ này");
    expect(renderToStaticMarkup(createElement(PrintSignatures, { homeroomTeacher: "Lê Văn Hùng" }))).toContain("Giáo viên chủ nhiệm");
  });
});

describe("Báo GVCN on paper (UX-4) and ignored filters (UX-9)", () => {
  const ds = makeFixtureDataset();
  const report = buildGvcnReport(ds, "6A03", WEEK, FIXTURE_TODAY);
  const tableProps = { classCode: "6A03", periodText: "Tuần 12/10 – 18/10/2026", incidents: report.incidents, onOpen: noop, onFeedback: noop, canFeedback: () => true, isGvcn: true };
  const bodyRows = (html: string) => (html.split("<tbody")[1]?.match(/<tr[\s>]/g) ?? []).length;

  it("prints every incident even when the screen list is filtered", () => {
    const khoi = report.incidents.filter((i) => i.students.some((st) => st.name === "Phạm Thiện Khôi")).length;
    expect(khoi).toBeGreaterThan(0);
    expect(khoi).toBeLessThan(report.incidents.length);
    const html = renderToStaticMarkup(createElement(IncidentTable, { ...tableProps, defaultQuery: "Phạm Thiện Khôi" }));
    const [screen, paper] = html.split("data-print-full-list");
    expect(paper).toBeDefined();
    expect(screen).toContain('<div class="print:hidden">');
    expect(bodyRows(screen)).toBe(khoi);
    expect(bodyRows(paper)).toBe(report.incidents.length);
    expect(paper).toContain("Toàn bộ sự việc của lớp 6A03");
    expect(screen).toContain(`bản in / PDF luôn gồm đủ ${report.incidents.length} sự việc`);
  });

  it("prints the complete list for a status filter too (even when nothing matches on screen)", () => {
    const html = renderToStaticMarkup(createElement(IncidentTable, { ...tableProps, defaultStatus: "Đã đóng" }));
    const paper = html.split("data-print-full-list")[1];
    expect(bodyRows(paper)).toBe(report.incidents.length);
  });

  it("has a single (printed) list without a filter", () => {
    const html = renderToStaticMarkup(createElement(IncidentTable, tableProps));
    expect(html).not.toContain("data-print-full-list");
    expect(html).not.toContain('<div class="print:hidden">');
  });

  it("says that Mảng / Lỗi filters do not apply and offers to clear them", () => {
    expect(ignoredReportFilters({}, ds.catalog)).toEqual([]);
    const labels = ignoredReportFilters({ category: "Chuyên cần – vệ sinh", errorCode: "L01" }, ds.catalog);
    expect(labels).toEqual(["Mảng: Chuyên cần – vệ sinh", "Lỗi L01 – Đi học muộn"]);
    const html = renderToStaticMarkup(
      createElement(ReportClassBar, { ds, period: WEEK, classCode: "6A03", isGvcn: true, ownClasses: ["6A03"], ignoredFilters: labels, onClearIgnoredFilters: noop, onChange: noop }),
    );
    expect(html).toContain("Bộ lọc Mảng / Lỗi / Nhóm lỗi / Học sinh không áp dụng cho Báo GVCN");
    expect(html).toContain("Lỗi L01 – Đi học muộn");
    expect(html).toContain("Bỏ các bộ lọc này");
    const none = renderToStaticMarkup(createElement(ReportClassBar, { ds, period: WEEK, classCode: "6A03", isGvcn: true, ownClasses: ["6A03"], onChange: noop }));
    expect(none).not.toContain("không áp dụng cho Báo GVCN");
  });
});
