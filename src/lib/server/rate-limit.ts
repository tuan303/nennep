/**
 * Best-effort in-memory sliding-window rate limiter (per server instance; serverless instances do not
 * share state). Good enough to slow down brute-force noise on public endpoints; anything that must hold across
 * instances (e.g. the daily LOGIN_FAILED budget) uses a Firestore counter instead.
 * Memory is bounded: at most MAX_KEYS keys, the least recently used ones are dropped first.
 */
import { Errors } from "./errors";

/** key → window of that key + hit times (ms). */
const hits = new Map<string, { windowMs: number; times: number[] }>();
export const MAX_KEYS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  /** Seconds until the oldest hit leaves the window (0 when ok). */
  retryAfterSec: number;
}

function prune(now: number): void {
  for (const [key, e] of hits) {
    if (e.times.length === 0 || e.times[e.times.length - 1] <= now - e.windowMs) hits.delete(key);
  }
  // Still too many live keys (many distinct sources inside one window): drop the least recently used.
  for (const key of hits.keys()) {
    if (hits.size < MAX_KEYS) break;
    hits.delete(key);
  }
}

/** Record one hit for `key` and tell whether it is within `limit` hits per `windowMs`. */
export function checkRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  if (!hits.has(key) && hits.size >= MAX_KEYS) prune(now);
  const times = (hits.get(key)?.times ?? []).filter((t) => t > now - windowMs);
  hits.delete(key); // re-inserted below: Map order = least recently used first
  if (times.length >= limit) {
    hits.set(key, { windowMs, times });
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((times[0] + windowMs - now) / 1000)) };
  }
  times.push(now);
  hits.set(key, { windowMs, times });
  return { ok: true, remaining: limit - times.length, retryAfterSec: 0 };
}

/** Throw 429 RATE_LIMITED (with Retry-After) when `key` exceeded `limit` hits per `windowMs`. */
export function enforceRateLimit(key: string, limit: number, windowMs: number): void {
  const r = checkRateLimit(key, limit, windowMs);
  if (!r.ok) throw Errors.rateLimited(r.retryAfterSec);
}

/** Number of keys currently tracked (tests). */
export function rateLimitKeyCount(): number {
  return hits.size;
}

/**
 * Rate-limit key of a client address: IPv4 as is, IPv6 reduced to its /64 prefix (one subscriber usually owns a
 * whole /64, so rotating the interface id must not yield fresh limits). IPv4-mapped IPv6 → the IPv4 address.
 */
export function ipRateKey(ip: string): string {
  const v = ip.trim().toLowerCase().replace(/%.*$/, "").replace(/^\[|\]$/g, "");
  if (!v.includes(":")) return v || "unknown";
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v);
  if (mapped) return mapped[1];
  const [headText, tailText] = v.split("::");
  const head = headText ? headText.split(":") : [];
  const tail = tailText ? tailText.split(":") : [];
  const groups = v.includes("::") ? [...head, ...Array<string>(Math.max(0, 8 - head.length - tail.length)).fill("0"), ...tail] : head;
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, "") || "0")
    .join(":")}::/64`;
}

/** Tests only. */
export function resetRateLimits(): void {
  hits.clear();
}
