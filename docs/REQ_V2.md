# REQ_V2 – 13 yêu cầu hiển thị/chức năng của nhà trường (binding design)

Source: school file "DỮ LIỆU CẦN XUẤT HIỆN HIỂN THỊ.xlsx" (13 hạng mục). This document is **binding** for the four
implementation areas (A, B, C, D). Read `docs/ARCHITECTURE.md`, `docs/SERVER_API.md`, `docs/FRONTEND_API.md` first.
Where this document and older docs disagree, this document wins for the items it covers.

**Global rules (repeat of the hard rules – every area):**

- Production holds real data. Every data-model change below is **additive and optional**; old documents stay valid
  without migration; every new digest is rebuildable from canonical documents (`/api/admin/rebuild-digests`).
- Business rules are server-authoritative; analytics only through the pure engine (`src/lib/engine`, shared server/client).
- No real names / Mã HS / phones / e-mails in code, tests or docs (fictional data only, e.g. "Nguyễn Văn A", Mã HS
  `HS0001`). `src/lib/excel/__tests__/no-real-data.test.ts` must pass.
- No new dependencies. No `git commit/push`, no `next build/dev` (integrator only), never touch `.env*`.
- Integration tests use their own `demo-test-v2-*` project ids on the running emulators; never `demo-nshm-nennep`.
- Typecheck `npx tsc --noEmit -p .`; tests `npx vitest run <paths>`. UI copy Vietnamese, identifiers English.
- Design: NSHM crimson `#D21235` + navy `#23328C`, Lexend, level accent via `data-cap` (`bg-acc`, `text-acc-ink`…),
  kit from `@/components/ui` + `@/components/charts`, widgets from `@/components/app/widgets`. Tables → cards < 640px,
  touch targets ≥ 44px, colour never the only signal.

---

## 1. Gap analysis (strict)

| # | Hạng mục | Status | Evidence in code (what exists) | Gap (what v2 adds) |
|---|---|---|---|---|
| 1 | Bộ lọc: tuần, tháng, HK, khối, lớp, nhóm lỗi, mã HS (theo quyền) | **PARTIAL** | Period modes week/month/semester/all + grade/class/Mảng/lỗi: `src/lib/client/filters-core.ts` (`FILTER_PARAMS`, `resolveFilters`), `src/components/app/shell/filter-fields.tsx`, engine `filterIncidents` (`src/lib/engine/filters.ts`). Role scoping of data: `redactForGvcn` (`src/lib/server/dataset.ts`). | No **Nhóm lỗi** filter (`GlobalFilters` has no group although `CatalogItem.group`/`Incident.group` exist). No global **Mã HS** filter (only the local search of `/hoc-sinh`). → §4.1, §6.1 |
| 2 | Biểu đồ: cột theo nhóm lỗi; đường xu hướng; cộng dồn điểm trừ; biến động xếp hạng theo khối | **PARTIAL** | Weekly trend line (`dashboard/overview/trend-card.tsx` + `weeklyTrend`), Mảng donut, weekday bars, heatmap, class score line (`class-detail/class-charts.tsx` + `classScoreSeries`), rank delta vs previous period (`ranking/lib/ranking-view.ts` `rankDeltas`). | No bar chart by **error group**; no **cumulative penalty** line; no **rank-movement (bump) chart** per grade. → §4.3, §6.2–6.4 |
| 3 | Quy tắc tính điểm: tập thể/cá nhân; không nhân đôi điểm trừ; theo mã lỗi | **PARTIAL** | Scope + BR-POINT-03/04 `validateIncidentRules`, `computePoints` on the catalog snapshot (`src/lib/engine/scoring.ts`); "/lần" never attributed to students (`analytics-students.ts`); ScopeBadge in detail sheet / Dữ liệu table. | The same incident recorded twice (two inspectors, double click on two devices) **doubles the penalty** – no detection in the form nor in review. Scope label missing in some lists. → §4.4, §7.1, §7.3 |
| 4 | Điểm cộng 1–5, GV tự ghi lý do | **PARTIAL** | Rewards module (`src/components/rewards/*`, `src/lib/server/rewards.ts`): points 1–100 (`REWARD_POINTS_MAX = 100`, presets 2/5/10), `reason` ≥ 3 chars ("Nội dung thưởng"); GVCN has no `reward.create`. | Points must be **integer 1–5** (5 big buttons), reason "vì sao cộng điểm" **required ≥ 5 chars**; GVCN must be able to **propose** rewards for own classes. → §3, §5.3, §7.2 |
| 5 | Mã định danh: mã sự việc, mã HS, mã lớp, mã lỗi | **DONE** | `NN-yyyymmdd-NNNN` per level via `counters/` (`src/lib/server/ids.ts`, `counterId`), doc id `{level}_{code}` globally unique; Mã HS = `students/{id}` school-wide unique; `ClassInfo.code`, `CatalogItem.code`, `Incident.errorCode` snapshot; imports reject duplicate / foreign codes (`server/admin/workbook-incidents.ts`). | Only new identifiers follow the same scheme: inspection rounds `DKT-yyyymmdd-NNN` (§3). Reports/exports must print Mã HS/Mã lớp/Mã lỗi columns (§6.5, §7.4). |
| 6 | Nguồn dữ liệu: sự việc; HS liên quan; xử lý/khắc phục; danh mục | **PARTIAL** | `/nhap-lieu` + `POST /api/incidents`; `Incident.students` (snapshot) + `unnamedCount`; catalogs: Cài đặt (danh mục lỗi, lớp & GVCN), `/quan-ly-hoc-sinh`, Excel imports. | **Xử lý/khắc phục** not modelled (only `status` + `gvcnNote`). → `remediation*` fields (§3, §5.4, §7.4–7.5) |
| 7 | Phân quyền: BGH toàn cấp; Nền nếp quản lý; GVCN lớp mình | **DONE** | `MATRIX`/`hasPermission`/`canSeeClassDetail` (`src/lib/constants.ts`): VIEWER (BGH) all levels, EDITOR (nền nếp) create + data inspection, GVCN own-class detail via `redactForGvcn` + `/api/dataset`; every route enforces server-side. | v2 features must keep it: new permissions `reward.propose`, `incident.remediate`, `inspection.manage` (§3); report recipients and student filter limited by role (§6.1, §6.5). |
| 8 | Xuất báo cáo: Excel chi tiết; PDF tuần/tháng; lọc theo người nhận | **PARTIAL** | Workbook export (`src/lib/excel/export-workbook.ts`), Excel Xếp hạng / Báo GVCN / HS (`export-report.ts`), print/PDF of Báo GVCN (`gvcn-report/print-parts.tsx`, `window.print`), HTML snapshot. | No **weekly/monthly report** for BGH / tổ khối / GVCN with a **recipient selector**; no multi-class detail Excel with Mã HS + khắc phục. → new screen `/bao-cao` (§6.5) |
| 9 | Cập nhật: đồng bộ điểm & báo cáo khi thêm/sửa | **DONE** | One transaction per mutation: canonical + digest + `bumpVersions` + audit (`server/incidents.ts`, `rewards.ts`, `versions.ts`); client `onSnapshot(meta/versions)` refetch (`src/lib/client/data.tsx`); points recomputed server-side (`buildIncidentCore`); digest rebuild endpoint. | New entity (inspections) and new mutations follow the same pattern (§5). |
| 10 | Cảnh báo sớm: tái phạm, tăng lỗi, lỗi kéo dài, sự việc nghiêm trọng | **PARTIAL** | Student WEEKLY_RED / REPEAT (`studentStats`, `config.studentAlert`), class recidivism ≥ 2 weeks ≥ yellow (`recidivism`), RAG, Decision Brief findings (`engine/brief-findings.ts`). | No **rising-class**, **prolonged-error** or **serious-incident** detection, no unified list, no thresholds in Cài đặt. → `earlyWarnings` (§4.5), Tổng quan card (§6.2), Hành động tab (§7.6), Cài đặt tab (§7.7) |
| 11 | Kiểm soát chất lượng: sai lớp; thiếu HS; trùng mã; lỗi công thức | **PARTIAL** | Sai lớp: form validation + `STUDENT_WRONG_CLASS` on import; thiếu HS: `MISSING_STUDENTS` / `THIEU_TEN_HS` + review queue (`data-inspect/review-tab.tsx`); trùng mã: counters + import ERROR rows (duplicate code in file, code of another record); lỗi công thức: `POINTS_MISMATCH_IMPORT`. | No **possible-duplicate** records check (same day/class/error/students) and no integrity re-check of **stored** points/counts. → `findPossibleDuplicates`, `integrityIssues` (§4.4), Dữ liệu tabs (§7.3) |
| 12 | Kiểm tra công bằng: bao phủ kiểm tra, số buổi/đợt theo lớp | **MISSING** | Nothing: no entity for inspection rounds, no coverage metric. | New entity **Đợt kiểm tra** (`Inspection`, §3/§5.2), recording UI in `/nhap-lieu` (§7.1), coverage view in Xếp hạng (§6.3), engine `inspectionCoverage` (§4.6). |
| 13 | Nguồn số liệu: sự việc, lượt vi phạm, số HS duy nhất, điểm trừ | **PARTIAL** | `Kpis.incidents`, `relatedStudents`, `uniqueStudents`, `penaltyPoints` (`engine/analytics-core.ts`); Tổng quan shows "HS liên quan" with unique students only as a note (`dashboard/lib/overview-model.ts`). | No **Lượt vi phạm** metric; vocabulary/tooltips inconsistent between screens. → `Kpis.violationTurns` (§4.2), shared `KPI_TERMS` (§3), used everywhere (§6, §7). |

