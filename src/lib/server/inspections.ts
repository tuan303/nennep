/**
 * Đợt kiểm tra nền nếp (REQ_V2 §5.2): which classes were inspected, when, for which Mảng – the basis of the
 * inspection-coverage (fairness) view. Inspections are NOT scored: they never change points or rankings.
 * Every mutation is ONE transaction: canonical `inspections/{level}_{code}` + monthly digest `__ins__{yyyy-mm}`
 * + meta/versions + audit. Like incidents: dates must be in a calendar week, `rev` +1 per mutation (PATCH `baseRev`
 * → 409 when stale), edits/deletes by ADMIN (any) or the EDITOR who recorded it within 24 h, soft delete only.
 * Out of scope (documented): restore, workbook import/export, reset-level and the calendar-change check.
 */
import type { DocumentReference } from "firebase-admin/firestore";
import type { z } from "zod";
import type { InspectionCreateSchema, InspectionUpdateSchema } from "../contract";
import { isIsoDate, todayVN, weekInfo } from "../engine/dates";
import { COL } from "../firestore-paths";
import type { Inspection, InspectionShift } from "../types";
import { auditDiff, auditOf, writeAudit } from "./audit";
import { actorName, requireLevel, requirePermission } from "./auth";
import { calendarProblem } from "./calendar";
import { loadInspectionDigests } from "./digests";
import { Errors } from "./errors";
import { db, nowIso } from "./firebase-admin";
import { commitCode, nextCode } from "./ids";
import { assertBaseRev, assertCanEditRecord, nextRev, omitEmpty, readIdempotency, writeIdempotency, type ServiceCtx } from "./records";
import { findClass, loadReference, type LevelReference } from "./reference";
import { bumpVersions } from "./versions";
import { readDoc, runTx, type Reader } from "./write";

export type InspectionCreateData = z.output<typeof InspectionCreateSchema>;
export type InspectionUpdateData = z.output<typeof InspectionUpdateSchema>;

export const INSPECTION_MSG = {
  notFound: "Không tìm thấy đợt kiểm tra.",
  deleted: "Đợt kiểm tra này đã bị xóa.",
  alreadyDeleted: "Đợt kiểm tra này đã bị xóa trước đó.",
  invalidDate: "Ngày không hợp lệ.",
  futureDate: "Không thể ghi nhận đợt kiểm tra ở ngày trong tương lai.",
  noClasses: "Chọn ít nhất 1 lớp được kiểm tra.",
  stale: "Đợt kiểm tra đã được người khác cập nhật trong lúc bạn đang sửa. Vui lòng tải lại để xem bản mới nhất rồi sửa tiếp.",
  unknownClass: (code: string) => `Lớp "${code}" không có trong danh mục.`,
  inactiveClass: (code: string) => `Lớp ${code} đã ngừng hoạt động.`,
  unknownCategory: (category: string) => `Mảng "${category}" không có trong danh mục lỗi.`,
} as const;

/** Fields compared for UPDATE_INSPECTION audit details. */
export const INSPECTION_AUDIT_FIELDS = ["date", "week", "shift", "category", "classCodes", "inspector", "note"] as const satisfies ReadonlyArray<
  keyof Inspection
>;

const OPTIONAL_KEYS = ["shift", "category", "note"] as const satisfies ReadonlyArray<keyof Inspection>;

export function inspectionRef(id: string): DocumentReference {
  return db().collection(COL.inspections).doc(id);
}

/** Read one inspection (404 when missing). Works inside a transaction. */
export async function readInspection(reader: Reader, id: string): Promise<Inspection> {
  const snap = await readDoc(reader, inspectionRef(id));
  if (!snap.exists) throw Errors.notFound(INSPECTION_MSG.notFound);
  return snap.data() as Inspection;
}

export interface InspectionDraft {
  date: string;
  classCodes: readonly string[];
  /** "" / undefined = kiểm tra chung. */
  category?: string;
}

export interface InspectionRuleResult {
  errors: string[];
  /** Unique class codes in class display order (the order of `ref.classes`). */
  classCodes: string[];
  /** undefined = kiểm tra chung. */
  category?: string;
}

