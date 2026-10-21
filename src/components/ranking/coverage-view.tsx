"use client";
/** "Bao phủ kiểm tra" (REQ_V2 §6.3): inspection rounds per class vs the grade average (engine inspectionCoverage). */
import { useMemo } from "react";
import Link from "next/link";
import { CalendarCheck, CircleAlert, CircleCheck, CircleDashed, ClipboardCheck, Filter, Info, ScanSearch, School, type LucideIcon } from "lucide-react";
import { Badge, Card, DataTable, EmptyState, KpiCard, buttonClasses, cn, type DataTableColumn } from "@/components/ui";
import { fmtDate, fmtNumber } from "@/lib/client/format";
import { inspectionCoverage, type CoverageRow, type CoverageStatus, type GradeCoverage } from "@/lib/engine";
import type { GlobalFilters, LevelDataset } from "@/lib/types";
import { HighlightChip } from "./ranking-parts";
import { coverageDisplay, coverageIsEmpty, coverageKpis, coverageNote, coverageRatioText, coverageRowText, perRoundText, type CoverageKpi } from "./lib/coverage-view";

const STATUS_ICON: Record<CoverageStatus, LucideIcon> = { OK: CircleCheck, LOW: CircleAlert, NONE: CircleDashed };
const KPI_ICON: Record<CoverageKpi["id"], LucideIcon> = { rounds: ClipboardCheck, sessions: CalendarCheck, classes: School, flagged: CircleAlert };

export interface CoverageViewProps {
  ds: LevelDataset;
  filters: GlobalFilters;
  today: string;
  /** Show the "Ghi đợt kiểm tra" link (inspection.manage). */
  canManage: boolean;
  /** Class detail link (keeps the global filters). */
  detailHref: (classCode: string) => string;
}

export function CoverageView({ ds, filters, today, canManage, detailHref }: CoverageViewProps) {
  const coverage = useMemo(() => inspectionCoverage(ds, filters, today), [ds, filters, today]);
  const kpis = useMemo(() => coverageKpis(coverage), [coverage]);
  const ignored = !!filters.errorCode || !!filters.group || !!filters.studentId;

  if (coverageIsEmpty(coverage)) {
    return (
      <Card padding="none">
        <EmptyState
          icon={ScanSearch}
          title={(ds.inspections ?? []).some((r) => !r.deletedAt) ? "Chưa có đợt kiểm tra trong kỳ / phạm vi đang lọc" : "Chưa ghi nhận đợt kiểm tra nào"}
          description="Khi cán bộ nền nếp ghi nhận các đợt kiểm tra (ngày, buổi, mảng, lớp được kiểm tra), bảng bao phủ sẽ cho biết lớp nào ít được kiểm tra hơn mặt bằng của khối."
          action={
            canManage ? (
              <Link href="/nhap-lieu?tab=kiem-tra" className={buttonClasses({ variant: "primary", size: "sm" })}>
                <ClipboardCheck aria-hidden className="size-4" />
                Ghi đợt kiểm tra
              </Link>
            ) : undefined
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Chỉ số bao phủ kiểm tra" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.id} label={k.label} value={k.value} icon={KPI_ICON[k.id]} tone={k.tone} hint={k.hint} />
        ))}
      </section>

      <div className="flex flex-col gap-2 rounded-card bg-brand-50/60 px-4 py-3 text-[13px] leading-5 text-slate-700 ring-1 ring-inset ring-brand-100">
        <p className="flex items-start gap-2">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />
          <span>{coverageNote(coverage.minRatio)}</span>
        </p>
        {ignored ? (
          <p className="flex items-start gap-2">
            <Filter aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />
            <span>Bộ lọc lỗi, nhóm lỗi và học sinh không áp dụng cho đợt kiểm tra; số sự việc vẫn tính theo các bộ lọc này.</span>
          </p>
        ) : null}
      </div>

      {coverage.grades.map((g) => (
        <GradeCoverageCard key={g.grade} grade={g} detailHref={detailHref} />
      ))}
    </div>
  );
}

function StatusBadge({ row }: { row: Pick<CoverageRow, "status" | "rounds"> }) {
  const meta = coverageDisplay(row);
  return (
    <Badge tone={meta.tone} size="sm" icon={STATUS_ICON[meta.icon]}>
      {meta.label}
    </Badge>
  );
}

