/**
 * Student records (Quản lý HS, SCR-09). Every mutation is ONE transaction:
 * students/{id} + digests/{level}__stu + meta/versions + auditLogs.
 * Past incidents are never touched: they keep their StudentRef snapshots (AC-019).
 * Mã HS is school-wide: `promoteStudentLevel` moves a student to another level (chuyển cấp) keeping id and history.
 */
import type { Transaction } from "firebase-admin/firestore";
import type { z } from "zod";
import { LEVELS, STUDENT_STATUS_LABELS, canSeeClassDetail, hasPermission } from "../../constants";
import type {
  StudentCreateSchema,
  StudentPromoteSchema,
  StudentReinstateSchema,
  StudentTransferSchema,
  StudentUpdateSchema,
  StudentWithdrawSchema,
} from "../../contract";
import { todayVN } from "../../engine/dates";
import type { AuditAction, Student, StudentEvent } from "../../types";
import { auditDiff, auditOf, writeAudit } from "../audit";
import { AUTH_MSG, requireClassDetail, requireLevel, type SessionUser } from "../auth";
import { buildLevelDataset, referencedStudentIds } from "../dataset";
import { loadStudentDigest, toStudentLite } from "../digests";
import { Errors } from "../errors";
import { nowIso } from "../firebase-admin";
import { omitEmpty, type ServiceCtx } from "../records";
import { findClass, loadReference, type LevelReference } from "../reference";
import { bumpVersions } from "../versions";
import { runTx } from "../write";
import { classProblem, studentDocRef } from "./common";

export type StudentCreateData = z.output<typeof StudentCreateSchema>;
export type StudentUpdateData = z.output<typeof StudentUpdateSchema>;
export type StudentTransferData = z.output<typeof StudentTransferSchema>;
export type StudentWithdrawData = z.output<typeof StudentWithdrawSchema>;
export type StudentReinstateData = z.output<typeof StudentReinstateSchema>;
export type StudentPromoteData = z.output<typeof StudentPromoteSchema>;

export const STUDENT_MSG = {
  notFound: "Không tìm thấy học sinh.",
  duplicate: (classCode: string) => `Mã HS đã tồn tại (lớp ${classCode})`,
  notActive: "Học sinh không còn ở trạng thái Đang học.",
  alreadyActive: "Học sinh đang ở trạng thái Đang học, không cần tiếp nhận lại.",
  sameClass: (classCode: string) => `Học sinh đã ở lớp ${classCode}.`,
  sameLevel: "Học sinh đã thuộc cấp học này – dùng “Chuyển lớp” để đổi lớp.",
} as const;

/** Fields compared for UPDATE_STUDENT audit details. */
export const STUDENT_INFO_FIELDS = ["name", "dob", "gender", "note"] as const satisfies ReadonlyArray<keyof Student>;
const OPTIONAL_KEYS = ["dob", "gender", "note", "enrolledAt", "leftAt", "leftReason"] as const satisfies ReadonlyArray<keyof Student>;

const FIELD_LABELS: Record<(typeof STUDENT_INFO_FIELDS)[number], string> = {
  name: "Họ tên",
  dob: "Ngày sinh",
  gender: "Giới tính",
  note: "Ghi chú",
};

function event(user: SessionUser, e: Omit<StudentEvent, "by" | "at">, at: string): StudentEvent {
  return omitEmpty({ ...e, by: user.email, at }, ["fromClass", "toClass", "fromLevel", "toLevel", "note"]);
}


function joinNote(...parts: Array<string | undefined>): string | undefined {
  const text = parts.map((p) => p?.trim()).filter(Boolean).join(" – ");
  return text || undefined;
}

function requireUsableClass(ref: LevelReference, code: string) {
  const cls = findClass(ref, code);
  const problem = classProblem(code, cls);
  if (problem || !cls) throw Errors.validation(problem);
  return cls;
}

/**
 * GET /api/students/:id — needs student-level detail access to the student's CURRENT class. A GVCN (own classes
 * only) may open a student who no longer studies (graduated / transferred / inactive) only when the student is named
 * in this school year's incidents of their classes: class codes are reused every year, so last year's "5A1"
 * graduates are not the new 5A1 homeroom teacher's students.
 */
export async function getStudent(user: SessionUser, id: string): Promise<Student> {
  const snap = await studentDocRef(id).get();
  if (!snap.exists) throw Errors.notFound(STUDENT_MSG.notFound);
  const student = snap.data() as Student;
  requireClassDetail(user, student.levelId, student.classCode);
  if (student.status !== "ACTIVE" && !hasPermission(user.profile, "view.allClassesDetail")) {
    const ds = await buildLevelDataset(student.levelId);
    const visible = (classCode: string) => canSeeClassDetail(user.profile, student.levelId, classCode);
    if (!referencedStudentIds(ds.incidents, visible).has(id)) throw Errors.forbidden(AUTH_MSG.classDetail);
  }
  return student;
}

