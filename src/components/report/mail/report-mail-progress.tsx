"use client";
/** Progress view of "Gửi email" after "Gửi": one row per email (addressee, addresses, status, error, "Gửi lại"). */
import { Ban, CircleCheck, CircleX, Clock, LoaderCircle, RotateCw, type LucideIcon } from "lucide-react";
import { Badge, Button, ProgressBar, Spinner, cn } from "@/components/ui";
import { fmtTime } from "@/lib/client/format";
import { MAIL_JOB_STATUS_LABELS } from "@/lib/constants";
import type { MailBatchItem } from "@/lib/contract";
import type { MailJobStatus } from "@/lib/types";
import { BATCH_POLL_MAX_MS, MAIL_STATUS_TONE, batchCountsLine, batchFinishedNotice, batchProgress, canRetryItem, type BatchWatch } from "./lib/mail-batch";
import { MailNotice } from "./mail-notice";

const STATUS_ICON: Record<MailJobStatus, LucideIcon> = {
  PENDING: Clock,
  SENDING: LoaderCircle,
  SENT: CircleCheck,
  FAILED: CircleX,
  SKIPPED: Ban,
};

export function MailStatusBadge({ status }: { status: MailJobStatus }) {
  return (
    <Badge tone={MAIL_STATUS_TONE[status]} icon={STATUS_ICON[status]} iconClassName={status === "SENDING" ? "animate-spin" : undefined}>
      {MAIL_JOB_STATUS_LABELS[status]}
    </Badge>
  );
}

export interface ReportMailProgressProps {
  watch: BatchWatch;
  retrying: ReadonlySet<string>;
  onRetry: (jobId: string) => void;
}

export function ReportMailProgress({ watch, retrying, onRetry }: ReportMailProgressProps) {
  const data = watch.data;
  if (!data) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-10 text-center">
        <Spinner size="lg" label="" className="text-brand-600" />
        <p className="text-sm font-medium text-slate-700">Đang chuẩn bị gửi {watch.jobs.toLocaleString("vi-VN")} thư…</p>
        {watch.error ? <p className="text-[13px] text-warn-strong">Chưa cập nhật được tiến độ: {watch.error}</p> : null}
      </div>
    );
  }

  const p = batchProgress(data);
  const finished = data.done;
  const tone = p.failed > 0 ? "bad" : p.skipped > 0 ? "warn" : finished ? "ok" : "brand";
  const minutes = Math.round(BATCH_POLL_MAX_MS / 60_000);
  const attention = batchFinishedNotice(data);

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" className="flex flex-col gap-1.5">
        <ProgressBar
          value={p.ratio}
          tone={tone}
          label={finished ? "Đã gửi xong" : "Đang gửi…"}
          showValue
          valueText={`${p.finished.toLocaleString("vi-VN")}/${p.total.toLocaleString("vi-VN")} thư`}
        />
        <p className="num text-[13px] text-slate-600">{batchCountsLine(p)}</p>
      </div>

      {!finished && watch.status === "polling" ? (
        <p className="text-[13px] leading-5 text-slate-500">
          {watch.withoutPdf ? "Mỗi thư có liên kết mở báo cáo (không kèm file PDF) và được gửi lần lượt." : "Mỗi thư kèm file PDF báo cáo và được gửi lần lượt."}{" "}
          Bạn có thể đóng cửa sổ này – thư vẫn tiếp tục được gửi, phần mềm sẽ báo khi xong.
        </p>
      ) : null}
      {!finished && watch.status === "polling" && watch.failures > 0 && watch.error ? (
        <p className="text-[13px] text-warn-strong">Chưa cập nhật được tiến độ ({watch.error}) – đang thử lại…</p>
      ) : null}
      {attention ? (
        <MailNotice tone={p.failed > 0 ? "bad" : "warn"} title={attention.title}>
          {attention.text}
        </MailNotice>
      ) : null}
      {!finished && watch.status === "stopped" ? (
        <MailNotice tone="warn" title="Đã dừng theo dõi tiến độ">
          {watch.error
            ? `Chưa cập nhật được tiến độ: ${watch.error}`
            : `Sau ${minutes} phút vẫn còn thư chưa gửi xong.`}{" "}
          Các thư còn lại vẫn được hệ thống gửi tự động; bấm “Cập nhật” để xem tiến độ mới nhất.
        </MailNotice>
      ) : null}

      <ul className="flex flex-col gap-2">
        {data.items.map((item) => (
          <BatchItemRow key={item.id} item={item} retrying={retrying.has(item.id)} onRetry={onRetry} />
        ))}
      </ul>
    </div>
  );
}

function BatchItemRow({ item, retrying, onRetry }: { item: MailBatchItem; retrying: boolean; onRetry: (jobId: string) => void }) {
  const sentAt = item.status === "SENT" && item.sentAt ? fmtTime(item.sentAt) : "";
  return (
    <li
      data-mail-job={item.id}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-control border px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between",
        item.status === "FAILED" ? "border-bad/30 bg-bad-soft/40" : "border-border bg-surface",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-slate-800">{item.addressee}</span>
          <MailStatusBadge status={item.status} />
          {sentAt ? <span className="num text-xs text-slate-500">lúc {sentAt}</span> : null}
        </div>
        <p className="mt-0.5 break-all text-[13px] leading-5 text-slate-500">{item.to.join(", ")}</p>
        {item.lastError ? <p className="mt-1 break-words text-[13px] font-medium leading-5 text-bad-strong">{item.lastError}</p> : null}
        {item.skipReason ? <p className="mt-1 break-words text-[13px] font-medium leading-5 text-warn-strong">{item.skipReason}</p> : null}
      </div>
      {canRetryItem(item) ? (
        <Button size="sm" variant="secondary" icon={RotateCw} loading={retrying} onClick={() => onRetry(item.id)} className="self-start">
          Gửi lại
        </Button>
      ) : null}
    </li>
  );
}
