/**
 * Cài đặt → Email (per level): editor draft of MailSettings, the chip lists of addresses / domains (entries kept as
 * typed so invalid ones can be highlighted), Vietnamese validation mirroring MailSettingsSchema, the PUT payload,
 * change summary, server-error mapping, the per-email recipient-limit warnings and the GVCN-coverage line. Pure –
 * unit-tested.
 */
import { MailSettingsSchema, type MailSettingsInput, type MailStatus, type ReportMailClassRecipients } from "@/lib/contract";
import { LEVELS, MAIL_MAX_RECIPIENTS } from "@/lib/constants";
import { naturalCompare } from "@/lib/engine";
import { domainOf, effectiveAllowedDomains, isAllowedDomain, isDomain, isEmail, normalizeDomain, normalizeEmail, parseEmailList } from "@/lib/mail/address";
import type { LevelId, MailSettings } from "@/lib/types";

/** Same limit as MailSettingsSchema.allowedDomains. */
export const MAIL_DOMAINS_MAX = 20;

export interface MailDraft {
  /** Revision of the settings the draft started from – not editable, sent as `baseRev` (409 when stale). */
  rev: number;
  notices: { enabled: boolean; incidents: boolean; rewards: boolean };
  /** Address lists: valid entries normalised, invalid ones as typed (highlighted, block the save). */
  bgh: string[];
  /** One list per grade of the level, keyed by String(grade). */
  grades: Record<string, string[]>;
  cc: string[];
  /** Domains: valid entries normalised, invalid ones as typed. */
  allowedDomains: string[];
}

/** An address list of the draft: "bgh", "cc" or "grade-6". */
export type MailListId = "bgh" | "cc" | `grade-${number}`;
export type MailField = MailListId | "allowedDomains";
export type MailErrors = Partial<Record<MailField, string>>;

/** Draft of the stored settings (every grade of the level present, grades outside the level dropped). */
export function mailDraft(settings: MailSettings, levelId: LevelId): MailDraft {
  const grades: Record<string, string[]> = {};
  for (const g of LEVELS[levelId].grades) grades[String(g)] = [...(settings.report.grades[String(g)] ?? [])];
  return {
    rev: settings.rev,
    notices: { ...settings.notices },
    bgh: [...settings.report.bgh],
    grades,
    cc: [...settings.report.cc],
    allowedDomains: [...settings.allowedDomains],
  };
}

/** Lists in display order: Ban Giám hiệu, Tổ khối of every grade, CC. */
export function mailListIds(levelId: LevelId): MailListId[] {
  return ["bgh", ...LEVELS[levelId].grades.map((g): MailListId => `grade-${g}`), "cc"];
}

export function mailListLabel(id: MailListId): string {
  if (id === "bgh") return "Ban Giám hiệu";
  if (id === "cc") return "Luôn gửi kèm (CC)";
  return `Tổ khối ${id.slice("grade-".length)}`;
}

function gradeKey(id: `grade-${number}`): string {
  return id.slice("grade-".length);
}

export function mailList(draft: MailDraft, id: MailListId): string[] {
  if (id === "bgh") return draft.bgh;
  if (id === "cc") return draft.cc;
  return draft.grades[gradeKey(id)] ?? [];
}

export function withMailList(draft: MailDraft, id: MailListId, list: string[]): MailDraft {
  if (id === "bgh") return { ...draft, bgh: list };
  if (id === "cc") return { ...draft, cc: list };
  return { ...draft, grades: { ...draft.grades, [gradeKey(id)]: list } };
}

/* ------------------------------ address chips ----------------------------- */

const entryKey = (entry: string) => normalizeEmail(entry);

/** Is this chip a valid address? (valid chips are stored normalised, invalid ones as typed). */
export function isValidEmailEntry(entry: string): boolean {
  return isEmail(normalizeEmail(entry));
}

