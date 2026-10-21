import { describe, expect, it } from "vitest";
import type { GlobalFilters, Incident } from "../../types";
import { FIXTURE_STUDENT_IDS as IDS, FIXTURE_TODAY, makeFixtureDataset } from "../__fixtures__/dataset";
import {
  categoryBreakdown,
  classStats,
  classTimeline,
  classWeekHeatmap,
  computeKpis,
  fiveS,
  gradeStats,
  kpiComparison,
  recidivism,
  studentHistory,
  studentStats,
  topIssues,
  weekdayDistribution,
  weeklyTrend,
} from "../analytics";
import { filterIncidents, filterRewards } from "../filters";
import { round2 } from "../scoring";
import { TODAY, makeClass, makeConfig, makeDataset, makeIncident } from "./builders";

const ds = makeFixtureDataset();
const ALL: GlobalFilters = { period: { mode: "all" } };
const W12: GlobalFilters = { period: { mode: "week", key: "2026-10-12" } };
const OCT: GlobalFilters = { period: { mode: "month", key: "2026-10" } };
const sumPoints = (list: Incident[]) => round2(list.reduce((s, i) => s + i.points, 0));

describe("AC-020 KPIs follow the period filter", () => {
  it("switching from 'Toàn bộ' to one week changes KPIs, top lists and class stats", () => {
    const all = computeKpis(ds, ALL);
    const week = computeKpis(ds, W12);
    const raw = ds.incidents.filter((i) => i.week === "2026-10-12");
    expect(all.incidents).toBe(80);
    expect(all.penaltyPoints).toBe(sumPoints(ds.incidents));
    expect(week.incidents).toBe(raw.length);
    expect(week.penaltyPoints).toBe(sumPoints(raw));
    expect(week.rewardPoints).toBe(5); // 6A01 "Đã xác nhận"; the 7A01 "Mới ghi nhận" reward is not counted
    expect(week.classesWithIncidents).toBe(new Set(raw.map((i) => i.classCode)).size);
    expect(week).not.toEqual(all);
    expect(topIssues(filterIncidents(ds, W12))).not.toEqual(topIssues(filterIncidents(ds, ALL)));
    expect(classStats(ds, W12)).not.toEqual(classStats(ds, ALL));
  });

  it("KPI fields are computed consistently", () => {
    const k = computeKpis(ds, OCT);
    const inc = filterIncidents(ds, OCT);
    expect(k.relatedStudents).toBe(inc.reduce((s, i) => s + i.relatedStudentCount, 0));
    expect(k.uniqueStudents).toBe(new Set(inc.flatMap((i) => i.students.map((s) => s.id))).size);
    expect(k.reviewCount).toBe(inc.filter((i) => i.dataCheck === "REVIEW").length);
    expect(k.unnamedStudentCount).toBe(inc.reduce((s, i) => s + i.unnamedCount, 0));
    expect(k.confidence).toBeCloseTo(inc.filter((i) => i.dataCheck !== "REVIEW").length / inc.length);
    expect(k.rewardPoints).toBe(10); // 6A04 +5 and 6A01 +5 confirmed in October
  });

  it("filters by grade / class / category / error", () => {
    expect(computeKpis(ds, { ...ALL, classCode: "6A03" }).incidents).toBe(ds.incidents.filter((i) => i.classCode === "6A03").length);
    expect(computeKpis(ds, { ...ALL, grade: 7 }).incidents).toBe(ds.incidents.filter((i) => i.grade === 7).length);
    expect(computeKpis(ds, { ...ALL, errorCode: "L35" }).penaltyPoints).toBe(20);
    expect(computeKpis(ds, { ...ALL, category: "Bán trú – xe buýt" }).incidents).toBe(ds.incidents.filter((i) => i.errorCode === "L14").length);
    expect(filterRewards(ds, { ...ALL, errorCode: "L35" })).toHaveLength(ds.rewards.length); // rewards ignore error filters
  });

  it("kpiComparison returns the previous period", () => {
    const cmp = kpiComparison(ds, { period: { mode: "week", key: "2026-10-19" } });
    expect(cmp.previousLabel).toBe("Tuần 12/10 – 18/10/2026");
    expect(cmp.previous).toEqual(computeKpis(ds, W12));
    expect(kpiComparison(ds, ALL).previous).toBeUndefined();
  });
});

