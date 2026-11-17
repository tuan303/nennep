/**
 * Key material of the print-job nonces (pure, no Firestore): which environment variable provides it, and why there is
 * none. Without a key no print job can be created, so report emails go out without their PDF at once
 * (PrintKeyMissingError, see report-job.ts sendWithoutPdf), "Tải PDF" answers with its own message, and Cài đặt → Email
 * shows the reason (MailStatus.pdfWarning). Never log or return the key itself.
 */

/** Minimum length of the optional PRINT_JOB_SECRET. */
export const PRINT_JOB_SECRET_MIN_LENGTH = 32;
/** Emulator runs only (no real project, no credentials): a fixed development key. */
const EMULATOR_PRINT_KEY_MATERIAL = "emulator:nshm-nennep print-job key (development only)";

/** Server log message when no key source is set at all (no secret in it). */
export const PRINT_KEY_MISSING =
  "Report PDFs need a print-job key: set PRINT_JOB_SECRET (at least 32 characters) or the Firebase service-account " +
  "variables (FIREBASE_SERVICE_ACCOUNT_BASE64 or FIREBASE_PRIVATE_KEY).";
/** Server log message when PRINT_JOB_SECRET is set but too short – the value itself is never logged. */
export const PRINT_KEY_TOO_SHORT =
  `Report PDFs are off: PRINT_JOB_SECRET is set but shorter than ${PRINT_JOB_SECRET_MIN_LENGTH} characters. Use at least ` +
  `${PRINT_JOB_SECRET_MIN_LENGTH} characters, or remove it so that the Firebase service-account key is used.`;

/** Why no key is available: nothing set, or a PRINT_JOB_SECRET below PRINT_JOB_SECRET_MIN_LENGTH. */
export type PrintKeyProblem = "missing" | "too-short";

/** Vietnamese reason shown after "File PDF đính kèm đang tắt:" in Cài đặt → Email (MailStatus.pdfWarning). */
export const PRINT_KEY_WARNING: Readonly<Record<PrintKeyProblem, string>> = {
  missing:
    "máy chủ chưa có khóa tạo file PDF. Quản trị CNTT đặt biến môi trường PRINT_JOB_SECRET (ít nhất 32 ký tự) hoặc các biến " +
    "tài khoản dịch vụ Firebase trên Vercel rồi triển khai lại (Redeploy).",
  "too-short":
    "biến môi trường PRINT_JOB_SECRET ngắn hơn 32 ký tự. Quản trị CNTT đặt giá trị dài ít nhất 32 ký tự (hoặc xóa biến này) " +
    "trên Vercel rồi triển khai lại (Redeploy).",
};

/** No print-job key: nothing can be printed in this deployment until the environment is fixed (never retried). */
export class PrintKeyMissingError extends Error {
  constructor(readonly problem: PrintKeyProblem) {
    super(problem === "too-short" ? PRINT_KEY_TOO_SHORT : PRINT_KEY_MISSING);
    this.name = "PrintKeyMissingError";
  }
}

export const isPrintKeyMissingError = (e: unknown): e is PrintKeyMissingError => e instanceof PrintKeyMissingError;

/** The emulator switch of `env` (same variables as firebase-admin's isEmulatorMode, for an explicit environment). */
export function isEmulatorEnv(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST);
}

/**
 * Input key material of the nonce MAC, the same on every instance of a deployment, in this order:
 * PRINT_JOB_SECRET (optional, ≥ PRINT_JOB_SECRET_MIN_LENGTH characters) → the Firebase service-account credential the
 * server already uses (FIREBASE_SERVICE_ACCOUNT_BASE64, then FIREBASE_PRIVATE_KEY) → on the emulators only, a fixed
 * development value. `undefined` = none available (fail closed: no nonce is issued or accepted; printKeyProblem says
 * why). Each source is prefixed so two sources never yield the same key.
 */
export function printKeyMaterial(env: NodeJS.ProcessEnv = process.env, emulator: boolean = isEmulatorEnv(env)): string | undefined {
  const secret = env.PRINT_JOB_SECRET?.trim();
  if (secret) return secret.length >= PRINT_JOB_SECRET_MIN_LENGTH ? `secret:${secret}` : undefined;
  const serviceAccount = env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (serviceAccount) return `service-account:${serviceAccount}`;
  const privateKey = env.FIREBASE_PRIVATE_KEY?.trim();
  if (privateKey) return `private-key:${privateKey}`;
  return emulator ? EMULATOR_PRINT_KEY_MATERIAL : undefined;
}

/** Why printKeyMaterial has nothing (undefined when a key is available). A too short secret is never skipped silently. */
export function printKeyProblem(env: NodeJS.ProcessEnv = process.env, emulator: boolean = isEmulatorEnv(env)): PrintKeyProblem | undefined {
  if (printKeyMaterial(env, emulator) !== undefined) return undefined;
  return env.PRINT_JOB_SECRET?.trim() ? "too-short" : "missing";
}
