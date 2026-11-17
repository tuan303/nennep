/**
 * Email of Báo cáo tuần/tháng (pure – unit-tested in __tests__/report-mail-email.test.ts): a short summary of the
 * report model (KPIs with the change vs the previous period, ranking of the scope, top 3 issues, number of early
 * warnings, "Công tác phối hợp" of the next period) + the PDF attachment line + a button to the report in the app.
 *
 * HTML: the shared layout of html.ts (brand bar, white card, footer – Outlook-safe tables, inline styles), every
 * dynamic text escaped. The plain-text part carries the same content.
 */
import type { PeriodReport, ReportGradeRanking, ReportKpi, ReportKpiId } from "@/components/report/lib/report-model";
import { nextPeriodLabel, planPeriodOf, planTitle, textLines, type ReportPlanContent } from "@/components/report/lib/report-plan";
import { previousPeriodNoun } from "@/components/ranking/lib/ranking-view";
import { fmtNumber, fmtTopLabel } from "../../client/format";
import { LEVELS, RAG_LABELS, SCHOOL_NAME } from "../../constants";
import { LEVEL_RANKING_GROUP, SCORE_BAND_ORDER, scoreBandLabel } from "../../engine";
import type { LevelId, RankingRow } from "../../types";
import { buttonHtml, emailDocumentHtml, escapeHtml, paragraphHtml, safeHttpUrl, subjectLine, textHtml } from "./html";

/** Subject prefix of every email of the app. */
const SUBJECT_PREFIX = "[Nền nếp]";

/** KPIs of the email (the PDF has all of them). */
const MAIL_KPIS: readonly ReportKpiId[] = ["incidents", "violationTurns", "penaltyPoints", "rewardPoints"];
const TOP_ISSUES = 3;

/**
 * Largest PDF attachment, in base64 characters (≈ 2.25 MB of PDF): the Graph sendMail request (JSON + base64) must stay
 * below ~3.5 MB. A larger PDF is not attached (the email says so).
 */
export const REPORT_ATTACHMENT_MAX_BASE64 = 3_000_000;

/** What became of the PDF: attached (file name), too large to attach, or not rendered (last attempt). */
export type ReportPdfState = { status: "attached"; fileName: string } | { status: "too-large" } | { status: "failed" };

/** What to say about the PDF: attached when its base64 form is small enough, too large, or not rendered (undefined). */
export function pdfState(base64: string | undefined, fileName: string, maxBase64: number = REPORT_ATTACHMENT_MAX_BASE64): ReportPdfState {
  if (base64 === undefined) return { status: "failed" };
  return base64.length <= maxBase64 ? { status: "attached", fileName } : { status: "too-large" };
}

export interface ReportMailOptions {
  /** Deep link to the report in the app (reportLink). */
  link: string;
  /** "Lời nhắn" of the sender (plain text). */
  note?: string;
  /** Display name of the sending mailbox (MAIL_SENDER_NAME). */
  senderName: string;
  /** Display name of the person who sent the report (signature). */
  preparedBy: string;
  /** "Trung học cơ sở" – defaults to report.levelName. */
  levelName?: string;
  /** config.top90Ratio of the level (label "Top 90%"). */
  topRatio?: number;
  pdf: ReportPdfState;
}

export interface ReportMailContent {
  subject: string;
  html: string;
  text: string;
}

/* --------------------------------- links ---------------------------------- */

/**
 * /bao-cao?level&mode&key&to&detail – the report screen reads mode / key / to / detail from the URL; `level` makes
 * the app open that level (DataProvider → readLinkedLevel) when the reader can access it.
 */
export function reportLink(baseUrl: string, spec: { levelId: LevelId; mode: "week" | "month"; key: string; to: string; detail: boolean }): string {
  const q = new URLSearchParams({ level: spec.levelId, mode: spec.mode, key: spec.key, to: spec.to, detail: spec.detail ? "1" : "0" });
  return `${baseUrl}/bao-cao?${q.toString()}`;
}

/* ------------------------------ text helpers ------------------------------ */

const lowerFirst = (s: string) => s.charAt(0).toLocaleLowerCase("vi-VN") + s.slice(1);

