"use client";
import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, UserRound } from "lucide-react";
import { Avatar, Card, buttonClasses } from "@/components/ui";
import { EmptyDataHint, STUDENT_ALERT_LABELS, StudentAlertBadge } from "@/components/app/widgets";
import { studentStats, type StudentStat } from "@/lib/engine";
import { fmtNumber } from "@/lib/client/format";
import type { GlobalFilters, LevelDataset } from "@/lib/types";
import { hrefWithParams } from "../lib/view-helpers";
import { RowButton } from "../shared/parts";

export interface TopStudentsCardProps {
  ds: LevelDataset;
  filters: GlobalFilters;
  today: string;
  search: string;
  onOpenStudent: (studentId: string) => void;
  className?: string;
}

const LIMIT = 8;

function rowLabel(s: StudentStat): string {
  const alert = s.alert !== "NONE" ? `, ${STUDENT_ALERT_LABELS[s.alert]}` : "";
  return `Xem lịch sử ${s.name}, lớp ${s.classCode}: ${s.incidents} lượt vi phạm, ${s.points} điểm${alert}`;
}

/** "Học sinh vi phạm nhiều": top named students of the scope; click → StudentHistorySheet. */
export function TopStudentsCard({ ds, filters, today, search, onOpenStudent, className }: TopStudentsCardProps) {
  const students = useMemo(() => studentStats(ds, filters, today), [ds, filters, today]);
  const top = students.slice(0, LIMIT);

  return (
    <Card
      className={className}
      icon={UserRound}
      title="Học sinh vi phạm nhiều"
      subtitle={ds.redacted ? "Chỉ hiển thị học sinh lớp thầy/cô chủ nhiệm" : "Học sinh được ghi tên trong các sự việc của kỳ"}
      footer={
        students.length > LIMIT ? (
          <Link href={hrefWithParams("/hoc-sinh", search)} className={buttonClasses({ variant: "ghost", size: "sm", className: "-my-1 ml-auto" })}>
            Xem tất cả {fmtNumber(students.length)} học sinh
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        ) : undefined
      }
    >
      {top.length === 0 ? (
        <EmptyDataHint
          ds={ds}
          icon={UserRound}
          title={ds.incidents.length === 0 ? undefined : "Chưa có học sinh được ghi tên trong kỳ này"}
          description={ds.incidents.length === 0 ? undefined : "Các sự việc trong kỳ là lỗi tập thể hoặc chưa ghi tên học sinh."}
        />
      ) : (
        <ol className="-mx-2.5 grid grid-cols-1 gap-0.5 md:max-xl:grid-cols-2">
          {top.map((s) => (
            <li key={s.id}>
              <RowButton onClick={() => onOpenStudent(s.id)} label={rowLabel(s)}>
                <Avatar name={s.name} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13.5px] font-semibold text-brand-900">{s.name}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>Lớp {s.classCode}</span>
                    {s.alert !== "NONE" ? <StudentAlertBadge alert={s.alert} size="sm" /> : null}
                  </span>
                </span>
                <span className="num flex shrink-0 flex-col items-end">
                  <span className="text-sm font-bold text-brand-900">{fmtNumber(s.incidents)} lượt</span>
                  <span className="text-xs text-slate-500">{fmtNumber(s.points)} điểm</span>
                </span>
              </RowButton>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
