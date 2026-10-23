/**
 * Display texts shared by the Excel exports and the HTML snapshot (no ExcelJS dependency).
 */
import { RAG_LABELS } from "../constants";
import type { RankingRule } from "../engine/ranking";
import type { CatalogItem, RagStatus } from "../types";

/** 2 → "2", 2.5 → "2,5" (Vietnamese decimal comma). */
export function formatPenalty(n: number): string {
  return String(Math.round(n * 100) / 100).replace(".", ",");
}

/** "2 điểm/HS", "5 điểm/lần". */
export function penaltyUnitText(penalty: number, unit: string): string {
  return `${formatPenalty(penalty)} điểm${unit}`;
}

/** Legacy "Chọn lỗi" text: "Giày dép để lộn xộn | Chuyên cần – vệ sinh | 2 điểm/HS | L04". */
export function catalogChoiceText(item: Pick<CatalogItem, "code" | "issue" | "category" | "penalty" | "unit">): string {
  return `${item.issue} | ${item.category} | ${penaltyUnitText(item.penalty, item.unit)} | ${item.code}`;
}

const RAG_KEYS: readonly RagStatus[] = ["GREEN", "YELLOW", "RED", "GRAY"];

export function isRagStatus(v: string): v is RagStatus {
  return (RAG_KEYS as readonly string[]).includes(v);
}

/** Icon + short text per RAG status (colour is never the only signal – NFR-ACC-01). */
export const RAG_SHORT: Record<RagStatus, { icon: string; text: string }> = {
  GREEN: { icon: "✓", text: "Xanh" },
  YELLOW: { icon: "!", text: "Vàng" },
  RED: { icon: "✕", text: "Đỏ" },
  GRAY: { icon: "?", text: "Xám" },
};

/** "GREEN" → "Xanh – Ổn định"; any other text is returned unchanged. */
export function ragLabel(rag: string): string {
  return isRagStatus(rag) ? RAG_LABELS[rag] : rag;
}

/** Name of the configurable Top group (config.top90Ratio, spec default 0.9): 0.9 → "Top 90%", 0.8 → "Top 80%". */
export function topGroupLabel(ratio?: number): string {
  const r = typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 ? ratio : 0.9;
  return `Top ${String(Math.round(r * 1000) / 10).replace(".", ",")}%`;
}

/** "Thuộc Top 90%" / "Ngoài Top 90%" – the percentage follows config.top90Ratio. */
export function top90Label(inTop90: boolean, ratio?: number): string {
  return `${inTop90 ? "Thuộc" : "Ngoài"} ${topGroupLabel(ratio)}`;
}

/** How a level ranks its classes (engine rankingRuleOf): one table per khối, or – THPT – one table for the whole level. */
export type RankingLayout = Pick<RankingRule, "scope" | "tieBreak" | "topCount">;

/**
 * One-line rule of a ranking table (Xếp hạng sheet, HTML snapshot):
 * "Xếp hạng trong từng khối; Top 90% tính theo số lớp của khối." or, THPT, the level-wide rule with the tie-break.
 */
export function rankingRuleNote(layout: RankingLayout | undefined, ratio?: number): string {
  const top = topGroupLabel(ratio);
  const turns = layout?.tieBreak === "violationTurns";
  if (layout?.scope === "level") {
    const tie = turns ? "bằng điểm thì lớp ít lượt vi phạm hơn xếp trên, bằng cả điểm và lượt vi phạm thì đồng hạng" : "bằng điểm thì đồng hạng";
    return `Xếp hạng chung toàn cấp (không chia khối); ${tie}; ${top} tính theo số lớp toàn cấp.`;
  }
  return `Xếp hạng trong từng khối${turns ? "; bằng điểm thì lớp ít lượt vi phạm hơn xếp trên" : ""}; ${top} tính theo số lớp của khối.`;
}

/**
 * "Top 3 toàn cấp: 12A1 (hạng 1), 11A2 (hạng 2), 10A3 (hạng 2)." – the first `layout.topCount` classes of a
 * level-wide ranking, every class tied at the cut included (as engine topRows). Undefined without topCount, or when
 * the tie swallows the whole table (e.g. every class still clean): nobody stands out (as the Xếp hạng screen).
 */
export function leadingClassesNote(rows: ReadonlyArray<{ rank: number; classCode: string }>, layout: RankingLayout | undefined): string | undefined {
  const count = layout?.topCount ?? 0;
  if (count <= 0 || rows.length === 0) return undefined;
  const sorted = [...rows].sort((a, b) => a.rank - b.rank || a.classCode.localeCompare(b.classCode, "vi"));
  const cut = sorted[Math.min(count, sorted.length) - 1].rank;
  const leaders = sorted.filter((r) => r.rank <= cut);
  const scope = layout?.scope === "level" ? "toàn cấp" : "khối";
  // As the engine's namedTop: when every class shares one rank nobody stands out – say so instead of a list.
  if (sorted.length > 1 && sorted.every((r) => r.rank === sorted[0].rank)) return `Top ${count} ${scope}: tất cả ${sorted.length} lớp đồng hạng ${sorted[0].rank}.`;
  return `Top ${count} ${scope}: ${leaders.map((r) => `${r.classCode} (hạng ${r.rank})`).join(", ")}.`;
}

const ALERT_LABELS: Record<string, string> = { NONE: "", REPEAT: "Tái phạm", WEEKLY_RED: "Cảnh báo đỏ" };

/** Student alert code ("NONE" | "REPEAT" | "WEEKLY_RED") → Vietnamese; other texts unchanged. */
export function studentAlertLabel(alert: string): string {
  return ALERT_LABELS[alert] ?? alert;
}
