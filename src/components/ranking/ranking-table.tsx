"use client";
import { Fragment, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { RagBadge, Top90Badge, cn, toneHex } from "@/components/ui";
import { Sparkline } from "@/components/charts";
import { fmtNumber, fmtTopLabel } from "@/lib/client/format";
import type { LevelDataset, Period, RankingRow } from "@/lib/types";
import { ClassBreakdown } from "./class-breakdown";
import { RankDelta, RankMedal } from "./rank-medal";
import { ClassCell, PenaltyText, RewardText, Top90Divider, scoreTone } from "./ranking-parts";

/**
 * Column visibility by content width (the sidebar takes 76–264px):
 * phones use cards; < xl merges Thưởng/Trừ and Top 90%/RAG; Điểm nền (same for every class) and Xu hướng from xl;
 * separate Top 90% and RAG columns from 2xl.
 */
type Show = "all" | "xl" | "2xl" | "ltXl" | "lt2xl";
const SHOW: Record<Show, string> = { all: "", xl: "max-xl:hidden", "2xl": "max-2xl:hidden", ltXl: "xl:hidden", lt2xl: "2xl:hidden" };

interface Col {
  key: string;
  header: ReactNode;
  show: Show;
  align?: "left" | "right" | "center";
  width?: number;
  /** Takes the remaining width (content truncates). */
  grow?: boolean;
  cell: (r: RankingRow) => ReactNode;
}

export interface RankingTableProps {
  ds: LevelDataset;
  grade: number;
  rows: RankingRow[];
  period: Period;
  dividerIndex: number;
  trends: ReadonlyMap<string, number[]>;
  /** Rank movement vs the previous period (compare mode); undefined hides the arrows. */
  deltas?: ReadonlyMap<string, number>;
  previousNoun: string;
  expanded: string | null;
  onToggle: (classCode: string) => void;
  detailHref: (classCode: string) => string;
  /** Receives the <tr> of the highlighted class (scroll into view). */
  highlightRef?: (el: HTMLElement | null) => void;
}

export function RankingTable(props: RankingTableProps) {
  const { ds, grade, rows, period, dividerIndex, trends, deltas, previousNoun, expanded, onToggle, detailHref, highlightRef } = props;

  const cols: Col[] = [
    {
      key: "rank",
      header: "Hạng",
      show: "all",
      width: 64,
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          <RankMedal rank={r.rank} />
          {deltas ? <RankDelta delta={deltas.get(r.classCode)} previousNoun={previousNoun} /> : null}
        </span>
      ),
    },
    { key: "class", header: "Lớp", show: "all", grow: true, cell: (r) => <ClassCell row={r} /> },
    { key: "base", header: "Điểm nền", show: "xl", align: "right", cell: (r) => <span className="text-slate-500">{fmtNumber(r.base)}</span> },
    { key: "reward", header: "Thưởng", show: "xl", align: "right", cell: (r) => <RewardText value={r.rewardPoints} /> },
    { key: "penalty", header: "Trừ", show: "xl", align: "right", cell: (r) => <PenaltyText value={r.penaltyPoints} /> },
    {
      key: "rp",
      header: "Thưởng / Trừ",
      show: "ltXl",
      align: "right",
      cell: (r) => (
        <span className="flex flex-col items-end leading-5">
          <RewardText value={r.rewardPoints} />
          <PenaltyText value={r.penaltyPoints} />
        </span>
      ),
    },
    {
      key: "score",
      header: "Điểm thi đua",
      show: "all",
      align: "right",
      cell: (r) => <span className={cn("text-[17px] font-bold tracking-tight", scoreTone(r.score))}>{fmtNumber(r.score)}</span>,
    },
    { key: "top90", header: fmtTopLabel(ds.config.top90Ratio), show: "2xl", cell: (r) => <Top90Badge inTop90={r.inTop90} ratio={ds.config.top90Ratio} size="sm" /> },
    { key: "rag", header: "Mức cảnh báo", show: "2xl", cell: (r) => <RagBadge rag={r.rag} reason={r.ragReason} compact size="sm" /> },
    {
      key: "assess",
      header: "Đánh giá",
      show: "lt2xl",
      cell: (r) => (
        <span className="flex flex-col items-start gap-1">
          <Top90Badge inTop90={r.inTop90} ratio={ds.config.top90Ratio} size="sm" />
          <RagBadge rag={r.rag} reason={r.ragReason} compact size="sm" />
        </span>
      ),
    },
    {
      key: "trend",
      header: "Xu hướng",
      show: "xl",
      width: 108,
      cell: (r) => {
        const data = trends.get(r.classCode) ?? [];
        return (
          <Sparkline
            data={data}
            width={88}
            height={28}
            color={r.rag === "RED" ? toneHex.bad : toneHex.brand}
            ariaLabel={
              data.length > 1
                ? `Điểm thi đua ${data.length} tuần gần nhất của lớp ${r.classCode}: ${fmtNumber(data[0])} → ${fmtNumber(data[data.length - 1])}`
                : "Chưa đủ dữ liệu xu hướng"
            }
          />
        );
      },
    },
  ];
  const colSpan = cols.length + 1;

  return (
    <div className="relative w-full overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Bảng xếp hạng thi đua khối {grade}</caption>
        <thead>
          <tr>
            {cols.map((c, ci) => (
              <th
                key={c.key}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                className={cn(
                  "h-10 whitespace-nowrap border-b border-border bg-surface-2 px-2.5 text-[12.5px] font-semibold text-slate-500",
                  c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                  ci === 0 && "pl-4 sm:pl-5",
                  c.grow && "w-full",
                  SHOW[c.show],
                )}
              >
                {c.header}
              </th>
            ))}
            <th scope="col" className="w-12 border-b border-border bg-surface-2 pr-4 sm:pr-5" data-print-hide>
              <span className="sr-only">Chi tiết</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const isOpen = expanded === r.classCode;
            const panelId = `rank-panel-${r.classCode}`;
            return (
              <Fragment key={r.classCode}>
                {idx === dividerIndex ? <Top90Divider as="tr" colSpan={colSpan} cutoff={r.top90Cutoff} ratio={ds.config.top90Ratio} /> : null}
                <tr
                  ref={r.highlighted ? highlightRef : undefined}
                  onClick={() => onToggle(r.classCode)}
                  aria-current={r.highlighted ? "true" : undefined}
                  className={cn(
                    "group/row cursor-pointer scroll-mt-28 transition-colors duration-100",
                    r.highlighted ? "bg-star-50/80 hover:bg-star-50" : isOpen ? "bg-brand-50/60" : "hover:bg-brand-50/50",
                  )}
                >
                  {cols.map((c, ci) => (
                    <td
                      key={c.key}
                      className={cn(
                        "border-b border-border px-2.5 py-2.5 align-middle text-slate-700",
                        c.align === "right" && "num text-right",
                        ci === 0 && "pl-4 sm:pl-5",
                        c.grow && "w-full max-w-0",
                        r.highlighted && "shadow-[inset_0_2px_0_var(--color-star-400),inset_0_-2px_0_var(--color-star-400)]",
                        r.highlighted &&
                          ci === 0 &&
                          "shadow-[inset_2px_0_0_var(--color-star-400),inset_0_2px_0_var(--color-star-400),inset_0_-2px_0_var(--color-star-400)]",
                        SHOW[c.show],
                      )}
                    >
                      {c.cell(r)}
                    </td>
                  ))}
                  <td
                    data-print-hide
                    className={cn(
                      "border-b border-border py-2 pr-3 text-right align-middle sm:pr-4",
                      r.highlighted &&
                        "shadow-[inset_-2px_0_0_var(--color-star-400),inset_0_2px_0_var(--color-star-400),inset_0_-2px_0_var(--color-star-400)]",
                    )}
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? panelId : undefined}
                      aria-label={`${isOpen ? "Thu gọn" : "Xem"} phân tích lớp ${r.classCode}, hạng ${r.rank}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle(r.classCode);
                      }}
                      className="inline-flex size-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-900/5 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:size-11"
                    >
                      <ChevronDown
                        aria-hidden
                        className={cn("size-5 transition-transform duration-200", isOpen && "rotate-180 text-brand-700")}
                        strokeWidth={2.25}
                      />
                    </button>
                  </td>
                </tr>
                {isOpen ? (
                  <tr id={panelId}>
                    <td colSpan={colSpan} className="border-b border-border bg-surface-2/80 px-4 py-4 sm:px-5">
                      <div className="animate-fade-in">
                        <ClassBreakdown ds={ds} row={r} period={period} detailHref={detailHref(r.classCode)} />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
