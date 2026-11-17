/**
 * Cài đặt → Email of a level: doc mailSettings/{levelId} (MailSettings). A missing doc – or missing fields of an older
 * doc – read as the defaults: notices off (incidents + rewards ticked), empty recipient lists, no domain list, rev 0.
 * Reads are cached per instance for MAIL_SETTINGS_CACHE_TTL_MS (every queued notice checks them); every save outcome
 * (stored, unchanged, 409 stale) invalidates. The editor reads fresh (`{ fresh: true }`): its rev is the next baseRev.
 * A PUT replaces the whole settings in one transaction (doc + audit UPDATE_MAIL_SETTINGS with counts only, never
 * addresses); `rev` +1 per save, `baseRev` (omitted = 0, i.e. "never saved") → 409 when stale; an identical save
 * writes nothing.
 */
import type { DocumentReference } from "firebase-admin/firestore";
import type { z } from "zod";
import { LEVELS } from "../../constants";
import type { MailSettingsSchema } from "../../contract";
import { COL } from "../../firestore-paths";
import { dedupeEmails } from "../../mail/address";
import type { LevelId, MailSettings } from "../../types";
import { auditDiff, auditOf, writeAudit } from "../audit";
import { requireLevel, requirePermission } from "../auth";
import { Errors } from "../errors";
import { currentProjectId, db, nowIso } from "../firebase-admin";
import { assertBaseRev, type ServiceCtx } from "../records";
import { runTx } from "../write";

export type MailSettingsData = z.output<typeof MailSettingsSchema>;

export const MAIL_SETTINGS_MSG = {
  stale: "Cài đặt email vừa được người khác cập nhật. Vui lòng tải lại để xem bản mới nhất rồi lưu lại.",
  gradesOutside: (grades: readonly string[], levelName: string) => `Khối ${grades.join(", ")} không thuộc cấp ${levelName}.`,
} as const;

/** Compared to decide whether a save changes anything. */
const CONTENT_FIELDS = ["notices", "report", "allowedDomains"] as const satisfies ReadonlyArray<keyof MailSettings>;

const MAIL_SETTINGS_CACHE_TTL_MS = 30_000;

const cache = new Map<string, { expires: number; promise: Promise<MailSettings> }>();

function mailSettingsRef(levelId: LevelId): DocumentReference {
  return db().collection(COL.mailSettings).doc(levelId);
}

