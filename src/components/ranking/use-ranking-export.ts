"use client";
import { useCallback, useRef, useState } from "react";
import { toast, useLatest } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { MIME, downloadBlob } from "@/lib/client/download";
import { LEVELS } from "@/lib/constants";
import { periodLabel } from "@/lib/engine";
import type { GradeRanking, LevelDataset, Period } from "@/lib/types";
import { rankingFileName } from "./lib/ranking-view";

export interface RankingExportInput {
  ds: LevelDataset;
  grades: GradeRanking[];
  period: Period;
  today: string;
  /** Grade filter (only that grade is exported, and the file name says so). */
  grade?: number;
}

/**
 * "Xuất Excel" of the ranking: ExcelJS is loaded on demand, the file is downloaded, then the export is written to the
 * audit log (POST /api/exports/log, kind "ranking").
 */
export function useRankingExport(input: RankingExportInput): { exporting: boolean; exportExcel: () => Promise<void> } {
  const [exporting, setExporting] = useState(false);
  const busy = useRef(false);
  const latest = useLatest(input);

  const exportExcel = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setExporting(true);
    const { ds, grades, period, today, grade } = latest.current;
    try {
      const label = periodLabel(period, ds.config.semesters);
      const rows = grades.flatMap((g) => g.rows);
      const { exportRankingSheet } = await import("@/lib/excel");
      const bytes = await exportRankingSheet(rows, {
        levelName: LEVELS[ds.levelId].name,
        levelId: ds.levelId,
        periodLabel: label,
        today,
        topRatio: ds.config.top90Ratio,
      });
      const fileName = rankingFileName(ds.levelId, label, grade);
      downloadBlob(bytes, fileName, MIME.xlsx);
      toast.success("Đã xuất bảng xếp hạng", { description: fileName });
      try {
        await api.exportsLog({
          levelId: ds.levelId,
          kind: "ranking",
          detail: { period: label, grade: grade ?? null, classes: rows.length },
        });
      } catch (err) {
        toast.warning("Đã tải tệp nhưng chưa ghi được nhật ký xuất", { description: errorMessage(err) });
      }
    } catch (err) {
      toast.error(errorMessage(err, "Không xuất được tệp Excel. Vui lòng thử lại."));
    } finally {
      busy.current = false;
      setExporting(false);
    }
  }, [latest]);

  return { exporting, exportExcel };
}