export interface AddEntriesResult {
  list: string[];
  /** Entries appended (valid + invalid). */
  added: number;
  /** Entries already in the list (or repeated in the text). */
  duplicates: number;
}

/**
 * Typed / pasted text → entries appended to `list`: valid addresses normalised, invalid ones as typed (so the user
 * sees and fixes them), duplicates of the list skipped. Separators: comma, semicolon, spaces, line breaks;
 * "Tên <a@b.vn>" keeps only the address.
 */
export function addEmailEntries(list: readonly string[], text: string): AddEntriesResult {
  const { valid, invalid } = parseEmailList(text);
  const seen = new Set(list.map(entryKey));
  const out = [...list];
  let added = 0;
  let duplicates = 0;
  for (const entry of [...valid, ...invalid]) {
    const key = entryKey(entry);
    if (!key) continue;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    out.push(entry);
    added += 1;
  }
  return { list: out, added, duplicates };
}

export function removeEntry(list: readonly string[], entry: string): string[] {
  return list.filter((e) => e !== entry);
}

export function invalidEmailEntries(list: readonly string[]): string[] {
  return list.filter((e) => !isValidEmailEntry(e));
}

/**
 * Valid addresses outside the allowed domains (emails to them are dropped at send time). Empty `domains` (nothing
 * known yet – mail not configured) → [] so the editor does not flag every address.
 */
export function blockedEmailEntries(list: readonly string[], domains: readonly string[]): string[] {
  if (domains.length === 0) return [];
  return list.filter((e) => isValidEmailEntry(e) && !isAllowedDomain(e, domains));
}

/* ------------------------- per-email recipient limit ---------------------- */

/**
 * Addresses of a list that a report email would carry: valid ones, normalised, deduplicated and – when `domains` is
 * known – inside the allowed domains (the recipients endpoint and the send drop the others).
 */
function sendableEmails(list: readonly string[], domains: readonly string[]): string[] {
  const valid = [...new Set(list.filter(isValidEmailEntry).map(normalizeEmail))];
  return domains.length > 0 ? valid.filter((e) => isAllowedDomain(e, domains)) : valid;
}

export interface RecipientOverflow {
  /** Ban Giám hiệu or a Tổ khối. */
  id: Exclude<MailListId, "cc">;
  /** Distinct recipients of its report email: the list ∪ "Luôn gửi kèm (CC)". */
  total: number;
}

export interface RecipientCapacity {
  /** Lists whose report email, with the CC list, would exceed MAIL_MAX_RECIPIENTS (display order). */
  over: RecipientOverflow[];
  /** The CC list alone fills the limit: every report email with any other recipient (GVCN too) would exceed it. */
  ccFull: boolean;
}

/**
 * Non-blocking check of the per-email limit the send enforces (report-send.ts planReportTargets: To ∪ CC, deduplicated,
 * ≤ MAIL_MAX_RECIPIENTS – a batch with one email over it is refused). A list or CC already over the limit on its own
 * is a field error (validateMailDraft) and is not repeated here.
 */
export function recipientCapacity(draft: MailDraft, levelId: LevelId, domains: readonly string[]): RecipientCapacity {
  const cc = sendableEmails(draft.cc, domains);
  if (cc.length > MAIL_MAX_RECIPIENTS) return { over: [], ccFull: false };
  const over: RecipientOverflow[] = [];
  for (const id of mailListIds(levelId)) {
    if (id === "cc") continue;
    const to = sendableEmails(mailList(draft, id), domains);
    if (to.length === 0 || to.length > MAIL_MAX_RECIPIENTS) continue;
    const total = new Set([...to, ...cc]).size;
    if (total > MAIL_MAX_RECIPIENTS) over.push({ id, total });
  }
  return { over, ccFull: cc.length === MAIL_MAX_RECIPIENTS };
}

