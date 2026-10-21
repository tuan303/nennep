"use client";
import { useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { Combobox, cn } from "@/components/ui";
import type { CatalogItem, LevelDataset } from "@/lib/types";
import { PenaltyPill } from "./badges";
import { errorOptions } from "./lib/error-options";
import { readRecentErrors, rememberRecentError } from "./lib/recent-errors";

export interface ErrorPickerProps {
  ds: Pick<LevelDataset, "levelId" | "catalog">;
  value?: string;
  onChange: (code: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-label"?: string;
  /** Remember picks in localStorage "nshm.recentErrors" and pin them under "Dùng gần đây" (default true). */
  trackRecent?: boolean;
  size?: "md" | "lg";
  className?: string;
}

/**
 * Error (lỗi) select grouped by Mảng. Each row shows the issue, its code and "2 điểm/HS" | "5 điểm/lần".
 * Accent-insensitive search on issue, code, Mảng and group; recently used errors first.
 */
export function ErrorPicker({
  ds,
  value,
  onChange,
  placeholder = "Chọn lỗi vi phạm",
  disabled,
  invalid,
  id,
  "aria-label": ariaLabel = "Chọn lỗi vi phạm",
  trackRecent = true,
  size,
  className,
}: ErrorPickerProps) {
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    setRecent(trackRecent ? readRecentErrors(ds.levelId) : []);
  }, [ds.levelId, trackRecent]);

  const byCode = useMemo(() => new Map<string, CatalogItem>(ds.catalog.map((c) => [c.code, c])), [ds.catalog]);
  const options = useMemo(() => errorOptions(ds.catalog, { recent, keep: value }), [ds.catalog, recent, value]);

  const handleChange = (code: string | undefined) => {
    if (!code) return;
    if (trackRecent) setRecent(rememberRecentError(ds.levelId, code));
    onChange(code);
  };

  return (
    <Combobox<string>
      options={options}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      searchPlaceholder="Gõ tên lỗi hoặc mã lỗi (vd: muộn, L01)…"
      emptyText="Không tìm thấy lỗi phù hợp"
      disabled={disabled}
      invalid={invalid}
      id={id}
      aria-label={ariaLabel}
      title="Chọn lỗi vi phạm"
      icon={ListChecks}
      size={size}
      className={className}
      renderOption={(o, { selected }) => {
        const item = byCode.get(o.value);
        return (
          <span className="flex min-w-0 flex-col gap-1 py-0.5">
            <span className={cn("line-clamp-2 leading-5", selected && "font-semibold")}>{o.label}</span>
            {item ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="num rounded bg-surface-3 px-1.5 py-px text-2xs font-bold text-slate-600">{item.code}</span>
                <PenaltyPill penalty={item.penalty} unit={item.unit} />
                {item.group ? <span className="text-2xs text-slate-400">{item.group}</span> : null}
              </span>
            ) : null}
          </span>
        );
      }}
      renderValue={(o) => {
        const item = byCode.get(o.value);
        return (
          <span className="flex min-w-0 items-center gap-2">
            <span className="num shrink-0 font-semibold text-brand-800">{o.value}</span>
            <span className="min-w-0 flex-1 truncate">{item?.issue ?? o.label}</span>
            {item ? <PenaltyPill penalty={item.penalty} unit={item.unit} className="shrink-0" /> : null}
          </span>
        );
      }}
    />
  );
}
