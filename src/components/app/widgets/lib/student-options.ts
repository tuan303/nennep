/** Student lists for the StudentPicker (pure – unit-tested). */
import { addDays } from "@/lib/engine/dates";
import { matchesSearch, naturalCompare, normalizeVN } from "@/lib/engine/text";
import type { Incident, StudentLite, StudentRef } from "@/lib/types";

/** Given name = last word ("Nguyễn Văn An" → "an"), folded. */
function givenName(name: string): string {
  const n = normalizeVN(name);
  const i = n.lastIndexOf(" ");
  return i >= 0 ? n.slice(i + 1) : n;
}

/** Vietnamese class-roster order: given name, then full name (accent-insensitive), then id. */
export function compareStudentsByGivenName(a: StudentLite, b: StudentLite): number {
  const ga = givenName(a.name);
  const gb = givenName(b.name);
  if (ga !== gb) return ga < gb ? -1 : 1;
  const na = normalizeVN(a.name);
  const nb = normalizeVN(b.name);
  if (na !== nb) return na < nb ? -1 : 1;
  return naturalCompare(a.id, b.id);
}

/** ACTIVE students currently in the class (FR-ENT-002), roster order. */
export function activeStudentsOfClass(students: readonly StudentLite[], classCode: string): StudentLite[] {
  if (!classCode) return [];
  return students.filter((s) => s.classCode === classCode && s.status === "ACTIVE").sort(compareStudentsByGivenName);
}

/** Accent-insensitive search on name and Mã HS ("nguyen an", "2606"). Empty query → the list itself. */
export function searchStudents(list: readonly StudentLite[], query: string): StudentLite[] {
  if (!normalizeVN(query)) return [...list];
  return list.filter((s) => matchesSearch(`${s.name} ${s.id}`, query));
}

export interface FrequentStudent {
  student: StudentLite;
  /** Incidents naming the student in the window. */
  count: number;
}

/**
 * Students of `active` named at least `minCount` times (default 2) in incidents of the last `days` days (default 28)
 * up to `today` (inclusive), most frequent first. Helps the discipline officer re-select the usual students quickly.
 */
export function frequentStudents(
  incidents: readonly Incident[],
  active: readonly StudentLite[],
  today: string,
  opts: { days?: number; limit?: number; minCount?: number } = {},
): FrequentStudent[] {
  const days = opts.days ?? 28;
  const limit = opts.limit ?? 6;
  const minCount = opts.minCount ?? 2;
  const from = addDays(today, -(days - 1));
  const byId = new Map(active.map((s) => [s.id, s] as const));
  const counts = new Map<string, number>();
  for (const i of incidents) {
    if (i.deletedAt || i.date < from || i.date > today) continue;
    const seen = new Set<string>();
    for (const s of i.students) {
      if (seen.has(s.id) || !byId.has(s.id)) continue;
      seen.add(s.id);
      counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .map(([id, count]) => ({ student: byId.get(id) as StudentLite, count }))
    .sort((a, b) => b.count - a.count || compareStudentsByGivenName(a.student, b.student))
    .slice(0, limit);
}

/** "active": studying in the class now · "kept": already on the edited record, left the class since – still valid ·
 * "invalid": would be rejected on save. */
export type SelectedStudentState = "active" | "kept" | "invalid";

export interface SelectedStudent {
  id: string;
  name: string;
  state: SelectedStudentState;
}

/**
 * Selected chips of the StudentPicker. On an edit that keeps the class, the students already on the record stay valid
 * even when they transferred/withdrew since (server + live preview keep them), so they must not be flagged for removal
 * – removing them would silently change the record's points and the student's history. Names of kept students come
 * from the record snapshot (a withdrawn student may be missing from the dataset).
 */
export function selectedStudents(
  value: readonly string[],
  rosterById: ReadonlyMap<string, StudentLite>,
  allById: ReadonlyMap<string, StudentLite>,
  kept: ReadonlyArray<Pick<StudentRef, "id" | "name">> = [],
): SelectedStudent[] {
  const keptById = new Map(kept.map((s) => [s.id, s] as const));
  return value.map((id) => {
    const active = rosterById.get(id);
    if (active) return { id, name: active.name, state: "active" };
    const k = keptById.get(id);
    if (k) return { id, name: k.name || allById.get(id)?.name || id, state: "kept" };
    return { id, name: allById.get(id)?.name ?? id, state: "invalid" };
  });
}
