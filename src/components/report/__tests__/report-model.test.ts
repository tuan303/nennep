import { describe, expect, it } from "vitest";
import { KPI_TERMS } from "@/lib/constants";
import { buildRanking, computeKpis, earlyWarnings, filterIncidents, periodOptions } from "@/lib/engine";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { makeV2FixtureDataset } from "@/lib/engine/__fixtures__/dataset-v2";
import type { Incident, Period, UserProfile } from "@/lib/types";
import { REPORT_SHEET_COLUMNS, reportFileBase, reportSheetRows, reportSheetSubtitle, reportSheetTitle } from "../lib/report-export";
import {
  buildPeriodReport,
  detailRows,
  groupShares,
  ownReportClasses,
  parseDetail,
  parseRecipient,
  recipientFilters,
  recipientKey,
  recipientOptions,
  reportKpis,
  reportPeriod,
  resolveRecipient,
  subjectsText,
} from "../lib/report-model";

const OCT: Period = { mode: "month", key: "2026-10" };
const WEEK: Period = { mode: "week", key: "2026-10-12" };
const viewer: Pick<UserProfile, "role" | "gvcnClasses"> = { role: "VIEWER", gvcnClasses: [] };
const gvcn: Pick<UserProfile, "role" | "gvcnClasses"> = {
  role: "GVCN",
  gvcnClasses: [
    { levelId: "THCS", classCode: "7A01" },
    { levelId: "THCS", classCode: "6A03" },
    { levelId: "TH", classCode: "1A1" },
  ],
};

describe("recipients (?to=)", () => {
  it("parses and serialises the three recipient kinds", () => {
    expect(parseRecipient("bgh")).toEqual({ kind: "bgh" });
    expect(parseRecipient(" khoi-6 ")).toEqual({ kind: "grade", grade: 6 });
    expect(parseRecipient("lop-6A01")).toEqual({ kind: "class", classCode: "6A01" });
    for (const bad of [undefined, null, "", "khoi-", "khoi-abc", "lop-", "gvcn-6A01", "lop-6A01/../x"]) expect(parseRecipient(bad)).toBeUndefined();
    for (const key of ["bgh", "khoi-7", "lop-7A02"]) expect(recipientKey(parseRecipient(key)!)).toBe(key);
  });

  it("offers BGH, tổ khối and every active class to school staff", () => {
    const ds = makeFixtureDataset();
    const opts = recipientOptions(viewer, ds);
    expect(opts[0]).toMatchObject({ key: "bgh", label: "Ban Giám hiệu – Trung học cơ sở", group: "Ban Giám hiệu" });
    expect(opts.filter((o) => o.recipient.kind === "grade").map((o) => o.label)).toEqual(["Tổ khối 6", "Tổ khối 7"]);
    const classes = opts.filter((o) => o.recipient.kind === "class").map((o) => o.key);
    expect(classes).toContain("lop-6A01");
    expect(classes).not.toContain("lop-7A04"); // inactive
    expect(opts.find((o) => o.key === "lop-6A03")?.label).toBe("GVCN lớp 6A03");
    expect(recipientOptions(undefined, ds)[0].key).toBe("bgh");
  });

  it("limits a GVCN to own classes of the level (class order) and falls back to the first one", () => {
    const ds = makeFixtureDataset();
    expect(ownReportClasses(gvcn, ds)).toEqual(["6A03", "7A01"]);
    const opts = recipientOptions(gvcn, ds);
    expect(opts.map((o) => o.key)).toEqual(["lop-6A03", "lop-7A01"]);
    expect(resolveRecipient("bgh", opts)?.key).toBe("lop-6A03");
    expect(resolveRecipient("khoi-6", opts)?.key).toBe("lop-6A03");
    expect(resolveRecipient("lop-6A01", opts)?.key).toBe("lop-6A03"); // another teacher's class
    expect(resolveRecipient("lop-7A01", opts)?.key).toBe("lop-7A01");
    expect(resolveRecipient(null, recipientOptions(viewer, ds))?.key).toBe("bgh");
    expect(resolveRecipient("khoi-9", recipientOptions(viewer, ds))?.key).toBe("bgh"); // grade without classes
    expect(resolveRecipient("bgh", [])).toBeUndefined();
  });

  it("defaults the detail table on for khối / lớp, off for BGH", () => {
    expect(parseDetail(null, { kind: "bgh" })).toBe(false);
    expect(parseDetail(null, { kind: "grade", grade: 6 })).toBe(true);
    expect(parseDetail(null, { kind: "class", classCode: "6A01" })).toBe(true);
    expect(parseDetail("1", { kind: "bgh" })).toBe(true);
    expect(parseDetail("0", { kind: "class", classCode: "6A01" })).toBe(false);
  });
});

