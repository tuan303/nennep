/**
 * Workbook import – "Nhập liệu" (IO-01) + "HS liên quan" (IO-02).
 * ERROR (row skipped): invalid/empty/future date, date outside the calendar weeks, unknown class, unknown error code,
 * invalid/duplicate code, and a code that already belongs to ANOTHER incident (other class or error).
 * Otherwise the incident is rebuilt with the business rules (buildIncidentCore) and flagged for review when the
 * source is unreliable. Idempotent: doc id = `${level}_${code}`; a soft-deleted record is left alone.
 * An existing record is updated from the file only if it was not changed in the app since its last import
 * (`importHash`: GVCN feedback, review fixes, edits are never reverted silently) – otherwise the row is a WARNING
 * and skipped, unless `options.overwriteAppChanges`. Updates keep the catalog snapshot (penalty/unit at the time of
 * recording) while the error code is unchanged, the student snapshots of students already linked, the creator,
 * creation time, GVCN feedback and photos; a blank status cell keeps the stored status.
 */
import type { WorkbookPayload, ImportedLink } from "../../contract";
import { isIsoDate, mondayOf } from "../../engine/dates";
import { buildIncidentCore, computePoints, normalizeCounts, round2 } from "../../engine/scoring";
import { recordDocId } from "../../firestore-paths";
import type { CatalogItem, DataIssue, Incident, Scope, Student, StudentLite } from "../../types";
import { CALENDAR_MSG, calendarWeekSet } from "../calendar";
import { catalogFromSnapshot, omitEmpty, omitKeys } from "../records";
import { cleanText, makeClassLookup } from "./common";
import { canonicalJson, hashOf } from "./hash";
import type { CodeAllocator } from "./workbook-codes";
import { isValidCode } from "./workbook-codes";
import { buildNameIndex, resolveLinks, type LinkOutcome } from "./workbook-links";
import type { ReferencePlan, WorkbookOptions } from "./workbook-reference";
import type { ImportReport, RowAction } from "./workbook-report";
import { mapScope, parseIncidentStatus, penaltyText, resolveImportedStatus, splitEvidence } from "./workbook-text";

export type IncidentDraft = Omit<Incident, "createdAt" | "createdBy" | "createdByName" | "updatedAt" | "updatedBy" | "importBatchId" | "rev" | "importHash">;

export interface PlannedRecord<D, T> {
  action: "create" | "update";
  draft: D;
  existing?: T;
}

export interface IncidentPlanInput {
  payload: WorkbookPayload;
  options: WorkbookOptions;
  ref: ReferencePlan;
  students: ReadonlyMap<string, StudentLite>;
  /** Full student documents of the level (history, to validate links at the incident date). */
  studentDocs?: ReadonlyMap<string, Pick<Student, "history">>;
  existing: ReadonlyMap<string, Incident>;
  allocator: CodeAllocator;
  today: string;
  report: ImportReport;
}

export const DELETED_SKIP_MESSAGE = "Sự việc này đã bị xóa trong hệ thống – bỏ qua (khôi phục trong mục Dữ liệu nếu cần).";
export const APP_CHANGED_SKIP_MESSAGE =
  "Sự việc đã được cập nhật trong phần mềm sau lần nhập trước (phản hồi GVCN, rà soát, chỉnh sửa…) – giữ bản trong phần mềm, " +
  "không cập nhật theo file. Chọn “Ghi đè thay đổi trong phần mềm” nếu muốn cập nhật theo file.";
const OPTIONAL_KEYS = ["group", "reporter", "detail", "externalId", "gvcnNote", "gvcnNoteBy", "gvcnNoteAt"] as const satisfies ReadonlyArray<keyof IncidentDraft>;

/** The existing record without the fields the import never compares (timestamps, actor, batch, revision, hash). */
export function incidentContent(i: Incident): IncidentDraft {
  const { createdAt: _a, createdBy: _b, createdByName: _c, updatedAt: _d, updatedBy: _e, importBatchId: _f, rev: _g, importHash: _h, ...rest } = i;
  return rest;
}

/** Hash of record content written by an import (stored as `importHash`). */
export function importHashOf(content: object): string {
  return hashOf(content).slice(0, 32);
}

/** True when the record still holds exactly what its last import wrote (no change in the app since). */
export function unchangedSinceImport(i: Incident): boolean {
  return !!i.importHash && importHashOf(incidentContent(i)) === i.importHash;
}

interface Prepared {
  rowNumber: number;
  code: string;
  date: string;
  errors: string[];
  classCode: string;
  item?: CatalogItem;
  row: WorkbookPayload["incidents"][number];
}

function reportLinks(report: ImportReport, outcomes: LinkOutcome[], incidentAction: RowAction): void {
  for (const o of outcomes) {
    report.row("links", {
      rowNumber: o.link.rowNumber,
      key: o.link.incidentCode,
      errors: o.errors,
      warnings: o.warnings,
      action: o.attached ? incidentAction : "skip",
    });
  }
}

function skipLinks(report: ImportReport, links: readonly ImportedLink[]): void {
  for (const l of links) report.row("links", { rowNumber: l.rowNumber, key: l.incidentCode, action: "skip" });
}

