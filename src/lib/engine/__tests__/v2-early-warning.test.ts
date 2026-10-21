import { describe, expect, it } from "vitest";
import type { EarlyWarningConfig, GlobalFilters, LevelDataset, Period } from "../../types";
import { FIXTURE_STUDENT_IDS as IDS, FIXTURE_TODAY, makeFixtureDataset } from "../__fixtures__/dataset";
import { V2_FIXTURE_IDS as V2, makeV2FixtureDataset } from "../__fixtures__/dataset-v2";
import { studentStats } from "../analytics";
import {
  DEFAULT_EARLY_WARNING,
  EARLY_WARNING_KIND_LABELS,
  type EarlyWarning,
  type EarlyWarningKind,
  earlyWarningCounts,
  earlyWarnings,
  resolveEarlyWarning,
  warningReferenceWeek,
} from "../early-warning";
import { filterIncidents } from "../filters";
import { makeClass, makeConfig, makeDataset, makeIncident } from "./builders";

const ds = makeV2FixtureDataset();
const OCT: GlobalFilters = { period: { mode: "month", key: "2026-10" } };
const W12: GlobalFilters = { period: { mode: "week", key: "2026-10-12" } };
const W19: GlobalFilters = { period: { mode: "week", key: "2026-10-19" } };
const of = (items: EarlyWarning[], kind: EarlyWarningKind) => items.filter((w) => w.kind === kind);
const cfg = (patch: Partial<EarlyWarningConfig>): EarlyWarningConfig => ({ ...DEFAULT_EARLY_WARNING, ...patch });

describe("thresholds", () => {
  it("DEFAULT_EARLY_WARNING and labels", () => {
    expect(DEFAULT_EARLY_WARNING).toEqual({
      risingPct: 50,
      risingMinPoints: 6,
      risingBaselineWeeks: 4,
      prolongedWeeks: 3,
      seriousGroups: ["Nhóm 3", "Nhóm 4"],
      seriousMinPenalty: 0,
    });
    expect(EARLY_WARNING_KIND_LABELS).toEqual({
      REPEAT_STUDENT: "Tái phạm",
      RISING_CLASS: "Tăng lỗi",
      PROLONGED_ERROR: "Lỗi kéo dài",
      SERIOUS_INCIDENT: "Sự việc nghiêm trọng",
    });
  });

  it("resolveEarlyWarning: defaults when absent, a fresh copy every time", () => {
    const a = resolveEarlyWarning({});
    expect(a).toEqual(DEFAULT_EARLY_WARNING);
    a.seriousGroups.push("Nhóm 9");
    a.risingPct = 1;
    expect(DEFAULT_EARLY_WARNING.seriousGroups).toEqual(["Nhóm 3", "Nhóm 4"]);
    expect(resolveEarlyWarning(makeConfig())).toEqual(DEFAULT_EARLY_WARNING);
  });

  it("resolveEarlyWarning: stored values win, invalid fields fall back", () => {
    expect(resolveEarlyWarning({ earlyWarning: cfg({ risingPct: 100, seriousGroups: [], seriousMinPenalty: 0 }) })).toEqual(
      cfg({ risingPct: 100, seriousGroups: [], seriousMinPenalty: 0 }),
    );
    const broken = {
      risingPct: -5,
      risingMinPoints: Number.NaN,
      risingBaselineWeeks: 2.5,
      prolongedWeeks: 0,
      seriousGroups: "Nhóm 3",
      seriousMinPenalty: "10",
    } as unknown as EarlyWarningConfig;
    expect(resolveEarlyWarning({ earlyWarning: broken })).toEqual(DEFAULT_EARLY_WARNING);
    const partial = { prolongedWeeks: 5, seriousGroups: [" Nhóm 2 ", "", "Nhóm 2", 7] } as unknown as EarlyWarningConfig;
    expect(resolveEarlyWarning({ earlyWarning: partial })).toEqual(cfg({ prolongedWeeks: 5, seriousGroups: ["Nhóm 2"] }));
  });

  it("warningReferenceWeek: the week itself, else the last started week of the period", () => {
    const at = (period: Period, today = FIXTURE_TODAY) => warningReferenceWeek(ds, period, today);
    expect(at({ mode: "week", key: "2026-10-12" })).toBe("2026-10-12");
    expect(at({ mode: "week", key: "2026-11-02" })).toBe("2026-11-02");
    expect(at({ mode: "month", key: "2026-10" })).toBe("2026-10-19");
    expect(at({ mode: "month", key: "2026-09" })).toBe("2026-09-28");
    expect(at({ mode: "semester", key: "HK1" })).toBe("2026-10-19");
    expect(at({ mode: "all" })).toBe("2026-10-19");
    expect(at({ mode: "week" })).toBe("2026-10-19"); // no key = all
    expect(at({ mode: "month", key: "2026-11" })).toBeUndefined();
    expect(at({ mode: "all" }, "2026-08-01")).toBeUndefined();
  });

  it("earlyWarningCounts lists every kind", () => {
    expect(earlyWarningCounts([])).toEqual({ REPEAT_STUDENT: 0, RISING_CLASS: 0, PROLONGED_ERROR: 0, SERIOUS_INCIDENT: 0 });
    expect(earlyWarningCounts(earlyWarnings(ds, OCT, FIXTURE_TODAY))).toEqual({
      REPEAT_STUDENT: 13,
      RISING_CLASS: 2,
      PROLONGED_ERROR: 2,
      SERIOUS_INCIDENT: 3,
    });
  });
});

