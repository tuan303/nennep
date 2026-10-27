/**
 * Quy chế khen thưởng / Quy chế kỷ luật: the school's regulations (one set for every level), read by every signed-in user
 * from the top bar. `regulations/{id}` holds the text (REGULATION_MARKUP) + the meta of the original PDF; the PDF itself
 * lives in `regulationFiles/{id}` (base64 string, ≤ REGULATION_PDF_MAX_BYTES decoded) so the list never carries file bytes.
 * Every content or PDF change is one transaction: doc(s) + `rev` +1 + audit UPDATE_REGULATION; `baseRev` (omitted = 0,
 * i.e. "not created yet") → 409 when stale. Writes need regulations.manage (ADMIN without level restriction).
 * Not part of LevelDataset: no digest, no meta/versions bump.
 */
import type { DocumentReference } from "firebase-admin/firestore";
import { z } from "zod";
import { REGULATION_IDS, REGULATION_LABELS, REGULATION_PDF_MAX_BYTES } from "../constants";
import { zRegulationId, type RegulationPdfPutSchema, type RegulationPutSchema } from "../contract";
import { COL } from "../firestore-paths";
import type { Regulation, RegulationId } from "../types";
import { auditDiff, auditOf, writeAudit } from "./audit";
import { actorName, requirePermission, type SessionUser } from "./auth";
import { ApiError, Errors } from "./errors";
import { db, nowIso } from "./firebase-admin";
import { assertBaseRev, nextRev, omitKeys, type ServiceCtx } from "./records";
import { runTx } from "./write";

export type RegulationPutData = z.output<typeof RegulationPutSchema>;
export type RegulationPdfPutData = z.output<typeof RegulationPdfPutSchema>;

/** DELETE /api/regulations/:id/pdf body: `rev` of the regulation the editor started from (omitted = 0). */
export const RegulationPdfDeleteSchema = z.object({ baseRev: z.number().int().min(0).optional() });
export type RegulationPdfDeleteData = z.output<typeof RegulationPdfDeleteSchema>;

/** regulationFiles/{id}: the original PDF (one doc per regulation). */
export interface RegulationFileDoc {
  name: string;
  size: number; // decoded bytes
  contentType: "application/pdf";
  data: string; // base64 of the file bytes
  uploadedAt: string;
  uploadedBy: string; // email
}

const PDF_LIMIT_KB = Math.round(REGULATION_PDF_MAX_BYTES / 1024);

export const REGULATION_MSG = {
  notFound: "Không tìm thấy quy chế.",
  noContent: "Chưa có nội dung quy chế – lưu nội dung trước",
  stale: "Quy chế vừa được người khác cập nhật. Vui lòng tải lại để xem bản mới nhất rồi sửa tiếp.",
  noPdf: "Quy chế chưa có tệp PDF gốc.",
  badBase64: "Dữ liệu tệp PDF bị lỗi (base64 không hợp lệ). Vui lòng chọn lại tệp.",
  notPdf: "Tệp tải lên không phải tệp PDF.",
  pdfTooLarge: (bytes?: number) =>
    `Tệp PDF quá lớn${bytes !== undefined ? ` (${Math.ceil(bytes / 1024)} KB)` : ""}. Dung lượng tối đa là ${PDF_LIMIT_KB} KB – vui lòng nén hoặc chọn tệp nhỏ hơn.`,
} as const;

/**
 * Request body cap of PUT …/pdf: base64 of the largest accepted file + room for the name. Below the schema's 1 MB `data`
 * limit, so an oversized file is always reported by `pdfTooLargeError` (413) instead of a generic field message.
 */
export const REGULATION_PDF_BODY_MAX_BYTES = Math.ceil(REGULATION_PDF_MAX_BYTES / 3) * 4 + 4_096;

/** Compared to decide whether a content save changes anything. */
const CONTENT_FIELDS = ["title", "schoolYear", "body"] as const satisfies ReadonlyArray<keyof Regulation>;

