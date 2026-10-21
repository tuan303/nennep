"use client";
import { useState } from "react";
import { Gauge, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge, Card, ConfirmDialog, Field, NumberStepper, RagBadge, Switch, cn, toast } from "@/components/ui";
import { RagLegend } from "@/components/app/widgets";
import { fmtNumber } from "@/lib/client/format";
import { withRagThresholds } from "../lib/config-form";
import type { ConfigSectionProps } from "./config-general";

/** Ngưỡng Vàng / Đỏ, độ tin cậy tối thiểu and the BGH approval switch (with confirmation). */
export function RagCard({ draft, base, errors, set, disabled, className }: ConfigSectionProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const approved = draft.ragApproved;
  const thresholdsChanged = draft.ragYellow !== base.ragYellow || draft.ragRed !== base.ragRed;
  const withdrawn = base.ragApproved && !approved && thresholdsChanged;

  function setThreshold(patch: { ragYellow?: number; ragRed?: number }) {
    const r = withRagThresholds(draft, patch);
    set({ ragYellow: r.draft.ragYellow, ragRed: r.draft.ragRed, ragApproved: r.draft.ragApproved });
    if (r.unapproved) toast.warning("Đã tắt phê duyệt ngưỡng", { description: "Ngưỡng vừa thay đổi – hãy phê duyệt lại sau khi BGH thông qua." });
  }

  function onApprovalChange(on: boolean) {
    if (!on) {
      set({ ragApproved: false });
      return;
    }
    if (errors.ragYellow || errors.ragRed) {
      toast.error("Chưa thể phê duyệt", { description: "Hãy sửa ngưỡng Vàng / Đỏ trước." });
      return;
    }
    setConfirmOpen(true);
  }

  return (
    <Card title="Ngưỡng cảnh báo RAG" icon={Gauge} subtitle="Màu của lớp theo điểm trừ trung bình mỗi tuần tính thi đua." className={className}>
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <div className="grid content-start gap-4 sm:grid-cols-2">
          <Field
            label={
              <span className="inline-flex items-center gap-2">
                <RagBadge rag="YELLOW" compact size="sm" /> Ngưỡng Vàng
              </span>
            }
            required
            error={errors.ragYellow}
            hint="Từ mức này: Cần chú ý (điểm trừ/tuần)"
          >
            <NumberStepper
              value={draft.ragYellow}
              onChange={(v) => setThreshold({ ragYellow: v })}
              min={0}
              max={1000}
              suffix="điểm"
              disabled={disabled}
              className="w-full"
            />
          </Field>
          <Field
            label={
              <span className="inline-flex items-center gap-2">
                <RagBadge rag="RED" compact size="sm" /> Ngưỡng Đỏ
              </span>
            }
            required
            error={errors.ragRed}
            hint="Từ mức này: Cần can thiệp (điểm trừ/tuần)"
          >
            <NumberStepper
              value={draft.ragRed}
              onChange={(v) => setThreshold({ ragRed: v })}
              min={0}
              max={1000}
              suffix="điểm"
              disabled={disabled}
              className="w-full"
            />
          </Field>
          <Field
            label="Độ tin cậy tối thiểu"
            error={errors.minConfidencePct}
            hint="Lớp có tỷ lệ sự việc hợp lệ thấp hơn mức này hiển thị Xám."
            className="sm:col-span-2"
          >
            <NumberStepper
              value={draft.minConfidencePct}
              onChange={(v) => set({ minConfidencePct: v })}
              min={0}
              max={100}
              step={5}
              suffix="%"
              disabled={disabled}
              className="w-full sm:w-1/2"
            />
          </Field>
        </div>

        <div className="flex flex-col gap-4">
          <div className={cn("rounded-card p-4 ring-1 ring-inset", approved ? "bg-ok-soft ring-ok/25" : "bg-star-50 ring-star-500/40")}>
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={cn(
                  "mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
                  approved ? "bg-ok text-white" : "bg-star-500 text-brand-950",
                )}
              >
                {approved ? <ShieldCheck className="size-5" strokeWidth={2.25} /> : <ShieldAlert className="size-5" strokeWidth={2.25} />}
              </span>
              <div className="min-w-0 flex-1">
                <Switch
                  checked={approved}
                  onChange={onApprovalChange}
                  disabled={disabled}
                  label="Phê duyệt ngưỡng cảnh báo"
                  description={
                    approved
                      ? `BGH đã phê duyệt: Vàng ≥ ${fmtNumber(draft.ragYellow)}, Đỏ ≥ ${fmtNumber(draft.ragRed)} điểm trừ/tuần.`
                      : "Khi chưa phê duyệt, mọi lớp hiển thị Xám “Ngưỡng chưa được phê duyệt”."
                  }
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={approved ? "ok" : "warn"} icon={approved ? ShieldCheck : ShieldAlert}>
                    {approved ? "Đã phê duyệt" : "Chưa phê duyệt"}
                  </Badge>
                  {approved !== base.ragApproved ? <span className="text-xs text-slate-600">Có hiệu lực sau khi lưu</span> : null}
                </div>
                {withdrawn ? (
                  <p className="mt-2 text-[13px] leading-5 text-warn-strong">Đã tắt phê duyệt vì ngưỡng thay đổi. Bật lại sau khi BGH thông qua ngưỡng mới.</p>
                ) : null}
              </div>
            </div>
          </div>
          <div className="rounded-control border border-border px-3.5 py-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Xem trước quy tắc</p>
            <RagLegend
              layout="list"
              config={{ rag: { yellow: draft.ragYellow, red: draft.ragRed, approved: draft.ragApproved, minConfidence: draft.minConfidencePct / 100 } }}
            />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Phê duyệt ngưỡng cảnh báo"
        message={`Xác nhận ngưỡng Vàng ≥ ${fmtNumber(draft.ragYellow)}, Đỏ ≥ ${fmtNumber(draft.ragRed)} điểm trừ/tuần đã được BGH phê duyệt?`}
        confirmLabel="Xác nhận phê duyệt"
        onConfirm={() => set({ ragApproved: true })}
      >
        <p className="text-[13px] leading-5 text-slate-500">Màu Xanh / Vàng / Đỏ sẽ hiển thị cho mọi lớp sau khi bạn bấm “Lưu thay đổi”.</p>
      </ConfirmDialog>
    </Card>
  );
}
