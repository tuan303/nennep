/**
 * Incident service: every mutation is ONE transaction (canonical doc + week digest(s) + meta/versions + audit).
 * Routes call these after parsing input with the contract schemas.
 * - Dates must fall in a calendar week (otherwise the record would be invisible, see calendar.ts).
 * - Every mutation increments `rev`; PATCH with `baseRev` ≠ current rev → 409 (stale form).
 * - Attached photos are linked to the record (`evidence.attachedTo`), removed ones unlinked.
 */
import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import type { z } from "zod";
import { hasPermission, isGvcnOfClass } from "../constants";
import type { GvcnFeedbackSchema, IncidentCreateSchema, IncidentUpdateSchema } from "../contract";
import { todayVN } from "../engine/dates";
import { editRuleContext } from "../engine/edit-context";
import { buildIncidentCore, validateIncidentRules } from "../engine/scoring";
import { COL } from "../firestore-paths";
import type { CatalogItem, Incident, LevelId, StudentLite, StudentRef } from "../types";
import { auditDiff, auditOf, writeAudit } from "./audit";
import { actorName, requireClassDetail, requireLevel, requirePermission, type SessionUser } from "./auth";
import { assertRestorableWeek, calendarProblem } from "./calendar";
import { loadIncidentDigests } from "./digests";
import { Errors } from "./errors";
import { db, nowIso } from "./firebase-admin";
import { commitCode, nextCode } from "./ids";
import {
  assertBaseRev,
  assertCanEditRecord,
  assertEvidenceIds,
  assertHttpUrls,
  catalogFromSnapshot as snapshotItem,
  nextRev,
  omitKeys,
  planEvidenceLinks,
  readIdempotency,
  readStudentLites,
  writeEvidenceLinks,
  writeIdempotency,
  type ServiceCtx,
} from "./records";
import { findCatalogItem, findClass, loadReference } from "./reference";
import { bumpVersions } from "./versions";
import { readDoc, runTx, type Reader } from "./write";

export type IncidentCreateData = z.output<typeof IncidentCreateSchema>;
export type IncidentUpdateData = z.output<typeof IncidentUpdateSchema>;
export type GvcnFeedbackData = z.output<typeof GvcnFeedbackSchema>;

export const INCIDENT_MSG = {
  notFound: "Không tìm thấy sự việc.",
  deleted: "Sự việc này đã bị xóa.",
  alreadyDeleted: "Sự việc này đã bị xóa trước đó.",
  notDeleted: "Sự việc này chưa bị xóa nên không cần khôi phục.",
  feedbackForbidden: "Chỉ GVCN của lớp hoặc quản trị viên mới được phản hồi sự việc này.",
  stale: "Sự việc đã được người khác cập nhật trong lúc bạn đang sửa. Vui lòng tải lại để xem bản mới nhất rồi sửa tiếp.",
} as const;

/** Fields compared for UPDATE_INCIDENT audit details. */
export const INCIDENT_AUDIT_FIELDS = [
  "date",
  "week",
  "classCode",
  "grade",
  "errorCode",
  "issue",
  "penalty",
  "unit",
  "scope",
  "occurrenceCount",
  "students",
  "unnamedCount",
  "relatedStudentCount",
  "points",
  "status",
  "dataCheck",
  "reporter",
  "detail",
  "evidenceUrls",
  "photoIds",
] as const satisfies ReadonlyArray<keyof Incident>;

export function incidentRef(id: string): DocumentReference {
  return db().collection(COL.incidents).doc(id);
}

/** Read one incident (404 when missing). Works inside a transaction. */
export async function readIncident(reader: Reader, id: string): Promise<Incident> {
  const snap = await readDoc(reader, incidentRef(id));
  if (!snap.exists) throw Errors.notFound(INCIDENT_MSG.notFound);
  return snap.data() as Incident;
}

/** Catalog item reconstructed from an incident's snapshot (keeps historical penalty/unit on edits). */
export function catalogFromSnapshot(i: Incident): CatalogItem {
  return snapshotItem(i);
}

function toRef(s: StudentLite): StudentRef {
  return { id: s.id, name: s.name, classCode: s.classCode };
}

function auditDetail(i: Incident): Record<string, unknown> {
  return {
    code: i.code,
    date: i.date,
    classCode: i.classCode,
    errorCode: i.errorCode,
    points: i.points,
    studentIds: i.students.map((s) => s.id),
    unnamedCount: i.unnamedCount,
  };
}

