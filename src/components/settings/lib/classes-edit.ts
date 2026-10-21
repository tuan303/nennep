/**
 * "Lớp & GVCN" editor model. Saved class codes are read-only (incidents reference them); a class is retired with
 * `active = false` (the server never deletes classes).
 */
import type { ClassesPutInput } from "@/lib/contract";
import { LEVELS } from "@/lib/constants";
import { matchesSearch, naturalCompare } from "@/lib/engine/text";
import type { ClassInfo, LevelId } from "@/lib/types";
import { codeKey, duplicateCodes, EMAIL_PATTERN, newRowKey, numberText, parseIntText, type RowErrors } from "./draft";

export interface ClassRow {
  key: string;
  isNew: boolean;
  code: string;
  grade: number;
  system: string;
  homeroomTeacher: string;
  deputyTeacher: string;
  homeroomPhone: string;
  homeroomEmail: string;
  sourceSizeText: string;
  active: boolean;
  orderText: string;
}

export type ClassField = "code" | "grade" | "system" | "homeroomTeacher" | "deputyTeacher" | "homeroomPhone" | "homeroomEmail" | "sourceSizeText" | "orderText";

export function rowsFromClasses(classes: readonly ClassInfo[]): ClassRow[] {
  return [...classes].sort(compareClassInfo).map((c) => ({
    key: `k:${c.code}`,
    isNew: false,
    code: c.code,
    grade: c.grade,
    system: c.system ?? "",
    homeroomTeacher: c.homeroomTeacher ?? "",
    deputyTeacher: c.deputyTeacher ?? "",
    homeroomPhone: c.homeroomPhone ?? "",
    homeroomEmail: c.homeroomEmail ?? "",
    sourceSizeText: numberText(c.sourceSize),
    active: c.active,
    orderText: String(c.order),
  }));
}

function compareClassInfo(a: ClassInfo, b: ClassInfo): number {
  return a.grade - b.grade || a.order - b.order || naturalCompare(a.code, b.code);
}

export function newClassRow(rows: readonly ClassRow[], levelId: LevelId, grade?: number): ClassRow {
  const g = grade ?? LEVELS[levelId].grades[0];
  const maxOrder = rows.reduce((m, r) => Math.max(m, parseIntText(r.orderText) ?? 0), 0);
  return {
    key: newRowKey("cls"),
    isNew: true,
    code: "",
    grade: g,
    system: "",
    homeroomTeacher: "",
    deputyTeacher: "",
    homeroomPhone: "",
    homeroomEmail: "",
    sourceSizeText: "",
    active: true,
    orderText: String(maxOrder + 1),
  };
}

/** Renumber `order` 1..n following grade then natural code (keeps the list tidy after adding classes). */
export function renumberClassOrder(rows: readonly ClassRow[]): ClassRow[] {
  const sorted = [...rows].sort((a, b) => a.grade - b.grade || naturalCompare(a.code, b.code));
  const order = new Map(sorted.map((r, i) => [r.key, String(i + 1)]));
  return rows.map((r) => (order.get(r.key) === r.orderText ? r : { ...r, orderText: order.get(r.key) ?? r.orderText }));
}

export function filterClassRows(rows: readonly ClassRow[], f: { grade?: number; query?: string }): ClassRow[] {
  return rows.filter((r) => {
    if (r.isNew && !r.code.trim()) return true;
    if (typeof f.grade === "number" && r.grade !== f.grade) return false;
    if (f.query && !matchesSearch(`${r.code} ${r.homeroomTeacher} ${r.deputyTeacher} ${r.homeroomEmail} ${r.system}`, f.query)) return false;
    return true;
  });
}

const tooLong = (s: string, max: number) => s.trim().length > max;

