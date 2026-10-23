/** "Công tác phối hợp tuần/tháng mới": pure helpers, the printed section 5 and the editor card (SSR, node environment). */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { hasPermission } from "@/lib/constants";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import type { LevelDataset, Period, ReportPlan, Role } from "@/lib/types";
import { buildPeriodReport, type Recipient } from "../lib/report-model";
import {
  PLAN_LIMITS,
  addPlanRow,
  draftFromPlan,
  emptyPlanRow,
  keepShownPlan,
  movePlanRow,
  nextPeriodLabel,
  nextReportPeriod,
  planContentOf,
  planDraftIssues,
  planDueExample,
  planItemsOf,
  planPeriodOf,
  planPutInput,
  planSavedLine,
  planTitle,
  removePlanRow,
  samePlanDraft,
  savedPlanContent,
  textLines,
  updatePlanRow,
  type PlanDraft,
  type ReportPlanContent,
} from "../lib/report-plan";
import { ReportDocument } from "../report-document";
import { ReportPlanEditor, ReportPlanLoadError } from "../report-plan-editor";
import type { ReportPlanState } from "../use-report-plan";

const WEEK: Period = { mode: "week", key: "2026-10-19" };
const noop = () => undefined;
const asyncNoop = async () => undefined;

const PLAN: ReportPlan = {
  id: "THCS_week_2026-10-19",
  levelId: "THCS",
  mode: "week",
  key: "2026-10-19",
  items: [
    { content: "Tổng vệ sinh lớp học\nKiểm tra lại cuối tuần", owner: "GVCN khối 6", due: "Thứ Hai 26/10" },
    { content: "Nhắc học sinh đeo thẻ" },
  ],
  note: "Các tổ khối báo cáo kết quả vào thứ Sáu.",
  rev: 3,
  updatedAt: "2026-10-23T07:05:00.000Z",
  updatedBy: "nguoilap@example.edu.vn",
  updatedByName: "Người Lập Thử",
};

describe("periods of the plan", () => {
  it("is about the week / month after the report period", () => {
    expect(nextReportPeriod({ mode: "week", key: "2026-10-19" })).toEqual({ mode: "week", key: "2026-10-26" });
    expect(nextPeriodLabel({ mode: "week", key: "2026-10-19" })).toBe("Tuần 26/10 – 01/11/2026");
    expect(nextReportPeriod({ mode: "month", key: "2026-10" })).toEqual({ mode: "month", key: "2026-11" });
    expect(nextPeriodLabel({ mode: "month", key: "2026-10" })).toBe("Tháng 11/2026");
  });

  it("crosses the year (and month lengths)", () => {
    expect(nextPeriodLabel({ mode: "week", key: "2026-12-21" })).toBe("Tuần 28/12 – 03/01/2027");
    expect(nextPeriodLabel({ mode: "week", key: "2026-12-28" })).toBe("Tuần 04/01 – 10/01/2027");
    expect(nextPeriodLabel({ mode: "month", key: "2026-12" })).toBe("Tháng 1/2027");
    expect(nextReportPeriod({ mode: "month", key: "2027-01" }).key).toBe("2027-02");
    expect(nextReportPeriod({ mode: "month", key: "2028-02" }).key).toBe("2028-03");
  });

  it("only week / month report periods have a plan", () => {
    expect(planPeriodOf(WEEK)).toEqual({ mode: "week", key: "2026-10-19" });
    expect(planPeriodOf({ mode: "month", key: "2026-10" })).toEqual({ mode: "month", key: "2026-10" });
    expect(planPeriodOf({ mode: "semester", key: "HK1" })).toBeUndefined();
    expect(planPeriodOf({ mode: "all" })).toBeUndefined();
    expect(planPeriodOf({ mode: "week" })).toBeUndefined();
    expect(planPeriodOf(undefined)).toBeUndefined();
  });

  it("titles, placeholder and the saved line", () => {
    expect(planTitle("week")).toBe("Công tác phối hợp tuần mới");
    expect(planTitle("month")).toBe("Công tác phối hợp tháng mới");
    expect(planDueExample({ mode: "week", key: "2026-10-19" })).toBe("VD: Thứ Hai 26/10");
    expect(planDueExample({ mode: "month", key: "2026-12" })).toBe("VD: Trước 15/01");
    expect(planSavedLine(PLAN)).toBe("Đã lưu lúc 23/10/2026 14:05 – Người Lập Thử");
    expect(planSavedLine({ ...PLAN, updatedByName: " " })).toBe("Đã lưu lúc 23/10/2026 14:05 – nguoilap@example.edu.vn");
    expect(planSavedLine(null)).toBeUndefined();
  });
});

