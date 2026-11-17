/**
 * Email of Báo cáo tuần/tháng (pure, no emulators): subject, greeting, note escaping, KPI deltas, ranking summary per
 * level rule (THCS score bands, THPT Top 3, class standing), top issues, warnings, plan, PDF line, link and text part.
 */
import { describe, expect, it } from "vitest";
import { makeThptDataset, THPT_TODAY } from "@/components/report/__tests__/thpt-dataset";
import { buildPeriodReport, type PeriodReport, type Recipient } from "@/components/report/lib/report-model";
import type { ReportPlanContent } from "@/components/report/lib/report-plan";
import { FIXTURE_TODAY, makeFixtureDataset } from "../../engine/__fixtures__/dataset";
import { makeV2FixtureDataset } from "../../engine/__fixtures__/dataset-v2";
import type { LevelDataset, Period } from "../../types";
import {
  buildReportMail,
  issueSummary,
  kpiDelta,
  mailKpis,
  pdfLine,
  pdfState,
  planSummary,
  rankingSummary,
  REPORT_ATTACHMENT_MAX_BASE64,
  reportFooterLines,
  reportLink,
  reportMailSubject,
  shortAddressee,
  warningSummary,
  type ReportMailOptions,
} from "../mail/report-email";

const WEEK: Period = { mode: "week", key: "2026-10-19" };
const MONTH: Period = { mode: "month", key: "2026-10" };
const LINK = "https://nennep.example.edu.vn/bao-cao?level=THCS&mode=week&key=2026-10-19&to=khoi-6&detail=1";
const NO_PLAN: ReportPlanContent = { items: [] };

const report = (ds: LevelDataset, recipient: Recipient, period: Period = WEEK, today = FIXTURE_TODAY): PeriodReport =>
  buildPeriodReport(ds, { period, recipient }, today);
const opts = (over: Partial<ReportMailOptions> = {}): ReportMailOptions => ({
  link: LINK,
  senderName: "Nền nếp NSHM",
  preparedBy: "Cán bộ Thử",
  topRatio: 0.9,
  pdf: { status: "attached", fileName: "NSHM_Bao-cao_THCS_Tuan-19-10_25-10-2026_Khoi-6.pdf" },
  ...over,
});

describe("reportLink / subject / addressee", () => {
  it("links to /bao-cao with level, mode, key, recipient and detail", () => {
    expect(reportLink("https://nennep.example.edu.vn", { levelId: "THCS", mode: "week", key: "2026-10-19", to: "lop-6A01", detail: true })).toBe(
      "https://nennep.example.edu.vn/bao-cao?level=THCS&mode=week&key=2026-10-19&to=lop-6A01&detail=1",
    );
    expect(reportLink("http://localhost:3000", { levelId: "THPT", mode: "month", key: "2026-10", to: "bgh", detail: false })).toBe(
      "http://localhost:3000/bao-cao?level=THPT&mode=month&key=2026-10&to=bgh&detail=0",
    );
  });

  it("subject: level short name, period label and the short addressee", () => {
    const ds = makeFixtureDataset();
    expect(reportMailSubject(report(ds, { kind: "bgh" }))).toBe("[Nền nếp] Báo cáo nền nếp THCS – Tuần 19/10 – 25/10/2026 – Kính gửi: Ban Giám hiệu");
    expect(reportMailSubject(report(ds, { kind: "grade", grade: 6 }, MONTH))).toBe("[Nền nếp] Báo cáo nền nếp THCS – Tháng 10/2026 – Kính gửi: Tổ khối 6");
    expect(reportMailSubject(report(ds, { kind: "class", classCode: "6A03" }))).toBe(
      "[Nền nếp] Báo cáo nền nếp THCS – Tuần 19/10 – 25/10/2026 – Kính gửi: GVCN lớp 6A03",
    );
    expect(shortAddressee({ recipient: { kind: "grade", grade: 7 } })).toBe("Tổ khối 7");
  });
});