/**
 * "Ban Giám hiệu" | "Tổ khối 6" | "GVCN lớp 6A01": the subject and ReportJobPayload.addressee (mail log, batch
 * progress). The greeting uses report.addressee ("Ban Giám hiệu – Trung học cơ sở", "GVCN lớp 6A01 – thầy/cô …").
 */
export function shortAddressee(report: Pick<PeriodReport, "recipient">): string {
  const r = report.recipient;
  if (r.kind === "bgh") return "Ban Giám hiệu";
  if (r.kind === "grade") return `Tổ khối ${r.grade}`;
  return `GVCN lớp ${r.classCode}`;
}

/** "[Nền nếp] Báo cáo nền nếp THCS – Tuần 19/10 – 25/10/2026 – Kính gửi: Tổ khối 6". */
export function reportMailSubject(report: Pick<PeriodReport, "levelId" | "periodLabel" | "recipient">): string {
  return subjectLine(`${SUBJECT_PREFIX} Báo cáo nền nếp ${LEVELS[report.levelId].short} – ${report.periodLabel} – Kính gửi: ${shortAddressee(report)}`);
}

/* ------------------------------ summary model ----------------------------- */

export type DeltaTone = "good" | "bad" | "same";

/** "▲ +3" / "▼ −2" / "= không đổi" (tone: lower penalties / higher rewards are good); undefined without a previous period. */
export function kpiDelta(k: Pick<ReportKpi, "delta" | "goodWhen">): { text: string; tone: DeltaTone } | undefined {
  if (k.delta === undefined) return undefined;
  if (k.delta === 0) return { text: "= không đổi", tone: "same" };
  const up = k.delta > 0;
  return { text: `${up ? "▲ +" : "▼ −"}${fmtNumber(Math.abs(k.delta))}`, tone: up === (k.goodWhen === "up") ? "good" : "bad" };
}

export function mailKpis(report: Pick<PeriodReport, "kpis">): ReportKpi[] {
  return MAIL_KPIS.flatMap((id) => report.kpis.filter((k) => k.id === id));
}

const classList = (rows: readonly RankingRow[]) => rows.map((r) => r.classCode).join(", ");
/** "6A01, 6A02 (103)" – leaders sharing the top score. */
const tiedText = (rows: readonly RankingRow[]) => (rows.length ? `${classList(rows)} (${fmtNumber(rows[0].score)})` : "–");
/** "10A1 (100), 11A1 (100), 12A1 (99)". */
const scoredText = (rows: readonly RankingRow[]) => (rows.length ? rows.map((r) => `${r.classCode} (${fmtNumber(r.score)})`).join(", ") : "–");

/** One line of a ranking group: leaders (Top N / Dẫn đầu) or the score bands (THCS), then the RED classes. */
export function gradeSummary(g: ReportGradeRanking): string {
  const head = `${g.label} (${fmtNumber(g.classCount)} lớp, điểm TB ${fmtNumber(g.avgScore)})`;
  const parts: string[] = [];
  const bands = g.bands;
  if (bands) {
    const groups = bands.groups;
    if (!groups) parts.push("chưa xếp nhóm (kỳ không có tuần tính thi đua)");
    else
      parts.push(
        ...SCORE_BAND_ORDER.map((b) =>
          b === "LEADER" ? `${scoreBandLabel(b, bands.rule)}: ${tiedText(groups.LEADER)}` : `${scoreBandLabel(b, bands.rule)}: ${fmtNumber(groups[b].length)} lớp`,
        ),
      );
  } else {
    // A khối inside a level-wide table (THPT): its leaders are those of the whole level.
    const label = g.rule.scope === "level" && g.grade !== LEVEL_RANKING_GROUP ? `${g.leadersLabel} toàn cấp` : g.leadersLabel;
    parts.push(`${label}: ${g.leadersAllTied ? `tất cả ${fmtNumber(g.rankCount)} lớp đồng hạng 1` : scoredText(g.leaders)}`);
  }
  if (g.red.length) parts.push(`Mức Đỏ: ${classList(g.red)}`);
  return `${head}: ${parts.join(" · ")}`;
}

