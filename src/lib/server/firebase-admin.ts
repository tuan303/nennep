/**
 * Lazy firebase-admin singleton (Node runtime only).
 *
 * - Emulators (FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST set): app with projectId only.
 * - Production: FIREBASE_SERVICE_ACCOUNT_BASE64 (whole JSON, base64) or
 *   FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY ("\n" sequences unescaped).
 * - Tests: initAdminForTests(projectId) switches every helper to a named app bound to that project id,
 *   so test files can use isolated emulator namespaces.
 */
import { cert, getApps, initializeApp, type App, type AppOptions } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { FieldValue, Timestamp, initializeFirestore, type Firestore } from "firebase-admin/firestore";

export { FieldValue, Timestamp };

const DEFAULT_APP_NAME = "[DEFAULT]";

interface AdminGlobals {
  currentAppName?: string;
  configuredDbs?: WeakSet<Firestore>;
}

/** Survives Next.js dev hot reloads (module state is reset, firebase-admin's app registry is not). */
const g = globalThis as typeof globalThis & { __nshmAdmin?: AdminGlobals };
const state: AdminGlobals = (g.__nshmAdmin ??= {});

function usingEmulators(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);
}

interface ServiceAccountJson {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

function stripQuotes(s: string): string {
  const t = s.trim();
  return (t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")) ? t.slice(1, -1) : t;
}

/** Resolve AppOptions from the environment (exported for diagnostics/tests). */
export function adminOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): AppOptions {
  const projectId = env.FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || undefined;
  if (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST) {
    return { projectId: projectId ?? "demo-nshm-nennep" };
  }
  const b64 = env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (b64) {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as ServiceAccountJson;
    if (!json.client_email || !json.private_key) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 does not contain client_email/private_key");
    }
    const pid = json.project_id ?? projectId;
    return {
      credential: cert({ projectId: pid, clientEmail: json.client_email, privateKey: json.private_key }),
      projectId: pid,
    };
  }
  const clientEmail = env.FIREBASE_CLIENT_EMAIL?.trim();
  const rawKey = env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && rawKey) {
    const privateKey = stripQuotes(rawKey).replace(/\\n/g, "\n");
    return { credential: cert({ projectId, clientEmail, privateKey }), projectId };
  }
  throw new Error(
    "Firebase Admin is not configured: set FIREBASE_SERVICE_ACCOUNT_BASE64 or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY (or emulator hosts).",
  );
}

/** The firebase-admin App used by every server helper (lazy). */
export function adminApp(): App {
  const name = state.currentAppName ?? DEFAULT_APP_NAME;
  const existing = getApps().find((a) => a.name === name);
  if (existing) return existing;
  if (name !== DEFAULT_APP_NAME) throw new Error(`firebase-admin app "${name}" is not initialised`);
  return initializeApp(adminOptionsFromEnv());
}

/** Firestore of the current app; `ignoreUndefinedProperties: true` is applied exactly once per instance. */
export function db(): Firestore {
  const app = adminApp();
  // preferRest avoids loading gRPC on serverless cold starts (transactions work over REST). The REST
  // transport does not use emulator credentials, so emulators keep gRPC. FIRESTORE_PREFER_REST=false opts out.
  const preferRest = !usingEmulators() && process.env.FIRESTORE_PREFER_REST !== "false";
  const firestore = initializeFirestore(app, { preferRest });
  const configured = (state.configuredDbs ??= new WeakSet<Firestore>());
  if (!configured.has(firestore)) {
    configured.add(firestore);
    firestore.settings({ ignoreUndefinedProperties: true });
  }
  return firestore;
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}

export function isEmulatorMode(): boolean {
  return usingEmulators();
}

/** Current ISO timestamp (single place so tests/readers agree on the format). */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Convert a Firestore Timestamp / Date / ISO string into an ISO string ("" when absent). */
export function toIso(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return "";
}

/**
 * TESTS ONLY: bind all helpers to a named app for `projectId` (emulators must be configured).
 * Sets FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST to the local defaults when missing.
 */
export function initAdminForTests(projectId: string): App {
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  const name = `test:${projectId}`;
  const app = getApps().find((a) => a.name === name) ?? initializeApp({ projectId }, name);
  state.currentAppName = name;
  return app;
}

/** Project id of the current app (used by test helpers to mint emulator tokens). */
export function currentProjectId(): string {
  const pid = adminApp().options.projectId;
  if (!pid) throw new Error("firebase-admin app has no projectId");
  return pid;
}
