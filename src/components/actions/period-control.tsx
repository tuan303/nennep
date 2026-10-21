"use client";
/** "Kỳ báo cáo" bar of the Hành động tabs: mode + period of the global filters (URL-synced, shared with the statistics). */
import { CalendarRange } from "lucide-react";
import { Card, SegmentedControl } from "@/components/ui";
import { PERIOD_MODE_OPTIONS, PeriodPicker } from "@/components/app/shell";
import { useFilters } from "@/lib/client/filters";
import type { PeriodMode } from "@/lib/types";

export function PeriodControl() {
  const f = useFilters();
  const { period } = f.filters;
  return (
    <Card padding="sm" data-print-hide>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-900">
          <CalendarRange aria-hidden className="size-[18px] text-brand-600" strokeWidth={2.25} />
          Kỳ báo cáo
        </div>
        <SegmentedControl<PeriodMode>
          options={PERIOD_MODE_OPTIONS}
          value={period.mode}
          onChange={(mode) => f.setFilters({ period: { mode } })}
          size="sm"
          ariaLabel="Loại kỳ báo cáo"
          className="max-w-full"
        />
        <PeriodPicker
          mode={period.mode}
          value={period.key}
          options={f.options}
          onChange={(key) => f.setFilters({ period: { mode: period.mode, key } })}
          className="min-w-0 lg:w-80"
        />
        <p className="text-xs leading-5 text-slate-500 lg:ml-auto lg:max-w-56 lg:text-right">Dùng chung kỳ với các màn hình thống kê.</p>
      </div>
    </Card>
  );
}