export function planIncidents(input: IncidentPlanInput): { writes: Array<PlannedRecord<IncidentDraft, Incident>>; review: number } {
  const { payload, options, ref, report, allocator } = input;
  if (!options.incidents) {
    report.skipAll("incidents", payload.incidents.length);
    report.skipAll("links", payload.links.length);
    return { writes: [], review: 0 };
  }
  const overwrite = options.overwriteAppChanges === true;
  const lookupClass = makeClassLookup(ref.classes);
  const catalog = new Map(ref.catalog.map((c) => [c.code.toUpperCase(), c]));
  const weekSet = calendarWeekSet(ref.weeks);
  const names = buildNameIndex(input.students.values());
  const linksByCode = new Map<string, ImportedLink[]>();
  for (const l of payload.links) {
    const code = l.incidentCode.trim();
    linksByCode.set(code, [...(linksByCode.get(code) ?? []), l]);
  }

  // Pass 1: hard validation; remember imported codes so generated codes never collide with them.
  const seen = new Map<string, number>();
  const prepared: Prepared[] = payload.incidents.map((row) => {
    const errors: string[] = [];
    const code = row.code.trim();
    if (code && !isValidCode(code)) errors.push(`Mã sự việc "${code}" không hợp lệ.`);
    if (code && seen.has(code)) errors.push(`Mã sự việc ${code} bị trùng với dòng ${seen.get(code)}.`);
    if (code && !seen.has(code)) seen.set(code, row.rowNumber);
    const date = row.date.trim();
    if (!date) errors.push("Thiếu ngày ghi nhận.");
    else if (!isIsoDate(date)) errors.push(`Ngày "${date}" không hợp lệ.`);
    else if (date > input.today) errors.push(`Ngày ${date} ở tương lai.`);
    else if (!weekSet.has(mondayOf(date))) errors.push(CALENDAR_MSG.outside(date));
    const cls = lookupClass(row.classCode);
    if (!cls) errors.push(row.classCode.trim() ? `Lớp ${row.classCode.trim()} không có trong danh mục lớp.` : "Thiếu lớp.");
    const item = catalog.get(row.errorCode.trim().toUpperCase());
    if (!item) errors.push(row.errorCode.trim() ? `Mã lỗi ${row.errorCode.trim()} không có trong bảng điểm lỗi.` : "Thiếu mã lỗi.");
    if (errors.length === 0 && code) allocator.noteImported(code);
    return { rowNumber: row.rowNumber, code, date, errors, classCode: cls?.code ?? row.classCode.trim(), item, row };
  });

  // Links pointing to codes that are not in "Nhập liệu" (e.g. legacy formulas shifted by moved rows).
  const fileCodes = new Set(prepared.map((p) => p.code).filter(Boolean));
  for (const [code, links] of linksByCode) {
    if (fileCodes.has(code)) continue;
    for (const l of links) {
      report.row("links", {
        rowNumber: l.rowNumber,
        key: code,
        errors: [code ? `Mã sự việc ${code} không có trong trang “Nhập liệu”.` : "Thiếu mã sự việc."],
        action: "skip",
      });
    }
  }

  // Pass 2: build records.
  const writes: Array<PlannedRecord<IncidentDraft, Incident>> = [];
  let review = 0;
  for (const p of prepared) {
    const links = p.code ? linksByCode.get(p.code) ?? [] : [];
    const cls = lookupClass(p.classCode);
    if (p.errors.length > 0 || !cls || !p.item) {
      report.row("incidents", { rowNumber: p.rowNumber, key: p.code, errors: p.errors, action: "skip", pointsInFile: p.row.pointsInFile });
      skipLinks(report, links);
      continue;
    }
    const code = p.code || allocator.generate("NN", p.date);
    const id = recordDocId(payload.levelId, code);
    const existing = input.existing.get(id);
    if (existing?.deletedAt) {
      report.row("incidents", { rowNumber: p.rowNumber, key: code, warnings: [DELETED_SKIP_MESSAGE], action: "skip" });
      skipLinks(report, links);
      continue;
    }
    const warnings: string[] = [];
    // A code identifies one incident: a stored record of another class / error is a different incident (legacy
    // sheets renumber rows when sorted; app codes restart at 0001 every day) – never overwrite it silently.
    const sameError = !!existing && existing.errorCode.toUpperCase() === p.item.code.toUpperCase();
    if (existing && (existing.classCode !== cls.code || !sameError)) {
      const message = `Mã ${code} đã thuộc một sự việc khác trong hệ thống (lớp ${existing.classCode}, lỗi ${existing.errorCode}, ngày ${existing.date})`;
      if (!overwrite) {
        report.row("incidents", { rowNumber: p.rowNumber, key: code, errors: [`${message} – kiểm tra lại mã trong file; không ghi đè.`], action: "skip" });
        skipLinks(report, links);
        continue;
      }
      warnings.push(`${message} – ghi đè theo file (đã chọn ghi đè).`);
    }
    // Error code unchanged → the catalog snapshot of the stored record (penalty/unit at the time of recording).
    const item = existing && sameError ? catalogFromSnapshot(existing) : p.item;
    // No link rows for a stored incident: the file says nothing about its students → keep the stored snapshots.
    const resolved =
      existing && links.length === 0
        ? {
            students: existing.students,
            issues: existing.students
              .filter((s) => s.classCode !== cls.code)
              .map((s): DataIssue => ({ code: "STUDENT_WRONG_CLASS", message: `${s.name} (mã ${s.id}) thuộc lớp ${s.classCode}, không phải lớp ${cls.code}.` })),
            outcomes: [] as LinkOutcome[],
          }
        : resolveLinks(links, cls.code, input.students, names, { existing: existing?.students, date: p.date, history: input.studentDocs });
    const extra: DataIssue[] = [...resolved.issues];
    if (!p.code) warnings.push(`Không có mã sự việc – hệ thống cấp mã ${code} (nhập lại file này sẽ tạo bản ghi mới).`);
    let scope: Scope | undefined = mapScope(p.row.scope);
    if (!scope) {
      scope = resolved.students.length > 0 ? "Cá nhân" : "Tập thể";
      extra.push({ code: "SCOPE_MISSING", message: `Phạm vi trống hoặc không rõ trong file – mặc định “${scope}”.` });
    }
    // BR-POINT-04: "Cá nhân" needs a named student ("/HS" rows get MISSING_STUDENTS from computeDataCheck).
    if (scope === "Cá nhân" && resolved.students.length === 0 && item.unit === "/lần") {
      extra.push({ code: "MISSING_STUDENTS", message: "Phạm vi Cá nhân nhưng chưa có học sinh liên quan." });
    }
    const legacy = cleanText(p.row.legacyCheckText);
    if (legacy) extra.push({ code: "LEGACY_NOTE", message: `Ghi chú trong file cũ: ${legacy}` });
    const counts = normalizeCounts(item.unit, scope, p.row.occurrenceCount || 1, p.row.unnamedCount ?? existing?.unnamedCount ?? 0);
    const points = computePoints({ unit: item.unit, penalty: item.penalty, namedCount: resolved.students.length, ...counts });
    const pointsInFile = typeof p.row.pointsInFile === "number" ? round2(p.row.pointsInFile) : undefined;
    if (pointsInFile !== undefined && pointsInFile !== points) {
      extra.push({ code: "POINTS_MISMATCH_IMPORT", message: `Điểm trong file (${pointsInFile}) khác điểm tính theo quy định (${points}).` });
    }
    const status = resolveImportedStatus(p.row.status, parseIncidentStatus, existing?.status, "Mới ghi nhận", "Đã đóng");
    const evidence = splitEvidence(p.row.evidence);
    const detail = [cleanText(p.row.detail), evidence.rest ? `Minh chứng: ${evidence.rest}` : ""].filter(Boolean).join("\n") || undefined;
    const core = buildIncidentCore(
      {
        date: p.date,
        scope,
        occurrenceCount: counts.occurrenceCount,
        unnamedCount: counts.unnamedCount,
        status: status.status,
        reporter: cleanText(p.row.reporter) || existing?.reporter,
        detail: detail ?? existing?.detail,
        evidenceUrls: evidence.urls.length > 0 ? evidence.urls : existing?.evidenceUrls ?? [],
        photoIds: existing?.photoIds ?? [],
      },
      { catalogItem: item, classInfo: cls, students: resolved.students, weeks: input.ref.weeks, semesters: input.ref.config.semesters, extraIssues: extra },
    );
    const before = existing ? incidentContent(existing) : undefined;
    const draft = omitEmpty<IncidentDraft>(
      before
        ? { ...omitKeys(before, ["group", "reporter", "detail"]), ...core, externalId: before.externalId ?? code }
        : { id, code, levelId: payload.levelId, ...core, source: "import", externalId: code },
      OPTIONAL_KEYS,
    );
    const action: RowAction = !before ? "create" : canonicalJson(before) === canonicalJson(draft) ? "skip" : "update";
    if (action === "update" && existing && !overwrite && !unchangedSinceImport(existing)) {
      report.row("incidents", { rowNumber: p.rowNumber, key: code, warnings: [APP_CHANGED_SKIP_MESSAGE], action: "skip" });
      skipLinks(report, links);
      continue;
    }
    if (action !== "skip") {
      warnings.push(...status.warnings);
      if (existing && sameError && (p.item.penalty !== existing.penalty || p.item.unit !== existing.unit)) {
        warnings.push(`Bảng điểm hiện tại ${penaltyText(p.item.penalty, p.item.unit)}; giữ mức ${penaltyText(existing.penalty, existing.unit)} lúc ghi nhận.`);
      }
    }
    report.row("incidents", {
      rowNumber: p.rowNumber,
      key: code,
      warnings: [...warnings, ...core.dataIssues.map((d) => d.message)],
      action,
      computedPoints: core.points,
      pointsInFile,
    });
    reportLinks(report, resolved.outcomes, action);
    if (action === "skip") continue;
    writes.push({ action, draft, existing });
    if (draft.dataCheck === "REVIEW") review++;
  }
  return { writes, review };
}
