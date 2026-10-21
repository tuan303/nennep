"use client";
import { useMemo } from "react";
import { Sun, Sunset } from "lucide-react";
import { DateInput, Field, Input, SegmentedControl, Select, Textarea } from "@/components/ui";
import { isIsoDate, weekdayLabelVN } from "@/lib/engine/dates";
import { calendarStart } from "@/lib/engine/period";
import type { LevelDataset } from "@/lib/types";
import { ClassMultiSelect } from "./class-multi-select";
import { GENERAL_INSPECTION_LABEL, INSPECTION_NOTE_MAX, INSPECTOR_MAX, inspectionCategories, type InspectionForm, type ShiftChoice } from "./lib/inspection-form";

type ShiftValue = "Sáng" | "Chiều" | "none";
const SHIFT_OPTIONS = [
  { value: "Sáng" as const, label: "Sáng", icon: Sun },
  { value: "Chiều" as const, label: "Chiều", icon: Sunset },
  // No icon: keeps the full label on one line in a 3-way control on 375px phones.
  { value: "none" as const, label: "Không ghi" },
];
const GENERAL = "__general__";

export interface InspectionFieldsProps {
  ds: Pick<LevelDataset, "classes" | "catalog" | "weeks">;
  form: InspectionForm;
  onChange: (patch: Partial<InspectionForm>) => void;
  today: string;
  /** Edit mode: the stored Mảng / classes stay selectable even if removed / deactivated since. */
  keepCategory?: string;
  keepClasses?: readonly string[];
  /** Highlight the class grid (save attempted without a class). */
  classesInvalid?: boolean;
}

/** Ngày · Buổi · Mảng · Lớp (multi-select) · Người kiểm tra · Ghi chú. Used by the create card and the edit dialog. */
export function InspectionFields({ ds, form, onChange, today, keepCategory, keepClasses, classesInvalid }: InspectionFieldsProps) {
  const categories = useMemo(() => inspectionCategories(ds.catalog, keepCategory), [ds.catalog, keepCategory]);
  const categoryOptions = useMemo(
    () => [{ value: GENERAL, label: `${GENERAL_INSPECTION_LABEL} (mọi mảng)` }, ...categories.map((c) => ({ value: c, label: c }))],
    [categories],
  );
  const dateHint = !form.date ? "Chọn ngày kiểm tra." : isIsoDate(form.date) ? `${weekdayLabelVN(form.date)}${form.date === today ? " · hôm nay" : ""}` : undefined;

  return (
    <div className="@container">
      <div className="grid min-w-0 gap-4 @lg:grid-cols-2">
        <Field label="Ngày kiểm tra" required hint={dateHint}>
          <DateInput value={form.date} onChange={(v) => onChange({ date: v })} min={calendarStart(ds.weeks)} max={today} size="lg" />
        </Field>
        <Field label="Buổi">
          <SegmentedControl<ShiftValue>
            options={SHIFT_OPTIONS}
            value={form.shift || "none"}
            onChange={(v) => onChange({ shift: (v === "none" ? "" : v) as ShiftChoice })}
            ariaLabel="Buổi kiểm tra"
            fullWidth
          />
        </Field>
        <Field label="Mảng kiểm tra" hint="“Kiểm tra chung” khi kiểm tra mọi mảng nền nếp." className="@lg:col-span-2">
          <Select<string>
            options={categoryOptions}
            value={form.category || GENERAL}
            onChange={(v) => onChange({ category: !v || v === GENERAL ? "" : v })}
            size="lg"
          />
        </Field>
        <Field label="Lớp được kiểm tra" required className="@lg:col-span-2" error={classesInvalid ? "Chọn ít nhất 1 lớp được kiểm tra." : undefined}>
          <ClassMultiSelect classes={ds.classes} value={form.classCodes} onChange={(codes) => onChange({ classCodes: codes })} keep={keepClasses} invalid={classesInvalid} />
        </Field>
        <Field label="Người kiểm tra" hint={form.inspector.trim() ? undefined : "Để trống: dùng tên tài khoản của thầy/cô."}>
          <Input value={form.inspector} onChange={(e) => onChange({ inspector: e.target.value })} maxLength={INSPECTOR_MAX} autoComplete="name" enterKeyHint="done" />
        </Field>
        <Field label="Ghi chú" labelAside={form.note ? `${form.note.length}/${INSPECTION_NOTE_MAX}` : undefined}>
          <Textarea
            value={form.note}
            onChange={(e) => onChange({ note: e.target.value })}
            maxLength={INSPECTION_NOTE_MAX}
            rows={1}
            className="min-h-12"
            placeholder="Không bắt buộc – ví dụ: kiểm tra đột xuất giờ truy bài"
          />
        </Field>
      </div>
    </div>
  );
}
