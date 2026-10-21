/**
 * Early warnings (REQ_V2 §4.5, hạng mục 10): tái phạm, tăng lỗi, lỗi kéo dài, sự việc nghiêm trọng – one unified list
 * for Tổng quan, Hành động, Báo cáo and the settings preview. Thresholds: LevelConfig.earlyWarning (engine defaults
 * when absent); tái phạm uses the existing config.studentAlert.
 */
import type { EarlyWarningConfig, GlobalFilters, Incident, LevelConfig, LevelDataset, Period } from "../types";
import { compareIncidentsNewestFirst, studentStats, type StudentStat } from "./analytics-students";
import { diffDays, formatDayMonthVN, mondayOf } from "./dates";
import { filterIncidents } from "./filters";
import { ALL_PERIOD, elapsedWeeksInPeriod } from "./period";
import { round2 } from "./scoring";
import { formatNumberVN, naturalCompare } from "./text";
import { compareClassInfo, compareStr, groupBy, sortWeeks, sumBy } from "./utils";

export const DEFAULT_EARLY_WARNING: EarlyWarningConfig = {
  risingPct: 50,
  risingMinPoints: 6,
  risingBaselineWeeks: 4,
  prolongedWeeks: 3,
  seriousGroups: ["Nhóm 3", "Nhóm 4"],
  // 0 = off: by default only the school's serious groups (Nhóm 3, Nhóm 4) count – 10-point Nhóm 2 errors
  // (trang điểm, đầu tóc…) are not "nghiêm trọng". Admins can set a penalty threshold in Cài đặt → Cảnh báo sớm.
  seriousMinPenalty: 0,
};

const isNum = (v: unknown, min: number, integer = false): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && (!integer || Number.isInteger(v));

/**
 * { ...DEFAULT_EARLY_WARNING, ...config.earlyWarning } – missing / invalid fields fall back to the defaults
 * (numbers must be finite and ≥ 0; risingBaselineWeeks / prolongedWeeks integers ≥ 1; seriousGroups an array – its
 * entries trimmed, empty ones dropped; [] is valid). Always returns a fresh object.
 */
export function resolveEarlyWarning(config: Pick<LevelConfig, "earlyWarning">): EarlyWarningConfig {
  const d = DEFAULT_EARLY_WARNING;
  const raw = (config?.earlyWarning ?? {}) as Partial<Record<keyof EarlyWarningConfig, unknown>>;
  const groups = Array.isArray(raw.seriousGroups)
    ? [...new Set(raw.seriousGroups.filter((g): g is string => typeof g === "string").map((g) => g.trim()).filter(Boolean))]
    : [...d.seriousGroups];
  return {
    risingPct: isNum(raw.risingPct, 0) ? raw.risingPct : d.risingPct,
    risingMinPoints: isNum(raw.risingMinPoints, 0) ? raw.risingMinPoints : d.risingMinPoints,
    risingBaselineWeeks: isNum(raw.risingBaselineWeeks, 1, true) ? raw.risingBaselineWeeks : d.risingBaselineWeeks,
    prolongedWeeks: isNum(raw.prolongedWeeks, 1, true) ? raw.prolongedWeeks : d.prolongedWeeks,
    seriousGroups: groups,
    seriousMinPenalty: isNum(raw.seriousMinPenalty, 0) ? raw.seriousMinPenalty : d.seriousMinPenalty,
  };
}

export type EarlyWarningKind = "REPEAT_STUDENT" | "RISING_CLASS" | "PROLONGED_ERROR" | "SERIOUS_INCIDENT";
export type WarningSeverity = "high" | "medium" | "low";

export const EARLY_WARNING_KIND_LABELS: Record<EarlyWarningKind, string> = {
  REPEAT_STUDENT: "Tái phạm",
  RISING_CLASS: "Tăng lỗi",
  PROLONGED_ERROR: "Lỗi kéo dài",
  SERIOUS_INCIDENT: "Sự việc nghiêm trọng",
};

