/** Progress of a "Gửi" click: polling state, counts, retry, toast. */
import { describe, expect, it } from "vitest";
import {
  BATCH_POLL_BACKOFF_MAX_MS,
  BATCH_POLL_MAX_MS,
  BATCH_POLL_MS,
  BATCH_RETRY_HINT,
  applyPoll,
  applyPollError,
  batchCountsLine,
  batchFinishedNotice,
  batchNeedsAttention,
  batchProgress,
  batchRetryHint,
  batchToast,
  canRetryItem,
  duePolls,
  markRetried,
  nextPollDelayMs,
  resumeWatch,
  retryInWatch,
  startWatch,
  updateLevelWatch,
  watchOnReopen,
} from "../lib/mail-batch";
import { batchFixture } from "./mail-fixtures";

const T0 = 1_800_000_000_000;
const LABEL = "Tuần 19/10 – 25/10/2026";

describe("polling", () => {
  it("polls at once after the send, then every 3 s until done", () => {
    const w = startWatch({ batchId: "b1", jobs: 3 }, "THCS", LABEL, T0);
    expect(w).toEqual({ batchId: "b1", levelId: "THCS", jobs: 3, periodLabel: LABEL, status: "polling", failures: 0, since: T0, round: 1, delayMs: 0 });
    const running = applyPoll(w, batchFixture(), T0 + 3_000);
    expect(running).toMatchObject({ status: "polling", round: 2, delayMs: BATCH_POLL_MS });
    const done = applyPoll(running, batchFixture({ done: true }), T0 + 6_000);
    expect(done).toMatchObject({ status: "done", round: 3 });
  });

  it("remembers that report PDFs were off when the batch was queued, through polls and “Gửi lại”", () => {
    const w = startWatch({ batchId: "b1", jobs: 3 }, "THCS", LABEL, T0, { withoutPdf: true });
    expect(w.withoutPdf).toBe(true);
    expect(applyPoll(w, batchFixture(), T0 + 3_000).withoutPdf).toBe(true);
    expect(retryInWatch(applyPoll(w, batchFixture({ done: true }), T0 + 3_000), "j2", T0 + 9_000).withoutPdf).toBe(true);
    expect("withoutPdf" in startWatch({ batchId: "b1", jobs: 3 }, "THCS", LABEL, T0, { withoutPdf: false })).toBe(false);
  });

  it("backs off after failures, stops on fatal statuses and after the time limit", () => {
    expect(nextPollDelayMs(0)).toBe(BATCH_POLL_MS);
    expect(nextPollDelayMs(1)).toBe(6_000);
    expect(nextPollDelayMs(2)).toBe(12_000);
    expect(nextPollDelayMs(20)).toBe(BATCH_POLL_BACKOFF_MAX_MS);
    const w = startWatch({ batchId: "b1", jobs: 3 }, "THCS", LABEL, T0);
    const failed = applyPollError(w, { status: 0, message: "Không kết nối được máy chủ." }, T0 + 1_000);
    expect(failed).toMatchObject({ status: "polling", failures: 1, error: "Không kết nối được máy chủ.", delayMs: 6_000, round: 2 });
    // A successful poll clears the error.
    const ok = applyPoll(failed, batchFixture(), T0 + 8_000);
    expect(ok.failures).toBe(0);
    expect("error" in ok).toBe(false);
    expect(applyPollError(w, { status: 403, message: "Không có quyền." }, T0)).toMatchObject({ status: "stopped" });
    expect(applyPollError(w, { status: 404, message: "Không thấy." }, T0)).toMatchObject({ status: "stopped" });
    expect(applyPoll(w, batchFixture(), T0 + BATCH_POLL_MAX_MS)).toMatchObject({ status: "stopped" });
    expect(applyPollError(w, { status: 503, message: "Bận." }, T0 + BATCH_POLL_MAX_MS)).toMatchObject({ status: "stopped" });
  });

  it("'Cập nhật' resumes at once with a new time limit", () => {
    const stopped = applyPoll(startWatch({ batchId: "b1", jobs: 3 }, "THCS", LABEL, T0), batchFixture(), T0 + BATCH_POLL_MAX_MS);
    const resumed = resumeWatch(stopped, T0 + BATCH_POLL_MAX_MS + 5);
    expect(resumed).toMatchObject({ status: "polling", since: T0 + BATCH_POLL_MAX_MS + 5, delayMs: 0, failures: 0 });
    expect(resumed.round).toBe(stopped.round + 1);
  });
});

