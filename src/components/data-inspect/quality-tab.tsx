"use client";
import { useMemo, useState } from "react";
import { Calculator, ChartColumn, ChartLine, ChartPie, ChevronDown, CopyX, Gauge, ListChecks, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { Badge, Button, Card, EmptyState, ProgressBar, SegmentedControl, cn, toneHex, toneSoft } from "@/components/ui";
import { BarChart, DonutChart, EChart, LineChart } from "@/components/charts";
import { fmtDate, fmtNumber, fmtPercent } from "@/lib/client/format";
import { integrityIssues, weeklyTrend, type IntegrityIssue } from "@/lib/engine";
import { formatNumberVN } from "@/lib/engine/text";
import type { GlobalFilters, Incident, LevelDataset } from "@/lib/types";
import { dataCheckCounts } from "./lib/incident-rows";
import { INTEGRITY_KINDS, INTEGRITY_KIND_META, integrityCounts, integrityIncidentCount, type DuplicateTotals } from "./lib/duplicates-view";
import { classConfidence, confidenceBarOption, confidenceChartHeight, confidenceTrend, issueCodeCounts, reporterStats, sourceStats, toPct } from "./lib/quality";

const LOWEST = 15;

export interface QualityTabProps {
  ds: LevelDataset;
  /** Engine-filtered incidents of the current scope. */
  incidents: Incident[];
  /** Overall confidence of the scope (engine computeKpis). */
  confidence: number;
  filters: GlobalFilters;
  today: string;
  onGoReview: () => void;
  /** Possible duplicates of the scope ("Có thể trùng" tab). */
  duplicates?: DuplicateTotals;
  onGoDuplicates?: () => void;
  /** Opens a record listed by the integrity check. */
  onOpen?: (incident: Incident) => void;
}

/** "Chất lượng dữ liệu": overall / per-class / per-source / per-reporter confidence, issue mix and weekly trend. */
export function QualityTab({ ds, incidents, confidence, filters, today, onGoReview, duplicates, onGoDuplicates, onOpen }: QualityTabProps) {
  const min = ds.config.rag.minConfidence;
  const [showAll, setShowAll] = useState(false);
  const counts = useMemo(() => dataCheckCounts(incidents), [incidents]);
  const byClass = useMemo(() => classConfidence(incidents), [incidents]);
  const issues = useMemo(() => issueCodeCounts(incidents), [incidents]);
  const sources = useMemo(() => sourceStats(incidents), [incidents]);
  const reporters = useMemo(() => reporterStats(incidents, 10), [incidents]);
  const trend = useMemo(() => confidenceTrend(weeklyTrend(ds, filters, today)), [ds, filters, today]);

  const classRows = showAll ? byClass : byClass.slice(0, LOWEST);
  const barOption = useMemo(() => confidenceBarOption(classRows, min), [classRows, min]);
  const belowCount = byClass.filter((r) => r.confidence < min).length;
  const ok = confidence >= min;
  const total = incidents.length;

  const donut = useMemo(() => {
    const top = issues.slice(0, 7).map((i) => ({ name: i.label, value: i.count }));
    const rest = issues.slice(7).reduce((n, i) => n + i.count, 0);
    return rest > 0 ? [...top, { name: "Khác", value: rest }] : top;
  }, [issues]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
      <Card className="xl:col-span-4" title="Độ tin cậy tổng thể" subtitle="(Hợp lệ + Thiếu tên HS) / tổng sự việc trong phạm vi lọc" icon={Gauge}>
        <div className="flex flex-col gap-4">
          <div className="flex items-end justify-between gap-3">
            <span className={`num text-[44px] font-extrabold leading-none tracking-tight ${ok ? "text-ok-strong" : "text-bad-strong"}`}>{fmtPercent(confidence, 1)}</span>
            <Badge tone={ok ? "ok" : "bad"} icon={ok ? ShieldCheck : Gauge}>
              {ok ? "Đạt ngưỡng" : "Dưới ngưỡng"} {fmtPercent(min)}
            </Badge>
          </div>
          <ProgressBar value={confidence} tone={ok ? "ok" : "bad"} ariaLabel="Độ tin cậy dữ liệu" />
          <dl className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["Hợp lệ", counts.OK, "text-ok-strong"],
                ["Thiếu tên HS", counts.THIEU_TEN_HS, "text-warn-strong"],
                ["Cần rà soát", counts.REVIEW, "text-bad-strong"],
              ] as const
            ).map(([label, n, color]) => (
              <div key={label} className="flex flex-col-reverse rounded-control bg-surface-2 px-2 py-2.5 ring-1 ring-inset ring-border">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className={`num text-lg font-bold ${color}`}>{fmtNumber(n)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[13px] leading-relaxed text-slate-600">
            Lớp có độ tin cậy dưới {fmtPercent(min)} hiển thị RAG <strong>Xám – Chưa đủ dữ liệu</strong>.{" "}
            {belowCount > 0 ? `Hiện có ${fmtNumber(belowCount)} lớp dưới ngưỡng.` : "Hiện không có lớp nào dưới ngưỡng."}
          </p>
          {counts.REVIEW + counts.THIEU_TEN_HS > 0 ? (
            <Button variant="secondary" size="sm" icon={ListChecks} onClick={onGoReview} className="self-start">
              Mở hàng đợi rà soát
            </Button>
          ) : null}
        </div>
      </Card>

      <Card
        className="xl:col-span-8"
        title="Độ tin cậy theo lớp"
        subtitle={`Thấp nhất ở trên · đỏ = dưới ngưỡng ${fmtPercent(min)}`}
        icon={ChartColumn}
        actions={
          byClass.length > LOWEST ? (
            <SegmentedControl
              size="sm"
              ariaLabel="Số lớp hiển thị"
              value={showAll ? "all" : "low"}
              onChange={(v) => setShowAll(v === "all")}
              options={[
                { value: "low", label: `${LOWEST} lớp thấp nhất` },
                { value: "all", label: `Tất cả ${fmtNumber(byClass.length)} lớp` },
              ]}
            />
          ) : undefined
        }
      >
        {classRows.length === 0 ? (
          <EmptyState size="sm" icon={ChartColumn} title="Chưa có sự việc trong kỳ này" description="Độ tin cậy theo lớp được tính trên các lớp có sự việc." />
        ) : (
          <EChart
            option={barOption}
            height={confidenceChartHeight(classRows.length)}
            ariaLabel={`Độ tin cậy dữ liệu theo lớp, ${fmtNumber(belowCount)} lớp dưới ngưỡng ${fmtPercent(min)}. Thấp nhất: ${classRows
              .slice(0, 3)
              .map((r) => `${r.label} ${formatNumberVN(toPct(r.confidence), 1)}%`)
              .join(", ")}`}
          />
        )}
      </Card>

      <IntegrityCard incidents={incidents} duplicates={duplicates} onGoDuplicates={onGoDuplicates} onOpen={onOpen} className="md:col-span-2 xl:col-span-12" />

      <Card className="xl:col-span-4" title="Vấn đề dữ liệu theo loại" subtitle="Số sự việc có từng loại vấn đề" icon={ChartPie}>
        <DonutChart data={donut} centerLabel="vấn đề" legend="bottom" emptyTitle="Không có vấn đề dữ liệu" emptyDescription="Mọi sự việc trong phạm vi lọc đều hợp lệ." ariaLabel="Phân bổ vấn đề dữ liệu theo loại" />
      </Card>

      <Card className="xl:col-span-4" title="Theo nguồn dữ liệu" subtitle="Ghi nhận trên ứng dụng và nhập từ Excel" icon={Smartphone}>
        {sources.length === 0 ? (
          <EmptyState size="sm" icon={Smartphone} title="Chưa có sự việc trong kỳ này" />
        ) : (
          <ul className="flex flex-col gap-4">
            {sources.map((s) => (
              <li key={s.key} className="flex flex-col gap-2">
                <ProgressBar value={total ? s.incidents / total : 0} tone={s.key === "import" ? "star" : "brand"} label={s.label} showValue valueText={`${fmtNumber(s.incidents)} · ${fmtPercent(total ? s.incidents / total : 0)}`} />
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Badge tone={s.confidence >= min ? "ok" : "bad"} size="sm">
                    Tin cậy {fmtPercent(s.confidence, 1)}
                  </Badge>
                  {s.review > 0 ? (
                    <Badge tone="bad" size="sm" variant="outline">
                      {fmtNumber(s.review)} cần rà soát
                    </Badge>
                  ) : null}
                  {s.unnamed > 0 ? (
                    <Badge tone="warn" size="sm" variant="outline">
                      {fmtNumber(s.unnamed)} thiếu tên HS
                    </Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="md:col-span-2 xl:col-span-4" title="Theo người ghi (Top 10)" subtitle="Số sự việc và số bản ghi cần rà soát" icon={UserRound}>
        <BarChart
          horizontal
          categories={reporters.map((r) => r.label)}
          series={[
            { name: "Tin cậy", data: reporters.map((r) => r.incidents - r.review), color: toneHex.ok, stack: "n" },
            { name: "Cần rà soát", data: reporters.map((r) => r.review), color: toneHex.bad, stack: "n" },
          ]}
          ariaLabel={`Số sự việc theo người ghi: ${reporters.map((r) => `${r.label} ${r.incidents}`).join(", ")}`}
          emptyTitle="Chưa có sự việc trong kỳ này"
        />
      </Card>

      <Card className="md:col-span-2 xl:col-span-12" title="Xu hướng độ tin cậy theo tuần" subtitle="Từ đầu năm học · theo bộ lọc khối/lớp/mảng/lỗi · tuần không có sự việc để trống" icon={ChartLine}>
        <LineChart
          categories={trend.categories}
          series={[{ name: "Độ tin cậy", data: trend.values, color: toneHex.brand, area: true }]}
          markLines={[{ value: toPct(min), label: `Ngưỡng ${fmtPercent(min)}`, color: toneHex.bad }]}
          valueFormatter={(v) => `${formatNumberVN(v, 1)}%`}
          height={260}
          ariaLabel="Độ tin cậy dữ liệu theo tuần so với ngưỡng tối thiểu"
          emptyTitle="Chưa có dữ liệu theo tuần"
        />
      </Card>
    </div>
  );
}

const INTEGRITY_PAGE = 8;

export interface IntegrityCardProps {
  /** Engine-filtered incidents of the scope (never redacted on this screen). */
  incidents: Incident[];
  duplicates?: DuplicateTotals;
  onGoDuplicates?: () => void;
  onOpen?: (incident: Incident) => void;
  className?: string;
}

/**
 * "Kiểm tra công thức & dữ liệu" (REQ_V2 §7.3): re-check of the STORED records (engine integrityIssues) – points vs the
 * formula, student counts, students of another class – plus the possible duplicates of the scope.
 */
export function IntegrityCard({ incidents, duplicates, onGoDuplicates, onOpen, className }: IntegrityCardProps) {
  const [limit, setLimit] = useState(INTEGRITY_PAGE);
  const issues = useMemo(() => integrityIssues(incidents), [incidents]);
  const counts = integrityCounts(issues);
  const affected = integrityIncidentCount(issues);
  const clean = issues.length === 0;

  return (
    <Card
      className={className}
      title="Kiểm tra công thức & dữ liệu"
      subtitle="Tính lại điểm trừ và số học sinh của các sự việc đã lưu trong phạm vi lọc"
      icon={Calculator}
      actions={
        <Badge tone={clean ? "ok" : "bad"} icon={clean ? ShieldCheck : Calculator}>
          {clean ? "Không phát hiện sai lệch" : `${fmtNumber(affected)} sự việc cần kiểm tra`}
        </Badge>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {INTEGRITY_KINDS.map((kind) => {
            const meta = INTEGRITY_KIND_META[kind];
            const n = counts[kind];
            return (
              <div key={kind} className="flex flex-col gap-1.5 rounded-control bg-surface-2 p-3 ring-1 ring-inset ring-border">
                <span className="flex items-center justify-between gap-2">
                  <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ring-1 ring-inset", n > 0 ? toneSoft[meta.tone] : toneSoft.ok)}>
                    {meta.label}
                  </span>
                  <span className={cn("num text-xl font-bold", n > 0 ? "text-bad-strong" : "text-ok-strong")}>{fmtNumber(n)}</span>
                </span>
                <span className="text-[13px] leading-snug text-slate-600">{meta.explanation}</span>
              </div>
            );
          })}
          <div className="flex flex-col gap-1.5 rounded-control bg-surface-2 p-3 ring-1 ring-inset ring-border">
            <span className="flex items-center justify-between gap-2">
              <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-semibold ring-1 ring-inset", duplicates?.groups ? toneSoft.warn : toneSoft.ok)}>
                <CopyX aria-hidden className="size-3.5" strokeWidth={2.25} />
                Có thể trùng
              </span>
              <span className={cn("num text-xl font-bold", duplicates?.groups ? "text-warn-strong" : "text-ok-strong")}>{fmtNumber(duplicates?.groups ?? 0)}</span>
            </span>
            <span className="text-[13px] leading-snug text-slate-600">
              {duplicates?.groups
                ? `Nhóm sự việc có thể ghi trùng – có thể tính trùng −${fmtNumber(duplicates.extraPoints)} điểm.`
                : "Không có sự việc cùng ngày, lớp, lỗi và học sinh."}
            </span>
            {duplicates?.groups && onGoDuplicates ? (
              <Button variant="secondary" size="sm" icon={CopyX} onClick={onGoDuplicates} className="mt-auto self-start">
                Xem nhóm có thể trùng
              </Button>
            ) : null}
          </div>
        </div>

        {clean ? (
          <p className="flex items-center gap-2 text-[13px] text-ok-strong">
            <ShieldCheck aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
            Không phát hiện sai lệch: điểm trừ và số học sinh của mọi sự việc khớp với công thức.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border overflow-hidden rounded-control ring-1 ring-inset ring-border" aria-label="Sự việc có sai lệch">
              {issues.slice(0, limit).map((issue, k) => (
                <IntegrityRow key={`${issue.incident.id}|${issue.kind}|${k}`} issue={issue} onOpen={onOpen} />
              ))}
            </ul>
            {issues.length > limit ? (
              <Button variant="ghost" size="sm" iconRight={ChevronDown} onClick={() => setLimit((n) => n + INTEGRITY_PAGE * 2)} className="self-center">
                Xem thêm {fmtNumber(Math.min(INTEGRITY_PAGE * 2, issues.length - limit))} sai lệch
              </Button>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

function IntegrityRow({ issue, onOpen }: { issue: IntegrityIssue; onOpen?: (incident: Incident) => void }) {
  const i = issue.incident;
  const meta = INTEGRITY_KIND_META[issue.kind];
  const body = (
    <>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
        <span className="num font-semibold text-brand-900">{i.code}</span>
        <span className="num text-slate-500">{fmtDate(i.date)}</span>
        <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-bold text-brand-800">Lớp {i.classCode}</span>
        <Badge tone={meta.tone} size="sm">
          {meta.label}
        </Badge>
      </span>
      <span className="text-[13px] text-slate-700">{issue.message}</span>
    </>
  );
  if (!onOpen) return <li className="flex flex-col gap-1 px-3 py-2.5">{body}</li>;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(i)}
        className="flex min-h-11 w-full flex-col items-start gap-1 px-3 py-2.5 text-left transition-colors hover:bg-brand-50/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500"
      >
        {body}
      </button>
    </li>
  );
}
