# Server core API (`src/lib/server/`)

Reference for everyone writing route handlers on top of the server core. Read `docs/ARCHITECTURE.md` §2–§3 first.

**Ground rules**

- Node runtime only. Every route file starts with `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`.
  Never import `src/lib/server/**` from client components, and do **not** add `import "server-only"` (it breaks vitest).
- Every mutation is **one** transaction (`runTx`) or batch. It writes the canonical doc, the affected digest(s),
  `bumpVersions(...)` and `writeAudit(...)` together.
- Inside a transaction, **all reads happen before any write**. Helpers named `load*`/`read*`/`nextCode`/`assert*Ids` only read.
  `*.write(tx)`/`commitCode`/`writeAudit`/`bumpVersions`/`writeIdempotency` only write.
- Throw `Errors.*` (Vietnamese messages). Never return error JSON by hand. `apiHandler` maps errors to status codes.
- Optional fields are omitted, never `null` (`ignoreUndefinedProperties` is on). Use `omitEmpty`/`omitKeys` to drop `""`.
- Timestamps are `nowIso()`. Calendar dates are `yyyy-mm-dd` from `engine/dates.ts` (`todayVN()`, `weekInfo()`…).
- Records live in the school-week calendar: incidents/rewards/inspections are only recorded on dates whose Monday is a
  calendar week (`calendar.ts`); the dataset only reads the digests of the calendar weeks/months.
- Every incident/reward/inspection mutation increments `rev` (optimistic concurrency, see `assertBaseRev`).
- **Production holds real data (REQ_V2):** every model change is additive and optional, old documents stay valid without
  migration, and every digest is rebuildable from canonical documents (`/api/admin/rebuild-digests`).

---

## 1. Writing a new route: example

```ts
// src/app/api/students/[id]/transfer/route.ts
import { StudentTransferSchema } from "@/lib/contract";
import { apiHandler, parseBody } from "@/lib/server/handler";
import { transferStudent } from "@/lib/server/students"; // your service

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = apiHandler<{ id: string }>({ permission: "students.manage" }, async ({ req, user, ip, params }) => {
  const input = await parseBody(req, StudentTransferSchema);   // 400 VALIDATION with details on bad input
  return transferStudent({ user, ip }, params.id, input);      // plain object → 200 JSON
});
```

```ts
// src/lib/server/students.ts (service sketch)
import type { Student } from "../types";
import { COL } from "../firestore-paths";
import { db, nowIso } from "./firebase-admin";
import { runTx } from "./write";
import { requireLevel, type SessionUser } from "./auth";
import { Errors } from "./errors";
import { findClass, loadReference } from "./reference";
import { loadStudentDigest, toStudentLite } from "./digests";
import { bumpVersions } from "./versions";
import { auditOf, writeAudit } from "./audit";
import type { ServiceCtx } from "./records";

export async function transferStudent(ctx: ServiceCtx, id: string, input: { toClassCode: string; effectiveDate: string; note?: string }) {
  return runTx(async (tx) => {
    // ---- reads ----
    const snap = await tx.get(db().collection(COL.students).doc(id));
    if (!snap.exists) throw Errors.notFound("Không tìm thấy học sinh.");
    const before = snap.data() as Student;
    requireLevel(ctx.user, before.levelId);
    const ref = await loadReference(before.levelId, tx);
    const cls = findClass(ref, input.toClassCode);
    if (!cls?.active) throw Errors.validation(`Lớp ${input.toClassCode} không hợp lệ.`);
    const stu = await loadStudentDigest(tx, before.levelId);
    // ---- writes ----
    const after: Student = { ...before, classCode: cls.code, grade: cls.grade, updatedAt: nowIso() /* + history event */ };
    tx.set(snap.ref, after);
    stu.upsert(toStudentLite(after));
    stu.write(tx);
    bumpVersions(tx, [before.levelId]);
    writeAudit(tx, auditOf(ctx.user, "TRANSFER_STUDENT", { entity: "student", entityId: id, levelId: before.levelId, ip: ctx.ip,
      detail: { from: before.classCode, to: cls.code } }));
    return after;
  });
}
```

Return values from a handler function:

| return | response |
|---|---|
| plain value | `200` JSON, `Cache-Control: no-store` |
| `created(body)` = `{ __status: 201, body }` | `201` JSON |
| `withStatus(status, body, headers?)` | that status (body `null`/`undefined` → empty) |
| a `Response`/`NextResponse` | returned as is (304, binary…) |
| `undefined` | `204` |

Errors: `ApiError` → its status + `ApiErrorBody`. `ZodError` → 400 `VALIDATION` with `details: [{ path, message }]`
(default zod messages are translated, custom schema messages are kept). Firestore `ABORTED` after retries → 409 `CONFLICT`.
Anything else → 500 `INTERNAL` with a generic Vietnamese message, logged with `console.error`.

---

## 2. Module reference

### `firebase-admin.ts`
| export | purpose |
|---|---|
| `db(): Firestore` | Lazy Firestore of the current app. `ignoreUndefinedProperties: true` is applied once. Uses REST transport on real Firestore (`FIRESTORE_PREFER_REST=false` opts out) and gRPC on emulators. |
| `adminAuth(): Auth` | firebase-admin Auth of the current app. |
| `adminApp(): App` | The app. Default app from env. In tests it is the named app selected by `initAdminForTests`. |
| `adminOptionsFromEnv(env?): AppOptions` | Emulator hosts → `{ projectId }`. Else `FIREBASE_SERVICE_ACCOUNT_BASE64`, else `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` (`\n` unescaped, quotes stripped). |
| `initAdminForTests(projectId): App` | **Tests only.** Binds all helpers to app `test:<projectId>` and sets the emulator host env vars if they are missing. |
| `currentProjectId(): string` | Project id of the current app. |
| `isEmulatorMode(): boolean` | Emulator env vars present. |
| `nowIso(): string` | `new Date().toISOString()`. |
| `toIso(v: unknown): string` | Timestamp/Date/string → ISO (`""` otherwise). |
| `FieldValue`, `Timestamp` | Re-exported from `firebase-admin/firestore`. |

### `errors.ts`
| export | purpose |
|---|---|
| `class ApiError(status, code, message, details?, headers?)` | Typed error. `code` is an `ApiErrorBody` code string, so it is never retried by Firestore transactions. `toBody()`. |
| `Errors.unauthenticated(msg?)` 401 · `forbidden(msg?)` 403 · `notFound(msg?)` 404 · `validation(msg?, details?)` 400 · `validationList(messages[], path?)` 400 (message = messages joined by a space, details = one per message) · `conflict(msg?, details?)` 409 · `rateLimited(retryAfterSec?, msg?)` 429 + `Retry-After` · `internal(msg?)` 500 | Factories with default Vietnamese messages (`MSG`). |
| `isApiError(e)`, `MSG`, `ApiErrorCode`, `ValidationDetail` | Helpers and types. |

### `handler.ts`
| export | purpose |
|---|---|
| `apiHandler<P>(opts, fn): RouteHandler<P>` | Wraps a route. `opts`: `{ public: true }` (no auth, `ctx.user = null`) or `{ permission?: Permission; anyPermission?: Permission[] }` (Bearer token required; profile must exist and be active). `fn(ctx)` gets `{ user, req, params, ip }`, with `params` already awaited. Use `apiHandler<{ id: string }>` for `[id]` routes. |
| `parseBody(req, schema, { maxBytes = 4.5MB }?)` | Reads JSON (empty → `{}`) and validates it. Invalid JSON/schema → 400, too large → 413. Returns `z.output<schema>` (defaults applied). |
| `parseQuery(req, schema)` | Validates `searchParams` as a flat object of strings. |
| `levelParam(req, name = "level"): LevelId` | Required `?level=` → 400 if missing or invalid. |
| `flagParam(req, name): boolean` | `"1"/"true"/"yes"`. |
| `created(body, headers?)`, `withStatus(status, body, headers?)` | Explicit status results. |
| `jsonResponse(body, status = 200, headers = {})` | `NextResponse.json` + `Cache-Control: no-store` (overridable). |
| `errorResponse(e)` | Error → Response mapping used by `apiHandler`. |
| `clientIp(req)` | First `x-forwarded-for` entry, else `x-real-ip`, else `""`. |
| `zodIssueMessage(issue)`, `zodToApiError(err)` | Zod → Vietnamese messages / `ApiError`. |
| types `ApiContext<P>`, `PublicApiContext<P>`, `ApiResult`, `AuthOptions`, `PublicOptions`, `RouteHandler<P>`, `RouteContext<P>` | |

