import { HttpError } from "./errors";

/**
 * In-memory sliding-window rate limiter.
 *
 * Suitable for a single-instance deployment (the current docker-compose topology).
 * For multi-instance deployments swap the store for Redis — the call sites and
 * semantics stay the same.
 */
type Window = { timestamps: number[] };

const store = new Map<string, Window>();
let lastSweep = Date.now();

const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, w] of store) {
    if (w.timestamps.length === 0 || now - w.timestamps[w.timestamps.length - 1]! > windowMs) {
      store.delete(key);
    }
  }
}

export type RateLimitOptions = { limit: number; windowMs: number };

/** Returns true if the action is allowed, false if the limit is exceeded. */
export function checkRateLimit(key: string, opts: RateLimitOptions): boolean {
  const now = Date.now();
  sweep(now, opts.windowMs);
  const w = store.get(key) ?? { timestamps: [] };
  w.timestamps = w.timestamps.filter((t) => now - t < opts.windowMs);
  if (w.timestamps.length >= opts.limit) {
    store.set(key, w);
    return false;
  }
  w.timestamps.push(now);
  store.set(key, w);
  return true;
}

/** Throws 429 when the limit is exceeded. */
export function enforceRateLimit(key: string, opts: RateLimitOptions, message?: string): void {
  if (!checkRateLimit(key, opts)) {
    throw new HttpError(429, message ?? "Too many requests. Please try again later.");
  }
}

/** Test seam: clear all rate-limit state. */
export function resetRateLimits(): void {
  store.clear();
}

/** Extracts a best-effort client identifier from proxy headers. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export const LIMITS = {
  login: { limit: 10, windowMs: 5 * 60_000 },
  passwordReset: { limit: 3, windowMs: 15 * 60_000 },
  aiGeneration: { limit: 20, windowMs: 60_000 },
  csvImport: { limit: 10, windowMs: 60_000 },
  mutation: { limit: 120, windowMs: 60_000 },
} as const;
