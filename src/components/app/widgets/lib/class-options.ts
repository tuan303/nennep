/** Class lists for pickers (pure – unit-tested). */
import type { ComboOption } from "@/components/ui";
import { naturalCompare } from "@/lib/engine/text";
import type { ClassInfo } from "@/lib/types";

export interface ClassFilter {
  /** Only classes of this grade. */
  grade?: number;
  /** Include classes marked inactive (default false). */
  includeInactive?: boolean;
  /** Only these class codes (e.g. a GVCN's own classes). */
  restrictTo?: readonly string[];
  /** Always keep this class (e.g. the current value while editing an old record), even if filtered out by `active`. */
  keep?: string;
}

/** "Khối 6" */
export function gradeLabel(grade: number): string {
  return `Khối ${grade}`;
}

/** Display order of classes: grade, configured order, then natural class code ("6A2" < "6A10"). */
export function compareClasses(a: ClassInfo, b: ClassInfo): number {
  return a.grade - b.grade || a.order - b.order || naturalCompare(a.code, b.code);
}

/** Classes matching the filter, in display order. */
export function pickClasses(classes: readonly ClassInfo[], f: ClassFilter = {}): ClassInfo[] {
  const only = f.restrictTo ? new Set(f.restrictTo) : undefined;
  return classes
    .filter((c) => {
      if (f.keep && c.code === f.keep) return true;
      if (!c.active && !f.includeInactive) return false;
      if (typeof f.grade === "number" && c.grade !== f.grade) return false;
      if (only && !only.has(c.code)) return false;
      return true;
    })
    .sort(compareClasses);
}

/** Distinct grades (ascending) of the classes. */
export function gradesOf(classes: readonly ClassInfo[]): number[] {
  return [...new Set(classes.map((c) => c.grade))].sort((a, b) => a - b);
}

/** "GVCN: Nguyễn Thu Hà" / "Chưa có GVCN" (+ "· ngừng hoạt động"). */
export function classDescription(c: ClassInfo): string {
  const teacher = c.homeroomTeacher?.trim() ? `GVCN: ${c.homeroomTeacher.trim()}` : "Chưa có GVCN";
  return c.active ? teacher : `${teacher} · ngừng hoạt động`;
}

/** Combobox options grouped by "Khối N", GVCN as description and search keyword. */
export function classOptions(classes: readonly ClassInfo[], f: ClassFilter = {}, disabledCodes?: readonly string[]): ComboOption<string>[] {
  const disabled = new Set(disabledCodes ?? []);
  return pickClasses(classes, f).map((c) => ({
    value: c.code,
    label: c.code,
    group: gradeLabel(c.grade),
    description: classDescription(c),
    keywords: [c.homeroomTeacher ?? "", c.deputyTeacher ?? "", gradeLabel(c.grade)].filter(Boolean),
    disabled: disabled.has(c.code),
  }));
}
