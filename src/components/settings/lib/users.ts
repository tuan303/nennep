/** "Người dùng" view-model: filtering, labels, form drafts → API inputs, self/last-admin guards, bulk GVCN results. */
import type { BulkGvcnResult, UserCreateInput, UserUpdateInput } from "@/lib/contract";
import { LEVEL_IDS, LEVELS, ROLE_LABELS, ROLES } from "@/lib/constants";
import { compareVN, matchesSearch, naturalCompare } from "@/lib/engine/text";
import type { GvcnClassRef, LevelId, Role, UserProfile } from "@/lib/types";
import { EMAIL_PATTERN, sameValue } from "./draft";

export type UserStatusFilter = "active" | "locked";

export interface UserFilter {
  query?: string;
  role?: Role;
  status?: UserStatusFilter;
}

export function filterUsers(users: readonly UserProfile[], f: UserFilter): UserProfile[] {
  return users.filter((u) => {
    if (f.role && u.role !== f.role) return false;
    if (f.status === "active" && !u.active) return false;
    if (f.status === "locked" && u.active) return false;
    if (f.query && !matchesSearch(`${u.displayName} ${u.email} ${gvcnClassesText(u)}`, f.query)) return false;
    return true;
  });
}

/** Role order, then Vietnamese name order (same as the server list). */
export function sortUsers(users: readonly UserProfile[]): UserProfile[] {
  return [...users].sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || compareVN(a.displayName, b.displayName));
}

export function userStats(users: readonly UserProfile[]): { total: number; active: number; locked: number; byRole: Record<Role, number> } {
  const byRole = { ADMIN: 0, EDITOR: 0, VIEWER: 0, GVCN: 0 } as Record<Role, number>;
  let active = 0;
  for (const u of users) {
    byRole[u.role] += 1;
    if (u.active) active += 1;
  }
  return { total: users.length, active, locked: users.length - active, byRole };
}

export const ROLE_TONES: Record<Role, "brand" | "star" | "ok" | "muted"> = { ADMIN: "brand", EDITOR: "star", VIEWER: "muted", GVCN: "ok" };

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: "Toàn quyền: cấu hình, người dùng, nhập/xuất, xóa và khôi phục.",
  EDITOR: "Ghi nhận sự việc, điểm thưởng; sửa bản ghi của mình trong 24 giờ.",
  VIEWER: "Xem số liệu, xếp hạng và báo cáo (BGH, người theo dõi).",
  GVCN: "Xem chi tiết lớp chủ nhiệm, phản hồi sự việc của lớp mình.",
};

export const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export function sortGvcnClasses(list: readonly GvcnClassRef[]): GvcnClassRef[] {
  return [...list].sort((a, b) => LEVEL_IDS.indexOf(a.levelId) - LEVEL_IDS.indexOf(b.levelId) || naturalCompare(a.classCode, b.classCode));
}

/** "6A01, 7A02" (with the level when classes span several levels). */
export function gvcnClassesText(p: Pick<UserProfile, "gvcnClasses">): string {
  const list = sortGvcnClasses(p.gvcnClasses);
  const multi = new Set(list.map((c) => c.levelId)).size > 1;
  return list.map((c) => (multi ? `${c.classCode} (${LEVELS[c.levelId].short})` : c.classCode)).join(", ");
}

/* ------------------------------- form draft ------------------------------- */

export interface UserDraft {
  email: string;
  displayName: string;
  role: Role;
  levels: LevelId[];
  gvcnClasses: GvcnClassRef[];
  password: string;
  active: boolean;
}

export function emptyUserDraft(role: Role = "VIEWER"): UserDraft {
  return { email: "", displayName: "", role, levels: [], gvcnClasses: [], password: "", active: true };
}

export function draftFromProfile(p: UserProfile): UserDraft {
  return {
    email: p.email,
    displayName: p.displayName,
    role: p.role,
    levels: LEVEL_IDS.filter((l) => p.levels.includes(l)),
    gvcnClasses: sortGvcnClasses(p.gvcnClasses),
    password: "",
    active: p.active,
  };
}

export type UserField = "email" | "displayName" | "role" | "levels" | "gvcnClasses" | "password" | "active";

export function validateUserDraft(d: UserDraft, mode: "create" | "edit"): Partial<Record<UserField, string>> {
  const e: Partial<Record<UserField, string>> = {};
  if (mode === "create") {
    const email = d.email.trim();
    if (!email) e.email = "Nhập email đăng nhập.";
    else if (!EMAIL_PATTERN.test(email)) e.email = "Email không hợp lệ.";
    if (d.password && d.password.length < 8) e.password = "Mật khẩu tối thiểu 8 ký tự.";
    else if (d.password.length > 128) e.password = "Mật khẩu tối đa 128 ký tự.";
  }
  const name = d.displayName.trim();
  if (name.length < 2) e.displayName = "Nhập họ tên (ít nhất 2 ký tự).";
  else if (name.length > 120) e.displayName = "Họ tên tối đa 120 ký tự.";
  if (d.role === "GVCN" && d.gvcnClasses.length === 0) e.gvcnClasses = "GVCN cần được gán ít nhất một lớp chủ nhiệm.";
  return e;
}

/** GVCN levels come from their classes; other roles do not keep homeroom classes. */
function assignment(d: UserDraft): Pick<UserDraft, "levels" | "gvcnClasses"> {
  if (d.role === "GVCN") {
    const classes = sortGvcnClasses(d.gvcnClasses);
    return { levels: LEVEL_IDS.filter((l) => classes.some((c) => c.levelId === l)), gvcnClasses: classes };
  }
  return { levels: LEVEL_IDS.filter((l) => d.levels.includes(l)), gvcnClasses: [] };
}

