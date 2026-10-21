"use client";

/**
 * Heavy part of <EChart>: loaded lazily (next/dynamic, client only) so ECharts never lands in the
 * first-load bundle. Registers only the chart types/components the kit uses.
 */
import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart, HeatmapChart, LineChart, PieChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TimelineComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { bindPrintResize } from "./print-resize";
import { buildNshmTheme, type ChartOption } from "./theme";
import type { ChartEventHandlers } from "./echart";

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  DataZoomComponent,
  MarkLineComponent,
  // Required by ECharts' option manager for responsive `baseOption` + `media` options (horizontal bar labels).
  TimelineComponent,
  CanvasRenderer,
]);

const FALLBACK_FONT = '"Lexend", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
let themeRegistered = false;

function ensureTheme() {
  if (themeRegistered || typeof document === "undefined") return;
  const family = getComputedStyle(document.body).fontFamily || FALLBACK_FONT;
  echarts.registerTheme("nshm", buildNshmTheme(family));
  themeRegistered = true;
}

export interface EChartInnerProps {
  option: ChartOption;
  height: number | string;
  onEvents?: ChartEventHandlers;
  notMerge: boolean;
}

export default function EChartInner({ option, height, onEvents, notMerge }: EChartInnerProps) {
  ensureTheme();
  // Canvas text is measured once: re-mount after web fonts finish loading so labels use Lexend.
  const [fontEpoch, setFontEpoch] = useState(0);
  useEffect(() => {
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    if (!fonts || fonts.status === "loaded") return;
    let alive = true;
    void fonts.ready.then(() => {
      if (alive) setFontEpoch((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Printing ("In" on Tổng quan / Lớp): re-render the canvas at the printed width so wide charts are not clipped.
  const chartRef = useRef<ReactEChartsCore>(null);
  useEffect(() => bindPrintResize(window, () => chartRef.current?.getEchartsInstance()), []);

  return (
    <ReactEChartsCore
      ref={chartRef}
      key={fontEpoch}
      echarts={echarts}
      option={option}
      theme="nshm"
      notMerge={notMerge}
      lazyUpdate
      opts={{ renderer: "canvas" }}
      onEvents={onEvents}
      style={{ height, width: "100%" }}
    />
  );
}
