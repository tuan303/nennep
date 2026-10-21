"use client";
import { useMemo, useState } from "react";
import { CircleCheck, ListChecks, SearchX } from "lucide-react";
import { Button, Card, DataTable, EmptyState, Pill, SearchInput, StatusBadge, type DataTableColumn } from "@/components/ui";
import { INCIDENT_STATUSES } from "@/lib/constants";
import type { Incident } from "@/lib/types";
import { DateCell, DetailCell, FeedbackCell, IncidentCard, IssueCell, PointsCell, RemediationCell, SubjectCell } from "./incident-cells";
import { filterReportRows, statusCounts, subjectText, type StatusFilter } from "./lib/report-model";

const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "Tất cả" },
  ...INCIDENT_STATUSES.map((s) => ({ value: s, label: s })),
];

export interface IncidentTableProps {
  classCode: string;
  periodText: string;
  /** All incidents of the report (oldest first). */
  incidents: Incident[];
  onOpen: (i: Incident) => void;
  /** Quick feedback (only rows where `canFeedback` is true). */
  onFeedback: (i: Incident) => void;
  canFeedback: (i: Incident) => boolean;
  /** "Khắc phục" row action (biện pháp xử lý / khắc phục) – rows where `canRemediate` is true. */
  onRemediate?: (i: Incident) => void;
  canRemediate?: (i: Incident) => boolean;
  /** Viewer is a GVCN (copy for the subtitle). */
  isGvcn: boolean;
  /** Initial search text / status filter (default: none). */
  defaultQuery?: string;
  defaultStatus?: StatusFilter;
}

/**
 * "Chi tiết sự việc": search + status filter, sortable table (cards on phones), quick GVCN feedback.
 * The search and status filter only narrow the screen: the printed / PDF report always lists every incident of the
 * period, matching the KPIs, the copied text and the Excel export.
 */
export function IncidentTable({
  classCode,
  periodText,
  incidents,
  onOpen,
  onFeedback,
  canFeedback,
  onRemediate,
  canRemediate,
  isGvcn,
  defaultQuery = "",
  defaultStatus = "ALL",
}: IncidentTableProps) {
  const [query, setQuery] = useState(defaultQuery);
  const [status, setStatus] = useState<StatusFilter>(defaultStatus);
  const counts = useMemo(() => statusCounts(incidents), [incidents]);
  const rows = useMemo(() => filterReportRows(incidents, { query, status }), [incidents, query, status]);
  const filtered = query.trim() !== "" || status !== "ALL";
  // On paper the report always lists every incident (the screen filter is only a working view).
  const printAll = filtered && incidents.length > 0;

  const columns = useMemo<DataTableColumn<Incident>[]>(
    () => [
      { key: "date", header: "Ngày", width: 88, sortValue: (i) => `${i.date} ${i.createdAt}`, cell: (i) => <DateCell date={i.date} /> },
      { key: "subject", header: "Đối tượng", sortValue: (i) => subjectText(i), cell: (i) => <SubjectCell incident={i} />, className: "min-w-36" },
      { key: "issue", header: "Lỗi", sortValue: (i) => i.issue, cell: (i) => <IssueCell incident={i} />, className: "min-w-48" },
      { key: "points", header: "Điểm", align: "right", width: 72, sortValue: (i) => i.points, cell: (i) => <PointsCell incident={i} /> },
      { key: "detail", header: "Chi tiết", cell: (i) => <DetailCell text={i.detail} /> },
      { key: "status", header: "Trạng thái", sortValue: (i) => i.status, cell: (i) => <StatusBadge status={i.status} size="sm" /> },
      {
        key: "feedback",
        header: "Phản hồi GVCN",
        sortValue: (i) => i.gvcnNoteAt ?? "",
        cell: (i) => <FeedbackCell incident={i} onFeedback={canFeedback(i) ? onFeedback : undefined} />,
      },
      {
        key: "remediation",
        header: "Khắc phục",
        sortValue: (i) => i.remediationAt ?? "",
        cell: (i) => <RemediationCell incident={i} onRemediate={onRemediate && canRemediate?.(i) ? onRemediate : undefined} />,
      },
    ],
    [canFeedback, onFeedback, canRemediate, onRemediate],
  );

  const reset = () => {
    setQuery("");
    setStatus("ALL");
  };

  const empty =
    incidents.length === 0 ? (
      <EmptyState
        size="sm"
        icon={CircleCheck}
        tone="ok"
        title="Chưa có sự việc trong kỳ này"
        description={`Lớp ${classCode} chưa có sự việc nào được ghi nhận (${periodText}). Hãy tiếp tục duy trì nền nếp tốt!`}
      />
    ) : (
      <EmptyState
        size="sm"
        icon={SearchX}
        title="Không có sự việc phù hợp"
        description="Thử từ khóa khác hoặc chọn trạng thái “Tất cả”."
        action={
          <Button variant="secondary" size="sm" onClick={reset}>
            Xóa tìm kiếm
          </Button>
        }
      />
    );

  return (
    <Card
      data-print-flow
      padding="none"
      icon={ListChecks}
      title="Chi tiết sự việc"
      subtitle={
        <span className="print:hidden">
          {isGvcn
            ? "Chạm vào một sự việc để xem chi tiết, gửi phản hồi, ghi biện pháp khắc phục và cập nhật trạng thái xử lý."
            : "Bấm vào một dòng để xem chi tiết sự việc, học sinh và minh chứng."}
        </span>
      }
    >
      {incidents.length > 0 ? (
        <div data-print-hide className="flex flex-col gap-3 border-b border-border px-4 pb-4 sm:px-5 lg:flex-row lg:items-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Tìm tên học sinh, lỗi, chi tiết…"
            ariaLabel="Tìm trong sự việc của lớp"
            className="lg:max-w-sm lg:flex-1"
          />
          <div role="group" aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-2 lg:ml-auto">
            {STATUS_FILTERS.map((s) => (
              <Pill key={s.value} active={status === s.value} onClick={() => setStatus(s.value)}>
                {s.label} <span className="num opacity-75">{counts[s.value]}</span>
              </Pill>
            ))}
          </div>
        </div>
      ) : null}
      {filtered && rows.length > 0 ? (
        <p data-print-hide className="num border-b border-border bg-surface-2 px-4 py-2 text-xs text-slate-600 sm:px-5" aria-live="polite">
          Đang hiển thị {rows.length}/{incidents.length} sự việc · bản in / PDF luôn gồm đủ {incidents.length} sự việc
        </p>
      ) : null}
      <div className={printAll ? "print:hidden" : undefined}>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(i) => i.id}
          onRowClick={onOpen}
          rowLabel={(i) => `Xem sự việc ${i.code}: ${i.issue}`}
          mobileCard={(i) => <IncidentCard incident={i} canFeedback={canFeedback(i)} />}
          caption={`Sự việc của lớp ${classCode} – ${periodText}`}
          emptyState={empty}
        />
      </div>
      {printAll ? (
        // Paper copy while a screen filter is active: the complete list (hidden on screen).
        <div data-print-full-list className="hidden print:block">
          <DataTable
            columns={columns}
            rows={incidents}
            rowKey={(i) => i.id}
            mobileCard={(i) => <IncidentCard incident={i} canFeedback={canFeedback(i)} />}
            caption={`Toàn bộ sự việc của lớp ${classCode} – ${periodText}`}
          />
        </div>
      ) : null}
    </Card>
  );
}