export interface EarlyWarning {
  /**
   * Stable React key `${kind}|${classCode}|${subject}|${week ?? ""}`; subject = studentId (REPEAT_STUDENT),
   * errorCode (PROLONGED_ERROR), incident id (SERIOUS_INCIDENT), "" (RISING_CLASS).
   */
  id: string;
  kind: EarlyWarningKind;
  severity: WarningSeverity;
  classCode: string;
  grade: number;
  studentId?: string;
  studentName?: string;
  errorCode?: string;
  issue?: string;
  /** Reference week (Monday). */
  week?: string;
  /** Vietnamese one-liner. */
  message: string;
  evidence: { incidentIds: string[]; current?: number; baseline?: number; streakWeeks?: number; points?: number };
}

/**
 * Reference week of a period: week mode → its key; otherwise the last calendar week of the period with
 * weekStart ≤ Monday(today) (holiday weeks included). undefined when the period has no elapsed week.
 */
export function warningReferenceWeek(ds: Pick<LevelDataset, "weeks">, period: Period, today: string): string | undefined {
  if (period.mode === "week" && period.key) return period.key;
  const elapsed = elapsedWeeksInPeriod(period, ds.weeks, today);
  return elapsed.length ? elapsed[elapsed.length - 1].weekStart : undefined;
}

const SEVERITY_ORDER: Record<WarningSeverity, number> = { high: 0, medium: 1, low: 2 };
const KIND_ORDER: Record<EarlyWarningKind, number> = { SERIOUS_INCIDENT: 0, REPEAT_STUDENT: 1, RISING_CLASS: 2, PROLONGED_ERROR: 3 };

const ids = (list: readonly Incident[]) => [...list].sort(compareIncidentsNewestFirst).map((i) => i.id);
const names = (i: Incident, studentId: string) => i.students.some((s) => s.id === studentId);

function repeatWarnings(ds: LevelDataset, f: GlobalFilters, today: string, period: Incident[], history: Incident[]): EarlyWarning[] {
  const { repeatWindowWeeks, repeatMin } = ds.config.studentAlert;
  const span = 7 * Math.max(1, repeatWindowWeeks);
  return studentStats(ds, f, today)
    .filter((s) => s.alert !== "NONE")
    .map((s: StudentStat): EarlyWarning => {
      const own = period.filter((i) => names(i, s.id));
      let week = "";
      let count = 0;
      let message: string;
      if (s.alert === "WEEKLY_RED") {
        for (const [w, list] of groupBy(own, (i) => i.week)) {
          if (list.length > count || (list.length === count && w > week)) [week, count] = [w, list.length];
        }
        message = `${s.name} (${s.classCode}): ${count} lượt vi phạm trong tuần ${formatDayMonthVN(week)}`;
      } else {
        // As studentStats: the latest period week ending a window of repeatWindowWeeks weeks with ≥ repeatMin incidents.
        const historyWeeks = history.filter((i) => names(i, s.id)).map((i) => i.week);
        const ends = [...new Set(own.map((i) => i.week))].sort((a, b) => compareStr(b, a));
        for (const end of ends) {
          const n = historyWeeks.filter((w) => {
            const d = diffDays(end, w);
            return d >= 0 && d < span;
          }).length;
          if (n >= repeatMin) {
            [week, count] = [end, n];
            break;
          }
        }
        if (!week) [week, count] = [ends[0] ?? "", own.length];
        message = `${s.name} (${s.classCode}) tái phạm: ${count} lượt trong ${Math.max(1, repeatWindowWeeks)} tuần`;
      }
      const w: EarlyWarning = {
        id: `REPEAT_STUDENT|${s.classCode}|${s.id}|${week}`,
        kind: "REPEAT_STUDENT",
        severity: s.alert === "WEEKLY_RED" ? "high" : "medium",
        classCode: s.classCode,
        grade: s.grade,
        studentId: s.id,
        studentName: s.name,
        message,
        evidence: { incidentIds: ids(own), current: count, points: s.points },
      };
      if (week) w.week = week;
      return w;
    });
}

