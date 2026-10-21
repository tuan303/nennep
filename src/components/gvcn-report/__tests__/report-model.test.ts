import { describe, expect, it } from "vitest";
import { FIXTURE_STUDENT_IDS, FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { computeKpis } from "@/lib/engine";
import type { Incident, Period, UserProfile } from "@/lib/types";
import { buildCopyText, gvcnExportFileName, incidentLine, kpiLine, periodSlug, reportTitle } from "../lib/copy-text";
import {
  buildGvcnReport,
  feedbackPayload,
  filterReportRows,
  isRewardCounted,
  ownClassesOf,
  previousLabelShort,
  resolveReportClass,
  shortWeekday,
  statusCounts,
  subjectOf,
  subjectText,
} from "../lib/report-model";

const WEEK: Period = { mode: "week", key: "2026-10-12" };
const CURRENT_WEEK: Period = { mode: "week", key: "2026-10-19" };

function gvcn(classes: Array<[string, string]>): Pick<UserProfile, "role" | "gvcnClasses"> {
  return { role: "GVCN", gvcnClasses: classes.map(([levelId, classCode]) => ({ levelId: levelId as "THCS", classCode })) };
}

describe("class choice", () => {
  it("lists a GVCN's own classes of the level in natural order", () => {
    const ds = makeFixtureDataset();
    const p = gvcn([
      ["THCS", "7A01"],
      ["THCS", "6A03"],
      ["THPT", "10A1"],
    ]);
    expect(ownClassesOf(p, "THCS", ds.classes)).toEqual(["6A03", "7A01"]);
    expect(ownClassesOf({ role: "VIEWER", gvcnClasses: [] }, "THCS", ds.classes)).toEqual([]);
    expect(ownClassesOf(undefined, "THCS", ds.classes)).toEqual([]);
  });

  it("keeps a GVCN on their own classes and reports an ignored class filter", () => {
    expect(resolveReportClass({ isGvcn: true, ownClasses: ["6A03", "7A01"], filterClass: "7A01" })).toEqual({ classCode: "7A01" });
    expect(resolveReportClass({ isGvcn: true, ownClasses: ["6A03"], filterClass: "6A05" })).toEqual({ classCode: "6A03", ignoredFilterClass: "6A05" });
    expect(resolveReportClass({ isGvcn: true, ownClasses: ["6A03"] })).toEqual({ classCode: "6A03" });
  });

  it("uses the global class filter for other roles (none → pick one)", () => {
    expect(resolveReportClass({ isGvcn: false, ownClasses: [], filterClass: "6A02" })).toEqual({ classCode: "6A02" });
    expect(resolveReportClass({ isGvcn: false, ownClasses: [] })).toEqual({ classCode: undefined });
  });
});

describe("buildGvcnReport", () => {
  const ds = makeFixtureDataset();
  const report = buildGvcnReport(ds, "6A03", WEEK, FIXTURE_TODAY);

  it("selects the class incidents of the period, oldest first", () => {
    expect(report.incidents.map((i) => i.date)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(report.incidents.every((i) => i.classCode === "6A03")).toBe(true);
    expect(report.kpis).toEqual(computeKpis(ds, { period: WEEK, classCode: "6A03" }));
    expect(report.previous).toBeDefined();
  });

  it("ignores category / error filters (scope = period + class)", () => {
    expect(report.scope).toEqual({ period: WEEK, classCode: "6A03" });
  });

  it("includes the class ranking row inside its grade", () => {
    expect(report.ranking).toMatchObject({ classCode: "6A03", grade: 6, gradeClassCount: 5 });
    expect(report.classInfo?.homeroomTeacher).toBe("Lê Văn Hùng");
    expect(report.activeStudents).toBe(8);
  });

  it("lists students needing attention with alerts first", () => {
    expect(report.students[0]).toMatchObject({ id: FIXTURE_STUDENT_IDS.khoi, alert: "WEEKLY_RED", incidents: 3 });
    const rank = { WEEKLY_RED: 0, REPEAT: 1, NONE: 2 } as const;
    const ranks = report.students.map((s) => rank[s.alert]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(report.students.length).toBeGreaterThan(1);
  });

  it("lists every reward of the class in the period, newest first, with the counted flag", () => {
    const r = buildGvcnReport(ds, "6A01", { mode: "month", key: "2026-09" }, FIXTURE_TODAY);
    expect(r.rewards.map((x) => x.date)).toEqual(["2026-09-18"]);
    const oct = buildGvcnReport(ds, "6A03", CURRENT_WEEK, FIXTURE_TODAY);
    expect(oct.rewards).toHaveLength(1);
    expect(isRewardCounted(oct.rewards[0], oct.countedStatuses)).toBe(false);
    expect(isRewardCounted({ status: "Đã xác nhận" }, oct.countedStatuses)).toBe(true);
  });

  it("has no ranking row for an unknown class", () => {
    const r = buildGvcnReport(ds, "9Z99", WEEK, FIXTURE_TODAY);
    expect(r.ranking).toBeUndefined();
    expect(r.incidents).toEqual([]);
  });
});

describe("labels", () => {
  const ds = makeFixtureDataset();
  const byDate = (classCode: string, date: string, errorCode: string): Incident => {
    const found = ds.incidents.find((i) => i.classCode === classCode && i.date === date && i.errorCode === errorCode);
    if (!found) throw new Error("fixture incident not found");
    return found;
  };

  it("short weekdays", () => {
    expect(shortWeekday("2026-10-12")).toBe("T2");
    expect(shortWeekday("2026-10-14")).toBe("T4");
    expect(shortWeekday("2026-10-18")).toBe("CN");
  });

  it("collective incidents read 'Tập thể lớp' (AC-013)", () => {
    const i = byDate("6A03", "2026-10-16", "L14");
    expect(subjectOf(i).collective).toBe(true);
    expect(subjectText(i)).toBe("Tập thể lớp");
  });

  it("appends unnamed students", () => {
    expect(subjectText(byDate("6A03", "2026-10-20", "L05"))).toBe("Võ Thành Đạt + 2 HS chưa rõ tên");
    expect(subjectText({ students: [], unnamedCount: 3, relatedStudentCount: 3 })).toBe("3 HS chưa rõ tên");
  });

  it("counts students hidden by redaction instead of calling them 'Tập thể lớp'", () => {
    expect(subjectText({ students: [], unnamedCount: 0, relatedStudentCount: 2 })).toBe("2 HS");
  });

  it("previous period wording", () => {
    expect(previousLabelShort("week")).toBe("so với tuần trước");
    expect(previousLabelShort("all")).toBeUndefined();
  });
});

describe("table filters", () => {
  const ds = makeFixtureDataset();
  const { incidents } = buildGvcnReport(ds, "6A03", WEEK, FIXTURE_TODAY);

  it("searches without accents across names, issues and notes", () => {
    expect(filterReportRows(incidents, { query: "khoi", status: "ALL" })).toHaveLength(3);
    expect(filterReportRows(incidents, { query: "phu huynh", status: "ALL" }).map((i) => i.errorCode)).toEqual(["L35"]);
    expect(filterReportRows(incidents, { query: "L14", status: "ALL" })).toHaveLength(1);
    expect(filterReportRows(incidents, { query: "", status: "ALL" })).toHaveLength(incidents.length);
  });

  it("filters by status and counts statuses", () => {
    const counts = statusCounts(incidents);
    expect(counts.ALL).toBe(5);
    expect(counts["Đang xử lý"]).toBe(5);
    expect(filterReportRows(incidents, { query: "", status: "Đã đóng" })).toEqual([]);
  });
});

describe("feedbackPayload", () => {
  const base = { gvcnNote: "Đã nhắc nhở", status: "Mới ghi nhận" as const };

  it("returns null when nothing changed (whitespace ignored)", () => {
    expect(feedbackPayload(base, "  Đã nhắc nhở ", "Mới ghi nhận")).toBeNull();
  });

  it("sends only the changed fields", () => {
    expect(feedbackPayload(base, "Đã nhắc nhở", "Đã đóng")).toEqual({ status: "Đã đóng" });
    expect(feedbackPayload(base, " Đã mời phụ huynh ", "Mới ghi nhận")).toEqual({ note: "Đã mời phụ huynh" });
    expect(feedbackPayload({ status: "Đang xử lý" }, "", "Đang xử lý")).toBeNull();
  });

  it("clears a note with an empty string", () => {
    expect(feedbackPayload(base, "   ", "Mới ghi nhận")).toEqual({ note: "" });
  });
});

describe("copy text", () => {
  const ds = makeFixtureDataset();
  const report = buildGvcnReport(ds, "6A03", WEEK, FIXTURE_TODAY);
  const text = buildCopyText(report, "Tuần 12/10 – 18/10/2026", FIXTURE_TODAY);
  const lines = text.split("\n");

  it("starts with the title and the KPI line", () => {
    expect(lines[0]).toBe(`${reportTitle("6A03")} – Tuần 12/10 – 18/10/2026`);
    expect(lines[1]).toBe("GVCN: Lê Văn Hùng");
    expect(lines[2]).toBe(kpiLine(report));
    expect(lines[2]).toMatch(/^Sự việc: 5 \| HS liên quan: \d+ \| Điểm trừ: \d+ \| Điểm thưởng: \d+ \| Điểm thi đua: [−\d.,]+ \| Hạng khối 6: \d\/5/);
  });

  it("has one bullet per incident in the Zalo format", () => {
    const bullets = lines.filter((l) => l.startsWith("• "));
    expect(bullets).toHaveLength(5);
    expect(bullets[0]).toBe("• 12/10 (T2) – Phạm Thiện Khôi – Đi học muộn – 2 điểm");
    expect(bullets[4]).toBe(incidentLine(report.incidents[4]));
    expect(bullets[4]).toContain("– Tập thể lớp –");
  });

  it("ends with totals and the school line", () => {
    expect(text).toContain(`Tổng cộng: 5 sự việc, ${report.kpis.penaltyPoints} điểm trừ.`);
    expect(lines[lines.length - 1]).toBe("Trường Ngôi Sao Hoàng Mai · Lập ngày 21/10/2026");
  });

  it("says so when the class had no incident", () => {
    const empty = buildGvcnReport(ds, "6A03", { mode: "week", key: "2026-08-17" }, FIXTURE_TODAY);
    expect(buildCopyText(empty, "Tuần 17/08 – 23/08/2026", FIXTURE_TODAY)).toContain("Không có sự việc nào trong kỳ");
  });
});

describe("file names", () => {
  it("builds ASCII period slugs", () => {
    expect(periodSlug({ mode: "week", key: "2026-10-12" })).toBe("tuan-12-10-2026");
    expect(periodSlug({ mode: "month", key: "2026-10" })).toBe("thang-10-2026");
    expect(periodSlug({ mode: "semester", key: "HK1" })).toBe("HK1");
    expect(periodSlug({ mode: "all" })).toBe("ca-nam");
    expect(gvcnExportFileName("6A03", WEEK)).toBe("Bao-cao-nen-nep-6A03-tuan-12-10-2026.xlsx");
  });
});
