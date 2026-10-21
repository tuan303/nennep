/** REQ_V2 §7.6: tab "Cảnh báo sớm" – grouping, kind filter, action prefill and the item render. */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY } from "@/lib/engine/__fixtures__/dataset";
import { V2_FIXTURE_IDS, makeV2FixtureDataset } from "@/lib/engine/__fixtures__/dataset-v2";
import { ActionCreateSchema } from "@/lib/contract";
import { OWNER_DISCIPLINE, earlyWarnings, type EarlyWarning } from "@/lib/engine";
import type { ActionItem } from "@/lib/types";
import { WarningItem } from "../early-warning-tab";
import { toCreateInput, validateActionForm } from "../lib/action-form";
import {
  WARNING_KINDS,
  filterWarningsByKind,
  formFromWarning,
  groupWarningsBySeverity,
  priorityOfSeverity,
  warningIncidents,
  warningScopeLabels,
  warningsOfClasses,
} from "../lib/early-warning-view";

const ds = makeV2FixtureDataset();
const today = FIXTURE_TODAY;
const week = { mode: "week" as const, key: "2026-10-19" };
const warnings = earlyWarnings(ds, { period: week }, today);
const serious = warnings.find((w) => w.kind === "SERIOUS_INCIDENT" && w.evidence.incidentIds.includes(V2_FIXTURE_IDS.serious));
const repeat = warnings.find((w) => w.kind === "REPEAT_STUDENT");
const sla = ds.config.actionSlaDays;

describe("early-warning view", () => {
  it("has the fixture's serious incident and groups by severity (high first)", () => {
    expect(serious?.severity).toBe("high");
    const groups = groupWarningsBySeverity(warnings);
    expect(groups.map((g) => g.severity)).toEqual(["high", "medium", "low"].filter((s) => warnings.some((w) => w.severity === s)));
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(warnings.length);
    expect(groups[0].label).toContain("Mức cao");
    expect(groupWarningsBySeverity([])).toEqual([]);
  });

  it("filters by kind and by own classes", () => {
    for (const k of WARNING_KINDS) expect(filterWarningsByKind(warnings, k).every((w) => w.kind === k)).toBe(true);
    expect(filterWarningsByKind(warnings)).toHaveLength(warnings.length);
    expect(warningsOfClasses(warnings, ["6A05"]).every((w) => w.classCode === "6A05")).toBe(true);
    expect(warningsOfClasses(warnings)).toHaveLength(warnings.length);
  });

  it("maps severity to priority", () => {
    expect(priorityOfSeverity("high")).toBe("High");
    expect(priorityOfSeverity("medium")).toBe("Medium");
    expect(priorityOfSeverity("low")).toBe("Low");
  });

  it("prefills 'Tạo hành động' (serious → Cán bộ nền nếp; others → GVCN lớp; SLA deadline; reference week)", () => {
    const f = formFromWarning(serious!, { today, sla, periodLabel: "Tuần 19/10 – 25/10/2026" });
    expect(f).toMatchObject({ title: serious!.message, priority: "High", owner: OWNER_DISCIPLINE, deadline: "2026-10-24", scopeClass: "6A05", sourceWeek: "2026-10-19" });
    expect(f.description).toContain("Sự việc nghiêm trọng");
    expect(validateActionForm(f, { today })).toEqual({});
    expect(ActionCreateSchema.safeParse(toCreateInput("THCS", f)).success).toBe(true);
    const medium = warnings.find((w) => w.severity === "medium" && w.kind !== "SERIOUS_INCIDENT");
    if (medium) {
      const m = formFromWarning(medium, { today, sla });
      expect(m).toMatchObject({ priority: "Medium", owner: `GVCN lớp ${medium.classCode}`, deadline: "2026-10-28" });
    }
    const long: EarlyWarning = { ...serious!, message: "x".repeat(400) };
    expect(formFromWarning(long, { today, sla }).title).toHaveLength(300);
  });

  it("lists the non-period filters narrowing the list", () => {
    expect(warningScopeLabels({}, ds)).toEqual([]);
    const s0 = ds.students[0];
    expect(warningScopeLabels({ grade: 6, classCode: "6A05", errorCode: "L01", group: "Nhóm 3", studentId: s0.id }, ds)).toEqual([
      "Khối 6",
      "Lớp 6A05",
      `Lỗi L01 – ${ds.catalog.find((c) => c.code === "L01")?.issue}`,
      "Nhóm lỗi: Nhóm 3",
      `Học sinh: ${s0.name}`,
    ]);
    // The engine honours them: a class filter keeps that class only.
    expect(earlyWarnings(ds, { period: week, classCode: "6A05" }, today).every((w) => w.classCode === "6A05")).toBe(true);
  });

  it("finds the evidence records in the dataset", () => {
    const list = warningIncidents(serious!, ds.incidents);
    expect(list.map((i) => i.id)).toEqual([V2_FIXTURE_IDS.serious]);
    expect(warningIncidents({ evidence: { incidentIds: ["THCS_missing"] } }, ds.incidents)).toEqual([]);
  });
});

describe("warning item render", () => {
  const noop = () => undefined;
  const base = { canManage: true, onCreate: noop, onOpenAction: noop, onOpenIncident: noop, onOpenStudent: noop };

  it("shows kind badge, class link, message, evidence and 'Tạo hành động'", () => {
    const html = renderToStaticMarkup(h(WarningItem, { ...base, warning: serious!, incidents: warningIncidents(serious!, ds.incidents) }));
    expect(html).toContain("Sự việc nghiêm trọng");
    expect(html).toContain('href="/lop?class=6A05"');
    expect(html).toContain(serious!.message.replace(/“|”/g, (c) => c));
    expect(html).toContain("NN-20261020-0006");
    expect(html).toContain("Tạo hành động");
    expect(html).toContain("Tuần 19/10");
  });

  it("links to the student history for tái phạm, and to an existing action instead of creating a duplicate", () => {
    if (repeat) {
      const html = renderToStaticMarkup(h(WarningItem, { ...base, warning: repeat, incidents: [] }));
      expect(html).toContain("Lịch sử học sinh");
    }
    const existing = { id: "THCS_HD-20261021-001", code: "HD-20261021-001", status: "Open" } as ActionItem;
    const html = renderToStaticMarkup(h(WarningItem, { ...base, warning: serious!, incidents: [], existing }));
    expect(html).toContain("Đã có hành động");
    expect(html).toContain("HD-20261021-001");
    expect(html).not.toContain("Tạo hành động");
    const viewer = renderToStaticMarkup(h(WarningItem, { ...base, canManage: false, warning: serious!, incidents: [] }));
    expect(viewer).not.toContain("Tạo hành động");
  });
});
