/**
 * NSHM workbook import (BR-IMP-01, IO-01…IO-10, AC-016/017).
 *   preview: read state → plan every section → WorkbookPreview (no writes) + previewHash
 *   commit : same plan again → 409 when the hash differs → importBatches doc (status "running") + audit
 *            IMPORT_EXCEL → reference (saveReferenceParts) → records in ≤450-op batches → rebuildAllDigests (bumps
 *            the version) → batch status "done".
 * The hash covers the request AND the planned writes, so any relevant change in between is detected.
 * Crash safety (writes are batched, not atomic): the batch doc + audit exist before anything is written, and a
 * batch still "running" (a commit that died, e.g. at maxDuration, before rebuilding the digests) makes the next
 * commit rebuild the digests even when it has nothing left to write; it is then marked "interrupted".
 */
import type { WriteBatch } from "firebase-admin/firestore";
import type { z } from "zod";
import type { WorkbookCommitResult, WorkbookCommitSchema, WorkbookPreview, WorkbookPreviewSchema } from "../../contract";
import { todayVN } from "../../engine/dates";
import { COL } from "../../firestore-paths";
import type { Incident, LevelId, Reward, Student, StudentEvent } from "../../types";
import { auditOf, writeAudit } from "../audit";
import { actorName, requireLevel } from "../auth";
import { rebuildAllDigests, rebuildStudentDigest } from "../digests";
import { Errors } from "../errors";
import { db, nowIso } from "../firebase-admin";
import { nextRev, omitEmpty, type ServiceCtx } from "../records";
import { saveReferenceParts } from "../reference";
import { commitInChunks } from "../write";
import { errorCode, studentDocRef } from "./common";
import { hashOf, PREVIEW_CHANGED_MESSAGE } from "./hash";
import { CodeAllocator } from "./workbook-codes";
import { importHashOf, planIncidents, type IncidentDraft, type PlannedRecord } from "./workbook-incidents";
import { planReference, type ReferencePlan, type WorkbookOptions } from "./workbook-reference";
import { ImportReport, SECTION_KEYS, type SectionKey } from "./workbook-report";
import { planRewards, type RewardDraft } from "./workbook-rewards";
import { planStudents, type PlannedStudent } from "./workbook-students";
import { loadWorkbookState, type WorkbookState } from "./workbook-state";
import { finishBatch, settleUnfinishedBatches, unfinishedBatches } from "./batches";

export type WorkbookPreviewData = z.output<typeof WorkbookPreviewSchema>;
export type WorkbookCommitData = z.output<typeof WorkbookCommitSchema>;

export interface WorkbookPlan {
  report: ImportReport;
  reference: ReferencePlan;
  students: PlannedStudent[];
  incidents: Array<PlannedRecord<IncidentDraft, Incident>>;
  rewards: Array<PlannedRecord<RewardDraft, Reward>>;
  counters: Array<{ id: string; seq: number }>;
  review: number;
  previewHash: string;
}

const SECTION_ORDER = Object.fromEntries(
  (["Danh mục", "Bảng điểm lỗi", "Cấu hình", "Lịch tuần", "DS Học sinh", "Nhập liệu", "HS liên quan", "Điểm thưởng"] as const).map((s, i) => [s, i]),
) as Record<WorkbookPreview["issues"][number]["sheet"], number>;

