/**
 * "Cảnh báo sớm" settings (REQ_V2 §7.7): draft = the resolved thresholds (engine `resolveEarlyWarning`), Vietnamese
 * validation mirroring EarlyWarningPutSchema, PUT payload, change summary and the live preview counts. Pure – unit-tested.
 */
import { EarlyWarningPutSchema, type EarlyWarningPutInput } from "@/lib/contract";
import {
  earlyWarningCounts,
  earlyWarnings,
  mondayOf,
  naturalCompare,
  resolveEarlyWarning,
  type EarlyWarningKind,
} from "@/lib/engine";
import type { CatalogItem, EarlyWarningConfig, LevelConfig, LevelDataset } from "@/lib/types";
import { sameValue } from "./draft";

export type EarlyWarningDraft = EarlyWarningConfig;
export type EarlyWarningField = keyof EarlyWarningConfig;
export type EarlyWarningErrors = Partial<Record<EarlyWarningField, string>>;

export const EARLY_WARNING_LIMITS = {
  risingPct: { min: 10, max: 500 },
  risingMinPoints: { min: 0, max: 1000 },
  risingBaselineWeeks: { min: 1, max: 12 },
  prolongedWeeks: { min: 2, max: 12 },
  seriousMinPenalty: { min: 0, max: 1000 },
  seriousGroups: { max: 10, nameMax: 60 },
} as const;

export const EARLY_WARNING_FIELD_LABELS: Record<EarlyWarningField, string> = {
  risingPct: "Tăng lỗi: % tăng",
  risingMinPoints: "Tăng lỗi: điểm tối thiểu",
  risingBaselineWeeks: "Tăng lỗi: số tuần làm nền",
  prolongedWeeks: "Lỗi kéo dài",
  seriousGroups: "Nhóm lỗi nghiêm trọng",
  seriousMinPenalty: "Mức trừ nghiêm trọng",
};

/** Draft of the level: stored thresholds with the engine defaults for missing / invalid values (fresh object). */
export function earlyWarningDraft(config: Pick<LevelConfig, "earlyWarning">): EarlyWarningDraft {
  return resolveEarlyWarning(config);
}

/** Catalog groups (natural order) + configured groups missing from the catalog (kept visible so they can be unticked). */
export function seriousGroupChoices(catalog: readonly Pick<CatalogItem, "group">[], selected: readonly string[]): Array<{ group: string; inCatalog: boolean }> {
  const fromCatalog = [...new Set(catalog.map((c) => c.group?.trim() ?? "").filter(Boolean))].sort(naturalCompare);
  const extra = selected.filter((g) => !fromCatalog.includes(g)).sort(naturalCompare);
  return [...fromCatalog.map((group) => ({ group, inCatalog: true })), ...extra.map((group) => ({ group, inCatalog: false }))];
}

/** Ticks / unticks a group, keeping the natural order. */
export function toggleSeriousGroup(groups: readonly string[], group: string, on: boolean): string[] {
  const set = new Set(groups);
  if (on) set.add(group);
  else set.delete(group);
  return [...set].sort(naturalCompare);
}

const isInt = (n: number) => Number.isFinite(n) && Number.isInteger(n);
const inRange = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

