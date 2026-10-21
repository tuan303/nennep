"use client";
import { useCallback, useState } from "react";
import { toast } from "@/components/ui";
import { api, errorMessage, isApiClientError } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { fmtNumber } from "@/lib/client/format";
import type { LevelDataset, Reward, RewardStatus } from "@/lib/types";

/** Status workflow + delete for rewards, shared by the list rows and the detail sheet. */
export function useRewardActions(ds: Pick<LevelDataset, "levelId" | "config">) {
  const { refresh } = useDataset(ds.levelId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const counted = ds.config.rewardCountedStatuses;

  const setStatus = useCallback(
    async (reward: Reward, to: RewardStatus): Promise<Reward | undefined> => {
      setBusyId(reward.id);
      try {
        // baseRev: a reward changed meanwhile (points, class…) is not verified blindly – 409, reload, look again.
        const updated = await api.rewards.update(reward.id, { status: to, baseRev: reward.rev ?? 0 });
        toast.success(`${updated.code}: ${to}`, {
          description: counted.includes(to)
            ? `+${fmtNumber(updated.points)} điểm được cộng vào điểm thi đua lớp ${updated.classCode}.`
            : `Lớp ${updated.classCode} · chưa cộng vào điểm thi đua.`,
        });
        await refresh();
        return updated;
      } catch (err) {
        if (isApiClientError(err) && err.status === 409) {
          toast.error(err.message, { description: "Đã tải lại dữ liệu mới nhất – vui lòng kiểm tra rồi thao tác lại." });
          await refresh();
          return undefined;
        }
        toast.error(errorMessage(err, "Chưa cập nhật được trạng thái. Vui lòng thử lại."));
        return undefined;
      } finally {
        setBusyId(null);
      }
    },
    [counted, refresh],
  );

  /** Soft delete with a reason; rethrows so a ConfirmDialog stays open on failure. */
  const remove = useCallback(
    async (reward: Reward, reason: string): Promise<void> => {
      try {
        await api.rewards.remove(reward.id, reason);
        toast.success(`Đã xóa điểm thưởng ${reward.code}.`, { description: "Quản trị có thể khôi phục trong mục Dữ liệu." });
        await refresh();
      } catch (err) {
        toast.error(errorMessage(err, "Chưa xóa được điểm thưởng. Vui lòng thử lại."));
        throw err;
      }
    },
    [refresh],
  );

  return { busyId, setStatus, remove };
}
