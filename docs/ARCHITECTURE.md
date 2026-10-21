# NSHM Nền nếp – Architecture & Build Contract

Web app to record, score and evaluate student discipline ("nền nếp") for **Trường Ngôi Sao Hoàng Mai**
(3 levels: Tiểu học grades 1–5 / 66 classes, THCS 6–9 / 50 classes, THPT 10–12 / 21 classes; ~4,400 students).
Source requirements: `docs/DacTa_WebApp_NenNep.xlsx` (internal, kept locally – not in the public repo) (FR/BR/AC IDs referenced below). Legacy data: `data/seed/{TH,THCS,THPT}.xlsx`.

**Binding files (do not change their exported shapes without being asked):**
`src/lib/types.ts`, `src/lib/constants.ts`, `src/lib/contract.ts`, `src/lib/firestore-paths.ts`,
`src/lib/engine/dates.ts`, `src/lib/engine/scoring.ts`. You MAY add new exports to them if strictly needed; never rename/remove.

## 1. Stack

- **Next.js 15.5 App Router** (≥ 15.5.28 / React 19.1.10 – patched React Server Components; React 19, TypeScript strict) deployed on **Vercel**. UI pages are client components (`"use client"`).
- **Firebase Auth** (email/password; optional Google/Microsoft buttons behind `NEXT_PUBLIC_AUTH_GOOGLE/MICROSOFT`).
- **Cloud Firestore** accessed **only by the server** (route handlers in `src/app/api/**`, Node runtime, `firebase-admin`).
  Browsers may only `onSnapshot` the doc `meta/versions`, and only with an ACTIVE profile (see `firestore.rules`).
- No Cloud Functions, no Cloud Storage, so it can run on the free Spark plan, but production should use **Blaze with a
  budget alert** (Spark's hard daily read/write quotas and 1 GiB storage can be hit by many open tabs, failed-login
  logging and evidence photos). Evidence photos are compressed client-side (≈200 KB at 1280 px) and stored as Firestore
  `Bytes` docs in `evidence/` (≤700 KB each); photos never attached to a record are purged from Bảo trì.
- Tailwind CSS v4 (`@theme` in `src/app/globals.css`), Radix primitives, cmdk, sonner, lucide-react, ECharts (`echarts-for-react`),
  ExcelJS (import/export, lazy-loaded in the browser), zod, zustand, date-fns only if needed (prefer `engine/dates.ts`).
- Tests: **vitest**. Server integration tests run against the **Firebase emulators** (already running locally:
  Firestore `127.0.0.1:8080`, Auth `127.0.0.1:9099`). Use a unique project id per test file, e.g. `demo-test-incidents`
  (the emulator namespaces data per project id), and clear it in `beforeAll` via
  `DELETE http://127.0.0.1:8080/emulator/v1/projects/<id>/databases/(default)/documents` and
  `DELETE http://127.0.0.1:9099/emulator/v1/projects/<id>/accounts`.

Commands: `npm run typecheck`, `npm test`, `npm run dev` (uses `.env.local` → emulators), `npm run emulators`, `npm run seed`.

## 2. Data flow

```
Browser ──(Firebase Auth ID token)──► /api/* route handlers ──firebase-admin──► Firestore
   ▲                                                 │ every write = ONE transaction/batch:
   │ GET /api/dataset?level=X (ETag=version)         │   canonical doc + digest doc(s) + meta/versions++ + auditLogs
   │                                                 ▼
   └──── onSnapshot(meta/versions) ── version changed → refetch dataset
```

- **Canonical docs**: `incidents/`, `rewards/`, `students/`, `levels/{id}/…` (see `firestore-paths.ts`).
- **Read model ("digests")**: compact arrays per level so the dashboard costs ~55 document reads per load
  (free-tier friendly): `__ref` (config+classes+catalog+weeks), `__stu` (StudentLite[]),
  `__rew__{yyyy-mm}` (Reward[] whose week's Monday is in that month; the legacy single `__rew` doc is still read and
  maintained until the next digest rebuild migrates and deletes it), `__inc__{weekStart}` (Incident[] of that week).
  Only the digests of the calendar weeks/months are read, so records of other school years never reach the dataset.
  Deleted records are removed from digests but stay canonical.
  Every mutation MUST update the affected digest(s) **in the same transaction** and `FieldValue.increment(1)` the level
  counter in `meta/versions`. An admin endpoint rebuilds digests from canonical docs (`/api/admin/rebuild-digests`).
