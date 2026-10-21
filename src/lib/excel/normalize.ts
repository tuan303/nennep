/**
 * Text normalisation used to match Vietnamese headers, sheet names and labels
 * regardless of accents, case, line breaks, punctuation or parenthesised hints.
 */

/** Strip Vietnamese diacritics (incl. đ/Đ), lowercase, collapse whitespace (incl. NBSP / line breaks). */
export function foldVN(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Comparison key for headers / sheet names / labels:
 * "Số lần vi phạm\n(chỉ dùng lỗi /lần)" → "so lan vi pham", "SĐT GVCN" → "sdt gvcn", "Điểm cơ sở / lớp / tuần" → "diem co so lop tuan".
 */
export function headerKey(s: string): string {
  return foldVN(s.replace(/\([^)]*\)/g, " "))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Truncate to `max` characters (strings are already trimmed by the readers). */
export function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max).trimEnd() : s;
}

/** Excel sheet names: ≤ 31 chars, none of \ / ? * [ ] : */
export function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]+/g, " ").replace(/\s+/g, " ").trim();
  return clip(cleaned || "Sheet1", 31);
}
