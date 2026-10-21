import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultLevelConfig } from "@/lib/constants";
import type { LevelDataset, LevelId } from "@/lib/types";
import { ApiClientError } from "../api-errors";
import { DatasetController, pollWhileListenerDown, type DatasetFetcher } from "../data-store";
import { resolveLevel } from "../level-pref";

function makeDataset(levelId: LevelId, version: number): LevelDataset {
  return {
    levelId,
    version,
    generatedAt: "2026-10-21T00:00:00.000Z",
    config: defaultLevelConfig(levelId),
    classes: [],
    catalog: [],
    weeks: [],
    students: [],
    incidents: [],
    rewards: [],
    redacted: false,
  };
}

/** Fake server: current version per level; honours If-None-Match; can be told to fail or hold responses. */
function fakeServer() {
  const versions: Record<LevelId, number> = { TH: 1, THCS: 1, THPT: 1 };
  const calls: Array<{ levelId: LevelId; etag?: string }> = [];
  let failNext: Error | undefined;
  let gate: Promise<void> | undefined;
  const fetcher = vi.fn<DatasetFetcher>(async (levelId, etag) => {
    calls.push({ levelId, etag });
    const v = versions[levelId];
    if (gate) await gate;
    if (failNext) {
      const e = failNext;
      failNext = undefined;
      throw e;
    }
    if (etag === `"${v}"`) return { status: 304 };
    return { status: 200, dataset: makeDataset(levelId, v), etag: `"${v}"` };
  });
  return {
    versions,
    calls,
    fetcher,
    fail(e: Error) {
      failNext = e;
    },
    hold() {
      let release!: () => void;
      gate = new Promise<void>((r) => (release = r));
      return () => {
        gate = undefined;
        release();
      };
    },
  };
}

