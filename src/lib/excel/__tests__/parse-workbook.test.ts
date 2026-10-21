import { beforeAll, describe, expect, it } from "vitest";
import { WorkbookPayloadSchema, type WorkbookPayload } from "../../contract";
import type { LevelId } from "../../types";
import { ExcelParseError } from "../loader";
import { parseNshmWorkbook } from "../parse-workbook";
import { hasSeed, readSeed, SEED_LEVELS } from "./fixtures";
import { buildLegacyWorkbook, LEGACY_EXPECTED, LEGACY_PEOPLE } from "./legacy-workbook";

type Parsed = { payload: WorkbookPayload; warnings: string[] };
const LEVELS = ["TH", "THCS", "THPT"] as const satisfies readonly LevelId[];

const CONFIG = {
  baseScorePerWeek: 100,
  firstWeek: "2026-08-17",
  hk1Start: "2026-08-17",
  hk1End: "2026-12-31",
  hk2Start: "2027-01-01",
  hk2End: "2027-05-31",
};

/** Invariants every parsed workbook must satisfy (synthetic or real). */
function expectValidPayload(p: WorkbookPayload, level: LevelId): void {
  expect(p.levelId).toBe(level);
  expect(() => WorkbookPayloadSchema.parse(p)).not.toThrow();
  expect(p.weeks).toHaveLength(42);
  expect(p.weeks[0]).toEqual({ weekStart: "2026-08-17", month: "2026-08", semester: "HK1" });
  expect(p.weeks[41].weekStart).toBe("2027-05-31");
  expect(p.weeks.filter((w) => w.semester === "HK2")).toHaveLength(22);
  expect(p.config).toEqual(CONFIG);
  expect(p.students.every((s) => typeof s.id === "string" && /^\d+$/.test(s.id))).toBe(true);
  expect(p.incidents.every((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.date))).toBe(true);
  expect(p.incidents.every((i) => /^L\d{2}$/.test(i.errorCode))).toBe(true);
  const classCodes = new Set(p.classes.map((c) => c.code));
  expect(p.incidents.every((i) => classCodes.has(i.classCode))).toBe(true);
  expect(p.incidents.every((i) => i.scope === undefined || i.scope === "Cá nhân" || i.scope === "Tập thể")).toBe(true);
  expect(p.rewards).toHaveLength(0);
}

/* ------------------------- synthetic legacy layouts ------------------------ */

const parsed: Partial<Record<LevelId, Parsed>> = {};
function get(level: LevelId): WorkbookPayload {
  const p = parsed[level];
  if (!p) throw new Error(`${level} not parsed`);
  return p.payload;
}

beforeAll(async () => {
  // Generic file names: the level must come from the workbook content, not the name.
  parsed.TH = await parseNshmWorkbook(await buildLegacyWorkbook("TH"), "so-nen-nep-1.xlsx");
  // ArrayBuffer input (what File.arrayBuffer() gives in the browser)
  const thcs = await buildLegacyWorkbook("THCS");
  parsed.THCS = await parseNshmWorkbook(thcs.buffer.slice(thcs.byteOffset, thcs.byteOffset + thcs.byteLength) as ArrayBuffer, "so-nen-nep-2.xlsx");
  parsed.THPT = await parseNshmWorkbook(await buildLegacyWorkbook("THPT"), "so-nen-nep-3.xlsx");
});

describe.each(LEVELS)("parseNshmWorkbook – synthetic legacy %s workbook", (level) => {
  it("detects the level and reads every sheet", () => {
    const p = get(level);
    const e = LEGACY_EXPECTED[level];
    expectValidPayload(p, level);
    expect(p.classes).toHaveLength(e.classes);
    expect(p.catalog).toHaveLength(e.catalog);
    expect(p.students).toHaveLength(e.students);
    expect(p.incidents).toHaveLength(e.incidents);
    expect(p.links).toHaveLength(e.links);
  });
});

