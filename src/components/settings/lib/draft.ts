/** Small pure helpers shared by the settings editors (dirty detection, numbers typed as text). */

/** Canonical JSON (object keys sorted, `undefined` members dropped) – equal values give equal strings. */
export function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortKeys(x);
    }
    return out;
  }
  return v;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

let seq = 0;
/** Unique key for a row added in the browser (never sent to the server). */
export function newRowKey(prefix = "new"): string {
  seq += 1;
  return `${prefix}:${Date.now().toString(36)}:${seq}`;
}

/**
 * Parse a number typed by a user ("2", "2,5", " 10 "). Empty / invalid → undefined.
 * Vietnamese decimal comma is accepted.
 */
export function parseNumberText(text: string): number | undefined {
  const t = text.trim().replace(",", ".");
  if (t === "" || !/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Number → text for an editable field ("2.5" → "2,5" is NOT applied: inputs keep a dot-free integer or a plain decimal). */
export function numberText(n: number | undefined): string {
  return n === undefined || !Number.isFinite(n) ? "" : String(n);
}

/** Integer typed as text; undefined when empty/invalid/non-integer. */
export function parseIntText(text: string): number | undefined {
  const n = parseNumberText(text);
  return n !== undefined && Number.isInteger(n) ? n : undefined;
}

/** Case/space-insensitive key used to detect duplicate codes ("l01 " = "L01"). */
export function codeKey(code: string): string {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

/** Codes that appear more than once (by `codeKey`), as the set of normalised keys. */
export function duplicateCodes(codes: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const c of codes) {
    const k = codeKey(c);
    if (!k) continue;
    if (seen.has(k)) dup.add(k);
    else seen.add(k);
  }
  return dup;
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Per-row field errors: `{ [rowKey]: { [field]: message } }`. */
export type RowErrors<F extends string = string> = Record<string, Partial<Record<F, string>>>;

export function countRowErrors(errors: RowErrors): number {
  return Object.values(errors).reduce((n, e) => n + Object.keys(e).length, 0);
}