function bandOfClass(g: ReportGradeRanking, classCode: string): string | undefined {
  const bands = g.bands;
  const band = SCORE_BAND_ORDER.find((b) => bands?.groups?.[b].some((r) => r.classCode === classCode));
  return band && bands ? scoreBandLabel(band, bands.rule) : undefined;
}

/** Lines of "Xếp hạng thi đua" for the scope of the report. */
export function rankingSummary(report: Pick<PeriodReport, "ranking" | "period">, topRatio?: number): string[] {
  const { ranking } = report;
  if (ranking.countedWeeks === 0) return ["Kỳ báo cáo không có tuần tính thi đua (nghỉ hoặc chưa diễn ra) – chưa xếp hạng."];
  if (ranking.kind === "level") return ranking.grades.length ? ranking.grades.map(gradeSummary) : ["Chưa có lớp đang hoạt động."];
  if (ranking.kind === "grade") return ranking.grade ? [gradeSummary(ranking.grade)] : ["Khối không có lớp đang hoạt động."];
  const s = ranking.standing;
  if (!s) return ["Lớp không được xếp hạng (lớp ngừng hoạt động hoặc không thuộc cấp học)."];
  const levelWide = s.grade.rule.scope === "level";
  const scope = levelWide ? "toàn cấp" : "trong khối";
  const noun = previousPeriodNoun(report.period.mode);
  const previous = s.previousRank !== undefined && noun ? ` (${noun}: hạng ${fmtNumber(s.previousRank)})` : "";
  const topLabel = fmtTopLabel(topRatio);
  const standing = s.grade.bands
    ? `Xếp nhóm: ${bandOfClass(s.grade, s.row.classCode) ?? "–"}`
    : `${s.row.inTop90 ? "Thuộc" : "Ngoài"} ${topLabel}`;
  return [
    `Lớp ${s.row.classCode}: hạng ${fmtNumber(s.row.rank)}/${fmtNumber(s.row.gradeClassCount)} ${scope}${previous} · ${fmtNumber(s.row.score)} điểm thi đua (TB ${levelWide ? "toàn cấp" : "khối"} ${fmtNumber(s.grade.avgScore)})`,
    `${standing} · Mức cảnh báo: ${RAG_LABELS[s.row.rag]}`,
  ];
}

/** "L01 – Đi học muộn: 5 sự việc · 8 lượt · −16 điểm" for the 3 most frequent errors ([] without incidents). */
export function issueSummary(report: Pick<PeriodReport, "topIssues">): string[] {
  return report.topIssues
    .slice(0, TOP_ISSUES)
    .map((i) => `${i.errorCode} – ${i.issue}: ${fmtNumber(i.incidents)} sự việc · ${fmtNumber(i.violationTurns)} lượt · −${fmtNumber(i.points)} điểm`);
}

/** "3 cảnh báo sớm (1 mức cao)" | "Không có cảnh báo sớm trong kỳ." */
export function warningSummary(report: Pick<PeriodReport, "warnings">): string {
  const n = report.warnings.length;
  if (n === 0) return "Không có cảnh báo sớm trong kỳ.";
  const high = report.warnings.filter((w) => w.severity === "high").length;
  return `${fmtNumber(n)} cảnh báo sớm${high ? ` (${fmtNumber(high)} mức cao)` : ""} – chi tiết trong báo cáo.`;
}

export interface PlanSummary {
  /** "Công tác phối hợp tuần mới · Tuần 26/10 – 01/11/2026". */
  title: string;
  /** "Tổng vệ sinh lớp học – Phụ trách: GVCN khối 6 – Thời hạn: Thứ Hai". */
  items: string[];
  note?: string;
}

/** Section 5 of the report when something was planned; undefined otherwise. */
export function planSummary(report: Pick<PeriodReport, "period">, plan: ReportPlanContent): PlanSummary | undefined {
  const period = planPeriodOf(report.period);
  const note = plan.note?.trim();
  if (!period || (plan.items.length === 0 && !note)) return undefined;
  const items = plan.items.map((i) => [i.content, i.owner ? `Phụ trách: ${i.owner}` : "", i.due ? `Thời hạn: ${i.due}` : ""].filter(Boolean).join(" – "));
  return { title: `${planTitle(period.mode)} · ${nextPeriodLabel(period)}`, items, ...(note ? { note } : {}) };
}

