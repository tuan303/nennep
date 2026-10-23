/**
 * Export view models (FR-XLS-003, FR-SNP-001): ranking / student report rows and the HTML snapshot input, all
 * computed by the engine for the chosen period. Pure – no React, no ExcelJS.
 */
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import { classStats, computeKpis, studentStats, topIssues } from "@/lib/engine/analytics";
import { filterIncidents } from "@/lib/engine/filters";
import { periodLabel, type PeriodOption } from "@/lib/engine/period";
import { buildRanking, rankingRuleOf } from "@/lib/engine/ranking";
import { LEVELS, SCHOOL_NAME } from "@/lib/constants";
import type { HtmlSnapshotInput } from "@/lib/excel/html-snapshot";
import type { RankingExportRow, StudentExportRow } from "@/lib/excel/report-columns";
import type { LevelDataset, LevelId, Period, PeriodMode } from "@/lib/types";

export function workbookFileName(levelId: LevelId, today: string): string {
  return `NSHM_NenNep_${levelId}_${today}.xlsx`;
}

export function snapshotFileName(levelId: LevelId, today: string): string {
  return `NSHM_NenNep_${levelId}_BanChup_${today}.html`;
}

/**
 * "Xếp hạng" sheet rows: every ranking table of the engine (per khối, or the single level-wide table of THPT – rows keep
 * the class's own grade), RAG kept as status → rendered as label text + colour, lượt vi phạm for the THPT tie-break.
 */
export function rankingExportRows(ds: LevelDataset, period: Period, today: string): RankingExportRow[] {
  return buildRanking(ds, period, today).grades.flatMap((g) =>
    g.rows.map((r) => {
      const row: RankingExportRow = {
        grade: r.grade,
        classCode: r.classCode,
        base: r.base,
        rewardPoints: r.rewardPoints,
        penaltyPoints: r.penaltyPoints,
        score: r.score,
        rank: r.rank,
        inTop90: r.inTop90,
        rag: r.rag,
        violationTurns: r.violationTurns,
      };
      if (r.homeroomTeacher) row.homeroomTeacher = r.homeroomTeacher;
      return row;
    }),
  );
}

/** "BC Học sinh" sheet rows from engine studentStats (errors as "Đi học muộn (2), Đồng phục (1)"). */
export function studentExportRows(ds: LevelDataset, period: Period, today: string): StudentExportRow[] {
  return studentStats(ds, { period }, today).map((s) => ({
    id: s.id,
    name: s.name,
    classCode: s.classCode,
    incidents: s.incidents,
    points: s.points,
    errors: s.errors.map((e) => `${e.issue} (${e.count})`).join(", "),
    alert: s.alert,
  }));
}

/**
 * Input of buildHtmlSnapshot: formatted KPIs, the ranking tables (per khối, or one "Toàn cấp" table for THPT – grade
 * LEVEL_RANKING_GROUP), top issues and top classes of the period.
 */
export function snapshotInput(ds: LevelDataset, period: Period, today: string, generatedAt: string): HtmlSnapshotInput {
  const k = computeKpis(ds, { period });
  const activeClasses = ds.classes.filter((c) => c.active).length;
  const ranking = buildRanking(ds, period, today);
  return {
    schoolName: SCHOOL_NAME,
    levelName: LEVELS[ds.levelId].name,
    periodLabel: periodLabel(period, ds.config.semesters),
    generatedAt,
    topRatio: ds.config.top90Ratio,
    rankingLayout: rankingRuleOf(ds.levelId),
    kpis: [
      { label: "Sự việc", value: fmtNumber(k.incidents) },
      { label: "Học sinh liên quan", value: fmtNumber(k.relatedStudents) },
      { label: "Điểm trừ", value: fmtNumber(k.penaltyPoints) },
      { label: "Điểm thưởng", value: fmtNumber(k.rewardPoints) },
      { label: "Lớp phát sinh", value: `${fmtNumber(k.classesWithIncidents)}/${fmtNumber(activeClasses)}` },
      { label: "Độ tin cậy dữ liệu", value: fmtPercent(k.confidence) },
    ],
    rankingByGrade: ranking.grades.map((g) => ({
      grade: g.grade,
      rows: g.rows.map((r) => ({
        rank: r.rank,
        classCode: r.classCode,
        score: r.score,
        penalty: r.penaltyPoints,
        reward: r.rewardPoints,
        inTop90: r.inTop90,
        rag: r.rag,
        violationTurns: r.violationTurns,
      })),
    })),
    topIssues: topIssues(filterIncidents(ds, { period }), 10).map((t) => ({ issue: `${t.errorCode} · ${t.issue}`, incidents: t.incidents, points: t.points })),
    topClasses: classStats(ds, { period })
      .filter((c) => c.incidents > 0)
      .slice(0, 10)
      .map((c) => ({ classCode: c.classCode, incidents: c.incidents, points: c.points })),
  };
}

/** One-line content summary of the level workbook ("80 sự việc · 60 học sinh · …"). */
export function workbookContents(ds: LevelDataset): Array<{ label: string; value: number }> {
  return [
    { label: "sự việc", value: ds.incidents.length },
    { label: "học sinh", value: ds.students.length },
    { label: "điểm thưởng", value: ds.rewards.length },
    { label: "lớp", value: ds.classes.length },
    { label: "mã lỗi", value: ds.catalog.length },
    { label: "tuần", value: ds.weeks.length },
  ];
}

/** Key to select when the export period mode changes: the current option, else the latest past one. */
export function keyForMode(lists: { weeks: PeriodOption[]; months: PeriodOption[]; semesters: PeriodOption[] }, mode: PeriodMode): string | undefined {
  const list = mode === "week" ? lists.weeks : mode === "month" ? lists.months : mode === "semester" ? lists.semesters : [];
  if (list.length === 0) return undefined;
  const current = list.find((o) => o.isCurrent);
  if (current) return current.key;
  const past = list.filter((o) => !o.isFuture);
  return (past[past.length - 1] ?? list[0]).key;
}
