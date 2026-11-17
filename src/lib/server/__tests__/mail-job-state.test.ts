/** Outbox job life cycle (pure, no emulators): due jobs, claims and leases, outcomes, backoff, "Gửi lại". */
import { describe, expect, it } from "vitest";
import { MAIL_JOB_MAX_ATTEMPTS } from "../../constants";
import { MAIL_RETRY_DELAYS_MS } from "../../mail/policy";
import type { MailJob } from "../../types";
import {
  JOB_STATE_MSG,
  MAIL_LEASE_MS,
  claimJob,
  compareOldestFirst,
  failedJob,
  failureOf,
  isJobDue,
  outcomeOf,
  releasedJob,
  requeuedJob,
  sentJob,
  skippedJob,
} from "../mail/job-state";
import { MailSendError } from "../mail/types";

const NOW = Date.parse("2026-10-21T03:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

function job(over: Partial<MailJob> = {}): MailJob {
  return {
    id: "8217000000000_abcdefgh",
    levelId: "THCS",
    kind: "TEST",
    status: "PENDING",
    to: ["gv.6a01@example.edu.vn"],
    cc: [],
    payload: { kind: "TEST" },
    attempts: 0,
    nextAttemptAt: iso(NOW - 1),
    createdAt: iso(NOW - 10_000),
    createdBy: "admin",
    createdByName: "Quản trị",
    ...over,
  };
}

describe("isJobDue", () => {
  it("PENDING once nextAttemptAt is reached; SENDING only after its lease expired; final states never", () => {
    expect(isJobDue(job(), NOW)).toBe(true);
    expect(isJobDue(job({ nextAttemptAt: iso(NOW) }), NOW)).toBe(true);
    expect(isJobDue(job({ nextAttemptAt: iso(NOW + 1) }), NOW)).toBe(false);
    expect(isJobDue(job({ nextAttemptAt: "garbage" }), NOW)).toBe(true);
    expect(isJobDue(job({ status: "SENDING", leaseUntil: iso(NOW + 60_000) }), NOW)).toBe(false);
    expect(isJobDue(job({ status: "SENDING", leaseUntil: iso(NOW - 1) }), NOW)).toBe(true);
    expect(isJobDue(job({ status: "SENDING" }), NOW)).toBe(true);
    for (const status of ["SENT", "FAILED", "SKIPPED"] as const) expect(isJobDue(job({ status }), NOW)).toBe(false);
  });
});

describe("claimJob", () => {
  it("PENDING → SENDING with attempts + 1 and a 6-minute lease (longer than any function life: maxDuration 300 s)", () => {
    const r = claimJob(job({ attempts: 2, lastError: "Lần trước lỗi" }), NOW);
    expect(r?.kind).toBe("claimed");
    expect(r?.job).toMatchObject({ status: "SENDING", attempts: 3, leaseUntil: iso(NOW + MAIL_LEASE_MS), lastError: "Lần trước lỗi" });
    expect(MAIL_LEASE_MS).toBe(360_000);
    expect(MAIL_LEASE_MS).toBeGreaterThan(300_000 + 30_000);
  });

  it("null when not due (held by another drain, backing off, already sent)", () => {
    expect(claimJob(job({ status: "SENDING", leaseUntil: iso(NOW + 1000) }), NOW)).toBeNull();
    expect(claimJob(job({ nextAttemptAt: iso(NOW + 60_000) }), NOW)).toBeNull();
    expect(claimJob(job({ status: "SENT" }), NOW)).toBeNull();
  });

  it("re-claims an interrupted job (expired lease); without attempts left it becomes FAILED", () => {
    for (const kind of ["NOTICE", "REPORT"] as const) {
      const again = claimJob(job({ kind, status: "SENDING", attempts: 1, leaseUntil: iso(NOW - 1) }), NOW);
      expect(again).toMatchObject({ kind: "claimed", job: { status: "SENDING", attempts: 2 } });
      const exhausted = claimJob(job({ kind, status: "SENDING", attempts: MAIL_JOB_MAX_ATTEMPTS, leaseUntil: iso(NOW - 1) }), NOW);
      expect(exhausted?.kind).toBe("failed");
      expect(exhausted?.job).toMatchObject({ status: "FAILED", lastError: JOB_STATE_MSG.interrupted });
      expect("leaseUntil" in (exhausted?.job ?? {})).toBe(false);
    }
  });

  it("an interrupted TEST message (expired lease) is FAILED at once – its failure is final, never sent later", () => {
    const r = claimJob(job({ kind: "TEST", status: "SENDING", attempts: 1, leaseUntil: iso(NOW - 1) }), NOW);
    expect(r?.kind).toBe("failed");
    expect(r?.job).toMatchObject({ status: "FAILED", attempts: 1, lastError: JOB_STATE_MSG.testInterrupted });
    expect("leaseUntil" in (r?.job ?? {})).toBe(false);
    // "Gửi lại" (requeuedJob → PENDING) still claims it normally.
    expect(claimJob(requeuedJob({ ...job({ kind: "TEST" }), status: "FAILED" }, NOW), NOW)?.kind).toBe("claimed");
  });
});

describe("outcomes", () => {
  const claimed = job({ status: "SENDING", attempts: 1, leaseUntil: iso(NOW + MAIL_LEASE_MS), lastError: "cũ", skipReason: "cũ" });

  it("sentJob stores recipients, subject and sentAt; drops lease and previous errors", () => {
    const sent = sentJob(claimed, { to: ["a@example.edu.vn"], cc: ["b@example.edu.vn"], subject: "[Nền nếp] Thử" }, NOW);
    expect(sent).toMatchObject({ status: "SENT", to: ["a@example.edu.vn"], cc: ["b@example.edu.vn"], subject: "[Nền nếp] Thử", sentAt: iso(NOW), attempts: 1 });
    for (const k of ["leaseUntil", "lastError", "skipReason"]) expect(k in sent).toBe(false);
    expect(sent.payload).toEqual({ kind: "TEST" });
  });

  it("skippedJob keeps the reason", () => {
    const s = skippedJob(claimed, "Lớp 6A01 chưa có email GVCN");
    expect(s).toMatchObject({ status: "SKIPPED", skipReason: "Lớp 6A01 chưa có email GVCN" });
    expect("leaseUntil" in s).toBe(false);
    expect("lastError" in s).toBe(false);
  });

  it("a retryable failure backs off by the policy (attempt n → delay n), or by Retry-After when longer", () => {
    for (let attempts = 1; attempts < MAIL_JOB_MAX_ATTEMPTS; attempts++) {
      const next = failedJob({ ...claimed, attempts }, { message: "Bận", retryable: true }, NOW);
      expect(next).toMatchObject({ status: "PENDING", attempts, lastError: "Bận", nextAttemptAt: iso(NOW + MAIL_RETRY_DELAYS_MS[attempts - 1]) });
      expect("leaseUntil" in next).toBe(false);
    }
    const throttled = failedJob(claimed, { message: "429", retryable: true, retryAfterMs: 10 * 60_000 }, NOW);
    expect(throttled.nextAttemptAt).toBe(iso(NOW + 10 * 60_000));
    const shortWait = failedJob(claimed, { message: "429", retryable: true, retryAfterMs: 5_000 }, NOW);
    expect(shortWait.nextAttemptAt).toBe(iso(NOW + 60_000));
  });

  it("FAILED when not retryable, on the last attempt, or for a final (synchronous) send", () => {
    expect(failedJob(claimed, { message: "403", retryable: false }, NOW)).toMatchObject({ status: "FAILED", lastError: "403" });
    expect(failedJob({ ...claimed, attempts: MAIL_JOB_MAX_ATTEMPTS }, { message: "Bận", retryable: true }, NOW).status).toBe("FAILED");
    expect(failedJob(claimed, { message: "Bận", retryable: true }, NOW, { final: true }).status).toBe("FAILED");
  });

  it("failureOf: MailSendError as is; anything else is a retryable system error", () => {
    expect(failureOf(new MailSendError("Bận", true, 30_000, 429))).toEqual({ message: "Bận", retryable: true, retryAfterMs: 30_000 });
    expect(failureOf(new MailSendError("Sai quyền", false))).toEqual({ message: "Sai quyền", retryable: false });
    expect(failureOf(new Error("boom"))).toEqual({ message: JOB_STATE_MSG.unexpected("boom"), retryable: true });
    expect(failureOf("x").message).toBe("Lỗi hệ thống khi chuẩn bị hoặc gửi thư (x).");
    expect(failureOf(undefined).message).toBe("Lỗi hệ thống khi chuẩn bị hoặc gửi thư.");
  });

  it("releasedJob (drain out of time before the send): PENDING now, the claim's attempt not counted, last error kept", () => {
    const r = releasedJob({ ...claimed, attempts: 3 }, NOW);
    expect(r).toMatchObject({ status: "PENDING", attempts: 2, nextAttemptAt: iso(NOW), lastError: "cũ" });
    expect("leaseUntil" in r).toBe(false);
    expect(releasedJob({ ...claimed, attempts: 0 }, NOW).attempts).toBe(0);
  });

  it("requeuedJob: PENDING now, attempts 0, previous outcome cleared", () => {
    const failed = { ...claimed, status: "FAILED" as const, attempts: 5, sentAt: iso(NOW - 5) };
    const r = requeuedJob(failed, NOW);
    expect(r).toMatchObject({ status: "PENDING", attempts: 0, nextAttemptAt: iso(NOW) });
    for (const k of ["leaseUntil", "lastError", "skipReason", "sentAt"]) expect(k in r).toBe(false);
  });

  it("outcomeOf maps final states to drain counters", () => {
    expect(outcomeOf("SENT")).toBe("sent");
    expect(outcomeOf("SKIPPED")).toBe("skipped");
    expect(outcomeOf("FAILED")).toBe("failed");
    expect(outcomeOf("PENDING")).toBe("retried");
    expect(outcomeOf("SENDING")).toBeUndefined();
  });
});

describe("compareOldestFirst", () => {
  it("orders by createdAt, then by inverted id (larger id = older)", () => {
    const a = { id: "8000000000000_a", createdAt: iso(NOW) };
    const b = { id: "7999999999999_b", createdAt: iso(NOW) };
    const c = { id: "9000000000000_c", createdAt: iso(NOW - 1) };
    expect([a, b, c].sort(compareOldestFirst).map((x) => x.id)).toEqual(["9000000000000_c", "8000000000000_a", "7999999999999_b"]);
  });
});
