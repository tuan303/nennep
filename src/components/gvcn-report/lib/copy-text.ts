/**
 * Zalo-friendly plain text of a class report, file names and print titles (pure – unit-tested).
 */
import { fmtDate, fmtNumber, fmtTopLabel } from "@/lib/client/format";
import { SCHOOL_NAME } from "@/lib/constants";
import { formatDayMonthVN } from "@/lib/engine";
import type { Period } from "@/lib/types";
import { shortWeekday, subjectText, type GvcnReport } from "./report-model";

/** "BÁO CÁO NỀN NẾP LỚP 6A01" */
export function reportTitle(classCode: string): string {
  return `BÁO CÁO NỀN NẾP LỚP ${classCode}`;
}

/** "Sự việc: 5 | HS liên quan: 7 | Điểm trừ: 14 | Điểm thưởng: 5 | Điểm thi đua: 491 | Hạng khối 6: 3/5" */
export function kpiLine(report: Pick<GvcnReport, "kpis" | "ranking" | "topRatio">): string {
  const { kpis, ranking } = report;
  const parts = [
    `Sự việc: ${fmtNumber(kpis.incidents)}`,
    `HS liên quan: ${fmtNumber(kpis.relatedStudents)}`,
    `Điểm trừ: ${fmtNumber(kpis.penaltyPoints)}`,
    `Điểm thưởng: ${fmtNumber(kpis.rewardPoints)}`,
  ];
  if (ranking) {
    parts.push(`Điểm thi đua: ${fmtNumber(ranking.score)}`);
    parts.push(`Hạng khối ${ranking.grade}: ${ranking.rank}/${ranking.gradeClassCount}${ranking.inTop90 ? ` (${fmtTopLabel(report.topRatio)})` : ""}`);
  }
  return parts.join(" | ");
}

/** "• 23/09 (T4) – Nguyễn Văn A – Đi chân đất/không đi giày dép – 2 điểm" */
export function incidentLine(i: Parameters<typeof subjectText>[0] & { date: string; issue: string; points: number }): string {
  return `• ${formatDayMonthVN(i.date)} (${shortWeekday(i.date)}) – ${subjectText(i)} – ${i.issue} – ${fmtNumber(i.points)} điểm`;
}

/** Plain text for Zalo / SMS: title, KPIs, one bullet per incident (oldest first), totals, signature line. */
export function buildCopyText(report: GvcnReport, periodText: string, today: string): string {
  const lines = [`${reportTitle(report.classCode)} – ${periodText}`];
  const teacher = report.classInfo?.homeroomTeacher;
  if (teacher) lines.push(`GVCN: ${teacher}`);
  lines.push(kpiLine(report), "");
  if (report.incidents.length === 0) {
    lines.push("Không có sự việc nào trong kỳ – lớp thực hiện tốt nền nếp.");
  } else {
    for (const i of report.incidents) lines.push(incidentLine(i));
    lines.push("", `Tổng cộng: ${fmtNumber(report.kpis.incidents)} sự việc, ${fmtNumber(report.kpis.penaltyPoints)} điểm trừ.`);
  }
  lines.push(`${SCHOOL_NAME} · Lập ngày ${fmtDate(today)}`);
  return lines.join("\n");
}

/** ASCII slug of a period for file names: "tuan-12-10-2026", "thang-10-2026", "HK1", "ca-nam". */
export function periodSlug(period: Period): string {
  if (period.mode === "all" || !period.key) return "ca-nam";
  if (period.mode === "week") return `tuan-${period.key.split("-").reverse().join("-")}`;
  if (period.mode === "month") return `thang-${period.key.split("-").reverse().join("-")}`;
  return period.key;
}

/** "Bao-cao-nen-nep-6A01-tuan-12-10-2026.xlsx" */
export function gvcnExportFileName(classCode: string, period: Period): string {
  return `Bao-cao-nen-nep-${classCode}-${periodSlug(period)}.xlsx`;
}

/** Document title while printing → default PDF file name in most browsers. */
export function gvcnPrintTitle(classCode: string, period: Period): string {
  return `Bao cao nen nep ${classCode} ${periodSlug(period)}`;
}
