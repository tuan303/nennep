"use client";
import { useMemo, type ReactNode } from "react";
import { Info, SearchX, UsersRound } from "lucide-react";
import { Button, Card, DataTable, EmptyState, SearchInput, SegmentedControl, Select, type DataTableColumn } from "@/components/ui";
import { fmtDate, fmtNumber } from "@/lib/client/format";
import type { StudentStat } from "@/lib/engine";
import type { CatalogItem, LevelConfig } from "@/lib/types";
import { AlertCell, ErrorChips, NameCell, POINTS_HINT, PointsHeader, StudentCard } from "./student-cells";
import { MIN_INCIDENT_OPTIONS, alertRank, isDefaultRowFilter, nameSortKey, type AlertFilter, type StudentRowFilter } from "./lib/students-model";

const ALERT_OPTIONS: ReadonlyArray<{ value: AlertFilter; label: string }> = [
  { value: "ALL", label: "Tất cả" },
  { value: "REPEAT", label: "Tái phạm" },
  { value: "WEEKLY_RED", label: "Cảnh báo đỏ" },
];

const PAGE_SIZE = 50;

export interface StudentsTableProps {
  id?: string;
  /** Rows after the toolbar filters. */
  rows: StudentStat[];
  /** Students before the toolbar filters. */
  total: number;
  filter: StudentRowFilter;
  onFilter: (patch: Partial<StudentRowFilter>) => void;
  onResetFilter: () => void;
  catalog: readonly Pick<CatalogItem, "code" | "displayName">[];
  /** Alert thresholds (badge tooltips). */
  config: Pick<LevelConfig, "studentAlert">;
  onOpen: (studentId: string) => void;
  /** Shown when there is no student at all in the scope (before toolbar filters). */
  emptyScope: ReactNode;
}

/** Toolbar (search, alert, min incidents) + sortable student table (cards on phones, "Xem thêm" by 50). */
export function StudentsTable({ id, rows, total, filter, onFilter, onResetFilter, catalog, config, onOpen, emptyScope }: StudentsTableProps) {
  const columns = useMemo<DataTableColumn<StudentStat>[]>(
    () => [
      { key: "id", header: "Mã HS", width: 104, sortValue: (s) => s.id, cell: (s) => <span className="num text-[13px] text-slate-500">{s.id}</span> },
      { key: "name", header: "Họ tên", sortValue: (s) => nameSortKey(s.name), cell: (s) => <NameCell s={s} /> },
      { key: "class", header: "Lớp", width: 72, sortValue: (s) => s.classCode, cell: (s) => <span className="num font-semibold text-brand-900">{s.classCode}</span> },
      {
        key: "incidents",
        header: "Số lượt",
        align: "right",
        width: 84,
        sortValue: (s) => s.incidents,
        cell: (s) => <span className="text-[15px] font-bold text-brand-900">{fmtNumber(s.incidents)}</span>,
      },
      { key: "points", header: <PointsHeader />, headerLabel: "Điểm", align: "right", width: 76, sortValue: (s) => s.points, cell: (s) => fmtNumber(s.points) },
      { key: "errors", header: "Loại lỗi", sortValue: (s) => s.errors.length, cell: (s) => <ErrorChips s={s} catalog={catalog} /> },
      { key: "last", header: "Gần nhất", width: 104, sortValue: (s) => s.lastDate, cell: (s) => <span className="num text-[13px]">{fmtDate(s.lastDate)}</span> },
      { key: "alert", header: "Cảnh báo", sortValue: (s) => alertRank(s.alert), cell: (s) => <AlertCell s={s} config={config} /> },
    ],
    [catalog, config],
  );

  const filtered = !isDefaultRowFilter(filter);

  return (
    <Card
      id={id}
      padding="none"
      icon={UsersRound}
      title="Danh sách học sinh"
      subtitle={filtered ? `${fmtNumber(rows.length)}/${fmtNumber(total)} học sinh phù hợp` : `${fmtNumber(total)} học sinh có vi phạm`}
      className="scroll-mt-24"
      footer={
        total > 0 ? (
          <span className="flex items-start gap-2 text-xs leading-5 text-slate-600">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand-500" strokeWidth={2.25} />
            Điểm: {POINTS_HINT} Bấm vào học sinh để xem toàn bộ lịch sử.
          </span>
        ) : undefined
      }
    >
      {total > 0 ? (
        <div className="flex flex-col gap-3 border-b border-border px-4 pb-4 sm:px-5 lg:flex-row lg:items-center">
          <SearchInput
            value={filter.query}
            onChange={(query) => onFilter({ query })}
            placeholder="Tìm theo tên hoặc mã học sinh…"
            ariaLabel="Tìm học sinh"
            className="lg:max-w-sm lg:flex-1"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:ml-auto">
            <SegmentedControl<AlertFilter>
              ariaLabel="Lọc theo cảnh báo"
              size="sm"
              fullWidth
              className="sm:inline-flex sm:w-auto"
              options={ALERT_OPTIONS}
              value={filter.alert}
              onChange={(alert) => onFilter({ alert })}
            />
            <Select<string>
              aria-label="Số lượt vi phạm tối thiểu"
              options={MIN_INCIDENT_OPTIONS}
              value={String(filter.minIncidents)}
              onChange={(v) => onFilter({ minIncidents: Number(v ?? "1") || 1 })}
              wrapperClassName="sm:w-40"
            />
          </div>
        </div>
      ) : null}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        onRowClick={(s) => onOpen(s.id)}
        rowLabel={(s) => `Xem lịch sử của ${s.name}, lớp ${s.classCode}`}
        mobileCard={(s) => <StudentCard s={s} catalog={catalog} />}
        pageSize={PAGE_SIZE}
        caption="Học sinh có vi phạm trong phạm vi đang lọc"
        emptyState={
          total === 0 ? (
            emptyScope
          ) : (
            <EmptyState
              size="sm"
              icon={SearchX}
              title="Không có học sinh phù hợp"
              description="Thử từ khóa khác, bỏ lọc cảnh báo hoặc giảm số lượt tối thiểu."
              action={
                <Button variant="secondary" size="sm" onClick={onResetFilter}>
                  Xóa bộ lọc danh sách
                </Button>
              }
            />
          )
        }
      />
    </Card>
  );
}