export function createInputFromDraft(d: UserDraft): UserCreateInput {
  const a = assignment(d);
  return {
    email: d.email.trim().toLowerCase(),
    displayName: d.displayName.trim(),
    role: d.role,
    levels: a.levels,
    gvcnClasses: a.gvcnClasses,
    ...(d.password ? { password: d.password } : {}),
  };
}

/** Only the changed fields (empty object = nothing to save). */
export function updatePatchFromDraft(d: UserDraft, p: UserProfile): UserUpdateInput {
  const a = assignment(d);
  const out: UserUpdateInput = {};
  if (d.displayName.trim() !== p.displayName) out.displayName = d.displayName.trim();
  if (d.role !== p.role) out.role = d.role;
  if (
    !sameValue(
      a.levels,
      LEVEL_IDS.filter((l) => p.levels.includes(l)),
    )
  )
    out.levels = a.levels;
  if (!sameValue(a.gvcnClasses, sortGvcnClasses(p.gvcnClasses))) out.gvcnClasses = a.gvcnClasses;
  if (d.active !== p.active) out.active = d.active;
  return out;
}

export const SELF_GUARD_MESSAGE = "Bạn không thể tự bỏ quyền quản trị hoặc tự khóa tài khoản của mình.";
export const SELF_SCOPE_MESSAGE = "Bạn không thể tự thay đổi cấp học của tài khoản mình.";
export const LAST_ADMIN_MESSAGE = "Đây là quản trị viên toàn trường cuối cùng đang hoạt động – không thể bỏ quyền, khóa hoặc giới hạn cấp học.";

/** Hint of the levels field for an ADMIN limited to some levels (SECURITY-4: those two permissions are school-wide). */
export const LEVEL_LIMITED_ADMIN_HINT =
  "Quản trị giới hạn cấp học không quản lý được tài khoản người dùng và không xem được Nhật ký – hai quyền này chỉ dành cho quản trị toàn trường (để trống cấp học).";

/** Active ADMIN without level restriction – the only profiles that manage accounts and read the audit log. */
export function isSchoolAdmin(p: Pick<UserProfile, "role" | "active" | "levels">): boolean {
  return p.role === "ADMIN" && p.active && p.levels.length === 0;
}

function sameLevels(a: readonly LevelId[], b: readonly LevelId[]): boolean {
  return a.length === b.length && a.every((l) => b.includes(l));
}

/**
 * Client-side mirror of the server rules: an admin cannot change their own role, levels or lock themselves, and the
 * last active school-wide admin cannot be demoted, locked or limited to some levels. `levels` omitted = unchanged.
 */
export function adminGuard(
  d: Pick<UserDraft, "role" | "active"> & { levels?: readonly LevelId[] },
  p: UserProfile,
  ctx: { currentUid?: string; users: readonly UserProfile[] },
): string | undefined {
  const levels = d.role === "GVCN" ? p.levels : (d.levels ?? p.levels);
  if (p.uid === ctx.currentUid) {
    if (d.role !== p.role || d.active !== p.active) return SELF_GUARD_MESSAGE;
    if (!sameLevels(levels, p.levels)) return SELF_SCOPE_MESSAGE;
    return undefined;
  }
  if (!isSchoolAdmin(p) || isSchoolAdmin({ role: d.role, active: d.active, levels: [...levels] })) return undefined;
  const others = ctx.users.filter((u) => u.uid !== p.uid && isSchoolAdmin(u)).length;
  return others === 0 ? LAST_ADMIN_MESSAGE : undefined;
}

/** Can the role/active controls of this profile be changed at all in the form? */
export function isProtectedAdmin(p: UserProfile, ctx: { currentUid?: string; users: readonly UserProfile[] }): boolean {
  return adminGuard({ role: "VIEWER", active: false }, p, ctx) !== undefined;
}

/* ------------------------------ bulk GVCN result ------------------------------ */

export function bulkResultCounts(r: BulkGvcnResult): { created: number; linked: number; skipped: number; unassigned: number } {
  return { created: r.created.length, linked: r.linkedExisting.length, skipped: r.skipped.length, unassigned: r.unassigned?.length ?? 0 };
}

/** Tab-separated text (pastes cleanly into Excel / Google Sheets). */
export function bulkCreatedText(r: BulkGvcnResult, levelName: string): string {
  const head = ["Lớp", "Họ tên", "Email", "Mật khẩu tạm"].join("\t");
  const lines = r.created.map((c) => [c.classCode, c.displayName, c.email, c.tempPassword].join("\t"));
  return [`Tài khoản GVCN mới – ${levelName}`, head, ...lines].join("\n");
}

export function bulkCreatedRows(r: BulkGvcnResult): Array<Record<string, string>> {
  return r.created.map((c) => ({ classCode: c.classCode, displayName: c.displayName, email: c.email, tempPassword: c.tempPassword }));
}

/** Plain-text message for one account (temporary password hand-over). */
export function credentialText(email: string, password: string, appUrl?: string): string {
  return [appUrl ? `Địa chỉ: ${appUrl}` : "", `Tài khoản: ${email}`, `Mật khẩu tạm: ${password}`, "Vui lòng đổi mật khẩu sau khi đăng nhập lần đầu."]
    .filter(Boolean)
    .join("\n");
}
