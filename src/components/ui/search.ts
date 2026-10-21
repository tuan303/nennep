/**
 * Accent-insensitive Vietnamese matching used by Combobox / MultiCombobox / DataTable search.
 * Pure functions (unit-tested in search.test.ts).
 */

const COMBINING_MARKS = /[̀-ͯ]/g;

/** "Nguyễn  Đức Anh" → "nguyen duc anh" (strip diacritics incl. đ→d, lowercase, collapse spaces). */
export function foldVN(input: string): string {
  return input
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Every token of `query` appears in `text` (both folded). Empty query matches everything. */
export function matchesFolded(text: string, query: string): boolean {
  const q = foldVN(query);
  if (!q) return true;
  const hay = foldVN(text);
  return q.split(" ").every((t) => hay.includes(t));
}

export interface SearchableOption {
  label: string;
  keywords?: readonly string[];
  description?: string;
  group?: string;
}

interface Indexed<T> {
  option: T;
  index: number;
  label: string;
  hay: string;
}

/** Pre-folds option text once so typing stays fast on long lists (e.g. 137 classes, 50 students). */
export function buildSearchIndex<T extends SearchableOption>(options: readonly T[]): Indexed<T>[] {
  return options.map((option, index) => {
    const label = foldVN(option.label);
    const extra = [...(option.keywords ?? []), option.description ?? "", option.group ?? ""].join(" ");
    return { option, index, label, hay: `${label} ${foldVN(extra)}` };
  });
}

function score(item: { label: string; hay: string }, q: string, tokens: string[]): number {
  if (!tokens.every((t) => item.hay.includes(t))) return -1;
  if (item.label === q) return 4;
  if (item.label.startsWith(q)) return 3;
  if (item.label.split(" ").some((w) => w.startsWith(tokens[0]))) return 2;
  return 1;
}

/**
 * Filter + rank options by `query`. Best matches first (exact > prefix > word prefix > contains),
 * original order kept inside each rank. `limit` caps the rendered list; `total` is the full match count.
 */
export function searchOptions<T extends SearchableOption>(
  index: readonly Indexed<T>[],
  query: string,
  limit = Number.POSITIVE_INFINITY,
): { items: T[]; total: number } {
  const q = foldVN(query);
  if (!q) {
    return { items: index.slice(0, limit).map((x) => x.option), total: index.length };
  }
  const tokens = q.split(" ");
  const scored: Array<{ s: number; i: number; option: T }> = [];
  for (const item of index) {
    const s = score(item, q, tokens);
    if (s >= 0) scored.push({ s, i: item.index, option: item.option });
  }
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return { items: scored.slice(0, limit).map((x) => x.option), total: scored.length };
}

/** Group options by `group`, keeping the order in which groups first appear. */
export function groupOptions<T extends { group?: string }>(items: readonly T[]): Array<{ group: string; items: T[] }> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const g = it.group ?? "";
    const arr = map.get(g);
    if (arr) arr.push(it);
    else map.set(g, [it]);
  }
  return [...map.entries()].map(([group, groupItems]) => ({ group, items: groupItems }));
}