/** The sentence about the PDF. */
export function pdfLine(pdf: ReportPdfState): string {
  if (pdf.status === "attached") return `Báo cáo đầy đủ (khổ A4) trong file PDF đính kèm: ${pdf.fileName}.`;
  if (pdf.status === "too-large") return "File PDF của báo cáo vượt quá dung lượng gửi kèm nên không được đính kèm – vui lòng xem báo cáo đầy đủ trên phần mềm.";
  return "Chưa tạo được file PDF của báo cáo – vui lòng xem báo cáo đầy đủ trên phần mềm.";
}

/** Footer lines: who sent it from which mailbox, and that replies go to the sender, not to the mailbox. */
export function reportFooterLines(senderName: string, preparedBy: string): string[] {
  return [
    `Thư được ${preparedBy} gửi từ phần mềm Nền nếp (hộp thư ${senderName}) – ${SCHOOL_NAME}.`,
    `Đây là hộp thư tự động, vui lòng không trả lời thư này; cần trao đổi xin liên hệ trực tiếp ${preparedBy}.`,
  ];
}

/* ---------------------------------- HTML ---------------------------------- */

const FONT = "font-family:Arial,Helvetica,sans-serif;";
const COLOR = { heading: "#1A2366", text: "#1F2937", muted: "#6B7280", border: "#E5E7EB", soft: "#F9FAFB", good: "#15803D", bad: "#B91C1C", reward: "#6E4C00" } as const;
const TONE_COLOR: Record<DeltaTone, string> = { good: COLOR.good, bad: COLOR.bad, same: COLOR.muted };
const LINK_LABEL = "Xem báo cáo trên phần mềm";

function sectionHtml(title: string, inner: string): string {
  return (
    `<p style="margin:16px 0 8px;padding-bottom:4px;border-bottom:2px solid ${COLOR.heading};${FONT}font-size:13px;line-height:18px;font-weight:bold;color:${COLOR.heading};text-transform:uppercase;">${escapeHtml(title)}</p>` +
    inner
  );
}

function listHtml(items: readonly string[]): string {
  const li = items.map((i) => `<li style="margin:0 0 4px;">${escapeHtml(i)}</li>`).join("");
  return `<ul style="margin:0 0 12px;padding:0 0 0 20px;${FONT}font-size:14px;line-height:21px;color:${COLOR.text};">${li}</ul>`;
}

