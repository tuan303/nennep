"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Award, ClipboardList, CopyX, Database, FileSpreadsheet, Gauge, ListChecks, Repeat, ShieldCheck, Trash2, TriangleAlert, UserRound } from "lucide-react";
import { KpiCard, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger, buttonClasses } from "@/components/ui";
import { useNavBadge } from "@/components/app/shell";
import { IncidentDetailSheet, StudentHistorySheet } from "@/components/app/widgets";
import { rosterNames } from "@/components/entry/lib/student-names";
import { KPI_TERMS, LEVELS } from "@/lib/constants";
import { useFilters } from "@/lib/client/filters";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import { useToday } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";
import { computeKpis, filterIncidents, filterRewards, findPossibleDuplicates, periodLabel } from "@/lib/engine";
import type { Incident, LevelDataset } from "@/lib/types";
import { DeletedTab } from "./deleted-tab";
import { DuplicatesTab } from "./duplicates-tab";
import { IncidentsTab } from "./incidents-tab";
import { QualityTab } from "./quality-tab";
import { ReviewTab } from "./review-tab";
import { RewardsTab } from "./rewards-tab";
import { duplicateTotals } from "./lib/duplicates-view";
import { rewardRows } from "./lib/records";
import { reviewQueue } from "./lib/review-queue";

export const DATA_TABS = ["tat-ca", "ra-soat", "trung-lap", "diem-thuong", "da-xoa", "chat-luong"] as const;
export type DataTab = (typeof DATA_TABS)[number];

function initialTab(raw: string | null, canDelete: boolean): DataTab {
  const t = DATA_TABS.find((x) => x === raw);
  if (!t || (t === "da-xoa" && !canDelete)) return "tat-ca";
  return t;
}

/**
 * SCR-11 "Dữ liệu & rà soát": KPIs (shared KPI_TERMS vocabulary), all incidents, review queue, possible duplicates
 * (REQ_V2 §7.3, `?tab=trung-lap`), rewards, deleted records and data quality (incl. the integrity re-check).
 */
