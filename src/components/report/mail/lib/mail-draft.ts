/**
 * "Gửi email" of Báo cáo tuần/tháng – pure view model of the send dialog. One target (= one email, one job) per
 * recipient of the report the sender may address (Ban Giám hiệu, Tổ khối N, GVCN lớp X); the default selection is the
 * recipient chosen in the toolbar; every target's addresses can be unticked or extended before sending. Builds the
 * summary line, the validation and the POST /api/reports/mail body. Unit-tested in ../__tests__/mail-draft.test.ts.
 */
import { MAIL_MAX_RECIPIENTS, MAIL_MAX_TARGETS, MAIL_NOTE_MAX } from "@/lib/constants";
import type { ReportMailRecipientsResponse, ReportMailSendInput } from "@/lib/contract";
import { dedupeEmails, isAllowedDomain, normalizeEmail, parseEmailList } from "@/lib/mail/address";
import type { ClassInfo, LevelId } from "@/lib/types";
import type { Recipient, RecipientOption } from "../../lib/report-model";
import type { ReportPlanPeriod } from "../../lib/report-plan";

/* ---------------------------------- Rows ---------------------------------- */

export interface MailTargetRow {
  /** Recipient key of the report ("bgh" | "khoi-6" | "lop-6A01") = `to` of the target. */
  key: string;
  kind: Recipient["kind"];
  /** Row label: "Ban Giám hiệu" | "Tổ khối 6" | "6A01". */
  label: string;
  /** Who the email is for, in messages: "Ban Giám hiệu" | "Tổ khối 6" | "GVCN lớp 6A01". */
  addressee: string;
  grade?: number;
  /** ClassInfo.homeroomTeacher (class rows). */
  teacher?: string;
  /** Default addresses (inside the allowed domains): Cài đặt → Email lists, or the GVCN of the class. */
  defaults: string[];
  /** Class without an allowed GVCN address: cannot receive its report ("Chưa có email GVCN"). */
  missing: boolean;
}

type ClassLite = Pick<ClassInfo, "code" | "grade" | "homeroomTeacher">;

/**
 * Rows of the dialog, in the order of the toolbar's recipient options (BGH, tổ khối, classes) – only recipients the
 * sender may address. Addresses come from GET /api/reports/mail/recipients; `classes` (the dataset) fills in the
 * grade / teacher of a class the response does not list (then it has no address).
 */
export function mailTargetRows(
  res: Pick<ReportMailRecipientsResponse, "bgh" | "grades" | "classes">,
  options: readonly RecipientOption[],
  classes: readonly ClassLite[] = [],
): MailTargetRow[] {
  const grades = new Map(res.grades.map((g) => [g.grade, g.recipients] as const));
  const listed = new Map(res.classes.map((c) => [c.classCode, c] as const));
  const info = new Map(classes.map((c) => [c.code, c] as const));
  return options.map((o): MailTargetRow => {
    const r = o.recipient;
    if (r.kind === "bgh") return { key: o.key, kind: "bgh", label: "Ban Giám hiệu", addressee: "Ban Giám hiệu", defaults: dedupeEmails(res.bgh), missing: false };
    if (r.kind === "grade") {
      const label = `Tổ khối ${r.grade}`;
      return { key: o.key, kind: "grade", label, addressee: label, grade: r.grade, defaults: dedupeEmails(grades.get(r.grade) ?? []), missing: false };
    }
    const c = listed.get(r.classCode);
    const ci = info.get(r.classCode);
    const defaults = dedupeEmails(c?.recipients ?? []);
    const teacher = (c?.teacher ?? ci?.homeroomTeacher)?.trim();
    const grade = c?.grade ?? ci?.grade;
    return {
      key: o.key,
      kind: "class",
      label: r.classCode,
      addressee: `GVCN lớp ${r.classCode}`,
      ...(grade !== undefined ? { grade } : {}),
      ...(teacher ? { teacher } : {}),
      defaults,
      missing: defaults.length === 0,
    };
  });
}

export interface MailClassGroup {
  /** undefined: classes whose grade is unknown. */
  grade?: number;
  /** "Khối 6" | "Khác". */
  label: string;
  rows: MailTargetRow[];
}

export interface MailTargetGroups {
  bgh?: MailTargetRow;
  grades: MailTargetRow[];
  /** Class rows per grade, in row order. */
  classes: MailClassGroup[];
}

