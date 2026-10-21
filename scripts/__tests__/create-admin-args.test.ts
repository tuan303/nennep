/** SECURITY-12: create-admin never takes the password on the command line. */
import { describe, expect, it } from "vitest";
import { LEGACY_PASSWORD_ARG_MESSAGE, parseCreateAdminArgs, passwordProblem } from "../lib/create-admin-args";

describe("create-admin arguments", () => {
  it("parses <email> \"<Họ tên>\" [--env file]", () => {
    expect(parseCreateAdminArgs(["IT@Truong.edu.vn", "Quản", "trị", "NSHM", "--env", ".env.production.local"])).toEqual({
      args: { email: "it@truong.edu.vn", name: "Quản trị NSHM", envFile: ".env.production.local" },
      errors: [],
    });
    expect(parseCreateAdminArgs(["a@b.vn", "Quản trị NSHM"]).args?.envFile).toBe(".env.local");
  });

  it("refuses the old form that put the password on the command line", () => {
    const r = parseCreateAdminArgs(["it@truong.edu.vn", "MatKhauManh@2026", "Quản trị NSHM", "--env", ".env.production.local"]);
    expect(r.args).toBeUndefined();
    expect(r.errors).toContain(LEGACY_PASSWORD_ARG_MESSAGE);
  });

  it("validates the e-mail, the name and the password rules", () => {
    expect(parseCreateAdminArgs(["khong-phai-email", "Tên"]).errors[0]).toBe("Email không hợp lệ.");
    expect(parseCreateAdminArgs(["a@b.vn"]).errors).toContain("Nhập họ tên (tối thiểu 2 ký tự).");
    expect(passwordProblem("ngan1")).toBe("Mật khẩu tối thiểu 8 ký tự.");
    expect(passwordProblem("chiCoChuThoi")).toBe("Mật khẩu cần có cả chữ và số.");
    expect(passwordProblem("Manh@2026x")).toBe("");
  });
});
