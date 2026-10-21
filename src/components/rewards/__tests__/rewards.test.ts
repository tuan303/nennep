import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY, makeFixtureDataset } from "@/lib/engine/__fixtures__/dataset";
import type { GlobalFilters, Reward, UserProfile } from "@/lib/types";
import {
  REWARD_MSG,
  applyReasonSuggestion,
  newRewardForm,
  rewardFormFromReward,
  rewardStatusOptions,
  toRewardCreateInput,
  toRewardUpdateInput,
  validateRewardForm,
} from "../lib/reward-form";
import { canDeleteReward, canEditReward, countedStatusesText, quickStatusActions, rewardRows, rewardSummary } from "../lib/reward-list";

const HOUR = 3_600_000;
const ds = makeFixtureDataset();
const today = FIXTURE_TODAY;

function profile(role: UserProfile["role"], uid = "uid-editor-thcs"): UserProfile {
  return { uid, email: `${uid}@nshm.edu.vn`, displayName: "Nguyễn Văn Quang", role, levels: [], gvcnClasses: [], active: true, createdAt: "2026-08-01T00:00:00.000Z" };
}

const editor = profile("EDITOR");
const admin = profile("ADMIN", "uid-admin");

describe("reward form", () => {
  const valid = { ...newRewardForm({ today, reporter: "Cô Lan" }), classCode: "6A01", reason: "Lớp sạch đẹp tiêu biểu" };

  it("starts with sensible defaults", () => {
    expect(newRewardForm({ today })).toMatchObject({ date: today, classCode: "", points: 5, status: "Mới ghi nhận", photoIds: [], links: [] });
  });

  it("accepts a complete form and mirrors the server checks", () => {
    expect(validateRewardForm(valid, ds, today, { canVerify: false })).toEqual([]);
    expect(validateRewardForm({ ...valid, date: "2026-10-22" }, ds, today, { canVerify: false })).toEqual([REWARD_MSG.futureDate]);
    expect(validateRewardForm({ ...valid, classCode: "" }, ds, today, { canVerify: false })).toEqual([REWARD_MSG.noClass]);
    expect(validateRewardForm({ ...valid, classCode: "7A04" }, ds, today, { canVerify: false })).toEqual(["Lớp 7A04 đã ngừng hoạt động."]);
    expect(validateRewardForm({ ...valid, reason: " ab " }, ds, today, { canVerify: false })).toEqual([REWARD_MSG.reason]);
    expect(validateRewardForm({ ...valid, points: 0 }, ds, today, { canVerify: false })).toEqual([REWARD_MSG.points]);
    expect(validateRewardForm({ ...valid, points: 101 }, ds, today, { canVerify: false })).toEqual([REWARD_MSG.points]);
    expect(validateRewardForm({ ...valid, links: ["ftp://x"] }, ds, today, { canVerify: false })).toHaveLength(1);
  });

  it("RULES-1: a date outside the school-week calendar is refused (unless unchanged on edit)", () => {
    const before = "2025-05-12"; // a Monday of the previous school year – not a calendar week
    expect(ds.weeks.some((w) => w.weekStart === before)).toBe(false);
    expect(validateRewardForm({ ...valid, date: before }, ds, today, { canVerify: false })).toEqual([
      "Ngày 12/05/2025 không thuộc lịch tuần của năm học (Cài đặt → Lịch tuần).",
    ]);
    const original = { classCode: valid.classCode, status: valid.status, date: before };
    expect(validateRewardForm({ ...valid, date: before }, ds, today, { canVerify: false, original })).toEqual([]);
  });

  it("only verifiers may set or leave 'Đã xác nhận'", () => {
    const verified = { ...valid, status: "Đã xác nhận" as const };
    expect(validateRewardForm(verified, ds, today, { canVerify: false })).toEqual([REWARD_MSG.verifyOnly]);
    expect(validateRewardForm(verified, ds, today, { canVerify: true })).toEqual([]);
    expect(rewardStatusOptions(false)).toEqual(["Mới ghi nhận", "Đang xác minh"]);
    expect(rewardStatusOptions(true)).toEqual(["Mới ghi nhận", "Đang xác minh", "Đã xác nhận"]);
  });

  it("does not block editing a reward whose (unchanged) class was deactivated since", () => {
    const original = { classCode: "7A04", status: "Mới ghi nhận" as const };
    expect(validateRewardForm({ ...valid, classCode: "7A04" }, ds, today, { canVerify: false, original })).toEqual([]);
  });

  it("applies reason suggestions without duplicating them", () => {
    expect(applyReasonSuggestion("", "Đạt giải phong trào")).toBe("Đạt giải phong trào");
    expect(applyReasonSuggestion("Hội khỏe Phù Đổng", "Đạt giải phong trào")).toBe("Đạt giải phong trào – Hội khỏe Phù Đổng");
    expect(applyReasonSuggestion("Đạt giải phong trào – X", "Đạt giải phong trào")).toBe("Đạt giải phong trào – X");
  });

  it("builds trimmed create/update payloads", () => {
    const form = { ...valid, reason: "  Lớp sạch đẹp tiêu biểu ", reporter: " ", note: " Tuần 7 ", links: ["https://a.vn", ""] };
    expect(toRewardCreateInput("THCS", form)).toEqual({
      levelId: "THCS",
      date: today,
      classCode: "6A01",
      points: 5,
      reason: "Lớp sạch đẹp tiêu biểu",
      evidenceUrls: ["https://a.vn"],
      photoIds: [],
      status: "Mới ghi nhận",
      note: "Tuần 7",
    });
    const reward = ds.rewards[0];
    const patch = toRewardUpdateInput({ ...rewardFormFromReward(reward), note: "" }, { ...reward, rev: 2 });
    expect(patch).toMatchObject({ classCode: reward.classCode, points: reward.points, note: "", baseRev: 2 });
    expect(patch).not.toHaveProperty("levelId");
    expect(patch).not.toHaveProperty("status");
    const other = reward.status === "Đang xác minh" ? "Mới ghi nhận" : "Đang xác minh";
    expect(toRewardUpdateInput({ ...rewardFormFromReward(reward), status: other }, reward)).toMatchObject({ status: other, baseRev: reward.rev ?? 0 });
  });
});

