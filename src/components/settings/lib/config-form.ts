/**
 * "Cấu hình thi đua" form model: LevelConfig ⇄ flat draft, validation (Vietnamese messages + ConfigUpdateSchema),
 * minimal PUT patch (only changed groups) and the RAG approval rule (changing a threshold withdraws the approval).
 */
import { ConfigUpdateSchema, type ConfigUpdateInput } from "@/lib/contract";
import { REWARD_STATUSES } from "@/lib/constants";
import { addDays, diffDays, formatDateVN, isIsoDate, mondayOf } from "@/lib/engine/dates";
import type { LevelConfig, RewardStatus } from "@/lib/types";
import { sameValue } from "./draft";

export interface SemesterDraft {
  code: string;
  name: string;
  start: string;
  end: string;
}

export interface ConfigDraft {
  schoolYear: string;
  baseScorePerWeek: number;
  firstWeek: string;
  semesters: SemesterDraft[];
  ragYellow: number;
  ragRed: number;
  ragApproved: boolean;
  /** 0..100 (stored as a 0..1 ratio) */
  minConfidencePct: number;
  rewardCountedStatuses: RewardStatus[];
  /** 50..100 (stored as a 0.5..1 ratio) */
  top90Pct: number;
  alertPerWeek: number;
  alertRepeatMin: number;
  alertRepeatWindowWeeks: number;
  slaHigh: number;
  slaMedium: number;
  slaLow: number;
}

/** Field key → Vietnamese error. Keys are ConfigDraft fields or `semesters.<i>.start|end`. */
export type ConfigErrors = Record<string, string>;

export type ConfigGroup = keyof Required<ConfigUpdateInput>;

const GROUP_FIELDS: Record<ConfigGroup, ReadonlyArray<keyof ConfigDraft>> = {
  schoolYear: ["schoolYear"],
  baseScorePerWeek: ["baseScorePerWeek"],
  firstWeek: ["firstWeek"],
  semesters: ["semesters"],
  rag: ["ragYellow", "ragRed", "ragApproved", "minConfidencePct"],
  rewardCountedStatuses: ["rewardCountedStatuses"],
  top90Ratio: ["top90Pct"],
  studentAlert: ["alertPerWeek", "alertRepeatMin", "alertRepeatWindowWeeks"],
  actionSlaDays: ["slaHigh", "slaMedium", "slaLow"],
};

export const CONFIG_GROUP_LABELS: Record<ConfigGroup, string> = {
  schoolYear: "Năm học",
  baseScorePerWeek: "Điểm nền",
  firstWeek: "Tuần đầu tính thi đua",
  semesters: "Học kỳ",
  rag: "Ngưỡng cảnh báo",
  rewardCountedStatuses: "Trạng thái điểm thưởng",
  top90Ratio: "Tỷ lệ Top",
  studentAlert: "Cảnh báo học sinh",
  actionSlaDays: "Thời hạn xử lý",
};

const toPct = (ratio: number) => Math.round(ratio * 100);
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function draftFromConfig(c: LevelConfig): ConfigDraft {
  return {
    schoolYear: c.schoolYear,
    baseScorePerWeek: c.baseScorePerWeek,
    firstWeek: c.firstWeek,
    semesters: c.semesters.map((s) => ({ code: s.code, name: s.name, start: s.start, end: s.end })),
    ragYellow: c.rag.yellow,
    ragRed: c.rag.red,
    ragApproved: c.rag.approved,
    minConfidencePct: toPct(c.rag.minConfidence),
    rewardCountedStatuses: REWARD_STATUSES.filter((s) => c.rewardCountedStatuses.includes(s)),
    top90Pct: toPct(c.top90Ratio),
    alertPerWeek: c.studentAlert.perWeek,
    alertRepeatMin: c.studentAlert.repeatMin,
    alertRepeatWindowWeeks: c.studentAlert.repeatWindowWeeks,
    slaHigh: c.actionSlaDays.High,
    slaMedium: c.actionSlaDays.Medium,
    slaLow: c.actionSlaDays.Low,
  };
}

