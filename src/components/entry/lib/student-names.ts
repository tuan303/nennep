/**
 * Names of the students on a record, as shown on screens and in reports (pure – unit-tested).
 *
 * An incident keeps a snapshot of each named student (id, name, class at recording time – AC-019 keeps the class
 * history), but a name corrected later in the roster must read the same everywhere (Học sinh page, detail sheet,
 * Báo GVCN text sent to parents, Dữ liệu, Nhập liệu). So names are looked up by id in the current roster, falling back
 * to the snapshot when the student is not in this viewer's roster (removed, or hidden in a GVCN dataset).
 * The stored snapshot itself is never changed (history / audit).
 */
import type { Incident, StudentLite, StudentRef } from "@/lib/types";

/** Current roster by student id (only `name` is read). */
export type RosterNames = ReadonlyMap<string, Pick<StudentLite, "name">>;

export function rosterNames(students: readonly Pick<StudentLite, "id" | "name">[]): RosterNames {
  return new Map(students.map((s) => [s.id, s] as const));
}

/** Current roster name of a named student, else the name recorded on the incident. */
export function studentDisplayName(ref: Pick<StudentRef, "id" | "name">, roster?: RosterNames): string {
  return roster?.get(ref.id)?.name?.trim() || ref.name;
}

/**
 * Display copy of a record whose student names follow the roster (ids and snapshot classes unchanged); the same object
 * when nothing differs. For view models that hand records to several renderers / exports at once.
 */
export function withRosterNames<T extends Pick<Incident, "students">>(incident: T, roster?: RosterNames): T {
  if (!roster) return incident;
  let changed = false;
  const students = incident.students.map((s) => {
    const name = studentDisplayName(s, roster);
    if (name === s.name) return s;
    changed = true;
    return { ...s, name };
  });
  return changed ? { ...incident, students } : incident;
}
