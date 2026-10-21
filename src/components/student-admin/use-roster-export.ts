"use client";
import { useState } from "react";
import { toast } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { downloadBlob, MIME } from "@/lib/client/download";
import { useSession } from "@/lib/client/session";
import { LEVELS, SCHOOL_NAME } from "@/lib/constants";
import { compactDate, formatDateVN } from "@/lib/engine/dates";
import type { LevelDataset, StudentLite } from "@/lib/types";
import { ROSTER_EXPORT_COLUMNS, rosterExportRows } from "./lib/roster";

interface Args {
  ds: Pick<LevelDataset, "levelId">;
  /** The filtered roster rows (what the user sees). */
  rows: readonly StudentLite[];
  violations: ReadonlyMap<string, number>;
  today: string;
  /** "Lớp 6A01 · Đang học" – written in the subtitle and the audit log. */
  description: string;
}

/**
 * "Xuất danh sách": the filtered roster as .xlsx (ExcelJS lazy-loaded). The sheet "DS Học sinh" uses the
 * roster headers, so the same file can be edited and imported back. The export is audited when allowed.
 */
export function useRosterExport({ ds, rows, violations, today, description }: Args) {
  const { can } = useSession();
  const [exporting, setExporting] = useState(false);

  async function exportList() {
    if (rows.length === 0 || exporting) return;
    setExporting(true);
    try {
      const { exportSimpleSheet } = await import("@/lib/excel");
      const level = LEVELS[ds.levelId].name;
      const bytes = await exportSimpleSheet(`DANH SÁCH HỌC SINH – ${level.toLocaleUpperCase("vi-VN")}`, ROSTER_EXPORT_COLUMNS, rosterExportRows(rows, violations), {
        sheetName: "DS Học sinh",
        subtitle: `${SCHOOL_NAME} · ${description} · Xuất ngày ${formatDateVN(today)}`,
      });
      downloadBlob(bytes, `DS_HocSinh_${ds.levelId}_${compactDate(today)}.xlsx`, MIME.xlsx);
      toast.success(`Đã xuất danh sách ${rows.length.toLocaleString("vi-VN")} học sinh.`);
      if (can("excel.export")) {
        void api.exportsLog({ levelId: ds.levelId, kind: "students", detail: { count: rows.length, filter: description } }).catch(() => undefined);
      }
    } catch (err) {
      toast.error(errorMessage(err, "Không xuất được file Excel. Vui lòng thử lại."));
    } finally {
      setExporting(false);
    }
  }

  return { exportList, exporting };
}