/** Full PUT body for the draft (every group). */
export function payloadFromDraft(d: ConfigDraft): Required<ConfigUpdateInput> {
  return {
    schoolYear: d.schoolYear.trim(),
    baseScorePerWeek: d.baseScorePerWeek,
    firstWeek: d.firstWeek,
    semesters: d.semesters.map((s) => ({ code: s.code, name: s.name, start: s.start, end: s.end })),
    rag: { yellow: d.ragYellow, red: d.ragRed, approved: d.ragApproved, minConfidence: round4(d.minConfidencePct / 100) },
    rewardCountedStatuses: REWARD_STATUSES.filter((s) => d.rewardCountedStatuses.includes(s)),
    top90Ratio: round4(d.top90Pct / 100),
    studentAlert: { perWeek: d.alertPerWeek, repeatWindowWeeks: d.alertRepeatWindowWeeks, repeatMin: d.alertRepeatMin },
    actionSlaDays: { High: d.slaHigh, Medium: d.slaMedium, Low: d.slaLow },
  };
}

/** Groups whose fields differ between the draft and the saved config. */
export function changedConfigGroups(draft: ConfigDraft, base: ConfigDraft): ConfigGroup[] {
  return (Object.keys(GROUP_FIELDS) as ConfigGroup[]).filter((g) => GROUP_FIELDS[g].some((f) => !sameValue(draft[f], base[f])));
}

/** PUT body with only the changed groups (the server merges). */
export function configPatch(draft: ConfigDraft, base: ConfigDraft): ConfigUpdateInput {
  const full = payloadFromDraft(draft);
  const out: ConfigUpdateInput = {};
  for (const g of changedConfigGroups(draft, base)) Object.assign(out, { [g]: full[g] });
  return out;
}

/** The calendar inputs changed (existing weeks are NOT moved automatically). */
export function calendarChanged(draft: ConfigDraft, base: ConfigDraft): boolean {
  return draft.firstWeek !== base.firstWeek || !sameValue(draft.semesters, base.semesters);
}

/**
 * Set the yellow/red thresholds. Changing a value while the thresholds are approved withdraws the approval
 * (the new numbers must be confirmed again as approved by BGH).
 */
export function withRagThresholds(d: ConfigDraft, patch: { ragYellow?: number; ragRed?: number }): { draft: ConfigDraft; unapproved: boolean } {
  const yellow = patch.ragYellow ?? d.ragYellow;
  const red = patch.ragRed ?? d.ragRed;
  const changed = yellow !== d.ragYellow || red !== d.ragRed;
  const unapproved = changed && d.ragApproved;
  return { draft: { ...d, ragYellow: yellow, ragRed: red, ragApproved: unapproved ? false : d.ragApproved }, unapproved };
}

/** Number of school weeks (Mondays) whose Monday falls in [start, end]; undefined for invalid dates. */
export function semesterWeekCount(s: Pick<SemesterDraft, "start" | "end">): number | undefined {
  if (!isIsoDate(s.start) || !isIsoDate(s.end) || s.end < s.start) return undefined;
  const monday = mondayOf(s.start);
  const first = monday < s.start ? addDays(monday, 7) : monday;
  if (first > s.end) return 0;
  return Math.floor(diffDays(s.end, first) / 7) + 1;
}

const isInt = (n: number) => Number.isFinite(n) && Number.isInteger(n);
const inRange = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