/** Pure: plan every section against the loaded state. */
export function planWorkbook(input: WorkbookPreviewData, state: WorkbookState): WorkbookPlan {
  const { payload } = input;
  const options: WorkbookOptions = { ...input.options, overwriteAppChanges: input.overwriteAppChanges === true };
  const report = new ImportReport();
  const reference = planReference(payload, options, state.reference, report);
  const students = planStudents(payload, options, reference, state, report);
  const allocator = new CodeAllocator(payload.levelId, state.counters, state.existingMaxSeq);
  const incidents = planIncidents({
    payload,
    options,
    ref: reference,
    students: students.effective,
    studentDocs: state.students,
    existing: state.incidents,
    allocator,
    today: state.today,
    report,
  });
  const rewards = planRewards({ payload, options, ref: reference, existing: state.rewards, allocator, today: state.today, report });
  const counters = allocator.counterUpdates();
  report.issues.sort((a, b) => SECTION_ORDER[a.sheet] - SECTION_ORDER[b.sheet] || a.rowNumber - b.rowNumber);
  const previewHash = hashOf({
    v: 1,
    request: { payload, options: input.options, overwriteAppChanges: options.overwriteAppChanges },
    writes: {
      reference: reference.patch,
      students: students.writes.map((s) => [s.action, s.draft, s.event ?? null]),
      incidents: incidents.writes.map((w) => [w.action, w.draft]),
      rewards: rewards.map((w) => [w.action, w.draft]),
      counters,
    },
  });
  return { report, reference, students: students.writes, incidents: incidents.writes, rewards, counters, review: incidents.review, previewHash };
}

async function loadAndPlan(ctx: ServiceCtx, input: WorkbookPreviewData): Promise<WorkbookPlan> {
  requireLevel(ctx.user, input.payload.levelId);
  const state = await loadWorkbookState(input.payload, ctx.today ?? todayVN());
  return planWorkbook(input, state);
}

/** POST /api/imports/workbook/preview — validates every section; performs NO writes. */
export async function previewWorkbook(ctx: ServiceCtx, input: WorkbookPreviewData): Promise<WorkbookPreview> {
  const plan = await loadAndPlan(ctx, input);
  return { levelId: input.payload.levelId, previewHash: plan.previewHash, sections: plan.report.sections, issues: plan.report.issues };
}

function stampEvent(e: PlannedStudent["event"], by: string, at: string): StudentEvent[] {
  return e ? [omitEmpty<StudentEvent>({ ...e, by, at }, ["fromClass", "toClass", "fromLevel", "toLevel", "note"])] : [];
}

function studentDoc(p: PlannedStudent, by: string, now: string): Student {
  if (p.action === "create" || !p.existing) return { ...p.draft, history: stampEvent(p.event, by, now), createdAt: now, updatedAt: now };
  return { ...p.draft, history: [...p.existing.history, ...stampEvent(p.event, by, now)], createdAt: p.existing.createdAt, updatedAt: now };
}

interface Stamp {
  uid: string;
  email: string;
  name: string;
  now: string;
  batchId: string;
}

/**
 * Canonical record written by the import: the planned content + `importHash` (what this import wrote, to detect
 * later edits in the app) + the next `rev` + stamps.
 */
function recordDoc<D extends object, T extends { createdAt: string; createdBy: string; createdByName: string; rev?: number }>(
  p: PlannedRecord<D, T>,
  s: Stamp,
): D & Record<string, unknown> {
  const content = { ...p.draft, importHash: importHashOf(p.draft) };
  if (p.action === "create" || !p.existing) return { ...content, rev: 1, importBatchId: s.batchId, createdBy: s.uid, createdByName: s.name, createdAt: s.now };
  const e = p.existing;
  return { ...content, rev: nextRev(e), importBatchId: s.batchId, createdBy: e.createdBy, createdByName: e.createdByName, createdAt: e.createdAt, updatedAt: s.now, updatedBy: s.email };
}

function sectionCounts(plan: WorkbookPlan, field: "willCreate" | "willUpdate" | "willSkip"): Record<SectionKey, number> {
  return Object.fromEntries(SECTION_KEYS.map((k) => [k, plan.report.sections[k][field]])) as Record<SectionKey, number>;
}