- **LevelDataset** (`GET /api/dataset`) = ref + students + incidents (school-year weeks) + rewards, filtered by role:
  GVCN receives only own-class students, and for OTHER classes incidents keep class/error/points/date but
  `students=[]`, `detail`, `gvcnNote`, `reporter`, `evidenceUrls`, `photoIds` stripped (`redacted: true`).
- All analytics are computed by the pure **engine** (`src/lib/engine/*`) – the same code runs on the server
  (`/api/rankings`, exports) and in the browser (instant filtering). Backend is the source of truth for every stored value.

## 3. Business rules (authoritative)

| Rule | Implementation |
|---|---|
| BR-POINT-01/02 | `computePoints` in `engine/scoring.ts` (/HS = penalty × (named+unnamed); /lần = penalty × occurrenceCount) |
| BR-POINT-03/04 + NSHM decision | `validateIncidentRules` (/HS needs ≥1 student; Cá nhân needs ≥1 named; `unnamedCount` only for /HS + Tập thể → flagged `THIEU_TEN_HS`, still counted) |
| Students in form | must currently belong to the incident class and be ACTIVE (FR-ENT-002) |
| Catalog snapshot | incident stores category/issue/group/penalty/unit at time of recording (never edited by hand) |
| BR-RANK-01 | score = base + counted rewards − penalties (may be negative; no floor) |
| BR-RANK-02/03 | base = `baseScorePerWeek` × countedWeeks. countedWeeks = weeks of the period with `counted=true` **and `weekStart ≤ Monday(today)`** (current month/semester only counts elapsed weeks). Week mode: 1 if that week is counted, else 0 |
| BR-RANK-04 | competition ranking 1,2,2,4 (higher score = better) |
| BR-RANK-05 | per grade: cutoff = `ceil(top90Ratio × classCount)`; `inTop90 = rank ≤ cutoff` (ties at cutoff are inside) |
| BR-RANK-06 | class filter never changes the ranking population (all ACTIVE classes of the grade); it only highlights |
| Rewards counted | only statuses in `config.rewardCountedStatuses` (default `["Đã xác nhận"]`) |
| BR-RAG-01/02 | avgWeeklyPenalty = penalties / max(1,countedWeeks). `!rag.approved` → GRAY ("Ngưỡng chưa được phê duyệt"); confidence < `minConfidence` → GRAY; ≥ red → RED; ≥ yellow → YELLOW; else GREEN. Always show text+icon with colour (NFR-ACC-01) |
| Data Confidence | (#OK + #THIEU_TEN_HS) / #incidents in scope; 100% when no incidents |
| Student points | a named student "carries" `penalty` for each **/HS** incident they are named in; **/lần points are never attributed to individuals**. Student incident count = incidents they are named in (any unit) |
| Student alerts | ≥ `studentAlert.perWeek` incidents in one week → "Cảnh báo đỏ". "Tái phạm" (REPEAT) = an incident in the period that is the student's ≥ `repeatMin`-th within the `repeatWindowWeeks` weeks ending with that incident's week – looking back before the period start with the same grade/class/category/error filters (later incidents never count). Class recidivism (≥ 2 consecutive counted weeks ≥ `rag.yellow`): in week mode measured over the week's semester up to that week (`contextPeriod`) |
| Calendar | incidents/rewards are only created, re-dated or imported on dates whose Monday is a calendar week; removing weeks that still hold records needs `?allowHidingRecords=1` (409 otherwise); restore needs the record's week in the calendar |
| Concurrency | incidents/rewards carry `rev` (+1 per mutation); PATCH with `baseRev` ≠ current → 409; the forms send it and only send `status` when the user changed it |
| BR-ACT-01 | action cannot become `Done` without non-empty `evidence` (server 400) |
| BR-AUD-01 | every sensitive mutation writes `auditLogs` in the same transaction/batch (append-only) |
| BR-DATA-02 | delete = soft delete (`deletedAt/deletedBy/deleteReason`), restorable by Admin |
| BR-IMP-01 | imports: preview (no writes) → commit with `previewHash` (server recomputes and rejects if the hash differs); idempotent by `externalId`/doc id |
| Incident code | `NN-yyyymmdd-NNNN` per level & day via `counters/NN_{level}_{yyyymmdd}` in the create transaction; if the doc id already exists (legacy import), keep incrementing. Rewards `KT-…`, actions `HD-yyyymmdd-NNN` |
| Edit rights | ADMIN: any record. EDITOR: own records within 24h (`EDITOR_EDIT_WINDOW_HOURS`). GVCN: only `/feedback` (note + status) on own classes |
| Reward status | EDITOR may set "Mới ghi nhận"/"Đang xác minh"; "Đã xác nhận" requires `reward.verify` (ADMIN) |

## 4. Roles (see `constants.ts` → `hasPermission`, `canAccessLevel`, `canSeeClassDetail`)

ADMIN (everything) · EDITOR (cán bộ nền nếp: view + create incidents/rewards + edit own recent + data inspection) ·
VIEWER (BGH/người xem: read everything in allowed levels) · GVCN (own classes: full detail; other classes: aggregates only; can give feedback).
`profile.levels = []` means all levels. Server enforces; client only hides UI.
`users.manage` and `audit.view` are **school-wide only** (`ALL_LEVEL_PERMISSIONS`): a level-limited ADMIN keeps the other
ADMIN permissions for its levels but cannot manage accounts or read the audit log. An admin cannot change their own
role/levels or lock themselves, and the last active school-wide admin cannot be demoted, locked or level-limited.
First sign-in of an email listed in `BOOTSTRAP_ADMIN_EMAILS` auto-creates an ADMIN profile only when the email is verified
and no active ADMIN exists yet (prefer `npm run create-admin`); other users without a profile get 403 "Tài khoản chưa được cấp quyền".
Password reset, lock and re-securing an existing Auth account set `sessionsValidAfter` (older ID tokens → 401; the client
signs out on a 401 that survives a token refresh).

## 5. Module APIs

### 5.1 Engine (`src/lib/engine/`, pure TS, no Firebase/React imports; `today` is always a parameter)

Already written: `dates.ts` (todayVN, mondayOf, addDays, diffDays, weekdayLabelVN, formatDateVN, formatWeekLabel,
formatMonthLabel, parseLooseDate, generateWeeks, weekInfo, semesterOfDate, compactDate, dateToIso, isIsoDate) and
`scoring.ts` (computePoints, normalizeCounts, validateIncidentRules, computeDataCheck, isReliable, buildIncidentCore, round2).

To implement (exact names):
```ts
// period.ts
export interface PeriodOption { mode: PeriodMode; key: string; label: string; isFuture: boolean; isCurrent: boolean }
export function periodOptions(weeks: SchoolWeek[], semesters: Semester[], today: string): { weeks: PeriodOption[]; months: PeriodOption[]; semesters: PeriodOption[] }
export function defaultPeriod(weeks: SchoolWeek[], today: string): Period            // current week if in calendar, else last past week, else {mode:"all"}
export function weeksInPeriod(period: Period, weeks: SchoolWeek[]): SchoolWeek[]
export function countedWeeks(period: Period, weeks: SchoolWeek[], today: string): number
export function isWeekInPeriod(weekStart: string, period: Period, weeks: SchoolWeek[]): boolean
export function previousPeriod(period: Period, weeks: SchoolWeek[], semesters: Semester[]): Period | undefined
export function periodLabel(period: Period, semesters: Semester[]): string             // "Tuần 12/10 – 18/10/2026", "Tháng 10/2026", "Học kỳ I", "Toàn bộ năm học"
// filters.ts
export function filterIncidents(ds: LevelDataset, f: GlobalFilters): Incident[]
export function filterRewards(ds: LevelDataset, f: GlobalFilters): Reward[]           // period+grade+class only
export function countedRewards(rewards: Reward[], config: LevelConfig): Reward[]
// rag.ts
export function dataConfidence(incidents: Incident[]): number
export function ragFor(a: { avgWeeklyPenalty: number; confidence: number; config: LevelConfig }): { rag: RagStatus; reason: string }
// ranking.ts
export function competitionRanks(scores: number[]): number[]                          // aligned with input order
export function top90Cutoff(classCount: number, ratio: number): number
export function buildRanking(ds: LevelDataset, period: Period, today: string, opts?: { highlightClass?: string; grade?: number }): { countedWeeks: number; grades: GradeRanking[] }
export function classScoreSeries(ds: LevelDataset, classCode: string, today: string): Array<{ week: string; score: number; penalty: number; reward: number; rank: number }>
// analytics.ts
export interface Kpis { incidents: number; relatedStudents: number; uniqueStudents: number; penaltyPoints: number; rewardPoints: number; classesWithIncidents: number; confidence: number; reviewCount: number; unnamedStudentCount: number }
export function computeKpis(ds: LevelDataset, f: GlobalFilters): Kpis
export function kpiComparison(ds: LevelDataset, f: GlobalFilters): { current: Kpis; previous?: Kpis; previousLabel?: string }
export interface IssueStat { errorCode: string; issue: string; category: string; unit: Unit; incidents: number; points: number; students: number; classCount: number }
export function topIssues(incidents: Incident[], n?: number): IssueStat[]              // incidents desc, points desc
export interface ClassStat { classCode: string; grade: number; homeroomTeacher?: string; incidents: number; points: number; students: number; topIssue?: string }
export function classStats(ds: LevelDataset, f: GlobalFilters): ClassStat[]           // every active class in scope (zeros included), sorted points desc, incidents desc
export interface StudentStat { id: string; name: string; classCode: string; grade: number; status: StudentStatus; incidents: number; points: number; errors: Array<{ errorCode: string; issue: string; count: number }>; lastDate: string; maxPerWeek: number; alert: "NONE" | "REPEAT" | "WEEKLY_RED" }
export function studentStats(ds: LevelDataset, f: GlobalFilters, today: string): StudentStat[]   // only students named in filtered incidents; incidents desc, points desc
export function studentHistory(ds: LevelDataset, studentId: string, period?: Period): Incident[]   // newest first
export interface GradeStat { grade: number; classCount: number; incidents: number; penaltyPoints: number; rewardPoints: number; avgScore: number; studentsInvolved: number; top90Count: number }
export function gradeStats(ds: LevelDataset, f: GlobalFilters, today: string): GradeStat[]
export function categoryBreakdown(incidents: Incident[]): Array<{ category: string; incidents: number; points: number }>
export interface TrendPoint { week: string; label: string; incidents: number; points: number; rewards: number; confidence: number }
export function weeklyTrend(ds: LevelDataset, f: GlobalFilters, today: string): TrendPoint[]   // all school-year weeks ≤ today; ignores f.period, honours other filters
export function classWeekHeatmap(ds: LevelDataset, f: GlobalFilters, today: string): { classes: string[]; weeks: string[]; values: Array<[weekIdx: number, classIdx: number, points: number]> }
export interface TimelineDay { date: string; weekday: string; points: number; items: Incident[] }
export function classTimeline(ds: LevelDataset, classCode: string, period: Period): TimelineDay[]   // newest day first (FR-CLS-002)
export function recidivism(ds: LevelDataset, f: GlobalFilters, today: string): { students: StudentStat[]; classes: Array<{ classCode: string; grade: number; consecutiveWeeks: number; lastRag: RagStatus }> }
export function fiveS(ds: LevelDataset, f: GlobalFilters, today: string): { incidents: number; points: number; byClass: Array<{ classCode: string; incidents: number; points: number }>; byWeek: Array<{ week: string; label: string; incidents: number; points: number }> }
export function weekdayDistribution(incidents: Incident[]): Array<{ weekday: string; incidents: number }>
// brief.ts
export interface DecisionBrief { title: string; periodLabel: string; summary: string; findings: Array<{ title: string; detail: string; severity: "high" | "medium" | "low" }>; evidence: string[]; impact: string; recommendations: Array<{ title: string; priority: Priority; owner: string; deadlineDays: number; scopeClass?: string }> }
export function buildDecisionBrief(ds: LevelDataset, period: Period, today: string): DecisionBrief
// text.ts
export function normalizeVN(s: string): string        // strip diacritics (incl. đ→d), lowercase, collapse spaces
export function matchesSearch(text: string, query: string): boolean   // every query token is a substring of normalizeVN(text)
export function nameSuggestions(partial: string, students: StudentLite[], limit?: number): StudentLite[] // e.g. "Trường Phúc" → students whose name ends with / contains those tokens
// index.ts re-exports everything
```

### 5.2 Server (`src/lib/server/`, Node only – never import from client components; do NOT `import "server-only"`, it breaks vitest)

`firebase-admin.ts` (`db()`, `adminAuth()`, init from env: emulator hosts → projectId only; else `FIREBASE_SERVICE_ACCOUNT_BASE64` or
`FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` with `\n` unescaping), `errors.ts` (`ApiError`, `Errors.*`),
`handler.ts` (`apiHandler({ permission?, public? }, async (ctx) => result)` → JSON/404/zod→400 mapping; `parseBody(req, schema)`;
`ctx = { user, req, params, ip }`), `auth.ts` (verify ID token → load/caches profile → `SessionUser`),
`audit.ts`, `versions.ts` (`bumpVersions(tx, levelIds)`), `reference.ts` (load/rebuild `__ref`, defaults when empty),
`digests.ts` (week-digest upsert/remove inside transactions, rebuild functions), `ids.ts` (`nextCode`), `rate-limit.ts`,
`dataset.ts` (build + redact `LevelDataset`). Repos per domain as needed. After finishing, the server-core author writes
`docs/SERVER_API.md` listing every exported helper with its signature.

### 5.3 Client (`src/lib/client/`)

```ts
// firebase.ts   getClientAuth(), getClientDb()  (emulators when NEXT_PUBLIC_USE_EMULATORS=true)
// api.ts        export class ApiClientError extends Error { status: number; code: string; details?: unknown }
//               export const api = { me, session, loginFailed, logout, dataset(levelId, etag?), rankings(q),
//                 incidents: { create, get, update, remove(id, reason), restore, feedback, listDeleted(levelId) },
//                 rewards: { create, update, remove, restore, listDeleted }, evidence: { upload(levelId, file: File): Promise<string>, objectUrl(id): Promise<string> },
//                 students: { get, create, update, transfer, withdraw, reinstate, importPreview, importCommit },
//                 workbook: { preview, commit }, exportsLog, actions: { list, create, update }, auditLogs(q),
//                 settings: { putConfig, putCatalog, putClasses, putWeeks }, users: { list, create, update, resetPassword, bulkGvcn },
//                 admin: { rebuildDigests, resetLevel, restoreReset } }   – all typed with contract.ts types
// session.tsx   <SessionProvider>; useSession(): { status: "loading"|"signedOut"|"signedIn"|"forbidden"; profile?: UserProfile; accessibleLevels: LevelId[];
//               login(email, password); loginWithProvider("google"|"microsoft"); logout(); changePassword(current, next);
//               can(p: Permission): boolean; canSeeClass(levelId, classCode): boolean }
// data.tsx      <DataProvider>; useLevel(): { levelId, setLevelId, accessibleLevels }; useDataset(levelId?): { dataset?: LevelDataset; status: "idle"|"loading"|"ready"|"error"; error?: string; refresh(): Promise<void> }
//               (memory cache per level, ETag revalidation, onSnapshot(meta/versions) → debounced refetch; call refresh() after own mutations)
// filters.tsx   useFilters(): { filters: GlobalFilters; setFilters(patch); resetFilters(); options: { weeks; months; semesters; grades; classes; categories; errors } }
//               URL-synced (?mode=&key=&grade=&class=&cat=&err=); default period = engine defaultPeriod
// format.ts     fmtNumber, fmtPoints (signed), fmtPercent, fmtDate (=formatDateVN), fmtDateTime (dd/mm/yyyy HH:mm, VN tz), fmtRelative
// excel/        (lazy-loaded) see §5.4
```

### 5.4 Excel (`src/lib/excel/`, works in browser and Node; ExcelJS)

- `parse-workbook.ts`: `parseNshmWorkbook(buffer: ArrayBuffer, fileName: string): Promise<{ payload: WorkbookPayload; warnings: string[] }>`
  Detects level from titles/grades; handles the 3 legacy layouts (THCS "HS liên quan" = Mã sự việc | Lớp sự việc | Chọn học sinh(name) | Mã HS …;
  TH/THPT "HS liên quan" = Mã sự việc | "NAME | CLASS | dd/mm/yyyy | ID" | Họ và tên | Ngày sinh | Lớp HS | Lớp sự việc | Kiểm tra | Tuần | Mã lỗi | Mã HS;
  DS Học sinh THCS = Lớp | Họ tên | Mã HS | Trạng thái; TH/THPT = Mã HS | Họ tên | Ngày sinh | Lớp | Khối). Uses cached formula results.
  Error code = last `| Lxx` token of the "Chọn lỗi" text (fallback: match by issue text). Student ids always strings.
  Non-standard text in "Kiểm tra dữ liệu" (not OK/THIẾU …) → `legacyCheckText`. Also reads our own export format (round-trip) incl. "Điểm thưởng".
- `parse-roster.ts`: `parseRosterSheet(buffer, fileName): Promise<{ rows: RosterRow[]; sheetName: string; warnings: string[] }>` – flexible header detection
  (Mã HS / Mã học sinh, Họ và tên / Họ tên, Ngày sinh, Lớp, Giới tính, Trạng thái), first sheet with such headers.
- `export-workbook.ts`: `exportLevelWorkbook(ds: LevelDataset, opts: { today: string; period?: Period }): Promise<Blob | Buffer>` – sheets
  Nhập liệu (24 legacy columns A–X), HS liên quan, DS Học sinh, Danh mục, Bảng điểm lỗi, Cấu hình, Lịch tuần, Điểm thưởng, Xếp hạng, BC Học sinh; styled headers, frozen panes, autofilter, VN date format.
- `export-report.ts`: `exportRankingSheet(...)`, `exportGvcnReport(...)`, `exportStudentList(...)` small helpers; `buildHtmlSnapshot(ds, period, today): string` (FR-SNP-001, self-contained, no session data).

## 6. UI / Design system

**Brand (nhận diện Trường Ngôi Sao Hoàng Mai – theo logo chính thức và website hoangmaistarschool.edu.vn):**
logo = hình vuông đỏ `#D21F36` với ngôi sao hình học trắng (`public/brand/logo-nshm.svg`, component `LogoMark`);
màu chủ đạo **đỏ NSHM `#D21235`** (nút chính, liên kết, focus, ô biểu tượng trang) + **xanh navy `#23328C`** (chữ tiêu đề, sidebar, thẻ nền tối);
**vàng ngôi sao** chỉ là màu nhấn phụ (Top 90%, huy hiệu). Font **Lexend** (font của website trường; next/font, latin + vietnamese).
Vietnamese UI copy everywhere (concise, polite, no English jargon; "Điểm trừ", "Điểm thưởng", "Điểm thi đua", "Sự việc", "Học sinh liên quan", "Thuộc Top 90%", "Ngoài Top 90%").

Tokens (`globals.css` `@theme`): `--color-brand-50…700` = crimson scale (600 = `#D21235`), `--color-brand-800…950` = school navy
(800 = `#23328C`) – never put both halves in one gradient; `--color-star-*` gold; `--color-ok` (#16A34A), `--color-warn`, `--color-bad` (#DC2626 – always
with icon/text; the `danger` button is outlined so it never looks like the crimson primary button), `--color-muted`, surfaces `--color-canvas` #F4F6FB.
**Màu nhận diện 3 cấp** (đồng bộ phần mềm "Phiếu đánh giá giờ dạy"; `LEVEL_THEME` trong constants.ts): Tiểu học `#FFAD00` (chữ `#875800`), THCS `#2DA037` (chữ `#236F27`), THPT `#23328C`, toàn trường = đỏ NSHM. Cấp đang xem được gắn `data-cap` trên `<html>` (app shell) → biến `--acc-*` / tiện ích Tailwind `bg-acc`, `bg-acc-fill`, `text-acc-ink`, `bg-acc-soft` cho thanh nhấn đầu trang, nút cấp đang chọn, gạch chân tab và dòng nhãn cấp của PageHeader. Màu vàng `#FFAD00` không dùng làm màu chữ (tương phản 1,9:1). Numbers use `tabular-nums`.
RAG badges: icon + text + colour (✓ Xanh, ! Vàng, ✕ Đỏ, ? Xám). Top 90%: gold star badge "Top 90%" vs muted "Ngoài Top 90%".

**Layout (`src/app/(app)/layout.tsx`):** desktop = left sidebar (logo, grouped nav, collapsible) + top bar (level switcher segmented
"Tiểu học | THCS | THPT" limited to accessible levels, global filter bar, sync indicator, user menu). Mobile (<768px) = compact top bar
(level select + filter button opening a bottom sheet) + **bottom tab bar**: Tổng quan · Xếp hạng · **(+) Nhập** (big gold center button) · Học sinh · Thêm (sheet with the rest).
All touch targets ≥ 44px; forms single-column on mobile; tables become card lists < 640px. Print stylesheet hides chrome (`print:hidden`).

**UI kit (`src/components/ui/`)** – page agents MUST use these instead of re-styling raw elements:
Button (variants primary|secondary|ghost|danger|gold, sizes sm|md|lg, loading, icon), IconButton, Card (title, subtitle, actions, footer),
KpiCard (label, value, delta {value, goodWhen: "up"|"down"}, icon, tone, hint, sparkline?: number[]), Badge (tone), RagBadge, Top90Badge,
DataCheckBadge, StatusBadge, PageHeader (title, description, actions, breadcrumbs), Section, Tabs, SegmentedControl, Select (native, styled),
Combobox (cmdk, searchable with VN diacritics-insensitive filter, grouped options, renders rich option content), MultiCombobox,
Input, Textarea, Field (label, hint, error, required), DateInput, NumberStepper (big −/+), Switch, Checkbox, Dialog, Sheet (bottom on mobile,
right on desktop), ConfirmDialog (typed confirmation option), DataTable (columns with sort, sticky header, row click, empty state, mobile card renderer,
optional pagination/virtual-less "show more"), EmptyState, Skeleton, Spinner, Tooltip, Avatar, StatTrend, SearchInput, Toaster (sonner) + `toast` re-export,
ErrorState, Pill, ProgressBar. Charts (`src/components/charts/`): `EChart` (themed wrapper, responsive, lazy), BarChart, LineChart, DonutChart, HeatmapChart, Sparkline –
all accept simple typed props, VN number formatting, brand palette, empty state.

**Shared app components (`src/components/app/`)**: Logo, AppShell, Sidebar, TopBar, BottomNav, LevelSwitcher, FilterBar, UserMenu,
RequirePermission (`<RequirePermission p="excel.import">` → 403 view), LevelGuard, DatasetGate (loading/error skeleton around a page),
ClassPicker, ErrorPicker (grouped by Mảng, shows "2 điểm/HS"), StudentPicker (class-scoped, multi), PeriodPicker, StudentHistorySheet
(drawer showing a student's full history; used by Học sinh, Báo GVCN, Khối & lớp), IncidentDetailSheet, EvidenceGallery, PhotoCapture (camera/file → compressed upload).

## 7. Screens (routes under `src/app/(app)/`; login at `src/app/dang-nhap/page.tsx`)

| Route | Screen (spec) | Who |
|---|---|---|
| `/` | Tổng quan (SCR-02): 6 KPIs w/ delta vs previous period (Sự việc, HS liên quan, Điểm trừ, Điểm thưởng, Lớp phát sinh, Độ tin cậy dữ liệu), weekly trend, Top 5 vấn đề, Top 5 lớp cần ưu tiên (drill → /lop), Top HS vi phạm (drill → history), thống kê khối, phân bổ theo mảng, heatmap lớp×tuần, RAG summary, 5S widget, tái phạm | Viewer+ |
| `/toan-truong` | Toàn trường: compare the 3 levels side by side (KPIs, trends, ranking leaders, alerts) | users with >1 level |
| `/xep-hang` | Xếp hạng (SCR-03): per-grade ranking tables (rank, lớp, GVCN, điểm nền, thưởng, trừ, thi đua, Top 90%, RAG, xu hướng), highlight filtered class, expand row → breakdown; export | Viewer+ |
| `/lop` | Khối & lớp (SCR-04): class picker, class KPIs, rank in grade, score trend, timeline by day (date → lỗi → điểm → HS → chi tiết), top issues of class | Viewer+ (GVCN own class detail) |
| `/bao-gvcn` | Báo GVCN (SCR-05): pick class (GVCN: own), KPIs, detail table (Ngày, Đối tượng = HS names or "Tập thể lớp", Lỗi, Điểm, Chi tiết, Trạng thái, Phản hồi GVCN), search, copy text (Zalo-friendly), print/PDF, GVCN feedback | Viewer+ |
| `/hoc-sinh` | Học sinh (SCR-06): students with incidents (Mã, Họ tên, Lớp, Số lượt, Điểm, loại lỗi + số lần, cảnh báo), search, filters, drill → history sheet | Viewer+ |
| `/nhap-lieu` | Nhập liệu (SCR-07): mobile-first form; live points preview; "Lưu" and "Lưu & nhập tiếp"; recent entries list (edit own ≤24h) | Editor+ |
| `/diem-thuong` | Điểm thưởng (SCR-08): form + list with status workflow (verify by Admin) | Editor+ |
| `/quan-ly-hoc-sinh` | Quản lý HS (SCR-09): search, add (tuyển mới / chuyển đến), transfer class, withdraw (chuyển trường đi), reinstate, edit, history timeline, roster import (preview diff: mới / cập nhật / chuyển lớp / không đổi / thiếu trong file) | Admin |
| `/hanh-dong` | Action Register + Decision Brief + SLA (FR-ACT-*, FR-RAG-005) | Admin manage; Viewer/Editor read |
| `/du-lieu` | Chi tiết & dữ liệu (SCR-11): all incidents table w/ data check, review queue (REVIEW / THIẾU TÊN HS with quick fix), deleted items (restore), data-quality stats | Editor+ (restore: Admin) |
| `/nhap-xuat` | Import/Export: workbook import wizard (upload → preview with per-row OK/WARNING/ERROR → options → commit), export workbook, HTML snapshot, ranking export | Admin |
| `/nhat-ky` | Audit Log (SCR-10): filters (action, user, level, date range), table, detail JSON viewer | Admin |
| `/cai-dat` | Cài đặt: tabs Cấu hình (base, HK dates, RAG thresholds + approval, reward statuses, Top 90 ratio, alerts, SLA), Danh mục lỗi (edit table, 5S flag), Lớp & GVCN, Lịch tuần (counted toggle, regenerate), Người dùng (create, role, levels, GVCN classes, reset password, bulk create GVCN), Bảo trì (rebuild digests, reset level) | Admin |

## 8. Coding standards

- TypeScript strict, no `any` (use `unknown` + narrowing). No default exports except Next pages/layouts/route files.
- Never trust the client: server recomputes derived fields and checks permissions + level access on every route.
- Firestore: omit `undefined` fields (`ignoreUndefinedProperties: true` is set in admin init), transactions for every multi-doc write
  (all reads before writes), batches ≤ 450 ops.
- Vietnamese user-facing strings; English code identifiers/comments.
- Accessibility: labels for inputs, focus rings, colour never the only signal, `aria-live` for toasts.
- Performance: memoize engine calls with `useMemo` keyed on dataset version + filters; lazy-load ExcelJS and ECharts.
- Keep files focused (< ~400 lines); colocate page-specific components under `src/components/<area>/`.
