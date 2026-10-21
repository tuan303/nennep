/**
 * Vietnamese text helpers: diacritics-insensitive search, name suggestions, natural sort, number formatting.
 * Pure functions – usable on the server and in the browser.
 */
import type { StudentLite } from "../types";

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Strip diacritics (incl. đ/Đ → d), lowercase, trim and collapse whitespace. "Đỗ Văn Đạt" → "do van dat". */
export function normalizeVN(s: string): string {
  return s
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(s: string): string[] {
  const n = normalizeVN(s);
  return n ? n.split(" ") : [];
}

/** True when every token of `query` is a substring of `normalizeVN(text)`. An empty query matches everything. */
export function matchesSearch(text: string, query: string): boolean {
  const q = tokens(query);
  if (q.length === 0) return true;
  const t = normalizeVN(text);
  return q.every((tok) => t.includes(tok));
}

/**
 * Natural string comparison: digit runs compare numerically ("6A2" < "6A10").
 * Deterministic (no locale), suitable for class codes and ids.
 */
export function naturalCompare(a: string, b: string): number {
  if (a === b) return 0;
  const ax = a.split(/(\d+)/);
  const bx = b.split(/(\d+)/);
  const n = Math.min(ax.length, bx.length);
  for (let i = 0; i < n; i++) {
    const x = ax[i];
    const y = bx[i];
    if (x === y) continue;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d;
      if (x.length !== y.length) return x.length - y.length;
      continue;
    }
    return x < y ? -1 : 1;
  }
  return ax.length - bx.length;
}

/** Compare Vietnamese strings ignoring diacritics first, then raw text (deterministic). */
export function compareVN(a: string, b: string): number {
  const na = normalizeVN(a);
  const nb = normalizeVN(b);
  if (na !== nb) return na < nb ? -1 : 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * Suggest students for a partially typed name, e.g. "Trường Phúc".
 * Ranking: exact name → name ends with the partial at a word boundary → name ends with the partial →
 * name contains every token of the partial. Inside a tier: ACTIVE first, then name, class, id.
 */
export function nameSuggestions(partial: string, students: StudentLite[], limit = 5): StudentLite[] {
  const p = normalizeVN(partial);
  if (!p || limit <= 0) return [];
  const toks = p.split(" ");
  const ranked: Array<{ s: StudentLite; tier: number; norm: string }> = [];
  for (const s of students) {
    const norm = normalizeVN(s.name);
    let tier: number;
    if (norm === p) tier = 0;
    else if (norm.endsWith(" " + p)) tier = 1;
    else if (norm.endsWith(p)) tier = 2;
    else if (toks.every((t) => norm.includes(t))) tier = 3;
    else continue;
    ranked.push({ s, tier, norm });
  }
  ranked.sort(
    (a, b) =>
      a.tier - b.tier ||
      Number(a.s.status !== "ACTIVE") - Number(b.s.status !== "ACTIVE") ||
      (a.norm === b.norm ? 0 : a.norm < b.norm ? -1 : 1) ||
      naturalCompare(a.s.classCode, b.s.classCode) ||
      naturalCompare(a.s.id, b.s.id),
  );
  return ranked.slice(0, limit).map((r) => r.s);
}

/** Vietnamese number format without Intl: thousands ".", decimal ",", at most `maxDecimals` (trailing zeros trimmed). */
export function formatNumberVN(n: number, maxDecimals = 2): string {
  if (!Number.isFinite(n)) return "0";
  const factor = 10 ** maxDecimals;
  const abs = Math.round(Math.abs(n) * factor) / factor;
  const [intPart, decPart = ""] = abs.toFixed(maxDecimals).split(".");
  const intStr = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decStr = decPart.replace(/0+$/, "");
  const sign = n < 0 && abs !== 0 ? "-" : "";
  return sign + intStr + (decStr ? "," + decStr : "");
}

/** Ratio 0..1 → "92%" (rounded to an integer percent). */
export function formatPercentVN(ratio: number): string {
  if (!Number.isFinite(ratio)) return "0%";
  return `${Math.round(ratio * 100)}%`;
}
