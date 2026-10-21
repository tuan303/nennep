/**
 * Evidence link inputs (pure – unit-tested). Shared by the incident and reward forms.
 * Contract: at most 5 http(s) URLs of ≤ 1000 characters; the server rejects anything else.
 */
import { safeExternalUrl } from "@/components/app/widgets/lib/urls";

export const MAX_EVIDENCE_LINKS = 5;
const MAX_URL_LENGTH = 1000;

type LinkProblem = "invalid" | "tooLong";

function problemOf(raw: string): LinkProblem | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  if (s.length > MAX_URL_LENGTH) return "tooLong";
  return safeExternalUrl(s) ? undefined : "invalid";
}

/** Message shown under one link input ("" = valid or still empty). */
export function linkError(raw: string): string {
  const p = problemOf(raw);
  if (p === "tooLong") return "Liên kết quá dài (tối đa 1.000 ký tự).";
  if (p === "invalid") return "Liên kết chưa hợp lệ – cần bắt đầu bằng http:// hoặc https://";
  return "";
}

export interface LinkCheck {
  /** Trimmed, valid, distinct links to send to the API (empty inputs dropped). */
  urls: string[];
  /** Vietnamese messages for the form-level checklist. */
  errors: string[];
}

export function checkEvidenceLinks(links: readonly string[], max = MAX_EVIDENCE_LINKS): LinkCheck {
  const errors: string[] = [];
  const urls: string[] = [];
  links.forEach((raw, i) => {
    const s = raw.trim();
    const p = problemOf(s);
    if (p === "tooLong") errors.push(`Liên kết minh chứng ${i + 1} quá dài (tối đa 1.000 ký tự).`);
    else if (p === "invalid") errors.push(`Liên kết minh chứng ${i + 1} chưa hợp lệ (cần bắt đầu bằng http:// hoặc https://).`);
    else if (s && !urls.includes(s)) urls.push(s);
  });
  if (urls.length > max) errors.push(`Tối đa ${max} liên kết minh chứng.`);
  return { urls, errors };
}
