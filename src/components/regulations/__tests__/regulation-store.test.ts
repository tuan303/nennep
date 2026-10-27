/** Client cache of the quy chế: one GET per signed-in user and tab, in-place update after saves, reload semantics. */
import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/client/api-errors";
import type { Regulation } from "@/lib/types";
import { createRegulationStore } from "../lib/regulation-store";

const reg = (id: Regulation["id"], rev: number, body = "Nội dung thử"): Regulation => ({
  id,
  title: id === "khen-thuong" ? "Quy chế khen thưởng" : "Quy chế kỷ luật",
  schoolYear: "2026–2027",
  body,
  rev,
  updatedAt: "2026-10-21T07:00:00Z",
  updatedBy: "quan.tri@nshm.test",
  updatedByName: "Quản Trị Thử",
});

describe("regulation store", () => {
  it("fetches once per user, shares concurrent calls and starts over for another user", async () => {
    const fetchList = vi.fn(async () => [reg("khen-thuong", 1)]);
    const store = createRegulationStore(fetchList);
    const seen: string[] = [];
    store.subscribe(() => seen.push(store.getState().status));

    await Promise.all([store.ensure("u1"), store.ensure("u1")]);
    await store.ensure("u1");
    expect(fetchList).toHaveBeenCalledTimes(1);
    expect(store.getState()).toMatchObject({ owner: "u1", status: "ready", reloading: false });
    expect(store.getState().items["khen-thuong"]?.rev).toBe(1);
    expect(store.getState().items["ky-luat"]).toBeUndefined();
    expect(seen).toEqual(["loading", "ready"]);

    await store.ensure("u2");
    expect(fetchList).toHaveBeenCalledTimes(2);
    expect(store.getState().owner).toBe("u2");
  });

  it("reports a first-load failure as an error state; a retry recovers", async () => {
    const fetchList = vi
      .fn<() => Promise<Regulation[]>>()
      .mockRejectedValueOnce(new ApiClientError(0, "NETWORK", "Không kết nối được máy chủ. Vui lòng thử lại."))
      .mockResolvedValueOnce([reg("ky-luat", 2)]);
    const store = createRegulationStore(fetchList);
    await store.ensure("u1");
    expect(store.getState()).toMatchObject({ status: "error", error: "Không kết nối được máy chủ. Vui lòng thử lại." });
    await store.reload("u1");
    expect(store.getState().status).toBe("ready");
    expect(store.getState().error).toBeUndefined();
    expect(store.getState().items["ky-luat"]?.rev).toBe(2);
  });

  it("a failed reload keeps what is shown and rejects", async () => {
    const fetchList = vi
      .fn<() => Promise<Regulation[]>>()
      .mockResolvedValueOnce([reg("ky-luat", 2)])
      .mockRejectedValueOnce(new ApiClientError(500, "INTERNAL", "Lỗi máy chủ"));
    const store = createRegulationStore(fetchList);
    await store.ensure("u1");
    const pending = store.reload("u1");
    expect(store.getState()).toMatchObject({ status: "ready", reloading: true });
    await expect(pending).rejects.toMatchObject({ message: "Lỗi máy chủ" });
    expect(store.getState()).toMatchObject({ status: "ready", reloading: false });
    expect(store.getState().items["ky-luat"]?.rev).toBe(2);
  });

  it("puts a saved regulation in place without refetching, and drops an older reload answer", async () => {
    let resolveReload: (list: Regulation[]) => void = () => undefined;
    const fetchList = vi
      .fn<() => Promise<Regulation[]>>()
      .mockResolvedValueOnce([reg("khen-thuong", 1), reg("ky-luat", 1)])
      .mockImplementationOnce(() => new Promise((r) => (resolveReload = r)));
    const store = createRegulationStore(fetchList);
    await store.ensure("u1");

    const reloading = store.reload("u1");
    store.put("u1", reg("ky-luat", 2, "Bản mới"));
    resolveReload([reg("khen-thuong", 1), reg("ky-luat", 1)]);
    await reloading;
    expect(store.getState().items["ky-luat"]).toMatchObject({ rev: 2, body: "Bản mới" });
    expect(store.getState().items["khen-thuong"]?.rev).toBe(1);
    expect(store.getState().reloading).toBe(false);

    // Another user's save never lands in this cache.
    store.put("u2", reg("khen-thuong", 9));
    expect(store.getState().items["khen-thuong"]?.rev).toBe(1);
    expect(fetchList).toHaveBeenCalledTimes(2);
  });
});

describe("regulation store – stale list", () => {
  it("refreshes quietly after REGULATIONS_STALE_MS (another user's save), keeping the shown text meanwhile", async () => {
    const { REGULATIONS_STALE_MS } = await import("../lib/regulation-store");
    let t = 1_000;
    const fetchList = vi.fn<() => Promise<Regulation[]>>().mockResolvedValueOnce([reg("ky-luat", 1)]).mockResolvedValueOnce([reg("ky-luat", 2, "Bản mới")]);
    const store = createRegulationStore(fetchList, () => t);
    await store.ensure("u1");
    t += REGULATIONS_STALE_MS - 1;
    await store.ensure("u1");
    expect(fetchList).toHaveBeenCalledTimes(1);
    t += 2;
    await store.ensure("u1"); // returns at once with the current text…
    expect(store.getState()).toMatchObject({ status: "ready", reloading: false });
    await vi.waitFor(() => expect(store.getState().items["ky-luat"]?.rev).toBe(2)); // …and the newer version arrives
    expect(fetchList).toHaveBeenCalledTimes(2);
  });
});