/** POST /api/incidents. Returns `created: false` when the clientRequestId was already used (idempotent). */
export async function createIncident(ctx: ServiceCtx, input: IncidentCreateData): Promise<{ incident: Incident; created: boolean }> {
  const { user } = ctx;
  requirePermission(user, "incident.create");
  requireLevel(user, input.levelId);
  assertHttpUrls(input.evidenceUrls);
  const today = ctx.today ?? todayVN();
  const levelId = input.levelId;

  return runTx(async (tx) => {
    // ---------------- reads ----------------
    const previousId = await readIdempotency(tx, user.uid, input.clientRequestId, "incident");
    if (previousId) {
      const snap = await tx.get(incidentRef(previousId));
      if (snap.exists) return { incident: snap.data() as Incident, created: false };
    }
    const ref = await loadReference(levelId, tx);
    const studentsById = await readStudentLites(tx, input.studentIds, levelId);
    await assertEvidenceIds(tx, levelId, input.photoIds);

    const catalogItem = findCatalogItem(ref, input.errorCode);
    const classInfo = findClass(ref, input.classCode);
    const errors = validateIncidentRules(
      {
        date: input.date,
        classCode: input.classCode,
        errorCode: input.errorCode,
        scope: input.scope,
        occurrenceCount: input.occurrenceCount,
        studentIds: input.studentIds,
        unnamedCount: input.unnamedCount,
      },
      { catalogItem, classInfo, studentsById, today },
    );
    const outside = input.date <= today ? calendarProblem(input.date, ref.weeks) : undefined;
    if (outside) errors.push(outside);
    if (errors.length > 0 || !catalogItem || !classInfo) throw Errors.validationList(errors);

    const core = buildIncidentCore(
      {
        date: input.date,
        scope: input.scope,
        occurrenceCount: input.occurrenceCount,
        unnamedCount: input.unnamedCount,
        status: input.status,
        reporter: input.reporter || actorName(user),
        detail: input.detail,
        evidenceUrls: input.evidenceUrls,
        photoIds: input.photoIds,
      },
      {
        catalogItem,
        classInfo,
        students: input.studentIds.map((id) => toRef(studentsById.get(id) as StudentLite)),
        weeks: ref.weeks,
        semesters: ref.config.semesters,
      },
    );
    const alloc = await nextCode(tx, "NN", levelId, input.date, COL.incidents);
    const digests = await loadIncidentDigests(tx, levelId, [core.week]);
    const photos = await planEvidenceLinks(tx, alloc.id, [], input.photoIds);

    // ---------------- writes ----------------
    const incident: Incident = {
      id: alloc.id,
      code: alloc.code,
      levelId,
      ...core,
      source: "app",
      createdBy: user.uid,
      createdByName: actorName(user),
      createdAt: nowIso(),
      rev: 1,
    };
    tx.create(incidentRef(incident.id), incident);
    digests.upsert(incident);
    digests.write(tx);
    writeEvidenceLinks(tx, incident.id, photos);
    commitCode(tx, alloc);
    writeIdempotency(tx, user.uid, input.clientRequestId, "incident", incident.id);
    bumpVersions(tx, [levelId]);
    writeAudit(tx, auditOf(user, "CREATE_INCIDENT", { entity: "incident", entityId: incident.id, levelId, ip: ctx.ip, detail: auditDetail(incident) }));
    return { incident, created: true };
  });
}

/**
 * Resolve rule context for an edit: snapshots for unchanged error/class/students, fresh data otherwise. The rules are
 * the engine's `editRuleContext` – the very function the entry form preview and the quick fix use (RULES-2 / RULES-11).
 */
async function resolveEditContext(tx: Transaction, before: Incident, patch: IncidentUpdateData, today: string) {
  const ref = await loadReference(before.levelId, tx);
  const classCode = patch.classCode ?? before.classCode;
  const errorCode = patch.errorCode ?? before.errorCode;
  const studentIds = patch.studentIds ?? before.students.map((s) => s.id);
  const classChanged = classCode !== before.classCode;
  const kept = new Map(before.students.map((s) => [s.id, s]));
  // Unchanged class: students already on the record are judged on their snapshot – only the new ones are read.
  const toLoad = classChanged ? studentIds : studentIds.filter((id) => !kept.has(id));
  const loaded = await readStudentLites(tx, toLoad, before.levelId);
  const { catalogItem, classInfo, studentsById } = editRuleContext({
    original: before,
    classCode,
    errorCode,
    roster: loaded.values(),
    classes: ref.classes,
    catalog: ref.catalog,
    today,
  });
  const students = studentIds.map((id) => (!classChanged && kept.get(id)) || (studentsById.has(id) ? toRef(studentsById.get(id) as StudentLite) : { id, name: "", classCode: "" }));
  return { ref, classCode, errorCode, studentIds, studentsById, catalogItem, classInfo, students };
}

