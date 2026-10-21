/**
 * Display formatting for the UI (Vietnamese conventions, Asia/Ho_Chi_Minh time zone).
 * Pure functions – safe on the server and in the browser, deterministic regardless of the runtime time zone.
 *
 * - Numbers: vi-VN grouping ("1.234,5"); negative numbers use the typographic minus "−" (U+2212).
 * - Missing / non-finite numbers render as an en dash "–".
 * - Vietnamese has no plural forms: "1 học sinh", "5 học sinh".
 */
import { diffDays, formatDateVN, isIsoDate, todayVN } from "@/lib/engine/dates";

export const EMPTY_VALUE = "–";
export const MINUS_SIGN = "−";

const VN_OFFSET_MS = 7 * 3_600_000;
const formatters = new Map<string, Intl.NumberFormat>();

function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("vi-VN", options);
    formatters.set(key, f);
  }
  return f;
}

function isValidNumber(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** Round to `digits` decimals and normalise -0 to 0. */
function roundTo(n: number, digits: number): number {
  const p = 10 ** digits;
  const r = Math.round(n * p) / p;
  return r === 0 ? 0 : r;
}

/** 12345.678 → "12.345,68"; -5 → "−5"; undefined/NaN → "–". */
export function fmtNumber(n: number | null | undefined, maxFractionDigits = 2): string {
  if (!isValidNumber(n)) return EMPTY_VALUE;
  const r = roundTo(n, maxFractionDigits);
  const s = numberFormat({ maximumFractionDigits: maxFractionDigits }).format(Math.abs(r));
  return r < 0 ? MINUS_SIGN + s : s;
}

/** Signed points: 10 → "+10", -25 → "−25", 2.5 → "+2,5", 0 → "0". */
export function fmtPoints(n: number | null | undefined): string {
  if (!isValidNumber(n)) return EMPTY_VALUE;
  const r = roundTo(n, 2);
  if (r === 0) return "0";
  const s = numberFormat({ maximumFractionDigits: 2 }).format(Math.abs(r));
  return (r > 0 ? "+" : MINUS_SIGN) + s;
}

/** Ratio → percent: 0.873 → "87%", fmtPercent(0.8734, 1) → "87,3%". */
export function fmtPercent(ratio: number | null | undefined, maxFractionDigits = 0): string {
  if (!isValidNumber(ratio)) return EMPTY_VALUE;
  const r = roundTo(ratio * 100, maxFractionDigits);
  const s = numberFormat({ maximumFractionDigits: maxFractionDigits }).format(Math.abs(r));
  return (r < 0 ? MINUS_SIGN : "") + s + "%";
}

/** Spec default of config.top90Ratio (BR-RANK-05), used when no ratio is known. */
const DEFAULT_TOP_RATIO = 0.9;

/**
 * Name of the configurable Top group (config.top90Ratio) – use it instead of a hard-coded "Top 90%" in badges,
 * headers, hints and copied text: 0.9 → "Top 90%", 0.8 → "Top 80%"; missing/invalid → "Top 90%".
 */
export function fmtTopLabel(ratio?: number | null): string {
  return `Top ${fmtPercent(isValidNumber(ratio) && ratio > 0 ? ratio : DEFAULT_TOP_RATIO)}`;
}

/** "5 học sinh", "1.204 sự việc" (no plural forms in Vietnamese). */
export function fmtCount(n: number | null | undefined, noun: string): string {
  return `${fmtNumber(n, 0)} ${noun}`;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Instant for a Date / ISO timestamp; a calendar date "yyyy-mm-dd" means its midnight in Vietnam (strictly validated). */
function toDate(value: string | Date): Date | undefined {
  if (typeof value === "string" && DATE_ONLY.test(value)) {
    return isIsoDate(value) ? new Date(`${value}T00:00:00+07:00`) : undefined;
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * dd/mm/yyyy. Accepts a calendar date "yyyy-mm-dd" (returned as is) or an ISO timestamp / Date
 * (converted to the Vietnamese calendar day). Invalid input → "".
 */
export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && DATE_ONLY.test(value)) return formatDateVN(value); // "" when invalid
  const d = toDate(value);
  return d ? formatDateVN(todayVN(d)) : "";
}

/** "14:05" in Vietnam time. Invalid input → "". */
export function fmtTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = toDate(value);
  if (!d) return "";
  const vn = new Date(d.getTime() + VN_OFFSET_MS);
  return `${pad2(vn.getUTCHours())}:${pad2(vn.getUTCMinutes())}`;
}

/** "21/10/2026 14:05" in Vietnam time. A plain "yyyy-mm-dd" is formatted as a date only. Invalid → "". */
export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string" && DATE_ONLY.test(value)) return formatDateVN(value); // "" when invalid
  const d = toDate(value);
  if (!d) return "";
  return `${formatDateVN(todayVN(d))} ${fmtTime(d)}`;
}

/**
 * Relative time in Vietnamese: "vừa xong", "5 phút trước", "3 giờ trước", "hôm qua", "4 ngày trước",
 * then dd/mm/yyyy from 7 days on. Future: "5 phút nữa", "2 giờ nữa", "ngày mai", then dd/mm/yyyy.
 */
export function fmtRelative(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "";
  const d = toDate(value);
  if (!d) return "";
  const diffSec = (now.getTime() - d.getTime()) / 1000;
  const abs = Math.abs(diffSec);
  if (abs < 45) return "vừa xong";
  const future = diffSec < 0;
  if (abs < 3600) {
    const m = Math.max(1, Math.round(abs / 60));
    return future ? `${m} phút nữa` : `${m} phút trước`;
  }
  const days = diffDays(todayVN(now), todayVN(d)); // calendar days in VN, negative = future
  if (days === 0 || abs < 6 * 3600) {
    const h = Math.max(1, Math.floor(abs / 3600));
    return future ? `${h} giờ nữa` : `${h} giờ trước`;
  }
  if (days === 1) return "hôm qua";
  if (days === -1) return "ngày mai";
  if (days > 1 && days < 7) return `${days} ngày trước`;
  return fmtDate(d);
}
