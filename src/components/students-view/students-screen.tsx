"use client";
import { useCallback, useMemo, useState } from "react";
import { FileSpreadsheet, ShieldCheck, Smile, Users } from "lucide-react";
import { EmptyDataHint, IncidentDetailSheet, StudentHistorySheet } from "@/components/app/widgets";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { useFilters } from "@/lib/client/filters";
import { useToday } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";
import { LEVELS } from "@/lib/constants";
import { periodLabel, studentStats } from "@/lib/engine";
import type { Incident, LevelDataset } from "@/lib/types";
import { ownClassesOf } from "@/components/gvcn-report/lib/report-model";
import { DEFAULT_ROW_FILTER, filterStudentRows, scopeText, summarizeStudents, type AlertFilter, type StudentRowFilter } from "./lib/students-model";
import { StudentsInsights } from "./students-insights";
import { StudentsSummaryCards } from "./students-summary";
import { StudentsTable } from "./students-table";
import { useStudentExport } from "./use-student-export";

const TABLE_ID = "danh-sach-hoc-sinh";

/** Học sinh vi phạm (SCR-06, FR-STU-001/002, FR-RAG-004). */
export function StudentsScreen({ ds }: { ds: LevelDataset }) {
  const { filters, resetFilters, activeCount } = useFilters();
  const { profile, can } = useSession();
  const today = useToday();

  // Engine: students named in the incidents of the global filter scope (GVCN datasets only name own-class students).
  const stats = useMemo(() => studentStats(ds, filters, today), [ds, filters, today]);
  const summary = useMemo(() => summarizeStudents(stats, ds.students, filters), [stats, ds.students, filters]);

  const [rowFilter, setRowFilter] = useState<StudentRowFilter>(DEFAULT_ROW_FILTER);
  const rows = useMemo(() => filterStudentRows(stats, rowFilter), [stats, rowFilter]);
  const patchFilter = useCallback((patch: Partial<StudentRowFilter>) => setRowFilter((f) => ({ ...f, ...patch })), []);
  const resetRowFilter = useCallback(() => setRowFilter(DEFAULT_ROW_FILTER), []);

  const [studentId, setStudentId] = useState<string | null>(null);
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const openIncident = useMemo(() => (incidentId ? (ds.incidents.find((i) => i.id === incidentId) ?? null) : null), [ds.incidents, incidentId]);

  const exporter = useStudentExport(ds, filters, today);
  const periodText = periodLabel(filters.period, ds.config.semesters);
  const scope = scopeText(filters, ds.classes);
  const isGvcn = profile?.role === "GVCN";
  const ownClasses = useMemo(() => ownClassesOf(profile, ds.levelId, ds.classes), [profile, ds.levelId, ds.classes]);

  const showAlert = (alert: AlertFilter) => {
    patchFilter({ alert });
    document.getElementById(TABLE_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const emptyScope =
    ds.incidents.length === 0 ? (
      <EmptyDataHint noDataYet />
    ) : (
      <EmptyState
        size="sm"
        icon={Smile}
        tone="ok"
        title="Chưa có học sinh vi phạm trong kỳ này"
        description={`Không có học sinh nào được ghi tên trong sự việc (${[periodText, scope].filter(Boolean).join(" · ")}).`}
        action={
          activeCount > 0 ? (
            <Button variant="secondary" size="sm" onClick={resetFilters}>
              Xóa bộ lọc
            </Button>
          ) : undefined
        }
      />
    );

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageHeader
        icon={Users}
        eyebrow={[LEVELS[ds.levelId].short, periodText, scope].filter(Boolean).join(" · ")}
        title="Học sinh vi phạm"
        description="Học sinh được ghi tên trong sự việc: số lượt, điểm liên quan, loại lỗi và cảnh báo tái phạm. Bấm vào học sinh để xem toàn bộ lịch sử."
        actions={
          can("excel.export") ? (
            <Button variant="secondary" icon={FileSpreadsheet} loading={exporter.busy} disabled={rows.length === 0} onClick={() => void exporter.run(rows)}>
              Xuất Excel
            </Button>
          ) : undefined
        }
      />

      {isGvcn ? (
        <p className="flex items-start gap-2.5 rounded-card bg-brand-50 px-4 py-3 text-[13px] leading-5 text-brand-900 ring-1 ring-inset ring-brand-200">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" strokeWidth={2.25} />
          <span>
            Thầy/cô đang xem học sinh của lớp chủ nhiệm{ownClasses.length > 0 ? ` (${ownClasses.join(", ")})` : ""}. Học sinh lớp khác không hiển thị để bảo
            mật thông tin cá nhân.
          </span>
        </p>
      ) : null}

      <StudentsSummaryCards summary={summary} config={ds.config} alert={rowFilter.alert} onAlert={showAlert} />

      <StudentsTable
        id={TABLE_ID}
        rows={rows}
        total={stats.length}
        filter={rowFilter}
        onFilter={patchFilter}
        onResetFilter={resetRowFilter}
        catalog={ds.catalog}
        config={ds.config}
        onOpen={setStudentId}
        emptyScope={emptyScope}
      />

      {stats.length > 0 ? <StudentsInsights stats={stats} onOpen={setStudentId} /> : null}

      <StudentHistorySheet
        ds={ds}
        studentId={studentId}
        period={filters.period}
        onClose={() => setStudentId(null)}
        onOpenIncident={(i: Incident) => setIncidentId(i.id)}
      />
      <IncidentDetailSheet ds={ds} incident={openIncident} onClose={() => setIncidentId(null)} onOpenStudent={setStudentId} />
    </div>
  );
}
