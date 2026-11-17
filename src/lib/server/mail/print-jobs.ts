/**
 * Short-lived print jobs of report PDFs (doc printJobs/{nonce}). The headless browser prints the public page
 * /in/bao-cao/{nonce}, which has no session: the unguessable nonce IS the authorisation, so a job lives
 * PRINT_JOB_TTL_MS at most and is deleted right after the PDF was rendered. The cron removes leftovers
 * (deleteStalePrintJobs).
 *
 * The nonce is self-authenticating – 16 random bytes + the first 16 bytes of HMAC-SHA256(key, random), 64 hex
 * characters – so a forged one is rejected without touching Firestore (the page is public: guessing must not cost
 * reads). The key is derived (HKDF) from secrets every instance of a deployment shares, because Chromium fetches the
 * page through the public URL and may reach another instance: see printKeyMaterial (print-key.ts). Without a key,
 * PrintKeyMissingError. Never log the key.
 */
import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import type { DocumentReference } from "firebase-admin/firestore";
import { COL } from "../../firestore-paths";
import type { LevelId, ReportJobPayload } from "../../types";
import { db, isEmulatorMode } from "../firebase-admin";
import { checkRateLimit } from "../rate-limit";
import { BATCH_LIMIT } from "../write";
import { PrintKeyMissingError, printKeyMaterial, printKeyProblem } from "./print-key";

export { PRINT_JOB_SECRET_MIN_LENGTH, PRINT_KEY_MISSING, PRINT_KEY_TOO_SHORT, PrintKeyMissingError, printKeyMaterial } from "./print-key";

/** A print job is readable for 3 minutes after its creation. */
export const PRINT_JOB_TTL_MS = 3 * 60_000;
/** The cron deletes print jobs older than 1 hour (left behind by a crashed render). */
export const PRINT_JOB_STALE_MS = 60 * 60_000;

/** What the print page renders: a report email job of a level (the viewer's rights decide the content). */
export type PrintJobSpec = ReportJobPayload & { levelId: LevelId };

export interface PrintJob {
  spec: PrintJobSpec;
  createdAt: string; // ISO
  expiresAt: string; // ISO, createdAt + PRINT_JOB_TTL_MS
}

const NONCE_RANDOM_BYTES = 16;
const NONCE_TAG_BYTES = 16;
const NONCE_RE = /^[0-9a-f]{64}$/;

/** HKDF context of the nonce key (changing it invalidates the nonces in flight – they live 3 minutes anyway). */
const PRINT_KEY_INFO = "nshm-nennep/print-job-nonce/v1";

/** The 32-byte MAC key (HKDF-SHA256 of printKeyMaterial), undefined when none is available. */
function printJobKey(): Buffer | undefined {
  const material = printKeyMaterial(process.env, isEmulatorMode());
  return material === undefined ? undefined : Buffer.from(hkdfSync("sha256", material, "", PRINT_KEY_INFO, 32));
}

function nonceTag(key: Buffer, random: Buffer): Buffer {
  return createHmac("sha256", key).update(random).digest().subarray(0, NONCE_TAG_BYTES);
}

export function printJobRef(nonce: string): DocumentReference {
  return db().collection(COL.printJobs).doc(nonce);
}

/**
 * 64 lower-case hex characters: 16 random bytes + their 16-byte MAC. Throws PrintKeyMissingError without a key (no
 * source set, or a PRINT_JOB_SECRET that is too short – each with its own log message, never the value).
 */
export function newPrintNonce(): string {
  const key = printJobKey();
  if (!key) throw new PrintKeyMissingError(printKeyProblem(process.env, isEmulatorMode()) ?? "missing");
  const random = randomBytes(NONCE_RANDOM_BYTES);
  return Buffer.concat([random, nonceTag(key, random)]).toString("hex");
}

/**
 * Is this a nonce issued by this deployment? Shape + MAC (constant-time compare), no Firestore access: anything else
 * – a forged or altered value, or no key at all – is never looked up.
 */
