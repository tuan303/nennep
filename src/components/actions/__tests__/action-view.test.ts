import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY } from "@/lib/engine/__fixtures__/dataset";
import { defaultLevelConfig } from "@/lib/constants";
import type { ActionItem } from "@/lib/types";
import {
  actionKpis,
  deadlineState,
  dueSoonRows,
  findExistingAction,
  groupByStatus,
  isOverdue,
  searchActions,
  slaRows,
  vnDateOf,
} from "../lib/action-view";

const TODAY = FIXTURE_TODAY; // 2026-10-21
const SLA = defaultLevelConfig("THCS").actionSlaDays; // High 3, Medium 7, Low 14

let seq = 0;
function action(over: Partial<ActionItem> = {}): ActionItem {
  seq++;
  const code = over.code ?? `HD-20261001-${String(seq).padStart(3, "0")}`;
  return {
    id: `THCS_${code}`,
    code,
    levelId: "THCS",
    title: `Hành động ${seq}`,
    priority: "Medium",
    owner: "Cán bộ nền nếp",
    deadline: "2026-10-25",
    status: "Open",
    createdBy: "u1",
    createdByName: "Quản trị",
    createdAt: "2026-10-01T02:00:00.000Z",
    history: [{ at: "2026-10-01T02:00:00.000Z", by: "admin@nshm.test", toStatus: "Open", note: "Tạo hành động" }],
    ...over,
  };
}

describe("deadlineState", () => {
  it("counts down open actions", () => {
    expect(deadlineState(action({ deadline: "2026-10-30" }), TODAY)).toMatchObject({ kind: "upcoming", daysLeft: 9, label: "còn 9 ngày", tone: "muted" });
    expect(deadlineState(action({ deadline: "2026-10-23" }), TODAY)).toMatchObject({ kind: "soon", label: "còn 2 ngày", tone: "warn" });
    expect(deadlineState(action({ deadline: TODAY }), TODAY)).toMatchObject({ kind: "today", label: "hôm nay đến hạn" });
    expect(deadlineState(action({ deadline: "2026-10-18", status: "Doing" }), TODAY)).toMatchObject({
      kind: "overdue",
      daysLeft: -3,
      label: "quá hạn 3 ngày",
      tone: "bad",
    });
  });

  it("judges done actions by their closing day (VN time)", () => {
    // 2026-10-19T18:00Z = 20/10 01:00 in Vietnam → one day after a 19/10 deadline.
    expect(deadlineState(action({ status: "Done", deadline: "2026-10-19", closedAt: "2026-10-19T18:00:00.000Z" }), TODAY)).toMatchObject({
      kind: "done",
      label: "hoàn thành trễ 1 ngày",
      tone: "warn",
    });
    expect(deadlineState(action({ status: "Done", deadline: "2026-10-19", closedAt: "2026-10-19T09:00:00.000Z" }), TODAY)).toMatchObject({
      label: "hoàn thành đúng hạn",
      tone: "ok",
    });
    expect(deadlineState(action({ status: "Done", deadline: "2026-10-01" }), TODAY).label).toBe("đã hoàn thành");
  });

  it("vnDateOf converts ISO timestamps to the Vietnamese day", () => {
    expect(vnDateOf("2026-10-20T17:30:00.000Z")).toBe("2026-10-21");
    expect(vnDateOf(undefined)).toBe("");
    expect(vnDateOf("not a date")).toBe("");
  });
});

describe("KPIs and grouping", () => {
  const items = [
    action({ status: "Open", deadline: "2026-10-30", priority: "Low" }),
    action({ status: "Open", deadline: "2026-10-20", priority: "High" }),
    action({ status: "Doing", deadline: "2026-10-10" }),
    action({ status: "Done", deadline: "2026-10-10", evidence: "Biên bản", closedAt: "2026-10-09T03:00:00.000Z" }),
    action({ status: "Done", deadline: "2026-10-12", evidence: "Ảnh", closedAt: "2026-10-15T03:00:00.000Z" }),
  ];

  it("actionKpis counts statuses and overdue (never Done)", () => {
    expect(actionKpis(items, TODAY)).toEqual({ open: 2, doing: 1, done: 2, overdue: 2, total: 5 });
    expect(isOverdue(items[3], TODAY)).toBe(false);
  });

  it("groupByStatus sorts open/doing by deadline and done by closing time", () => {
    const g = groupByStatus(items);
    expect(g.Open.map((i) => i.deadline)).toEqual(["2026-10-20", "2026-10-30"]);
    expect(g.Doing).toHaveLength(1);
    expect(g.Done.map((i) => i.closedAt)).toEqual(["2026-10-15T03:00:00.000Z", "2026-10-09T03:00:00.000Z"]);
  });
});

describe("SLA rows", () => {
  it("lists overdue actions, escalation when overdue days exceed the SLA of the priority", () => {
    const high = action({ priority: "High", deadline: "2026-10-17" }); // 4 days > 3 → escalate
    const highFresh = action({ priority: "High", deadline: "2026-10-19" }); // 2 days
    const medium = action({ priority: "Medium", deadline: "2026-10-14", status: "Doing" }); // 7 days = SLA → no
    const low = action({ priority: "Low", deadline: "2026-09-30" }); // 21 days > 14 → escalate
    const done = action({ status: "Done", deadline: "2026-09-01", evidence: "x" });
    const future = action({ deadline: "2026-10-22" });
    const rows = slaRows([medium, low, highFresh, done, high, future], SLA, TODAY);
    expect(rows.map((r) => [r.item.code, r.overdueDays, r.escalate])).toEqual([
      [high.code, 4, true],
      [low.code, 21, true],
      [highFresh.code, 2, false],
      [medium.code, 7, false],
    ]);
    expect(rows[0].slaDays).toBe(3);
  });

  it("dueSoonRows keeps not-done actions due within 2 days", () => {
    const a = action({ deadline: TODAY });
    const b = action({ deadline: "2026-10-23", status: "Doing" });
    const c = action({ deadline: "2026-10-24" });
    const d = action({ deadline: "2026-10-22", status: "Done", evidence: "x" });
    expect(dueSoonRows([c, b, a, d], TODAY).map((i) => i.code)).toEqual([a.code, b.code]);
  });
});

describe("search and duplicates", () => {
  const items = [
    action({ title: "Lập kế hoạch khắc phục nền nếp lớp 6A03", owner: "GVCN lớp 6A03", scopeClass: "6A03", priority: "High" }),
    action({ title: "Phát động đợt chấn chỉnh vệ sinh 5S", owner: "Cán bộ nền nếp", status: "Done", evidence: "Biên bản" }),
    action({ title: "Phát động đợt chấn chỉnh vệ sinh 5S", owner: "Cán bộ nền nếp", status: "Doing" }),
  ];

  it("searches accent-insensitively over code, title, owner and class", () => {
    expect(searchActions(items, { query: "khac phuc 6a03" })).toHaveLength(1);
    expect(searchActions(items, { query: "ve sinh" })).toHaveLength(2);
    expect(searchActions(items, { priority: "High" })).toHaveLength(1);
    expect(searchActions(items, { query: items[0].code })).toHaveLength(1);
    expect(searchActions(items, {})).toHaveLength(3);
  });

  it("findExistingAction prefers a not-done action with the same title", () => {
    expect(findExistingAction(items, "phát động đợt chấn chỉnh VỆ SINH 5S")?.status).toBe("Doing");
    expect(findExistingAction(items, "Không có")).toBeUndefined();
    expect(findExistingAction(items, "  ")).toBeUndefined();
  });
});
