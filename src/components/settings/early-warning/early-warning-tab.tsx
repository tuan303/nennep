"use client";
import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { BellRing, Eye, Hourglass, Repeat, Siren, SlidersHorizontal, TrendingUp } from "lucide-react";
import { Badge, Button, Card, Checkbox, Field, NumberStepper, toast } from "@/components/ui";
import { api, errorMessage, validationIssues } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { fmtNumber } from "@/lib/client/format";
import { useToday } from "@/lib/client/hooks";
import { LEVELS } from "@/lib/constants";
import { EARLY_WARNING_KIND_LABELS, formatDayMonthVN, type EarlyWarningKind } from "@/lib/engine";
import type { LevelDataset } from "@/lib/types";
import {
  EARLY_WARNING_LIMITS as L,
  changedEarlyWarningFields,
  earlyWarningDraft,
  earlyWarningPayload,
  earlyWarningPreview,
  earlyWarningServerErrors,
  seriousGroupChoices,
  toggleSeriousGroup,
  validateEarlyWarningDraft,
  type EarlyWarningDraft,
  type EarlyWarningErrors,
} from "../lib/early-warning-form";
import { Notice, ServerErrors } from "../shared/notice";
import { SaveBar } from "../shared/save-bar";
import { StaleNotice, focusFirstInvalid, useReportDirty, useSettingsNav } from "../shared/settings-context";
import { useDraft } from "../shared/use-draft";

const NO_SERVER_ERRORS = { fields: {} as EarlyWarningErrors, general: [] as string[] };
const KIND_ICONS: Record<EarlyWarningKind, typeof Siren> = { SERIOUS_INCIDENT: Siren, REPEAT_STUDENT: Repeat, RISING_CLASS: TrendingUp, PROLONGED_ERROR: Hourglass };
const PREVIEW_KINDS: EarlyWarningKind[] = ["SERIOUS_INCIDENT", "REPEAT_STUDENT", "RISING_CLASS", "PROLONGED_ERROR"];

interface SectionProps {
  draft: EarlyWarningDraft;
  errors: EarlyWarningErrors;
  set: (patch: Partial<EarlyWarningDraft>) => void;
  disabled: boolean;
}

/** Tab "Cảnh báo sớm" (REQ_V2 §7.7, settings.manage, per level) with a live preview of the current week. */
export function EarlyWarningTab({ ds }: { ds: LevelDataset }) {
  const today = useToday();
  const { refresh } = useDataset(ds.levelId);
  const source = useMemo(() => earlyWarningDraft(ds.config), [ds.config]);
  const { draft, setDraft, base, dirty, stale, reset, reload, markSaved } = useDraft(source);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState(NO_SERVER_ERRORS);
  const rootRef = useRef<HTMLDivElement>(null);
  const { goToTab } = useSettingsNav();
  useReportDirty("canh-bao", dirty);

  const clientErrors = useMemo(() => validateEarlyWarningDraft(draft), [draft]);
  const errors: EarlyWarningErrors = { ...serverErrors.fields, ...clientErrors };
  const changed = changedEarlyWarningFields(draft, base);
  // Typing stays snappy on phones: the preview follows the draft with a deferred value.
  const deferred = useDeferredValue(draft);
  const preview = useMemo(() => earlyWarningPreview(ds, deferred, today), [ds, deferred, today]);

  const set = useCallback(
    (patch: Partial<EarlyWarningDraft>) => {
      setDraft((d) => ({ ...d, ...patch }));
      setServerErrors(NO_SERVER_ERRORS);
    },
    [setDraft],
  );

  async function save() {
    if (Object.keys(clientErrors).length > 0) {
      focusFirstInvalid(rootRef.current);
      toast.error("Chưa lưu được", { description: "Vui lòng sửa các ô được đánh dấu đỏ." });
      return;
    }
    if (changed.length === 0) {
      markSaved();
      return;
    }
    setSaving(true);
    try {
      await api.settings.putEarlyWarning(ds.levelId, earlyWarningPayload(draft));
      markSaved();
      toast.success("Đã lưu ngưỡng cảnh báo sớm", { description: `${LEVELS[ds.levelId].name}: ${changed.join(", ")}.` });
      await refresh();
    } catch (err) {
      setServerErrors(earlyWarningServerErrors(validationIssues(err)));
      toast.error("Chưa lưu được ngưỡng cảnh báo", { description: errorMessage(err) });
      window.setTimeout(() => focusFirstInvalid(rootRef.current), 0);
    } finally {
      setSaving(false);
    }
  }

  function undo() {
    const previous = draft;
    reset();
    setServerErrors(NO_SERVER_ERRORS);
    toast("Đã hoàn tác thay đổi", { action: { label: "Làm lại", onClick: () => setDraft(previous) } });
  }

  const props: SectionProps = { draft, errors, set, disabled: saving };

  return (
    <div ref={rootRef} className="flex flex-col gap-5">
      {stale ? <StaleNotice onReload={reload} /> : null}
      <ServerErrors messages={serverErrors.general} />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-12">
        <RisingCard {...props} className="xl:col-span-5" />
        <PreviewCard preview={preview} dirty={dirty} className="xl:col-span-7 xl:row-span-2" />
        <ProlongedCard {...props} className="xl:col-span-5" />
        <SeriousCard {...props} ds={ds} className="md:col-span-2 xl:col-span-7" />
        <Card title="Tái phạm" icon={Repeat} subtitle="Học sinh có cảnh báo đỏ / tái phạm." className="md:col-span-2 xl:col-span-5">
          <div className="flex flex-col gap-3 text-[13.5px] leading-relaxed text-slate-600">
            <p>
              Ngưỡng tái phạm dùng chung với nhãn học sinh: hiện tại <strong className="text-slate-800">≥ {ds.config.studentAlert.perWeek} lượt/tuần</strong> là cảnh
              báo đỏ, <strong className="text-slate-800">≥ {ds.config.studentAlert.repeatMin} lượt trong {ds.config.studentAlert.repeatWindowWeeks} tuần</strong> là tái phạm.
            </p>
            <Button variant="secondary" size="sm" icon={SlidersHorizontal} onClick={() => goToTab("cau-hinh")} className="self-start">
              Mở Cấu hình thi đua → Cảnh báo học sinh
            </Button>
          </div>
        </Card>
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        errorCount={Object.keys(clientErrors).length}
        summary={changed.length > 0 ? `Đã sửa: ${changed.join(", ")}` : undefined}
        onSave={() => void save()}
        onReset={undo}
      />
    </div>
  );
}

