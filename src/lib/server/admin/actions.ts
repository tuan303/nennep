/**
 * Action Register (FR-ACT-*): HD-yyyymmdd-NNN codes, status history, BR-ACT-01 (no "Done" without evidence, AC-014).
 * Actions are not part of LevelDataset, so writes do not bump meta/versions.
 */
import type { z } from "zod";
import { ACTION_STATUS_LABELS } from "../../constants";
import type { ActionCreateSchema, ActionUpdateSchema } from "../../contract";
import { mondayOf, todayVN } from "../../engine/dates";
import { naturalCompare } from "../../engine/text";
import { COL } from "../../firestore-paths";
import type { ActionHistoryEntry, ActionItem, ActionStatus, LevelId } from "../../types";
import { auditDiff, auditOf, writeAudit } from "../audit";
import { actorName, requireLevel, type SessionUser } from "../auth";
import { Errors } from "../errors";
import { db, nowIso } from "../firebase-admin";
import { commitCode, nextCode } from "../ids";
import { omitEmpty, omitKeys, type ServiceCtx } from "../records";
import { findClass, loadReference } from "../reference";
import { runTx } from "../write";

export type ActionCreateData = z.output<typeof ActionCreateSchema>;
export type ActionUpdateData = z.output<typeof ActionUpdateSchema>;

export const ACTION_MSG = {
  notFound: "Không tìm thấy hành động.",
  evidenceRequired: "Cần nhập minh chứng hoàn tất trước khi chuyển sang Hoàn thành",
} as const;

export const ACTION_AUDIT_FIELDS = ["title", "description", "priority", "owner", "deadline", "evidence", "status"] as const satisfies ReadonlyArray<keyof ActionItem>;
const OPTIONAL_KEYS = ["description", "evidence", "sourceWeek", "scopeClass", "closedAt", "updatedAt"] as const satisfies ReadonlyArray<keyof ActionItem>;
const FIELD_LABELS: Record<(typeof ACTION_AUDIT_FIELDS)[number], string> = {
  title: "nội dung",
  description: "mô tả",
  priority: "mức ưu tiên",
  owner: "người phụ trách",
  deadline: "hạn xử lý",
  evidence: "minh chứng",
  status: "trạng thái",
};
const STATUS_ORDER: Record<ActionStatus, number> = { Open: 0, Doing: 1, Done: 2 };

export function actionRef(id: string) {
  return db().collection(COL.actions).doc(id);
}

/** Open → Doing → Done, then by deadline (earliest first), then code. */
export function compareActions(a: ActionItem, b: ActionItem): number {
  return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.deadline.localeCompare(b.deadline) || naturalCompare(a.code, b.code);
}

/** GET /api/actions?level= */
export async function listActions(user: SessionUser, levelId: LevelId): Promise<ActionItem[]> {
  requireLevel(user, levelId);
  const snap = await db().collection(COL.actions).where("levelId", "==", levelId).get();
  return snap.docs.map((d) => d.data() as ActionItem).sort(compareActions);
}

/** POST /api/actions — status Open, code HD-yyyymmdd-NNN (day of creation). */
export async function createAction(ctx: ServiceCtx, input: ActionCreateData): Promise<ActionItem> {
  const { user } = ctx;
  requireLevel(user, input.levelId);
  const today = ctx.today ?? todayVN();
  return runTx(async (tx) => {
    if (input.scopeClass) {
      const ref = await loadReference(input.levelId, tx);
      if (!findClass(ref, input.scopeClass)) throw Errors.validation(`Lớp ${input.scopeClass} không có trong danh mục lớp.`);
    }
    const alloc = await nextCode(tx, "HD", input.levelId, today, COL.actions);
    const now = nowIso();
    const action: ActionItem = omitEmpty<ActionItem>(
      {
        id: alloc.id,
        code: alloc.code,
        levelId: input.levelId,
        title: input.title,
        description: input.description,
        priority: input.priority,
        owner: input.owner,
        deadline: input.deadline,
        status: "Open",
        sourceWeek: input.sourceWeek ? mondayOf(input.sourceWeek) : undefined,
        scopeClass: input.scopeClass,
        createdBy: user.uid,
        createdByName: actorName(user),
        createdAt: now,
        history: [{ at: now, by: user.email, toStatus: "Open", note: "Tạo hành động" }],
      },
      OPTIONAL_KEYS,
    );
    tx.create(actionRef(action.id), action);
    commitCode(tx, alloc);
    writeAudit(
      tx,
      auditOf(user, "CREATE_ACTION", {
        entity: "action",
        entityId: action.id,
        levelId: input.levelId,
        ip: ctx.ip,
        detail: { code: action.code, title: action.title, priority: action.priority, owner: action.owner, deadline: action.deadline },
      }),
    );
    return action;
  });
}

/** PATCH /api/actions/:id — BR-ACT-01: "Done" needs non-empty evidence (after merging the patch) → 400. */
export async function updateAction(ctx: ServiceCtx, id: string, patch: ActionUpdateData): Promise<ActionItem> {
  const { user } = ctx;
  return runTx(async (tx) => {
    const snap = await tx.get(actionRef(id));
    if (!snap.exists) throw Errors.notFound(ACTION_MSG.notFound);
    const before = snap.data() as ActionItem;
    requireLevel(user, before.levelId);
    const merged: ActionItem = omitEmpty<ActionItem>(
      {
        ...before,
        title: patch.title ?? before.title,
        description: patch.description ?? before.description,
        priority: patch.priority ?? before.priority,
        owner: patch.owner ?? before.owner,
        deadline: patch.deadline ?? before.deadline,
        evidence: patch.evidence ?? before.evidence,
        status: patch.status ?? before.status,
      },
      OPTIONAL_KEYS,
    );
    if (merged.status === "Done" && !merged.evidence?.trim()) throw Errors.validation(ACTION_MSG.evidenceRequired, [{ path: "evidence", message: ACTION_MSG.evidenceRequired }]);
    const changes = auditDiff(before, merged, ACTION_AUDIT_FIELDS);
    const changed = Object.keys(changes) as Array<(typeof ACTION_AUDIT_FIELDS)[number]>;
    if (changed.length === 0 && !patch.note) return before;

    const now = nowIso();
    const statusChanged = merged.status !== before.status;
    const entry: ActionHistoryEntry = omitEmpty<ActionHistoryEntry>(
      {
        at: now,
        by: user.email,
        fromStatus: statusChanged ? before.status : undefined,
        toStatus: statusChanged ? merged.status : undefined,
        note:
          patch.note ||
          (statusChanged
            ? `${ACTION_STATUS_LABELS[before.status]} → ${ACTION_STATUS_LABELS[merged.status]}`
            : `Cập nhật ${changed.map((f) => FIELD_LABELS[f]).join(", ")}`),
      },
      ["fromStatus", "toStatus", "note"],
    );
    let after: ActionItem = { ...merged, history: [...before.history, entry], updatedAt: now };
    if (statusChanged && merged.status === "Done") after.closedAt = now;
    if (statusChanged && before.status === "Done") after = omitKeys(after, ["closedAt"]);
    tx.set(snap.ref, after);
    writeAudit(
      tx,
      auditOf(user, "UPDATE_ACTION", { entity: "action", entityId: id, levelId: before.levelId, ip: ctx.ip, detail: { code: before.code, changes, note: patch.note } }),
    );
    return after;
  });
}
