/**
 * Typed client for every endpoint of the API contract (src/lib/contract.ts). Browser only.
 *
 * - Inputs use the contract `z.input` types (defaults may be omitted); outputs use the contract response types.
 * - Every failure rejects with `ApiClientError` { status, code, message (Vietnamese, show as is), details }.
 *   Network failures: status 0, code "NETWORK", "Không kết nối được máy chủ. Vui lòng thử lại."
 * - After a successful mutation call `refresh()` from `useDataset()` (the meta/versions listener also refetches).
 */
import type { z } from "zod";
import type {
  ActionCreateInput,
  ActionUpdateInput,
  AuditLogPage,
  BulkGvcnInput,
  BulkGvcnResult,
  CatalogPutInput,
  ClassesPutInput,
  ConfigUpdateInput,
  DeleteInput,
  EarlyWarningPutInput,
  EvidenceMaintenanceResult,
  EvidenceMaintenanceSchema,
  ExportLogInput,
  GvcnFeedbackInput,
  IncidentCreateInput,
  IncidentUpdateInput,
  InspectionCreateInput,
  InspectionUpdateInput,
  ListResponse,
  MeResponse,
  NotDuplicateInput,
  OkResponse,
  RankingsResponse,
  RebuildSchema,
  ResetLevelSchema,
  RestoreResetSchema,
  RewardCreateInput,
  RewardUpdateInput,
  StudentCreateInput,
  StudentImportCommitInput,
  StudentImportInput,
  StudentImportPreview,
  StudentImportResult,
  StudentPromoteInput,
  StudentReinstateInput,
  StudentTransferInput,
  StudentUpdateInput,
  StudentWithdrawInput,
  UserCreateInput,
  UserCreateResult,
  UserUpdateInput,
  WeeksPutInput,
  WorkbookCommitInput,
  WorkbookCommitResult,
  WorkbookPreview,
  WorkbookPreviewInput,
} from "@/lib/contract";
import type {
  ActionItem,
  AuditAction,
  CatalogItem,
  ClassInfo,
  Incident,
  Inspection,
  LevelConfig,
  LevelDataset,
  LevelId,
  PeriodMode,
  Reward,
  SchoolWeek,
  Student,
  UserProfile,
} from "@/lib/types";
import { BAD_RESPONSE_MESSAGE, ApiClientError } from "./api-errors";
import { downloadBlob } from "./download";
import { clearEvidenceCache, evidenceObjectUrl, uploadEvidence } from "./evidence";
import { readError, requestJson, seg, send } from "./http";

export {
  ApiClientError,
  UserFacingError,
  errorMessage,
  fieldErrors,
  isAbortError,
  isApiClientError,
  validationIssues,
  NETWORK_ERROR_MESSAGE,
  GENERIC_ERROR_MESSAGE,
} from "./api-errors";
export type { ApiClientErrorCode, ValidationIssue } from "./api-errors";
export { downloadBlob, MIME, safeFileName } from "./download";

/* ------------------------------ extra types ------------------------------ */

export type RebuildInput = z.input<typeof RebuildSchema>;
export type ResetLevelInput = z.input<typeof ResetLevelSchema>;
export type RestoreResetInput = z.input<typeof RestoreResetSchema>;
export type EvidenceMaintenanceInput = z.input<typeof EvidenceMaintenanceSchema>;

/**
 * PUT weeks / config: removing calendar weeks that still hold records is refused with 409 CONFLICT
 * (`details: { weeks, incidents, rewards }`) unless the admin confirmed – then the same request is repeated with
 * `allowHidingRecords: true` (sent as the query parameter `?allowHidingRecords=1`, not in the body).
 */
export interface CalendarChangeOptions {
  allowHidingRecords?: boolean;
}

/** POST /api/admin/rebuild-digests → per rebuilt level, the number of digests/records written. */
export interface RebuildDigestsResponse extends OkResponse {
  results: Partial<Record<LevelId, { weeks: number; incidents: number; rewards: number; students: number; inspections?: number }>>;
}

/** GET /api/rankings query (names = query parameters). */
export interface RankingsQuery {
  level: LevelId;
  mode: PeriodMode;
  /** week: Monday yyyy-mm-dd; month: yyyy-mm; semester: "HK1"; omitted for mode "all" */
  key?: string;
  classCode?: string;
}

