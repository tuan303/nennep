/**
 * Time limits of the mail pipeline (pure, no emulators, no real browser): route maxDuration vs lease and drain budgets,
 * the Chromium function group of Vercel, deadline-aware Graph requests (out of time before a request, the minimum of
 * sendMail, the shared token request) and PDF steps, permanent vs transient Chromium launch failures, bounded browser close, the once-per-process
 * Chromium extraction, the PDF-less fallback of report emails, the "Gửi lại" rate limit.
 */
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Browser } from "puppeteer-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../../../next.config";
import { REPORT_PDF_MAX_ATTEMPTS } from "../../constants";
import type { SessionUser } from "../auth";
import { ApiError } from "../errors";
import { checkRateLimit, resetRateLimits } from "../rate-limit";
import { DRAIN_CLAIM_RESERVE_MS, LONG_DRAIN_MS, SEND_MIN_BUDGET_MS, SYNC_SEND_BUDGET_MS } from "../mail/drain";
import {
  GRAPH_DEADLINE_MARGIN_MS,
  GRAPH_MAX_REQUEST_BYTES,
  GRAPH_MIN_REQUEST_MS,
  GRAPH_MIN_SEND_MS,
  GRAPH_MIN_SEND_SIZE_MS,
  GRAPH_MSG,
  createGraphTransport,
  graphMinSendMs,
  graphRequestBytes,
} from "../mail/graph";
import { MAIL_LEASE_MS } from "../mail/job-state";
import { NOTICE_DRAIN_MS, noticeDrainCanClaim } from "../mail/notice-drain";
import { MAIL_RETRY_RATE, retryMailJob } from "../mail/outbox";
import {
  BROWSER_CLOSE_TIMEOUT_MS,
  BrowserLaunchError,
  PDF_MIN_TIMEOUT_MS,
  TransientLaunchError,
  closeBrowserBounded,
  isPermanentLaunchFailure,
  pdfTimeLeft,
  removeChromiumExtraction,
  renderReportPdf,
  resetChromiumExecutableForTests,
  serverlessExecutablePath,
  setBrowserLauncherForTests,
  withBrowser,
} from "../mail/pdf";
import { sendWithoutPdf } from "../mail/report-job";
import { MailSendError, OutOfTimeError, type GraphTransportConfig, type OutgoingMail } from "../mail/types";

const T0 = Date.parse("2026-10-21T03:00:00.000Z");

/* ------------------------------ route configs ------------------------------ */

const API_DIR = path.resolve(__dirname, "../../../app/api");

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? routeFiles(p) : e.name === "route.ts" ? [p] : [];
  });
}

interface RouteInfo {
  route: string;
  maxDuration?: number;
  source: string;
}

const ROUTES: RouteInfo[] = routeFiles(API_DIR).map((file) => {
  const source = readFileSync(file, "utf8");
  const m = /export const maxDuration = (\d+);/.exec(source);
  return { route: `/api/${path.relative(API_DIR, path.dirname(file)).split(path.sep).join("/")}`, maxDuration: m ? Number(m[1]) : undefined, source };
});

