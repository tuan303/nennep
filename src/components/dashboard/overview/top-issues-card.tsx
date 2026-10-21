"use client";
import { useMemo } from "react";
import { FilterX, ListOrdered } from "lucide-react";
import { Badge, Button, Card, ProgressBar } from "@/components/ui";
import { EmptyDataHint } from "@/components/app/widgets";
import { fmtNumber } from "@/lib/client/format";
import type { Incident, LevelDataset } from "@/lib/types";
import { topIssueRows } from "../lib/overview-model";
import { share, unitLabel } from "../lib/view-helpers";
import { RankBubble, RowButton } from "../shared/parts";

export interface TopIssuesCardProps {
  ds: LevelDataset;
  /** Incidents of the scope without the error filter (cross-filter: the other errors stay listed). */
  incidents: Incident[];
  errorCode?: string;
  onPick: (errorCode: string | undefined) => void;
  className?: string;
}

/**
 * "Top 5 vấn đề": most frequent errors of the scope; click → error filter (the selected row is highlighted among the
 * others, and appended with its rank when it is not in the top 5).
 */
export function TopIssuesCard({ ds, incidents, errorCode, onPick, className }: TopIssuesCardProps) {
  const issues = useMemo(() => topIssueRows(incidents, errorCode, 5), [incidents, errorCode]);
  const max = issues[0]?.incidents ?? 0;

  return (
    <Card
      className={className}
      icon={ListOrdered}
      title="Top 5 vấn đề"
      subtitle="Lỗi phát sinh nhiều nhất trong kỳ"
      actions={
        errorCode ? (
          <Button variant="ghost" size="sm" icon={FilterX} onClick={() => onPick(undefined)} data-print-hide>
            Bỏ lọc lỗi
          </Button>
        ) : undefined
      }
    >
      {issues.length === 0 ? (
        <EmptyDataHint ds={ds} title={ds.incidents.length === 0 ? undefined : "Chưa có sự việc trong kỳ này"} />
      ) : (
        <ol className="-mx-2.5 flex flex-col gap-0.5">
          {issues.map((s) => (
            <li key={s.errorCode}>
              <RowButton
                onClick={() => onPick(s.errorCode === errorCode ? undefined : s.errorCode)}
                highlighted={s.errorCode === errorCode}
                label={`${s.errorCode === errorCode ? "Bỏ lọc" : "Lọc theo"} lỗi ${s.issue}: ${s.incidents} sự việc, ${s.points} điểm trừ`}
                className="items-start"
              >
                <RankBubble n={s.rank} />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="line-clamp-2 text-[13.5px] font-semibold leading-5 text-brand-900">{s.issue}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge size="sm" tone="muted" className="max-w-[12rem]">
                      {s.category}
                    </Badge>
                    <Badge size="sm" tone={s.unit === "/HS" ? "brand" : "star"}>
                      {unitLabel(s.unit)}
                    </Badge>
                  </span>
                  <span className="flex items-center gap-3">
                    <ProgressBar value={share(s.incidents, max)} tone={s.rank === 1 ? "bad" : "brand"} size="sm" ariaLabel={`${s.incidents} sự việc`} className="flex-1" />
                    <span className="num shrink-0 text-xs text-slate-600">
                      <b className="text-brand-900">{fmtNumber(s.incidents)}</b> sự việc · <b className="text-bad-strong">{fmtNumber(s.points)}</b> điểm
                    </span>
                  </span>
                </span>
              </RowButton>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