describe("REPEAT_STUDENT", () => {
  it("one item per studentStats row with an alert; WEEKLY_RED high, REPEAT medium", () => {
    const items = of(earlyWarnings(ds, OCT, FIXTURE_TODAY), "REPEAT_STUDENT");
    const alerted = studentStats(ds, OCT, FIXTURE_TODAY).filter((s) => s.alert !== "NONE");
    expect(new Set(items.map((w) => w.studentId))).toEqual(new Set(alerted.map((s) => s.id)));
    const khoi = items.find((w) => w.studentId === IDS.khoi);
    expect(khoi).toMatchObject({
      severity: "high",
      classCode: "6A03",
      grade: 6,
      studentName: "Phạm Thiện Khôi",
      week: "2026-10-12",
      message: "Phạm Thiện Khôi (6A03): 3 lượt vi phạm trong tuần 12/10",
      id: `REPEAT_STUDENT|6A03|${IDS.khoi}|2026-10-12`,
    });
    expect(new Set(khoi?.evidence.incidentIds)).toEqual(
      new Set(filterIncidents(ds, { ...OCT, studentId: IDS.khoi }).map((i) => i.id)),
    );
    const dat = items.find((w) => w.studentId === IDS.dat);
    expect(dat).toMatchObject({ severity: "medium", classCode: "7A01", message: "Đỗ Văn Đạt (7A01) tái phạm: 2 lượt trong 4 tuần", week: "2026-10-12" });
    expect(dat?.evidence.current).toBe(2);
  });

  it("follows config.studentAlert (Ngưỡng tái phạm)", () => {
    const strict: LevelDataset = { ...ds, config: { ...ds.config, studentAlert: { perWeek: 2, repeatWindowWeeks: 4, repeatMin: 9 } } };
    const items = of(earlyWarnings(strict, OCT, FIXTURE_TODAY), "REPEAT_STUDENT");
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((w) => w.severity === "high")).toBe(true);
    const han = items.find((w) => w.studentId === ds.incidents.find((i) => i.id === V2.dupNamed)?.students[0].id);
    expect(han?.message).toMatch(/: 2 lượt vi phạm trong tuần 19\/10$/);
  });

  it("redacted dataset: only students whose names are visible", () => {
    const redacted: LevelDataset = {
      ...ds,
      redacted: true,
      incidents: ds.incidents.map((i) => (i.classCode === "6A03" ? i : { ...i, students: [], detail: undefined })),
    };
    const items = earlyWarnings(redacted, OCT, FIXTURE_TODAY);
    const repeat = of(items, "REPEAT_STUDENT");
    expect(repeat.length).toBeGreaterThan(0);
    expect(repeat.every((w) => w.classCode === "6A03")).toBe(true);
    expect(of(items, "RISING_CLASS").map((w) => w.classCode)).toEqual(["6A05", "7A02"]);
    expect(of(items, "SERIOUS_INCIDENT")).toHaveLength(3);
  });
});

