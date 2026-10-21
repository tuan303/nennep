/**
 * Who may open an incident in the edit form (pure – unit-tested). Same rule as the server and the
 * IncidentDetailSheet: ADMIN any record; EDITOR own records within EDITOR_EDIT_WINDOW_HOURS.
 */
import { canEditIncident, editWindowRemainingMs, isTimeLimitedEdit, type AccessProfile } from "@/components/app/widgets/lib/incident-access";
import { EDITOR_EDIT_WINDOW_HOURS, LEVEL_IDS, hasPermission } from "@/lib/constants";
import type { Incident, LevelId } from "@/lib/types";

export type EditAccess = { ok: true; timeLimited: boolean; remainingMs: number } | { ok: false; reason: string };

type EditableRecord = Pick<Incident, "levelId" | "classCode" | "createdBy" | "createdAt" | "deletedAt">;

export function entryEditAccess(profile: AccessProfile | null | undefined, record: EditableRecord, nowMs: number): EditAccess {
  if (record.deletedAt) return { ok: false, reason: "Sự việc đã bị xóa nên không thể sửa." };
  if (canEditIncident(profile, record, nowMs)) {
    const timeLimited = isTimeLimitedEdit(profile);
    return { ok: true, timeLimited, remainingMs: timeLimited ? editWindowRemainingMs(record, nowMs) : Number.POSITIVE_INFINITY };
  }
  if (!profile || !hasPermission(profile, "record.editOwnRecent")) {
    return { ok: false, reason: "Tài khoản của thầy/cô không có quyền sửa sự việc." };
  }
  if (record.createdBy !== profile.uid) {
    return { ok: false, reason: "Thầy/cô chỉ được sửa sự việc do chính mình ghi nhận. Vui lòng liên hệ Quản trị nếu cần điều chỉnh." };
  }
  return {
    ok: false,
    reason: `Đã quá ${EDITOR_EDIT_WINDOW_HOURS} giờ kể từ khi ghi nhận nên không thể sửa. Vui lòng liên hệ Quản trị nếu cần điều chỉnh.`,
  };
}

/** Level of a record doc id such as "THCS_NN-20261021-0003" (undefined when the prefix is unknown). */
export function levelOfRecordId(id: string): LevelId | undefined {
  const prefix = id.split("_", 1)[0];
  return (LEVEL_IDS as string[]).includes(prefix) ? (prefix as LevelId) : undefined;
}
