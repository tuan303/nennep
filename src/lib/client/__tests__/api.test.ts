import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => {
  const user = { getIdToken: async (force?: boolean) => (force ? "fresh-token" : "cached-token") };
  return { currentUser: user as typeof user | null, authStateReady: async () => undefined };
});
vi.mock("../firebase-core", () => ({ getClientAuth: () => auth }));

import { ApiClientError, api } from "../api";

type FetchArgs = [input: string, init: RequestInit];
const fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

function lastCall(): { url: string; init: RequestInit; headers: Headers } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url, init, headers: new Headers(init.headers) };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  auth.currentUser = { getIdToken: async (force?: boolean) => (force ? "fresh-token" : "cached-token") };
});
afterEach(() => vi.unstubAllGlobals());

describe("request basics", () => {
  it("sends the Bearer token, JSON headers and no-store", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { profile: { uid: "u1" }, accessibleLevels: ["THCS"] }));
    const res = await api.me();
    expect(res.accessibleLevels).toEqual(["THCS"]);
    const { url, init, headers } = lastCall();
    expect(url).toBe("/api/me");
    expect(init.method).toBe("GET");
    expect(init.cache).toBe("no-store");
    expect(headers.get("Authorization")).toBe("Bearer cached-token");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("retries once with a refreshed token after 401", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: "UNAUTHENTICATED", message: "Hết hạn" } }));
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await expect(api.logout()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastCall().headers.get("Authorization")).toBe("Bearer fresh-token");
  });

  it("fails fast with 401 when nobody is signed in", async () => {
    auth.currentUser = null;
    await expect(api.me()).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps error envelopes to ApiClientError", async () => {
    const details = [{ path: "classCode", message: "Thiếu lớp" }];
    fetchMock.mockResolvedValueOnce(json(400, { error: { code: "VALIDATION", message: "Dữ liệu chưa hợp lệ", details } }));
    const err = await api.incidents
      .create({ levelId: "THCS", date: "2026-10-21", classCode: "", errorCode: "L01", scope: "Tập thể" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ status: 400, code: "VALIDATION", message: "Dữ liệu chưa hợp lệ", details });
    const { init, headers } = lastCall();
    expect(init.method).toBe("POST");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toMatchObject({ levelId: "THCS", errorCode: "L01" });
  });

  it("maps network failures and HTML error pages", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api.me()).rejects.toMatchObject({ status: 0, code: "NETWORK", message: "Không kết nối được máy chủ. Vui lòng thử lại." });
    fetchMock.mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(api.me()).rejects.toMatchObject({ status: 502, code: "INTERNAL", message: "Máy chủ đang bận. Vui lòng thử lại sau ít phút." });
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    await expect(api.me()).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("re-throws aborts untouched", async () => {
    const abort = new DOMException("aborted", "AbortError");
    fetchMock.mockRejectedValueOnce(abort);
    await expect(api.me()).rejects.toBe(abort);
  });
});

