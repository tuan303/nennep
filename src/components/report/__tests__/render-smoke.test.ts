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