/** POST /api/imports/workbook/commit — recompute, compare previewHash (409), write, rebuild digests, audit. */
export async function commitWorkbook(ctx: ServiceCtx, input: WorkbookCommitData): Promise<WorkbookCommitResult> {
  const { user } = ctx;
  const { payload, options } = input;
  const levelId = payload.levelId;
  const plan = await loadAndPlan(ctx, { payload, options, overwriteAppChanges: input.overwriteAppChanges });
  if (plan.previewHash !== input.previewHash) throw Errors.conflict(PREVIEW_CHANGED_MESSAGE);
  const unfinished = await unfinishedBatches(levelId);

  const batchRef = db().collection(COL.importBatches).doc();
  const s: Stamp = { uid: user.uid, email: user.email, name: actorName(user), now: nowIso(), batchId: batchRef.id };
  const result: WorkbookCommitResult = {
    batchId: s.batchId,
    created: sectionCounts(plan, "willCreate"),
    updated: sectionCounts(plan, "willUpdate"),
    skipped: sectionCounts(plan, "willSkip"),
    review: plan.review,
  };
  // Batch doc + audit first: an interrupted commit stays traceable and detectable ("running").
  const start = db().batch();
  start.set(batchRef, {
    id: s.batchId,
    kind: "workbook",
    status: "running",
    levelId,
    sourceFileName: payload.sourceFileName,
    options,
    ...(input.overwriteAppChanges ? { overwriteAppChanges: true } : {}),
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    review: result.review,
    createdAt: s.now,
    createdBy: s.email,
    createdByName: s.name,
  });
  writeAudit(
    start,
    auditOf(user, "IMPORT_EXCEL", {
      entity: "importBatch",
      entityId: s.batchId,
      levelId,
      ip: ctx.ip,
      detail: {
        sourceFileName: payload.sourceFileName,
        options,
        ...(input.overwriteAppChanges ? { overwriteAppChanges: true } : {}),
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        review: result.review,
      },
    }),
  );
  await start.commit();

  try {
    const patch = { ...plan.reference.patch };
    if (patch.config) patch.config = { ...patch.config, updatedAt: s.now, updatedBy: s.email };
    const referenceChanged = Object.keys(patch).length > 0;
    if (referenceChanged) await saveReferenceParts(levelId, patch);

    const ops: Array<(b: WriteBatch) => void> = [];
    const otherLevels = new Set<LevelId>();
    for (const p of plan.students) {
      const doc = studentDoc(p, s.email, s.now);
      const ref = studentDocRef(doc.id);
      if (p.existing && p.existing.levelId !== levelId) otherLevels.add(p.existing.levelId);
      ops.push(p.action === "create" ? (b) => b.create(ref, doc) : (b) => b.set(ref, doc));
    }
    for (const p of plan.incidents) {
      const ref = db().collection(COL.incidents).doc(p.draft.id);
      const doc = recordDoc(p, s);
      ops.push(p.action === "create" ? (b) => b.create(ref, doc) : (b) => b.set(ref, doc));
    }
    for (const p of plan.rewards) {
      const ref = db().collection(COL.rewards).doc(p.draft.id);
      const doc = recordDoc(p, s);
      ops.push(p.action === "create" ? (b) => b.create(ref, doc) : (b) => b.set(ref, doc));
    }
    for (const c of plan.counters) {
      const ref = db().collection(COL.counters).doc(c.id);
      ops.push((b) => b.set(ref, { seq: c.seq, updatedAt: s.now }));
    }
    if (ops.length > 0) {
      try {
        await commitInChunks(ops);
      } catch (e) {
        if (errorCode(e) === 6) throw Errors.conflict(PREVIEW_CHANGED_MESSAGE);
        throw e;
      }
    }
    // Nothing written and no interrupted import to repair → the read model is unchanged: skip the rebuild (and the
    // version bump every open tab would refetch on).
    if (referenceChanged || ops.length > 0 || unfinished.length > 0) await rebuildAllDigests(levelId);
    // Students that moved here from another level (chuyển cấp) leave that level's student digest.
    for (const other of otherLevels) await rebuildStudentDigest(other);
    await settleUnfinishedBatches(unfinished, s.batchId);
    await finishBatch(batchRef, "done");
  } catch (e) {
    await finishBatch(batchRef, "failed", e);
    throw e;
  }
  return result;
}