---

## 2. Phases and file ownership

- **Phase 1 (parallel): A (foundation + server) and B (engine).** B codes against the types of §3 (type-only imports,
  erased at runtime). B must not import any NEW runtime value from `constants.ts`/`contract.ts`. Until A lands, tsc errors
  that mention the v2 types are expected in B's workspace – run vitest, re-run tsc after A.
- **Phase 2 (parallel): C (screens part 1) and D (screens part 2)**, after A and B are green.
- **Integrator**: full `npx tsc --noEmit -p .`, `npx vitest run`, `next build`.

Ownership is exclusive inside a phase. A file not listed for an area must not be edited by it.

### Area A – foundation + server (Phase 1)
- `src/lib/types.ts`, `src/lib/constants.ts`, `src/lib/contract.ts`, `src/lib/firestore-paths.ts` (§3 verbatim).
- `src/lib/server/**` (incl. `admin/**`, `__tests__/**`), `src/app/api/**` (new + changed routes, §5).
- `src/lib/client/api.ts` (+ `src/lib/client/__tests__/api.test.ts`).
- `src/components/audit/lib/audit-labels.ts`, `src/components/audit/lib/audit-summary.ts` (+ their tests) – new audit actions.
- `scripts/**` (seed must respect the new reward rules), `firestore.indexes.json` (only if needed),
  `docs/ARCHITECTURE.md`, `docs/SERVER_API.md`, `docs/HUONG_DAN_TRIEN_KHAI.md`.

### Area B – engine (Phase 1)
- `src/lib/engine/**` (new files listed in §4, edits to `filters.ts`, `analytics-core.ts`, `analytics.ts`, `index.ts`,
  `__fixtures__/dataset.ts`, `__tests__/**`).
- Compile-fix only (add the new required numeric fields to object literals, nothing else):
  `src/components/dashboard/__tests__/cards-render.test.ts`, `src/components/dashboard/__tests__/school-model.test.ts`.
- `docs/FRONTEND_API.md` – ENGINE section only.

### Area C – screens part 1 (Phase 2)
- Shell & filters: `src/components/app/shell/**` (routes, nav, filter bar/sheet/chips, tests),
  `src/lib/client/filters-core.ts`, `src/lib/client/filters.tsx`, `src/lib/client/__tests__/filters-core.test.ts`.
- `src/components/dashboard/**` (Tổng quan + Toàn trường), `src/components/ranking/**`, `src/components/class-detail/**`,
  `src/components/students-view/**` (vocabulary only), `src/components/charts/**`, `src/components/ui/**`,
  `src/app/globals.css` (only if unavoidable).
- New: `src/components/report/**`, `src/app/(app)/bao-cao/{layout,page}.tsx`; pages `src/app/(app)/{page,xep-hang,lop,toan-truong,hoc-sinh}/**`.

### Area D – screens part 2 (Phase 2)
- `src/components/entry/**`, `src/app/(app)/nhap-lieu/**`, new `src/components/inspections/**`.
- `src/components/rewards/**`, `src/app/(app)/diem-thuong/**`.
- `src/components/data-inspect/**`, `src/app/(app)/du-lieu/**`.
- `src/components/gvcn-report/**`, `src/app/(app)/bao-gvcn/**`.
- `src/components/actions/**`, `src/app/(app)/hanh-dong/**`.
- `src/components/settings/**`, `src/app/(app)/cai-dat/**`.
- `src/components/app/widgets/**` (incident detail, feedback, access helpers, badges).
- `src/lib/excel/**` (GVCN export columns).

### Cross-area contracts (Phase 2)
- C changes `APP_ROUTES.rewards.permission` to `"reward.propose"` (routes.ts); D changes the `/diem-thuong` page guard to
  `<RequirePermission p="reward.propose">`. Both are required.
- C never edits widgets/excel; D never edits the UI kit/charts/shell (build local components in its own folders).
- Both use only the public APIs of §3 (A) and §4 (B).

---

## 3. Data model & contract additions (VERBATIM – area A writes exactly this)

All additions are optional fields / new members. Never rename or remove existing exports.

### 3.1 `src/lib/types.ts`

```ts
// AuditAction union – append three members (keep the existing ones):
  | "CREATE_INSPECTION"
  | "UPDATE_INSPECTION"
  | "DELETE_INSPECTION";

// interface LevelConfig – append after `actionSlaDays`:
  /** Ngưỡng cảnh báo sớm (Cài đặt → Cảnh báo sớm). Absent → engine DEFAULT_EARLY_WARNING. */
  earlyWarning?: EarlyWarningConfig;

// interface Incident – append after `gvcnNoteAt`:
  /** Biện pháp xử lý / khắc phục. Omitted when empty. Set only through POST /api/incidents/:id/feedback. */
  remediation?: string;
  /** ISO timestamp of the last remediation change. */
  remediationAt?: string;
  /** Display name of the user who last changed the remediation. */
  remediationBy?: string;
  /** Doc ids of incidents reviewed as NOT duplicates of this one (a pair is reviewed when either side lists the other). */
  notDuplicateOf?: string[];

// interface Reward – append after `status`:
  /** true when created by a GVCN through `reward.propose` (a proposal; counted only once its status is counted). */
  proposed?: boolean;

// interface LevelDataset – append after `rewards`:
  /** Inspection rounds of the calendar weeks, non-deleted (GVCN: `note` stripped). Absent → treat as []. */
  inspections?: Inspection[];

// interface GlobalFilters – append:
  group?: string; // Nhóm lỗi (catalog group, e.g. "Nhóm 3"): incidents whose snapshot `group` equals it
  studentId?: string; // Mã HS: incidents naming this student

/** Early-warning thresholds of a level (REQ_V2 §4.5). */
export interface EarlyWarningConfig {
  /** RISING_CLASS: reference-week penalty ≥ baseline average × (1 + risingPct / 100). Default 50. */
  risingPct: number;
  /** RISING_CLASS: minimum penalty points in the reference week. Default 6. */
  risingMinPoints: number;
  /** RISING_CLASS: counted weeks before the reference week used for the baseline average. Default 4. */
  risingBaselineWeeks: number;
  /** PROLONGED_ERROR: consecutive counted weeks with the same error code in a class. Default 3. */
  prolongedWeeks: number;
  /** SERIOUS_INCIDENT: catalog groups treated as serious. Default ["Nhóm 3", "Nhóm 4"]. */
  seriousGroups: string[];
  /** SERIOUS_INCIDENT: OR catalog penalty (per HS / per lần) ≥ this value; 0 disables this rule. Default 10. */
  seriousMinPenalty: number;
}

/** Buổi kiểm tra. */
export type InspectionShift = "Sáng" | "Chiều";

/** Đợt kiểm tra nền nếp (REQ_V2 §12): which classes were inspected, when, for which Mảng. */
export interface Inspection {
  id: string; // `${levelId}_${code}`
  code: string; // "DKT-20261021-001" (unique inside a level)
  levelId: LevelId;
  date: string; // yyyy-mm-dd
  week: string; // Monday of `date`
  month: string; // yyyy-mm of `week`
  semester: string; // "" if outside the semesters
  shift?: InspectionShift;
  /** Mảng kiểm tra (a catalog category); omitted = kiểm tra chung (mọi mảng). */
  category?: string;
  /** Classes inspected (unique, class display order). */
  classCodes: string[];
  /** Người kiểm tra (defaults to the creator's display name). */
  inspector: string;
  note?: string;
  createdBy: string; // uid
  createdByName: string;
  createdAt: string;
  updatedBy?: string; // email
  updatedAt?: string;
  deletedAt?: string; // soft delete
  deletedBy?: string;
  deleteReason?: string;
  /** Revision (optimistic concurrency, like incidents). Absent = 0. */
  rev?: number;
}
```

