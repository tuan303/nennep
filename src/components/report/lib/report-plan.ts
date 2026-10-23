/**
 * "Công tác phối hợp tuần/tháng mới" (Báo cáo tuần/tháng, section 5) – pure helpers: the period the plan is about (the
 * week / month AFTER the report period), the editor draft (rows with local keys) ↔ ReportPlan / PUT body, dirty
 * detection, validation and the content printed in the A4 document. Unit-tested in __tests__/report-plan.test.ts.
 */
import { fmtDateTime } from "@/lib/client/format";
import type { ReportPlanPutInput } from "@/lib/contract";
import { addDays, formatDayMonthVN, monthOf, periodLabel, weekdayLabelVN } from "@/lib/engine";
import type { LevelId, Period, ReportPlan, ReportPlanItem } from "@/lib/types";

export type ReportPlanMode = ReportPlan["mode"];

/** Report period a plan is stored under (week: Monday yyyy-mm-dd; month: yyyy-mm). */
export interface ReportPlanPeriod {
  mode: ReportPlanMode;
  key: string;
}

/** Limits of the contract (ReportPlanPutSchema), enforced by the inputs. */
export const PLAN_LIMITS = { items: 30, content: 500, owner: 120, due: 60, note: 2000 } as const;

/** The plan period of a report period; undefined for another mode or without a key. */
export function planPeriodOf(period: Period | undefined): ReportPlanPeriod | undefined {
  if (!period?.key || (period.mode !== "week" && period.mode !== "month")) return undefined;
  return { mode: period.mode, key: period.key };
}

/** The period the plan is about: the week after (Monday + 7 days) / the month after. */
export function nextReportPeriod(p: ReportPlanPeriod): ReportPlanPeriod {
  if (p.mode === "week") return { mode: "week", key: addDays(p.key, 7) };
  return { mode: "month", key: monthOf(addDays(`${p.key}-01`, 31)) };
}

/** "Tuần 26/10 – 01/11/2026" | "Tháng 11/2026" – label of the period the plan is about. */
export function nextPeriodLabel(p: ReportPlanPeriod): string {
  return periodLabel(nextReportPeriod(p), []);
}

/** Placeholder of "Thời hạn": "VD: Thứ Hai 26/10" (Monday of the next week) | "VD: Trước 15/11" (next month). */
export function planDueExample(p: ReportPlanPeriod): string {
  const next = nextReportPeriod(p);
  if (next.mode === "week") return `VD: ${weekdayLabelVN(next.key)} ${formatDayMonthVN(next.key)}`;
  return `VD: Trước ${formatDayMonthVN(`${next.key}-15`)}`;
}

/** "Công tác phối hợp tuần mới" | "… tháng mới" (the document heading prints it upper-case). */
export function planTitle(mode: ReportPlanMode): string {
  return `Công tác phối hợp ${mode === "week" ? "tuần" : "tháng"} mới`;
}

/** "Đã lưu lúc 23/10/2026 14:05 – Nguyễn Văn A"; undefined before the first save. */
export function planSavedLine(plan: Pick<ReportPlan, "updatedAt" | "updatedBy" | "updatedByName"> | null | undefined): string | undefined {
  if (!plan?.updatedAt) return undefined;
  const who = plan.updatedByName?.trim() || plan.updatedBy;
  return `Đã lưu lúc ${fmtDateTime(plan.updatedAt)}${who ? ` – ${who}` : ""}`;
}

/* ---------------------------------- Draft --------------------------------- */

export interface PlanDraftRow {
  /** Local React key (never sent). */
  key: string;
  content: string;
  owner: string;
  due: string;
}

export interface PlanDraft {
  rows: PlanDraftRow[];
  note: string;
}

export type PlanRowField = Exclude<keyof PlanDraftRow, "key">;

let rowSeq = 0;
function rowKey(): string {
  rowSeq += 1;
  return `r${rowSeq}`;
}

export function emptyPlanRow(): PlanDraftRow {
  return { key: rowKey(), content: "", owner: "", due: "" };
}

/** Editable copy of a stored plan (no plan → no row, empty note). */
export function draftFromPlan(plan: Pick<ReportPlan, "items" | "note"> | null | undefined): PlanDraft {
  return {
    rows: (plan?.items ?? []).map((i) => ({ key: rowKey(), content: i.content, owner: i.owner ?? "", due: i.due ?? "" })),
    note: plan?.note ?? "",
  };
}