/** Warning under a list whose report email would exceed the limit. */
export function overflowWarning(o: RecipientOverflow): string {
  return `Thư báo cáo ${mailListLabel(o.id)} sẽ có ${o.total} người nhận (kể cả CC), quá giới hạn ${MAIL_MAX_RECIPIENTS} người nhận mỗi thư nên sẽ không gửi được. Bớt địa chỉ ở danh sách này hoặc ở “${mailListLabel("cc")}”.`;
}

/** Warning under "Luôn gửi kèm (CC)"; undefined when no report email would exceed the limit. */
export function ccOverflowWarning(c: RecipientCapacity): string | undefined {
  if (c.ccFull) {
    return `Danh sách đã đủ ${MAIL_MAX_RECIPIENTS} địa chỉ: mọi thư báo cáo (kể cả thư cho GVCN) đều có thêm người nhận nên sẽ vượt giới hạn ${MAIL_MAX_RECIPIENTS} người nhận mỗi thư và không gửi được.`;
  }
  if (c.over.length === 0) return undefined;
  const labels = c.over.map((o) => mailListLabel(o.id)).join(", ");
  return `Cộng với danh sách này, thư báo cáo ${labels} vượt giới hạn ${MAIL_MAX_RECIPIENTS} người nhận mỗi thư nên sẽ không gửi được.`;
}

/* --------------------------------- domains -------------------------------- */

/** "a.edu.vn, @B.edu.vn; c" → ["a.edu.vn", "b.edu.vn", "c"] (normalised, deduplicated, invalid kept). */
export function parseDomainList(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map(normalizeDomain).filter(Boolean))];
}

export function domainListText(domains: readonly string[]): string {
  return domains.join(", ");
}

export function invalidDomainEntries(domains: readonly string[]): string[] {
  return domains.filter((d) => !isDomain(d));
}

/** Domains the draft would allow: its valid domains, or the sender's domain when it lists none. */
export function draftAllowedDomains(draft: Pick<MailDraft, "allowedDomains">, status: Pick<MailStatus, "sender">): string[] {
  return effectiveAllowedDomains(draft.allowedDomains, status.sender);
}

/** Domain of the sending mailbox ("" when unknown) – placeholder of "Tên miền được phép". */
export function senderDomain(status: Pick<MailStatus, "sender">): string {
  return status.sender ? domainOf(status.sender) : "";
}

/* -------------------------------- validation ------------------------------ */

const quoteList = (items: readonly string[], max = 3) => {
  const shown = items.slice(0, max).join(", ");
  return items.length > max ? `${shown} và ${items.length - max} mục khác` : shown;
};

function listError(list: readonly string[]): string | undefined {
  const invalid = invalidEmailEntries(list);
  if (invalid.length > 0) return `Địa chỉ email không hợp lệ: ${quoteList(invalid)}.`;
  if (list.length > MAIL_MAX_RECIPIENTS) return `Tối đa ${MAIL_MAX_RECIPIENTS} địa chỉ (đang có ${list.length}).`;
  return undefined;
}

/** Schema / server path ("report.bgh.0", "report.grades.6.2", "allowedDomains.1") → draft field. */
export function mailFieldOfPath(path: string): MailField | undefined {
  const parts = path.trim().split(".");
  if (parts[0] === "allowedDomains") return "allowedDomains";
  if (parts[0] !== "report") return undefined;
  if (parts[1] === "bgh" || parts[1] === "cc") return parts[1];
  if (parts[1] === "grades" && parts[2] && /^\d{1,2}$/.test(parts[2])) return `grade-${Number(parts[2])}`;
  return undefined;
}

