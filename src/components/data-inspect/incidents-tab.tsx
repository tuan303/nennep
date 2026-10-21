"use client";
import { useMemo, useState } from "react";
import { CalendarRange, ClipboardList, SearchX } from "lucide-react";
import { Button, Card, DataTable, EmptyState, Pill, SearchInput, Select } from "@/components/ui";
import { DATA_CHECK_LABELS } from "@/lib/constants";
import { fmtNumber } from "@/lib/client/format";
import type { RosterNames } from "@/components/entry/lib/student-names";
import type { DataCheck, Incident } from "@/lib/types";
import { INCIDENT_COLUMNS, IncidentMobileCard } from "./incident-columns";
import { dataCheckCounts, filterIncidentRows, type DataCheckFilter, type SourceFilter } from "./lib/incident-rows";

const CHECKS: DataCheck[] = ["OK", "THIEU_TEN_HS", "REVIEW"];
const CHECK_TONE = { OK: "ok", THIEU_TEN_HS: "warn", REVIEW: "bad" } as const;
const SOURCE_OPTIONS = [
  { value: "app" as const, label: "Ghi nhận trên ứng dụng" },
  { value: "import" as const, label: "Nhập từ Excel" },
];

export interface IncidentsTabProps {
  /** Engine-filtered incidents (global filters applied). */
  incidents: Incident[];
  onOpen: (incident: Incident) => void;
  /** Shown in the empty state when the period is not the whole year. */
  onShowWholeYear?: () => void;
  /** Current roster names (shown and searched instead of outdated names recorded on the incidents). */
  roster?: RosterNames;
}

/** "Tất cả sự việc": searchable, sortable table of every incident in scope (cards on phones). */
export function IncidentsTab({ incidents, onOpen, onShowWholeYear, roster }: IncidentsTabProps) {
  const [query, setQuery] = useState("");
  const [check, setCheck] = useState<DataCheckFilter>("ALL");
  const [source, setSource] = useState<SourceFilter>("all");

  const counts = useMemo(() => dataCheckCounts(incidents), [incidents]);
  const rows = useMemo(() => filterIncidentRows(incidents, { query, dataCheck: check, source }, roster), [incidents, query, check, source, roster]);
  const points = useMemo(() => rows.reduce((n, i) => n + i.points, 0), [rows]);
  const narrowed = query !== "" || check !== "ALL" || source !== "all";

  if (incidents.length === 0) {
    return (
      <Card padding="none">
        <EmptyState
          icon={ClipboardList}
          title="Chưa có sự việc trong kỳ này"
          description="Không có sự việc nào khớp với bộ lọc hiện tại. Hãy chọn kỳ khác hoặc xem toàn bộ năm học."
          action={
            onShowWholeYear ? (
              <Button variant="secondary" size="sm" icon={CalendarRange} onClick={onShowWholeYear}>
                Xem cả năm học
              </Button>
            ) : undefined
          }
        />
      </Card>
    );
  }

  return (
    <Card padding="none">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:px-5" data-print-hide>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Tìm mã, lớp, lỗi, tên học sinh, chi tiết…"
            ariaLabel="Tìm sự việc"
            className="md:max-w-md md:flex-1"
          />
          <Select
            options={SOURCE_OPTIONS}
            value={source === "all" ? undefined : source}
            onChange={(v) => setSource(v ?? "all")}
            placeholder="Mọi nguồn dữ liệu"
            allowEmpty
            aria-label="Lọc theo nguồn"
            wrapperClassName="md:w-60"
          />
        </div>
        <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Lọc theo kết quả kiểm tra">
          <Pill active={check === "ALL"} onClick={() => setCheck("ALL")}>
            Tất cả · {fmtNumber(incidents.length)}
          </Pill>
          {CHECKS.map((c) => (
            <Pill key={c} tone={CHECK_TONE[c]} active={check === c} onClick={() => setCheck(check === c ? "ALL" : c)} disabled={counts[c] === 0 && check !== c}>
              {DATA_CHECK_LABELS[c]} · {fmtNumber(counts[c])}
            </Pill>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-[13px] text-slate-500 sm:px-5" aria-live="polite">
        <span>
          <strong className="num font-semibold text-slate-800">{fmtNumber(rows.length)}</strong> sự việc
          {narrowed ? ` (trong ${fmtNumber(incidents.length)})` : ""} ·{" "}
          <strong className="num font-semibold text-bad-strong">{fmtNumber(points)}</strong> điểm trừ
        </span>
        <span className="hidden sm:inline">Bấm vào một dòng để xem chi tiết</span>
      </div>
      <DataTable
        columns={INCIDENT_COLUMNS}
        rows={rows}
        rowKey={(i) => i.id}
        onRowClick={onOpen}
        rowLabel={(i) => `Xem sự việc ${i.code}, lớp ${i.classCode}`}
        initialSort={{ key: "date", dir: "desc" }}
        mobileCard={(i) => <IncidentMobileCard i={i} roster={roster} />}
        rowClassName={(i) => (i.dataCheck === "REVIEW" ? "bg-bad-soft/30" : undefined)}
        pageSize={50}
        stickyHeader
        caption="Danh sách sự việc"
        emptyState={
          <EmptyState
            size="sm"
            icon={SearchX}
            title="Không tìm thấy sự việc phù hợp"
            description="Thử từ khóa khác hoặc bỏ bớt điều kiện lọc."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setCheck("ALL");
                  setSource("all");
                }}
              >
                Xóa điều kiện tìm
              </Button>
            }
          />
        }
      />
    </Card>
  );
}