/** Items as saved: trimmed, empty owner / due left out (rows without content stay – validation refuses them). */
export function planItemsOf(draft: PlanDraft): ReportPlanItem[] {
  return draft.rows.map((r) => {
    const item: ReportPlanItem = { content: r.content.trim() };
    const owner = r.owner.trim();
    const due = r.due.trim();
    if (owner) item.owner = owner;
    if (due) item.due = due;
    return item;
  });
}

/** Comparable form of a draft: trimmed values, row keys ignored. */
function canonical(draft: PlanDraft): string {
  return JSON.stringify([draft.rows.map((r) => [r.content.trim(), r.owner.trim(), r.due.trim()]), draft.note.trim()]);
}

/** Same content once trimmed (row keys and surrounding spaces do not count as a change). */
export function samePlanDraft(a: PlanDraft, b: PlanDraft): boolean {
  return canonical(a) === canonical(b);
}

/**
 * A background reload keeps what is shown when it holds unsaved edits, or when the response is older than the plan shown
 * (a GET answered before our own save landed – revs only grow), so it never reverts the screen to a stale version.
 */
export function keepShownPlan(
  shown: { saved: Pick<ReportPlan, "items" | "note" | "rev"> | null; draft: PlanDraft },
  fetched: Pick<ReportPlan, "rev"> | null,
): boolean {
  return !samePlanDraft(shown.draft, draftFromPlan(shown.saved)) || (fetched?.rev ?? 0) < (shown.saved?.rev ?? 0);
}

export interface PlanDraftIssues {
  /** Keys of the rows without "Nội dung công việc". */
  blankKeys: string[];
  /** First problem, for the line next to "Lưu"; undefined when the draft can be saved. */
  message?: string;
}

export function planDraftIssues(draft: PlanDraft): PlanDraftIssues {
  const blank = draft.rows.flatMap((r, idx) => (r.content.trim() ? [] : [{ key: r.key, no: idx + 1 }]));
  if (blank.length > 0) {
    return {
      blankKeys: blank.map((b) => b.key),
      message: `Công việc ${blank.map((b) => b.no).join(", ")} chưa có nội dung – nhập nội dung hoặc xóa công việc đó.`,
    };
  }
  if (draft.rows.length > PLAN_LIMITS.items) return { blankKeys: [], message: `Tối đa ${PLAN_LIMITS.items} công việc.` };
  return { blankKeys: [] };
}

/** PUT /api/report-plans body (replaces the whole plan; an empty note clears it). */
export function planPutInput(levelId: LevelId, period: ReportPlanPeriod, draft: PlanDraft, baseRev: number): ReportPlanPutInput {
  return { levelId, mode: period.mode, key: period.key, items: planItemsOf(draft), note: draft.note.trim(), baseRev };
}

/* ------------------------------ Row operations ----------------------------- */

/** Appends `row` (a new empty row by default; no-op at PLAN_LIMITS.items). */
export function addPlanRow(draft: PlanDraft, row: PlanDraftRow = emptyPlanRow()): PlanDraft {
  if (draft.rows.length >= PLAN_LIMITS.items) return draft;
  return { ...draft, rows: [...draft.rows, row] };
}

export function updatePlanRow(draft: PlanDraft, key: string, field: PlanRowField, value: string): PlanDraft {
  return { ...draft, rows: draft.rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)) };
}

export function removePlanRow(draft: PlanDraft, key: string): PlanDraft {
  return { ...draft, rows: draft.rows.filter((r) => r.key !== key) };
}

/** Moves a row one place up (−1) or down (+1); no-op at the ends. */
export function movePlanRow(draft: PlanDraft, key: string, delta: -1 | 1): PlanDraft {
  const from = draft.rows.findIndex((r) => r.key === key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= draft.rows.length) return draft;
  const rows = [...draft.rows];
  [rows[from], rows[to]] = [rows[to], rows[from]];
  return { ...draft, rows };
}

/* ---------------------------------- Print --------------------------------- */

/** What section 5 prints. */
export interface ReportPlanContent {
  items: readonly ReportPlanItem[];
  note?: string;
}

/** Printed content of a draft (WYSIWYG for the editor): rows with content, trimmed; the note when not blank. */
export function planContentOf(draft: PlanDraft): ReportPlanContent {
  const note = draft.note.trim();
  return { items: planItemsOf(draft).filter((i) => i.content), ...(note ? { note } : {}) };
}

/** Printed content of a stored plan (null → nothing). */
export function savedPlanContent(plan: Pick<ReportPlan, "items" | "note"> | null | undefined): ReportPlanContent {
  return planContentOf(draftFromPlan(plan));
}

/** Text lines of a multi-line value (the print stylesheet resets white-space, so line breaks are rendered as <br>). */
export function textLines(text: string): string[] {
  return text.split(/\r?\n/);
}