describe("one batch per level", () => {
  it("a send on another level keeps following the first batch; each level's dialog sees only its own", () => {
    const thcs = startWatch({ batchId: "b1", jobs: 40 }, "THCS", LABEL, T0);
    const thpt = startWatch({ batchId: "b2", jobs: 2 }, "THPT", LABEL, T0 + 60_000);
    const one = updateLevelWatch({}, "THCS", () => thcs);
    expect(one).toEqual({ THCS: thcs });
    // The THPT dialog has no batch: it composes instead of showing (and waiting for) the THCS one.
    expect(one.THPT).toBeUndefined();
    const both = updateLevelWatch(one, "THPT", () => thpt);
    expect(both).toEqual({ THCS: thcs, THPT: thpt });
    expect([...duePolls(both).keys()]).toEqual(["b1#1", "b2#1"]);
    // A poll answering for one batch changes only its key: the other batch keeps its scheduled poll.
    const polled = updateLevelWatch(both, "THCS", (w) => (w ? applyPoll(w, batchFixture(), T0 + 3_000) : w));
    expect([...duePolls(polled).keys()]).toEqual(["b1#2", "b2#1"]);
    // Finished or removed batches are not polled.
    const done = updateLevelWatch(polled, "THPT", (w) => (w ? applyPoll(w, batchFixture({ batchId: "b2", done: true }), T0 + 63_000) : w));
    expect([...duePolls(done).keys()]).toEqual(["b1#2"]);
    expect(updateLevelWatch(done, "THPT", () => undefined)).toEqual({ THCS: polled.THCS });
    // Unchanged → the same object; the input is never mutated.
    expect(updateLevelWatch(both, "TH", () => undefined)).toBe(both);
    expect(updateLevelWatch(both, "THCS", (w) => w)).toBe(both);
    expect(both).toEqual({ THCS: thcs, THPT: thpt });
  });
});

describe("Gửi lại", () => {
  it("is offered for failed and skipped jobs", () => {
    expect(canRetryItem({ status: "FAILED" })).toBe(true);
    expect(canRetryItem({ status: "SKIPPED" })).toBe(true);
    expect(canRetryItem({ status: "SENT" })).toBe(false);
    expect(canRetryItem({ status: "PENDING" })).toBe(false);
  });

  it("shows the job as waiting again and follows the batch", () => {
    const res = batchFixture({ done: true, items: batchFixture().items.filter((i) => i.id !== "j3"), counts: { PENDING: 0, SENDING: 0, SENT: 1, FAILED: 1, SKIPPED: 0 } });
    const retried = markRetried(res, "j2");
    expect(retried.done).toBe(false);
    expect(retried.counts).toEqual({ PENDING: 1, SENDING: 0, SENT: 1, FAILED: 0, SKIPPED: 0 });
    expect(retried.items[1]).toEqual({ id: "j2", to: ["khoi6@example.edu.vn"], addressee: "Tổ khối 6", status: "PENDING" });
    expect(markRetried(res, "j1")).toBe(res);
    expect(markRetried(res, "nope")).toBe(res);

    const done = applyPoll(startWatch({ batchId: "b1", jobs: 2 }, "THCS", LABEL, T0), res, T0 + 3_000);
    const w = retryInWatch(done, "j2", T0 + 60_000);
    expect(w).toMatchObject({ status: "polling", since: T0 + 60_000, delayMs: BATCH_POLL_MS });
    expect(w.data?.counts.FAILED).toBe(0);
  });

  it("a skipped job loses its skip reason once retried", () => {
    const skipped = batchFixture({
      done: true,
      items: [{ id: "j4", to: ["gv.6a02@example.edu.vn"], addressee: "GVCN lớp 6A02", status: "SKIPPED", skipReason: "Lớp 6A02 chưa có email GVCN." }],
      counts: { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 1 },
    });
    expect(markRetried(skipped, "j4").items[0]).toEqual({ id: "j4", to: ["gv.6a02@example.edu.vn"], addressee: "GVCN lớp 6A02", status: "PENDING" });
  });
});

