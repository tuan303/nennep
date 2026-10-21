/**
 * Integration-test helpers (Firebase emulators must be running: Firestore 127.0.0.1:8080, Auth 127.0.0.1:9099).
 *
 *   beforeAll(async () => {
 *     await setupTestProject("demo-test-mything");          // isolated emulator namespace, cleared
 *     await seedReference("THCS", { classes: ["7A01"], students: [{ id: "S1", name: "An", classCode: "7A01" }] });
 *   });
 *   const admin = await createTestUser({ uid: "admin", role: "ADMIN" });
 *   const res = await callRoute(POST, { method: "POST", url: "/api/incidents", body, token: admin.token });
 *
 * Tokens: unsigned emulator ID tokens (alg "none") with aud/iss = project id. firebase-admin accepts them when
 * FIREBASE_AUTH_EMULATOR_HOST is set, but (emulator mode) also looks the user up, so the Auth user must exist —
 * `tokenFor` / `createTestUser` create it first.
 */
import { NextRequest } from "next/server";
import { defaultLevelConfig } from "../../constants";
import { addDays, generateWeeks, mondayOf, todayVN } from "../../engine/dates";
import { COL } from "../../firestore-paths";
import type {
  CatalogItem,
  ClassInfo,
  GvcnClassRef,
  LevelConfig,
  LevelId,
  Role,
  SchoolWeek,
  Student,
  UserProfile,
} from "../../types";
import { invalidateProfileCache } from "../auth";
import { invalidateDatasetCache } from "../dataset";
import { rebuildStudentDigest } from "../digests";
import { adminAuth, currentProjectId, db, initAdminForTests, nowIso } from "../firebase-admin";
import { resetRateLimits } from "../rate-limit";
import { saveReferenceParts, type LevelReference } from "../reference";
import { resetLoginFailedState } from "../session";

const FIRESTORE_HOST = () => process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const AUTH_HOST = () => process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";

