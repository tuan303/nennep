/**
 * Test helpers: locate the real seed workbooks and turn a parsed WorkbookPayload into a LevelDataset
 * (mimics what the server import does, using the binding engine rules; invalid rows are skipped).
 *
 * data/seed holds REAL students' personal data and is git-ignored: it exists only on machines that were given it.
 * Tests that read it must be wrapped in `describe.skipIf(!hasSeed())` and assert counts / shapes only – never
 * copy a name, id, date of birth, phone or e-mail from it into a tracked file (see no-real-data.test.ts).
 * Use the synthetic legacy workbooks of legacy-workbook.ts for value-level assertions.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { WorkbookPayload } from "../../contract";
import { DEFAULT_5S_CODES, defaultLevelConfig, INCIDENT_STATUSES } from "../../constants";
import { isIsoDate } from "../../engine/dates";
import { buildIncidentCore } from "../../engine/scoring";
import type { CatalogItem, ClassInfo, Incident, IncidentStatus, LevelDataset, Scope, StudentLite, StudentRef } from "../../types";

export const REPO_ROOT = path.resolve(__dirname, "../../../..");
/** Real legacy workbooks (override with NSHM_SEED_DIR, e.g. to check that suites skip cleanly without them). */
export const SEED_DIR = process.env.NSHM_SEED_DIR ? path.resolve(process.env.NSHM_SEED_DIR) : path.join(REPO_ROOT, "data/seed");
export const SEED_LEVELS = ["TH", "THCS", "THPT"] as const;
export type SeedLevel = (typeof SEED_LEVELS)[number];

/** True when every real seed workbook is present (developer machines only – never in a fresh clone or CI). */
export function hasSeed(): boolean {
  return SEED_LEVELS.every((name) => existsSync(path.join(SEED_DIR, `${name}.xlsx`)));
}

export function readSeed(name: SeedLevel): Buffer {
  return readFileSync(path.join(SEED_DIR, `${name}.xlsx`));
}

const CREATED_AT = "2026-10-21T01:00:00.000Z";

function isScope(v: string | undefined): v is Scope {
  return v === "Cá nhân" || v === "Tập thể";
}

function isIncidentStatus(v: string | undefined): v is IncidentStatus {
  return (INCIDENT_STATUSES as string[]).includes(v ?? "");
}

export function datasetFromPayload(p: WorkbookPayload): LevelDataset {
  const config = defaultLevelConfig(p.levelId);
  if (p.config?.baseScorePerWeek !== undefined) config.baseScorePerWeek = p.config.baseScorePerWeek;
  if (p.config?.firstWeek) config.firstWeek = p.config.firstWeek;
  const [hk1, hk2] = config.semesters;
  if (p.config?.hk1Start) hk1.start = p.config.hk1Start;
  if (p.config?.hk1End) hk1.end = p.config.hk1End;
  if (p.config?.hk2Start) hk2.start = p.config.hk2Start;
  if (p.config?.hk2End) hk2.end = p.config.hk2End;

  const classes: ClassInfo[] = p.classes.map((c, i) => ({ ...c, levelId: p.levelId, active: true, order: i }));
  const classByCode = new Map(classes.map((c) => [c.code, c]));
  const catalog: CatalogItem[] = p.catalog.map((c) => ({ ...c, is5S: DEFAULT_5S_CODES.includes(c.code), active: true }));
  const catalogByCode = new Map(catalog.map((c) => [c.code, c]));
  const weeks = p.weeks.map((w) => ({ ...w, counted: true }));
  const students: StudentLite[] = p.students.map((s) => {
    const lite: StudentLite = { id: s.id, name: s.name, classCode: s.classCode, grade: classByCode.get(s.classCode)?.grade ?? 0, status: "ACTIVE" };
    if (s.dob) lite.dob = s.dob;
    return lite;
  });
  const byId = new Map(students.map((s) => [s.id, s]));
  const byClassName = new Map(students.map((s) => [`${s.classCode}|${s.name.toLowerCase()}`, s]));

  const incidents: Incident[] = [];
  const usedCodes = new Set<string>();
  for (const row of p.incidents) {
    const classInfo = classByCode.get(row.classCode);
    const catalogItem = catalogByCode.get(row.errorCode);
    if (!row.code || usedCodes.has(row.code) || !isIsoDate(row.date) || !classInfo || !catalogItem) continue;
    usedCodes.add(row.code);
    const refs: StudentRef[] = [];
    for (const link of p.links.filter((l) => l.incidentCode === row.code)) {
      const s = (link.studentId && byId.get(link.studentId)) || (link.studentName && byClassName.get(`${row.classCode}|${link.studentName.toLowerCase()}`));
      if (s && !refs.some((r) => r.id === s.id)) refs.push({ id: s.id, name: s.name, classCode: s.classCode });
    }
    const core = buildIncidentCore(
      {
        date: row.date,
        scope: isScope(row.scope) ? row.scope : refs.length > 0 ? "Cá nhân" : "Tập thể",
        occurrenceCount: row.occurrenceCount,
        status: isIncidentStatus(row.status) ? row.status : undefined,
        reporter: row.reporter,
        detail: row.detail,
        evidenceUrls: row.evidence && /^https?:\/\//.test(row.evidence) ? [row.evidence] : [],
      },
      { catalogItem, classInfo, students: refs, weeks, semesters: config.semesters },
    );
    incidents.push({
      ...core,
      id: `${p.levelId}_${row.code}`,
      code: row.code,
      levelId: p.levelId,
      source: "import",
      externalId: row.code,
      createdBy: "test-uid",
      createdByName: "Kiểm thử",
      createdAt: CREATED_AT,
    });
  }

  return {
    levelId: p.levelId,
    version: 1,
    generatedAt: CREATED_AT,
    config,
    classes,
    catalog,
    weeks,
    students,
    incidents,
    rewards: [],
    redacted: false,
  };
}
