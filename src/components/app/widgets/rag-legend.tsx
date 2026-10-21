"use client";
import { Info } from "lucide-react";
import { RagBadge, cn } from "@/components/ui";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import type { LevelConfig, RagStatus } from "@/lib/types";

export interface RagLegendProps {
  /** Level config: shows the real thresholds and whether they are approved. */
  config?: Pick<LevelConfig, "rag">;
  /** "inline" = one wrapping row (chart footers); "list" = one status per line with its rule. */
  layout?: "inline" | "list";
  className?: string;
}

const ORDER: RagStatus[] = ["GREEN", "YELLOW", "RED", "GRAY"];

/** Rule of each colour, from the level thresholds (BR-RAG-01/02). */
export function ragRuleText(rag: RagStatus, config?: Pick<LevelConfig, "rag">): string {
  if (!config) {
    return {
      GREEN: "Điểm trừ trung bình/tuần dưới ngưỡng vàng",
      YELLOW: "Từ ngưỡng vàng đến dưới ngưỡng đỏ",
      RED: "Từ ngưỡng đỏ trở lên",
      GRAY: "Ngưỡng chưa phê duyệt hoặc dữ liệu chưa đủ tin cậy",
    }[rag];
  }
  const { yellow, red, minConfidence } = config.rag;
  return {
    GREEN: `TB dưới ${fmtNumber(yellow)} điểm trừ/tuần`,
    YELLOW: `TB từ ${fmtNumber(yellow)} đến dưới ${fmtNumber(red)} điểm trừ/tuần`,
    RED: `TB từ ${fmtNumber(red)} điểm trừ/tuần trở lên`,
    GRAY: `Ngưỡng chưa phê duyệt hoặc độ tin cậy dữ liệu dưới ${fmtPercent(minConfidence)}`,
  }[rag];
}

/** Legend of the RAG colours (icon + text + colour) with the thresholds in force. */
export function RagLegend({ config, layout = "inline", className }: RagLegendProps) {
  const notApproved = config && !config.rag.approved;
  return (
    <div className={cn("flex flex-col gap-2 text-[13px] text-slate-600", className)}>
      {layout === "list" ? (
        <ul className="flex flex-col gap-2">
          {ORDER.map((rag) => (
            <li key={rag} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <RagBadge rag={rag} compact size="sm" className="min-w-14 justify-center" />
              <span className="num">{ragRuleText(rag, config)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {ORDER.map((rag) => (
            <li key={rag} className="flex items-center gap-1.5">
              <RagBadge rag={rag} compact size="sm" />
              <span className="num text-xs text-slate-500">{ragRuleText(rag, config)}</span>
            </li>
          ))}
        </ul>
      )}
      {notApproved ? (
        <p className="flex items-start gap-1.5 text-xs text-warn-strong">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.25} />
          Ngưỡng cảnh báo chưa được phê duyệt nên mọi lớp đang hiển thị Xám.
        </p>
      ) : null}
    </div>
  );
}
