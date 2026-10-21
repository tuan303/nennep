/**
 * Student roster import (Quản lý HS → Nhập danh sách): preview (no writes) → commit with `previewHash`.
 * Rows are classified NEW / UPDATE / TRANSFER / REINSTATE / UNCHANGED / INVALID; sync mode also lists the
 * ACTIVE students of the level that are missing from the file (optionally withdrawn on commit).
 * A Mã HS of another level is INVALID while the student still studies there; one who already left that level
 * (graduated, transferred, inactive) is a REINSTATE row "Chuyển cấp" and moves to this level (same Mã HS, history
 * kept, TRANSFER_IN with `fromLevel`); the other level's student digest is rebuilt after the commit.
 */
import type { WriteBatch } from "firebase-admin/firestore";
import type { z } from "zod";
import { LEVELS, STUDENT_STATUS_LABELS } from "../../constants";
import type { StudentImportCommitSchema, StudentImportPreview, StudentImportResult, StudentImportRowKind, StudentImportSchema } from "../../contract";
import { formatDateVN, isIsoDate } from "../../engine/dates";
import { normalizeVN } from "../../engine/text";
import type { ClassInfo, LevelId, Student, StudentEvent } from "../../types";
import { auditOf, writeAudit, writeAuditDirect } from "../audit";
import { requireLevel } from "../auth";
import { byClassThenName, loadStudentDigest, rebuildStudentDigest, studentDigestRef, toStudentLite } from "../digests";
import { Errors } from "../errors";
import { nowIso } from "../firebase-admin";
import { omitEmpty, type ServiceCtx } from "../records";
import { loadReference, type LevelReference } from "../reference";
import { bumpVersions } from "../versions";
import { commitInChunks } from "../write";
import { classProblem, cleanText, errorCode, loadLevelStudents, loadStudentsInOtherLevels, makeClassLookup, STATUS_TEXT_ACTIVE, studentDocRef } from "./common";
import { hashOf, PREVIEW_CHANGED_MESSAGE } from "./hash";

export type StudentImportData = z.output<typeof StudentImportSchema>;
export type StudentImportCommitData = z.output<typeof StudentImportCommitSchema>;
type PreviewRow = StudentImportPreview["rows"][number];

export const MISSING_REASON = "Không có trong danh sách import";
const OPTIONAL_KEYS = ["dob", "gender", "note", "enrolledAt", "leftAt", "leftReason"] as const satisfies ReadonlyArray<keyof Student>;

interface RosterState {
  ref: LevelReference;
  existing: Map<string, Student>;
  /** Students of the file that belong to another level (full documents). */
  otherLevel: Map<string, Student>;
  /** Changes whenever the `__stu` digest is rewritten (any student mutation). */
  studentsVersion: string;
}

/** What a valid row would write (the commit turns it into a Student document). */
interface RowTarget {
  kind: Exclude<StudentImportRowKind, "INVALID" | "UNCHANGED">;
  id: string;
  name: string;
  dob?: string;
  gender?: string;
  cls: ClassInfo;
  statusText?: string;
  changes: string[];
  /** Chuyển cấp: the student's current document in another level. */
  promoteFrom?: Student;
}

async function loadRosterState(levelId: LevelId, ids: string[]): Promise<RosterState> {
  const [ref, existing, digestSnap] = await Promise.all([loadReference(levelId), loadLevelStudents(levelId), studentDigestRef(levelId).get()]);
  const unknownIds = ids.filter((id) => id && !existing.has(id));
  const otherLevel = await loadStudentsInOtherLevels(levelId, unknownIds);
  const stored: unknown = digestSnap.get("updatedAt");
  return { ref, existing, otherLevel, studentsVersion: typeof stored === "string" ? stored : "" };
}

const show = (v: string | undefined) => (v ? v : "(trống)");

function infoChanges(before: Student, name: string, dob: string | undefined, gender: string | undefined): string[] {
  const out: string[] = [];
  if (name !== before.name) out.push(`Họ tên: ${before.name} → ${name}`);
  if (dob && dob !== before.dob) out.push(`Ngày sinh: ${show(formatDateVN(before.dob))} → ${formatDateVN(dob)}`);
  if (gender && gender !== before.gender) out.push(`Giới tính: ${show(before.gender)} → ${gender}`);
  return out;
}

