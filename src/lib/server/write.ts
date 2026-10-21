/**
 * Small adapters so helpers can write either inside a Transaction or into a WriteBatch,
 * plus reading inside/outside a transaction and a transaction runner with sane retries.
 */
import {
  Transaction,
  WriteBatch,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
} from "firebase-admin/firestore";
import { db } from "./firebase-admin";

export type WriteTarget = Transaction | WriteBatch;

/** Optional transaction for reads: `undefined` → plain reads. */
export type Reader = Transaction | undefined;

export function setDoc(target: WriteTarget, ref: DocumentReference, data: DocumentData, merge = false): void {
  if (target instanceof Transaction) {
    if (merge) target.set(ref, data, { merge: true });
    else target.set(ref, data);
  } else if (merge) target.set(ref, data, { merge: true });
  else target.set(ref, data);
}

/** Fails the whole transaction/batch at commit time if the document already exists. */
export function createDoc(target: WriteTarget, ref: DocumentReference, data: DocumentData): void {
  if (target instanceof Transaction) target.create(ref, data);
  else target.create(ref, data);
}

export function updateDoc(target: WriteTarget, ref: DocumentReference, data: DocumentData): void {
  if (target instanceof Transaction) target.update(ref, data);
  else target.update(ref, data);
}

export function deleteDoc(target: WriteTarget, ref: DocumentReference): void {
  if (target instanceof Transaction) target.delete(ref);
  else target.delete(ref);
}

export async function readDoc(reader: Reader, ref: DocumentReference): Promise<DocumentSnapshot> {
  return reader ? reader.get(ref) : ref.get();
}

export async function readDocs(reader: Reader, refs: DocumentReference[]): Promise<DocumentSnapshot[]> {
  if (refs.length === 0) return [];
  return reader ? reader.getAll(...refs) : db().getAll(...refs);
}

export async function readQuery(reader: Reader, q: Query): Promise<QuerySnapshot> {
  return reader ? reader.get(q) : q.get();
}

/** Max attempts for contended transactions (counter + week digest are hot documents). */
export const TX_MAX_ATTEMPTS = 30;

/**
 * Run a read-write transaction. Reads MUST happen before writes inside `fn`.
 * ApiErrors thrown inside abort immediately (never retried).
 */
export function runTx<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db().runTransaction(fn, { maxAttempts: TX_MAX_ATTEMPTS });
}

/** Firestore batch limit used across the app (hard limit is 500). */
export const BATCH_LIMIT = 450;

/**
 * Max estimated payload of one batch. Firestore rejects commit requests above 10 MiB (the emulator does not), and
 * the REST/JSON encoding used in production is larger than our JSON estimate, so stay well below.
 */
export const BATCH_MAX_BYTES = 6_000_000;

/** A batch operation, optionally carrying the estimated size of what it writes (`bytes`). */
export type SizedOp = ((b: WriteBatch) => void) & { bytes?: number };

/** Attach a size estimate to a batch operation (see `commitInChunks`). */
export function sized(op: (b: WriteBatch) => void, bytes: number): SizedOp {
  return Object.assign(op, { bytes });
}

/**
 * Commit a list of write operations in chunks of ≤ BATCH_LIMIT operations and ≤ BATCH_MAX_BYTES (for ops that
 * carry `bytes`). `final` (if given) is applied to the LAST batch, e.g. digest + meta/versions + audit, so readers
 * only see the change once everything else landed. Not atomic across chunks.
 */
export async function commitInChunks(
  ops: Array<SizedOp>,
  final?: (b: WriteBatch) => void,
  finalOps = 0,
  maxBytes: number = BATCH_MAX_BYTES,
): Promise<number> {
  const limit = Math.max(1, BATCH_LIMIT - finalOps);
  const chunks: SizedOp[][] = [];
  let current: SizedOp[] = [];
  let bytes = 0;
  for (const op of ops) {
    const size = op.bytes ?? 0;
    if (current.length > 0 && (current.length >= limit || bytes + size > maxBytes)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(op);
    bytes += size;
  }
  if (current.length > 0 || chunks.length === 0) chunks.push(current);
  for (let i = 0; i < chunks.length; i++) {
    const batch = db().batch();
    for (const op of chunks[i]) op(batch);
    if (i === chunks.length - 1 && final) final(batch);
    await batch.commit();
  }
  return chunks.length;
}
