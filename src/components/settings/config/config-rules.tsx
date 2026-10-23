"use client";
import { useMemo } from "react";
import { Siren, Timer, Trophy } from "lucide-react";
import { Card, Checkbox, Field, NumberStepper, PriorityBadge, StatusBadge } from "@/components/ui";
import { PRIORITIES, PRIORITY_LABELS, REWARD_STATUSES } from "@/lib/constants";
import { rankingRuleOf, top90Cutoff } from "@/lib/engine";
import type { ClassInfo, LevelId, Priority } from "@/lib/types";
import { Notice } from "../shared/notice";
import type { ConfigSectionProps } from "./config-general";

/**
 * Trạng thái điểm thưởng được tính + Tỷ lệ Top (with a live example from the real classes: the largest khối, or – a
 * level ranked as a whole, THPT – every active class of the level).
 */
export function RankingRulesCard({
  draft,
  errors,
  set,
  disabled,
  className,
  classes,
  levelId,
}: ConfigSectionProps & { classes: readonly ClassInfo[]; levelId: LevelId }) {
  const rule = rankingRuleOf(levelId);
  const levelWide = rule.scope === "level";
  const example = useMemo(() => {
    const pct = draft.top90Pct;
    if (levelWide) {
      const count = classes.filter((c) => c.active).length;
      return count ? `VD: Toàn cấp có ${count} lớp → ${top90Cutoff(count, pct / 100)} lớp thuộc Top ${pct}%.` : undefined;
    }
    const counts = new Map<number, number>();
    for (const c of classes) if (c.active) counts.set(c.grade, (counts.get(c.grade) ?? 0) + 1);
    const [grade, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [];
    if (!grade || !count) return undefined;
    return `VD: Khối ${grade} có ${count} lớp → ${top90Cutoff(count, pct / 100)} lớp thuộc Top ${pct}%.`;
  }, [classes, draft.top90Pct, levelWide]);
  const scopeHint = `Mặc định 90%: số lớp thuộc Top = làm tròn lên (tỷ lệ × số lớp ${levelWide ? "toàn cấp" : "của khối"}).`;

  const toggle = (status: (typeof REWARD_STATUSES)[number], on: boolean) =>
    set({ rewardCountedStatuses: REWARD_STATUSES.filter((s) => (s === status ? on : draft.rewardCountedStatuses.includes(s))) });

  return (
    <Card title="Điểm thưởng & Top" icon={Trophy} subtitle="Điểm thưởng nào được cộng và tỷ lệ lớp thuộc Top." className={className}>
      <div className="flex flex-col gap-4">
        <fieldset className="min-w-0">
          <legend className="text-[13.5px] font-semibold text-slate-800">Trạng thái điểm thưởng được tính</legend>
          <div className="mt-1 flex flex-col">
            {REWARD_STATUSES.map((s) => (
              <Checkbox
                key={s}
                checked={draft.rewardCountedStatuses.includes(s)}
                onChange={(on) => toggle(s, on)}
                disabled={disabled}
                label={<StatusBadge status={s} size="sm" />}
                description={s === "Đã xác nhận" ? "Khuyến nghị: chỉ cộng điểm thưởng đã được xác nhận." : undefined}
              />
            ))}
          </div>
          {draft.rewardCountedStatuses.length === 0 ? (
            <Notice tone="warn" className="mt-2">
              Không chọn trạng thái nào: điểm thưởng sẽ không được cộng vào điểm thi đua.
            </Notice>
          ) : null}
        </fieldset>
        <Field label="Tỷ lệ Top (%)" error={errors.top90Pct} hint={example ?? scopeHint}>
          <NumberStepper value={draft.top90Pct} onChange={(v) => set({ top90Pct: v })} min={50} max={100} suffix="%" disabled={disabled} className="w-full" />
        </Field>
        {levelWide ? (
          <Notice title="Xếp hạng chung toàn cấp">
            Các lớp được xếp hạng chung, không chia theo khối.
            {rule.tieBreak === "violationTurns" ? " Bằng điểm thì lớp ít lượt vi phạm hơn xếp trên; bằng cả điểm và lượt vi phạm thì đồng hạng." : " Bằng điểm thì đồng hạng."}
            {rule.topCount ? ` Báo cáo nêu ${rule.topCount} lớp dẫn đầu toàn cấp (kể cả lớp đồng hạng).` : ""}
          </Notice>
        ) : null}
      </div>
    </Card>
  );
}

/** Cảnh báo đỏ (≥ n lượt/tuần) and Tái phạm (≥ m lượt trong k tuần). */
export function StudentAlertCard({ draft, errors, set, disabled, className }: ConfigSectionProps) {
  return (
    <Card title="Cảnh báo học sinh" icon={Siren} subtitle="Tự động gắn nhãn học sinh cần quan tâm." className={className}>
      <div className="@container">
        <div className="grid gap-4 @sm:grid-cols-2">
          <Field label="Cảnh báo đỏ: từ" error={errors.alertPerWeek} hint="lượt vi phạm trong 1 tuần" className="@sm:col-span-2">
            <NumberStepper
              value={draft.alertPerWeek}
              onChange={(v) => set({ alertPerWeek: v })}
              min={1}
              max={20}
              suffix="lượt"
              disabled={disabled}
              className="w-full"
            />
          </Field>
          <Field label="Tái phạm: từ" error={errors.alertRepeatMin} hint="lượt vi phạm…">
            <NumberStepper
              value={draft.alertRepeatMin}
              onChange={(v) => set({ alertRepeatMin: v })}
              min={2}
              max={20}
              suffix="lượt"
              disabled={disabled}
              className="w-full"
            />
          </Field>
          <Field label="…trong vòng" error={errors.alertRepeatWindowWeeks} hint="tuần gần nhất">
            <NumberStepper
              value={draft.alertRepeatWindowWeeks}
              onChange={(v) => set({ alertRepeatWindowWeeks: v })}
              min={1}
              max={20}
              suffix="tuần"
              disabled={disabled}
              className="w-full"
            />
          </Field>
          <p className="num text-[13px] leading-5 text-slate-600 @sm:col-span-2">
            Học sinh có ≥ {draft.alertPerWeek} lượt trong một tuần → <strong className="text-bad-strong">Cảnh báo đỏ</strong>; ≥ {draft.alertRepeatMin} lượt
            trong {draft.alertRepeatWindowWeeks} tuần → <strong className="text-warn-strong">Tái phạm</strong>.
          </p>
        </div>
      </div>
    </Card>
  );
}

const SLA_KEY: Record<Priority, "slaHigh" | "slaMedium" | "slaLow"> = { High: "slaHigh", Medium: "slaMedium", Low: "slaLow" };

/** SLA (days) of actions by priority. */
export function SlaCard({ draft, errors, set, disabled, className }: ConfigSectionProps) {
  return (
    <Card title="Thời hạn xử lý hành động" icon={Timer} subtitle="Số ngày để hoàn thành hành động theo mức ưu tiên." className={className}>
      <div className="@container">
        <div className="grid gap-4 @xl:grid-cols-3">
          {PRIORITIES.map((p) => {
            const key = SLA_KEY[p];
            return (
              <Field
                key={p}
                label={
                  <span className="inline-flex items-center gap-2">
                    <PriorityBadge priority={p} size="sm" />
                    <span className="sr-only">Ưu tiên {PRIORITY_LABELS[p]}</span>
                  </span>
                }
                error={errors[key]}
              >
                <NumberStepper
                  value={draft[key]}
                  onChange={(v) => set({ [key]: v } as Partial<ConfigSectionProps["draft"]>)}
                  min={1}
                  max={365}
                  suffix="ngày"
                  disabled={disabled}
                  className="w-full"
                />
              </Field>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
