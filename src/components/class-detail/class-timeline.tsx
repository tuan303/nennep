"use client";
import { useState } from "react";
import { CalendarDays, CalendarCheck, ChevronDown, History } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import { fmtDate, fmtNumber } from "@/lib/client/format";
import type { TimelineDay } from "@/lib/engine";
import type { Incident } from "@/lib/types";
import { IncidentItem } from "./incident-item";
import { timelineTotals } from "./lib/class-view";

const PAGE_DAYS = 7;

export interface ClassTimelineProps {
  days: TimelineDay[];
  /** Incidents of other classes for a GVCN: names / detail hidden. */
  hidden: boolean;
  /** Category / error filter active (changes the empty message). */
  filtered: boolean;
  periodText: string;
  onOpenIncident: (incident: Incident) => void;
  onOpenStudent: (studentId: string) => void;
  className?: string;
}

/** FR-CLS-002: incidents of the class by day (newest first) – date → lỗi → điểm → học sinh → chi tiết. */
export function ClassTimeline({ days, hidden, filtered, periodText, onOpenIncident, onOpenStudent, className }: ClassTimelineProps) {
  const [limit, setLimit] = useState(PAGE_DAYS);
  const [shownFor, setShownFor] = useState(days);
  if (shownFor !== days) {
    // New period / filters → back to the first page.
    setShownFor(days);
    setLimit(PAGE_DAYS);
  }
  const totals = timelineTotals(days);
  const visible = days.slice(0, limit);
  const remaining = days.length - visible.length;

  return (
    <Card
      className={className}
      icon={History}
      title="Dòng thời gian sự việc"
      subtitle={
        totals.incidents > 0 ? (
          <span className="num">
            {fmtNumber(totals.incidents)} sự việc trong {fmtNumber(totals.days)} ngày · −{fmtNumber(totals.points)} điểm
          </span>
        ) : (
          periodText
        )
      }
    >
      {days.length === 0 ? (
        <EmptyState
          size="sm"
          icon={filtered ? CalendarDays : CalendarCheck}
          tone={filtered ? "muted" : "ok"}
          title={filtered ? "Không có sự việc phù hợp" : "Chưa có sự việc trong kỳ này"}
          description={
            filtered
              ? "Không có sự việc thuộc mảng/lỗi đang lọc. Thử bỏ bớt bộ lọc để xem toàn bộ."
              : `Lớp chưa bị ghi nhận sự việc nào trong ${periodText.toLowerCase()}.`
          }
        />
      ) : (
        <ol className="flex flex-col gap-5">
          {visible.map((d) => (
            <li key={d.date} className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-1.5">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-brand-900">
                  <CalendarDays aria-hidden className="size-4 text-brand-500" strokeWidth={2.25} />
                  <span>
                    {d.weekday ? `${d.weekday}, ` : ""}
                    <span className="num">{fmtDate(d.date) || d.date}</span>
                  </span>
                </h4>
                <span className="num text-[13px] text-slate-500">
                  {fmtNumber(d.items.length)} sự việc · <strong className="font-semibold text-bad-strong">−{fmtNumber(d.points)} điểm</strong>
                </span>
              </div>
              <ul className="flex flex-col gap-2 sm:ml-2 sm:border-l-2 sm:border-border sm:pl-3">
                {d.items.map((i) => (
                  <li key={i.id}>
                    <IncidentItem incident={i} hidden={hidden} onOpen={onOpenIncident} onOpenStudent={onOpenStudent} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {remaining > 0 ? (
        <div className="mt-4 flex justify-center" data-print-hide>
          <Button variant="ghost" size="sm" iconRight={ChevronDown} onClick={() => setLimit((l) => l + PAGE_DAYS)}>
            Xem thêm {fmtNumber(Math.min(PAGE_DAYS, remaining))} ngày
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
