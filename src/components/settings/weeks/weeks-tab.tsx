"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { CalendarCheck2, CalendarDays, CalendarOff, CalendarRange, Crosshair, RefreshCcw } from "lucide-react";
import { Button, Card, ConfirmDialog, DataTable, KpiCard, Switch, toast, type DataTableColumn } from "@/components/ui";
import { api, errorMessage, validationIssues } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { fmtDate } from "@/lib/client/format";
import { useToday } from "@/lib/client/hooks";
import type { LevelDataset } from "@/lib/types";
import { hiddenRecordsConflict } from "../lib/calendar-conflict";
import { countRowErrors } from "../lib/draft";
import {
  calendarDrift,
  isCurrentWeek,
  rowsFromWeeks,
  validateWeekRows,
  weekChangesCount,
  weekRowLabel,
  weeksPayload,
  weeksSummary,
  type WeekRow,
} from "../lib/weeks-edit";
import { CardActions } from "../shared/card-actions";
import { useHidingRecordsConfirm } from "../shared/hiding-records-confirm";
import { Notice, ServerErrors } from "../shared/notice";
import { SaveBar } from "../shared/save-bar";
import { StaleNotice, focusFirstInvalid, useReportDirty } from "../shared/settings-context";
import { useDraft } from "../shared/use-draft";
import { MonthSelect, NoteInput, SemesterSelect, WeekCard, WeekLabel, weekAnchorId, type WeekEditorApi } from "./week-parts";

