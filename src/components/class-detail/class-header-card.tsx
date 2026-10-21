"use client";
import type { ReactNode } from "react";
import { EyeOff, Mail, Phone, UserRound, UserRoundCheck, Users, type LucideIcon } from "lucide-react";
import { RagBadge, Top90Badge, cn } from "@/components/ui";
import { PeriodBadge } from "@/components/app/widgets";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import type { ClassInfo, LevelConfig, Period, RankingRow } from "@/lib/types";
import { RankMedal } from "../ranking/rank-medal";
import { classContacts, type ClassSize } from "./lib/class-view";

export interface ClassHeaderCardProps {
  cls: ClassInfo;
  row?: RankingRow;
  /** Rank of the previous period (same grade), when known. */
  previousRank?: number;
  previousNoun: string;
  size: ClassSize;
  period: Period;
  config: LevelConfig;
  /** GVCN looking at another class: aggregates only. */
  hidden: boolean;
  own: boolean;
}

/** Identity of the class (code, grade, teachers, contact, size) and its standing in the grade for the period. */
export function ClassHeaderCard({ cls, row, previousRank, previousNoun, size, period, config, hidden, own }: ClassHeaderCardProps) {
  const contacts = classContacts(cls);
  return (
    <section aria-label={`Thông tin lớp ${cls.code}`} className="card overflow-hidden">
      <div className="relative bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 px-4 py-5 text-white sm:px-6">
        <div aria-hidden className="bg-stars pointer-events-none absolute inset-0 opacity-80" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-white/10 px-4 py-2.5 ring-1 ring-inset ring-white/15">
              <span className="text-2xs font-semibold uppercase tracking-[0.12em] text-white/70">Lớp</span>
              <span className="num text-3xl font-extrabold leading-9 tracking-tight sm:text-4xl sm:leading-[44px]">{cls.code}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-star-300">
                Khối {cls.grade}
                {cls.system ? <span className="font-medium normal-case tracking-normal text-white/70">· {cls.system}</span> : null}
                {own ? (
                  <span className="rounded-full bg-star-500 px-2 py-0.5 text-2xs font-bold normal-case tracking-normal text-brand-950">
                    Lớp chủ nhiệm
                  </span>
                ) : null}
                {!cls.active ? (
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-2xs font-bold normal-case tracking-normal">Ngừng hoạt động</span>
                ) : null}
              </p>
              <Person icon={UserRoundCheck} label="GVCN" value={cls.homeroomTeacher} strong />
              {cls.deputyTeacher ? <Person icon={UserRound} label="Phó CN" value={cls.deputyTeacher} /> : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-3 rounded-2xl bg-white/[0.07] px-4 py-3 ring-1 ring-inset ring-white/10 md:min-w-56">
            {row ? (
              <>
                <RankMedal rank={row.rank} size="lg" />
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-white/70">Hạng trong khối {cls.grade}</span>
                  <span className="num text-2xl font-bold leading-8">
                    {fmtNumber(row.rank)}
                    <span className="text-base font-semibold text-white/70">/{fmtNumber(row.gradeClassCount)}</span>
                  </span>
                  {previousRank !== undefined ? (
                    <span className="num text-xs text-white/70">
                      {previousNoun ? `${previousNoun[0].toUpperCase()}${previousNoun.slice(1)}` : "Kỳ trước"}: hạng {fmtNumber(previousRank)}
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              <span className="text-sm text-white/85">Lớp không tham gia xếp hạng trong kỳ này.</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 px-4 py-3 text-[13px] text-slate-600 sm:px-6">
        <Fact icon={Users}>
          Sĩ số:{" "}
          {size.value !== undefined ? (
            <strong className="num font-semibold text-brand-900">{fmtNumber(size.value)}</strong>
          ) : (
            <span className="text-slate-400">{size.source === "hidden" ? "ẩn" : "chưa có danh sách"}</span>
          )}
          {size.source === "source" ? <span className="text-slate-400"> (theo danh sách lớp)</span> : null}
        </Fact>
        {contacts.map((c) => (
          <a
            key={c.href}
            href={c.href}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500 pointer-coarse:min-h-11"
          >
            {c.kind === "phone" ? <Phone aria-hidden className="size-4" /> : <Mail aria-hidden className="size-4" />}
            <span className="sr-only">{c.kind === "phone" ? "Gọi GVCN" : "Gửi thư cho GVCN"}: </span>
            {c.label}
          </a>
        ))}
        <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <PeriodBadge period={period} semesters={config.semesters} size="sm" />
          {row ? (
            <>
              <Top90Badge
                inTop90={row.inTop90}
                ratio={config.top90Ratio}
                size="sm"
                hint={`Hạng ${fmtNumber(row.rank)}/${fmtNumber(row.gradeClassCount)} · ngưỡng Top ${fmtPercent(config.top90Ratio)}: hạng ${fmtNumber(row.top90Cutoff)}`}
              />
              <RagBadge rag={row.rag} reason={row.ragReason} size="sm" />
            </>
          ) : null}
        </span>
      </div>
      {hidden ? (
        <p className="flex items-start gap-2 border-t border-border bg-surface-2 px-4 py-2.5 text-[13px] text-slate-600 sm:px-6">
          <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0 text-slate-400" />
          Lớp này không thuộc lớp chủ nhiệm của thầy/cô: chỉ hiển thị số liệu tổng hợp, tên học sinh và chi tiết sự việc được ẩn.
        </p>
      ) : null}
    </section>
  );
}

function Person({ icon: Icon, label, value, strong }: { icon: LucideIcon; label: string; value?: string; strong?: boolean }) {
  return (
    <p className="flex min-w-0 items-start gap-1.5 text-sm">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-white/70" />
      <span className="shrink-0 text-white/70">{label}:</span>
      <span className={cn("line-clamp-2 min-w-0 break-words", strong ? "font-semibold text-white" : "text-brand-50")} title={value}>
        {value?.trim() || "Chưa cập nhật"}
      </span>
    </p>
  );
}

function Fact({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon aria-hidden className="size-4 text-slate-400" />
      <span>{children}</span>
    </span>
  );
}