### 3.2 `src/lib/constants.ts`

```ts
// import InspectionShift from "./types" in the existing type import list.

export const INSPECTION_SHIFTS: InspectionShift[] = ["Sáng", "Chiều"];

/** Mức điểm cộng hợp lệ cho điểm thưởng mới hoặc khi sửa điểm (điểm cũ ngoài thang vẫn hợp lệ nếu không sửa). */
export const REWARD_POINT_LEVELS = [1, 2, 3, 4, 5] as const;
/** Độ dài tối thiểu của "Lý do cộng điểm" (Reward.reason) khi tạo mới hoặc khi sửa lý do. */
export const REWARD_REASON_MIN_LENGTH = 5;

// Permission union – append:
  | "reward.propose" // open Điểm thưởng + create rewards; without reward.create (GVCN): own classes only, status "Mới ghi nhận", proposed = true
  | "incident.remediate" // biện pháp xử lý/khắc phục + status via POST /api/incidents/:id/feedback, any class of an accessible level
  | "inspection.manage" // ghi nhận / sửa / xóa đợt kiểm tra

// MATRIX – append:
//   ADMIN:  "reward.propose", "incident.remediate", "inspection.manage"
//   EDITOR: "reward.propose", "incident.remediate", "inspection.manage"
//   VIEWER: (unchanged)
//   GVCN:   "reward.propose"

/** Shared KPI vocabulary (REQ_V2 §13): label + tooltip used by every screen that shows these numbers. */
export type KpiTermId = "incidents" | "violationTurns" | "uniqueStudents" | "relatedStudents" | "penaltyPoints" | "rewardPoints";

export const KPI_TERMS: Record<KpiTermId, { label: string; hint: string }> = {
  incidents: {
    label: "Sự việc",
    hint: "Số lần ghi nhận nền nếp: mỗi mã sự việc (NN-…) là 1 sự việc, dù liên quan 1 hay nhiều học sinh.",
  },
  violationTurns: {
    label: "Lượt vi phạm",
    hint: "Lỗi tính theo học sinh (/HS): mỗi học sinh liên quan là 1 lượt (kể cả HS chưa rõ tên). Lỗi tính theo lần (/lần): mỗi lần vi phạm là 1 lượt.",
  },
  uniqueStudents: {
    label: "Số HS vi phạm",
    hint: "Số học sinh khác nhau được ghi tên trong các sự việc – mỗi em chỉ đếm 1 lần; không gồm học sinh chưa rõ tên.",
  },
  relatedStudents: {
    label: "HS liên quan",
    hint: "Tổng lượt học sinh liên quan của các sự việc, gồm cả học sinh chưa rõ tên (một em có 2 sự việc được đếm 2 lần).",
  },
  penaltyPoints: {
    label: "Điểm trừ",
    hint: "Tổng điểm trừ theo bảng điểm lỗi: /HS = mức trừ × số học sinh; /lần = mức trừ × số lần. Không nhân đôi khi một sự việc có nhiều học sinh.",
  },
  rewardPoints: {
    label: "Điểm thưởng",
    hint: "Tổng điểm thưởng ở các trạng thái được tính vào thi đua (Cài đặt → Trạng thái điểm thưởng được tính).",
  },
};
```

`defaultLevelConfig` is **not** changed (no `earlyWarning` default in constants – the engine owns the defaults).

### 3.3 `src/lib/firestore-paths.ts`

```ts
// header comment – add:
//  inspections/{levelId}_{code}             Inspection         (canonical, incl. soft-deleted)
//  digests/{levelId}__ins__{yyyy-mm}        { levelId, kind: "ins", month, items: Inspection[] (non-deleted, week in that month), updatedAt }

// COL – add:
  inspections: "inspections",

/** Monthly inspection digest; `month` = "yyyy-mm" of the inspection's week (Monday). */
export const digestInspectionsMonthId = (levelId: LevelId, month: string) => `${levelId}__ins__${month}`;

// counterId – widen the prefix union:
export const counterId = (prefix: "NN" | "KT" | "HD" | "DKT", levelId: LevelId, yyyymmdd: string) => `${prefix}_${levelId}_${yyyymmdd}`;
```

### 3.4 `src/lib/contract.ts`

ENDPOINT MAP comment – add / change:

```
 *  POST   /api/incidents                    → IncidentCreateSchema (+notDuplicateOf) → Incident (201) (incident.create)
 *  POST   /api/incidents/:id/feedback       → GvcnFeedbackSchema (+remediation) → Incident   (incident.gvcnFeedback & own class | incident.remediate | ADMIN)
 *  POST   /api/incidents/:id/not-duplicate  → NotDuplicateSchema          → ListResponse<Incident>   (data.inspect + level; marks every pair of {id} ∪ otherIds)
 *  POST   /api/rewards                      → RewardCreateSchema (points 1–5, reason ≥ 5) → Reward (201) (reward.propose; without reward.create: own class, status forced "Mới ghi nhận", proposed)
 *  POST   /api/evidence                     → EvidenceUploadSchema        → { id } (201)             (incident.create | reward.create | reward.propose)
 *  POST   /api/inspections                  → InspectionCreateSchema      → Inspection (201)         (inspection.manage + level)
 *  PATCH  /api/inspections/:id              → InspectionUpdateSchema      → Inspection               (inspection.manage; ADMIN any, EDITOR own ≤ 24 h; baseRev → 409)
 *  DELETE /api/inspections/:id              → DeleteSchema                → OkResponse               (inspection.manage; ADMIN any, EDITOR own ≤ 24 h; soft delete)
 *  PUT    /api/settings/:level/early-warning → EarlyWarningPutSchema      → LevelConfig              (settings.manage; audit UPDATE_CONFIG)
```

Schemas (replace / add exactly):

```ts
export const IncidentCreateSchema = z.object({
  // … every existing field unchanged …
  /** "Không trùng, vẫn lưu": doc ids of existing incidents of the same level confirmed as NOT duplicates of this one. */
  notDuplicateOf: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

export const IncidentUpdateSchema = IncidentCreateSchema.omit({ levelId: true, clientRequestId: true, notDuplicateOf: true })
  .partial()
  .extend({ baseRev: zBaseRev });

export const GvcnFeedbackSchema = z
  .object({
    note: zText(1000).optional(),
    status: z.enum(["Mới ghi nhận", "Đang xử lý", "Đã đóng"]).optional(),
    /** Biện pháp xử lý / khắc phục ("" clears it). */
    remediation: zText(1000).optional(),
  })
  .refine(
    (v) => v.note !== undefined || v.status !== undefined || v.remediation !== undefined,
    "Cần nhập phản hồi, biện pháp khắc phục hoặc trạng thái",
  );

/** "Không trùng": doc ids of incidents of the same level reviewed as NOT duplicates of the incident in the URL. */
export const NotDuplicateSchema = z.object({
  otherIds: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
});
export type NotDuplicateInput = z.input<typeof NotDuplicateSchema>;

export const RewardCreateSchema = z.object({
  levelId: zLevelId,
  date: zIsoDate,
  classCode: zClassCode,
  /** Mức điểm cộng: số nguyên 1–5 (REWARD_POINT_LEVELS). */
  points: z.number().int("Mức điểm cộng là số nguyên từ 1 đến 5").min(1, "Mức điểm cộng từ 1 đến 5").max(5, "Mức điểm cộng từ 1 đến 5"),
  /** Lý do cộng điểm (bắt buộc). */
  reason: z.string().trim().min(5, "Nhập lý do cộng điểm (tối thiểu 5 ký tự)").max(500),
  reporter: zText(120).optional(),
  evidenceUrls: z.array(zUrl).max(5).default([]),
  photoIds: z.array(z.string().max(80)).max(5).default([]),
  note: zText(1000).optional(),
  /** EDITOR may only use "Mới ghi nhận" | "Đang xác minh"; "Đã xác nhận" requires reward.verify. Forced to "Mới ghi nhận" for proposals. */
  status: z.enum(["Mới ghi nhận", "Đang xác minh", "Đã xác nhận"]).default("Mới ghi nhận"),
  clientRequestId: z.string().min(8).max(64).optional(),
});

/** Edits keep legacy values valid while unchanged; the service applies the create rules to CHANGED points / reason. */
export const RewardUpdateSchema = RewardCreateSchema.omit({ levelId: true, clientRequestId: true, points: true, reason: true })
  .partial()
  .extend({
    points: z.number().positive("Điểm thưởng phải > 0").max(100).optional(),
    reason: z.string().trim().min(3, "Nhập lý do cộng điểm").max(500).optional(),
    baseRev: zBaseRev,
  });

/* ------------------------------ inspections ------------------------------ */
// Place after zBaseRev is declared.

export const InspectionCreateSchema = z.object({
  levelId: zLevelId,
  date: zIsoDate,
  /** "" = không ghi buổi. */
  shift: z.enum(["Sáng", "Chiều", ""]).optional(),
  /** Mảng kiểm tra (catalog category); "" / omitted = kiểm tra chung. */
  category: zText(200).optional(),
  /** Classes inspected (server deduplicates; each must exist and be active). */
  classCodes: z.array(zClassCode).min(1, "Chọn ít nhất 1 lớp được kiểm tra").max(300),
  /** Người kiểm tra; empty → the creator's display name. */
  inspector: zText(120).optional(),
  note: zText(1000).optional(),
  clientRequestId: z.string().min(8).max(64).optional(),
});
export type InspectionCreateInput = z.input<typeof InspectionCreateSchema>;

export const InspectionUpdateSchema = InspectionCreateSchema.omit({ levelId: true, clientRequestId: true }).partial().extend({ baseRev: zBaseRev });
export type InspectionUpdateInput = z.input<typeof InspectionUpdateSchema>;

/* ------------------------------ early warning ----------------------------- */

export const EarlyWarningPutSchema = z.object({
  risingPct: z.number().int().min(10).max(500),
  risingMinPoints: z.number().min(0).max(1000),
  risingBaselineWeeks: z.number().int().min(1).max(12),
  prolongedWeeks: z.number().int().min(2).max(12),
  seriousGroups: z.array(z.string().trim().min(1).max(60)).max(10),
  seriousMinPenalty: z.number().min(0).max(1000),
});
export type EarlyWarningPutInput = z.input<typeof EarlyWarningPutSchema>;

// ExportLogSchema.kind – add "report":
  kind: z.enum(["workbook", "html", "ranking", "gvcn", "students", "audit", "report"]),
```