describe("reward list", () => {
  const all: GlobalFilters = { period: { mode: "all" } };

  it("lists filtered rewards newest first with the counted flag", () => {
    const rows = rewardRows(ds, all);
    expect(rows).toHaveLength(ds.rewards.length);
    expect(rows[0].reward.date).toBe("2026-10-20");
    for (const r of rows) expect(r.counted).toBe(r.reward.status === "Đã xác nhận");
    const october = rewardRows(ds, { period: { mode: "month", key: "2026-10" }, grade: 6 });
    expect(october.every((r) => r.reward.date >= "2026-10-01" && r.reward.grade === 6)).toBe(true);
    expect(rewardRows(ds, { ...all, classCode: "6A01" }).map((r) => r.reward.classCode)).toEqual(["6A01", "6A01"]);
  });

  it("summarises verified points and pending rewards", () => {
    const s = rewardSummary(rewardRows(ds, all));
    expect(s).toEqual({ total: 8, verifiedPoints: 30, verifiedCount: 4, pendingCount: 4, countedPoints: 30 });
    const custom = { ...ds, config: { ...ds.config, rewardCountedStatuses: ["Đang xác minh" as const, "Đã xác nhận" as const] } };
    expect(rewardSummary(rewardRows(custom, all)).countedPoints).toBe(40);
  });

  it("phrases the counted statuses", () => {
    expect(countedStatusesText({ rewardCountedStatuses: ["Đã xác nhận"] })).toBe("“Đã xác nhận”");
    expect(countedStatusesText({ rewardCountedStatuses: ["Mới ghi nhận", "Đang xác minh", "Đã xác nhận"] })).toBe("“Mới ghi nhận”, “Đang xác minh” hoặc “Đã xác nhận”");
  });

  it("applies the edit / delete / verify permissions", () => {
    const base: Reward = { ...ds.rewards[0], status: "Mới ghi nhận", createdAt: "2026-10-21T01:00:00.000Z" };
    const now = Date.parse(base.createdAt) + 2 * HOUR;
    expect(canEditReward(editor, base, now)).toBe(true);
    expect(canEditReward(editor, base, now + 23 * HOUR)).toBe(false);
    expect(canEditReward(editor, { ...base, status: "Đã xác nhận" }, now)).toBe(false); // verified rewards are locked
    expect(canEditReward(admin, { ...base, status: "Đã xác nhận" }, now + 900 * HOUR)).toBe(true);
    expect(canEditReward(profile("EDITOR", "uid-other"), base, now)).toBe(false);

    expect(canDeleteReward(editor, base)).toBe(false);
    expect(canDeleteReward(admin, base)).toBe(true);
    expect(canDeleteReward(admin, { deletedAt: "x" })).toBe(false);

    expect(quickStatusActions(editor, base)).toEqual([]);
    expect(quickStatusActions(admin, base).map((a) => a.to)).toEqual(["Đang xác minh", "Đã xác nhận"]);
    expect(quickStatusActions(admin, { ...base, status: "Đang xác minh" }).map((a) => a.label)).toEqual(["Xác nhận"]);
    expect(quickStatusActions(admin, { ...base, status: "Đã xác nhận" })).toEqual([]);
  });
});

describe("counted-status hints (UX-12)", () => {
  it("follow config.rewardCountedStatuses", async () => {
    const { countedRewardHint, countedRewardTerm, uncountedRewardNote } = await import("../lib/reward-list");
    const def = { rewardCountedStatuses: ["Đã xác nhận" as const] };
    const two = { rewardCountedStatuses: ["Đang xác minh" as const, "Đã xác nhận" as const] };
    const none = { rewardCountedStatuses: [] };
    expect(countedRewardHint(def)).toBe("Chỉ tính điểm thưởng ở trạng thái “Đã xác nhận”.");
    expect(countedRewardHint(two)).toBe("Chỉ tính điểm thưởng ở trạng thái “Đang xác minh” hoặc “Đã xác nhận”.");
    expect(countedRewardTerm(two)).toBe("Điểm thưởng (trạng thái “Đang xác minh” hoặc “Đã xác nhận”)");
    expect(uncountedRewardNote(def)).toContain("chỉ tính trạng thái “Đã xác nhận”");
    for (const f of [countedRewardHint, uncountedRewardNote]) expect(f(none)).toContain("chưa có trạng thái điểm thưởng nào");
    expect(countedRewardTerm(none)).toContain("chưa có trạng thái nào");
  });
});
