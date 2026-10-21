import { describe, expect, it } from "vitest";
import type { GlobalFilters, Incident, LevelDataset, Period } from "../../types";
import { FIXTURE_HOLIDAY_WEEK, FIXTURE_STUDENT_IDS as IDS, FIXTURE_TODAY, makeFixtureDataset } from "../__fixtures__/dataset";
import { cumulativePenalty, rankHistory } from "../analytics";
import { formatDayMonthVN } from "../dates";
import { filterIncidents } from "../filters";
import { ALL_PERIOD, elapsedWeeksInPeriod } from "../period";
import { buildRanking, classScoreSeries } from "../ranking";
import { round2 } from "../scoring";
import { makeClass, makeDataset, makeIncident, makeReward } from "./builders";

const ds = makeFixtureDataset();
const ALL: GlobalFilters = { period: ALL_PERIOD };
const OCT: Period = { mode: "month", key: "2026-10" };
const HK1: Period = { mode: "semester", key: "HK1" };
const sumPoints = (list: Incident[]) => round2(list.reduce((s, i) => s + i.points, 0));
const last = (values: number[]) => values[values.length - 1];
const active6 = ["6A01", "6A02", "6A03", "6A04", "6A05"];

describe("cumulativePenalty", () => {
  it("total: one point per elapsed calendar week (holiday included), carried over, ends with Σ points", () => {
    const res = cumulativePenalty(ds, ALL, FIXTURE_TODAY);
    const weeks = elapsedWeeksInPeriod(ALL_PERIOD, ds.weeks, FIXTURE_TODAY).map((w) => w.weekStart);
    expect(res.weeks).toEqual(weeks);
    expect(res.weeks).toContain(FIXTURE_HOLIDAY_WEEK);
    expect(res.weeks[res.weeks.length - 1]).toBe("2026-10-19");
    expect(res.labels).toEqual(weeks.map(formatDayMonthVN));
    expect(res.labels[0]).toBe("17/08");
    expect(res.series).toHaveLength(1);
    const [total] = res.series;
    expect(total.key).toBe("total");
    expect(total.label).toBe("Toàn cấp");
    expect(last(total.values)).toBe(sumPoints(ds.incidents));
    for (let k = 1; k < total.values.length; k++) expect(total.values[k]).toBeGreaterThanOrEqual(total.values[k - 1]);
    const k28 = weeks.indexOf("2026-09-28");
    expect(total.values[k28]).toBe(sumPoints(ds.incidents.filter((i) => i.week <= "2026-09-28")));
    const kHoliday = weeks.indexOf(FIXTURE_HOLIDAY_WEEK);
    expect(total.values[kHoliday]).toBe(total.values[kHoliday - 1]);
  });

  it("ignores f.period and labels the scope", () => {
    expect(cumulativePenalty(ds, { period: OCT }, FIXTURE_TODAY)).toEqual(cumulativePenalty(ds, ALL, FIXTURE_TODAY));
    expect(cumulativePenalty(ds, { ...ALL, grade: 6 }, FIXTURE_TODAY).series[0].label).toBe("Khối 6");
    expect(cumulativePenalty(ds, { ...ALL, classCode: "6A03" }, FIXTURE_TODAY).series[0].label).toBe("Lớp 6A03");
    expect(cumulativePenalty(ds, { ...ALL, grade: 6, classCode: "6A03" }, FIXTURE_TODAY).series[0].label).toBe("Lớp 6A03");
  });

  it("honours grade, class, category, error, group and student filters", () => {
    const cases: GlobalFilters[] = [
      { ...ALL, grade: 7 },
      { ...ALL, classCode: "6A03" },
      { ...ALL, category: "Chuyên cần – vệ sinh" },
      { ...ALL, errorCode: "L01" },
      { ...ALL, group: "Nhóm 3" },
      { ...ALL, studentId: IDS.khoi },
    ];
    for (const f of cases) {
      expect(last(cumulativePenalty(ds, f, FIXTURE_TODAY).series[0].values)).toBe(sumPoints(filterIncidents(ds, f)));
    }
  });

  it("by grade: one series per grade in scope, summing to the total", () => {
    const res = cumulativePenalty(ds, ALL, FIXTURE_TODAY, { by: "grade" });
    expect(res.series.map((s) => [s.key, s.label])).toEqual([
      ["grade:6", "Khối 6"],
      ["grade:7", "Khối 7"],
    ]);
    expect(last(res.series[0].values)).toBe(sumPoints(ds.incidents.filter((i) => i.grade === 6)));
    expect(round2(last(res.series[0].values) + last(res.series[1].values))).toBe(sumPoints(ds.incidents));
    expect(cumulativePenalty(ds, { ...ALL, grade: 7 }, FIXTURE_TODAY, { by: "grade" }).series.map((s) => s.key)).toEqual(["grade:7"]);
    expect(cumulativePenalty(ds, { ...ALL, classCode: "7A02" }, FIXTURE_TODAY, { by: "grade" }).series.map((s) => s.key)).toEqual(["grade:7"]);
  });

  it("by class: active classes of the scope in display order; the class filter does not restrict them", () => {
    const res = cumulativePenalty(ds, { ...ALL, classCode: "6A03" }, FIXTURE_TODAY, { by: "class" });
    expect(res.series.map((s) => s.key)).toEqual([...active6, "7A01", "7A02", "7A03"].map((c) => `class:${c}`));
    expect(res.series[2]).toMatchObject({ key: "class:6A03", label: "Lớp 6A03" });
    for (const s of res.series) {
      const code = s.key.slice("class:".length);
      expect(last(s.values)).toBe(sumPoints(ds.incidents.filter((i) => i.classCode === code)));
    }
    expect(cumulativePenalty(ds, { ...ALL, grade: 7 }, FIXTURE_TODAY, { by: "class" }).series.map((s) => s.key)).toEqual(
      ["7A01", "7A02", "7A03"].map((c) => `class:${c}`),
    );
    const explicit = cumulativePenalty(ds, ALL, FIXTURE_TODAY, { by: "class", classCodes: ["7A02", "6A01", "7A02"] });
    expect(explicit.series.map((s) => s.key)).toEqual(["class:7A02", "class:6A01"]);
  });

  it("gradeAverage: TB khối = cumulative penalty of the active classes ÷ their number (class / student filters ignored)", () => {
    const g6 = sumPoints(ds.incidents.filter((i) => active6.includes(i.classCode)));
    const res = cumulativePenalty(ds, { ...ALL, classCode: "6A03", studentId: IDS.khoi }, FIXTURE_TODAY, {
      by: "class",
      classCodes: ["6A03"],
      gradeAverage: true,
    });
    expect(res.series.map((s) => [s.key, s.label])).toEqual([
      ["class:6A03", "Lớp 6A03"],
      ["avg:6", "TB khối 6"],
    ]);
    expect(last(res.series[0].values)).toBe(sumPoints(filterIncidents(ds, { ...ALL, studentId: IDS.khoi })));
    expect(last(res.series[1].values)).toBe(round2(g6 / 5));

    const total = cumulativePenalty(ds, ALL, FIXTURE_TODAY, { gradeAverage: true });
    expect(total.series.map((s) => s.key)).toEqual(["total", "avg:6", "avg:7"]);
    const g7 = sumPoints(ds.incidents.filter((i) => i.grade === 7));
    expect(last(total.series[2].values)).toBe(round2(g7 / 3)); // 7A04 is inactive → 3 classes

    const byGrade = cumulativePenalty(ds, { ...ALL, grade: 7 }, FIXTURE_TODAY, { by: "grade", gradeAverage: true });
    expect(byGrade.series.map((s) => s.key)).toEqual(["grade:7", "avg:7"]);

    // Category filters stay applied to the average; unknown classes add no average.
    const cat = cumulativePenalty(ds, { ...ALL, errorCode: "L01" }, FIXTURE_TODAY, { by: "class", classCodes: ["6A01", "9Z99"], gradeAverage: true });
    expect(cat.series.map((s) => s.key)).toEqual(["class:6A01", "class:9Z99", "avg:6"]);
    expect(last(cat.series[2].values)).toBe(round2(sumPoints(ds.incidents.filter((i) => i.errorCode === "L01" && i.grade === 6)) / 5));
    expect(cat.series[1].values.every((v) => v === 0)).toBe(true);
  });

  it("incidents of inactive classes count in the total but not in the grade average", () => {
    const extra = makeIncident({ date: "2026-10-13", classCode: "7A04", points: 50 });
    const ds2: LevelDataset = { ...ds, incidents: [...ds.incidents, extra] };
    const res = cumulativePenalty(ds2, ALL, FIXTURE_TODAY, { gradeAverage: true });
    expect(last(res.series[0].values)).toBe(round2(sumPoints(ds.incidents) + 50));
    expect(last(res.series[2].values)).toBe(last(cumulativePenalty(ds, ALL, FIXTURE_TODAY, { gradeAverage: true }).series[2].values));
  });
});

