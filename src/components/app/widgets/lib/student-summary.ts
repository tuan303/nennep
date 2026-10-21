/** Student history helpers: per-error breakdown, alert texts and the plain-text summary (pure – unit-tested). */
import { fmtDate, fmtNumber } from "@/lib/client/format";
import { STUDENT_STATUS_LABELS } from "@/lib/constants";
import { weekdayLabelVN } from "@/lib/engine/dates";
import { naturalCompare } from "@/lib/engine/text";
import type { Incident, LevelConfig, StudentLite, Unit } from "@/lib/types";

export type StudentAlert = "NONE" | "REPEAT" | "WEEKLY_RED";

export const STUDENT_ALERT_LABELS: Record<StudentAlert, string> = {
  NONE: "Không có cảnh báo",
  REPEAT: "Tái phạm",
  WEEKLY_RED: "Cảnh báo đỏ",
};

/** Why the alert fired, from the level's thresholds. */
export function studentAlertDescription(alert: StudentAlert, config: Pick<LevelConfig, "studentAlert">): string {
  const { perWeek, repeatMin, repeatWindowWeeks } = config.studentAlert;
  if (alert === "WEEKLY_RED") return `Có từ ${perWeek} lượt vi phạm trở lên trong cùng một tuần`;
  if (alert === "REPEAT") return `Có từ ${repeatMin} lượt vi phạm trở lên trong ${repeatWindowWeeks} tuần liên tiếp`;
  return "Chưa chạm ngưỡng cảnh báo";
}

/** Points a named student carries for one incident: the penalty of a "/HS" error; "/lần" points belong to the class. */
export function studentPointsOf(i: Pick<Incident, "unit" | "penalty">): number {
  return i.unit === "/HS" ? i.penalty : 0;
}

export interface StudentErrorRow {
  errorCode: string;
  issue: string;
  category: string;
  unit: Unit;
  penalty: number;
  count: number;
  /** Points carried by the student for this error. */
  points: number;
}

/** Group a student's incidents by error code; count desc, points desc, code. */
export function studentErrorBreakdown(history: readonly Incident[]): StudentErrorRow[] {
  const map = new Map<string, StudentErrorRow>();
  for (const i of history) {
    const row = map.get(i.errorCode);
    if (row) {
      row.count += 1;
      row.points += studentPointsOf(i);
    } else {
      map.set(i.errorCode, {
        errorCode: i.errorCode,
        issue: i.issue,
        category: i.category,
        unit: i.unit,
        penalty: i.penalty,
        count: 1,
        points: studentPointsOf(i),
      });
    }
  }
  return [...map.values()]
    .map((r) => ({ ...r, points: Math.round(r.points * 100) / 100 }))
    .sort((a, b) => b.count - a.count || b.points - a.points || naturalCompare(a.errorCode, b.errorCode));
}

export interface StudentHistoryTotals {
  incidents: number;
  points: number;
  errorTypes: number;
}

export function summarizeHistory(history: readonly Incident[]): StudentHistoryTotals {
  const rows = studentErrorBreakdown(history);
  const points = rows.reduce((s, r) => s + r.points, 0);
  return { incidents: history.length, points: Math.round(points * 100) / 100, errorTypes: rows.length };
}

/** "−2 điểm" for "/HS"; "/lần" → "lớp bị trừ 5 điểm" (never attributed to the student). */
export function studentPointsText(i: Pick<Incident, "unit" | "penalty" | "points">): string {
  return i.unit === "/HS" ? `trừ ${fmtNumber(i.penalty)} điểm` : `lỗi tính theo lần, lớp bị trừ ${fmtNumber(i.points)} điểm`;
}

export interface StudentHistoryTextArgs {
  student: StudentLite;
  /** e.g. "Tháng 10/2026" or "Toàn bộ năm học". */
  periodText: string;
  /** Newest first (engine `studentHistory`). */
  history: readonly Incident[];
  alert: StudentAlert;
  config: Pick<LevelConfig, "studentAlert">;
}

/** Zalo-friendly plain-text summary of a student's history (FR "Sao chép"). */
export function buildStudentHistoryText({ student, periodText, history, alert, config }: StudentHistoryTextArgs): string {
  const totals = summarizeHistory(history);
  const lines: string[] = [
    `LỊCH SỬ NỀN NẾP – ${student.name}`,
    `Mã HS: ${student.id} · Lớp: ${student.classCode} · ${STUDENT_STATUS_LABELS[student.status]}`,
    `Phạm vi: ${periodText}`,
    `Tổng hợp: ${fmtNumber(totals.incidents)} lượt vi phạm · ${fmtNumber(totals.points)} điểm liên quan · ${fmtNumber(totals.errorTypes)} loại lỗi`,
  ];
  if (alert !== "NONE") lines.push(`Cảnh báo: ${STUDENT_ALERT_LABELS[alert]} – ${studentAlertDescription(alert, config)}`);
  if (history.length === 0) {
    lines.push("", "Không có vi phạm trong phạm vi này.");
    return lines.join("\n");
  }
  lines.push("", "Theo loại lỗi:");
  for (const r of studentErrorBreakdown(history)) {
    lines.push(`- ${r.errorCode} ${r.issue}: ${fmtNumber(r.count)} lượt${r.points > 0 ? `, ${fmtNumber(r.points)} điểm` : ""}`);
  }
  lines.push("", "Chi tiết:");
  history.forEach((i, idx) => {
    lines.push(`${idx + 1}. ${weekdayLabelVN(i.date)} ${fmtDate(i.date)} – ${i.errorCode} ${i.issue} – ${studentPointsText(i)} – ${i.status}`);
    const extra = [
      i.classCode !== student.classCode ? `Lớp lúc ghi: ${i.classCode}` : "",
      `Người ghi: ${i.reporter?.trim() || i.createdByName}`,
      i.detail?.trim() ? `Chi tiết: ${i.detail.trim().replace(/\s+/g, " ")}` : "",
    ].filter(Boolean);
    lines.push(`   ${extra.join(" | ")}`);
  });
  return lines.join("\n");
}
