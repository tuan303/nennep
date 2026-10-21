"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, Smile, UserRoundSearch } from "lucide-react";
import { Avatar, Button, Card, EmptyState, cn } from "@/components/ui";
import { StudentAlertBadge } from "@/components/app/widgets";
import { fmtNumber } from "@/lib/client/format";
import type { StudentConcern } from "./lib/report-model";

const VISIBLE = 6;

export interface StudentConcernsProps {
  students: StudentConcern[];
  onOpen: (studentId: string) => void;
  className?: string;
}

/** "Học sinh cần quan tâm": students named in the class incidents (alerts first) → StudentHistorySheet. */
export function StudentConcerns({ students, onOpen, className }: StudentConcernsProps) {
  const [showAll, setShowAll] = useState(false);
  const alerts = students.filter((s) => s.alert !== "NONE").length;

  return (
    <Card
      data-print-flow
      padding="none"
      icon={UserRoundSearch}
      title="Học sinh cần quan tâm"
      subtitle={
        students.length === 0
          ? "Học sinh có tên trong sự việc của lớp"
          : `${fmtNumber(students.length)} học sinh có tên trong sự việc${alerts > 0 ? ` · ${fmtNumber(alerts)} em có cảnh báo` : ""}`
      }
      className={className}
      footer={
        students.length > VISIBLE ? (
          <Button variant="ghost" size="sm" iconRight={ChevronDown} onClick={() => setShowAll((v) => !v)} data-print-hide className="mx-auto">
            {showAll ? "Thu gọn" : `Xem tất cả ${fmtNumber(students.length)} học sinh`}
          </Button>
        ) : undefined
      }
    >
      {students.length === 0 ? (
        <EmptyState size="sm" icon={Smile} tone="ok" title="Không có học sinh nào bị ghi tên" description="Trong kỳ này lớp không có sự việc nào gắn với học sinh cụ thể." />
      ) : (
        <ul role="list" className="divide-y divide-border">
          {students.map((s, idx) => (
            <li key={s.id} className={cn(!showAll && idx >= VISIBLE && "hidden print:block")}>
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                aria-label={`Xem lịch sử của ${s.name}`}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-brand-50/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 sm:px-5"
              >
                <Avatar name={s.name} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold text-slate-900">{s.name}</span>
                  <span className="truncate text-xs text-slate-500">{s.errors.map((e) => `${e.issue} ×${e.count}`).join(" · ")}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="num text-sm font-bold text-brand-900">
                    {fmtNumber(s.incidents)} lượt
                    {s.points > 0 ? <span className="font-medium text-slate-500"> · {fmtNumber(s.points)} điểm</span> : null}
                  </span>
                  <StudentAlertBadge alert={s.alert} size="sm" />
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-300 print:hidden" strokeWidth={2.25} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