describe("parseNshmWorkbook – legacy specifics (synthetic data)", () => {
  it("THCS: first incident sample (formula code with cached result, catalog choice)", () => {
    expect(get("THCS").incidents[0]).toEqual({
      rowNumber: 5,
      code: "NN-20260923-0001",
      date: "2026-09-23",
      classCode: "9I0",
      errorCode: "L43",
      errorText: "Đi chân đất/ không đi giày dép | Chuyên cần – vệ sinh | 2 điểm/lần | L43",
      occurrenceCount: 1,
      pointsInFile: 2,
      scope: "Cá nhân",
      reporter: LEGACY_PEOPLE.thcs.reporter,
      status: "Mới ghi nhận",
    });
  });

  it("catalog differs per level (TH L03 = 5 /lần, THCS L03 = 2 /HS)", () => {
    expect(get("TH").catalog.find((c) => c.code === "L03")).toMatchObject({ penalty: 5, unit: "/lần" });
    expect(get("THCS").catalog.find((c) => c.code === "L03")).toMatchObject({ penalty: 2, unit: "/HS" });
  });

  it("THCS: keeps hand-typed points and non-standard check texts", () => {
    const p = get("THCS");
    expect(p.incidents.find((i) => i.rowNumber === 6)?.pointsInFile).toBe(1);
    const legacy = p.incidents.map((i) => i.legacyCheckText).filter((t): t is string => !!t);
    expect(legacy).toEqual(["Không đeo khăn quàng", "Học Sinh Mẫu Dũng (tiết 2)"]);
    expect(p.incidents.find((i) => i.rowNumber === 9)?.status).toBe("Đã đóng");
    expect(p.incidents.find((i) => i.rowNumber === 11)?.classCode).toBe("6A0H"); // "6a0h" resolved against Danh mục
  });

  it("THCS: an uncalculated Mã sự việc formula is rebuilt from the date and row (with a warning)", () => {
    expect(get("THCS").incidents.find((i) => i.rowNumber === 10)?.code).toBe("NN-20261001-0006");
    expect(parsed.THCS?.warnings.some((w) => w.startsWith("Nhập liệu – dòng 10: Mã sự việc chưa được tính"))).toBe(true);
  });

  it("THCS: long GVCN text kept, links use the plain-name layout, roster uses Lớp | Họ và tên học sinh | Mã HS", () => {
    const p = get("THCS");
    const { linked, firstStudent, homeroom6A0H } = LEGACY_PEOPLE.thcs;
    expect(p.classes.some((c) => (c.homeroomTeacher?.length ?? 0) > 150)).toBe(true);
    expect(p.classes[0]).toMatchObject({ code: "6A0H", grade: 6, homeroomTeacher: homeroom6A0H.teacher, sourceSize: homeroom6A0H.sourceSize });
    expect(p.links[0]).toEqual({
      rowNumber: 5,
      incidentCode: "NN-20260923-0001",
      studentId: linked.id,
      studentName: linked.name,
      note: "Đi chân đất ngoài hành lang",
    });
    expect(p.students[0]).toEqual({ rowNumber: 5, ...firstStudent });
  });

  it("TH: combined student choice (with and without cached lookups), numeric ids, phone/email", () => {
    const p = get("TH");
    const { linked, firstStudent, homeroom } = LEGACY_PEOPLE.th;
    expect(p.links[0]).toMatchObject({ incidentCode: "NN-20261002-0001", studentId: linked.id, studentName: linked.name, studentClass: "5A6" });
    // C/E/J formulas never calculated → id, name and class come from "NAME | CLASS | dd/mm/yyyy | ID"
    expect(p.links.slice(1).map((l) => [l.incidentCode, l.studentId, l.studentName, l.studentClass])).toEqual([
      ["NN-20261005-0002", "99010001", "Học Sinh Mẫu An", "1A1"],
      ["NN-20261005-0002", "99010002", "Học Sinh Mẫu Bình", "1A1"],
    ]);
    expect(p.students[0]).toEqual({ rowNumber: 5, id: firstStudent.id, name: firstStudent.name, dob: firstStudent.dob, classCode: firstStudent.classCode });
    expect(p.classes[0]).toMatchObject({ code: "1A1", grade: 1, homeroomTeacher: homeroom.teacher, homeroomPhone: homeroom.phone, homeroomEmail: homeroom.email });
    expect(p.classes[1]).toMatchObject({ homeroomPhone: "0900000002" });
    expect(p.incidents.find((i) => i.errorCode === "L03")).toMatchObject({ occurrenceCount: 2, pointsInFile: 10 });
    expect(p.incidents.every((i) => i.scope === undefined && i.legacyCheckText === undefined)).toBe(true);
  });

  it("THPT: blank scope becomes undefined, ids from the combined choice, statuses and evidence links kept", () => {
    const p = get("THPT");
    expect(p.incidents.filter((i) => i.scope === undefined)).toHaveLength(2);
    expect(p.incidents.find((i) => i.rowNumber === 7)?.scope).toBe("Cá nhân");
    expect(p.links[0]).toMatchObject({ studentId: LEGACY_PEOPLE.thpt.linked.id, studentName: LEGACY_PEOPLE.thpt.linked.name, studentClass: "12L01" });
    expect(p.links[1]).toMatchObject({ studentId: "99120002", studentName: "HỌC SINH MẪU LONG", studentClass: "12L01" });
    expect(p.incidents.map((i) => i.status)).toEqual(["Đang xử lý", "Đã giao", "Đã đóng", undefined]);
    expect(p.incidents[0].evidence).toBe("https://example.test/anh/1.jpg");
  });

  it("reports warnings for orphan link rows and unknown incident codes", () => {
    const w = parsed.THCS?.warnings ?? [];
    expect(w).toContain("HS liên quan: 1 dòng có học sinh nhưng thiếu Mã sự việc – đã bỏ qua.");
    expect(w).toContain("HS liên quan – dòng 8: Mã sự việc NN-20261231-0099 không có trong trang “Nhập liệu”.");
  });

  it("rejects files that are not workbooks", async () => {
    await expect(parseNshmWorkbook(new TextEncoder().encode("not an xlsx"), "x.xlsx")).rejects.toBeInstanceOf(ExcelParseError);
  });
});