describe("period (week | month only)", () => {
  const ds = makeFixtureDataset();
  const opts = periodOptions(ds.weeks, ds.config.semesters, FIXTURE_TODAY);

  it("keeps week / month and coerces the others to the current week", () => {
    expect(reportPeriod(WEEK, opts)).toEqual(WEEK);
    expect(reportPeriod(OCT, opts)).toEqual(OCT);
    expect(reportPeriod({ mode: "semester", key: "HK1" }, opts)).toEqual({ mode: "week", key: "2026-10-19" });
    expect(reportPeriod({ mode: "all" }, opts)).toEqual({ mode: "week", key: "2026-10-19" });
    expect(reportPeriod({ mode: "all" }, { weeks: [], months: [] })).toBeUndefined();
  });

  it("scopes the filters by recipient", () => {
    expect(recipientFilters({ kind: "bgh" }, OCT)).toEqual({ period: OCT });
    expect(recipientFilters({ kind: "grade", grade: 7 }, OCT)).toEqual({ period: OCT, grade: 7 });
    expect(recipientFilters({ kind: "class", classCode: "6A03" }, OCT)).toEqual({ period: OCT, classCode: "6A03" });
  });
});

describe("buildPeriodReport", () => {
  it("BGH: whole level, KPI vocabulary with deltas, compact ranking of every grade", () => {
    const ds = makeFixtureDataset();
    const r = buildPeriodReport(ds, { period: OCT, recipient: { kind: "bgh" } }, FIXTURE_TODAY);
    expect(r.title).toBe("BÁO CÁO NỀN NẾP THÁNG 10/2026");
    expect(r.addressee).toBe("Ban Giám hiệu – Trung học cơ sở");
    expect(r.scopeLabel).toBe("Toàn cấp");
    const k = computeKpis(ds, { period: OCT });
    expect(r.kpis.map((x) => [x.id, x.label, x.value])).toEqual([
      ["incidents", KPI_TERMS.incidents.label, k.incidents],
      ["violationTurns", KPI_TERMS.violationTurns.label, k.violationTurns],
      ["uniqueStudents", KPI_TERMS.uniqueStudents.label, k.uniqueStudents],
      ["penaltyPoints", KPI_TERMS.penaltyPoints.label, k.penaltyPoints],
      ["rewardPoints", KPI_TERMS.rewardPoints.label, k.rewardPoints],
    ]);
    expect(r.kpis[0].hint).toBe(KPI_TERMS.incidents.hint);
    expect(r.kpis.every((x) => x.delta !== undefined)).toBe(true);
    expect(r.previousLabel).toBe("Tháng 9/2026");
    expect(r.ranking.kind).toBe("level");
    if (r.ranking.kind === "level") {
      expect(r.ranking.grades.map((g) => g.grade)).toEqual([6, 7]);
      expect(r.ranking.grades[0].leaders.length).toBeLessThanOrEqual(3);
    }
    expect(r.detail).toHaveLength(filterIncidents(ds, { period: OCT }).length);
    expect(r.detail.map((d) => d.isoDate)).toEqual([...r.detail.map((d) => d.isoDate)].sort());
    expect(r.topIssues.length).toBeLessThanOrEqual(5);
    expect(r.hasData).toBe(true);
  });

  it("tổ khối: only that grade (ranking, incidents, warnings)", () => {
    const ds = makeV2FixtureDataset();
    const r = buildPeriodReport(ds, { period: { mode: "week", key: "2026-10-19" }, recipient: { kind: "grade", grade: 6 } }, FIXTURE_TODAY);
    expect(r.addressee).toBe("Tổ khối 6");
    expect(r.detail.every((d) => d.classCode.startsWith("6"))).toBe(true);
    expect(r.warnings.every((w) => w.grade === 6)).toBe(true);
    expect(r.warnings.some((w) => w.kind === "SERIOUS_INCIDENT")).toBe(true);
    expect(r.ranking.kind === "grade" && r.ranking.grade?.rows.every((row) => row.grade === 6)).toBe(true);
    expect(r.groups.some((g) => g.group === "Nhóm 3")).toBe(true);
    expect(r.groups.every((g) => g.incidents > 0)).toBe(true);
  });

  it("lớp: class standing (rank X/N, previous rank) and GVCN-scoped warnings", () => {
    const ds = makeV2FixtureDataset();
    const r = buildPeriodReport(ds, { period: WEEK, recipient: { kind: "class", classCode: "6A03" }, viewer: gvcn }, FIXTURE_TODAY);
    expect(r.addressee).toMatch(/^GVCN lớp 6A03 – thầy\/cô /);
    expect(r.scopeLabel).toBe("Lớp 6A03");
    const row = buildRanking(ds, WEEK, FIXTURE_TODAY).grades.find((g) => g.grade === 6)!.rows.find((x) => x.classCode === "6A03")!;
    expect(r.ranking.kind).toBe("class");
    if (r.ranking.kind === "class") {
      expect(r.ranking.standing?.row.rank).toBe(row.rank);
      expect(r.ranking.standing?.row.gradeClassCount).toBe(row.gradeClassCount);
      expect(r.ranking.standing?.previousRank).toBeTypeOf("number");
    }
    expect(r.warnings.every((w) => w.classCode === "6A03")).toBe(true);
    expect(r.detail.every((d) => d.classCode === "6A03")).toBe(true);
    // Every warning of the class is listed for the GVCN of the class.
    expect(r.warnings).toHaveLength(earlyWarnings(ds, { period: WEEK, classCode: "6A03" }, FIXTURE_TODAY).length);
  });

  it("an unknown / inactive class has no standing", () => {
    const ds = makeFixtureDataset();
    const r = buildPeriodReport(ds, { period: OCT, recipient: { kind: "class", classCode: "7A04" } }, FIXTURE_TODAY);
    expect(r.ranking).toMatchObject({ kind: "class", standing: undefined });
  });
});