/** Field-level validation with Vietnamese messages, then the contract schema as a final guard. */
export function validateConfigDraft(d: ConfigDraft): ConfigErrors {
  const e: ConfigErrors = {};
  const sy = /^(\d{4})-(\d{4})$/.exec(d.schoolYear.trim());
  if (!sy || Number(sy[2]) !== Number(sy[1]) + 1) e.schoolYear = "Năm học có dạng 2026-2027 (hai năm liên tiếp).";
  if (!inRange(d.baseScorePerWeek, 0, 10_000)) e.baseScorePerWeek = "Điểm nền từ 0 đến 10.000 điểm.";

  if (!isIsoDate(d.firstWeek)) e.firstWeek = "Chọn ngày bắt đầu của tuần đầu tiên.";
  else if (mondayOf(d.firstWeek) !== d.firstWeek) e.firstWeek = `Tuần đầu phải bắt đầu vào Thứ Hai (gợi ý: ${formatDateVN(mondayOf(d.firstWeek))}).`;

  if (d.semesters.length === 0) e.semesters = "Cần ít nhất một học kỳ.";
  let lastEnd = "";
  d.semesters.forEach((s, i) => {
    const okStart = isIsoDate(s.start);
    const okEnd = isIsoDate(s.end);
    if (!okStart) e[`semesters.${i}.start`] = "Chọn ngày bắt đầu.";
    if (!okEnd) e[`semesters.${i}.end`] = "Chọn ngày kết thúc.";
    if (okStart && okEnd && s.start > s.end) e[`semesters.${i}.end`] = "Ngày kết thúc phải sau ngày bắt đầu.";
    const prev = d.semesters[i - 1];
    if (prev && okStart && isIsoDate(prev.end) && s.start <= prev.end && !e[`semesters.${i}.start`]) {
      e[`semesters.${i}.start`] = `${s.name || s.code} phải bắt đầu sau ngày ${formatDateVN(prev.end)} (kết thúc ${prev.name || prev.code}).`;
    }
    if (okEnd && s.end > lastEnd) lastEnd = s.end;
  });
  if (!e.firstWeek && lastEnd && d.firstWeek > lastEnd) e.firstWeek = "Tuần đầu nằm sau ngày kết thúc học kỳ cuối.";

  if (!inRange(d.ragYellow, 0, 1000)) e.ragYellow = "Từ 0 đến 1.000 điểm trừ/tuần.";
  if (!inRange(d.ragRed, 0, 1000)) e.ragRed = "Từ 0 đến 1.000 điểm trừ/tuần.";
  if (!e.ragYellow && !e.ragRed && d.ragRed <= d.ragYellow) e.ragRed = "Ngưỡng Đỏ phải lớn hơn ngưỡng Vàng.";
  if (!inRange(d.minConfidencePct, 0, 100)) e.minConfidencePct = "Từ 0% đến 100%.";
  if (!inRange(d.top90Pct, 50, 100)) e.top90Pct = "Tỷ lệ Top từ 50% đến 100%.";
  if (!isInt(d.alertPerWeek) || !inRange(d.alertPerWeek, 1, 20)) e.alertPerWeek = "Số nguyên từ 1 đến 20.";
  if (!isInt(d.alertRepeatMin) || !inRange(d.alertRepeatMin, 2, 20)) e.alertRepeatMin = "Số nguyên từ 2 đến 20.";
  if (!isInt(d.alertRepeatWindowWeeks) || !inRange(d.alertRepeatWindowWeeks, 1, 20)) e.alertRepeatWindowWeeks = "Số nguyên từ 1 đến 20.";
  for (const k of ["slaHigh", "slaMedium", "slaLow"] as const) {
    if (!isInt(d[k]) || !inRange(d[k], 1, 365)) e[k] = "Số ngày nguyên từ 1 đến 365.";
  }

  const parsed = ConfigUpdateSchema.safeParse(payloadFromDraft(d));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = configFieldOfPath(issue.path.join(".")) ?? "";
      if (key && !e[key]) e[key] = issue.message && !/^[\x20-\x7e]*$/.test(issue.message) ? issue.message : "Giá trị không hợp lệ.";
    }
  }
  return e;
}

/** Map a contract/server path ("rag.yellow", "semesters.0.start", "top90Ratio"…) to the draft field key. */
export function configFieldOfPath(path: string): string | undefined {
  const p = path.trim();
  if (/^semesters\.\d+\.(start|end)$/.test(p)) return p;
  if (/^semesters(\.\d+)?/.test(p)) return "semesters";
  const map: Record<string, string> = {
    schoolYear: "schoolYear",
    baseScorePerWeek: "baseScorePerWeek",
    firstWeek: "firstWeek",
    rag: "ragRed",
    "rag.yellow": "ragYellow",
    "rag.red": "ragRed",
    "rag.approved": "ragApproved",
    "rag.minConfidence": "minConfidencePct",
    rewardCountedStatuses: "rewardCountedStatuses",
    top90Ratio: "top90Pct",
    "studentAlert.perWeek": "alertPerWeek",
    "studentAlert.repeatMin": "alertRepeatMin",
    "studentAlert.repeatWindowWeeks": "alertRepeatWindowWeeks",
    "actionSlaDays.High": "slaHigh",
    "actionSlaDays.Medium": "slaMedium",
    "actionSlaDays.Low": "slaLow",
  };
  if (map[p]) return map[p];
  const top = p.split(".")[0];
  return top.startsWith("rewardCountedStatuses") ? "rewardCountedStatuses" : undefined;
}

/** Errors keyed by draft field from server validation issues (`validationIssues(err)`); unmatched ones are returned apart. */
export function configServerErrors(issues: ReadonlyArray<{ path: string; message: string }>): { fields: ConfigErrors; general: string[] } {
  const fields: ConfigErrors = {};
  const general: string[] = [];
  for (const i of issues) {
    const key = configFieldOfPath(i.path);
    if (key && !fields[key]) fields[key] = i.message;
    else if (!key && !general.includes(i.message)) general.push(i.message);
  }
  return { fields, general };
}
