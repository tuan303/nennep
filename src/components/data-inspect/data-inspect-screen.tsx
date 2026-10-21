"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Award, ClipboardList, Database, FileSpreadsheet, Gauge, ListChecks, ShieldCheck, Trash2, TriangleAlert, Users } from "lucide-react";
import { KpiCard, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger, buttonClasses } from "@/components/ui";
import { useNavBadge } from "@/components/app/shell";
import { IncidentDetailSheet, StudentHistorySheet } from "@/components/app/widgets";
import { rosterNames } from "@/components/entry/lib/student-names";
import { LEVELS } from "@/lib/constants";
import { useFilters } from "@/lib/client/filters";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import { useToday } from "@/lib/client/hooks";
import { useSession } from "@/lib/client/session";
import { computeKpis, filterIncidents, filterRewards, periodLabel } from "@/lib/engine";
import type { Incident, LevelDataset } from "@/lib/types";
import { DeletedTab } from "./deleted-tab";
import { IncidentsTab } from "./incidents-tab";
import { QualityTab } from "./quality-tab";
import { ReviewTab } from "./review-tab";
import { RewardsTab } from "./rewards-tab";
import { dataCheckCounts } from "./lib/incident-rows";
import { rewardRows } from "./lib/records";
import { reviewQueue } from "./lib/review-queue";

export const DATA_TABS = ["tat-ca", "ra-soat", "diem-thuong", "da-xoa", "chat-luong"] as const;
export type DataTab = (typeof DATA_TABS)[number];

function initialTab(raw: string | null, canDelete: boolean): DataTab {
  const t = DATA_TABS.find((x) => x === raw);
  if (!t || (t === "da-xoa" && !canDelete)) return "tat-ca";
  return t;
}

/** SCR-11 "Dữ liệu & rà soát": KPIs, all incidents, review queue, rewards, deleted records and data quality. */
export function DataInspectScreen({ ds }: { ds: LevelDataset }) {
  const { filters, setFilters } = useFilters();
  const { can } = useSession();
  const today = useToday();
  const searchParams = useSearchParams();
  const canDelete = can("record.delete");
  const [tab, setTab] = useState<DataTab>(() => initialTab(searchParams.get("tab"), canDelete));
  const [openIncident, setOpenIncident] = useState<Incident | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);

  const incidents = useMemo(() => filterIncidents(ds, filters), [ds, filters]);
  const roster = useMemo(() => rosterNames(ds.students), [ds.students]);
  const kpis = useMemo(() => computeKpis(ds, filters), [ds, filters]);
  const checks = useMemo(() => dataCheckCounts(incidents), [incidents]);
  const queue = useMemo(() => reviewQueue(incidents), [incidents]);
  const rewards = useMemo(() => rewardRows(filterRewards(ds, filters), ds.config), [ds, filters]);
  useNavBadge("/du-lieu", queue.length);

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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Sự việc" value={kpis.incidents} icon={ClipboardList} tone="brand" footer={`${fmtNumber(kpis.penaltyPoints)} điểm trừ`} onClick={() => setTab("tat-ca")} />
        <KpiCard
          label="Cần rà soát"
          value={kpis.reviewCount}
          icon={TriangleAlert}
          tone={kpis.reviewCount > 0 ? "bad" : "ok"}
          hint="Sự việc thiếu dữ liệu hoặc lệch với quy định – làm giảm độ tin cậy."
          onClick={() => setTab("ra-soat")}
        />
        <KpiCard
          label="Thiếu tên HS"
          value={checks.THIEU_TEN_HS}
          icon={Users}
          tone={checks.THIEU_TEN_HS > 0 ? "warn" : "ok"}
          footer={`${fmtNumber(kpis.unnamedStudentCount)} HS chưa rõ tên`}
          hint="Lỗi tính theo HS có học sinh chưa rõ tên – vẫn được tính điểm."
          onClick={() => setTab("ra-soat")}
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
          <IncidentsTab incidents={incidents} roster={roster} onOpen={setOpenIncident} onShowWholeYear={wholeYear ? undefined : showWholeYear} />
        </TabsContent>
        <TabsContent value="ra-soat">
          <ReviewTab ds={ds} queue={queue} onOpen={setOpenIncident} onShowWholeYear={wholeYear ? undefined : showWholeYear} />
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
          <QualityTab ds={ds} incidents={incidents} confidence={kpis.confidence} filters={filters} today={today} onGoReview={() => setTab("ra-soat")} />
        </TabsContent>
      </Tabs>

      <IncidentDetailSheet
        ds={ds}
        incident={openIncident}
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
          setOpenIncident(i);
        }}
      />
    </div>
  );
}