export function validateClassRow(r: ClassRow, levelId: LevelId, duplicates: ReadonlySet<string>): Partial<Record<ClassField, string>> {
  const e: Partial<Record<ClassField, string>> = {};
  const code = r.code.trim();
  if (!code) e.code = "Nhập mã lớp.";
  else if (code.length > 20) e.code = "Mã lớp tối đa 20 ký tự.";
  else if (duplicates.has(codeKey(code))) e.code = "Mã lớp bị trùng.";
  if (!LEVELS[levelId].grades.includes(r.grade)) e.grade = `Khối không thuộc cấp ${LEVELS[levelId].name}.`;
  if (tooLong(r.system, 40)) e.system = "Tối đa 40 ký tự.";
  if (tooLong(r.homeroomTeacher, 400)) e.homeroomTeacher = "Tối đa 400 ký tự.";
  if (tooLong(r.deputyTeacher, 200)) e.deputyTeacher = "Tối đa 200 ký tự.";
  if (tooLong(r.homeroomPhone, 30)) e.homeroomPhone = "Tối đa 30 ký tự.";
  const email = r.homeroomEmail.trim();
  if (email && (!EMAIL_PATTERN.test(email) || email.length > 120)) e.homeroomEmail = "Email không hợp lệ.";
  if (r.sourceSizeText.trim()) {
    const n = parseIntText(r.sourceSizeText);
    if (n === undefined || n < 0 || n > 200) e.sourceSizeText = "Sĩ số là số nguyên từ 0 đến 200.";
  }
  const order = parseIntText(r.orderText);
  if (order === undefined || order < 0) e.orderText = "Thứ tự là số nguyên ≥ 0.";
  return e;
}

export function validateClassRows(rows: readonly ClassRow[], levelId: LevelId): RowErrors<ClassField> {
  const dup = duplicateCodes(rows.map((r) => r.code));
  const out: RowErrors<ClassField> = {};
  for (const r of rows) {
    const e = validateClassRow(r, levelId, dup);
    if (Object.keys(e).length > 0) out[r.key] = e;
  }
  return out;
}

/** Duplicate check of one row against the others (the edit sheet). */
export function codeTakenByOther(rows: readonly ClassRow[], row: ClassRow): boolean {
  const k = codeKey(row.code);
  return !!k && rows.some((r) => r.key !== row.key && codeKey(r.code) === k);
}

export function classesPayload(rows: readonly ClassRow[]): ClassesPutInput {
  const opt = (k: string, v: string) => (v.trim() ? { [k]: v.trim() } : {});
  return {
    items: rows.map((r) => {
      const size = parseIntText(r.sourceSizeText);
      return {
        code: r.code.trim(),
        grade: r.grade,
        ...opt("system", r.system),
        ...opt("homeroomTeacher", r.homeroomTeacher),
        ...opt("deputyTeacher", r.deputyTeacher),
        ...opt("homeroomPhone", r.homeroomPhone),
        ...opt("homeroomEmail", r.homeroomEmail.toLowerCase()),
        ...(size !== undefined ? { sourceSize: size } : {}),
        active: r.active,
        order: parseIntText(r.orderText) ?? 0,
      };
    }),
  };
}

export function classChanges(rows: readonly ClassRow[], base: readonly ClassRow[]): { added: number; updated: number; deactivated: number } {
  const old = new Map(base.map((r) => [r.key, r]));
  let added = 0;
  let updated = 0;
  let deactivated = 0;
  for (const r of rows) {
    const o = old.get(r.key);
    if (!o) added += 1;
    else if (o.active && !r.active) deactivated += 1;
    else if (JSON.stringify({ ...o, key: "" }) !== JSON.stringify({ ...r, key: "" })) updated += 1;
  }
  return { added, updated, deactivated };
}

/** Readiness for "Tạo tài khoản GVCN hàng loạt": active classes, with a valid GVCN email. */
export function gvcnEmailCoverage(classes: readonly ClassInfo[]): { active: number; withEmail: number; invalid: number; missing: string[] } {
  const active = classes.filter((c) => c.active);
  let withEmail = 0;
  let invalid = 0;
  const missing: string[] = [];
  for (const c of active) {
    const email = c.homeroomEmail?.trim() ?? "";
    if (!email) missing.push(c.code);
    else if (EMAIL_PATTERN.test(email)) withEmail += 1;
    else invalid += 1;
  }
  return { active: active.length, withEmail, invalid, missing: missing.sort(naturalCompare) };
}
