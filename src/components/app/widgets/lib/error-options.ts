/** Error-catalog options for the ErrorPicker (pure – unit-tested). */
import type { ComboOption } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import type { CatalogItem, Unit } from "@/lib/types";

/** Group heading of the recently used errors (shown first). */
export const RECENT_GROUP = "Dùng gần đây";
/** How many recent errors are pinned to the top of the list. */
export const RECENT_PINNED = 5;

/** "2 điểm/HS" | "5 điểm/lần" */
export function penaltyLabel(penalty: number, unit: Unit): string {
  return `${fmtNumber(penalty)} điểm/${unit === "/HS" ? "HS" : "lần"}`;
}

/** Long explanation of the unit, e.g. for tooltips. */
export function unitExplanation(unit: Unit): string {
  return unit === "/HS" ? "Tính theo số học sinh liên quan" : "Tính theo số lần vi phạm (không nhân theo học sinh)";
}

export interface ErrorOptionsArgs {
  /** Recently used codes, most recent first. */
  recent?: readonly string[];
  /** Keep this code even when inactive (current value while editing). */
  keep?: string;
  recentLimit?: number;
}

/**
 * Active catalog items grouped by Mảng (catalog order), with up to `recentLimit` recently used items moved to a
 * first group "Dùng gần đây". Inactive items only appear when they are `keep` (shown disabled).
 */
export function errorOptions(catalog: readonly CatalogItem[], args: ErrorOptionsArgs = {}): ComboOption<string>[] {
  const items = catalog.filter((c) => c.active || c.code === args.keep);
  const byCode = new Map(items.filter((c) => c.active).map((c) => [c.code, c] as const));
  const recentCodes: string[] = [];
  for (const code of args.recent ?? []) {
    if (recentCodes.length >= (args.recentLimit ?? RECENT_PINNED)) break;
    if (byCode.has(code) && !recentCodes.includes(code)) recentCodes.push(code);
  }
  const recentSet = new Set(recentCodes);

  const toOption = (c: CatalogItem, group: string): ComboOption<string> => ({
    value: c.code,
    label: c.active ? c.issue : `${c.issue} (ngừng sử dụng)`,
    group,
    description: `${c.code} · ${penaltyLabel(c.penalty, c.unit)}`,
    keywords: [c.code, c.category, c.group ?? "", c.displayName ?? "", penaltyLabel(c.penalty, c.unit)].filter(Boolean),
    disabled: !c.active,
  });

  const recentOptions = recentCodes.map((code) => toOption(byCode.get(code) as CatalogItem, RECENT_GROUP));
  const rest = items.filter((c) => !recentSet.has(c.code)).map((c) => toOption(c, c.category || "Khác"));
  return [...recentOptions, ...rest];
}