function seriousWarnings(period: Incident[], cfg: EarlyWarningConfig): EarlyWarning[] {
  const groups = new Set(cfg.seriousGroups);
  const out: EarlyWarning[] = [];
  for (const i of period) {
    if (i.status === "Đã đóng") continue;
    const group = i.group?.trim() ?? "";
    const byGroup = group !== "" && groups.has(group);
    const byPenalty = cfg.seriousMinPenalty > 0 && i.penalty >= cfg.seriousMinPenalty;
    if (!byGroup && !byPenalty) continue;
    const pts = i.points > 0 ? `−${formatNumberVN(i.points)} điểm` : "0 điểm";
    out.push({
      id: `SERIOUS_INCIDENT|${i.classCode}|${i.id}|${i.week}`,
      kind: "SERIOUS_INCIDENT",
      severity: i.status === "Mới ghi nhận" ? "high" : "medium",
      classCode: i.classCode,
      grade: i.grade,
      errorCode: i.errorCode,
      issue: i.issue,
      week: i.week,
      message: `${i.code} · Lớp ${i.classCode}: ${i.issue} (${group ? `${group}, ` : ""}${pts})`,
      evidence: { incidentIds: [i.id], points: i.points },
    });
  }
  return out;
}

/**
 * Unified early-warning list for the filtered scope. `opts.config` overrides the level thresholds (settings preview).
 * Every rule honours grade / class / category / error / group / student filters; RISING_CLASS and PROLONGED_ERROR run
 * over the active classes of the scope and the reference week R = warningReferenceWeek(f.period).
 * - REPEAT_STUDENT: studentStats rows with alert ≠ NONE (config.studentAlert); WEEKLY_RED → high, REPEAT → medium.
 * - RISING_CLASS: penalty of R ≥ risingMinPoints (and > 0) and ≥ baseline × (1 + risingPct / 100); baseline = mean
 *   penalty of the up to risingBaselineWeeks counted calendar weeks before R (zeros included; skipped when none);
 *   high when ≥ config.rag.red.
 * - PROLONGED_ERROR: same error in a class on ≥ prolongedWeeks consecutive counted calendar weeks ending with R (holiday
 *   weeks skipped; the in-progress current week skipped while it has no incident of that error); high when ≥ +2 weeks.
 * - SERIOUS_INCIDENT: period incidents not "Đã đóng" whose group is serious or whose penalty ≥ seriousMinPenalty (> 0);
 *   "Mới ghi nhận" → high, otherwise medium.
 * Sorted by severity, kind (SERIOUS_INCIDENT, REPEAT_STUDENT, RISING_CLASS, PROLONGED_ERROR), class (natural), id.
 * Works on redacted datasets (REPEAT_STUDENT only for students whose names are visible).
 */
