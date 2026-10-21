/**
 * Human-readable record codes allocated inside a transaction:
 *   incidents NN-yyyymmdd-NNNN · rewards KT-yyyymmdd-NNNN · actions HD-yyyymmdd-NNN · inspections DKT-yyyymmdd-NNN
 * Counter doc: counters/{prefix}_{level}_{yyyymmdd} { seq }. If the candidate doc id already exists
 * (e.g. legacy import), keep incrementing. `nextCode` only READS; call `commitCode` with the writes.
 */
import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import { compactDate } from "../engine/dates";
import { COL, counterId, recordDocId } from "../firestore-paths";
import type { LevelId } from "../types";
import { Errors } from "./errors";
import { db, nowIso } from "./firebase-admin";

export type CodePrefix = "NN" | "KT" | "HD" | "DKT";
export type CodedCollection = typeof COL.incidents | typeof COL.rewards | typeof COL.actions | typeof COL.inspections;

export interface AllocatedCode {
  code: string;
  /** Firestore doc id `${levelId}_${code}` */
  id: string;
  seq: number;
  counterRef: DocumentReference;
}

const PAD: Record<CodePrefix, number> = { NN: 4, KT: 4, HD: 3, DKT: 3 };
const PROBE_CHUNK = 10;
const MAX_PROBES = 2000;

export function formatCode(prefix: CodePrefix, date: string, seq: number): string {
  return `${prefix}-${compactDate(date)}-${String(seq).padStart(PAD[prefix], "0")}`;
}

/** Reads the counter and probes candidate ids (in chunks) until a free one is found. Reads only. */
export async function nextCode(
  tx: Transaction,
  prefix: CodePrefix,
  levelId: LevelId,
  date: string,
  collection: CodedCollection,
): Promise<AllocatedCode> {
  const counterRef = db().collection(COL.counters).doc(counterId(prefix, levelId, compactDate(date)));
  const counterSnap = await tx.get(counterRef);
  const raw = counterSnap.exists ? (counterSnap.data() as { seq?: unknown }).seq : 0;
  let seq = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
  const col = db().collection(collection);
  // Common case: the next number is free (1 read). After a collision probe in chunks (legacy imports).
  for (let probed = 0, size = 1; probed < MAX_PROBES; probed += size, size = PROBE_CHUNK) {
    const seqs = Array.from({ length: size }, (_, i) => seq + 1 + i);
    const refs = seqs.map((s) => col.doc(recordDocId(levelId, formatCode(prefix, date, s))));
    const snaps = await tx.getAll(...refs, { fieldMask: [] });
    const free = snaps.findIndex((s) => !s.exists);
    if (free >= 0) {
      const s = seqs[free];
      const code = formatCode(prefix, date, s);
      return { code, id: recordDocId(levelId, code), seq: s, counterRef };
    }
    seq += size;
  }
  throw Errors.internal("Không thể cấp mã mới cho bản ghi. Vui lòng liên hệ quản trị.");
}

/** Persist the allocated sequence number (call in the write phase of the same transaction). */
export function commitCode(tx: Transaction, alloc: AllocatedCode): void {
  tx.set(alloc.counterRef, { seq: alloc.seq, updatedAt: nowIso() });
}
