/**
 * GVCN addresses of a class = email of every ACTIVE GVCN account whose gvcnClasses include the class
 * ∪ ClassInfo.homeroomEmail (Cài đặt → Lớp; may hold several addresses), normalised and deduplicated, then split by
 * the effective allowed domains (Cài đặt → Email "Tên miền được phép", or the sender's domain – the same computation as
 * mailStatus, so the coverage, the report dialog and the notices agree).
 * A notice (classRecipients) reads only the accounts assigned to its class; the lists of every class (report dialog,
 * coverage) read every GVCN account. Both are loaded once per `cache` (one cache per drain / per request).
 */
import type { ReportMailClassRecipients } from "../../contract";
import { COL } from "../../firestore-paths";
import { dedupeEmails, effectiveAllowedDomains, isEmail, parseEmailList, partitionByDomain } from "../../mail/address";
import type { ClassInfo, GvcnClassRef, LevelId, MailSettings, UserProfile } from "../../types";
import { db } from "../firebase-admin";
import { loadReference } from "../reference";
import { mailSenderAddress } from "./transport";

/** Per-drain / per-request memo (DrainContext.cache). */
export type RecipientCache = Map<string, unknown>;

export interface SplitRecipients {
  allowed: string[];
  /** Addresses dropped because their domain is not allowed. */
  blocked: string[];
}

function memo<T>(cache: RecipientCache, key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit instanceof Promise) return hit as Promise<T>;
  const promise = load();
  cache.set(key, promise);
  promise.catch(() => {
    if (cache.get(key) === promise) cache.delete(key);
  });
  return promise;
}

/** Every active GVCN account (the school has a few hundred at most). */
function gvcnAccounts(cache: RecipientCache): Promise<UserProfile[]> {
  return memo(cache, "recipients:gvcn", async () => {
    const snap = await db().collection(COL.users).where("role", "==", "GVCN").get();
    return snap.docs.map((d) => d.data() as UserProfile).filter((u) => u.active);
  });
}

/**
 * Accounts assigned to one class (any role / state: gvcnEmailsOfClass filters). Every write path stores the entries
 * of gvcnClasses as exactly { levelId, classCode } (dedupeClasses / bulk GVCN), so this equality matches; the
 * automatic single-field index serves it. A notice costs 1-2 reads here instead of one per GVCN account of the school.
 */
function classAccounts(levelId: LevelId, classCode: string, cache: RecipientCache): Promise<UserProfile[]> {
  return memo(cache, `recipients:class:${levelId}|${classCode}`, async () => {
    const ref: GvcnClassRef = { levelId, classCode };
    const snap = await db().collection(COL.users).where("gvcnClasses", "array-contains", ref).get();
    return snap.docs.map((d) => d.data() as UserProfile);
  });
}

function levelClasses(levelId: LevelId, cache: RecipientCache): Promise<ClassInfo[]> {
  return memo(cache, `recipients:classes:${levelId}`, async () => (await loadReference(levelId)).classes);
}

/** Allowed recipient domains of a level for the current sender (same as mailStatus().allowedDomains). */
export function allowedDomainsOf(settings: Pick<MailSettings, "allowedDomains">, env: NodeJS.ProcessEnv = process.env): string[] {
  return effectiveAllowedDomains(settings.allowedDomains, mailSenderAddress(env));
}

/** GVCN addresses of one class (pure): matching active GVCN accounts first, then the class list's homeroom email. */
export function gvcnEmailsOfClass(
  levelId: LevelId,
  classCode: string,
  accounts: readonly Pick<UserProfile, "email" | "active" | "role" | "gvcnClasses">[],
  classInfo?: Pick<ClassInfo, "homeroomEmail">,
): string[] {
  const fromAccounts = accounts
    .filter((u) => u.active && u.role === "GVCN" && u.gvcnClasses.some((c) => c.levelId === levelId && c.classCode === classCode))
    .map((u) => u.email);
  const fromClassList = parseEmailList(classInfo?.homeroomEmail ?? "").valid;
  return dedupeEmails([...fromAccounts, ...fromClassList]).filter(isEmail);
}

/** GVCN addresses of a class split by the allowed domains of the level. */
export async function classRecipients(levelId: LevelId, classCode: string, settings: Pick<MailSettings, "allowedDomains">, cache: RecipientCache = new Map()): Promise<SplitRecipients> {
  const [accounts, classes] = await Promise.all([classAccounts(levelId, classCode, cache), levelClasses(levelId, cache)]);
  const emails = gvcnEmailsOfClass(levelId, classCode, accounts, classes.find((c) => c.code === classCode));
  return partitionByDomain(emails, allowedDomainsOf(settings));
}

/** Recipients of every ACTIVE class of a level (report dialog, coverage line of Cài đặt → Email). */
export async function allClassRecipients(
  levelId: LevelId,
  settings: Pick<MailSettings, "allowedDomains">,
  cache: RecipientCache = new Map(),
): Promise<{ classes: ReportMailClassRecipients[]; blocked: string[] }> {
  const [accounts, classes] = await Promise.all([gvcnAccounts(cache), levelClasses(levelId, cache)]);
  const domains = allowedDomainsOf(settings);
  const blocked = new Set<string>();
  const rows = classes
    .filter((c) => c.active)
    .map((c): ReportMailClassRecipients => {
      const split = partitionByDomain(gvcnEmailsOfClass(levelId, c.code, accounts, c), domains);
      for (const b of split.blocked) blocked.add(b);
      const row: ReportMailClassRecipients = { classCode: c.code, grade: c.grade, recipients: split.allowed, missing: split.allowed.length === 0 };
      if (c.homeroomTeacher) row.teacher = c.homeroomTeacher;
      return row;
    });
  return { classes: rows, blocked: [...blocked] };
}
