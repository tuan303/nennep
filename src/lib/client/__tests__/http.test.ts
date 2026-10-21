import { describe, expect, it, vi } from "vitest";
import { buildUrl, onSessionRejected, readError, seg } from "../http";

describe("buildUrl", () => {
  it("appends defined query values only", () => {
    expect(buildUrl("/api/rankings", { level: "THCS", mode: "week", key: "2026-10-19", classCode: undefined })).toBe(
      "/api/rankings?level=THCS&mode=week&key=2026-10-19",
    );
    expect(buildUrl("/api/incidents", { level: "TH", deleted: 1, x: null, y: "" })).toBe("/api/incidents?level=TH&deleted=1");
    expect(buildUrl("/api/me")).toBe("/api/me");
    expect(buildUrl("/api/me", {})).toBe("/api/me");
  });
  it("encodes values and extends existing query strings", () => {
    expect(buildUrl("/api/audit-logs", { email: "a+b@x.vn", action: "LOGIN" })).toBe("/api/audit-logs?email=a%2Bb%40x.vn&action=LOGIN");
    expect(buildUrl("/api/x?a=1", { b: true })).toBe("/api/x?a=1&b=true");
  });
});

describe("seg", () => {
  it("encodes a path segment", () => {
    expect(seg("THCS_NN-20261021-0001")).toBe("THCS_NN-20261021-0001");
    expect(seg("a/b c")).toBe("a%2Fb%20c");
  });
});

describe("onSessionRejected", () => {
  const body = (message: string) => JSON.stringify({ error: { code: "UNAUTHENTICATED", message } });

  it("reports a server 401 (revoked session) to the listeners, not other errors", async () => {
    const seen = vi.fn();
    const stop = onSessionRejected(seen);
    const revoked = "Phiên đăng nhập đã bị thu hồi (mật khẩu vừa được đặt lại hoặc tài khoản vừa được bảo vệ lại). Vui lòng đăng nhập lại.";
    const err = await readError(new Response(body(revoked), { status: 401 }));
    expect(err).toMatchObject({ status: 401, code: "UNAUTHENTICATED", message: revoked });
    expect(seen).toHaveBeenCalledWith(err);

    await readError(new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "x" } }), { status: 403 }));
    expect(seen).toHaveBeenCalledTimes(1);

    stop();
    await readError(new Response(body(revoked), { status: 401 }));
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