describe("endpoints", () => {
  it("dataset: conditional GET with If-None-Match → 304 / 200 + ETag", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    await expect(api.dataset("THCS", '"7"')).resolves.toEqual({ status: 304 });
    expect(lastCall().url).toBe("/api/dataset?level=THCS");
    expect(lastCall().headers.get("If-None-Match")).toBe('"7"');

    fetchMock.mockResolvedValueOnce(json(200, { levelId: "TH", version: 8 }, { ETag: '"8"' }));
    const res = await api.dataset("TH");
    expect(res).toMatchObject({ status: 200, etag: '"8"', dataset: { version: 8 } });
    expect(lastCall().headers.has("If-None-Match")).toBe(false);

    fetchMock.mockResolvedValueOnce(json(200, { levelId: "TH", version: 9 }));
    await expect(api.dataset("TH")).resolves.toMatchObject({ etag: '"9"' });

    fetchMock.mockResolvedValueOnce(json(403, { error: { code: "FORBIDDEN", message: "Không có quyền cấp học này" } }));
    await expect(api.dataset("THPT")).rejects.toMatchObject({ status: 403, message: "Không có quyền cấp học này" });
  });

  it("loginFailed is public (no token)", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await api.loginFailed("gv@nshm.edu.vn", "auth/invalid-credential");
    const { url, headers, init } = lastCall();
    expect(url).toBe("/api/auth/login-failed");
    expect(headers.has("Authorization")).toBe(false);
    expect(JSON.parse(String(init.body))).toEqual({ email: "gv@nshm.edu.vn", reason: "auth/invalid-credential" });
  });

  it("builds paths, methods and queries from the contract", async () => {
    fetchMock.mockImplementation(async () => json(200, { ok: true, items: [] }));
    await api.incidents.remove("THCS_NN-20261021-0001", "Ghi nhầm lớp");
    expect(lastCall().url).toBe("/api/incidents/THCS_NN-20261021-0001");
    expect(lastCall().init.method).toBe("DELETE");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ reason: "Ghi nhầm lớp" });

    await api.incidents.listDeleted("TH");
    expect(lastCall().url).toBe("/api/incidents?level=TH&deleted=1");
    await api.rewards.restore("TH_KT-1");
    expect(lastCall().url).toBe("/api/rewards/TH_KT-1/restore");
    expect(lastCall().init.method).toBe("POST");
    await api.rankings({ level: "THPT", mode: "month", key: "2026-10" });
    expect(lastCall().url).toBe("/api/rankings?level=THPT&mode=month&key=2026-10");
    await api.auditLogs({ action: "LOGIN", level: "TH", limit: 50 });
    expect(lastCall().url).toBe("/api/audit-logs?action=LOGIN&level=TH&limit=50");
    await api.settings.putWeeks("THCS", { regenerate: true });
    expect(lastCall().url).toBe("/api/settings/THCS/weeks");
    expect(lastCall().init.method).toBe("PUT");
    // Confirmed calendar change: a query parameter, never a body field.
    await api.settings.putWeeks("THCS", { regenerate: true }, { allowHidingRecords: true });
    expect(lastCall().url).toBe("/api/settings/THCS/weeks?allowHidingRecords=1");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ regenerate: true });
    await api.settings.putConfig("TH", { baseScorePerWeek: 100 }, { allowHidingRecords: false });
    expect(lastCall().url).toBe("/api/settings/TH/config");
    await api.students.promoteLevel("99050001", { toLevelId: "THCS", classCode: "6A01", date: "2026-10-21" });
    expect(lastCall().url).toBe("/api/students/99050001/promote-level");
    await api.admin.evidence({ levelId: "TH", dryRun: true });
    expect(lastCall().url).toBe("/api/admin/evidence");
    await api.users.resetPassword("uid/with/slash");
    expect(lastCall().url).toBe("/api/users/uid%2Fwith%2Fslash/reset-password");
    await api.students.transfer("99060001", { toClassCode: "6A02", effectiveDate: "2026-10-21" });
    expect(lastCall().url).toBe("/api/students/99060001/transfer");
    await api.admin.rebuildDigests();
    expect(JSON.parse(String(lastCall().init.body))).toEqual({});
    await api.health();
    expect(lastCall().headers.has("Authorization")).toBe(false);
  });

  it("v2 endpoints: not-duplicate, inspections, early warning, remediation", async () => {
    fetchMock.mockImplementation(async () => json(200, { ok: true, items: [] }));
    await api.incidents.notDuplicate("THCS_NN-20261021-0001", { otherIds: ["THCS_NN-20261021-0002"] });
    expect(lastCall().url).toBe("/api/incidents/THCS_NN-20261021-0001/not-duplicate");
    expect(lastCall().init.method).toBe("POST");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ otherIds: ["THCS_NN-20261021-0002"] });

    await api.incidents.feedback("THCS_NN-1", { remediation: "Nhắc nhở trước lớp", status: "Đang xử lý" });
    expect(lastCall().url).toBe("/api/incidents/THCS_NN-1/feedback");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ remediation: "Nhắc nhở trước lớp", status: "Đang xử lý" });

    await api.inspections.create({ levelId: "THCS", date: "2026-10-21", shift: "Sáng", classCodes: ["6A01", "6A02"], clientRequestId: "req-12345678" });
    expect(lastCall().url).toBe("/api/inspections");
    expect(lastCall().init.method).toBe("POST");
    expect(JSON.parse(String(lastCall().init.body))).toMatchObject({ levelId: "THCS", classCodes: ["6A01", "6A02"] });
    await api.inspections.update("THCS_DKT-20261021-001", { inspector: "Nguyễn Văn A", baseRev: 1 });
    expect(lastCall().url).toBe("/api/inspections/THCS_DKT-20261021-001");
    expect(lastCall().init.method).toBe("PATCH");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ inspector: "Nguyễn Văn A", baseRev: 1 });
    await api.inspections.remove("THCS_DKT-20261021-001", "Ghi nhầm ngày");
    expect(lastCall().url).toBe("/api/inspections/THCS_DKT-20261021-001");
    expect(lastCall().init.method).toBe("DELETE");
    expect(JSON.parse(String(lastCall().init.body))).toEqual({ reason: "Ghi nhầm ngày" });

    const ew = { risingPct: 50, risingMinPoints: 6, risingBaselineWeeks: 4, prolongedWeeks: 3, seriousGroups: ["Nhóm 3"], seriousMinPenalty: 10 };
    await api.settings.putEarlyWarning("TH", ew);
    expect(lastCall().url).toBe("/api/settings/TH/early-warning");
    expect(lastCall().init.method).toBe("PUT");
    expect(JSON.parse(String(lastCall().init.body))).toEqual(ew);
  });

  it("evidence.objectUrl fetches once per id and clearCache revokes", async () => {
    fetchMock.mockImplementation(async () => new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), { status: 200 }));
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const [a, b] = await Promise.all([api.evidence.objectUrl("ev1"), api.evidence.objectUrl("ev1")]);
    expect(a).toBe(b);
    expect(a.startsWith("blob:")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastCall().url).toBe("/api/evidence/ev1");
    api.evidence.clearCache();
    expect(revoke).toHaveBeenCalledWith(a);
    await api.evidence.objectUrl("ev1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    api.evidence.clearCache();
  });

  it("evidence.objectUrl does not cache failures", async () => {
    fetchMock.mockResolvedValueOnce(json(404, { error: { code: "NOT_FOUND", message: "Không tìm thấy ảnh" } }));
    await expect(api.evidence.objectUrl("missing")).rejects.toMatchObject({ status: 404 });
    fetchMock.mockResolvedValueOnce(new Response(new Blob(["x"]), { status: 200 }));
    await expect(api.evidence.objectUrl("missing")).resolves.toMatch(/^blob:/);
    api.evidence.clearCache();
  });
});
