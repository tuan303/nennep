/**
 * Dashboard analytics (ARCHITECTURE §5.1 "analytics.ts"). Implementation is split by theme:
 * - analytics-core.ts:     Kpis, computeKpis, kpiComparison, topIssues, classStats, gradeStats, categoryBreakdown,
 *                          violationTurnsOf, groupBreakdown (+ NO_GROUP_LABEL), weekdayDistribution
 * - analytics-students.ts: studentStats, studentHistory, recidivism (+ helpers)
 * - analytics-trends.ts:   weeklyTrend, classWeekHeatmap, classTimeline, fiveS (+ fiveSCodes)
 * - analytics-history.ts:  cumulativePenalty, rankHistory (REQ_V2 §4.3)
 */
export * from "./analytics-core";
export * from "./analytics-students";
export * from "./analytics-trends";
export * from "./analytics-history";
