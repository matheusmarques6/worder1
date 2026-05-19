// In-process rate limiter for expensive segment/list endpoints.
//
// Why in-process instead of Redis: most workloads here are
// auto-scaled Vercel functions where each cold start gets a fresh
// counter. For a hard guarantee bump to Upstash/Redis, but for
// abuse mitigation (DoS via expensive preview/refresh/import) the
// per-instance counter catches the common case and is free.
//
// Limits are per (orgId, endpoint-name) so a single org can't burn
// all of one endpoint's capacity even if it has many users.

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export interface RateLimitConfig {
  /** Display name used in error messages and the bucket key. */
  name: string;
  /** Max calls per window. */
  limit: number;
  /** Window size in ms. */
  windowMs: number;
}

export function checkRateLimit(
  config: RateLimitConfig,
  scopeKey: string,
): { allowed: true; remaining: number } | { allowed: false; retryAfterSec: number; message: string } {
  const key = `${config.name}:${scopeKey}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    return { allowed: true, remaining: config.limit - 1 };
  }
  if (bucket.count >= config.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return {
      allowed: false,
      retryAfterSec,
      message: `Limite atingido (${config.limit} chamadas em ${Math.round(config.windowMs / 1000)}s). Tente novamente em ${retryAfterSec}s.`,
    };
  }
  bucket.count += 1;
  return { allowed: true, remaining: config.limit - bucket.count };
}

// Pre-configured limits for the endpoints that actually need them.
// Numbers calibrated for human use, not automation — bump if you see
// merchants legitimately hitting these.
export const LIMITS = {
  // Preview is debounced 500ms in the UI, so a typical edit session
  // bursts to ~20 calls/min. 60/min leaves room for fast typing
  // and rule iteration.
  preview: { name: 'preview', limit: 60, windowMs: 60_000 },
  // Refresh is a heavy synchronous full-resolve. Once per minute is
  // generous for operational use (debug a segment that just changed).
  refresh: { name: 'refresh', limit: 10, windowMs: 60_000 },
  // CSV import: cap at 6/min so an automation can't blast the system
  // with 50k-row uploads. Merchants normally do 1-2 imports per day.
  import: { name: 'import', limit: 6, windowMs: 60_000 },
} as const;
