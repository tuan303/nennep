/**
 * Building blocks of the HTML emails (pure): Outlook-safe table layout, inline styles only, no scripts, no external
 * resources, every text escaped. Shared by the GVCN notices, the report emails and the test message.
 */
import { SCHOOL_NAME, SCHOOL_WIDE_COLOR } from "../../constants";

/** Brand red of NSHM (header bar, buttons). */
export const MAIL_BRAND_COLOR = SCHOOL_WIDE_COLOR;

/** Footer line of every automatic email. */
export const AUTO_MAIL_FOOTER = "Thư tự động từ phần mềm Nền nếp – vui lòng không trả lời; phản hồi trực tiếp trên phần mềm.";

const FONT = "font-family:Arial,Helvetica,sans-serif;";
const INK = "#111827";
const TEXT = "#1F2937";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const PAGE_BG = "#F3F4F6";
const LABEL_BG = "#F9FAFB";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

/** Escaped text whose line breaks become <br>. */
export function textHtml(s: string): string {
  return escapeHtml(s.replace(/\r\n?/g, "\n")).replace(/\n/g, "<br>");
}

/** The URL when it is an absolute http(s) URL, undefined otherwise (never a javascript:/data: link in an email). */
export function safeHttpUrl(url: string): string | undefined {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function paragraphHtml(text: string, opts: { muted?: boolean; strong?: boolean } = {}): string {
  const color = opts.muted ? MUTED : TEXT;
  const weight = opts.strong ? "font-weight:bold;" : "";
  return `<p style="margin:0 0 12px;${FONT}font-size:14px;line-height:21px;color:${color};${weight}">${textHtml(text)}</p>`;
}

export interface DetailRow {
  label: string;
  /** Plain text (escaped); rows with an empty value are left out. */
  value: string;
}

/** Two-column label/value table (empty values skipped); "" when no row is left. */
export function detailsTableHtml(rows: readonly DetailRow[]): string {
  const kept = rows.filter((r) => r.value.trim() !== "");
  if (kept.length === 0) return "";
  const cells = kept
    .map(
      (r) =>
        `<tr><td valign="top" style="padding:8px 12px;border:1px solid ${BORDER};background:${LABEL_BG};${FONT}font-size:13px;line-height:19px;color:${MUTED};width:34%;">${escapeHtml(r.label)}</td>` +
        `<td valign="top" style="padding:8px 12px;border:1px solid ${BORDER};${FONT}font-size:14px;line-height:20px;color:${TEXT};">${textHtml(r.value)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:4px 0 16px;">${cells}</table>`;
}

/** Table-based button (renders in Outlook); "" when `href` is not an http(s) URL. */
export function buttonHtml(href: string, label: string): string {
  const url = safeHttpUrl(href);
  if (!url) return "";
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;"><tr>` +
    `<td bgcolor="${MAIL_BRAND_COLOR}" style="background:${MAIL_BRAND_COLOR};border-radius:6px;">` +
    `<a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:10px 20px;${FONT}font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;">${escapeHtml(label)}</a>` +
    `</td></tr></table>`
  );
}

export interface EmailDocument {
  /** <title> of the document (usually the subject). */
  title: string;
  /** Hidden preview line shown by mail clients next to the subject. */
  preheader?: string;
  heading: string;
  subheading?: string;
  /** Already-built HTML (paragraphHtml, detailsTableHtml, buttonHtml…). */
  bodyHtml: string;
  /** Plain-text footer lines (escaped). */
  footerLines: readonly string[];
}

/** Complete HTML document: brand bar with the school name, white card, footer. */
export function emailDocumentHtml(doc: EmailDocument): string {
  const preheader = doc.preheader
    ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:${PAGE_BG};">${escapeHtml(doc.preheader)}</div>`
    : "";
  const sub = doc.subheading ? `<p style="margin:0 0 16px;${FONT}font-size:13px;line-height:19px;color:${MUTED};">${escapeHtml(doc.subheading)}</p>` : "";
  const footer = doc.footerLines.map((l) => `<p style="margin:0 0 4px;${FONT}font-size:12px;line-height:18px;color:${MUTED};">${escapeHtml(l)}</p>`).join("");
  return (
    `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(doc.title)}</title></head>` +
    `<body style="margin:0;padding:0;background:${PAGE_BG};">${preheader}` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE_BG};"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid ${BORDER};">` +
    `<tr><td bgcolor="${MAIL_BRAND_COLOR}" style="background:${MAIL_BRAND_COLOR};padding:14px 24px;${FONT}font-size:13px;line-height:18px;font-weight:bold;color:#FFFFFF;">${escapeHtml(SCHOOL_NAME)} · Nền nếp</td></tr>` +
    `<tr><td style="padding:24px;">` +
    `<h1 style="margin:0 0 6px;${FONT}font-size:20px;line-height:28px;color:${INK};">${escapeHtml(doc.heading)}</h1>${sub}${doc.bodyHtml}` +
    `</td></tr>` +
    `<tr><td style="padding:14px 24px;border-top:1px solid ${BORDER};">${footer}</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

/** "Abc…" when longer than `max` characters (whitespace collapsed first). */
export function truncateText(s: string, max: number): string {
  const v = s.replace(/\s+/g, " ").trim();
  return v.length <= max ? v : `${v.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** One line for a subject header: no line breaks, collapsed whitespace. */
export function subjectLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const NUMBER_VN = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

/** 5 → "5", 2.5 → "2,5" (absolute value, vi-VN decimal comma). */
export function formatPointsVN(n: number): string {
  const r = Math.round(Math.abs(n) * 100) / 100;
  return NUMBER_VN.format(r);
}
