/**
 * REQ_V2 Tổng quan cards: "Theo nhóm lỗi", "Điểm trừ cộng dồn" and "Cảnh báo sớm" view models (pure) + SSR smoke tests.
 */
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CHART_COLORS, CHART_OTHER_COLOR } from "@/components/charts/theme";
import { toneHex } from "@/components/ui/tones";
import { cumulativePenalty, earlyWarnings, filterIncidents, groupBreakdown, NO_GROUP_LABEL, type CumulativePenalty, type EarlyWarning } from "@/lib/engine";
import { FIXTURE_TODAY } from "@/lib/engine/__fixtures__/dataset";
import { makeV2FixtureDataset } from "@/lib/engine/__fixtures__/dataset-v2";
import type { GlobalFilters, LevelDataset, UserProfile } from "@/lib/types";
import { cumulativeLines, finalValue, groupBars, groupClickFilter, selectedGroup, weekHighlight } from "../lib/history-model";
import { crossFilterScopes } from "../lib/overview-model";
import { fadeColor } from "../lib/view-helpers";
import { scopeWarningsForViewer, warningKindBadges, warningsHref } from "../lib/warning-model";
import { CumulativeCard } from "../overview/cumulative-card";
import { EarlyWarningCard } from "../overview/early-warning-card";
import { GroupCard } from "../overview/group-card";

const noop = () => undefined;
const render = <P extends object>(C: ComponentType<P>, props: P) => renderToStaticMarkup(createElement(C, props));
const OCT: GlobalFilters = { period: { mode: "month", key: "2026-10" } };

describe("Theo nhóm lỗi", () => {
  it("scopes the chart without the group and error filters (cross-filter)", () => {
    const f: GlobalFilters = { ...OCT, grade: 6, group: "Nhóm 3", errorCode: "L35", studentId: "X" };
    expect(crossFilterScopes(f).group).toEqual({ ...OCT, grade: 6, studentId: "X", group: undefined, errorCode: undefined });
  });

  it("emphasises the group filter, else the group of the filtered error", () => {
    const ds = makeV2FixtureDataset();
    expect(selectedGroup({ group: "Nhóm 2" }, ds.catalog)).toBe("Nhóm 2");
    const coded = ds.catalog.find((c) => c.group);
    expect(selectedGroup({ errorCode: coded?.code }, ds.catalog)).toBe(coded?.group);
    expect(selectedGroup({}, ds.catalog)).toBeUndefined();
  });

  it("builds bars with stable colours, faded non-selected bars and a non-clickable 'Chưa phân nhóm'", () => {
    const stats = [
      { group: "Nhóm 1", incidents: 4, violationTurns: 6, points: 12, errorCodes: 2 },
      { group: "Nhóm 2", incidents: 1, violationTurns: 1, points: 5, errorCodes: 1 },
      { group: NO_GROUP_LABEL, incidents: 2, violationTurns: 2, points: 4, errorCodes: 1 },
    ];
    const plain = groupBars(stats, "violationTurns");
    expect(plain).toMatchObject({ categories: ["Nhóm 1", "Nhóm 2", NO_GROUP_LABEL], values: [6, 1, 2], total: 9, clickable: [true, true, false] });
    expect(plain.colors).toEqual([CHART_COLORS[0], CHART_COLORS[1], CHART_OTHER_COLOR]);
    const picked = groupBars(stats, "points", "Nhóm 2");
    expect(picked.selected).toBe("Nhóm 2");
    expect(picked.colors).toEqual([fadeColor(CHART_COLORS[0]), CHART_COLORS[1], fadeColor(CHART_OTHER_COLOR)]);
    expect(groupBars(stats, "incidents", "Nhóm 9").selected).toBeUndefined();
  });

  it("click toggles the group filter; the no-group bucket is not a filter", () => {
    expect(groupClickFilter("Nhóm 3", undefined)).toBe("Nhóm 3");
    expect(groupClickFilter("Nhóm 3", "Nhóm 3")).toBeUndefined();
    expect(groupClickFilter("Nhóm 1", "Nhóm 3")).toBe("Nhóm 1");
    expect(groupClickFilter(NO_GROUP_LABEL, "Nhóm 3")).toBeNull();
  });

  it("lists every catalog group of the v2 fixture, including the serious Nhóm 3 incident", () => {
    const ds = makeV2FixtureDataset();
    const stats = groupBreakdown(filterIncidents(ds, crossFilterScopes(OCT).group), ds.catalog);
    expect(stats.find((s) => s.group === "Nhóm 3")?.incidents).toBeGreaterThanOrEqual(1);
    const html = render(GroupCard, { ds, incidents: filterIncidents(ds, OCT), group: "Nhóm 3", highlighted: "Nhóm 3", onPick: noop });
    expect(html).toContain("Theo nhóm lỗi");
    expect(html).toContain("Bỏ lọc nhóm");
  });
});