/** Pure classification of the request against the current state. */
function classify(input: StudentImportData, state: RosterState): { preview: StudentImportPreview; targets: RowTarget[] } {
  const lookupClass = makeClassLookup(state.ref.classes);
  const firstRowOf = new Map<string, number>();
  const rows: PreviewRow[] = [];
  const targets: RowTarget[] = [];

  input.rows.forEach((raw, index) => {
    const rowNumber = raw.rowNumber ?? index + 1;
    const id = raw.id.trim();
    const name = cleanText(raw.name);
    const gender = cleanText(raw.gender) || undefined;
    const dobRaw = (raw.dob ?? "").trim();
    const cls = lookupClass(raw.classCode);
    const errors: string[] = [];
    if (!id) errors.push("Thiếu mã HS.");
    if (!name) errors.push("Thiếu họ tên.");
    if (!raw.classCode.trim()) errors.push("Thiếu lớp.");
    else {
      const problem = classProblem(raw.classCode.trim(), cls);
      if (problem) errors.push(problem);
    }
    if (dobRaw && !isIsoDate(dobRaw)) errors.push(`Ngày sinh không hợp lệ: ${dobRaw}.`);
    if (id) {
      const first = firstRowOf.get(id);
      if (first !== undefined) errors.push(`Mã HS ${id} bị trùng với dòng ${first}.`);
      else firstRowOf.set(id, rowNumber);
      const other = state.otherLevel.get(id);
      if (other?.status === "ACTIVE") {
        errors.push(`Mã HS ${id} đang học ở cấp ${LEVELS[other.levelId].short} (lớp ${other.classCode}) – nếu học sinh lên cấp, hãy chuyển cấp trước.`);
      }
    }
    const base: PreviewRow = { rowNumber, id, name, classCode: cls?.code ?? raw.classCode.trim(), kind: "INVALID", changes: [], errors };
    if (errors.length > 0 || !cls) {
      rows.push(base);
      return;
    }
    const dob = dobRaw || undefined;
    const before = state.existing.get(id);
    const statusText = cleanText(raw.statusText) || undefined;
    const promoteFrom = before ? undefined : state.otherLevel.get(id);
    if (promoteFrom) {
      const changes = [
        `Chuyển cấp: ${LEVELS[promoteFrom.levelId].short} lớp ${promoteFrom.classCode} (${STUDENT_STATUS_LABELS[promoteFrom.status]}) → ${LEVELS[input.levelId].short} lớp ${cls.code}`,
        ...infoChanges(promoteFrom, name, dob, gender),
      ];
      rows.push({ ...base, kind: "REINSTATE", changes });
      targets.push({ kind: "REINSTATE", id, name, dob, gender, cls, statusText, changes, promoteFrom });
      return;
    }
    if (!before) {
      rows.push({ ...base, kind: "NEW" });
      targets.push({ kind: "NEW", id, name, dob, gender, cls, statusText, changes: [] });
      return;
    }
    const changes = infoChanges(before, name, dob, gender);
    let kind: StudentImportRowKind = changes.length > 0 ? "UPDATE" : "UNCHANGED";
    if (cls.code !== before.classCode) {
      changes.unshift(`Lớp: ${before.classCode} → ${cls.code}`);
      kind = "TRANSFER";
    }
    if (before.status !== "ACTIVE") {
      changes.unshift(`Trạng thái: ${STUDENT_STATUS_LABELS[before.status]} → ${STUDENT_STATUS_LABELS.ACTIVE}`);
      kind = "REINSTATE";
    }
    rows.push({ ...base, kind, changes });
    if (kind !== "UNCHANGED") targets.push({ kind: kind as RowTarget["kind"], id, name, dob, gender, cls, statusText, changes });
  });

  const fileIds = new Set(input.rows.map((r) => r.id.trim()).filter(Boolean));
  const missing =
    input.mode === "sync"
      ? [...state.existing.values()].filter((s) => s.status === "ACTIVE" && !fileIds.has(s.id)).map(toStudentLite).sort(byClassThenName)
      : [];
  const summary: StudentImportPreview["summary"] = { NEW: 0, UPDATE: 0, TRANSFER: 0, UNCHANGED: 0, REINSTATE: 0, INVALID: 0, total: rows.length, missing: missing.length };
  for (const r of rows) summary[r.kind] += 1;
  const previewHash = hashOf({
    v: 1,
    kind: "students",
    request: { levelId: input.levelId, mode: input.mode, effectiveDate: input.effectiveDate, rows: input.rows },
    studentsVersion: state.studentsVersion,
    referenceVersion: state.ref.updatedAt,
    otherLevel: [...state.otherLevel.values()].map((o) => [o.id, o.levelId, o.status, o.updatedAt]).sort(),
  });
  return { preview: { previewHash, summary, rows, missing }, targets };
}

