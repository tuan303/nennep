"use client";
import { useMemo } from "react";
import { Repeat } from "lucide-react";
import { Avatar, Card, RagBadge } from "@/components/ui";
import { STUDENT_ALERT_LABELS, StudentAlertBadge } from "@/components/app/widgets";
import { periodLabel, recidivism } from "@/lib/engine";
import { fmtNumber } from "@/lib/client/format";
import type { GlobalFilters, LevelDataset, Period } from "@/lib/types";
import { MiniStat, RowButton } from "../shared/parts";

export interface RecidivismCardProps {
  ds: LevelDataset;
  filters: GlobalFilters;
  today: string;
  /** Label only: classes need several weeks, so a selected week is judged on its semester up to that week. */
  context: { period: Period; widened: boolean };
  onOpenClass: (classCode: string) => void;
  onOpenStudent: (studentId: string) => void;
  className?: string;
}

const MAX_ROWS = 6;

/**
 * "Tái phạm" (FR-RAG-004), one engine call (same result as the Decision Brief). Classes: ≥ 2 consecutive weeks
 * at/above the yellow threshold – for a selected week, the weeks of its semester up to that week (a past week is
 * judged as of that week). Students: REPEAT / WEEKLY_RED alerts of the selected period.
 */
export function RecidivismCard({ ds, filters, today, context, onOpenClass, onOpenStudent, className }: RecidivismCardProps) {
  const result = useMemo(() => recidivism(ds, filters, today), [ds, filters, today]);
  const classes = result.classes;
  // Red alerts first; engine order (incidents desc) otherwise.
  const students = useMemo(
    () => [...result.students.filter((s) => s.alert === "WEEKLY_RED"), ...result.students.filter((s) => s.alert !== "WEEKLY_RED")],
    [result.students],
  );
  const weeklyRed = students.filter((s) => s.alert === "WEEKLY_RED").length;
  const repeat = students.length - weeklyRed;
  const classLabel = periodLabel(context.period, ds.config.semesters);
  const { studentAlert, rag } = ds.config;

  return (
    <Card
      className={className}
      icon={Repeat}
      title="Tái phạm"
      subtitle={`Lớp: ${classLabel}${context.widened ? " (đến tuần đang xem)" : ""} · Học sinh: kỳ đang xem`}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-surface-2 p-3 ring-1 ring-inset ring-border">
          <MiniStat label="Lớp tái phạm" value={fmtNumber(classes.length)} tone={classes.length ? "bad" : undefined} />
          <MiniStat label="HS cảnh báo đỏ" value={fmtNumber(weeklyRed)} tone={weeklyRed ? "bad" : undefined} />
          <MiniStat label="HS tái phạm" value={fmtNumber(repeat)} />
        </div>

        <section aria-label="Lớp vượt ngưỡng nhiều tuần liên tiếp" className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lớp vượt ngưỡng Vàng ≥ 2 tuần liên tiếp</p>
          {!rag.approved ? (
            <p className="text-[13px] text-slate-500">Ngưỡng cảnh báo chưa được phê duyệt nên chưa xác định lớp tái phạm.</p>
          ) : classes.length === 0 ? (
            <p className="text-[13px] text-ok-strong">Không có lớp vượt ngưỡng {fmtNumber(rag.yellow)} điểm trừ/tuần nhiều tuần liền.</p>
          ) : (
            <ul className="-mx-2.5 flex flex-col gap-0.5">
              {classes.slice(0, MAX_ROWS).map((c) => (
                <li key={c.classCode}>
                  <RowButton onClick={() => onOpenClass(c.classCode)} label={`Xem lớp ${c.classCode}: ${c.consecutiveWeeks} tuần liên tiếp vượt ngưỡng`}>
                    <span className="w-14 shrink-0 font-semibold text-brand-900">{c.classCode}</span>
                    <span className="num flex-1 text-[13px] text-slate-600">
                      <b className="text-bad-strong">{fmtNumber(c.consecutiveWeeks)}</b> tuần liên tiếp
                    </span>
                    <RagBadge rag={c.lastRag} compact size="sm" />
                  </RowButton>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Học sinh cần theo dõi" className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Học sinh cần theo dõi</p>
          {students.length === 0 ? (
            <p className="text-[13px] text-slate-500">
              {ds.redacted ? "Không có học sinh lớp thầy/cô cần theo dõi trong kỳ này." : "Không có học sinh bị cảnh báo trong kỳ này."}
            </p>
          ) : (
            <ul className="-mx-2.5 flex flex-col gap-0.5">
              {students.slice(0, MAX_ROWS).map((s) => (
                <li key={s.id}>
                  <RowButton
                    onClick={() => onOpenStudent(s.id)}
                    label={`Xem lịch sử ${s.name}, lớp ${s.classCode}: ${STUDENT_ALERT_LABELS[s.alert]}, ${s.incidents} lượt vi phạm`}
                  >
                    <Avatar name={s.name} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      <span className="font-semibold text-brand-900">{s.name}</span> <span className="text-slate-500">· {s.classCode}</span>
                    </span>
                    <span className="num shrink-0 text-xs text-slate-500">{fmtNumber(s.incidents)} lượt</span>
                    <StudentAlertBadge alert={s.alert} size="sm" />
                  </RowButton>
                </li>
              ))}
            </ul>
          )}
          {students.length > MAX_ROWS ? (
            <p className="num text-xs text-slate-500">và {fmtNumber(students.length - MAX_ROWS)} học sinh khác</p>
          ) : null}
          <p className="text-xs text-slate-500">
            Cảnh báo đỏ: từ {fmtNumber(studentAlert.perWeek)} lượt trong một tuần · Tái phạm: từ {fmtNumber(studentAlert.repeatMin)} lượt trong{" "}
            {fmtNumber(studentAlert.repeatWindowWeeks)} tuần.
          </p>
        </section>
      </div>
    </Card>
  );
}
