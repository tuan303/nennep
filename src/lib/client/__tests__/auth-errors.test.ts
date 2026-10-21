import { describe, expect, it } from "vitest";
import { UserFacingError, errorMessage } from "../api-errors";
import {
  SessionError,
  TOO_MANY_ATTEMPTS_MESSAGE,
  WRONG_CREDENTIALS_MESSAGE,
  authErrorMessage,
  firebaseErrorCode,
  isSilentAuthError,
  isWrongCredentialsCode,
  shouldReportLoginFailure,
  toSessionError,
  validateNewPassword,
} from "../auth-errors";

const fbError = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

describe("firebaseErrorCode", () => {
  it("reads FirebaseError.code", () => {
    expect(firebaseErrorCode(fbError("auth/invalid-credential"))).toBe("auth/invalid-credential");
    expect(firebaseErrorCode({ code: "auth/too-many-requests" })).toBe("auth/too-many-requests");
  });
  it("returns 'unknown' otherwise", () => {
    expect(firebaseErrorCode(new Error("x"))).toBe("unknown");
    expect(firebaseErrorCode({ code: 42 })).toBe("unknown");
    expect(firebaseErrorCode(null)).toBe("unknown");
  });
});

describe("authErrorMessage", () => {
  it("maps every wrong-credentials code to one message (no account enumeration)", () => {
    for (const code of ["auth/invalid-credential", "auth/invalid-login-credentials", "auth/wrong-password", "auth/user-not-found"]) {
      expect(isWrongCredentialsCode(code)).toBe(true);
      expect(authErrorMessage(code)).toBe("Email hoặc mật khẩu không đúng.");
    }
    expect(WRONG_CREDENTIALS_MESSAGE).toBe("Email hoặc mật khẩu không đúng.");
  });

  it("explains temporary lockouts", () => {
    expect(authErrorMessage("auth/too-many-requests")).toBe("Tài khoản tạm khóa do đăng nhập sai nhiều lần, thử lại sau.");
    expect(TOO_MANY_ATTEMPTS_MESSAGE).toContain("tạm khóa");
  });

  it("covers common Firebase codes in Vietnamese", () => {
    expect(authErrorMessage("auth/invalid-email")).toBe("Email không hợp lệ.");
    expect(authErrorMessage("auth/user-disabled")).toContain("vô hiệu hóa");
    expect(authErrorMessage("auth/network-request-failed")).toContain("Không kết nối được máy chủ");
    expect(authErrorMessage("auth/popup-blocked", "provider")).toContain("chặn cửa sổ");
    expect(authErrorMessage("auth/account-exists-with-different-credential", "provider")).toContain("phương thức đăng nhập khác");
  });

  it("adapts messages to the password-change context", () => {
    expect(authErrorMessage("auth/invalid-credential", "changePassword")).toBe("Mật khẩu hiện tại không đúng.");
    expect(authErrorMessage("auth/wrong-password", "changePassword")).toBe("Mật khẩu hiện tại không đúng.");
    expect(authErrorMessage("auth/weak-password", "changePassword")).toContain("quá yếu");
    expect(authErrorMessage("auth/requires-recent-login", "changePassword")).toContain("đăng nhập lại");
    expect(authErrorMessage("auth/something-new", "changePassword")).toBe("Không đổi được mật khẩu. Vui lòng thử lại.");
  });

  it("has a generic fallback for unknown codes", () => {
    expect(authErrorMessage("auth/something-new")).toBe("Đăng nhập không thành công. Vui lòng thử lại.");
    expect(authErrorMessage("unknown")).toBe("Đăng nhập không thành công. Vui lòng thử lại.");
  });
});

describe("shouldReportLoginFailure", () => {
  it("reports wrong credentials, lockouts and disabled accounts only", () => {
    expect(shouldReportLoginFailure("auth/invalid-credential")).toBe(true);
    expect(shouldReportLoginFailure("auth/too-many-requests")).toBe(true);
    expect(shouldReportLoginFailure("auth/user-disabled")).toBe(true);
    expect(shouldReportLoginFailure("auth/network-request-failed")).toBe(false);
    expect(shouldReportLoginFailure("auth/invalid-email")).toBe(false);
  });
});

describe("toSessionError / isSilentAuthError", () => {
  it("wraps Firebase errors with code + Vietnamese message", () => {
    const err = toSessionError(fbError("auth/invalid-credential"), "login");
    expect(err).toBeInstanceOf(SessionError);
    expect(err).toBeInstanceOf(UserFacingError);
    expect(err.code).toBe("auth/invalid-credential");
    expect(err.message).toBe(WRONG_CREDENTIALS_MESSAGE);
    expect(errorMessage(err)).toBe(WRONG_CREDENTIALS_MESSAGE);
  });
  it("passes SessionError through unchanged", () => {
    const original = new SessionError("auth/missing-email", "Vui lòng nhập email.");
    expect(toSessionError(original, "login")).toBe(original);
  });
  it("flags dismissed popups as silent", () => {
    expect(isSilentAuthError(fbError("auth/popup-closed-by-user"))).toBe(true);
    expect(isSilentAuthError(toSessionError(fbError("auth/cancelled-popup-request"), "provider"))).toBe(true);
    expect(isSilentAuthError(fbError("auth/popup-blocked"))).toBe(false);
  });
});

describe("validateNewPassword", () => {
  it("validates before calling Firebase", () => {
    expect(validateNewPassword("", "abcdefgh1")).toBe("Vui lòng nhập mật khẩu hiện tại.");
    expect(validateNewPassword("old-pass1", "short")).toBe("Mật khẩu mới cần tối thiểu 8 ký tự.");
    expect(validateNewPassword("same-pass1", "same-pass1")).toBe("Mật khẩu mới phải khác mật khẩu hiện tại.");
    expect(validateNewPassword("old-pass1", "new-pass-2")).toBeUndefined();
  });
});