describe("Điểm trừ cộng dồn", () => {
  const cp: CumulativePenalty = {
    weeks: ["2026-10-05", "2026-10-12", "2026-10-19"],
    labels: ["05/10", "12/10", "19/10"],
    series: [
      { key: "class:6A01", label: "Lớp 6A01", values: [2, 4, 4] },
      { key: "class:6A02", label: "Lớp 6A02", values: [0, 0, 0] },
      { key: "class:6A03", label: "Lớp 6A03", values: [5, 9, 12] },
      { key: "class:6A04", label: "Lớp 6A04", values: [1, 1, 3] },
      { key: "avg:6", label: "TB khối 6", values: [2, 3.5, 4.75] },
    ],
  };

  it("class mode: top classes by final value + the filtered class (crimson), averages dashed", () => {
    const lines = cumulativeLines(cp, "class", { top: 2, classCode: "6A02" });
    expect(lines.map((l) => l.key)).toEqual(["class:6A03", "class:6A01", "class:6A02", "avg:6"]);
    expect(lines.map((l) => l.color)).toEqual([CHART_COLORS[0], CHART_COLORS[1], toneHex.brand, "#94a3b8"]);
    expect(lines[3].dashed).toBe(true);
    // Classes without penalty are not "top" lines.
    expect(cumulativeLines(cp, "class", { top: 5 }).map((l) => l.key)).toEqual(["class:6A03", "class:6A01", "class:6A04", "avg:6"]);
    expect(finalValue(lines[0])).toBe(12);
  });

  it("total / grade modes keep the engine series", () => {
    const total: CumulativePenalty = { ...cp, series: [{ key: "total", label: "Toàn cấp", values: [1, 2, 3] }] };
    expect(cumulativeLines(total, "total")).toEqual([{ key: "total", name: "Toàn cấp", data: [1, 2, 3], color: toneHex.bad, area: true }]);
    const grades: CumulativePenalty = { ...cp, series: [{ key: "grade:6", label: "Khối 6", values: [1] }, { key: "grade:7", label: "Khối 7", values: [2] }] };
    expect(cumulativeLines(grades, "grade").map((l) => [l.name, l.color])).toEqual([
      ["Khối 6", CHART_COLORS[0]],
      ["Khối 7", CHART_COLORS[1]],
    ]);
  });

  it("tints the weeks of the selected period and ends with Σ points of the scope", () => {
    const ds = makeV2FixtureDataset();
    const real = cumulativePenalty(ds, OCT, FIXTURE_TODAY);
    const flags = weekHighlight(real.weeks, OCT.period, ds.weeks);
    expect(real.weeks.filter((_, i) => flags[i])).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    const sum = filterIncidents(ds, { period: { mode: "all" } }).reduce((a, i) => a + i.points, 0);
    expect(finalValue(cumulativeLines(real, "total")[0])).toBeCloseTo(sum, 6);
    const html = render(CumulativeCard, { ds, filters: OCT, today: FIXTURE_TODAY, onPickWeek: noop });
    expect(html).toContain("Điểm trừ cộng dồn");
    expect(html).toContain("Vùng tô nền: kỳ đang xem (3 tuần)");
  });
});

describe("Cảnh báo sớm", () => {
  const gvcn = (classCode: string): Pick<UserProfile, "role" | "gvcnClasses"> => ({ role: "GVCN", gvcnClasses: [{ levelId: "THCS", classCode }] });

  it("limits a GVCN to own classes and counts every kind", () => {
    const ds = makeV2FixtureDataset();
    const all = earlyWarnings(ds, { period: { mode: "week", key: "2026-10-19" } }, FIXTURE_TODAY);
    expect(all.some((w) => w.kind === "SERIOUS_INCIDENT" && w.classCode === "6A05")).toBe(true);
    const mine = scopeWarningsForViewer(all, gvcn("6A05"), "THCS");
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((w) => w.classCode === "6A05")).toBe(true);
    expect(scopeWarningsForViewer(all, { role: "VIEWER", gvcnClasses: [] }, "THCS")).toEqual(all);
    const badges = warningKindBadges(mine);
    expect(badges.map((b) => b.kind)).toEqual(["SERIOUS_INCIDENT", "REPEAT_STUDENT", "RISING_CLASS", "PROLONGED_ERROR"]);
    expect(badges.find((b) => b.kind === "SERIOUS_INCIDENT")?.count).toBeGreaterThanOrEqual(1);
    expect(badges.reduce((a, b) => a + b.count, 0)).toBe(mine.length);
  });

  it("links 'Xem tất cả' to the Hành động tab, keeping the period", () => {
    expect(warningsHref("mode=week&key=2026-10-19")).toBe("/hanh-dong?mode=week&key=2026-10-19&tab=canh-bao");
    expect(warningsHref("")).toBe("/hanh-dong?tab=canh-bao");
  });

  it("renders the card (items, scope badge, empty state)", () => {
    const ds = makeV2FixtureDataset();
    const props = {
      ds,
      filters: { period: { mode: "week", key: "2026-10-19" } } as GlobalFilters,
      today: FIXTURE_TODAY,
      canOpenActions: true,
      search: "",
      onOpenClass: noop,
      onOpenStudent: noop,
      onOpenIncident: noop,
    };
    const html = render(EarlyWarningCard, props);
    expect(html).toContain("Cảnh báo sớm");
    expect(html).toContain("Sự việc nghiêm trọng");
    expect(html).toContain("Xem tất cả");
    const empty: LevelDataset = { ...ds, incidents: [] };
    const none = render(EarlyWarningCard, { ...props, ds: empty, canOpenActions: false });
    expect(none).toContain("Chưa có cảnh báo trong kỳ này");
    expect(none).not.toContain("Xem tất cả");
  });

  it("keeps engine ids unique (stable React keys)", () => {
    const ds = makeV2FixtureDataset();
    const items: EarlyWarning[] = earlyWarnings(ds, { period: { mode: "all" } }, FIXTURE_TODAY);
    expect(new Set(items.map((w) => w.id)).size).toBe(items.length);
  });
});