export function earlyWarnings(ds: LevelDataset, f: GlobalFilters, today: string, opts: { config?: EarlyWarningConfig } = {}): EarlyWarning[] {
  const cfg = resolveEarlyWarning({ earlyWarning: opts.config ?? ds.config.earlyWarning });
  const period = filterIncidents(ds, f);
  const history = filterIncidents(ds, { ...f, period: ALL_PERIOD });
  const items: EarlyWarning[] = [...repeatWarnings(ds, f, today, period, history), ...seriousWarnings(period, cfg)];

  const ref = warningReferenceWeek(ds, f.period, today);
  if (ref) {
    const hasGrade = typeof f.grade === "number";
    const classes = ds.classes
      .filter((c) => c.active && (!hasGrade || c.grade === f.grade) && (!f.classCode || c.code === f.classCode))
      .sort(compareClassInfo);
    const counted = sortWeeks(ds.weeks).filter((w) => w.counted);
    const byClassWeek = groupBy(history, (i) => `${i.classCode}|${i.week}`);
    const penaltyOf = (code: string, week: string) => sumBy(byClassWeek.get(`${code}|${week}`) ?? [], (i) => i.points);

    // RISING_CLASS
    const baselineWeeks = counted.filter((w) => w.weekStart < ref).slice(-cfg.risingBaselineWeeks).map((w) => w.weekStart);
    if (baselineWeeks.length > 0) {
      for (const c of classes) {
        const current = penaltyOf(c.code, ref);
        if (current <= 0 || current < cfg.risingMinPoints) continue;
        const baselineRaw = baselineWeeks.reduce((s, w) => s + penaltyOf(c.code, w), 0) / baselineWeeks.length;
        if (current + 1e-9 < baselineRaw * (1 + cfg.risingPct / 100)) continue;
        const baseline = round2(baselineRaw);
        const head = `Lớp ${c.code}: ${formatNumberVN(current)} điểm trừ tuần ${formatDayMonthVN(ref)}`;
        const message =
          baselineRaw > 0
            ? `${head}, tăng ${Math.round(((current - baselineRaw) / baselineRaw) * 100)}% so với TB ${baselineWeeks.length} tuần trước (${formatNumberVN(baseline)})`
            : `${head}, tăng từ 0 điểm`;
        items.push({
          id: `RISING_CLASS|${c.code}||${ref}`,
          kind: "RISING_CLASS",
          severity: current >= ds.config.rag.red ? "high" : "medium",
          classCode: c.code,
          grade: c.grade,
          week: ref,
          message,
          evidence: { incidentIds: ids(byClassWeek.get(`${c.code}|${ref}`) ?? []), current, baseline, points: current },
        });
      }
    }

    // PROLONGED_ERROR
    const streakWeeks = counted.filter((w) => w.weekStart <= ref).map((w) => w.weekStart);
    const currentMonday = mondayOf(today);
    const byClassErrorWeek = groupBy(history, (i) => `${i.classCode}|${i.errorCode}|${i.week}`);
    const errorsByClass = groupBy(history, (i) => i.classCode);
    for (const c of classes) {
      const errorCodes = [...new Set((errorsByClass.get(c.code) ?? []).map((i) => i.errorCode))].sort(naturalCompare);
      for (const errorCode of errorCodes) {
        const listOf = (week: string) => byClassErrorWeek.get(`${c.code}|${errorCode}|${week}`);
        let idx = streakWeeks.length - 1;
        if (idx >= 0 && streakWeeks[idx] === currentMonday && !listOf(streakWeeks[idx])) idx--;
        const evidence: Incident[] = [];
        let streak = 0;
        for (let k = idx; k >= 0; k--) {
          const list = listOf(streakWeeks[k]);
          if (!list) break;
          streak++;
          evidence.push(...list);
        }
        if (streak < cfg.prolongedWeeks) continue;
        const latest = [...evidence].sort(compareIncidentsNewestFirst)[0];
        items.push({
          id: `PROLONGED_ERROR|${c.code}|${errorCode}|${ref}`,
          kind: "PROLONGED_ERROR",
          severity: streak >= cfg.prolongedWeeks + 2 ? "high" : "medium",
          classCode: c.code,
          grade: c.grade,
          errorCode,
          issue: latest.issue,
          week: ref,
          message: `Lớp ${c.code} mắc “${latest.issue}” (${errorCode}) ${streak} tuần liên tiếp`,
          evidence: { incidentIds: ids(evidence), streakWeeks: streak, points: sumBy(evidence, (i) => i.points) },
        });
      }
    }
  }

  return items.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      naturalCompare(a.classCode, b.classCode) ||
      compareStr(a.id, b.id),
  );
}

/** Number of warnings per kind (every kind present, zeros included). */
export function earlyWarningCounts(items: readonly EarlyWarning[]): Record<EarlyWarningKind, number> {
  const out: Record<EarlyWarningKind, number> = { REPEAT_STUDENT: 0, RISING_CLASS: 0, PROLONGED_ERROR: 0, SERIOUS_INCIDENT: 0 };
  for (const w of items) out[w.kind]++;
  return out;
}
