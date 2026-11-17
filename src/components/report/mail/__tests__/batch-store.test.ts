/**
 * Batch store of "Gửi email" (pure, fake timers): one poller per batch whatever subscribes, polling and toasts that do
 * not depend on any mounted screen, per-user ownership (sign-out / another account drops everything), timers cleared
 * when watches end, and the toast hint for a batch of another level.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, networkError } from "@/lib/client/api-errors";
import type { MailBatchResponse } from "@/lib/contract";
import { createBatchStore } from "../lib/batch-store";
import {
  BATCH_POLL_MAX_MS,
  BATCH_POLL_MS,
  BATCH_RETRY_HINT,
  resumeWatch,
  retryInWatch,
  startWatch,
  watchOnReopen,
  type BatchToast,
} from "../lib/mail-batch";
import { batchFixture } from "./mail-fixtures";

const T0 = 1_800_000_000_000;
const LABEL = "Tuần 19/10 – 25/10/2026";
const DONE_FAILED = { done: true, counts: { PENDING: 0, SENDING: 0, SENT: 2, FAILED: 1, SKIPPED: 0 } } as const;
const DONE_ALL = { done: true, items: batchFixture().items.slice(0, 1), counts: { PENDING: 0, SENDING: 0, SENT: 1, FAILED: 0, SKIPPED: 0 } } as const;

interface Call {
  batchId: string;
  signal: AbortSignal;
  resolve: (res: MailBatchResponse) => void;
  reject: (err: unknown) => void;
}

/** Lets the poll's promise chain run (fetch start / answer handling). */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