### 3.5 `src/lib/client/api.ts` (area A)

```ts
incidents.notDuplicate(id: string, input: NotDuplicateInput): Promise<ListResponse<Incident>>   // POST /api/incidents/:id/not-duplicate
inspections: {
  create(input: InspectionCreateInput): Promise<Inspection>,                                     // POST /api/inspections
  update(id: string, input: InspectionUpdateInput): Promise<Inspection>,                          // PATCH /api/inspections/:id
  remove(id: string, reason: string): Promise<OkResponse>,                                        // DELETE /api/inspections/:id { reason }
}
settings.putEarlyWarning(levelId: LevelId, input: EarlyWarningPutInput): Promise<LevelConfig>    // PUT /api/settings/:level/early-warning
// RebuildDigestsResponse.results[level] gains `inspections?: number`.
```

---

## 4. Engine (area B) – exact API

Pure TS, no Firebase/React. `today` is always a parameter. Everything is re-exported from `src/lib/engine/index.ts`.
Treat `ds.inspections ?? []`. Use the existing helpers (`groupBy`, `sumBy`, `round2`, `periodMatcher`,
`elapsedWeeksInPeriod`, `contextPeriod`, `competitionRanks`, `compareClassInfo`, `naturalCompare`, `formatDayMonthVN`).

### 4.1 Filters (`filters.ts`)

`filterIncidents(ds, f)` additionally requires `(!f.group || i.group === f.group)` and
`(!f.studentId || i.students.some((s) => s.id === f.studentId))`. `filterRewards` ignores `group`/`studentId`
(same as category/error). All existing consumers (computeKpis, classStats, studentStats, weeklyTrend, heatmap…) inherit it.

### 4.2 KPI vocabulary (`analytics-core.ts`)

```ts
/** Lượt vi phạm of one incident: "/HS" → relatedStudentCount; "/lần" → occurrenceCount (≥ 1). */
export function violationTurnsOf(i: Pick<Incident, "unit" | "relatedStudentCount" | "occurrenceCount">): number;

export interface Kpis { /* existing fields */ violationTurns: number }      // Σ violationTurnsOf(filtered incidents)
export interface IssueStat { /* existing fields */ violationTurns: number }
export interface ClassStat { /* existing fields */ violationTurns: number }

export const NO_GROUP_LABEL = "Chưa phân nhóm";
export interface GroupStat { group: string; incidents: number; violationTurns: number; points: number; errorCodes: number }
/**
 * Incidents / turns / points per error group (snapshot `group`, NO_GROUP_LABEL when missing). With `catalog`, every
 * group of the catalog appears (zeros included) so order/colours stay stable. Sorted by naturalCompare(group),
 * NO_GROUP_LABEL last. `errorCodes` = distinct error codes with incidents.
 */
export function groupBreakdown(incidents: Incident[], catalog?: readonly CatalogItem[]): GroupStat[];
```

### 4.3 History charts (new `analytics-history.ts`, re-exported by `analytics.ts`)

```ts
export interface CumulativeSeries { key: string; label: string; values: number[] }
export interface CumulativePenalty { weeks: string[]; labels: string[]; series: CumulativeSeries[] }

/**
 * Cộng dồn điểm trừ by week across the school year: weeks = elapsedWeeksInPeriod(ALL_PERIOD, ds.weeks, today)
 * (holiday weeks included, value carried over); labels "dd/mm". Ignores f.period; honours grade, class, category,
 * error, group, student filters. values[k] = round2(Σ points of matching incidents with week ≤ weeks[k]).
 * - by "total" (default): one series, key "total", label `Lớp X` (class filter) | `Khối N` (grade filter) | "Toàn cấp".
 * - by "grade": one series per grade in scope (active classes), key `grade:N`, label `Khối N`.
 * - by "class": one series per class of `classCodes` (default: active classes in scope, compareClassInfo order),
 *   key `class:CODE`, label `Lớp CODE`; the class filter does not restrict these series.
 * - gradeAverage: appends one series per grade of the returned series (all grades in scope for "total"):
 *   key `avg:N`, label `TB khối N` = cumulative penalty of all active classes of grade N (same filters except
 *   classCode / studentId) ÷ number of active classes of the grade.
 */
export function cumulativePenalty(
  ds: LevelDataset,
  f: GlobalFilters,
  today: string,
  opts?: { by?: "total" | "grade" | "class"; classCodes?: readonly string[]; gradeAverage?: boolean },
): CumulativePenalty;

export interface RankHistoryClass { classCode: string; homeroomTeacher?: string; ranks: number[]; scores: number[] }
export interface RankHistory { grade: number; basis: "cumulative" | "week"; weeks: string[]; labels: string[]; classes: RankHistoryClass[] }

/**
 * Rank movement of every ACTIVE class of `grade` (population as BR-RANK-06), one point per counted elapsed week
 * (counted = true, weekStart ≤ Monday(today)) of the scope period, ascending:
 * scope = opts.period ?? ALL_PERIOD; a week period is widened with contextPeriod (its semester) and cut at that week.
 * - basis "cumulative" (default): score_k = baseScorePerWeek × k + counted rewards − penalties of every record whose
 *   week is in the scope and ≤ weeks[k] (holiday weeks in between included) → equals buildRanking(scope).score at the
 *   last point when the scope's last elapsed week is counted.
 * - basis "week": score_k = baseScorePerWeek + counted rewards − penalties of weeks[k] only (as classScoreSeries).
 * ranks[k] = competitionRanks over the grade at week k (1 = best). Classes in compareClassInfo order.
 * Unknown grade / no counted week → classes with empty arrays (weeks = []).
 */
export function rankHistory(ds: LevelDataset, grade: number, today: string, opts?: { basis?: "cumulative" | "week"; period?: Period }): RankHistory;
```

### 4.4 Duplicates & integrity (new `duplicates.ts`, `integrity.ts`)