/** PATCH /api/incidents/:id — ADMIN any; EDITOR own within the edit window. Recomputes every derived field. */
export async function updateIncident(ctx: ServiceCtx, id: string, patch: IncidentUpdateData): Promise<Incident> {
  const { user } = ctx;
  const today = ctx.today ?? todayVN();
  if (patch.evidenceUrls) assertHttpUrls(patch.evidenceUrls);
  return runTx(async (tx) => {
    const before = await readIncident(tx, id);
    requireLevel(user, before.levelId);
    if (before.deletedAt) throw Errors.conflict(INCIDENT_MSG.deleted);
    assertCanEditRecord(user, before);
    assertBaseRev(before, patch.baseRev, INCIDENT_MSG.stale);

    const c = await resolveEditContext(tx, before, patch, today);
    const addedPhotos = (patch.photoIds ?? before.photoIds).filter((p) => !before.photoIds.includes(p));
    await assertEvidenceIds(tx, before.levelId, addedPhotos);

    const scope = patch.scope ?? before.scope;
    const date = patch.date ?? before.date;
    const allowsUnnamed = c.catalogItem?.unit === "/HS" && scope === "Tập thể";
    const unnamedCount = patch.unnamedCount ?? (allowsUnnamed ? before.unnamedCount : 0);
    const occurrenceCount = patch.occurrenceCount ?? before.occurrenceCount;
    const errors = validateIncidentRules(
      { date, classCode: c.classCode, errorCode: c.errorCode, scope, occurrenceCount, studentIds: c.studentIds, unnamedCount },
      { catalogItem: c.catalogItem, classInfo: c.classInfo, studentsById: c.studentsById, today },
    );
    // A new date must be in the calendar; an unchanged one never blocks editing other fields.
    const outside = date !== before.date && date <= today ? calendarProblem(date, c.ref.weeks) : undefined;
    if (outside) errors.push(outside);
    if (errors.length > 0 || !c.catalogItem || !c.classInfo) throw Errors.validationList(errors);

    const core = buildIncidentCore(
      {
        date,
        scope,
        occurrenceCount,
        unnamedCount,
        status: patch.status ?? before.status,
        reporter: patch.reporter ?? before.reporter,
        detail: patch.detail ?? before.detail,
        evidenceUrls: patch.evidenceUrls ?? before.evidenceUrls,
        photoIds: patch.photoIds ?? before.photoIds,
      },
      {
        catalogItem: c.catalogItem,
        classInfo: c.classInfo,
        students: c.students,
        weeks: c.ref.weeks,
        semesters: c.ref.config.semesters,
        extraIssues: before.dataIssues.filter((d) => d.code === "LEGACY_NOTE"),
      },
    );
    const after: Incident = {
      ...omitKeys(before, ["group", "reporter", "detail"]),
      ...core,
      updatedBy: user.email,
      updatedAt: nowIso(),
      rev: nextRev(before),
    };
    const changes = auditDiff(before, after, INCIDENT_AUDIT_FIELDS);
    if (Object.keys(changes).length === 0) return before;
    const digests = await loadIncidentDigests(tx, before.levelId, [before.week, after.week]);
    const photos = await planEvidenceLinks(tx, id, before.photoIds, after.photoIds);

    tx.set(incidentRef(id), after);
    digests.upsert(after);
    digests.write(tx);
    writeEvidenceLinks(tx, id, photos);
    bumpVersions(tx, [before.levelId]);
    writeAudit(tx, auditOf(user, "UPDATE_INCIDENT", { entity: "incident", entityId: id, levelId: before.levelId, ip: ctx.ip, detail: { code: before.code, changes } }));
    return after;
  });
}

/** DELETE /api/incidents/:id — soft delete (record.delete), removed from the week digest. */
export async function softDeleteIncident(ctx: ServiceCtx, id: string, reason: string): Promise<Incident> {
  const { user } = ctx;
  requirePermission(user, "record.delete");
  return runTx(async (tx) => {
    const before = await readIncident(tx, id);
    requireLevel(user, before.levelId);
    if (before.deletedAt) throw Errors.conflict(INCIDENT_MSG.alreadyDeleted);
    const digests = await loadIncidentDigests(tx, before.levelId, [before.week]);
    const after: Incident = { ...before, deletedAt: nowIso(), deletedBy: user.email, deleteReason: reason, rev: nextRev(before) };
    tx.set(incidentRef(id), after);
    digests.remove(id);
    digests.write(tx);
    bumpVersions(tx, [before.levelId]);
    writeAudit(tx, auditOf(user, "DELETE_INCIDENT", { entity: "incident", entityId: id, levelId: before.levelId, ip: ctx.ip, detail: { ...auditDetail(before), reason } }));
    return after;
  });
}

