"use client";
import { useRef } from "react";
import { Lightbulb } from "lucide-react";
import { ClassPicker, PhotoCapture, type PhotoUploadSummary } from "@/components/app/widgets";
import { EvidenceLinks } from "@/components/entry/evidence-links";
import { DateInput, Field, Input, Pill, Select, Textarea } from "@/components/ui";
import { REWARD_REASON_MIN_LENGTH } from "@/lib/constants";
import { isIsoDate, weekdayLabelVN } from "@/lib/engine/dates";
import { calendarStart } from "@/lib/engine/period";
import type { LevelDataset, RewardStatus } from "@/lib/types";
import {
  REWARD_REASON_MAX,
  REWARD_REASON_SUGGESTIONS,
  applyReasonSuggestion,
  isRewardPointLevel,
  rewardStatusOptions,
  type RewardForm,
  type RewardMode,
} from "./lib/reward-form";
import { RewardPointsPicker } from "./reward-points-picker";

export interface RewardFieldsProps {
  ds: LevelDataset;
  form: RewardForm;
  onChange: (patch: Partial<RewardForm>) => void;
  today: string;
  /** reward.verify: may pick "Đã xác nhận". */
  canVerify: boolean;
  /** "propose" (GVCN): own classes only, no status field (always "Mới ghi nhận"). */
  mode?: RewardMode;
  /** Proposal mode: the GVCN's classes. */
  ownClasses?: readonly string[];
  /** Edit mode: stored points outside 1–5 (shown as "+10 (mức cũ)"). */
  legacyPoints?: number;
  /** Changing it remounts the photo/link inputs (after a reset). */
  round?: number;
  /** Evidence photos uploading / failed (block saving meanwhile – see photoSaveBlocker). */
  onUploadsChange?: (summary: PhotoUploadSummary) => void;
}

/** Fields of the reward form (create card and edit dialog). Single column in narrow containers, two columns from 32rem. */
export function RewardFields({ ds, form, onChange, today, canVerify, mode = "manage", ownClasses, legacyPoints, round = 0, onUploadsChange }: RewardFieldsProps) {
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const statusOptions = rewardStatusOptions(canVerify).map((s) => ({ value: s, label: s }));
  // Keep the current status listed (e.g. a verified reward opened by an admin) even if it is not pickable.
  if (!statusOptions.some((o) => o.value === form.status)) statusOptions.push({ value: form.status, label: form.status });
  const reasonLength = form.reason.trim().length;
  const proposing = mode === "propose";

  const suggest = (s: string) => {
    onChange({ reason: applyReasonSuggestion(form.reason, s) });
    requestAnimationFrame(() => {
      const el = reasonRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const pointsHint =
    form.points === null
      ? "Chọn mức điểm cộng (1–5)."
      : legacyPoints !== undefined && form.points === legacyPoints
        ? "Mức cũ được giữ nguyên; chọn 1–5 nếu muốn đổi."
        : isRewardPointLevel(form.points)
          ? `Cộng ${form.points} điểm vào điểm thi đua của lớp khi được tính.`
          : undefined;

  return (
    <div className="@container">
      <div className="grid min-w-0 gap-4 @lg:grid-cols-2">
        <Field label="Ngày" required hint={isIsoDate(form.date) ? weekdayLabelVN(form.date) : "Không chọn được ngày trong tương lai."}>
          <DateInput value={form.date} onChange={(v) => onChange({ date: v })} min={calendarStart(ds.weeks)} max={today} size="lg" />
        </Field>
        <Field label="Lớp" required hint={proposing ? "Chỉ lớp thầy/cô chủ nhiệm." : undefined}>
          <ClassPicker
            ds={ds}
            value={form.classCode || undefined}
            onChange={(c) => onChange({ classCode: c })}
            restrictTo={proposing ? (ownClasses ?? []) : undefined}
            size="lg"
          />
        </Field>

        <Field label="Mức điểm cộng" required className="@lg:col-span-2" hint={pointsHint}>
          <RewardPointsPicker value={form.points} onChange={(n) => onChange({ points: n })} legacy={legacyPoints} />
        </Field>

        <Field
          label="Lý do cộng điểm"
          required
          className="@lg:col-span-2"
          hint={reasonLength < REWARD_REASON_MIN_LENGTH ? `Nêu rõ vì sao lớp được cộng điểm (tối thiểu ${REWARD_REASON_MIN_LENGTH} ký tự).` : undefined}
          labelAside={
            <span className="num">
              {form.reason.length}/{REWARD_REASON_MAX}
            </span>
          }
        >
          <Textarea
            ref={reasonRef}
            value={form.reason}
            onChange={(e) => onChange({ reason: e.target.value })}
            maxLength={REWARD_REASON_MAX}
            rows={2}
            placeholder="Ví dụ: Đạt giải Nhì hội thi văn nghệ chào mừng 20/11"
          />
        </Field>
        <div className="no-scrollbar -mx-1 -mt-2 flex min-w-0 items-center gap-1.5 overflow-x-auto px-1 pb-0.5 max-sm:flex-nowrap sm:flex-wrap @lg:col-span-2">
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-500">
            <Lightbulb aria-hidden className="size-3.5" strokeWidth={2.25} />
            Gợi ý:
          </span>
          {REWARD_REASON_SUGGESTIONS.map((s) => (
            <Pill key={s} onClick={() => suggest(s)} className="shrink-0">
              {s}
            </Pill>
          ))}
        </div>

        {proposing ? null : (
          <Field label="Trạng thái" hint={canVerify ? "Chọn “Đã xác nhận” khi đã kiểm tra minh chứng." : "“Đã xác nhận” do Quản trị xác minh."}>
            <Select<RewardStatus> options={statusOptions} value={form.status} onChange={(v) => v && onChange({ status: v })} size="lg" />
          </Field>
        )}
        <Field label="Người ghi" hint={form.reporter.trim() ? undefined : "Để trống: dùng tên tài khoản của thầy/cô."}>
          <Input value={form.reporter} onChange={(e) => onChange({ reporter: e.target.value })} maxLength={120} autoComplete="name" enterKeyHint="done" />
        </Field>
        <Field label="Ghi chú thêm" labelAside={form.note ? `${form.note.length}/1000` : undefined} className={proposing ? undefined : "@lg:col-span-2"}>
          <Textarea value={form.note} onChange={(e) => onChange({ note: e.target.value })} maxLength={1000} rows={1} className="min-h-12" placeholder="Không bắt buộc" />
        </Field>

        <div className="flex min-w-0 flex-col gap-2 @lg:col-span-2">
          <p className="text-[13.5px] font-semibold text-slate-800">
            Minh chứng <span className="font-normal text-slate-500">(không bắt buộc)</span>
          </p>
          <PhotoCapture className="max-w-xl" key={`photos-${round}`} levelId={ds.levelId} value={form.photoIds} onChange={(ids) => onChange({ photoIds: ids })} onUploadsChange={onUploadsChange} />
          <EvidenceLinks key={`links-${round}`} value={form.links} onChange={(links) => onChange({ links })} />
        </div>
      </div>
    </div>
  );
}