/** Field errors (Vietnamese), then the contract schema as a final guard. */
export function validateMailDraft(draft: MailDraft, levelId: LevelId): MailErrors {
  const e: MailErrors = {};
  for (const id of mailListIds(levelId)) {
    const msg = listError(mailList(draft, id));
    if (msg) e[id] = msg;
  }
  const badDomains = invalidDomainEntries(draft.allowedDomains);
  if (badDomains.length > 0) e.allowedDomains = `Tên miền không hợp lệ: ${quoteList(badDomains)} – ví dụ: example.edu.vn.`;
  else if (draft.allowedDomains.length > MAIL_DOMAINS_MAX) e.allowedDomains = `Tối đa ${MAIL_DOMAINS_MAX} tên miền.`;

  const parsed = MailSettingsSchema.safeParse(mailPayload(draft));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = mailFieldOfPath(issue.path.join("."));
      if (key && !e[key]) e[key] = issue.message;
    }
  }
  return e;
}

/* --------------------------------- payload -------------------------------- */

const cleanEmails = (list: readonly string[]) => [...new Set(list.map(normalizeEmail).filter(Boolean))];

/** PUT /api/settings/:level/mail body: normalised, deduplicated lists; grades with no address are left out. */
export function mailPayload(draft: MailDraft): MailSettingsInput {
  const grades: Record<string, string[]> = {};
  for (const [g, list] of Object.entries(draft.grades)) {
    const clean = cleanEmails(list);
    if (clean.length > 0) grades[g] = clean;
  }
  return {
    notices: { ...draft.notices },
    report: { bgh: cleanEmails(draft.bgh), grades, cc: cleanEmails(draft.cc) },
    allowedDomains: [...new Set(draft.allowedDomains.map(normalizeDomain).filter(Boolean))],
    baseRev: draft.rev,
  };
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Labels of the parts that differ from the saved settings ("Đã sửa: …" of the SaveBar). */
export function changedMailParts(draft: MailDraft, base: MailDraft, levelId: LevelId): string[] {
  const out: string[] = [];
  const n = draft.notices;
  const b = base.notices;
  if (n.enabled !== b.enabled || n.incidents !== b.incidents || n.rewards !== b.rewards) out.push("Thông báo GVCN");
  for (const id of mailListIds(levelId)) if (!sameList(mailList(draft, id), mailList(base, id))) out.push(mailListLabel(id));
  if (!sameList(draft.allowedDomains, base.allowedDomains)) out.push("Tên miền được phép");
  return out;
}

/** Field errors from server validation issues (`validationIssues(err)`); unmatched messages are returned apart. */
export function mailServerErrors(issues: ReadonlyArray<{ path: string; message: string }>): { fields: MailErrors; general: string[] } {
  const fields: MailErrors = {};
  const general: string[] = [];
  for (const i of issues) {
    const key = mailFieldOfPath(i.path);
    if (key && !fields[key]) fields[key] = i.message;
    else if (!key && !general.includes(i.message)) general.push(i.message);
  }
  return { fields, general };
}

/* ------------------------------ notices card ------------------------------ */

export interface NoticeCoverage {
  total: number;
  withEmail: number;
  /** Classes without an allowed GVCN address (natural order). */
  missing: ReportMailClassRecipients[];
}

/** "x/y lớp có email GVCN" from GET /api/reports/mail/recipients (addresses already filtered by domain). */
export function noticeCoverage(classes: readonly ReportMailClassRecipients[]): NoticeCoverage {
  const missing = classes.filter((c) => c.missing || c.recipients.length === 0).sort((a, b) => naturalCompare(a.classCode, b.classCode));
  return { total: classes.length, withEmail: classes.length - missing.length, missing };
}

/** Warning of the notices card for the current draft, or undefined when everything is consistent. */
export function noticesWarning(notices: MailDraft["notices"], configured: boolean): string | undefined {
  if (!notices.enabled) return undefined;
  if (!notices.incidents && !notices.rewards) return "Đã bật nhưng chưa chọn loại thông báo nào: GVCN sẽ không nhận được thư.";
  if (!configured) return "Chưa cấu hình gửi thư: thông báo chỉ được gửi sau khi quản trị CNTT hoàn tất kết nối (thẻ Kết nối gửi thư).";
  return undefined;
}
