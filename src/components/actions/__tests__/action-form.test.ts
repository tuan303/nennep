import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import { ActionCreateSchema, ActionUpdateSchema } from "@/lib/contract";
import { buildDecisionBrief } from "@/lib/engine";
import type { ActionItem } from "@/lib/types";
import {
  EVIDENCE_REQUIRED_MESSAGE,
  emptyActionForm,
  formFromAction,
  formFromRecommendation,
  hasErrors,
  isPatchEmpty,
  ownerSuggestions,
  statusChangePatch,
  statusSteps,
  toCreateInput,
  toUpdatePatch,
  validateActionForm,
} from "../lib/action-form";

const TODAY = FIXTURE_TODAY;
const ds = makeFixtureDataset();
const SLA = ds.config.actionSlaDays;

const item: ActionItem = {
  id: "THCS_HD-20261015-001",
  code: "HD-20261015-001",
  levelId: "THCS",
  title: "Nhắc nhở lớp 7A02",
  description: "Theo dõi sát",
  priority: "Medium",
  owner: "GVCN lớp 7A02",
  deadline: "2026-10-22",
  status: "Doing",
  scopeClass: "7A02",
  createdBy: "u1",
  createdByName: "Quản trị",
  createdAt: "2026-10-15T01:00:00.000Z",
  history: [],
};

describe("defaults and prefill", () => {
  it("empty form uses the SLA deadline of the priority", () => {
    expect(emptyActionForm(TODAY, SLA)).toMatchObject({ priority: "Medium", deadline: "2026-10-28", title: "", owner: "" });
    expect(emptyActionForm(TODAY, SLA, "High").deadline).toBe("2026-10-24");
  });

  it("prefills from a brief recommendation (deadline = today + deadlineDays, source week only in week mode)", () => {
    const week = { mode: "week" as const, key: "2026-10-19" };
    const brief = buildDecisionBrief(ds, week, TODAY);
    const rec = brief.recommendations.find((r) => r.scopeClass) ?? { ...brief.recommendations[0], scopeClass: "6A03" };
    const f = formFromRecommendation(rec, { today: TODAY, period: week, periodLabel: brief.periodLabel });
    expect(f.title).toBe(rec.title);
    expect(f.owner).toBe(rec.owner);
    expect(f.priority).toBe(rec.priority);
    expect(f.deadline).toBe(new Date(Date.parse(`${TODAY}T00:00:00Z`) + rec.deadlineDays * 86_400_000).toISOString().slice(0, 10));
    expect(f.scopeClass).toBe(rec.scopeClass);
    expect(f.sourceWeek).toBe("2026-10-19");
    expect(f.description).toContain(brief.periodLabel);
    const month = formFromRecommendation(rec, { today: TODAY, period: { mode: "month", key: "2026-10" }, periodLabel: "Tháng 10/2026" });
    expect(month.sourceWeek).toBeUndefined();
    // The prefilled form is valid and accepted by the server schema.
    expect(validateActionForm(f, { today: TODAY })).toEqual({});
    expect(ActionCreateSchema.safeParse(toCreateInput("THCS", f)).success).toBe(true);
  });
});

describe("validation", () => {
  it("mirrors the schema messages", () => {
    const e = validateActionForm({ ...emptyActionForm(TODAY, SLA), title: "ab", owner: "x", deadline: "" });
    expect(e.title).toMatch(/ít nhất 3 ký tự/);
    expect(e.owner).toBe("Nhập người chịu trách nhiệm");
    expect(e.deadline).toBe("Chọn hạn xử lý");
    expect(hasErrors(e)).toBe(true);
  });

  it("create mode rejects past deadlines, edit mode keeps them", () => {
    const f = { ...emptyActionForm(TODAY, SLA), title: "Kiểm tra 5S", owner: "BGH", deadline: "2026-10-01" };
    expect(validateActionForm(f, { today: TODAY }).deadline).toBe("Hạn xử lý không được trước hôm nay");
    expect(validateActionForm(f)).toEqual({});
  });
});

describe("payloads", () => {
  it("create input omits empty optionals", () => {
    const input = toCreateInput("THCS", { ...emptyActionForm(TODAY, SLA), title: "  Kiểm tra 5S  ", owner: " BGH " });
    expect(input).toEqual({ levelId: "THCS", title: "Kiểm tra 5S", priority: "Medium", owner: "BGH", deadline: "2026-10-28" });
  });

  it("update patch only carries changed fields and parses with the schema", () => {
    const form = formFromAction(item);
    expect(isPatchEmpty(toUpdatePatch(item, form))).toBe(true);
    const patch = toUpdatePatch(item, { ...form, owner: "Bùi Văn Long", description: "", evidence: "Biên bản họp lớp", note: "Đã họp" });
    expect(patch).toEqual({ owner: "Bùi Văn Long", description: "", evidence: "Biên bản họp lớp", note: "Đã họp" });
    expect(ActionUpdateSchema.safeParse(patch).success).toBe(true);
  });

  it("blocks Done without evidence (BR-ACT-01 / AC-014)", () => {
    const form = formFromAction(item);
    expect(statusChangePatch(item, form, "Done")).toEqual({ error: EVIDENCE_REQUIRED_MESSAGE });
    expect(statusChangePatch(item, { ...form, evidence: "   " }, "Done")).toEqual({ error: EVIDENCE_REQUIRED_MESSAGE });
    expect(statusChangePatch(item, { ...form, evidence: "Ảnh lớp sạch" }, "Done")).toEqual({ patch: { evidence: "Ảnh lớp sạch", status: "Done" } });
    expect(statusChangePatch({ ...item, status: "Open" }, form, "Doing")).toEqual({ patch: { status: "Doing" } });
  });

  it("workflow steps per status", () => {
    expect(statusSteps("Open").map((s) => s.to)).toEqual(["Doing", "Done"]);
    expect(statusSteps("Doing").map((s) => s.to)).toEqual(["Done"]);
    expect(statusSteps("Done")).toEqual([{ to: "Doing", label: "Mở lại", variant: "secondary" }]);
  });

  it("owner suggestions include the class GVCN first", () => {
    expect(ownerSuggestions(undefined, ds.classes).map((o) => o.value)).toEqual(["Cán bộ nền nếp", "BGH"]);
    const withClass = ownerSuggestions("6A03", ds.classes);
    expect(withClass[0]).toEqual({ value: "GVCN lớp 6A03", hint: "Lê Văn Hùng" });
  });
});
