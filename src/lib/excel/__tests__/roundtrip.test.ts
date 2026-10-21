import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { WorkbookPayloadSchema, type WorkbookPayload } from "../../contract";
import { LEVELS } from "../../constants";
import type { LevelDataset, Reward } from "../../types";
import { exportLevelWorkbook } from "../export-workbook";
import type { BinaryInput } from "../loader";
import { parseNshmWorkbook } from "../parse-workbook";
import { parseRosterSheet } from "../parse-roster";
import { XL_COLORS } from "../sheet-writer";
import { datasetFromPayload, hasSeed, readSeed } from "./fixtures";
import { buildLegacyWorkbook } from "./legacy-workbook";

const TODAY = "2026-10-21";
const REPORTER = "Cô Giám Thị Mẫu";

function reward(code: string, date: string, classCode: string, points: number, status: Reward["status"]): Reward {
  return {
    id: `THCS_${code}`,
    code,
    levelId: "THCS",
    date,
    week: "2026-10-12",
    month: "2026-10",
    semester: "HK1",
    classCode,
    grade: Number(/^\d+/.exec(classCode)?.[0] ?? 0),
    points,
    reason: "Lớp tham gia tích cực phong trào “Lớp học xanh”",
    reporter: REPORTER,
    evidenceUrls: ["https://example.test/anh/1.jpg"],
    photoIds: [],
    note: "Đề xuất của GVCN",
    status,
    source: "app",
    createdBy: "u1",
    createdByName: REPORTER,
    createdAt: "2026-10-15T02:00:00.000Z",
  };
}

/**
 * Legacy THCS workbook → dataset → exportLevelWorkbook → parseNshmWorkbook. Assertions compare the re-import with the
 * dataset (no concrete people), so the same suite also runs on the real seed file where it exists.
 */