```ts
export interface DuplicateDraft { date: string; classCode: string; errorCode: string; studentIds: readonly string[]; excludeId?: string }

/**
 * Possible duplicate pair: different ids, both not deleted, same date + classCode + errorCode, not reviewed
 * (neither lists the other in notDuplicateOf), and (named students intersect OR both have no named student).
 */
export function isPossibleDuplicatePair(a: Incident, b: Incident): boolean;

/** Existing incidents a draft (entry form) would duplicate, newest first; `excludeId` = the record being edited. */
export function possibleDuplicatesOf(incidents: readonly Incident[], draft: DuplicateDraft): Incident[];

export interface DuplicateGroup {
  key: string; // `${date}|${classCode}|${errorCode}|${firstId}`
  date: string;
  classCode: string;
  errorCode: string;
  issue: string;
  reason: "SAME_STUDENTS" | "NO_NAMED_STUDENTS";
  incidents: Incident[]; // oldest first (createdAt, code)
  /** Σ points − max points of the group: penalty that may be counted twice. */
  extraPoints: number;
}
/**
 * Connected components (size ≥ 2) of possible-duplicate pairs; newest date first, then class, then key.
 * reason = "NO_NAMED_STUDENTS" when no member names a student, else "SAME_STUDENTS".
 */
export function findPossibleDuplicates(incidents: readonly Incident[]): DuplicateGroup[];

export type IntegrityKind = "POINTS_FORMULA" | "STUDENT_COUNT" | "STUDENT_CLASS";
export interface IntegrityIssue { kind: IntegrityKind; incident: Incident; expected?: number; actual?: number; message: string }
/**
 * Re-check of STORED records (input must not be redacted; deleted ones skipped):
 * - POINTS_FORMULA: points ≠ computePoints({ unit, penalty, namedCount: relatedStudentCount − unnamedCount, unnamedCount, occurrenceCount })
 *   ("Điểm trừ lưu x khác công thức y").
 * - STUDENT_COUNT: relatedStudentCount ≠ students.length + unnamedCount.
 * - STUDENT_CLASS: a named student's snapshot classCode ≠ incident classCode and the record has no STUDENT_WRONG_CLASS issue.
 * Sorted by date desc, code.
 */
export function integrityIssues(incidents: readonly Incident[]): IntegrityIssue[];
```

### 4.5 Early warnings (new `early-warning.ts`)

```ts
export const DEFAULT_EARLY_WARNING: EarlyWarningConfig = {
  risingPct: 50, risingMinPoints: 6, risingBaselineWeeks: 4, prolongedWeeks: 3, seriousGroups: ["Nhóm 3", "Nhóm 4"], seriousMinPenalty: 10,
};
/** { ...DEFAULT_EARLY_WARNING, ...config.earlyWarning } (missing / invalid fields fall back to the defaults). */
export function resolveEarlyWarning(config: Pick<LevelConfig, "earlyWarning">): EarlyWarningConfig;

export type EarlyWarningKind = "REPEAT_STUDENT" | "RISING_CLASS" | "PROLONGED_ERROR" | "SERIOUS_INCIDENT";
export type WarningSeverity = "high" | "medium" | "low";
export const EARLY_WARNING_KIND_LABELS: Record<EarlyWarningKind, string> = {
  REPEAT_STUDENT: "Tái phạm", RISING_CLASS: "Tăng lỗi", PROLONGED_ERROR: "Lỗi kéo dài", SERIOUS_INCIDENT: "Sự việc nghiêm trọng",
};
export interface EarlyWarning {
  id: string; // `${kind}|${classCode}|${studentId ?? errorCode ?? incidentId ?? ""}|${week ?? ""}` – stable React key
  kind: EarlyWarningKind;
  severity: WarningSeverity;
  classCode: string;
  grade: number;
  studentId?: string;
  studentName?: string;
  errorCode?: string;
  issue?: string;
  week?: string; // reference week (Monday)
  message: string; // Vietnamese one-liner (examples below)
  evidence: { incidentIds: string[]; current?: number; baseline?: number; streakWeeks?: number; points?: number };
}

/** Reference week of a period: week mode → its key; otherwise the last calendar week of the period with weekStart ≤ Monday(today). */
export function warningReferenceWeek(ds: Pick<LevelDataset, "weeks">, period: Period, today: string): string | undefined;

/** Unified early-warning list for the filtered scope. `opts.config` overrides the level thresholds (settings preview). */
export function earlyWarnings(ds: LevelDataset, f: GlobalFilters, today: string, opts?: { config?: EarlyWarningConfig }): EarlyWarning[];
export function earlyWarningCounts(items: readonly EarlyWarning[]): Record<EarlyWarningKind, number>;
```

Rules (all honour grade/class/category/error/group/student filters; scope classes = active classes of the scope):
- **REPEAT_STUDENT** – one item per `studentStats(ds, f, today)` row with `alert !== "NONE"` (uses `config.studentAlert`,
  i.e. the existing "Ngưỡng tái phạm"). WEEKLY_RED → `high`, REPEAT → `medium`. classCode = stat.classCode;
  evidence.incidentIds = period incidents naming the student. Message: `Nguyễn Văn A (6A01): 3 lượt vi phạm trong tuần 12/10` (WEEKLY_RED) /
  `Nguyễn Văn A (6A01) tái phạm: 2 lượt trong 4 tuần` (REPEAT).
- **RISING_CLASS** – reference week R = `warningReferenceWeek`. current = penalty of the class in R; baseline = mean
  weekly penalty over the up to `risingBaselineWeeks` COUNTED calendar weeks before R (zeros included; skipped when
  there is none). Flag when current ≥ risingMinPoints AND current ≥ baseline × (1 + risingPct/100).
  Severity `high` when current ≥ config.rag.red, else `medium`. Message: `Lớp 6A01: 18 điểm trừ tuần 12/10, tăng 125% so với TB 4 tuần trước (8)`
  (baseline 0 → `…, tăng từ 0 điểm`).
- **PROLONGED_ERROR** – per (class, errorCode): streak of consecutive COUNTED calendar weeks ending with R (holiday weeks
  skipped; the in-progress current week is skipped when it has no incident of that error yet – as `recidivism`) where
  the class has ≥ 1 incident of the error. Flag when streak ≥ prolongedWeeks; `high` when streak ≥ prolongedWeeks + 2,
  else `medium`. Message: `Lớp 6A01 mắc “Đi học muộn” (L01) 3 tuần liên tiếp`.
- **SERIOUS_INCIDENT** – each filtered period incident with status ≠ "Đã đóng" and
  (`seriousGroups.includes(i.group)` OR (`seriousMinPenalty > 0` AND `i.penalty ≥ seriousMinPenalty`)).
  "Mới ghi nhận" → `high`, "Đang xử lý" → `medium`. Message: `NN-20261020-0003 · Lớp 6A01: Bạo lực học đường (Nhóm 3, −10 điểm)`.
- Sort: severity (high, medium, low) → kind (SERIOUS_INCIDENT, REPEAT_STUDENT, RISING_CLASS, PROLONGED_ERROR) →
  naturalCompare(classCode) → id. Works on redacted datasets (GVCN: REPEAT_STUDENT only for visible students).

### 4.6 Inspection coverage (new `inspections.ts`)

```ts
export const DEFAULT_COVERAGE_MIN_RATIO = 0.6;

/**
 * Non-deleted inspections with date ≤ today in f.period (periodMatcher on week/month/semester); with f.category only
 * rounds of that Mảng or general rounds (no category); with grade/class filters only rounds touching a class of the
 * scope grade(s). errorCode / group / student filters are ignored. Sorted date desc, code desc.
 */
export function filterInspections(ds: LevelDataset, f: GlobalFilters, today: string): Inspection[];

export type CoverageStatus = "OK" | "LOW" | "NONE";
export interface CoverageRow {
  classCode: string;
  grade: number;
  homeroomTeacher?: string;
  rounds: number; // in-scope rounds whose classCodes include the class
  sessions: number; // distinct `${date}|${shift ?? ""}` of those rounds (số buổi)
  lastDate?: string;
  incidents: number; // filterIncidents(ds, { ...f, classCode: undefined, studentId: undefined }) of the class
  points: number;
  incidentsPerRound: number | null; // round2(incidents / rounds), null when rounds = 0
  gradeAvgRounds: number; // mean rounds over the active classes of the grade (round2)
  coverageRatio: number | null; // round2(rounds / gradeAvgRounds), null when gradeAvgRounds = 0
  status: CoverageStatus; // NONE: rounds = 0 while gradeAvgRounds > 0; LOW: ratio < minRatio; else OK
  highlighted: boolean; // f.classCode === classCode
}
export interface GradeCoverage { grade: number; avgRounds: number; minRounds: number; maxRounds: number; noInspections: boolean; rows: CoverageRow[] }
export interface InspectionCoverage {
  rounds: number; // in-scope rounds
  sessions: number;
  classesInspected: number;
  classesTotal: number;
  grades: GradeCoverage[]; // grades of the scope (class filter → that class's grade, population unchanged)
  flagged: CoverageRow[]; // status ≠ OK; NONE first, then ratio asc, then class
  minRatio: number;
}
export function inspectionCoverage(ds: LevelDataset, f: GlobalFilters, today: string, opts?: { minRatio?: number }): InspectionCoverage;
```

### 4.7 Fixture & tests (B)

- Do **not** change the output of `makeFixtureDataset()` (tests of every area assert its counts). Add
  `makeV2FixtureDataset()` in a new `__fixtures__/dataset-v2.ts` = base fixture + fictional `inspections` (incl. one
  deleted, one general, one per Mảng, both shifts) + extra incidents covering group "Nhóm 3", a duplicate pair, a
  reviewed pair (`notDuplicateOf`), a prolonged error (3 weeks), a rising class and one integrity defect. Phase-2 areas
  may use it in their tests.
