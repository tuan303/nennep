/**
 * Firestore layout (all access goes through the server with firebase-admin, EXCEPT clients may read `meta/versions`).
 *
 * users/{uid}                              UserProfile
 * levels/{levelId}                         { config: LevelConfig }
 * levels/{levelId}/classes/{classCode}     ClassInfo
 * levels/{levelId}/catalog/{errorCode}     CatalogItem
 * levels/{levelId}/weeks/{weekStart}       SchoolWeek
 * students/{studentId}                     Student            (global: Mã HS unique across the school)
 * incidents/{levelId}_{code}               Incident           (canonical, incl. soft-deleted)
 * rewards/{levelId}_{code}                 Reward             (canonical, incl. soft-deleted)
 * inspections/{levelId}_{code}             Inspection         (canonical, incl. soft-deleted)
 * actions/{levelId}_{code}                 ActionItem
 * auditLogs/{autoId}                       AuditLog           (append-only)
 * evidence/{autoId}                        { levelId, mime, data: Bytes, size, fileName?, createdBy, createdAt }
 * counters/{name}                          { seq: number }    e.g. "NN_THCS_20261021"
 * idempotency/{uid}_{clientRequestId}      { kind, id, createdAt }
 * importBatches/{batchId}                  summary of an import / reset batch
 *
 * READ MODEL (denormalised "digests", rewritten inside the same transaction as every write):
 * digests/{levelId}__ref                   { levelId, config, classes[], catalog[], weeks[], updatedAt }
 * digests/{levelId}__stu                   { levelId, items: StudentLite[], updatedAt }
 * digests/{levelId}__rew__{yyyy-mm}        { levelId, kind: "rew", month, items: Reward[] (non-deleted, week in that month), updatedAt }
 * digests/{levelId}__rew                   legacy single reward digest (all years); still maintained while it exists,
 *                                          replaced by the monthly docs on the next digest rebuild
 * digests/{levelId}__inc__{weekStart}      { levelId, kind: "inc", week, items: Incident[] (non-deleted), updatedAt }
 * digests/{levelId}__ins__{yyyy-mm}        { levelId, kind: "ins", month, items: Inspection[] (non-deleted, week in that month), updatedAt }
 * meta/versions                            { TH: number, THCS: number, THPT: number, updatedAt }  ← incremented on every write;
 *                                                                                                  clients listen (onSnapshot) to refetch.
 */
import type { LevelId } from "./types";

export const COL = {
  users: "users",
  levels: "levels",
  students: "students",
  incidents: "incidents",
  rewards: "rewards",
  inspections: "inspections",
  actions: "actions",
  auditLogs: "auditLogs",
  evidence: "evidence",
  counters: "counters",
  idempotency: "idempotency",
  importBatches: "importBatches",
  digests: "digests",
  meta: "meta",
} as const;

export const SUB = { classes: "classes", catalog: "catalog", weeks: "weeks" } as const;

export const META_VERSIONS_DOC = "versions";

export const recordDocId = (levelId: LevelId, code: string) => `${levelId}_${code}`;
export const digestRefId = (levelId: LevelId) => `${levelId}__ref`;
export const digestStudentsId = (levelId: LevelId) => `${levelId}__stu`;
export const digestRewardsId = (levelId: LevelId) => `${levelId}__rew`;
/** Monthly reward digest; `month` = "yyyy-mm" of the reward's week (Monday). */
export const digestRewardsMonthId = (levelId: LevelId, month: string) => `${levelId}__rew__${month}`;
export const digestIncidentsWeekId = (levelId: LevelId, weekStart: string) => `${levelId}__inc__${weekStart}`;
/** Monthly inspection digest; `month` = "yyyy-mm" of the inspection's week (Monday). */
export const digestInspectionsMonthId = (levelId: LevelId, month: string) => `${levelId}__ins__${month}`;
export const counterId = (prefix: "NN" | "KT" | "HD" | "DKT", levelId: LevelId, yyyymmdd: string) => `${prefix}_${levelId}_${yyyymmdd}`;
export const idempotencyId = (uid: string, clientRequestId: string) => `${uid}_${clientRequestId}`;