function kpiTableHtml(kpis: readonly ReportKpi[], noun: string | undefined): string {
  const cells = kpis.map((k) => {
    const d = kpiDelta(k);
    const valueColor = k.id === "penaltyPoints" ? COLOR.bad : k.id === "rewardPoints" ? COLOR.reward : COLOR.heading;
    const delta = d
      ? `<div style="${FONT}font-size:12px;line-height:16px;font-weight:bold;color:${TONE_COLOR[d.tone]};">${escapeHtml(d.text)}` +
        (noun ? `<span style="font-weight:normal;color:${COLOR.muted};"> so với ${escapeHtml(noun)}</span>` : "") +
        `</div>`
      : "";
    return (
      `<td width="25%" valign="top" style="padding:8px 10px;border:1px solid ${COLOR.border};">` +
      `<div style="${FONT}font-size:12px;line-height:16px;color:${COLOR.muted};">${escapeHtml(k.label)}</div>` +
      `<div style="${FONT}font-size:20px;line-height:28px;font-weight:bold;color:${valueColor};">${escapeHtml(fmtNumber(k.value))}</div>${delta}</td>`
    );
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 12px;"><tr>${cells.join("")}</tr></table>`;
}

function noteHtml(preparedBy: string, note: string): string {
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;"><tr>` +
    `<td style="padding:10px 12px;background:${COLOR.soft};border-left:3px solid ${COLOR.heading};${FONT}font-size:14px;line-height:21px;color:${COLOR.text};">` +
    `<strong>Lời nhắn của ${escapeHtml(preparedBy)}:</strong><br>${textHtml(note)}</td></tr></table>`
  );
}

/** Subject, HTML and plain text of one report email. */
export function buildReportMail(report: PeriodReport, plan: ReportPlanContent, opts: ReportMailOptions): ReportMailContent {
  const subject = reportMailSubject(report);
  const levelName = opts.levelName ?? report.levelName;
  const noun = report.previousLabel ? previousPeriodNoun(report.period.mode) : undefined;
  const intro =
    `Xin gửi báo cáo nền nếp ${lowerFirst(report.periodLabel)} của cấp ${levelName} (phạm vi: ${report.scopeLabel}).` +
    (report.previousLabel ? ` So sánh với ${report.previousLabel}.` : "");
  const greeting = `Kính gửi ${report.addressee},`;
  const note = opts.note?.trim();
  const kpis = mailKpis(report);
  const ranking = rankingSummary(report, opts.topRatio);
  const issues = issueSummary(report);
  const noIssues = "Không có sự việc trong kỳ.";
  const warnings = warningSummary(report);
  const planned = planSummary(report, plan);
  const pdf = pdfLine(opts.pdf);
  const link = safeHttpUrl(opts.link);
  const footer = reportFooterLines(opts.senderName, opts.preparedBy);

  const body = [
    paragraphHtml(greeting),
    note ? noteHtml(opts.preparedBy, note) : "",
    paragraphHtml(intro),
    sectionHtml("Chỉ số chính", kpiTableHtml(kpis, noun)),
    sectionHtml("Xếp hạng thi đua", listHtml(ranking)),
    sectionHtml("Vấn đề nổi bật", issues.length ? listHtml(issues) : paragraphHtml(noIssues)),
    sectionHtml("Cảnh báo sớm", paragraphHtml(warnings)),
    planned
      ? sectionHtml(planned.title, (planned.items.length ? listHtml(planned.items) : "") + (planned.note ? paragraphHtml(planned.note) : ""))
      : "",
    `<div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>`,
    paragraphHtml(pdf, { strong: true }),
    link ? buttonHtml(link, LINK_LABEL) : "",
    link
      ? `<p style="margin:0 0 16px;${FONT}font-size:12px;line-height:18px;color:${COLOR.muted};">Hoặc mở đường dẫn: <a href="${escapeHtml(link)}" style="color:${COLOR.heading};">${escapeHtml(link)}</a></p>`
      : "",
    paragraphHtml(`Trân trọng,\n${opts.preparedBy}`),
  ].join("");

  const html = emailDocumentHtml({
    title: subject,
    preheader: `${report.periodLabel} · ${report.scopeLabel} · ${kpis.map((k) => `${k.label}: ${fmtNumber(k.value)}`).join(" · ")}`,
    heading: report.title,
    subheading: `${levelName} · Kính gửi: ${shortAddressee(report)}`,
    bodyHtml: body,
    footerLines: footer,
  });

  const kpiText = kpis.map((k) => {
    const d = kpiDelta(k);
    return `- ${k.label}: ${fmtNumber(k.value)}${d ? ` (${d.text}${noun ? ` so với ${noun}` : ""})` : ""}`;
  });
  const bullets = (items: readonly string[]) => items.map((i) => `- ${i}`);
  const text = [
    report.title,
    `${SCHOOL_NAME} · ${levelName}`,
    "",
    greeting,
    "",
    ...(note ? [`Lời nhắn của ${opts.preparedBy}:`, ...textLines(note), ""] : []),
    intro,
    "",
    "CHỈ SỐ CHÍNH",
    ...kpiText,
    "",
    "XẾP HẠNG THI ĐUA",
    ...bullets(ranking),
    "",
    "VẤN ĐỀ NỔI BẬT",
    ...(issues.length ? bullets(issues) : [noIssues]),
    "",
    "CẢNH BÁO SỚM",
    warnings,
    ...(planned ? ["", planned.title.toLocaleUpperCase("vi-VN"), ...bullets(planned.items), ...(planned.note ? textLines(planned.note) : [])] : []),
    "",
    pdf,
    ...(link ? [`${LINK_LABEL}: ${link}`] : []),
    "",
    "Trân trọng,",
    opts.preparedBy,
    "",
    "--",
    ...footer,
  ].join("\n");

  return { subject, html, text };
}
