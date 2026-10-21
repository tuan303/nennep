/** Mapping of free-text workbook values (status, scope, evidence) to domain values. Pure. */
import { normalizeVN } from "../../engine/text";
import type { IncidentStatus, RewardStatus, Scope, Unit } from "../../types";

/** "2 điểm/HS", "5 điểm/lần" */
export function penaltyText(penalty: number, unit: Unit): string {
  return `${String(penalty).replace(".", ",")} điểm${unit}`;
}

/** Known incident status texts: "Đã đóng"; "Đang xử lý" / "Đã giao" → Đang xử lý; "Mới ghi nhận". Else undefined. */
export function parseIncidentStatus(text: string | undefined): IncidentStatus | undefined {
  const t = normalizeVN(text ?? "");
  if (t === "da dong") return "Đã đóng";
  if (t === "dang xu ly" || t === "da giao") return "Đang xử lý";
  if (t === "moi ghi nhan" || t === "moi") return "Mới ghi nhận";
  return undefined;
}

/** "Đã đóng" → Đã đóng; "Đang xử lý" / "Đã giao" → Đang xử lý; anything else → Mới ghi nhận. */
export function mapIncidentStatus(text: string | undefined): IncidentStatus {
  return parseIncidentStatus(text) ?? "Mới ghi nhận";
}

/** Known reward status texts ("Đã xác nhận", "Đang xác minh", "Mới ghi nhận"); undefined otherwise. */
export function parseRewardStatus(text: string | undefined): RewardStatus | undefined {
  const t = normalizeVN(text ?? "");
  if (t === "da xac nhan") return "Đã xác nhận";
  if (t === "dang xac minh") return "Đang xác minh";
  if (t === "moi ghi nhan" || t === "moi") return "Mới ghi nhận";
  return undefined;
}

export function mapRewardStatus(text: string | undefined): RewardStatus {
  return parseRewardStatus(text) ?? "Mới ghi nhận";
}

/**
 * Status of an imported row (IO-07 "status hợp lệ"): a blank cell keeps the stored status (default for new rows);
 * an unknown text keeps it too and produces a warning; leaving a verified/closed status is reported.
 */
export function resolveImportedStatus<S extends string>(
  text: string | undefined,
  parse: (t: string | undefined) => S | undefined,
  existing: S | undefined,
  fallback: S,
  sticky: S,
): { status: S; warnings: string[] } {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  const keep = existing ?? fallback;
  const warnings: string[] = [];
  let status: S;
  if (!raw) status = keep;
  else {
    const parsed = parse(raw);
    if (parsed) status = parsed;
    else {
      status = keep;
      warnings.push(`Trạng thái “${raw}” không hợp lệ – ${existing ? `giữ trạng thái hiện tại “${existing}”` : `dùng “${fallback}”`}.`);
    }
  }
  if (existing === sticky && status !== sticky) warnings.push(`Trạng thái đổi từ “${sticky}” sang “${status}” theo file.`);
  return { status, warnings };
}

/** "Cá nhân" / "Tập thể" (diacritics- and case-insensitive); undefined when empty or unknown. */
export function mapScope(text: string | undefined): Scope | undefined {
  const t = normalizeVN(text ?? "");
  if (t === "ca nhan") return "Cá nhân";
  if (t === "tap the") return "Tập thể";
  return undefined;
}

/** Split an evidence cell into http(s) links (max 5) and the remaining free text. */
export function splitEvidence(text: string | undefined): { urls: string[]; rest: string } {
  const urls: string[] = [];
  const rest: string[] = [];
  for (const token of (text ?? "").split(/\s+/).filter(Boolean)) {
    let ok = false;
    try {
      const p = new URL(token).protocol;
      ok = p === "http:" || p === "https:";
    } catch {
      ok = false;
    }
    if (ok && token.length <= 1000 && urls.length < 5 && !urls.includes(token)) urls.push(token);
    else if (!ok) rest.push(token);
  }
  return { urls, rest: rest.join(" ").trim() };
}