function RisingCard({ draft, errors, set, disabled, className }: SectionProps & { className?: string }) {
  return (
    <Card title="Lớp tăng lỗi" icon={TrendingUp} subtitle="Điểm trừ tuần tăng mạnh so với trung bình các tuần trước." className={className}>
      <div className="@container">
        <div className="grid gap-4 @sm:grid-cols-2">
          <Field label="Tăng từ" error={errors.risingPct} hint="so với trung bình các tuần làm nền">
            <NumberStepper value={draft.risingPct} onChange={(v) => set({ risingPct: v })} min={L.risingPct.min} max={L.risingPct.max} step={10} suffix="%" disabled={disabled} className="w-full" />
          </Field>
          <Field label="Điểm trừ tối thiểu" error={errors.risingMinPoints} hint="trong tuần đang xét">
            <NumberStepper value={draft.risingMinPoints} onChange={(v) => set({ risingMinPoints: v })} min={L.risingMinPoints.min} max={L.risingMinPoints.max} suffix="điểm" disabled={disabled} className="w-full" />
          </Field>
          <Field label="Số tuần làm nền" error={errors.risingBaselineWeeks} hint="tuần tính thi đua liền trước" className="@sm:col-span-2">
            <NumberStepper
              value={draft.risingBaselineWeeks}
              onChange={(v) => set({ risingBaselineWeeks: v })}
              min={L.risingBaselineWeeks.min}
              max={L.risingBaselineWeeks.max}
              suffix="tuần"
              disabled={disabled}
              className="w-full"
            />
          </Field>
          <p className="num text-[13px] leading-5 text-slate-600 @sm:col-span-2">
            Lớp có ≥ {fmtNumber(draft.risingMinPoints)} điểm trừ trong tuần và tăng ≥ {fmtNumber(draft.risingPct)}% so với trung bình {fmtNumber(draft.risingBaselineWeeks)} tuần
            trước → <strong className="text-warn-strong">Tăng lỗi</strong>.
          </p>
        </div>
      </div>
    </Card>
  );
}

function ProlongedCard({ draft, errors, set, disabled, className }: SectionProps & { className?: string }) {
  return (
    <Card title="Lỗi kéo dài" icon={Hourglass} subtitle="Lớp mắc cùng một lỗi nhiều tuần liên tiếp." className={className}>
      <div className="flex flex-col gap-3">
        <Field label="Số tuần liên tiếp" error={errors.prolongedWeeks} hint="tuần tính thi đua, bỏ qua tuần nghỉ">
          <NumberStepper value={draft.prolongedWeeks} onChange={(v) => set({ prolongedWeeks: v })} min={L.prolongedWeeks.min} max={L.prolongedWeeks.max} suffix="tuần" disabled={disabled} className="w-full" />
        </Field>
        <p className="num text-[13px] leading-5 text-slate-600">
          Từ {fmtNumber(draft.prolongedWeeks)} tuần liên tiếp → <strong className="text-warn-strong">Lỗi kéo dài</strong>; từ {fmtNumber(draft.prolongedWeeks + 2)} tuần → mức cao.
        </p>
      </div>
    </Card>
  );
}