describe("texts", () => {
  it("counts the progress", () => {
    const p = batchProgress(batchFixture());
    expect(p).toEqual({ total: 3, sent: 1, failed: 1, skipped: 0, active: 1, finished: 2, ratio: 2 / 3 });
    expect(batchCountsLine(p)).toBe("1 đã gửi · 1 lỗi · 1 đang chờ");
    expect(batchCountsLine(batchProgress({ counts: { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 } }))).toBe("Chưa có thư");
    expect(batchProgress({ counts: { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 } }).ratio).toBe(0);
  });

  it("toast of a finished batch: all sent / partly / none", () => {
    const all = batchFixture({ done: true, items: [], counts: { PENDING: 0, SENDING: 0, SENT: 4, FAILED: 0, SKIPPED: 0 } });
    expect(batchToast(all, LABEL)).toEqual({ kind: "success", title: "Đã gửi 4 thư báo cáo", description: LABEL });
    const partly = batchFixture({ done: true, counts: { PENDING: 0, SENDING: 0, SENT: 2, FAILED: 1, SKIPPED: 1 } });
    expect(batchToast(partly, LABEL)).toEqual({
      kind: "warning",
      title: "Đã gửi 2/4 thư báo cáo · 1 thư lỗi, 1 thư bỏ qua",
      description: `${LABEL}: Mở “Gửi email” để xem lỗi và gửi lại.`,
    });
    const none = batchFixture({ done: true, counts: { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 3, SKIPPED: 0 } });
    expect(batchToast(none, LABEL)).toEqual({
      kind: "error",
      title: "Chưa gửi được thư báo cáo",
      description: `${LABEL}: Máy chủ thư từ chối. Mở “Gửi email” để xem lỗi và gửi lại.`,
    });
    const skippedOnly = batchFixture({
      done: true,
      items: [{ id: "j4", to: ["gv.6a02@example.edu.vn"], addressee: "GVCN lớp 6A02", status: "SKIPPED", skipReason: "Lớp 6A02 chưa có email GVCN." }],
      counts: { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 1 },
    });
    expect(batchToast(skippedOnly, LABEL).description).toBe(`${LABEL}: Lớp 6A02 chưa có email GVCN. Mở “Gửi email” để xem lỗi và gửi lại.`);
    const noJob = batchFixture({ done: true, items: [], counts: { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 } });
    expect(batchToast(noJob, LABEL)).toEqual({ kind: "error", title: "Chưa gửi được thư báo cáo", description: `${LABEL}: Mở “Gửi email” để xem lỗi và gửi lại.` });
  });

  it("the hint says to switch level when the batch is of another level than the one on screen", () => {
    expect(batchRetryHint("THCS", "THCS")).toBe(BATCH_RETRY_HINT);
    expect(batchRetryHint("THCS", "THPT")).toBe("Chuyển sang cấp THCS rồi mở “Gửi email” để xem lỗi và gửi lại.");
    expect(batchRetryHint("TH", "THCS")).toBe("Chuyển sang cấp Tiểu học rồi mở “Gửi email” để xem lỗi và gửi lại.");
    expect(batchRetryHint("THPT", undefined)).toBe("Mở Báo cáo tuần/tháng cấp THPT rồi bấm “Gửi email” để xem lỗi và gửi lại.");
    const partly = batchFixture({ done: true, counts: { PENDING: 0, SENDING: 0, SENT: 2, FAILED: 1, SKIPPED: 0 } });
    const label = `${LABEL} · THCS`;
    expect(batchToast(partly, label, batchRetryHint("THCS", "THPT"))).toEqual({
      kind: "warning",
      title: "Đã gửi 2/3 thư báo cáo · 1 thư lỗi",
      description: `${label}: Chuyển sang cấp THCS rồi mở “Gửi email” để xem lỗi và gửi lại.`,
    });
    const none = batchFixture({ done: true, counts: { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 3, SKIPPED: 0 } });
    expect(batchToast(none, label, batchRetryHint("THCS", "TH")).description).toBe(
      `${label}: Máy chủ thư từ chối. Chuyển sang cấp THCS rồi mở “Gửi email” để xem lỗi và gửi lại.`,
    );
    // All sent: nothing to fix, no hint whatever the level.
    const all = batchFixture({ done: true, items: [], counts: { PENDING: 0, SENDING: 0, SENT: 4, FAILED: 0, SKIPPED: 0 } });
    expect(batchToast(all, label, batchRetryHint("THCS", "THPT"))).toEqual({ kind: "success", title: "Đã gửi 4 thư báo cáo", description: label });
  });
});