function GradeCoverageCard({ grade: g, detailHref }: { grade: GradeCoverage; detailHref: (classCode: string) => string }) {
  const columns = useMemo<DataTableColumn<CoverageRow>[]>(
    () => [
      {
        key: "class",
        header: "Lớp",
        sortValue: (r) => r.classCode,
        cell: (r) => (
          <span className="flex items-center gap-2">
            <Link href={detailHref(r.classCode)} className="num font-bold text-brand-900 hover:text-brand-700 hover:underline">
              {r.classCode}
            </Link>
            {r.highlighted ? <HighlightChip /> : null}
          </span>
        ),
      },
      { key: "gvcn", header: "GVCN", cell: (r) => <span className="text-slate-600">{r.homeroomTeacher || "–"}</span> },
      { key: "rounds", header: "Số đợt", align: "right", sortValue: (r) => r.rounds, cell: (r) => <span className="num font-semibold">{fmtNumber(r.rounds)}</span> },
      { key: "sessions", header: "Số buổi", align: "right", sortValue: (r) => r.sessions, cell: (r) => <span className="num">{fmtNumber(r.sessions)}</span> },
      { key: "last", header: "Lần gần nhất", sortValue: (r) => r.lastDate ?? "", cell: (r) => <span className="num">{r.lastDate ? fmtDate(r.lastDate) : "–"}</span> },
      { key: "incidents", header: "Sự việc", align: "right", sortValue: (r) => r.incidents, cell: (r) => <span className="num">{fmtNumber(r.incidents)}</span> },
      {
        key: "perRound",
        header: "Sự việc/đợt",
        align: "right",
        sortValue: (r) => r.incidentsPerRound,
        cell: (r) => <span className="num">{perRoundText(r.incidentsPerRound)}</span>,
      },
      {
        key: "ratio",
        header: "So với TB khối",
        align: "right",
        sortValue: (r) => r.coverageRatio,
        cell: (r) => <span className={cn("num font-semibold", r.status === "OK" ? "text-slate-700" : "text-warn-strong")}>{coverageRatioText(r.coverageRatio)}</span>,
      },
      { key: "status", header: "Trạng thái", sortValue: (r) => r.status, cell: (r) => <StatusBadge row={r} /> },
    ],
    [detailHref],
  );

  return (
    <section id={`khoi-${g.grade}`} aria-label={`Bao phủ kiểm tra khối ${g.grade}`} className="scroll-mt-24">
      <Card
        padding="none"
        icon={ClipboardCheck}
        headingLevel={2}
        title={`Khối ${g.grade}`}
        subtitle={
          <span className="num">
            {g.noInspections
              ? "Chưa có lớp nào được kiểm tra trong kỳ"
              : `TB ${fmtNumber(g.avgRounds)} đợt/lớp · ít nhất ${fmtNumber(g.minRounds)} · nhiều nhất ${fmtNumber(g.maxRounds)}`}
          </span>
        }
      >
        <div className="border-t border-border">
          <DataTable
            columns={columns}
            rows={g.rows}
            rowKey={(r) => r.classCode}
            caption={`Bao phủ kiểm tra các lớp khối ${g.grade}`}
            rowClassName={(r) => (r.highlighted ? "bg-star-50" : undefined)}
            mobileCard={(r) => <CoverageCard row={r} detailHref={detailHref} />}
            dense
          />
        </div>
      </Card>
    </section>
  );
}

function CoverageCard({ row: r, detailHref }: { row: CoverageRow; detailHref: (classCode: string) => string }) {
  return (
    <div aria-label={coverageRowText(r)} className={cn("flex flex-col gap-2 p-3.5", r.highlighted && "bg-star-50")}>
      <div className="flex items-center gap-2">
        <Link href={detailHref(r.classCode)} className="num text-base font-bold text-brand-900 hover:underline">
          Lớp {r.classCode}
        </Link>
        {r.highlighted ? <HighlightChip /> : null}
        <span className="ml-auto">
          <StatusBadge row={r} />
        </span>
      </div>
      {r.homeroomTeacher ? <p className="text-xs text-slate-500">GVCN {r.homeroomTeacher}</p> : null}
      <dl className="num grid grid-cols-3 gap-2 text-center text-xs">
        <Cell label="Số đợt" value={fmtNumber(r.rounds)} />
        <Cell label="Số buổi" value={fmtNumber(r.sessions)} />
        <Cell label="So với TB khối" value={coverageRatioText(r.coverageRatio)} />
        <Cell label="Sự việc" value={fmtNumber(r.incidents)} />
        <Cell label="Sự việc/đợt" value={perRoundText(r.incidentsPerRound)} />
        <Cell label="Gần nhất" value={r.lastDate ? fmtDate(r.lastDate) : "–"} />
      </dl>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-lg bg-surface-2 px-2 py-1.5 ring-1 ring-inset ring-border">
      <dt className="text-2xs text-slate-500">{label}</dt>
      <dd className="text-sm font-bold text-brand-900">{value}</dd>
    </div>
  );
}
