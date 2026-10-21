/**
 * Possible duplicate incidents (REQ_V2 §4.4, hạng mục 3/11): the same event recorded twice (two inspectors, a double
 * submit on two devices) would count its penalty twice. Detection only – nothing here blocks or deletes a record.
 * Input must not be redacted (a GVCN dataset strips the names of other classes).
 */
import type { Incident } from "../types";
import { compareIncidentsNewestFirst } from "./analytics-students";
import { round2 } from "./scoring";
import { naturalCompare } from "./text";
import { compareStr, groupBy } from "./utils";

export interface DuplicateDraft {
  date: string;
  classCode: string;
  errorCode: string;
  studentIds: readonly string[];
  /** The record being edited (never its own duplicate). */
  excludeId?: string;
}

const namedIds = (i: Pick<Incident, "students">): string[] => i.students.map((s) => s.id).filter(Boolean);

/** Named students intersect, or neither side names a student. */
function studentsMatch(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return a.length === 0 && b.length === 0;
  const set = new Set(a);
  return b.some((id) => set.has(id));
}

/** The pair was reviewed as NOT duplicates (either side lists the other in `notDuplicateOf`). */
function reviewedPair(a: Incident, b: Incident): boolean {
  return (a.notDuplicateOf?.includes(b.id) ?? false) || (b.notDuplicateOf?.includes(a.id) ?? false);
}

/**
 * Possible duplicate pair: different ids, both not deleted, same date + classCode + errorCode, not reviewed
 * (neither lists the other in notDuplicateOf), and (named students intersect OR both have no named student).
 */
export function isPossibleDuplicatePair(a: Incident, b: Incident): boolean {
  return (
    a.id !== b.id &&
    !a.deletedAt &&
    !b.deletedAt &&
    a.date === b.date &&
    a.classCode === b.classCode &&
    a.errorCode === b.errorCode &&
    !reviewedPair(a, b) &&
    studentsMatch(namedIds(a), namedIds(b))
  );
}

/**
 * Existing incidents a draft (entry form) would duplicate, newest first; `excludeId` = the record being edited (pairs
 * already reviewed with that record are not reported). An incomplete draft (no date / class / error) matches nothing.
 */
export function possibleDuplicatesOf(incidents: readonly Incident[], draft: DuplicateDraft): Incident[] {
  if (!draft.date || !draft.classCode || !draft.errorCode) return [];
  const ids = [...new Set(draft.studentIds.filter(Boolean))];
  const self = draft.excludeId ? incidents.find((i) => i.id === draft.excludeId) : undefined;
  return incidents
    .filter(
      (i) =>
        !i.deletedAt &&
        i.id !== draft.excludeId &&
        i.date === draft.date &&
        i.classCode === draft.classCode &&
        i.errorCode === draft.errorCode &&
        !(draft.excludeId && i.notDuplicateOf?.includes(draft.excludeId)) &&
        !(self?.notDuplicateOf?.includes(i.id) ?? false) &&
        studentsMatch(ids, namedIds(i)),
    )
    .sort(compareIncidentsNewestFirst);
}

export interface DuplicateGroup {
  /** `${date}|${classCode}|${errorCode}|${firstId}` (firstId = id of the oldest member). */
  key: string;
  date: string;
  classCode: string;
  errorCode: string;
  issue: string;
  reason: "SAME_STUDENTS" | "NO_NAMED_STUDENTS";
  /** Oldest first (createdAt, code). */
  incidents: Incident[];
  /** Σ points − max points of the group: penalty that may be counted twice. */
  extraPoints: number;
}

function compareOldestFirst(a: Incident, b: Incident): number {
  return compareStr(a.createdAt, b.createdAt) || naturalCompare(a.code, b.code);
}

/**
 * Connected components (size ≥ 2) of possible-duplicate pairs; newest date first, then class, then key.
 * reason = "NO_NAMED_STUDENTS" when no member names a student, else "SAME_STUDENTS".
 */
export function findPossibleDuplicates(incidents: readonly Incident[]): DuplicateGroup[] {
  const buckets = groupBy(
    incidents.filter((i) => !i.deletedAt),
    (i) => `${i.date}|${i.classCode}|${i.errorCode}`,
  );
  const groups: DuplicateGroup[] = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const parent = list.map((_, idx) => idx);
    const find = (x: number): number => {
      while (parent[x] !== x) x = parent[x] = parent[parent[x]];
      return x;
    };
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        if (isPossibleDuplicatePair(list[a], list[b])) parent[find(a)] = find(b);
      }
    }
    const components = groupBy(
      list.map((_, idx) => idx),
      (idx) => String(find(idx)),
    );
    for (const idxs of components.values()) {
      if (idxs.length < 2) continue;
      const members = idxs.map((idx) => list[idx]).sort(compareOldestFirst);
      const first = members[0];
      const total = members.reduce((s, i) => s + i.points, 0);
      const max = members.reduce((m, i) => Math.max(m, i.points), -Infinity);
      groups.push({
        key: `${first.date}|${first.classCode}|${first.errorCode}|${first.id}`,
        date: first.date,
        classCode: first.classCode,
        errorCode: first.errorCode,
        issue: first.issue,
        reason: members.some((i) => namedIds(i).length > 0) ? "SAME_STUDENTS" : "NO_NAMED_STUDENTS",
        incidents: members,
        extraPoints: round2(total - max),
      });
    }
  }
  return groups.sort((a, b) => compareStr(b.date, a.date) || naturalCompare(a.classCode, b.classCode) || compareStr(a.key, b.key));
}
