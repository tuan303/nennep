"use client";
import { CalendarDays } from "lucide-react";
import { LogoMark } from "@/components/app/shell";
import { Card } from "@/components/ui";
import { fmtDate } from "@/lib/client/format";
import { LEVELS, SCHOOL_NAME } from "@/lib/constants";
import type { ClassInfo, LevelId } from "@/lib/types";
import { reportTitle } from "./lib/copy-text";

export interface ReportHeaderProps {
  levelId: LevelId;
  schoolYear: string;
  classCode: string;
  classInfo?: ClassInfo;
  /** Students currently in the class (falls back to the source class size). */
  classSize?: number;
  periodText: string;
  today: string;
}

/** Official-looking report heading (school block, title, period, GVCN / Phó CN, ngày lập). Printed as-is. */
export function ReportHeader({ levelId, schoolYear, classCode, classInfo, classSize, periodText, today }: ReportHeaderProps) {
  const size = classSize || classInfo?.sourceSize;
  return (
    <Card padding="none" className="overflow-hidden">
      <div aria-hidden className="h-1.5 bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 print:h-1" />
      <div className="flex flex-col gap-5 p-4 sm:p-6 print:p-3">
        <div className="flex flex-col gap-3 border-b border-dashed border-border-strong pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <LogoMark size="lg" />
            <div className="min-w-0">
              <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-brand-900">{SCHOOL_NAME.toLocaleUpperCase("vi-VN")}</p>
              <p className="text-[13px] text-slate-600">
                {LEVELS[levelId].name} · Năm học {schoolYear}
              </p>
            </div>
          </div>
          <p className="flex items-center gap-1.5 text-[13px] text-slate-600 sm:justify-end">
            <CalendarDays aria-hidden className="size-4 text-slate-400" strokeWidth={2} />
            Ngày lập: <span className="num font-semibold text-slate-800">{fmtDate(today)}</span>
          </p>
        </div>

        <div className="flex flex-col items-center gap-1.5 text-center">
          <h2 className="text-xl font-extrabold tracking-tight text-brand-900 sm:text-[26px]">{reportTitle(classCode)}</h2>
          <p className="text-sm font-semibold text-brand-700 sm:text-[15px]">{periodText}</p>
          <span aria-hidden className="mt-1 block h-1 w-14 rounded-full bg-star-400" />
          <dl className="mt-2 flex flex-wrap justify-center gap-x-6 gap-y-1.5 text-sm">
            <InfoItem label="GVCN" value={classInfo?.homeroomTeacher} />
            <InfoItem label="Phó CN" value={classInfo?.deputyTeacher} />
            {classInfo ? <InfoItem label="Khối" value={String(classInfo.grade)} /> : null}
            {size ? <InfoItem label="Sĩ số" value={String(size)} /> : null}
          </dl>
        </div>
      </div>
    </Card>
  );
}

function InfoItem({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-slate-500">{label}:</dt>
      <dd className={value ? "font-semibold text-slate-900" : "italic text-slate-400"}>{value || "Chưa cập nhật"}</dd>
    </div>
  );
}
