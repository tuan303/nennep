/**
 * Report PDFs: headless Chromium prints the real report page (/in/bao-cao/{nonce} renders ReportDocument, the single
 * source of truth of the A4 layout), so the attachment is exactly what "In / Lưu PDF" gives on screen.
 *
 * - Browser: puppeteer-core + @sparticuz/chromium on Vercel / Linux (Amazon Linux 2023, Node 24); locally
 *   CHROME_EXECUTABLE_PATH or the default Google Chrome of macOS / Windows. Both packages are loaded lazily, only when a
 *   PDF is rendered (routes that merely queue mail never load them) and must stay in serverExternalPackages. The
 *   extraction of @sparticuz/chromium into /tmp runs once per process (concurrent invocations share it).
 * - One browser per drain (DrainContext.cache), closed by DrainContext.onFinish – gracefully within
 *   BROWSER_CLOSE_TIMEOUT_MS, otherwise its process group is killed; one page per PDF. A launch failure that will
 *   not go away (no executable, missing shared library, Chromium exiting at once before any browser of this process
 *   ever started) throws BrowserLaunchError, cached for the drain: the report email then goes out without the PDF at
 *   once (report-job.ts). Anything else – launch timeout, out of memory / processes, extraction I/O – throws
 *   TransientLaunchError, an ordinary render failure retried like the others, and is not cached.
 * - The page runs with JavaScript disabled (the server-rendered HTML is the document) and may only load documents,
 *   stylesheets, fonts and images of the app origin (+ data: URLs); A4, CSS page size (@page of ReportPrintStyles),
 *   backgrounds printed.
 * - Time: launch, navigation and print get 45 s each at most, less near the deadline (PdfContext.deadline), and are
 *   not started with less than PDF_MIN_TIMEOUT_MS left (OutOfTimeError: the drain puts the job back); the whole print
 *   ends before the deadline; every CDP call times out after 45 s (protocolTimeout).
 */
import type { ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, LaunchOptions } from "puppeteer-core";
import { createPrintJob, deletePrintJob, type PrintJobSpec } from "./print-jobs";
import { OutOfTimeError, type DrainContext } from "./types";

/** Navigation / print timeout of one PDF step, and the timeout of each CDP call of the browser. */
export const PDF_PAGE_TIMEOUT_MS = 45_000;
/** No PDF step is started with less than this left before the deadline (OutOfTimeError). */
export const PDF_MIN_TIMEOUT_MS = 10_000;
/** Kept free before the deadline. */
const PDF_DEADLINE_MARGIN_MS = 5_000;
/** Longest wait for Chromium to start (puppeteer's default). */
const PDF_LAUNCH_TIMEOUT_MS = 30_000;
/** Graceful close of a browser (its pages, then Browser.close) before its process group is killed. */
export const BROWSER_CLOSE_TIMEOUT_MS = 5_000;
const PAGE_CLOSE_TIMEOUT_MS = 5_000;

/** Path of the print page (src/app/in/bao-cao/[job]/page.tsx). */
export const PRINT_PAGE_PATH = "/in/bao-cao";

export const MAC_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const WINDOWS_CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const BROWSER_CACHE_KEY = "pdf:browser";
/** A4 at 96 dpi: the layout width before print media applies (same breakpoints as printing from the browser). */
const A4_VIEWPORT = { width: 794, height: 1123, deviceScaleFactor: 1 };
/** Resources the print page may load (scripts never run: JavaScript is disabled). */
const PRINT_RESOURCE_TYPES: ReadonlySet<string> = new Set(["document", "stylesheet", "font", "image"]);

/** What rendering needs from a drain (the PDF route builds a one-off context). */
export type PdfContext = Pick<DrainContext, "baseUrl" | "cache" | "onFinish"> & { deadline?: number };

export type ChromeLaunchPlan = { kind: "local"; executablePath: string } | { kind: "serverless" };

const reasonText = (reason: unknown): string => (reason instanceof Error ? reason.message : String(reason));

/** Chromium cannot be started in this deployment (missing or broken binary, …): retrying within minutes does not help. */
export class BrowserLaunchError extends Error {
  constructor(readonly reason: unknown) {
    super(`Chromium could not be started: ${reasonText(reason)}`);
    this.name = "BrowserLaunchError";
  }
}

export const isBrowserLaunchError = (e: unknown): e is BrowserLaunchError => e instanceof BrowserLaunchError;

/** Chromium did not start this time (timeout, resources, extraction I/O): an ordinary render failure, retried. */
export class TransientLaunchError extends Error {
  constructor(readonly reason: unknown) {
    super(`Chromium did not start (transient): ${reasonText(reason)}`);
    this.name = "TransientLaunchError";
  }
}

