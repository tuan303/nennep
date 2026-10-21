import { describe, expect, it } from "vitest";
import {
  ApiClientError,
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  UserFacingError,
  codeForStatus,
  errorFromResponse,
  errorMessage,
  fallbackMessageForStatus,
  fieldErrors,
  isAbortError,
  isApiErrorBody,
  networkError,
  validationIssues,
} from "../api-errors";

describe("ApiClientError", () => {
  it("carries status, code, message and details", () => {
    const err = new ApiClientError(400, "VALIDATION", "Thiếu lớp", [{ path: "classCode", message: "Thiếu lớp" }]);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(UserFacingError);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.name).toBe("ApiClientError");
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION");
    expect(err.message).toBe("Thiếu lớp");
    expect(err.details).toEqual([{ path: "classCode", message: "Thiếu lớp" }]);
  });
  it("omits details when not given", () => {
    expect("details" in new ApiClientError(404, "NOT_FOUND", "x")).toBe(false);
  });
});

describe("isApiErrorBody", () => {
  it("recognises the documented envelope only", () => {
    expect(isApiErrorBody({ error: { code: "FORBIDDEN", message: "Không có quyền" } })).toBe(true);
    expect(isApiErrorBody({ error: { code: "FORBIDDEN" } })).toBe(false);
    expect(isApiErrorBody({ error: "boom" })).toBe(false);
    expect(isApiErrorBody({ message: "x" })).toBe(false);
    expect(isApiErrorBody(null)).toBe(false);
    expect(isApiErrorBody("<html>")).toBe(false);
    expect(isApiErrorBody([])).toBe(false);
  });
});

describe("errorFromResponse", () => {
  it("uses the server's Vietnamese message, code and details", () => {
    const details = [{ path: "studentIds", message: "Chọn ít nhất 1 học sinh" }];
    const err = errorFromResponse(400, { error: { code: "VALIDATION", message: "Dữ liệu không hợp lệ", details } });
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION");
    expect(err.message).toBe("Dữ liệu không hợp lệ");
    expect(err.details).toEqual(details);
  });

  it("keeps the server message but derives the code from the status when the code is unknown", () => {
    const err = errorFromResponse(409, { error: { code: "SOMETHING_ELSE", message: "Mã đã tồn tại" } });
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("Mã đã tồn tại");
  });

  it("falls back to a status message when the server message is blank", () => {
    const err = errorFromResponse(403, { error: { code: "FORBIDDEN", message: "   " } });
    expect(err.message).toBe(fallbackMessageForStatus(403));
  });

  it("maps responses without an error envelope by status", () => {
    expect(errorFromResponse(401, undefined)).toMatchObject({ status: 401, code: "UNAUTHENTICATED", message: SESSION_EXPIRED_MESSAGE });
    expect(errorFromResponse(403, "nope")).toMatchObject({ code: "FORBIDDEN", message: "Bạn không có quyền thực hiện thao tác này." });
    expect(errorFromResponse(404, {})).toMatchObject({ code: "NOT_FOUND", message: "Không tìm thấy dữ liệu yêu cầu." });
    expect(errorFromResponse(413, undefined)).toMatchObject({ code: "VALIDATION" });
    expect(errorFromResponse(429, undefined)).toMatchObject({ code: "RATE_LIMITED" });
    expect(errorFromResponse(500, "<html>Internal</html>")).toMatchObject({
      code: "INTERNAL",
      message: "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.",
    });
    expect(errorFromResponse(504, undefined).message).toBe("Máy chủ phản hồi quá lâu. Vui lòng thử lại.");
    expect(errorFromResponse(418, undefined)).toMatchObject({ code: "INTERNAL", message: GENERIC_ERROR_MESSAGE });
  });
});

describe("codeForStatus / fallbackMessageForStatus", () => {
  it.each([
    [0, "NETWORK"],
    [400, "VALIDATION"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [429, "RATE_LIMITED"],
    [500, "INTERNAL"],
    [503, "INTERNAL"],
  ])("status %i → %s", (status, code) => {
    expect(codeForStatus(status)).toBe(code);
  });

  it("returns Vietnamese text for every status", () => {
    for (const s of [0, 400, 401, 403, 404, 409, 413, 429, 500, 502, 503, 504, 418]) {
      expect(fallbackMessageForStatus(s).length).toBeGreaterThan(10);
    }
    expect(fallbackMessageForStatus(0)).toBe(NETWORK_ERROR_MESSAGE);
  });
});

describe("networkError", () => {
  it("is status 0 / NETWORK with the friendly message", () => {
    const err = networkError(new TypeError("Failed to fetch"));
    expect(err.status).toBe(0);
    expect(err.code).toBe("NETWORK");
    expect(err.message).toBe("Không kết nối được máy chủ. Vui lòng thử lại.");
    expect(err.details).toEqual({ cause: "TypeError: Failed to fetch" });
  });
});

describe("isAbortError", () => {
  it("detects AbortError from fetch / AbortController", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isAbortError(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true);
    expect(isAbortError(new Error("x"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe("errorMessage", () => {
  it("shows user-facing messages and hides internal ones", () => {
    expect(errorMessage(new ApiClientError(400, "VALIDATION", "Thiếu lớp"))).toBe("Thiếu lớp");
    expect(errorMessage(new UserFacingError("Ảnh quá lớn"))).toBe("Ảnh quá lớn");
    expect(errorMessage(new Error("TypeError: x is undefined"))).toBe(GENERIC_ERROR_MESSAGE);
    expect(errorMessage("boom")).toBe(GENERIC_ERROR_MESSAGE);
    expect(errorMessage(undefined, "Không lưu được.")).toBe("Không lưu được.");
  });
});

describe("validationIssues / fieldErrors", () => {
  const err = new ApiClientError(400, "VALIDATION", "Dữ liệu không hợp lệ", [
    { path: "classCode", message: "Thiếu lớp" },
    { path: ["studentIds", 0], message: "Mã HS không hợp lệ" },
    { path: "studentIds.1", message: "Trùng học sinh" },
    { message: "Cần nhập phản hồi hoặc trạng thái" },
    { path: "x" },
    "junk",
  ]);

  it("normalises paths and skips malformed items", () => {
    expect(validationIssues(err)).toEqual([
      { path: "classCode", message: "Thiếu lớp" },
      { path: "studentIds.0", message: "Mã HS không hợp lệ" },
      { path: "studentIds.1", message: "Trùng học sinh" },
      { path: "", message: "Cần nhập phản hồi hoặc trạng thái" },
    ]);
  });

  it("keeps the first message per top-level field", () => {
    expect(fieldErrors(err)).toEqual({
      classCode: "Thiếu lớp",
      studentIds: "Mã HS không hợp lệ",
      "": "Cần nhập phản hồi hoặc trạng thái",
    });
  });

  it("returns nothing for other errors", () => {
    expect(validationIssues(new Error("x"))).toEqual([]);
    expect(validationIssues(new ApiClientError(400, "VALIDATION", "x", { not: "an array" }))).toEqual([]);
    expect(fieldErrors(undefined)).toEqual({});
  });
});
