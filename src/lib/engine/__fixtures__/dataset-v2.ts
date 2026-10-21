/**
 * REQ_V2 fixture = makeFixtureDataset() (unchanged, see its header) + fictional inspection rounds + 7 extra incidents.
 * Deterministic; fresh objects per call; FIXTURE_TODAY = 2026-10-21 (Wednesday of week 2026-10-19).
 *
 * Extra incidents (codes continue the per-day numbering of the base fixture, created later in the day by a second
 * fictional inspector):
 * - serious:      6A05, 2026-10-20, L35 "Bạo lực học đường" (Nhóm 3), 1 HS, "Mới ghi nhận" → SERIOUS_INCIDENT high;
 *                 also makes 6A05 a RISING_CLASS in week 2026-10-19 (12 points vs a 3-point average of the 4 weeks before).
 * - dupNamed:     6A01, 2026-10-20, L01, same student as the base record dupNamedOf → possible duplicate (SAME_STUDENTS).
 * - dupUnnamed:   6A04, 2026-10-16, L14 ("/lần", no student) like the base record dupUnnamedOf → NO_NAMED_STUDENTS.
 * - reviewed:     6A05, 2026-09-10, L14 like the base record reviewedOf, `notDuplicateOf: [reviewedOf]` → never flagged.
 * - prolonged1/2: 7A01, L14 on 2026-10-06 and 2026-10-14 (+ base 2026-10-02) → PROLONGED_ERROR 3 consecutive weeks
 *                 (09-28, 10-05, 10-12; the current week 10-19 has no L14 yet and is skipped).
 * - defect:       7A03, 2026-09-16, L11 ("/lần", 5 points) imported with stored points 10 → integrity POINTS_FORMULA.
 *
 * Inspection rounds (Người kiểm tra fictional), all in HK1:
 *   DKT-20260907-001 Sáng  kiểm tra chung        6A01 6A02 6A03 6A04 7A01 7A02 7A03
 *   DKT-20260914-001 Chiều Chuyên cần – vệ sinh  6A01 6A02 6A03 6A04 7A01 7A02
 *   DKT-20260921-001 Sáng  Học tập – truy bài    6A01 6A03 7A01 7A02
 *   DKT-20261005-001 Sáng  Bán trú – xe buýt     6A02 6A03 6A04 7A01 7A02
 *   DKT-20261012-001 Chiều Các lỗi vi phạm khác  6A01 6A03 7A01 7A02
 *   DKT-20261012-002 Chiều Chuyên cần – vệ sinh  6A02 6A04            (same session as the previous round)
 *   DKT-20261019-001 –     kiểm tra chung        6A01 6A02 6A03 6A04 7A01 7A02
 *   DKT-20261020-001 Sáng  Chuyên cần – vệ sinh  6A05 7A03            (soft-deleted)
 * → whole year: grade 6 avg 4.2 rounds, 6A05 never inspected (NONE); grade 7 avg 4.33, 7A03 1 round (LOW, ratio 0.23).
 */
import type { CatalogItem, Incident, InspectionShift, Inspection, LevelDataset, Scope, StudentRef } from "../../types";
import { compactDate, weekInfo } from "../dates";
import { buildIncidentCore } from "../scoring";
import { makeFixtureDataset } from "./dataset";

export const V2_CATEGORIES = {
  cc: "Chuyên cần – vệ sinh",
  ht: "Học tập – truy bài",
  bt: "Bán trú – xe buýt",
  khac: "Các lỗi vi phạm khác",
} as const;

/** Doc ids of the incidents driving the v2 story (extras + the base records they pair with). */
export const V2_FIXTURE_IDS = {
  serious: "THCS_NN-20261020-0006",
  dupNamed: "THCS_NN-20261020-0007",
  dupNamedOf: "THCS_NN-20261020-0004",
  dupUnnamed: "THCS_NN-20261016-0004",
  dupUnnamedOf: "THCS_NN-20261016-0002",
  reviewed: "THCS_NN-20260910-0002",
  reviewedOf: "THCS_NN-20260910-0001",
  prolonged1: "THCS_NN-20261006-0004",
  prolonged2: "THCS_NN-20261014-0004",
  prolongedBase: "THCS_NN-20261002-0003",
  defect: "THCS_NN-20260916-0003",
} as const;