/** Resource / timing errors of a launch: worth another try a little later. */
const TRANSIENT_LAUNCH_RE = /\b(ENOMEM|EAGAIN|EMFILE|ENFILE|ENOSPC|EBUSY|ETXTBSY|EIO)\b|Cannot allocate memory|Resource temporarily unavailable/i;
/** The executable is missing / not runnable, or a shared library is missing: the same on every retry. */
const MISSING_BROWSER_RE =
  /Browser was not found at the configured executablePath|\b(ENOENT|EACCES|ENOEXEC)\b|error while loading shared libraries|cannot open shared object file/i;
/** Chromium started but exited before printing its DevTools endpoint (puppeteer's launch error). */
const EXITED_EARLY_RE = /Failed to launch the browser process/i;

/**
 * Is a failed `puppeteer.launch` permanent (pure)? Timeouts and resource errors never are; a missing executable or
 * shared library always is; Chromium exiting before its DevTools endpoint only when no browser of this process has
 * ever started (`startedBefore` false: the binary itself is broken – later, the same exit points to memory pressure).
 * Anything unknown is transient (retried, and after REPORT_PDF_MAX_ATTEMPTS sent without the PDF anyway).
 */
export function isPermanentLaunchFailure(e: unknown, startedBefore: boolean): boolean {
  if (e instanceof Error && e.name === "TimeoutError") return false;
  const text = e instanceof Error ? `${e.message} ${(e as NodeJS.ErrnoException).code ?? ""}` : String(e);
  if (TRANSIENT_LAUNCH_RE.test(text)) return false;
  if (MISSING_BROWSER_RE.test(text)) return true;
  return EXITED_EARLY_RE.test(text) && !startedBefore;
}

/** A browser operation did not finish in time (the browser may be wedged). */
export class PdfTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfTimeoutError";
  }
}