/** POST /api/imports/students/preview — classification only, no writes. */
export async function previewStudentImport(ctx: ServiceCtx, input: StudentImportData): Promise<StudentImportPreview> {
  requireLevel(ctx.user, input.levelId);
  const state = await loadRosterState(input.levelId, input.rows.map((r) => r.id.trim()));
  return classify(input, state).preview;
}

function importEvent(by: string, at: string, e: Omit<StudentEvent, "by" | "at">): StudentEvent {
  return omitEmpty({ ...e, by, at }, ["fromClass", "toClass", "note"]);
}

function buildStudent(t: RowTarget, before: Student | undefined, input: StudentImportData, by: string, now: string): Student {
  const date = input.effectiveDate;
  if (t.promoteFrom) {
    const from = t.promoteFrom;
    const { leftAt: _l, leftReason: _r, ...kept } = from;
    return omitEmpty<Student>(
      {
        ...kept,
        name: t.name,
        dob: t.dob ?? from.dob,
        gender: t.gender ?? from.gender,
        levelId: input.levelId,
        classCode: t.cls.code,
        grade: t.cls.grade,
        status: "ACTIVE",
        history: [
          ...from.history,
          omitEmpty<StudentEvent>(
            {
              type: "TRANSFER_IN",
              date,
              fromClass: from.classCode,
              toClass: t.cls.code,
              fromLevel: from.levelId,
              toLevel: input.levelId,
              note: `Chuyển cấp từ ${LEVELS[from.levelId].name} – danh sách import`,
              by,
              at: now,
            },
            ["fromClass", "toClass", "note"],
          ),
        ],
        updatedAt: now,
      },
      OPTIONAL_KEYS,
    );
  }
  if (!before) {
    const note = t.statusText && normalizeVN(t.statusText) !== normalizeVN(STATUS_TEXT_ACTIVE) ? t.statusText : undefined;
    return omitEmpty<Student>(
      {
        id: t.id,
        name: t.name,
        dob: t.dob,
        gender: t.gender,
        levelId: input.levelId,
        classCode: t.cls.code,
        grade: t.cls.grade,
        status: "ACTIVE",
        note,
        enrolledAt: date,
        history: [importEvent(by, now, { type: "IMPORT", date, toClass: t.cls.code, note: note ? `Nhập từ danh sách học sinh – ${note}` : "Nhập từ danh sách học sinh" })],
        createdAt: now,
        updatedAt: now,
      },
      OPTIONAL_KEYS,
    );
  }
  const events: StudentEvent[] = [];
  const info = t.changes.filter((c) => !c.startsWith("Lớp:") && !c.startsWith("Trạng thái:"));
  if (t.kind === "REINSTATE") {
    events.push(importEvent(by, now, { type: "REINSTATE", date, fromClass: before.classCode, toClass: t.cls.code, note: "Có trong danh sách import" }));
  } else if (t.kind === "TRANSFER") {
    events.push(importEvent(by, now, { type: "TRANSFER_CLASS", date, fromClass: before.classCode, toClass: t.cls.code, note: "Cập nhật từ danh sách import" }));
  }
  if (info.length > 0) events.push(importEvent(by, now, { type: "UPDATE", date, note: `Cập nhật từ danh sách import: ${info.join("; ")}` }));
  const { leftAt: _leftAt, leftReason: _leftReason, ...rest } = before;
  const base = t.kind === "REINSTATE" ? { ...rest, status: "ACTIVE" as const } : before;
  return omitEmpty(
    {
      ...base,
      name: t.name,
      dob: t.dob ?? before.dob,
      gender: t.gender ?? before.gender,
      classCode: t.cls.code,
      grade: t.cls.grade,
      history: [...before.history, ...events],
      updatedAt: now,
    },
    OPTIONAL_KEYS,
  );
}