/** next.config globs match anywhere in the route; "*" stands for one segment. */
const globMatches = (glob: string, route: string) => new RegExp(glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+")).test(route);
const includes = Object.keys(nextConfig.outputFileTracingIncludes ?? {});
const excludes = Object.keys(nextConfig.outputFileTracingExcludes ?? {});
const bundlesChromium = (route: string) => includes.some((g) => globMatches(g, route)) && !excludes.some((g) => globMatches(g, route));

describe("route configuration", () => {
  it("every route that bundles Chromium uses maxDuration = 300, and no other route does (Vercel groups equal configs)", () => {
    const chromium = ROUTES.filter((r) => bundlesChromium(r.route)).map((r) => r.route).sort();
    expect(chromium).toEqual(["/api/cron/mail", "/api/mail/batches/[id]", "/api/mail/jobs/[id]/retry", "/api/reports/mail", "/api/reports/pdf"]);
    for (const r of ROUTES) {
      if (bundlesChromium(r.route)) expect(r.maxDuration, r.route).toBe(300);
      else expect(r.maxDuration, r.route).not.toBe(300);
    }
  });

  it("a lease outlives the longest function, so an expired lease always means its drain is dead", () => {
    const longest = Math.max(...ROUTES.map((r) => r.maxDuration ?? 0)) * 1000;
    expect(longest).toBe(300_000);
    expect(MAIL_LEASE_MS).toBeGreaterThan(longest + 30_000);
  });

  it("drain budgets fit inside the maxDuration of the routes that schedule them", () => {
    expect(LONG_DRAIN_MS + BROWSER_CLOSE_TIMEOUT_MS).toBeLessThan(300_000);
    const noticeRoutes = ROUTES.filter((r) => /noticeHooks|scheduleNoticeCatchUp/.test(r.source));
    expect(noticeRoutes.length).toBeGreaterThanOrEqual(7);
    for (const r of noticeRoutes) {
      expect(r.maxDuration, r.route).toBeDefined();
      expect(NOTICE_DRAIN_MS + 5_000, r.route).toBeLessThan((r.maxDuration ?? 0) * 1000);
    }
    expect(SYNC_SEND_BUDGET_MS).toBeLessThan(60_000);
    // A claimed job always has time to be sent.
    for (const reserve of Object.values(DRAIN_CLAIM_RESERVE_MS)) expect(reserve).toBeGreaterThan(SEND_MIN_BUDGET_MS);
    expect(DRAIN_CLAIM_RESERVE_MS.REPORT).toBeGreaterThan(SEND_MIN_BUDGET_MS + 2 * PDF_MIN_TIMEOUT_MS);
    // NOTICE: build (≤ 2 s) + pacing (2.2 s) still leave SEND_MIN_BUDGET_MS; the 50 s drain of a route claims for 30 s.
    expect(DRAIN_CLAIM_RESERVE_MS.NOTICE).toBeGreaterThanOrEqual(SEND_MIN_BUDGET_MS + 2_000 + 2_200);
    expect(DRAIN_CLAIM_RESERVE_MS.NOTICE).toBeLessThanOrEqual(20_000);
    expect(noticeDrainCanClaim(T0, T0 + 30_000)).toBe(true);
    expect(noticeDrainCanClaim(T0, T0 + 30_001)).toBe(false);
  });
});

/* ------------------------------ Graph deadline ------------------------------ */

const CONFIG: GraphTransportConfig = { tenantId: "tenant-test", clientId: "client-test", clientSecret: "secret-test", sender: "nennep@example.edu.vn", senderName: "Nền nếp NSHM" };
const MAIL: OutgoingMail = { to: ["gv.6a01@example.edu.vn"], cc: [], subject: "[Nền nếp] Thử", html: "<p>Xin chào</p>" };
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Graph transport – deadline", () => {
  const TOKEN_URL = "https://login.microsoftonline.com/tenant-test/oauth2/v2.0/token";
  const SEND_URL = "https://graph.microsoft.com/v1.0/users/nennep@example.edu.vn/sendMail";
  const tokenReply = () => json(200, { token_type: "Bearer", expires_in: 3599, access_token: "tok-1" });
  /** Minimum time of the sendMail request of MAIL (the body the transport builds, with the sender name). */
  const MIN_SEND = graphMinSendMs(graphRequestBytes(MAIL, CONFIG));
  /** Deadline that leaves `ms` after the margin and the minimum of the send of MAIL, counted from `from`. */
  const deadlineLeaving = (ms: number, from = T0) => from + GRAPH_DEADLINE_MARGIN_MS + MIN_SEND + ms;

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("graphMinSendMs: 10 s, up to 3 s more in proportion to the request size; the drain's pre-send check leaves it", () => {
    expect(graphMinSendMs(0)).toBe(GRAPH_MIN_SEND_MS);
    expect(GRAPH_MIN_SEND_MS).toBe(10_000);
    expect(graphMinSendMs(GRAPH_MAX_REQUEST_BYTES / 2)).toBe(GRAPH_MIN_SEND_MS + GRAPH_MIN_SEND_SIZE_MS / 2);
    expect(graphMinSendMs(GRAPH_MAX_REQUEST_BYTES)).toBe(GRAPH_MIN_SEND_MS + GRAPH_MIN_SEND_SIZE_MS);
    expect(graphMinSendMs(10 * GRAPH_MAX_REQUEST_BYTES)).toBe(GRAPH_MIN_SEND_MS + GRAPH_MIN_SEND_SIZE_MS);
    expect(MIN_SEND).toBeGreaterThanOrEqual(GRAPH_MIN_SEND_MS);
    expect(MIN_SEND).toBeLessThan(GRAPH_MIN_SEND_MS + 10);
    // A job that passes assertTimeToSend (≥ SEND_MIN_BUDGET_MS left) can always start its send with a cached token.
    expect(SEND_MIN_BUDGET_MS - GRAPH_DEADLINE_MARGIN_MS).toBeGreaterThanOrEqual(graphMinSendMs(GRAPH_MAX_REQUEST_BYTES));
  });

  it("requests nothing when the deadline is too close: OutOfTimeError (nothing sent, attempt not counted)", async () => {
    let calls = 0;
    const fetch = (async () => {
      calls += 1;
      return json(200, {});
    }) as typeof globalThis.fetch;
    const t = createGraphTransport(CONFIG, { fetch, now: () => T0 });
    const e = await t.send(MAIL, { deadline: T0 + 2_500 }).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(OutOfTimeError);
    expect(e).not.toBeInstanceOf(MailSendError);
    // Less than GRAPH_MIN_REQUEST_MS to wait for a token after the minimum of the send: no token request either.
    const tooShort = await t.send(MAIL, { deadline: deadlineLeaving(GRAPH_MIN_REQUEST_MS - 1) }).catch((err: unknown) => err);
    expect(tooShort).toBeInstanceOf(OutOfTimeError);
    expect(calls).toBe(0);
  });

  it("with GRAPH_MIN_REQUEST_MS to wait for the token, the token request starts and the send follows", async () => {
    const urls: string[] = [];
    const fetch = (async (url: string) => {
      urls.push(url);
      return url === TOKEN_URL ? tokenReply() : new Response(null, { status: 202 });
    }) as typeof globalThis.fetch;
    const t = createGraphTransport(CONFIG, { fetch, now: () => T0 });
    await t.send(MAIL, { deadline: deadlineLeaving(GRAPH_MIN_REQUEST_MS) });
    expect(urls).toEqual([TOKEN_URL, SEND_URL]);
  });

  it("never starts sendMail with less than its minimum left (cached token): OutOfTimeError, nothing requested", async () => {
    const urls: string[] = [];
    const fetch = (async (url: string) => {
      urls.push(url);
      return url === TOKEN_URL ? tokenReply() : new Response(null, { status: 202 });
    }) as typeof globalThis.fetch;
    const timeouts = vi.spyOn(AbortSignal, "timeout");
    const t = createGraphTransport(CONFIG, { fetch, now: () => T0 });
    await t.send(MAIL); // caches the token
    expect(urls).toEqual([TOKEN_URL, SEND_URL]);
    const e = await t.send(MAIL, { deadline: T0 + GRAPH_DEADLINE_MARGIN_MS + MIN_SEND - 1 }).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(OutOfTimeError);
    expect(urls).toHaveLength(2);
    // Exactly the minimum: the send starts, its timeout ends GRAPH_DEADLINE_MARGIN_MS before the deadline.
    await t.send(MAIL, { deadline: T0 + GRAPH_DEADLINE_MARGIN_MS + MIN_SEND });
    expect(urls).toEqual([TOKEN_URL, SEND_URL, SEND_URL]);
    expect(timeouts.mock.calls.at(-1)).toEqual([MIN_SEND]);
  });

  it("a big request (a ~3 MB report PDF) needs more time than a small one", async () => {
    const big: OutgoingMail = { ...MAIL, attachments: [{ name: "bao-cao.pdf", contentType: "application/pdf", contentBase64: "A".repeat(3_000_000) }] };
    const bigMin = graphMinSendMs(graphRequestBytes(big, CONFIG));
    expect(bigMin).toBeGreaterThan(MIN_SEND + 2_000);
    const urls: string[] = [];
    const fetch = (async (url: string) => {
      urls.push(url);
      return url === TOKEN_URL ? tokenReply() : new Response(null, { status: 202 });
    }) as typeof globalThis.fetch;
    const t = createGraphTransport(CONFIG, { fetch, now: () => T0 });
    const deadline = T0 + GRAPH_DEADLINE_MARGIN_MS + MIN_SEND + 1_000;
    await t.send(MAIL, { deadline });
    expect(await t.send(big, { deadline }).catch((err: unknown) => err)).toBeInstanceOf(OutOfTimeError);
    expect(urls).toEqual([TOKEN_URL, SEND_URL]);
    await t.send(big, { deadline: T0 + GRAPH_DEADLINE_MARGIN_MS + bigMin });
    expect(urls).toEqual([TOKEN_URL, SEND_URL, SEND_URL]);
  });

  it("waits for the token only until the minimum of the send is left: 15 s budget, slow token → OutOfTimeError after ~3 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const urls: string[] = [];
    let releaseToken: () => void = () => undefined;
    const fetch = ((url: string) => {
      urls.push(url);
      if (url === TOKEN_URL) return new Promise<Response>((resolve) => (releaseToken = () => resolve(tokenReply())));
      return Promise.resolve(new Response(null, { status: 202 }));
    }) as typeof globalThis.fetch;
    const t = createGraphTransport(CONFIG, { fetch, now: () => T0 });
    // A notice that just passed the drain's pre-send check (SEND_MIN_BUDGET_MS left), no cached token.
    const wait = SEND_MIN_BUDGET_MS - GRAPH_DEADLINE_MARGIN_MS - MIN_SEND;
    expect(wait).toBeGreaterThanOrEqual(GRAPH_MIN_REQUEST_MS);
    let outcome: unknown = "pending";
    const sending = t.send(MAIL, { deadline: T0 + SEND_MIN_BUDGET_MS }).then(
      () => (outcome = "sent"),
      (err: unknown) => (outcome = err),
    );
    await vi.advanceTimersByTimeAsync(wait - 1);
    expect(outcome).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    await sending;
    expect(outcome).toBeInstanceOf(OutOfTimeError);
    expect(urls).toEqual([TOKEN_URL]); // sendMail never started with the few seconds left
    // The token request went on: once it answers, the next send uses it.
    releaseToken();
    await t.send(MAIL);
    expect(urls).toEqual([TOKEN_URL, SEND_URL]);
  });

  it("no time left before sendMail after the token (it came back later than its wait allowed): OutOfTimeError", async () => {
    const clock = { t: T0 };
    const urls: string[] = [];
    let tokenMs = 5_500;
    const fetch = (async (url: string) => {
      urls.push(url);
      if (url !== TOKEN_URL) return new Response(null, { status: 202 });
      clock.t += tokenMs; // a slow token endpoint (the clock moved further than the 5 s wait, e.g. a blocked event loop)
      return tokenReply();
    }) as typeof globalThis.fetch;
    const t = createGraphTransport(CONFIG, { fetch, now: () => clock.t });
    const e = await t.send(MAIL, { deadline: deadlineLeaving(5_000) }).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(OutOfTimeError);
    expect(urls).toEqual([TOKEN_URL]);
    // A token inside its wait leaves the send at least its minimum.
    const timeouts = vi.spyOn(AbortSignal, "timeout");
    const fresh = createGraphTransport(CONFIG, { fetch, now: () => clock.t });
    tokenMs = 4_000;
    await fresh.send(MAIL, { deadline: deadlineLeaving(5_000, clock.t) });
    expect(urls).toEqual([TOKEN_URL, TOKEN_URL, SEND_URL]);
    expect(timeouts.mock.calls.map((c) => c[0])).toEqual([30_000, MIN_SEND + 1_000]);
  });

  it("the fresh-token retry of a 401 is skipped when the token wait has no time left: OutOfTimeError", async () => {
    const clock = { t: T0 };
    const replies = [
      () => tokenReply(),
      () => {
        clock.t += 4_500; // 500 ms left to wait for a new token after the minimum of the send
        return json(401, { error: { code: "InvalidAuthenticationToken", message: "expired" } });
      },
    ];
    let calls = 0;
    const fetch = (async () => {
      calls += 1;
      const reply = replies.shift();
      if (!reply) throw new Error("unexpected request");
      return reply();
    }) as typeof globalThis.fetch;
    const t = createGraphTransport(CONFIG, { fetch, now: () => clock.t });
    const e = await t.send(MAIL, { deadline: deadlineLeaving(5_000) }).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(OutOfTimeError);
    expect(calls).toBe(2);
  });

  it("after the fresh token of a 401, sendMail is not started again with less than its minimum: OutOfTimeError", async () => {
    const clock = { t: T0 };
    const urls: string[] = [];
    const replies = [
      () => tokenReply(),
      () => {
        clock.t += 1_000;
        return json(401, { error: { code: "InvalidAuthenticationToken", message: "expired" } });
      },
      () => {
        clock.t += 4_500; // the new token arrives 500 ms after the minimum of the send was all that was left
        return json(200, { token_type: "Bearer", expires_in: 3599, access_token: "tok-2" });
      },
    ];
    const fetch = (async (url: string) => {
      urls.push(url);
      const reply = replies.shift();
      if (!reply) throw new Error("unexpected request");
      return reply();
    }) as typeof globalThis.fetch;
    const t = createGraphTransport(CONFIG, { fetch, now: () => clock.t });
    const e = await t.send(MAIL, { deadline: deadlineLeaving(5_000) }).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(OutOfTimeError);
    expect(urls).toEqual([TOKEN_URL, SEND_URL, TOKEN_URL]);
  });

  it("shortens the sendMail timeout to end before the deadline (a request that started and timed out is retryable)", async () => {
    const signals: Array<AbortSignal | undefined> = [];
    const fetch = ((url: string, init?: RequestInit) => {
      signals.push(init?.signal ?? undefined);
      if (url === TOKEN_URL) return Promise.resolve(tokenReply());
      return Promise.reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    }) as typeof globalThis.fetch;
    const timeouts = vi.spyOn(AbortSignal, "timeout");
    const t = createGraphTransport(CONFIG, { fetch, now: () => T0 });
    const e = await t.send(MAIL, { deadline: deadlineLeaving(1_700) }).catch((err: unknown) => err);
    expect(e).toMatchObject({ retryable: true, message: GRAPH_MSG.network("hết thời gian chờ") });
    // The token request keeps the full 30 s; sendMail gets what is left before the deadline minus the margin.
    expect(timeouts.mock.calls.map((c) => c[0])).toEqual([30_000, MIN_SEND + 1_700]);
    expect(signals).toHaveLength(2);
    signals.forEach((signal, i) => expect(signal).toBe(timeouts.mock.results[i]?.value)); // the signals given to fetch
  });

  it("the shared token request keeps its full timeout: a caller with a short budget gives up alone, the others get the token", async () => {
    const tokenSignals: AbortSignal[] = [];
    let releaseToken: () => void = () => undefined;
    const sent: string[] = [];
    const fetch = ((url: string, init?: RequestInit) => {
      if (url.includes("/oauth2/")) {
        if (init?.signal) tokenSignals.push(init.signal);
        return new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          releaseToken = () => resolve(json(200, { token_type: "Bearer", expires_in: 3599, access_token: "tok-1" }));
        });
      }
      sent.push(String((init?.headers as Record<string, string>).authorization));
      return Promise.resolve(new Response(null, { status: 202 }));
    }) as typeof globalThis.fetch;
    const t = createGraphTransport(CONFIG, { fetch });
    const started = Date.now();
    // The first caller (it starts the token request) may wait 1.2 s for it; the second one 45 s in all.
    const short = t.send(MAIL, { deadline: deadlineLeaving(1_200, started) }).catch((err: unknown) => err);
    const long = t.send(MAIL, { deadline: started + 45_000 }).catch((err: unknown) => err);
    const shortResult = await short;
    expect(shortResult).toBeInstanceOf(OutOfTimeError);
    expect(Date.now() - started).toBeLessThan(5_000);
    // One shared token request, not aborted by the short caller giving up.
    expect(tokenSignals).toHaveLength(1);
    expect(tokenSignals[0].aborted).toBe(false);
    releaseToken();
    expect(await long).toBeUndefined();
    expect(sent).toEqual(["Bearer tok-1"]);
    expect(tokenSignals).toHaveLength(1);
  });
});