### `auth.ts`
| export | purpose |
|---|---|
| `interface SessionUser { uid; email (lower-case); profile: UserProfile }` | Authenticated caller. |
| `authenticate(req): Promise<SessionUser>` | Verifies the Bearer ID token and loads the profile (cached 60 s per instance). Missing/invalid/expired token → 401. A token whose `auth_time` is older than `profile.sessionsValidAfter` (set by reset-password, lock, re-secured accounts) → 401 `AUTH_MSG.revoked`. No profile → bootstrap ADMIN only if the token email is in `BOOTSTRAP_ADMIN_EMAILS` (case-insensitive, comma/space separated) **and** `email_verified === true` **and** the provider is password/google.com/microsoft.com **and** no active ADMIN exists yet (audited `CREATE_USER` with `detail.bootstrap`); else 403 "Tài khoản chưa được cấp quyền. Vui lòng liên hệ quản trị.". Inactive → 403 "Tài khoản đã bị khóa". |
| `verifyRequestToken(req)`, `bearerToken(req)`, `loadProfile(decodedToken)` | The lower-level steps. **Production does not check revocation/disabled state with Firebase Auth per request** (firebase-admin only does so with `checkRevoked` or on the emulator): accounts are locked in the app (Cài đặt → Người dùng), never only in the Firebase console. |
| `assertSessionValid(token, profile)`, `sessionCutoffIso(now?)` | The `sessionsValidAfter` rule (second precision, comparable with `auth_time`). |
| `invalidateProfileCache(uid?)` | **Call after changing a user profile** (users routes). No argument clears everything. The cache is per server instance, so other instances pick up the change within 60 s. |
| `primeProfileCache(profile)` | Replace the cached profile. |
| `requirePermission(user, p, msg?)`, `requireAnyPermission(user, ps, msg?)` | 403 unless permitted (`hasPermission`). |
| `requireLevel(user, levelId)` | 403 unless `canAccessLevel`. |
| (constants) `hasPermission(profile, p)` | `ALL_LEVEL_PERMISSIONS` (`users.manage`, `audit.view`) are only held by profiles without level restriction (`levels = []`): a level-limited ADMIN keeps settings/imports/maintenance of its levels but can neither manage accounts nor read the audit log. `hasAllLevels(profile)`. |
| `requireClassDetail(user, levelId, classCode)` | Level access + `canSeeClassDetail` (GVCN: own classes only), else 403. |
| `accessibleLevels(profile)`, `meResponse(profile): MeResponse` | For `/api/me`-like payloads. |
| `actorName(user)` | `displayName` or email (used for `createdByName`, `reporter` default, `gvcnNoteBy`). |
| `bootstrapAdminEmails(env?)`, `AUTH_MSG`, `PROFILE_CACHE_TTL_MS` | |

### `audit.ts` (append-only `auditLogs/{autoId}`)
| export | purpose |
|---|---|
| `type AuditEntry = Omit<AuditLog, "id" \| "ts"> & { ts?: string }` | |
| `auditOf(user, action, { entity?, entityId?, levelId?, detail?, ip? }): AuditEntry` | Builds an entry for a signed-in actor (uid/email/role/ip). |
| `auditActor(user, ip?)` | Just the actor fields. |
| `writeAudit(target: Transaction \| WriteBatch, entry): string` | Adds the log to the tx/batch and returns its id. `ts` defaults to now. `detail` is JSON-sanitised. Email is lower-cased. |
| `writeAuditDirect(entry): Promise<string>` | Stand-alone write, for events with no other write (LOGIN_FAILED, LOGOUT, EXPORT_EXCEL…). |
| `auditDiff(before, after, fields): Record<field, { before, after }>` | Changed fields for `UPDATE_*` details (`{}` = no change). |

### `versions.ts` (`meta/versions`)
| export | purpose |
|---|---|
| `bumpVersions(target, levelIds)` | `FieldValue.increment(1)` per level + `updatedAt` (merge set). **Every write that changes a dataset must call it.** |
| `readVersion(levelId, reader?)`, `readVersions(reader?)` | Current counters (0 when absent). |
| `versionsRef()` | DocumentReference. |

### `write.ts`
| export | purpose |
|---|---|
| `runTx(fn)` | `db().runTransaction(fn, { maxAttempts: 30 })`. An `ApiError` thrown inside aborts immediately. |
| `type WriteTarget = Transaction \| WriteBatch`, `type Reader = Transaction \| undefined` | |
| `setDoc(target, ref, data, merge = false)`, `createDoc`, `updateDoc`, `deleteDoc` | Same call for a tx or a batch. |
| `readDoc(reader, ref)`, `readDocs(reader, refs)`, `readQuery(reader, query)` | Read inside a tx (`reader = tx`) or outside it (`undefined`). |
| `commitInChunks(ops, final?, finalOps = 0, maxBytes = BATCH_MAX_BYTES)` | Commits `(b: WriteBatch) => void` ops in batches of at most 450 ops **and** at most `maxBytes` for ops that carry a size (`sized(op, bytes)` / `SizedOp`; Firestore rejects commits above 10 MiB, the emulator does not). `final` runs in the **last** batch (put the digest + versions + audit there). Not atomic across chunks. |
| `BATCH_LIMIT = 450`, `BATCH_MAX_BYTES = 6 000 000`, `TX_MAX_ATTEMPTS = 30`, `sized(op, bytes)`, `type SizedOp` | |

### `ids.ts`
| export | purpose |
|---|---|
| `nextCode(tx, prefix: "NN"\|"KT"\|"HD"\|"DKT", levelId, date, collection): Promise<AllocatedCode>` | **Read phase.** Reads `counters/{prefix}_{level}_{yyyymmdd}` and probes `{level}_{code}` until a free id is found (skips legacy-imported ids). Returns `{ code, id, seq, counterRef }`. |
| `commitCode(tx, alloc)` | **Write phase.** Persists `{ seq }`. Required, or the next caller reuses the number. |
| `formatCode(prefix, date, seq)` | `NN-20261021-0001`, `KT-…-0001`, `HD-…-001`, `DKT-…-001` (inspections, `collection = COL.inspections`). |

Imports that write records in batches outside a transaction may set ids directly. `nextCode` later skips any existing id.
Set the counter (`counters/…{ seq }`) after a bulk import if you want new codes to continue after the imported ones.

### `rate-limit.ts`
`checkRateLimit(key, limit, windowMs, now?) → { ok, remaining, retryAfterSec }` · `enforceRateLimit(key, limit, windowMs)` (throws 429) · `ipRateKey(ip)` (IPv4 as is, IPv6 → its /64, IPv4-mapped → IPv4) · `resetRateLimits()`, `rateLimitKeyCount()` (tests).
In memory and best effort: each serverless instance keeps its own limits, at most `MAX_KEYS` keys (least recently used dropped).
Anything that must hold across instances uses Firestore (e.g. the LOGIN_FAILED daily cap in `session.ts`).

### `reference.ts` (config + classes + catalog + weeks)
| export | purpose |
|---|---|
| `interface LevelReference { levelId; config; classes; catalog; weeks; updatedAt }` | |
| `loadReference(levelId, reader?)` | `digests/{level}__ref` (1 read). Falls back to the canonical docs when absent. Use it inside transactions for validation. |
| `readCanonicalReference(levelId, reader?): CanonicalReference` | `levels/{id}` + subcollections, with defaults: `defaultLevelConfig` merged under the stored config, and `generateWeeks(firstWeek, semesters)` when there are no week docs. `.stored` holds the persisted maps used for diffing. |
| `saveReferenceParts(levelId, patch, final?)` | **Use this for settings/imports.** Reads canonical, writes only changed/removed subcollection docs (≤450-op batches), and puts `__ref` + `bumpVersions` + `final(batch, next)` (e.g. `writeAudit`) in the last batch. `patch: { config?, classes?, catalog?, weeks? }`; each given part **replaces** the whole list. Returns the new reference. While no week docs are stored, a new config also regenerates the weeks of the `__ref` digest (same as the canonical view). |
| `writeReferenceParts(target, existing, patch)` | Same diff inside one tx/batch you own (small patches). Writes the `__ref` digest too. The caller bumps versions and audits. |
| `planReferenceWrites(existing, patch)` | Returns `{ next, ops }` without writing. |
| `rebuildReferenceDigest(levelId, { bump? })` | Rewrites `__ref` from canonical docs. |
| `writeReferenceDigest(target, ref)` | Writes `__ref` (size-guarded). |
| `findClass(ref, code)`, `findCatalogItem(ref, code)`, `normalizeConfig(levelId, stored)`, `sortClasses/sortCatalog/sortWeeks`, `levelDocRef(levelId)`, `referenceDigestRef(levelId)` | Utilities. |

