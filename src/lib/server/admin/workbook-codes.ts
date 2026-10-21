/**
 * Record codes in imported workbooks: validation, parsing of "NN-yyyymmdd-0001"/"KT-…" codes, codes for rows
 * without one, and the counters/{prefix}_{level}_{yyyymmdd}.seq values to persist so app-created codes continue
 * after the imported ones.
 */
import { compactDate } from "../../engine/dates";
import { counterId, recordDocId } from "../../firestore-paths";
import type { LevelId } from "../../types";
import { formatCode } from "../ids";

export type ImportPrefix = "NN" | "KT";

/** Allowed characters (Firestore doc id safe): letters, digits, ".", "_", "-". */
const CODE_RE = /^[\p{L}\p{N}._-]{1,40}$/u;
const SEQ_CODE_RE = /^(NN|KT)-(\d{8})-(\d+)$/;

export function isValidCode(code: string): boolean {
  return CODE_RE.test(code) && code !== "." && code !== "..";
}

/** { prefix, yyyymmdd, seq } of a standard code, else undefined. */
export function parseSeqCode(code: string): { prefix: ImportPrefix; yyyymmdd: string; seq: number } | undefined {
  const m = SEQ_CODE_RE.exec(code);
  if (!m) return undefined;
  return { prefix: m[1] as ImportPrefix, yyyymmdd: m[2], seq: Number(m[3]) };
}

/** Doc-id range prefix of every record of a level/day: `${level}_${prefix}-${yyyymmdd}-`. */
export function dayIdPrefix(levelId: LevelId, prefix: ImportPrefix, date: string): string {
  return recordDocId(levelId, `${prefix}-${compactDate(date)}-`);
}

/**
 * Tracks the highest sequence per counter while planning. Codes for rows without one are allocated after
 * max(stored counter, existing records of that day, codes imported for that day).
 */
export class CodeAllocator {
  private readonly maxSeq = new Map<string, number>();

  constructor(
    private readonly levelId: LevelId,
    /** counterId → stored seq */
    private readonly stored: ReadonlyMap<string, number>,
    /** counterId → highest seq of existing records of that day (only loaded for days needing new codes) */
    private readonly existingMax: ReadonlyMap<string, number>,
  ) {}

  counterIdFor(prefix: ImportPrefix, yyyymmdd: string): string {
    return counterId(prefix, this.levelId, yyyymmdd);
  }

  /** Remember an imported code so generated codes and counters continue after it. */
  noteImported(code: string): void {
    const p = parseSeqCode(code);
    if (!p) return;
    const id = this.counterIdFor(p.prefix, p.yyyymmdd);
    this.maxSeq.set(id, Math.max(this.maxSeq.get(id) ?? 0, p.seq));
  }

  /** Next free code of the day (call after every `noteImported`). */
  generate(prefix: ImportPrefix, date: string): string {
    const id = this.counterIdFor(prefix, compactDate(date));
    const seq = Math.max(this.maxSeq.get(id) ?? 0, this.stored.get(id) ?? 0, this.existingMax.get(id) ?? 0) + 1;
    this.maxSeq.set(id, seq);
    return formatCode(prefix, date, seq);
  }

  /** Counters to persist: only those whose new value exceeds the stored one. */
  counterUpdates(): Array<{ id: string; seq: number }> {
    return [...this.maxSeq.entries()]
      .filter(([id, seq]) => seq > (this.stored.get(id) ?? 0))
      .map(([id, seq]) => ({ id, seq }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}
