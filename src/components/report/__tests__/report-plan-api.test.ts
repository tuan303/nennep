/** api.reportPlans: paths, query and body of GET / PUT /api/report-plans (fetch mocked, signed-in user stubbed). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ currentUser: { getIdToken: async () => "token" }, authStateReady: async () => undefined }));
vi.mock("@/lib/client/firebase-core", () => ({ getClientAuth: () => auth }));

import { api } from "@/lib/client/api";

const fetchMock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("api.reportPlans", () => {
  it("GET ?level&mode&key", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { plan: null }));
    await expect(api.reportPlans.get("THCS", "week", "2026-10-19")).resolves.toEqual({ plan: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/report-plans?level=THCS&mode=week&key=2026-10-19");
    expect(init.method).toBe("GET");
  });

  it("PUT body = the whole plan with baseRev; 409 rejects with the server message", async () => {
    const input = { levelId: "THPT" as const, mode: "month" as const, key: "2026-10", items: [{ content: "Họp tổ khối" }], note: "", baseRev: 2 };
    fetchMock.mockResolvedValueOnce(json(200, { id: "THPT_month_2026-10", rev: 3 }));
    await api.reportPlans.put(input);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/report-plans");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual(input);

    fetchMock.mockResolvedValueOnce(json(409, { error: { code: "CONFLICT", message: "Vừa được người khác cập nhật." } }));
    await expect(api.reportPlans.put(input)).rejects.toMatchObject({ status: 409, code: "CONFLICT", message: "Vừa được người khác cập nhật." });
  });
});