describe("RISING_CLASS", () => {
  it("reference-week penalty vs the average of the 4 counted weeks before", () => {
    const items = of(earlyWarnings(ds, OCT, FIXTURE_TODAY), "RISING_CLASS");
    expect(items.map((w) => [w.classCode, w.severity, w.message])).toEqual([
      ["6A05", "medium", "Lớp 6A05: 12 điểm trừ tuần 19/10, tăng 300% so với TB 4 tuần trước (3)"],
      ["7A02", "medium", "Lớp 7A02: 12 điểm trừ tuần 19/10, tăng 85% so với TB 4 tuần trước (6,5)"],
    ]);
    expect(items[0]).toMatchObject({ id: "RISING_CLASS|6A05||2026-10-19", week: "2026-10-19", grade: 6 });
    expect(items[0].evidence).toMatchObject({ current: 12, baseline: 3, points: 12 });
    expect(new Set(items[0].evidence.incidentIds)).toEqual(
      new Set(ds.incidents.filter((i) => i.classCode === "6A05" && i.week === "2026-10-19").map((i) => i.id)),
    );
  });

  it("high when the reference week reaches the red threshold", () => {
    const items = of(earlyWarnings(ds, W12, FIXTURE_TODAY), "RISING_CLASS");
    expect(items.map((w) => [w.classCode, w.severity])).toEqual([
      ["6A03", "high"],
      ["7A01", "medium"],
      ["7A02", "medium"],
    ]);
    expect(items[0].message).toBe("Lớp 6A03: 32 điểm trừ tuần 12/10, tăng 172% so với TB 4 tuần trước (11,75)");
  });

  it("thresholds: % increase and minimum points", () => {
    const at = (c: Partial<EarlyWarningConfig>) => of(earlyWarnings(ds, OCT, FIXTURE_TODAY, { config: cfg(c) }), "RISING_CLASS").map((w) => w.classCode);
    expect(at({ risingPct: 100 })).toEqual(["6A05"]); // 7A02: 12 < 6.5 × 2
    expect(at({ risingMinPoints: 13 })).toEqual([]);
    expect(at({ risingBaselineWeeks: 1 })).toEqual(["6A05"]); // 7A02 had 12 in week 12/10 too
  });

  it("baseline 0 → 'tăng từ 0 điểm'; counted weeks only; skipped without any week before", () => {
    const classes = [makeClass("6A01", 6)];
    const base = makeDataset({ classes });
    const weeks = base.weeks.map((w) => (w.weekStart === "2026-09-14" ? { ...w, counted: false } : w));
    const small = makeDataset({
      classes,
      weeks,
      incidents: [
        makeIncident({ date: "2026-09-15", classCode: "6A01", points: 40 }), // holiday week: not in the baseline
        makeIncident({ date: "2026-09-21", classCode: "6A01", points: 6 }),
      ],
    });
    const items = earlyWarnings(small, { period: { mode: "week", key: "2026-09-21" } }, "2026-09-23", { config: cfg({ risingBaselineWeeks: 1 }) });
    expect(of(items, "RISING_CLASS").map((w) => w.message)).toEqual(["Lớp 6A01: 6 điểm trừ tuần 21/09, tăng từ 0 điểm"]);
    expect(of(items, "RISING_CLASS")[0].evidence.baseline).toBe(0);
    const first = earlyWarnings(
      makeDataset({ classes, incidents: [makeIncident({ date: "2026-08-18", classCode: "6A01", points: 20 })] }),
      { period: { mode: "week", key: "2026-08-17" } },
      "2026-08-19",
    );
    expect(of(first, "RISING_CLASS")).toEqual([]);
  });
});

