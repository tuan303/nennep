/** api.regulations: paths, methods and bodies of /api/regulations; the PDF is fetched with the user's token. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ currentUser: { getIdToken: async () => "token" }, authStateReady: async () => undefined }));
vi.mock("@/lib/client/firebase-core", () => ({ getClientAuth: () => auth }));
const saved = vi.hoisted(() => ({ calls: [] as Array<{ data: unknown; name: string; mime?: string }> }));
vi.mock("@/lib/client/download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/client/download")>()),
  downloadBlob: (data: unknown, name: string, mime?: string) => {
    saved.calls.push({ data, name, mime });
  },
}));

import { api } from "@/lib/client/api";

const fetchMock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const REG = { id: "ky-luat", title: "Quy chế thử", schoolYear: "2026–2027", body: "Nội dung", rev: 3 };

beforeEach(() => {
  fetchMock.mockReset();
  saved.calls = [];
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("api.regulations", () => {
  it("GET /api/regulations", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { items: [REG] }));
    await expect(api.regulations.list()).resolves.toEqual({ items: [REG] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/regulations");
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token");
  });

  it("PUT content with baseRev; 409 rejects with the server message", async () => {
    const input = { title: "Quy chế thử", schoolYear: "2026–2027", body: "## A", baseRev: 3 };
    fetchMock.mockResolvedValueOnce(json(200, { ...REG, rev: 4 }));
    await api.regulations.put("ky-luat", input);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/regulations/ky-luat");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual(input);

    fetchMock.mockResolvedValueOnce(json(409, { error: { code: "CONFLICT", message: "Quy chế vừa được người khác cập nhật." } }));
    await expect(api.regulations.put("ky-luat", input)).rejects.toMatchObject({ status: 409, code: "CONFLICT", message: "Quy chế vừa được người khác cập nhật." });
  });

  it("PUT / DELETE the original PDF", async () => {
    fetchMock.mockResolvedValueOnce(json(200, REG)).mockResolvedValueOnce(json(200, REG));
    await api.regulations.putPdf("khen-thuong", { name: "ban-goc.pdf", data: "JVBERi0xLjc=", baseRev: 2 });
    await api.regulations.deletePdf("khen-thuong", 3);
    const [[putUrl, putInit], [delUrl, delInit]] = fetchMock.mock.calls;
    expect(putUrl).toBe("/api/regulations/khen-thuong/pdf");
    expect(putInit.method).toBe("PUT");
    expect(JSON.parse(String(putInit.body))).toEqual({ name: "ban-goc.pdf", data: "JVBERi0xLjc=", baseRev: 2 });
    expect(delUrl).toBe("/api/regulations/khen-thuong/pdf");
    expect(delInit.method).toBe("DELETE");
    expect(JSON.parse(String(delInit.body))).toEqual({ baseRev: 3 });
  });

  it("fetches the PDF bytes with the token and saves them under pdf.name (.pdf added when missing)", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7 thử");
    fetchMock.mockImplementation(async () => new Response(bytes, { status: 200, headers: { "Content-Type": "application/pdf" } }));
    const blob = await api.regulations.pdf("ky-luat");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/regulations/ky-luat/pdf");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer token");
    expect(new Headers(init.headers).get("Accept")).toBe("application/pdf");

    await api.regulations.downloadPdf("ky-luat", "Quy chế kỷ luật.pdf");
    await api.regulations.downloadPdf("ky-luat", "ban goc");
    await api.regulations.downloadPdf("ky-luat", "  ");
    expect(saved.calls.map((c) => [c.name, c.mime])).toEqual([
      ["Quy chế kỷ luật.pdf", "application/pdf"],
      ["ban goc.pdf", "application/pdf"],
      ["ky-luat.pdf", "application/pdf"],
    ]);
  });

  it("a missing PDF rejects with 404", async () => {
    fetchMock.mockResolvedValueOnce(json(404, { error: { code: "NOT_FOUND", message: "Chưa có file PDF gốc." } }));
    await expect(api.regulations.downloadPdf("ky-luat", "x.pdf")).rejects.toMatchObject({ status: 404, message: "Chưa có file PDF gốc." });
    expect(saved.calls).toEqual([]);
  });
});
