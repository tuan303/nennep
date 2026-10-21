/** REQ_V2 §7.7: "Cảnh báo sớm" settings – draft, validation, payload, server errors, preview; role descriptions; tabs. */
import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY } from "@/lib/engine/__fixtures__/dataset";
import { makeV2FixtureDataset } from "@/lib/engine/__fixtures__/dataset-v2";
import { EarlyWarningPutSchema } from "@/lib/contract";
import { DEFAULT_EARLY_WARNING, earlyWarnings } from "@/lib/engine";
import {
  changedEarlyWarningFields,
  earlyWarningDraft,
  earlyWarningFieldOfPath,
  earlyWarningPayload,
  earlyWarningPreview,
  earlyWarningServerErrors,
  seriousGroupChoices,
  toggleSeriousGroup,
  validateEarlyWarningDraft,
} from "../lib/early-warning-form";
import { resolveTab, SETTINGS_TABS, visibleTabs } from "../lib/tabs";
import { ROLE_DESCRIPTIONS } from "../lib/users";

const ds = makeV2FixtureDataset();
const today = FIXTURE_TODAY;

describe("early-warning draft", () => {
  it("starts from the engine defaults when the level has no thresholds, else from the stored ones", () => {
    expect(earlyWarningDraft(ds.config)).toEqual(DEFAULT_EARLY_WARNING);
    const stored = { ...DEFAULT_EARLY_WARNING, risingPct: 80, seriousGroups: ["Nhóm 4"] };
    expect(earlyWarningDraft({ earlyWarning: stored })).toEqual(stored);
    // A fresh object every time (safe to edit).
    expect(earlyWarningDraft(ds.config)).not.toBe(earlyWarningDraft(ds.config));
  });

  it("validates like EarlyWarningPutSchema (Vietnamese messages)", () => {
    expect(validateEarlyWarningDraft(DEFAULT_EARLY_WARNING)).toEqual({});
    const bad = validateEarlyWarningDraft({ ...DEFAULT_EARLY_WARNING, risingPct: 5, risingBaselineWeeks: 13, prolongedWeeks: 1, seriousMinPenalty: -1, risingMinPoints: 2000 });
    expect(Object.keys(bad).sort()).toEqual(["prolongedWeeks", "risingBaselineWeeks", "risingMinPoints", "risingPct", "seriousMinPenalty"]);
    expect(bad.risingPct).toBe("Số nguyên từ 10 đến 500 (%).");
    expect(bad.prolongedWeeks).toBe("Số nguyên từ 2 đến 12 tuần.");
    expect(validateEarlyWarningDraft({ ...DEFAULT_EARLY_WARNING, risingPct: 12.5 }).risingPct).toBeDefined();
    const many = Array.from({ length: 11 }, (_, k) => `Nhóm ${k + 1}`);
    expect(validateEarlyWarningDraft({ ...DEFAULT_EARLY_WARNING, seriousGroups: many }).seriousGroups).toBe("Chọn tối đa 10 nhóm lỗi.");
    expect(validateEarlyWarningDraft({ ...DEFAULT_EARLY_WARNING, seriousGroups: [] })).toEqual({});
  });

  it("builds a contract-valid payload (groups trimmed, unique, natural order)", () => {
    const payload = earlyWarningPayload({ ...DEFAULT_EARLY_WARNING, seriousGroups: [" Nhóm 10", "Nhóm 3", "Nhóm 3 ", ""] });
    expect(payload.seriousGroups).toEqual(["Nhóm 3", "Nhóm 10"]);
    expect(EarlyWarningPutSchema.safeParse(payload).success).toBe(true);
  });

  it("offers the catalog groups plus configured groups missing from it", () => {
    const choices = seriousGroupChoices(ds.catalog, ["Nhóm 3", "Nhóm cũ"]);
    expect(choices.filter((c) => c.inCatalog).map((c) => c.group)).toEqual(expect.arrayContaining(["Nhóm 3"]));
    expect(choices.find((c) => c.group === "Nhóm cũ")).toEqual({ group: "Nhóm cũ", inCatalog: false });
    expect(new Set(choices.map((c) => c.group)).size).toBe(choices.length);
    expect(toggleSeriousGroup(["Nhóm 4"], "Nhóm 3", true)).toEqual(["Nhóm 3", "Nhóm 4"]);
    expect(toggleSeriousGroup(["Nhóm 3", "Nhóm 4"], "Nhóm 3", false)).toEqual(["Nhóm 4"]);
  });

  it("summarises the changed fields and maps server issues to fields", () => {
    expect(changedEarlyWarningFields(DEFAULT_EARLY_WARNING, DEFAULT_EARLY_WARNING)).toEqual([]);
    expect(changedEarlyWarningFields({ ...DEFAULT_EARLY_WARNING, prolongedWeeks: 4, seriousGroups: ["Nhóm 4", "Nhóm 3"] }, DEFAULT_EARLY_WARNING)).toEqual(["Lỗi kéo dài"]);
    expect(earlyWarningFieldOfPath("seriousGroups.2")).toBe("seriousGroups");
    expect(earlyWarningFieldOfPath("levelId")).toBeUndefined();
    expect(earlyWarningServerErrors([{ path: "risingPct", message: "Sai" }, { path: "", message: "Không có quyền" }])).toEqual({ fields: { risingPct: "Sai" }, general: ["Không có quyền"] });
  });
});

