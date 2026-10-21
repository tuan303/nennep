"use client";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Award, CircleAlert, ImageOff, Save } from "lucide-react";
import { photoSaveBlocker, type PhotoUploadSummary } from "@/components/app/widgets";
import { payloadKey, requestFor, type PendingRequest } from "@/components/entry/lib/payload";
import { SAME_PATH } from "@/components/entry/lib/leave-guard";
import { useLeaveGuard } from "@/components/entry/use-leave-guard";
import { Button, Card, toast } from "@/components/ui";
import { api, errorMessage, newClientRequestId } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { fmtNumber } from "@/lib/client/format";
import { useSession } from "@/lib/client/session";
import type { LevelDataset, Reward } from "@/lib/types";
import { newRewardForm, rewardDraftKey, rewardDrafts, rewardFormDirty, toRewardCreateInput, validateRewardForm, type RewardForm } from "./lib/reward-form";
import { RewardFields } from "./reward-fields";

export interface RewardFormCardProps {
  ds: LevelDataset;
  today: string;
  onOpen: (reward: Reward) => void;
  className?: string;
}

/**
 * "Ghi điểm thưởng" card (FR-RWD-001): idempotent create, toast with "Xem", dataset refresh.
 * Unsaved input is protected like the incident form (confirmation before leaving, in-memory draft per level).
 */
export function RewardFormCard({ ds, today, onOpen, className }: RewardFormCardProps) {
  const { profile, can } = useSession();
  const { refresh } = useDataset(ds.levelId);
  const canVerify = can("reward.verify");
  const draftKey = rewardDraftKey(profile?.uid, ds.levelId);
  const [start] = useState(() => {
    const base = newRewardForm({ today, reporter: profile?.displayName });
    const kept = draftKey ? rewardDrafts.read(draftKey) : undefined;
    return { base, form: kept ?? base, restored: !!kept };
  });
  const [baseline, setBaseline] = useState<RewardForm>(start.base);
  const [form, setForm] = useState<RewardForm>(start.form);
  const [saving, setSaving] = useState(false);
  const [photoUploads, setPhotoUploads] = useState<PhotoUploadSummary>({ inProgress: 0, failed: 0 });
  const uploading = photoUploads.inProgress > 0;
  const photoBlocker = photoSaveBlocker(photoUploads);
  const [round, setRound] = useState(0);
  const pending = useRef<PendingRequest | null>(null);
  const inFlight = useRef(false); // blocks a double tap before the disabled state renders

  const issues = useMemo(() => validateRewardForm(form, ds, today, { canVerify }), [form, ds, today, canVerify]);
  const blocked = issues.length > 0;
  const formDirty = useMemo(() => rewardFormDirty(form, baseline), [form, baseline]);

  useEffect(() => {
    if (!draftKey) return;
    if (formDirty) rewardDrafts.write(draftKey, form);
    else rewardDrafts.clear(draftKey);
  }, [draftKey, form, formDirty]);

  const restartRef = useRef(() => {});
  useEffect(() => {
    restartRef.current = () => {
      if (draftKey) rewardDrafts.clear(draftKey);
      setForm(baseline);
      setRound((r) => r + 1);
    };
  });
  const announced = useRef(false);
  useEffect(() => {
    if (!start.restored || announced.current) return;
    announced.current = true;
    toast.info("Đã khôi phục điểm thưởng đang nhập dở", {
      description: "Thông tin thầy/cô nhập trước đó chưa được lưu và đã được giữ lại.",
      action: { label: "Nhập mới", onClick: () => restartRef.current() },
    });
  }, [start.restored]);

  const leaveGuard = useLeaveGuard({
    when: formDirty || uploading || photoUploads.failed > 0,
    title: "Bỏ điểm thưởng đang nhập?",
    message: "Thông tin điểm thưởng thầy/cô vừa nhập chưa được lưu và sẽ bị bỏ nếu rời trang này.",
    onDiscard: () => {
      if (draftKey) rewardDrafts.clear(draftKey);
    },
    samePage: SAME_PATH, // filter links keep the form mounted
  });

  async function save() {
    if (inFlight.current || saving || uploading || blocked) return;
    if (photoBlocker) {
      toast.error(`Chưa thể lưu: ${photoBlocker}`);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      const payload = toRewardCreateInput(ds.levelId, form);
      const request = requestFor(pending.current, payloadKey(payload), newClientRequestId);
      pending.current = request;
      const created = await api.rewards.create({ ...payload, clientRequestId: request.id });
      pending.current = null;
      const counted = ds.config.rewardCountedStatuses.includes(created.status);
      toast.success(`Đã ghi nhận ${created.code} · +${fmtNumber(created.points)} điểm thưởng`, {
        description: `Lớp ${created.classCode} · ${counted ? "đã được cộng vào điểm thi đua" : `${created.status} – chưa cộng vào điểm thi đua`}`,
        action: { label: "Xem", onClick: () => onOpen(created) },
      });
      // The fieldset is disabled while saving, so `form` is still what was sent.
      const next = newRewardForm({ today: form.date || today, reporter: form.reporter });
      setForm(next);
      setBaseline(next);
      setRound((r) => r + 1);
      inFlight.current = false;
      setSaving(false);
      await refresh();
    } catch (err) {
      toast.error(errorMessage(err, "Chưa lưu được điểm thưởng. Vui lòng thử lại."));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void save();
    }
  }

  return (
    <>
      <Card
        headingLevel={2}
        icon={Award}
        title="Ghi điểm thưởng"
        subtitle="Thưởng cho tập thể lớp · mã thưởng được tạo tự động."
        className={className}
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-w-0 text-[13px]" aria-live="polite">
              {uploading ? (
                <span className="text-brand-700">Đang tải ảnh minh chứng lên…</span>
              ) : photoBlocker ? (
                <span className="inline-flex items-start gap-1.5 text-bad-strong">
                  <ImageOff aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
                  <span>Chưa thể lưu: {photoBlocker}</span>
                </span>
              ) : blocked ? (
                <span className="inline-flex items-start gap-1.5 text-warn-strong">
                  <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
                  <span>
                    {issues[0]}
                    {issues.length > 1 ? ` (+${issues.length - 1})` : ""}
                  </span>
                </span>
              ) : (
                <span className="num text-slate-600">
                  Lớp <strong className="text-brand-900">{form.classCode}</strong> · <strong className="text-ok-strong">+{fmtNumber(form.points)}</strong> điểm thưởng
                </span>
              )}
            </p>
            <Button icon={Save} onClick={() => void save()} loading={saving} disabled={blocked || !!photoBlocker} className="max-sm:w-full">
              Lưu điểm thưởng
            </Button>
          </div>
        }
      >
        <form noValidate aria-label="Ghi điểm thưởng" onSubmit={(e) => e.preventDefault()} onKeyDown={onKeyDown}>
          <fieldset disabled={saving} className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">Thông tin điểm thưởng</legend>
            <RewardFields
              ds={ds}
              form={form}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
              today={today}
              canVerify={canVerify}
              round={round}
              onUploadsChange={setPhotoUploads}
            />
          </fieldset>
        </form>
      </Card>
      {leaveGuard}
    </>
  );
}