describe("rankHistory", () => {
  const rankingRows = (period: Period, grade: number) => buildRanking(ds, period, FIXTURE_TODAY, { grade }).grades[0].rows;

  it("cumulative basis: counted elapsed weeks, active classes in display order, last point = buildRanking", () => {
    for (const grade of [6, 7]) {
      const h = rankHistory(ds, grade, FIXTURE_TODAY);
      expect(h.basis).toBe("cumulative");
      expect(h.grade).toBe(grade);
      expect(h.weeks).not.toContain(FIXTURE_HOLIDAY_WEEK);
      expect(h.weeks).toEqual(ds.weeks.filter((w) => w.counted && w.weekStart <= "2026-10-19").map((w) => w.weekStart));
      expect(h.labels).toEqual(h.weeks.map(formatDayMonthVN));
      expect(h.classes.map((c) => c.classCode)).toEqual(grade === 6 ? active6 : ["7A01", "7A02", "7A03"]);
      const rows = rankingRows(ALL_PERIOD, grade);
      for (const c of h.classes) {
        const row = rows.find((r) => r.classCode === c.classCode);
        expect(c.scores).toHaveLength(h.weeks.length);
        expect(c.ranks).toHaveLength(h.weeks.length);
        expect(last(c.scores)).toBe(row?.score);
        expect(last(c.ranks)).toBe(row?.rank);
        expect(c.homeroomTeacher).toBe(row?.homeroomTeacher);
      }
    }
  });

  it("cumulative scores grow by the weekly base and start at one week of base", () => {
    const h = rankHistory(ds, 6, FIXTURE_TODAY);
    expect(h.weeks[0]).toBe("2026-08-17");
    for (const c of h.classes) expect(c.scores[0]).toBe(100);
    const c6A03 = h.classes.find((c) => c.classCode === "6A03");
    const k = h.weeks.indexOf("2026-09-28");
    const penalty = sumPoints(ds.incidents.filter((i) => i.classCode === "6A03" && i.week <= "2026-09-28"));
    expect(c6A03?.scores[k]).toBe(round2(100 * (k + 1) - penalty));
  });

  it("month / semester scopes end on buildRanking of that period", () => {
    for (const period of [OCT, HK1]) {
      const h = rankHistory(ds, 6, FIXTURE_TODAY, { period });
      const rows = rankingRows(period, 6);
      if (period === OCT) expect(h.weeks).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
      for (const c of h.classes) {
        const row = rows.find((r) => r.classCode === c.classCode);
        expect(last(c.scores)).toBe(row?.score);
        expect(last(c.ranks)).toBe(row?.rank);
      }
    }
  });

  it("a week period is widened to its semester and cut at that week", () => {
    const full = rankHistory(ds, 6, FIXTURE_TODAY, { period: HK1 });
    const cut = rankHistory(ds, 6, FIXTURE_TODAY, { period: { mode: "week", key: "2026-10-12" } });
    expect(cut.weeks[cut.weeks.length - 1]).toBe("2026-10-12");
    expect(cut.weeks).toEqual(full.weeks.slice(0, cut.weeks.length));
    cut.classes.forEach((c, idx) => {
      expect(c.scores).toEqual(full.classes[idx].scores.slice(0, cut.weeks.length));
      expect(c.ranks).toEqual(full.classes[idx].ranks.slice(0, cut.weeks.length));
    });
  });

  it("week basis equals classScoreSeries (score and rank of every week)", () => {
    for (const grade of [6, 7]) {
      const h = rankHistory(ds, grade, FIXTURE_TODAY, { basis: "week" });
      expect(h.basis).toBe("week");
      for (const c of h.classes) {
        const series = classScoreSeries(ds, c.classCode, FIXTURE_TODAY);
        expect(series.map((p) => p.week)).toEqual(h.weeks);
        expect(c.scores).toEqual(series.map((p) => p.score));
        expect(c.ranks).toEqual(series.map((p) => p.rank));
      }
    }
  });

  it("ranks are competition ranks (ties share a rank)", () => {
    const h = rankHistory(ds, 6, FIXTURE_TODAY);
    expect(h.classes.map((c) => c.ranks[0])).toEqual([1, 1, 1, 1, 1]); // everyone at 100 in the first week
  });

  it("unknown grade → no classes; no counted elapsed week → empty arrays", () => {
    expect(rankHistory(ds, 9, FIXTURE_TODAY)).toEqual({ grade: 9, basis: "cumulative", weeks: [], labels: [], classes: [] });
    const early = rankHistory(ds, 7, "2026-08-01", { basis: "week" });
    expect(early.weeks).toEqual([]);
    expect(early.classes.map((c) => [c.classCode, c.ranks, c.scores])).toEqual([
      ["7A01", [], []],
      ["7A02", [], []],
      ["7A03", [], []],
    ]);
  });

  it("holiday-week records and counted rewards are included in the cumulative score", () => {
    const classes = [makeClass("6A01", 6, { order: 0 }), makeClass("6A02", 6, { order: 1 })];
    const weeks = makeDataset({ classes }).weeks.map((w) => (w.weekStart === "2026-08-31" ? { ...w, counted: false } : w));
    const small = makeDataset({
      classes,
      weeks,
      incidents: [makeIncident({ date: "2026-09-01", classCode: "6A01", points: 30 })],
      rewards: [
        makeReward({ date: "2026-09-08", classCode: "6A01", points: 10 }),
        makeReward({ date: "2026-09-08", classCode: "6A02", points: 50, status: "Mới ghi nhận" }),
      ],
    });
    const h = rankHistory(small, 6, "2026-09-09");
    expect(h.weeks).toEqual(["2026-08-17", "2026-08-24", "2026-09-07"]);
    expect(h.classes.map((c) => c.scores)).toEqual([
      [100, 200, 280],
      [100, 200, 300],
    ]);
    expect(h.classes.map((c) => c.ranks[2])).toEqual([2, 1]);
    const rows = buildRanking(small, ALL_PERIOD, "2026-09-09").grades[0].rows;
    expect(rows.find((r) => r.classCode === "6A01")?.score).toBe(280);
    const weekly = rankHistory(small, 6, "2026-09-09", { basis: "week" });
    expect(weekly.classes[0].scores).toEqual([100, 100, 110]); // the holiday-week penalty has no point of its own
  });
});
