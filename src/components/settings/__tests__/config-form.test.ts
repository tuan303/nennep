import { describe, expect, it } from "vitest";
import { ConfigUpdateSchema } from "@/lib/contract";
import { makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import {
  calendarChanged,
  changedConfigGroups,
  configFieldOfPath,
  configPatch,
  configServerErrors,
  draftFromConfig,
  payloadFromDraft,
  semesterWeekCount,
  validateConfigDraft,
  withRagThresholds,
} from "../lib/config-form";

const base = () => draftFromConfig(makeFixtureDataset().config);

describe("draftFromConfig / payloadFromDraft", () => {
  it("round-trips the fixture config and passes the contract schema", () => {
    const ds = makeFixtureDataset();
    const d = draftFromConfig(ds.config);
    expect(d.minConfidencePct).toBe(80);
    expect(d.top90Pct).toBe(90);
    expect(d.ragApproved).toBe(true);
    const payload = payloadFromDraft(d);
    expect(payload.rag).toEqual(ds.config.rag);
    expect(payload.top90Ratio).toBe(0.9);
    expect(payload.studentAlert).toEqual(ds.config.studentAlert);
    expect(payload.actionSlaDays).toEqual(ds.config.actionSlaDays);
    expect(ConfigUpdateSchema.safeParse(payload).success).toBe(true);
  });

  it("keeps reward statuses in canonical order", () => {
    const ds = makeFixtureDataset();
    ds.config.rewardCountedStatuses = ["Đã xác nhận", "Mới ghi nhận"];
    expect(draftFromConfig(ds.config).rewardCountedStatuses).toEqual(["Mới ghi nhận", "Đã xác nhận"]);
  });
});

describe("validateConfigDraft", () => {
  it("accepts the fixture config", () => {
    expect(validateConfigDraft(base())).toEqual({});
  });

  it("flags school year, non-Monday first week and red ≤ yellow", () => {
    const e = validateConfigDraft({ ...base(), schoolYear: "2026-2028", firstWeek: "2026-08-19", ragYellow: 20, ragRed: 20 });
    expect(e.schoolYear).toMatch(/2026-2027/);
    expect(e.firstWeek).toBe("Tuần đầu phải bắt đầu vào Thứ Hai (gợi ý: 17/08/2026).");
    expect(e.ragRed).toBe("Ngưỡng Đỏ phải lớn hơn ngưỡng Vàng.");
  });

  it("checks semester order and overlap", () => {
    const d = base();
    d.semesters = [
      { ...d.semesters[0], end: "2027-01-10" },
      { ...d.semesters[1], start: "2027-01-05" },
    ];
    const e = validateConfigDraft(d);
    expect(e["semesters.1.start"]).toMatch(/phải bắt đầu sau ngày 10\/01\/2027/);
    const d2 = base();
    d2.semesters = [{ ...d2.semesters[0], start: "2026-12-31", end: "2026-08-17" }, d2.semesters[1]];
    expect(validateConfigDraft(d2)["semesters.0.end"]).toBe("Ngày kết thúc phải sau ngày bắt đầu.");
  });

  it("checks ranges of percentages, alerts and SLA", () => {
    const e = validateConfigDraft({ ...base(), top90Pct: 40, minConfidencePct: 120, alertRepeatMin: 1, slaHigh: 0, alertPerWeek: 2.5 });
    expect(Object.keys(e).sort()).toEqual(["alertPerWeek", "alertRepeatMin", "minConfidencePct", "slaHigh", "top90Pct"]);
  });

  it("rejects a first week after the last semester", () => {
    expect(validateConfigDraft({ ...base(), firstWeek: "2027-06-07" }).firstWeek).toMatch(/sau ngày kết thúc/);
  });
});

describe("configPatch", () => {
  it("is empty when nothing changed and sends whole groups otherwise", () => {
    const b = base();
    expect(configPatch(b, b)).toEqual({});
    const d = { ...b, ragYellow: 12, slaLow: 21 };
    const patch = configPatch(d, b);
    expect(Object.keys(patch).sort()).toEqual(["actionSlaDays", "rag"]);
    expect(patch.rag).toEqual({ yellow: 12, red: 25, approved: true, minConfidence: 0.8 });
    expect(patch.actionSlaDays).toEqual({ High: 3, Medium: 7, Low: 21 });
    expect(changedConfigGroups(d, b)).toEqual(["rag", "actionSlaDays"]);
  });

  it("detects calendar changes", () => {
    const b = base();
    expect(calendarChanged(b, b)).toBe(false);
    expect(calendarChanged({ ...b, semesters: [{ ...b.semesters[0], end: "2026-12-30" }, b.semesters[1]] }, b)).toBe(true);
  });
});

describe("withRagThresholds", () => {
  it("withdraws the approval when a threshold changes", () => {
    const r = withRagThresholds(base(), { ragYellow: 12 });
    expect(r.unapproved).toBe(true);
    expect(r.draft.ragApproved).toBe(false);
    expect(r.draft.ragYellow).toBe(12);
  });

  it("keeps the approval when values are unchanged or not approved", () => {
    expect(withRagThresholds(base(), { ragYellow: 10 }).unapproved).toBe(false);
    const r = withRagThresholds({ ...base(), ragApproved: false }, { ragRed: 30 });
    expect(r.unapproved).toBe(false);
    expect(r.draft.ragRed).toBe(30);
  });
});

describe("paths and helpers", () => {
  it("maps contract paths to draft fields", () => {
    expect(configFieldOfPath("rag")).toBe("ragRed");
    expect(configFieldOfPath("rag.minConfidence")).toBe("minConfidencePct");
    expect(configFieldOfPath("semesters.1.start")).toBe("semesters.1.start");
    expect(configFieldOfPath("semesters")).toBe("semesters");
    expect(configFieldOfPath("top90Ratio")).toBe("top90Pct");
    expect(configFieldOfPath("")).toBeUndefined();
  });

  it("splits server issues into field and general errors", () => {
    const r = configServerErrors([
      { path: "", message: "Tuần đầu tiên phải là ngày Thứ Hai." },
      { path: "top90Ratio", message: "Sai" },
    ]);
    expect(r.fields).toEqual({ top90Pct: "Sai" });
    expect(r.general).toEqual(["Tuần đầu tiên phải là ngày Thứ Hai."]);
  });

  it("counts the weeks of a semester", () => {
    expect(semesterWeekCount({ start: "2026-08-17", end: "2026-08-23" })).toBe(1);
    expect(semesterWeekCount({ start: "2026-08-18", end: "2026-08-31" })).toBe(2);
    expect(semesterWeekCount({ start: "2026-08-17", end: "2026-12-31" })).toBe(20);
    expect(semesterWeekCount({ start: "2026-12-31", end: "2026-08-17" })).toBeUndefined();
  });
});
