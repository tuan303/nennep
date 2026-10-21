"use client";
import { useState } from "react";
import { toast } from "@/components/ui";
import { api, downloadBlob, errorMessage, MIME } from "@/lib/client/api";
import { LEVELS } from "@/lib/constants";
import { periodLabel, type StudentStat } from "@/lib/engine";
import type { GlobalFilters, LevelDataset } from "@/lib/types";
import { scopeText, studentsExportFileName, toExportRows } from "./lib/students-model";

/** Excel export of the visible student rows (exportStudentList, lazy-loaded) + audit log entry. */
export function useStudentExport(ds: LevelDataset, filters: GlobalFilters, today: string) {
  const [busy, setBusy] = useState(false);

  async function run(rows: readonly StudentStat[]) {
    if (busy || rows.length === 0) return;
    setBusy(true);
    try {
      const { exportStudentList } = await import("@/lib/excel");
      const scope = scopeText(filters, ds.classes);
      const label = [periodLabel(filters.period, ds.config.semesters), scope].filter(Boolean).join(" · ");
      const bytes = await exportStudentList(toExportRows(rows), { levelName: LEVELS[ds.levelId].name, periodLabel: label, today });
      downloadBlob(bytes, studentsExportFileName(ds.levelId, filters.period, filters), MIME.xlsx);
      toast.success("Đã xuất tệp Excel", { description: `${rows.length} học sinh · ${label}` });
      await api
        .exportsLog({
          levelId: ds.levelId,
          kind: "students",
          detail: { mode: filters.period.mode, period: filters.period.key ?? "all", grade: filters.grade, classCode: filters.classCode, rows: rows.length },
        })
        .catch(() => undefined); // audit trail only – never block the download
    } catch (err) {
      toast.error(errorMessage(err, "Chưa xuất được tệp Excel. Vui lòng thử lại."));
    } finally {
      setBusy(false);
    }
  }

  return { busy, run };
}