/**
 * Rule checks of a round (reads nothing): valid date not in the future and inside the calendar weeks (`checkCalendar`
 * false skips the calendar – an edit keeping its date); classes deduplicated, existing and active (classes listed in
 * `keepClasses` – already on the record – may have been deactivated since); `category` a Mảng of the catalog
 * (`keepCategory` = the stored one stays valid).
 */
export function validateInspectionRules(
  d: InspectionDraft,
  ref: Pick<LevelReference, "classes" | "catalog" | "weeks">,
  today: string,
  opts: { checkCalendar?: boolean; keepClasses?: readonly string[]; keepCategory?: string } = {},
): InspectionRuleResult {
  const errors: string[] = [];
  if (!isIsoDate(d.date)) errors.push(INSPECTION_MSG.invalidDate);
  else if (d.date > today) errors.push(INSPECTION_MSG.futureDate);
  else if (opts.checkCalendar !== false) {
    const outside = calendarProblem(d.date, ref.weeks);
    if (outside) errors.push(outside);
  }
  const unique = [...new Set(d.classCodes.map((c) => c.trim()).filter(Boolean))];
  if (unique.length === 0) errors.push(INSPECTION_MSG.noClasses);
  const keep = new Set(opts.keepClasses ?? []);
  for (const code of unique) {
    const cls = findClass(ref, code);
    if (!cls) errors.push(INSPECTION_MSG.unknownClass(code));
    else if (!cls.active && !keep.has(code)) errors.push(INSPECTION_MSG.inactiveClass(cls.code));
  }
  const position = new Map(ref.classes.map((c, i) => [c.code, i]));
  const classCodes = unique.sort((a, b) => (position.get(a) ?? Number.MAX_SAFE_INTEGER) - (position.get(b) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b));
  const category = d.category?.trim() || undefined;
  if (category && category !== opts.keepCategory && !ref.catalog.some((c) => c.category === category)) errors.push(INSPECTION_MSG.unknownCategory(category));
  return { errors, classCodes, category };
}

function shiftOf(v: InspectionShift | "" | undefined): InspectionShift | undefined {
  return v ? v : undefined;
}

function auditDetail(x: Inspection): Record<string, unknown> {
  return { code: x.code, date: x.date, shift: x.shift, category: x.category, classCodes: x.classCodes, inspector: x.inspector };
}

/** POST /api/inspections (inspection.manage + level). `created: false` when the clientRequestId was already used. */
export async function createInspection(ctx: ServiceCtx, input: InspectionCreateData): Promise<{ inspection: Inspection; created: boolean }> {
  const { user } = ctx;
  requirePermission(user, "inspection.manage");
  requireLevel(user, input.levelId);
  const today = ctx.today ?? todayVN();
  const levelId = input.levelId;

  return runTx(async (tx) => {
    // ---------------- reads ----------------
    const previousId = await readIdempotency(tx, user.uid, input.clientRequestId, "inspection");
    if (previousId) {
      const snap = await tx.get(inspectionRef(previousId));
      if (snap.exists) return { inspection: snap.data() as Inspection, created: false };
    }
    const ref = await loadReference(levelId, tx);
    const rules = validateInspectionRules({ date: input.date, classCodes: input.classCodes, category: input.category }, ref, today);
    if (rules.errors.length > 0) throw Errors.validationList(rules.errors);
    const alloc = await nextCode(tx, "DKT", levelId, input.date, COL.inspections);
    const { week, month, semester } = weekInfo(input.date, ref.weeks, ref.config.semesters);
    const digest = await loadInspectionDigests(tx, levelId, [week]);

    // ---------------- writes ----------------
    const inspection: Inspection = omitEmpty<Inspection>(
      {
        id: alloc.id,
        code: alloc.code,
        levelId,
        date: input.date,
        week,
        month,
        semester,
        shift: shiftOf(input.shift),
        category: rules.category,
        classCodes: rules.classCodes,
        inspector: input.inspector || actorName(user),
        note: input.note,
        createdBy: user.uid,
        createdByName: actorName(user),
        createdAt: nowIso(),
        rev: 1,
      },
      OPTIONAL_KEYS,
    );
    tx.create(inspectionRef(inspection.id), inspection);
    digest.upsert(inspection);
    digest.write(tx);
    commitCode(tx, alloc);
    writeIdempotency(tx, user.uid, input.clientRequestId, "inspection", inspection.id);
    bumpVersions(tx, [levelId]);
    writeAudit(tx, auditOf(user, "CREATE_INSPECTION", { entity: "inspection", entityId: inspection.id, levelId, ip: ctx.ip, detail: auditDetail(inspection) }));
    return { inspection, created: true };
  });
}