/** Sections of the dialog: "Ban Giám hiệu", "Tổ khối", "GVCN từng lớp" (by khối). */
export function groupTargetRows(rows: readonly MailTargetRow[]): MailTargetGroups {
  const classes: MailClassGroup[] = [];
  for (const row of rows) {
    if (row.kind !== "class") continue;
    let group = classes.find((g) => g.grade === row.grade);
    if (!group) {
      group = { ...(row.grade !== undefined ? { grade: row.grade } : {}), label: row.grade !== undefined ? `Khối ${row.grade}` : "Khác", rows: [] };
      classes.push(group);
    }
    group.rows.push(row);
  }
  return { bgh: rows.find((r) => r.kind === "bgh"), grades: rows.filter((r) => r.kind === "grade"), classes };
}

/* ---------------------------------- Draft --------------------------------- */

export interface DraftAddress {
  email: string;
  /** Ticked: receives the email. */
  on: boolean;
  /** Typed in the dialog (removable), not a default of the row. */
  added: boolean;
}

export interface TargetDraft {
  checked: boolean;
  addresses: DraftAddress[];
}

export interface MailDraft {
  /** By row key; rows without an entry count as unchecked. */
  targets: Readonly<Record<string, TargetDraft>>;
  /** "Kèm bảng chi tiết sự việc". */
  detail: boolean;
  /** "Gửi bản sao cho tôi". */
  ccSelf: boolean;
  /** "Lời nhắn" (as typed; trimmed when sent). */
  note: string;
}

const EMPTY_TARGET: TargetDraft = { checked: false, addresses: [] };

/** Draft entry of a row (an unchecked empty one when absent). */
export function targetOf(draft: MailDraft, key: string): TargetDraft {
  return draft.targets[key] ?? EMPTY_TARGET;
}

/** Ticked addresses of a target. */
export function onAddresses(target: TargetDraft): string[] {
  return target.addresses.filter((a) => a.on).map((a) => a.email);
}

/** A row can be ticked when it is not a class without GVCN email and has at least one address. */
export function canCheckRow(row: MailTargetRow, target: TargetDraft): boolean {
  return !row.missing && target.addresses.length > 0;
}

/**
 * Initial draft: every row with its default addresses ticked; only the row of the toolbar's recipient (`selectedKey`)
 * is checked (when it can be sent). `detail` = the toolbar's "Kèm bảng chi tiết".
 */
export function initialMailDraft(rows: readonly MailTargetRow[], selectedKey: string, detail: boolean): MailDraft {
  const targets: Record<string, TargetDraft> = {};
  for (const row of rows) {
    const addresses = row.defaults.map((email) => ({ email, on: true, added: false }));
    targets[row.key] = { checked: row.key === selectedKey && !row.missing && addresses.length > 0, addresses };
  }
  return { targets, detail, ccSelf: false, note: "" };
}

/**
 * `draft` completed with the entries of `initial` for rows it does not know yet (the recipient list was loaded or
 * changed after the draft was edited). Known rows keep their edits.
 */
export function withNewRows(draft: MailDraft, initial: MailDraft): MailDraft {
  const added = Object.keys(initial.targets).filter((k) => !(k in draft.targets));
  if (added.length === 0) return draft;
  const targets: Record<string, TargetDraft> = { ...draft.targets };
  for (const k of added) targets[k] = initial.targets[k];
  return { ...draft, targets };
}

function withTarget(draft: MailDraft, key: string, update: (t: TargetDraft) => TargetDraft): MailDraft {
  const before = targetOf(draft, key);
  const after = update(before);
  return after === before ? draft : { ...draft, targets: { ...draft.targets, [key]: after } };
}

export function setTargetChecked(draft: MailDraft, key: string, checked: boolean): MailDraft {
  return withTarget(draft, key, (t) => (t.checked === checked ? t : { ...t, checked }));
}

/** Ticks / unticks one address of a target. */
export function setAddressOn(draft: MailDraft, key: string, email: string, on: boolean): MailDraft {
  return withTarget(draft, key, (t) => {
    if (!t.addresses.some((a) => a.email === email && a.on !== on)) return t;
    return { ...t, addresses: t.addresses.map((a) => (a.email === email ? { ...a, on } : a)) };
  });
}