describe("DatasetController", () => {
  it("loads once and de-duplicates concurrent requests", async () => {
    const server = fakeServer();
    const c = new DatasetController(server.fetcher);
    await Promise.all([c.ensure("THCS"), c.ensure("THCS"), c.ensure("THCS")]);
    await c.ensure("THCS");
    expect(server.fetcher).toHaveBeenCalledTimes(1);
    expect(c.entry("THCS")).toMatchObject({ status: "ready", refreshing: false, etag: '"1"' });
    expect(c.entry("THCS")?.dataset?.version).toBe(1);
  });

  it("revalidates with the ETag and keeps the dataset on 304", async () => {
    const server = fakeServer();
    const c = new DatasetController(server.fetcher);
    await c.ensure("TH");
    const first = c.entry("TH")?.dataset;
    await c.refresh("TH");
    expect(server.calls[1]).toEqual({ levelId: "TH", etag: '"1"' });
    expect(c.entry("TH")?.dataset).toBe(first);
    server.versions.TH = 2;
    await c.refresh("TH");
    expect(c.entry("TH")?.dataset?.version).toBe(2);
  });

  it("shows 'loading' only before the first dataset", async () => {
    const server = fakeServer();
    const c = new DatasetController(server.fetcher);
    const p = c.ensure("THPT");
    expect(c.entry("THPT")).toMatchObject({ status: "loading", refreshing: true });
    await p;
    const q = c.refresh("THPT");
    expect(c.entry("THPT")).toMatchObject({ status: "ready", refreshing: true });
    await q;
  });

  it("reports errors without data, keeps stale data otherwise; never rejects", async () => {
    const server = fakeServer();
    const c = new DatasetController(server.fetcher);
    server.fail(new ApiClientError(403, "FORBIDDEN", "Bạn không có quyền xem cấp học này."));
    await expect(c.ensure("THCS")).resolves.toBeUndefined();
    expect(c.entry("THCS")).toMatchObject({ status: "error", error: "Bạn không có quyền xem cấp học này." });
    await c.ensure("THCS"); // failed < 5 s ago → no retry storm
    expect(server.fetcher).toHaveBeenCalledTimes(1);

    await c.refresh("THCS");
    expect(c.entry("THCS")).toMatchObject({ status: "ready", error: undefined });
    server.fail(new Error("socket hang up"));
    await c.refresh("THCS");
    expect(c.entry("THCS")).toMatchObject({ status: "ready", error: "Không tải được dữ liệu. Vui lòng thử lại." });
    expect(c.entry("THCS")?.dataset?.version).toBe(1);
  });

  it("queues one more request when refresh() is called during a request", async () => {
    const server = fakeServer();
    const c = new DatasetController(server.fetcher);
    const release = server.hold();
    const first = c.ensure("TH");
    server.versions.TH = 2; // a write lands while the first response is in flight
    const again = c.refresh("TH");
    const again2 = c.refresh("TH");
    release();
    await Promise.all([first, again, again2]);
    expect(c.entry("TH")?.dataset?.version).toBe(2);
    expect(server.fetcher.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("ignores responses that arrive after reset()", async () => {
    const server = fakeServer();
    const c = new DatasetController(server.fetcher);
    const release = server.hold();
    const p = c.ensure("THCS");
    c.reset("other-user");
    release();
    await p;
    expect(c.entry("THCS")).toBeUndefined();
    expect(c.store.getState().owner).toBe("other-user");
  });

  describe("meta/versions listener", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("refetches a loaded level after an 800 ms debounce when its version moves", async () => {
      const server = fakeServer();
      const c = new DatasetController(server.fetcher);
      await c.ensure("THCS");
      server.versions.THCS = 2;
      c.onVersions({ TH: 9, THCS: 2, THPT: 1 }); // TH not loaded → ignored
      server.versions.THCS = 3;
      await vi.advanceTimersByTimeAsync(500);
      c.onVersions({ TH: 9, THCS: 3, THPT: 1 }); // burst → debounce restarts
      await vi.advanceTimersByTimeAsync(799);
      expect(server.fetcher).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await vi.runAllTimersAsync();
      expect(server.fetcher).toHaveBeenCalledTimes(2);
      expect(c.entry("THCS")?.dataset?.version).toBe(3);
      expect(c.entry("TH")).toBeUndefined();
      expect(c.store.getState()).toMatchObject({ listener: "live", serverVersions: { TH: 9, THCS: 3, THPT: 1 } });
    });

    it("adds the random jitter to the debounce and defers a hidden tab until it is shown again", async () => {
      const server = fakeServer();
      let visible = true;
      const c = new DatasetController(server.fetcher, 800, { jitterMs: 3_000, random: () => 0.5, isVisible: () => visible });
      await c.ensure("THCS");
      server.versions.THCS = 2;
      c.onVersions({ THCS: 2 });
      await vi.advanceTimersByTimeAsync(2_299);
      expect(server.fetcher).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await vi.runAllTimersAsync();
      expect(server.fetcher).toHaveBeenCalledTimes(2);
      expect(c.entry("THCS")?.dataset?.version).toBe(2);

      visible = false;
      server.versions.THCS = 3;
      c.onVersions({ THCS: 3 });
      await vi.runAllTimersAsync();
      expect(server.fetcher).toHaveBeenCalledTimes(2); // hidden: no read
      visible = true;
      c.resumeDeferred();
      await vi.runAllTimersAsync();
      expect(server.fetcher).toHaveBeenCalledTimes(3);
      expect(c.entry("THCS")?.dataset?.version).toBe(3);
      c.resumeDeferred(); // nothing pending any more
      await vi.runAllTimersAsync();
      expect(server.fetcher).toHaveBeenCalledTimes(3);
    });

    it("does not refetch when already up to date, nor loop when the server lags", async () => {
      const server = fakeServer();
      const c = new DatasetController(server.fetcher);
      await c.ensure("TH");
      c.onVersions({ TH: 1 });
      await vi.runAllTimersAsync();
      expect(server.fetcher).toHaveBeenCalledTimes(1);

      c.onVersions({ TH: 5 }); // server still serves version 1
      await vi.runAllTimersAsync();
      expect(server.fetcher).toHaveBeenCalledTimes(2);
      c.onVersions({ TH: 5 }); // same version again → no new request
      await vi.runAllTimersAsync();
      expect(server.fetcher).toHaveBeenCalledTimes(2);
    });

    it("revalidateStale refetches old entries and retries failed ones", async () => {
      const server = fakeServer();
      const c = new DatasetController(server.fetcher);
      await c.ensure("TH");
      server.fail(new Error("offline"));
      await c.ensure("THPT");
      expect(c.entry("THPT")?.status).toBe("error");
      await vi.advanceTimersByTimeAsync(61_000);
      c.revalidateStale(60_000);
      await vi.runAllTimersAsync();
      expect(server.calls.slice(-2).map((x) => x.levelId).sort()).toEqual(["TH", "THPT"]);
      expect(c.entry("THPT")?.status).toBe("ready");
    });

    it("polls a visible tab while the listener is down, pauses when hidden, stops once live", async () => {
      const server = fakeServer();
      const c = new DatasetController(server.fetcher);
      await c.ensure("THCS");
      c.setListener("error"); // e.g. permission-denied on meta/versions: the 30 s resubscribe never succeeds
      let visible = true;
      const stop = pollWhileListenerDown(c, { intervalMs: 60_000, maxAgeMs: 30_000, isVisible: () => visible });

      server.versions.THCS = 2; // a write elsewhere – no focus/online event in a tab that just stays visible
      await vi.advanceTimersByTimeAsync(60_000);
      expect(server.fetcher).toHaveBeenCalledTimes(2);
      expect(c.entry("THCS")?.dataset?.version).toBe(2);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(server.fetcher).toHaveBeenCalledTimes(3); // cheap 304

      visible = false;
      await vi.advanceTimersByTimeAsync(180_000);
      expect(server.fetcher).toHaveBeenCalledTimes(3);
      visible = true;

      c.onVersions({ THCS: 2 }); // listener back → no more polling
      await vi.advanceTimersByTimeAsync(300_000);
      expect(server.fetcher).toHaveBeenCalledTimes(3);

      c.setListener("error"); // down again → polling resumes
      await vi.advanceTimersByTimeAsync(60_000);
      expect(server.fetcher).toHaveBeenCalledTimes(4);

      stop();
      await vi.advanceTimersByTimeAsync(300_000);
      expect(server.fetcher).toHaveBeenCalledTimes(4);
    });
  });
});

describe("resolveLevel", () => {
  const all: LevelId[] = ["TH", "THCS", "THPT"];
  it("prefers an explicit choice, then the stored one, when accessible", () => {
    expect(resolveLevel({ chosen: "THPT", stored: "TH", accessible: all })).toBe("THPT");
    expect(resolveLevel({ stored: "TH", accessible: all })).toBe("TH");
    expect(resolveLevel({ chosen: "THPT", stored: "TH", accessible: ["THCS"] })).toBe("THCS");
  });
  it("defaults GVCN to the level of the first homeroom class", () => {
    const profile = { role: "GVCN" as const, gvcnClasses: [{ levelId: "THPT" as const, classCode: "10A1" }] };
    expect(resolveLevel({ profile, accessible: ["THPT"] })).toBe("THPT");
    expect(resolveLevel({ profile, stored: "TH", accessible: ["THPT"] })).toBe("THPT");
  });
  it("falls back to the first accessible level, then THCS", () => {
    expect(resolveLevel({ accessible: ["THPT", "TH"] })).toBe("THPT");
    expect(resolveLevel({ accessible: [] })).toBe("THCS");
  });
});