function roundTripSuite(load: () => Promise<BinaryInput>): void {
  let ds: LevelDataset;
  let bytes: Uint8Array;
  let back: WorkbookPayload;
  let warnings: string[];

  beforeAll(async () => {
    const { payload } = await parseNshmWorkbook(await load(), "THCS.xlsx");
    ds = datasetFromPayload(payload);
    const first = ds.classes[0].code;
    const last = ds.classes[ds.classes.length - 1].code;
    ds.rewards = [reward("KT-20261015-0001", "2026-10-15", first, 5, "Đã xác nhận"), reward("KT-20261016-0001", "2026-10-16", last, 2.5, "Đang xác minh")];
    const firstGrade = ds.classes.filter((c) => c.grade === ds.classes[0].grade);
    bytes = await exportLevelWorkbook(ds, {
      today: TODAY,
      levelName: LEVELS.THCS.name,
      periodLabel: "Tháng 10/2026",
      rankingRows: firstGrade.map((c, i) => ({
        grade: c.grade,
        classCode: c.code,
        homeroomTeacher: c.homeroomTeacher,
        base: 900,
        rewardPoints: 0,
        penaltyPoints: i,
        score: 900 - i,
        rank: i + 1,
        inTop90: i < 7,
        rag: i === 0 ? "GREEN" : "GRAY",
      })),
      studentRows: [{ id: "99090001", name: "HỌC SINH MẪU GIANG", classCode: last, incidents: 3, points: 6, errors: "Đi chân đất (3)", alert: "WEEKLY_RED" }],
    });
    ({ payload: back, warnings } = await parseNshmWorkbook(bytes, "export-THCS.xlsx"));
  });

  it("builds a meaningful dataset from the legacy file", () => {
    expect(ds.incidents.length).toBeGreaterThan(0);
    expect(ds.incidents.some((i) => i.students.length > 0)).toBe(true);
  });

  it("re-imports the same counts", () => {
    expect(back.levelId).toBe("THCS");
    expect(back.classes).toHaveLength(ds.classes.length);
    expect(back.catalog).toHaveLength(ds.catalog.length);
    expect(back.students).toHaveLength(ds.students.length);
    expect(back.incidents).toHaveLength(ds.incidents.length);
    expect(back.links).toHaveLength(ds.incidents.reduce((n, i) => n + i.students.length, 0));
    expect(back.weeks).toHaveLength(42);
    expect(back.rewards).toHaveLength(2);
    expect(() => WorkbookPayloadSchema.parse(back)).not.toThrow();
  });

  it("keeps incident values (code, date, class, error, points) and data-check labels are not legacy text", () => {
    const byCode = new Map(ds.incidents.map((i) => [i.code, i]));
    for (const row of back.incidents) {
      const src = byCode.get(row.code);
      expect(src, row.code).toBeDefined();
      expect(row.date).toBe(src?.date);
      expect(row.classCode).toBe(src?.classCode);
      expect(row.errorCode).toBe(src?.errorCode);
      expect(row.pointsInFile).toBe(src?.points);
      expect(row.scope).toBe(src?.scope);
      expect(row.legacyCheckText).toBeUndefined();
      if (src?.unit === "/lần") expect(row.occurrenceCount).toBe(src.occurrenceCount);
    }
  });

  it("keeps links, students, classes, catalog, config and rewards", () => {
    const first = ds.incidents.find((i) => i.students.length > 0);
    const link = back.links.find((l) => l.incidentCode === first?.code);
    expect(link).toMatchObject({ studentId: first?.students[0].id, studentName: first?.students[0].name, studentClass: first?.students[0].classCode });
    expect(new Set(back.students.map((s) => s.id))).toEqual(new Set(ds.students.map((s) => s.id)));
    const cls = ds.classes.find((c) => c.homeroomTeacher && c.sourceSize !== undefined);
    expect(cls).toBeDefined();
    expect(back.classes.find((c) => c.code === cls?.code)).toMatchObject({ grade: cls?.grade, homeroomTeacher: cls?.homeroomTeacher, sourceSize: cls?.sourceSize });
    for (const item of ds.catalog) {
      expect(back.catalog.find((c) => c.code === item.code)).toMatchObject({ penalty: item.penalty, unit: item.unit, issue: item.issue });
    }
    expect(back.config).toEqual({
      baseScorePerWeek: 100,
      firstWeek: "2026-08-17",
      hk1Start: "2026-08-17",
      hk1End: "2026-12-31",
      hk2Start: "2027-01-01",
      hk2End: "2027-05-31",
    });
    expect(back.rewards[1]).toMatchObject({
      code: "KT-20261016-0001",
      date: "2026-10-16",
      classCode: ds.classes[ds.classes.length - 1].code,
      points: 2.5,
      status: "Đang xác minh",
      evidence: "https://example.test/anh/1.jpg",
      reporter: REPORTER,
    });
    expect(warnings).toEqual([]);
  });

  it("writes the expected styled sheets", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Nhập liệu",
      "HS liên quan",
      "DS Học sinh",
      "Danh mục",
      "Bảng điểm lỗi",
      "Cấu hình",
      "Lịch tuần",
      "Điểm thưởng",
      "Xếp hạng",
      "BC Học sinh",
    ]);
    const ws = wb.getWorksheet("Nhập liệu");
    // Legacy layout A–X (24 columns) + Y = "Số HS không rõ tên" (only written by this app).
    expect(ws?.getRow(4).cellCount).toBe(25);
    expect(ws?.getCell("X4").value).toBe("Kiểm tra dữ liệu");
    expect(ws?.getCell("Y4").value).toBe("Số HS không rõ tên");
    expect(ws?.getCell("A4").fill).toMatchObject({ type: "pattern", fgColor: { argb: XL_COLORS.navy } });
    expect(ws?.getCell("A4").font?.bold).toBe(true);
    expect(ws?.views[0]).toMatchObject({ state: "frozen", ySplit: 4 });
    expect(ws?.autoFilter).toBeTruthy();
    expect(ws?.getCell("B5").numFmt).toBe("dd/mm/yyyy");
    expect(ws?.getCell("D5").value).toMatch(/ \| L\d{2}$/);
    expect(String(ws?.getCell("A1").value)).toContain("(THCS)");
    const ranking = wb.getWorksheet("Xếp hạng");
    expect(ranking?.getCell("I5").value).toBe("★ Thuộc Top 90%");
    expect(ranking?.getCell("J5").value).toBe("✓ Xanh – Ổn định");
    expect(wb.getWorksheet("BC Học sinh")?.getCell("G5").value).toBe("Cảnh báo đỏ");
  });

  it("the exported DS Học sinh sheet is also a valid roster", async () => {
    const roster = await parseRosterSheet(bytes, "export-THCS.xlsx");
    expect(roster.sheetName).toBe("DS Học sinh");
    expect(roster.rows).toHaveLength(ds.students.length);
  });
}

describe("exportLevelWorkbook → parseNshmWorkbook round-trip (synthetic legacy THCS)", () => {
  roundTripSuite(() => buildLegacyWorkbook("THCS"));
});

describe.skipIf(!hasSeed())("exportLevelWorkbook → parseNshmWorkbook round-trip (real THCS seed, local only)", () => {
  roundTripSuite(async () => new Uint8Array(readSeed("THCS")));
});