export function regulationRef(id: RegulationId): DocumentReference {
  return db().collection(COL.regulations).doc(id);
}

export function regulationFileRef(id: RegulationId): DocumentReference {
  return db().collection(COL.regulationFiles).doc(id);
}

/** Route param → RegulationId; any other id → 404. */
export function regulationIdFromParam(raw: string | undefined): RegulationId {
  const parsed = zRegulationId.safeParse(raw ?? "");
  if (!parsed.success) throw Errors.notFound(REGULATION_MSG.notFound);
  return parsed.data;
}

export function pdfTooLargeError(bytes?: number): ApiError {
  return new ApiError(413, "VALIDATION", REGULATION_MSG.pdfTooLarge(bytes));
}

/** Strict base64 → bytes: standard alphabet with canonical padding only (no whitespace, no data: prefix), else 400. */
export function decodeBase64Strict(data: string): Buffer {
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) throw Errors.validation(REGULATION_MSG.badBase64);
  const bytes = Buffer.from(data, "base64");
  // Buffer.from silently skips what it cannot decode: only a lossless round trip proves the input was clean.
  if (bytes.toString("base64") !== data) throw Errors.validation(REGULATION_MSG.badBase64);
  return bytes;
}

/** Decode + verify the original PDF: ≤ REGULATION_PDF_MAX_BYTES (413) and the "%PDF-" signature (400). */
export function decodePdf(data: string): Buffer {
  const bytes = decodeBase64Strict(data);
  if (bytes.length > REGULATION_PDF_MAX_BYTES) throw pdfTooLargeError(bytes.length);
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw Errors.validation(REGULATION_MSG.notPdf);
  return bytes;
}

/** Stored file name: NFC (macOS sends NFD), no folder part or control characters, ending in ".pdf". */
export function cleanPdfName(raw: string, id: RegulationId): string {
  const base = raw.toWellFormed().normalize("NFC").split(/[\\/]/).pop() ?? "";
  const name = base.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!name || /^\.pdf$/i.test(name)) return `${REGULATION_LABELS[id].title}.pdf`;
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

