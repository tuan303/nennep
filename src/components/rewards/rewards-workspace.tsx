"use client";
import { useCallback, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { useFilters } from "@/lib/client/filters";
import { useSession } from "@/lib/client/session";
import type { LevelDataset, Reward, RewardStatus } from "@/lib/types";
import { countedStatusesText, rewardRows } from "./lib/reward-list";
import { RewardDeleteDialog, RewardEditDialog } from "./reward-dialogs";
import { RewardDetailSheet } from "./reward-detail-sheet";
import { RewardFormCard } from "./reward-form-card";
import { RewardListCard } from "./reward-list-card";
import { useRewardActions } from "./use-reward-actions";

export interface RewardsWorkspaceProps {
  ds: LevelDataset;
  today: string;
}

/**
 * Counted-status notice, the create form (two field columns from 32rem) and the full-width period list,
 * stacked so the table keeps all its columns readable next to the sidebar.
 */
export function RewardsWorkspace({ ds, today }: RewardsWorkspaceProps) {
  const { filters } = useFilters();
  const { can } = useSession();
  const { busyId, setStatus, remove } = useRewardActions(ds);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailFallback, setDetailFallback] = useState<Reward | null>(null);
  const [editing, setEditing] = useState<Reward | null>(null);
  const [deleting, setDeleting] = useState<Reward | null>(null);

  const rows = useMemo(() => rewardRows(ds, filters), [ds, filters]);
  // Always show the freshest copy of the open reward (after a status change the dataset is refetched).
  const detail = detailId ? (ds.rewards.find((r) => r.id === detailId) ?? (detailFallback?.id === detailId ? detailFallback : null)) : null;

  const open = useCallback((r: Reward) => {
    setDetailFallback(r);
    setDetailId(r.id);
  }, []);
  const onStatus = useCallback((r: Reward, to: RewardStatus) => void setStatus(r, to), [setStatus]);
  const statuses = countedStatusesText(ds.config);

  return (
    <>
      <div role="note" className="flex items-start gap-3 rounded-card border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm leading-6 text-brand-900">
        <Info aria-hidden className="mt-1 size-4 shrink-0 text-brand-600" strokeWidth={2.25} />
        <p>
          {statuses ? (
            <>
              Chỉ điểm thưởng có trạng thái <strong className="font-semibold">{statuses}</strong> được cộng vào điểm thi đua.
            </>
          ) : (
            "Hiện chưa có trạng thái điểm thưởng nào được cộng vào điểm thi đua (xem Cài đặt)."
          )}{" "}
          <span className="text-brand-700/80">
            {can("reward.verify") ? "Thầy/cô có thể xác nhận ngay trong danh sách." : "Quản trị sẽ kiểm tra minh chứng và xác nhận."}
          </span>
        </p>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-5">
        <RewardFormCard ds={ds} today={today} onOpen={open} />
        <RewardListCard
          ds={ds}
          rows={rows}
          filters={filters}
          busyId={busyId}
          onOpen={open}
          onEdit={setEditing}
          onDelete={setDeleting}
          onStatus={onStatus}
        />
      </div>

      <RewardDetailSheet
        ds={ds}
        reward={detail}
        busy={!!detail && busyId === detail.id}
        onClose={() => setDetailId(null)}
        onEdit={(r) => {
          setDetailId(null);
          setEditing(r);
        }}
        onDelete={(r) => {
          setDetailId(null);
          setDeleting(r);
        }}
        onStatus={onStatus}
      />
      <RewardEditDialog ds={ds} today={today} reward={editing} onClose={() => setEditing(null)} />
      <RewardDeleteDialog reward={deleting} onClose={() => setDeleting(null)} onConfirm={remove} />
    </>
  );
}
