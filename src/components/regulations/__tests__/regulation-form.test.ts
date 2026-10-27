/** Quy chế helpers: editor gating, draft validation ⇄ RegulationPutSchema, PDF checks / base64, display texts. */
import { describe, expect, it } from "vitest";
import { REGULATION_PDF_MAX_BYTES, ROLES } from "@/lib/constants";
import { RegulationPdfPutSchema, RegulationPutSchema } from "@/lib/contract";
import type { LevelId, Regulation, Role } from "@/lib/types";
import {
  bytesToBase64,
  canManageRegulations,
  draftErrors,
  draftFromRegulation,
  fileSizeText,
  hasPdfSignature,
  pdfFileProblem,
  pdfInfoLine,
  pdfUploadName,
  readPdfFile,
  regulationPutInput,
  regulationUpdatedLine,
  sameDraft,
  schoolYearOf,
} from "../lib/regulation-form";

const REG: Regulation = {
  id: "ky-luat",
  title: "Quy chế thử nghiệm",
  schoolYear: "2026–2027",
  body: "### Điều 1. Thử\nNội dung ngắn.",
  pdf: { name: "ban-goc.pdf", size: 204_800, uploadedAt: "2026-10-21T07:05:00Z" },
  rev: 4,
  updatedAt: "2026-10-21T07:05:00Z",
  updatedBy: "quan.tri@nshm.test",
  updatedByName: "Quản Trị Thử",
};

const profile = (role: Role, levels: LevelId[] = [], active = true) => ({ role, levels, active });

describe("editor gating (regulations.manage)", () => {
  it("only an active ADMIN without level restriction may edit", () => {
    expect(canManageRegulations(profile("ADMIN"))).toBe(true);
    expect(canManageRegulations(profile("ADMIN", ["THCS"]))).toBe(false);
    expect(canManageRegulations(profile("ADMIN", [], false))).toBe(false);
    for (const role of ROLES.filter((r) => r !== "ADMIN")) {
      expect(canManageRegulations(profile(role)), role).toBe(false);
      expect(canManageRegulations(profile(role, ["TH"])), role).toBe(false);
    }
    expect(canManageRegulations(null)).toBe(false);
  });
});

describe("texts", () => {
  it("'Cập nhật lúc … – …' in Vietnam time, falls back to the e-mail", () => {
    expect(regulationUpdatedLine(REG)).toBe("Cập nhật lúc 21/10/2026 14:05 – Quản Trị Thử");
    expect(regulationUpdatedLine({ ...REG, updatedByName: " " })).toBe("Cập nhật lúc 21/10/2026 14:05 – quan.tri@nshm.test");
    expect(regulationUpdatedLine(undefined)).toBeUndefined();
  });

  it("file sizes and the PDF line", () => {
    expect(fileSizeText(512)).toBe("512 B");
    expect(fileSizeText(REGULATION_PDF_MAX_BYTES)).toBe("700 KB");
    expect(fileSizeText(1_300_000)).toBe("1,2 MB");
    expect(pdfInfoLine(REG.pdf!)).toBe("ban-goc.pdf · 200 KB · tải lên 21/10/2026");
  });

  it("school year of a date (new year from August)", () => {
    expect(schoolYearOf("2026-10-27")).toBe("2026–2027");
    expect(schoolYearOf("2027-05-31")).toBe("2026–2027");
    expect(schoolYearOf("2027-08-01")).toBe("2027–2028");
  });
});

