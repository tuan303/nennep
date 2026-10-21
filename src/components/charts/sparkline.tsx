import { useId } from "react";
import { cn } from "../ui/cn";
import { formatNumberVN } from "../ui/format";

export interface SparklineProps {
  data: number[];
  /** Stroke colour (hex). Default brand royal. */
  color?: string;
  /** Pixel size of the SVG. */
  width?: number;
  height?: number;
  strokeWidth?: number;
  /** Soft area wash under the line (10% of the colour). Default true. */
  area?: boolean;
  /** Accessible description. Default: "Xu hướng: a → b". */
  ariaLabel?: string;
  className?: string;
}

/** Map values into SVG coordinates (exported for tests). */
export function sparklinePoints(data: number[], width: number, height: number, pad: number): Array<[number, number]> {
  const finite = data.map((v) => (Number.isFinite(v) ? v : 0));
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min || 1;
  const stepX = finite.length > 1 ? (width - pad * 2) / (finite.length - 1) : 0;
  return finite.map((v, i) => {
    const x = pad + i * stepX;
    const y = max === min ? height / 2 : pad + (1 - (v - min) / span) * (height - pad * 2);
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
  });
}

/** Lightweight inline trend line (pure SVG, no ECharts). Fixed pixel size. */
export function Sparkline({ data, color = "#2b3a9e", width = 96, height = 32, strokeWidth = 2, area = true, ariaLabel, className }: SparklineProps) {
  const gid = useId();
  if (data.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel ?? "Chưa có dữ liệu xu hướng"} className={cn("shrink-0", className)}>
        <line x1={4} x2={width - 4} y1={height / 2} y2={height / 2} stroke="#cbd3e1" strokeWidth={1.5} strokeDasharray="3 4" strokeLinecap="round" />
      </svg>
    );
  }
  const pad = Math.max(3, strokeWidth + 2);
  const pts = sparklinePoints(data, width, height, pad);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  const areaPath = `${line} L${lx} ${height} L${pts[0][0]} ${height} Z`;
  const label = ariaLabel ?? `Xu hướng: ${formatNumberVN(data[0])} → ${formatNumberVN(data[data.length - 1])}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className={cn("shrink-0 overflow-visible", className)}>
      {area ? (
        <>
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gid})`} stroke="none" />
        </>
      ) : null}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3.5} fill={color} stroke="#fff" strokeWidth={2} />
    </svg>
  );
}
