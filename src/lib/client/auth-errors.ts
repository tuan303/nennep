/**
 * Firebase Auth error codes → Vietnamese messages (pure, unit-tested).
 * Used by session.tsx for login, provider sign-in and password change.
 */
import { UserFacingError } from "./api-errors";

export type AuthErrorContext = "login" | "provider" | "changePassword";

/** Error thrown by `useSession()` actions. `message` is Vietnamese; `code` is the Firebase code (e.g. "auth/invalid-credential"). */
export class SessionError extends UserFacingError {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SessionError";
    this.code = code;
  }
}

export const WRONG_CREDENTIALS_MESSAGE = "Email hoặc mật khẩu không đúng.";
export const TOO_MANY_ATTEMPTS_MESSAGE = "Tài khoản tạm khóa do đăng nhập sai nhiều lần, thử lại sau.";

const WRONG_CREDENTIAL_CODES: ReadonlySet<string> = new Set([
  "auth/invalid-credential",
  "auth/invalid-login-credentials",
  "auth/wrong-password",
  "auth/user-not-found",
  "auth/invalid-password",
]);

/** User dismissed the popup – UIs usually show nothing. */
const SILENT_CODES: ReadonlySet<string> = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
]);

/** Extract the Firebase error code (`FirebaseError.code`) from any thrown value; "unknown" otherwise. */
export function firebaseErrorCode(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err && typeof err.code === "string") return err.code;
  return "unknown";
}

export function isWrongCredentialsCode(code: string): boolean {
  return WRONG_CREDENTIAL_CODES.has(code);
}

/** Failed attempts worth recording in the audit log via `api.loginFailed`. */
export function shouldReportLoginFailure(code: string): boolean {
  return isWrongCredentialsCode(code) || code === "auth/too-many-requests" || code === "auth/user-disabled";
}

/** True for errors the UI should swallow silently (e.g. user closed the sign-in popup). */
export function isSilentAuthError(err: unknown): boolean {
  const code = err instanceof SessionError ? err.code : firebaseErrorCode(err);
  return SILENT_CODES.has(code);
}

export function authErrorMessage(code: string, context: AuthErrorContext = "login"): string {
  if (isWrongCredentialsCode(code)) {
    return context === "changePassword" ? "Mật khẩu hiện tại không đúng." : WRONG_CREDENTIALS_MESSAGE;
  }
  switch (code) {
    case "auth/too-many-requests":
      return context === "changePassword"
        ? "Bạn đã nhập sai nhiều lần. Vui lòng thử lại sau ít phút."
        : TOO_MANY_ATTEMPTS_MESSAGE;
    case "auth/invalid-email":
    case "auth/missing-email":
      return "Email không hợp lệ.";
    case "auth/missing-password":
      return "Vui lòng nhập mật khẩu.";
    case "auth/user-disabled":
      return "Tài khoản đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên.";
    case "auth/network-request-failed":
      return "Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.";
    case "auth/weak-password":
      return "Mật khẩu mới quá yếu. Vui lòng dùng tối thiểu 8 ký tự, gồm chữ và số.";
    case "auth/requires-recent-login":
    case "auth/user-token-expired":
      return "Phiên đăng nhập đã cũ. Vui lòng đăng xuất, đăng nhập lại rồi thử lại.";
    case "auth/user-mismatch":
      return "Thông tin xác thực không khớp với tài khoản đang đăng nhập.";
    case "auth/popup-closed-by-user":
    case "auth/user-cancelled":
      return "Bạn đã đóng cửa sổ đăng nhập.";
    case "auth/cancelled-popup-request":
      return "Đang mở một cửa sổ đăng nhập khác.";
    case "auth/popup-blocked":
      return "Trình duyệt đã chặn cửa sổ đăng nhập. Vui lòng cho phép cửa sổ bật lên rồi thử lại.";
    case "auth/account-exists-with-different-credential":
    case "auth/credential-already-in-use":
      return "Email này đã được đăng ký với phương thức đăng nhập khác. Vui lòng đăng nhập bằng email và mật khẩu.";
    case "auth/operation-not-allowed":
      return "Phương thức đăng nhập này chưa được bật. Vui lòng liên hệ quản trị viên.";
    case "auth/unauthorized-domain":
      return "Tên miền hiện tại chưa được phép đăng nhập. Vui lòng liên hệ quản trị viên.";
    case "auth/no-password-provider":
      return "Tài khoản đăng nhập bằng Google/Microsoft không dùng mật khẩu riêng của hệ thống.";
    case "auth/not-signed-in":
      return "Bạn chưa đăng nhập.";
    case "auth/same-password":
      return "Mật khẩu mới phải khác mật khẩu hiện tại.";
    default:
      if (context === "changePassword") return "Không đổi được mật khẩu. Vui lòng thử lại.";
      return "Đăng nhập không thành công. Vui lòng thử lại.";
  }
}

export const MIN_PASSWORD_LENGTH = 8;

/** Client-side checks before changing a password; returns a Vietnamese message or undefined when valid. */
export function validateNewPassword(current: string, next: string): string | undefined {
  if (!current) return "Vui lòng nhập mật khẩu hiện tại.";
  if (next.length < MIN_PASSWORD_LENGTH) return `Mật khẩu mới cần tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.`;
  if (next === current) return authErrorMessage("auth/same-password", "changePassword");
  return undefined;
}

/** Wrap any thrown Firebase error into a `SessionError` with a Vietnamese message. */
export function toSessionError(err: unknown, context: AuthErrorContext): SessionError {
  if (err instanceof SessionError) return err;
  const code = firebaseErrorCode(err);
  return new SessionError(code, authErrorMessage(code, context));
}
