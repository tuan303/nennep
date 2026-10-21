"use client";

import { useState } from "react";
import { Award, ClipboardList, Download, Gauge, Plus, School, ShieldCheck, TrendingUp, TriangleAlert, Users } from "lucide-react";
import {
  Button,
  Card,
  Combobox,
  KpiCard,
  PageHeader,
  Pill,
  SegmentedControl,
  Select,
  toast,
  type ComboOption,
} from "@/components/ui";
import { BarChart, DonutChart, HeatmapChart, LineChart } from "@/components/charts";
import type { LevelId } from "@/lib/types";
import { CATEGORY_SHARE, CLASSES, GRADE_COMPARE, HEATMAP, TOP_ISSUES, TREND, WEEK_LABELS } from "./demo-data";

const LEVEL_OPTIONS: Array<{ value: LevelId; label: string }> = [
  { value: "TH", label: "Tiểu học" },
  { value: "THCS", label: "THCS" },
  { value: "THPT", label: "THPT" },
];

const PERIODS = [
  { value: "w-2026-10-12", label: "Tuần 12/10 – 18/10/2026", group: "Tuần" },
  { value: "w-2026-10-05", label: "Tuần 05/10 – 11/10/2026", group: "Tuần" },
  { value: "m-2026-10", label: "Tháng 10/2026", group: "Tháng" },
  { value: "m-2026-09", label: "Tháng 9/2026", group: "Tháng" },
  { value: "s-HK1", label: "Học kỳ I", group: "Học kỳ" },
  { value: "all", label: "Toàn bộ năm học", group: "Khác" },
];

const CLASS_OPTIONS: ComboOption[] = CLASSES.map((c) => ({
  value: c.code,
  label: c.code,
  group: `Khối ${c.grade}`,
  description: `GVCN: ${c.teacher}`,
  keywords: [c.teacher],
}));

const TOP_ISSUE_CATS = TOP_ISSUES.map((t) => t.issue);
const TOP_ISSUE_SERIES = [{ name: "Sự việc", data: TOP_ISSUES.map((t) => t.incidents) }];
const GRADE_SERIES = [
  { name: "Điểm trừ", data: GRADE_COMPARE.penalty },
  { name: "Điểm thưởng", data: GRADE_COMPARE.reward },
];
const TOTAL_SERIES = [
  { name: "Điểm trừ", data: TREND.penalty },
  { name: "Điểm thưởng", data: TREND.reward },
];
const AVG_SERIES = [{ name: "Điểm trừ TB mỗi lớp", data: TREND.penalty.map((p) => Math.round((p / 48) * 10) / 10) }];
const RAG_LINES = [
  { value: 10, label: "Ngưỡng vàng 10", color: "#d97706" },
  { value: 25, label: "Ngưỡng đỏ 25", color: "#dc2626" },
];

