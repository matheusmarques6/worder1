import { afterEach, describe, expect, it, vi } from 'vitest';
import { authorizeCronRequest, isCronAuthorized } from './cron-auth';

const headers = (init: Record<string, string> = {}) => new Headers(init);
const request = (init: Record<string, string> = {}) =>
  ({ headers: headers(init) }) as Parameters<typeof authorizeCronRequest>[0];
const nodeEnvs = ['development', 'test', 'production'];
const forgedHeaders: Record<string, string>[] = [
  {},
  { 'x-vercel-cron': '1' },
  { 'x-internal-request': 'true' },
  { 'x-worder-internal': '1' },
  { authorization: 'Bearer undefined' },
  { authorization: 'Bearer wrong' },
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isCronAuthorized', () => {
  it.each(nodeEnvs)('rejects forged headers without a configured secret in %s', nodeEnv => {
    for (const cronSecret of [undefined, '']) {
      for (const init of forgedHeaders) {
        expect(isCronAuthorized(headers(init), { cronSecret, nodeEnv })).toBe(false);
      }
    }
  });

  it.each(nodeEnvs)('rejects forged or missing Bearer with a configured secret in %s', nodeEnv => {
    for (const init of forgedHeaders) {
      expect(isCronAuthorized(headers(init), { cronSecret: 's3cret', nodeEnv })).toBe(false);
    }
  });

  it.each(nodeEnvs)('accepts only the exact configured Bearer in %s', nodeEnv => {
    expect(isCronAuthorized(headers({ authorization: 'Bearer s3cret' }), { cronSecret: 's3cret', nodeEnv })).toBe(true);
  });
});

describe('authorizeCronRequest', () => {
  it('reads CRON_SECRET and delegates the same fail-closed contract', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('CRON_SECRET', '');
    expect(authorizeCronRequest(request({ 'x-vercel-cron': '1' }))).toBe(false);
    expect(authorizeCronRequest(request({ authorization: 'Bearer undefined' }))).toBe(false);
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect(authorizeCronRequest(request({ authorization: 'Bearer wrong' }))).toBe(false);
    expect(authorizeCronRequest(request({ authorization: 'Bearer s3cret' }))).toBe(true);
  });
});