/** PATCH /api/inspections/:id — ADMIN any; EDITOR own within 24 h; `baseRev` → 409 when stale. No change → no write. */
export async function updateInspection(ctx: ServiceCtx, id: string, patch: InspectionUpdateData): Promise<Inspection> {
  const { user } = ctx;
  requirePermission(user, "inspection.manage");
  const today = ctx.today ?? todayVN();
  return runTx(async (tx) => {
    const before = await readInspection(tx, id);
    requireLevel(user, before.levelId);
    if (before.deletedAt) throw Errors.conflict(INSPECTION_MSG.deleted);
    assertCanEditRecord(user, before);
    assertBaseRev(before, patch.baseRev, INSPECTION_MSG.stale);

    const ref = await loadReference(before.levelId, tx);
    const date = patch.date ?? before.date;
    const rules = validateInspectionRules(
      { date, classCodes: patch.classCodes ?? before.classCodes, category: patch.category === undefined ? before.category : patch.category },
      ref,
      today,
      { checkCalendar: date !== before.date, keepClasses: before.classCodes, keepCategory: before.category },
    );
    if (rules.errors.length > 0) throw Errors.validationList(rules.errors);

    const { week, month, semester } = weekInfo(date, ref.weeks, ref.config.semesters);
    const after: Inspection = omitEmpty<Inspection>(
      {
        ...before,
        date,
        week,
        month,
        semester,
        shift: patch.shift === undefined ? before.shift : shiftOf(patch.shift),
        category: rules.category,
        classCodes: rules.classCodes,
        // An emptied "Người kiểm tra" falls back to the creator's display name (the create default).
        inspector: patch.inspector === undefined ? before.inspector : patch.inspector || before.createdByName,
        note: patch.note === undefined ? before.note : patch.note,
        updatedBy: user.email,
        updatedAt: nowIso(),
        rev: nextRev(before),
      },
      OPTIONAL_KEYS,
    );
    const changes = auditDiff(before, after, INSPECTION_AUDIT_FIELDS);
    if (Object.keys(changes).length === 0) return before;
    const digest = await loadInspectionDigests(tx, before.levelId, [before.week, after.week]);

    tx.set(inspectionRef(id), after);
    digest.upsert(after);
    digest.write(tx);
    bumpVersions(tx, [before.levelId]);
    writeAudit(
      tx,
      auditOf(user, "UPDATE_INSPECTION", { entity: "inspection", entityId: id, levelId: before.levelId, ip: ctx.ip, detail: { code: before.code, changes } }),
    );
    return after;
  });
}

/** DELETE /api/inspections/:id — soft delete (ADMIN any; EDITOR own within 24 h); 409 when already deleted. */
export async function softDeleteInspection(ctx: ServiceCtx, id: string, reason: string): Promise<Inspection> {
  const { user } = ctx;
  requirePermission(user, "inspection.manage");
  return runTx(async (tx) => {
    const before = await readInspection(tx, id);
    requireLevel(user, before.levelId);
    if (before.deletedAt) throw Errors.conflict(INSPECTION_MSG.alreadyDeleted);
    assertCanEditRecord(user, before);
    const digest = await loadInspectionDigests(tx, before.levelId, [before.week]);
    const after: Inspection = { ...before, deletedAt: nowIso(), deletedBy: user.email, deleteReason: reason, rev: nextRev(before) };
    tx.set(inspectionRef(id), after);
    digest.remove(id);
    digest.write(tx);
    bumpVersions(tx, [before.levelId]);
    writeAudit(
      tx,
      auditOf(user, "DELETE_INSPECTION", {
        entity: "inspection",
        entityId: id,
        levelId: before.levelId,
        ip: ctx.ip,
        detail: { code: before.code, reason, date: before.date, category: before.category, classCodes: before.classCodes },
      }),
    );
    return after;
  });
}
