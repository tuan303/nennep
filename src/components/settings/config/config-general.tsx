"use client";
import { ArrowRight, CalendarClock, CalendarRange, GraduationCap } from "lucide-react";
import { Button, Card, DateInput, Field, Input, NumberStepper } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import { formatDateVN, isIsoDate, mondayOf, weekdayLabelVN } from "@/lib/engine/dates";
import { calendarChanged, semesterWeekCount, type ConfigDraft, type ConfigErrors } from "../lib/config-form";
import { weekRowLabel } from "../lib/weeks-edit";
import { Notice } from "../shared/notice";
import { useSettingsNav } from "../shared/settings-context";

export interface ConfigSectionProps {
  draft: ConfigDraft;
  base: ConfigDraft;
  errors: ConfigErrors;
  set: (patch: Partial<ConfigDraft>) => void;
  disabled?: boolean;
  className?: string;
}

/** Năm học, điểm nền, tuần đầu tính thi đua. */
export function GeneralCard({ draft, errors, set, disabled, className }: ConfigSectionProps) {
  const fw = draft.firstWeek;
  const valid = isIsoDate(fw);
  const monday = valid ? mondayOf(fw) : "";
  const weekHint = valid && monday === fw ? `${weekRowLabel(fw)}` : valid ? `Ngày đã chọn là ${weekdayLabelVN(fw)}.` : undefined;

  return (
    <Card title="Năm học & điểm nền" icon={GraduationCap} subtitle="Mỗi tuần tính thi đua, mỗi lớp được cộng điểm nền." className={className}>
      <div className="@container">
        <div className="grid gap-4 @md:grid-cols-2">
          <Field label="Năm học" required error={errors.schoolYear} hint="Dạng 2026-2027">
            <Input
              value={draft.schoolYear}
              onChange={(e) => set({ schoolYear: e.target.value })}
              placeholder="2026-2027"
              inputMode="numeric"
              maxLength={9}
              disabled={disabled}
              className="num"
            />
          </Field>
          <Field
            label="Điểm nền / lớp / tuần"
            required
            error={errors.baseScorePerWeek}
            hint={`VD: 10 tuần đã tính → ${fmtNumber(draft.baseScorePerWeek * 10)} điểm nền.`}
          >
            <NumberStepper
              value={draft.baseScorePerWeek}
              onChange={(v) => set({ baseScorePerWeek: v })}
              min={0}
              max={10_000}
              suffix="điểm"
              disabled={disabled}
              className="w-full"
            />
          </Field>
          <Field
            label="Tuần đầu tính thi đua"
            required
            error={errors.firstWeek}
            hint={weekHint}
            className="@md:col-span-2"
            labelAside={
              valid && monday !== fw && !disabled ? (
                <button
                  type="button"
                  onClick={() => set({ firstWeek: monday })}
                  className="rounded font-semibold text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-brand-500"
                >
                  Dùng Thứ Hai {formatDateVN(monday)}
                </button>
              ) : undefined
            }
          >
            <DateInput value={draft.firstWeek} onChange={(v) => set({ firstWeek: v })} disabled={disabled} />
          </Field>
        </div>
      </div>
    </Card>
  );
}

/** Học kỳ I/II date ranges + the reminder that existing weeks are not moved. */
export function SemestersCard({ draft, base, errors, set, disabled, className }: ConfigSectionProps) {
  const { goToTab } = useSettingsNav();
  const changed = calendarChanged(draft, base);
  const setSemester = (i: number, patch: Partial<ConfigDraft["semesters"][number]>) =>
    set({ semesters: draft.semesters.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <Card title="Học kỳ" icon={CalendarRange} subtitle="Dùng cho bộ lọc Học kỳ và để tạo lịch tuần." className={className}>
      <div className="@container flex flex-col gap-4">
        {draft.semesters.map((s, i) => {
          const weeks = semesterWeekCount(s);
          return (
            <fieldset key={s.code} className="min-w-0 rounded-control border border-border px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
              <legend className="px-1.5 text-sm font-semibold text-brand-900">
                {s.name || s.code}
                {weeks !== undefined ? <span className="num ml-1.5 font-normal text-slate-500">· {weeks} tuần</span> : null}
              </legend>
              <div className="grid gap-3 @sm:grid-cols-2">
                <Field label="Bắt đầu" required error={errors[`semesters.${i}.start`]}>
                  <DateInput value={s.start} onChange={(v) => setSemester(i, { start: v })} disabled={disabled} />
                </Field>
                <Field label="Kết thúc" required error={errors[`semesters.${i}.end`]}>
                  <DateInput value={s.end} onChange={(v) => setSemester(i, { end: v })} min={s.start || undefined} disabled={disabled} />
                </Field>
              </div>
            </fieldset>
          );
        })}
        {errors.semesters ? <p className="text-[13px] font-medium text-bad-strong">{errors.semesters}</p> : null}
        <Notice
          tone={changed ? "warn" : "brand"}
          icon={CalendarClock}
          title="Lịch tuần không tự thay đổi theo học kỳ"
          action={
            <Button size="sm" variant="secondary" iconRight={ArrowRight} onClick={() => goToTab("lich-tuan")}>
              Mở Lịch tuần
            </Button>
          }
        >
          Đổi ngày học kỳ hoặc tuần đầu không di chuyển các tuần đã có. Sau khi lưu, vào Lịch tuần và chọn “Tạo lại từ cấu hình” để áp dụng.
        </Notice>
      </div>
    </Card>
  );
}
