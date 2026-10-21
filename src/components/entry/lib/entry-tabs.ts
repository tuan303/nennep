/** Tabs of "/nhap-lieu" (`?tab=su-viec|kiem-tra`, REQ_V2 §7.1). Pure – unit-tested. */

export const ENTRY_TABS = ["su-viec", "kiem-tra"] as const;
export type EntryTab = (typeof ENTRY_TABS)[number];
export const DEFAULT_ENTRY_TAB: EntryTab = "su-viec";

export const ENTRY_TAB_LABELS: Record<EntryTab, string> = {
  "su-viec": "Sự việc",
  "kiem-tra": "Đợt kiểm tra",
};

export interface EntryTabAccess {
  /** incident.create */
  incidents: boolean;
  /** inspection.manage */
  inspections: boolean;
  /** `?edit=` is set: the incident form is forced. */
  editing?: boolean;
}

/** Tabs the user may open, in display order. */
export function entryTabsFor(access: EntryTabAccess): EntryTab[] {
  if (access.editing) return access.incidents ? ["su-viec"] : [];
  return ENTRY_TABS.filter((t) => (t === "su-viec" ? access.incidents : access.inspections));
}

/** Tab to show for a `?tab=` value: allowed value, else the first allowed tab (edit mode → "su-viec"). */
export function resolveEntryTab(raw: string | null | undefined, access: EntryTabAccess): EntryTab | undefined {
  const allowed = entryTabsFor(access);
  const wanted = ENTRY_TABS.find((t) => t === raw?.trim());
  return wanted && allowed.includes(wanted) ? wanted : allowed[0];
}

/** Query string after switching tab (the default tab drops `tab`; other params such as filters are kept). */
export function entryTabQuery(current: string, tab: EntryTab): string {
  const q = new URLSearchParams(current);
  if (tab === DEFAULT_ENTRY_TAB) q.delete("tab");
  else q.set("tab", tab);
  return q.toString();
}
