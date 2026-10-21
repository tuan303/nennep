"use client";
/** Engine results of the "Toàn trường" screen, memoized on the loaded datasets (object identity), the mode and today. */
import { useMemo } from "react";
import { dataConfidence } from "@/lib/engine";
import type { LevelDataset, LevelId } from "@/lib/types";
import {
  levelIssues,
  levelSummary,
  levelTrend,
  mergeTopIssues,
  mergeWeeklyTrends,
  schoolIncidents,
  schoolTotals,
  type LevelSummary,
  type MergedIssue,
  type SchoolPeriodMode,
  type SchoolTotals,
  type TrendMetric,
} from "../lib/school-model";

export interface SchoolData {
  /** Loaded levels in display order. */
  loaded: Array<{ levelId: LevelId; ds: LevelDataset; summary: LevelSummary }>;
  totals: SchoolTotals;
  confidence: number;
  issues: MergedIssue[];
  trend: (metric: TrendMetric) => ReturnType<typeof mergeWeeklyTrends>;
}

export function useSchoolData(
  levels: LevelId[],
  datasets: Partial<Record<LevelId, LevelDataset>>,
  mode: SchoolPeriodMode,
  today: string,
): SchoolData {
  // Re-key on the dataset objects themselves (a refetch replaces the object), not on the record wrapper.
  const levelKey = levels.join(",");
  const { TH, THCS, THPT } = datasets;
  const loadedDatasets = useMemo(() => {
    const byLevel: Partial<Record<LevelId, LevelDataset>> = { TH, THCS, THPT };
    return levelKey
      .split(",")
      .map((l) => byLevel[l as LevelId])
      .filter((d): d is LevelDataset => d !== undefined);
  }, [levelKey, TH, THCS, THPT]);

  const loaded = useMemo(
    () => loadedDatasets.map((ds) => ({ levelId: ds.levelId, ds, summary: levelSummary(ds, mode, today) })),
    [loadedDatasets, mode, today],
  );

  const totals = useMemo(() => schoolTotals(loaded.map((l) => l.summary)), [loaded]);
  const confidence = useMemo(
    () => dataConfidence(schoolIncidents(loaded.map((l) => ({ ds: l.ds, period: l.summary.period })))),
    [loaded],
  );
  const issues = useMemo(
    () => mergeTopIssues(loaded.map((l) => ({ levelId: l.levelId, issues: levelIssues(l.ds, l.summary.period) })), 5),
    [loaded],
  );
  const trends = useMemo(
    () => loadedDatasets.map((ds) => ({ levelId: ds.levelId, trend: levelTrend(ds, today), classCount: ds.classes.filter((c) => c.active).length })),
    [loadedDatasets, today],
  );
  const trend = useMemo(() => {
    const cache = new Map<TrendMetric, ReturnType<typeof mergeWeeklyTrends>>();
    return (metric: TrendMetric) => {
      let v = cache.get(metric);
      if (!v) {
        v = mergeWeeklyTrends(trends, metric);
        cache.set(metric, v);
      }
      return v;
    };
  }, [trends]);

  return { loaded, totals, confidence, issues, trend };
}