/** `inline` + an ASCII fallback + the RFC 5987 `filename*` that keeps Vietnamese names intact. */
export function pdfContentDisposition(name: string): string {
  const ascii = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** rev + 1 and the author of the change. */
function stamp(user: SessionUser, before: Regulation | undefined, at: string): Pick<Regulation, "rev" | "updatedAt" | "updatedBy" | "updatedByName"> {
  return { rev: nextRev(before ?? {}), updatedAt: at, updatedBy: user.email, updatedByName: actorName(user) };
}

/** GET /api/regulations (view.dashboard): the saved regulations in REGULATION_IDS order (never saved → omitted). */
export async function listRegulations(user: SessionUser): Promise<Regulation[]> {
  requirePermission(user, "view.dashboard");
  const snaps = await db().getAll(...REGULATION_IDS.map((id) => regulationRef(id)));
  return snaps.filter((s) => s.exists).map((s) => s.data() as Regulation);
}

/**
 * PUT /api/regulations/:id (regulations.manage): title + school year + body. The first save creates the doc (rev 1);
 * the PDF meta is kept. Saving the same content as stored writes nothing and returns it unchanged.
 */
export async function saveRegulation(ctx: ServiceCtx, id: RegulationId, input: RegulationPutData): Promise<Regulation> {
  const { user } = ctx;
  requirePermission(user, "regulations.manage");
  const content: Pick<Regulation, "title" | "schoolYear" | "body"> = {
    title: input.title,
    schoolYear: input.schoolYear,
    body: input.body.replace(/\r\n?/g, "\n"),
  };

  return runTx(async (tx) => {
    // ---------------- reads ----------------
    const snap = await tx.get(regulationRef(id));
    const before = snap.exists ? (snap.data() as Regulation) : undefined;
    assertBaseRev(before ?? {}, input.baseRev ?? 0, REGULATION_MSG.stale);
    if (before && Object.keys(auditDiff(before, { ...before, ...content }, CONTENT_FIELDS)).length === 0) return before;

    // ---------------- writes ----------------
    const regulation: Regulation = { id, ...content, ...(before?.pdf ? { pdf: before.pdf } : {}), ...stamp(user, before, nowIso()) };
    tx.set(regulationRef(id), regulation);
    writeAudit(tx, auditOf(user, "UPDATE_REGULATION", { entity: "regulation", entityId: id, ip: ctx.ip, detail: { part: "content", title: content.title } }));
    return regulation;
  });
}

/** GET /api/regulations/:id/pdf (view.dashboard): the original PDF, 404 when none was uploaded. */
export async function readRegulationPdf(user: SessionUser, id: RegulationId): Promise<{ name: string; data: Buffer }> {
  requirePermission(user, "view.dashboard");
  const snap = await regulationFileRef(id).get();
  if (!snap.exists) throw Errors.notFound(REGULATION_MSG.noPdf);
  const file = snap.data() as RegulationFileDoc;
  return { name: file.name, data: Buffer.from(file.data, "base64") };
}

/**
 * PUT /api/regulations/:id/pdf (regulations.manage): replaces the original PDF. The regulation must have content first
 * (404). Writes regulationFiles/{id} + `pdf` meta of the regulation in the same transaction.
 */
export async function saveRegulationPdf(ctx: ServiceCtx, id: RegulationId, input: RegulationPdfPutData): Promise<Regulation> {
  const { user } = ctx;
  requirePermission(user, "regulations.manage");
  const bytes = decodePdf(input.data);
  const name = cleanPdfName(input.name, id);

  return runTx(async (tx) => {
    // ---------------- reads ----------------
    const snap = await tx.get(regulationRef(id));
    if (!snap.exists) throw Errors.notFound(REGULATION_MSG.noContent);
    const before = snap.data() as Regulation;
    assertBaseRev(before, input.baseRev ?? 0, REGULATION_MSG.stale);

    // ---------------- writes ----------------
    const at = nowIso();
    const file: RegulationFileDoc = { name, size: bytes.length, contentType: "application/pdf", data: input.data, uploadedAt: at, uploadedBy: user.email };
    const regulation: Regulation = { ...before, pdf: { name, size: bytes.length, uploadedAt: at }, ...stamp(user, before, at) };
    tx.set(regulationFileRef(id), file);
    tx.set(regulationRef(id), regulation);
    writeAudit(tx, auditOf(user, "UPDATE_REGULATION", { entity: "regulation", entityId: id, ip: ctx.ip, detail: { part: "pdf", name, size: bytes.length } }));
    return regulation;
  });
}

/** DELETE /api/regulations/:id/pdf (regulations.manage): removes the original PDF and its meta (404 when none). */
export async function deleteRegulationPdf(ctx: ServiceCtx, id: RegulationId, input: RegulationPdfDeleteData): Promise<Regulation> {
  const { user } = ctx;
  requirePermission(user, "regulations.manage");

  return runTx(async (tx) => {
    // ---------------- reads ----------------
    const snap = await tx.get(regulationRef(id));
    if (!snap.exists) throw Errors.notFound(REGULATION_MSG.noPdf);
    const before = snap.data() as Regulation;
    assertBaseRev(before, input.baseRev ?? 0, REGULATION_MSG.stale);
    if (!before.pdf) throw Errors.notFound(REGULATION_MSG.noPdf);

    // ---------------- writes ----------------
    const regulation: Regulation = { ...omitKeys(before, ["pdf"]), ...stamp(user, before, nowIso()) };
    tx.delete(regulationFileRef(id));
    tx.set(regulationRef(id), regulation);
    writeAudit(
      tx,
      auditOf(user, "UPDATE_REGULATION", { entity: "regulation", entityId: id, ip: ctx.ip, detail: { part: "pdf", deleted: true, name: before.pdf.name } }),
    );
    return regulation;
  });
}