/** POST /api/incidents/:id/restore — undo a soft delete (record.delete), re-added to its week digest. */
export async function restoreIncident(ctx: ServiceCtx, id: string): Promise<Incident> {
  const { user } = ctx;
  requirePermission(user, "record.delete");
  return runTx(async (tx) => {
    const before = await readIncident(tx, id);
    requireLevel(user, before.levelId);
    if (!before.deletedAt) throw Errors.conflict(INCIDENT_MSG.notDeleted);
    assertRestorableWeek(before.week, (await loadReference(before.levelId, tx)).weeks);
    const digests = await loadIncidentDigests(tx, before.levelId, [before.week]);
    const after: Incident = {
      ...omitKeys(before, ["deletedAt", "deletedBy", "deleteReason"]),
      updatedBy: user.email,
      updatedAt: nowIso(),
      rev: nextRev(before),
    };
    tx.set(incidentRef(id), after);
    digests.upsert(after);
    digests.write(tx);
    bumpVersions(tx, [before.levelId]);
    writeAudit(
      tx,
      auditOf(user, "RESTORE_INCIDENT", {
        entity: "incident",
        entityId: id,
        levelId: before.levelId,
        ip: ctx.ip,
        detail: { ...auditDetail(before), deletedAt: before.deletedAt, deleteReason: before.deleteReason },
      }),
    );
    return after;
  });
}

/** POST /api/incidents/:id/feedback — GVCN of the incident's class, or ADMIN. Sets note and/or status. */
export async function gvcnFeedback(ctx: ServiceCtx, id: string, input: GvcnFeedbackData): Promise<Incident> {
  const { user } = ctx;
  return runTx(async (tx) => {
    const before = await readIncident(tx, id);
    if (user.profile.role === "ADMIN") requireLevel(user, before.levelId);
    else if (!(hasPermission(user.profile, "incident.gvcnFeedback") && isGvcnOfClass(user.profile, before.levelId, before.classCode))) {
      throw Errors.forbidden(INCIDENT_MSG.feedbackForbidden);
    }
    if (before.deletedAt) throw Errors.conflict(INCIDENT_MSG.deleted);

    let after: Incident = { ...before, gvcnNoteBy: actorName(user), gvcnNoteAt: nowIso(), rev: nextRev(before) };
    if (input.note !== undefined) after = input.note ? { ...after, gvcnNote: input.note } : omitKeys(after, ["gvcnNote"]);
    if (input.status) after.status = input.status;
    const changes = auditDiff(before, after, ["gvcnNote", "status"]);
    // Same note and status again: nothing to store, no version bump (every open tab would refetch).
    if (Object.keys(changes).length === 0) return before;
    const digests = await loadIncidentDigests(tx, before.levelId, [before.week]);

    tx.set(incidentRef(id), after);
    digests.upsert(after);
    digests.write(tx);
    bumpVersions(tx, [before.levelId]);
    writeAudit(tx, auditOf(user, "GVCN_FEEDBACK", { entity: "incident", entityId: id, levelId: before.levelId, ip: ctx.ip, detail: { code: before.code, classCode: before.classCode, changes } }));
    return after;
  });
}

/** GET /api/incidents/:id — needs class detail access; deleted ones only for record.delete holders. */
export async function getIncidentForViewer(user: SessionUser, id: string): Promise<Incident> {
  const incident = await readIncident(undefined, id);
  requireClassDetail(user, incident.levelId, incident.classCode);
  if (incident.deletedAt && !hasPermission(user.profile, "record.delete")) throw Errors.notFound(INCIDENT_MSG.notFound);
  return incident;
}

/** Soft-deleted incidents of a level, most recently deleted first (index: levelId ASC, deletedAt DESC). */
export async function listDeletedIncidents(levelId: LevelId, limit = 500): Promise<Incident[]> {
  const snap = await db()
    .collection(COL.incidents)
    .where("levelId", "==", levelId)
    .where("deletedAt", ">", "")
    .orderBy("deletedAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as Incident);
}
