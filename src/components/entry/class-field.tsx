"use client";
import { useState } from "react";
import { History, School } from "lucide-react";
import { ClassChips, ClassPicker } from "@/components/app/widgets";
import { Button, Pill } from "@/components/ui";
import { useMediaQuery } from "@/lib/client/hooks";
import type { LevelDataset } from "@/lib/types";

export interface ClassFieldProps {
  ds: Pick<LevelDataset, "classes">;
  value: string;
  onChange: (code: string) => void;
  /** Recently used classes (most recent first) for one-tap re-selection. */
  recent?: readonly string[];
  disabled?: boolean;
}

/**
 * Class choice tuned per device: searchable ClassPicker on desktops; on phones/tablets a tap grid (ClassChips with a
 * "Khối" switch) that collapses to a one-line summary once a class is chosen.
 */
export function ClassField({ ds, value, onChange, recent = [], disabled }: ClassFieldProps) {
  const touchLayout = useMediaQuery("(max-width: 1023.98px)");
  const [expanded, setExpanded] = useState(false);
  const current = ds.classes.find((c) => c.code === value);
  const quick = recent.filter((code) => code !== value && ds.classes.some((c) => c.code === code && c.active)).slice(0, 4);

  const pick = (code: string) => {
    onChange(code);
    setExpanded(false);
  };

  const recentRow =
    quick.length > 0 ? (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
          <History aria-hidden className="size-3.5" strokeWidth={2.25} />
          Lớp gần đây:
        </span>
        {quick.map((code) => (
          <Pill key={code} icon={School} onClick={() => pick(code)} disabled={disabled} aria-label={`Chọn lớp ${code}`}>
            <span className="num font-semibold">{code}</span>
          </Pill>
        ))}
      </div>
    ) : null;

  if (!touchLayout) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <ClassPicker ds={ds} value={value || undefined} onChange={pick} disabled={disabled} size="lg" aria-label="Lớp" />
        {recentRow}
      </div>
    );
  }

  if (value && !expanded) {
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-h-14 min-w-0 items-center gap-3 rounded-control border border-brand-200 bg-brand-50/70 py-2 pl-3 pr-2">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white shadow-press">
            <School aria-hidden className="size-5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="num text-lg font-bold leading-6 text-brand-900">Lớp {value}</p>
            <p className="truncate text-xs text-slate-600">{current?.homeroomTeacher ? `GVCN: ${current.homeroomTeacher}` : `Khối ${current?.grade ?? ""}`}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setExpanded(true)} disabled={disabled} aria-label={`Đổi lớp (đang chọn ${value})`}>
            Đổi lớp
          </Button>
        </div>
        {recentRow}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {recentRow}
      <ClassChips ds={ds} value={value || undefined} onChange={pick} showTeacher ariaLabel="Chọn lớp" />
    </div>
  );
}