describe("student statistics", () => {
  const stats = studentStats(ds, ALL, FIXTURE_TODAY);
  const byId = (id: string) => stats.find((s) => s.id === id);

  it("a named student carries the penalty of each /HS incident; /lần adds a count but 0 points", () => {
    for (const s of stats) {
      const named = ds.incidents.filter((i) => i.students.some((r) => r.id === s.id));
      expect(s.incidents).toBe(named.length);
      expect(s.points).toBe(round2(named.filter((i) => i.unit === "/HS").reduce((t, i) => t + i.penalty, 0)));
    }
    expect(byId(IDS.huy)).toMatchObject({ incidents: 1, points: 0, errors: [{ errorCode: "L10", issue: "Không nộp sổ Nhật ký học tập", count: 1 }] });
    expect(byId(IDS.khoi)).toMatchObject({ incidents: 5, points: 18, maxPerWeek: 3, lastDate: "2026-10-15", alert: "WEEKLY_RED", classCode: "6A03" });
  });

  it("synthetic: 2 points/HS × 3 students → each student carries 2 points (not 6)", () => {
    const refs = ["A", "B", "C"].map((id) => ({ id, name: `HS ${id}`, classCode: "6A01" }));
    const mini = makeDataset({
      classes: [makeClass("6A01", 6)],
      incidents: [
        makeIncident({ date: "2026-10-19", classCode: "6A01", students: refs, penalty: 2 }),
        makeIncident({ date: "2026-10-20", classCode: "6A01", students: refs.slice(0, 1), penalty: 5, unit: "/lần", points: 5 }),
      ],
    });
    const s = studentStats(mini, ALL, TODAY);
    expect(s.map((x) => [x.id, x.incidents, x.points])).toEqual([
      ["A", 2, 2],
      ["B", 1, 2],
      ["C", 1, 2],
    ]);
  });

  it("alerts: WEEKLY_RED, REPEAT (window-based) and NONE", () => {
    expect(byId(IDS.dat)?.alert).toBe("REPEAT");
    expect(byId(IDS.huy)?.alert).toBe("NONE");
    const withWindow = (repeatWindowWeeks: number) => {
      const d = makeFixtureDataset();
      d.config.studentAlert = { ...d.config.studentAlert, repeatWindowWeeks };
      return studentStats(d, ALL, FIXTURE_TODAY).find((s) => s.id === IDS.dat)?.alert;
    };
    // Đạt: weeks 2026-09-28 and 2026-10-12 (2 weeks apart)
    expect(withWindow(1)).toBe("NONE");
    expect(withWindow(2)).toBe("NONE");
    expect(withWindow(3)).toBe("REPEAT");
  });

  it("uses the current roster (status, class) and respects filters; sorted by incidents desc", () => {
    expect(byId(IDS.long)).toMatchObject({ status: "TRANSFERRED_OUT", classCode: "6A02", incidents: 2, points: 12 });
    const a03 = studentStats(ds, { ...ALL, classCode: "6A03" }, FIXTURE_TODAY);
    expect(a03.every((s) => s.classCode === "6A03")).toBe(true);
    for (let i = 1; i < stats.length; i++) {
      const [p, c] = [stats[i - 1], stats[i]];
      expect(p.incidents > c.incidents || (p.incidents === c.incidents && p.points >= c.points)).toBe(true);
    }
  });

  it("studentHistory is newest first and honours the period", () => {
    expect(studentHistory(ds, IDS.khoi).map((i) => i.date)).toEqual(["2026-10-15", "2026-10-14", "2026-10-12", "2026-09-28", "2026-09-21"]);
    expect(studentHistory(ds, IDS.khoi, W12.period)).toHaveLength(3);
    expect(studentHistory(ds, "nobody")).toEqual([]);
  });
});