function SeriousCard({ draft, errors, set, disabled, className, ds }: SectionProps & { className?: string; ds: Pick<LevelDataset, "catalog"> }) {
  const choices = useMemo(() => seriousGroupChoices(ds.catalog, draft.seriousGroups), [ds.catalog, draft.seriousGroups]);
  return (
    <Card title="Sự việc nghiêm trọng" icon={Siren} subtitle="Sự việc chưa đóng thuộc nhóm lỗi nghiêm trọng hoặc có mức trừ cao." className={className}>
      <div className="flex flex-col gap-4">
        <fieldset className="min-w-0">
          <legend className="text-[13.5px] font-semibold text-slate-800">Nhóm lỗi nghiêm trọng</legend>
          {choices.length === 0 ? (
            <p className="mt-1 text-[13px] text-slate-500">Danh mục lỗi chưa có nhóm lỗi (Cài đặt → Danh mục lỗi).</p>
          ) : (
            <div className="mt-1 grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              {choices.map((c) => (
                <Checkbox
                  key={c.group}
                  checked={draft.seriousGroups.includes(c.group)}
                  onChange={(on) => set({ seriousGroups: toggleSeriousGroup(draft.seriousGroups, c.group, on) })}
                  disabled={disabled}
                  label={c.group}
                  description={c.inCatalog ? undefined : "Không còn trong danh mục lỗi"}
                />
              ))}
            </div>
          )}
          {errors.seriousGroups ? <p className="mt-1 text-xs font-medium text-bad-strong">{errors.seriousGroups}</p> : null}
        </fieldset>
        <Field label="Hoặc mức trừ từ" error={errors.seriousMinPenalty} hint="điểm mỗi HS / mỗi lần theo bảng điểm lỗi (0 = không dùng)">
          <NumberStepper
            value={draft.seriousMinPenalty}
            onChange={(v) => set({ seriousMinPenalty: v })}
            min={L.seriousMinPenalty.min}
            max={L.seriousMinPenalty.max}
            suffix="điểm"
            disabled={disabled}
            className="w-full max-w-60"
          />
        </Field>
        {draft.seriousGroups.length === 0 && draft.seriousMinPenalty === 0 ? (
          <Notice tone="warn">Không chọn nhóm lỗi và mức trừ bằng 0: sẽ không có cảnh báo sự việc nghiêm trọng.</Notice>
        ) : null}
      </div>
    </Card>
  );
}

function PreviewCard({ preview, dirty, className }: { preview: ReturnType<typeof earlyWarningPreview>; dirty: boolean; className?: string }) {
  const diff = preview.total - preview.savedTotal;
  return (
    <Card title="Xem trước" icon={Eye} subtitle={`Tuần hiện tại (${formatDayMonthVN(preview.week)}) · cập nhật theo ngưỡng đang nhập.`} className={className}>
      <div className="flex flex-col gap-4" aria-live="polite">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[13.5px] text-slate-600">Với ngưỡng này:</span>
          <span className="num text-[32px] font-extrabold leading-none tracking-tight text-brand-900">{fmtNumber(preview.total)}</span>
          <span className="text-[13.5px] text-slate-600">cảnh báo trong tuần hiện tại</span>
        </p>
        <ul className="grid grid-cols-2 gap-2">
          {PREVIEW_KINDS.map((k) => {
            const Icon = KIND_ICONS[k];
            return (
              <li key={k} className="flex items-center justify-between gap-2 rounded-control bg-surface-2 px-3 py-2.5 ring-1 ring-inset ring-border">
                <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-slate-700">
                  <Icon aria-hidden className="size-4 shrink-0 text-slate-500" strokeWidth={2.25} />
                  <span className="truncate">{EARLY_WARNING_KIND_LABELS[k]}</span>
                </span>
                <span className="num text-lg font-bold text-brand-900">{fmtNumber(preview.counts[k])}</span>
              </li>
            );
          })}
        </ul>
        {dirty ? (
          <Badge tone={diff === 0 ? "muted" : diff > 0 ? "warn" : "ok"} icon={BellRing} className="num self-start">
            Ngưỡng đang lưu: {fmtNumber(preview.savedTotal)} cảnh báo ({diff > 0 ? `+${fmtNumber(diff)}` : diff < 0 ? `−${fmtNumber(-diff)}` : "không đổi"})
          </Badge>
        ) : null}
      </div>
    </Card>
  );
}
