/**
 * Email addresses and domains (pure, shared by client and server).
 *
 * - Addresses are compared and stored normalised: trimmed, lower-case, without "mailto:" / "<…>" wrapping.
 * - A recipient is allowed when its domain equals one of the effective allowed domains exactly (no subdomains):
 *   Cài đặt → Email "Tên miền được phép", or – when that list is empty – the domain of MAIL_SENDER.
 */

const EMAIL_MAX = 254;
const LOCAL_MAX = 64;
const DOMAIN_MAX = 253;

const LOCAL_ATOM = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+";
const LOCAL_RE = new RegExp(`^${LOCAL_ATOM}(?:\\.${LOCAL_ATOM})*$`);
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
/** At least two labels; the last one (TLD) starts with a letter and has 2+ characters. */
const DOMAIN_RE = new RegExp(`^(?:${LABEL}\\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])$`);

/** Separators of a pasted list: comma, semicolon, line breaks (whitespace is handled per entry). */
const LIST_SEPARATORS = /[,;\r\n]+/;
const BRACKETED = /<([^<>]*)>/g;

/** "  Mailto:<GV.6A01@Example.EDU.vn> " → "gv.6a01@example.edu.vn" (no validation). */
export function normalizeEmail(raw: string): string {
  return raw
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/^[<"'(\s]+|[>"')\s]+$/g, "")
    .toLowerCase();
}

/** "@Example.edu.vn." → "example.edu.vn"; a leading "*." wildcard is dropped (matching is exact anyway). */
export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^\*\./, "")
    .replace(/^@+/, "")
    .replace(/\.+$/, "");
}

/** Strict-enough syntax check of ONE address (case-insensitive; surrounding spaces make it invalid). */
export function isEmail(value: string): boolean {
  if (value.length === 0 || value.length > EMAIL_MAX) return false;
  const at = value.lastIndexOf("@");
  if (at <= 0) return false;
  const local = value.slice(0, at).toLowerCase();
  const domain = value.slice(at + 1).toLowerCase();
  return local.length <= LOCAL_MAX && LOCAL_RE.test(local) && isDomain(domain);
}

/** "example.edu.vn" (case-insensitive, no scheme, no "@", at least one dot). */
export function isDomain(value: string): boolean {
  return value.length > 0 && value.length <= DOMAIN_MAX && DOMAIN_RE.test(value.toLowerCase());
}

/** Domain of an address, lower-case ("" when there is no "@"). */
export function domainOf(email: string): string {
  const v = normalizeEmail(email);
  const at = v.lastIndexOf("@");
  return at < 0 ? "" : v.slice(at + 1);
}

/** Normalised, non-empty, first occurrence kept (order preserved). */
export function dedupeEmails(emails: readonly string[]): string[] {
  const out = new Set<string>();
  for (const e of emails) {
    const v = normalizeEmail(e);
    if (v) out.add(v);
  }
  return [...out];
}

function listTokens(text: string): string[] {
  return text.split(LIST_SEPARATORS).flatMap((entry) => {
    // Outlook style "Tên hiển thị <a@b.vn>": keep only the bracketed address(es) of the entry.
    const bracketed = [...entry.matchAll(BRACKETED)].map((m) => m[1]);
    return bracketed.length > 0 ? bracketed : entry.split(/\s+/);
  });
}

/**
 * A pasted / typed list → `valid` (normalised, deduplicated, input order) and `invalid` (the offending entries as
 * typed, trimmed, deduplicated case-insensitively). Separators: comma, semicolon, whitespace, line breaks.
 */
export function parseEmailList(text: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const token of listTokens(text)) {
    const email = normalizeEmail(token);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (isEmail(email)) valid.push(email);
    else invalid.push(token.trim());
  }
  return { valid, invalid };
}

/** True when the address's domain is one of `domains` (exact match after normalisation). */
export function isAllowedDomain(email: string, domains: readonly string[]): boolean {
  const d = domainOf(email);
  return d !== "" && domains.some((x) => normalizeDomain(x) === d);
}

/**
 * Domains recipients may belong to: the configured list (normalised, valid, deduplicated) or, when it is empty, the
 * domain of the sending mailbox; [] when neither is known (nothing can be sent).
 */
export function effectiveAllowedDomains(allowedDomains: readonly string[], sender?: string): string[] {
  const configured = [...new Set(allowedDomains.map(normalizeDomain).filter(isDomain))];
  if (configured.length > 0) return configured;
  const own = sender ? domainOf(sender) : "";
  return own && isDomain(own) ? [own] : [];
}

/** Split addresses (normalised, deduplicated) into those inside `domains` and those outside. */
export function partitionByDomain(emails: readonly string[], domains: readonly string[]): { allowed: string[]; blocked: string[] } {
  const allowed: string[] = [];
  const blocked: string[] = [];
  for (const e of dedupeEmails(emails)) (isAllowedDomain(e, domains) ? allowed : blocked).push(e);
  return { allowed, blocked };
}
