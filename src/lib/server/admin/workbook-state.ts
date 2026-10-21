/**
 * Everything the workbook import needs to read before planning (preview and commit read the same state, so the
 * commit can recompute and compare `previewHash`). Reads only.
 */
import { FieldPath } from "firebase-admin/firestore";
import type { WorkbookPayload } from "../../contract";
import { compactDate, isIsoDate } from "../../engine/dates";
import { COL, counterId, recordDocId } from "../../firestore-paths";
import type { Incident, LevelId, Reward, Student } from "../../types";
import { db } from "../firebase-admin";
import { readCanonicalReference, type CanonicalReference } from "../reference";
import { getAllChunked, loadLevelStudents, loadStudentsInOtherLevels } from "./common";
import { dayIdPrefix, isValidCode, parseSeqCode, type ImportPrefix } from "./workbook-codes";

export interface WorkbookState {
  levelId: LevelId;
  today: string;
  reference: CanonicalReference;
  students: Map<string, Student>;
  /** Students of the payload that belong to another level (full documents: a non-ACTIVE one can change level). */
  otherLevelStudents: Map<string, Student>;
  /** Existing docs (incl. soft-deleted) for the codes found in the payload, keyed by doc id. */
  incidents: Map<string, Incident>;
  rewards: Map<string, Reward>;
  /** counters/{id}.seq for every day touched by the payload. */
  counters: Map<string, number>;
  /** Highest seq of existing records per counter id, for days that need generated codes. */
  existingMaxSeq: Map<string, number>;
}

interface CodedRow {
  code?: string;
  date: string;
}

async function loadRecords<T>(collection: string, levelId: LevelId, rows: CodedRow[]): Promise<Map<string, T>> {
  const ids = [...new Set(rows.map((r) => (r.code ?? "").trim()).filter(isValidCode).map((c) => recordDocId(levelId, c)))];
  const snaps = await getAllChunked(ids.map((id) => db().collection(collection).doc(id)));
  const out = new Map<string, T>();
  for (const s of snaps) if (s.exists) out.set(s.id, s.data() as T);
  return out;
}

/** Days (yyyymmdd) whose counters matter: days of standard codes + days of code-less rows. */
function counterIdsFor(levelId: LevelId, prefix: ImportPrefix, rows: CodedRow[]): { all: string[]; generatedDays: string[] } {
  const all = new Set<string>();
  const generatedDays = new Set<string>();
  for (const r of rows) {
    const code = (r.code ?? "").trim();
    const parsed = code ? parseSeqCode(code) : undefined;
    if (parsed && parsed.prefix === prefix) all.add(counterId(prefix, levelId, parsed.yyyymmdd));
    if (!code && isIsoDate(r.date)) {
      all.add(counterId(prefix, levelId, compactDate(r.date)));
      generatedDays.add(r.date);
    }
  }
  return { all: [...all], generatedDays: [...generatedDays] };
}

async function existingMaxForDay(collection: string, levelId: LevelId, prefix: ImportPrefix, date: string): Promise<number> {
  const start = dayIdPrefix(levelId, prefix, date);
  const snap = await db()
    .collection(collection)
    .orderBy(FieldPath.documentId())
    .startAt(start)
    .endAt(`${start}`)
    .select()
    .get();
  let max = 0;
  for (const d of snap.docs) {
    const seq = Number(d.id.slice(start.length));
    if (Number.isFinite(seq)) max = Math.max(max, seq);
  }
  return max;
}

export async function loadWorkbookState(payload: WorkbookPayload, today: string): Promise<WorkbookState> {
  const levelId = payload.levelId;
  const inc = counterIdsFor(levelId, "NN", payload.incidents);
  const rew = counterIdsFor(levelId, "KT", payload.rewards.map((r) => ({ code: r.code ?? "", date: r.date })));
  const counterRefs = [...inc.all, ...rew.all].map((id) => db().collection(COL.counters).doc(id));

  const [reference, students, incidents, rewards, counterSnaps] = await Promise.all([
    readCanonicalReference(levelId),
    loadLevelStudents(levelId),
    loadRecords<Incident>(COL.incidents, levelId, payload.incidents),
    loadRecords<Reward>(COL.rewards, levelId, payload.rewards.map((r) => ({ code: r.code ?? "", date: r.date }))),
    getAllChunked(counterRefs),
  ]);
  const otherLevelStudents = await loadStudentsInOtherLevels(
    levelId,
    payload.students.map((s) => s.id.trim()).filter((id) => id && !students.has(id)),
  );
  const counters = new Map<string, number>();
  for (const s of counterSnaps) {
    const seq: unknown = s.get("seq");
    if (s.exists && typeof seq === "number") counters.set(s.id, seq);
  }
  const existingMaxSeq = new Map<string, number>();
  const jobs: Array<Promise<void>> = [];
  for (const [collection, prefix, days] of [
    [COL.incidents, "NN", inc.generatedDays],
    [COL.rewards, "KT", rew.generatedDays],
  ] as const) {
    for (const day of days) {
      jobs.push(
        existingMaxForDay(collection, levelId, prefix, day).then((max) => {
          existingMaxSeq.set(counterId(prefix, levelId, compactDate(day)), max);
        }),
      );
    }
  }
  await Promise.all(jobs);
  return { levelId, today, reference, students, otherLevelStudents, incidents, rewards, counters, existingMaxSeq };
}