describe("draft", () => {
  it("round-trips a stored plan; spaces and row keys are not a change", () => {
    const draft = draftFromPlan(PLAN);
    expect(draft.rows.map((r) => [r.content, r.owner, r.due])).toEqual([
      ["Tổng vệ sinh lớp học\nKiểm tra lại cuối tuần", "GVCN khối 6", "Thứ Hai 26/10"],
      ["Nhắc học sinh đeo thẻ", "", ""],
    ]);
    expect(planItemsOf(draft)).toEqual(PLAN.items);
    expect(samePlanDraft(draft, draftFromPlan(PLAN))).toBe(true);
    const spaced = updatePlanRow(draft, draft.rows[1].key, "owner", "  ");
    expect(samePlanDraft(spaced, draft)).toBe(true);
    expect(samePlanDraft(updatePlanRow(draft, draft.rows[1].key, "due", "Cả tuần"), draft)).toBe(false);
    expect(samePlanDraft({ ...draft, note: ` ${PLAN.note} ` }, draft)).toBe(true);
    expect(draftFromPlan(null)).toEqual({ rows: [], note: "" });
  });

  it("adds, removes and moves rows", () => {
    let draft: PlanDraft = draftFromPlan(PLAN);
    const [a, b] = draft.rows.map((r) => r.key);
    const extra = emptyPlanRow();
    draft = addPlanRow(draft, extra);
    expect(draft.rows.map((r) => r.key)).toEqual([a, b, extra.key]);
    expect(samePlanDraft(draft, draftFromPlan(PLAN))).toBe(false); // an empty row is a change…
    expect(planDraftIssues(draft)).toEqual({
      blankKeys: [extra.key],
      message: "Công việc 3 chưa có nội dung – nhập nội dung hoặc xóa công việc đó.",
    }); // …that cannot be saved yet
    expect(movePlanRow(draft, extra.key, -1).rows.map((r) => r.key)).toEqual([a, extra.key, b]);
    expect(movePlanRow(draft, a, -1)).toBe(draft);
    expect(movePlanRow(draft, extra.key, 1)).toBe(draft);
    expect(removePlanRow(draft, extra.key).rows.map((r) => r.key)).toEqual([a, b]);
    expect(planDraftIssues(removePlanRow(draft, extra.key))).toEqual({ blankKeys: [] });

    let full: PlanDraft = { rows: [], note: "" };
    for (let i = 0; i < PLAN_LIMITS.items + 2; i++) full = addPlanRow(full);
    expect(full.rows).toHaveLength(PLAN_LIMITS.items);
  });

  it("a background reload keeps unsaved edits and never reverts to an older rev", () => {
    const shown = { saved: PLAN, draft: draftFromPlan(PLAN) };
    expect(keepShownPlan(shown, { rev: 4 })).toBe(false); // someone saved since: show it
    expect(keepShownPlan(shown, { rev: 3 })).toBe(false);
    expect(keepShownPlan(shown, { rev: 2 })).toBe(true); // GET answered before our own save landed
    expect(keepShownPlan({ ...shown, draft: { ...shown.draft, note: "Đang sửa" } }, { rev: 4 })).toBe(true);
    expect(keepShownPlan({ saved: null, draft: draftFromPlan(null) }, { rev: 1 })).toBe(false);
    expect(keepShownPlan({ saved: null, draft: draftFromPlan(null) }, null)).toBe(false);
  });

  it("builds the PUT body (trimmed, empty fields left out, baseRev, cleared note)", () => {
    const draft = draftFromPlan(PLAN);
    const edited = updatePlanRow({ ...draft, note: "  " }, draft.rows[0].key, "content", "  Tổng vệ sinh  ");
    expect(planPutInput("THCS", { mode: "week", key: "2026-10-19" }, edited, 3)).toEqual({
      levelId: "THCS",
      mode: "week",
      key: "2026-10-19",
      items: [{ content: "Tổng vệ sinh", owner: "GVCN khối 6", due: "Thứ Hai 26/10" }, { content: "Nhắc học sinh đeo thẻ" }],
      note: "",
      baseRev: 3,
    });
  });

  it("prints rows with content only, the note when not blank", () => {
    const draft = addPlanRow({ ...draftFromPlan(PLAN), note: "   " });
    expect(planContentOf(draft)).toEqual({ items: PLAN.items });
    expect(savedPlanContent(PLAN)).toEqual({ items: PLAN.items, note: PLAN.note });
    expect(savedPlanContent(null)).toEqual({ items: [] });
    expect(textLines("a\r\nb\nc")).toEqual(["a", "b", "c"]);
  });

  it("only ADMIN and EDITOR may edit (VIEWER and GVCN read the printed section)", () => {
    const can = (role: Role) => hasPermission({ role, active: true, levels: [] }, "report.plan");
    expect(can("ADMIN")).toBe(true);
    expect(can("EDITOR")).toBe(true);
    expect(can("VIEWER")).toBe(false);
    expect(can("GVCN")).toBe(false);
    expect(hasPermission({ role: "EDITOR", active: false, levels: [] }, "report.plan")).toBe(false);
  });
});

