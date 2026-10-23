/** SSR smoke tests of the A4 report document and its toolbar (node environment, no DOM). */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { periodOptions } from "@/lib/engine";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { makeV2FixtureDataset } from "@/lib/engine/__fixtures__/dataset-v2";
import type { LevelDataset, Period } from "@/lib/types";
import { buildPeriodReport, recipientOptions, type Recipient } from "../lib/report-model";
import { ReportDocument } from "../report-document";
import { ReportPrintStyles, REPORT_DOC_ATTR } from "../report-print";
import { ReportToolbar } from "../report-toolbar";
import { THPT_TODAY, THPT_WEEK, makeThptDataset } from "./thpt-dataset";

const WEEK: Period = { mode: "week", key: "2026-10-19" };
const noop = () => undefined;

function doc(ds: LevelDataset, recipient: Recipient, detail: boolean, period: Period = WEEK): string {
  const report = buildPeriodReport(ds, { period, recipient }, FIXTURE_TODAY);
  return renderToStaticMarkup(createElement(ReportDocument, { report, detail, topRatio: ds.config.top90Ratio, today: FIXTURE_TODAY, preparedBy: "Người Lập Thử" }));
}

describe("ReportDocument", () => {
  it("BGH: header, title, addressee, KPI vocabulary, compact ranking, signatures – no detail by default", () => {
    const html = doc(makeV2FixtureDataset(), { kind: "bgh" }, false);
    for (const text of [
      "TRƯỜNG NGÔI SAO HOÀNG MAI",
      "BÁO CÁO NỀN NẾP TUẦN 19/10 – 25/10/2026",
      "Kính gửi:",
      "Ban Giám hiệu – Trung học cơ sở",
      "Sự việc",
      "Lượt vi phạm",
      "Số HS vi phạm",
      "Điểm trừ",
      "Điểm thưởng",
      "Xếp hạng thi đua",
      "Dẫn đầu",
      "Vấn đề nổi bật",
      "Theo nhóm lỗi",
      "Cảnh báo sớm",
      "Sự việc nghiêm trọng",
      "Người lập báo cáo",
      "Xác nhận của BGH",
      "Người Lập Thử",
      "Ngày lập",
      "21/10/2026",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain(REPORT_DOC_ATTR);
    expect(html).not.toContain("Chi tiết sự việc");
  });

  it("tổ khối with detail: grade ranking table and the incident register with identifiers", () => {
    const html = doc(makeFixtureDataset(), { kind: "grade", grade: 6 }, true, { mode: "month", key: "2026-10" });
    for (const text of ["Tổ khối 6", "Mức cảnh báo", "Chi tiết sự việc", "Mã sự việc", "Mã lỗi – Nội dung", "Mã HS", "Phạm vi", "Khắc phục", "NN-2026"]) {
      expect(html).toContain(text);
    }
  });

  it("lớp: class standing; empty level shows the empty texts", () => {
    const html = doc(makeFixtureDataset(), { kind: "class", classCode: "6A03" }, true);
    expect(html).toContain("Thứ hạng trong khối");
    expect(html).toContain("thứ hạng tính trên toàn bộ lớp của khối.");
    expect(html).not.toContain("lượt vi phạm xếp trên");
    expect(html).toContain("GVCN lớp 6A03");
    const empty = doc({ ...makeFixtureDataset(), incidents: [], rewards: [] }, { kind: "bgh" }, true);
    expect(empty).toContain("Không có sự việc trong kỳ.");
    expect(empty).toContain("Không có cảnh báo sớm trong kỳ.");
  });

  it("ships an A4 print stylesheet", () => {
    const css = renderToStaticMarkup(createElement(ReportPrintStyles));
    expect(css).toContain("size: A4");
    expect(css).toContain("margin: 12mm");
  });
});

describe("ReportToolbar", () => {
  it("renders period, recipient, detail switch and actions", () => {
    const ds = makeFixtureDataset();
    const lists = periodOptions(ds.weeks, ds.config.semesters, FIXTURE_TODAY);
    const recipients = recipientOptions({ role: "ADMIN", gvcnClasses: [] }, ds);
    const html = renderToStaticMarkup(
      createElement(ReportToolbar, {
        period: WEEK,
        periodOptions: lists,
        onMode: noop,
        onPeriodKey: noop,
        recipients,
        recipientKey: "bgh",
        onRecipient: noop,
        detail: false,
        onDetail: noop,
        onPrint: noop,
        onExport: noop,
        rows: 3,
      }),
    );
    for (const text of ["Kỳ báo cáo", "Tuần", "Tháng", "Người nhận", "Tổ khối 6", "GVCN lớp 6A01", "Kèm bảng chi tiết", "In / Lưu PDF", "Xuất Excel chi tiết"]) {
      expect(html).toContain(text);
    }
    const noExport = renderToStaticMarkup(
      createElement(ReportToolbar, {
        period: WEEK,
        periodOptions: lists,
        onMode: noop,
        onPeriodKey: noop,
        recipients: recipients.slice(0, 1),
        recipientKey: "bgh",
        onRecipient: noop,
        detail: true,
        onDetail: noop,
        onPrint: noop,
        rows: 0,
      }),
    );
    expect(noExport).not.toContain("Xuất Excel chi tiết");
  });
});

describe("THCS score bands in the document", () => {
  it("tied leaders: a leading class gets no 'Dẫn đầu khối' line, another class sees every leader", () => {
    const ds = makeFixtureDataset();
    const report = buildPeriodReport(ds, { period: WEEK, recipient: { kind: "grade", grade: 6 } }, FIXTURE_TODAY);
    const grade = report.ranking.kind === "grade" ? report.ranking.grade : undefined;
    const leaders = grade?.leaders.map((r) => r.classCode) ?? [];
    const follower = grade?.rows.find((r) => r.rank !== 1)?.classCode;
    expect(leaders.length).toBeGreaterThan(1);
    expect(follower).toBeDefined();
    const own = doc(ds, { kind: "class", classCode: leaders[1] }, false);
    expect(own).toContain("Xếp nhóm");
    expect(own).not.toContain("Dẫn đầu khối:");
    const other = doc(ds, { kind: "class", classCode: follower! }, false);
    expect(other).toContain(`Dẫn đầu khối: ${leaders.join(", ")}`);
    const bgh = doc(ds, { kind: "bgh" }, false);
    for (const label of ["Top &gt;90%", "Top 51%–90%", "Top &lt;51%", "Xếp nhóm:"]) expect(bgh).toContain(label);
    expect(bgh).not.toContain("Ngoài Top");
    // The column header already says "Khối": cells hold the number only.
    expect(bgh).toMatch(/<td class="[^"]*whitespace-nowrap[^"]*">6<\/td>/);
    expect(bgh).not.toContain(">Khối 6</td>");
    // Headers never wrap; the bands share one wide "Phân nhóm lớp" cell per grade.
    expect(bgh).toContain("Phân nhóm lớp");
    expect(bgh).toMatch(/<th class="[^"]*whitespace-nowrap[^"]*">Điểm TB<\/th>/);
  });

  it("a period without a counted week is not grouped (and does not fall back to Top 90%)", () => {
    const html = doc(makeFixtureDataset(), { kind: "bgh" }, false, { mode: "week", key: "2026-08-31" });
    expect(html).toContain("chưa xếp nhóm lớp");
    expect(html).not.toContain("Ngoài Top");
  });
});

describe("THPT: level-wide ranking in the document", () => {
  const thpt = (recipient: Recipient) => {
    const ds = makeThptDataset();
    const report = buildPeriodReport(ds, { period: THPT_WEEK, recipient }, THPT_TODAY);
    return renderToStaticMarkup(createElement(ReportDocument, { report, detail: false, topRatio: ds.config.top90Ratio, today: THPT_TODAY }));
  };

  it("BGH: one 'Toàn cấp' row with the Top 3 chips (ties included), the rule in the note", () => {
    const html = thpt({ kind: "bgh" });
    expect(html).toContain("thứ hạng tính trên toàn bộ lớp của cấp; bằng điểm: ít lượt vi phạm xếp trên, bằng cả số lượt: đồng hạng; Top 3 gồm cả các lớp đồng hạng.");
    expect(html).toMatch(/<th class="[^"]*whitespace-nowrap[^"]*">Phạm vi<\/th>/);
    expect(html).toMatch(/<td class="[^"]*whitespace-nowrap[^"]*">Toàn cấp<\/td>/);
    expect(html).toMatch(/<th class="[^"]*whitespace-nowrap[^"]*">Top 3<\/th>/);
    expect(html).toContain("Ngoài Top 90%");
    expect(html).not.toContain(">Dẫn đầu</th>");
    expect(html).not.toContain(">Khối</th>");
    for (const c of ["10A1", "11A1", "11A2", "12A1"]) expect(html).toMatch(new RegExp(`<li class="[^"]*whitespace-nowrap[^"]*">${c}<span[^>]*>100</span></li>`));
    expect(html).not.toMatch(/<li class="[^"]*">12A2<span/);
  });

  it("tổ khối: rows of the khối with level ranks n/N, caption says the ranks are toàn cấp, lượt vi phạm column", () => {
    const html = thpt({ kind: "grade", grade: 12 });
    expect(html).toContain("Khối 12: 2 lớp · điểm TB 98 · thứ hạng toàn cấp (n/6) · Top 90% toàn cấp: hạng ≤ 6 · Top 3 toàn cấp: 10A1 (100), 11A1 (100), 11A2 (100), 12A1 (100)");
    expect(html).toContain(">Hạng toàn cấp</th>");
    expect(html).toContain(">Lượt vi phạm</th>");
    expect(html).toMatch(/>3<span class="[^"]*">\/6<\/span><\/td>/);
    expect(html).toMatch(/>5<span class="[^"]*">\/6<\/span><\/td>/);
    expect(html).not.toContain(">10A1</td>");
  });

  it("GVCN: 'Thứ hạng toàn cấp', level average + lượt vi phạm, Top 3 line (or membership)", () => {
    const html = thpt({ kind: "class", classCode: "12A2" });
    expect(html).toContain("Thứ hạng toàn cấp");
    expect(html).not.toContain("Thứ hạng trong khối");
    expect(html).toContain("5/6");
    expect(html).toContain("tuần trước: 1");
    expect(html).toContain("TB toàn cấp 98,67 · 1 lượt vi phạm");
    expect(html).toContain("Top 3 toàn cấp: 10A1 (100), 11A1 (100), 11A2 (100), 12A1 (100)");
    expect(html).not.toContain("Dẫn đầu khối");
    const top = thpt({ kind: "class", classCode: "12A1" });
    expect(top).toContain("Thuộc Top 3 toàn cấp");
    expect(top).not.toContain("Top 3 toàn cấp:");
  });
});
