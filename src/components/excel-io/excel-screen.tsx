"use client";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader, SkeletonCard, cn } from "@/components/ui";
import { DatasetGate, useShellOptions } from "@/components/app/shell";
import { LEVELS } from "@/lib/constants";
import { useLevel } from "@/lib/client/data";
import { useSession } from "@/lib/client/session";
import { ExportPanel } from "./export-panel";
import { ImportWizard } from "./import-wizard";
import { TemplateGuide } from "./template-guide";

/** "/nhap-xuat": workbook import wizard (excel.import), exports + HTML snapshot (excel.export), file template guide. */
export function ExcelScreen() {
  useShellOptions({ hideFilters: true });
  const { can } = useSession();
  const { levelId } = useLevel();
  const canImport = can("excel.import");
  const canExport = can("excel.export");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={FileSpreadsheet}
        eyebrow={`${LEVELS[levelId].name}`}
        title="Nhập/Xuất Excel"
        description={
          canImport
            ? "Nhập sổ nền nếp từ Excel có kiểm tra trước từng dòng, xuất workbook của cấp học và bản chụp báo cáo HTML."
            : "Xuất workbook của cấp học và bản chụp báo cáo HTML."
        }
      />

      <div className={cn("grid grid-cols-1 gap-5", canImport && canExport && "xl:grid-cols-12")}>
        {canImport ? (
          <div className={cn("min-w-0", canExport && "xl:col-span-8")}>
            <ImportWizard />
          </div>
        ) : null}
        {canExport ? (
          <div className={cn("min-w-0", canImport && "xl:col-span-4")}>
            <DatasetGate fallback={<SkeletonCard rows={6} label="Đang tải dữ liệu cấp học…" />}>{(ds) => <ExportPanel key={ds.levelId} ds={ds} />}</DatasetGate>
          </div>
        ) : null}
      </div>

      <TemplateGuide canExport={canExport} />
    </div>
  );
}
