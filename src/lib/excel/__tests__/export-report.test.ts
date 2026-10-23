import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { SCHOOL_NAME } from "../../constants";
import type { Incident } from "../../types";
import {
  buildHtmlSnapshot,
  exportGvcnReport,
  exportRankingSheet,
  exportSimpleSheet,
  exportStudentList,
  incidentStudentIds,
  incidentSubjects,
  type HtmlSnapshotInput,
} from "../export-report";
import { formatGeneratedAt } from "../html-snapshot";

async function open(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  expect(bytes).toBeInstanceOf(Uint8Array);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return wb;
}

describe("exportSimpleSheet", () => {
  it("writes title, header row 4 and typed data from row 5", async () => {
    const bytes = await exportSimpleSheet(
      "Danh sách GVCN",
      [
        { header: "Lớp", key: "classCode" },
        { header: "GVCN", key: "teacher", width: 30 },
        { header: "Điểm trừ", key: "points" },
        { header: "Ngày gần nhất", key: "last" },
      ],
      [
        { classCode: "6A01", teacher: "Cô Giáo Mẫu Một", points: 12.5, last: "2026-10-20" },
        { classCode: "6A02", teacher: null, points: 0, last: null },
      ],
    );
    const wb = await open(bytes);
    const ws = wb.getWorksheet("Danh sách GVCN");
    expect(ws).toBeDefined();
    expect(ws?.getCell("A1").value).toBe("Danh sách GVCN");
    expect(String(ws?.getCell("A2").value)).toContain(SCHOOL_NAME);
    expect(ws?.getRow(4).values).toEqual([undefined, "Lớp", "GVCN", "Điểm trừ", "Ngày gần nhất"]);
    expect(ws?.getCell("C5").value).toBe(12.5);
    expect(ws?.getCell("D5").value).toEqual(new Date(Date.UTC(2026, 9, 20)));
    expect(ws?.getCell("D5").numFmt).toBe("dd/mm/yyyy");
    expect(ws?.getCell("B6").value).toBeNull();
    expect(ws?.getColumn(2).width).toBe(30);
    expect(ws?.views[0]).toMatchObject({ state: "frozen", ySplit: 4 });
  });

  it("sanitises long or invalid sheet names", async () => {
    const wb = await open(await exportSimpleSheet("Báo cáo [tuần] 12/10 – 18/10/2026: lớp 6A01 và 6A02", [{ header: "A", key: "a" }], []));
    const name = wb.worksheets[0].name;
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[[\]:/\\?*]/);
  });
});

const ctx = { levelName: "Trung học cơ sở", periodLabel: "Tháng 10/2026", today: "2026-10-21" };

function incident(over: Partial<Incident>): Incident {
  return {
    id: "THCS_NN-20261020-0001",
    code: "NN-20261020-0001",
    levelId: "THCS",
    date: "2026-10-20",
    week: "2026-10-19",
    month: "2026-10",
    semester: "HK1",
    classCode: "6A01",
    grade: 6,
    errorCode: "L04",
    category: "Chuyên cần – vệ sinh",
    issue: "Giày dép để lộn xộn",
    penalty: 2,
    unit: "/HS",
    scope: "Tập thể",
    occurrenceCount: 1,
    students: [{ id: "1", name: "Nguyễn An", classCode: "6A01" }],
    unnamedCount: 2,
    relatedStudentCount: 3,
    points: 6,
    evidenceUrls: [],
    photoIds: [],
    status: "Mới ghi nhận",
    dataCheck: "THIEU_TEN_HS",
    dataIssues: [],
    source: "app",
    createdBy: "u",
    createdByName: "u",
    createdAt: "2026-10-20T01:00:00.000Z",
    ...over,
  };
}

