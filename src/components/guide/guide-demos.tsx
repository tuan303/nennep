"use client";
/**
 * Live illustrations for the guide ("demo" blocks): real kit components with FICTIONAL data, or static mocks of the
 * shell (filter bar, phone tab bar). Nothing here reads the session or a dataset.
 */
import type { ReactNode } from "react";
import {
  Award,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LayoutGrid,
  Plus,
  SlidersHorizontal,
  TrendingDown,
  Trophy,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { FormulaText } from "@/components/app/widgets/formula-text";
import { RagLegend } from "@/components/app/widgets/rag-legend";
import { RewardPointsPicker } from "@/components/rewards/reward-points-picker";
import { DataCheckBadge, KpiCard, StatusBadge, Top90Badge, cn, type AnyStatus } from "@/components/ui";
import { KPI_TERMS, LEVELS, LEVEL_IDS, LEVEL_THEME, SCHOOL_WIDE_COLOR } from "@/lib/constants";
import type { DataCheck } from "@/lib/types";
import type { GuideBlock } from "./types";

export type GuideDemoKind = Extract<GuideBlock, { kind: "demo" }>["demo"];

const noop = () => undefined;

/* ---------------------------------- KPI ---------------------------------- */

function KpiDemo() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        label={KPI_TERMS.incidents.label}
        hint={KPI_TERMS.incidents.hint}
        value={12}
        icon={ClipboardList}
        delta={{ value: -3, goodWhen: "down", label: "so với tuần trước" }}
        sparkline={[18, 15, 16, 12]}
      />
      <KpiCard
        label={KPI_TERMS.violationTurns.label}
        hint={KPI_TERMS.violationTurns.hint}
        value={15}
        icon={UsersRound}
        delta={{ value: -2, goodWhen: "down", label: "so với tuần trước" }}
        sparkline={[20, 17, 17, 15]}
      />
      <KpiCard
        label={KPI_TERMS.penaltyPoints.label}
        hint={KPI_TERMS.penaltyPoints.hint}
        value={34}
        icon={TrendingDown}
        tone="bad"
        delta={{ value: 4, goodWhen: "down", label: "so với tuần trước" }}
        sparkline={[26, 31, 30, 34]}
      />
      <KpiCard
        label={KPI_TERMS.rewardPoints.label}
        hint={KPI_TERMS.rewardPoints.hint}
        value={8}
        icon={Award}
        tone="star"
        delta={{ value: 2, goodWhen: "up", label: "so với tuần trước" }}
        sparkline={[4, 5, 6, 8]}
      />
    </div>
  );
}

/* ------------------------------- Top 90% --------------------------------- */

