/**
 * Reward (điểm thưởng) form state, client-side checks mirroring the server, and API payloads. Pure – unit-tested.
 */
import { createDraftMemory, draftPrefix, sameList, typedLinks } from "@/components/entry/lib/leave-guard";
import { checkEvidenceLinks } from "@/components/entry/lib/links";
import type { RewardCreateInput, RewardUpdateInput } from "@/lib/contract";
import { REWARD_STATUSES } from "@/lib/constants";
import { isIsoDate } from "@/lib/engine/dates";
import { calendarDateProblem } from "@/lib/engine/period";
import type { LevelDataset, LevelId, Reward, RewardStatus } from "@/lib/types";

export const REWARD_POINTS_MIN = 1;
export const REWARD_POINTS_MAX = 100;
export const REWARD_POINT_PRESETS = [2, 5, 10] as const;
export const DEFAULT_REWARD_POINTS = 5;
export const VERIFIED_REWARD_STATUS: RewardStatus = "Đã xác nhận";

/** Quick suggestions for "Nội dung thưởng". */
export const REWARD_REASON_SUGGESTIONS = [
  "Đạt giải phong trào",
  "Lớp sạch đẹp tiêu biểu",
  "Hoạt động tập thể xuất sắc",
  "Tích cực tham gia hoạt động của trường",
  "Có việc làm tốt được ghi nhận",
] as const;

export const REWARD_MSG = {
  noDate: "Chọn ngày ghi nhận.",
  futureDate: "Không thể ghi nhận điểm thưởng ở ngày trong tương lai.",
  noClass: "Chọn lớp được thưởng.",
  reason: "Nhập nội dung thưởng (tối thiểu 3 ký tự).",
  reasonTooLong: "Nội dung thưởng tối đa 500 ký tự.",
  points: `Điểm thưởng phải lớn hơn 0 và không quá ${REWARD_POINTS_MAX}.`,
  verifyOnly: "Chỉ quản trị viên được chuyển điểm thưởng sang trạng thái “Đã xác nhận”.",
} as const;

export interface RewardForm {
  date: string;
  classCode: string;
  reason: string;
  points: number;
  reporter: string;
  note: string;
  status: RewardStatus;
  photoIds: string[];
  links: string[];
}

export function newRewardForm(args: { today: string; reporter?: string; classCode?: string }): RewardForm {
  return {
    date: args.today,
    classCode: args.classCode ?? "",
    reason: "",
    points: DEFAULT_REWARD_POINTS,
    reporter: args.reporter ?? "",
    note: "",
    status: "Mới ghi nhận",
    photoIds: [],
    links: [],
  };
}

export function rewardFormFromReward(r: Reward): RewardForm {
  return {
    date: r.date,
    classCode: r.classCode,
    reason: r.reason,
    points: r.points,
    reporter: r.reporter ?? "",
    note: r.note ?? "",
    status: r.status,
    photoIds: [...r.photoIds],
    links: [...r.evidenceUrls],
  };
}

/** Tap on a suggestion chip: fills an empty reason, otherwise prefixes it once ("Đạt giải phong trào – Hội khỏe Phù Đổng"). */
export function applyReasonSuggestion(reason: string, suggestion: string): string {
  const current = reason.trim();
  if (!current) return suggestion;
  if (current.toLocaleLowerCase("vi").startsWith(suggestion.toLocaleLowerCase("vi"))) return reason;
  return `${suggestion} – ${current}`;
}

/** Statuses the user may pick: EDITOR "Mới ghi nhận"/"Đang xác minh"; reward.verify (ADMIN) all three. */
export function rewardStatusOptions(canVerify: boolean): RewardStatus[] {
  return canVerify ? [...REWARD_STATUSES] : REWARD_STATUSES.filter((s) => s !== VERIFIED_REWARD_STATUS);
}

/**
 * Checks done by the server (date inside the school-week calendar, active class, points, reason, status permission,
 * links), so the save button can be disabled with a clear reason. On edit, an unchanged class that was deactivated
 * since, or an unchanged date, does not block saving.
 */
