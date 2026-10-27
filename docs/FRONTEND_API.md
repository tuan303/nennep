# Frontend & module public APIs (as implemented)

Generated from the foundation engineers' reports. The source is authoritative if anything differs.


### KIT (public API)
IMPORT FROM "@/components/ui" and "@/components/charts" (barrels; all named exports). Tone = "brand"|"star"|"ok"|"warn"|"bad"|"muted".

TOKENS (globals.css @theme → Tailwind classes):
- Colours: brand-50…950 (600 #1D4ED8 royal, 900 #0B1F4D navy); star-50…900 (500 #F5B301; 700+ safe for text); ok / ok-soft / ok-strong; warn / warn-fill / warn-soft / warn-strong; bad / bad-soft / bad-strong; muted / muted-soft / muted-strong; canvas, surface, surface-2, surface-3, border, border-strong, ink.
- Radius: rounded-card (14px), rounded-control (10px).
- Shadows: shadow-card, shadow-raised, shadow-pop, shadow-gold, shadow-press.
- Type and easing: text-2xs, ease-soft. font-sans = var(--font-be-vietnam) with system fallbacks; body uses it directly.
- Animations: animate-fade-in/-out, slide-up, scale-in/-out, sheet-up/-down/-left/-right, shimmer, pop.
- Utilities: .num (tabular numbers), .card, .focus-ring, .no-scrollbar, .bg-stars, .shimmer.
- Print: [data-print-hide] hidden; A4 @page.

UI:
- cn(...ClassValue): string (twMerge aware of the custom tokens).
- Button({ variant?: "primary"|"secondary"|"ghost"|"danger"|"gold"|"outline", size?: "sm"|"md"|"lg", loading?, icon?: LucideIcon, iconRight?: LucideIcon, block?, ...button attrs }), forwardRef.
- buttonClasses({ variant, size, block, className }): string — gives the Button look to a next/link.
- IconButton({ icon, label (required, used as aria-label), variant? (default "ghost"), size?, loading?, badge? }).
- Card({ title?, subtitle?, actions?, icon?, footer?, padding?: "none"|"sm"|"md", interactive?, headingLevel?, ...div }), plus CardHeader, CardBody, CardFooter.
- KpiCard({ label, value: ReactNode (numbers formatted vi-VN), unit?, delta?: { value, label?, goodWhen: "up"|"down", display? }, icon?, tone?, hint?, sparkline?: number[], onClick?, loading?, footer?, className? }).
- StatTrend({ value, goodWhen, label?, display?, size? }).
- Badge({ tone?, size?: "sm"|"md", variant?: "soft"|"solid"|"outline", icon?, iconClassName?, dot? }), forwardRef.
- Pill({ tone?, icon?, active?, onClick? (toggle), onRemove?, removeLabel?, disabled? }).
- RagBadge({ rag: RagStatus, reason? (tooltip + aria), compact?, size? }).
- Top90Badge({ inTop90, size?, hint? }).
- DataCheckBadge({ dataCheck, issues?: DataIssue[], size? }).
- StatusBadge({ status: IncidentStatus|RewardStatus|ActionStatus, size? }).
- PriorityBadge({ priority, size? }).
- PageHeader({ title, description?, actions?, icon?, breadcrumbs?: { label, href? }[], eyebrow? }).
- Section({ title?, description?, actions?, icon?, id?, children }).
- BrandIconTile({ icon, size? }), StarPoint({ className? }).
- Tabs (Radix Root props), TabsList({ variant?: "underline"|"pill" }), TabsTrigger({ value, icon?, count? }), TabsContent.
- SegmentedControl<T extends string>({ options: { value, label, icon?, disabled? }[], value, onChange(v: T), size?: "sm"|"md", fullWidth?, ariaLabel? }) — radiogroup, arrow keys move selection.
- Field({ label?, hint?, error?, required?, htmlFor?, labelAside?, children }). Kit controls inside pick up id / aria-describedby / aria-invalid / required automatically. useFieldControl(props) is exported for custom controls; controlBase and controlHeight give the shared control look.
- Input({ size?: "md"|"lg", icon?, suffix?, invalid?, wrapperClassName?, ...input }), forwardRef.
- Textarea({ invalid?, autoGrow? (default true), ...textarea }).
- DateInput({ value: "yyyy-mm-dd"|"", onChange(v: string), min?, max?, size?, invalid? }).
- SearchInput({ value, onChange(debounced: string), delay? (250), placeholder?, ariaLabel?, size?, autoFocus?, id? }) — Enter commits now, Esc clears.
- Select<T extends string>({ options: { value: T, label, disabled?, group? }[], value: T|undefined, onChange(v: T|undefined), placeholder?, allowEmpty?, size?, invalid?, wrapperClassName?, ...select }).
- ComboOption<T> = { value: T, label, keywords?: string[], group?, description?, disabled? }.
- Combobox<T extends string>({ options, value: T|undefined|null, onChange(v: T|undefined), placeholder?, searchPlaceholder?, emptyText?, renderOption?(opt, { selected }), renderValue?(opt), clearable?, disabled?, invalid?, id?, "aria-label"?, title? (phone sheet title), icon?, size?, limit? (150) }). Popover at 640px and wider, bottom Sheet below that. Search ignores Vietnamese accents (NFD + đ→d) and ranks matches.
- MultiCombobox<T extends string>({ options, value: readonly T[], onChange(v: T[]), placeholder?, searchPlaceholder?, emptyText?, renderOption?, chipLabel?(opt), selectAllVisible?, maxChips? (6), disabled?, invalid?, id?, "aria-label"?, title?, limit? }).
- NumberStepper({ value, onChange, min? (0), max?, step? (1), size?: "md"|"lg", disabled?, invalid?, suffix?, id?, "aria-label"? }); clampStep(n, min, max, step).
- Switch({ checked, onChange(b), label?, description?, disabled?, id?, size?, "aria-label"? }).
- Checkbox({ checked: boolean|"indeterminate", onChange(b), label?, description?, disabled?, id?, name?, value?, "aria-label"? }).
- Dialog({ open?, onOpenChange?, trigger?: ReactElement, title, description?, icon?, children?, footer?, size?: "sm"|"md"|"lg"|"xl", dismissible? (default true), hideClose?, bodyClassName? }); DialogClose (Radix Close, use asChild).
- Sheet({ open?, onOpenChange?, trigger?, title, description?, icon?, children?, footer?, side?: "bottom"|"right"|"auto" (default "auto" = bottom below 768px, right at 768px+), size?: "sm"|"md"|"lg", hideClose?, bodyClassName? }) — bottom sheets can be dragged down to close.
- ConfirmDialog({ open, onOpenChange, title, message?, confirmLabel? ("Xác nhận"), cancelLabel? ("Hủy"), tone?: "danger"|"primary", requireText?, onConfirm: () => void|Promise<void> (closes on resolve, stays open on reject), confirmDisabled?, children? }).
- Tooltip({ content, children: ReactElement that takes a ref, side?, align?, delay?, disabled? }) — a tap opens it on touch screens.
- DataTable<T>({ columns: DataTableColumn<T>[], rows, rowKey(row): string, onRowClick?, rowLabel?(row), initialSort?: { key, dir: "asc"|"desc" }, emptyState?, mobileCard?(row, i) (used below 640px, with a sort menu), pageSize? ("Xem thêm"), stickyHeader?, maxHeight? (default "70vh", needs stickyHeader), dense?, rowClassName?(row), caption?, loading?, loadingRows? }).
  - DataTableColumn<T> = { key, header, headerLabel?, cell(row, i), sortValue?(row): string|number|null|undefined (numbers sort high→low on first click, text A→Z), align?, width?, className?, headerClassName?, hideOnMobile? }.
  - Wrap the table in <Card padding="none">.
- EmptyState({ icon?, title, description?, action?, tone?, size?: "sm"|"md" }).
- ErrorState({ title?, message?, onRetry?, retryLabel?, retrying?, icon?, size? }).
- Skeleton({ className?, round? }), SkeletonText({ lines? }), SkeletonCard({ rows?, label? }).
- Spinner({ size?: "xs"|"sm"|"md"|"lg", label? }).
- Avatar({ name, size?: "xs"|"sm"|"md"|"lg", src? }); initialsOf(name), avatarColorIndex(name).
- ProgressBar({ value: 0..1, tone?, size?, label?, showValue?, valueText?, ariaLabel? }).
- Toaster() — top-center on phones, bottom-right on desktop, brand colours; only the first mounted instance renders, so it is safe to include in more than one layout. toast is re-exported from sonner.
- Hooks: useMediaQuery(q), useIsMobile() (below 640px), useDebouncedValue(v, ms), useLatest(v); BREAKPOINTS.
- Search helpers: foldVN, matchesFolded, buildSearchIndex, searchOptions, groupOptions.
- Sort helpers: compareSortValues, sortRows.
- Number formatting: formatNumberVN, formatPercentVN, formatSignedVN, formatCompactVN.
- Tone class maps: TONES, toneSoft, toneSolid, toneOutline, toneTile, toneFill, toneTrack, toneDot, toneHex.

CHARTS:
- ChartSeries = { name, data: (number|null)[], color?, stack? }.
- EChart({ option: ChartOption, height? (280), ariaLabel (required), onEvents?: Record<string, (p: ChartEventParams) => void>, loading? (keeps the previous frame faded), notMerge? (default true) }). ECharts loads lazily, client only, and only the needed parts; registered "nshm" theme; resizes with its container.
- BarChart({ categories, series, horizontal?, height?, valueFormatter?, showValues?, onBarClick?({ category, seriesName, value, index }), ariaLabel?, emptyTitle?, emptyDescription?, loading? }). REQ_V2: `ChartSeries.colors?: (string|null|undefined)[]` colours single bars (e.g. selected bar full colour, others faded); missing entries keep the series colour.
- LineChart({ categories, series: (ChartSeries & { dashed?, area? })[], area?, height?, markLines?: { value, label?, color? }[], valueFormatter?, smooth?, zoom? (default on above 26 points), onPointClick?, ariaLabel?, empty*?, loading? }).
- DonutChart({ data: { name, value, color? }[], centerLabel?, centerValue?, height? (200), valueFormatter?, legend?: "side"|"bottom"|"none", onSliceClick?(name), ariaLabel?, empty*?, loading? }) — HTML legend with value and percentage.
- HeatmapChart({ xLabels, yLabels, values: [x, y, v][], height?, valueLabel? ("Điểm trừ"), valueFormatter?, onCellClick?({ x, y, xLabel, yLabel, value }), colors?, max?, maxRows? (30, then a vertical slider), showCellValues?, ariaLabel?, empty*?, loading? }).
- BumpChart({ categories, lines: BumpLine[], total?, showFaded? (true), headerOf?(index), scoreFormatter?, height?, onLineClick?(name), ariaLabel (required), emptyTitle?, emptyDescription?, loading?, className? }) — rank movement (REQ_V2 §6.3): rank 1 on top, `BumpLine = { name, ranks: (number|null)[], scores?, emphasis: "highlight"|"top"|"faded", color? }`; "highlight" = crimson (filtered class), "top" = palette, "faded" lines grey and toggleable from the legend; tooltip "Tuần dd/mm: hạng X/N · điểm Y".
  - Pure: buildBumpOption(BumpOptionInput { categories, lines, total?, showFaded?, headerOf?, scoreFormatter?, zoom? (default > 26 categories) }), bumpTotal(lines), bumpColors(lines), bumpPointText({ header, rank, total, score?, scoreFormatter? }), BUMP_HIGHLIGHT_COLOR, BUMP_FADED_COLOR.
- Sparkline({ data: number[], color?, width? (96), height? (32), strokeWidth?, area?, ariaLabel? }) — plain SVG.
- Palette and theme: CHART_COLORS (fixed order of 8), chartColor(i), CHART_OTHER_COLOR, HEAT_COLORS, BLUE_COLORS, CHART_TOKENS, buildNshmTheme.
- Pure option builders: buildBarOption, buildLineOption, buildDonutOption, buildHeatmapOption, buildBumpOption, isSeriesEmpty, donutTotal, heatmapMax, escapeHtml.

ROUTE: /kit (src/app/kit/page.tsx, a server component) calls notFound() in production and otherwise renders the client showcase.

### CLIENT (public API)
### firebase.ts (browser-only getters; they throw during SSR, so call them from effects or handlers)
- getClientApp(): FirebaseApp
- getClientAuth(): Auth
- getClientDb(): Firestore
- enabledAuthProviders(): { google: boolean; microsoft: boolean } (from NEXT_PUBLIC_AUTH_GOOGLE / NEXT_PUBLIC_AUTH_MICROSOFT; safe on the server)
- USE_EMULATORS: boolean
- firebase-core.ts exports the same app/auth getters without Firestore.

### api.ts
- class ApiClientError extends UserFacingError { status: number; code: string; details?: unknown }
  - Constructor: (status, code, message, details?)
  - Codes: UNAUTHENTICATED | FORBIDDEN | NOT_FOUND | VALIDATION | CONFLICT | RATE_LIMITED | INTERNAL | NETWORK (status 0) | BAD_RESPONSE
- Re-exported helpers:
  - errorMessage(err, fallback?): string (toast text for any thrown value)
  - fieldErrors(err): Record<string, string> (first message per top-level field)
  - validationIssues(err): Array<{ path, message }>
  - isAbortError, isApiClientError, NETWORK_ERROR_MESSAGE, GENERIC_ERROR_MESSAGE, downloadBlob, MIME, safeFileName
  - newClientRequestId(): string
- Exported types:
  - RankingsQuery = { level: LevelId; mode: PeriodMode; key?: string; classCode?: string }
  - AuditLogQuery = { action?, email?, level?, from?, to?, cursor?, limit? }
  - DatasetResult, RebuildInput, ResetLevelInput, RestoreResetInput, ResetLevelResult, RestoreResetResult, Api
  - CalendarChangeOptions = { allowHidingRecords?: boolean }, EvidenceMaintenanceInput
- http.ts: `onSessionRejected(listener)` – called with the error of every server 401 that survives the token-refresh retry
  (revoked session after a password reset / lock / re-secured account); the SessionProvider signs the user out.

`api` object (all methods return Promises):

Auth and system
- me(): MeResponse
- session(): MeResponse
- loginFailed(email, reason?): OkResponse (public, no token)
- logout(): OkResponse
- health(): { ok: true; time: string }

Analytics
- dataset(levelId, etag?): { status: 200; dataset; etag } | { status: 304 }
- rankings(q: RankingsQuery): RankingsResponse

reportPlans ("Công tác phối hợp tuần/tháng mới" = section 5 of Báo cáo tuần/tháng; not part of LevelDataset, no meta/versions bump)
- get(levelId, mode: "week" | "month", key): ReportPlanResponse { plan: ReportPlan | null } – GET /api/report-plans?level&mode&key;
  `key` = the REPORT period (week: its Monday yyyy-mm-dd; month: yyyy-mm), the plan is about the week / month after it.
  `view.dashboard` + level access (GVCN too).
- put(ReportPlanPutInput { levelId, mode, key, items: { content, owner?, due? }[] (≤ 30), note?, baseRev? }): ReportPlan –
  `report.plan` (ADMIN, EDITOR) + level; replaces the whole plan (empty items + "" note clears it); send
  `baseRev: plan?.rev ?? 0` → 409 CONFLICT when someone saved in between (show the message, offer a reload).

regulations (Quy chế khen thưởng / Quy chế kỷ luật – one set for the whole school; not part of LevelDataset, no meta/versions bump)
- list(): ListResponse<Regulation> – GET /api/regulations, any active signed-in user; a regulation never saved is omitted.
- put(id: RegulationId, RegulationPutInput { title, schoolYear, body (REGULATION_MARKUP, ≤ 60 000), baseRev? }): Regulation –
  `regulations.manage` (ADMIN without level restriction); send `baseRev: regulation?.rev ?? 0` → 409 CONFLICT when someone saved in between.
- putPdf(id, RegulationPdfPutInput { name, data: base64 (no data: prefix), baseRev? }): Regulation – replaces the original PDF
  (≤ REGULATION_PDF_MAX_BYTES decoded, %PDF signature checked by the server). Content and PDF share `rev`.
- deletePdf(id, baseRev): Regulation – DELETE with JSON body `{ baseRev }`.
- pdf(id, signal?): Blob – authenticated GET of the PDF bytes (404 NOT_FOUND when none); downloadPdf(id, fileName): void-Promise – fetches
  with the user's token and saves it as `fileName` (".pdf" appended when missing). A plain <a href> cannot be used (Bearer token).

incidents
- create(IncidentCreateInput): Incident – REQ_V2: optional `notDuplicateOf?: string[]` ("Không trùng, vẫn lưu" in the duplicate dialog)
- get(id): Incident
- update(id, IncidentUpdateInput): Incident – send `baseRev: record.rev ?? 0` (409 CONFLICT when the record changed
  meanwhile: show the message and reload the record) and `status` only when the user changed it
- remove(id, reason): OkResponse
- restore(id): Incident
- feedback(id, GvcnFeedbackInput { note?, status?, remediation? ("" clears) }): Incident – ADMIN / class GVCN: all three; EDITOR (`incident.remediate`): remediation + status only (a note → 403). Send only changed fields (`feedbackChanges`).
- notDuplicate(id, NotDuplicateInput { otherIds }): ListResponse<Incident> – "Không trùng": marks every pair of {id} ∪ otherIds as reviewed (`data.inspect`, same level)
- listDeleted(levelId): ListResponse<Incident>

inspections (Đợt kiểm tra, REQ_V2 – `inspection.manage`; rounds are read from `ds.inspections`)
- create(InspectionCreateInput { levelId, date, shift?, category?, classCodes, inspector?, note?, clientRequestId? }): Inspection (`DKT-yyyymmdd-NNN`)
- update(id, InspectionUpdateInput): Inspection – changed fields + `baseRev` (409 → reload)
- remove(id, reason): OkResponse – soft delete (reason ≥ 3); ADMIN any, EDITOR own ≤ 24 h

rewards
- create(RewardCreateInput): Reward – REQ_V2: points integer 1–5, reason ≥ 5 chars; with `reward.propose` only (GVCN) = proposal for own classes (status forced "Mới ghi nhận", `proposed: true`)
- update(id, RewardUpdateInput): Reward – same `baseRev` / changed-only `status` rule as incidents; send `points` / `reason` only when changed (legacy points such as 10 stay valid while unchanged)
- remove(id, reason): OkResponse
- restore(id): Reward
- listDeleted(levelId): ListResponse<Reward>

evidence
- upload(levelId, file: File): string (evidence id)
- objectUrl(id): string (blob: URL)
- clearCache(id?): void (not a Promise)

students
- get(id): Student
- create(StudentCreateInput): Student
- update(id, StudentUpdateInput): Student
- transfer(id, StudentTransferInput): Student
- withdraw(id, StudentWithdrawInput): Student
- reinstate(id, StudentReinstateInput): Student
- promoteLevel(id, StudentPromoteInput { toLevelId, classCode, date, note? }): Student – chuyển cấp, same Mã HS (needs both levels)
- importPreview(StudentImportInput): StudentImportPreview
- importCommit(StudentImportCommitInput): StudentImportResult

workbook
- preview(WorkbookPreviewInput): WorkbookPreview
- commit(WorkbookCommitInput): WorkbookCommitResult
- "Ghi đè thay đổi trong phần mềm" = top-level `overwriteAppChanges: true` in BOTH bodies ({ payload, options, overwriteAppChanges, previewHash }), never inside `options`
- "Tính lại sự việc đã ghi theo bảng điểm mới" = top-level `rescoreExisting: true` in BOTH bodies (same rules as `overwriteAppChanges`)

Other endpoints
- exportsLog(ExportLogInput): OkResponse
- actions.list(levelId): ListResponse<ActionItem>
- actions.create(ActionCreateInput): ActionItem
- actions.update(id, ActionUpdateInput): ActionItem
- auditLogs(q?: AuditLogQuery): AuditLogPage

settings
- putConfig(levelId, ConfigUpdateInput, opts?: CalendarChangeOptions): LevelConfig
- putCatalog(levelId, CatalogPutInput): ListResponse<CatalogItem>
- putClasses(levelId, ClassesPutInput): ListResponse<ClassInfo>
- putWeeks(levelId, WeeksPutInput, opts?: CalendarChangeOptions): ListResponse<SchoolWeek>
- putEarlyWarning(levelId, EarlyWarningPutInput): LevelConfig – Cảnh báo sớm thresholds (`config.earlyWarning`); `putConfig` keeps them
- Removing weeks that hold records → 409 CONFLICT with `details: { weeks, incidents, rewards }`; after the admin confirms,
  repeat the same call with `{ allowHidingRecords: true }` (sent as the query `?allowHidingRecords=1`). Settings uses
  `hiddenRecordsConflict(err)` + `useHidingRecordsConfirm()`.

users
- list(): ListResponse<UserProfile>
- create(UserCreateInput): UserCreateResult
- update(uid, UserUpdateInput): UserProfile
- resetPassword(uid): { tempPassword: string }
- bulkGvcn(BulkGvcnInput { levelId, sync? }): BulkGvcnResult (`sync` → `unassigned` lists removed class assignments; accounts that existed in Auth without a profile come back in `created` with a temp password)

admin
- rebuildDigests(input?): RebuildDigestsResponse (`{ ok, results: { [level]: { weeks, incidents, rewards, students, inspections? } } }`)
- resetLevel(input): ResetLevelResult
- restoreReset(input): RestoreResetResult
- evidence({ levelId, dryRun }): EvidenceMaintenanceResult (dryRun = statistics; otherwise deletes photos never attached to a record, > 48 h old)

downloads
- api.downloadBlob(data: Blob | ArrayBuffer | ArrayBufferView | string, fileName, mime?): void

### session.tsx
- <SessionProvider>{children}</SessionProvider>
- useSession(): SessionValue
  - Fields:
    - status: "loading" | "signedOut" | "signedIn" | "forbidden"
    - profile?: UserProfile
    - accessibleLevels: LevelId[]
    - email?: string
    - error?: string (forbidden reason / retrying message / sign-out reason)
  - Actions:
    - login(email, password): Promise<void>
    - loginWithProvider("google" | "microsoft"): Promise<void>
    - logout(): Promise<void>
    - changePassword(current, next): Promise<void>
    - can(p: Permission): boolean
    - canSeeClass(levelId, classCode): boolean
    - reloadProfile(): Promise<void>
  - Actions throw SessionError { code, message (Vietnamese) }.
- Also exported:
  - isSilentAuthError(err) (true when the user closed the sign-in popup)
  - validateNewPassword(current, next): string | undefined
  - types SessionStatus, AuthProviderId, SessionValue

### data.tsx (DataProvider must sit inside SessionProvider)
- <DataProvider>{children}</DataProvider>
- useLevel(): { levelId: LevelId; setLevelId(levelId): void; accessibleLevels: LevelId[] }
- useDataset(levelId?): { levelId; dataset?: LevelDataset; status: "idle" | "loading" | "ready" | "error"; error?: string; refreshing: boolean; refresh(): Promise<void> }
  - refresh() never rejects; failures land in `error`.
  - "error" status only when there is no data; stale data keeps "ready" with `error` set.
- useDatasetVersion(levelId?): number | undefined
- useAllDatasets(levelIds: LevelId[]): { datasets: Partial<Record<LevelId, LevelDataset>>; items: Array<{ levelId, dataset?, status, error?, refreshing }>; status; refreshing; refresh(): Promise<void> }
  - Levels the user cannot access are skipped.
- useSyncStatus(): { refreshing: boolean; live: boolean; lastSyncedAt?: number; error?: string }

### filters.tsx (call it inside <Suspense>, inside DataProvider)
- useFilters(): { filters: GlobalFilters; setFilters(patch: FilterPatch): void; resetFilters(): void; options: FilterOptions; defaultPeriod: Period; isDefaultPeriod: boolean; activeCount: number }
- FilterPatch = { period?: { mode: PeriodMode; key?: string }; grade?: number; classCode?: string; category?: string; errorCode?: string; group?: string; studentId?: string }
  - Passing undefined or "" clears a field.
  - Omitting period.key picks the default key for that mode.
- FilterOptions = { weeks: PeriodOption[]; months: PeriodOption[]; semesters: PeriodOption[]; grades: Array<{ value: number; label: string }>; classes: ClassInfo[]; categories: string[]; errors: CatalogItem[]; groups: string[]; students: StudentFilterOption[] }
  - `errors` = catalog items of the selected Mảng and Nhóm lỗi (if any); `groups` = catalog Nhóm lỗi in natural order; `students` = dataset students (already role-filtered: GVCN → own classes) of the selected khối/lớp, sorted by class then given name (`StudentFilterOption = { id, name, classCode, grade, status }`).
- URL params (`FILTER_PARAMS`): `mode`, `key`, `grade`, `class`, `cat`, `err`, `group`, `student`. `grade`, `class`, `err`, `group`, `student` are cleared on level switch (`LEVEL_SCOPED_PARAMS`).
- REQ_V2 rules: unknown group / Mã HS is ignored; changing the group clears an error of another group; picking an error makes a set group follow it; a student outside the khối/lớp scope is dropped (also when the URL changes only the class).
- Also exported: activeFilterCount(f) (counts group + student too), FILTER_PARAMS, catalogGroups, studentFilterOptions. filters-core.ts holds the pure helpers.

### format.ts
- fmtNumber(n, maxFractionDigits = 2)
- fmtPoints(n) ("+10" / "−25" / "0")
- fmtPercent(ratio, maxFractionDigits = 0) (0.873 → "87%")
- fmtCount(n, noun)
- fmtDate(dateOrTimestamp) (dd/mm/yyyy)
- fmtDateTime(ts) (dd/mm/yyyy HH:mm, Vietnam time)
- fmtTime(ts)
- fmtRelative(ts, now?) ("vừa xong", "5 phút trước", "hôm qua", "3 ngày trước", then a date)
- EMPTY_VALUE "–", MINUS_SIGN

### hooks.ts
- useToday(): string (Vietnam date; updates at midnight and on tab focus)
- useMediaQuery(query, serverValue = false): boolean
- useIsMobile(): boolean (< 768px) – NOTE: the UI kit's useIsMobile (DataTable cards) switches below 640px; pick one per screen deliberately.
- useDebounced<T>(value, delayMs = 300): T
- useOnline(): boolean

### SHELL (public API)
Import from "@/components/app/shell" (barrel, client-side). Server files (route `metadata`) import only from "@/components/app/shell/routes", which is a pure module.

PAGE HELPERS (what screen authors need)
- `RequirePermission({ p: Permission | readonly Permission[], children, fallback? })`
  - With an array, ANY of the permissions is enough.
  - Renders null until signed in. Without permission it shows the 403 card "Bạn không có quyền truy cập chức năng này" with a "Về Tổng quan" link.
- `LevelGuard({ children, minLevels? = 1, levels?: readonly LevelId[], fallback? })`
  - No accessible level → notice "Tài khoản chưa được gán cấp học".
  - Fewer than `minLevels` → notice (use minLevels=2 for /toan-truong).
  - `levels` → the selected level must be one of them.
- `DatasetGate({ children: (ds: LevelDataset) => ReactNode, levelId?: LevelId, fallback?: ReactNode })`
  - Loading → PageSkeleton.
  - Error with no cached data → Card + ErrorState with "Thử lại" (calls refresh()).
  - Otherwise renders `children(dataset)`; stale data stays visible while refreshing.
- `AccessNotice({ title, description?, icon?, action?: ReactNode | null })` — friendly warn card (default action: "Về Tổng quan" link).
- `useShellOptions({ title?: string; hideFilters?: boolean; hideLevelSwitcher?: boolean })`
  - Call it at the top of a page. `undefined` means the route default; `false` forces a part to show.
  - Reset on unmount.
- `useNavBadge(href: string, value: number | string | null | undefined)` — badge on the sidebar item and the "Thêm" tile. 0, null or undefined removes it; also removed on unmount.
- `useFilterSheet(): { open: boolean; setOpen(open: boolean): void }` — opens the phone/tablet filter sheet.
- `PageSkeleton({ kpis? = 4, className?, label? })`.
- `InShellNotFound()` — 404 card inside the shell.

FILTER / PERIOD
- `PeriodPicker({ mode: PeriodMode, value?: string, options: PeriodOptionLists, onChange(key: string), arrows? = true, disabled?, id?, size?: "md"|"lg", className? })`
  - Mode "all" renders a static "Toàn bộ năm học" field.
  - Weeks are shown newest first, grouped by month; the current one gets a gold "Hiện tại" badge.
  - Future weeks/months are hidden unless already selected; ‹ › never step into the future.
  - `options` can be `useFilters().options` or the engine's `periodOptions(...)`.
- Period helpers: `periodChoices(lists, mode, selected?)`, `stepPeriodKey(list, key, dir: -1 | 1)`, `periodText(period, lists)`, `optionsOfMode(lists, mode)`, `PERIOD_MODES`, `PERIOD_MODE_OPTIONS`.
- Types: `PeriodOptionLists = { weeks, months, semesters: PeriodOption[] }`, `PeriodChoice`.
- Filter components (each needs <Suspense>):
  - `FilterBar` — desktop row.
  - `FilterChips` — phone/tablet period stepper plus removable pills.
  - `FilterButton` — "Bộ lọc" with count badge.
  - `FilterSheet`.
  - `FilterBarSkeleton`, `FilterChipsSkeleton`.

CHROME (already mounted by the (app) layout; exported for reuse)
- Layout: `Providers({ children })` (SessionProvider → DataProvider → Tooltip.Provider + Toaster), `AppShell({ children })`, `loginHref(path): string`.
- Navigation pieces: `Sidebar`, `TopBar`, `BottomNav`, `MoreSheet({ open, onOpenChange, groups: NavGroup[], activeId?, extras?: readonly FooterNavItem[], activeExtraHref? })` (`extras` = last tiles for every role, default `FOOTER_NAV_ITEMS`; the tab bar passes `bottomNavModel().extras` = the two quy chế + the guide, and `activeExtraHref` on a quy chế page, which also lights the "Thêm" tab).
- Top-bar pieces: `LevelSwitcher({ variant?: "auto"|"segmented"|"select", className? })`, `SyncIndicator({ className? })`, `UserMenu({ className? })`, `profileScopeText(profile): string`.
- Quy chế in the top bar (every signed-in user, no permission): `RegulationLinks({ pathname, className? })` – "Quy chế khen thưởng" (Award) ·
  "Quy chế kỷ luật" (Scale), neutral grey, pressed on its page; shown ≥ 1024px. The bar is a size container (`@container`): icons only below
  1000px of bar width, the short label ("Khen thưởng" / "Kỷ luật") from 1000px, the full title from 1124px; the accessible name is always
  the full title. `RegulationMenu({ pathname, className? })` – one "Quy chế" icon button with a dropdown of the two, shown 640–1023px.
  Phones (< 640px) reach them through the "Thêm" tiles (no room in the bar next to Bộ lọc and the avatar).
- `ChangePasswordDialog({ open, onOpenChange })`.
- Screens: `AppLoadingScreen({ message?, onSignOut? })`, `AccountBlocked({ className? })`, `AccountBlockedScreen()`, `StatusScreen({ icon, tone?, code?, title, description?, home?: { href, label } | null, showBack?, onRetry?, retryLabel?, footer?, children? })`, `NotFoundScreen()`.
- Brand: `Logo({ size?: "sm"|"md"|"lg", tone?: "dark"|"light", showText?, className? })`, `LogoMark({ size?: "xs"|"sm"|"md"|"lg"|"xl", label?, className? })`, `STAR_PATH` (24×24 star path).
- Credit: `CreditLine({ tone?: "light"|"onDark", printable? = false, className? })` and `CREDIT_TEXT` ("© Designed & Developed by Tuan™"). Shown at the foot of every page: login, every signed-in page (AppShell), the guide and the status screens (404, errors, blocked account); hidden when printing unless `printable`.
- Hooks: `useNavModel(): { groups, bottom, footer, pathname, route? }` (`footer` = `FOOTER_NAV_ITEMS`), `usePageChrome(): { title, showFilters, showLevelSwitcher }` (on /quy-che/[id]: the regulation title, no filters, no level switcher), `useSignOut(): () => Promise<void>`.
- Level accent (`<html data-cap>`): the school-wide pages /toan-truong and /quy-che/* keep the NSHM red.

NAV / ROUTES (pure)
- `APP_ROUTES: Record<AppRouteId, AppRoute>` and `APP_ROUTE_LIST`.
  - AppRoute = { id, href, title, shortLabel, description, permission, multiLevel?, filters: boolean, levelSwitcher: boolean }.
  - AppRouteId: overview | school | ranking | classes | gvcn | reports | students | entry | rewards | actions | studentAdmin | data | excel | audit | settings.
  - REQ_V2: `reports` = /bao-cao (`view.dashboard`, after Báo GVCN, FileText icon, no global filter bar); `rewards` opens with `reward.propose` (GVCN see Điểm thưởng for proposals). /nhap-lieu's page guard is `incident.create` OR `inspection.manage`.
- `routeMetadata(id): Metadata`, `routeForPath(pathname)`, `isRouteActive(href, pathname)`, `canSeeRoute(route, { can, levelCount })`.
- `NAV_GROUPS`, `NAV_ICONS`, `visibleNavGroups(ctx)`, `bottomNavModel(ctx): { slots: BottomSlot[]; more: NavGroup[]; extras: FooterNavItem[] }` (`extras` = `[...REGULATION_NAV_ITEMS, ...FOOTER_NAV_ITEMS]` for every role), `activeNavItem(items, pathname)`.
- Quy chế (not AppRoutes – every signed-in user, never in the sidebar): `REGULATION_ROUTES: readonly RegulationRoute[]` ({ id: "quy-che-khen-thuong" | "quy-che-ky-luat", regulationId, href, title, shortLabel, description }, top-bar order), `REGULATION_ROUTE_BASE` ("/quy-che"), `regulationHref(id, anchor?)` ("/quy-che/ky-luat#dieu-5"), `regulationIdForPath(pathname)`, `isRegulationId(value)`; nav-config: `REGULATION_NAV_ITEMS` (FooterNavItem shape), `REGULATION_ICONS` (khen-thuong → Award, ky-luat → Scale). `FooterNavItem.id` = "guide" | RegulationRoute["id"].
- User guide link (no permission, every role): `GUIDE_ROUTE` ({ id: "guide", href: "/huong-dan", title: "Hướng dẫn sử dụng", shortLabel, description }; not an AppRoute), `guideHref(sectionId?)` (e.g. `guideHref("xep-hang")` → "/huong-dan#xep-hang" – use it for in-app help links), `GUIDE_NAV_ITEM`, `FOOTER_NAV_ITEMS` (pinned at the bottom of the sidebar/tablet rail and last tile of the phone "Thêm" sheet), type `FooterNavItem`.
- Filter bar defaults per route:
  - Shown on /, /xep-hang, /lop, /bao-gvcn, /hoc-sinh, /du-lieu; hidden elsewhere.
  - Level switcher hidden on /toan-truong and /nhat-ky.

ROUTES
- `/dang-nhap` (login; "Hướng dẫn sử dụng" button under the card).
- `/huong-dan` (src/app/huong-dan, outside `(app)`): public user guide – no sign-in guard, no dataset, static. Renderer and schema in `@/components/guide`, content (pure data, `GUIDE: GuideContent`) in `src/components/guide/content/`, checked by `src/components/guide/__tests__/content.test.ts` (ids, routes, links, no personal data). Section anchors are the section ids (`/huong-dan#<id>`).
- `src/app/(app)/` pages for `/`, `/toan-truong`, `/xep-hang`, `/lop`, `/bao-gvcn`, `/bao-cao` (REQ_V2), `/hoc-sinh`, `/nhap-lieu`, `/diem-thuong`, `/hanh-dong`, `/quan-ly-hoc-sinh`, `/du-lieu`, `/nhap-xuat`, `/nhat-ky`, `/cai-dat` – plus `/quy-che/[id]` (below).
  - Each `page.tsx` is a small "use client" page inside the right RequirePermission (/toan-truong also uses LevelGuard minLevels=2).
  - Each route folder also has a `layout.tsx` that only exports the tab title; keep it.
- REQ_V2 tab/view params: /nhap-lieu `?tab=kiem-tra` (Đợt kiểm tra), /xep-hang `?view=bang|bien-dong|bao-phu`, /du-lieu `?tab=trung-lap` (Có thể trùng), /hanh-dong `?tab=canh-bao`, /cai-dat `?tab=canh-bao`, /bao-cao `?mode=week|month&key=…&to=bgh|khoi-N|lop-X&detail=0|1`.
- /bao-cao document sections: 1 Chỉ số chính · 2 Xếp hạng thi đua · 3 Vấn đề nổi bật · 4 Cảnh báo sớm · 5 Công tác phối hợp tuần mới /
  tháng mới (always printed; "Chưa cập nhật công tác phối hợp." when empty) · 6 Chi tiết sự việc (`detail=1`). Section 5 per level +
  report period: `useReportPlan(levelId, period, can("report.plan"))` (src/components/report/use-report-plan.ts) loads it and holds the
  editor draft; `ReportPlanEditor` (above the A4 preview, `report.plan` only) edits it and `ReportDocument({ …, plan })` prints the
  draft for an editor (WYSIWYG) and the saved plan for everyone else. Pure helpers (next period label, draft ↔ PUT body, validation)
  in src/components/report/lib/report-plan.ts. Unsaved plan edits are guarded (`useLeaveGuard`; period changes go through `requestLeave`).
- `/quy-che/[id]` (`khen-thuong` | `ky-luat`; any other id → in-shell 404): server `page.tsx` (validates the id, `generateMetadata` tab
  title, `generateStaticParams`) rendering the client `RegulationScreen` – no RequirePermission (the shell already requires an active
  signed-in account). See REGULATIONS below. `#dieu-5` anchors jump to the article once the content is loaded.
- Also: `/manifest.webmanifest`, `/icon.svg`, `/apple-icon.png`, `/icons/*.png`.

### REGULATIONS (Quy chế khen thưởng / kỷ luật)
Content lives in Firestore only (`regulations/{id}`, PDF in `regulationFiles/{id}`) – never commit the regulation text; tests use short fake text.

MARKUP – `src/lib/regulations/markup.ts` (pure, server-safe; REGULATION_MARKUP of src/lib/contract.ts)
- `parseRegulation(body): ParsedRegulation { blocks: RegulationBlock[]; toc: RegulationTocItem[]; articleCount }`.
  - Blocks: `chapter` ("## …", also "#") and `article` ("### …", also "####"–"######") with `id`; `paragraph` (consecutive lines joined
    with a space); `list` { ordered, items: { marker ("1." / "2)" / "1.2." as written; "" for bullets "-", "–", "—", "•", "*"), text } };
    `table` { head (first row), rows } (separator row optional/ignored anywhere, ragged rows padded, "\|" = literal pipe);
    `note` { paragraphs } ("> …"; an empty ">" line splits paragraphs).
  - Tolerant of CRLF / CR, tabs, runs of blank lines. A list item / heading / table row / note interrupts a paragraph; a plain line
    right after a list item or note continues it; lists of the same kind separated by blank lines stay one list.
  - Anchors are deterministic and unique: "Điều 5…" → `dieu-5`, "CHƯƠNG II…" → `chuong-ii` (also "Phần", "Mục" + number), other titles
    → `slugifyVN(text)` (no diacritics, đ → d, ≤ 64 chars at a word boundary); repeats get `-2`, `-3`; empty slug → `muc-N`.
  - `toc`: chapters with their articles as `children`; articles before the first chapter are top-level.
- `parseInline(text): { text, bold }[]` ("**bold**"; unpaired markers stay text), `plainText(text)`, `slugifyVN(text)`, `splitTableRow(line)`,
  `hasRegulationContent(body)`.

COMPONENTS – `src/components/regulations/` ("use client" unless noted)
- `RegulationScreen({ id })` – the page: `RegulationHeader` (eyebrow "Toàn trường · Năm học …", title, "Cập nhật lúc dd/mm/yyyy hh:mm – Tên"),
  `RegulationActions` (Sửa [regulations.manage] · Tải bản PDF gốc [when `pdf`] · In), `RegulationSwitch` (links, so the leave guard can ask),
  then loading skeleton / `ErrorState` with retry / `RegulationEditor` / `RegulationDocument` / `RegulationEmpty` ("Soạn nội dung" for the
  admin, "Tải bản PDF gốc" when only the PDF exists).
- `RegulationDocument({ id, regulation, parsed, activeAnchor?, onNavigate })` – sticky table of contents ≥ 1024px (GuideToc + guide's
  `useScrollSpy`), "Mục lục · N điều" button + Sheet below; `<article data-regulation-doc>` with a print-only header (school, title, năm học).
- `RegulationBody({ blocks, anchors? = true })` (no hooks; SSR-safe) – tables become "header: value" cards below 640px from 3 columns on
  (the table itself is printed); `anchors={false}` in the editor preview. `InlineText({ text })`.
- `RegulationEditor({ id, regulation?, onSaved, onClose, onReload })` – tên, năm học, monospace body (counter /60 000, cheat-sheet),
  live preview (side by side ≥ 1024px, "Soạn thảo | Xem trước" below; deferred parse), Lưu (`baseRev`, Ctrl/⌘ + S or Enter), Hủy (confirm
  when dirty), `useLeaveGuard` while dirty. 409 → alert with "Sao chép nội dung đang sửa" + "Tải lại bản mới nhất" (replaces the draft).
  PDF block (after the first save): current file (name · size · date), "Thay file PDF" (.pdf, ≤ 700 KB, `%PDF-` signature, base64),
  "Xóa file PDF" (confirm). A PDF change bumps `rev`: the draft stays and is rebased on the returned version.
- `RegulationPrintStyles()` (scoped A4 stylesheet: chrome hidden, headings kept with their text, tables/notes not split) and
  `printWithTitle(title)`.
- `useRegulations(): { status, error?, get(id), reloading, reload(): Promise<items>, put(reg) }` – GET /api/regulations once per signed-in
  user (uid) and tab, shared module cache (`lib/regulation-store.ts`, `createRegulationStore(fetchList)`, pure + tested); `put` after a save,
  `reload` on 409 / "Thử lại" (a failed reload keeps what is shown and rejects).
- Pure helpers `lib/regulation-form.ts`: `canManageRegulations(profile)`, `regulationUpdatedLine(reg)`, `fileSizeText`, `pdfInfoLine`,
  `schoolYearOf(today)`, `draftFromRegulation(id, reg, today)`, `sameDraft`, `draftErrors` (schema limits, Vietnamese messages),
  `regulationPutInput(draft, baseRev)`, `pdfFileProblem`, `hasPdfSignature`, `bytesToBase64`, `pdfUploadName`, `readPdfFile(file)`.

### WIDGETS (public API)
IMPORT FROM "@/components/app/widgets" (barrel; all named exports).
- All components are "use client".
- IncidentDetailSheet and PhotoCapture need <SessionProvider> + <DataProvider> (they use useSession / useDataset / api).
- StudentHistorySheet and StudentPicker only need data passed in. They call useToday(), which needs no provider.
- Server code (route handlers, exports) must deep-import pure helpers from "@/components/app/widgets/lib/<file>" to avoid pulling client modules.

COMPONENTS
- ClassPicker(props): Combobox grouped by "Khối N", GVCN as description and search keyword, popover on desktop / bottom sheet below 640px.
  - Base props: { ds: Pick<LevelDataset,"classes">; value?: string; grade?: number; disabledCodes?: readonly string[]; restrictTo?: readonly string[] (e.g. a GVCN's own classes); includeInactive?: boolean (default: active only, plus the current value); placeholder?; disabled?; invalid?; id?; "aria-label"?; size?: "md"|"lg"; className? }
  - Plus one of:
    - { allowAll?: false; onChange(code: string): void }
    - { allowAll: true; onChange(code: string | undefined): void; allLabel?: string } – adds "Tất cả lớp" (→ undefined) and a clear button.
- ClassChips({ ds: Pick<LevelDataset,"classes">; value?: string; onChange(code: string): void; grade?: number; onGradeChange?(grade: number): void; disabledCodes?; restrictTo?; showTeacher?: boolean; ariaLabel?; className? })
  - Tap grid of the classes of one grade.
  - Without `grade`, it shows a "Khối" SegmentedControl (starting at the grade of `value`).
- ErrorPicker({ ds: Pick<LevelDataset,"levelId"|"catalog">; value?: string; onChange(code: string): void; placeholder?; disabled?; invalid?; id?; "aria-label"?; trackRecent?: boolean (default true); size?; className? })
  - Grouped by Mảng; each row shows issue, code, PenaltyPill "2 điểm/HS"|"5 điểm/lần" and Nhóm.
  - Accent-insensitive search on issue, code, Mảng and group.
  - Up to 5 recent codes are pinned under "Dùng gần đây" (localStorage "nshm.recentErrors" = { [levelId]: string[] }).
  - Inactive items are hidden, except the current value, which is shown disabled.
- StudentPicker({ ds: Pick<LevelDataset,"students"|"incidents">; classCode: string; value: string[]; onChange(ids: string[]): void; max?: number (default and cap 80); disabled?; invalid?; id?; showFrequent?: boolean (default true); className? })
  - Only ACTIVE students currently in the class, in Vietnamese roster order (given name first).
  - Selected chips with ×, plus "Bỏ chọn tất cả". Ids no longer active in the class show as warning chips with a message.
  - "Hay gặp gần đây" chips: up to 6 students named at least 2 times in the last 28 days.
  - Search on name / Mã HS; Enter toggles the only match.
  - "Chọn nhanh" scrollable tap list.
  - Empty states for "Chọn lớp trước" and a class with no active students.
- StudentHistorySheet({ ds: LevelDataset; studentId: string | null (null closes); onClose(): void; period?: Period (when not "all": toggle "Kỳ đang lọc / Cả năm"); onOpenIncident?(incident: Incident): void })
  - Header: avatar, status, Mã HS, class · GVCN, DOB. Then PeriodBadge, StudentAlertBadge, and 3 stats (lượt vi phạm, điểm liên quan, loại lỗi).
  - Per-error breakdown, then a timeline (date, weekday, lỗi, điểm, status, class at the time, detail, người ghi), using engine studentHistory and studentStats.
  - Footer "Sao chép" copies a plain-text summary.
  - Student missing from ds.students: redacted dataset → "Không có quyền xem"; otherwise → "Không tìm thấy học sinh".
- IncidentDetailSheet({ ds: LevelDataset; incident: Incident | null (null closes); onClose(): void; onChanged?(): void; onOpenStudent?(studentId: string): void; suggestedDeleteReason?: string (prefills the "Xóa" reason, e.g. "Trùng với NN-…" from the duplicate review) })
  - Content:
    - Summary: category, code + issue, −points, FormulaText, StatusBadge, ScopeBadge, PenaltyPill, DataCheckBadge.
    - Info grid: date + weekday, week, class · grade, GVCN, penalty + group, occurrences or student count, người ghi, code.
    - Students list (or "Tập thể lớp"), with unnamedCount shown.
    - Detail, data-check issues, GVCN feedback, "Xử lý / khắc phục" (REQ_V2: text, who, when; inline editor for `canRemediate`), "không trùng với …" when reviewed, EvidenceGallery.
    - Metadata: createdByName + createdAt, import source / externalId, updatedAt, and the edit-window hint.
    - Deleted banner when soft-deleted.
  - Actions:
    - "Sửa" is a next/link to incidentEditHref(id) = "/nhap-lieu?edit=<id>", shown for ADMIN or own record within 24h.
    - "Xóa" (ADMIN) opens a ConfirmDialog with a required reason (min 3 chars) → api.incidents.remove.
    - "Khôi phục" (ADMIN, deleted records) → api.incidents.restore.
    - GVCN feedback (note + status; GVCN of the class or ADMIN) → api.incidents.feedback.
    - Every mutation shows a toast, then awaits useDataset(ds.levelId).refresh(), then calls onChanged().
  - Redacted incidents (GVCN, other class) hide names, detail, feedback, reporter and evidence.
- EvidenceGallery({ photoIds: string[]; urls: string[]; emptyText?: string | null (default "Chưa có minh chứng."; null = render nothing); className? })
  - Thumbnails loaded via api.evidence.objectUrl; tap opens a lightbox Dialog with prev/next buttons and ←/→ keys, plus "Mở ảnh gốc".
  - Only http(s) links are clickable; other link text is shown as "Liên kết không hợp lệ".
- EvidenceImage({ id; localUrl?; alt; fit?: "cover"|"contain"; className? }) and EvidenceImageView({ state: EvidenceUrlState; alt; fit?; errorHint?; className? }).
- PhotoCapture({ levelId: LevelId; value: string[]; onChange(ids: string[]): void; max?: number (default and cap 5); disabled?; onBusyChange?(busy: boolean): void; className? })
  - Inputs: a camera input (accept="image/*" capture="environment" multiple) shown as "Chụp ảnh" on touch screens only, and a library input "Chọn ảnh".
  - Uploads one photo at a time via api.evidence.upload, with a spinner, local preview thumbnails and ×.
  - Failed uploads show an error toast plus "Thử lại"/×. Extra files beyond max are dropped with a warning toast.
- RemediationSection({ incident, canEdit (= canRemediate), onSaved(incident) }) — current remediation plus, for allowed users, the editor behind a button (key it by the incident version); RemediationForm({ incident, onSaved, onCancel? }) — remediation + status → api.incidents.feedback (changed fields only); RemediationView({ incident }).
- RagLegend({ config?: Pick<LevelConfig,"rag">; layout?: "inline"|"list"; className? }) and ragRuleText(rag, config?): string.
- PeriodBadge({ period: Period; semesters?: Semester[]; size?; className? }) – text from engine periodLabel.
- FormulaText(props) – "2 điểm × 3 HS = 6" / "5 điểm × 2 lần = 10", plus a note "x HS có tên + y HS chưa rõ tên". Props: { showNote?=true; icon?; className? } & ({ incident: FormulaIncident & { points } } | { input: FormulaInput; total?: number }).
- ScopeBadge({ scope; size?; className? })
- PenaltyPill({ penalty; unit; size? (default "sm"); className? })
- StudentStatusBadge({ status; size?; className? })
- StudentAlertBadge({ alert: "NONE"|"REPEAT"|"WEEKLY_RED"; config?: Pick<LevelConfig,"studentAlert"> (tooltip); showNone?; size?; className? })
- EmptyDataHint({ ds?: Pick<LevelDataset,"incidents">; noDataYet?: boolean; onReset?(): void; resetLabel?; title?; description?; action?; icon?; size? (default "sm"); className? })
  - "Chưa có dữ liệu nền nếp" when the level has no incidents.
  - Otherwise "Không có sự việc phù hợp", with a "Xóa bộ lọc" button when onReset is given.

HOOKS
- useEvidenceUrl(id, localUrl?) → EvidenceUrlState & { retry() }
- useRetained<T>(v) → last non-null value
- useNow(intervalMs = 60000)

PURE HELPERS (also deep-importable from ./lib/*)
- class-options:
  - pickClasses(classes, ClassFilter{grade?, includeInactive?, restrictTo?, keep?})
  - classOptions(classes, filter?, disabledCodes?): ComboOption<string>[]
  - gradesOf, gradeLabel(g) → "Khối g", classDescription, compareClasses
- error-options:
  - penaltyLabel(penalty, unit) → "2 điểm/HS"
  - unitExplanation(unit)
  - errorOptions(catalog, { recent?, keep?, recentLimit? })
  - RECENT_GROUP
- recent-errors:
  - readRecentErrors(levelId, storage?): string[]
  - rememberRecentError(levelId, code, storage?): string[]
  - RECENT_ERRORS_KEY = "nshm.recentErrors"
- student-options:
  - activeStudentsOfClass(students, classCode)
  - searchStudents(list, query)
  - frequentStudents(incidents, active, today, { days=28, limit=6, minCount=2 })
  - compareStudentsByGivenName
- points-formula:
  - pointsFormula(input: PointsInput, total?) → { text, total, multiplier, multiplierUnit, note? }
  - formulaInputOf(incident) (derives the named count from relatedStudentCount for redacted incidents)
- student-summary:
  - STUDENT_ALERT_LABELS, studentAlertDescription(alert, config)
  - studentErrorBreakdown(history), studentPointsOf(i), summarizeHistory(history)
  - buildStudentHistoryText({ student, periodText, history, alert, config })
- incident-access:
  - canEditIncident(profile, incident, nowMs), canDeleteIncident, canRestoreIncident, canGiveFeedback
  - canRemediate(profile, incident, { redacted? }) (class GVCN with incident.gvcnFeedback, or incident.remediate + level access); feedbackRights(profile, incident, { redacted? }): FeedbackRights { note, status, remediation }
  - isIncidentRedacted(ds, incident, profile)
  - editWindowRemainingMs, formatRemaining
- remediation (REQ_V2):
  - REMEDIATION_MAX (1000), REMEDIATION_PHRASES (tap-to-append), appendPhrase(text, phrase)
  - feedbackChanges(incident, draft: FeedbackDraft { note?, status, remediation? }, rights?): GvcnFeedbackInput | null (changed fields only)
  - remediationMeta(incident) ("người · dd/mm/yyyy HH:mm"), codeOfIncidentId(id, incidents?), notDuplicateCodes(incident, incidents?)
- urls: safeExternalUrl(raw), displayUrl(raw, max?)
- clipboard: copyText(text): Promise<boolean>
- Also: incidentEditHref(id).

### ENGINE (public API)
Import everything from "@/lib/engine" (index re-exports dates, scoring, text, period, filters, rag, ranking, analytics, brief and – REQ_V2 – duplicates, integrity, early-warning, inspections). Signatures marked "spec" match ARCHITECTURE §5.1 exactly.

period.ts
- spec: PeriodOption, periodOptions, defaultPeriod, weeksInPeriod (sorted ascending), countedWeeks, isWeekInPeriod, previousPeriod (literal previous calendar week / month / semester; undefined for "all" or the first period), periodLabel.
- periodOptions returns each list in chronological order; non-counted weeks get the suffix " (không tính thi đua)".
- A non-"all" period without a key behaves as "all".
- Extras:
  - const ALL_PERIOD: Period
  - interface PeriodRecord { week; month; semester }
  - periodMatcher(period, weeks): (rec: PeriodRecord) => boolean (builds the week index once; use it in loops)
  - isRecordInPeriod(rec, period, weeks): boolean
  - elapsedWeeksInPeriod(period, weeks, today): SchoolWeek[] (weekStart on or before Monday(today), holiday weeks included, ascending)

filters.ts (spec)
- filterIncidents(ds, f): skips soft-deleted records; grade uses incident.grade. REQ_V2: `f.group` keeps incidents whose snapshot `group` equals it (incidents without a group never match a group filter); `f.studentId` keeps incidents naming that Mã HS. Every consumer (computeKpis, classStats, studentStats, weeklyTrend, heatmap, brief…) inherits both.
- filterRewards(ds, f): period + grade + class only, all statuses (category / error / group / student filters do not apply to rewards).
- countedRewards(rewards, config).

rag.ts
- spec: dataConfidence(incidents), ragFor({ avgWeeklyPenalty, confidence, config }).
- Extra: const RAG_REASON_NOT_APPROVED = "Ngưỡng cảnh báo chưa được phê duyệt".
- Low-confidence reason format: "Độ tin cậy dữ liệu thấp (50%)".

ranking.ts
- spec: competitionRanks(scores, tieKeys?), top90Cutoff(n, ratio), buildRanking(ds, period, today, opts?).
- Ranking rule per level (NSHM decision): rankingRuleOf(levelId) → RankingRule { scope: "grade" | "level"; tieBreak: "none" | "violationTurns"; topCount? }
  (RANKING_RULES, DEFAULT_RANKING_RULE). TH / THCS: one table per khối, equal scores share a rank. THPT: { scope: "level", tieBreak: "violationTurns", topCount: 3 }
  – every active class in ONE table, equal scores → fewer lượt vi phạm (RankingRow.violationTurns) first, equal on both → same rank (1,1,3); reports name the top 3.
- buildRanking for THPT returns one GradeRanking with grade = LEVEL_RANKING_GROUP (0); rows keep their real grade, gradeClassCount / top90Cutoff are those of
  the level, and opts.grade is ignored. Never look a class's table up with `grades.find(g => g.grade === cls.grade)` – use findRankingGroup(ranking, code) /
  findRankingRow(ranking, code); label a table with rankingGroupLabel(group) ("Khối 6" | "Toàn cấp"); topRows(rows, n) = first n incl. ties at the cut.
- classScoreSeries(ds, classCode, today) → Array<{ week; score; penalty; reward; rank }>:
  - covers elapsed COUNTED weeks only;
  - score = baseScorePerWeek + counted rewards − penalties of that week;
  - rank is within the class's ranking group (active classes of its grade; THPT: of the level, with the lượt vi phạm tie-break);
  - returns [] for an unknown class.
- Extra: findRankingRow(ranking, classCode): RankingRow | undefined; findRankingGroup(ranking, classCode): GradeRanking | undefined.

analytics.ts — spec types and functions: Kpis, computeKpis, kpiComparison, IssueStat, topIssues, ClassStat, classStats, StudentStat, studentStats, studentHistory, GradeStat, gradeStats, categoryBreakdown, TrendPoint, weeklyTrend, classWeekHeatmap, TimelineDay, classTimeline, recidivism, fiveS, weekdayDistribution. Choices I made where §5.1 was silent:
- computeKpis: relatedStudents = Σ relatedStudentCount; uniqueStudents = distinct named students; rewardPoints = counted rewards (ignores category/error filters).
- topIssues: n defaults to 5 (pass Infinity for all); IssueStat.students = Σ relatedStudentCount.
- classStats: ClassStat.students = Σ relatedStudentCount.
- gradeStats: ignores classCode except to restrict the output to that class's grade; studentsInvolved = distinct named students; avgScore and top90Count come from buildRanking.
- weeklyTrend: label "dd/mm" of the Monday; includes holiday weeks.
- classWeekHeatmap: weeks are Monday ISO dates of the elapsed weeks of f.period; classes are ordered by grade, order, then natural code; every cell is listed, zeros included.
- classTimeline: items within a day are newest first.
- recidivism: classes are { classCode, grade, consecutiveWeeks, lastRag } (exported as type RecidivistClass); holiday weeks are skipped, and the in-progress current week is skipped while still below yellow. In week mode the class streak is measured over the week's semester up to the selected week (`contextPeriod(period, weeks)`, exported from period.ts – the dashboard re-exports it), so a past week is judged as of that week and the dashboard card equals the Decision Brief. Students: REPEAT = an incident in the period that is the student's ≥ repeatMin-th within the repeatWindowWeeks weeks ending with it, looking back before the period with the same filters (studentStats); counts (incidents, points, lastDate, maxPerWeek) still describe the period only.
- periodMatcher / isRecordInPeriod: a record whose week is not a calendar week is in no semester (a previous school year's "HK1" never counts in this year's HK1); month mode still falls back to the record's month. The server dataset only contains records of calendar weeks anyway.
- weekdayDistribution: always 7 entries, Thứ Hai to Chủ nhật.
- studentStats: name, class and status come from the current roster; when a student is missing from it, the incident snapshot is used with status "ACTIVE".
- REQ_V2 vocabulary (KPI_TERMS in constants): violationTurnsOf(i) = Lượt vi phạm of one incident ("/HS" → relatedStudentCount incl. unnamed; "/lần" → occurrenceCount, ≥ 1). `Kpis.violationTurns`, `IssueStat.violationTurns`, `ClassStat.violationTurns` = Σ violationTurnsOf (required fields).
- groupBreakdown(incidents, catalog?): GroupStat[] = { group, incidents, violationTurns, points, errorCodes (distinct codes with incidents) } per snapshot group; NO_GROUP_LABEL = "Chưa phân nhóm" for a missing/blank group. With `catalog`, every catalog group appears with zeros (an item without a group stands for NO_GROUP_LABEL) so bar order/colours stay stable. Sorted naturalCompare, NO_GROUP_LABEL last. For the "Theo nhóm lỗi" card pass the scope without group/error filters.
- analytics-history.ts (re-exported by analytics.ts):
  - cumulativePenalty(ds, f, today, opts?: { by?: "total" | "grade" | "class"; classCodes?; gradeAverage? }) → { weeks, labels ("dd/mm"), series: Array<{ key, label, values }> }. weeks = every elapsed calendar week of the year (holiday weeks included, value carried over); f.period is ignored, every other filter applies; values[k] = round2(Σ points with week ≤ weeks[k]) – the last value equals Σ points of the scope.
    - "total" (default): key "total", label "Lớp X" (class filter) | "Khối N" (grade filter) | "Toàn cấp".
    - "grade": key `grade:N`, label `Khối N`, one per grade in scope (class filter → its grade).
    - "class": key `class:CODE`, label `Lớp CODE`, for `classCodes` (given order, deduplicated) or every active class of the grade scope (display order); the class filter never restricts these series (pick top N + the filtered class in the UI).
    - gradeAverage: appends `avg:N` / `TB khối N` (ascending grade) = cumulative penalty of the grade's ACTIVE classes ÷ their number, same filters except class / student. "total" → every grade in scope; "class" → grades of the listed classes (unknown classes add none).
  - rankHistory(ds, grade, today, opts?: { basis?: "cumulative" | "week"; period?: Period }) → { grade, basis, weeks, labels, classes: Array<{ classCode, homeroomTeacher?, ranks, scores }> }. Population = active classes of the grade (display order) – THPT: every active class of the level with the lượt vi phạm tie-break, returned grade = LEVEL_RANKING_GROUP (0) whatever `grade` is passed; one point per counted elapsed week of the scope (default whole year; a week period is widened to its semester and cut at that week). "cumulative": score_k = baseScorePerWeek × (k + 1) + counted rewards − penalties of the scope up to weeks[k] (holiday-week records included) → the last point equals buildRanking(scope) score/rank. "week": as classScoreSeries (score and rank per week). ranks = competitionRanks (1 = best, ties share). Unknown grade → classes []; no counted week → weeks [] and empty arrays per class.
- Extras:
  - compareIncidentsNewestFirst(a, b)
  - studentStatsFromIncidents(ds, incidents): StudentStat[]
  - fiveSCodes(catalog): Set<string> (is5S flag; DEFAULT_5S_CODES when the catalog is empty)
  - type RecidivistClass

brief.ts
- spec: interface DecisionBrief, buildDecisionBrief(ds, period, today).
- Recommendations: at most 8, sorted High → Medium → Low; owners are "GVCN lớp X" (with scopeClass X), "Cán bộ nền nếp" or "BGH"; deadlineDays = config.actionSlaDays[priority].
- Extras: OWNER_DISCIPLINE, OWNER_BGH, gvcnOwner(classCode).

text.ts
- spec: normalizeVN, matchesSearch, nameSuggestions(partial, students, limit = 5).

edit-context.ts (shared with the server's PATCH /api/incidents/:id)
- editRuleContext({ original?, classCode, errorCode, roster, classes, catalog, today }): RuleContext – unchanged class: the class counts as active and the record's students stay valid with their snapshot class; unchanged error: the catalog snapshot. snapshotCatalogItem, resolveCatalogItem.

period.ts – calendar helpers (same text as the server's 400)
- calendarDateProblem(date, weeks) → "Ngày dd/mm/yyyy không thuộc lịch tuần của năm học (Cài đặt → Lịch tuần)." | undefined; outsideCalendarMessage(date); calendarStart(weeks) (DateInput `min` of the entry / reward forms).
- nameSuggestions tiers: exact match → ends with the partial at a word boundary → ends with the partial → contains all tokens; inside a tier ACTIVE students come first.
- Extras:
  - naturalCompare(a, b) (6A2 before 6A10)
  - compareVN(a, b)
  - formatNumberVN(n, maxDecimals = 2) ("1.234,5")
  - formatPercentVN(ratio) ("92%")

duplicates.ts (REQ_V2 §4.4 – detection only, never blocks; input must not be redacted)
- isPossibleDuplicatePair(a, b): different ids, both not deleted, same date + classCode + errorCode, not reviewed (neither lists the other in `notDuplicateOf`), and named students intersect OR neither names a student.
- possibleDuplicatesOf(incidents, { date, classCode, errorCode, studentIds, excludeId? }): existing matches of an entry-form draft, newest first. `excludeId` = the record being edited; pairs already reviewed with it are not reported. Incomplete draft → [].
- findPossibleDuplicates(incidents): DuplicateGroup[] = connected components (≥ 2) of pairs: { key `${date}|${classCode}|${errorCode}|${firstId}`, date, classCode, errorCode, issue, reason "SAME_STUDENTS" | "NO_NAMED_STUDENTS", incidents (oldest first: createdAt, code), extraPoints = Σ points − max points }. Newest date first, then class (natural), then key.

integrity.ts (REQ_V2 §4.4 – re-check of STORED records; input must not be redacted; deleted skipped)
- integrityIssues(incidents): Array<{ kind, incident, expected?, actual?, message }>, sorted date desc, code, kind.
  - POINTS_FORMULA: points ≠ computePoints({ unit, penalty, namedCount: relatedStudentCount − unnamedCount, unnamedCount, occurrenceCount }) → "Điểm trừ lưu 10 khác công thức 5" (expected = formula, actual = stored).
  - STUDENT_COUNT: relatedStudentCount ≠ students.length + unnamedCount → "HS liên quan lưu 2 khác số thực tế 0 (0 ghi tên + 0 chưa rõ tên)".
  - STUDENT_CLASS: named students whose snapshot class ≠ the incident class, when the record has no STUDENT_WRONG_CLASS issue (one item per incident) → "Phạm Văn D (6A02) không thuộc lớp 6A01 của sự việc".

early-warning.ts (REQ_V2 §4.5)
- DEFAULT_EARLY_WARNING = { risingPct 50, risingMinPoints 6, risingBaselineWeeks 4, prolongedWeeks 3, seriousGroups ["Nhóm 3", "Nhóm 4"], seriousMinPenalty 10 }. The engine owns the defaults (LevelConfig.earlyWarning is optional).
- resolveEarlyWarning(config): defaults + stored values; invalid fields fall back (numbers finite ≥ 0, week counts integers ≥ 1, seriousGroups trimmed / deduplicated, [] allowed). Always a fresh object – use it as the Cài đặt draft.
- EARLY_WARNING_KIND_LABELS: REPEAT_STUDENT "Tái phạm", RISING_CLASS "Tăng lỗi", PROLONGED_ERROR "Lỗi kéo dài", SERIOUS_INCIDENT "Sự việc nghiêm trọng". Types EarlyWarningKind, WarningSeverity ("high" | "medium" | "low" – the engine emits high/medium only), EarlyWarning.
- warningReferenceWeek(ds, period, today): week mode → its key; otherwise the last calendar week of the period that has started (holiday weeks included); undefined when none.
- earlyWarnings(ds, f, today, opts?: { config? }): EarlyWarning[] = { id, kind, severity, classCode, grade, studentId?, studentName?, errorCode?, issue?, week?, message, evidence: { incidentIds (newest first), current?, baseline?, streakWeeks?, points? } }. `opts.config` replaces the stored thresholds (settings preview). All rules honour grade / class / category / error / group / student filters; class rules run on the active classes of the scope with R = warningReferenceWeek(f.period).
  - REPEAT_STUDENT: studentStats rows with alert ≠ NONE (config.studentAlert). WEEKLY_RED → high, "Phạm Thiện Khôi (6A03): 3 lượt vi phạm trong tuần 12/10" (latest week with the max count); REPEAT → medium, "Đỗ Văn Đạt (7A01) tái phạm: 2 lượt trong 4 tuần" (count inside the window ending with the latest qualifying period week). evidence.incidentIds = period incidents naming the student. Redacted datasets: only students whose names are visible.
  - RISING_CLASS: current = penalty of R (> 0, ≥ risingMinPoints) ≥ baseline × (1 + risingPct/100); baseline = mean penalty of the up to risingBaselineWeeks COUNTED weeks before R (zeros included; no such week → rule skipped). high when current ≥ config.rag.red. "Lớp 7A02: 12 điểm trừ tuần 19/10, tăng 85% so với TB 4 tuần trước (6,5)" / "…, tăng từ 0 điểm".
  - PROLONGED_ERROR: per (class, error) the streak of consecutive counted weeks ending with R having ≥ 1 incident (holiday weeks skipped; the in-progress current week skipped while it has none). Flag when ≥ prolongedWeeks; high when ≥ prolongedWeeks + 2. "Lớp 6A03 mắc “Đi học muộn” (L01) 3 tuần liên tiếp".
  - SERIOUS_INCIDENT: period incidents not "Đã đóng" with group ∈ seriousGroups OR (seriousMinPenalty > 0 AND catalog penalty ≥ it). "Mới ghi nhận" → high, else medium. "NN-20261020-0006 · Lớp 6A05: Bạo lực học đường… (Nhóm 3, −10 điểm)" (the incident's points).
  - id = `${kind}|${classCode}|${subject}|${week}` with subject = studentId (REPEAT_STUDENT), errorCode (PROLONGED_ERROR), incident id (SERIOUS_INCIDENT), "" (RISING_CLASS) – unique, stable React key.
  - Sorted severity (high → low), kind (SERIOUS_INCIDENT, REPEAT_STUDENT, RISING_CLASS, PROLONGED_ERROR), class (natural), id. GVCN screens restrict to own classes themselves.
- earlyWarningCounts(items): Record<EarlyWarningKind, number> (every kind, zeros included).

inspections.ts (REQ_V2 §4.6; `ds.inspections` absent → [])
- DEFAULT_COVERAGE_MIN_RATIO = 0.6.
- filterInspections(ds, f, today): non-deleted rounds dated ≤ today in f.period; f.category → rounds of that Mảng + general rounds (no category); grade / class filters → rounds touching a class of the scope grade (class filter → that class's grade; unknown class → rounds naming it). error / group / student filters ignored. Sorted date desc, code desc.
- inspectionCoverage(ds, f, today, opts?: { minRatio? }) → { rounds, sessions (distinct date + buổi), classesInspected, classesTotal, grades: GradeCoverage[], flagged, minRatio }. GradeCoverage = { grade, avgRounds, minRounds, maxRounds, noInspections, rows } over the ACTIVE classes of the scope grades (class filter → its grade, population unchanged). CoverageRow = { classCode, grade, homeroomTeacher?, rounds, sessions, lastDate?, incidents / points (every filter except class / student), incidentsPerRound (null when 0 rounds), gradeAvgRounds, coverageRatio = round2(rounds / gradeAvgRounds) (null when the average is 0), status "NONE" (0 rounds while the grade average > 0) | "LOW" (ratio < minRatio) | "OK", highlighted (= class filter) }. flagged = status ≠ OK, NONE first, then ratio asc, then class.

__fixtures__/dataset.ts
- makeFixtureDataset(): LevelDataset (fresh objects on every call)
- FIXTURE_TODAY = "2026-10-21"
- FIXTURE_HOLIDAY_WEEK = "2026-08-31"
- FIXTURE_STUDENT_IDS = { khoi, dat, huy, long, truongPhuc6A01, truongPhuc7A02, phucTruong7A01 }

__fixtures__/dataset-v2.ts (REQ_V2; phase-2 tests may use it – makeFixtureDataset() itself is unchanged)
- makeV2FixtureDataset(): base fixture + 7 incidents + 8 inspection rounds (see the file header for the story): a new "Nhóm 3" serious incident in 6A05 (also a rising class in week 19/10), a SAME_STUDENTS and a NO_NAMED_STUDENTS duplicate pair, a reviewed pair (`notDuplicateOf`), a 3-week prolonged L14 in 7A01 (current week skipped), one POINTS_FORMULA defect; rounds incl. one deleted, two general, one per Mảng, both shifts (whole year: 6A05 NONE, 7A03 LOW).
- V2_FIXTURE_IDS (serious, dupNamed, dupNamedOf, dupUnnamed, dupUnnamedOf, reviewed, reviewedOf, prolonged1, prolonged2, prolongedBase, defect), V2_INSPECTION_IDS, V2_CATEGORIES ({ cc, ht, bt, khac } Mảng names).

### EXCEL (public API)
All exports are available from "@/lib/excel" (index.ts). Every function is async except where noted, and ExcelJS is loaded on first use.

Shared types:
type BinaryInput = ArrayBuffer | Uint8Array  // Node Buffer is accepted too

PARSE
- parseNshmWorkbook(buffer: BinaryInput, fileName: string): Promise<ParseWorkbookResult>
  - ParseWorkbookResult = { payload: WorkbookPayload; warnings: string[] }
  - payload is already WorkbookPayloadSchema-parsed.
  - Throws ExcelParseError (message in Vietnamese) when the file is unreadable, is not an NSHM workbook, has an unknown level, or exceeds schema limits.
- parseRosterSheet(buffer: BinaryInput, fileName: string, opts?: { sheetName?: string }): Promise<ParseRosterResult>
  - ParseRosterResult = { rows: RosterRow[]; sheetName: string; warnings: string[] }
  - Throws ExcelParseError when no sheet has Mã HS + Họ tên + Lớp.
- class ExcelParseError extends Error  // name "ExcelParseError"; message is safe to show users
- STUDENT_SHEET_NAMES

EXPORT (each returns Promise<Uint8Array> holding .xlsx bytes)
In the browser, download with downloadBlob(bytes, name, MIME.xlsx) from @/lib/client/download. In Node, wrap with Buffer.from(bytes).

- exportLevelWorkbook(ds: LevelDataset, opts: ExportWorkbookOptions)
  - ExportWorkbookOptions = { today: string; levelName: string; rankingRows?: RankingExportRow[]; studentRows?: StudentExportRow[]; periodLabel?: string }
  - The Xếp hạng sheet follows rankingRuleOf(ds.levelId): per khối (sorted khối → hạng; subtitle "Xếp hạng trong từng khối; Top 90% tính theo số lớp của khối."),
    or THPT: one level-wide table sorted by hạng (Khối column = the class's own grade), a "Lượt vi phạm" column before "Hạng", the level rule in the
    subtitle and "★ Top 3 toàn cấp: 10A1 (hạng 1), …" in row 3 (omitted when the tie swallows the whole table).
- exportSimpleSheet(title: string, columns: SimpleColumn[], rows: SimpleRow[], opts?: SimpleSheetOptions)
  - SimpleColumn = { header: string; key: string; width?: number }
  - SimpleRow = Record<string, string | number | null>
  - SimpleSheetOptions = { subtitle?: string; sheetName?: string }
- exportRankingSheet(rows: RankingExportRow[], ctx: ReportContext) – same layout as the workbook's Xếp hạng sheet; the rule comes from ctx.levelId
  (default: the level whose LEVELS name is ctx.levelName).
- exportStudentList(rows: StudentExportRow[], ctx: ReportContext)
- exportGvcnReport(input: ReportContext & { classCode: string; homeroomTeacher?: string; incidents: Incident[] })
- ReportContext = { levelName: string; periodLabel: string; today: string; topRatio?: number (config.top90Ratio); levelId?: LevelId (ranking rule) }

Row types:
- RankingExportRow = { grade: number; classCode: string; homeroomTeacher?: string; base: number; rewardPoints: number; penaltyPoints: number; score: number; rank: number; inTop90: boolean; rag: string; violationTurns?: number }
  - Engine RankingRow is assignable, so you can pass grades.flatMap(g => g.rows).
- StudentExportRow = { id: string; name: string; classCode: string; incidents: number; points: number; errors: string; alert: string }
  - alert may be "NONE" | "REPEAT" | "WEEKLY_RED"; these are mapped to Vietnamese text.

HTML snapshot (sync; can also be imported from "@/lib/excel/html-snapshot" without loading ExcelJS)
- buildHtmlSnapshot(input: HtmlSnapshotInput): string
  - HtmlSnapshotInput = { schoolName; levelName; periodLabel; generatedAt (ISO timestamp or yyyy-mm-dd); kpis: {label, value}[]; topRatio?; rankingLayout?: RankingLayout (engine rankingRuleOf); rankingByGrade: { grade (0 = LEVEL_RANKING_GROUP → card "Toàn cấp"); rows: { rank; classCode; score; penalty; reward; inTop90; rag; violationTurns? }[] }[]; topIssues: { issue; incidents; points }[]; topClasses: { classCode; incidents; points }[] }
  - THPT layout: heading "Xếp hạng thi đua toàn cấp", the rule line, a "Lượt vi phạm" column and "Top 3 toàn cấp: …" in the card.
- escapeHtml(s: string): string
- formatGeneratedAt(v: string): string

HELPERS (sync)
- Text and labels: catalogChoiceText(item) → "issue | category | 2 điểm/HS | L04"; penaltyUnitText(penalty, unit); formatPenalty(n); ragLabel(rag); top90Label(b); studentAlertLabel(a); RAG_SHORT
- Ranking layout texts (RankingLayout = Pick<RankingRule, "scope" | "tieBreak" | "topCount">): rankingRuleNote(layout, ratio?) → one-line rule of the table;
  leadingClassesNote(rows, layout) → "Top 3 toàn cấp: 10A1 (hạng 1), 11A1 (hạng 1), 12A1 (hạng 3)." | undefined
- incidentSubjects(inc) → "Tên A, Tên B + 2 HS chưa rõ tên" or "Tập thể lớp"
- Parsing pieces: extractErrorCode(choice); splitStudentChoice(choice)
- Level detection: levelFromTitle(text); levelFromGrades(classes); levelFromFileName(name)
- Normalisation: foldVN(s); headerKey(s)
- Binary and loading: loadExcelJS(); toArrayBuffer(input); toUint8Array(data)
- XLSX_MIME