/**
 * "Có thể trùng" in the entry form (REQ_V2 §7.1, hạng mục 3): the same event recorded twice would count its penalty
 * twice. Matching is the engine's (`possibleDuplicatesOf`); this module shapes the draft, the texts and the payload.
 * Never blocks: the user confirms "Không trùng, vẫn lưu" and the create call carries `notDuplicateOf`. Pure – unit-tested.
 */
import type { IncidentCreateInput } from "@/lib/contract";
import { fmtTime } from "@/lib/client/format";
import { formatDayMonthVN, possibleDuplicatesOf, type DuplicateDraft } from "@/lib/engine";
import type { Incident } from "@/lib/types";
import type { EntryForm } from "./form-model";
import { createdDayVN, subjectSummary } from "./recent";
import type { RosterNames } from "./student-names";

/** The server accepts at most 20 ids in `notDuplicateOf`. */
export const NOT_DUPLICATE_MAX = 20;

/** Draft of the engine check; on edit the record itself (and pairs already reviewed with it) never match. */
export function entryDuplicateDraft(form: Pick<EntryForm, "date" | "classCode" | "errorCode" | "studentIds">, editing?: Pick<Incident, "id">): DuplicateDraft {
  const draft: DuplicateDraft = { date: form.date, classCode: form.classCode, errorCode: form.errorCode, studentIds: form.studentIds };
  if (editing) draft.excludeId = editing.id;
  return draft;
}

/** Existing incidents the form would duplicate, newest first ([] while date / class / error are incomplete). */
export function entryDuplicates(
  incidents: readonly Incident[],
  form: Pick<EntryForm, "date" | "classCode" | "errorCode" | "studentIds">,
  editing?: Pick<Incident, "id">,
): Incident[] {
  return possibleDuplicatesOf(incidents, entryDuplicateDraft(form, editing));
}

/** Who recorded it: "Người ghi" of the record, else the account that created it. */
export function recorderOf(i: Pick<Incident, "reporter" | "createdByName">): string {
  return i.reporter?.trim() || i.createdByName || "Không rõ người ghi";
}

/** "10:05" when recorded today, else "10:05 · 20/10" (time of recording, VN). */
export function recordedAtText(i: Pick<Incident, "createdAt">, today: string): string {
  const time = fmtTime(i.createdAt);
  const day = createdDayVN(i);
  if (!time) return "";
  return day && day !== today ? `${time} · ${formatDayMonthVN(day)}` : time;
}

/** "NN-20261020-0004 (Nguyễn Văn Quang, 10:05, Phạm Thiện Khôi)" – code, người ghi, giờ ghi, học sinh. */
export function duplicateLabel(i: Incident, today: string, roster?: RosterNames): string {
  const parts = [recorderOf(i), recordedAtText(i, today), subjectSummary(i, 2, roster)].filter(Boolean);
  return `${i.code} (${parts.join(", ")})`;
}

/** One-line notice: "Có thể trùng với NN-… (…)" or "Có thể trùng với 2 sự việc đã ghi: NN-… (…); NN-… (…)". */
export function duplicateNoticeText(list: readonly Incident[], today: string, roster?: RosterNames): string {
  if (list.length === 0) return "";
  const labels = list.map((i) => duplicateLabel(i, today, roster));
  return list.length === 1 ? `Có thể trùng với ${labels[0]}` : `Có thể trùng với ${list.length} sự việc đã ghi: ${labels.join("; ")}`;
}

/** Ids of the listed matches as the `notDuplicateOf` of a create ("Không trùng, vẫn lưu"): unique, sorted, ≤ 20. */
export function notDuplicateIds(list: readonly Pick<Incident, "id">[]): string[] {
  return [...new Set(list.map((i) => i.id))].sort().slice(0, NOT_DUPLICATE_MAX);
}

/** The create payload confirmed as not duplicating `ids` (unchanged when there is none). */
export function withNotDuplicate<T extends Omit<IncidentCreateInput, "clientRequestId">>(payload: T, ids: readonly string[]): T {
  if (ids.length === 0) return payload;
  return { ...payload, notDuplicateOf: [...ids] };
}