/* -------------------------------- Document -------------------------------- */

function doc(plan: ReportPlanContent | "loading" | "error" | undefined, opts: { period?: Period; detail?: boolean; recipient?: Recipient; ds?: LevelDataset } = {}) {
  const ds = opts.ds ?? makeFixtureDataset();
  const report = buildPeriodReport(ds, { period: opts.period ?? WEEK, recipient: opts.recipient ?? { kind: "bgh" } }, FIXTURE_TODAY);
  return renderToStaticMarkup(
    createElement(ReportDocument, { report, detail: opts.detail ?? false, topRatio: ds.config.top90Ratio, today: FIXTURE_TODAY, plan }),
  );
}

/** Section headings in document order: "5. Công tác phối hợp tuần mới". */
function headings(html: string): string[] {
  return [...html.matchAll(/<h2[^>]*><span class="num">(\d+)\.<\/span>([^<]+)<\/h2>/g)].map((m) => `${m[1]}. ${m[2]}`);
}

describe("section 5 in the document", () => {
  it("prints the tasks of the next week after Cảnh báo sớm", () => {
    const html = doc(savedPlanContent(PLAN));
    expect(headings(html)).toEqual(["1. Chỉ số chính", "2. Xếp hạng thi đua", "3. Vấn đề nổi bật", "4. Cảnh báo sớm", "5. Công tác phối hợp tuần mới"]);
    expect(html).toContain('<p class="text-xs text-slate-500">Tuần 26/10 – 01/11/2026</p>');
    for (const h of ["STT", "Nội dung công việc", "Phụ trách / phối hợp", "Thời hạn"]) {
      expect(html).toMatch(new RegExp(`<th class="[^"]*whitespace-nowrap[^"]*">${h}</th>`));
    }
    expect(html).toContain("Tổng vệ sinh lớp học<br/>Kiểm tra lại cuối tuần");
    expect(html).toContain(">GVCN khối 6</td>");
    expect(html).toContain(">Thứ Hai 26/10</td>");
    expect(html).toMatch(/>Nhắc học sinh đeo thẻ<\/td><td class="[^"]*">–<\/td><td class="[^"]*">–<\/td>/);
    expect(html).toContain("print:min-w-0");
    // A long link typed in a cell or the note wraps instead of pushing the table off the A4 page.
    expect(html).toMatch(/<td class="[^"]*\[overflow-wrap:anywhere\][^"]*">Tổng vệ sinh lớp học<br\/>/);
    expect(html).toMatch(/<p class="[^"]*\[overflow-wrap:anywhere\][^"]*"><span class="font-semibold">Ghi chú:<\/span>/);
    expect(html).toContain('<span class="font-semibold">Ghi chú:</span> Các tổ khối báo cáo kết quả vào thứ Sáu.');
    expect(html).not.toContain("Chưa cập nhật công tác phối hợp.");
  });

  it("empty, loading and error states", () => {
    for (const empty of [undefined, { items: [] }, savedPlanContent(null)]) {
      const html = doc(empty);
      expect(headings(html)).toContain("5. Công tác phối hợp tuần mới");
      expect(html).toContain("Chưa cập nhật công tác phối hợp.");
      expect(html).not.toContain(">Nội dung công việc</th>");
    }
    expect(doc({ items: [], note: "Chỉ có ghi chú." })).toContain("Chỉ có ghi chú.");
    expect(doc("loading")).toContain("Đang tải công tác phối hợp…");
    expect(doc("error")).toContain("Chưa tải được công tác phối hợp.");
  });

  it("month report: 'tháng mới' and the next month", () => {
    const html = doc(savedPlanContent(PLAN), { period: { mode: "month", key: "2026-10" } });
    expect(headings(html)).toContain("5. Công tác phối hợp tháng mới");
    expect(html).toContain('<p class="text-xs text-slate-500">Tháng 11/2026</p>');
  });

  it("the detail register becomes section 6 (GVCN report too)", () => {
    const html = doc(savedPlanContent(PLAN), { detail: true, recipient: { kind: "class", classCode: "6A03" } });
    expect(headings(html).slice(4)).toEqual(["5. Công tác phối hợp tuần mới", "6. Chi tiết sự việc"]);
    expect(html.indexOf("Công tác phối hợp tuần mới")).toBeLessThan(html.indexOf("Chi tiết sự việc"));
  });
});

