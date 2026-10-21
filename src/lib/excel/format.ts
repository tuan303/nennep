/**
 * Display texts shared by the Excel exports and the HTML snapshot (no ExcelJS dependency).
 */
import { RAG_LABELS } from "../constants";
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

const ALERT_LABELS: Record<string, string> = { NONE: "", REPEAT: "Tái phạm", WEEKLY_RED: "Cảnh báo đỏ" };

/** Student alert code ("NONE" | "REPEAT" | "WEEKLY_RED") → Vietnamese; other texts unchanged. */
export function studentAlertLabel(alert: string): string {
  return ALERT_LABELS[alert] ?? alert;
}
