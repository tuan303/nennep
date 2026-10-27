/**
 * Quy chế khen thưởng / kỷ luật – pure helpers of the reader and the editor: display texts, the editor draft ⇄ PUT body
 * (limits of RegulationPutSchema, Vietnamese messages) and the original PDF (type / size / signature checks, base64).
 */
import { UserFacingError } from "@/lib/client/api-errors";
import { fmtDate, fmtDateTime } from "@/lib/client/format";
import { REGULATION_LABELS, REGULATION_PDF_MAX_BYTES, hasPermission } from "@/lib/constants";
import type { RegulationPutInput } from "@/lib/contract";
import type { Regulation, RegulationId, UserProfile } from "@/lib/types";

/** Limits of RegulationPutSchema (checked on the trimmed values). */
export const REGULATION_LIMITS = { titleMin: 3, title: 200, schoolYearMin: 4, schoolYear: 20, body: 60_000 } as const;

/** Edit content + PDF: `regulations.manage` = ADMIN without level restriction (level-limited admins only read). */
export function canManageRegulations(profile: Pick<UserProfile, "role" | "active" | "levels"> | null | undefined): boolean {
  return hasPermission(profile, "regulations.manage");
}

/* ---------------------------------- texts ---------------------------------- */

/** "Cập nhật lúc 21/10/2026 14:05 – Nguyễn Văn A" (the e-mail when the name is empty). */
export function regulationUpdatedLine(reg: Pick<Regulation, "updatedAt" | "updatedBy" | "updatedByName"> | null | undefined): string | undefined {
  if (!reg?.updatedAt) return undefined;
  const who = reg.updatedByName?.trim() || reg.updatedBy;
  return `Cập nhật lúc ${fmtDateTime(reg.updatedAt)}${who ? ` – ${who}` : ""}`;
}

/** 512 → "512 B", 204800 → "200 KB", 1_300_000 → "1,2 MB". */
export function fileSizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024).toLocaleString("vi-VN")} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** "quy-che-khen-thuong.pdf · 512 KB · tải lên 21/10/2026". */
export function pdfInfoLine(pdf: NonNullable<Regulation["pdf"]>): string {
  const at = fmtDate(pdf.uploadedAt);
  return [pdf.name, fileSizeText(pdf.size), at ? `tải lên ${at}` : ""].filter(Boolean).join(" · ");
}

/** School year containing `today` (yyyy-mm-dd): from August on → "2026–2027", before → "2025–2026". */
export function schoolYearOf(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const start = m >= 8 ? y : y - 1;
  return `${start}–${start + 1}`;
}

/* ---------------------------------- draft ---------------------------------- */

export interface RegulationDraft {
  title: string;
  schoolYear: string;
  body: string;
}

export type RegulationDraftErrors = Partial<Record<keyof RegulationDraft, string>>;

/** Editor start values: the stored regulation, or the default title + the current school year for a new one. */
export function draftFromRegulation(id: RegulationId, reg: Regulation | null | undefined, today: string): RegulationDraft {
  if (reg) return { title: reg.title, schoolYear: reg.schoolYear, body: reg.body };
  return { title: REGULATION_LABELS[id].title, schoolYear: schoolYearOf(today), body: "" };
}

export function sameDraft(a: RegulationDraft, b: RegulationDraft): boolean {
  return a.title === b.title && a.schoolYear === b.schoolYear && a.body === b.body;
}

const count = (n: number) => n.toLocaleString("vi-VN");

/** Vietnamese message per field (empty object = can be saved). */
export function draftErrors(d: RegulationDraft): RegulationDraftErrors {
  const errors: RegulationDraftErrors = {};
  const title = d.title.trim();
  const year = d.schoolYear.trim();
  const body = d.body.trim();
  if (title.length < REGULATION_LIMITS.titleMin) errors.title = "Nhập tên quy chế (ít nhất 3 ký tự).";
  else if (title.length > REGULATION_LIMITS.title) errors.title = `Tên quy chế tối đa ${count(REGULATION_LIMITS.title)} ký tự.`;
  if (year.length < REGULATION_LIMITS.schoolYearMin) errors.schoolYear = "Nhập năm học, ví dụ 2026–2027.";
  else if (year.length > REGULATION_LIMITS.schoolYear) errors.schoolYear = `Năm học tối đa ${count(REGULATION_LIMITS.schoolYear)} ký tự.`;
  if (!body) errors.body = "Nhập nội dung quy chế.";
  else if (body.length > REGULATION_LIMITS.body) {
    errors.body = `Nội dung dài ${count(body.length)} ký tự, vượt giới hạn ${count(REGULATION_LIMITS.body)} ký tự.`;
  }
  return errors;
}

/** PUT /api/regulations/:id body (trimmed values, "\r\n" → "\n"). */
export function regulationPutInput(d: RegulationDraft, baseRev: number): RegulationPutInput {
  return { title: d.title.trim(), schoolYear: d.schoolYear.trim(), body: d.body.replace(/\r\n?/g, "\n").trim(), baseRev };
}

/* -------------------------------- original PDF ------------------------------- */

export const PDF_ACCEPT = ".pdf,application/pdf";

/** Why this file cannot be the original PDF (undefined = fine). */
export function pdfFileProblem(file: { name: string; type: string; size: number }): string | undefined {
  if (!/\.pdf$/i.test(file.name.trim()) && file.type !== "application/pdf") return "Chỉ nhận file PDF (đuôi .pdf).";
  if (file.size === 0) return "File PDF rỗng. Vui lòng chọn file khác.";
  if (file.size > REGULATION_PDF_MAX_BYTES) {
    return `File quá lớn (${fileSizeText(file.size)}). Dung lượng tối đa ${fileSizeText(REGULATION_PDF_MAX_BYTES)} – hãy nén hoặc xuất lại file PDF nhỏ hơn.`;
  }
  return undefined;
}

/** Real PDF files start with "%PDF-" (the server checks it too). */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

/** Base64 of raw bytes (chunked: no call-stack limit on large files). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

/** File name sent with the PDF: no folders, at most 200 characters, ".pdf" kept. */
export function pdfUploadName(name: string): string {
  const base = name.split(/[\\/]/).pop()?.trim() || "quy-che.pdf";
  const withExt = /\.pdf$/i.test(base) ? base : `${base}.pdf`;
  return withExt.length <= 200 ? withExt : `${withExt.slice(0, 196)}.pdf`;
}

/** Checks a picked file and reads it for PUT /api/regulations/:id/pdf. Throws UserFacingError (Vietnamese). */
export async function readPdfFile(file: Blob & { name: string }): Promise<{ name: string; data: string }> {
  const problem = pdfFileProblem(file);
  if (problem) throw new UserFacingError(problem);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new UserFacingError("Không đọc được file này. Vui lòng chọn lại.");
  }
  if (!hasPdfSignature(bytes)) throw new UserFacingError("File này không phải PDF hợp lệ. Vui lòng chọn file PDF khác.");
  return { name: pdfUploadName(file.name), data: bytesToBase64(bytes) };
}
