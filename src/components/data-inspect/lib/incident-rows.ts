/**
 * View-model helpers for the "Tất cả sự việc" table (search, data-check / source chips, cell texts). Pure – no React.
 * Rows always come from the engine (`filterIncidents`); these helpers only narrow and describe them.
 */
import { studentDisplayName, type RosterNames } from "@/components/entry/lib/student-names";
import { fmtNumber } from "@/lib/client/format";
import { matchesSearch, normalizeVN } from "@/lib/engine/text";
import type { DataCheck, Incident } from "@/lib/types";

export type DataCheckFilter = DataCheck | "ALL";
export type SourceFilter = "all" | Incident["source"];

export interface IncidentRowFilter {
  query?: string;
  dataCheck?: DataCheckFilter;
  source?: SourceFilter;
}

export const SOURCE_LABELS: Record<Incident["source"], string> = { app: "Ứng dụng", import: "Nhập Excel" };

/**
 * Everything a reviewer may search by: code, class, error, issue, category, student names (current roster name and the
 * name recorded on the incident) / ids, detail, reporter.
 */
export function incidentSearchText(i: Incident, roster?: RosterNames): string {
  return [
    i.code,
    i.externalId ?? "",
    i.classCode,
    i.errorCode,
    i.issue,
    i.category,
    ...i.students.flatMap((s) => {
      const name = studentDisplayName(s, roster);
      return name === s.name ? [s.name, s.id] : [name, s.name, s.id];
    }),
    i.detail ?? "",
    i.reporter ?? "",
    i.createdByName,
  ].join(" ");
}

/** Narrow engine-filtered incidents by the table toolbar (accent-insensitive search, data check, source). */
export function filterIncidentRows(incidents: readonly Incident[], f: IncidentRowFilter, roster?: RosterNames): Incident[] {
  const q = normalizeVN(f.query ?? "");
  const dc = f.dataCheck ?? "ALL";
  const src = f.source ?? "all";
  return incidents.filter(
    (i) => (dc === "ALL" || i.dataCheck === dc) && (src === "all" || i.source === src) && (!q || matchesSearch(incidentSearchText(i, roster), q)),
  );
}

/** Number of incidents per data check (for the filter chips). */
export function dataCheckCounts(incidents: readonly Incident[]): Record<DataCheck, number> {
  const out: Record<DataCheck, number> = { OK: 0, THIEU_TEN_HS: 0, REVIEW: 0 };
  for (const i of incidents) out[i.dataCheck] += 1;
  return out;
}

/** "3 HS" / "2 HS (1 chưa rõ tên)" for "/HS"; "2 lần" for "/lần". */
export function countText(i: Pick<Incident, "unit" | "relatedStudentCount" | "unnamedCount" | "occurrenceCount">): string {
  if (i.unit === "/lần") return `${fmtNumber(i.occurrenceCount)} lần`;
  const base = `${fmtNumber(i.relatedStudentCount)} HS`;
  return i.unnamedCount > 0 ? `${base} (${fmtNumber(i.unnamedCount)} chưa rõ tên)` : base;
}

/** Người ghi: the reporter field, falling back to the account that created the record. */
export function reporterOf(i: Pick<Incident, "reporter" | "createdByName">): string {
  return i.reporter?.trim() || i.createdByName;
}

/**
 * Named students as one line, e.g. "Nguyễn An, Trần Bình +1 HS chưa rõ tên"; "Tập thể lớp" when nobody is named.
 * Names follow the current roster when given (corrected names), else the names recorded on the incident.
 */
export function subjectsText(i: Pick<Incident, "students" | "unnamedCount" | "relatedStudentCount">, roster?: RosterNames): string {
  const names = i.students.map((s) => studentDisplayName(s, roster)).filter(Boolean);
  if (names.length === 0) {
    if (i.unnamedCount > 0) return `${fmtNumber(i.unnamedCount)} HS chưa rõ tên`;
    return i.relatedStudentCount > 0 ? `${fmtNumber(i.relatedStudentCount)} HS` : "Tập thể lớp";
  }
  const shown = names.length > 3 ? `${names.slice(0, 3).join(", ")} và ${names.length - 3} HS khác` : names.join(", ");
  return i.unnamedCount > 0 ? `${shown} + ${fmtNumber(i.unnamedCount)} HS chưa rõ tên` : shown;
}
