import type { NextRequest } from 'next/server';

export interface CronAuthEnv {
  cronSecret?: string;
  nodeEnv?: string;
}

/**
 * Shared cron authorization. A configured CRON_SECRET and its exact
 * Authorization Bearer are always required. nodeEnv remains in the
 * interface for caller compatibility, but never grants access.
 */
export function isCronAuthorized(
  headers: Pick<Headers, 'get'>,
  env: CronAuthEnv
): boolean {
  return Boolean(env.cronSecret) &&
    headers.get('authorization') === `Bearer ${env.cronSecret}`;
}

export function authorizeCronRequest(req: NextRequest): boolean {
  return isCronAuthorized(req.headers, {
    cronSecret: process.env.CRON_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
}
