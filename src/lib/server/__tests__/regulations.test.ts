/**
 * Quy chế khen thưởng / kỷ luật: GET /api/regulations, PUT /api/regulations/:id, GET/PUT/DELETE /api/regulations/:id/pdf –
 * every role reads, only an unrestricted ADMIN writes, rev chain + baseRev 409, PDF checks (strict base64, %PDF-, size),
 * download headers, audit UPDATE_REGULATION. Short fake content only.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { GET as listGET } from "@/app/api/regulations/route";
import { PUT as contentPUT } from "@/app/api/regulations/[id]/route";
import { DELETE as pdfDELETE, GET as pdfGET, PUT as pdfPUT } from "@/app/api/regulations/[id]/pdf/route";
import { REGULATION_PDF_MAX_BYTES } from "../../constants";
import type { ApiErrorBody, ListResponse, RegulationPdfPutInput, RegulationPutInput } from "../../contract";
import type { AuditLog, Regulation } from "../../types";
import { REGULATION_MSG, cleanPdfName, pdfContentDisposition, type RegulationFileDoc } from "../regulations";
import { callRoute, createTestUser, getDoc, listDocs, setupTestProject } from "./helpers";

const PROJECT = "demo-test-regulations";
const t = { admin: "", adminTh: "", editor: "", viewer: "", gvcn: "" };

type Res = Regulation & ApiErrorBody;
const list = (token: string) => callRoute<ListResponse<Regulation> & ApiErrorBody>(listGET, { url: "/api/regulations", token });
const putContent = (token: string, id: string, b: RegulationPutInput | Record<string, unknown>) =>
  callRoute<Res>(contentPUT, { method: "PUT", url: `/api/regulations/${id}`, params: { id }, token, body: b });
const putPdf = (token: string, id: string, b: RegulationPdfPutInput | Record<string, unknown> | string) =>
  callRoute<Res>(pdfPUT, { method: "PUT", url: `/api/regulations/${id}/pdf`, params: { id }, token, body: b });
const getPdf = (token: string, id: string) => callRoute<ApiErrorBody>(pdfGET, { url: `/api/regulations/${id}/pdf`, params: { id }, token });
const delPdf = (token: string, id: string, b: Record<string, unknown> = {}) =>
  callRoute<Res>(pdfDELETE, { method: "DELETE", url: `/api/regulations/${id}/pdf`, params: { id }, token, body: b });
const audits = async (entityId: string) =>
  (await listDocs<AuditLog>("auditLogs")).filter((a) => a.action === "UPDATE_REGULATION" && a.entityId === entityId);

const content = (over: Partial<RegulationPutInput> = {}): RegulationPutInput => ({
  title: "Quy chế thử nghiệm A",
  schoolYear: "2026–2027",
  body: "## CHƯƠNG I. CHUNG\n\n### Điều 1. Mục đích\n\n- Ý thứ nhất\n- Ý thứ hai",
  ...over,
});

/** Fake PDF: signature + filler of the given total size. */
function fakePdf(size: number, fill = 0x41): Buffer {
  const b = Buffer.alloc(size, fill);
  b.write("%PDF-1.4\n", 0, "latin1");
  return b;
}