/* ----------------------------------- PDF ----------------------------------- */

describe("PDF – deadline, browser launch and close", () => {
  const savedChrome = process.env.CHROME_EXECUTABLE_PATH;
  afterEach(() => {
    if (savedChrome === undefined) delete process.env.CHROME_EXECUTABLE_PATH;
    else process.env.CHROME_EXECUTABLE_PATH = savedChrome;
    resetChromiumExecutableForTests();
  });

  it("time left: deadline minus a 5 s margin; OutOfTimeError below 10 s", () => {
    expect(pdfTimeLeft(T0 + 60_000, T0)).toBe(55_000);
    expect(pdfTimeLeft(T0 + 15_000, T0)).toBe(10_000);
    expect(() => pdfTimeLeft(T0 + 14_999, T0)).toThrow(OutOfTimeError);
  });

  it("renderReportPdf starts nothing (no print job, no browser) when the deadline is too close", async () => {
    const spec = { levelId: "THCS" as const, mode: "week" as const, key: "2026-10-19", to: "bgh", detail: false, addressee: "BGH", viewerUid: "u", preparedBy: "x" };
    await expect(renderReportPdf(spec, { baseUrl: "https://x.test", cache: new Map(), onFinish: () => undefined, deadline: Date.now() + 1_000 })).rejects.toBeInstanceOf(OutOfTimeError);
  });

  it("a browser that cannot start → BrowserLaunchError, cached for the drain (fail fast); too late → OutOfTimeError", async () => {
    process.env.CHROME_EXECUTABLE_PATH = path.join(tmpdir(), "nennep-no-such-chrome", "chrome");
    const cache = new Map<string, unknown>();
    const finishers: Array<() => Promise<void>> = [];
    const onFinish = (fn: () => Promise<void>) => finishers.push(fn);
    const first = await withBrowser(cache, onFinish, Date.now() + 120_000).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(BrowserLaunchError);
    expect(await withBrowser(cache, onFinish, Date.now() + 120_000).catch((e: unknown) => e)).toBe(first);
    expect(finishers).toHaveLength(1);
    await finishers[0]();
    expect(cache.size).toBe(0);

    await expect(withBrowser(new Map(), onFinish, Date.now() + 1_000)).rejects.toBeInstanceOf(OutOfTimeError);
  });

  it("isPermanentLaunchFailure: missing executable / shared library always, early exit only before any browser started", () => {
    const exitedEarly = (stderr: string) =>
      new Error(`Failed to launch the browser process:  Code: 127\n\nstderr:\n${stderr}\n\nTROUBLESHOOTING: https://pptr.dev/troubleshooting\n`);
    const timeout = Object.assign(new Error("Timed out after 30000 ms while waiting for the WS endpoint URL to appear in stdout!"), { name: "TimeoutError" });
    expect(isPermanentLaunchFailure(new Error("Browser was not found at the configured executablePath (/tmp/chromium)"), true)).toBe(true);
    expect(isPermanentLaunchFailure(Object.assign(new Error("spawn /tmp/chromium ENOENT"), { code: "ENOENT" }), true)).toBe(true);
    expect(isPermanentLaunchFailure(new Error("Failed to launch the browser process:  spawn /tmp/chromium EACCES"), true)).toBe(true);
    const sharedLib = exitedEarly("/tmp/chromium: error while loading shared libraries: libnss3.so: cannot open shared object file: No such file or directory");
    expect(isPermanentLaunchFailure(sharedLib, true)).toBe(true);
    expect(isPermanentLaunchFailure(exitedEarly(""), false)).toBe(true);
    expect(isPermanentLaunchFailure(exitedEarly(""), true)).toBe(false);
    // Transient: timeouts, resources (also on the very first launch), unknown errors.
    expect(isPermanentLaunchFailure(timeout, false)).toBe(false);
    expect(isPermanentLaunchFailure(new Error("Failed to launch the browser process:  spawn ENOMEM"), false)).toBe(false);
    expect(isPermanentLaunchFailure(Object.assign(new Error("spawn EAGAIN"), { code: "EAGAIN" }), false)).toBe(false);
    expect(isPermanentLaunchFailure(new Error("Failed to launch the browser process:  spawn /tmp/chromium ETXTBSY"), false)).toBe(false);
    expect(isPermanentLaunchFailure(new Error("Protocol error: Target closed"), false)).toBe(false);
  });

  it("a transient launch failure is not cached: the next job launches again; a permanent one stays cached", async () => {
    process.env.CHROME_EXECUTABLE_PATH = path.join(tmpdir(), "nennep-test-chrome");
    let launches = 0;
    const failures: Error[] = [
      Object.assign(new Error("Timed out after 30000 ms while waiting for the WS endpoint URL to appear in stdout!"), { name: "TimeoutError" }),
      new Error("Failed to launch the browser process:  spawn ENOMEM"),
    ];
    const fakeBrowser = { connected: true } as unknown as Browser;
    setBrowserLauncherForTests(async () => {
      launches += 1;
      const failure = failures.shift();
      if (failure) throw failure;
      return fakeBrowser;
    });
    try {
      const cache = new Map<string, unknown>();
      const finishers: Array<() => Promise<void>> = [];
      const onFinish = (fn: () => Promise<void>) => finishers.push(fn);
      const deadline = Date.now() + 120_000;
      const first = await withBrowser(cache, onFinish, deadline).catch((e: unknown) => e);
      expect(first).toBeInstanceOf(TransientLaunchError);
      expect(cache.size).toBe(0);
      expect(await withBrowser(cache, onFinish, deadline).catch((e: unknown) => e)).toBeInstanceOf(TransientLaunchError);
      expect(await withBrowser(cache, onFinish, deadline)).toBe(fakeBrowser);
      expect(await withBrowser(cache, onFinish, deadline)).toBe(fakeBrowser);
      expect(launches).toBe(3);

      // Before any browser of the process started, an early exit is permanent – cached, no relaunch.
      setBrowserLauncherForTests(async () => {
        launches += 1;
        throw new Error("Failed to launch the browser process:  Code: 1\n\nstderr:\n");
      }, false);
      const other = new Map<string, unknown>();
      const permanent = await withBrowser(other, onFinish, deadline).catch((e: unknown) => e);
      expect(permanent).toBeInstanceOf(BrowserLaunchError);
      expect(await withBrowser(other, onFinish, deadline).catch((e: unknown) => e)).toBe(permanent);
      expect(launches).toBe(4);
    } finally {
      setBrowserLauncherForTests(null);
    }
  });

  it("a real Chromium that exits before its DevTools endpoint: permanent on the process's first launch, transient after one started", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "nennep-exit-chrome-"));
    try {
      const script = path.join(dir, "chrome");
      writeFileSync(script, "#!/bin/sh\nexit 1\n");
      chmodSync(script, 0o755);
      process.env.CHROME_EXECUTABLE_PATH = script;
      const onFinish = () => undefined;
      setBrowserLauncherForTests(null, false);
      expect(await withBrowser(new Map(), onFinish, Date.now() + 120_000).catch((e: unknown) => e)).toBeInstanceOf(BrowserLaunchError);
      setBrowserLauncherForTests(null, true);
      expect(await withBrowser(new Map(), onFinish, Date.now() + 120_000).catch((e: unknown) => e)).toBeInstanceOf(TransientLaunchError);
    } finally {
      setBrowserLauncherForTests(null);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("closeBrowserBounded: a hung close is cut off and Chromium's process group killed; idempotent", async () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { detached: true, stdio: "ignore" });
    const exited = new Promise<NodeJS.Signals | null>((resolve) => child.once("exit", (_code, signal) => resolve(signal)));
    let pageClosed = 0;
    const page = { close: async () => void (pageClosed += 1) };
    const browser = { process: () => child, pages: async () => [page], close: () => new Promise<void>(() => undefined) } as unknown as Browser;
    const closing = closeBrowserBounded(browser, 100);
    expect(closeBrowserBounded(browser, 100)).toBe(closing);
    await closing;
    expect(await exited).toBe("SIGKILL");
    expect(pageClosed).toBe(1);
  });

  it("closeBrowserBounded: a normal close kills nothing", async () => {
    const child = spawn(process.execPath, ["-e", ""], { detached: true, stdio: "ignore" });
    await new Promise((resolve) => child.once("exit", resolve));
    let closed = false;
    const browser = { process: () => child, pages: async () => [], close: async () => void (closed = true) } as unknown as Browser;
    await closeBrowserBounded(browser, 1_000);
    expect(closed).toBe(true);
    expect(child.signalCode).toBeNull();
  });

  it("Chromium is extracted once per process; a failed extraction is removed and redone by the next caller", async () => {
    let calls = 0;
    let finish: (p: string) => void = () => undefined;
    const pack = {
      executablePath: () => {
        calls += 1;
        return new Promise<string>((resolve) => (finish = resolve));
      },
    };
    const a = serverlessExecutablePath(pack, () => undefined);
    const b = serverlessExecutablePath(pack, () => undefined);
    finish("/tmp/chromium");
    expect(await Promise.all([a, b])).toEqual(["/tmp/chromium", "/tmp/chromium"]);
    expect(calls).toBe(1);

    resetChromiumExecutableForTests();
    let cleanups = 0;
    const broken = { executablePath: () => Promise.reject(new Error("ENOSPC")) };
    await expect(serverlessExecutablePath(broken, () => void (cleanups += 1))).rejects.toThrow("ENOSPC");
    expect(cleanups).toBe(1);
    await expect(serverlessExecutablePath(broken, () => void (cleanups += 1))).rejects.toThrow("ENOSPC");
    expect(cleanups).toBe(2);
  });

  it("removeChromiumExtraction removes only the extracted binary, fonts and libraries", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "nennep-chromium-test-"));
    try {
      writeFileSync(path.join(dir, "chromium"), "half");
      mkdirSync(path.join(dir, "fonts"));
      writeFileSync(path.join(dir, "fonts", "a.ttf"), "x");
      mkdirSync(path.join(dir, "al2023"));
      writeFileSync(path.join(dir, "other"), "keep");
      removeChromiumExtraction(dir);
      expect(readdirSync(dir)).toEqual(["other"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(existsSync(dir)).toBe(false);
  });
});

