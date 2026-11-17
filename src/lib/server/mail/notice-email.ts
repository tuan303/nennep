/**
 * GVCN notice email (pure): subject, HTML body and plain text of one NoticePayload. Everything shown comes from the
 * payload snapshot taken when the record changed; the link opens Khối & lớp of the class for the record's week.
 *
 * Subjects:
 *   incident CREATED            [Nền nếp] Lớp 6A01: −5 điểm · Đi học muộn (21/10/2026)
 *   reward CREATED / CONFIRMED  [Nền nếp] Lớp 6A01: +2 điểm thưởng · <lý do ≤ 60 ký tự> (21/10/2026)
 *   UPDATED / DELETED / RESTORED [Nền nếp] Lớp 6A01: điều chỉnh | hủy ghi nhận | khôi phục NN-…
 *   MOVED_OUT                   [Nền nếp] Lớp 6A01: NN-… chuyển sang lớp 6A02
 */
import { SCHOOL_NAME } from "../../constants";
import { formatDateVN, weekdayLabelVN } from "../../engine/dates";
import type { LevelId, NoticePayload, NoticeSnapshot } from "../../types";
import {
  AUTO_MAIL_FOOTER,
  buttonHtml,
  detailsTableHtml,
  emailDocumentHtml,
  formatPointsVN,
  paragraphHtml,
  subjectLine,
  truncateText,
  type DetailRow,
} from "./html";

export const NOTICE_SUBJECT_PREFIX = "[Nền nếp]";
/** Max characters of the reason / issue in a subject. */
export const NOTICE_SUBJECT_TITLE_MAX = 60;
export const NOTICE_LINK_LABEL = "Xem trên phần mềm";

export interface NoticeMailContext {
  /** appBaseUrl() – no trailing slash. */
  baseUrl: string;
  levelId: LevelId;
  /** LEVELS[levelId].name, e.g. "Trung học cơ sở". */
  levelName: string;
}

export interface BuiltNoticeMail {
  subject: string;
  html: string;
  text: string;
}

const MINUS = "−";

/** Khối & lớp of the class for the record's week: `/lop?level=<cấp>&mode=week&key=<Monday>&class=<lớp>` (the app opens that level). */
export function noticeLink(baseUrl: string, snapshot: Pick<NoticeSnapshot, "week" | "classCode">, levelId: LevelId): string {
  const qs = new URLSearchParams({ level: levelId, mode: "week", key: snapshot.week, class: snapshot.classCode });
  return `${baseUrl}/lop?${qs.toString()}`;
}

const recordNoun = (s: NoticeSnapshot): string => (s.record === "incident" ? "Sự việc" : "Điểm thưởng");

/** "−5 điểm" | "0 điểm" (incident) · "+2 điểm thưởng" (reward). */
function pointsPhrase(s: NoticeSnapshot): string {
  const v = formatPointsVN(s.points);
  if (s.record === "reward") return `+${v} điểm thưởng`;
  return s.points > 0 ? `${MINUS}${v} điểm` : `${v} điểm`;
}

export function noticeSubject(p: NoticePayload): string {
  const s = p.snapshot;
  const head = `${NOTICE_SUBJECT_PREFIX} Lớp ${s.classCode}:`;
  const date = formatDateVN(s.date);
  switch (p.event) {
    case "CREATED":
    case "CONFIRMED":
      return subjectLine(`${head} ${pointsPhrase(s)} · ${truncateText(s.title, NOTICE_SUBJECT_TITLE_MAX)} (${date})`);
    case "UPDATED":
      return subjectLine(`${head} điều chỉnh ${s.code}`);
    case "DELETED":
      return subjectLine(`${head} hủy ghi nhận ${s.code}`);
    case "RESTORED":
      return subjectLine(`${head} khôi phục ${s.code}`);
    case "MOVED_OUT":
      return subjectLine(`${head} ${s.code} chuyển sang lớp ${p.movedTo ?? "khác"}`);
  }
}

function countedNote(s: NoticeSnapshot): string {
  return s.counted ? "đã tính vào thi đua" : "chưa tính vào thi đua";
}

/** The first sentence of the body: what happened, from the point of view of the receiving class. */
export function noticeSummary(p: NoticePayload): string {
  const s = p.snapshot;
  const cls = `lớp ${s.classCode}`;
  const v = formatPointsVN(s.points);
  const isIncident = s.record === "incident";
  switch (p.event) {
    case "CREATED":
      if (isIncident) return `Lớp ${s.classCode} vừa được ghi nhận một sự việc nền nếp: trừ ${v} điểm.`;
      return s.counted
        ? `Lớp ${s.classCode} vừa được cộng ${v} điểm thưởng.`
        : `Lớp ${s.classCode} vừa được ghi nhận ${v} điểm thưởng (trạng thái “${s.status}” – chưa tính vào thi đua cho đến khi được xác nhận).`;
    case "CONFIRMED":
      return `Điểm thưởng ${s.code} của ${cls} đã được xác nhận: cộng ${v} điểm vào thi đua.`;
    case "UPDATED":
      return `${recordNoun(s)} ${s.code} của ${cls} vừa được điều chỉnh.`;
    case "DELETED":
      if (isIncident) return `Sự việc ${s.code} của ${cls} đã được hủy ghi nhận – ${v} điểm trừ không còn được tính.`;
      return s.counted ? `Điểm thưởng ${s.code} của ${cls} đã được hủy – ${v} điểm thưởng không còn được tính.` : `Điểm thưởng ${s.code} của ${cls} đã được hủy.`;
    case "RESTORED":
      if (isIncident) return `Sự việc ${s.code} của ${cls} đã được khôi phục – ${v} điểm trừ được tính lại.`;
      return s.counted ? `Điểm thưởng ${s.code} của ${cls} đã được khôi phục – ${v} điểm thưởng được tính lại.` : `Điểm thưởng ${s.code} của ${cls} đã được khôi phục.`;
    case "MOVED_OUT":
      return `${recordNoun(s)} ${s.code} không còn tính cho ${cls}: đã được chuyển sang lớp ${p.movedTo ?? "khác"}.`;
  }
}

