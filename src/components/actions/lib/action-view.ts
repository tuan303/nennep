/**
 * Pure view-model helpers of the Action Register (/hanh-dong): deadline countdowns, KPIs, Kanban grouping,
 * SLA / escalation rows (FR-ACT-003) and search. No React – unit-tested in __tests__/action-view.test.ts.
 */
import type { Tone } from "@/components/ui";
import { diffDays, matchesSearch, naturalCompare, normalizeVN, todayVN } from "@/lib/engine";
import type { ActionItem, ActionStatus, Priority } from "@/lib/types";

export const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };
export const KANBAN_COLUMNS: readonly ActionStatus[] = ["Open", "Doing", "Done"];
/** Actions due within this many days (and not overdue) count as "Sắp đến hạn". */
export const DUE_SOON_DAYS = 2;

export type DeadlineKind = "done" | "overdue" | "today" | "soon" | "upcoming";

export interface DeadlineState {
  kind: DeadlineKind;
  /** deadline − today in calendar days (negative = overdue). */
  daysLeft: number;
  /** Lower-case countdown text: "còn 2 ngày", "quá hạn 3 ngày", "hôm nay đến hạn", "hoàn thành đúng hạn". */
  label: string;
  tone: Tone;
}

/** VN calendar day of an ISO timestamp ("" when missing/invalid). */
export function vnDateOf(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : todayVN(d);
}

export function isOverdue(item: Pick<ActionItem, "status" | "deadline">, today: string): boolean {
  return item.status !== "Done" && item.deadline < today;
}

/** Countdown of an action's deadline (Done items: on time / late by closing day). */
export function deadlineState(item: Pick<ActionItem, "status" | "deadline" | "closedAt">, today: string): DeadlineState {
  const daysLeft = diffDays(item.deadline, today);
  if (item.status === "Done") {
    const closed = vnDateOf(item.closedAt);
    if (!closed) return { kind: "done", daysLeft, label: "đã hoàn thành", tone: "ok" };
    const late = diffDays(closed, item.deadline);
    return late > 0
      ? { kind: "done", daysLeft, label: `hoàn thành trễ ${late} ngày`, tone: "warn" }
      : { kind: "done", daysLeft, label: "hoàn thành đúng hạn", tone: "ok" };
  }
  if (daysLeft < 0) return { kind: "overdue", daysLeft, label: `quá hạn ${-daysLeft} ngày`, tone: "bad" };
  if (daysLeft === 0) return { kind: "today", daysLeft, label: "hôm nay đến hạn", tone: "warn" };
  if (daysLeft <= DUE_SOON_DAYS) return { kind: "soon", daysLeft, label: `còn ${daysLeft} ngày`, tone: "warn" };
  return { kind: "upcoming", daysLeft, label: `còn ${daysLeft} ngày`, tone: "muted" };
}

export interface ActionKpis {
  open: number;
  doing: number;
  done: number;
  overdue: number;
  total: number;
}

export function actionKpis(items: readonly ActionItem[], today: string): ActionKpis {
  const k: ActionKpis = { open: 0, doing: 0, done: 0, overdue: 0, total: items.length };
  for (const i of items) {
    if (i.status === "Open") k.open++;
    else if (i.status === "Doing") k.doing++;
    else k.done++;
    if (isOverdue(i, today)) k.overdue++;
  }
  return k;
}

function byDeadlineThenPriority(a: ActionItem, b: ActionItem): number {
  return a.deadline.localeCompare(b.deadline) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || naturalCompare(a.code, b.code);
}

function byClosedDesc(a: ActionItem, b: ActionItem): number {
  return (b.closedAt ?? b.updatedAt ?? b.createdAt).localeCompare(a.closedAt ?? a.updatedAt ?? a.createdAt) || naturalCompare(b.code, a.code);
}

/** Kanban columns: open/doing by deadline (earliest first, then priority), done by closing time (newest first). */
export function groupByStatus(items: readonly ActionItem[]): Record<ActionStatus, ActionItem[]> {
  const out: Record<ActionStatus, ActionItem[]> = { Open: [], Doing: [], Done: [] };
  for (const i of items) out[i.status].push(i);
  out.Open.sort(byDeadlineThenPriority);
  out.Doing.sort(byDeadlineThenPriority);
  out.Done.sort(byClosedDesc);
  return out;
}

export interface SlaRow {
  item: ActionItem;
  overdueDays: number;
  /** SLA of the priority (config.actionSlaDays). */
  slaDays: number;
  /** Overdue for longer than the SLA of its priority → "Cần leo thang". */
  escalate: boolean;
}

/** Overdue actions (status ≠ Done, deadline < today): escalations first, then priority, then days overdue. */
export function slaRows(items: readonly ActionItem[], sla: Record<Priority, number>, today: string): SlaRow[] {
  return items
    .filter((i) => isOverdue(i, today))
    .map((item) => {
      const overdueDays = diffDays(today, item.deadline);
      const slaDays = sla[item.priority];
      return { item, overdueDays, slaDays, escalate: overdueDays > slaDays };
    })
    .sort(
      (a, b) =>
        Number(b.escalate) - Number(a.escalate) ||
        PRIORITY_RANK[a.item.priority] - PRIORITY_RANK[b.item.priority] ||
        b.overdueDays - a.overdueDays ||
        naturalCompare(a.item.code, b.item.code),
    );
}

/** Not-done actions due today … in `withinDays` days, earliest first. */
export function dueSoonRows(items: readonly ActionItem[], today: string, withinDays = DUE_SOON_DAYS): ActionItem[] {
  return items
    .filter((i) => {
      if (i.status === "Done") return false;
      const d = diffDays(i.deadline, today);
      return d >= 0 && d <= withinDays;
    })
    .sort(byDeadlineThenPriority);
}

export interface ActionSearch {
  query?: string;
  priority?: Priority;
}

export function searchActions(items: readonly ActionItem[], s: ActionSearch): ActionItem[] {
  const q = s.query?.trim() ?? "";
  return items.filter(
    (i) =>
      (!s.priority || i.priority === s.priority) &&
      (!q || matchesSearch(`${i.code} ${i.title} ${i.owner} ${i.scopeClass ?? ""} ${i.description ?? ""}`, q)),
  );
}

/** An existing action with the same title (accent/case-insensitive) – avoids creating duplicates from the brief. */
export function findExistingAction(items: readonly ActionItem[], title: string): ActionItem | undefined {
  const key = normalizeVN(title);
  if (!key) return undefined;
  const same = items.filter((i) => normalizeVN(i.title) === key);
  return same.find((i) => i.status !== "Done") ?? same[0];
}
