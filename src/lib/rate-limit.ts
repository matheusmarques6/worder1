// =============================================
// WORDER: Simple rate limiter (Upstash Redis + in-memory fallback)
// /src/lib/rate-limit.ts
//
// Uso:
//   const result = await checkRateLimit(`login:${ip}`, { limit: 5, windowSec: 60 })
//   if (!result.allowed) return 429
// =============================================

import { getRedis, isRedisConfigured } from './redis';

export interface RateLimitOptions {
  /** número máximo de hits permitidos dentro da janela */
  limit: number;
  /** janela em segundos */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

// ------------ in-memory fallback (por processo) ------------
const memMap = new Map<string, { count: number; resetAt: number }>();

function memCheck(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const winMs = opts.windowSec * 1000;
  const record = memMap.get(key);

  if (!record || now >= record.resetAt) {
    memMap.set(key, { count: 1, resetAt: now + winMs });
    return { allowed: true, remaining: opts.limit - 1, limit: opts.limit, resetAt: now + winMs };
  }

  if (record.count >= opts.limit) {
    return { allowed: false, remaining: 0, limit: opts.limit, resetAt: record.resetAt };
  }

  record.count += 1;
  return { allowed: true, remaining: opts.limit - record.count, limit: opts.limit, resetAt: record.resetAt };
}

// ------------ Redis (distribuído) ------------
async function redisCheck(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const redis = getRedis();
  const fullKey = `rl:${key}`;
  const count = (await redis.incr(fullKey)) as number;
  if (count === 1) {
    await redis.expire(fullKey, opts.windowSec);
  }
  const ttl = (await redis.ttl(fullKey)) as number;
  const resetAt = Date.now() + Math.max(ttl, 0) * 1000;
  const allowed = count <= opts.limit;
  return {
    allowed,
    remaining: Math.max(0, opts.limit - count),
    limit: opts.limit,
    resetAt,
  };
}

/**
 * Checa e incrementa o contador do limite. Retorna `allowed=false` quando excedido.
 *
 * Usa Upstash Redis quando configurado, com fallback em memória (por-processo).
 */
export async function checkRateLimit(
  key: string,
  opts: RateLimitOptions
): Promise<RateLimitResult> {
  if (isRedisConfigured()) {
    try {
      return await redisCheck(key, opts);
    } catch (err) {
      console.warn('[rate-limit] Redis failed, falling back to memory:', err);
      return memCheck(key, opts);
    }
  }
  return memCheck(key, opts);
}

/** Extrai IP confiável de um NextRequest (melhor esforço) */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xr = req.headers.get('x-real-ip');
  if (xr) return xr.trim();
  return 'unknown';
}