describe("summary pieces", () => {
  it("KPI deltas: fewer penalties are good, fewer rewards are bad, 0 = không đổi, none without a previous period", () => {
    expect(kpiDelta({ delta: -3, goodWhen: "down" })).toEqual({ text: "▼ −3", tone: "good" });
    expect(kpiDelta({ delta: 2.5, goodWhen: "down" })).toEqual({ text: "▲ +2,5", tone: "bad" });
    expect(kpiDelta({ delta: -5, goodWhen: "up" })).toEqual({ text: "▼ −5", tone: "bad" });
    expect(kpiDelta({ delta: 0, goodWhen: "up" })).toEqual({ text: "= không đổi", tone: "same" });
    expect(kpiDelta({ delta: undefined, goodWhen: "up" })).toBeUndefined();
    expect(mailKpis(report(makeFixtureDataset(), { kind: "bgh" })).map((k) => k.label)).toEqual(["Sự việc", "Lượt vi phạm", "Điểm trừ", "Điểm thưởng"]);
  });

  it("THCS: score bands per khối (leaders with their score, counts of the other bands, RED classes)", () => {
    const lines = rankingSummary(report(makeFixtureDataset(), { kind: "grade", grade: 6 }, MONTH), 0.9);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Khối 6 \(5 lớp, điểm TB [\d,]+\): Dẫn đầu: 6A01, 6A05 \(294\) · Top >90%: \d+ lớp · Top 51%–90%: \d+ lớp · Top <51%: \d+ lớp · Mức Đỏ: 6A03$/);
    const level = rankingSummary(report(makeV2FixtureDataset(), { kind: "bgh" }), 0.9);
    expect(level.map((l) => l.split(" (")[0])).toEqual(["Khối 6", "Khối 7"]);
  });

  it("THPT: Top 3 of the level, ties at the cut included; a khối names the Top 3 of the whole level", () => {
    const ds = makeThptDataset();
    expect(rankingSummary(report(ds, { kind: "bgh" }, WEEK, THPT_TODAY))[0]).toMatch(/^Toàn cấp \(6 lớp, điểm TB [\d,]+\): Top 3: 10A1 \(100\), 11A1 \(100\), 11A2 \(100\), 12A1 \(100\)$/);
    expect(rankingSummary(report(ds, { kind: "grade", grade: 11 }, WEEK, THPT_TODAY))).toEqual([
      "Khối 11 (2 lớp, điểm TB 100): Top 3 toàn cấp: 10A1 (100), 11A1 (100), 11A2 (100), 12A1 (100)",
    ]);
  });

  it("class: rank of its ranking group with the previous rank, score, band / Top 90% and RAG", () => {
    const [rank, standing] = rankingSummary(report(makeFixtureDataset(), { kind: "class", classCode: "6A03" }), 0.9);
    expect(rank).toMatch(/^Lớp 6A03: hạng \d+\/5 trong khối \(tuần trước: hạng \d+\) · [\d,]+ điểm thi đua \(TB khối [\d,]+\)$/);
    expect(standing).toMatch(/^Xếp nhóm: (Dẫn đầu|Top >90%|Top 51%–90%|Top <51%) · Mức cảnh báo: /);
    const [thpt, top] = rankingSummary(report(makeThptDataset(), { kind: "class", classCode: "10A2" }, WEEK, THPT_TODAY), 0.9);
    expect(thpt).toBe("Lớp 10A2: hạng 6/6 toàn cấp (tuần trước: hạng 1) · 96 điểm thi đua (TB toàn cấp 98,67)");
    expect(top).toBe("Thuộc Top 90% · Mức cảnh báo: Xanh – Ổn định");
  });

  it("a period without a counted week is not ranked", () => {
    expect(rankingSummary(report(makeFixtureDataset(), { kind: "bgh" }, { mode: "week", key: "2026-08-31" }))).toEqual([
      "Kỳ báo cáo không có tuần tính thi đua (nghỉ hoặc chưa diễn ra) – chưa xếp hạng.",
    ]);
  });

  it("top 3 issues and the early-warning count", () => {
    const r = report(makeV2FixtureDataset(), { kind: "bgh" });
    const issues = issueSummary(r);
    expect(issues).toHaveLength(3);
    expect(issues[0]).toMatch(/^L\d+ – .+: \d+ sự việc · \d+ lượt · −\d+ điểm$/);
    expect(warningSummary(r)).toMatch(/^\d+ cảnh báo sớm( \(\d+ mức cao\))? – chi tiết trong báo cáo\.$/);
    const empty = report({ ...makeFixtureDataset(), incidents: [], rewards: [] }, { kind: "bgh" });
    expect(issueSummary(empty)).toEqual([]);
    expect(warningSummary(empty)).toBe("Không có cảnh báo sớm trong kỳ.");
  });

  it("plan of the next period: items with owner / due, the note; nothing when empty", () => {
    const r = report(makeFixtureDataset(), { kind: "grade", grade: 6 });
    expect(planSummary(r, { items: [{ content: "Tổng vệ sinh lớp học", owner: "GVCN khối 6", due: "Thứ Hai" }, { content: "Chuẩn bị chào cờ" }], note: " Phối hợp Đoàn trường " })).toEqual({
      title: "Công tác phối hợp tuần mới · Tuần 26/10 – 01/11/2026",
      items: ["Tổng vệ sinh lớp học – Phụ trách: GVCN khối 6 – Thời hạn: Thứ Hai", "Chuẩn bị chào cờ"],
      note: "Phối hợp Đoàn trường",
    });
    expect(planSummary(report(makeFixtureDataset(), { kind: "bgh" }, MONTH), { items: [{ content: "Sơ kết" }] })?.title).toBe("Công tác phối hợp tháng mới · Tháng 11/2026");
    expect(planSummary(r, NO_PLAN)).toBeUndefined();
    expect(planSummary(r, { items: [], note: "  " })).toBeUndefined();
  });

  it("PDF state: attached up to the base64 limit, too large above, failed without a PDF", () => {
    expect(pdfState("A".repeat(10), "a.pdf")).toEqual({ status: "attached", fileName: "a.pdf" });
    expect(pdfState("A".repeat(REPORT_ATTACHMENT_MAX_BASE64), "a.pdf").status).toBe("attached");
    expect(pdfState("A".repeat(REPORT_ATTACHMENT_MAX_BASE64 + 1), "a.pdf")).toEqual({ status: "too-large" });
    expect(pdfState(undefined, "a.pdf")).toEqual({ status: "failed" });
    expect(pdfLine({ status: "attached", fileName: "a.pdf" })).toBe("Báo cáo đầy đủ (khổ A4) trong file PDF đính kèm: a.pdf.");
    expect(pdfLine({ status: "too-large" })).toContain("vượt quá dung lượng gửi kèm");
    expect(pdfLine({ status: "failed" })).toContain("Chưa tạo được file PDF");
  });
});

