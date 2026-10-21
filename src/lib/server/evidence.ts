/**
 * Evidence photos stored as Firestore Bytes (Spark plan: no Cloud Storage).
 * evidence/{autoId} { levelId, mime, data: Bytes, size, fileName?, createdBy, createdAt }
 */
import type { z } from "zod";
import type { EvidenceUploadSchema } from "../contract";
import { COL } from "../firestore-paths";
import type { LevelId } from "../types";
import { auditOf, writeAudit } from "./audit";
import { requireAnyPermission, requireLevel, type SessionUser } from "./auth";
import { Errors } from "./errors";
import { db, nowIso } from "./firebase-admin";
import type { ServiceCtx } from "./records";

export type EvidenceUploadData = z.output<typeof EvidenceUploadSchema>;

/** Max decoded image size (700 KB). */
export const EVIDENCE_MAX_BYTES = 700 * 1024;

export type EvidenceMime = "image/jpeg" | "image/png" | "image/webp";

export interface EvidenceDoc {
  levelId: LevelId;
  mime: EvidenceMime;
  data: Buffer;
  size: number;
  fileName?: string;
  createdBy: string;
  createdAt: string;
}

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/;

function magicMatches(mime: EvidenceMime, b: Buffer): boolean {
  if (mime === "image/jpeg") return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/png") return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return b.length > 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP";
}

/** Decode + verify an image data URL (type, magic bytes, ≤ EVIDENCE_MAX_BYTES). Throws 400. */
export function decodeImageDataUrl(dataUrl: string): { mime: EvidenceMime; data: Buffer } {
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) throw Errors.validation("Chỉ nhận ảnh JPEG, PNG hoặc WebP.");
  const mime = m[1] as EvidenceMime;
  const data = Buffer.from(m[2].replace(/\s+/g, ""), "base64");
  if (data.length === 0) throw Errors.validation("Ảnh minh chứng trống.");
  if (data.length > EVIDENCE_MAX_BYTES) {
    throw Errors.validation(`Ảnh quá lớn (${Math.ceil(data.length / 1024)} KB). Vui lòng chọn ảnh nhỏ hơn 700 KB.`);
  }
  if (!magicMatches(mime, data)) throw Errors.validation("Tệp tải lên không phải ảnh hợp lệ.");
  return { mime, data };
}

/** POST /api/evidence — store the image + audit UPLOAD_EVIDENCE in one batch. Returns the evidence id. */
export async function saveEvidence(ctx: ServiceCtx, input: EvidenceUploadData): Promise<string> {
  const { user } = ctx;
  requireAnyPermission(user, ["incident.create", "reward.create", "reward.propose"]);
  requireLevel(user, input.levelId);
  const { mime, data } = decodeImageDataUrl(input.dataUrl);
  const ref = db().collection(COL.evidence).doc();
  const doc: EvidenceDoc = { levelId: input.levelId, mime, data, size: data.length, createdBy: user.uid, createdAt: nowIso() };
  if (input.fileName) doc.fileName = input.fileName;
  const batch = db().batch();
  batch.create(ref, doc);
  writeAudit(
    batch,
    auditOf(user, "UPLOAD_EVIDENCE", { entity: "evidence", entityId: ref.id, levelId: input.levelId, ip: ctx.ip, detail: { mime, size: data.length, fileName: input.fileName } }),
  );
  await batch.commit();
  return ref.id;
}

/** GET /api/evidence/:id — the image bytes (level access required). */
export async function readEvidence(user: SessionUser, id: string): Promise<{ mime: EvidenceMime; data: Buffer; size: number; levelId: LevelId }> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw Errors.notFound("Không tìm thấy ảnh minh chứng.");
  const snap = await db().collection(COL.evidence).doc(id).get();
  if (!snap.exists) throw Errors.notFound("Không tìm thấy ảnh minh chứng.");
  const doc = snap.data() as EvidenceDoc;
  requireLevel(user, doc.levelId);
  const data = Buffer.isBuffer(doc.data) ? doc.data : Buffer.from(doc.data as Uint8Array);
  return { mime: doc.mime, data, size: data.length, levelId: doc.levelId };
}
