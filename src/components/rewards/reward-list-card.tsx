"use client";
import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { BadgeCheck, CircleCheck, Clock, Gift, HandHeart, Info, Minus, Pencil, Trash } from "lucide-react";
import { PeriodBadge, useNow } from "@/components/app/widgets";
import { Badge, Button, Card, DataTable, EmptyState, IconButton, Pill, StatusBadge, type DataTableColumn } from "@/components/ui";
import { fmtDate, fmtNumber } from "@/lib/client/format";
import { useSession } from "@/lib/client/session";
import type { GlobalFilters, LevelDataset, Reward, RewardStatus } from "@/lib/types";
import {
  canDeleteReward,
  canEditReward,
  filterProposedRows,
  ignoredRewardFilters,
  isProposedReward,
  proposalCounts,
  quickStatusActions,
  rewardSummary,
  type RewardRow,
} from "./lib/reward-list";

export interface RewardListCardProps {
  ds: LevelDataset;
  rows: RewardRow[];
  filters: GlobalFilters;
  busyId: string | null;
  onOpen: (reward: Reward) => void;
  onEdit: (reward: Reward) => void;
  onDelete: (reward: Reward) => void;
  onStatus: (reward: Reward, to: RewardStatus) => void;
  /** GVCN: the rows are the rewards of own classes (title / empty state say so). */
  ownClassesOnly?: boolean;
  className?: string;
}

/** "GVCN đề xuất" badge of a proposed reward (icon + text). */
export function ProposedBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <Badge tone="star" size={size} icon={HandHeart}>
      GVCN đề xuất
    </Badge>
  );
}

const stop = (e: MouseEvent | KeyboardEvent) => e.stopPropagation();

/** "Nguyễn Văn Quang" → "Văn Quang" (full name in the tooltip). */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 2 ? parts.slice(-2).join(" ") : name;
}