/* -------------------- real seed workbooks (local machines only) -------------------- */

/**
 * data/seed is git-ignored real data: these checks run only where it exists and assert counts and shapes –
 * never a concrete student, teacher, phone or e-mail (that would publish personal data in the repository).
 */
describe.skipIf(!hasSeed())("parseNshmWorkbook – real seed workbooks (counts and shapes only)", () => {
  const EXPECTED = {
    TH: { classes: 66, catalog: 42, students: 2123, incidents: 149, links: 129 },
    THCS: { classes: 50, catalog: 43, students: 1647, incidents: 154, links: 44 },
    THPT: { classes: 21, catalog: 42, students: 669, incidents: 175, links: 133 },
  } as const;
  const real: Partial<Record<LevelId, Parsed>> = {};
  const realOf = (level: LevelId): Parsed => {
    const r = real[level];
    if (!r) throw new Error(`${level} not parsed`);
    return r;
  };

  beforeAll(async () => {
    for (const level of SEED_LEVELS) real[level] = await parseNshmWorkbook(new Uint8Array(readSeed(level)), `so-nen-nep-${level.length}.xlsx`);
  });

  it.each(LEVELS)("%s: level, counts and invariants", (level) => {
    const { payload: p } = realOf(level);
    const e = EXPECTED[level];
    expectValidPayload(p, level);
    expect(p.classes).toHaveLength(e.classes);
    expect(p.catalog).toHaveLength(e.catalog);
    expect(p.students).toHaveLength(e.students);
    expect(p.incidents).toHaveLength(e.incidents);
    expect(p.links).toHaveLength(e.links);
    const studentIds = new Set(p.students.map((s) => s.id));
    expect(p.links.filter((l) => l.studentId).every((l) => /^\d+$/.test(l.studentId ?? ""))).toBe(true);
    expect(p.links.filter((l) => l.studentId && studentIds.has(l.studentId)).length).toBeGreaterThan(e.links * 0.9);
  });

  it("layout-specific shapes", () => {
    const th = realOf("TH").payload;
    expect(th.students.every((s) => s.dob === undefined || /^\d{4}-\d{2}-\d{2}$/.test(s.dob))).toBe(true);
    expect(th.classes.filter((c) => c.homeroomPhone).every((c) => /^0\d{9}$/.test(c.homeroomPhone ?? ""))).toBe(true);
    expect(th.classes.filter((c) => c.homeroomEmail).every((c) => (c.homeroomEmail ?? "").includes("@"))).toBe(true);
    expect(th.links[0].studentName && th.links[0].studentClass).toBeTruthy();

    const thcs = realOf("THCS");
    expect(thcs.payload.catalog.find((c) => c.code === "L03")).toMatchObject({ penalty: 2, unit: "/HS" });
    expect(th.catalog.find((c) => c.code === "L03")).toMatchObject({ penalty: 5, unit: "/lần" });
    expect(thcs.payload.incidents[0]).toMatchObject({ rowNumber: 5, code: "NN-20260923-0001", errorCode: "L43", pointsInFile: 2 });
    expect(thcs.payload.incidents.find((i) => i.rowNumber === 10)?.pointsInFile).toBe(1);
    const legacy = thcs.payload.incidents.map((i) => i.legacyCheckText).filter((t): t is string => !!t);
    expect(legacy).toHaveLength(25);
    expect(legacy).toContain("Không đeo khăn quàng");
    expect(legacy.some((t) => /^(ok|THIẾU HS LIÊN QUAN)$/i.test(t))).toBe(false);
    expect(thcs.payload.classes.some((c) => (c.homeroomTeacher?.length ?? 0) > 150)).toBe(true);
    expect(thcs.warnings.some((m) => m.includes("thiếu Mã sự việc"))).toBe(true);

    const thpt = realOf("THPT").payload;
    expect(thpt.incidents.filter((i) => i.scope === undefined)).toHaveLength(88);
    expect(thpt.incidents.some((i) => i.status === "Đã giao")).toBe(true);
  });
});