function defaultMailSettings(levelId: LevelId): MailSettings {
  return {
    levelId,
    notices: { enabled: false, incidents: true, rewards: true },
    report: { bgh: [], grades: {}, cc: [] },
    allowedDomains: [],
    rev: 0,
  };
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const record = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Stored data (possibly partial / older shape) merged over the defaults. */
function mailSettingsFrom(levelId: LevelId, data: unknown): MailSettings {
  const d = defaultMailSettings(levelId);
  if (data === undefined) return d;
  const raw = record(data);
  const notices = record(raw.notices);
  const report = record(raw.report);
  const grades = Object.fromEntries(Object.entries(record(report.grades)).map(([grade, list]) => [grade, strings(list)]));
  const settings: MailSettings = {
    levelId,
    notices: {
      enabled: bool(notices.enabled, d.notices.enabled),
      incidents: bool(notices.incidents, d.notices.incidents),
      rewards: bool(notices.rewards, d.notices.rewards),
    },
    report: { bgh: strings(report.bgh), grades, cc: strings(report.cc) },
    allowedDomains: strings(raw.allowedDomains),
    rev: typeof raw.rev === "number" && Number.isFinite(raw.rev) ? raw.rev : 0,
  };
  if (typeof raw.updatedAt === "string" && raw.updatedAt) settings.updatedAt = raw.updatedAt;
  if (typeof raw.updatedBy === "string" && raw.updatedBy) settings.updatedBy = raw.updatedBy;
  return settings;
}

const cacheKey = (levelId: LevelId) => `${currentProjectId()}|${levelId}`;

/**
 * Mail settings of a level (defaults when never saved). Shared by the cache: treat the result as read-only.
 * `fresh` skips a cached entry (still reads Firestore and refreshes the cache) – for the settings editor, whose rev
 * must be the stored one; notices, drains and reports accept up to MAIL_SETTINGS_CACHE_TTL_MS of staleness.
 */
export async function loadMailSettings(levelId: LevelId, opts: { fresh?: boolean } = {}): Promise<MailSettings> {
  const key = cacheKey(levelId);
  const now = Date.now();
  const hit = cache.get(key);
  if (!opts.fresh && hit && hit.expires > now) return hit.promise;
  const promise = mailSettingsRef(levelId)
    .get()
    .then((snap) => mailSettingsFrom(levelId, snap.exists ? snap.data() : undefined));
  cache.set(key, { expires: now + MAIL_SETTINGS_CACHE_TTL_MS, promise });
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  return promise;
}

/** Drop the cached settings of one level, or of every level (no argument). Call after every save. */
export function invalidateMailSettingsCache(levelId?: LevelId): void {
  if (!levelId) cache.clear();
  else for (const key of [...cache.keys()]) if (key.endsWith(`|${levelId}`)) cache.delete(key);
}

/**
 * report.grades of the input keyed by String(grade) of the level only (400 for other grades), in grade order, empty
 * lists dropped ("06" and "6" are the same grade).
 */
function canonicalGrades(levelId: LevelId, grades: Record<string, string[]>): Record<string, string[]> {
  const level = LEVELS[levelId];
  const byGrade = new Map<number, string[]>();
  const outside: string[] = [];
  for (const [key, list] of Object.entries(grades)) {
    const grade = Number(key);
    if (!level.grades.includes(grade)) outside.push(key);
    else byGrade.set(grade, [...(byGrade.get(grade) ?? []), ...list]);
  }
  if (outside.length > 0) {
    const message = MAIL_SETTINGS_MSG.gradesOutside(outside, level.name);
    throw Errors.validation(message, [{ path: "report.grades", message }]);
  }
  const out: Record<string, string[]> = {};
  for (const grade of level.grades) {
    const list = dedupeEmails(byGrade.get(grade) ?? []);
    if (list.length > 0) out[String(grade)] = list;
  }
  return out;
}

/** Audit detail of a save: switches and list sizes only (never an address). */
function auditDetail(s: MailSettings, changed: readonly string[]): Record<string, unknown> {
  return {
    changed,
    notices: s.notices,
    bgh: s.report.bgh.length,
    grades: Object.fromEntries(Object.entries(s.report.grades).map(([g, list]) => [g, list.length])),
    cc: s.report.cc.length,
    allowedDomains: s.allowedDomains.length,
  };
}

/** PUT /api/settings/:level/mail (settings.manage + level). Returns the stored settings. */
export async function saveMailSettings(ctx: ServiceCtx, levelId: LevelId, input: MailSettingsData): Promise<MailSettings> {
  const { user } = ctx;
  requirePermission(user, "settings.manage");
  requireLevel(user, levelId);
  const grades = canonicalGrades(levelId, input.report.grades);
  // Whatever the outcome (a 409 proves the cached rev is stale), this instance re-reads the settings afterwards.
  try {
    return await runTx(async (tx) => {
      // ---------------- reads ----------------
      const snap = await tx.get(mailSettingsRef(levelId));
      const before = mailSettingsFrom(levelId, snap.exists ? snap.data() : undefined);
      assertBaseRev(before, input.baseRev ?? 0, MAIL_SETTINGS_MSG.stale);

      // ---------------- writes ----------------
      const next: MailSettings = {
        levelId,
        notices: { enabled: input.notices.enabled, incidents: input.notices.incidents, rewards: input.notices.rewards },
        report: { bgh: dedupeEmails(input.report.bgh), grades, cc: dedupeEmails(input.report.cc) },
        allowedDomains: [...new Set(input.allowedDomains)],
        rev: before.rev + 1,
        updatedAt: nowIso(),
        updatedBy: user.email,
      };
      const changed = Object.keys(auditDiff(before, next, CONTENT_FIELDS));
      if (snap.exists && changed.length === 0) return before;
      tx.set(mailSettingsRef(levelId), next);
      writeAudit(tx, auditOf(user, "UPDATE_MAIL_SETTINGS", { entity: "mailSettings", entityId: levelId, levelId, ip: ctx.ip, detail: auditDetail(next, changed) }));
      return next;
    });
  } finally {
    invalidateMailSettingsCache(levelId);
  }
}