- New tests `src/lib/engine/__tests__/v2-*.test.ts`: filters (group, student), violationTurns/KPIs, groupBreakdown,
  cumulativePenalty (total/grade/class/gradeAverage; last value = Σ points), rankHistory (cumulative last point equals
  buildRanking ranks; week basis equals classScoreSeries ranks), duplicates (pairs, reviewed pairs, components,
  extraPoints, excludeId), integrityIssues, earlyWarnings (each kind, thresholds, current-week skip, defaults vs
  config, redacted dataset), inspectionCoverage (period, category, statuses, highlighted), datasets without `inspections`.
- Update `docs/FRONTEND_API.md` ENGINE section.

---

## 5. Server (area A)

Follow `docs/SERVER_API.md` patterns: one transaction per mutation (canonical + digest + `bumpVersions` + audit),
reads before writes, `rev` + `baseRev`, Vietnamese `Errors.*`, omit empty optional fields.

### 5.1 Permissions & routes
- `POST /api/rewards` → `apiHandler({ permission: "reward.propose" })`; `POST /api/evidence` and `saveEvidence` accept
  `incident.create | reward.create | reward.propose`.
- `POST /api/incidents/:id/feedback` → `anyPermission: ["incident.gvcnFeedback", "incident.remediate"]`.
- `POST /api/incidents/:id/not-duplicate` → `permission: "data.inspect"`.
- `/api/inspections` (POST) and `/api/inspections/[id]` (PATCH, DELETE) → `permission: "inspection.manage"`.
- `PUT /api/settings/[level]/early-warning` → `permission: "settings.manage"`.

### 5.2 Inspections (`src/lib/server/inspections.ts`, digests, dataset)
- `createInspection(ctx, input)`, `updateInspection(ctx, id, patch)`, `softDeleteInspection(ctx, id, reason)`,
  `readInspection(reader, id)`, `inspectionRef(id)`, `INSPECTION_MSG`.
- Code `DKT-yyyymmdd-NNN` via `nextCode(tx, "DKT", …, COL.inspections)` (extend `ids.ts`: prefix union + 3-digit format like HD).
  Idempotency kind `"inspection"` (extend `IdempotencyKind`).
- Validation (400, Vietnamese): valid date, not in the future (`Không thể ghi nhận đợt kiểm tra ở ngày trong tương lai.`),
  inside the calendar (`calendarProblem`; on edit only when the date changes); `classCodes` deduplicated, each existing
  (`Lớp "X" không có trong danh mục.`) and active (`Lớp X đã ngừng hoạt động.` – an unchanged class on edit is allowed);
  `category` "" → omitted, otherwise must be a category of the catalog (`Mảng "X" không có trong danh mục lỗi.`);
  `shift` "" → omitted; `inspector` empty → `actorName(user)`; classCodes stored in class display order.
- Edit/delete: `assertCanEditRecord` (ADMIN any; EDITOR own ≤ 24 h), `assertBaseRev` (409 `Đợt kiểm tra đã được người khác
  cập nhật…`), soft delete (`deletedAt/deletedBy/deleteReason`, 409 if already deleted). No restore endpoint (out of scope).
- Audit: `CREATE_INSPECTION` / `UPDATE_INSPECTION` (`{ code, changes }`) / `DELETE_INSPECTION` (`{ code, reason }`), entity `"inspection"`.
  `audit-labels.ts`: `AUDIT_ACTION_META` entries (group "Đợt kiểm tra": "Ghi đợt kiểm tra" create / "Sửa đợt kiểm tra"
  update / "Xóa đợt kiểm tra" delete), `ENTITY_LABELS.inspection = "Đợt kiểm tra"`, `EXPORT_KIND_LABELS.report =
  "Báo cáo tuần/tháng"`, `GVCN_FEEDBACK` label "Phản hồi / khắc phục sự việc"; `audit-summary.ts`: one-line summaries
  (`dd/mm/yyyy · n lớp · Mảng | Kiểm tra chung`).
