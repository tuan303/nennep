/**
 * Pure helpers of the "Cảnh báo sớm" card (Tổng quan) and the report's warning block: role scoping, kind badges and
 * severity tones. The warnings themselves come from the engine (`earlyWarnings`). Unit-tested.
 */
import type { Tone } from "@/components/ui/tones";
import { EARLY_WARNING_KIND_LABELS, earlyWarningCounts, type EarlyWarning, type EarlyWarningKind, type WarningSeverity } from "@/lib/engine/early-warning";
import type { LevelId, UserProfile } from "@/lib/types";

/** Display order of the kind badges (most urgent first, as the engine sort). */
export const WARNING_KIND_ORDER: readonly EarlyWarningKind[] = ["SERIOUS_INCIDENT", "REPEAT_STUDENT", "RISING_CLASS", "PROLONGED_ERROR"];

export const SEVERITY_TONE: Record<WarningSeverity, Tone> = { high: "bad", medium: "warn", low: "muted" };
export const SEVERITY_LABEL: Record<WarningSeverity, string> = { high: "Mức cao", medium: "Mức trung bình", low: "Mức thấp" };

/** Badge tone of a kind (also used without a severity, e.g. the counters). */
export const KIND_TONE: Record<EarlyWarningKind, Tone> = {
  SERIOUS_INCIDENT: "bad",
  REPEAT_STUDENT: "warn",
  RISING_CLASS: "brand",
  PROLONGED_ERROR: "star",
};

/**
 * GVCN only see warnings of their own classes in this level (the engine already hides other classes' students; this
 * also drops class-level warnings of other classes). Other roles: unchanged.
 */
export function scopeWarningsForViewer(
  items: readonly EarlyWarning[],
  profile: Pick<UserProfile, "role" | "gvcnClasses"> | undefined,
  levelId: LevelId,
): EarlyWarning[] {
  if (!profile || profile.role !== "GVCN") return [...items];
  const own = new Set(profile.gvcnClasses.filter((c) => c.levelId === levelId).map((c) => c.classCode));
  return items.filter((w) => own.has(w.classCode));
}

export interface WarningKindBadge {
  kind: EarlyWarningKind;
  label: string;
  count: number;
  tone: Tone;
}

/** One counter per kind (zeros included, fixed order). */
export function warningKindBadges(items: readonly EarlyWarning[]): WarningKindBadge[] {
  const counts = earlyWarningCounts(items);
  return WARNING_KIND_ORDER.map((kind) => ({ kind, label: EARLY_WARNING_KIND_LABELS[kind], count: counts[kind], tone: KIND_TONE[kind] }));
}

/** Link of "Xem tất cả" (Hành động → tab Cảnh báo sớm) keeping the period of the page. */
export function warningsHref(search: string): string {
  const p = new URLSearchParams(search);
  p.set("tab", "canh-bao");
  return `/hanh-dong?${p.toString()}`;
}