describe("live preview", () => {
  it("counts the warnings of the current week with the draft vs the saved thresholds", () => {
    const p = earlyWarningPreview(ds, DEFAULT_EARLY_WARNING, today);
    expect(p.week).toBe("2026-10-19");
    expect(p.total).toBe(earlyWarnings(ds, { period: { mode: "week", key: "2026-10-19" } }, today).length);
    expect(p.savedTotal).toBe(p.total);
    expect(Object.values(p.counts).reduce((a, b) => a + b, 0)).toBe(p.total);
    // No serious groups and no penalty rule: no SERIOUS_INCIDENT.
    const none = earlyWarningPreview(ds, { ...DEFAULT_EARLY_WARNING, seriousGroups: [], seriousMinPenalty: 0 }, today);
    expect(none.counts.SERIOUS_INCIDENT).toBe(0);
    expect(p.counts.SERIOUS_INCIDENT).toBeGreaterThan(0);
    // An invalid value being typed never breaks the preview (engine resolver falls back).
    expect(() => earlyWarningPreview(ds, { ...DEFAULT_EARLY_WARNING, prolongedWeeks: Number.NaN }, today)).not.toThrow();
  });
});

describe("tabs and roles", () => {
  it("has the 'Cảnh báo sớm' tab (settings.manage, per level, ?tab=canh-bao)", () => {
    const tab = SETTINGS_TABS.find((t) => t.id === "canh-bao");
    expect(tab).toMatchObject({ label: "Cảnh báo sớm", permission: "settings.manage", perLevel: true });
    const all = visibleTabs(() => true);
    expect(resolveTab("canh-bao", all)).toBe("canh-bao");
    expect(resolveTab("early-warning", all)).toBe("canh-bao");
    expect(resolveTab("canh-bao", visibleTabs((p) => p === "users.manage"))).toBe("nguoi-dung");
  });

  it("describes the v2 rights of GVCN and EDITOR", () => {
    expect(ROLE_DESCRIPTIONS.GVCN).toContain("đề xuất điểm thưởng");
    expect(ROLE_DESCRIPTIONS.GVCN).toContain("biện pháp khắc phục");
    expect(ROLE_DESCRIPTIONS.EDITOR).toContain("đợt kiểm tra");
    expect(ROLE_DESCRIPTIONS.EDITOR).toContain("biện pháp khắc phục");
  });
});