/** Removes an address typed in the dialog (defaults are only unticked). Removing the last one unchecks the target. */
export function removeAddress(draft: MailDraft, key: string, email: string): MailDraft {
  return withTarget(draft, key, (t) => {
    if (!t.addresses.some((a) => a.email === email && a.added)) return t;
    const addresses = t.addresses.filter((a) => a.email !== email);
    return { checked: t.checked && addresses.length > 0, addresses };
  });
}

export interface AddAddressesResult {
  draft: MailDraft;
  /** Addresses newly added or ticked again. */
  added: string[];
  /** Entries that are not an email address (as typed). */
  invalid: string[];
  /** Valid addresses outside the allowed domains. */
  blocked: string[];
  /** What to leave in the input: the rejected entries, ", " separated ("" when everything was taken). */
  rest: string;
}

/**
 * Adds a typed / pasted list (comma, semicolon, space, line break; "Tên <a@b>" accepted) to a target: valid addresses
 * inside `allowedDomains` are added ticked (an existing one is ticked again) and the target becomes checked.
 */
export function addAddresses(draft: MailDraft, key: string, text: string, allowedDomains: readonly string[]): AddAddressesResult {
  const { valid, invalid } = parseEmailList(text);
  const blocked = valid.filter((e) => !isAllowedDomain(e, allowedDomains));
  const accepted = valid.filter((e) => isAllowedDomain(e, allowedDomains));
  const next =
    accepted.length === 0
      ? draft
      : withTarget(draft, key, (t) => {
          const known = new Set(t.addresses.map((a) => a.email));
          const addresses = t.addresses.map((a) => (accepted.includes(a.email) ? { ...a, on: true } : a));
          for (const email of accepted) if (!known.has(email)) addresses.push({ email, on: true, added: true });
          return { checked: true, addresses };
        });
  return { draft: next, added: accepted, invalid, blocked, rest: [...invalid, ...blocked].join(", ") };
}

/** Error under the "Thêm" input for the rejected entries; undefined when everything was added. */
export function addResultMessage(res: Pick<AddAddressesResult, "invalid" | "blocked">, allowedDomains: readonly string[]): string | undefined {
  const parts: string[] = [];
  if (res.invalid.length > 0) parts.push(`Không phải địa chỉ email: ${res.invalid.join(", ")}`);
  if (res.blocked.length > 0) {
    parts.push(
      allowedDomains.length > 0
        ? `Ngoài tên miền được phép (chỉ gửi tới ${allowedDomains.map((d) => `@${d}`).join(", ")}): ${res.blocked.join(", ")}`
        : `${NO_DOMAINS_MESSAGE} nên chưa thêm được: ${res.blocked.join(", ")}`,
    );
  }
  return parts.length > 0 ? parts.join(". ") : undefined;
}

export interface ClassSelection {
  /** Class rows that can be ticked. */
  total: number;
  checked: number;
  /** Value of the "Chọn tất cả" checkbox. */
  state: boolean | "indeterminate";
}

const classRowsOf = (rows: readonly MailTargetRow[], grade?: number) =>
  rows.filter((r) => r.kind === "class" && (grade === undefined || r.grade === grade));

/** Selection of the class rows (all, or one khối). */
export function classSelection(draft: MailDraft, rows: readonly MailTargetRow[], grade?: number): ClassSelection {
  const selectable = classRowsOf(rows, grade).filter((r) => canCheckRow(r, targetOf(draft, r.key)));
  const checked = selectable.filter((r) => targetOf(draft, r.key).checked).length;
  return { total: selectable.length, checked, state: checked === 0 ? false : checked === selectable.length ? true : "indeterminate" };
}

/** "Chọn tất cả" of the class rows (all, or one khối): rows that cannot be sent are left alone. */
export function setClassesChecked(draft: MailDraft, rows: readonly MailTargetRow[], checked: boolean, grade?: number): MailDraft {
  return classRowsOf(rows, grade).reduce(
    (d, r) => (canCheckRow(r, targetOf(d, r.key)) ? setTargetChecked(d, r.key, checked) : d),
    draft,
  );
}

/* --------------------------------- Results -------------------------------- */

export interface MailTarget {
  /** Recipient key of the report. */
  to: string;
  recipients: string[];
}

/** Targets that will be sent: checked rows (not "Chưa có email GVCN") with at least one ticked address. */
export function selectedTargets(draft: MailDraft, rows: readonly MailTargetRow[]): MailTarget[] {
  const out: MailTarget[] = [];
  for (const row of rows) {
    const t = targetOf(draft, row.key);
    if (!t.checked || row.missing) continue;
    const recipients = onAddresses(t);
    if (recipients.length > 0) out.push({ to: row.key, recipients });
  }
  return out;
}