/** GET /api/audit-logs query (names = query parameters). `from`/`to` are yyyy-mm-dd. */
export interface AuditLogQuery {
  action?: AuditAction;
  email?: string;
  level?: LevelId;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export type DatasetResult = { status: 200; dataset: LevelDataset; etag: string } | { status: 304 };

export interface ResetLevelResult {
  batchId: string;
  incidents: number;
  rewards: number;
}

export interface RestoreResetResult {
  incidents: number;
  rewards: number;
}

/** Idempotency key for create forms (`clientRequestId`): generate once per form submission. */
export function newClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/* ------------------------------- endpoints ------------------------------- */

const get = <T>(path: string, query?: Record<string, string | number | boolean | undefined>) =>
  requestJson<T>(path, { query });
const post = <T>(path: string, body: unknown = {}) => requestJson<T>(path, { method: "POST", body });
const patch = <T>(path: string, body: unknown) => requestJson<T>(path, { method: "PATCH", body });
const put = <T>(path: string, body: unknown, query?: Record<string, string | number | boolean | undefined>) =>
  requestJson<T>(path, { method: "PUT", body, query });
const hidingQuery = (o: CalendarChangeOptions = {}) => ({ allowHidingRecords: o.allowHidingRecords ? 1 : undefined });

async function dataset(levelId: LevelId, etag?: string): Promise<DatasetResult> {
  const res = await send("/api/dataset", {
    query: { level: levelId },
    headers: { Accept: "application/json", ...(etag ? { "If-None-Match": etag } : {}) },
  });
  if (res.status === 304) return { status: 304 };
  if (!res.ok) throw await readError(res);
  let data: LevelDataset;
  try {
    data = (await res.json()) as LevelDataset;
  } catch {
    throw new ApiClientError(res.status, "BAD_RESPONSE", BAD_RESPONSE_MESSAGE);
  }
  return { status: 200, dataset: data, etag: res.headers.get("ETag") ?? `"${data.version}"` };
}

export const api = {
  /* auth */
  me: () => get<MeResponse>("/api/me"),
  /** Call once per sign-in (audits LOGIN; may bootstrap the first admin profile). */
  session: () => post<MeResponse>("/api/auth/session"),
  /** Public: records a failed login attempt (rate-limited server side). */
  loginFailed: (email: string, reason?: string) =>
    requestJson<OkResponse>("/api/auth/login-failed", { method: "POST", body: { email, reason }, auth: false }),
  logout: () => post<OkResponse>("/api/auth/logout"),
  health: () => requestJson<{ ok: true; time: string }>("/api/health", { auth: false }),

  /* analytics */
  /** Conditional GET: pass the previous ETag to receive `{ status: 304 }` when unchanged. */
  dataset,
  rankings: (q: RankingsQuery) =>
    get<RankingsResponse>("/api/rankings", { level: q.level, mode: q.mode, key: q.key, classCode: q.classCode }),

  incidents: {
    create: (input: IncidentCreateInput) => post<Incident>("/api/incidents", input),
    get: (id: string) => get<Incident>(`/api/incidents/${seg(id)}`),
    update: (id: string, input: IncidentUpdateInput) => patch<Incident>(`/api/incidents/${seg(id)}`, input),
    /** Soft delete (reason ≥ 3 chars). */
    remove: (id: string, reason: string) =>
      requestJson<OkResponse>(`/api/incidents/${seg(id)}`, { method: "DELETE", body: { reason } satisfies DeleteInput }),
    restore: (id: string) => post<Incident>(`/api/incidents/${seg(id)}/restore`),
    /** GVCN note / status / remediation (EDITOR with incident.remediate: remediation + status only). */
    feedback: (id: string, input: GvcnFeedbackInput) => post<Incident>(`/api/incidents/${seg(id)}/feedback`, input),
    /** "Không trùng": marks every pair of {id} ∪ otherIds as reviewed; returns the (live) members. */
    notDuplicate: (id: string, input: NotDuplicateInput) => post<ListResponse<Incident>>(`/api/incidents/${seg(id)}/not-duplicate`, input),
    listDeleted: (levelId: LevelId) => get<ListResponse<Incident>>("/api/incidents", { level: levelId, deleted: 1 }),
  },

  /** Đợt kiểm tra (inspection.manage). Rounds are read from the dataset (`ds.inspections`). */
  inspections: {
    create: (input: InspectionCreateInput) => post<Inspection>("/api/inspections", input),
    update: (id: string, input: InspectionUpdateInput) => patch<Inspection>(`/api/inspections/${seg(id)}`, input),
    /** Soft delete (reason ≥ 3 chars). */
    remove: (id: string, reason: string) =>
      requestJson<OkResponse>(`/api/inspections/${seg(id)}`, { method: "DELETE", body: { reason } satisfies DeleteInput }),
  },

  rewards: {
    create: (input: RewardCreateInput) => post<Reward>("/api/rewards", input),
    update: (id: string, input: RewardUpdateInput) => patch<Reward>(`/api/rewards/${seg(id)}`, input),
    remove: (id: string, reason: string) =>
      requestJson<OkResponse>(`/api/rewards/${seg(id)}`, { method: "DELETE", body: { reason } satisfies DeleteInput }),
    restore: (id: string) => post<Reward>(`/api/rewards/${seg(id)}/restore`),
    listDeleted: (levelId: LevelId) => get<ListResponse<Reward>>("/api/rewards", { level: levelId, deleted: 1 }),
  },

  evidence: {
    /** Compress (≤1280 px, ≈200 KB, JPEG/WebP) → upload → evidence id for `photoIds`. */
    upload: (levelId: LevelId, file: File): Promise<string> => uploadEvidence(levelId, file),
    /** Authenticated fetch → `blob:` URL usable in <img src>; cached per id. */
    objectUrl: (id: string): Promise<string> => evidenceObjectUrl(id),
    /** Revoke cached object URLs (one id or all). Called automatically on logout. */
    clearCache: (id?: string): void => clearEvidenceCache(id),
  },

  students: {
    get: (id: string) => get<Student>(`/api/students/${seg(id)}`),
    create: (input: StudentCreateInput) => post<Student>("/api/students", input),
    update: (id: string, input: StudentUpdateInput) => patch<Student>(`/api/students/${seg(id)}`, input),
    transfer: (id: string, input: StudentTransferInput) => post<Student>(`/api/students/${seg(id)}/transfer`, input),
    withdraw: (id: string, input: StudentWithdrawInput) => post<Student>(`/api/students/${seg(id)}/withdraw`, input),
    reinstate: (id: string, input: StudentReinstateInput) => post<Student>(`/api/students/${seg(id)}/reinstate`, input),
    /** Chuyển cấp (TH → THCS…): same Mã HS and history, ACTIVE in a class of `toLevelId` (needs both levels). */
    promoteLevel: (id: string, input: StudentPromoteInput) => post<Student>(`/api/students/${seg(id)}/promote-level`, input),
    importPreview: (input: StudentImportInput) => post<StudentImportPreview>("/api/imports/students/preview", input),
    importCommit: (input: StudentImportCommitInput) => post<StudentImportResult>("/api/imports/students/commit", input),
  },

  workbook: {
    preview: (input: WorkbookPreviewInput) => post<WorkbookPreview>("/api/imports/workbook/preview", input),
    commit: (input: WorkbookCommitInput) => post<WorkbookCommitResult>("/api/imports/workbook/commit", input),
  },

  /** Audit an export done in the browser (EXPORT_EXCEL). */
  exportsLog: (input: ExportLogInput) => post<OkResponse>("/api/exports/log", input),

  actions: {
    list: (levelId: LevelId) => get<ListResponse<ActionItem>>("/api/actions", { level: levelId }),
    create: (input: ActionCreateInput) => post<ActionItem>("/api/actions", input),
    update: (id: string, input: ActionUpdateInput) => patch<ActionItem>(`/api/actions/${seg(id)}`, input),
  },

  auditLogs: (q: AuditLogQuery = {}) =>
    get<AuditLogPage>("/api/audit-logs", {
      action: q.action,
      email: q.email,
      level: q.level,
      from: q.from,
      to: q.to,
      cursor: q.cursor,
      limit: q.limit,
    }),

  settings: {
    putConfig: (levelId: LevelId, input: ConfigUpdateInput, opts?: CalendarChangeOptions) =>
      put<LevelConfig>(`/api/settings/${levelId}/config`, input, hidingQuery(opts)),
    putCatalog: (levelId: LevelId, input: CatalogPutInput) =>
      put<ListResponse<CatalogItem>>(`/api/settings/${levelId}/catalog`, input),
    putClasses: (levelId: LevelId, input: ClassesPutInput) =>
      put<ListResponse<ClassInfo>>(`/api/settings/${levelId}/classes`, input),
    putWeeks: (levelId: LevelId, input: WeeksPutInput, opts?: CalendarChangeOptions) =>
      put<ListResponse<SchoolWeek>>(`/api/settings/${levelId}/weeks`, input, hidingQuery(opts)),
    /** Early-warning thresholds (Cài đặt → Cảnh báo sớm) → the saved config. */
    putEarlyWarning: (levelId: LevelId, input: EarlyWarningPutInput) => put<LevelConfig>(`/api/settings/${levelId}/early-warning`, input),
  },

  users: {
    list: () => get<ListResponse<UserProfile>>("/api/users"),
    create: (input: UserCreateInput) => post<UserCreateResult>("/api/users", input),
    update: (uid: string, input: UserUpdateInput) => patch<UserProfile>(`/api/users/${seg(uid)}`, input),
    resetPassword: (uid: string) => post<{ tempPassword: string }>(`/api/users/${seg(uid)}/reset-password`),
    bulkGvcn: (input: BulkGvcnInput) => post<BulkGvcnResult>("/api/users/bulk-gvcn", input),
  },

  admin: {
    rebuildDigests: (input: RebuildInput = {}) => post<RebuildDigestsResponse>("/api/admin/rebuild-digests", input),
    /** `confirmText` must be exactly `XOA ${levelId}`. */
    resetLevel: (input: ResetLevelInput) => post<ResetLevelResult>("/api/admin/reset-level", input),
    restoreReset: (input: RestoreResetInput) => post<RestoreResetResult>("/api/admin/restore-reset", input),
    /** Evidence photos of a level: statistics (`dryRun`, default) or deletion of photos never attached to a record. */
    evidence: (input: EvidenceMaintenanceInput) => post<EvidenceMaintenanceResult>("/api/admin/evidence", input),
  },

  /** Trigger a browser download of a generated file (Excel, HTML…). */
  downloadBlob,
};

export type Api = typeof api;