/* --------------------------------- Editor --------------------------------- */

function editorState(patch: Partial<ReportPlanState> = {}): ReportPlanState {
  const draft = draftFromPlan(PLAN);
  return {
    period: { mode: "week", key: "2026-10-19" },
    status: "ready",
    saved: PLAN,
    draft,
    setDraft: noop,
    dirty: false,
    issues: planDraftIssues(draft),
    saving: false,
    reloading: false,
    save: asyncNoop,
    undo: noop,
    reload: asyncNoop,
    printed: planContentOf(draft),
    ...patch,
  };
}

const editor = (patch?: Partial<ReportPlanState>) => renderToStaticMarkup(createElement(ReportPlanEditor, { plan: editorState(patch) }));

/** Opening tag of the button whose label is `label`. */
function buttonTag(html: string, label: string): string | undefined {
  return html.split("<button").find((part) => part.includes(`${label}</span></button>`))?.split(">")[0];
}

describe("ReportPlanEditor", () => {
  it("renders the rows, the next period and the saved line; nothing to save", () => {
    const html = editor();
    expect(html).toContain("data-print-hide");
    expect(html).toContain("Công tác phối hợp tuần mới");
    expect(html).toContain("Tuần 26/10 – 01/11/2026 · in ở mục 5 của báo cáo");
    for (const text of ["Công việc 1", "Công việc 2", "Nội dung công việc", "Phụ trách / phối hợp", "Thời hạn", "Thêm công việc", "Ghi chú", "Hoàn tác"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("Đã lưu lúc 23/10/2026 14:05 – Người Lập Thử");
    expect(html).toContain('placeholder="VD: Thứ Hai 26/10"');
    expect(html).toContain('aria-label="Đưa công việc 1 lên trên"');
    expect(html).toContain('aria-label="Xóa công việc 2"');
    expect(html).not.toContain("Chưa lưu<");
    expect(buttonTag(html, "Lưu")).toContain(` disabled=""`);
    expect(buttonTag(html, "Hoàn tác")).toContain(` disabled=""`);
  });

  it("dirty: 'Chưa lưu' badge, Lưu enabled – unless a row has no content", () => {
    const dirty = editor({ dirty: true });
    expect(dirty).toContain("Chưa lưu<");
    expect(buttonTag(dirty, "Lưu")).not.toContain(` disabled=""`);
    expect(buttonTag(dirty, "Hoàn tác")).not.toContain(` disabled=""`);

    const draft = addPlanRow(draftFromPlan(PLAN));
    const blank = editor({ dirty: true, draft, issues: planDraftIssues(draft) });
    expect(blank).toContain("Công việc 3 chưa có nội dung");
    expect(buttonTag(blank, "Lưu")).toContain(` disabled=""`);
  });

  it("409: explains and offers a reload; save stays off", () => {
    const html = editor({ dirty: true, conflict: "Công tác phối hợp của kỳ báo cáo này vừa được người khác cập nhật." });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Đã có người khác lưu công tác phối hợp của kỳ này");
    expect(html).toContain("Tải lại bản mới nhất");
    expect(buttonTag(html, "Lưu")).toContain(` disabled=""`);
  });

  it("new plan, month, loading and load error", () => {
    const empty = editor({ period: { mode: "month", key: "2026-12" }, saved: null, draft: draftFromPlan(null), issues: { blankKeys: [] } });
    expect(empty).toContain("Công tác phối hợp tháng mới");
    expect(empty).toContain("Tháng 1/2027 · in ở mục 5 của báo cáo");
    expect(empty).toContain("Chưa có công việc nào");
    expect(empty).toContain("Chưa lưu công tác phối hợp cho kỳ báo cáo này.");

    const loading = editor({ status: "loading" });
    expect(loading).toContain("Đang tải công tác phối hợp");
    expect(loading).not.toContain("Thêm công việc");

    const failed = editor({ status: "error", error: "Không kết nối được máy chủ. Vui lòng thử lại." });
    expect(failed).toContain("Chưa tải được công tác phối hợp");
    expect(failed).toContain("Thử lại");
    expect(failed).not.toContain("Thêm công việc");

    expect(editor({ period: undefined, status: "idle" })).toBe("");
  });

  it("viewers without the editor only see a load error (never the inputs)", () => {
    const html = renderToStaticMarkup(createElement(ReportPlanLoadError, { plan: editorState({ status: "error", error: "Lỗi thử" }) }));
    expect(html).toContain("Chưa tải được công tác phối hợp tuần mới");
    expect(html).toContain("Lỗi thử");
    expect(html).not.toContain("Nội dung công việc");
    expect(renderToStaticMarkup(createElement(ReportPlanLoadError, { plan: editorState() }))).toBe("");
  });
});
