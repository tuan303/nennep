"use client";
import type { ReactNode } from "react";
import { BadgeCheck, CircleCheck, Clock, Gift, Minus, Pencil, Trash } from "lucide-react";
import { EvidenceGallery, useNow, useRetained } from "@/components/app/widgets";
import { Button, DialogClose, Sheet, StatusBadge } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtNumber } from "@/lib/client/format";
import { useSession } from "@/lib/client/session";
import { formatWeekLabel, weekdayLabelVN } from "@/lib/engine/dates";
import type { LevelDataset, Reward, RewardStatus } from "@/lib/types";
import { canDeleteReward, canEditReward, isProposedReward, quickStatusActions } from "./lib/reward-list";
import { ProposedBadge } from "./reward-list-card";

export interface RewardDetailSheetProps {
  ds: LevelDataset;
  /** null closes the sheet. */
  reward: Reward | null;
  busy: boolean;
  onClose: () => void;
  onEdit: (reward: Reward) => void;
  onDelete: (reward: Reward) => void;
  onStatus: (reward: Reward, to: RewardStatus) => void;
}

/** Full detail of one reward with the actions the user may take (verify, edit, delete). */
export function RewardDetailSheet({ ds, reward, busy, onClose, onEdit, onDelete, onStatus }: RewardDetailSheetProps) {
  const shown = useRetained(reward);
  const { profile } = useSession();
  const now = useNow();
  if (!shown) return null;

  const counted = ds.config.rewardCountedStatuses.includes(shown.status);
  const cls = ds.classes.find((c) => c.code === shown.classCode);
  const quick = quickStatusActions(profile, shown);
  const canEdit = canEditReward(profile, shown, now);
  const canDelete = canDeleteReward(profile, shown);

  return (
    <Sheet
      open={reward !== null}
      onOpenChange={(open) => !open && onClose()}
      title={`Điểm thưởng ${shown.code}`}
      description={`${weekdayLabelVN(shown.date)}, ${fmtDate(shown.date)} · Lớp ${shown.classCode}`}
      icon={Gift}
      size="md"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {canDelete ? (
            <Button variant="ghost" icon={Trash} className="px-3 text-bad-strong hover:bg-bad-soft hover:text-bad-strong" onClick={() => onDelete(shown)}>
              <span className="max-sm:sr-only">Xóa</span>
            </Button>
          ) : null}
          <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
            <DialogClose asChild>
              <Button variant="secondary" className="flex-1 sm:flex-none">
                Đóng
              </Button>
            </DialogClose>
            {canEdit ? (
              <Button variant="secondary" icon={Pencil} onClick={() => onEdit(shown)} className="flex-1 sm:flex-none">
                Sửa
              </Button>
            ) : null}
            {quick.map((a) => (
              <Button
                key={a.to}
                icon={a.to === "Đã xác nhận" ? BadgeCheck : Clock}
                variant={a.to === "Đã xác nhận" ? "primary" : "outline"}
                loading={busy}
                onClick={() => onStatus(shown, a.to)}
                className="flex-1 sm:flex-none"
              >
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 rounded-card border border-border bg-gradient-to-b from-ok-soft/60 to-surface p-4">
          <p className="text-[15px] font-semibold leading-6 text-brand-900">{shown.reason}</p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className="num flex items-baseline gap-1.5">
              <span className="text-[32px] font-bold leading-none tracking-tight text-ok-strong">+{fmtNumber(shown.points)}</span>
              <span className="text-[13px] font-medium text-slate-500">điểm thưởng</span>
            </p>
            <span className="flex flex-wrap items-center gap-1.5">
              {isProposedReward(shown) ? <ProposedBadge size="md" /> : null}
              <StatusBadge status={shown.status} />
            </span>
          </div>
          <p className={counted ? "flex items-center gap-1.5 text-[13px] font-medium text-ok-strong" : "flex items-center gap-1.5 text-[13px] text-slate-600"}>
            {counted ? <CircleCheck aria-hidden className="size-4" strokeWidth={2.5} /> : <Minus aria-hidden className="size-4" strokeWidth={2.5} />}
            {counted ? "Được cộng vào điểm thi đua của lớp." : "Chưa được cộng vào điểm thi đua – chờ xác nhận."}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 rounded-card border border-border px-4 py-1">
          <Info label="Lớp">
            {shown.classCode}
            {cls?.homeroomTeacher ? <span className="block text-xs text-slate-500">GVCN: {cls.homeroomTeacher}</span> : null}
          </Info>
          <Info label="Tuần">{shown.week ? formatWeekLabel(shown.week) : "–"}</Info>
          <Info label="Người ghi">{shown.reporter ?? shown.createdByName}</Info>
          <Info label="Mã thưởng">{shown.code}</Info>
          <Info label="Ghi nhận lúc">
            {fmtDateTime(shown.createdAt)}
            <span className="block text-xs text-slate-500">bởi {shown.createdByName}</span>
          </Info>
          <Info label="Cập nhật">{shown.updatedAt ? fmtDateTime(shown.updatedAt) : "–"}</Info>
        </dl>

        {shown.note ? (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-brand-900">Ghi chú</h3>
            <p className="whitespace-pre-line text-sm leading-6 text-slate-800">{shown.note}</p>
          </section>
        ) : null}

        <section className="flex flex-col gap-2.5">
          <h3 className="flex items-baseline justify-between gap-3 text-sm font-semibold text-brand-900">
            Minh chứng
            {shown.photoIds.length + shown.evidenceUrls.length > 0 ? (
              <span className="text-xs font-normal text-slate-500">
                {shown.photoIds.length} ảnh · {shown.evidenceUrls.length} liên kết
              </span>
            ) : null}
          </h3>
          <EvidenceGallery photoIds={shown.photoIds} urls={shown.evidenceUrls} />
        </section>
      </div>
    </Sheet>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-b border-border py-2.5 [&:nth-last-child(-n+2)]:border-b-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="num min-w-0 break-words text-sm text-slate-900">{children}</dd>
    </div>
  );
}