/** Doc ids of the inspection rounds. */
export const V2_INSPECTION_IDS = {
  general0907: "THCS_DKT-20260907-001",
  cc0914: "THCS_DKT-20260914-001",
  ht0921: "THCS_DKT-20260921-001",
  bt1005: "THCS_DKT-20261005-001",
  khac1012: "THCS_DKT-20261012-001",
  cc1012: "THCS_DKT-20261012-002",
  general1019: "THCS_DKT-20261019-001",
  deleted1020: "THCS_DKT-20261020-001",
} as const;

const SECOND = { uid: "uid-editor2-thcs", name: "Lê Thị C" };
const FIRST = { uid: "uid-editor-thcs", name: "Nguyễn Văn Quang" };

interface ExtraSpec {
  d: string;
  c: string;
  e: string;
  /** Indexes in the class roster (ds.students order). */
  s?: number[];
  n?: number;
  scope?: Scope;
  detail?: string;
  notDuplicateOf?: string[];
  /** Stored points different from the rule (integrity defect). */
  storedPoints?: number;
  source?: Incident["source"];
}

const EXTRA: ExtraSpec[] = [
  { d: "2026-10-20", c: "6A05", e: "L35", s: [3], detail: "Xô xát với bạn cùng lớp trong giờ ăn trưa." },
  { d: "2026-10-20", c: "6A01", e: "L01", s: [6] },
  { d: "2026-10-16", c: "6A04", e: "L14", n: 1 },
  { d: "2026-09-10", c: "6A05", e: "L14", n: 1, detail: "Bàn ăn tầng 3 chưa được lau sau giờ ăn trưa.", notDuplicateOf: [V2_FIXTURE_IDS.reviewedOf] },
  { d: "2026-10-06", c: "7A01", e: "L14", n: 1 },
  { d: "2026-10-14", c: "7A01", e: "L14", n: 1 },
  { d: "2026-09-16", c: "7A03", e: "L11", n: 1, storedPoints: 10, source: "import" },
];

interface RoundSpec {
  date: string;
  shift?: InspectionShift;
  category?: string;
  classes: string[];
  inspector: string;
  note?: string;
  deleted?: boolean;
}

const ROUNDS: RoundSpec[] = [
  { date: "2026-09-07", shift: "Sáng", classes: ["6A01", "6A02", "6A03", "6A04", "7A01", "7A02", "7A03"], inspector: FIRST.name, note: "Kiểm tra đầu năm học." },
  { date: "2026-09-14", shift: "Chiều", category: V2_CATEGORIES.cc, classes: ["6A01", "6A02", "6A03", "6A04", "7A01", "7A02"], inspector: FIRST.name },
  { date: "2026-09-21", shift: "Sáng", category: V2_CATEGORIES.ht, classes: ["6A01", "6A03", "7A01", "7A02"], inspector: SECOND.name },
  { date: "2026-10-05", shift: "Sáng", category: V2_CATEGORIES.bt, classes: ["6A02", "6A03", "6A04", "7A01", "7A02"], inspector: SECOND.name },
  { date: "2026-10-12", shift: "Chiều", category: V2_CATEGORIES.khac, classes: ["6A01", "6A03", "7A01", "7A02"], inspector: FIRST.name },
  { date: "2026-10-12", shift: "Chiều", category: V2_CATEGORIES.cc, classes: ["6A02", "6A04"], inspector: SECOND.name },
  { date: "2026-10-19", classes: ["6A01", "6A02", "6A03", "6A04", "7A01", "7A02"], inspector: FIRST.name, note: "Kiểm tra chung đầu tuần." },
  { date: "2026-10-20", shift: "Sáng", category: V2_CATEGORIES.cc, classes: ["6A05", "7A03"], inspector: SECOND.name, deleted: true },
];

