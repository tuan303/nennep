"use client";
import { useMemo } from "react";
import { School } from "lucide-react";
import { Combobox, type ComboOption } from "@/components/ui";
import type { LevelDataset } from "@/lib/types";
import { classOptions } from "./lib/class-options";

/** Sentinel option value of "Tất cả lớp" (never a real class code). */
const ALL = "__all__";

interface ClassPickerBase {
  ds: Pick<LevelDataset, "classes">;
  value?: string;
  /** Only classes of this grade. */
  grade?: number;
  /** Codes shown but not selectable. */
  disabledCodes?: readonly string[];
  /** Only these codes (e.g. a GVCN's own classes). */
  restrictTo?: readonly string[];
  /** Also list inactive classes (default: only active ones, plus the current value). */
  includeInactive?: boolean;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-label"?: string;
  size?: "md" | "lg";
  className?: string;
}

export type ClassPickerProps = ClassPickerBase &
  (
    | { allowAll?: false; onChange: (code: string) => void }
    | {
        /** Adds "Tất cả lớp" (→ `onChange(undefined)`) and a clear button. */
        allowAll: true;
        onChange: (code: string | undefined) => void;
        /** Label of the "all" option (default "Tất cả lớp"). */
        allLabel?: string;
      }
  );

/**
 * Searchable class select grouped by "Khối N", GVCN as second line (search by teacher name works too).
 * Popover on desktop, bottom sheet on phones.
 */
export function ClassPicker(props: ClassPickerProps) {
  const { ds, value, grade, disabledCodes, restrictTo, includeInactive, placeholder, disabled, invalid, id, size, className } = props;
  const allLabel = props.allowAll ? (props.allLabel ?? "Tất cả lớp") : undefined;

  const options = useMemo<ComboOption<string>[]>(() => {
    const list = classOptions(ds.classes, { grade, includeInactive, restrictTo, keep: value }, disabledCodes);
    return allLabel ? [{ value: ALL, label: allLabel, description: grade ? `Mọi lớp khối ${grade}` : "Không lọc theo lớp" }, ...list] : list;
  }, [ds.classes, grade, includeInactive, restrictTo, value, disabledCodes, allLabel]);

  const handleChange = (v: string | undefined) => {
    if (props.allowAll) props.onChange(v === ALL ? undefined : v);
    else if (v !== undefined && v !== ALL) props.onChange(v);
  };

  return (
    <Combobox<string>
      options={options}
      value={value ?? (props.allowAll ? ALL : undefined)}
      onChange={handleChange}
      placeholder={placeholder ?? (props.allowAll ? allLabel : "Chọn lớp")}
      searchPlaceholder="Tìm lớp hoặc tên GVCN…"
      emptyText="Không có lớp phù hợp"
      clearable={props.allowAll && !!value}
      disabled={disabled}
      invalid={invalid}
      id={id}
      aria-label={props["aria-label"] ?? "Chọn lớp"}
      title="Chọn lớp"
      icon={School}
      size={size}
      className={className}
      renderValue={(o) =>
        o.value === ALL ? (
          o.label
        ) : (
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="num font-semibold text-brand-900">{o.label}</span>
            {o.description ? <span className="truncate text-[13px] text-slate-500">{o.description}</span> : null}
          </span>
        )
      }
    />
  );
}