export function isPrintNonce(value: string): boolean {
  if (!NONCE_RE.test(value)) return false;
  const key = printJobKey();
  if (!key) return false;
  const raw = Buffer.from(value, "hex");
  return timingSafeEqual(raw.subarray(NONCE_RANDOM_BYTES), nonceTag(key, raw.subarray(0, NONCE_RANDOM_BYTES)));
}

/**
 * Loads of one print job by the print page (per instance, over its lifetime): a job is printed exactly once – one
 * navigation of Chromium, one load per request (generateMetadata + page share it) – so anything beyond a few is a
 * replay of a leaked nonce.
 */
export const PRINT_NONCE_RATE = { limit: 5, windowMs: PRINT_JOB_TTL_MS } as const;

/** The stored doc of a new job (optional payload fields omitted, never null). */
export function printJobDoc(spec: PrintJobSpec, now: number = Date.now()): PrintJob {
  const clean = Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined)) as PrintJobSpec;
  return { spec: clean, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + PRINT_JOB_TTL_MS).toISOString() };
}

/** True while the job may still be printed. */
export function isPrintJobLive(job: Pick<PrintJob, "expiresAt">, now: number = Date.now()): boolean {
  const expires = Date.parse(job.expiresAt);
  return Number.isFinite(expires) && expires > now;
}

/** Stores a new print job and returns its nonce. */
export async function createPrintJob(spec: PrintJobSpec, now: number = Date.now()): Promise<string> {
  const nonce = newPrintNonce();
  await printJobRef(nonce).create(printJobDoc(spec, now));
  return nonce;
}

/** The stored job of a nonce whose MAC was checked; null when unknown or expired. */
async function lookupPrintJob(nonce: string, now: number): Promise<PrintJob | null> {
  const snap = await printJobRef(nonce).get();
  if (!snap.exists) return null;
  const job = snap.data() as PrintJob;
  return job.spec && isPrintJobLive(job, now) ? job : null;
}

/** The job of a nonce; null when the nonce is forged / malformed (no read at all), unknown or expired. */
export async function readPrintJob(nonce: string, now: number = Date.now()): Promise<PrintJob | null> {
  return isPrintNonce(nonce) ? lookupPrintJob(nonce, now) : null;
}

/**
 * The job the public print page renders (src/app/in/bao-cao/[job]/page.tsx). The MAC is checked first: a forged or
 * malformed nonce is answered with no Firestore read and no limiter bookkeeping. A valid nonce – which only this server
 * can issue – is then limited per nonce (PRINT_NONCE_RATE), never per client address: every render of every drain and
 * "Tải PDF" reaches the page from the server's own egress address, so an address limit would refuse our own Chromium.
 */
export async function readPrintJobForPage(nonce: string, now: number = Date.now()): Promise<PrintJob | null> {
  if (!isPrintNonce(nonce)) return null;
  if (!checkRateLimit(`print-nonce:${nonce}`, PRINT_NONCE_RATE.limit, PRINT_NONCE_RATE.windowMs, now).ok) return null;
  return lookupPrintJob(nonce, now);
}

export async function deletePrintJob(nonce: string): Promise<void> {
  if (!isPrintNonce(nonce)) return;
  await printJobRef(nonce).delete();
}

/** Deletes print jobs created more than `maxAgeMs` ago (cron); returns how many were deleted. */
export async function deleteStalePrintJobs(maxAgeMs: number = PRINT_JOB_STALE_MS, now: number = Date.now()): Promise<number> {
  const cutoff = new Date(now - maxAgeMs).toISOString();
  let deleted = 0;
  for (;;) {
    const snap = await db().collection(COL.printJobs).where("createdAt", "<", cutoff).limit(BATCH_LIMIT).get();
    if (snap.empty) return deleted;
    const batch = db().batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
    deleted += snap.size;
    if (snap.size < BATCH_LIMIT) return deleted;
  }
}
