/**
 * Dashboard analytics (ARCHITECTURE §5.1 "analytics.ts"). Implementation is split by theme:
 * - analytics-core.ts:     Kpis, computeKpis, kpiComparison, topIssues, classStats, gradeStats, categoryBreakdown, weekdayDistribution
 * - analytics-students.ts: studentStats, studentHistory, recidivism (+ helpers)
 * - analytics-trends.ts:   weeklyTrend, classWeekHeatmap, classTimeline, fiveS (+ fiveSCodes)
 */
export * from "./analytics-core";
export * from "./analytics-students";
export * from "./analytics-trends";
