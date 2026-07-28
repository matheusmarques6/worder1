import type { NextRequest } from 'next/server';

export interface CronAuthEnv {
  cronSecret?: string;
  nodeEnv?: string;
}

/**
 * Shared cron authorization. Rules, in order:
 * 1. Vercel Cron (x-vercel-cron header) is always accepted — Vercel
 *    strips this header from external requests.
 * 2. If CRON_SECRET is configured, a matching `Authorization: Bearer`
 *    is REQUIRED — regardless of NODE_ENV. No fallthrough to dev mode.
 * 3. Only when CRON_SECRET is not configured, non-production
 *    environments are open (keeps local dev working without a secret).
 */
export function isCronAuthorized(
  headers: Pick<Headers, 'get'>,
  env: CronAuthEnv
): boolean {
  if (headers.get('x-vercel-cron')) return true;
  if (env.cronSecret) {
    return headers.get('authorization') === `Bearer ${env.cronSecret}`;
  }
  return env.nodeEnv !== 'production';
}

export function authorizeCronRequest(req: NextRequest): boolean {
  return isCronAuthorized(req.headers, {
    cronSecret: process.env.CRON_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
}