function Top90Demo() {
  const rows: Array<{ rank: number; cls: string; score: number; inTop: boolean }> = [
    { rank: 1, cls: "6A03", score: 412, inTop: true },
    { rank: 2, cls: "6A01", score: 405, inTop: true },
    { rank: 10, cls: "6A10", score: 371, inTop: false },
  ];
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-card bg-surface ring-1 ring-border">
      {rows.map((r) => (
        <li key={r.cls} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5">
          <span className="num w-14 shrink-0 text-[13px] font-semibold text-slate-500">Hạng {r.rank}</span>
          <span className="min-w-0 flex-1 font-semibold text-brand-900">
            Lớp {r.cls} <span className="num ml-1 font-normal text-slate-500">· {r.score} điểm</span>
          </span>
          <Top90Badge inTop90={r.inTop} size="sm" />
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------- Statuses ------------------------------- */

const STATUS_FLOWS: Array<{ label: string; steps: AnyStatus[] }> = [
  { label: "Sự việc", steps: ["Mới ghi nhận", "Đang xử lý", "Đã đóng"] },
  { label: "Điểm thưởng", steps: ["Mới ghi nhận", "Đang xác minh", "Đã xác nhận"] },
  { label: "Hành động", steps: ["Open", "Doing", "Done"] },
];

function StatusDemo() {
  return (
    <dl className="flex flex-col gap-3">
      {STATUS_FLOWS.map((f) => (
        <div key={f.label} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <dt className="w-28 shrink-0 text-[13px] font-semibold text-slate-600">{f.label}</dt>
          <dd className="flex flex-wrap items-center gap-1.5">
            {f.steps.map((s, i) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                {i > 0 ? <ChevronRight aria-hidden className="size-3.5 text-slate-400" strokeWidth={2.5} /> : null}
                <StatusBadge status={s} size="sm" />
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------ Data check ------------------------------- */

const DATA_CHECKS: Array<{ value: DataCheck; text: string }> = [
  { value: "OK", text: "Đủ thông tin theo quy tắc ghi nhận." },
  { value: "THIEU_TEN_HS", text: "Có học sinh chưa rõ tên – vẫn được tính điểm." },
  { value: "REVIEW", text: "Thông tin cần được kiểm tra lại." },
];

function DataCheckDemo() {
  return (
    <ul className="flex flex-col gap-2.5">
      {DATA_CHECKS.map((d) => (
        <li key={d.value} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <DataCheckBadge dataCheck={d.value} size="sm" className="min-w-[112px] justify-center" />
          <span className="text-[13px] text-slate-600">{d.text}</span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------- Formula -------------------------------- */

function FormulaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-1 rounded-control bg-surface px-3.5 py-2.5 ring-1 ring-inset ring-border sm:flex-row sm:items-baseline sm:gap-3">
      <span className="text-[13px] font-semibold text-slate-600 sm:w-52 sm:shrink-0">{label}</span>
      <span className="inline-flex flex-wrap items-baseline gap-1 text-[15px]">{children}</span>
    </li>
  );
}

function FormulaDemo() {
  return (
    <ul className="flex flex-col gap-2">
      <FormulaRow label="Lỗi tính theo học sinh (/HS)">
        <FormulaText input={{ unit: "/HS", penalty: 2, namedCount: 3, unnamedCount: 0, occurrenceCount: 1 }} icon />
        <span className="text-slate-700">điểm</span>
      </FormulaRow>
      <FormulaRow label="Lỗi tính theo lần (/lần)">
        <FormulaText input={{ unit: "/lần", penalty: 5, namedCount: 0, unnamedCount: 0, occurrenceCount: 2 }} icon />
        <span className="text-slate-700">điểm</span>
      </FormulaRow>
      <FormulaRow label="Có học sinh chưa rõ tên">
        <FormulaText input={{ unit: "/HS", penalty: 2, namedCount: 2, unnamedCount: 1, occurrenceCount: 1 }} icon />
        <span className="text-slate-700">điểm</span>
      </FormulaRow>
    </ul>
  );
}

/* ----------------------------- Reward levels ----------------------------- */

function RewardLevelsDemo() {
  return (
    <div>
      <p className="sr-only">Năm mức điểm cộng từ +1 đến +5; trong hình đang chọn +3.</p>
      {/* The real picker, frozen: a picture of the control, not a form field. */}
      <div inert className="max-w-md">
        <RewardPointsPicker value={3} onChange={noop} />
      </div>
    </div>
  );
}

/* ------------------------------ Level colours ---------------------------- */

function gradesText(grades: readonly number[]): string {
  return grades.length > 1 ? `Khối ${grades[0]}–${grades[grades.length - 1]}` : `Khối ${grades[0]}`;
}

function LevelColorsDemo() {
  const items = [
    ...LEVEL_IDS.map((l) => ({ key: l, name: LEVELS[l].name, sub: gradesText(LEVELS[l].grades), color: LEVEL_THEME[l].brand })),
    { key: "ALL", name: "Toàn trường", sub: "So sánh các cấp", color: SCHOOL_WIDE_COLOR },
  ];
  return (
    <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {items.map((it) => (
        <li key={it.key} className="relative overflow-hidden rounded-control bg-surface px-3.5 pb-3 pt-4 ring-1 ring-inset ring-border">
          <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: it.color }} />
          <span className="flex items-center gap-2">
            <span aria-hidden className="size-3 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: it.color }} />
            <span className="text-[14px] font-semibold leading-tight text-brand-900">{it.name}</span>
          </span>
          <span className="mt-1 block pl-5 text-xs text-slate-500">{it.sub}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------ Filter bar mock -------------------------- */

const FIELD = "inline-flex h-10 min-w-0 items-center gap-2 rounded-control bg-surface px-3 text-[13px] text-slate-700 ring-1 ring-inset ring-border-strong shadow-xs";

function MockSelect({ text, active, className }: { text: string; active?: boolean; className?: string }) {
  return (
    <span className={cn(FIELD, "justify-between", active && "font-semibold text-brand-800 ring-brand-300", className)}>
      <span className="truncate">{text}</span>
      <ChevronRight aria-hidden className="size-3.5 shrink-0 rotate-90 text-slate-400" strokeWidth={2.5} />
    </span>
  );
}

function FiltersDemo() {
  const modes = ["Toàn bộ", "Tuần", "Tháng", "Học kỳ"];
  return (
    <div
      role="img"
      aria-label="Minh họa thanh bộ lọc: chọn kỳ (Tuần, Tháng, Học kỳ, Toàn bộ), khối, lớp, mảng, nhóm lỗi, lỗi và học sinh; trên điện thoại bấm nút Bộ lọc."
      className="flex flex-col gap-4"
    >
      <div aria-hidden className="flex flex-col gap-1.5">
        <p className="text-2xs font-bold uppercase tracking-[0.12em] text-slate-500">Trên máy tính</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-10 items-center rounded-control bg-surface-3 p-1 ring-1 ring-inset ring-border">
            {modes.map((m) => (
              <span
                key={m}
                className={cn("inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] font-semibold", m === "Tuần" ? "bg-surface text-brand-900 shadow-xs ring-1 ring-border" : "text-slate-500")}
              >
                {m}
              </span>
            ))}
          </span>
          <span className={cn(FIELD, "num font-semibold text-brand-900")}>
            <CalendarDays aria-hidden className="size-4 shrink-0 text-brand-600" strokeWidth={2.25} />
            <span className="truncate">Tuần 19/10 – 25/10/2026</span>
          </span>
          <MockSelect text="Khối 6" active />
          <MockSelect text="Lớp 6A01" active />
          <MockSelect text="Tất cả mảng" />
          <MockSelect text="Tất cả nhóm lỗi" />
          <MockSelect text="Tất cả lỗi" />
          <MockSelect text="Tất cả học sinh" />
        </div>
      </div>
      <div aria-hidden className="flex flex-col gap-1.5">
        <p className="text-2xs font-bold uppercase tracking-[0.12em] text-slate-500">Trên điện thoại</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-10 items-stretch overflow-hidden rounded-full bg-surface shadow-xs ring-1 ring-inset ring-border-strong">
            <span className="inline-flex w-9 items-center justify-center text-brand-700">
              <ChevronLeft className="size-4" strokeWidth={2.25} />
            </span>
            <span className="num inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-900">
              <CalendarDays className="size-4 text-brand-600" strokeWidth={2.25} />
              Tuần 19/10 – 25/10
            </span>
            <span className="inline-flex w-9 items-center justify-center text-brand-700">
              <ChevronRight className="size-4" strokeWidth={2.25} />
            </span>
          </span>
          <span className="inline-flex h-8 items-center rounded-full bg-brand-50 px-3 text-[13px] font-medium text-brand-800 ring-1 ring-inset ring-brand-200">Lớp 6A01 ×</span>
          <span className="inline-flex h-9 items-center gap-1.5 rounded-control bg-surface px-3 text-[13px] font-semibold text-brand-900 shadow-xs ring-1 ring-inset ring-border-strong">
            <SlidersHorizontal className="size-4" strokeWidth={2.25} />
            Bộ lọc
            <span className="num inline-flex size-5 items-center justify-center rounded-full bg-star-500 text-2xs font-bold text-brand-950">2</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Phone tab bar mock ------------------------- */

function MockTab({ icon: Icon, label, active }: { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <span className={cn("relative flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-semibold leading-none tracking-tight", active ? "text-brand-700" : "text-slate-500")}>
      {active ? <span className="absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-brand-600" /> : null}
      <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
      <span className="max-w-full truncate">{label}</span>
    </span>
  );
}

function BottomNavDemo() {
  return (
    <div
      role="img"
      aria-label="Minh họa thanh điều hướng trên điện thoại: Tổng quan, Xếp hạng, nút Nhập màu vàng ở giữa, Học sinh và Thêm."
      className="mx-auto w-full max-w-[340px]"
    >
      <div aria-hidden className="overflow-hidden rounded-[26px] bg-canvas ring-1 ring-border-strong shadow-raised">
        <div className="flex flex-col gap-2 px-4 pb-10 pt-4">
          <span className="h-3 w-24 rounded-full bg-slate-300/70" />
          <span className="grid grid-cols-2 gap-2">
            <span className="h-12 rounded-xl bg-surface ring-1 ring-border" />
            <span className="h-12 rounded-xl bg-surface ring-1 ring-border" />
          </span>
          <span className="h-16 rounded-xl bg-surface ring-1 ring-border" />
        </div>
        <div className="grid h-[60px] grid-cols-5 border-t border-border bg-surface">
          <MockTab icon={LayoutDashboard} label="Tổng quan" active />
          <MockTab icon={Trophy} label="Xếp hạng" />
          <span className="flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-semibold leading-none tracking-tight text-slate-600">
            {/* 20px spacer keeps the label in line with the other tabs; the gold button floats above the bar. */}
            <span className="relative size-5">
              <span className="absolute -top-[30px] left-1/2 inline-flex size-12 -translate-x-1/2 items-center justify-center rounded-full bg-star-500 text-brand-950 shadow-gold ring-4 ring-surface">
                <Plus className="size-6" strokeWidth={2.75} />
              </span>
            </span>
            Nhập
          </span>
          <MockTab icon={Users} label="Học sinh" />
          <MockTab icon={LayoutGrid} label="Thêm" />
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Switch -------------------------------- */

const DEMOS: Record<GuideDemoKind, () => ReactNode> = {
  kpi: KpiDemo,
  rag: () => <RagLegend layout="list" />,
  top90: Top90Demo,
  status: StatusDemo,
  datacheck: DataCheckDemo,
  formula: FormulaDemo,
  "reward-levels": RewardLevelsDemo,
  "level-colors": LevelColorsDemo,
  filters: FiltersDemo,
  "bottom-nav": BottomNavDemo,
};

/** The illustration of a demo block (unknown kinds render nothing). */
export function GuideDemo({ demo }: { demo: GuideDemoKind }) {
  const Demo = DEMOS[demo];
  return Demo ? <Demo /> : null;
}