export interface MailDraftIssues {
  /** First problem that blocks "Gửi" (Vietnamese); undefined when the draft can be sent. */
  message?: string;
  /** Per row key: why that checked row cannot be sent. */
  targets: Readonly<Record<string, string>>;
}

export const NO_TARGET_MESSAGE = "Chọn ít nhất 1 người nhận";

const count = (n: number) => n.toLocaleString("vi-VN");

/**
 * Validation of the draft against the limits of ReportMailSendSchema and of the server (report-send.ts
 * planReportTargets): every email also carries `cc` (= MailSummary.cc: "Luôn gửi kèm" ∪ the sender when "Gửi bản sao
 * cho tôi"), and its To + CC – a CC address already in To counted once – must stay ≤ MAIL_MAX_RECIPIENTS.
 */
export function mailDraftIssues(draft: MailDraft, rows: readonly MailTargetRow[], cc: readonly string[]): MailDraftIssues {
  const allCc = dedupeEmails(cc);
  const targets: Record<string, string> = {};
  let first: string | undefined;
  for (const row of rows) {
    const t = targetOf(draft, row.key);
    if (!t.checked || !canCheckRow(row, t)) continue;
    const to = dedupeEmails(onAddresses(t));
    const extraCc = allCc.filter((e) => !to.includes(e)).length;
    const issue =
      to.length === 0
        ? "Chưa chọn địa chỉ nhận"
        : to.length > MAIL_MAX_RECIPIENTS
          ? `Tối đa ${MAIL_MAX_RECIPIENTS} địa chỉ nhận mỗi thư`
          : to.length + extraCc > MAIL_MAX_RECIPIENTS
            ? `Tối đa ${MAIL_MAX_RECIPIENTS} người nhận mỗi thư (kể cả ${count(extraCc)} người nhận bản sao)`
            : undefined;
    if (!issue) continue;
    targets[row.key] = issue;
    first ??= `${row.addressee}: ${issue.charAt(0).toLocaleLowerCase("vi-VN")}${issue.slice(1)}`;
  }
  const selected = selectedTargets(draft, rows).length;
  const message =
    first ??
    (selected === 0
      ? NO_TARGET_MESSAGE
      : selected > MAIL_MAX_TARGETS
        ? `Tối đa ${MAIL_MAX_TARGETS} thư mỗi lần gửi`
        : draft.note.trim().length > MAIL_NOTE_MAX
          ? `Lời nhắn tối đa ${MAIL_NOTE_MAX} ký tự`
          : undefined);
  return { ...(message ? { message } : {}), targets };
}

export interface MailSummary {
  /** Emails that will be sent. */
  messages: number;
  /** Distinct addresses over every email (to + cc). */
  recipients: number;
  /** CC of every email: Cài đặt → Email "Luôn gửi kèm" ∪ the sender ("Gửi bản sao cho tôi"). */
  cc: string[];
}

export function mailSummary(draft: MailDraft, rows: readonly MailTargetRow[], cc: readonly string[], selfEmail?: string): MailSummary {
  const targets = selectedTargets(draft, rows);
  const allCc = dedupeEmails([...cc, ...(draft.ccSelf && selfEmail ? [selfEmail] : [])]);
  const everyone = new Set([...targets.flatMap((t) => t.recipients), ...allCc]);
  return { messages: targets.length, recipients: targets.length > 0 ? everyone.size : 0, cc: allCc };
}

/** "Sẽ gửi 3 thư · 7 người nhận" | "Chưa chọn người nhận". */
export function mailSummaryText(s: Pick<MailSummary, "messages" | "recipients">): string {
  return s.messages > 0 ? `Sẽ gửi ${count(s.messages)} thư · ${count(s.recipients)} người nhận` : "Chưa chọn người nhận";
}

/** Body of POST /api/reports/mail (`note` omitted when blank). */
export function reportMailInput(levelId: LevelId, period: ReportPlanPeriod, draft: MailDraft, rows: readonly MailTargetRow[]): ReportMailSendInput {
  const note = draft.note.trim();
  return {
    levelId,
    mode: period.mode,
    key: period.key,
    detail: draft.detail,
    ccSelf: draft.ccSelf,
    ...(note ? { note } : {}),
    targets: selectedTargets(draft, rows),
  };
}