describe("buildReportMail", () => {
  const r = report(makeFixtureDataset(), { kind: "grade", grade: 6 });
  const plan: ReportPlanContent = { items: [{ content: "Tổng vệ sinh lớp học", owner: "GVCN khối 6", due: "Thứ Hai" }] };

  it("HTML: title, greeting, intro, sections, plan, PDF line, button + plain link, signature, footer", () => {
    const { subject, html } = buildReportMail(r, plan, opts());
    expect(subject).toBe("[Nền nếp] Báo cáo nền nếp THCS – Tuần 19/10 – 25/10/2026 – Kính gửi: Tổ khối 6");
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    for (const text of [
      "BÁO CÁO NỀN NẾP TUẦN 19/10 – 25/10/2026",
      "Trung học cơ sở · Kính gửi: Tổ khối 6",
      "Kính gửi Tổ khối 6,",
      "Xin gửi báo cáo nền nếp tuần 19/10 – 25/10/2026 của cấp Trung học cơ sở (phạm vi: Khối 6). So sánh với Tuần 12/10 – 18/10/2026.",
      "Chỉ số chính",
      "Lượt vi phạm",
      "so với tuần trước",
      "Xếp hạng thi đua",
      "Vấn đề nổi bật",
      "Cảnh báo sớm",
      "Công tác phối hợp tuần mới · Tuần 26/10 – 01/11/2026",
      "Tổng vệ sinh lớp học – Phụ trách: GVCN khối 6 – Thời hạn: Thứ Hai",
      "Báo cáo đầy đủ (khổ A4) trong file PDF đính kèm: NSHM_Bao-cao_THCS_Tuan-19-10_25-10-2026_Khoi-6.pdf.",
      "Xem báo cáo trên phần mềm",
      "Trân trọng,<br>Cán bộ Thử",
      ...reportFooterLines("Nền nếp NSHM", "Cán bộ Thử"),
    ]) {
      expect(html, text).toContain(text);
    }
    // The link is escaped inside attributes and text.
    expect(html).toContain('href="https://nennep.example.edu.vn/bao-cao?level=THCS&amp;mode=week&amp;key=2026-10-19&amp;to=khoi-6&amp;detail=1"');
    expect(html).not.toContain("&mode=week&key");
  });

  it("escapes the note (line breaks kept) and every report text", () => {
    const { html, text } = buildReportMail(r, NO_PLAN, opts({ note: ' <script>alert("x")</script>\nDòng 2 & "trích" ' }));
    expect(html).toContain("Lời nhắn của Cán bộ Thử:");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>Dòng 2 &amp; &quot;trích&quot;");
    expect(html).not.toMatch(/<script/i);
    expect(text).toContain('Lời nhắn của Cán bộ Thử:\n<script>alert("x")</script>\nDòng 2 & "trích"');
    const quoted = buildReportMail({ ...r, addressee: 'Tổ <khối> "6"' }, NO_PLAN, opts({ preparedBy: "A & B" })).html;
    expect(quoted).toContain("Kính gửi Tổ &lt;khối&gt; &quot;6&quot;,");
    expect(quoted).toContain("Trân trọng,<br>A &amp; B");
  });

  it("without note / plan / previous period: those parts are left out", () => {
    const first = report(makeFixtureDataset(), { kind: "bgh" }, { mode: "week", key: makeFixtureDataset().weeks[0].weekStart });
    expect(first.previousLabel).toBeUndefined();
    const { html, text } = buildReportMail(first, NO_PLAN, opts());
    expect(html).not.toContain("Lời nhắn");
    expect(html).not.toContain("Công tác phối hợp");
    expect(html).not.toContain("so với");
    expect(text).not.toContain("So sánh với");
  });

  it("says when the PDF is missing and never links a non-http URL", () => {
    expect(buildReportMail(r, NO_PLAN, opts({ pdf: { status: "too-large" } })).html).toContain("vượt quá dung lượng gửi kèm nên không được đính kèm");
    const bad = buildReportMail(r, NO_PLAN, opts({ link: "javascript:alert(1)", pdf: { status: "failed" } }));
    expect(bad.html).toContain("Chưa tạo được file PDF của báo cáo");
    expect(bad.html).not.toContain("javascript:");
    expect(bad.html).not.toContain("Xem báo cáo trên phần mềm");
    expect(bad.text).not.toContain("javascript:");
  });

  it("plain text: the same content without markup", () => {
    const { text } = buildReportMail(r, plan, opts({ note: "Nhắc nhở" }));
    expect(text).not.toMatch(/<[a-z]/i);
    for (const line of [
      "BÁO CÁO NỀN NẾP TUẦN 19/10 – 25/10/2026",
      "Kính gửi Tổ khối 6,",
      "Lời nhắn của Cán bộ Thử:\nNhắc nhở",
      "CHỈ SỐ CHÍNH",
      "- Sự việc: ",
      "XẾP HẠNG THI ĐUA\n- Khối 6 (5 lớp",
      "VẤN ĐỀ NỔI BẬT\n- L",
      "CẢNH BÁO SỚM",
      "CÔNG TÁC PHỐI HỢP TUẦN MỚI · TUẦN 26/10 – 01/11/2026\n- Tổng vệ sinh lớp học – Phụ trách: GVCN khối 6 – Thời hạn: Thứ Hai",
      `Xem báo cáo trên phần mềm: ${LINK}`,
      "Trân trọng,\nCán bộ Thử",
    ]) {
      expect(text, line).toContain(line);
    }
  });
});