describe("report exports", () => {
  it("ranking, student list and GVCN report produce styled single-sheet workbooks", async () => {
    const ranking = await open(
      await exportRankingSheet(
        [
          { grade: 7, classCode: "7A01", base: 900, rewardPoints: 0, penaltyPoints: 4, score: 896, rank: 1, inTop90: true, rag: "YELLOW" },
          { grade: 6, classCode: "6A02", base: 900, rewardPoints: 5, penaltyPoints: 30, score: 875, rank: 2, inTop90: false, rag: "RED" },
          { grade: 6, classCode: "6A01", base: 900, rewardPoints: 0, penaltyPoints: 2, score: 898, rank: 1, inTop90: true, rag: "GREEN" },
        ],
        ctx,
      ),
    );
    const rws = ranking.getWorksheet("Xếp hạng");
    expect([rws?.getCell("B5").value, rws?.getCell("B6").value, rws?.getCell("B7").value]).toEqual(["6A01", "6A02", "7A01"]);
    expect(rws?.getCell("J6").value).toBe("✕ Đỏ – Cần can thiệp");

    const students = await open(
      await exportStudentList([{ id: "0123", name: "Trần Bình", classCode: "6A01", incidents: 2, points: 4, errors: "Đi học muộn (2)", alert: "REPEAT" }], ctx),
    );
    const sws = students.getWorksheet("Học sinh");
    expect(sws?.getCell("A5").value).toBe("0123");
    expect(sws?.getCell("G5").value).toBe("Tái phạm");

    const gvcn = await open(
      await exportGvcnReport({
        ...ctx,
        classCode: "6A01",
        homeroomTeacher: "Cô Giáo Mẫu Một",
        incidents: [
          incident({ remediation: "Học sinh viết bản cam kết." }),
          incident({ code: "NN-20261015-0002", date: "2026-10-15", students: [], unnamedCount: 0, gvcnNote: "Đã nhắc nhở" }),
        ],
      }),
    );
    const gws = gvcn.getWorksheet("Lớp 6A01");
    expect(gws?.getRow(4).values).toEqual([
      undefined,
      "Ngày",
      "Mã sự việc",
      "Đối tượng",
      "Mã HS",
      "Lỗi",
      "Điểm trừ",
      "Chi tiết",
      "Trạng thái",
      "Phản hồi GVCN",
      "Biện pháp khắc phục",
    ]);
    expect(gws?.getCell("B5").value).toBe("NN-20261015-0002");
    expect(gws?.getCell("C5").value).toBe("Tập thể lớp");
    expect(gws?.getCell("D5").value).toBeNull();
    expect(gws?.getCell("C6").value).toBe("Nguyễn An + 2 HS chưa rõ tên");
    expect(gws?.getCell("D6").value).toBe("1");
    expect(gws?.getCell("I5").value).toBe("Đã nhắc nhở");
    expect(gws?.getCell("J6").value).toBe("Học sinh viết bản cam kết.");
    expect(String(gws?.getCell("A2").value)).toContain("GVCN: Cô Giáo Mẫu Một");
  });

  it("THPT ranking: one table for the level sorted by rank, Lượt vi phạm column and the top 3 in row 3", async () => {
    const rows = [
      { grade: 12, classCode: "12A1", base: 100, rewardPoints: 0, penaltyPoints: 4, score: 96, rank: 3, inTop90: true, rag: "GREEN", violationTurns: 1 },
      { grade: 11, classCode: "11A1", base: 100, rewardPoints: 0, penaltyPoints: 0, score: 100, rank: 1, inTop90: true, rag: "GREEN", violationTurns: 0 },
      { grade: 10, classCode: "10A2", base: 100, rewardPoints: 0, penaltyPoints: 4, score: 96, rank: 4, inTop90: true, rag: "GREEN", violationTurns: 2 },
      { grade: 10, classCode: "10A1", base: 100, rewardPoints: 0, penaltyPoints: 0, score: 100, rank: 1, inTop90: true, rag: "GREEN", violationTurns: 0 },
    ];
    const thpt = { levelName: "Trung học phổ thông", periodLabel: "Tuần 19/10/2026", today: "2026-10-21" };
    for (const context of [thpt, { ...thpt, levelId: "THPT" as const }]) {
      const ws = (await open(await exportRankingSheet(rows, context))).getWorksheet("Xếp hạng");
      expect((ws?.getRow(4).values as unknown[]).slice(1)).toEqual([
        "Khối",
        "Lớp",
        "GVCN",
        "Điểm nền",
        "Điểm thưởng",
        "Điểm trừ",
        "Điểm thi đua",
        "Lượt vi phạm",
        "Hạng",
        "Top 90%",
        "Đánh giá (RAG)",
      ]);
      expect([5, 6, 7, 8].map((r) => ws?.getCell(r, 2).value)).toEqual(["10A1", "11A1", "12A1", "10A2"]);
      expect([5, 6, 7, 8].map((r) => ws?.getCell(r, 8).value)).toEqual([0, 0, 1, 2]);
      expect(String(ws?.getCell("A2").value)).toContain("Xếp hạng chung toàn cấp (không chia khối)");
      expect(ws?.getCell("A3").value).toBe("★ Top 3 toàn cấp: 10A1 (hạng 1), 11A1 (hạng 1), 12A1 (hạng 3).");
    }
    // THCS keeps the per-khối layout.
    const thcs = (await open(await exportRankingSheet(rows, ctx))).getWorksheet("Xếp hạng");
    expect((thcs?.getRow(4).values as unknown[]).includes("Lượt vi phạm")).toBe(false);
    expect([5, 6, 7, 8].map((r) => thcs?.getCell(r, 2).value)).toEqual(["10A1", "10A2", "11A1", "12A1"]);
    expect(String(thcs?.getCell("A2").value)).toContain("Xếp hạng trong từng khối");
    expect(thcs?.getCell("A3").value).toBeNull();
  });

  it("describes incident subjects and their Mã HS", () => {
    expect(incidentSubjects({ students: [], unnamedCount: 3 })).toBe("3 HS chưa rõ tên");
    expect(incidentStudentIds({ students: [] })).toBe("");
    expect(
      incidentStudentIds({
        students: [
          { id: "HS0001", name: "Nguyễn Văn A", classCode: "6A01" },
          { id: "HS0002", name: "Trần Thị B", classCode: "6A01" },
        ],
      }),
    ).toBe("HS0001, HS0002");
  });
});

