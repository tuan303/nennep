"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { History } from "lucide-react";
import { toast } from "@/components/ui";
import { api, errorMessage, validationIssues } from "@/lib/client/api";
import { useDataset } from "@/lib/client/data";
import { fmtDateTime } from "@/lib/client/format";
import { LEVELS } from "@/lib/constants";
import type { LevelDataset } from "@/lib/types";
import {
  CONFIG_GROUP_LABELS,
  calendarChanged,
  changedConfigGroups,
  configPatch,
  configServerErrors,
  draftFromConfig,
  validateConfigDraft,
  type ConfigDraft,
  type ConfigErrors,
} from "../lib/config-form";
import { hiddenRecordsConflict } from "../lib/calendar-conflict";
import { useHidingRecordsConfirm } from "../shared/hiding-records-confirm";
import { ServerErrors } from "../shared/notice";
import { SaveBar } from "../shared/save-bar";
import { StaleNotice, focusFirstInvalid, useReportDirty, useSettingsNav } from "../shared/settings-context";
import { useDraft } from "../shared/use-draft";
import { GeneralCard, SemestersCard } from "./config-general";
import { RagCard } from "./config-rag";
import { RankingRulesCard, SlaCard, StudentAlertCard } from "./config-rules";

const NO_SERVER_ERRORS = { fields: {} as ConfigErrors, general: [] as string[] };

/** Tab "Cấu hình thi đua" of the selected level. */
export function ConfigTab({ ds }: { ds: LevelDataset }) {
  const { refresh } = useDataset(ds.levelId);
  const source = useMemo(() => draftFromConfig(ds.config), [ds.config]);
  const { draft, setDraft, base, dirty, stale, reset, reload, markSaved } = useDraft(source);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState(NO_SERVER_ERRORS);
  const rootRef = useRef<HTMLDivElement>(null);
  const hiding = useHidingRecordsConfirm();
  useReportDirty("cau-hinh", dirty);
  const { goToTab } = useSettingsNav();

  const clientErrors = useMemo(() => validateConfigDraft(draft), [draft]);
  const errors: ConfigErrors = { ...serverErrors.fields, ...clientErrors };
  const groups = changedConfigGroups(draft, base);

  const set = useCallback(
    (patch: Partial<ConfigDraft>) => {
      setDraft((d) => ({ ...d, ...patch }));
      setServerErrors(NO_SERVER_ERRORS);
    },
    [setDraft],
  );

  /** `allowHidingRecords`: repeat after the admin confirmed that weeks dropped from the calendar may hide records (409). */
  async function save(allowHidingRecords = false) {
    if (Object.keys(clientErrors).length > 0) {
      focusFirstInvalid(rootRef.current);
      toast.error("Chưa lưu được", { description: "Vui lòng sửa các ô được đánh dấu đỏ." });
      return;
    }
    const patch = configPatch(draft, base);
    if (Object.keys(patch).length === 0) {
      markSaved();
      return;
    }
    setSaving(true);
    try {
      await api.settings.putConfig(ds.levelId, patch, { allowHidingRecords });
      markSaved();
      const description = `${LEVELS[ds.levelId].name}: ${groups.map((g) => CONFIG_GROUP_LABELS[g]).join(", ")}.`;
      if (calendarChanged(draft, base)) {
        toast.success("Đã lưu cấu hình thi đua", {
          description: `${description} Lịch tuần chưa đổi – hãy “Tạo lại từ cấu hình” nếu cần.`,
          action: { label: "Mở Lịch tuần", onClick: () => goToTab("lich-tuan") },
        });
      } else {
        toast.success("Đã lưu cấu hình thi đua", { description });
      }
      await refresh();
    } catch (err) {
      const conflict = allowHidingRecords ? undefined : hiddenRecordsConflict(err);
      if (conflict) {
        hiding.ask(conflict, () => save(true));
        return;
      }
      setServerErrors(configServerErrors(validationIssues(err)));
      toast.error("Chưa lưu được cấu hình", { description: errorMessage(err) });
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

  const props = { draft, base, errors, set, disabled: saving };
  const updated = ds.config.updatedAt ? fmtDateTime(ds.config.updatedAt) : "";

  return (
    <div ref={rootRef} className="flex flex-col gap-5">
      {stale ? <StaleNotice onReload={reload} /> : null}
      <ServerErrors messages={serverErrors.general} />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-12">
        <GeneralCard {...props} className="xl:col-span-5" />
        <SemestersCard {...props} className="xl:col-span-7" />
        <RagCard {...props} className="md:col-span-2 xl:col-span-12" />
        <RankingRulesCard {...props} classes={ds.classes} levelId={ds.levelId} className="xl:col-span-4" />
        <StudentAlertCard {...props} className="xl:col-span-4" />
        <SlaCard {...props} className="md:col-span-2 xl:col-span-4" />
      </div>
      {updated ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <History aria-hidden className="size-3.5" />
          Cập nhật lần cuối {updated}
          {ds.config.updatedBy ? ` bởi ${ds.config.updatedBy}` : ""}
        </p>
      ) : null}
      {hiding.dialog}
      <SaveBar
        dirty={dirty}
        saving={saving}
        errorCount={Object.keys(clientErrors).length}
        summary={groups.length > 0 ? `Đã sửa: ${groups.map((g) => CONFIG_GROUP_LABELS[g]).join(", ")}` : undefined}
        onSave={() => void save()}
        onReset={undo}
      />
    </div>
  );
}
