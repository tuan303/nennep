/**
 * Mail policies (pure): retry backoff of the outbox and which record changes are worth a GVCN notice.
 *
 * A notice for an EDIT is sent only when a score-relevant field changed:
 * - incident: date, classCode, errorCode, points, students, unnamedCount, occurrenceCount, scope;
 * - reward: date, classCode, points, status – the status only when it moves the reward in or out of the counted
 *   statuses (config.rewardCountedStatuses), e.g. "Mới ghi nhận" → "Đang xác minh" is not relevant.
 */
import type { Incident, Reward, RewardStatus } from "../types";

/** Wait before attempt n + 1 after n failed attempts: 1 min, 5 min, 30 min, 2 h, then 12 h. */
export const MAIL_RETRY_DELAYS_MS: readonly number[] = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];

/** Backoff after a retryable error; `attempts` = attempts made so far (≥ 1 once a job was claimed). */
export function nextAttemptDelayMs(attempts: number): number {
  const i = Math.min(Math.max(Math.floor(attempts), 1), MAIL_RETRY_DELAYS_MS.length) - 1;
  return MAIL_RETRY_DELAYS_MS[i];
}

export type NoticeRecordKind = "incident" | "reward";

export const NOTICE_FIELDS = {
  incident: ["date", "classCode", "errorCode", "points", "students", "unnamedCount", "occurrenceCount", "scope"],
  reward: ["date", "classCode", "points", "status"],
} as const satisfies { incident: ReadonlyArray<keyof Incident>; reward: ReadonlyArray<keyof Reward> };

export type IncidentNoticeField = (typeof NOTICE_FIELDS.incident)[number];
export type RewardNoticeField = (typeof NOTICE_FIELDS.reward)[number];
export type NoticeField<K extends NoticeRecordKind> = K extends "incident" ? IncidentNoticeField : RewardNoticeField;

/** Vietnamese labels of the change list of an UPDATED notice ("Đã thay đổi: Ngày, Học sinh"). */
export const NOTICE_FIELD_LABELS: { incident: Record<IncidentNoticeField, string>; reward: Record<RewardNoticeField, string> } = {
  incident: {
    date: "Ngày",
    classCode: "Lớp",
    errorCode: "Lỗi vi phạm",
    points: "Điểm trừ",
    students: "Học sinh",
    unnamedCount: "Số HS chưa rõ tên",
    occurrenceCount: "Số lần vi phạm",
    scope: "Phạm vi",
  },
  reward: {
    date: "Ngày",
    classCode: "Lớp",
    points: "Điểm thưởng",
    status: "Trạng thái (tính vào thi đua)",
  },
};

function isNoticeField<K extends NoticeRecordKind>(kind: K, field: string): field is NoticeField<K> {
  return (NOTICE_FIELDS[kind] as readonly string[]).includes(field);
}

/** The score-relevant fields among `fields`, in NOTICE_FIELDS order (unknown names are ignored). */
export function noticeRelevantFields<K extends NoticeRecordKind>(kind: K, fields: readonly string[]): NoticeField<K>[] {
  const set = new Set(fields);
  return (NOTICE_FIELDS[kind] as readonly string[]).filter((f): f is NoticeField<K> => set.has(f) && isNoticeField(kind, f));
}

/**
 * True when an edit changing `fields` deserves a notice. For rewards pass "status" only when the counted state
 * changed (see rewardNoticeFields, which does that).
 */
export function isNoticeRelevantChange(kind: NoticeRecordKind, fields: readonly string[]): boolean {
  return noticeRelevantFields(kind, fields).length > 0;
}

/** Vietnamese labels of the relevant fields among `fields` (NoticePayload.changes). */
export function noticeChangeLabels(kind: NoticeRecordKind, fields: readonly string[]): string[] {
  const labels: Record<string, string> = NOTICE_FIELD_LABELS[kind];
  return noticeRelevantFields(kind, fields).map((f) => labels[f]);
}

/** Fields of an incident the notice diff reads. */
export type IncidentNoticeView = Pick<Incident, IncidentNoticeField>;
/** Fields of a reward the notice diff reads. */
export type RewardNoticeView = Pick<Reward, RewardNoticeField>;

const sameStudents = (a: IncidentNoticeView["students"], b: IncidentNoticeView["students"]): boolean => {
  const ids = (list: IncidentNoticeView["students"]) => list.map((s) => s.id).sort().join("\n");
  return ids(a) === ids(b);
};

/** Score-relevant fields that differ between two versions of an incident (students compared by id, order ignored). */
export function incidentNoticeFields(before: IncidentNoticeView, after: IncidentNoticeView): IncidentNoticeField[] {
  return NOTICE_FIELDS.incident.filter((f) => (f === "students" ? !sameStudents(before.students, after.students) : before[f] !== after[f]));
}

export function isRewardCounted(status: RewardStatus, countedStatuses: readonly RewardStatus[]): boolean {
  return countedStatuses.includes(status);
}

/** Score-relevant fields that differ between two versions of a reward ("status" only when counted ⇄ not counted). */
export function rewardNoticeFields(before: RewardNoticeView, after: RewardNoticeView, countedStatuses: readonly RewardStatus[]): RewardNoticeField[] {
  return NOTICE_FIELDS.reward.filter((f) =>
    f === "status" ? isRewardCounted(before.status, countedStatuses) !== isRewardCounted(after.status, countedStatuses) : before[f] !== after[f],
  );
}
