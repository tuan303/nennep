/**
 * Pure view model of "Bao phủ kiểm tra" (REQ_V2 §6.3): labels, tones and texts of the engine `inspectionCoverage`.
 * Unit-tested in __tests__/coverage-view.test.ts.
 */
import type { Tone } from "@/components/ui/tones";
import { formatNumberVN, formatPercentVN } from "@/lib/engine/text";
import type { CoverageRow, CoverageStatus, InspectionCoverage } from "@/lib/engine";

export const COVERAGE_STATUS_META: Record<CoverageStatus, { label: string; tone: Tone }> = {
  OK: { label: "Đạt", tone: "ok" },
  LOW: { label: "Ít được kiểm tra", tone: "warn" },
  NONE: { label: "Chưa được kiểm tra", tone: "bad" },
};

/**
 * Badge of a row. The engine keeps a class "OK" when its whole grade has no round (nothing to compare with), but a
 * class that was never inspected must not read "Đạt" with a green check: it shows a neutral "Chưa được kiểm tra".
 */
export function coverageDisplay(r: Pick<CoverageRow, "status" | "rounds">): { label: string; tone: Tone; icon: CoverageStatus } {
  if (r.status === "OK" && r.rounds === 0) return { label: COVERAGE_STATUS_META.NONE.label, tone: "muted", icon: "NONE" };
  return { ...COVERAGE_STATUS_META[r.status], icon: r.status };
}

/** Note under the KPIs, with the configured ratio (default 60%). */
export function coverageNote(minRatio: number): string {
  return `Lớp có số đợt kiểm tra dưới ${formatPercentVN(minRatio)} trung bình của khối được đánh dấu để bảo đảm công bằng khi so sánh điểm trừ.`;
}

export interface CoverageKpi {
  id: "rounds" | "sessions" | "classes" | "flagged";
  label: string;
  value: string;
  hint: string;
  tone: Tone;
}

export function coverageKpis(c: InspectionCoverage): CoverageKpi[] {
  return [
    {
      id: "rounds",
      label: "Đợt kiểm tra",
      value: formatNumberVN(c.rounds),
      hint: "Số đợt kiểm tra nền nếp (DKT-…) trong kỳ và phạm vi đang lọc.",
      tone: "brand",
    },
    {
      id: "sessions",
      label: "Số buổi",
      value: formatNumberVN(c.sessions),
      hint: "Số buổi kiểm tra khác nhau (ngày + buổi sáng/chiều); nhiều đợt cùng buổi chỉ tính 1 buổi.",
      tone: "muted",
    },
    {
      id: "classes",
      label: "Lớp được kiểm tra",
      value: `${formatNumberVN(c.classesInspected)}/${formatNumberVN(c.classesTotal)}`,
      hint: "Số lớp đang hoạt động có ít nhất một đợt kiểm tra / tổng số lớp trong phạm vi.",
      tone: c.classesTotal > 0 && c.classesInspected === c.classesTotal ? "ok" : "warn",
    },
    {
      id: "flagged",
      label: "Lớp chưa công bằng",
      value: formatNumberVN(c.flagged.length),
      hint: `Lớp chưa được kiểm tra hoặc có số đợt dưới ${formatPercentVN(c.minRatio)} trung bình của khối.`,
      tone: c.flagged.length > 0 ? "bad" : "ok",
    },
  ];
}

/** "85%" of the grade average, "–" when the grade average is 0. */
export function coverageRatioText(ratio: number | null): string {
  return ratio === null ? "–" : formatPercentVN(ratio);
}

/** Sự việc / đợt ("–" without a round). */
export function perRoundText(v: number | null): string {
  return v === null ? "–" : formatNumberVN(v, 2);
}

/** Accessible one-liner of a row (cards, aria labels). */
export function coverageRowText(r: CoverageRow): string {
  const status = coverageDisplay(r).label;
  return `Lớp ${r.classCode}: ${formatNumberVN(r.rounds)} đợt, ${formatNumberVN(r.sessions)} buổi, ${coverageRatioText(r.coverageRatio)} TB khối – ${status}`;
}

/** True when nothing was inspected in the scope (empty view). */
export function coverageIsEmpty(c: InspectionCoverage): boolean {
  return c.rounds === 0;
}