export function DataInspectScreen({ ds }: { ds: LevelDataset }) {
  const { filters, setFilters } = useFilters();
  const { can } = useSession();
  const today = useToday();
  const searchParams = useSearchParams();
  const canDelete = can("record.delete");
  const [tab, setTab] = useState<DataTab>(() => initialTab(searchParams.get("tab"), canDelete));
  const [openIncident, setOpenIncident] = useState<Incident | null>(null);
  /** Reason prefilled in "Xóa" when a record is opened from the duplicate review. */
  const [deleteHint, setDeleteHint] = useState<string | undefined>();
  const open = useCallback((i: Incident, reason?: string) => {
    setDeleteHint(reason);
    setOpenIncident(i);
  }, []);
  const [studentId, setStudentId] = useState<string | null>(null);

  const incidents = useMemo(() => filterIncidents(ds, filters), [ds, filters]);
  const roster = useMemo(() => rosterNames(ds.students), [ds.students]);
  const kpis = useMemo(() => computeKpis(ds, filters), [ds, filters]);
  const queue = useMemo(() => reviewQueue(incidents), [incidents]);
  const dupGroups = useMemo(() => findPossibleDuplicates(incidents), [incidents]);
  const dupTotals = useMemo(() => duplicateTotals(dupGroups), [dupGroups]);
  const rewards = useMemo(() => rewardRows(filterRewards(ds, filters), ds.config), [ds, filters]);
  useNavBadge("/du-lieu", queue.length + dupGroups.length);

  const wholeYear = filters.period.mode === "all";
  const showWholeYear = useCallback(() => setFilters({ period: { mode: "all" } }), [setFilters]);
  const minConf = ds.config.rag.minConfidence;
  const confOk = kpis.confidence >= minConf;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        icon={Database}
        eyebrow={`${LEVELS[ds.levelId].short} · ${periodLabel(filters.period, ds.config.semesters)}`}
        title="Dữ liệu & rà soát"
        description="Toàn bộ sự việc, hàng đợi rà soát chất lượng dữ liệu, điểm thưởng và các bản ghi đã xóa."
        actions={
          can("excel.import") ? (
            <Link href="/nhap-xuat" className={buttonClasses({ variant: "secondary" })}>
              <FileSpreadsheet aria-hidden className="size-[18px]" strokeWidth={2.25} />
              Nhập/Xuất Excel
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <KpiCard
          label={KPI_TERMS.incidents.label}
          value={kpis.incidents}
          icon={ClipboardList}
          tone="brand"
          hint={KPI_TERMS.incidents.hint}
          footer={`${fmtNumber(kpis.classesWithIncidents)} lớp phát sinh`}
          onClick={() => setTab("tat-ca")}
        />
        <KpiCard label={KPI_TERMS.violationTurns.label} value={kpis.violationTurns} icon={Repeat} tone="muted" hint={KPI_TERMS.violationTurns.hint} />
        <KpiCard
          label={KPI_TERMS.uniqueStudents.label}
          value={kpis.uniqueStudents}
          icon={UserRound}
          tone="muted"
          hint={KPI_TERMS.uniqueStudents.hint}
          footer={kpis.unnamedStudentCount > 0 ? `+ ${fmtNumber(kpis.unnamedStudentCount)} HS chưa rõ tên` : undefined}
        />
        <KpiCard label={KPI_TERMS.penaltyPoints.label} value={kpis.penaltyPoints} unit="điểm" icon={TriangleAlert} tone="bad" hint={KPI_TERMS.penaltyPoints.hint} />
        <KpiCard
          label="Cần rà soát"
          value={kpis.reviewCount}
          icon={ListChecks}
          tone={kpis.reviewCount > 0 ? "bad" : "ok"}
          hint="Sự việc thiếu dữ liệu hoặc lệch với quy định – làm giảm độ tin cậy. Sự việc thiếu tên HS vẫn được tính điểm."
          footer={dupTotals.groups > 0 ? `${fmtNumber(dupTotals.groups)} nhóm có thể trùng` : `${fmtNumber(queue.length - kpis.reviewCount)} thiếu tên HS`}
          onClick={() => setTab(dupTotals.groups > 0 && kpis.reviewCount === 0 ? "trung-lap" : "ra-soat")}
        />
        <KpiCard
          label="Độ tin cậy dữ liệu"
          value={fmtPercent(kpis.confidence, 1)}
          icon={confOk ? ShieldCheck : Gauge}
          tone={confOk ? "ok" : "bad"}
          footer={`Ngưỡng tối thiểu ${fmtPercent(minConf)}`}
          hint="(Hợp lệ + Thiếu tên HS) / tổng sự việc trong phạm vi lọc."
          onClick={() => setTab("chat-luong")}
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(initialTab(v, canDelete))}>
        <TabsList aria-label="Nội dung dữ liệu" data-print-hide>
          <TabsTrigger value="tat-ca" icon={ClipboardList} count={incidents.length}>
            Tất cả sự việc
          </TabsTrigger>
          <TabsTrigger value="ra-soat" icon={ListChecks} count={queue.length}>
            Cần rà soát
          </TabsTrigger>
          <TabsTrigger value="trung-lap" icon={CopyX} count={dupGroups.length}>
            Có thể trùng
          </TabsTrigger>
          <TabsTrigger value="diem-thuong" icon={Award} count={rewards.length}>
            Điểm thưởng
          </TabsTrigger>
          {canDelete ? (
            <TabsTrigger value="da-xoa" icon={Trash2}>
              Đã xóa
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="chat-luong" icon={Gauge}>
            Chất lượng dữ liệu
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tat-ca">
          <IncidentsTab incidents={incidents} roster={roster} onOpen={open} onShowWholeYear={wholeYear ? undefined : showWholeYear} />
        </TabsContent>
        <TabsContent value="ra-soat">
          <ReviewTab ds={ds} queue={queue} onOpen={open} onShowWholeYear={wholeYear ? undefined : showWholeYear} />
        </TabsContent>
        <TabsContent value="trung-lap">
          <DuplicatesTab levelId={ds.levelId} groups={dupGroups} roster={roster} onOpen={open} onShowWholeYear={wholeYear ? undefined : showWholeYear} />
        </TabsContent>
        <TabsContent value="diem-thuong">
          <RewardsTab ds={ds} rows={rewards} onShowWholeYear={wholeYear ? undefined : showWholeYear} />
        </TabsContent>
        {canDelete ? (
          <TabsContent value="da-xoa">
            <DeletedTab ds={ds} />
          </TabsContent>
        ) : null}
        <TabsContent value="chat-luong">
          <QualityTab
            ds={ds}
            incidents={incidents}
            confidence={kpis.confidence}
            filters={filters}
            today={today}
            onGoReview={() => setTab("ra-soat")}
            duplicates={dupTotals}
            onGoDuplicates={() => setTab("trung-lap")}
            onOpen={open}
          />
        </TabsContent>
      </Tabs>

      <IncidentDetailSheet
        ds={ds}
        incident={openIncident}
        suggestedDeleteReason={deleteHint}
        onClose={() => setOpenIncident(null)}
        onOpenStudent={(id) => {
          setOpenIncident(null);
          setStudentId(id);
        }}
      />
      <StudentHistorySheet
        ds={ds}
        studentId={studentId}
        onClose={() => setStudentId(null)}
        period={filters.period}
        onOpenIncident={(i) => {
          setStudentId(null);
          open(i);
        }}
      />
    </div>
  );
}