export function validateRewardForm(
  form: RewardForm,
  ds: Pick<LevelDataset, "classes" | "weeks">,
  today: string,
  opts: { canVerify: boolean; original?: Pick<Reward, "classCode" | "status"> & { date?: string } },
): string[] {
  const errors: string[] = [];
  if (!form.date) errors.push(REWARD_MSG.noDate);
  else if (!isIsoDate(form.date)) errors.push("Ngày không hợp lệ.");
  else if (form.date > today) errors.push(REWARD_MSG.futureDate);
  else if (opts.original?.date !== form.date) {
    const outside = calendarDateProblem(form.date, ds.weeks);
    if (outside) errors.push(outside);
  }

  if (!form.classCode) errors.push(REWARD_MSG.noClass);
  else {
    const cls = ds.classes.find((c) => c.code === form.classCode);
    const unchanged = opts.original?.classCode === form.classCode;
    if (!cls && !unchanged) errors.push(`Lớp "${form.classCode}" không có trong danh mục.`);
    else if (cls && !cls.active && !unchanged) errors.push(`Lớp ${cls.code} đã ngừng hoạt động.`);
  }

  const reason = form.reason.trim();
  if (reason.length < 3) errors.push(REWARD_MSG.reason);
  else if (reason.length > 500) errors.push(REWARD_MSG.reasonTooLong);

  if (!(form.points > 0) || form.points > REWARD_POINTS_MAX) errors.push(REWARD_MSG.points);

  const statusChanged = form.status !== (opts.original?.status ?? undefined);
  const touchesVerified = form.status === VERIFIED_REWARD_STATUS || opts.original?.status === VERIFIED_REWARD_STATUS;
  if (!opts.canVerify && statusChanged && touchesVerified) errors.push(REWARD_MSG.verifyOnly);

  errors.push(...checkEvidenceLinks(form.links).errors);
  return errors;
}

/** POST /api/rewards body without the idempotency key (empty reporter → the server uses the creator's name). */
export function toRewardCreateInput(levelId: LevelId, form: RewardForm): Omit<RewardCreateInput, "clientRequestId"> {
  const input: Omit<RewardCreateInput, "clientRequestId"> = {
    levelId,
    date: form.date,
    classCode: form.classCode,
    points: form.points,
    reason: form.reason.trim(),
    evidenceUrls: checkEvidenceLinks(form.links).urls,
    photoIds: [...form.photoIds],
    status: form.status,
  };
  const reporter = form.reporter.trim();
  const note = form.note.trim();
  if (reporter) input.reporter = reporter;
  if (note) input.note = note;
  return input;
}

/**
 * PATCH /api/rewards/:id body (an empty note clears it), with `baseRev` = the revision the form was opened from (409
 * when changed meanwhile). The status is only sent when the user changed it (never reverts a verification made
 * while the form was open).
 */
export function toRewardUpdateInput(form: RewardForm, original: Pick<Reward, "status" | "rev">): RewardUpdateInput {
  return {
    date: form.date,
    classCode: form.classCode,
    points: form.points,
    reason: form.reason.trim(),
    reporter: form.reporter.trim(),
    note: form.note.trim(),
    evidenceUrls: checkEvidenceLinks(form.links).urls,
    photoIds: [...form.photoIds],
    ...(form.status !== original.status ? { status: form.status } : {}),
    baseRev: original.rev ?? 0,
  };
}

/** The create form holds input that would be lost by leaving (compared to the blank form it started from). */
export function rewardFormDirty(form: RewardForm, baseline: RewardForm): boolean {
  return (
    form.date !== baseline.date ||
    form.classCode !== baseline.classCode ||
    form.reason.trim() !== baseline.reason.trim() ||
    form.points !== baseline.points ||
    form.reporter.trim() !== baseline.reporter.trim() ||
    form.note.trim() !== baseline.note.trim() ||
    form.status !== baseline.status ||
    !sameList(form.photoIds, baseline.photoIds) ||
    !sameList(typedLinks(form.links), typedLinks(baseline.links))
  );
}

/** Unfinished "Ghi điểm thưởng" forms of this tab (in memory only). */
export const rewardDrafts = createDraftMemory<RewardForm>();

/** Draft key of the create form of a level; undefined while signed out. */
export function rewardDraftKey(uid: string | undefined, levelId: string): string | undefined {
  return uid ? `${draftPrefix(uid, levelId)}reward:new` : undefined;
}