describe("recidivism", () => {
  it("classes with ≥ 2 consecutive weeks ≥ yellow, with the latest RAG", () => {
    const r = recidivism(ds, ALL, FIXTURE_TODAY);
    expect(r.classes).toEqual([
      { classCode: "6A03", grade: 6, consecutiveWeeks: 4, lastRag: "YELLOW" },
      { classCode: "7A02", grade: 7, consecutiveWeeks: 3, lastRag: "YELLOW" },
    ]);
    expect(r.students.every((s) => s.alert !== "NONE")).toBe(true);
    expect(r.students.map((s) => s.id)).toEqual(expect.arrayContaining([IDS.khoi, IDS.dat]));
    expect(r.students[0].id).toBe(IDS.khoi);
  });

  it("is limited to the weeks of the filtered period and honours approval", () => {
    expect(recidivism(ds, OCT, FIXTURE_TODAY).classes.map((c) => [c.classCode, c.consecutiveWeeks])).toEqual([
      ["6A03", 3],
      ["7A02", 3],
    ]);
    const unapproved = makeFixtureDataset();
    unapproved.config.rag.approved = false;
    expect(recidivism(unapproved, ALL, FIXTURE_TODAY).classes.every((c) => c.lastRag === "GRAY")).toBe(true);
    expect(recidivism(ds, { ...ALL, grade: 7 }, FIXTURE_TODAY).classes.map((c) => c.classCode)).toEqual(["7A02"]);
  });

  it("skips the in-progress week while it is below the threshold; a low week breaks the streak", () => {
    const mk = (pts: Record<string, number>) =>
      makeDataset({
        classes: [makeClass("6A01", 6)],
        incidents: Object.entries(pts).map(([date, points]) => makeIncident({ date, classCode: "6A01", points })),
      });
    const run = (pts: Record<string, number>) => recidivism(mk(pts), ALL, TODAY).classes;
    expect(run({ "2026-10-06": 12, "2026-10-13": 30, "2026-10-20": 2 })).toEqual([{ classCode: "6A01", grade: 6, consecutiveWeeks: 2, lastRag: "RED" }]);
    expect(run({ "2026-10-06": 12, "2026-10-13": 15, "2026-10-20": 11 })).toEqual([{ classCode: "6A01", grade: 6, consecutiveWeeks: 3, lastRag: "YELLOW" }]);
    expect(run({ "2026-09-29": 12, "2026-10-06": 3, "2026-10-13": 15 })).toEqual([]);
  });
});

