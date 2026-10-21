/**
 * Argument handling of `npm run create-admin` (pure, unit-tested).
 *
 *   npm run create-admin -- <email> "<Họ tên>" [--env <file>]
 *
 * The password is NEVER taken from the command line (it would stay in the shell history and the process list):
 * it comes from the ADMIN_PASSWORD environment variable, a hidden prompt, or is generated and printed once.
 */
import { EMAIL_RE } from "../../src/lib/server/admin/common";

export const CREATE_ADMIN_USAGE = 'Cách dùng: npm run create-admin -- <email> "<Họ tên>" [--env .env.production.local]';

export const LEGACY_PASSWORD_ARG_MESSAGE =
  "Không truyền mật khẩu trên dòng lệnh nữa (mật khẩu sẽ nằm lại trong lịch sử lệnh). " +
  "Bỏ mật khẩu khỏi lệnh: công cụ sẽ hỏi mật khẩu (ẩn ký tự) hoặc tự tạo mật khẩu tạm.";

export interface CreateAdminArgs {
  email: string;
  name: string;
  envFile: string;
}

/**
 * A name word that looks like a password (digits or symbols, no letters-only Vietnamese word): the operator is
 * still using the old `<email> <password> "<Họ tên>"` form.
 */
function looksLikePassword(word: string): boolean {
  return /\d/.test(word) || /[!@#$%^&*()_+=[\]{};:'"\\|,.<>/?`~-]/.test(word);
}

export function parseCreateAdminArgs(argv: readonly string[]): { args?: CreateAdminArgs; errors: string[] } {
  const rest = [...argv];
  let envFile = ".env.local";
  const i = rest.indexOf("--env");
  if (i >= 0) {
    envFile = rest[i + 1] ?? "";
    rest.splice(i, 2);
  }
  const [rawEmail = "", ...nameParts] = rest;
  const email = rawEmail.trim().toLowerCase();
  const errors: string[] = [];
  if (!EMAIL_RE.test(email)) errors.push("Email không hợp lệ.");
  if (nameParts.length > 1 && !/\s/.test(nameParts[0]) && looksLikePassword(nameParts[0])) errors.push(LEGACY_PASSWORD_ARG_MESSAGE);
  const name = nameParts.join(" ").trim();
  if (name.length < 2) errors.push("Nhập họ tên (tối thiểu 2 ký tự).");
  if (!envFile) errors.push("Thiếu đường dẫn sau --env.");
  return errors.length > 0 ? { errors: [...errors, CREATE_ADMIN_USAGE] } : { args: { email, name, envFile }, errors: [] };
}

/** Password rules applied to ADMIN_PASSWORD / the typed password. Returns a Vietnamese error or "". */
export function passwordProblem(password: string): string {
  if (password.length < 8) return "Mật khẩu tối thiểu 8 ký tự.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Mật khẩu cần có cả chữ và số.";
  return "";
}