/** Field errors (Vietnamese), then the contract schema as a final guard. */
export function validateEarlyWarningDraft(d: EarlyWarningDraft): EarlyWarningErrors {
  const e: EarlyWarningErrors = {};
  const L = EARLY_WARNING_LIMITS;
  if (!isInt(d.risingPct) || !inRange(d.risingPct, L.risingPct.min, L.risingPct.max)) e.risingPct = `Số nguyên từ ${L.risingPct.min} đến ${L.risingPct.max} (%).`;
  if (!inRange(d.risingMinPoints, L.risingMinPoints.min, L.risingMinPoints.max)) e.risingMinPoints = `Từ ${L.risingMinPoints.min} đến ${L.risingMinPoints.max} điểm.`;
  if (!isInt(d.risingBaselineWeeks) || !inRange(d.risingBaselineWeeks, L.risingBaselineWeeks.min, L.risingBaselineWeeks.max)) {
    e.risingBaselineWeeks = `Số nguyên từ ${L.risingBaselineWeeks.min} đến ${L.risingBaselineWeeks.max} tuần.`;
  }
  if (!isInt(d.prolongedWeeks) || !inRange(d.prolongedWeeks, L.prolongedWeeks.min, L.prolongedWeeks.max)) {
    e.prolongedWeeks = `Số nguyên từ ${L.prolongedWeeks.min} đến ${L.prolongedWeeks.max} tuần.`;
  }
  if (!inRange(d.seriousMinPenalty, L.seriousMinPenalty.min, L.seriousMinPenalty.max)) e.seriousMinPenalty = `Từ ${L.seriousMinPenalty.min} đến ${L.seriousMinPenalty.max} điểm (0 = không dùng).`;
  if (d.seriousGroups.length > L.seriousGroups.max) e.seriousGroups = `Chọn tối đa ${L.seriousGroups.max} nhóm lỗi.`;
  else if (d.seriousGroups.some((g) => !g.trim() || g.trim().length > L.seriousGroups.nameMax)) e.seriousGroups = "Tên nhóm lỗi không hợp lệ.";

  const parsed = EarlyWarningPutSchema.safeParse(earlyWarningPayload(d));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = earlyWarningFieldOfPath(issue.path.join("."));
      if (key && !e[key]) e[key] = "Giá trị không hợp lệ.";
    }
  }
  return e;
}

/** PUT /api/settings/:level/early-warning body (groups trimmed, unique, natural order). */
export function earlyWarningPayload(d: EarlyWarningDraft): EarlyWarningPutInput {
  return {
    risingPct: d.risingPct,
    risingMinPoints: d.risingMinPoints,
    risingBaselineWeeks: d.risingBaselineWeeks,
    prolongedWeeks: d.prolongedWeeks,
    seriousGroups: [...new Set(d.seriousGroups.map((g) => g.trim()).filter(Boolean))].sort(naturalCompare),
    seriousMinPenalty: d.seriousMinPenalty,
  };
}

/** Labels of the fields that differ from the saved thresholds ("Đã sửa: …" of the SaveBar). */
export function changedEarlyWarningFields(draft: EarlyWarningDraft, base: EarlyWarningDraft): string[] {
  return (Object.keys(EARLY_WARNING_FIELD_LABELS) as EarlyWarningField[])
    .filter((k) => (k === "seriousGroups" ? !sameValue([...draft[k]].sort(), [...base[k]].sort()) : draft[k] !== base[k]))
    .map((k) => EARLY_WARNING_FIELD_LABELS[k]);
}

/** Server / schema path ("risingPct", "seriousGroups.0") → draft field. */
export function earlyWarningFieldOfPath(path: string): EarlyWarningField | undefined {
  const top = path.trim().split(".")[0];
  return top in EARLY_WARNING_FIELD_LABELS ? (top as EarlyWarningField) : undefined;
}

/** Field errors from server validation issues (`validationIssues(err)`); unmatched messages are returned apart. */
export function earlyWarningServerErrors(issues: ReadonlyArray<{ path: string; message: string }>): { fields: EarlyWarningErrors; general: string[] } {
  const fields: EarlyWarningErrors = {};
  const general: string[] = [];
  for (const i of issues) {
    const key = earlyWarningFieldOfPath(i.path);
    if (key && !fields[key]) fields[key] = i.message;
    else if (!key && !general.includes(i.message)) general.push(i.message);
  }
  return { fields, general };
}

export interface EarlyWarningPreview {
  /** Monday of the current week. */
  week: string;
  total: number;
  counts: Record<EarlyWarningKind, number>;
  /** Same week with the saved thresholds. */
  savedTotal: number;
}

/**
 * "Với ngưỡng này: n cảnh báo trong tuần hiện tại": earlyWarnings of the current week with the draft (sanitised by the
 * engine resolver, so an invalid value being typed never breaks the preview) vs the saved thresholds.
 */
export function earlyWarningPreview(ds: LevelDataset, draft: EarlyWarningDraft, today: string): EarlyWarningPreview {
  const week = mondayOf(today);
  const period = { mode: "week" as const, key: week };
  const items = earlyWarnings(ds, { period }, today, { config: resolveEarlyWarning({ earlyWarning: draft }) });
  const saved = earlyWarnings(ds, { period }, today);
  return { week, total: items.length, counts: earlyWarningCounts(items), savedTotal: saved.length };
}
