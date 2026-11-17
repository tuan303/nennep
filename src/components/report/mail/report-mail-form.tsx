"use client";
/**
 * Compose view of "Gửi email" (Báo cáo tuần/tháng): Ban Giám hiệu, Tổ khối (one row per grade), GVCN từng lớp (select
 * all, per khối, per class; classes without GVCN email disabled), editable addresses per row, options and "Lời nhắn".
 * Stateless apart from which rows are expanded and the "Thêm" inputs – the draft lives in useReportMail.
 */
import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronUp, Pencil, Plus, Settings, X } from "lucide-react";
import { Badge, Button, Checkbox, Field, IconButton, Input, Switch, Textarea, buttonClasses } from "@/components/ui";
import { MAIL_NOTE_MAX } from "@/lib/constants";
import type { ReportMailRecipientsResponse } from "@/lib/contract";
import {
  addAddresses,
  addResultMessage,
  addressPreview,
  blockedNotice,
  canCheckRow,
  domainsUnknownNotice,
  classSelection,
  groupTargetRows,
  onAddresses,
  removeAddress,
  selfCcProblem,
  setAddressOn,
  setClassesChecked,
  setTargetChecked,
  targetOf,
  NO_DOMAINS_MESSAGE,
  type MailDraft,
  type MailDraftIssues,
  type MailTargetRow,
} from "./lib/mail-draft";
import { MailNotice } from "./mail-notice";

/** Cài đặt → Email (tab registered by the settings screen). */
export const MAIL_SETTINGS_HREF = "/cai-dat?tab=email";

type DraftUpdate = (update: (d: MailDraft) => MailDraft) => void;

export interface ReportMailFormProps {
  data: ReportMailRecipientsResponse;
  rows: readonly MailTargetRow[];
  draft: MailDraft;
  onDraft: DraftUpdate;
  issues: MailDraftIssues;
  planDirty: boolean;
  /** settings.manage: link to Cài đặt → Email and the missing variable names. */
  canManageMail: boolean;
  selfEmail?: string;
  sendError?: string;
  /** While the send request runs. */
  disabled?: boolean;
  /** Row expanded at first (the toolbar's recipient). */
  initialOpenKey?: string;
}

