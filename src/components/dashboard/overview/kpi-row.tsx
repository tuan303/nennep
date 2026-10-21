"use client";
import { Award, ClipboardList, School, ShieldCheck, TriangleAlert, Users, type LucideIcon } from "lucide-react";
import { KpiCard, cn, toneHex } from "@/components/ui";
import { Sparkline } from "@/components/charts";
import type { KpiId, KpiView } from "../lib/overview-model";

const ICONS: Record<KpiId, LucideIcon> = {
  incidents: ClipboardList,
  students: Users,
  penalty: TriangleAlert,
  reward: Award,
  classes: School,
  confidence: ShieldCheck,
};

export interface KpiRowProps {
  views: KpiView[];
  /** Drill-downs per KPI (e.g. confidence → Dữ liệu & rà soát). */
  onOpen?: Partial<Record<KpiId, () => void>>;
  className?: string;
}

/**
 * 6 KPI tiles: 2 per row on phones, 3 on tablets, 6 on desktop. The kit card draws its sparkline only when the tile
 * is ≥ 220px wide, so narrow tiles get a compact sparkline in their footer instead (container query of the card).
 */
export function KpiRow({ views, onOpen, className }: KpiRowProps) {
  return (
    <section aria-label="Chỉ số chính" className={cn("grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6", className)}>
      {views.map((v) => {
        const hasSpark = v.spark.length >= 2;
        const footer =
          v.note || hasSpark ? (
            <span className="flex flex-col gap-1.5">
              {v.note ? <span className="line-clamp-2">{v.note}</span> : null}
              {hasSpark ? (
                <Sparkline
                  data={v.spark}
                  color={toneHex[v.tone]}
                  width={96}
                  height={22}
                  strokeWidth={1.75}
                  ariaLabel={`Xu hướng ${v.label.toLowerCase()} các tuần gần đây`}
                  className="@min-[220px]:hidden"
                />
              ) : null}
            </span>
          ) : undefined;
        return (
          <KpiCard
            key={v.id}
            label={v.label}
            value={v.value}
            unit={v.unit}
            icon={ICONS[v.id]}
            tone={v.tone}
            hint={v.hint}
            delta={v.delta}
            sparkline={hasSpark ? v.spark : undefined}
            footer={footer}
            onClick={onOpen?.[v.id]}
          />
        );
      })}
    </section>
  );
}
