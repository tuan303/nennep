import { describe, expect, it } from "vitest";
import { makeFixtureDataset } from "../__fixtures__/dataset";
import { countedRewards } from "../filters";
import type { Reward } from "../../types";

describe("countedRewards – GVCN proposals", () => {
  const ds = makeFixtureDataset();
  const base = ds.rewards[0];
  const mk = (status: Reward["status"], proposed?: boolean): Reward => ({ ...base, id: `${base.id}-${status}-${proposed}`, status, proposed });

  it("a proposal counts only once confirmed, even when the level also counts other statuses", () => {
    const config = { ...ds.config, rewardCountedStatuses: ["Mới ghi nhận", "Đang xác minh", "Đã xác nhận"] as Reward["status"][] };
    const rewards = [mk("Mới ghi nhận", true), mk("Đang xác minh", true), mk("Đã xác nhận", true), mk("Mới ghi nhận")];
    const ids = countedRewards(rewards, config).map((r) => r.id);
    expect(ids).toEqual([rewards[2].id, rewards[3].id]);
  });

  it("non-proposed rewards follow the level's counted statuses as before", () => {
    const rewards = [mk("Mới ghi nhận"), mk("Đã xác nhận")];
    expect(countedRewards(rewards, ds.config).map((r) => r.status)).toEqual(["Đã xác nhận"]);
  });
});