const snapshotInput: HtmlSnapshotInput = {
  schoolName: SCHOOL_NAME,
  levelName: "Trung học cơ sở",
  periodLabel: "Tháng 10/2026",
  generatedAt: "2026-10-21T03:05:00.000Z",
  kpis: [
    { label: "Sự việc", value: "154" },
    { label: "Độ tin cậy dữ liệu", value: "82%" },
  ],
  rankingByGrade: [
    {
      grade: 7,
      rows: [{ rank: 1, classCode: "7A01", score: 896, penalty: 4, reward: 0, inTop90: true, rag: "YELLOW" }],
    },
    {
      grade: 6,
      rows: [
        { rank: 2, classCode: "<script>alert(1)</script>", score: 875.5, penalty: 30, reward: 5, inTop90: false, rag: "RED" },
        { rank: 1, classCode: "6A01", score: 1898, penalty: 2, reward: 0, inTop90: true, rag: "GREEN" },
      ],
    },
  ],
  topIssues: [
    { issue: "Đi học muộn", incidents: 12, points: 24 },
    { issue: "Đồng phục \"sai\" & thiếu", incidents: 5, points: 10 },
  ],
  topClasses: [{ classCode: "9I0", incidents: 4, points: 14 }],
};

describe("buildHtmlSnapshot", () => {
  const html = buildHtmlSnapshot(snapshotInput);

  it("is a self-contained document without scripts or external resources", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="vi">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html).not.toMatch(/\bon[a-z]+\s*=/i); // no inline event handlers
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<link\b|<img\b|<iframe\b|@import|url\(/i);
  });

  it("escapes user content and renders Vietnamese labels", () => {
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Đồng phục &quot;sai&quot; &amp; thiếu");
    expect(html).toContain("Báo cáo nền nếp Trung học cơ sở");
    expect(html).toContain("Xếp hạng thi đua theo khối");
    expect(html).toContain("Top 90%");
    expect(html).toContain("Ngoài Top 90%");
    expect(html).toContain("Đỏ");
    expect(html).toContain("21/10/2026 10:05");
    expect(html).toContain("1.898"); // vi-VN thousands separator
    expect(html).toContain("875,5");
  });

  it("orders grades and ranks", () => {
    expect(html.indexOf("Khối 6")).toBeLessThan(html.indexOf("Khối 7"));
    expect(html.indexOf(">6A01<")).toBeLessThan(html.indexOf("&lt;script&gt;"));
  });

  it("THPT: one Toàn cấp card (grade 0) with Lượt vi phạm and the top 3", () => {
    const thpt = buildHtmlSnapshot({
      ...snapshotInput,
      levelName: "Trung học phổ thông",
      rankingLayout: { scope: "level", tieBreak: "violationTurns", topCount: 3 },
      rankingByGrade: [
        {
          grade: 0,
          rows: [
            { rank: 3, classCode: "12A1", score: 96, penalty: 4, reward: 0, inTop90: true, rag: "GREEN", violationTurns: 1 },
            { rank: 1, classCode: "10A1", score: 100, penalty: 0, reward: 0, inTop90: true, rag: "GREEN", violationTurns: 0 },
            { rank: 1, classCode: "11A1", score: 100, penalty: 0, reward: 0, inTop90: true, rag: "GREEN", violationTurns: 0 },
            { rank: 4, classCode: "11A2", score: 96, penalty: 4, reward: 0, inTop90: true, rag: "GREEN", violationTurns: 2 },
          ],
        },
      ],
    });
    expect(thpt).toContain("Xếp hạng thi đua toàn cấp");
    expect(thpt).toContain("<h3>Toàn cấp<small>4 lớp</small></h3>");
    expect(thpt).not.toContain("Khối 0");
    expect(thpt).toContain("lớp ít lượt vi phạm hơn xếp trên");
    expect(thpt).toContain("Top 3 toàn cấp: 10A1 (hạng 1), 11A1 (hạng 1), 12A1 (hạng 3).");
    expect(thpt).toContain('<td class="num score">96</td><td class="num">1</td>');
    expect(html).not.toContain("Lượt vi phạm");
  });

  it("handles empty input gracefully", () => {
    const empty = buildHtmlSnapshot({ ...snapshotInput, kpis: [], rankingByGrade: [], topIssues: [], topClasses: [] });
    expect(empty).toContain("Chưa có dữ liệu xếp hạng.");
    expect(empty).toContain("Không có sự việc trong kỳ.");
  });

  it("formats generatedAt", () => {
    expect(formatGeneratedAt("2026-10-21")).toBe("21/10/2026");
    expect(formatGeneratedAt("hôm nay")).toBe("hôm nay");
  });
});
