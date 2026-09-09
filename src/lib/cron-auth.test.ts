import { describe, it, expect } from 'vitest';
import { isCronAuthorized } from './cron-auth';

const headers = (init: Record<string, string>) => new Headers(init);

describe('isCronAuthorized', () => {
  it('com CRON_SECRET configurado, o cabeçalho x-vercel-cron não substitui o segredo', () => {
    // "A Vercel remove esse cabeçalho de requisições externas" é promessa
    // de plataforma, não verificação nossa. Do outro lado está rodar
    // reposição de cupom e aplicar vencedora de teste A/B em todas as
    // organizações. A Vercel manda o Bearer quando há segredo, então o
    // cron de verdade continua entrando.
    expect(
      isCronAuthorized(headers({ 'x-vercel-cron': '1' }), {
        cronSecret: 's3cret',
        nodeEnv: 'production',
      })
    ).toBe(false);
    expect(
      isCronAuthorized(headers({ 'x-vercel-cron': '1', authorization: 'Bearer s3cret' }), {
        cronSecret: 's3cret',
        nodeEnv: 'production',
      })
    ).toBe(true);
  });

  it('sem segredo configurado, o cabeçalho da Vercel ainda vale', () => {
    expect(
      isCronAuthorized(headers({ 'x-vercel-cron': '1' }), { nodeEnv: 'production' })
    ).toBe(true);
    expect(
      isCronAuthorized(headers({ 'x-vercel-cron': '1' }), { nodeEnv: 'development' })
    ).toBe(true);
  });

  it('accepts a matching Bearer CRON_SECRET', () => {
    expect(
      isCronAuthorized(headers({ authorization: 'Bearer s3cret' }), {
        cronSecret: 's3cret',
        nodeEnv: 'production',
      })
    ).toBe(true);
  });

  it('rejects a wrong or missing Bearer when CRON_SECRET is set, EVEN in dev', () => {
    const env = { cronSecret: 's3cret', nodeEnv: 'development' };
    expect(isCronAuthorized(headers({ authorization: 'Bearer wrong' }), env)).toBe(false);
    expect(isCronAuthorized(headers({}), env)).toBe(false);
  });

  it('rejects everything in production when CRON_SECRET is unset (fail-closed)', () => {
    expect(isCronAuthorized(headers({}), { nodeEnv: 'production' })).toBe(false);
  });

  it('allows local dev without CRON_SECRET configured', () => {
    expect(isCronAuthorized(headers({}), { nodeEnv: 'development' })).toBe(true);
    expect(isCronAuthorized(headers({}), { nodeEnv: 'test' })).toBe(true);
  });
});