/** "Nguyễn Văn An, Trần Thị Bình và 2 HS chưa rõ tên" ("" when nobody is named or counted). */
export function studentsLine(s: Pick<NoticeSnapshot, "students" | "unnamedCount">): string {
  const named = s.students.filter((n) => n.trim() !== "").join(", ");
  const unnamed = s.unnamedCount && s.unnamedCount > 0 ? `${s.unnamedCount} HS chưa rõ tên` : "";
  if (named && unnamed) return `${named} và ${unnamed}`;
  return named || unnamed;
}

function dateLine(date: string): string {
  const d = formatDateVN(date);
  return d ? `${weekdayLabelVN(date)}, ${d}` : date;
}

function incidentRows(s: NoticeSnapshot): DetailRow[] {
  const error = [s.errorCode, s.title].filter(Boolean).join(" – ");
  return [
    { label: "Mã sự việc", value: s.code },
    { label: "Ngày", value: dateLine(s.date) },
    { label: "Lỗi vi phạm", value: s.group ? `${error} (${s.group})` : error },
    { label: "Mảng", value: s.category ?? "" },
    { label: "Điểm trừ", value: s.points > 0 ? `${MINUS}${formatPointsVN(s.points)}` : "0" },
    { label: "Phạm vi", value: s.scope ?? "" },
    { label: "Số lần vi phạm", value: s.unit === "/lần" && s.occurrenceCount !== undefined ? String(s.occurrenceCount) : "" },
    { label: "Học sinh", value: studentsLine(s) },
    { label: "Chi tiết", value: s.detail ?? "" },
    { label: "Người ghi", value: s.reporter ?? "" },
    { label: "Trạng thái", value: s.status },
  ];
}

function rewardRows(s: NoticeSnapshot): DetailRow[] {
  return [
    { label: "Mã điểm thưởng", value: s.code },
    { label: "Ngày", value: dateLine(s.date) },
    { label: "Nội dung thưởng", value: s.title },
    { label: "Điểm thưởng", value: `+${formatPointsVN(s.points)}` },
    { label: "Trạng thái", value: `${s.status} (${countedNote(s)})` },
    { label: "Ghi chú", value: s.detail ?? "" },
    { label: "Người ghi", value: s.reporter ?? "" },
  ];
}

/** Label/value rows of the body (empty values are dropped when rendered). */
export function noticeDetailRows(p: NoticePayload): DetailRow[] {
  const s = p.snapshot;
  const rows = s.record === "incident" ? incidentRows(s) : rewardRows(s);
  const extra: DetailRow[] = [];
  if (p.changes && p.changes.length > 0) extra.push({ label: "Nội dung thay đổi", value: p.changes.join(", ") });
  if (p.event === "MOVED_OUT" && p.movedTo) extra.push({ label: "Chuyển sang lớp", value: p.movedTo });
  extra.push({ label: "Người thực hiện", value: p.actorName });
  return [...rows, ...extra];
}

export function buildNoticeMail(p: NoticePayload, ctx: NoticeMailContext): BuiltNoticeMail {
  const s = p.snapshot;
  const subject = noticeSubject(p);
  const summary = noticeSummary(p);
  const rows = noticeDetailRows(p);
  const link = noticeLink(ctx.baseUrl, s, ctx.levelId);
  const footerLines = [AUTO_MAIL_FOOTER, `${SCHOOL_NAME} · ${ctx.levelName}`];
  const html = emailDocumentHtml({
    title: subject,
    preheader: summary,
    heading: `Thông báo nền nếp – Lớp ${s.classCode}`,
    subheading: `${ctx.levelName} · ${s.record === "incident" ? "Sự việc nền nếp" : "Điểm thưởng"}`,
    bodyHtml: [
      paragraphHtml("Kính gửi thầy/cô chủ nhiệm,"),
      paragraphHtml(summary, { strong: true }),
      detailsTableHtml(rows),
      buttonHtml(link, NOTICE_LINK_LABEL),
      paragraphHtml("Nếu thông tin chưa chính xác, thầy/cô vui lòng phản hồi trực tiếp trên phần mềm.", { muted: true }),
    ].join(""),
    footerLines,
  });
  const text = [
    "Kính gửi thầy/cô chủ nhiệm,",
    "",
    summary,
    "",
    ...rows.filter((r) => r.value.trim() !== "").map((r) => `${r.label}: ${r.value}`),
    "",
    `${NOTICE_LINK_LABEL}: ${link}`,
    "",
    ...footerLines,
  ].join("\n");
  return { subject, html, text };
}