### `digests.ts` (read model; update inside the same transaction)
| export | purpose |
|---|---|
| `loadIncidentDigests(reader, levelId, weeks: (string\|undefined)[]): IncidentDigestSet` | **Read phase.** Loads `__inc__{week}` docs; undefined values and duplicates are ignored. |
| `IncidentDigestSet.upsert(incident)` / `.remove(id)` / `.items()` / `.write(tx)` | `upsert` puts the incident in its `incident.week` and removes it from the other loaded weeks (moving between weeks needs both weeks loaded). `write` only writes changed docs. (`BucketDigestSet<T>` is the generic version.) |
| `loadRewardDigests(reader, levelId, weeks): RewardDigestSet` | **Read phase.** Monthly reward digests `__rew__{yyyy-mm}` (month of the reward's week) of the given weeks, plus the legacy `__rew` doc (1 read). `upsert/remove/items/write` like incidents; while the legacy single `__rew` doc exists the set reads/writes **only** it (nothing lost before the migration). Load before **and** after weeks when a reward moves. |
| `loadInspectionDigests(reader, levelId, weeks): InspectionDigestSet` | **Read phase.** Monthly inspection digests `__ins__{yyyy-mm}` (month of the round's week, same buckets as rewards; no legacy doc). `upsert/remove/items/write` as `BucketDigestSet`; load before **and** after weeks when a round is re-dated. `inspectionMonthDigestRef(levelId, month)`. |
| `loadStudentDigest(reader, levelId): DigestDraft<StudentLite>` | `__stu` (all statuses – the admin roster lists former students). To move a student between levels, load both levels. |
| `class DigestDraft<T>`: `items`, `has(id)`, `get(id)`, `upsert(item)`, `remove(id)`, `replaceAll(items)`, `write(target, force?)`, `dirty`, `existed` | Sorted in memory (incidents/rewards by date then code; students by class, name, id). `write` throws a clear 500 **before writing** if the doc would exceed ~900 KB. |
| `toStudentLite(student)`, `rewardBucketOf(week)` | `Student` → `StudentLite`; week → "yyyy-mm". |
| `incidentDigestRef/rewardMonthDigestRef/rewardDigestRef (legacy)/studentDigestRef`, `byDateThenCode`, `byClassThenName`, `ItemsDigestDoc<T>`, `DigestKind` | Utilities. |
| `rebuildIncidentDigests(levelId, { bump? })` | Groups non-deleted incidents by `week`, rewrites every week doc (size-split batches) and deletes stale week digests. |
| `rebuildRewardDigest(levelId, { bump? })` | Monthly reward digests from canonical rewards; deletes stale monthly docs **and the legacy `__rew`** (= migration). `rebuildStudentDigest(levelId, { bump? })` for `__stu`. |
| `rebuildInspectionDigests(levelId, { bump? })` | Monthly inspection digests from non-deleted canonical `inspections` (single-field `levelId` query); deletes stale `__ins__*` docs (existing `digests (levelId, kind)` index). |
| `rebuildAllDigests(levelId): Promise<RebuildResult>` | `__ref`, then `__inc__*`, rewards, `__stu` and `__ins__*` independently (`allSettled`: one oversized digest does not stop the others; the first error is rethrown), then one version bump. `RebuildResult = { weeks, incidents, rewards, students, inspections }`. |

Digest document shapes: `{ levelId, kind: "inc", week, items, updatedAt }`, `{ levelId, kind: "rew", month, items, updatedAt }`, `{ levelId, kind: "ins", month, items, updatedAt }`, `{ levelId, kind: "stu", items, updatedAt }`,
`{ levelId, kind: "ref", config, classes, catalog, weeks, updatedAt }`. Rebuilds are not transactional: run them while the level is quiet.
**After deploying the monthly reward digests, run Bảo trì → Tính lại dữ liệu tổng hợp once per level** (or any import/reset) to migrate `__rew`.

### `dataset.ts`
| export | purpose |
|---|---|
| `buildLevelDataset(levelId, version?)` | `__ref` + one `getAll` of `__stu`, legacy `__rew`, `__inc__{week}` for every calendar week, `__rew__{month}` and `__ins__{month}` for every calendar month. `inspections` = rounds of the calendar weeks sorted by date then code, always an array (no canonical fallback: the digests are created by the first write / a rebuild). Incidents **and rewards** outside the calendar weeks are not included (records of another school year never count). Missing digests fall back to a canonical query. **Memoised per (project, level, version) for 60 s with single-flight**: the result is shared and read-only. |
| `invalidateDatasetCache(levelId?)` | Tests / maintenance that write without a version bump. |
| `redactForGvcn(ds, profile)` | Users without detail access to a class (GVCN) get only the students of their own classes that are ACTIVE or named in this school year's incidents of those classes (a class code is reused every year). Other classes' incidents keep class/error/points/date/counts and lose `students`, `detail`, `gvcnNote*`, `reporter`, `evidenceUrls`, `photoIds`, plus name-bearing issue messages. Other classes' rewards lose `note`, `reporter` and evidence. Sets `redacted: true` for GVCN. |
| `redactIncident(i)`, `redactReward(r)`, `redactInspection(x)`, `referencedStudentIds(incidents, visible)` | Single-record versions / helper. `redactIncident` also strips `remediation`, `remediationAt`, `remediationBy` (REQ_V2); `redactInspection` strips `note` (applied to every round for viewers without `view.allClassesDetail`). |
| `datasetEtag(version)` → `W/"<version>"`, `etagMatches(ifNoneMatch, version)` | ETag helpers (accept `W/"5"`, `"5"`, `5`, lists, `*`). |

### `calendar.ts`
| export | purpose |
|---|---|
| `calendarProblem(date, weeks)` | Vietnamese message when a valid date's Monday is not a calendar week ("Ngày dd/mm/yyyy không thuộc lịch tuần của năm học…"), else undefined. Used by incident/reward create & re-date, imports. |
| `assertRestorableWeek(week, weeks)` | 409 when restoring a record whose week left the calendar. |
| `checkRemovedWeeks(reader, levelId, before, after, allow)` | Records (incident week digests + reward digests) of the weeks `after` drops; 409 with `details: { weeks, incidents, rewards }` unless `allow`. Returns them for the audit. Inspection rounds are not checked (not scored; they simply leave the dataset with their week). |
| `calendarWeekSet(weeks)`, `CALENDAR_MSG` | Utilities. |

### `records.ts` (shared building blocks)
| export | purpose |
|---|---|
| `interface ServiceCtx { user: SessionUser; ip?: string; today?: string }` | Passed from routes to services. `today` defaults to `todayVN()`. |
| `canEditRecord(user, { createdBy, createdAt }, now?)`, `assertCanEditRecord(...)` | ADMIN (`record.editAny`) can edit anything. EDITOR can edit own records within `EDITOR_EDIT_WINDOW_HOURS`, otherwise 403 "Chỉ được sửa bản ghi của mình trong 24 giờ". |
| `readIdempotency(tx, uid, clientRequestId?, kind)` / `writeIdempotency(tx, uid, clientRequestId?, kind, id)` / `idempotencyRef` | `idempotency/{uid}_{clientRequestId}` = `{ kind, id, createdAt }` (`kind`: incident, reward, action, inspection). |
| `readStudentLites(reader, ids, levelId?)` | `Map<id, StudentLite & { levelId }>`. With `levelId`, students of other levels count as missing. |
| `assertEvidenceIds(reader, levelId, photoIds)` | Every id must be an `evidence` doc of that level, else 400 (reads `levelId` only). |
| `assertHttpUrls(urls)` | Evidence URLs must be `http(s)` (zod `.url()` also accepts `javascript:`), else 400. |
| `planEvidenceLinks(tx, recordId, beforeIds, afterIds)` (read) / `writeEvidenceLinks(tx, recordId, plan)` (write) | Marks photos attached to a record (`evidence.attachedTo`) and unmarks removed ones (only those pointing to it). |
| `catalogFromSnapshot(incident)` | Catalog item from an incident's snapshot (also re-exported by `incidents.ts`). |
| `nextRev(record)`, `assertBaseRev(record, baseRev, message)` | `rev` handling: 409 when `baseRev` is given and differs from the stored `rev` (absent = 0). |
| `omitKeys(obj, keys)`, `omitEmpty(obj, optionalKeys)` | Drop keys / drop `undefined`/`""` optional keys. Never list required string fields such as `semester`. |

### Domain services
- `incidents.ts` / `rewards.ts` rules: dates must be in a calendar week (create; edits only when the date changes); every
  mutation sets `rev` (create 1, then +1); PATCH `baseRev` ≠ `rev` → 409 `INCIDENT_MSG.stale` / `REWARD_MSG.stale`; restore → 409
  when the record's week left the calendar; `gvcnFeedback` with the same note, status and remediation writes nothing (no version bump); photos are linked.
- `incidents.ts`: `createIncident(ctx, input) → { incident, created }`, `updateIncident(ctx, id, patch)`, `softDeleteIncident(ctx, id, reason)`,
  `restoreIncident(ctx, id)`, `gvcnFeedback(ctx, id, input)`, `markNotDuplicate(ctx, id, { otherIds }) → Incident[]`, `getIncidentForViewer(user, id)`,
  `listDeletedIncidents(levelId, limit = 500)`, `readIncident(reader, id)`, `incidentRef(id)`, `catalogFromSnapshot(incident)`, `INCIDENT_AUDIT_FIELDS`,
  `INCIDENT_MSG`, types `IncidentCreateData`, `IncidentUpdateData`, `GvcnFeedbackData`, `NotDuplicateData` (zod outputs).
  - **Create with `notDuplicateOf`** ("Không trùng, vẫn lưu"): every id is read in the transaction and must be an incident of the same level
    (soft-deleted allowed), else 400 `Không tìm thấy sự việc để đánh dấu “không trùng”.`; stored sorted, unique, without the own id; omitted
    when empty. PATCH never changes it (not in `IncidentUpdateSchema`) and keeps it.
  - **`gvcnFeedback`**: ADMIN (level access) or the class GVCN (`incident.gvcnFeedback`) → note, status, remediation; otherwise
    `incident.remediate` (EDITOR, level access) → remediation + status, a `note` in the input → 403 `INCIDENT_MSG.noteGvcnOnly`
    ("Chỉ GVCN của lớp được ghi phản hồi GVCN."); anyone else → 403 `feedbackForbidden`. `remediation` "" removes it; any remediation change
    sets `remediationBy = actorName`, `remediationAt` (also when cleared). `gvcnNoteBy/At` only when the input has note/status and the caller
    is ADMIN or the class GVCN. Unchanged note + status + remediation → nothing written (no bump). Audit `GVCN_FEEDBACK` `{ code, classCode, changes }`.
  - **`markNotDuplicate`** (data.inspect): members = {id} ∪ otherIds (2–21, same level else 400; unknown URL id → 404; soft-deleted members
    ignored). Every live member's `notDuplicateOf` gains every other live member; unchanged members are not written; changed ones get `rev + 1`,
    `updatedBy/updatedAt` and a digest upsert; one `UPDATE_INCIDENT` audit (entityId = id, `detail: { code, notDuplicate: [codes] }`) and one
    version bump when anything changed. Returns the live members (current state, by code).
- `rewards.ts`: `createReward`, `updateReward`, `softDeleteReward`, `restoreReward`, `listDeletedRewards`, `readReward`, `rewardRef`,
  `validateRewardRules(draft, ref, today, { checkCalendar? }) → string[]`, `isRewardPointLevel(points)`, `isRewardReasonValid(reason)`,
  `VERIFIED_STATUS`, `PROPOSAL_STATUS`, `REWARD_MSG`, `REWARD_AUDIT_FIELDS`.
  - REQ_V2 §5.3: create needs an integer 1–5 (`REWARD_POINT_LEVELS`) and a reason ≥ 5 chars (schema + service). Update applies the scale only to a
    CHANGED `points` (`REWARD_MSG.pointLevels` "Mức điểm cộng là số nguyên từ 1 đến 5 (mức cũ được giữ nếu không sửa).") and the length only to a
    CHANGED `reason` (`REWARD_MSG.reasonShort`); unchanged legacy values (e.g. 10 points, a 3-char reason) stay valid.
  - Callers with `reward.propose` but without `reward.create` (GVCN): `isGvcnOfClass` else 403 `REWARD_MSG.proposeOwnClass`
    ("GVCN chỉ được đề xuất điểm thưởng cho lớp mình chủ nhiệm."), status forced "Mới ghi nhận", `proposed: true` (audit `detail.proposed`).
    GVCN cannot PATCH/DELETE (route permissions).
- `inspections.ts` (REQ_V2 §5.2): `createInspection(ctx, input) → { inspection, created }`, `updateInspection(ctx, id, patch)`,
  `softDeleteInspection(ctx, id, reason)`, `readInspection(reader, id)`, `inspectionRef(id)`, `validateInspectionRules(draft, ref, today, opts)`,
  `INSPECTION_MSG`, `INSPECTION_AUDIT_FIELDS`, types `InspectionCreateData`, `InspectionUpdateData`.
  - One transaction per mutation: `inspections/{level}_{code}` + `__ins__{yyyy-mm}` + version bump + audit (`CREATE_INSPECTION` with
    `{ code, date, shift, category, classCodes, inspector }`, `UPDATE_INSPECTION` `{ code, changes }`, `DELETE_INSPECTION`
    `{ code, reason, date, category, classCodes }`; entity `"inspection"`). Code `DKT-yyyymmdd-NNN` (date of the round). Idempotency kind `"inspection"`.
  - Validation (400): valid date, not in the future (`Không thể ghi nhận đợt kiểm tra ở ngày trong tương lai.`), inside the calendar (edits: only when
    the date changes); classes deduplicated, existing (`Lớp "X" không có trong danh mục.`) and active (`Lớp X đã ngừng hoạt động.` – a class already on
    the round is allowed on edit), stored in class display order; `category` "" → omitted (kiểm tra chung), else a catalog Mảng
    (`Mảng "X" không có trong danh mục lỗi.`; the stored one stays valid); `shift` "" → omitted; `inspector` empty → the creator's display name.
  - Edit/delete: `inspection.manage` + level; `assertCanEditRecord` (ADMIN any, EDITOR own ≤ 24 h); PATCH `baseRev` → 409 `INSPECTION_MSG.stale`;
    no change → no write; soft delete (409 when already deleted; edits of a deleted round → 409). No restore endpoint.
  - Not scored; ignored by reset-level, `checkRemovedWeeks` (calendar changes) and the workbook import/export.
- `report-plans.ts` ("Công tác phối hợp tuần/tháng mới", section 5 of Báo cáo tuần/tháng): `getReportPlan(user, query) → ReportPlan | null`,
  `saveReportPlan(ctx, input) → ReportPlan`, `assertReportPeriod(mode, key)`, `reportPlanRef(id)`, `REPORT_PLAN_MSG`, types `ReportPlanQuery`,
  `ReportPlanPutData`.
  - One doc per level + REPORT period: `reportPlans/{level}_{mode}_{key}` (`reportPlanId`; week key = the report week's Monday, month key =
    `yyyy-mm` of the report month; the content is the work of the following week/month). Not part of `LevelDataset`: no digest, no version bump.
  - Period key (read and write, 400): a week key must be a real Monday (`Tuần báo cáo phải bắt đầu từ Thứ Hai: ngày 20/10/2026 là Thứ Ba.`),
    a month key `yyyy-mm` with month 01–12 (`Tháng không hợp lệ (yyyy-mm).`).
  - `saveReportPlan` (`report.plan` + level) replaces items + note in one transaction: `(baseRev ?? 0) ≠ (stored rev ?? 0)` → 409
    `REPORT_PLAN_MSG.stale` (an omitted `baseRev` means "no plan yet", so it conflicts with any stored plan); items trimmed, empty `owner`/`due`
    and `note` omitted; `rev + 1`, `updatedAt`, `updatedBy` (email), `updatedByName`; audit `UPDATE_REPORT_PLAN` (entity `"reportPlan"`,
    entityId = doc id, `detail: { mode, key, items: <count> }`). An empty list without note is a valid save: the doc stays with `items: []`
    so the rev chain continues. Same items + note as the stored plan → nothing written, the stored plan is returned (same `rev`, no audit).
- `regulations.ts` (Quy chế khen thưởng / Quy chế kỷ luật, top bar; one set for the whole school): `listRegulations(user) → Regulation[]`,
  `saveRegulation(ctx, id, input)`, `readRegulationPdf(user, id) → { name, data: Buffer }`, `saveRegulationPdf(ctx, id, input)`,
  `deleteRegulationPdf(ctx, id, { baseRev })` (all writes → `Regulation`), `regulationIdFromParam(raw)` (not a `RegulationId` → 404
  `Không tìm thấy quy chế.`), `decodePdf(data)`, `decodeBase64Strict(data)`, `cleanPdfName(raw, id)`, `pdfContentDisposition(name)`,
  `pdfTooLargeError(bytes?)`, `regulationRef(id)`, `regulationFileRef(id)`, `RegulationPdfDeleteSchema`, `REGULATION_PDF_BODY_MAX_BYTES`,
  `REGULATION_MSG`, types `RegulationPutData`, `RegulationPdfPutData`, `RegulationPdfDeleteData`, `RegulationFileDoc`.
  - `regulations/{id}` = `Regulation` (text in REGULATION_MARKUP + `pdf` meta); the original PDF is `regulationFiles/{id}`
    `{ name, size, contentType: "application/pdf", data: base64, uploadedAt, uploadedBy (email) }`, so the list never carries file bytes.
    The text and the PDF live only in Firestore (never in the repo). Not part of `LevelDataset`: no digest, no version bump.
  - Reads: `view.dashboard` (every role, no level check). Writes: `regulations.manage` = ADMIN **without** level restriction
    (`ALL_LEVEL_PERMISSIONS`; a level-limited ADMIN gets 403).
  - Every write is one transaction: `(baseRev ?? 0) ≠ (stored rev ?? 0)` → 409 `REGULATION_MSG.stale` (an omitted `baseRev` means "not created
    yet"); `rev + 1`, `updatedAt`, `updatedBy` (email), `updatedByName`; audit `UPDATE_REGULATION` (entity `"regulation"`, entityId = id, no
    `levelId`) with `detail: { part: "content", title }`, `{ part: "pdf", name, size }` or `{ part: "pdf", deleted: true, name }`.
  - Content: the first save creates the doc (rev 1); CRLF → LF; the `pdf` meta is kept; same title + school year + body → nothing written,
    the stored regulation is returned (same `rev`, no audit).
  - PDF upload: the regulation must exist (404 `Chưa có nội dung quy chế – lưu nội dung trước`); `data` is strict base64 (standard alphabet,
    canonical padding, no whitespace or `data:` prefix → 400); the decoded bytes start with `%PDF-` (400) and are ≤ `REGULATION_PDF_MAX_BYTES`
    (700 KB → 413 `Tệp PDF quá lớn (… KB). Dung lượng tối đa là 700 KB …`; a request body above `REGULATION_PDF_BODY_MAX_BYTES` gets the same
    413 without the size). The stored name is NFC, without folder part/control characters, and ends in `.pdf` (empty → `<title>.pdf`); the
    regulation's `pdf.uploadedAt` = its `updatedAt`. Delete: 404 `Quy chế chưa có tệp PDF gốc.` when there is none (after the baseRev check).
  - Download headers: `Content-Type: application/pdf`, `Content-Disposition: inline; filename="<ASCII>"; filename*=UTF-8''<RFC 5987>`,
    `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.
- `evidence.ts`: `saveEvidence(ctx, input) → id` (`incident.create | reward.create | reward.propose` + level), `readEvidence(user, id)`, `decodeImageDataUrl(dataUrl)` (JPEG/PNG/WebP, magic bytes checked, ≤ `EVIDENCE_MAX_BYTES` = 700 KB), `EvidenceDoc`.
- `session.ts`: `recordLogin(user, ip?) → MeResponse` (sets `lastLoginAt` and audits LOGIN in one batch), `recordLogout(user, ip?)`,
  `recordLoginFailed(email, reason, ip) → "recorded" | "invalid-email" | "duplicate" | "daily-cap" | "error"`: anonymous, so bounded –
  only valid e-mails, `reason` reduced to known Firebase codes (else "other"), one entry per e-mail per 10 min per instance, at most
  `LOGIN_FAILED_DAILY_CAP` (300) entries per VN day school-wide (transaction on `counters/LOGIN_FAILED_{yyyymmdd}`; the entry reaching the
  cap has `detail.dailyCapReached`), never throws. `resetLoginFailedState()` (tests).
- `digest-size.ts`: `assertDigestSize(docId, data)`, `estimateBytes(data)`, `DIGEST_MAX_BYTES = 900_000`.

**Stored-field conventions** (incidents, rewards and inspections): `createdBy` is the uid. `createdByName` is the display name. `updatedBy` and
`deletedBy` hold the actor's **email**. `gvcnNoteBy` and `remediationBy` hold the display name. `reporter` defaults to the creator's display name.
Edits keep the original catalog snapshot (penalty, unit) unless `errorCode` changes, and they keep student snapshots unless the class changes.
Editors cannot modify a reward that is already "Đã xác nhận". Changing a status to or from "Đã xác nhận" needs `reward.verify`.

---

## 3. Routes implemented by server core

| Route | Permission / rule | Notes |
|---|---|---|
| `POST /api/auth/session` | any active user | audit LOGIN, `lastLoginAt` → `MeResponse` |
| `POST /api/auth/login-failed` | public, 5/min and 30/h per client address (IPv6 per /64) | audit LOGIN_FAILED within the bounds of `recordLoginFailed`; always `{ ok: true }` |
| `POST /api/auth/logout` | any active user | audit LOGOUT |
| `GET /api/me` | any active user | `MeResponse` |
| `GET /api/dataset?level=` | view.dashboard + level | `ETag: W/"<version>"`, `Cache-Control: private, no-cache`, `Vary: Authorization`. A matching `If-None-Match` returns 304 after reading only `meta/versions`. GVCN data is redacted. |
| `POST /api/incidents` | incident.create + level | 201. A repeated `clientRequestId` returns 200 with the existing record. |
| `GET /api/incidents?level=&deleted=1` | record.delete + level | `ListResponse<Incident>` (deleted only, newest first) |
| `GET /api/incidents/:id` | class detail access | deleted records → 404 unless record.delete |
| `PATCH /api/incidents/:id` | editAny, or own & < 24 h | recomputes every derived field and moves the incident between week digests; optional `baseRev` → 409 when stale; a new date must be in the calendar |
| `DELETE /api/incidents/:id` | record.delete | body `{ reason }`. Soft delete, 409 if already deleted. |
| `POST /api/incidents/:id/restore` | record.delete | 409 if not deleted, or if its week is no longer in the calendar |
| `POST /api/incidents` + `notDuplicateOf` | incident.create | ids of same-level incidents reviewed as "không trùng" (else 400) |
| `POST /api/incidents/:id/feedback` | `anyPermission: incident.gvcnFeedback, incident.remediate`; service: GVCN of the class or ADMIN (note + status + remediation), EDITOR with incident.remediate (remediation + status) | sets `gvcnNote`/`gvcnNoteBy`/`gvcnNoteAt`/`status`/`remediation`/`remediationBy`/`remediationAt` |
| `POST /api/incidents/:id/not-duplicate` | data.inspect + level | `NotDuplicateSchema { otherIds (1–20) }` → `ListResponse<Incident>` (see `markNotDuplicate`) |
| `POST /api/rewards` | **reward.propose** (+ level); without reward.create: own class only, status "Mới ghi nhận", `proposed` | integer 1–5, reason ≥ 5 chars; 201 (200 for a repeated `clientRequestId`) |
| `GET ?level&deleted=1`, `PATCH/DELETE /api/rewards/:id`, `POST /:id/restore` | as for incidents; "Đã xác nhận" needs reward.verify | class must exist and be active, date not in the future and in the calendar; changed points → 1–5, changed reason → ≥ 5 chars; `baseRev` like incidents |
| `POST /api/evidence` | incident.create, reward.create or reward.propose, + level | 201 `{ id }`, audit UPLOAD_EVIDENCE |
| `POST /api/inspections` | inspection.manage + level | `InspectionCreateSchema` → 201 `Inspection` (200 + existing round for a repeated `clientRequestId`) |
| `PATCH /api/inspections/:id` | inspection.manage; ADMIN any, EDITOR own ≤ 24 h | `InspectionUpdateSchema` (+ `baseRev` → 409) → `Inspection` |
| `DELETE /api/inspections/:id` | inspection.manage; ADMIN any, EDITOR own ≤ 24 h | body `{ reason }` → `{ ok: true }`; soft delete, 409 if already deleted |
| `GET /api/report-plans?level&mode&key` | view.dashboard + level (GVCN: levels of their classes) | `ReportPlanQuerySchema` (`level` → `levelId`; Monday / `yyyy-mm` key, else 400) → `ReportPlanResponse { plan }`, `null` when nothing was saved |
| `PUT /api/report-plans` | report.plan (ADMIN, EDITOR) + level | `ReportPlanPutSchema` (≤ 30 items, `baseRev` → 409) → `ReportPlan`; audit UPDATE_REPORT_PLAN (see `report-plans.ts`) |
| `GET /api/regulations` | view.dashboard (every role) | `ListResponse<Regulation>` in `REGULATION_IDS` order, never-saved ones omitted; no file bytes |
| `PUT /api/regulations/:id` | regulations.manage (ADMIN without level restriction) | `RegulationPutSchema` (`baseRev` → 409; unknown id → 404) → `Regulation`; audit UPDATE_REGULATION (see `regulations.ts`) |
| `GET /api/regulations/:id/pdf` | view.dashboard (every role) | PDF bytes, `Content-Disposition: inline` + `filename*`, `Cache-Control: private, no-store`; 404 when none |
| `PUT /api/regulations/:id/pdf` | regulations.manage | `RegulationPdfPutSchema` (strict base64, `%PDF-`, ≤ 700 KB → 413; content must exist → 404; `baseRev` → 409) → `Regulation` |
| `DELETE /api/regulations/:id/pdf` | regulations.manage | JSON body `{ baseRev }` → `Regulation` without `pdf`; 404 when there is no PDF |
| `GET /api/evidence/:id` | level access | bytes, `Cache-Control: private, max-age=86400, immutable` |
| `GET /api/health` | public | `{ ok: true, time }` |

---

## 4. Testing against the emulators

Helpers are in `src/lib/server/__tests__/helpers.ts`:

| helper | purpose |
|---|---|
| `setupTestProject(projectId)` | `projectId` must start with `demo-`. Binds the server to it (`initAdminForTests`), clears Firestore and Auth for that project, and resets the profile cache and rate limits. Call it in `beforeAll`. |
| `seedReference(levelId, { classes?, catalog?, students?, config?, weeks? })` | Classes as `"7A01"` or `{ code, active?, … }` (grade comes from the leading digits). The catalog defaults to `TEST_CATALOG` (L01 2đ/HS, L02 5đ/lần, L03 1đ/HS 5S, L04 3đ/lần 5S, L05 inactive). The config defaults to `testConfig(level)`, whose calendar always contains today. Students are `{ id, name, classCode, status? }`. Writes canonical docs plus the `__ref`/`__stu` digests. |
| `createTestUser({ uid, role, email?, displayName?, levels?, gvcnClasses?, active?, withProfile? })` | Creates the Auth emulator user and the `users/{uid}` profile. Returns `{ uid, email, token, profile }`. |
| `tokenFor(uid, email?, claims?)` / `mintEmulatorIdToken(...)` | Creates the Auth user if needed and returns an unsigned ID token. |
| `callRoute<T>(handler, { method, url, body, token, params, headers })` | Calls an exported route function with a real `NextRequest` and returns `{ status, headers, body (parsed JSON), text, bytes, response }`. It sends `x-forwarded-for: 203.0.113.7` by default. |
| `listDocs<T>(collection)`, `getDoc<T>(collection, id)`, `clearEmulatorProject(id)`, `testConfig`, `TEST_CATALOG` | Assertions and setup. |

**How tokens work.** With `FIREBASE_AUTH_EMULATOR_HOST` set, firebase-admin accepts **unsigned** JWTs (`alg: "none"`) whose
`aud` is the project id and whose `iss` is `https://securetoken.google.com/<projectId>`. In emulator mode it **also looks the user up**
(revocation/disabled check), so the Auth emulator user must exist first. `tokenFor` and `createTestUser` handle that.
Signing in through the emulator REST API is not needed.

Tips:
- Use one project id per test file (`demo-test-<area>-<topic>`). Vitest runs files in parallel.
- After editing a profile directly in Firestore, call `invalidateProfileCache(uid)`.
- To test the 24 h window, update `createdAt` on the stored doc.
- The emulator uses gRPC. REST transport is used only against real Firestore.
- Run: `npx vitest run src/lib/server/__tests__/` (server-core files are `core-*.test.ts`; REQ_V2 server rules are covered by
  `v2-{inspections,rewards,feedback,duplicates,settings}.test.ts`, project ids `demo-test-v2-*`; the report plans by `report-plans.test.ts`,
  `demo-test-report-plans`; the regulations by `regulations.test.ts`, `demo-test-regulations`, with short fake text and fake PDF bytes only).
- `setupTestProject` also clears the dataset memo (`invalidateDatasetCache`) and the LOGIN_FAILED state. After writing digests directly
  (without a version bump) call `invalidateDatasetCache()`.
- Never call the Auth emulator's keyed client endpoints (`/v1/accounts:signUp?key=…`, `signInWithPassword`) from tests: they target the
  emulator's **default** project (`demo-nshm-nennep`, the demo data). Use `adminAuth()` or the project-scoped
  `/v1/projects/<id>/accounts:*` endpoints with `Authorization: Bearer owner`.

---

## 5. Firestore indexes (`firestore.indexes.json`)

Composite indexes:

| collection | fields | used by |
|---|---|---|
| incidents | levelId ASC, deletedAt DESC | `listDeletedIncidents` |
| rewards | levelId ASC, deletedAt DESC | `listDeletedRewards` |
| digests | levelId ASC, kind ASC | `rebuildIncidentDigests` / `rebuildRewardDigest` / `rebuildInspectionDigests` (stale digest cleanup) |
| auditLogs | action ASC, ts DESC · email ASC, ts DESC · levelId ASC, ts DESC · uid ASC, ts DESC | `/api/audit-logs` filters (equality filters combine through index merging; a `ts` range is allowed) |
| actions | levelId ASC, createdAt DESC · levelId ASC, deadline ASC | `/api/actions` |
| importBatches | levelId ASC, createdAt DESC | reset/import history |
| students | levelId ASC, classCode ASC, name ASC | class rosters ordered by name |

REQ_V2 adds no composite index: `rebuildInspectionDigests` queries `inspections` by `levelId` only (automatic single-field index).
`reportPlans` are only read by document id (no query, no index).
Single-field index exemptions (large or opaque values that are never queried): `digests.items/classes/catalog/weeks/config`,
`evidence.data`, `auditLogs.detail`, `incidents.dataIssues`, `incidents.detail`, `students.history`.
If you add a query with an inequality or `orderBy` on another field, add its index here. This file belongs to server-core, so ask its owner to add it.

---

## 6. Admin services (`src/lib/server/admin/`) – server-admin

Every service takes `ctx: ServiceCtx` (`{ user, ip?, today? }`) and re-checks level access (`requireLevel`) itself; routes check the
permission. Inputs are the zod **outputs** of the contract schemas (`z.output<typeof XSchema>`, exported as `XData` types).

### Routes

| Route | Permission | Service | Notes |
|---|---|---|---|
| `GET /api/students/:id` | view.dashboard + class detail of the CURRENT class | `getStudent(user, id)` | GVCN: own classes only; a non-ACTIVE student only when named in this school year's incidents of their classes |
| `POST /api/students` | students.manage | `createStudent(ctx, input)` | 201. Mã HS unique school-wide → 409 "Mã HS đã tồn tại (lớp X)". Class must exist and be active. History ENROLL / TRANSFER_IN |
| `PATCH /api/students/:id` | students.manage | `updateStudent` | name/dob/gender/note only ("" clears gender/note); history UPDATE; no-op = no write |
| `POST /api/students/:id/transfer` | students.manage | `transferStudent` | ACTIVE only (409), active class of the same level, not the same class (400). History TRANSFER_CLASS. Incidents untouched (AC-019) |
| `POST /api/students/:id/withdraw` | students.manage | `withdrawStudent` | ACTIVE only; status/leftAt/leftReason; history TRANSFER_OUT |
| `POST /api/students/:id/reinstate` | students.manage | `reinstateStudent` | non-ACTIVE only (409); clears leftAt/leftReason; history REINSTATE |
| `POST /api/students/:id/promote-level` | students.manage + both levels | `promoteStudentLevel(ctx, id, StudentPromoteSchema)` | chuyển cấp `{ toLevelId, classCode, date, note? }`: same Mã HS, history kept + TRANSFER_IN with `fromLevel/toLevel`, ACTIVE in an active class of the target level (other level only, else 400); both `__stu` digests and both versions in one transaction; audit TRANSFER_STUDENT `detail.promoteLevel` |
| `POST /api/imports/students/preview` · `/commit` | students.manage | `previewStudentImport` · `commitStudentImport` | maxDuration 60. See below |
| `POST /api/imports/workbook/preview` · `/commit` | excel.import | `previewWorkbook` · `commitWorkbook` | maxDuration 60. See below |
| `POST /api/exports/log` | excel.export | `logExport` | audit EXPORT_EXCEL (`entityId` = kind: workbook, html, ranking, gvcn, students, audit, `report` = Báo cáo tuần/tháng; details > 4 000 chars are dropped) |
| `GET /api/actions?level=` | actions.view | `listActions(user, levelId)` | Open → Doing → Done, then deadline, then code |
| `POST /api/actions` | actions.manage | `createAction` | 201, code `HD-yyyymmdd-NNN` (creation day), status Open, history; `scopeClass` must exist |
| `PATCH /api/actions/:id` | actions.manage | `updateAction` | Done with empty evidence (after merge) → 400 "Cần nhập minh chứng hoàn tất trước khi chuyển sang Hoàn thành" (AC-014); history entry (`note` or auto text); `closedAt` set/cleared |
| `GET /api/audit-logs` | audit.view (school-wide admins only) | `queryAuditLogs(AuditQuerySchema output)` | `?action&email&level&from&to&cursor&limit` (limit 1–100, default 50) |
| `GET /api/rankings` | view.dashboard + level | `getRankings(user, RankingsQuerySchema output)` | `?level&mode&key&classCode&grade`; no `mode` = current week (`defaultPeriod`). Tables follow `rankingRuleOf(level)`: one per khối (`grade` keeps one), or – THPT – one level-wide table (`grade` = 0, rows keep their own grade, equal scores → fewer `violationTurns` first; the `grade` param is ignored) |
| `PUT /api/settings/:level/config` | settings.manage | `putConfig(ctx, level, input, { allowHidingRecords })` | merge; firstWeek must be Monday; semesters ordered, non-overlapping; audit UPDATE_CONFIG `{ changes: { field: { before, after } } }`. While the calendar is generated from the config (no stored weeks), a firstWeek/semester change is checked like PUT weeks (`?allowHidingRecords=1`). |
| `PUT /api/settings/:level/early-warning` | settings.manage | `putEarlyWarning(ctx, level, EarlyWarningPutSchema output)` | replaces `config.earlyWarning` (fixed key order, unique `seriousGroups`) through `saveReferenceParts` (`__ref` + version bump + audit UPDATE_CONFIG `detail.changes.earlyWarning { before, after }`); unchanged (canonical JSON) → no write. `putConfig` and the workbook config import spread the stored config and keep it. `normalizeEarlyWarning(input)` |
| `PUT /api/settings/:level/catalog` | settings.manage | `putCatalog` | replace; unique codes; missing items → `active:false` (never deleted); audit `{ added, updated, deactivated }` |
| `PUT /api/settings/:level/classes` | settings.manage | `putClasses` | same semantics; grade must belong to the level; email lower-cased |
| `PUT /api/settings/:level/weeks` | settings.manage | `putWeeks(ctx, level, input, { allowHidingRecords })` | `{ items }` replaces (Mondays, unique, known semester) or `{ regenerate: true }` (keeps counted/note of existing weeks). Removed weeks that hold records → 409 `details: { weeks, incidents, rewards }` unless `?allowHidingRecords=1` (audit `detail.hiddenRecords`). An unchanged calendar writes nothing. |
| `GET /api/users` · `POST /api/users` | users.manage (school-wide admins only) | `listUsers()` · `createUser` | 201 `{ profile, tempPassword? }`. An Auth account that already existed is linked as is only when it is a verified Google/Microsoft account of that address; otherwise it is **re-secured** (new temporary password returned, other providers and MFA removed, refresh tokens revoked, `sessionsValidAfter` set, audit `resecuredExistingAuth`) – protection against accounts registered through the public sign-up API before the admin created the profile |
| `PATCH /api/users/:uid` | users.manage | `updateUser` | the last active **school-wide** ADMIN (active, `levels = []`) cannot lose the role, be locked or be restricted → 400; an admin cannot change their own role/levels or lock themselves → 400; profile cache invalidated; locking sets `sessionsValidAfter`, disables the Auth user and revokes tokens |
| `POST /api/users/:uid/reset-password` | users.manage | `resetPassword` | `{ tempPassword }` (never written to the audit); revokes refresh tokens and sets `sessionsValidAfter` (tokens issued before → 401) |
| `POST /api/users/bulk-gvcn` | users.manage | `bulkCreateGvcn(ctx, levelId, { sync })` | maxDuration 60. Existing Auth accounts are linked/re-secured like `createUser` (re-secured ones are in `created` with a temp password). `sync: true` also removes this level's class assignments that no longer match the class list (`unassigned`) |
| `POST /api/admin/rebuild-digests` | settings.manage | `rebuildDigests(ctx, levelId?)` | `{ ok: true, results: { [level]: RebuildResult } }` (incl. `inspections`); audit REBUILD_DIGESTS per level |
| `POST /api/admin/reset-level` | data.reset | `resetLevel` | `confirmText` must be exactly `XOA <LEVEL>` (400). Soft-deletes live incidents+rewards with `deleteReason "RESET:<batchId>"` (inspection rounds are not scored and are left untouched) |
| `POST /api/admin/restore-reset` | data.reset | `restoreReset` | 404 unknown batch / other level, 409 already restored; works on a reset that stopped half-way |
| `POST /api/admin/evidence` | data.reset | `maintainEvidence(ctx, EvidenceMaintenanceSchema)` | `{ levelId, dryRun = true }` → `EvidenceMaintenanceResult` (total, bytes, attached, orphaned). `dryRun: false` deletes photos that are not attached to any record and older than 48 h (photos still referenced by a record's `photoIds` are re-linked instead); audit RESET_DATA `detail.purgeEvidence` |

All mutations write `auditLogs` (ADD/UPDATE/TRANSFER/WITHDRAW/REINSTATE_STUDENT, IMPORT_STUDENTS, IMPORT_EXCEL, UPDATE_CONFIG/CATALOG/CLASSES/WEEKS,
CREATE/UPDATE_USER, RESET_PASSWORD, CREATE/UPDATE_ACTION, RESET_DATA, REBUILD_DIGESTS, EXPORT_EXCEL).
Student mutations update `__stu` + bump the version in the same transaction. Actions do **not** bump `meta/versions` (not in the dataset).

### Student roster import (`imports-students.ts`)
- Row kinds: `INVALID` (missing id/name/class, unknown or inactive class, invalid dob, duplicate id in the file – later rows, id of a student
  still ACTIVE in another level), `NEW`, `REINSTATE` (existing non-ACTIVE, or **chuyển cấp**: a student who left another level – the change
  "Chuyển cấp: TH lớp 5A1 (…) → THCS lớp 6A01", committed as TRANSFER_IN with `fromLevel`, the other level's `__stu` rebuilt),
  `TRANSFER` (class changed), `UPDATE` (name / dob / gender changed; empty dob/gender are "not provided"), `UNCHANGED`. Class codes match ignoring case/spaces. `changes` are Vietnamese ("Lớp: 6A01 → 6A02").
- `mode: "sync"` lists ACTIVE students of the level whose id is not in the file (`missing`); `applyMissingAsWithdrawn` withdraws them on
  commit (TRANSFERRED_OUT, leftAt = effectiveDate, leftReason "Không có trong danh sách import").
- `previewHash` = sha256(canonical JSON of the request + `__stu.updatedAt` + `__ref.updatedAt`); commit recomputes → 409
  "Dữ liệu đã thay đổi, vui lòng xem trước lại". Writes in ≤ 450-op batches; the last batch carries the full `__stu` digest, the version
  bump and one IMPORT_STUDENTS audit with the counts. Nothing to write → only the audit. New rows keep a non-"Đang học" `statusText` in `note`.

### Workbook import (`imports-workbook.ts` + `workbook-*.ts`)
- `planWorkbook(input, state)` is pure; `loadWorkbookState(payload, today)` does every read (canonical reference, level students, other-level
  ids, existing incident/reward docs for the payload codes, counters, existing codes of days that need generated codes).
- Request: `{ payload, options, overwriteAppChanges?, rescoreExisting? }` (preview and commit; both flags are part of the hash).
  `rescoreExisting` ("Tính lại sự việc đã ghi theo bảng điểm mới"): stored incidents in the file take penalty/unit from the current error
  table (the file's "Bảng điểm lỗi" when imported; the recorded texts stay) – for a rule changed retroactively. Their points come from
  the table, so the file's points column raises no POINTS_MISMATCH_IMPORT for them; a unit change that drops an unnamed count / an
  occurrence count is warned. App-recorded / app-edited incidents are still skipped unless `overwriteAppChanges` (hint in the row).
- Sections: classes/catalog **upsert** (existing keep active / order / is5S; only non-empty file fields overwrite; new catalog items get
  `is5S` from `DEFAULT_5S_CODES`); config only when `options.config` (base score, firstWeek → Monday, HK1/HK2 dates); weeks upsert
  (existing keep `counted`/`note`); students upsert (class must exist in the effective class list; a non-"Đang học" status goes to `note`;
  existing students keep their status – a withdrawn student is not reinstated by a workbook). A student changed in the app since their
  last workbook import (any history event not written by a workbook import) keeps class/name/dob/gender (WARNING, skipped) unless
  `overwriteAppChanges`. A Mã HS of another level: still ACTIVE there → ERROR; already left → WARNING + chuyển cấp (TRANSFER_IN `fromLevel`,
  the other level's `__stu` is rebuilt after the commit).
- Incidents: ERROR (row skipped) for invalid/empty/future date, a date outside the calendar weeks, unknown class, unknown error code, invalid
  or duplicate code, and a code that already belongs to **another** incident (stored class or error differ – legacy sheets renumber rows,
  app codes restart at 0001 every day) unless `overwriteAppChanges`. Links resolve by Mã HS, then by normalised name inside the incident
  class; a student the stored incident already names keeps its snapshot; a student who left the incident class on/after the incident date
  (history) is linked with the incident class; issues STUDENT_NOT_FOUND (link dropped), STUDENT_WRONG_CLASS (kept with the real class),
  DUPLICATE_STUDENT (skipped), POINTS_MISMATCH_IMPORT, SCOPE_MISSING (default "Cá nhân" with links, else "Tập thể"), MISSING_STUDENTS for
  "Cá nhân" without any student (BR-POINT-04), LEGACY_NOTE ("Ghi chú trong file cũ: …"). Status: "Đã đóng"; "Đang xử lý"/"Đã giao" →
  "Đang xử lý"; "Mới ghi nhận"; a blank cell keeps the stored status (new rows: "Mới ghi nhận"); unknown text → WARNING, stored status kept.
  Rewards: the same status rules (leaving "Đã xác nhận" is warned), calendar ERROR and code-of-another-class ERROR.
  Evidence cell: http(s) links → `evidenceUrls`, other text → appended to `detail`. Links to codes missing from "Nhập liệu" are ERROR rows of
  the links section; rows without any student are WARNING and skipped.
- Idempotent by doc id `{level}_{code}`: identical → skip; existing → update (keeps createdAt/createdBy/createdByName, GVCN feedback, photos,
  `unnamedCount`, source, the **catalog snapshot** while the error code is unchanged – a different current penalty is only a WARNING, unless `rescoreExisting` –,
  the stored students when the file has no link row for the code; reporter/detail/evidence kept when the file cell is empty); soft-deleted
  → WARNING + skip. Every written record stores `importHash` (hash of the content written) and the next `rev`; a record whose content no
  longer matches its `importHash` (changed in the app since: GVCN feedback, review fixes, edits – or never imported) is NOT updated:
  WARNING "đã được cập nhật trong phần mềm…", skipped, unless `overwriteAppChanges`. Empty code → new
  `NN-`/`KT-` code after max(counter, imported codes of that day, existing docs of that day) (a re-import creates it again – warned).
  `counters/{NN|KT}_{level}_{yyyymmdd}.seq` raised to the highest imported/generated sequence.
- `previewHash` = sha256(canonical { request, planned writes (without timestamps) }). Commit: 409 on mismatch → `importBatches/{batchId}`
  `{ kind: "workbook", status: "running", levelId, sourceFileName, options, created, updated, skipped, review, … }` + IMPORT_EXCEL audit
  (written FIRST) → `saveReferenceParts` → records + counters in ≤ 450-op batches (creates use `create`, a collision → 409) →
  `rebuildAllDigests` (skipped when nothing was written and no batch of the level is still "running") → status "done" ("failed" + error on
  an exception). Batches still "running" (a commit that died, e.g. at maxDuration, before the rebuild) are repaired by the next commit or
  rebuild-digests and marked "interrupted" when older than 5 min (`admin/batches.ts`). Reset-level follows the same lifecycle.
  `WorkbookCommitResult.created/updated/skipped` are keyed by section; `review` = written incidents with REVIEW.

### Other exports worth reusing
- `common.ts`: `systemUser(email, displayName?, uid?)` (ADMIN actor for scripts), `makeClassLookup(classes)`, `classProblem(code, cls)`,
  `loadLevelStudents(levelId)`, `findStudentsInOtherLevels(levelId, ids)`, `getAllChunked(refs)`, `mapLimit(items, n, fn)`,
  `levelFromParam(raw)`, `errorCode(e)`, `EMAIL_RE`, `cleanText(s)`.
- `hash.ts`: `canonicalJson`, `sha256Hex`, `hashOf`, `PREVIEW_CHANGED_MESSAGE`. `passwords.ts`: `generateTempPassword()` → "Nshm-7Kq4-2734".
- `users.ts`: `ensureAuthUser(email, displayName, password?) → { uid, tempPassword?, linked, resecured }` (see POST /api/users),
  `isTrustedExistingAuthUser(userRecord, email)`, `coversScope(caller, target)`, `findProfileByEmail`, `dedupeClasses`, `USER_MSG`.
- `batches.ts`: `unfinishedBatches(levelId)`, `settleUnfinishedBatches(batches, repairedBy)`, `finishBatch(ref, status, error?)`, `BATCH_STALE_MS`.
- `evidence-maintenance.ts`: `maintainEvidence(ctx, { levelId, dryRun })`, `EVIDENCE_GRACE_MS` (48 h).
- `workbook-incidents.ts`: `importHashOf(content)`, `unchangedSinceImport(incident)`, `incidentContent(incident)`; `workbook-rewards.ts`:
  `rewardUnchangedSinceImport`, `rewardContent`, `REWARD_POINTS_SCALE_WARNING` (REQ_V2: points > 0 outside 1–5 are imported as in the file with the
  WARNING "Mức điểm cộng ngoài thang 1–5 (giữ theo file)." on rows that are written); `workbook-students.ts`: `changedInAppSinceImport(student)`, `isWorkbookEvent(event)`;
  `workbook-text.ts`: `parseIncidentStatus`, `parseRewardStatus`, `resolveImportedStatus`; `workbook-links.ts`: `leftClassOnOrAfter`.
- `common.ts`: `loadStudentsInOtherLevels(levelId, ids)` (full docs; `findStudentsInOtherLevels` returns level/class only).
- `audit-query.ts`: `AuditQuerySchema`, `vnDayStartIso(date)`, `encodeCursor/decodeCursor`, `MAX_SCAN = 3000` (in-memory filters scan at most
  this many logs per call; `nextCursor` then continues the scan, so a page can hold fewer than `limit` items).
- `rankings.ts`: `RankingsQuerySchema`, `resolvePeriod(q, weeks, semesters, today)`; tests: `admin-rankings.test.ts` (THCS per khối), `admin-rankings-thpt.test.ts` (THPT level-wide + tie-break).
- `env-file.ts`: `parseEnv(text)`, `loadEnvFile(path)` (existing env vars win).

### Scripts
- `npm run seed` (`scripts/seed.ts`): loads `.env.local`, **refuses to run unless `FIRESTORE_EMULATOR_HOST` and
  `FIREBASE_AUTH_EMULATOR_HOST` are set**, imports `data/seed/{TH,THCS,THPT}.xlsx` with every section (actor `seed@nshm.local`), approves RAG
  thresholds (demo), creates the demo accounts below (password **Nshm@2026**), 4 "[Demo] …" rewards (mixed statuses, points 1–5, reasons ≥ 5 chars) and 3 "[Demo] …" actions
  per level. Re-runnable.

  | email | role | scope |
  |---|---|---|
  | admin@nshm.test | ADMIN | all levels |
  | bgh@nshm.test | VIEWER | all levels |
  | nennep@nshm.test | EDITOR | all levels |
  | nennep.thcs@nshm.test | EDITOR | THCS |
  | gvcn.6a01@nshm.test | GVCN | THCS 6A01 |
  | gvcn.1a1@nshm.test | GVCN | TH 1A1 |
  | gvcn.12l01@nshm.test | GVCN | THPT 12L01 |

- `npm run create-admin -- <email> "<Họ tên>" [--env .env.production.local]`: the password is **never** a command-line argument (shell history,
  process list): `ADMIN_PASSWORD` from the environment/env file, else a hidden prompt (twice), else a generated temporary password printed
  once. Creates or links the Auth user (an existing one is re-secured: password set, other providers/MFA removed unless it is a verified
  Google/Microsoft account, sessions revoked), writes an active ADMIN profile (all levels) + audit. Defaults to `.env.local` (emulators);
  shell variables override file values. The old `<email> <password> "<Họ tên>"` form is refused.

### Indexes added by server-admin
`incidents` and `rewards` (levelId ASC, deleteReason ASC) for restore-reset; `users` (role ASC, active ASC) for the last-admin check;
`importBatches` (levelId ASC, status ASC) for unfinished batches. `incidents/rewards.photoIds` (array-contains, automatic single-field index)
for the evidence maintenance.
The audit query uses the existing `auditLogs {email|action|levelId} ASC, ts DESC` indexes (plus the implicit `__name__` tie-breaker).
