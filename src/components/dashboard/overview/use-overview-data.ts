"use client";
/**
 * Shared engine results of the "Tổng quan" screen, memoized on the dataset object (identity changes on refetch),
 * the global filters and today. Card-specific engine calls live in the cards themselves.
 */
import { useMemo } from "react";
import {
  buildRanking,
  classStats,
  computeKpis,
  filterIncidents,
  kpiComparison,
  weeklyTrend,
  type ClassStat,
  type Kpis,
  type TrendPoint,
} from "@/lib/engine";
import type { GlobalFilters, GradeRanking, Incident, LevelDataset, Period } from "@/lib/types";
import { buildKpiViews, contextPeriod, crossFilterScopes, pendingRewards, sparkWeeks, type KpiId, type KpiView } from "../lib/overview-model";

export interface OverviewData {
  filtered: Incident[];
  /** Cross-filter scopes (see crossFilterScopes): for "Phân bổ theo mảng", "Top 5 vấn đề" and "Theo nhóm lỗi". */
  byCategory: Incident[];
  byError: Incident[];
  byGroup: Incident[];
  current: Kpis;
  previousLabel?: string;
  kpis: KpiView[];
  trend: TrendPoint[];
  ranking: { countedWeeks: number; grades: GradeRanking[] };
  classes: ClassStat[];
  /** Wider period for week-based context charts (a week → its semester). */
  context: { period: Period; widened: boolean };
}

const SPARK_SIZE = 8;

export function useOverviewData(ds: LevelDataset, filters: GlobalFilters, today: string): OverviewData {
  const filtered = useMemo(() => filterIncidents(ds, filters), [ds, filters]);
  const cross = useMemo(() => crossFilterScopes(filters), [filters]);
  const byCategory = useMemo(() => filterIncidents(ds, cross.category), [ds, cross]);
  const byError = useMemo(() => filterIncidents(ds, cross.error), [ds, cross]);
  const byGroup = useMemo(() => filterIncidents(ds, cross.group), [ds, cross]);
  const comparison = useMemo(() => kpiComparison(ds, filters), [ds, filters]);
  const trend = useMemo(() => weeklyTrend(ds, filters, today), [ds, filters, today]);
  const ranking = useMemo(
    () => buildRanking(ds, filters.period, today, { highlightClass: filters.classCode }),
    [ds, filters.period, filters.classCode, today],
  );
  const classes = useMemo(() => classStats(ds, filters), [ds, filters]);
  const context = useMemo(() => contextPeriod(filters.period, ds.weeks), [filters.period, ds.weeks]);

  const kpis = useMemo(() => {
    const weeks = sparkWeeks(trend, filters.period, ds.weeks, SPARK_SIZE);
    const perWeek = weeks.map((key) => computeKpis(ds, { ...filters, period: { mode: "week", key } }));
    const spark: Record<KpiId, number[]> = {
      incidents: perWeek.map((k) => k.incidents),
      turns: perWeek.map((k) => k.violationTurns),
      students: perWeek.map((k) => k.uniqueStudents),
      penalty: perWeek.map((k) => k.penaltyPoints),
      reward: perWeek.map((k) => k.rewardPoints),
      confidence: perWeek.map((k) => Math.round(k.confidence * 1000) / 10),
    };
    return buildKpiViews({
      current: comparison.current,
      previous: comparison.previous,
      mode: filters.period.mode,
      classTotal: classes.length,
      minConfidence: ds.config.rag.minConfidence,
      pendingReward: pendingRewards(ds, filters),
      countedStatuses: ds.config.rewardCountedStatuses,
      spark,
    });
  }, [ds, filters, trend, comparison, classes.length]);

  return {
    filtered,
    byCategory,
    byError,
    byGroup,
    current: comparison.current,
    previousLabel: comparison.previousLabel,
    kpis,
    trend,
    ranking,
    classes,
    context,
  };
}