describe("draft", () => {
  it("starts from the stored version, or the default title + current school year", () => {
    expect(draftFromRegulation("ky-luat", REG, "2026-10-27")).toEqual({ title: REG.title, schoolYear: REG.schoolYear, body: REG.body });
    expect(draftFromRegulation("khen-thuong", undefined, "2026-10-27")).toEqual({ title: "Quy chế khen thưởng", schoolYear: "2026–2027", body: "" });
    expect(sameDraft(draftFromRegulation("ky-luat", REG, "2026-10-27"), { title: REG.title, schoolYear: REG.schoolYear, body: REG.body })).toBe(true);
  });

  it("validates with the schema limits and Vietnamese messages", () => {
    expect(draftErrors({ title: "Quy chế", schoolYear: "2026–2027", body: "Nội dung" })).toEqual({});
    expect(draftErrors({ title: " ab ", schoolYear: "26", body: "  \n " })).toEqual({
      title: "Nhập tên quy chế (ít nhất 3 ký tự).",
      schoolYear: "Nhập năm học, ví dụ 2026–2027.",
      body: "Nhập nội dung quy chế.",
    });
    const long = draftErrors({ title: "x".repeat(201), schoolYear: "y".repeat(21), body: "z".repeat(60_001) });
    expect(long.title).toBe("Tên quy chế tối đa 200 ký tự.");
    expect(long.schoolYear).toBe("Năm học tối đa 20 ký tự.");
    expect(long.body).toBe("Nội dung dài 60.001 ký tự, vượt giới hạn 60.000 ký tự.");
  });

  it("builds a PUT body the contract accepts (trimmed, LF line ends, baseRev)", () => {
    const input = regulationPutInput({ title: "  Quy chế  ", schoolYear: " 2026–2027 ", body: "\r\n## A\r\nB\r\n\r\n" }, 4);
    expect(input).toEqual({ title: "Quy chế", schoolYear: "2026–2027", body: "## A\nB", baseRev: 4 });
    expect(RegulationPutSchema.safeParse(input).success).toBe(true);
    // Whatever passes draftErrors passes the schema.
    const edge = { title: "abc", schoolYear: "2026", body: "x".repeat(60_000) };
    expect(draftErrors(edge)).toEqual({});
    expect(RegulationPutSchema.safeParse(regulationPutInput(edge, 0)).success).toBe(true);
  });
});

describe("original PDF", () => {
  const pdfBytes = new TextEncoder().encode("%PDF-1.7\n% fake test file\n%%EOF\n");

  it("accepts .pdf files up to the limit", () => {
    expect(pdfFileProblem({ name: "Quy che.PDF", type: "", size: 10 })).toBeUndefined();
    expect(pdfFileProblem({ name: "khong-duoi", type: "application/pdf", size: 10 })).toBeUndefined();
    expect(pdfFileProblem({ name: "anh.png", type: "image/png", size: 10 })).toBe("Chỉ nhận file PDF (đuôi .pdf).");
    expect(pdfFileProblem({ name: "rong.pdf", type: "application/pdf", size: 0 })).toContain("rỗng");
    expect(pdfFileProblem({ name: "lon.pdf", type: "application/pdf", size: REGULATION_PDF_MAX_BYTES + 1 })).toContain("tối đa 700 KB");
    expect(pdfFileProblem({ name: "vua.pdf", type: "application/pdf", size: REGULATION_PDF_MAX_BYTES })).toBeUndefined();
  });

  it("checks the %PDF- signature and encodes base64 like Node", () => {
    expect(hasPdfSignature(pdfBytes)).toBe(true);
    expect(hasPdfSignature(new TextEncoder().encode("%PD"))).toBe(false);
    expect(hasPdfSignature(new TextEncoder().encode("<html>"))).toBe(false);
    const big = new Uint8Array(100_000).map((_, i) => (i * 31) % 256);
    expect(bytesToBase64(big)).toBe(Buffer.from(big).toString("base64"));
    expect(bytesToBase64(new Uint8Array())).toBe("");
  });

  it("keeps a clean upload name", () => {
    expect(pdfUploadName("C:\\Tai lieu\\Quy che 2026.pdf")).toBe("Quy che 2026.pdf");
    expect(pdfUploadName("ban goc")).toBe("ban goc.pdf");
    const long = pdfUploadName(`${"a".repeat(300)}.pdf`);
    expect(long.length).toBe(200);
    expect(long.endsWith(".pdf")).toBe(true);
  });

  it("reads a picked file into the PUT body (schema-valid) and refuses fakes", async () => {
    const file = new File([pdfBytes], "quy-che.pdf", { type: "application/pdf" });
    const read = await readPdfFile(file);
    expect(read).toEqual({ name: "quy-che.pdf", data: Buffer.from(pdfBytes).toString("base64") });
    expect(RegulationPdfPutSchema.safeParse({ ...read, baseRev: 1 }).success).toBe(true);
    await expect(readPdfFile(new File(["<html></html>"], "gia.pdf", { type: "application/pdf" }))).rejects.toThrow("không phải PDF hợp lệ");
    await expect(readPdfFile(new File(["x"], "anh.jpg", { type: "image/jpeg" }))).rejects.toThrow("Chỉ nhận file PDF");
  });

  it("a file at the size limit still fits the schema's base64 limit", () => {
    const base64Length = 4 * Math.ceil(REGULATION_PDF_MAX_BYTES / 3);
    expect(base64Length).toBeLessThanOrEqual(1_000_000);
  });
});
