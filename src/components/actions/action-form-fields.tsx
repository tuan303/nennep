"use client";
/** Shared fields of the action create dialog and the edit form in the detail sheet. */
import { useMemo, type ReactNode, type Ref } from "react";
import { CalendarRange, School, UserRound } from "lucide-react";
import { DateInput, Field, Input, Pill, SegmentedControl, Select, Textarea } from "@/components/ui";
import { ClassPicker } from "@/components/app/widgets";
import { PRIORITY_LABELS } from "@/lib/constants";
import { formatDateVN, periodOptions } from "@/lib/engine";
import type { LevelDataset, Priority } from "@/lib/types";
import { LIMITS, ownerSuggestions, type ActionFormErrors, type ActionFormValues } from "./lib/action-form";
import { ScopeClassPill } from "./action-bits";

const PRIORITY_OPTIONS: Array<{ value: Priority; label: string }> = (["High", "Medium", "Low"] as const).map((p) => ({ value: p, label: PRIORITY_LABELS[p] }));

export interface ActionFormFieldsProps {
  ds: Pick<LevelDataset, "classes" | "weeks" | "config">;
  value: ActionFormValues;
  onChange: (patch: Partial<ActionFormValues>) => void;
  errors?: ActionFormErrors;
  mode: "create" | "edit";
  today: string;
  disabled?: boolean;
  evidenceRef?: Ref<HTMLTextAreaElement>;
}

function Counter({ text, max }: { text: string; max: number }) {
  const n = text.trim().length;
  return <span className={n > max ? "num font-semibold text-bad-strong" : "num"}>{`${n}/${max}`}</span>;
}

function ReadOnlyBox({ children }: { children: ReactNode }) {
  return <div className="flex min-h-11 items-center rounded-control border border-dashed border-border-strong bg-surface-2 px-3 text-sm text-slate-600 sm:min-h-10">{children}</div>;
}

export function ActionFormFields({ ds, value: v, onChange, errors = {}, mode, today, disabled, evidenceRef }: ActionFormFieldsProps) {
  const sla = ds.config.actionSlaDays;
  const owners = useMemo(() => ownerSuggestions(v.scopeClass, ds.classes), [v.scopeClass, ds.classes]);
  const weekOptions = useMemo(() => {
    if (mode !== "create") return [];
    return periodOptions(ds.weeks, ds.config.semesters, today)
      .weeks.filter((o) => !o.isFuture)
      .reverse()
      .map((o) => ({ value: o.key, label: o.label + (o.isCurrent ? " · hiện tại" : "") }));
  }, [mode, ds.weeks, ds.config.semesters, today]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nội dung hành động" required error={errors.title} labelAside={<Counter text={v.title} max={LIMITS.title} />} className="sm:col-span-2">
        <Textarea
          rows={2}
          value={v.title}
          disabled={disabled}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="VD: Lập kế hoạch khắc phục nền nếp lớp 6A03, tập trung lỗi đi học muộn"
          className="min-h-16"
        />
      </Field>

      <Field label="Mô tả" hint="Bối cảnh, cách thực hiện, tiêu chí hoàn thành (không bắt buộc)." error={errors.description} className="sm:col-span-2">
        <Textarea rows={2} value={v.description} disabled={disabled} onChange={(e) => onChange({ description: e.target.value })} className="min-h-16" />
      </Field>

      <Field label="Mức ưu tiên" required className="sm:col-span-2">
        <SegmentedControl<Priority>
          options={PRIORITY_OPTIONS}
          value={v.priority}
          onChange={(priority) => !disabled && onChange({ priority })}
          fullWidth
          ariaLabel="Mức ưu tiên"
        />
      </Field>

      <Field label="Người phụ trách" required error={errors.owner}>
        <Input value={v.owner} disabled={disabled} onChange={(e) => onChange({ owner: e.target.value })} placeholder="Họ tên hoặc vai trò" maxLength={LIMITS.owner + 20} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chọn nhanh người phụ trách">
          {owners.map((o) => (
            <Pill key={o.value} icon={UserRound} onClick={() => onChange({ owner: o.value })} active={v.owner.trim() === o.value} disabled={disabled}>
              {o.hint ? `${o.value} (${o.hint})` : o.value}
            </Pill>
          ))}
        </div>
      </Field>

      <Field
        label="Hạn xử lý"
        required
        error={errors.deadline}
        hint={`Gợi ý theo SLA: Cao ${sla.High} ngày · Trung bình ${sla.Medium} ngày · Thấp ${sla.Low} ngày.`}
      >
        <DateInput value={v.deadline} onChange={(deadline) => onChange({ deadline })} min={mode === "create" ? today : undefined} disabled={disabled} />
      </Field>

      <Field label="Lớp liên quan" hint={mode === "create" ? "Bỏ trống nếu hành động áp dụng cho toàn cấp học." : "Không thay đổi được sau khi tạo."}>
        {mode === "create" ? (
          <ClassPicker
            ds={ds}
            value={v.scopeClass}
            allowAll
            allLabel="Không gắn lớp (toàn cấp)"
            onChange={(scopeClass) => onChange({ scopeClass })}
            placeholder="Không gắn lớp (toàn cấp)"
            disabled={disabled}
          />
        ) : (
          <ReadOnlyBox>{v.scopeClass ? <ScopeClassPill code={v.scopeClass} /> : <span className="inline-flex items-center gap-2"><School aria-hidden className="size-4 text-slate-400" />Toàn cấp học</span>}</ReadOnlyBox>
        )}
      </Field>

      <Field label="Tuần phát sinh" hint={mode === "create" ? "Tuần dữ liệu dẫn tới hành động này (không bắt buộc)." : undefined}>
        {mode === "create" ? (
          <Select<string>
            options={weekOptions}
            value={v.sourceWeek}
            onChange={(sourceWeek) => onChange({ sourceWeek })}
            placeholder="Không gắn tuần"
            allowEmpty
            disabled={disabled}
          />
        ) : (
          <ReadOnlyBox>
            <span className="inline-flex items-center gap-2">
              <CalendarRange aria-hidden className="size-4 text-slate-400" />
              {v.sourceWeek ? `Tuần bắt đầu ${formatDateVN(v.sourceWeek)}` : "Không gắn tuần"}
            </span>
          </ReadOnlyBox>
        )}
      </Field>

      {mode === "edit" ? (
        <>
          <Field
            label="Minh chứng hoàn tất"
            error={errors.evidence}
            hint="Bắt buộc trước khi chuyển sang Hoàn thành: biên bản, kết quả kiểm tra, đường dẫn ảnh…"
            labelAside={<Counter text={v.evidence} max={LIMITS.evidence} />}
            className="sm:col-span-2"
          >
            <Textarea ref={evidenceRef} rows={3} value={v.evidence} disabled={disabled} onChange={(e) => onChange({ evidence: e.target.value })} />
          </Field>
          <Field label="Ghi chú cập nhật" hint="Được ghi vào lịch sử khi lưu." error={errors.note} className="sm:col-span-2">
            <Input value={v.note} disabled={disabled} onChange={(e) => onChange({ note: e.target.value })} placeholder="VD: Đã họp lớp, phụ huynh đã nắm thông tin" />
          </Field>
        </>
      ) : null}
    </div>
  );
}