/** Realistic "Tổng quan" block: header, filter row, KPIs and the main charts. */
export function SectionDashboard() {
  const [level, setLevel] = useState<LevelId>("THCS");
  const [period, setPeriod] = useState<string | undefined>("w-2026-10-12");
  const [classCode, setClassCode] = useState<string | undefined>("6A03");
  const [trendMode, setTrendMode] = useState<"total" | "avg">("total");

  return (
    <section id="tong-quan" className="flex scroll-mt-6 flex-col gap-5">
      <PageHeader
        icon={Gauge}
        eyebrow="THCS · Tuần 12/10 – 18/10/2026"
        title="Tổng quan nền nếp"
        description="Bức tranh nền nếp của cấp học trong kỳ đang chọn: số sự việc, điểm thi đua, lớp cần ưu tiên và xu hướng theo tuần."
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={() => toast.success("Đã xuất tệp Excel", { description: "NSHM_THCS_Tuan_12-10-2026.xlsx" })}>
              Xuất Excel
            </Button>
            <Button variant="gold" icon={Plus} onClick={() => toast.info("Mở biểu mẫu nhập sự việc")}>
              Nhập sự việc
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 rounded-card bg-surface/70 p-3 ring-1 ring-border md:flex-row md:flex-wrap md:items-center">
        <SegmentedControl options={LEVEL_OPTIONS} value={level} onChange={setLevel} ariaLabel="Chọn cấp học" className="md:w-72" fullWidth />
        <Select options={PERIODS} value={period} onChange={setPeriod} aria-label="Chọn kỳ" wrapperClassName="md:w-64" />
        <Combobox
          options={CLASS_OPTIONS}
          value={classCode}
          onChange={setClassCode}
          placeholder="Tất cả lớp"
          aria-label="Lọc theo lớp"
          title="Chọn lớp"
          clearable
          icon={School}
          className="md:w-56"
        />
        <div className="flex flex-wrap items-center gap-2 md:ml-auto">
          {classCode ? (
            <Pill onRemove={() => setClassCode(undefined)} removeLabel="Bỏ lọc lớp">
              Lớp {classCode}
            </Pill>
          ) : null}
          <Pill onRemove={() => toast("Đã bỏ lọc mảng")} removeLabel="Bỏ lọc mảng">
            Chuyên cần – vệ sinh
          </Pill>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label="Sự việc" value={154} icon={ClipboardList} tone="brand" delta={{ value: 12, goodWhen: "down", label: "so với tuần trước" }} sparkline={TREND.incidents} onClick={() => toast("Mở danh sách sự việc")} />
        <KpiCard label="Học sinh liên quan" value={212} icon={Users} tone="muted" delta={{ value: -9, goodWhen: "down", label: "so với tuần trước" }} sparkline={[180, 205, 230, 198, 240, 221, 230, 221, 212]} />
        <KpiCard label="Điểm trừ" value={486} unit="điểm" icon={TriangleAlert} tone="bad" delta={{ value: 38, goodWhen: "down", label: "so với tuần trước" }} sparkline={TREND.penalty} />
        <KpiCard label="Điểm thưởng" value={120} unit="điểm" icon={Award} tone="star" delta={{ value: 15, goodWhen: "up", label: "so với tuần trước" }} sparkline={TREND.reward} />
        <KpiCard label="Lớp phát sinh" value="38/48" icon={School} tone="warn" delta={{ value: 0, goodWhen: "down", label: "không đổi" }} hint="Số lớp có ít nhất một sự việc trong kỳ / tổng số lớp đang hoạt động." />
        <KpiCard label="Độ tin cậy dữ liệu" value="96,4%" icon={ShieldCheck} tone="ok" delta={{ value: 1.8, goodWhen: "up", display: "+1,8 điểm %", label: "so với tuần trước" }} hint="(Hợp lệ + Thiếu tên HS) / tổng sự việc trong phạm vi lọc." />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Xu hướng theo tuần"
          subtitle="Từ đầu năm học đến tuần hiện tại"
          icon={TrendingUp}
          actions={
            <SegmentedControl
              size="sm"
              ariaLabel="Chế độ xem xu hướng"
              value={trendMode}
              onChange={setTrendMode}
              options={[
                { value: "total", label: "Tổng điểm" },
                { value: "avg", label: "TB mỗi lớp" },
              ]}
            />
          }
        >
          {trendMode === "total" ? (
            <LineChart categories={WEEK_LABELS} series={TOTAL_SERIES} area height={300} ariaLabel="Điểm trừ và điểm thưởng toàn cấp theo tuần" />
          ) : (
            <LineChart categories={WEEK_LABELS} series={AVG_SERIES} area markLines={RAG_LINES} height={300} ariaLabel="Điểm trừ trung bình mỗi lớp theo tuần, so với ngưỡng vàng và đỏ" />
          )}
        </Card>
        <Card title="Phân bổ theo mảng" subtitle="Số sự việc trong kỳ">
          <DonutChart data={CATEGORY_SHARE} centerLabel="sự việc" onSliceClick={(name) => toast(`Lọc theo mảng: ${name}`)} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top 5 vấn đề" subtitle="Lỗi phát sinh nhiều nhất trong kỳ">
          <BarChart horizontal categories={TOP_ISSUE_CATS} series={TOP_ISSUE_SERIES} showValues onBarClick={(e) => toast(`${e.category}: ${e.value} sự việc`)} />
        </Card>
        <Card title="Thống kê theo khối" subtitle="Điểm trừ và điểm thưởng">
          <BarChart categories={GRADE_COMPARE.grades} series={GRADE_SERIES} height={260} />
        </Card>
      </div>

      <Card title="Bản đồ nhiệt lớp × tuần" subtitle="Khối 6 · điểm trừ mỗi tuần – ô càng đậm càng cần ưu tiên">
        <HeatmapChart
          xLabels={WEEK_LABELS}
          yLabels={HEATMAP.classes}
          values={HEATMAP.values}
          onCellClick={(c) => toast(`${c.yLabel} · tuần ${c.xLabel}: ${c.value} điểm trừ`)}
        />
      </Card>
    </section>
  );
}