export interface SendBlockInput {
  /** Load state of GET /api/reports/mail/recipients. */
  recipients: "loading" | "error" | "ready";
  /** MailStatus.configured. */
  configured: boolean;
  /** MailStatus.allowedDomains is not empty (without any domain every address is refused). */
  domainsKnown: boolean;
  /** Unsaved "Công tác phối hợp": the email and the PDF use the saved plan. */
  planDirty: boolean;
  issues: Pick<MailDraftIssues, "message">;
}

export const PLAN_DIRTY_MESSAGE = "Lưu công tác phối hợp trước khi gửi";
export const NOT_CONFIGURED_MESSAGE = "Chưa cấu hình gửi email";
/**
 * No allowed recipient domain (none saved in Cài đặt → Email and no sending mailbox): the recipients endpoint drops
 * every address and the server refuses any send.
 */
export const NO_DOMAINS_MESSAGE = "Chưa xác định tên miền nhận thư";

/** Why "Gửi" is disabled (Vietnamese, shown next to it); undefined when it can be clicked. */
export function sendBlockReason(s: SendBlockInput): string | undefined {
  if (s.recipients === "loading") return "Đang tải danh sách người nhận…";
  if (s.recipients === "error") return "Chưa tải được danh sách người nhận";
  if (!s.configured) return NOT_CONFIGURED_MESSAGE;
  if (!s.domainsKnown) return NO_DOMAINS_MESSAGE;
  if (s.planDirty) return PLAN_DIRTY_MESSAGE;
  return s.issues.message;
}

/** Why "Gửi bản sao cho tôi" is unavailable; undefined when the sender's own address may receive the copy. */
export function selfCcProblem(selfEmail: string | undefined, allowedDomains: readonly string[]): string | undefined {
  const email = selfEmail ? normalizeEmail(selfEmail) : "";
  if (!email) return "Tài khoản của bạn chưa có địa chỉ email.";
  if (allowedDomains.length === 0) return `${NO_DOMAINS_MESSAGE}.`;
  if (!isAllowedDomain(email, allowedDomains)) return `Email của bạn (${email}) không thuộc tên miền được phép nhận thư.`;
  return undefined;
}

/**
 * Why nothing can be sent when no recipient domain is known, and where to fix it (Cài đặt → Email). `canManage`
 * (settings.manage) gets the steps; the others are told to ask an administrator. `hidden` = settings addresses
 * dropped for that reason (`blocked` of the recipients response).
 */
export function domainsUnknownNotice(canManage: boolean, hidden: number): string {
  const lost = hidden > 0 ? ` (kể cả ${count(hidden)} địa chỉ đã lưu trong cài đặt)` : "";
  return canManage
    ? `Cài đặt chưa có “Tên miền được phép” và chưa khai báo hộp thư gửi, nên phần mềm chưa biết địa chỉ nào được nhận thư: mọi địa chỉ${lost} đều bị chặn và chưa gửi được báo cáo. Mở Cài đặt → Email, nhập “Tên miền được phép” (ví dụ: example.edu.vn) rồi bấm Lưu.`
    : `Cài đặt gửi thư chưa có tên miền nhận thư, nên mọi địa chỉ${lost} đều bị chặn và chưa gửi được báo cáo. Vui lòng liên hệ quản trị viên để khai báo “Tên miền được phép” trong Cài đặt → Email.`;
}

/** "a@example.edu.vn, b@example.edu.vn" | "a@example.edu.vn, b@example.edu.vn và 3 địa chỉ khác" | "Chưa có địa chỉ". */
export function addressPreview(emails: readonly string[], max = 2): string {
  if (emails.length === 0) return "Chưa có địa chỉ";
  const shown = emails.slice(0, max).join(", ");
  const more = emails.length - max;
  return more > 0 ? `${shown} và ${count(more)} địa chỉ khác` : shown;
}

/**
 * Notice about the settings addresses dropped by the domain filter; undefined when none – and when no domain is known
 * at all (`domainsKnown` false: every address is dropped, domainsUnknownNotice explains why instead).
 */
export function blockedNotice(blocked: readonly string[], max = 5, domainsKnown = true): string | undefined {
  if (blocked.length === 0 || !domainsKnown) return undefined;
  const list = blocked.slice(0, max).join(", ") + (blocked.length > max ? ", …" : "");
  return `${count(blocked.length)} địa chỉ trong cài đặt không thuộc tên miền được phép nên không được gửi: ${list}`;
}