describe("regulations API (Quy chế khen thưởng / kỷ luật)", () => {
  beforeAll(async () => {
    await setupTestProject(PROJECT);
    t.admin = (await createTestUser({ uid: "admin", role: "ADMIN", displayName: "Quản trị" })).token;
    t.adminTh = (await createTestUser({ uid: "adminTh", role: "ADMIN", levels: ["TH"] })).token;
    t.editor = (await createTestUser({ uid: "editor", role: "EDITOR" })).token;
    t.viewer = (await createTestUser({ uid: "viewer", role: "VIEWER" })).token;
    t.gvcn = (await createTestUser({ uid: "gvcn", role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode: "6A01" }] })).token;
  });

  it("lists nothing before any save, for every role", async () => {
    for (const token of [t.admin, t.adminTh, t.editor, t.viewer, t.gvcn]) {
      const res = await list(token);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [] });
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect((await list("")).status).toBe(401);
  });

  it("a PDF cannot be uploaded before the content (404); unknown ids → 404", async () => {
    const early = await putPdf(t.admin, "ky-luat", { name: "a.pdf", data: fakePdf(100).toString("base64") });
    expect(early.status).toBe(404);
    expect(early.body.error.message).toBe(REGULATION_MSG.noContent);
    expect(await listDocs("regulationFiles")).toHaveLength(0);

    for (const id of ["noi-quy", "KHEN-THUONG", "khen-thuong "]) {
      const res = await putContent(t.admin, id, content());
      expect(res.status, id).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
      expect((await getPdf(t.viewer, id)).status).toBe(404);
      expect((await putPdf(t.admin, id, { name: "a.pdf", data: fakePdf(100).toString("base64") })).status).toBe(404);
      expect((await delPdf(t.admin, id)).status).toBe(404);
    }
    expect(await listDocs("regulations")).toHaveLength(0);
  });

  it("validates the content (title, school year, body ≤ 60 000 characters)", async () => {
    const noTitle = await putContent(t.admin, "ky-luat", content({ title: "  " }));
    expect(noTitle.status).toBe(400);
    expect(noTitle.body.error.message).toContain("Nhập tên quy chế");
    const noYear = await putContent(t.admin, "ky-luat", content({ schoolYear: "" }));
    expect(noYear.status).toBe(400);
    expect(noYear.body.error.message).toContain("Nhập năm học");
    const tooLong = await putContent(t.admin, "ky-luat", content({ body: "x".repeat(60_001) }));
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe("VALIDATION");
    expect(await listDocs("regulations")).toHaveLength(0);
  });

  it("ADMIN creates a regulation: rev 1, author fields, CRLF → LF, audit; the list follows REGULATION_IDS order", async () => {
    const res = await putContent(t.admin, "ky-luat", content({ title: "  Quy chế thử nghiệm B ", body: "Dòng một\r\nDòng hai  " }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "ky-luat",
      title: "Quy chế thử nghiệm B",
      schoolYear: "2026–2027",
      body: "Dòng một\nDòng hai",
      rev: 1,
      updatedBy: "admin@nshm.test",
      updatedByName: "Quản trị",
    });
    expect("pdf" in res.body).toBe(false);
    expect(Date.parse(res.body.updatedAt)).not.toBeNaN();
    expect(await getDoc<Regulation>("regulations", "ky-luat")).toEqual(res.body);

    const log = await audits("ky-luat");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ entity: "regulation", email: "admin@nshm.test", role: "ADMIN", ip: "203.0.113.7" });
    expect(log[0].levelId).toBeUndefined();
    expect(log[0].detail).toEqual({ part: "content", title: "Quy chế thử nghiệm B" });

    const khen = await putContent(t.admin, "khen-thuong", content());
    expect(khen.status).toBe(200);
    expect(khen.body.rev).toBe(1);
    const all = await list(t.gvcn);
    expect(all.body.items.map((r) => r.id)).toEqual(["khen-thuong", "ky-luat"]);
    expect(all.body.items[1]).toEqual(res.body);
  });

  it("updates on top of the current rev; a stale or missing baseRev → 409; the same content writes nothing", async () => {
    const res = await putContent(t.admin, "khen-thuong", content({ baseRev: 1, body: "Nội dung mới" }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rev: 2, body: "Nội dung mới" });

    for (const baseRev of [1, 0, undefined, 7]) {
      const stale = await putContent(t.admin, "khen-thuong", content({ baseRev, body: "Bản cũ" }));
      expect(stale.status, String(baseRev)).toBe(409);
      expect(stale.body.error.code).toBe("CONFLICT");
      expect(stale.body.error.message).toBe(REGULATION_MSG.stale);
    }
    expect((await getDoc<Regulation>("regulations", "khen-thuong"))?.body).toBe("Nội dung mới");

    const same = await putContent(t.admin, "khen-thuong", content({ baseRev: 2, body: " Nội dung mới " }));
    expect(same.status).toBe(200);
    expect(same.body).toEqual(res.body);
    expect(await audits("khen-thuong")).toHaveLength(2);
  });

  it("EDITOR, VIEWER, GVCN and a level-limited ADMIN cannot write (403, nothing written) but can read", async () => {
    const data = fakePdf(200).toString("base64");
    for (const token of [t.editor, t.viewer, t.gvcn, t.adminTh]) {
      const c = await putContent(token, "khen-thuong", content({ baseRev: 2, body: "Không được ghi" }));
      expect(c.status).toBe(403);
      expect(c.body.error.code).toBe("FORBIDDEN");
      expect((await putPdf(token, "khen-thuong", { name: "x.pdf", data, baseRev: 2 })).status).toBe(403);
      expect((await delPdf(token, "khen-thuong", { baseRev: 2 })).status).toBe(403);
      expect((await list(token)).body.items).toHaveLength(2);
    }
    expect((await getDoc<Regulation>("regulations", "khen-thuong"))?.rev).toBe(2);
    expect(await listDocs("regulationFiles")).toHaveLength(0);
    expect(await audits("khen-thuong")).toHaveLength(2);
  });

  it("uploads the original PDF (Vietnamese name) and serves the same bytes to every role", async () => {
    const pdf = fakePdf(50_000, 0x7a);
    const up = await putPdf(t.admin, "khen-thuong", { name: "C:\\fakepath\\Quy chế (bản gốc)", data: pdf.toString("base64"), baseRev: 2 });
    expect(up.status).toBe(200);
    const name = "Quy chế (bản gốc).pdf";
    expect(up.body).toMatchObject({ id: "khen-thuong", body: "Nội dung mới", rev: 3, pdf: { name, size: pdf.length }, updatedBy: "admin@nshm.test" });
    expect(up.body.pdf?.uploadedAt).toBe(up.body.updatedAt);
    expect(await getDoc<Regulation>("regulations", "khen-thuong")).toEqual(up.body);
    const file = await getDoc<RegulationFileDoc>("regulationFiles", "khen-thuong");
    expect(file).toMatchObject({ name, size: pdf.length, contentType: "application/pdf", uploadedBy: "admin@nshm.test", uploadedAt: up.body.updatedAt });
    expect(file?.data).toBe(pdf.toString("base64"));

    // the list never carries the bytes
    const listed = await list(t.viewer);
    expect(listed.body.items[0]).toEqual(up.body);
    expect(listed.text.length).toBeLessThan(2_000);

    for (const token of [t.admin, t.adminTh, t.editor, t.viewer, t.gvcn]) {
      const got = await getPdf(token, "khen-thuong");
      expect(got.status).toBe(200);
      expect(got.bytes.equals(pdf)).toBe(true);
      expect(got.headers.get("content-type")).toBe("application/pdf");
      expect(got.headers.get("content-length")).toBe(String(pdf.length));
      expect(got.headers.get("cache-control")).toBe("private, no-store");
      expect(got.headers.get("content-disposition")).toBe(
        `inline; filename="Quy che (ban goc).pdf"; filename*=UTF-8''${encodeURIComponent(name).replace("(", "%28").replace(")", "%29")}`,
      );
    }
    expect((await getPdf(t.viewer, "ky-luat")).status).toBe(404);

    const log = await audits("khen-thuong");
    expect(log).toHaveLength(3);
    expect(log.find((a) => a.detail?.part === "pdf")?.detail).toEqual({ part: "pdf", name, size: pdf.length });
  });

  it("a content save keeps the PDF; replacing the PDF keeps the content", async () => {
    const res = await putContent(t.admin, "khen-thuong", content({ baseRev: 3, title: "Quy chế thử nghiệm A (sửa)", body: "Nội dung mới" }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rev: 4, title: "Quy chế thử nghiệm A (sửa)", pdf: { name: "Quy chế (bản gốc).pdf", size: 50_000 } });

    const pdf = fakePdf(REGULATION_PDF_MAX_BYTES); // the limit itself is accepted (and fits one Firestore doc)
    const up = await putPdf(t.admin, "khen-thuong", { name: "ban-moi.PDF", data: pdf.toString("base64"), baseRev: 4 });
    expect(up.status).toBe(200);
    expect(up.body).toMatchObject({ rev: 5, title: "Quy chế thử nghiệm A (sửa)", body: "Nội dung mới", pdf: { name: "ban-moi.PDF", size: REGULATION_PDF_MAX_BYTES } });
    const got = await getPdf(t.gvcn, "khen-thuong");
    expect(got.bytes.equals(pdf)).toBe(true);
    expect(got.headers.get("content-disposition")).toBe(`inline; filename="ban-moi.PDF"; filename*=UTF-8''ban-moi.PDF`);
  });

  it("rejects non-PDF bytes, malformed base64, oversized files and a stale baseRev (nothing written)", async () => {
    const before = await getDoc<Regulation>("regulations", "khen-thuong");
    const valid = fakePdf(300).toString("base64");

    const notPdf = await putPdf(t.admin, "khen-thuong", { name: "anh.pdf", data: Buffer.from("GIF89a fake image bytes").toString("base64"), baseRev: 5 });
    expect(notPdf.status).toBe(400);
    expect(notPdf.body.error.message).toBe(REGULATION_MSG.notPdf);

    for (const data of [`${valid.slice(0, 40)}\n${valid.slice(40)}`, `data:application/pdf;base64,${valid}`, `${valid.slice(0, -4)}!!!!`, `${valid}A`, "JVBERi0xLjQ=Cg=="]) {
      const res = await putPdf(t.admin, "khen-thuong", { name: "x.pdf", data, baseRev: 5 });
      expect(res.status, data.slice(0, 30)).toBe(400);
      expect(res.body.error.message).toBe(REGULATION_MSG.badBase64);
    }

    const over = await putPdf(t.admin, "khen-thuong", { name: "lon.pdf", data: fakePdf(REGULATION_PDF_MAX_BYTES + 1).toString("base64"), baseRev: 5 });
    expect(over.status).toBe(413);
    expect(over.body.error.message).toContain("Tệp PDF quá lớn (701 KB)");
    expect(over.body.error.message).toContain("700 KB");
    const huge = await putPdf(t.admin, "khen-thuong", { name: "rat-lon.pdf", data: fakePdf(1_200_000).toString("base64"), baseRev: 5 });
    expect(huge.status).toBe(413);
    expect(huge.body.error.message).toBe(REGULATION_MSG.pdfTooLarge());

    const stale = await putPdf(t.admin, "khen-thuong", { name: "x.pdf", data: valid, baseRev: 4 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.message).toBe(REGULATION_MSG.stale);
    expect((await putPdf(t.admin, "khen-thuong", { name: "x.pdf", data: valid })).status).toBe(409);

    expect(await getDoc<Regulation>("regulations", "khen-thuong")).toEqual(before);
    expect((await getDoc<RegulationFileDoc>("regulationFiles", "khen-thuong"))?.size).toBe(REGULATION_PDF_MAX_BYTES);
    expect(await audits("khen-thuong")).toHaveLength(5);
  });

  it("deletes the PDF (baseRev checked): meta and file removed, content kept, download 404", async () => {
    const stale = await delPdf(t.admin, "khen-thuong", { baseRev: 4 });
    expect(stale.status).toBe(409);
    expect((await delPdf(t.admin, "khen-thuong", { baseRev: "5" })).status).toBe(400);

    const res = await delPdf(t.admin, "khen-thuong", { baseRev: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "khen-thuong", rev: 6, title: "Quy chế thử nghiệm A (sửa)", body: "Nội dung mới" });
    expect("pdf" in res.body).toBe(false);
    expect(await getDoc<Regulation>("regulations", "khen-thuong")).toEqual(res.body);
    expect(await getDoc("regulationFiles", "khen-thuong")).toBeUndefined();

    const got = await getPdf(t.viewer, "khen-thuong");
    expect(got.status).toBe(404);
    expect(got.body.error.message).toBe(REGULATION_MSG.noPdf);
    const again = await delPdf(t.admin, "khen-thuong", { baseRev: 6 });
    expect(again.status).toBe(404);
    expect(again.body.error.message).toBe(REGULATION_MSG.noPdf);

    const log = await audits("khen-thuong");
    expect(log).toHaveLength(6);
    expect(log.find((a) => a.detail?.deleted)?.detail).toEqual({ part: "pdf", deleted: true, name: "ban-moi.PDF" });
    expect(log.map((a) => a.detail?.part).sort()).toEqual(["content", "content", "content", "pdf", "pdf", "pdf"]);
  });

  it("two admins saving the same revision at once: one wins, the other gets 409", async () => {
    const other = (await createTestUser({ uid: "admin2", role: "ADMIN" })).token;
    const results = await Promise.all([
      putContent(t.admin, "ky-luat", content({ baseRev: 1, body: "Bản của người thứ nhất" })),
      putContent(other, "ky-luat", content({ baseRev: 1, body: "Bản của người thứ hai" })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const stored = await getDoc<Regulation>("regulations", "ky-luat");
    expect(stored).toEqual(results.find((r) => r.status === 200)!.body);
    expect(stored?.rev).toBe(2);
    expect(await audits("ky-luat")).toHaveLength(2);
  });
});

describe("original PDF file name → download header", () => {
  it("cannot break out of Content-Disposition (quotes, CR/LF, folders, ';')", () => {
    const name = cleanPdfName('C:\\tmp\\a"b\r\nSet-Cookie: x=1; filename=khac', "ky-luat");
    expect(name).toBe('a"b Set-Cookie: x=1; filename=khac.pdf');
    const header = pdfContentDisposition(name);
    expect(header).toBe(`inline; filename="a_b Set-Cookie: x=1; filename=khac.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`);
    expect(header).toMatch(/^[\x20-\x7e]+$/);
    expect(new Headers({ "Content-Disposition": header }).get("content-disposition")).toBe(header);
    expect(cleanPdfName(" \u0000 ", "khen-thuong")).toBe("Quy chế khen thưởng.pdf");
  });
});