/** POST /api/students — tuyển mới (ENROLL) or chuyển đến (TRANSFER_IN). Mã HS is unique across the school. */
export async function createStudent(ctx: ServiceCtx, input: StudentCreateData): Promise<Student> {
  const { user } = ctx;
  requireLevel(user, input.levelId);
  return runTx(async (tx) => {
    const ref = studentDocRef(input.id);
    const existing = await tx.get(ref);
    if (existing.exists) throw Errors.conflict(STUDENT_MSG.duplicate((existing.data() as Student).classCode));
    const reference = await loadReference(input.levelId, tx);
    const cls = requireUsableClass(reference, input.classCode);
    const digest = await loadStudentDigest(tx, input.levelId);

    const now = nowIso();
    const type: StudentEvent["type"] = input.enrollType === "NEW" ? "ENROLL" : "TRANSFER_IN";
    const student: Student = omitEmpty<Student>(
      {
        id: input.id,
        name: input.name,
        dob: input.dob,
        gender: input.gender,
        levelId: input.levelId,
        classCode: cls.code,
        grade: cls.grade,
        status: "ACTIVE",
        note: input.note,
        enrolledAt: input.enrollDate,
        history: [event(user, { type, date: input.enrollDate, toClass: cls.code, note: input.note }, now)],
        createdAt: now,
        updatedAt: now,
      },
      OPTIONAL_KEYS,
    );
    tx.create(ref, student);
    digest.upsert(toStudentLite(student));
    digest.write(tx);
    bumpVersions(tx, [input.levelId]);
    writeAudit(
      tx,
      auditOf(user, "ADD_STUDENT", {
        entity: "student",
        entityId: student.id,
        levelId: input.levelId,
        ip: ctx.ip,
        detail: { name: student.name, classCode: cls.code, enrollType: input.enrollType, date: input.enrollDate },
      }),
    );
    return student;
  });
}

interface Mutation {
  after: Student;
  action: AuditAction;
  detail: Record<string, unknown>;
}

/**
 * Shared transaction for existing students: read student + reference (reads) → `plan` → write the
 * student, the `__stu` digest, versions and audit. `plan` returning undefined means "nothing changed".
 */
async function mutateStudent(
  ctx: ServiceCtx,
  id: string,
  plan: (before: Student, ref: LevelReference, now: string) => Mutation | undefined,
): Promise<Student> {
  const { user } = ctx;
  return runTx(async (tx: Transaction) => {
    const snap = await tx.get(studentDocRef(id));
    if (!snap.exists) throw Errors.notFound(STUDENT_MSG.notFound);
    const before = snap.data() as Student;
    requireLevel(user, before.levelId);
    const ref = await loadReference(before.levelId, tx);
    const digest = await loadStudentDigest(tx, before.levelId);
    const result = plan(before, ref, nowIso());
    if (!result) return before;
    const after = omitEmpty(result.after, OPTIONAL_KEYS);
    tx.set(snap.ref, after);
    digest.upsert(toStudentLite(after));
    digest.write(tx);
    bumpVersions(tx, [before.levelId]);
    writeAudit(tx, auditOf(user, result.action, { entity: "student", entityId: id, levelId: before.levelId, ip: ctx.ip, detail: result.detail }));
    return after;
  });
}

/** PATCH /api/students/:id — personal info only (name, dob, gender, note). "" clears gender/note. */
export async function updateStudent(ctx: ServiceCtx, id: string, patch: StudentUpdateData): Promise<Student> {
  return mutateStudent(ctx, id, (before, _ref, now) => {
    const next: Student = omitEmpty(
      {
        ...before,
        name: patch.name ?? before.name,
        dob: patch.dob ?? before.dob,
        gender: patch.gender ?? before.gender,
        note: patch.note ?? before.note,
      },
      OPTIONAL_KEYS,
    );
    const changes = auditDiff(before, next, STUDENT_INFO_FIELDS);
    const changed = Object.keys(changes) as Array<(typeof STUDENT_INFO_FIELDS)[number]>;
    if (changed.length === 0) return undefined;
    const note = `Cập nhật: ${changed.map((f) => FIELD_LABELS[f]).join(", ")}`;
    const after: Student = {
      ...next,
      history: [...before.history, event(ctx.user, { type: "UPDATE", date: ctx.today ?? todayVN(), note }, now)],
      updatedAt: now,
    };
    return { after, action: "UPDATE_STUDENT", detail: { name: before.name, changes } };
  });
}

/** POST /api/students/:id/transfer — move an ACTIVE student to another active class of the same level. */
export async function transferStudent(ctx: ServiceCtx, id: string, input: StudentTransferData): Promise<Student> {
  return mutateStudent(ctx, id, (before, ref, now) => {
    if (before.status !== "ACTIVE") throw Errors.conflict(STUDENT_MSG.notActive);
    const cls = requireUsableClass(ref, input.toClassCode);
    if (cls.code === before.classCode) throw Errors.validation(STUDENT_MSG.sameClass(cls.code));
    const after: Student = {
      ...before,
      classCode: cls.code,
      grade: cls.grade,
      history: [
        ...before.history,
        event(ctx.user, { type: "TRANSFER_CLASS", date: input.effectiveDate, fromClass: before.classCode, toClass: cls.code, note: input.note }, now),
      ],
      updatedAt: now,
    };
    return {
      after,
      action: "TRANSFER_STUDENT",
      detail: { name: before.name, from: before.classCode, to: cls.code, date: input.effectiveDate, note: input.note },
    };
  });
}