/** `promise`, or a PdfTimeoutError after `ms` (the promise keeps running; its outcome is then ignored). */
async function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PdfTimeoutError(`${what} did not finish within ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Which Chromium to start: CHROME_EXECUTABLE_PATH → default Chrome on macOS / Windows → @sparticuz/chromium (Linux). */
export function chromeLaunchPlan(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): ChromeLaunchPlan {
  const custom = env.CHROME_EXECUTABLE_PATH?.trim();
  if (custom) return { kind: "local", executablePath: custom };
  if (platform === "darwin") return { kind: "local", executablePath: MAC_CHROME_PATH };
  if (platform === "win32") return { kind: "local", executablePath: WINDOWS_CHROME_PATH };
  return { kind: "serverless" };
}

/** Request filter of the print page: documents / styles / fonts / images of `origin`, plus data: URLs (not documents). */
export function isAllowedPrintRequest(url: string, origin: string, resourceType: string): boolean {
  if (!PRINT_RESOURCE_TYPES.has(resourceType)) return false;
  if (url.startsWith("data:")) return resourceType !== "document";
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/** Time left for PDF work before `deadline` (PDF_DEADLINE_MARGIN_MS kept free); OutOfTimeError below PDF_MIN_TIMEOUT_MS. */
export function pdfTimeLeft(deadline: number, now: number = Date.now()): number {
  const left = deadline - now - PDF_DEADLINE_MARGIN_MS;
  if (left < PDF_MIN_TIMEOUT_MS) throw new OutOfTimeError();
  return left;
}

/**
 * Timeout of the next step, computed right before it: PDF_PAGE_TIMEOUT_MS, shortened to end before `deadline`;
 * OutOfTimeError when less than PDF_MIN_TIMEOUT_MS would be left (the step is not started).
 */
export function pdfStepTimeout(deadline: number | undefined, now: number = Date.now()): number {
  if (deadline === undefined) return PDF_PAGE_TIMEOUT_MS;
  return Math.min(PDF_PAGE_TIMEOUT_MS, pdfTimeLeft(deadline, now));
}

export function printPageUrl(baseUrl: string, nonce: string): string {
  return `${baseUrl}${PRINT_PAGE_PATH}/${nonce}`;
}

/* ------------------------------ Chromium binary ------------------------------ */

/** What serverlessExecutablePath needs of @sparticuz/chromium. */
export interface ChromiumPack {
  executablePath(): Promise<string>;
}

/** Removes what @sparticuz/chromium extracts into the temp directory (a failed extraction leaves it half-written). */
export function removeChromiumExtraction(dir: string = tmpdir()): void {
  for (const name of ["chromium", "fonts", "al2023"]) {
    try {
      rmSync(join(dir, name), { recursive: true, force: true });
    } catch (e) {
      console.error(`[pdf] cannot remove ${name} from ${dir}:`, e);
    }
  }
}

let chromiumExecutable: Promise<string> | undefined;

/**
 * The extracted Chromium of @sparticuz/chromium, extracted once per process: concurrent invocations of one instance
 * share /tmp, and executablePath() reports /tmp/chromium as ready as soon as the file exists – long before it (and the
 * libraries / fonts next to it) is fully written. A failed extraction is removed (`onFailure`) and redone next time.
 */
export function serverlessExecutablePath(chromium: ChromiumPack, onFailure: () => void = removeChromiumExtraction): Promise<string> {
  chromiumExecutable ??= chromium.executablePath().catch((e: unknown) => {
    chromiumExecutable = undefined;
    onFailure();
    throw e;
  });
  return chromiumExecutable;
}

/** TESTS ONLY: forget the extracted Chromium. */
export function resetChromiumExecutableForTests(): void {
  chromiumExecutable = undefined;
}

/* --------------------------------- browser --------------------------------- */

/** A browser of this process has started at least once (see isPermanentLaunchFailure). */
let browserStartedInProcess = false;

/** A module of the bundle that is missing cannot appear by retrying: BrowserLaunchError. */
async function importOrFail<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    throw new BrowserLaunchError(e);
  }
}

/** Starts Chromium; rejects with BrowserLaunchError (permanent) or TransientLaunchError (worth a retry). */
async function launchBrowser(timeout: number): Promise<Browser> {
  const { default: puppeteer } = await importOrFail(() => import("puppeteer-core"));
  const plan = chromeLaunchPlan();
  let executablePath: string;
  let options: { headless: true | "shell"; args: string[] };
  if (plan.kind === "local") {
    executablePath = plan.executablePath;
    options = { headless: true, args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions"] };
  } else {
    const { default: chromium } = await importOrFail(() => import("@sparticuz/chromium"));
    chromium.setGraphicsMode = false; // no WebGL needed for a document
    try {
      executablePath = await serverlessExecutablePath(chromium);
    } catch (e) {
      throw new TransientLaunchError(e); // extraction I/O into /tmp: removed, redone by the next launch
    }
    options = { headless: "shell", args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }) };
  }
  const startedBefore = browserStartedInProcess;
  try {
    const browser = await (testLauncher ?? puppeteer.launch.bind(puppeteer))({
      executablePath,
      ...options,
      defaultViewport: A4_VIEWPORT,
      timeout,
      protocolTimeout: PDF_PAGE_TIMEOUT_MS,
    });
    browserStartedInProcess = true;
    return browser;
  } catch (e) {
    throw isPermanentLaunchFailure(e, startedBefore) ? new BrowserLaunchError(e) : new TransientLaunchError(e);
  }
}

type Launcher = (options: LaunchOptions) => Promise<Browser>;
let testLauncher: Launcher | null = null;

/** TESTS ONLY: replace puppeteer.launch (null restores it); `started` sets whether a browser already started. */
export function setBrowserLauncherForTests(launcher: Launcher | null, started: boolean = false): void {
  testLauncher = launcher;
  browserStartedInProcess = started;
}

/** SIGKILL to a Chromium that is still running – to its process group (puppeteer starts it detached on Linux / macOS). */
function killIfRunning(proc: ChildProcess | null): void {
  if (!proc?.pid || proc.exitCode !== null || proc.signalCode !== null) return;
  console.error(`[pdf] Chromium ${proc.pid} did not exit; killing it`);
  try {
    process.kill(process.platform === "win32" ? proc.pid : -proc.pid, "SIGKILL");
  } catch {
    try {
      proc.kill("SIGKILL");
    } catch (e) {
      console.error("[pdf] cannot kill Chromium:", e);
    }
  }
}

const closing = new WeakMap<Browser, Promise<void>>();

/**
 * Closes a browser: its pages, then Browser.close, within `timeoutMs`; a Chromium still running after that (a hung
 * close is a known issue of the serverless build) is killed. Idempotent; never throws.
 */
export function closeBrowserBounded(browser: Browser, timeoutMs: number = BROWSER_CLOSE_TIMEOUT_MS): Promise<void> {
  let done = closing.get(browser);
  if (!done) {
    const proc = browser.process();
    const graceful = (async () => {
      for (const page of await browser.pages()) await page.close().catch(() => undefined);
      await browser.close();
    })();
    done = withTimeout(graceful, timeoutMs, "closing the browser")
      .catch((e: unknown) => console.error("[pdf] closing the browser failed:", e))
      .finally(() => killIfRunning(proc));
    closing.set(browser, done);
  }
  return done;
}

/**
 * The browser of this drain (launched on first use, closed by onFinish). A browser that crashed or disconnected is
 * replaced; a permanent launch failure (BrowserLaunchError) stays cached so the other jobs of the drain fail fast
 * instead of relaunching each time, a transient one (TransientLaunchError) is forgotten so the next job launches
 * again. Not launched with less than PDF_MIN_TIMEOUT_MS left before `deadline` (OutOfTimeError).
 */
export async function withBrowser(cache: Map<string, unknown>, onFinish: PdfContext["onFinish"], deadline?: number): Promise<Browser> {
  const hit = cache.get(BROWSER_CACHE_KEY) as Promise<Browser> | undefined;
  if (hit) {
    const browser = await hit;
    if (browser.connected) return browser;
    cache.delete(BROWSER_CACHE_KEY);
  }
  const timeout = Math.min(PDF_LAUNCH_TIMEOUT_MS, pdfStepTimeout(deadline));
  const launching: Promise<Browser> = launchBrowser(timeout).catch((e: unknown) => {
    if (!isBrowserLaunchError(e) && cache.get(BROWSER_CACHE_KEY) === launching) cache.delete(BROWSER_CACHE_KEY);
    throw e;
  });
  cache.set(BROWSER_CACHE_KEY, launching);
  onFinish(async () => {
    if (cache.get(BROWSER_CACHE_KEY) === launching) cache.delete(BROWSER_CACHE_KEY);
    const browser = await launching.catch(() => undefined);
    if (browser) await closeBrowserBounded(browser);
  });
  return launching;
}

/**
 * Prints one URL of the app to an A4 PDF (JavaScript off, app origin only). Throws on HTTP errors and timeouts; each
 * step's timeout is computed right before it from `deadline` (OutOfTimeError when too little is left).
 */
export async function printPageToPdf(browser: Browser, url: string, deadline?: number): Promise<Buffer> {
  const origin = new URL(url).origin;
  const page = await browser.newPage();
  try {
    const timeout = pdfStepTimeout(deadline);
    page.setDefaultTimeout(timeout);
    page.setDefaultNavigationTimeout(timeout);
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (req.isInterceptResolutionHandled()) return;
      const done = isAllowedPrintRequest(req.url(), origin, req.resourceType()) ? req.continue() : req.abort("blockedbyclient");
      done.catch(() => undefined); // the page may already be closing
    });
    const res = await page.goto(url, { waitUntil: "networkidle0", timeout: pdfStepTimeout(deadline) });
    if (!res || !res.ok()) throw new Error(`print page answered HTTP ${res?.status() ?? "(no response)"}`);
    const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true, printBackground: true, timeout: pdfStepTimeout(deadline) });
    return Buffer.from(pdf);
  } finally {
    await withTimeout(page.close(), PAGE_CLOSE_TIMEOUT_MS, "closing the page").catch(() => undefined);
  }
}

export type PdfRenderer = (spec: PrintJobSpec, ctx: PdfContext) => Promise<Buffer>;

let testRenderer: PdfRenderer | null = null;

/** TESTS ONLY: replace the Chromium renderer (null restores it). */
export function setPdfRendererForTests(renderer: PdfRenderer | null): void {
  testRenderer = renderer;
}

/**
 * PDF of a report job: creates the print job, prints /in/bao-cao/{nonce} with the drain's browser, deletes the job.
 * Everything ends before `ctx.deadline`; with too little time left nothing is started (OutOfTimeError). A print that
 * overran the deadline drops the browser (it may be wedged), so the next job starts a fresh one.
 */
export async function renderReportPdf(spec: PrintJobSpec, ctx: PdfContext): Promise<Buffer> {
  if (testRenderer) return testRenderer(spec, ctx);
  const { deadline } = ctx;
  if (deadline !== undefined) pdfTimeLeft(deadline);
  const nonce = await createPrintJob(spec);
  try {
    const browser = await withBrowser(ctx.cache, ctx.onFinish, deadline);
    const entry = ctx.cache.get(BROWSER_CACHE_KEY);
    const overall = deadline === undefined ? undefined : pdfTimeLeft(deadline);
    const printing = printPageToPdf(browser, printPageUrl(ctx.baseUrl, nonce), deadline);
    try {
      return overall === undefined ? await printing : await withTimeout(printing, overall, "printing the report page");
    } catch (e) {
      if (e instanceof PdfTimeoutError) {
        if (ctx.cache.get(BROWSER_CACHE_KEY) === entry) ctx.cache.delete(BROWSER_CACHE_KEY);
        void closeBrowserBounded(browser);
      }
      throw e;
    }
  } finally {
    await deletePrintJob(nonce).catch((e: unknown) => console.error("[pdf] deleting the print job failed:", e));
  }
}

/** One PDF outside a drain (GET /api/reports/pdf): own browser, closed (bounded) before returning. */
export async function renderReportPdfOnce(spec: PrintJobSpec, baseUrl: string, deadline?: number): Promise<Buffer> {
  const cleanups: Array<() => Promise<void>> = [];
  try {
    return await renderReportPdf(spec, { baseUrl, cache: new Map(), onFinish: (fn) => cleanups.push(fn), deadline });
  } finally {
    for (const fn of cleanups) await fn().catch((e: unknown) => console.error("[pdf] cleanup failed:", e));
  }
}
