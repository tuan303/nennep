/**
 * Small helpers shared by the admin services (students, imports, users, settings, maintenance).
 */
import type { DocumentReference, DocumentSnapshot } from "firebase-admin/firestore";
import { LEVELS } from "../../constants";
import { zLevelId } from "../../contract";
import { COL } from "../../firestore-paths";
import type { ClassInfo, LevelId, Student, UserProfile } from "../../types";
import type { SessionUser } from "../auth";
import { Errors } from "../errors";
import { db } from "../firebase-admin";

/** Firestore `getAll` accepts many refs, but keep requests reasonably small. */
export const GET_ALL_CHUNK = 300;

export function chunk<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** Plain (non-transactional) getAll in chunks; snapshots are returned in the order of `refs`. */
export async function getAllChunked(refs: readonly DocumentReference[]): Promise<DocumentSnapshot[]> {
  const out: DocumentSnapshot[] = [];
  for (const part of chunk(refs, GET_ALL_CHUNK)) {
    if (part.length > 0) out.push(...(await db().getAll(...part)));
  }
  return out;
}

export function studentDocRef(id: string): DocumentReference {
  return db().collection(COL.students).doc(id);
}

/** Every student document of a level (all statuses). */
export async function loadLevelStudents(levelId: LevelId): Promise<Map<string, Student>> {
  const snap = await db().collection(COL.students).where("levelId", "==", levelId).get();
  return new Map(snap.docs.map((d) => [d.id, d.data() as Student]));
}

/** Students with these ids that belong to ANOTHER level (id → { levelId, classCode }). */
export async function findStudentsInOtherLevels(levelId: LevelId, ids: readonly string[]): Promise<Map<string, Pick<Student, "levelId" | "classCode">>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const snaps = await getAllChunked(unique.map(studentDocRef));
  const out = new Map<string, Pick<Student, "levelId" | "classCode">>();
  for (const s of snaps) {
    if (!s.exists) continue;
    const st = s.data() as Student;
    if (st.levelId !== levelId) out.set(s.id, { levelId: st.levelId, classCode: st.classCode });
  }
  return out;
}

/** Full documents of the students with these ids that belong to ANOTHER level (id → Student). */
export async function loadStudentsInOtherLevels(levelId: LevelId, ids: readonly string[]): Promise<Map<string, Student>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const snaps = await getAllChunked(unique.map(studentDocRef));
  const out = new Map<string, Student>();
  for (const s of snaps) {
    if (!s.exists) continue;
    const st = s.data() as Student;
    if (st.levelId !== levelId) out.set(s.id, st);
  }
  return out;
}

/** Key used to match class codes typed by people: upper-case, no spaces. */
export function classKey(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

/** Resolve a class code exactly, then ignoring case/spaces. */
export function makeClassLookup<T extends { code: string }>(classes: Iterable<T>): (code: string | undefined) => T | undefined {
  const exact = new Map<string, T>();
  const loose = new Map<string, T>();
  for (const c of classes) {
    exact.set(c.code, c);
    if (!loose.has(classKey(c.code))) loose.set(classKey(c.code), c);
  }
  return (code) => {
    if (!code) return undefined;
    const t = code.trim();
    return exact.get(t) ?? loose.get(classKey(t));
  };
}

export function gradeAllowed(levelId: LevelId, grade: number): boolean {
  return LEVELS[levelId].grades.includes(grade);
}

/** Problems of a class used for a student/record: unknown or inactive. Returns a Vietnamese message or "". */
export function classProblem(code: string, cls: Pick<ClassInfo, "code" | "active"> | undefined): string {
  if (!cls) return `Lớp ${code} không có trong danh mục lớp.`;
  if (!cls.active) return `Lớp ${cls.code} đã ngừng hoạt động.`;
  return "";
}

export const STATUS_TEXT_ACTIVE = "Đang học";

/** A trusted in-process actor (seed / maintenance scripts) shaped like a signed-in ADMIN. */
export function systemUser(email: string, displayName = "Hệ thống", uid = "system"): SessionUser {
  const profile: UserProfile = {
    uid,
    email: email.toLowerCase(),
    displayName,
    role: "ADMIN",
    levels: [],
    gvcnClasses: [],
    active: true,
    createdAt: new Date(0).toISOString(),
  };
  return { uid, email: profile.email, profile };
}

/** Collapse inner whitespace and trim (names typed or imported from Excel). */
export function cleanText(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Run `fn` over `items` with at most `limit` calls in flight; results keep the input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Firebase Auth / Firestore error code ("auth/user-not-found", 6 …) or undefined. */
export function errorCode(e: unknown): string | number | undefined {
  if (typeof e === "object" && e !== null && "code" in e) {
    const c = (e as { code: unknown }).code;
    if (typeof c === "string" || typeof c === "number") return c;
  }
  return undefined;
}

/** `[level]` route segment → LevelId (400 otherwise). */
export function levelFromParam(raw: string | undefined): LevelId {
  const parsed = zLevelId.safeParse(raw ?? "");
  if (!parsed.success) throw Errors.validation("Cấp học không hợp lệ (TH, THCS hoặc THPT).");
  return parsed.data;
}
