"use client";
/**
 * "Toàn trường": the accessible levels side by side. Each level resolves the selected mode (Tuần / Tháng / Học kỳ
 * hiện tại / Toàn bộ) against its own calendar. Clicking a level opens its Tổng quan.
 */
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, BellRing, ClipboardList, School, ShieldCheck, Siren, TriangleAlert } from "lucide-react";
import { KpiCard, PageHeader, SegmentedControl } from "@/components/ui";
import { useAllDatasets, useLevel } from "@/lib/client/data";
import { fmtNumber, fmtPercent } from "@/lib/client/format";
import { useToday } from "@/lib/client/hooks";
import { KPI_TERMS, SCHOOL_NAME } from "@/lib/constants";
import type { LevelId } from "@/lib/types";
import { confidenceTone, deltaLabel } from "../lib/overview-model";
import { SCHOOL_PERIOD_OPTIONS, type SchoolPeriodMode } from "../lib/school-model";
import { LevelCard, LevelCardPlaceholder } from "./level-card";
import { CompareCard, SchoolTrendCard } from "./school-charts";
import { SchoolAlertsCard, SchoolIssuesCard } from "./school-lists";
import { useSchoolData } from "./use-school-data";

const MODE_OPTIONS = SCHOOL_PERIOD_OPTIONS.map((o) => ({ value: o.value, label: o.short }));

export function SchoolScreen() {
  const { accessibleLevels, setLevelId } = useLevel();
  const { datasets, items, refresh, refreshing } = useAllDatasets(accessibleLevels);
  const today = useToday();
  const router = useRouter();
  const [mode, setMode] = useState<SchoolPeriodMode>("week");
  const data = useSchoolData(accessibleLevels, datasets, mode, today);
  const summaries = data.loaded.map((l) => l.summary);
  const minConfidence = Math.max(0, ...data.loaded.map((l) => l.ds.config.rag.minConfidence));
  const t = data.totals;
  const label = deltaLabel(mode);

  const openLevel = useCallback(
    (levelId: LevelId, path: string = "/") => {
      setLevelId(levelId);
      router.push(path);
    },
    [setLevelId, router],
  );

  const delta = (cur: number, prev: number | undefined, goodWhen: "up" | "down") =>
    prev === undefined ? undefined : { value: Math.round((cur - prev) * 100) / 100, goodWhen, label };

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <PageHeader
        icon={School}
        eyebrow={SCHOOL_NAME}
        title="Toàn trường"
        description="So sánh nền nếp giữa các cấp học. Mỗi cấp dùng lịch tuần riêng nên kỳ được xác định theo từng cấp."
        actions={
          <div className="w-full sm:w-[22rem]">
            <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} ariaLabel="Kỳ so sánh" fullWidth />
          </div>
        }
      />

      <section aria-label="Chỉ số toàn trường" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label={KPI_TERMS.incidents.label}
          value={t.incidents}
          icon={ClipboardList}
          tone="brand"
          delta={delta(t.incidents, t.previous?.incidents, "down")}
          hint={KPI_TERMS.incidents.hint}
          footer={`${fmtNumber(t.violationTurns)} ${KPI_TERMS.violationTurns.label.toLowerCase()}`}
        />
        <KpiCard
          label={KPI_TERMS.penaltyPoints.label}
          value={t.penaltyPoints}
          unit="điểm"
          icon={TriangleAlert}
          tone="bad"
          delta={delta(t.penaltyPoints, t.previous?.penaltyPoints, "down")}
          hint={KPI_TERMS.penaltyPoints.hint}
        />
        <KpiCard
          label={KPI_TERMS.rewardPoints.label}
          value={t.rewardPoints}
          unit="điểm"
          icon={Award}
          tone="star"
          delta={delta(t.rewardPoints, t.previous?.rewardPoints, "up")}
          hint={KPI_TERMS.rewardPoints.hint}
        />
        <KpiCard
          label="Lớp mức Đỏ"
          value={`${fmtNumber(t.redClasses)}/${fmtNumber(t.classCount)}`}
          unit="lớp"
          icon={Siren}
          tone={t.redClasses > 0 ? "bad" : "ok"}
          hint={`Lớp có điểm trừ trung bình/tuần từ ngưỡng Đỏ. Thêm ${fmtNumber(t.yellowClasses)} lớp mức Vàng.`}
          footer={`${fmtNumber(t.yellowClasses)} lớp mức Vàng`}
        />
        <KpiCard
          label="HS cần theo dõi"
          value={t.weeklyRedStudents + t.repeatStudents}
          icon={BellRing}
          tone={t.weeklyRedStudents > 0 ? "bad" : "warn"}
          hint="Học sinh bị cảnh báo đỏ trong một tuần hoặc tái phạm trong kỳ."
          footer={`${fmtNumber(t.weeklyRedStudents)} cảnh báo đỏ · ${fmtNumber(t.repeatStudents)} tái phạm`}
        />
        <KpiCard
          label="Độ tin cậy dữ liệu"
          value={fmtPercent(data.confidence, 1)}
          icon={ShieldCheck}
          tone={confidenceTone(data.confidence, minConfidence)}
          hint="(Hợp lệ + Thiếu tên HS) / tổng sự việc của các cấp trong kỳ."
          footer={typeof t.studentCount === "number" ? `${fmtNumber(t.studentCount)} học sinh · ${fmtNumber(t.classCount)} lớp` : `${fmtNumber(t.classCount)} lớp`}
        />
      </section>

      <section aria-label="Các cấp học" className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((it) => {
          const loaded = data.loaded.find((l) => l.levelId === it.levelId);
          return loaded ? (
            <LevelCard key={it.levelId} summary={loaded.summary} minConfidence={loaded.ds.config.rag.minConfidence} onOpen={openLevel} />
          ) : (
            <LevelCardPlaceholder
              key={it.levelId}
              levelId={it.levelId}
              error={it.status === "error" ? it.error : undefined}
              onRetry={() => void refresh()}
              retrying={refreshing}
            />
          );
        })}
      </section>

      {summaries.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-12">
            <CompareCard summaries={summaries} className="xl:col-span-5" />
            <SchoolTrendCard trend={data.trend} className="xl:col-span-7" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
            <SchoolIssuesCard issues={data.issues} />
            <SchoolAlertsCard summaries={summaries} onOpenLevel={openLevel} />
          </div>
        </>
      ) : null}
    </div>
  );
}
