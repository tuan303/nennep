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
- BarChart({ categories, series, horizontal?, height?, valueFormatter?, showValues?, onBarClick?({ category, seriesName, value, index }), ariaLabel?, emptyTitle?, emptyDescription?, loading? }).
- LineChart({ categories, series: (ChartSeries & { dashed?, area? })[], area?, height?, markLines?: { value, label?, color? }[], valueFormatter?, smooth?, zoom? (default on above 26 points), onPointClick?, ariaLabel?, empty*?, loading? }).
- DonutChart({ data: { name, value, color? }[], centerLabel?, centerValue?, height? (200), valueFormatter?, legend?: "side"|"bottom"|"none", onSliceClick?(name), ariaLabel?, empty*?, loading? }) — HTML legend with value and percentage.
- HeatmapChart({ xLabels, yLabels, values: [x, y, v][], height?, valueLabel? ("Điểm trừ"), valueFormatter?, onCellClick?({ x, y, xLabel, yLabel, value }), colors?, max?, maxRows? (30, then a vertical slider), showCellValues?, ariaLabel?, empty*?, loading? }).
- Sparkline({ data: number[], color?, width? (96), height? (32), strokeWidth?, area?, ariaLabel? }) — plain SVG.
- Palette and theme: CHART_COLORS (fixed order of 8), chartColor(i), CHART_OTHER_COLOR, HEAT_COLORS, BLUE_COLORS, CHART_TOKENS, buildNshmTheme.
- Pure option builders: buildBarOption, buildLineOption, buildDonutOption, buildHeatmapOption, isSeriesEmpty, donutTotal, heatmapMax, escapeHtml.

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

incidents
- create(IncidentCreateInput): Incident
- get(id): Incident
- update(id, IncidentUpdateInput): Incident – send `baseRev: record.rev ?? 0` (409 CONFLICT when the record changed
  meanwhile: show the message and reload the record) and `status` only when the user changed it
- remove(id, reason): OkResponse
- restore(id): Incident
- feedback(id, GvcnFeedbackInput): Incident
- listDeleted(levelId): ListResponse<Incident>

rewards
- create(RewardCreateInput): Reward
- update(id, RewardUpdateInput): Reward – same `baseRev` / changed-only `status` rule as incidents
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
- rebuildDigests(input?): RebuildDigestsResponse (`{ ok, results: { [level]: { weeks, incidents, rewards, students } } }`)
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
- FilterPatch = { period?: { mode: PeriodMode; key?: string }; grade?: number; classCode?: string; category?: string; errorCode?: string }
  - Passing undefined or "" clears a field.
  - Omitting period.key picks the default key for that mode.
- FilterOptions = { weeks: PeriodOption[]; months: PeriodOption[]; semesters: PeriodOption[]; grades: Array<{ value: number; label: string }>; classes: ClassInfo[]; categories: string[]; errors: CatalogItem[] }
- Also exported: activeFilterCount(f), FILTER_PARAMS. filters-core.ts holds the pure helpers.

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
- Navigation pieces: `Sidebar`, `TopBar`, `BottomNav`, `MoreSheet({ open, onOpenChange, groups: NavGroup[], activeId? })`.
- Top-bar pieces: `LevelSwitcher({ variant?: "auto"|"segmented"|"select", className? })`, `SyncIndicator({ className? })`, `UserMenu({ className? })`, `profileScopeText(profile): string`.
- `ChangePasswordDialog({ open, onOpenChange })`.
- Screens: `AppLoadingScreen({ message?, onSignOut? })`, `AccountBlocked({ className? })`, `AccountBlockedScreen()`, `StatusScreen({ icon, tone?, code?, title, description?, home?: { href, label } | null, showBack?, onRetry?, retryLabel?, footer?, children? })`, `NotFoundScreen()`.
- Brand: `Logo({ size?: "sm"|"md"|"lg", tone?: "dark"|"light", showText?, className? })`, `LogoMark({ size?: "xs"|"sm"|"md"|"lg"|"xl", label?, className? })`, `STAR_PATH` (24×24 star path).
- Hooks: `useNavModel(): { groups, bottom, pathname, route? }`, `usePageChrome(): { title, showFilters, showLevelSwitcher }`, `useSignOut(): () => Promise<void>`.

NAV / ROUTES (pure)
- `APP_ROUTES: Record<AppRouteId, AppRoute>` and `APP_ROUTE_LIST`.
  - AppRoute = { id, href, title, shortLabel, description, permission, multiLevel?, filters: boolean, levelSwitcher: boolean }.
  - AppRouteId: overview | school | ranking | classes | gvcn | students | entry | rewards | actions | studentAdmin | data | excel | audit | settings.
- `routeMetadata(id): Metadata`, `routeForPath(pathname)`, `isRouteActive(href, pathname)`, `canSeeRoute(route, { can, levelCount })`.
- `NAV_GROUPS`, `NAV_ICONS`, `visibleNavGroups(ctx)`, `bottomNavModel(ctx): { slots: BottomSlot[]; more: NavGroup[] }`, `activeNavItem(items, pathname)`.
- Filter bar defaults per route:
  - Shown on /, /xep-hang, /lop, /bao-gvcn, /hoc-sinh, /du-lieu; hidden elsewhere.
  - Level switcher hidden on /toan-truong and /nhat-ky.