describe("FR-RAG-004 look-back across period boundaries (week mode is the default period)", () => {
  const S1 = { id: "S1", name: "HS Một", classCode: "6A01" };
  const week = (key: string): GlobalFilters => ({ period: { mode: "week", key } });
  const mk = (dates: string[], extra: Incident[] = []) =>
    makeDataset({
      classes: [makeClass("6A01", 6)],
      incidents: [...dates.map((date) => makeIncident({ date, classCode: "6A01", students: [S1] })), ...extra],
    });
  const alertOf = (d: ReturnType<typeof mk>, f: GlobalFilters) => studentStats(d, f, TODAY).find((s) => s.id === "S1");

  it("a student reoffending in consecutive weeks is REPEAT in week mode; counts stay those of the period", () => {
    const d = mk(["2026-10-13", "2026-10-20"]);
    expect(alertOf(d, week("2026-10-19"))).toMatchObject({ alert: "REPEAT", incidents: 1, points: 2, maxPerWeek: 1, lastDate: "2026-10-20" });
    expect(alertOf(d, { period: { mode: "month", key: "2026-10" } })?.alert).toBe("REPEAT");
    expect(recidivism(d, week("2026-10-19"), TODAY).students.map((s) => s.id)).toEqual(["S1"]);
  });

  it("only incidents up to the period count, within repeatWindowWeeks weeks", () => {
    // The later incident (week 2026-10-19) does not make week 2026-10-12 a repeat.
    expect(alertOf(mk(["2026-10-13", "2026-10-20"]), week("2026-10-12"))?.alert).toBe("NONE");
    // repeatWindowWeeks = 4: 3 weeks earlier is inside the window, 4 weeks earlier is not.
    expect(alertOf(mk(["2026-09-29", "2026-10-20"]), week("2026-10-19"))?.alert).toBe("REPEAT");
    expect(alertOf(mk(["2026-09-22", "2026-10-20"]), week("2026-10-19"))?.alert).toBe("NONE");
    // A student with no incident in the period is not listed even if they reoffended just before.
    expect(alertOf(mk(["2026-10-06", "2026-10-13"]), week("2026-10-19"))).toBeUndefined();
  });

  it("the look-back honours the other filters (category / error / class)", () => {
    const other = makeIncident({ date: "2026-10-13", classCode: "6A01", students: [S1], errorCode: "L35", category: "Các lỗi vi phạm khác" });
    const d = mk(["2026-10-20"], [other]);
    expect(alertOf(d, week("2026-10-19"))?.alert).toBe("REPEAT");
    expect(alertOf(d, { ...week("2026-10-19"), errorCode: "L01" })?.alert).toBe("NONE");
    expect(alertOf(d, { ...week("2026-10-19"), category: "Chuyên cần – vệ sinh" })?.alert).toBe("NONE");
  });

  it("recidivist classes in week mode: streak over the week's semester, ending with the selected week", () => {
    const d = makeDataset({
      classes: [makeClass("6A01", 6), makeClass("6A02", 6)],
      incidents: [
        ...["2026-10-06", "2026-10-13", "2026-10-20"].map((date) => makeIncident({ date, classCode: "6A02", points: 12 })),
        makeIncident({ date: "2026-10-13", classCode: "6A01", points: 12 }),
      ],
    });
    expect(recidivism(d, week("2026-10-19"), TODAY).classes).toEqual([{ classCode: "6A02", grade: 6, consecutiveWeeks: 3, lastRag: "YELLOW" }]);
    // As of an earlier (completed) week – later weeks are ignored.
    expect(recidivism(d, week("2026-10-12"), TODAY).classes).toEqual([{ classCode: "6A02", grade: 6, consecutiveWeeks: 2, lastRag: "YELLOW" }]);
    expect(recidivism(d, week("2026-10-05"), TODAY).classes).toEqual([]);
    // Same answer as the explicitly widened semester for the current week.
    expect(recidivism(d, week("2026-10-19"), TODAY).classes).toEqual(recidivism(d, { period: { mode: "semester", key: "HK1" } }, TODAY).classes);
  });
});