function setup() {
  const calls: Call[] = [];
  const fetchBatch = vi.fn(
    (batchId: string, signal: AbortSignal) => new Promise<MailBatchResponse>((resolve, reject) => calls.push({ batchId, signal, resolve, reject })),
  );
  const toasts: BatchToast[] = [];
  const store = createBatchStore({ fetchBatch, announce: (t) => toasts.push(t) });
  store.setOwner("u1");
  const send = (levelId: "TH" | "THCS" | "THPT", batchId: string, jobs = 3) =>
    store.update("u1", levelId, () => startWatch({ batchId, jobs }, levelId, LABEL, Date.now()));
  /** Answers the last poll of `batchId`. */
  const answer = async (batchId: string, res: Partial<MailBatchResponse> = {}) => {
    const call = calls.filter((c) => c.batchId === batchId).at(-1);
    if (!call) throw new Error(`no poll of ${batchId}`);
    call.resolve(batchFixture({ batchId, ...res }));
    await flush();
  };
  /** Runs the due timers (and starts their requests). */
  const tick = async (ms: number) => {
    vi.advanceTimersByTime(ms);
    await flush();
  };
  return { store, calls, fetchBatch, toasts, send, answer, tick };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("polling", () => {
  it("polls at once, then every 3 s until done; toasts once; no timer is left", async () => {
    const { store, calls, toasts, send, answer, tick } = setup();
    send("THCS", "b1");
    expect(store.activePolls()).toEqual(["b1#1"]);
    expect(vi.getTimerCount()).toBe(1);
    await tick(0);
    expect(calls).toHaveLength(1);
    await answer("b1");
    expect(store.getState().watches.THCS).toMatchObject({ status: "polling", round: 2, delayMs: BATCH_POLL_MS });
    expect(store.activePolls()).toEqual(["b1#2"]);
    await tick(BATCH_POLL_MS - 1);
    expect(calls).toHaveLength(1);
    await tick(1);
    expect(calls).toHaveLength(2);
    await answer("b1", DONE_FAILED);
    expect(store.getState().watches.THCS?.status).toBe("done");
    expect(toasts).toEqual([
      { kind: "warning", title: "Đã gửi 2/3 thư báo cáo · 1 thư lỗi", description: `${LABEL} · THCS: Mở Báo cáo tuần/tháng cấp THCS rồi bấm “Gửi email” để xem lỗi và gửi lại.` },
    ]);
    expect(store.activePolls()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    await tick(60_000);
    expect(calls).toHaveLength(2);
  });

  it("keeps polling and toasting with nobody subscribed (report screen unmounted)", async () => {
    const { store, calls, toasts, send, answer, tick } = setup();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    send("THCS", "b1");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await tick(0);
    await answer("b1");
    await tick(BATCH_POLL_MS);
    await answer("b1", DONE_ALL);
    expect(calls).toHaveLength(2);
    expect(toasts.map((t) => t.title)).toEqual(["Đã gửi 1 thư báo cáo"]);
    expect(listener).toHaveBeenCalledTimes(1);
    // Remounting finds the finished batch (its dialog decides on reopening what to keep).
    expect(store.getState().watches.THCS).toMatchObject({ batchId: "b1", status: "done" });
  });

  it("exactly one poller per batch: several subscribers and repeated (StrictMode-like) updates", async () => {
    const { store, calls, send, answer, tick } = setup();
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    send("THCS", "b1");
    // Effects run twice under StrictMode: the same updates again change nothing and start no second poll.
    store.update("u1", "THCS", (w) => w);
    store.update("u1", "THCS", watchOnReopen);
    store.update("u1", "THCS", watchOnReopen);
    store.setOwner("u1");
    expect(store.activePolls()).toEqual(["b1#1"]);
    expect(vi.getTimerCount()).toBe(1);
    await tick(0);
    expect(calls).toHaveLength(1);
    await answer("b1");
    expect(vi.getTimerCount()).toBe(1);
    await tick(BATCH_POLL_MS);
    expect(calls).toHaveLength(2);
    expect(a).toHaveBeenCalledTimes(b.mock.calls.length);
  });

  it("each level's batch has its own timer: an answer for one never restarts the other", async () => {
    const { store, calls, send, answer, tick } = setup();
    send("THCS", "b1");
    await tick(0);
    await answer("b1"); // next THCS poll at +3 s
    await tick(1_000);
    send("THPT", "b2");
    await tick(0); // THPT first poll
    expect(calls.map((c) => c.batchId)).toEqual(["b1", "b2"]);
    await answer("b2"); // next THPT poll 3 s from now (t = 4 s)
    expect(store.activePolls().sort()).toEqual(["b1#2", "b2#2"]);
    expect(vi.getTimerCount()).toBe(2);
    await tick(2_000); // t = 3 s: THCS only
    expect(calls.map((c) => c.batchId)).toEqual(["b1", "b2", "b1"]);
    await tick(1_000); // t = 4 s: THPT
    expect(calls.map((c) => c.batchId)).toEqual(["b1", "b2", "b1", "b2"]);
  });

  it("stops after the maximum poll time; “Cập nhật” resumes at once", async () => {
    const { store, calls, send, answer, tick } = setup();
    send("THCS", "b1");
    await tick(0);
    let polls = 0;
    while (store.getState().watches.THCS?.status === "polling") {
      await answer("b1");
      polls++;
      await tick(BATCH_POLL_MS);
      if (polls > 1_000) throw new Error("never stopped");
    }
    expect(store.getState().watches.THCS?.status).toBe("stopped");
    expect(Date.now() - T0).toBeGreaterThanOrEqual(BATCH_POLL_MAX_MS);
    expect(vi.getTimerCount()).toBe(0);
    const before = calls.length;
    await tick(BATCH_POLL_MAX_MS);
    expect(calls).toHaveLength(before);
    store.update("u1", "THCS", (w) => (w ? resumeWatch(w, Date.now()) : w));
    await tick(0);
    expect(calls).toHaveLength(before + 1);
    expect(store.getState().watches.THCS?.status).toBe("polling");
  });

  it("backs off after a network error; stops on 403 without a timer", async () => {
    const { store, calls, send, tick } = setup();
    send("THCS", "b1");
    await tick(0);
    calls[0]!.reject(networkError());
    await flush();
    expect(store.getState().watches.THCS).toMatchObject({ status: "polling", failures: 1, delayMs: 6_000 });
    await tick(5_999);
    expect(calls).toHaveLength(1);
    await tick(1);
    expect(calls).toHaveLength(2);
    calls[1]!.reject(new ApiClientError(403, "FORBIDDEN", "Bạn không có quyền."));
    await flush();
    expect(store.getState().watches.THCS).toMatchObject({ status: "stopped", error: "Bạn không có quyền." });
    expect(vi.getTimerCount()).toBe(0);
    expect(store.activePolls()).toEqual([]);
  });

  it("“Cập nhật” / “Gửi lại” during a poll: the old request is aborted, one new poll", async () => {
    const { store, calls, toasts, send, answer, tick } = setup();
    send("THCS", "b1");
    await tick(0);
    await answer("b1", DONE_FAILED);
    toasts.length = 0;
    store.update("u1", "THCS", (w) => (w ? retryInWatch(w, "j2", Date.now()) : w));
    await tick(BATCH_POLL_MS);
    expect(calls).toHaveLength(2);
    store.update("u1", "THCS", (w) => (w ? resumeWatch(w, Date.now()) : w));
    expect(calls[1]!.signal.aborted).toBe(true);
    expect(store.activePolls()).toHaveLength(1);
    await tick(0);
    expect(calls).toHaveLength(3);
    // The aborted request answering late changes nothing.
    calls[1]!.resolve(batchFixture({ batchId: "b1", ...DONE_ALL }));
    await flush();
    expect(store.getState().watches.THCS?.status).toBe("polling");
    expect(toasts).toEqual([]);
  });

  it("“Gửi thư khác” removes the batch: its poll is cancelled", async () => {
    const { store, calls, toasts, send, tick } = setup();
    send("THCS", "b1");
    await tick(0);
    store.update("u1", "THCS", () => undefined);
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(store.getState().watches).toEqual({});
    expect(vi.getTimerCount()).toBe(0);
    calls[0]!.resolve(batchFixture({ batchId: "b1", ...DONE_ALL }));
    await flush();
    expect(store.getState().watches).toEqual({});
    expect(toasts).toEqual([]);
  });
});

describe("owner", () => {
  it("sign-out / another account drops the batches, cancels timers and requests; late answers are ignored", async () => {
    const { store, calls, toasts, send, tick } = setup();
    send("THCS", "b1");
    send("THPT", "b2");
    await tick(0);
    expect(calls).toHaveLength(2);
    store.setOwner(undefined);
    expect(store.getState()).toEqual({ watches: {} });
    expect(calls.every((c) => c.signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    for (const c of calls) c.resolve(batchFixture({ batchId: c.batchId, ...DONE_ALL }));
    await flush();
    expect(toasts).toEqual([]);
    // Nobody signed in: updates are ignored.
    store.update("u1", "THCS", () => startWatch({ batchId: "b3", jobs: 1 }, "THCS", LABEL, Date.now()));
    expect(store.getState().watches).toEqual({});
    // The next user starts empty; the previous user's late send is ignored.
    store.setOwner("u2");
    store.update("u1", "THCS", () => startWatch({ batchId: "b4", jobs: 1 }, "THCS", LABEL, Date.now()));
    expect(store.getState()).toEqual({ owner: "u2", watches: {} });
    expect(vi.getTimerCount()).toBe(0);
    store.update("u2", "THCS", () => startWatch({ batchId: "b5", jobs: 1 }, "THCS", LABEL, Date.now()));
    expect(store.activePolls()).toEqual(["b5#1"]);
  });

  it("the same owner again (token refresh) keeps everything", async () => {
    const { store, calls, send, tick } = setup();
    send("THCS", "b1");
    const before = store.getState();
    store.setOwner("u1");
    expect(store.getState()).toBe(before);
    await tick(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.signal.aborted).toBe(false);
  });
});

describe("toast hint by the level on screen", () => {
  async function finish(view: (store: ReturnType<typeof setup>["store"]) => void) {
    const s = setup();
    view(s.store);
    s.send("THCS", "b1");
    await s.tick(0);
    await s.answer("b1", DONE_FAILED);
    return s.toasts[0]?.description;
  }

  it("same level: reopen “Gửi email”; another level: switch first; another page: open Báo cáo", async () => {
    expect(await finish((st) => st.view("THCS"))).toBe(`${LABEL} · THCS: ${BATCH_RETRY_HINT}`);
    expect(await finish((st) => st.view("THPT"))).toBe(`${LABEL} · THCS: Chuyển sang cấp THCS rồi mở “Gửi email” để xem lỗi và gửi lại.`);
    expect(await finish(() => undefined)).toBe(`${LABEL} · THCS: Mở Báo cáo tuần/tháng cấp THCS rồi bấm “Gửi email” để xem lỗi và gửi lại.`);
  });

  it("follows the level shown when the batch finishes; an old release does not clear a newer view", async () => {
    const { store, toasts, send, answer, tick } = setup();
    const releaseThcs = store.view("THCS");
    send("THCS", "b1");
    await tick(0);
    // Level switch: the page registers THPT; the THCS registration is released afterwards (effect order).
    store.view("THPT");
    releaseThcs();
    await answer("b1", DONE_FAILED);
    expect(toasts[0]?.description).toBe(`${LABEL} · THCS: Chuyển sang cấp THCS rồi mở “Gửi email” để xem lỗi và gửi lại.`);
  });

  it("all sent: no hint at all", async () => {
    const { store, toasts, send, answer, tick } = setup();
    store.view("THPT");
    send("THCS", "b1");
    await tick(0);
    await answer("b1", DONE_ALL);
    expect(toasts).toEqual([{ kind: "success", title: "Đã gửi 1 thư báo cáo", description: `${LABEL} · THCS` }]);
  });
});