ROUTES
- `/dang-nhap` (login).
- `src/app/(app)/` placeholders for `/`, `/toan-truong`, `/xep-hang`, `/lop`, `/bao-gvcn`, `/hoc-sinh`, `/nhap-lieu`, `/diem-thuong`, `/hanh-dong`, `/quan-ly-hoc-sinh`, `/du-lieu`, `/nhap-xuat`, `/nhat-ky`, `/cai-dat`.
  - Each `page.tsx` is a tiny "use client" page with PageHeader + "Đang xây dựng" inside the right RequirePermission (/toan-truong also uses LevelGuard minLevels=2). Replace page.tsx freely.
  - Each route folder also has a `layout.tsx` that only exports the tab title; keep it.
- Also: `/manifest.webmanifest`, `/icon.svg`, `/apple-icon.png`, `/icons/*.png`.

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
- IncidentDetailSheet({ ds: LevelDataset; incident: Incident | null (null closes); onClose(): void; onChanged?(): void; onOpenStudent?(studentId: string): void })
  - Content:
    - Summary: category, code + issue, −points, FormulaText, StatusBadge, ScopeBadge, PenaltyPill, DataCheckBadge.
    - Info grid: date + weekday, week, class · grade, GVCN, penalty + group, occurrences or student count, người ghi, code.
    - Students list (or "Tập thể lớp"), with unnamedCount shown.
    - Detail, data-check issues, GVCN feedback, EvidenceGallery.
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
  - isIncidentRedacted(ds, incident, profile)
  - editWindowRemainingMs, formatRemaining
- urls: safeExternalUrl(raw), displayUrl(raw, max?)
- clipboard: copyText(text): Promise<boolean>
- Also: incidentEditHref(id).

### ENGINE (public API)
Import everything from "@/lib/engine" (index re-exports dates, scoring, text, period, filters, rag, ranking, analytics and brief). Signatures marked "spec" match ARCHITECTURE §5.1 exactly.

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
- filterIncidents(ds, f): skips soft-deleted records; grade uses incident.grade.
- filterRewards(ds, f): period + grade + class only, all statuses.
- countedRewards(rewards, config).

rag.ts
- spec: dataConfidence(incidents), ragFor({ avgWeeklyPenalty, confidence, config }).
- Extra: const RAG_REASON_NOT_APPROVED = "Ngưỡng cảnh báo chưa được phê duyệt".
- Low-confidence reason format: "Độ tin cậy dữ liệu thấp (50%)".

ranking.ts
- spec: competitionRanks(scores), top90Cutoff(n, ratio), buildRanking(ds, period, today, opts?).
- classScoreSeries(ds, classCode, today) → Array<{ week; score; penalty; reward; rank }>:
  - covers elapsed COUNTED weeks only;
  - score = baseScorePerWeek + counted rewards − penalties of that week;
  - rank is within the active classes of the class's grade;
  - returns [] for an unknown class.
- Extra: findRankingRow(ranking, classCode): RankingRow | undefined.

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

__fixtures__/dataset.ts
- makeFixtureDataset(): LevelDataset (fresh objects on every call)
- FIXTURE_TODAY = "2026-10-21"
- FIXTURE_HOLIDAY_WEEK = "2026-08-31"
- FIXTURE_STUDENT_IDS = { khoi, dat, huy, long, truongPhuc6A01, truongPhuc7A02, phucTruong7A01 }

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
- exportSimpleSheet(title: string, columns: SimpleColumn[], rows: SimpleRow[], opts?: SimpleSheetOptions)
  - SimpleColumn = { header: string; key: string; width?: number }
  - SimpleRow = Record<string, string | number | null>
  - SimpleSheetOptions = { subtitle?: string; sheetName?: string }
- exportRankingSheet(rows: RankingExportRow[], ctx: ReportContext)
- exportStudentList(rows: StudentExportRow[], ctx: ReportContext)
- exportGvcnReport(input: ReportContext & { classCode: string; homeroomTeacher?: string; incidents: Incident[] })
- ReportContext = { levelName: string; periodLabel: string; today: string }

Row types:
- RankingExportRow = { grade: number; classCode: string; homeroomTeacher?: string; base: number; rewardPoints: number; penaltyPoints: number; score: number; rank: number; inTop90: boolean; rag: string }
  - Engine RankingRow is assignable, so you can pass grades.flatMap(g => g.rows).
- StudentExportRow = { id: string; name: string; classCode: string; incidents: number; points: number; errors: string; alert: string }
  - alert may be "NONE" | "REPEAT" | "WEEKLY_RED"; these are mapped to Vietnamese text.

HTML snapshot (sync; can also be imported from "@/lib/excel/html-snapshot" without loading ExcelJS)
- buildHtmlSnapshot(input: HtmlSnapshotInput): string
  - HtmlSnapshotInput = { schoolName; levelName; periodLabel; generatedAt (ISO timestamp or yyyy-mm-dd); kpis: {label, value}[]; rankingByGrade: { grade; rows: { rank; classCode; score; penalty; reward; inTop90; rag }[] }[]; topIssues: { issue; incidents; points }[]; topClasses: { classCode; incidents; points }[] }
- escapeHtml(s: string): string
- formatGeneratedAt(v: string): string

HELPERS (sync)
- Text and labels: catalogChoiceText(item) → "issue | category | 2 điểm/HS | L04"; penaltyUnitText(penalty, unit); formatPenalty(n); ragLabel(rag); top90Label(b); studentAlertLabel(a); RAG_SHORT
- incidentSubjects(inc) → "Tên A, Tên B + 2 HS chưa rõ tên" or "Tập thể lớp"
- Parsing pieces: extractErrorCode(choice); splitStudentChoice(choice)
- Level detection: levelFromTitle(text); levelFromGrades(classes); levelFromFileName(name)
- Normalisation: foldVN(s); headerKey(s)
- Binary and loading: loadExcelJS(); toArrayBuffer(input); toUint8Array(data)
- XLSX_MIME