describe("detail rows & helpers", () => {
  const inc = (over: Partial<Incident>): Incident => ({ ...makeFixtureDataset().incidents[0], ...over });

  it("describes the subjects (named, unnamed, collective, redacted)", () => {
    const a = { id: "HS0001", name: "Nguyễn Văn A", classCode: "6A01" };
    const b = { id: "HS0002", name: "Trần Thị B", classCode: "6A01" };
    expect(subjectsText({ students: [a, b, a], unnamedCount: 2, relatedStudentCount: 4 })).toBe("Nguyễn Văn A, Trần Thị B + 2 HS chưa rõ tên");
    expect(subjectsText({ students: [], unnamedCount: 3, relatedStudentCount: 3 })).toBe("3 HS chưa rõ tên");
    expect(subjectsText({ students: [], unnamedCount: 0, relatedStudentCount: 0 })).toBe("Tập thể lớp");
    expect(subjectsText({ students: [], unnamedCount: 0, relatedStudentCount: 2 })).toBe("2 HS (ẩn danh)");
  });

  it("sorts by date then code and carries the identifiers", () => {
    const rows = detailRows([
      inc({ id: "b", code: "NN-20261012-0010", date: "2026-10-12", remediation: " Nhắc nhở ", gvcnNote: "Đã trao đổi" }),
      inc({ id: "a", code: "NN-20261012-0002", date: "2026-10-12" }),
      inc({ id: "c", code: "NN-20261009-0001", date: "2026-10-09", students: [{ id: "HS0009", name: "Lê Văn C", classCode: "6A01" }] }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(rows[0]).toMatchObject({ date: "09/10/2026", studentIds: "HS0009" });
    expect(rows[2]).toMatchObject({ remediation: "Nhắc nhở", gvcnNote: "Đã trao đổi" });
  });

  it("computes KPI deltas and group bar shares", () => {
    const k = computeKpis(makeFixtureDataset(), { period: OCT });
    const kpis = reportKpis(k, { ...k, incidents: k.incidents - 2 });
    expect(kpis[0]).toMatchObject({ delta: 2, goodWhen: "down" });
    expect(kpis[4].goodWhen).toBe("up");
    expect(reportKpis(k).every((x) => x.delta === undefined)).toBe(true);
    expect(groupShares([
      { group: "Nhóm 1", incidents: 1, violationTurns: 1, points: 4, errorCodes: 1 },
      { group: "Nhóm 2", incidents: 1, violationTurns: 1, points: 8, errorCodes: 1 },
    ])).toEqual([0.5, 1]);
    expect(groupShares([])).toEqual([]);
  });
});

describe("Excel chi tiết & file names", () => {
  it("exports the identifier columns + remediation + GVCN feedback", () => {
    expect(REPORT_SHEET_COLUMNS.map((c) => c.header)).toEqual([
      "Ngày",
      "Mã sự việc",
      "Lớp",
      "Mã lỗi",
      "Nội dung lỗi",
      "Nhóm",
      "Phạm vi",
      "Đối tượng",
      "Mã HS",
      "Lượt",
      "Điểm",
      "Trạng thái",
      "Khắc phục",
      "Phản hồi GVCN",
    ]);
    const ds = makeFixtureDataset();
    const r = buildPeriodReport(ds, { period: WEEK, recipient: { kind: "grade", grade: 6 } }, FIXTURE_TODAY);
    const rows = reportSheetRows(r.detail);
    expect(rows).toHaveLength(r.detail.length);
    expect(Object.keys(rows[0]).sort()).toEqual(REPORT_SHEET_COLUMNS.map((c) => c.key as string).sort());
    expect(reportSheetTitle(r)).toBe("Báo cáo nền nếp – Tuần 12/10 – 18/10/2026");
    expect(reportSheetSubtitle(r, FIXTURE_TODAY)).toBe("Trường Ngôi Sao Hoàng Mai · Trung học cơ sở · Kính gửi: Tổ khối 6 · Xuất ngày 21/10/2026");
  });

  it("builds ASCII-safe file names", () => {
    expect(reportFileBase({ levelId: "THCS", periodLabel: "Tuần 12/10 – 18/10/2026", scopeLabel: "Khối 6" })).toBe("NSHM_Bao-cao_THCS_Tuan-12-10_18-10-2026_Khoi-6");
    expect(reportFileBase({ levelId: "TH", periodLabel: "Tháng 10/2026", scopeLabel: "Toàn cấp" })).toBe("NSHM_Bao-cao_TH_Thang-10-2026_Toan-cap");
    expect(reportFileBase({ levelId: "THPT", periodLabel: "Tháng 10/2026", scopeLabel: "Lớp 10A1" })).toMatch(/^[\w-]+$/);
  });
});

describe("score bands in the report (THCS)", () => {
  it("THCS: leaders = every class at rank 1; each class in exactly one band, by its share of the base", () => {
    const ds = makeFixtureDataset();
    for (const period of [OCT, WEEK]) {
      const r = buildPeriodReport(ds, { period, recipient: { kind: "bgh" } }, FIXTURE_TODAY);
      if (r.ranking.kind !== "level") throw new Error("level ranking expected");
      for (const g of r.ranking.grades) {
        expect(g.bands).toBeDefined();
        const groups = g.bands!.groups!;
        expect(g.leaders).toEqual(g.rows.filter((row) => row.rank === 1));
        expect(groups.LEADER).toEqual(g.leaders);
        expect([...groups.LEADER, ...groups.HIGH, ...groups.MIDDLE, ...groups.LOW].map((x) => x.classCode).sort()).toEqual(g.rows.map((x) => x.classCode).sort());
        for (const row of groups.HIGH) expect(row.score / row.base).toBeGreaterThan(0.9);
        for (const row of groups.MIDDLE) expect(row.score / row.base).toBeGreaterThanOrEqual(0.51);
        for (const row of groups.LOW) expect(row.score / row.base).toBeLessThan(0.51);
      }
    }
  });

  it("other levels keep the Top 90% view (no bands, up to 3 leaders)", () => {
    const ds = { ...makeFixtureDataset(), levelId: "THPT" as const };
    const r = buildPeriodReport(ds, { period: OCT, recipient: { kind: "bgh" } }, FIXTURE_TODAY);
    if (r.ranking.kind !== "level") throw new Error("level ranking expected");
    expect(r.ranking.grades.every((g) => g.bands === undefined && g.leaders.length <= 3)).toBe(true);
  });
});