- Digest `digests/{level}__ins__{yyyy-mm}` (`kind: "ins"`, month of the week's Monday): `loadInspectionDigests(reader, levelId, weeks)`
  (bucket set like rewards; load before and after weeks on re-date), `rebuildInspectionDigests(levelId, { bump? })`;
  `rebuildAllDigests` includes it and `RebuildResult.inspections`.
- `buildLevelDataset`: also `getAll` the `__ins__{month}` docs of every calendar month; `inspections` = items of calendar
  weeks sorted by date then code (always set, `[]` when none; no canonical fallback query).
- `redactForGvcn`: inspections keep everything except `note` (removed for viewers without `view.allClassesDetail`).
  `redactIncident` additionally strips `remediation`, `remediationAt`, `remediationBy`.
- `reset-level` and `checkRemovedWeeks` ignore inspections (documented; inspections are not scored).

### 5.3 Rewards (`rewards.ts`, `admin/workbook-rewards.ts`, `scripts/seed.ts`)
- Create: caller with `reward.create` → unchanged rules. Caller with only `reward.propose` (GVCN) → `isGvcnOfClass` else 403
  `GVCN chỉ được đề xuất điểm thưởng cho lớp mình chủ nhiệm.`; `status` forced `"Mới ghi nhận"`; `proposed: true`.
- Update: `points` changed (≠ stored) → must be an integer in `REWARD_POINT_LEVELS`, else 400
  `Mức điểm cộng là số nguyên từ 1 đến 5 (mức cũ được giữ nếu không sửa).`; `reason` changed → trimmed length ≥
  `REWARD_REASON_MIN_LENGTH`, else 400 `Nhập lý do cộng điểm (tối thiểu 5 ký tự).`. Unchanged legacy values stay valid.
  GVCN cannot PATCH/DELETE (existing `assertCanEditRecord` → 403).
- Workbook import keeps accepting legacy points > 0 and adds a WARNING `Mức điểm cộng ngoài thang 1–5 (giữ theo file).`
  when not an integer 1–5.
- `scripts/seed.ts` demo rewards: points within 1–5, reasons ≥ 5 chars.

### 5.4 Remediation & feedback (`incidents.ts`)
- ADMIN (level access) or the GVCN of the class (`incident.gvcnFeedback`): note, status, remediation.
- Otherwise `incident.remediate` (EDITOR, level access): remediation + status; a `note` in the input → 403
  `Chỉ GVCN của lớp được ghi phản hồi GVCN.`. Anyone else → 403 `INCIDENT_MSG.feedbackForbidden`.
- `remediation` "" → removed; non-empty → stored; when it changes: `remediationBy = actorName(user)`, `remediationAt = nowIso()`.
- `gvcnNoteBy/gvcnNoteAt` are set (as today) only when the input has `note` or `status` and the caller is ADMIN or the
  class GVCN. No-op check compares `gvcnNote`, `status`, `remediation` (unchanged → nothing written, no version bump).
- Audit stays `GVCN_FEEDBACK` (`detail.changes` includes `remediation`); A relabels it "Phản hồi / khắc phục sự việc".
- Workbook import already keeps unknown fields of existing records (`incidentContent` spread) – remediation is preserved and
  counts as an app change (record skipped with the existing warning unless `overwriteAppChanges`). Add a test.

### 5.5 Duplicates (`incidents.ts`)
- Create with `notDuplicateOf`: every id must be an incident of the same level (read in the transaction; missing /
  other level → 400 `Không tìm thấy sự việc để đánh dấu “không trùng”.`); stored sorted, unique, without the own id.
- `markNotDuplicate(ctx, id, { otherIds })` (route `POST /api/incidents/:id/not-duplicate`): members = {id} ∪ otherIds
  (≤ 21, same level, else 400; soft-deleted members ignored). For every member m: `notDuplicateOf(m) ∪= members − m`;
  members whose list did not change are not written; changed ones get `rev + 1`, `updatedBy/updatedAt`, digest upsert.
  One `UPDATE_INCIDENT` audit (entityId = id, `detail: { code, notDuplicate: [codes] }`). Returns the updated incidents.

### 5.6 Early-warning settings (`admin/settings.ts`)
- `putEarlyWarning(ctx, levelId, input)`: requireLevel; next config = `{ ...current, earlyWarning: input }` saved through
  the existing `save(…)`/`saveReferenceParts` path (`__ref` + version bump + audit `UPDATE_CONFIG` with
  `detail.changes.earlyWarning { before, after }`); unchanged → no write. `putConfig` and workbook config import must keep
  `earlyWarning` (they spread the stored config – add a test).

### 5.7 Tests (A) – new files, one project id each
`v2-inspections.test.ts`, `v2-rewards.test.ts`, `v2-feedback.test.ts`, `v2-duplicates.test.ts`, `v2-settings.test.ts`
(`demo-test-v2-<name>`): permissions per role (VIEWER/GVCN 403 on inspections; EDITOR own ≤ 24 h), validation messages,
digest/dataset inclusion + redaction, rebuild, idempotency, legacy reward edit (10 points kept when unchanged), GVCN
proposal (own class OK / other class 403 / status forced / evidence upload OK), remediation rules, not-duplicate marking,
early-warning persistence. Update existing tests that create rewards with points > 5 or short reasons.

---

## 6. Screens part 1 (area C)

### 6.1 Global filters (shell + `filters-core.ts`)
- `FILTER_PARAMS` add `group: "group"`, `studentId: "student"`; `RawFilterParams`, `FilterPatch` gain `group?`,
  `studentId?`; `LEVEL_SCOPED_PARAMS` add both; `activeFilterCount` counts them; `compact()` keeps them.
- `FilterOptions` gain `groups: string[]` (distinct non-empty catalog groups, naturalCompare) and
  `students: Array<{ id: string; name: string; classCode: string; grade: number; status: StudentStatus }>` = `ds.students`
  (already role-filtered: GVCN gets own-class students only) restricted to the selected grade/class, sorted by class then name.
- Validation: unknown group / student id → ignored. Patch rules: group changed → clear errorCode whose catalog group
  differs; errorCode changed → group follows the error's group when a group is set; grade/class changed → clear
  student when the student's current class is outside the new scope. `FilterContext.dataset` = `Pick<LevelDataset, "classes" | "catalog" | "students">`.
- UI: `GroupField` (Select "Tất cả nhóm lỗi") and `StudentField` (Combobox "Tất cả học sinh", search on name + Mã HS,
  option label `Họ tên`, description `Mã HS · Lớp`) in FilterBar, FilterSheet and as removable pills in FilterChips
  ("Nhóm 3", "HS Nguyễn Văn A"). Keep the desktop row wrapping cleanly.
- Every place that rebuilds `GlobalFilters` by hand (e.g. class detail scope, cross-filter scopes) must carry `group` and `studentId`.

### 6.2 Tổng quan
- **KPI row** (6 tiles, labels/hints from `KPI_TERMS`): Sự việc (note: `n lớp phát sinh`), Lượt vi phạm, Số HS vi phạm
  (note: `+ n HS chưa rõ tên` when > 0), Điểm trừ, Điểm thưởng (existing pending note), Độ tin cậy dữ liệu. Deltas vs previous
  period like today. Spark series per tile.
- **"Theo nhóm lỗi"** card: `groupBreakdown(scope without group/error filters, ds.catalog)`; BarChart, metric toggle
  Sự việc | Lượt vi phạm | Điểm trừ; click a bar → `setFilters({ group })` (click again clears); selected bar emphasised.
- **"Điểm trừ cộng dồn"** card: `cumulativePenalty`; toggle Toàn cấp | Theo khối | Theo lớp (top 5 classes by final value +
  the filtered class); weeks of the selected period tinted like TrendCard.
- **"Cảnh báo sớm"** card next to InsightsCard: counts per kind (badges with icon + text) and the 5 first items of
  `earlyWarnings(ds, filters, today)`; GVCN: only own classes; link "Xem tất cả" → `/hanh-dong?tab=canh-bao` when `can("actions.view")`.
  Empty: "Chưa có cảnh báo trong kỳ này".
- Scope label: show ScopeBadge ("Cá nhân"/"Tập thể") where incidents are listed (top students drill, timeline items).

### 6.3 Xếp hạng (`?view=bang|bien-dong|bao-phu`, default `bang`)
- **Bảng xếp hạng**: unchanged (+ vocabulary hints).
- **Biến động xếp hạng**: one card per grade (grade quick-nav as today) with a bump chart (new kit chart
  `BumpChart` in `src/components/charts`: inverted y axis 1…N, one line per class, top 5 by latest rank + the filtered
  class highlighted, others faded and toggleable, tooltip `Tuần dd/mm: hạng X/N · điểm Y`); toggle Cộng dồn | Từng tuần
  (`rankHistory(ds, grade, today, { basis, period: filters.period })`). Empty: "Chưa có tuần nào được tính thi đua".
- **Bao phủ kiểm tra**: `inspectionCoverage(ds, filters, today)`; KPIs (Đợt kiểm tra, Số buổi, Lớp được kiểm tra x/y,
  Lớp chưa công bằng); per grade a table (cards < 640px): Lớp, GVCN, Số đợt, Số buổi, Lần gần nhất, Sự việc, Sự việc/đợt,
  So với TB khối (%), Trạng thái (badge with icon: "Đạt" / "Ít được kiểm tra" / "Chưa được kiểm tra"). Note:
  "Lớp có số đợt kiểm tra dưới 60% trung bình của khối được đánh dấu để bảo đảm công bằng khi so sánh điểm trừ."
  Empty: "Chưa ghi nhận đợt kiểm tra nào" + link to `/nhap-lieu?tab=kiem-tra` when `can("inspection.manage")`.

### 6.4 Khối & lớp
- Class detail: KPI vocabulary (`KPI_TERMS`, add Lượt vi phạm); new card "Điểm trừ cộng dồn" =
  `cumulativePenalty(ds, { period: ALL, classCode, category, errorCode, group }, today, { by: "class", classCodes: [code], gradeAverage: true })`
  (lớp vs TB khối). Class overview (no class picked): cumulative by grade.

### 6.5 Báo cáo tuần/tháng – new route `/bao-cao`
- `routes.ts`: `reports: { id: "reports", href: "/bao-cao", title: "Báo cáo tuần/tháng", shortLabel: "Báo cáo",
  description: "Báo cáo nền nếp theo tuần hoặc tháng gửi BGH, tổ khối hoặc GVCN: in, lưu PDF và xuất Excel chi tiết.",
  permission: "view.dashboard", filters: false, levelSwitcher: true }`; nav group "Tổng quan" after Báo GVCN, icon `FileText`.
- URL: period via the global params `mode` (week|month only; others coerced to week) + `key`; recipient
  `to=bgh | khoi-{grade} | lop-{classCode}`; `detail=0|1` (detail table; default 1 for khối/lớp, 0 for BGH).
- Recipients: ADMIN/EDITOR/VIEWER → "Ban Giám hiệu – {cấp}", "Tổ khối N", "GVCN lớp X". GVCN → only own classes
  (default first own class; any other `to` falls back to it).
- Document (A4, print-optimised, `@page { size: A4; margin: 12mm }` scoped style, chrome hidden): header with LogoMark +
  "TRƯỜNG NGÔI SAO HOÀNG MAI", title "BÁO CÁO NỀN NẾP TUẦN …/THÁNG …", level, "Kính gửi: …", generated date; KPI block
  (4 vocabulary numbers + Điểm thưởng, delta vs previous period); ranking of the scope (BGH: every grade, compact; khối:
  that grade; lớp: class rank X/N, Top 90 status, grade context); top issues (5) + group breakdown (HTML bars, print-safe);
  early warnings of the scope; detail table (Ngày, Mã sự việc, Lớp, Mã lỗi – Nội dung, Nhóm, Phạm vi, Đối tượng, Mã HS,
  Lượt, Điểm, Trạng thái, Khắc phục); signature block ("Người lập báo cáo" / "Xác nhận của BGH").
- Actions: "In / Lưu PDF" (`window.print`, `document.title` = file name) for everyone; "Xuất Excel chi tiết"
  (`can("excel.export")`) via `exportSimpleSheet` with the detail columns + Phản hồi GVCN, sorted date/code;
  `api.exportsLog({ levelId, kind: "report", detail: { mode, key, to, rows } })`.
- Pure model `src/components/report/lib/report-model.ts` (`parseRecipient`, `recipientOptions(profile, ds)`,
  `buildPeriodReport(ds, { period, recipient }, today)`) with unit tests; render smoke test.

### 6.6 Tests (C)
filters-core (group/student params, patch rules, level switch), nav (reports route; rewards visible to GVCN after the
permission change), overview models (KPI views, group/cumulative cards), ranking view switching + bump option builder,
coverage table model, report model (recipients per role, scope filters, GVCN fallback), render smoke tests.

---

## 7. Screens part 2 (area D)

### 7.1 Nhập liệu (`/nhap-lieu?tab=su-viec|kiem-tra`)
- Tabs "Sự việc" (default) | "Đợt kiểm tra" (shown with `can("inspection.manage")`); edit mode (`?edit=`) forces "Sự việc".
- **Duplicates**: live non-blocking notice when date + class + error (+ students) match
  `possibleDuplicatesOf(ds.incidents, draft)`: "Có thể trùng với NN-… (người ghi, giờ ghi, HS)". On save with matches →
  dialog "Có thể trùng sự việc đã ghi" listing them (Xem → IncidentDetailSheet) with buttons "Không trùng, vẫn lưu" (create:
  sends `notDuplicateOf` = listed ids; edit: just saves) and "Hủy". Collective vs individual labelled (ScopeBadge) in the
  dialog and in "Ghi nhận gần đây".
- **Đợt kiểm tra** (new `src/components/inspections/`): form – Ngày (default today, calendar bounds), Buổi
  (SegmentedControl Sáng | Chiều | Không ghi), Mảng (Select "Kiểm tra chung" + catalog categories), Lớp (multi-select grid
  grouped by Khối with "Chọn cả khối", "Chọn tất cả", count), Người kiểm tra (default display name), Ghi chú; "Lưu đợt
  kiểm tra" → `api.inspections.create` (clientRequestId) → toast → refresh. List "Đợt kiểm tra gần đây" (30 days, from
  `ds.inspections`): code, date, buổi, mảng, number of classes (expand to codes), inspector; Sửa / Xóa (ADMIN any, EDITOR own
  ≤ 24 h; delete needs a reason ≥ 3 chars; PATCH sends `baseRev`). Pure form model + tests.

