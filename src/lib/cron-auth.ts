import type { NextRequest } from 'next/server';

export interface CronAuthEnv {
  cronSecret?: string;
  nodeEnv?: string;
}

/**
 * Autorização compartilhada dos crons. Na ordem:
 * 1. Com CRON_SECRET configurado, o `Authorization: Bearer` correto é a
 *    ÚNICA porta. O cabeçalho `x-vercel-cron` NÃO substitui o segredo:
 *    "a Vercel remove esse cabeçalho de requisições externas" é uma
 *    promessa de plataforma, não uma verificação nossa — e o que está do
 *    outro lado é rodar reposição de cupom e aplicar vencedora de teste
 *    A/B em todas as organizações.
 * 2. Sem CRON_SECRET configurado, aceitamos o cabeçalho da Vercel (é o
 *    que resta) e liberamos fora de produção, para o dev local seguir.
 */
export function isCronAuthorized(
  headers: Pick<Headers, 'get'>,
  env: CronAuthEnv
): boolean {
  if (env.cronSecret) {
    return headers.get('authorization') === `Bearer ${env.cronSecret}`;
  }
  if (headers.get('x-vercel-cron')) return true;
  return env.nodeEnv !== 'production';
}

export function authorizeCronRequest(req: NextRequest): boolean {
  return isCronAuthorized(req.headers, {
    cronSecret: process.env.CRON_SECRET,
    nodeEnv: process.env.NODE_ENV,
  });
}