describe("PROLONGED_ERROR", () => {
  it("same error on consecutive counted weeks ending with the reference week", () => {
    const items = of(earlyWarnings(ds, OCT, FIXTURE_TODAY), "PROLONGED_ERROR");
    expect(items.map((w) => [w.classCode, w.errorCode, w.severity, w.evidence.streakWeeks])).toEqual([
      ["6A03", "L01", "medium", 3],
      ["7A01", "L14", "medium", 3],
    ]);
    expect(items[1]).toMatchObject({
      id: "PROLONGED_ERROR|7A01|L14|2026-10-19",
      week: "2026-10-19",
      issue: "Vệ sinh bẩn: chưa kê lại bàn ghế, bàn ăn bẩn…",
      message: "Lớp 7A01 mắc “Vệ sinh bẩn: chưa kê lại bàn ghế, bàn ăn bẩn…” (L14) 3 tuần liên tiếp",
    });
    expect(items[1].evidence.incidentIds).toEqual([V2.prolonged2, V2.prolonged1, V2.prolongedBase]);
    expect(items[1].evidence.points).toBe(6);
    expect(items[0].message).toBe("Lớp 6A03 mắc “Đi học muộn” (L01) 3 tuần liên tiếp");
  });

  it("the in-progress week is skipped only while it has no incident of that error", () => {
    // Week 19/10 viewed after it ended: 7A01 has no L14 in it → no streak; 6A03 L01 (present in 19/10) stays.
    const later = of(earlyWarnings(ds, W19, "2026-10-28"), "PROLONGED_ERROR");
    expect(later.map((w) => `${w.classCode}|${w.errorCode}`)).toEqual(["6A03|L01"]);
    // Base fixture without the extra L14 records: 7A01 L14 only once → nothing.
    expect(of(earlyWarnings(makeFixtureDataset(), OCT, FIXTURE_TODAY), "PROLONGED_ERROR").map((w) => w.classCode)).toEqual(["6A03"]);
  });

  it("thresholds and severity (high from prolongedWeeks + 2)", () => {
    const at = (c: Partial<EarlyWarningConfig>) => of(earlyWarnings(ds, OCT, FIXTURE_TODAY, { config: cfg(c) }), "PROLONGED_ERROR");
    expect(at({ prolongedWeeks: 4 })).toEqual([]);
    const loose = at({ prolongedWeeks: 1 });
    expect(loose.find((w) => w.classCode === "6A03" && w.errorCode === "L01")?.severity).toBe("high");
    expect(loose.every((w) => (w.evidence.streakWeeks ?? 0) >= 1)).toBe(true);
  });

  it("holiday weeks are skipped, not breaking the streak", () => {
    const classes = [makeClass("6A01", 6)];
    const weeks = makeDataset({ classes }).weeks.map((w) => (w.weekStart === "2026-09-14" ? { ...w, counted: false } : w));
    const small = makeDataset({
      classes,
      weeks,
      incidents: [makeIncident({ date: "2026-09-08", classCode: "6A01" }), makeIncident({ date: "2026-09-22", classCode: "6A01" })],
    });
    const items = earlyWarnings(small, { period: { mode: "week", key: "2026-09-21" } }, "2026-09-30", { config: cfg({ prolongedWeeks: 2 }) });
    expect(of(items, "PROLONGED_ERROR").map((w) => w.evidence.streakWeeks)).toEqual([2]);
  });
});