describe("reopening the dialog", () => {
  const allSent = batchFixture({
    done: true,
    items: [{ id: "j1", to: ["bgh.1@example.edu.vn"], addressee: "Ban Giám hiệu", status: "SENT", sentAt: "2026-10-23T07:05:00.000Z" }],
    counts: { PENDING: 0, SENDING: 0, SENT: 1, FAILED: 0, SKIPPED: 0 },
  });
  const failed = batchFixture({ done: true, items: batchFixture().items.slice(0, 2), counts: { PENDING: 0, SENDING: 0, SENT: 1, FAILED: 1, SKIPPED: 0 } });
  const skipped = batchFixture({
    done: true,
    items: [{ id: "j4", to: ["gv.6a02@example.edu.vn"], addressee: "GVCN lớp 6A02", status: "SKIPPED", skipReason: "Lớp 6A02 chưa có email GVCN." }],
    counts: { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 1 },
  });
  const empty = batchFixture({ done: true, items: [], counts: { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 } });
  const start = startWatch({ batchId: "b1", jobs: 2 }, "THCS", LABEL, T0);
  const finished = (res: typeof allSent) => applyPoll(start, res, T0 + 3_000);

  it("starts a new message only after a batch that sent every email", () => {
    expect(watchOnReopen(finished(allSent))).toBeUndefined();
    // Failed / skipped emails: the same batch (with "Gửi lại") until "Gửi thư khác".
    for (const res of [failed, skipped, empty]) {
      const w = finished(res);
      expect(w.status).toBe("done");
      expect(watchOnReopen(w)).toBe(w);
    }
    // Running or stopped batches keep showing their progress; no batch stays none.
    const running = applyPoll(start, batchFixture(), T0 + 3_000);
    const stopped = applyPollError(running, { status: 403, message: "Không có quyền." }, T0 + 6_000);
    expect(watchOnReopen(start)).toBe(start);
    expect(watchOnReopen(running)).toBe(running);
    expect(watchOnReopen(stopped)).toBe(stopped);
    expect(watchOnReopen(undefined)).toBeUndefined();
    // Applied per level like the hook does: the other level's batch is untouched.
    const ws = { THCS: finished(failed), THPT: finished(allSent) };
    expect(updateLevelWatch(ws, "THCS", watchOnReopen)).toBe(ws);
    expect(updateLevelWatch(ws, "THPT", watchOnReopen)).toEqual({ THCS: ws.THCS });
  });

  it("keeps exactly the batches whose toast says to reopen “Gửi email”", () => {
    for (const res of [allSent, failed, skipped, empty]) {
      const hinted = batchToast(res, LABEL).description?.includes(BATCH_RETRY_HINT) ?? false;
      expect(batchNeedsAttention(res)).toBe(hinted);
      expect(watchOnReopen(finished(res)) !== undefined).toBe(hinted);
    }
  });

  it("the progress view says what is left and how to start a new message", () => {
    expect(batchFinishedNotice(allSent)).toBeUndefined();
    expect(batchFinishedNotice(batchFixture())).toBeUndefined();
    expect(batchFinishedNotice(failed)).toEqual({
      title: "Còn 1 thư chưa gửi được",
      text: "Khắc phục lỗi rồi bấm “Gửi lại” ở từng thư. Kết quả lần gửi này được giữ lại khi bạn đóng và mở lại cửa sổ, cho đến khi bấm “Gửi thư khác”.",
    });
    expect(batchFinishedNotice(batchFixture({ done: true, counts: { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 2, SKIPPED: 1 } }))?.title).toBe("Còn 3 thư chưa gửi được");
    expect(batchFinishedNotice(empty)).toEqual({ title: "Lần gửi này không có thư nào", text: "Bấm “Gửi thư khác” để soạn thư mới." });
  });
});