function withdrawMissing(before: Student, date: string, by: string, now: string): Student {
  return {
    ...before,
    status: "TRANSFERRED_OUT",
    leftAt: date,
    leftReason: MISSING_REASON,
    history: [...before.history, importEvent(by, now, { type: "TRANSFER_OUT", date, fromClass: before.classCode, note: MISSING_REASON })],
    updatedAt: now,
  };
}

/** POST /api/imports/students/commit — re-classifies, checks `previewHash` (409) and writes in ≤450-op batches. */
export async function commitStudentImport(ctx: ServiceCtx, input: StudentImportCommitData): Promise<StudentImportResult> {
  const { user } = ctx;
  requireLevel(user, input.levelId);
  const state = await loadRosterState(input.levelId, input.rows.map((r) => r.id.trim()));
  const { preview, targets } = classify(input, state);
  if (preview.previewHash !== input.previewHash) throw Errors.conflict(PREVIEW_CHANGED_MESSAGE);

  const now = nowIso();
  const final = new Map(state.existing);
  const ops: Array<(b: WriteBatch) => void> = [];
  const result: StudentImportResult = { created: 0, updated: 0, transferred: 0, reinstated: 0, withdrawn: 0, skipped: preview.summary.INVALID + preview.summary.UNCHANGED };
  const otherLevels = new Set<LevelId>();
  for (const t of targets) {
    const before = state.existing.get(t.id) ?? t.promoteFrom;
    const doc = buildStudent(t, before, input, user.email, now);
    final.set(doc.id, doc);
    if (t.promoteFrom) otherLevels.add(t.promoteFrom.levelId);
    const ref = studentDocRef(doc.id);
    ops.push(before ? (b) => b.set(ref, doc) : (b) => b.create(ref, doc));
    if (t.kind === "NEW") result.created++;
    else if (t.kind === "UPDATE") result.updated++;
    else if (t.kind === "TRANSFER") result.transferred++;
    else result.reinstated++;
  }
  if (input.mode === "sync" && input.applyMissingAsWithdrawn) {
    for (const lite of preview.missing) {
      const before = state.existing.get(lite.id);
      if (!before) continue;
      const doc = withdrawMissing(before, input.effectiveDate, user.email, now);
      final.set(doc.id, doc);
      ops.push((b) => b.set(studentDocRef(doc.id), doc));
      result.withdrawn++;
    }
  }

  const audit = auditOf(user, "IMPORT_STUDENTS", {
    entity: "student",
    levelId: input.levelId,
    ip: ctx.ip,
    detail: { mode: input.mode, effectiveDate: input.effectiveDate, rows: input.rows.length, applyMissingAsWithdrawn: input.applyMissingAsWithdrawn, ...result },
  });
  if (ops.length === 0) {
    // Nothing changes: keep the digest/version untouched (no client refetch), but still record the import.
    await writeAuditDirect(audit);
    return result;
  }
  const digest = await loadStudentDigest(undefined, input.levelId);
  digest.replaceAll([...final.values()].map(toStudentLite));
  try {
    await commitInChunks(
      ops,
      (b) => {
        digest.write(b, true);
        bumpVersions(b, [input.levelId]);
        writeAudit(b, audit);
      },
      3,
    );
  } catch (e) {
    // A student created concurrently with the same Mã HS (batch.create) → the preview is stale.
    if (errorCode(e) === 6) throw Errors.conflict(PREVIEW_CHANGED_MESSAGE);
    throw e;
  }
  // Students who moved here from another level (chuyển cấp) leave that level's student digest.
  for (const other of otherLevels) await rebuildStudentDigest(other);
  return result;
}
