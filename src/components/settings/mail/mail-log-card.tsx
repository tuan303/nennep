"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { History, MailX, RefreshCw, RotateCw } from "lucide-react";
import { Badge, Button, Card, DataTable, EmptyState, ErrorState, Select, toast, type DataTableColumn } from "@/components/ui";
import { errorMessage } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";
import type { MailJobView } from "@/lib/contract";
import { MAIL_JOB_KIND_LABELS, MAIL_JOB_STATUS_LABELS } from "@/lib/constants";
import type { LevelId, MailJobStatus } from "@/lib/types";
import { CardActions } from "../shared/card-actions";
import {
  MAIL_STATUS_TONES,
  canRetryMailJob,
  filterMailLog,
  mailJobTime,
  mailLogSummary,
  mailProblemText,
  mailRecipientsText,
  mailStatusOptions,
  markMailJobRetried,
} from "./lib/mail-log";
import { mailApi } from "./mail-api";

export interface MailLogCardProps {
  levelId: LevelId;
  /** Changing it reloads the log (after a test message, a save…). */
  reloadSignal: number;
  className?: string;
}

/** The queue drains in the background: look again a few seconds after "Gửi lại". */
const RELOAD_AFTER_RETRY_MS = 6000;

function StatusBadge({ job }: { job: MailJobView }) {
  return (
    <Badge tone={MAIL_STATUS_TONES[job.status]} dot>
      {MAIL_JOB_STATUS_LABELS[job.status]}
    </Badge>
  );
}

/** "Nhật ký gửi thư" (GET /api/mail/log): newest first, status filter, refresh, "Gửi lại" for failed / skipped. */
export function MailLogCard({ levelId, reloadSignal, className }: MailLogCardProps) {
  const [items, setItems] = useState<MailJobView[]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<MailJobStatus | undefined>();
  const [retrying, setRetrying] = useState<string | null>(null);
  const seq = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    const req = ++seq.current;
    setLoading(true);
    try {
      const res = await mailApi.log(levelId);
      if (req !== seq.current) return;
      setItems(res.items);
      setError(undefined);
    } catch (err) {
      if (req === seq.current) setError(errorMessage(err));
    } finally {
      if (req === seq.current) setLoading(false);
    }
  }, [levelId]);

  useEffect(() => {
    void load();
  }, [load, reloadSignal]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const list = useMemo(() => items ?? [], [items]);
  const visible = useMemo(() => filterMailLog(list, status), [list, status]);
  const statusOptions = useMemo(() => mailStatusOptions(list), [list]);

  async function retry(job: MailJobView) {
    setRetrying(job.id);
    try {
      await mailApi.retry(job.id);
      setItems((cur) => (cur ? markMailJobRetried(cur, job.id, new Date().toISOString()) : cur));
      toast.success("Đã đưa thư vào hàng đợi gửi lại", { description: job.label });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void load(), RELOAD_AFTER_RETRY_MS);
    } catch (err) {
      toast.error("Chưa gửi lại được thư", { description: errorMessage(err) });
    } finally {
      setRetrying(null);
    }
  }

  const retryButton = (job: MailJobView) =>
    canRetryMailJob(job) ? (
      <Button size="sm" variant="secondary" icon={RotateCw} onClick={() => void retry(job)} loading={retrying === job.id} disabled={retrying !== null && retrying !== job.id}>
        Gửi lại
      </Button>
    ) : null;

  const columns: DataTableColumn<MailJobView>[] = [
    {
      key: "time",
      header: "Thời gian",
      width: 150,
      sortValue: (j) => mailJobTime(j),
      cell: (j) => <span className="num whitespace-nowrap text-slate-700">{fmtDateTime(mailJobTime(j))}</span>,
    },
    { key: "kind", header: "Loại", width: 132, cell: (j) => <span className="text-slate-700">{MAIL_JOB_KIND_LABELS[j.kind]}</span>, sortValue: (j) => j.kind },
    {
      key: "label",
      header: "Nội dung",
      cell: (j) => (
        <div className="min-w-48 max-w-md">
          <p className="line-clamp-2 font-medium text-slate-800">{j.label}</p>
          {j.subject ? <p className="mt-0.5 truncate text-xs text-slate-500">{j.subject}</p> : null}
        </div>
      ),
    },
    {
      key: "to",
      header: "Người nhận",
      cell: (j) => (
        <span className="block max-w-64 truncate text-[13px] text-slate-600" title={[...j.to, ...j.cc.map((c) => `CC: ${c}`)].join("\n") || undefined}>
          {mailRecipientsText(j)}
        </span>
      ),
    },
    { key: "status", header: "Trạng thái", width: 116, cell: (j) => <StatusBadge job={j} />, sortValue: (j) => j.status },
    {
      key: "problem",
      header: "Lỗi",
      cell: (j) => {
        const problem = mailProblemText(j);
        return problem ? <p className="line-clamp-3 min-w-40 max-w-sm text-[13px] leading-5 text-bad-strong">{problem}</p> : <span className="text-slate-400">–</span>;
      },
    },
    { key: "retry", header: <span className="sr-only">Gửi lại</span>, headerLabel: "Gửi lại", width: 112, align: "right", cell: retryButton },
  ];

  const header = (
    <CardActions>
      {statusOptions.length > 1 || status ? (
        <Select
          options={statusOptions}
          value={status}
          onChange={setStatus}
          placeholder="Mọi trạng thái"
          allowEmpty
          aria-label="Lọc theo trạng thái"
          wrapperClassName="w-44"
        />
      ) : null}
      <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => void load()} loading={loading && !!items}>
        Làm mới
      </Button>
    </CardActions>
  );

  return (
    <Card
      padding="none"
      icon={History}
      title="Nhật ký gửi thư"
      subtitle={items ? `${mailLogSummary(list)} · mới nhất ở trên` : "Thư thử, thông báo GVCN và báo cáo đã gửi của cấp này."}
      actions={header}
      className={className}
    >
      {error && !items ? (
        <ErrorState message={error} onRetry={() => void load()} retrying={loading} size="sm" />
      ) : (
        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(j) => j.id}
          caption="Nhật ký gửi thư, mới nhất ở trên"
          loading={loading && !items}
          pageSize={20}
          resetKey={status ?? "all"}
          emptyState={
            <EmptyState
              size="sm"
              icon={MailX}
              title={status ? "Không có thư ở trạng thái này" : "Chưa có thư nào"}
              description="Thư thử, thông báo cho GVCN và báo cáo gửi qua email sẽ hiện ở đây."
            />
          }
          mobileCard={(j) => {
            const problem = mailProblemText(j);
            return (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium text-slate-800">{j.label}</p>
                  <StatusBadge job={j} />
                </div>
                <p className="num text-xs text-slate-500">
                  {fmtDateTime(mailJobTime(j))} · {MAIL_JOB_KIND_LABELS[j.kind]}
                </p>
                <p className="break-all text-[13px] text-slate-600">{mailRecipientsText(j)}</p>
                {problem ? <p className="text-[13px] leading-5 text-bad-strong">{problem}</p> : null}
                {canRetryMailJob(j) ? <div>{retryButton(j)}</div> : null}
              </div>
            );
          }}
        />
      )}
      {error && items ? (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-[13px] text-bad-strong sm:px-5">
          <span>{error}</span>
          <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => void load()} loading={loading}>
            Tải lại
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