export function ReportMailForm(props: ReportMailFormProps) {
  const { data, rows, draft, onDraft, issues, disabled } = props;
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(props.initialOpenKey ? [props.initialOpenKey] : []));
  const groups = groupTargetRows(rows);
  const status = data.status;
  const domains = status.allowedDomains;
  const selfProblem = selfCcProblem(props.selfEmail, domains);
  const domainsKnown = domains.length > 0;
  const blocked = blockedNotice(data.blocked, undefined, domainsKnown);
  // Report PDFs are off on the server (no print-job key): every email goes out with the report link only.
  const pdfOff = !!status.pdfWarning;
  const settingsLink = props.canManageMail ? (
    <Link href={MAIL_SETTINGS_HREF} className={buttonClasses({ variant: "secondary", size: "sm" })}>
      <Settings aria-hidden className="size-4" strokeWidth={2.25} />
      Mở Cài đặt → Email
    </Link>
  ) : undefined;
  const allClasses = classSelection(draft, rows);

  const toggle = (key: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const rowProps = { draft, onDraft, issues, domains, expanded, onToggle: toggle, disabled };

  return (
    <div className="flex flex-col gap-5">
      {props.sendError ? (
        <MailNotice tone="bad" live title="Chưa gửi được báo cáo">
          {props.sendError}
        </MailNotice>
      ) : null}
      {!status.configured ? (
        <MailNotice tone="warn" title="Chưa cấu hình gửi email" action={settingsLink}>
          {props.canManageMail
            ? `Phần mềm chưa có kết nối Microsoft 365 để gửi thư${status.missing.length > 0 ? ` (thiếu ${status.missing.join(", ")})` : ""}. Bộ phận CNTT khai báo các biến môi trường trên Vercel rồi triển khai lại – xem hướng dẫn trong Cài đặt → Email.`
            : "Phần mềm chưa có kết nối gửi thư. Vui lòng liên hệ quản trị viên để cấu hình trong Cài đặt → Email."}
        </MailNotice>
      ) : null}
      {!domainsKnown ? (
        // Shown with or without "Chưa cấu hình": saving "Tên miền được phép" is a separate step of Cài đặt → Email.
        <MailNotice tone="warn" title={NO_DOMAINS_MESSAGE} action={status.configured ? settingsLink : undefined}>
          {domainsUnknownNotice(props.canManageMail, data.blocked.length)}
        </MailNotice>
      ) : null}
      {status.configured && status.pdfWarning ? (
        // Only once sending works (until then "Chưa cấu hình" is the problem); the settings link is shown once.
        <MailNotice tone="warn" title="File PDF đính kèm đang tắt" action={domainsKnown ? settingsLink : undefined}>
          Thư vẫn được gửi, có liên kết mở báo cáo trên phần mềm nhưng không kèm file PDF.{" "}
          {props.canManageMail ? `Lý do: ${status.pdfWarning}` : "Vui lòng báo quản trị viên để bật lại file PDF đính kèm."}
        </MailNotice>
      ) : null}
      {props.planDirty ? (
        <MailNotice tone="warn" title="Lưu công tác phối hợp trước khi gửi">
          {pdfOff ? "Thư dùng nội dung đã lưu." : "Thư và file PDF đính kèm dùng nội dung đã lưu."} Bấm “Lưu” ở khung công tác phối hợp rồi gửi.
        </MailNotice>
      ) : null}
      {blocked ? <MailNotice tone="warn">{blocked}</MailNotice> : null}
      {status.configured ? (
        <p className="text-[13px] leading-5 text-slate-500">
          Gửi từ <span className="break-all font-medium text-slate-700">{senderLine(status.sender, status.senderName)}</span>
          {domains.length > 0 ? ` · chỉ gửi tới ${domains.map((d) => `@${d}`).join(", ")}` : ""}.{" "}
          {pdfOff
            ? "Mỗi dòng được chọn là một thư riêng, có liên kết mở báo cáo của người nhận đó (không kèm file PDF)."
            : "Mỗi dòng được chọn là một thư riêng, kèm file PDF báo cáo của người nhận đó."}
        </p>
      ) : null}

      {groups.bgh ? (
        <MailGroup title="Ban Giám hiệu">
          <ul className="flex flex-col gap-2">
            <TargetRowView row={groups.bgh} emptyHint="Chưa cài đặt email Ban Giám hiệu – bấm “Sửa” để thêm địa chỉ." {...rowProps} />
          </ul>
        </MailGroup>
      ) : null}

      {groups.grades.length > 0 ? (
        <MailGroup title="Tổ khối">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {groups.grades.map((row) => (
              <TargetRowView key={row.key} row={row} emptyHint="Chưa cài đặt email tổ khối – bấm “Sửa” để thêm địa chỉ." {...rowProps} />
            ))}
          </ul>
        </MailGroup>
      ) : null}

      {groups.classes.length > 0 ? (
        <MailGroup
          title="GVCN từng lớp"
          aside={
            <Checkbox
              checked={allClasses.state}
              onChange={(on) => onDraft((d) => setClassesChecked(d, rows, on))}
              disabled={disabled || allClasses.total === 0}
              label={`Chọn tất cả (${allClasses.checked.toLocaleString("vi-VN")}/${allClasses.total.toLocaleString("vi-VN")} lớp)`}
            />
          }
        >
          <div className="flex flex-col gap-4">
            {groups.classes.map((group) => {
              const sel = classSelection(draft, rows, group.grade);
              return (
                <div key={group.label} className="flex flex-col gap-1.5">
                  {group.grade !== undefined && groups.classes.length > 1 ? (
                    <Checkbox
                      checked={sel.state}
                      onChange={(on) => onDraft((d) => setClassesChecked(d, rows, on, group.grade))}
                      disabled={disabled || sel.total === 0}
                      label={<span className="font-semibold text-brand-900">{`${group.label} (${sel.checked.toLocaleString("vi-VN")}/${sel.total.toLocaleString("vi-VN")})`}</span>}
                    />
                  ) : (
                    <p className="text-[13px] font-semibold text-brand-900">{group.label}</p>
                  )}
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.rows.map((row) => (
                      <TargetRowView key={row.key} row={row} {...rowProps} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </MailGroup>
      ) : null}

      <MailGroup title="Tùy chọn">
        <div className="flex flex-col gap-1">
          <Switch
            size="sm"
            checked={draft.detail}
            onChange={(detail) => onDraft((d) => ({ ...d, detail }))}
            disabled={disabled}
            label="Kèm bảng chi tiết sự việc"
            description={pdfOff ? "Thêm bảng liệt kê từng sự việc vào báo cáo mở từ liên kết trong thư." : "Thêm bảng liệt kê từng sự việc vào file PDF đính kèm."}
          />
          <Switch
            size="sm"
            checked={draft.ccSelf && !selfProblem}
            onChange={(ccSelf) => onDraft((d) => ({ ...d, ccSelf }))}
            disabled={disabled || !!selfProblem}
            label="Gửi bản sao cho tôi"
            description={selfProblem ?? `Mỗi thư được gửi kèm (CC) tới ${props.selfEmail ?? ""}.`}
          />
          {data.cc.length > 0 ? (
            <p className="break-words text-[13px] leading-5 text-slate-500">
              Luôn gửi kèm (CC) theo cài đặt: <span className="text-slate-700">{data.cc.join(", ")}</span>
            </p>
          ) : null}
        </div>
        <Field
          label="Lời nhắn"
          labelAside={<span className="num">{`${draft.note.length.toLocaleString("vi-VN")}/${MAIL_NOTE_MAX.toLocaleString("vi-VN")}`}</span>}
          hint="Không bắt buộc – hiện ở đầu thư, trước phần tóm tắt báo cáo."
        >
          <Textarea
            rows={3}
            value={draft.note}
            maxLength={MAIL_NOTE_MAX}
            disabled={disabled}
            placeholder="VD: Kính gửi thầy cô báo cáo nền nếp của kỳ này, đề nghị các lớp lưu ý các lỗi nổi bật."
            onChange={(e) => {
              const note = e.target.value;
              onDraft((d) => ({ ...d, note }));
            }}
          />
        </Field>
      </MailGroup>
    </div>
  );
}

/** "Nền nếp NSHM <nennep@example.edu.vn>" | the address alone. */
function senderLine(sender?: string, name?: string): string {
  if (!sender) return name ?? "";
  return name ? `${name} <${sender}>` : sender;
}

function MailGroup({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 id={id} className="text-[14px] font-semibold leading-6 text-brand-900">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

interface TargetRowViewProps {
  row: MailTargetRow;
  draft: MailDraft;
  onDraft: DraftUpdate;
  issues: MailDraftIssues;
  domains: readonly string[];
  expanded: ReadonlySet<string>;
  onToggle: (key: string) => void;
  disabled?: boolean;
  /** Shown when the row has no address at all (BGH / tổ khối not configured). */
  emptyHint?: string;
}

/** One email: checkbox + who + address preview; "Sửa" opens the address editor. */
function TargetRowView({ row, draft, onDraft, issues, domains, expanded, onToggle, disabled, emptyHint }: TargetRowViewProps) {
  const editorId = useId();
  const target = targetOf(draft, row.key);
  const on = onAddresses(target);
  const open = expanded.has(row.key) && !row.missing;
  const issue = issues.targets[row.key];
  // Without any allowed domain every address was dropped: "no address" is not the row's fault (see the notice above).
  const preview =
    domains.length === 0 && on.length === 0
      ? `${NO_DOMAINS_MESSAGE} – xem thông báo phía trên.`
      : row.missing
        ? "Khai báo email GVCN ở Cài đặt → Lớp & GVCN."
        : target.addresses.length === 0
          ? (emptyHint ?? "Chưa có địa chỉ – bấm “Sửa” để thêm.")
          : on.length === 0
            ? "Chưa chọn địa chỉ nào"
            : addressPreview(on);

  return (
    <li className="flex min-w-0 flex-col rounded-control border border-border bg-surface" data-mail-target={row.key}>
      <div className="flex items-start gap-1 pl-3 pr-1">
        <Checkbox
          className="min-w-0 flex-1"
          checked={target.checked && canCheckRow(row, target)}
          onChange={(checked) => onDraft((d) => setTargetChecked(d, row.key, checked))}
          disabled={disabled || !canCheckRow(row, target)}
          label={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="num font-semibold">{row.label}</span>
              {row.teacher ? <span className="font-normal text-slate-600">{row.teacher}</span> : null}
              {row.missing ? (
                <Badge tone="muted" size="sm">
                  Chưa có email GVCN
                </Badge>
              ) : null}
            </span>
          }
          description={
            <>
              <span className={on.length > 0 && !row.missing ? "break-all" : "break-words"}>{preview}</span>
              {issue ? <span className="mt-0.5 block font-medium text-bad-strong">{issue}</span> : null}
            </>
          }
        />
        {!row.missing ? (
          <Button
            variant="ghost"
            size="sm"
            icon={open ? ChevronUp : Pencil}
            className="mt-0.5 shrink-0 px-2.5"
            aria-label={open ? `Thu gọn người nhận của ${row.addressee}` : `Sửa người nhận của ${row.addressee}`}
            aria-expanded={open}
            aria-controls={open ? editorId : undefined}
            onClick={() => onToggle(row.key)}
          >
            {open ? "Thu gọn" : "Sửa"}
          </Button>
        ) : null}
      </div>
      {open ? (
        <div id={editorId} className="border-t border-border px-3 pb-3 pt-2">
          <AddressEditor row={row} draft={draft} onDraft={onDraft} domains={domains} disabled={disabled} />
        </div>
      ) : null}
    </li>
  );
}

/** Addresses of one email: tick / untick, remove the ones typed here, add (paste many at once). */
function AddressEditor({ row, draft, onDraft, domains, disabled }: Pick<TargetRowViewProps, "row" | "draft" | "onDraft" | "domains" | "disabled">) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const target = targetOf(draft, row.key);

  function add() {
    if (!text.trim()) return;
    const res = addAddresses(draft, row.key, text, domains);
    if (res.added.length > 0) onDraft((d) => addAddresses(d, row.key, text, domains).draft);
    setText(res.rest);
    setError(addResultMessage(res, domains));
  }

  return (
    <div className="flex flex-col gap-2">
      {target.addresses.length > 0 ? (
        <ul className="flex flex-col" aria-label={`Địa chỉ nhận của ${row.addressee}`}>
          {target.addresses.map((a) => (
            <li key={a.email} className="flex min-w-0 items-center gap-1">
              <Checkbox
                className="min-w-0 flex-1"
                checked={a.on}
                onChange={(checked) => onDraft((d) => setAddressOn(d, row.key, a.email, checked))}
                disabled={disabled}
                label={<span className="break-all font-normal">{a.email}</span>}
              />
              {a.added ? (
                <IconButton icon={X} label={`Bỏ ${a.email}`} size="sm" disabled={disabled} onClick={() => onDraft((d) => removeAddress(d, row.key, a.email))} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex min-w-0 gap-2">
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          disabled={disabled}
          invalid={!!error}
          inputMode="email"
          autoComplete="off"
          spellCheck={false}
          placeholder="Thêm email (dán được nhiều địa chỉ)"
          aria-label={`Thêm địa chỉ nhận cho ${row.addressee}`}
          wrapperClassName="min-w-0 flex-1"
        />
        <Button variant="secondary" icon={Plus} onClick={add} disabled={disabled || !text.trim()}>
          Thêm
        </Button>
      </div>
      {error ? (
        <p role="alert" className="break-words text-[13px] font-medium leading-5 text-bad-strong">
          {error}
        </p>
      ) : null}
    </div>
  );
}