describe("SERIOUS_INCIDENT", () => {
  it("default: open incidents of a serious group (Nhóm 3/4) – 10-point Nhóm 2 errors are not serious", () => {
    const items = of(earlyWarnings(ds, OCT, FIXTURE_TODAY), "SERIOUS_INCIDENT");
    expect(items).toHaveLength(3);
    expect(items.map((w) => w.errorCode).sort()).toEqual(["L10", "L35", "L35"]);
    for (const w of items) {
      const i = ds.incidents.find((x) => x.id === w.evidence.incidentIds[0]);
      expect(i?.status).not.toBe("Đã đóng");
      expect(w.severity).toBe(i?.status === "Mới ghi nhận" ? "high" : "medium");
    }
    const serious = items.find((w) => w.evidence.incidentIds[0] === V2.serious);
    expect(serious).toMatchObject({
      id: `SERIOUS_INCIDENT|6A05|${V2.serious}|2026-10-19`,
      severity: "high",
      classCode: "6A05",
      errorCode: "L35",
      week: "2026-10-19",
      message: "NN-20261020-0006 · Lớp 6A05: Bạo lực học đường dưới mọi hình thức (Nhóm 3, −10 điểm)",
    });
    // Closed serious records (6A03 L28 / L10 on 05–07/10) are not listed.
    expect(items.some((w) => w.evidence.incidentIds[0] === "THCS_NN-20261005-0001")).toBe(false);
  });

  it("groups and penalty rule are configurable (0 disables the penalty rule)", () => {
    const at = (c: Partial<EarlyWarningConfig>) => of(earlyWarnings(ds, OCT, FIXTURE_TODAY, { config: cfg(c) }), "SERIOUS_INCIDENT");
    expect(at({ seriousGroups: [], seriousMinPenalty: 0 })).toEqual([]);
    expect(at({ seriousMinPenalty: 0 }).map((w) => w.errorCode).sort()).toEqual(["L10", "L35", "L35"]);
    // Opt-in penalty rule adds high-penalty records of other groups (e.g. L28 Đầu tóc, Nhóm 2, 10 điểm).
    expect(at({ seriousMinPenalty: 10 })).toHaveLength(5);
    expect(at({ seriousGroups: [], seriousMinPenalty: 10 }).every((w) => ["L28", "L35"].includes(w.errorCode ?? ""))).toBe(true);
  });
});

describe("earlyWarnings – list behaviour", () => {
  it("sorted by severity, kind, class, id; ids are unique", () => {
    const items = earlyWarnings(ds, OCT, FIXTURE_TODAY);
    const sev = { high: 0, medium: 1, low: 2 } as const;
    const kind = { SERIOUS_INCIDENT: 0, REPEAT_STUDENT: 1, RISING_CLASS: 2, PROLONGED_ERROR: 3 } as const;
    for (let k = 1; k < items.length; k++) {
      const a = items[k - 1];
      const b = items[k];
      expect(sev[a.severity] * 10 + kind[a.kind]).toBeLessThanOrEqual(sev[b.severity] * 10 + kind[b.kind]);
    }
    // high: SERIOUS (Mới ghi nhận) then REPEAT; medium: the SERIOUS record already being handled.
    expect(items.slice(0, 3).map((w) => w.kind)).toEqual(["SERIOUS_INCIDENT", "REPEAT_STUDENT", "SERIOUS_INCIDENT"]);
    expect(new Set(items.map((w) => w.id)).size).toBe(items.length);
  });

  it("honours class / grade / group filters", () => {
    for (const w of earlyWarnings(ds, { ...OCT, classCode: "6A03" }, FIXTURE_TODAY)) expect(w.classCode).toBe("6A03");
    for (const w of earlyWarnings(ds, { ...OCT, grade: 7 }, FIXTURE_TODAY)) expect(w.grade).toBe(7);
    const g3 = earlyWarnings(ds, { ...OCT, group: "Nhóm 3" }, FIXTURE_TODAY);
    expect(of(g3, "SERIOUS_INCIDENT").every((w) => ["L10", "L35"].includes(w.errorCode ?? ""))).toBe(true);
    expect(of(g3, "RISING_CLASS").map((w) => w.classCode)).toEqual(["6A05"]); // 10 points of Nhóm 3 vs 0 before
  });

  it("opts.config overrides the stored level thresholds", () => {
    const stored: LevelDataset = { ...ds, config: { ...ds.config, earlyWarning: cfg({ risingPct: 500 }) } };
    expect(of(earlyWarnings(stored, OCT, FIXTURE_TODAY), "RISING_CLASS")).toEqual([]);
    expect(of(earlyWarnings(stored, OCT, FIXTURE_TODAY, { config: DEFAULT_EARLY_WARNING }), "RISING_CLASS")).toHaveLength(2);
  });

  it("a period without started weeks has no class-level warnings", () => {
    const items = earlyWarnings(ds, { period: { mode: "month", key: "2026-11" } }, FIXTURE_TODAY);
    expect(items).toEqual([]);
  });
});
