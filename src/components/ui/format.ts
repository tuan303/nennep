/** Minimal VN number formatting for the UI kit (the app-wide helpers live in src/lib/client/format.ts). */

const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 });

/** 1234.5 → "1.234,5" */
export function formatNumberVN(n: number): string {
  return Number.isFinite(n) ? nf.format(n) : "–";
}

/** 0.964 → "96,4%" */
export function formatPercentVN(ratio: number): string {
  return Number.isFinite(ratio) ? `${nf1.format(ratio * 100)}%` : "–";
}

/** Signed value: 12 → "+12", -3 → "−3", 0 → "0" */
export function formatSignedVN(n: number, format: (v: number) => string = formatNumberVN): string {
  if (!Number.isFinite(n) || n === 0) return format(0);
  return n > 0 ? `+${format(n)}` : `−${format(Math.abs(n))}`;
}

/** 12900 → "12,9 N" (compact axis labels). Small numbers stay exact. */
export function formatCompactVN(n: number): string {
  return Math.abs(n) < 10_000 ? formatNumberVN(n) : compact.format(n);
}