/** POST /api/students/:id/withdraw — chuyển trường đi / tốt nghiệp / ngừng theo dõi. */
export async function withdrawStudent(ctx: ServiceCtx, id: string, input: StudentWithdrawData): Promise<Student> {
  return mutateStudent(ctx, id, (before, _ref, now) => {
    if (before.status !== "ACTIVE") throw Errors.conflict(STUDENT_MSG.notActive);
    const after: Student = {
      ...before,
      status: input.status,
      leftAt: input.date,
      leftReason: input.reason,
      history: [
        ...before.history,
        event(
          ctx.user,
          { type: "TRANSFER_OUT", date: input.date, fromClass: before.classCode, note: joinNote(STUDENT_STATUS_LABELS[input.status], input.reason, input.note) },
          now,
        ),
      ],
      updatedAt: now,
    };
    return {
      after,
      action: "WITHDRAW_STUDENT",
      detail: { name: before.name, classCode: before.classCode, status: input.status, date: input.date, reason: input.reason },
    };
  });
}

/** POST /api/students/:id/reinstate — a withdrawn student becomes ACTIVE again in an active class. */
export async function reinstateStudent(ctx: ServiceCtx, id: string, input: StudentReinstateData): Promise<Student> {
  return mutateStudent(ctx, id, (before, ref, now) => {
    if (before.status === "ACTIVE") throw Errors.conflict(STUDENT_MSG.alreadyActive);
    const cls = requireUsableClass(ref, input.classCode);
    const { leftAt: _leftAt, leftReason: _leftReason, ...rest } = before;
    const after: Student = {
      ...rest,
      status: "ACTIVE",
      classCode: cls.code,
      grade: cls.grade,
      history: [
        ...before.history,
        event(ctx.user, { type: "REINSTATE", date: input.date, fromClass: before.classCode, toClass: cls.code, note: input.note }, now),
      ],
      updatedAt: now,
    };
    return {
      after,
      action: "REINSTATE_STUDENT",
      detail: { name: before.name, previousStatus: before.status, from: before.classCode, to: cls.code, date: input.date },
    };
  });
}

/**
 * POST /api/students/:id/promote-level — chuyển cấp (TH → THCS, THCS → THPT…): the student keeps the school-wide
 * Mã HS and their whole history and becomes ACTIVE in a class of the target level. One transaction: student doc,
 * both levels' `__stu` digests, both version counters, audit TRANSFER_STUDENT (`detail.promoteLevel`). Incidents of
 * the old level keep their snapshots. Needs access to both levels.
 */
export async function promoteStudentLevel(ctx: ServiceCtx, id: string, input: StudentPromoteData): Promise<Student> {
  const { user } = ctx;
  requireLevel(user, input.toLevelId);
  return runTx(async (tx) => {
    const snap = await tx.get(studentDocRef(id));
    if (!snap.exists) throw Errors.notFound(STUDENT_MSG.notFound);
    const before = snap.data() as Student;
    requireLevel(user, before.levelId);
    if (before.levelId === input.toLevelId) throw Errors.validation(STUDENT_MSG.sameLevel);
    const target = await loadReference(input.toLevelId, tx);
    const cls = requireUsableClass(target, input.classCode);
    const [fromDigest, toDigest] = await Promise.all([loadStudentDigest(tx, before.levelId), loadStudentDigest(tx, input.toLevelId)]);

    const now = nowIso();
    const { leftAt: _leftAt, leftReason: _leftReason, ...rest } = before;
    const note = joinNote(`Chuyển cấp từ ${LEVELS[before.levelId].name} (${STUDENT_STATUS_LABELS[before.status]})`, input.note);
    const after: Student = omitEmpty<Student>(
      {
        ...rest,
        levelId: input.toLevelId,
        classCode: cls.code,
        grade: cls.grade,
        status: "ACTIVE",
        history: [
          ...before.history,
          event(user, { type: "TRANSFER_IN", date: input.date, fromClass: before.classCode, toClass: cls.code, fromLevel: before.levelId, toLevel: input.toLevelId, note }, now),
        ],
        updatedAt: now,
      },
      OPTIONAL_KEYS,
    );
    tx.set(snap.ref, after);
    fromDigest.remove(id);
    fromDigest.write(tx);
    toDigest.upsert(toStudentLite(after));
    toDigest.write(tx);
    bumpVersions(tx, [before.levelId, input.toLevelId]);
    writeAudit(
      tx,
      auditOf(user, "TRANSFER_STUDENT", {
        entity: "student",
        entityId: id,
        levelId: input.toLevelId,
        ip: ctx.ip,
        detail: {
          name: before.name,
          promoteLevel: true,
          fromLevel: before.levelId,
          toLevel: input.toLevelId,
          from: before.classCode,
          to: cls.code,
          previousStatus: before.status,
          date: input.date,
          note: input.note,
        },
      }),
    );
    return after;
  });
}
