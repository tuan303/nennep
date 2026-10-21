/** Data confidence and RAG classification (BR-RAG-01/02, AC-012). */
import type { Incident, LevelConfig, RagStatus } from "../types";
import { formatNumberVN, formatPercentVN } from "./text";

export const RAG_REASON_NOT_APPROVED = "Ngưỡng cảnh báo chưa được phê duyệt";

/** (#OK + #THIEU_TEN_HS) / #incidents; 1 when there are no incidents. */
export function dataConfidence(incidents: Incident[]): number {
  if (incidents.length === 0) return 1;
  let reliable = 0;
  for (const i of incidents) if (i.dataCheck === "OK" || i.dataCheck === "THIEU_TEN_HS") reliable++;
  return reliable / incidents.length;
}

/**
 * RAG of a class (or any scope) from its average weekly penalty:
 * thresholds not approved → GRAY; confidence < minConfidence → GRAY; ≥ red → RED; ≥ yellow → YELLOW; else GREEN.
 * The reason is a Vietnamese sentence that includes the numbers.
 */
export function ragFor(a: { avgWeeklyPenalty: number; confidence: number; config: LevelConfig }): { rag: RagStatus; reason: string } {
  const { rag } = a.config;
  if (!rag.approved) return { rag: "GRAY", reason: RAG_REASON_NOT_APPROVED };
  if (a.confidence < rag.minConfidence) {
    return { rag: "GRAY", reason: `Độ tin cậy dữ liệu thấp (${formatPercentVN(a.confidence)})` };
  }
  const avg = formatNumberVN(a.avgWeeklyPenalty);
  if (a.avgWeeklyPenalty >= rag.red) {
    return { rag: "RED", reason: `Trung bình ${avg} điểm trừ/tuần ≥ ngưỡng Đỏ ${formatNumberVN(rag.red)}` };
  }
  if (a.avgWeeklyPenalty >= rag.yellow) {
    return { rag: "YELLOW", reason: `Trung bình ${avg} điểm trừ/tuần ≥ ngưỡng Vàng ${formatNumberVN(rag.yellow)}` };
  }
  return { rag: "GREEN", reason: `Trung bình ${avg} điểm trừ/tuần < ngưỡng Vàng ${formatNumberVN(rag.yellow)}` };
}