const pad = (n: number, len: number) => String(n).padStart(len, "0");

function statusFor(date: string): Incident["status"] {
  if (date < "2026-10-12") return "Đã đóng";
  if (date < "2026-10-19") return "Đang xử lý";
  return "Mới ghi nhận";
}

function buildExtras(ds: LevelDataset): Incident[] {
  const perDate = new Map<string, number>();
  for (const i of ds.incidents) perDate.set(i.date, (perDate.get(i.date) ?? 0) + 1);
  return EXTRA.map((spec) => {
    const catalogItem = ds.catalog.find((c: CatalogItem) => c.code === spec.e);
    const classInfo = ds.classes.find((c) => c.code === spec.c);
    if (!catalogItem || !classInfo) throw new Error(`v2 fixture spec invalid: ${spec.c} ${spec.e}`);
    const roster = ds.students.filter((s) => s.classCode === spec.c && s.status === "ACTIVE");
    const refs: StudentRef[] = (spec.s ?? []).map((idx) => {
      const s = roster[idx];
      if (!s) throw new Error(`v2 fixture student ${spec.c}#${idx} missing`);
      return { id: s.id, name: s.name, classCode: spec.c };
    });
    const scope: Scope = spec.scope ?? (refs.length === 1 ? "Cá nhân" : "Tập thể");
    const core = buildIncidentCore(
      { date: spec.d, scope, occurrenceCount: spec.n, status: statusFor(spec.d), reporter: SECOND.name, detail: spec.detail },
      { catalogItem, classInfo, students: refs, weeks: ds.weeks, semesters: ds.config.semesters },
    );
    const seq = (perDate.get(spec.d) ?? 0) + 1;
    perDate.set(spec.d, seq);
    const code = `NN-${compactDate(spec.d)}-${pad(seq, 4)}`;
    const incident: Incident = {
      ...core,
      id: `THCS_${code}`,
      code,
      levelId: "THCS",
      source: spec.source ?? "app",
      createdBy: SECOND.uid,
      createdByName: SECOND.name,
      createdAt: `${spec.d}T03:${pad(10 + seq, 2)}:00.000Z`,
    };
    if (spec.storedPoints !== undefined) incident.points = spec.storedPoints;
    if (spec.source === "import") {
      incident.externalId = `${code}-legacy`;
      incident.importBatchId = "batch-legacy-thcs";
    }
    if (spec.notDuplicateOf) incident.notDuplicateOf = [...spec.notDuplicateOf];
    return incident;
  });
}

function buildInspections(ds: LevelDataset): Inspection[] {
  const perDate = new Map<string, number>();
  return ROUNDS.map((r) => {
    const seq = (perDate.get(r.date) ?? 0) + 1;
    perDate.set(r.date, seq);
    const code = `DKT-${compactDate(r.date)}-${pad(seq, 3)}`;
    const author = r.inspector === SECOND.name ? SECOND : FIRST;
    const round: Inspection = {
      id: `THCS_${code}`,
      code,
      levelId: "THCS",
      date: r.date,
      ...weekInfo(r.date, ds.weeks, ds.config.semesters),
      classCodes: [...r.classes],
      inspector: r.inspector,
      createdBy: author.uid,
      createdByName: author.name,
      createdAt: `${r.date}T02:${pad(seq, 2)}:00.000Z`,
    };
    if (r.shift) round.shift = r.shift;
    if (r.category) round.category = r.category;
    if (r.note) round.note = r.note;
    if (r.deleted) {
      round.deletedAt = `${r.date}T09:00:00.000Z`;
      round.deletedBy = "editor2.thcs@example.test";
      round.deleteReason = "Ghi nhầm ngày kiểm tra.";
    }
    return round;
  });
}

/** Fresh v2 fixture dataset (see file header for the story). */
export function makeV2FixtureDataset(): LevelDataset {
  const ds = makeFixtureDataset();
  return { ...ds, incidents: [...ds.incidents, ...buildExtras(ds)], inspections: buildInspections(ds) };
}
