/**
 * "Danh mục lỗi" editor model: editable rows, validation, PUT payload and a change summary.
 * Codes of saved items are read-only (renaming would deactivate the old code); the server never deletes items –
 * an item is retired with `active = false`. Incidents keep their own catalog snapshot.
 */
import type { CatalogPutInput } from "@/lib/contract";
import { matchesSearch } from "@/lib/engine/text";
import type { CatalogItem, Unit } from "@/lib/types";
import { codeKey, duplicateCodes, newRowKey, numberText, parseNumberText, type RowErrors } from "./draft";

export interface CatalogRow {
  key: string;
  /** Added in this session (code still editable, can be removed before saving). */
  isNew: boolean;
  code: string;
  category: string;
  issue: string;
  group: string;
  /** Typed text; parsed on save. */
  penaltyText: string;
  unit: Unit;
  displayName?: string;
  is5S: boolean;
  active: boolean;
}

export type CatalogField = "code" | "category" | "issue" | "group" | "penaltyText";

export function rowsFromCatalog(catalog: readonly CatalogItem[]): CatalogRow[] {
  return catalog.map((c) => ({
    key: `c:${c.code}`,
    isNew: false,
    code: c.code,
    category: c.category,
    issue: c.issue,
    group: c.group ?? "",
    penaltyText: numberText(c.penalty),
    unit: c.unit,
    ...(c.displayName ? { displayName: c.displayName } : {}),
    is5S: c.is5S,
    active: c.active,
  }));
}

/** Next free code in the "L01" style (max numeric suffix + 1, at least 2 digits). */
export function nextCatalogCode(rows: readonly Pick<CatalogRow, "code">[]): string {
  let max = 0;
  for (const r of rows) {
    const m = /^L(\d+)$/i.exec(r.code.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `L${String(max + 1).padStart(2, "0")}`;
}

export function newCatalogRow(rows: readonly CatalogRow[], category = ""): CatalogRow {
  return {
    key: newRowKey("cat"),
    isNew: true,
    code: nextCatalogCode(rows),
    category,
    issue: "",
    group: "",
    penaltyText: "",
    unit: "/HS",
    is5S: false,
    active: true,
  };
}

/** Distinct Mảng values in first-seen order. */
export function catalogCategories(rows: readonly Pick<CatalogRow, "category">[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const c = r.category.trim();
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

export function filterCatalogRows(rows: readonly CatalogRow[], f: { category?: string; query?: string; showInactive?: boolean }): CatalogRow[] {
  return rows.filter((r) => {
    if (r.isNew) return true; // new rows stay visible while being filled in
    if (f.category && r.category.trim() !== f.category) return false;
    if (f.showInactive === false && !r.active) return false;
    if (f.query && !matchesSearch(`${r.code} ${r.issue} ${r.category} ${r.group}`, f.query)) return false;
    return true;
  });
}

export function validateCatalogRows(rows: readonly CatalogRow[]): RowErrors<CatalogField> {
  const errors: RowErrors<CatalogField> = {};
  const dup = duplicateCodes(rows.map((r) => r.code));
  for (const r of rows) {
    const e: Partial<Record<CatalogField, string>> = {};
    const code = r.code.trim();
    if (!code) e.code = "Nhập mã lỗi.";
    else if (code.length > 20) e.code = "Mã tối đa 20 ký tự.";
    else if (dup.has(codeKey(code))) e.code = "Mã lỗi bị trùng.";
    if (!r.category.trim()) e.category = "Nhập mảng.";
    else if (r.category.trim().length > 200) e.category = "Tối đa 200 ký tự.";
    if (!r.issue.trim()) e.issue = "Nhập nội dung lỗi.";
    else if (r.issue.trim().length > 500) e.issue = "Tối đa 500 ký tự.";
    if (r.group.trim().length > 60) e.group = "Tối đa 60 ký tự.";
    const p = parseNumberText(r.penaltyText);
    if (r.penaltyText.trim() === "") e.penaltyText = "Nhập mức trừ.";
    else if (p === undefined) e.penaltyText = "Mức trừ phải là số.";
    else if (p < 0 || p > 1000) e.penaltyText = "Từ 0 đến 1.000.";
    if (Object.keys(e).length > 0) errors[r.key] = e;
  }
  return errors;
}

export function catalogPayload(rows: readonly CatalogRow[]): CatalogPutInput {
  return {
    items: rows.map((r) => ({
      code: r.code.trim(),
      category: r.category.trim(),
      issue: r.issue.trim(),
      ...(r.group.trim() ? { group: r.group.trim() } : {}),
      penalty: parseNumberText(r.penaltyText) ?? 0,
      unit: r.unit,
      ...(r.displayName ? { displayName: r.displayName } : {}),
      is5S: r.is5S,
      active: r.active,
    })),
  };
}

export interface CatalogChangeSummary {
  added: number;
  updated: number;
  deactivated: number;
}

/** What a save would do, compared with the saved rows. */
export function catalogChanges(rows: readonly CatalogRow[], base: readonly CatalogRow[]): CatalogChangeSummary {
  const old = new Map(base.map((r) => [r.key, r]));
  let added = 0;
  let updated = 0;
  let deactivated = 0;
  for (const r of rows) {
    const o = old.get(r.key);
    if (!o) {
      added += 1;
      continue;
    }
    if (o.active && !r.active) deactivated += 1;
    else if (
      o.category !== r.category ||
      o.issue !== r.issue ||
      o.group !== r.group ||
      parseNumberText(o.penaltyText) !== parseNumberText(r.penaltyText) ||
      o.unit !== r.unit ||
      o.is5S !== r.is5S ||
      o.active !== r.active
    ) {
      updated += 1;
    }
  }
  return { added, updated, deactivated };
}

export function changeSummaryText(s: CatalogChangeSummary, nouns: { item: string } = { item: "mục" }): string {
  const parts: string[] = [];
  if (s.added) parts.push(`${s.added} ${nouns.item} mới`);
  if (s.updated) parts.push(`${s.updated} ${nouns.item} sửa`);
  if (s.deactivated) parts.push(`${s.deactivated} ${nouns.item} ngừng dùng`);
  return parts.join(" · ");
}