/** Delete every document and Auth account of an emulator project. */
export async function clearEmulatorProject(projectId: string): Promise<void> {
  const fs = await fetch(`http://${FIRESTORE_HOST()}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: "DELETE" });
  const au = await fetch(`http://${AUTH_HOST()}/emulator/v1/projects/${projectId}/accounts`, { method: "DELETE" });
  if (!fs.ok || !au.ok) throw new Error(`Cannot clear emulator project ${projectId} (${fs.status}/${au.status}). Are the emulators running?`);
}

/** Bind all server helpers to `projectId` (must start with "demo-"), clear its data and in-memory caches. */
export async function setupTestProject(projectId: string): Promise<{ projectId: string }> {
  if (!projectId.startsWith("demo-")) throw new Error('Test project ids must start with "demo-" (emulator only).');
  initAdminForTests(projectId);
  await clearEmulatorProject(projectId);
  invalidateProfileCache();
  invalidateDatasetCache();
  resetRateLimits();
  resetLoginFailedState();
  return { projectId };
}

/* --------------------------------- tokens --------------------------------- */

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** Unsigned emulator ID token for the current test project (user must exist in the Auth emulator). */
export function mintEmulatorIdToken(uid: string, email?: string, claims: Record<string, unknown> = {}): string {
  const projectId = currentProjectId();
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: `https://securetoken.google.com/${projectId}`,
    aud: projectId,
    auth_time: now,
    user_id: uid,
    sub: uid,
    iat: now,
    exp: now + 3600,
    firebase: { identities: email ? { email: [email] } : {}, sign_in_provider: "password" },
    ...claims,
  };
  if (email) {
    payload.email = email;
    payload.email_verified = true;
  }
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url(payload)}.`;
}

/** Ensure the Auth emulator user exists, then return an ID token for it. */
export async function tokenFor(uid: string, email?: string, claims?: Record<string, unknown>): Promise<string> {
  try {
    await adminAuth().createUser({ uid, ...(email ? { email } : {}) });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code !== "auth/uid-already-exists" && code !== "auth/email-already-exists") throw e;
  }
  return mintEmulatorIdToken(uid, email, claims);
}

export interface TestUserOptions {
  uid: string;
  role: Role;
  email?: string;
  displayName?: string;
  levels?: LevelId[];
  gvcnClasses?: GvcnClassRef[];
  active?: boolean;
  /** false → only the Auth user (no users/{uid} profile). Default true. */
  withProfile?: boolean;
}

/** Create Auth user + users/{uid} profile; returns the profile and a ready Bearer token. */
export async function createTestUser(o: TestUserOptions): Promise<{ uid: string; email: string; token: string; profile: UserProfile }> {
  const email = (o.email ?? `${o.uid}@nshm.test`).toLowerCase();
  const profile: UserProfile = {
    uid: o.uid,
    email,
    displayName: o.displayName ?? `Người dùng ${o.uid}`,
    role: o.role,
    levels: o.levels ?? [],
    gvcnClasses: o.gvcnClasses ?? [],
    active: o.active ?? true,
    createdAt: nowIso(),
  };
  if (o.withProfile !== false) await db().collection(COL.users).doc(o.uid).set(profile);
  invalidateProfileCache(o.uid);
  const token = await tokenFor(o.uid, email);
  return { uid: o.uid, email, token, profile };
}

/* ------------------------------- reference data ------------------------------- */

/** Catalog used by tests: L01 2đ/HS, L02 5đ/lần, L03 1đ/HS (5S), L04 3đ/lần (5S), L05 inactive. */
export const TEST_CATALOG: CatalogItem[] = [
  { code: "L01", category: "Chuyên cần – vệ sinh", issue: "Đi học muộn", penalty: 2, unit: "/HS", is5S: false, active: true, group: "Nhóm 1" },
  { code: "L02", category: "Nề nếp lớp học", issue: "Lớp mất trật tự", penalty: 5, unit: "/lần", is5S: false, active: true },
  { code: "L03", category: "Chuyên cần – vệ sinh", issue: "Không đeo thẻ", penalty: 1, unit: "/HS", is5S: true, active: true },
  { code: "L04", category: "Vệ sinh", issue: "Lớp bẩn", penalty: 3, unit: "/lần", is5S: true, active: true },
  { code: "L05", category: "Khác", issue: "Lỗi cũ", penalty: 1, unit: "/HS", is5S: false, active: false },
];

/** Config whose calendar always contains `today` (HK1: ~9 weeks ago → +30 days; HK2 afterwards). */
export function testConfig(levelId: LevelId, today: string = todayVN()): LevelConfig {
  const firstWeek = mondayOf(addDays(today, -63));
  return {
    ...defaultLevelConfig(levelId),
    firstWeek,
    semesters: [
      { code: "HK1", name: "Học kỳ I", start: firstWeek, end: addDays(today, 30) },
      { code: "HK2", name: "Học kỳ II", start: addDays(today, 31), end: addDays(today, 150) },
    ],
  };
}

export type SeedClass = Partial<ClassInfo> & { code: string };
export type SeedStudent = Partial<Student> & { id: string; name: string; classCode: string };

function gradeOf(code: string): number {
  const m = /^(\d{1,2})/.exec(code);
  return m ? Number(m[1]) : 0;
}

/**
 * Seed a level: config (+ generated weeks), classes, catalog (default TEST_CATALOG) and students
 * (ACTIVE by default). Writes canonical docs + `__ref`/`__stu` digests (bumps meta/versions).
 */
export async function seedReference(
  levelId: LevelId,
  opts: { classes?: Array<string | SeedClass>; catalog?: CatalogItem[]; students?: SeedStudent[]; config?: Partial<LevelConfig>; weeks?: SchoolWeek[] } = {},
): Promise<LevelReference> {
  const config: LevelConfig = { ...testConfig(levelId), ...(opts.config ?? {}), levelId };
  const classes: ClassInfo[] = (opts.classes ?? []).map((c, i) => {
    const s: SeedClass = typeof c === "string" ? { code: c } : c;
    return { levelId, grade: gradeOf(s.code), active: true, order: i, ...s };
  });
  const ref = await saveReferenceParts(levelId, {
    config,
    classes,
    catalog: opts.catalog ?? TEST_CATALOG,
    weeks: opts.weeks ?? generateWeeks(config.firstWeek, config.semesters),
  });
  const students = opts.students ?? [];
  if (students.length > 0) {
    const batch = db().batch();
    const now = nowIso();
    for (const s of students) {
      const student: Student = {
        levelId,
        grade: gradeOf(s.classCode),
        status: "ACTIVE",
        history: [],
        createdAt: now,
        updatedAt: now,
        ...s,
      };
      batch.set(db().collection(COL.students).doc(s.id), student);
    }
    await batch.commit();
  }
  await rebuildStudentDigest(levelId);
  return ref;
}

/* --------------------------------- routes --------------------------------- */

export interface CallOptions {
  method?: string;
  /** Path or absolute URL; relative paths are resolved against http://localhost:3000. */
  url?: string;
  body?: unknown;
  token?: string;
  /** Dynamic route params, e.g. { id: "THCS_NN-20261020-0001" }. */
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface CallResult<T> {
  status: number;
  headers: Headers;
  /** Parsed JSON when the response is JSON, otherwise undefined. */
  body: T;
  text: string;
  bytes: Buffer;
  response: Response;
}

/** Any Next route handler (Promise<never> accepts every params shape). */
type AnyRoute = (req: NextRequest, ctx: { params: Promise<never> }) => Promise<Response>;

/** Invoke a Next route handler function directly with a NextRequest. */
export async function callRoute<T = unknown>(handler: AnyRoute, opts: CallOptions = {}): Promise<CallResult<T>> {
  const url = new URL(opts.url ?? "/", "http://localhost:3000");
  const headers: Record<string, string> = { "x-forwarded-for": "203.0.113.7", ...(opts.headers ?? {}) };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  let body: string | undefined;
  if (opts.body !== undefined) {
    body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    headers["content-type"] ??= "application/json";
  }
  const req = new NextRequest(url, { method: opts.method ?? "GET", headers, body });
  const response = await handler(req, { params: Promise.resolve(opts.params ?? {}) as Promise<never> });
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = bytes.toString("utf8");
  const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
  return { status: response.status, headers: response.headers, body: (isJson && text ? JSON.parse(text) : undefined) as T, text, bytes, response };
}

/* -------------------------------- inspection -------------------------------- */

/** All docs of a collection (test assertions). */
export async function listDocs<T>(collection: string): Promise<Array<T & { __id: string }>> {
  const snap = await db().collection(collection).get();
  return snap.docs.map((d) => ({ ...(d.data() as T), __id: d.id }));
}

export async function getDoc<T>(collection: string, id: string): Promise<T | undefined> {
  const snap = await db().collection(collection).doc(id).get();
  return snap.exists ? (snap.data() as T) : undefined;
}