describe("trends, timeline, heatmap, 5S", () => {
  it("weeklyTrend ignores the period but honours other filters", () => {
    const t = weeklyTrend(ds, W12, FIXTURE_TODAY);
    expect(t).toEqual(weeklyTrend(ds, ALL, FIXTURE_TODAY));
    expect(t).toHaveLength(10); // 2026-08-17 … 2026-10-19
    expect(t[t.length - 1].week).toBe("2026-10-19");
    expect(round2(t.reduce((s, p) => s + p.points, 0))).toBe(sumPoints(ds.incidents));
    const w12 = t.find((p) => p.week === "2026-10-12");
    expect(w12).toMatchObject({ label: "12/10", incidents: 15, points: 68, rewards: 5 });
    const cls = weeklyTrend(ds, { ...ALL, classCode: "6A03" }, FIXTURE_TODAY);
    expect(round2(cls.reduce((s, p) => s + p.points, 0))).toBe(sumPoints(ds.incidents.filter((i) => i.classCode === "6A03")));
  });

  it("classTimeline groups by day, newest first", () => {
    const tl = classTimeline(ds, "6A03", W12.period);
    expect(tl.map((d) => d.date)).toEqual(["2026-10-16", "2026-10-15", "2026-10-14", "2026-10-13", "2026-10-12"]);
    expect(tl.map((d) => d.weekday)).toEqual(["Thứ Sáu", "Thứ Năm", "Thứ Tư", "Thứ Ba", "Thứ Hai"]);
    expect(tl.map((d) => d.points)).toEqual([4, 20, 4, 2, 2]);
    expect(tl[1].items[0].errorCode).toBe("L35");
  });

  it("classWeekHeatmap covers active classes × elapsed weeks of the period", () => {
    const h = classWeekHeatmap(ds, OCT, FIXTURE_TODAY);
    expect(h.weeks).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(h.classes).toEqual(["6A01", "6A02", "6A03", "6A04", "6A05", "7A01", "7A02", "7A03"]);
    expect(h.values).toHaveLength(24);
    expect(h.values.find(([w, c]) => w === 1 && c === 2)?.[2]).toBe(32);
    expect(classWeekHeatmap(ds, { ...OCT, grade: 7 }, FIXTURE_TODAY).classes).toEqual(["7A01", "7A02", "7A03"]);
  });

  it("fiveS uses catalog is5S codes", () => {
    const five = new Set(ds.catalog.filter((c) => c.is5S).map((c) => c.code));
    const raw = ds.incidents.filter((i) => five.has(i.errorCode));
    const r = fiveS(ds, ALL, FIXTURE_TODAY);
    expect(r.incidents).toBe(raw.length);
    expect(r.points).toBe(sumPoints(raw));
    expect(r.byWeek).toHaveLength(10);
    expect(r.byWeek.reduce((s, w) => s + w.incidents, 0)).toBe(raw.length);
    expect(r.byClass[0].classCode).toBe("6A03");
    expect(fiveS(ds, { ...ALL, errorCode: "L01" }, FIXTURE_TODAY).incidents).toBe(0);
  });

  it("weekdayDistribution, categoryBreakdown, topIssues", () => {
    const wd = weekdayDistribution(ds.incidents);
    expect(wd.map((d) => d.weekday)).toEqual(["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"]);
    expect(wd.reduce((s, d) => s + d.incidents, 0)).toBe(80);
    const cats = categoryBreakdown(ds.incidents);
    expect(cats.reduce((s, c) => s + c.incidents, 0)).toBe(80);
    expect(round2(cats.reduce((s, c) => s + c.points, 0))).toBe(sumPoints(ds.incidents));
    const top = topIssues(ds.incidents);
    expect(top).toHaveLength(5);
    expect(top[0].errorCode).toBe("L01");
    expect(topIssues(ds.incidents, Infinity)).toHaveLength(new Set(ds.incidents.map((i) => i.errorCode)).size);
    for (let i = 1; i < top.length; i++) expect(top[i - 1].incidents >= top[i].incidents).toBe(true);
  });
});

describe("class & grade statistics", () => {
  it("classStats includes zero classes and sorts by points", () => {
    const holiday = classStats(ds, { period: { mode: "week", key: "2026-08-31" } });
    expect(holiday).toHaveLength(8);
    expect(holiday.every((c) => c.incidents === 0 && c.points === 0 && c.topIssue === undefined)).toBe(true);
    const oct = classStats(ds, OCT);
    expect(oct[0]).toMatchObject({ classCode: "6A03", points: 77, homeroomTeacher: "Lê Văn Hùng" });
    expect(classStats(ds, { ...OCT, grade: 7 }).map((c) => c.classCode)).toEqual(["7A02", "7A01", "7A03"]);
  });

  it("gradeStats per grade population", () => {
    const g = gradeStats(ds, OCT, FIXTURE_TODAY);
    expect(g.map((x) => [x.grade, x.classCount, x.top90Count])).toEqual([
      [6, 5, 5],
      [7, 3, 3],
    ]);
    const inc6 = filterIncidents(ds, { ...OCT, grade: 6 });
    expect(g[0]).toMatchObject({ incidents: inc6.length, penaltyPoints: sumPoints(inc6), rewardPoints: 10 });
    expect(g[0].avgScore).toBe(round2((294 + 294 + 292 + 289 + 223) / 5));
    expect(gradeStats(ds, { ...OCT, classCode: "6A03" }, FIXTURE_TODAY).map((x) => x.grade)).toEqual([6]);
    expect(gradeStats(makeDataset({ classes: [], config: makeConfig() }), ALL, TODAY)).toEqual([]);
  });
});
