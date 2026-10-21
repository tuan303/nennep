/** Small internal helpers shared by engine modules (not re-exported from the engine index). */
import type { ClassInfo, SchoolWeek } from "../types";
import { round2 } from "./scoring";
import { naturalCompare } from "./text";

export function sumBy<T>(items: readonly T[], f: (x: T) => number): number {
  let s = 0;
  for (const x of items) s += f(x);
  return round2(s);
}

export function groupBy<T>(items: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of items) {
    const k = key(x);
    const arr = m.get(k);
    if (arr) arr.push(x);
    else m.set(k, [x]);
  }
  return m;
}

export function compareStr(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Calendar weeks sorted by weekStart ascending (copy). */
export function sortWeeks(weeks: readonly SchoolWeek[]): SchoolWeek[] {
  return [...weeks].sort((a, b) => compareStr(a.weekStart, b.weekStart));
}

/** Display order of classes: grade, configured order, then natural class code. */
export function compareClassInfo(a: ClassInfo, b: ClassInfo): number {
  return a.grade - b.grade || a.order - b.order || naturalCompare(a.code, b.code);
}

export function uniqueCount(values: Iterable<string>): number {
  return new Set(values).size;
}