/** "Điểm thưởng trong kỳ": summary chips + sortable table (cards on phones) with the status workflow. */
export function RewardListCard({ ds, rows: allRows, filters, busyId, onOpen, onEdit, onDelete, onStatus, ownClassesOnly, className }: RewardListCardProps) {
  const { profile } = useSession();
  const now = useNow();
  const [onlyProposed, setOnlyProposed] = useState(false);
  const proposals = useMemo(() => proposalCounts(allRows), [allRows]);
  const rows = useMemo(() => filterProposedRows(allRows, onlyProposed && proposals.total > 0), [allRows, onlyProposed, proposals.total]);
  const summary = useMemo(() => rewardSummary(rows), [rows]);

  const columns = useMemo<DataTableColumn<RewardRow>[]>(
    () => [
      {
        key: "date",
        header: "Ngày · Mã",
        headerLabel: "Ngày",
        cell: (r) => (
          <span className="num flex flex-col whitespace-nowrap">
            <span className="font-medium text-slate-800">{fmtDate(r.reward.date)}</span>
            <span className="text-2xs text-slate-500">{r.reward.code}</span>
          </span>
        ),
        sortValue: (r) => `${r.reward.date}|${r.reward.code}`,
      },
      {
        key: "class",
        header: "Lớp",
        cell: (r) => (
          <Badge tone="brand" variant="outline" size="sm" className="num">
            {r.reward.classCode}
          </Badge>
        ),
        sortValue: (r) => r.reward.classCode,
      },
      {
        key: "reason",
        header: "Nội dung",
        className: "min-w-44",
        cell: (r) => (
          <span className="flex flex-col items-start gap-0.5">
            {isProposedReward(r.reward) ? <ProposedBadge /> : null}
            <span className="line-clamp-2 text-slate-800">{r.reward.reason}</span>
            {r.reward.note ? <span className="line-clamp-1 text-xs text-slate-500">{r.reward.note}</span> : null}
            <span className="text-xs text-slate-500 2xl:hidden">Người ghi: {r.reward.reporter ?? r.reward.createdByName}</span>
          </span>
        ),
      },
      {
        key: "points",
        header: "Điểm",
        align: "right",
        cell: (r) => <span className="font-bold text-ok-strong">+{fmtNumber(r.reward.points)}</span>,
        sortValue: (r) => r.reward.points,
      },
      {
        key: "status",
        header: "Trạng thái",
        cell: (r) => (
          <span className="flex flex-col items-start gap-1">
            <StatusBadge status={r.reward.status} size="sm" />
            <span className="xl:hidden">
              <CountedMark counted={r.counted} />
            </span>
          </span>
        ),
        sortValue: (r) => r.reward.status,
      },
      {
        key: "reporter",
        header: "Người ghi",
        className: "max-2xl:hidden",
        headerClassName: "max-2xl:hidden",
        cell: (r) => {
          const name = r.reward.reporter ?? r.reward.createdByName;
          return (
            <span className="whitespace-nowrap text-[13px]" title={name}>
              {shortName(name)}
            </span>
          );
        },
        sortValue: (r) => r.reward.reporter ?? r.reward.createdByName,
      },
      { key: "counted", header: "Được tính?", align: "center", className: "max-xl:hidden", headerClassName: "max-xl:hidden", cell: (r) => <CountedMark counted={r.counted} /> },
      {
        key: "actions",
        header: <span className="sr-only">Thao tác</span>,
        headerLabel: "Thao tác",
        align: "right",
        cell: (r) => (
          <div className="flex items-center justify-end gap-1" onClick={stop} onKeyDown={stop}>
            {quickStatusActions(profile, r.reward).map((a) =>
              a.to === "Đã xác nhận" ? (
                <Button
                  key={a.to}
                  size="sm"
                  variant="outline"
                  icon={BadgeCheck}
                  loading={busyId === r.reward.id}
                  onClick={() => onStatus(r.reward, a.to)}
                  className="px-2.5 text-ok-strong ring-ok/40 hover:bg-ok-soft"
                  aria-label={`${a.label} điểm thưởng ${r.reward.code}`}
                  title={`${a.label} điểm thưởng ${r.reward.code}`}
                >
                  <span className="max-xl:sr-only">{a.label}</span>
                </Button>
              ) : (
                <IconButton
                  key={a.to}
                  icon={Clock}
                  size="sm"
                  label={`${a.label} – ${r.reward.code}`}
                  loading={busyId === r.reward.id}
                  onClick={() => onStatus(r.reward, a.to)}
                  className="text-warn-strong hover:bg-warn-soft"
                />
              ),
            )}
            {canEditReward(profile, r.reward, now) ? <IconButton icon={Pencil} label={`Sửa ${r.reward.code}`} size="sm" onClick={() => onEdit(r.reward)} /> : null}
            {canDeleteReward(profile, r.reward) ? (
              <IconButton icon={Trash} label={`Xóa ${r.reward.code}`} size="sm" className="text-bad-strong hover:bg-bad-soft" onClick={() => onDelete(r.reward)} />
            ) : null}
          </div>
        ),
      },
    ],
    [profile, now, busyId, onEdit, onDelete, onStatus],
  );

  const ignored = ignoredRewardFilters(filters);

  return (
    <Card
      padding="none"
      headingLevel={2}
      icon={Gift}
      title={ownClassesOnly ? "Điểm thưởng của lớp chủ nhiệm" : "Điểm thưởng trong kỳ"}
      subtitle={<PeriodBadge period={filters.period} semesters={ds.config.semesters} size="sm" className="mt-1" />}
      className={className}
      actions={
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="ok" icon={CircleCheck} className="num">
            Đã xác nhận: {fmtNumber(summary.verifiedPoints)} điểm
          </Badge>
          <Badge tone={summary.pendingCount > 0 ? "warn" : "muted"} icon={Clock} className="num">
            Chờ xác minh: {fmtNumber(summary.pendingCount)}
          </Badge>
        </div>
      }
    >
      {proposals.total > 0 && !ownClassesOnly ? (
        <div className="mx-4 mb-3 flex flex-wrap items-center gap-2 sm:mx-5" role="group" aria-label="Lọc điểm thưởng">
          <Pill active={!onlyProposed} onClick={() => setOnlyProposed(false)}>
            Tất cả · {fmtNumber(allRows.length)}
          </Pill>
          <Pill tone="star" icon={HandHeart} active={onlyProposed} onClick={() => setOnlyProposed((v) => !v)}>
            Đề xuất của GVCN · {fmtNumber(proposals.total)}
            {proposals.pending > 0 ? ` (${fmtNumber(proposals.pending)} chờ xác minh)` : ""}
          </Pill>
        </div>
      ) : null}
      {ignored.length > 0 ? (
        <p className="mx-4 mb-3 flex items-center gap-1.5 text-xs text-slate-500 sm:mx-5">
          <Info aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
          Bộ lọc {ignored.join(" / ")} không áp dụng cho điểm thưởng.
        </p>
      ) : null}
      <DataTable<RewardRow>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.reward.id}
        onRowClick={(r) => onOpen(r.reward)}
        rowLabel={(r) => `Xem điểm thưởng ${r.reward.code} lớp ${r.reward.classCode}`}
        initialSort={{ key: "date", dir: "desc" }}
        caption="Danh sách điểm thưởng trong kỳ"
        pageSize={20}
        mobileCard={(r) => <RewardMobileCard row={r} />}
        className="border-t border-border"
        emptyState={
          <EmptyState
            size="sm"
            icon={Gift}
            title={onlyProposed ? "Chưa có đề xuất của GVCN trong kỳ này" : "Chưa có điểm thưởng trong kỳ này"}
            description={
              ownClassesOnly
                ? "Điểm thưởng và đề xuất của lớp chủ nhiệm trong kỳ đang lọc sẽ hiện ở đây."
                : "Điểm thưởng ghi nhận trong kỳ đang lọc sẽ hiện ở đây. Thử đổi kỳ, khối hoặc lớp ở bộ lọc phía trên."
            }
          />
        }
      />
    </Card>
  );
}

function CountedMark({ counted }: { counted: boolean }) {
  return counted ? (
    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-ok-strong">
      <CircleCheck aria-hidden className="size-4" strokeWidth={2.5} />
      Có
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[13px] text-slate-500">
      <Minus aria-hidden className="size-4" strokeWidth={2.5} />
      Chưa
    </span>
  );
}

function RewardMobileCard({ row: { reward: r, counted } }: { row: RewardRow }) {
  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-center gap-2">
        <Badge tone="brand" variant="outline" size="sm" className="num">
          {r.classCode}
        </Badge>
        <span className="num text-xs text-slate-500">{fmtDate(r.date)}</span>
        <span className="num ml-auto text-base font-bold text-ok-strong">+{fmtNumber(r.points)}</span>
      </span>
      {isProposedReward(r) ? <ProposedBadge /> : null}
      <span className="line-clamp-2 text-sm font-medium text-slate-900">{r.reason}</span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusBadge status={r.status} size="sm" />
        <CountedMark counted={counted} />
        <span className="num ml-auto text-2xs text-slate-400">{r.code}</span>
      </span>
    </span>
  );
}
