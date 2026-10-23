"use client";
/**
 * Editor of "Công tác phối hợp tuần/tháng mới" (section 5 of the report; `report.plan` = ADMIN / EDITOR), above the A4
 * preview – which prints the draft as typed. "Lưu" replaces the stored plan of the level + report period. Never printed.
 */
import { useRef, type ReactNode } from "react";
import { ArrowDown, ArrowUp, CircleAlert, ClipboardList, History, Plus, RefreshCw, RotateCcw, Save, Trash2, TriangleAlert } from "lucide-react";
import { Badge, Button, Card, Field, IconButton, Input, SkeletonText, Textarea, cn, toneSoft } from "@/components/ui";
import { fmtNumber } from "@/lib/client/format";
import {
  PLAN_LIMITS,
  addPlanRow,
  emptyPlanRow,
  movePlanRow,
  nextPeriodLabel,
  planDueExample,
  planSavedLine,
  planTitle,
  removePlanRow,
  updatePlanRow,
  type PlanDraftRow,
  type PlanRowField,
} from "./lib/report-plan";
import type { ReportPlanState } from "./use-report-plan";

export function ReportPlanEditor({ plan }: { plan: ReportPlanState }) {
  const rootRef = useRef<HTMLDivElement>(null);
  /** Row whose "Nội dung công việc" takes the focus once mounted (just added). */
  const focusRow = useRef<string | null>(null);
  const period = plan.period;
  if (!period) return null;

  const label = nextPeriodLabel(period);
  const rows = plan.draft.rows;
  const full = rows.length >= PLAN_LIMITS.items;
  const savedLine = planSavedLine(plan.saved);
  const canSave = plan.dirty && !plan.issues.message && !plan.conflict;

  const set = (key: string, field: PlanRowField, value: string) => plan.setDraft((d) => updatePlanRow(d, key, field, value));
  function add() {
    const row = emptyPlanRow();
    focusRow.current = row.key;
    plan.setDraft((d) => addPlanRow(d, row));
  }
  function move(key: string, delta: -1 | 1) {
    plan.setDraft((d) => movePlanRow(d, key, delta));
    // Keep the keyboard on the moved row (its other arrow when it reached an end).
    window.requestAnimationFrame(() => {
      const li = rootRef.current?.querySelector(`[data-plan-row="${key}"]`);
      const same = li?.querySelector<HTMLButtonElement>(`[data-move="${delta}"]:not(:disabled)`);
      (same ?? li?.querySelector<HTMLButtonElement>("[data-move]:not(:disabled)"))?.focus();
    });
  }

  return (
    <Card
      data-print-hide
      icon={ClipboardList}
      headingLevel={2}
      title={planTitle(period.mode)}
      subtitle={`${label} · in ở mục 5 của báo cáo`}
      actions={
        plan.dirty ? (
          <Badge tone="warn" dot>
            Chưa lưu
          </Badge>
        ) : null
      }
    >
      {plan.status === "loading" ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Đang tải công tác phối hợp</span>
          <SkeletonText lines={3} />
        </div>
      ) : plan.status === "error" ? (
        <PlanAlert
          tone="bad"
          title="Chưa tải được công tác phối hợp"
          action={
            <Button size="sm" variant="secondary" icon={RefreshCw} loading={plan.reloading} onClick={() => void plan.reload()}>
              Thử lại
            </Button>
          }
        >
          {plan.error}
        </PlanAlert>
      ) : (
        <div
          ref={rootRef}
          className="flex flex-col gap-4"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canSave) {
              e.preventDefault();
              void plan.save();
            }
          }}
        >
          {plan.conflict ? (
            <PlanAlert
              tone="warn"
              title="Đã có người khác lưu công tác phối hợp của kỳ này"
              action={
                <Button size="sm" variant="secondary" icon={RefreshCw} loading={plan.reloading} onClick={() => void plan.reload()}>
                  Tải lại bản mới nhất
                </Button>
              }
            >
              {plan.conflict} Thay đổi bạn đang sửa chưa được lưu và sẽ được thay bằng bản mới nhất khi tải lại.
            </PlanAlert>
          ) : null}

          <fieldset disabled={plan.saving} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
            <legend className="sr-only">Danh sách công việc {label}</legend>
            {rows.length === 0 ? (
              <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] text-slate-600">
                Chưa có công việc nào. Bấm “Thêm công việc” để ghi các việc cần phối hợp trong {label.toLocaleLowerCase("vi-VN")}.
              </p>
            ) : (
              <ol className="flex flex-col gap-3">
                {rows.map((row, idx) => (
                  <PlanRowEditor
                    key={row.key}
                    row={row}
                    index={idx}
                    count={rows.length}
                    duePlaceholder={planDueExample(period)}
                    focusRef={focusRow}
                    onChange={set}
                    onMove={move}
                    onRemove={(key) => plan.setDraft((d) => removePlanRow(d, key))}
                  />
                ))}
              </ol>
            )}
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <Button variant="secondary" icon={Plus} onClick={add} disabled={full} className="w-full sm:w-auto">
                Thêm công việc
              </Button>
              {full ? <p className="text-xs text-slate-500">Tối đa {fmtNumber(PLAN_LIMITS.items)} công việc.</p> : null}
            </div>
            <Field label="Ghi chú" hint="Không bắt buộc – in dưới bảng công việc.">
              <Textarea
                rows={2}
                value={plan.draft.note}
                maxLength={PLAN_LIMITS.note}
                onChange={(e) => {
                  const note = e.target.value;
                  plan.setDraft((d) => ({ ...d, note }));
                }}
                className="min-h-20"
              />
            </Field>
          </fieldset>

          <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1" aria-live="polite">
              {plan.issues.message ? (
                <p className="flex items-start gap-1.5 text-[13px] text-warn-strong">
                  <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
                  {plan.issues.message}
                </p>
              ) : null}
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <History aria-hidden className="size-3.5 shrink-0" />
                {savedLine ?? "Chưa lưu công tác phối hợp cho kỳ báo cáo này."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
              <Button variant="secondary" icon={RotateCcw} onClick={plan.undo} disabled={!plan.dirty || plan.saving}>
                Hoàn tác
              </Button>
              <Button icon={Save} onClick={() => void plan.save()} loading={plan.saving} disabled={!canSave}>
                Lưu
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

interface PlanRowEditorProps {
  row: PlanDraftRow;
  index: number;
  count: number;
  duePlaceholder: string;
  focusRef: { current: string | null };
  onChange: (key: string, field: PlanRowField, value: string) => void;
  onMove: (key: string, delta: -1 | 1) => void;
  onRemove: (key: string) => void;
}

/** One task: content (multi-line), owner, due; reorder / delete buttons (≥ 44 px on touch screens). */
function PlanRowEditor({ row, index, count, duePlaceholder, focusRef, onChange, onMove, onRemove }: PlanRowEditorProps) {
  const no = index + 1;
  return (
    <li data-plan-row={row.key} className="flex flex-col gap-2.5 rounded-control border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="num text-[13px] font-semibold text-brand-900">Công việc {fmtNumber(no)}</span>
        <div className="flex items-center gap-1">
          <IconButton icon={ArrowUp} label={`Đưa công việc ${no} lên trên`} size="sm" data-move={-1} disabled={index === 0} onClick={() => onMove(row.key, -1)} />
          <IconButton
            icon={ArrowDown}
            label={`Đưa công việc ${no} xuống dưới`}
            size="sm"
            data-move={1}
            disabled={index === count - 1}
            onClick={() => onMove(row.key, 1)}
          />
          <IconButton icon={Trash2} label={`Xóa công việc ${no}`} size="sm" className="text-bad-strong hover:text-bad-strong" onClick={() => onRemove(row.key)} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_15rem_11rem]">
        <Field label="Nội dung công việc" required className="sm:col-span-2 lg:col-span-1">
          <Textarea
            ref={(el) => {
              if (el && focusRef.current === row.key) {
                focusRef.current = null;
                el.focus();
              }
            }}
            rows={2}
            value={row.content}
            maxLength={PLAN_LIMITS.content}
            placeholder="VD: Tổng vệ sinh lớp học, chuẩn bị chào cờ"
            onChange={(e) => onChange(row.key, "content", e.target.value)}
            className="min-h-11"
          />
        </Field>
        <Field label="Phụ trách / phối hợp">
          <Input
            value={row.owner}
            maxLength={PLAN_LIMITS.owner}
            placeholder="VD: GVCN khối 6, Đội TNTP"
            onChange={(e) => onChange(row.key, "owner", e.target.value)}
          />
        </Field>
        <Field label="Thời hạn">
          <Input value={row.due} maxLength={PLAN_LIMITS.due} placeholder={duePlaceholder} onChange={(e) => onChange(row.key, "due", e.target.value)} />
        </Field>
      </div>
    </li>
  );
}