/** Tab "Lịch tuần": counted flag / month / semester / note per week, regenerate from the saved config. */
export function WeeksTab({ ds }: { ds: LevelDataset }) {
  const today = useToday();
  const { refresh } = useDataset(ds.levelId);
  const source = useMemo(() => rowsFromWeeks(ds.weeks), [ds.weeks]);
  const { draft: rows, setDraft, base, dirty, stale, reset, reload, markSaved } = useDraft<WeekRow[]>(source);
  const [saving, setSaving] = useState(false);
  const [regenOpen, setRegenOpen] = useState(false);
  const [serverMessages, setServerMessages] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const hiding = useHidingRecordsConfirm();
  useReportDirty("lich-tuan", dirty);

  const semesters = ds.config.semesters;
  const errors = useMemo(() => validateWeekRows(rows, semesters), [rows, semesters]);
  const errorCount = countRowErrors(errors);
  const summary = weeksSummary(rows, today);
  const drift = useMemo(() => calendarDrift(ds.weeks, ds.config), [ds.weeks, ds.config]);
  const changed = weekChangesCount(rows, base);
  const indexOf = useMemo(() => new Map(rows.map((r, i) => [r.weekStart, i + 1])), [rows]);
  const lastSemester = semesters.reduce<(typeof semesters)[number] | undefined>((acc, s) => (!acc || s.end > acc.end ? s : acc), undefined);
  const driftText = [
    drift.added.length ? `Thiếu ${drift.added.length} tuần so với khoảng học kỳ` : "",
    drift.removed.length ? `${drift.removed.length} tuần nằm ngoài năm học` : "",
    drift.semesterChanged.length ? `${drift.semesterChanged.length} tuần ghi sai học kỳ` : "",
  ]
    .filter(Boolean)
    .join("; ");

  const update = useCallback(
    (weekStart: string, patch: Partial<WeekRow>) => {
      setDraft((rs) => rs.map((r) => (r.weekStart === weekStart ? { ...r, ...patch } : r)));
      setServerMessages([]);
    },
    [setDraft],
  );
  const editor: WeekEditorApi = { update, errors, semesters, disabled: saving };

  /** `allowHidingRecords`: repeat after the admin confirmed that removed weeks may hide their records (409). */
  async function save(allowHidingRecords = false) {
    if (errorCount > 0) {
      focusFirstInvalid(rootRef.current);
      toast.error("Chưa lưu được", { description: `Còn ${errorCount} ô cần sửa trong lịch tuần.` });
      return;
    }
    setSaving(true);
    try {
      await api.settings.putWeeks(ds.levelId, weeksPayload(rows), { allowHidingRecords });
      markSaved();
      toast.success("Đã lưu lịch tuần", { description: `${changed} tuần được cập nhật.` });
      await refresh();
    } catch (err) {
      const conflict = allowHidingRecords ? undefined : hiddenRecordsConflict(err);
      if (conflict) {
        hiding.ask(conflict, () => save(true));
        return;
      }
      setServerMessages(validationIssues(err).map((i) => i.message));
      toast.error("Chưa lưu được lịch tuần", { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function regenerate(allowHidingRecords = false) {
    try {
      const res = await api.settings.putWeeks(ds.levelId, { regenerate: true }, { allowHidingRecords });
      reset();
      setServerMessages([]);
      toast.success("Đã tạo lại lịch tuần từ cấu hình", { description: `${res.items.length} tuần, giữ nguyên trạng thái và ghi chú của các tuần đã có.` });
      await refresh();
    } catch (err) {
      const conflict = allowHidingRecords ? undefined : hiddenRecordsConflict(err);
      if (conflict) {
        // Old weeks still hold records (e.g. school-year rollover): close this dialog and ask for the explicit confirmation.
        hiding.ask(conflict, () => regenerate(true));
        return;
      }
      toast.error("Chưa tạo lại được lịch tuần", { description: errorMessage(err) });
      throw err;
    }
  }

  function undo() {
    const previous = rows;
    reset();
    setServerMessages([]);
    toast("Đã hoàn tác thay đổi", { action: { label: "Làm lại", onClick: () => setDraft(previous) } });
  }

  function goToCurrent() {
    const el = document.getElementById(weekAnchorId(rows[summary.currentIndex]?.weekStart ?? ""));
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  const columns: DataTableColumn<WeekRow>[] = [
    {
      key: "week",
      header: "Tuần",
      width: 230,
      cell: (r) => <WeekLabel row={r} index={indexOf.get(r.weekStart)} current={isCurrentWeek(r.weekStart, today)} />,
    },
    { key: "month", header: "Tháng", width: 184, cell: (r) => <MonthSelect row={r} api={editor} /> },
    { key: "semester", header: "Học kỳ", width: 170, cell: (r) => <SemesterSelect row={r} api={editor} /> },
    {
      key: "counted",
      header: "Tính thi đua",
      width: 110,
      align: "center",
      cell: (r) => (
        <Switch
          size="sm"
          checked={r.counted}
          onChange={(v) => update(r.weekStart, { counted: v })}
          aria-label={`Tính thi đua ${weekRowLabel(r.weekStart)}`}
          disabled={saving}
        />
      ),
    },
    { key: "note", header: "Ghi chú", cell: (r) => <NoteInput row={r} api={editor} /> },
  ];

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      {stale ? <StaleNotice onReload={reload} /> : null}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Tổng số tuần"
          value={summary.total}
          icon={CalendarDays}
          tone="brand"
          hint={`${fmtDate(rows[0]?.weekStart)} – ${fmtDate(lastSemester?.end)}`}
        />
        <KpiCard label="Tính thi đua" value={summary.counted} icon={CalendarCheck2} tone="ok" hint="Được cộng điểm nền" />
        <KpiCard label="Không tính" value={summary.notCounted} icon={CalendarOff} tone="muted" hint="Tuần nghỉ, lễ, thi…" />
        <KpiCard label="Đã qua" value={`${summary.elapsed}/${summary.total}`} icon={CalendarRange} tone="star" hint="Tính đến tuần hiện tại" />
      </div>

      {!drift.matches ? (
        <Notice
          tone="warn"
          title="Lịch tuần chưa khớp với cấu hình học kỳ đã lưu"
          action={
            <Button size="sm" variant="secondary" icon={RefreshCcw} onClick={() => setRegenOpen(true)}>
              Tạo lại từ cấu hình
            </Button>
          }
        >
          {driftText}.
        </Notice>
      ) : null}
      <ServerErrors messages={serverMessages} />

      <Card
        padding="none"
        icon={CalendarDays}
        title="Các tuần trong năm học"
        subtitle="Tuần bắt đầu Thứ Hai. Tắt “Tính thi đua” cho tuần nghỉ (lễ, thi…) để không cộng điểm nền; ghi rõ lý do ở Ghi chú."
        actions={
          <CardActions>
            {summary.currentIndex >= 0 ? (
              <Button variant="ghost" size="sm" icon={Crosshair} onClick={goToCurrent}>
                Tuần hiện tại
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" icon={RefreshCcw} onClick={() => setRegenOpen(true)} disabled={saving}>
              Tạo lại từ cấu hình
            </Button>
          </CardActions>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.weekStart}
          caption="Lịch tuần của năm học"
          stickyHeader
          maxHeight="min(70vh, 720px)"
          dense
          rowClassName={(r) => (isCurrentWeek(r.weekStart, today) ? "bg-star-50" : !r.counted ? "bg-surface-2" : undefined)}
          mobileCard={(r) => <WeekCard row={r} index={indexOf.get(r.weekStart) ?? 0} current={isCurrentWeek(r.weekStart, today)} api={editor} />}
        />
      </Card>

      <ConfirmDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title="Tạo lại lịch tuần từ cấu hình?"
        message={`Hệ thống tạo các tuần từ Thứ Hai ${fmtDate(ds.config.firstWeek)} đến hết ${lastSemester?.name ?? "học kỳ cuối"} (${fmtDate(lastSemester?.end)}) theo cấu hình đã lưu. Tuần đã có giữ nguyên “Tính thi đua” và ghi chú; tuần nằm ngoài khoảng này sẽ bị bỏ.`}
        confirmLabel="Tạo lại lịch tuần"
        onConfirm={() => regenerate()}
      >
        {dirty ? <Notice tone="warn">Các thay đổi chưa lưu trong bảng sẽ bị bỏ.</Notice> : null}
      </ConfirmDialog>

      {hiding.dialog}

      <SaveBar dirty={dirty} saving={saving} errorCount={errorCount} summary={`${changed} tuần đã sửa`} onSave={() => void save()} onReset={undo} />
    </div>
  );
}
