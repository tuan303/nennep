"use client";
import { useMemo, useState } from "react";
import { Award, CalendarRange, SearchX } from "lucide-react";
import { Button, Card, DataTable, EmptyState, Pill, SearchInput, StatusBadge, type DataTableColumn } from "@/components/ui";
import { REWARD_STATUSES } from "@/lib/constants";
import { fmtDate, fmtNumber } from "@/lib/client/format";
import type { LevelDataset, RewardStatus } from "@/lib/types";
import { SourceBadge } from "./incident-columns";
import { CountedBadge, RewardDetailSheet } from "./reward-detail-sheet";
import { filterRewardRows, rewardStatusCounts, rewardSummary, type RewardRow } from "./lib/records";

const COLUMNS: ReadonlyArray<DataTableColumn<RewardRow>> = [
  { key: "code", header: "Mã", cell: ({ reward: r }) => <span className="num whitespace-nowrap text-[13px] font-semibold text-brand-900">{r.code}</span>, sortValue: (x) => x.reward.code },
  { key: "date", header: "Ngày", cell: ({ reward: r }) => <span className="num whitespace-nowrap">{fmtDate(r.date)}</span>, sortValue: (x) => x.reward.date },
  { key: "class", header: "Lớp", cell: ({ reward: r }) => <span className="font-bold text-brand-900">{r.classCode}</span>, sortValue: (x) => x.reward.classCode },
  { key: "reason", header: "Nội dung thưởng", cell: ({ reward: r }) => <span className="line-clamp-2 min-w-[220px] max-w-[380px]">{r.reason}</span> },
  {
    key: "points",
    header: "Điểm",
    align: "right",
    cell: ({ reward: r }) => <span className="num font-bold text-ok-strong">+{fmtNumber(r.points)}</span>,
    sortValue: (x) => x.reward.points,
  },
  { key: "status", header: "Trạng thái", cell: ({ reward: r }) => <StatusBadge status={r.status} size="sm" />, sortValue: (x) => x.reward.status },
  { key: "counted", header: "Tính thi đua", cell: (x) => <CountedBadge counted={x.counted} />, sortValue: (x) => (x.counted ? 1 : 0) },
  { key: "reporter", header: "Người ghi", cell: ({ reward: r }) => <span className="whitespace-nowrap text-[13px]">{r.reporter || r.createdByName}</span> },
  { key: "source", header: "Nguồn", cell: ({ reward: r }) => <SourceBadge source={r.source} /> },
];

function RewardCard({ row: { reward: r, counted } }: { row: RewardRow }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="num truncate text-xs font-semibold text-slate-500">
          {r.code} · {fmtDate(r.date)}
        </span>
        <span className="num text-base font-bold text-ok-strong">+{fmtNumber(r.points)}</span>
      </div>
      <p className="text-sm text-slate-800">
        <span className="font-bold text-brand-900">{r.classCode}</span>
        <span className="mx-1.5 text-slate-300">·</span>
        {r.reason}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={r.status} size="sm" />
        <CountedBadge counted={counted} />
      </div>
    </div>
  );
}

export interface RewardsTabProps {
  ds: LevelDataset;
  /** Engine-filtered rewards (period + grade + class) with the counted flag. */
  rows: RewardRow[];
  onShowWholeYear?: () => void;
}

/** "Điểm thưởng": every reward in scope with its status and whether it counts in the competition score. */
export function RewardsTab({ ds, rows, onShowWholeYear }: RewardsTabProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RewardStatus | "ALL">("ALL");
  const [selected, setSelected] = useState<RewardRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const visible = useMemo(() => filterRewardRows(rows, { query, status }), [rows, query, status]);
  const counts = useMemo(() => rewardStatusCounts(rows), [rows]);
  const sum = useMemo(() => rewardSummary(visible), [visible]);

  if (rows.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={Award}
          title="Chưa có điểm thưởng trong kỳ này"
          description="Điểm thưởng được ghi nhận ở trang Điểm thưởng sẽ hiển thị tại đây."
          action={
            onShowWholeYear ? (
              <Button variant="secondary" size="sm" icon={CalendarRange} onClick={onShowWholeYear}>
                Xem cả năm học
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  }

  return (
    <Card padding="none">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:px-5" data-print-hide>
        <SearchInput value={query} onChange={setQuery} placeholder="Tìm mã, lớp, nội dung thưởng…" ariaLabel="Tìm điểm thưởng" className="md:max-w-md" />
        <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Lọc theo trạng thái">
          <Pill active={status === "ALL"} onClick={() => setStatus("ALL")}>
            Tất cả · {fmtNumber(rows.length)}
          </Pill>
          {REWARD_STATUSES.map((s) => (
            <Pill key={s} tone={s === "Đã xác nhận" ? "ok" : s === "Đang xác minh" ? "warn" : "brand"} active={status === s} onClick={() => setStatus(status === s ? "ALL" : s)} disabled={counts[s] === 0 && status !== s}>
              {s} · {fmtNumber(counts[s])}
            </Pill>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-2.5 text-[13px] text-slate-500 sm:px-5" aria-live="polite">
        <span>
          <strong className="num font-semibold text-slate-800">{fmtNumber(sum.count)}</strong> lượt thưởng
        </span>
        <span>
          Tổng <strong className="num font-semibold text-slate-800">+{fmtNumber(sum.points)}</strong> điểm
        </span>
        <span>
          Được tính thi đua <strong className="num font-semibold text-ok-strong">+{fmtNumber(sum.countedPoints)}</strong>
        </span>
        {sum.pending > 0 ? (
          <span>
            <strong className="num font-semibold text-warn-strong">{fmtNumber(sum.pending)}</strong> lượt chưa xác nhận
          </span>
        ) : null}
      </div>
      <DataTable
        columns={COLUMNS}
        rows={visible}
        rowKey={(x) => x.reward.id}
        onRowClick={(x) => {
          setSelected(x);
          setSheetOpen(true);
        }}
        rowLabel={(x) => `Xem điểm thưởng ${x.reward.code}, lớp ${x.reward.classCode}`}
        mobileCard={(x) => <RewardCard row={x} />}
        pageSize={50}
        stickyHeader
        caption="Danh sách điểm thưởng"
        emptyState={<EmptyState size="sm" icon={SearchX} title="Không tìm thấy điểm thưởng phù hợp" description="Thử từ khóa hoặc trạng thái khác." />}
      />
      <RewardDetailSheet ds={ds} reward={sheetOpen && selected ? selected.reward : null} counted={selected?.counted} onClose={() => setSheetOpen(false)} />
    </Card>
  );
}
