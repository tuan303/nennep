"use client";
import { useMemo, useState } from "react";
import { CircleAlert, Pencil, Save } from "lucide-react";
import { photoSaveBlocker, useRetained, type PhotoUploadSummary } from "@/components/app/widgets";
import { Button, ConfirmDialog, Dialog, DialogClose, Field, Textarea, toast } from "@/components/ui";
import { api, errorMessage, isApiClientError } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { fmtNumber } from "@/lib/client/format";
import { useSession } from "@/lib/client/session";
import type { LevelDataset, Reward } from "@/lib/types";
import { rewardFormFromReward, toRewardUpdateInput, validateRewardForm, type RewardForm } from "./lib/reward-form";
import { RewardFields } from "./reward-fields";

export interface RewardEditDialogProps {
  ds: LevelDataset;
  today: string;
  /** Reward to edit; null closes the dialog. */
  reward: Reward | null;
  onClose: () => void;
}

/** Edit a reward with the same fields as the create form (own ≤ 24h for editors, any for admins). */
export function RewardEditDialog({ ds, today, reward, onClose }: RewardEditDialogProps) {
  const shown = useRetained(reward);
  return (
    <Dialog
      open={reward !== null}
      onOpenChange={(open) => !open && onClose()}
      title={shown ? `Sửa điểm thưởng ${shown.code}` : "Sửa điểm thưởng"}
      description="Mã thưởng giữ nguyên; tuần và học kỳ được tính lại theo ngày."
      icon={Pencil}
      size="lg"
      dismissible={false}
    >
      {shown ? <EditBody key={shown.id} ds={ds} today={today} reward={shown} onDone={onClose} /> : null}
    </Dialog>
  );
}

function EditBody({ ds, today, reward, onDone }: { ds: LevelDataset; today: string; reward: Reward; onDone: () => void }) {
  const { can } = useSession();
  const { refresh } = useDataset(ds.levelId);
  const canVerify = can("reward.verify");
  const [form, setForm] = useState<RewardForm>(() => rewardFormFromReward(reward));
  const [saving, setSaving] = useState(false);
  const [photoUploads, setPhotoUploads] = useState<PhotoUploadSummary>({ inProgress: 0, failed: 0 });
  const photoBlocker = photoSaveBlocker(photoUploads);
  const validation = useMemo(() => validateRewardForm(form, ds, today, { canVerify, original: reward }), [form, ds, today, canVerify, reward]);
  const issues = photoBlocker ? [photoBlocker, ...validation] : validation;

  async function save() {
    if (saving || issues.length > 0) return;
    setSaving(true);
    try {
      const updated = await api.rewards.update(reward.id, toRewardUpdateInput(form, reward));
      toast.success(`Đã cập nhật ${updated.code} · +${fmtNumber(updated.points)} điểm thưởng`);
      await refresh();
      onDone();
    } catch (err) {
      if (isApiClientError(err) && err.status === 409) {
        // Changed (or deleted) by someone else since the dialog opened: never overwrite – reload and close.
        toast.error(err.message, { description: "Đã tải lại dữ liệu mới nhất – mở lại điểm thưởng để sửa." });
        await refresh();
        onDone();
        return;
      }
      toast.error(errorMessage(err, "Chưa cập nhật được điểm thưởng. Vui lòng thử lại."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void save();
        }
      }}
      className="flex flex-col gap-4"
    >
      <fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Thông tin điểm thưởng</legend>
        <RewardFields ds={ds} form={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} today={today} canVerify={canVerify} onUploadsChange={setPhotoUploads} />
      </fieldset>
      {issues.length > 0 ? (
        <p className="flex items-start gap-1.5 text-[13px] text-warn-strong" aria-live="polite">
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
          {issues[0]}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button variant="secondary" disabled={saving}>
            Hủy
          </Button>
        </DialogClose>
        <Button icon={Save} onClick={() => void save()} loading={saving} disabled={issues.length > 0}>
          Lưu thay đổi
        </Button>
      </div>
    </form>
  );
}

export interface RewardDeleteDialogProps {
  reward: Reward | null;
  onClose: () => void;
  /** Rejects on failure (the dialog stays open). */
  onConfirm: (reward: Reward, reason: string) => Promise<void>;
}

/** Soft delete with a required reason (≥ 3 characters, kept in the audit log). */
export function RewardDeleteDialog({ reward, onClose, onConfirm }: RewardDeleteDialogProps) {
  const shown = useRetained(reward);
  const [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      open={reward !== null}
      onOpenChange={(open) => {
        if (!open) {
          setReason("");
          onClose();
        }
      }}
      tone="danger"
      title={`Xóa điểm thưởng ${shown?.code ?? ""}?`}
      message="Điểm thưởng sẽ không còn được tính vào điểm thi đua và báo cáo. Quản trị có thể khôi phục lại trong mục Dữ liệu."
      confirmLabel="Xóa điểm thưởng"
      confirmDisabled={reason.trim().length < 3}
      onConfirm={async () => {
        if (!shown) return;
        await onConfirm(shown, reason.trim());
        setReason("");
      }}
    >
      <Field label="Lý do xóa" required hint="Tối thiểu 3 ký tự, được lưu vào nhật ký hệ thống.">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="Ví dụ: Ghi nhầm lớp, ghi trùng…" />
      </Field>
    </ConfirmDialog>
  );
}
