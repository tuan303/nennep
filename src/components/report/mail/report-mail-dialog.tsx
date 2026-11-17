"use client";
/**
 * "Gửi email" of Báo cáo tuần/tháng (report.send): bottom sheet on phones (full height), drawer on larger screens.
 * Compose (recipients, options, note) → "Gửi" → progress of the batch. The batch is followed (and toasted) by the batch
 * store (use-batch-watches.ts) whether the sheet is open, closed or unmounted; a batch with failed / skipped emails is
 * shown again on reopening (with "Gửi lại") until "Gửi thư khác" starts a new message.
 */
import { CircleAlert, MailPlus, RefreshCw, Send } from "lucide-react";
import { Button, ErrorState, Sheet, SkeletonText } from "@/components/ui";
import { LEVELS } from "@/lib/constants";
import type { ClassInfo, LevelId } from "@/lib/types";
import type { RecipientOption } from "../lib/report-model";
import type { ReportPlanPeriod } from "../lib/report-plan";
import { NO_TARGET_MESSAGE, mailSummaryText } from "./lib/mail-draft";
import { ReportMailForm } from "./report-mail-form";
import { ReportMailProgress } from "./report-mail-progress";
import { useReportMail, type ReportMailState } from "./use-report-mail";

export interface ReportMailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  levelId: LevelId;
  period: ReportPlanPeriod;
  /** "Tuần 19/10 – 25/10/2026". */
  periodLabel: string;
  /** Recipient options of the toolbar. */
  options: readonly RecipientOption[];
  classes: readonly ClassInfo[];
  /** Toolbar recipient (checked by default). */
  selectedKey: string;
  /** Toolbar "Kèm bảng chi tiết". */
  detail: boolean;
  /** Unsaved "Công tác phối hợp": "Gửi" is disabled. */
  planDirty: boolean;
  /** settings.manage. */
  canManageMail: boolean;
  selfEmail?: string;
}

export function ReportMailDialog(props: ReportMailDialogProps) {
  const { open, onOpenChange } = props;
  const mail = useReportMail({
    open,
    levelId: props.levelId,
    period: props.period,
    periodLabel: props.periodLabel,
    options: props.options,
    classes: props.classes,
    selectedKey: props.selectedKey,
    detail: props.detail,
    selfEmail: props.selfEmail,
    planDirty: props.planDirty,
  });
  const progress = mail.watch;

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => (v || !mail.sending) && onOpenChange(v)}
      dismissible={!mail.sending}
      title="Gửi báo cáo qua email"
      description={`${progress?.periodLabel ?? props.periodLabel} · ${LEVELS[progress?.levelId ?? props.levelId].name}`}
      icon={Send}
      size="lg"
      className="max-md:h-[92dvh]"
      footer={progress ? <ProgressFooter mail={mail} onClose={() => onOpenChange(false)} /> : <ComposeFooter mail={mail} onClose={() => onOpenChange(false)} />}
    >
      {progress ? (
        <ReportMailProgress watch={progress} retrying={mail.retrying} onRetry={(id) => void mail.retry(id)} />
      ) : mail.recipients.status === "ready" && mail.recipients.data ? (
        <ReportMailForm
          key={mail.draftKey}
          data={mail.recipients.data}
          rows={mail.rows}
          draft={mail.draft}
          onDraft={mail.update}
          issues={mail.issues}
          planDirty={props.planDirty}
          canManageMail={props.canManageMail}
          selfEmail={props.selfEmail}
          sendError={mail.sendError}
          disabled={mail.sending}
          initialOpenKey={props.selectedKey}
        />
      ) : mail.recipients.status === "error" ? (
        <ErrorState
          title="Chưa tải được danh sách người nhận"
          message={mail.recipients.error}
          onRetry={() => void mail.recipients.reload()}
          retrying={mail.recipients.reloading}
        />
      ) : (
        <div role="status" aria-live="polite" className="flex flex-col gap-4">
          <span className="sr-only">Đang tải danh sách người nhận</span>
          <SkeletonText lines={2} />
          <SkeletonText lines={4} />
          <SkeletonText lines={3} />
        </div>
      )}
    </Sheet>
  );
}

function ComposeFooter({ mail, onClose }: { mail: ReportMailState; onClose: () => void }) {
  const reason = mail.blockReason;
  const loading = mail.recipients.status === "loading";
  // "Chọn ít nhất 1 người nhận" repeats the summary line ("Chưa chọn người nhận").
  const shownReason = reason && !loading && reason !== NO_TARGET_MESSAGE ? reason : undefined;
  return (
    <>
      <Button variant="secondary" onClick={onClose} disabled={mail.sending}>
        Hủy
      </Button>
      <Button icon={Send} onClick={() => void mail.send()} loading={mail.sending} disabled={!!reason}>
        Gửi
      </Button>
      <div aria-live="polite" className="flex min-w-0 flex-col gap-0.5 sm:order-first sm:mr-auto">
        <p className="num text-[13.5px] font-semibold text-brand-900">{loading ? "Đang tải danh sách người nhận…" : mailSummaryText(mail.summary)}</p>
        {shownReason ? (
          <p className="flex items-start gap-1.5 text-[13px] leading-5 text-warn-strong">
            <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
            {shownReason}
          </p>
        ) : null}
      </div>
    </>
  );
}

function ProgressFooter({ mail, onClose }: { mail: ReportMailState; onClose: () => void }) {
  const status = mail.watch?.status;
  return (
    <>
      <Button variant="secondary" onClick={onClose}>
        Đóng
      </Button>
      {status === "stopped" ? (
        <Button variant="secondary" icon={RefreshCw} onClick={mail.refreshBatch}>
          Cập nhật
        </Button>
      ) : null}
      {status !== "polling" ? (
        <Button icon={MailPlus} onClick={mail.newMessage}>
          Gửi thư khác
        </Button>
      ) : null}
    </>
  );
}
