/**
 * "Chất lượng dữ liệu" view models: confidence per class / source / reporter, issue-code counts, weekly trend
 * and the ECharts option of the per-class confidence bars. Confidence values always come from the engine
 * (`dataConfidence`); this module only groups records and formats them. Pure – no React.
 */
import type { TrendPoint } from "@/lib/engine/analytics";
import { dataConfidence } from "@/lib/engine/rag";
import { formatNumberVN, naturalCompare } from "@/lib/engine/text";
import { CHART_TOKENS, type ChartOption } from "@/components/charts/theme";
import { toneHex } from "@/components/ui/tones";
import type { DataIssueCode, Incident } from "@/lib/types";
import { compareIssueCodes, issueMeta } from "./issue-meta";
import { reporterOf } from "./incident-rows";

/** Ratio 0..1 → percent with one decimal (0.875 → 87.5). */
export function toPct(ratio: number): number {
  return Math.round(ratio * 1000) / 10;
}

export interface ConfidenceRow {
  key: string;
  label: string;
  incidents: number;
  review: number;
  unnamed: number;
  confidence: number;
}

function confidenceRow(key: string, label: string, list: Incident[]): ConfidenceRow {
  return {
    key,
    label,
    incidents: list.length,
    review: list.filter((i) => i.dataCheck === "REVIEW").length,
    unnamed: list.filter((i) => i.dataCheck === "THIEU_TEN_HS").length,
    confidence: dataConfidence(list),
  };
}

function groupRows(incidents: readonly Incident[], keyOf: (i: Incident) => string): Map<string, Incident[]> {
  const map = new Map<string, Incident[]>();
  for (const i of incidents) {
    const k = keyOf(i);
    const list = map.get(k);
    if (list) list.push(i);
    else map.set(k, [i]);
  }
  return map;
}

/** Confidence of every class that has incidents in scope, lowest first (ties: more REVIEW first, then class code). */
export function classConfidence(incidents: readonly Incident[]): ConfidenceRow[] {
  return [...groupRows(incidents, (i) => i.classCode).entries()]
    .map(([code, list]) => confidenceRow(code, code, list))
    .sort((a, b) => a.confidence - b.confidence || b.review - a.review || naturalCompare(a.key, b.key));
}

/** Records per source (app / import) with their confidence. Sources without records are omitted. */
export function sourceStats(incidents: readonly Incident[]): ConfidenceRow[] {
  const groups = groupRows(incidents, (i) => i.source);
  const out: ConfidenceRow[] = [];
  for (const [key, label] of [
    ["app", "Ghi nhận trên ứng dụng"],
    ["import", "Nhập từ Excel"],
  ] as const) {
    const list = groups.get(key);
    if (list?.length) out.push(confidenceRow(key, label, list));
  }
  return out;
}

/** Top reporters by number of incidents (Người ghi, falling back to the creating account). */
export function reporterStats(incidents: readonly Incident[], n = 10): ConfidenceRow[] {
  return [...groupRows(incidents, (i) => reporterOf(i)).entries()]
    .map(([name, list]) => confidenceRow(name, name, list))
    .sort((a, b) => b.incidents - a.incidents || a.confidence - b.confidence || a.label.localeCompare(b.label, "vi"))
    .slice(0, n);
}

export interface IssueCount {
  code: DataIssueCode;
  label: string;
  count: number;
}

/** Incidents per issue code (an incident with two issues counts in both), most frequent first. */
export function issueCodeCounts(incidents: readonly Incident[]): IssueCount[] {
  const counts = new Map<DataIssueCode, number>();
  for (const i of incidents) for (const code of new Set(i.dataIssues.map((d) => d.code))) counts.set(code, (counts.get(code) ?? 0) + 1);
  return [...counts.entries()]
    .map(([code, count]) => ({ code, label: issueMeta(code).label, count }))
    .sort((a, b) => b.count - a.count || compareIssueCodes(a.code, b.code));
}

/** Weekly confidence in percent; weeks without incidents are gaps (null) instead of a misleading 100%. */
export function confidenceTrend(trend: readonly TrendPoint[]): { categories: string[]; values: Array<number | null>; incidents: number[] } {
  return {
    categories: trend.map((t) => t.label),
    values: trend.map((t) => (t.incidents > 0 ? toPct(t.confidence) : null)),
    incidents: trend.map((t) => t.incidents),
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Horizontal bars of class confidence (sorted ascending), red below `minConfidence`, dashed threshold line. */
export function confidenceBarOption(rows: readonly ConfidenceRow[], minConfidence: number): ChartOption {
  const threshold = toPct(minConfidence);
  const pctText = (v: number) => `${formatNumberVN(v, 1)}%`;
  return {
    grid: { left: 4, right: 52, top: 8, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (p) => {
        const first = Array.isArray(p) ? p[0] : p;
        const row = rows[first?.dataIndex ?? -1];
        if (!row) return "";
        const below = row.confidence < minConfidence;
        return (
          `<strong>Lớp ${esc(row.label)}</strong><br/>Độ tin cậy: <strong>${pctText(toPct(row.confidence))}</strong>` +
          `${below ? " (dưới ngưỡng)" : ""}<br/>${formatNumberVN(row.incidents)} sự việc · ${formatNumberVN(row.review)} cần rà soát`
        );
      },
    },
    xAxis: { type: "value", min: 0, max: 100, splitNumber: 4, axisLabel: { formatter: (v: number) => `${v}%` } },
    yAxis: { type: "category", data: rows.map((r) => r.label), inverse: true, axisLabel: { fontWeight: 600 } },
    series: [
      {
        type: "bar",
        name: "Độ tin cậy",
        barMaxWidth: 18,
        data: rows.map((r) => ({
          value: toPct(r.confidence),
          itemStyle: { color: r.confidence < minConfidence ? toneHex.bad : toneHex.ok, borderRadius: [0, 4, 4, 0] },
        })),
        label: {
          show: true,
          position: "right",
          distance: 6,
          color: CHART_TOKENS.textSecondary,
          fontSize: 11.5,
          fontWeight: 600,
          formatter: (p: { value?: unknown }) => pctText(typeof p.value === "number" ? p.value : Number(p.value) || 0),
        },
        markLine: {
          silent: true,
          symbol: "none",
          data: [
            {
              xAxis: threshold,
              lineStyle: { color: toneHex.bad, type: "dashed", width: 1.5 },
              label: { show: true, formatter: `Ngưỡng ${formatNumberVN(threshold, 1)}%`, position: "insideEndTop", color: toneHex.bad, fontSize: 11, fontWeight: 600 },
            },
          ],
        },
      },
    ],
  };
}

/** Pixel height that keeps ~28px per bar. */
export function confidenceChartHeight(rowCount: number): number {
  return Math.max(160, rowCount * 28 + 36);
}