describe("report email – PDF-less fallback", () => {
  it("retries a failed render once, then sends without the PDF; at once when Chromium cannot start at all", () => {
    expect(REPORT_PDF_MAX_ATTEMPTS).toBe(2);
    expect(sendWithoutPdf(1, new Error("goto timeout"))).toBe(false);
    expect(sendWithoutPdf(REPORT_PDF_MAX_ATTEMPTS, new Error("goto timeout"))).toBe(true);
    expect(sendWithoutPdf(1, new BrowserLaunchError(new Error("Browser was not found at the configured executablePath (/tmp/chromium)")))).toBe(true);
    // A transient launch failure is an ordinary failed render.
    expect(sendWithoutPdf(1, new TransientLaunchError(new Error("spawn ENOMEM")))).toBe(false);
    expect(sendWithoutPdf(REPORT_PDF_MAX_ATTEMPTS, new TransientLaunchError(new Error("spawn ENOMEM")))).toBe(true);
  });
});

/* ---------------------------------- retry ---------------------------------- */

describe("Gửi lại – rate limit", () => {
  afterEach(() => resetRateLimits());

  it(`at most ${MAIL_RETRY_RATE.limit} per user and window (429 before anything is read)`, async () => {
    for (let i = 0; i < MAIL_RETRY_RATE.limit; i++) checkRateLimit("mail-retry:u-retry", MAIL_RETRY_RATE.limit, MAIL_RETRY_RATE.windowMs);
    const e = await retryMailJob({ user: { uid: "u-retry" } as SessionUser, ip: "203.0.113.5" }, "0000000000000_job00000").catch((err: unknown) => err);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(429);
  });
});