### 7.2 Điểm thưởng
- Points picker: 5 large buttons `+1 … +5` (radiogroup, ≥ 44px); no default selection on a new reward ("Chọn mức điểm
  cộng (1–5)"); a legacy value outside 1–5 is shown as a selected extra chip "+10 (mức cũ)" and kept unless changed.
- "Lý do cộng điểm" (the `reason` field) required ≥ 5 chars with counter + existing suggestion chips; "Ghi chú thêm" optional.
- Update payload sends `points`/`reason` only when changed.
- GVCN (`reward.propose` without `reward.create`): page guard `reward.propose`; ClassPicker `restrictTo` own classes;
  status hidden (always "Mới ghi nhận"), notice "Điểm thưởng do GVCN đề xuất chỉ được tính sau khi nhà trường xác nhận.";
  list limited to own classes; no edit/delete. Badge "GVCN đề xuất" for `proposed` rewards; list filter "Đề xuất của GVCN".

### 7.3 Dữ liệu & rà soát
- New tab "Có thể trùng" (`?tab=trung-lap`, nav badge count): `findPossibleDuplicates(filterIncidents(ds, filters))`; each
  group shows its incidents (code, created time, người ghi, ScopeBadge, đối tượng, điểm) and "Có thể tính trùng −X điểm";
  actions "Không trùng" (`api.incidents.notDuplicate(first.id, { otherIds })`) and "Mở" (detail sheet; Admin deletes the
  extra record with a reason, e.g. "Trùng với NN-…").
- Tab "Chất lượng": new card "Kiểm tra công thức & dữ liệu" from `integrityIssues` (count per kind + list; "Không phát hiện
  sai lệch" when empty) and a duplicate count linking to the new tab. KPI labels from `KPI_TERMS`.

### 7.4 Báo GVCN
- Table: ScopeBadge, column "Khắc phục"; feedback dialog adds "Biện pháp xử lý / khắc phục" (GVCN own class: note + status +
  remediation; EDITOR/ADMIN: remediation + status – open from a "Khắc phục" row action). KPIs from `KPI_TERMS` incl.
  Lượt vi phạm. Copy text adds `→ Khắc phục: …`. Group/student filters are listed as ignored (like Mảng/lỗi).
- `src/lib/excel/export-report.ts` GVCN columns: add "Mã HS" (after Đối tượng) and "Biện pháp khắc phục" (after Phản hồi GVCN).

### 7.5 Incident detail widget
- Section "Xử lý / khắc phục" (text, by, at) + inline editor (Textarea + status) for `canRemediate(profile, incident)`
  (new helper in `widgets/lib/incident-access.ts`: ADMIN with level access, EDITOR with `incident.remediate`, GVCN of the
  class; never for deleted or redacted incidents) → `api.incidents.feedback({ remediation, status? })` → toast → refresh.
- Show "Không trùng với …" codes when `notDuplicateOf` is set.

### 7.6 Hành động – tab "Cảnh báo sớm" (`?tab=canh-bao`)
- `earlyWarnings(ds, filters, today)` grouped by severity; kind chips with counts (filter); each item: kind badge (icon +
  text), message, class link (`/lop?class=`), evidence (open incidents / student history), button "Tạo hành động"
  (`actions.manage`) → ActionCreateDialog prefilled: title = message, priority high→High / medium→Medium / low→Low,
  owner `gvcnOwner(classCode)` (SERIOUS_INCIDENT → `OWNER_DISCIPLINE`), deadline today + `config.actionSlaDays[priority]`,
  scopeClass, sourceWeek = reference week. Period control as in the brief tab.

### 7.7 Cài đặt – tab "Cảnh báo sớm" (`?tab=canh-bao`, settings.manage, per level)
- Draft from `resolveEarlyWarning(ds.config)`: Tăng lỗi (% tăng, điểm tối thiểu, số tuần làm nền), Lỗi kéo dài (số tuần liên
  tiếp), Sự việc nghiêm trọng (checkbox list of catalog groups + "Mức trừ từ … điểm (0 = không dùng)"), link to "Cấu hình thi
  đua → Cảnh báo học sinh" for tái phạm; live preview "Với ngưỡng này: n cảnh báo trong tuần hiện tại" via
  `earlyWarnings(ds, { period: current week }, today, { config: draft })`; SaveBar → `api.settings.putEarlyWarning`; field
  errors mapped from validation issues. `SettingsTabId` gains `"canh-bao"` (label "Cảnh báo sớm").
- `settings/lib/users.ts` `ROLE_DESCRIPTIONS`: mention that GVCN can đề xuất điểm thưởng and ghi biện pháp khắc phục for
  own classes, EDITOR can ghi đợt kiểm tra and biện pháp khắc phục.

### 7.8 Tests (D)
Entry duplicate flow model, inspection form model (selection helpers, payloads), reward form (1–5, reason ≥ 5, legacy
points, GVCN restrictions), duplicates/quality view models, GVCN report rows/copy text with remediation, incident access
(`canRemediate`), early-warning tab model (action prefill), settings early-warning draft/validation, GVCN Excel columns;
render smoke tests of new components.

---

## 8. Acceptance checklist (integrator)

1. Filters "Nhóm lỗi" and "Học sinh" work on every filtered screen, survive reload (URL), are cleared on level switch; GVCN only lists own-class students.
2. Tổng quan shows the group bar chart and the cumulative line; Xếp hạng shows the bump chart per grade; class detail shows lớp vs TB khối.
3. Saving a duplicate warns before saving; "Có thể trùng" lists groups; "Không trùng" removes them; ScopeBadge visible in lists.
4. New rewards accept only +1…+5 with a reason ≥ 5 chars; legacy rewards stay editable; GVCN proposes for own class only.
5. Codes: inspections get `DKT-…`; reports/exports carry Mã sự việc, Mã HS, Mã lớp, Mã lỗi.
6. Remediation editable by GVCN (own class), EDITOR, ADMIN; visible in detail, Báo GVCN, exports; hidden from other classes' GVCN.
7. Server enforces every new permission (VIEWER/GVCN cannot record inspections; EDITOR cannot write GVCN notes).
8. `/bao-cao` prints a clean A4 weekly/monthly report per recipient; Excel chi tiết exports the same scope; export audited.
9. Every new mutation bumps the version → other tabs refresh; rebuild digests restores `__ins__*`.
10. Early warnings list the 4 kinds with configurable thresholds (Cài đặt) on Tổng quan and Hành động.
11. Quality tab shows integrity checks; import duplicate-code errors unchanged.
12. Inspection coverage flags classes inspected < 60% of the grade average.
13. The 4 numbers (Sự việc, Lượt vi phạm, Số HS vi phạm, Điểm trừ) with identical tooltips on Tổng quan, lớp, Báo GVCN, Dữ liệu, Báo cáo.

## 9. Deployment notes
No migration and no manual step: new fields are optional, inspection digests are created by the first write, older
datasets/clients ignore unknown fields. Firestore rules unchanged (server-only access). No new composite index
(inspection rebuild uses single-field `levelId`; stale digest cleanup uses the existing `digests (levelId, kind)` index).
Out of scope: restore of deleted inspections, inspections in workbook import/export and reset-level, server-side blocking of duplicates.