/** Inline message box of the editor (icon + text, never colour alone). */
function PlanAlert({ tone, title, children, action }: { tone: "warn" | "bad"; title: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === "bad" ? CircleAlert : TriangleAlert;
  return (
    <div role="alert" className={cn("flex flex-col gap-3 rounded-control px-3.5 py-3 ring-1 ring-inset sm:flex-row sm:items-center sm:justify-between", toneSoft[tone])}>
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon aria-hidden className="mt-0.5 size-[18px] shrink-0" strokeWidth={2.25} />
        <div className="min-w-0 text-[13.5px] leading-relaxed">
          <p className="font-semibold">{title}</p>
          {children ? <p className="mt-0.5 opacity-90">{children}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 pl-7 sm:pl-0">{action}</div> : null}
    </div>
  );
}

/** Load error of section 5 for viewers without the editor (the printed section says it could not be loaded). */
export function ReportPlanLoadError({ plan }: { plan: ReportPlanState }) {
  if (plan.status !== "error" || !plan.period) return null;
  return (
    <div data-print-hide>
      <PlanAlert
        tone="bad"
        title={`Chưa tải được ${planTitle(plan.period.mode).toLocaleLowerCase("vi-VN")}`}
        action={
          <Button size="sm" variant="secondary" icon={RefreshCw} loading={plan.reloading} onClick={() => void plan.reload()}>
            Thử lại
          </Button>
        }
      >
        {plan.error}
      </PlanAlert>
    </div>
  );
}
