// =============================================================
// Trava de duplicidade no envio.
//
// A idempotência que já existia age na INSCRIÇÃO: impede o mesmo evento
// de criar duas runs. Ela não ajuda quando as runs duplicadas já
// existem — e seis runs paralelas mandaram seis e-mails idênticos com
// segundos de diferença, derrubando a reputação do domínio.
//
// Uma verificação por SELECT antes do INSERT não resolveria: as runs
// disparam com 2 segundos de intervalo e todas leriam "ainda não
// enviei". Quem decide é um índice único no banco; aqui travamos que a
// chave certa chega até ele e que o fluxo segue quando a trava age.
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'test-key';

const chamadas: Array<{ dedupeKey?: string | null }> = [];
let proximoResultado: any = { success: true, emailSendId: 'send-1' };

vi.mock('@/lib/email/send-campaign-email', () => ({
  sendCampaignEmail: async (args: any) => {
    chamadas.push({ dedupeKey: args.dedupeKey });
    return proximoResultado;
  },
}));

vi.mock('@/lib/email/sender-identity', () => ({
  resolveSenderIdentity: async () => ({
    senderEmail: 'loja@exemplo.com', senderName: 'Loja', replyTo: undefined,
  }),
}));

import { nodeExecutors } from '../node-executors';

function supabaseVazio(): any {
  const chain: any = new Proxy({}, {
    get: (_t, p) => {
      if (p === 'then') return undefined;
      if (p === 'single' || p === 'maybeSingle') return async () => ({ data: null, error: null });
      return () => chain;
    },
  });
  return chain;
}

const CONFIG = {
  emailStatus: 'live',
  subject: 'A história por trás do seu cabelo',
  html: '<p>oi</p>',
  fromEmail: 'loja@exemplo.com',
};

async function enviar(over: { nodeId?: string; contactId?: string; automationId?: string } = {}) {
  const config = { ...CONFIG };
  return (nodeExecutors as any).action_email.execute({
    node: { id: over.nodeId ?? 'no-email-1', data: { config } },
    config,
    context: {
      organizationId: 'org-1',
      contact: { id: over.contactId ?? 'contato-1', email: 'edward@exemplo.com', tags: [], customFields: {} },
      workflow: { automationId: over.automationId ?? 'auto-1', executionId: 'run-x' },
      trigger: { type: 'trigger_signup', data: {}, timestamp: '2026-09-04T12:00:00Z' },
    },
    isTest: false,
    supabase: supabaseVazio(),
    organizationId: undefined,
  });
}

beforeEach(() => {
  chamadas.length = 0;
  proximoResultado = { success: true, emailSendId: 'send-1' };
});

describe('a chave de duplicidade', () => {
  it('identifica automação, nó, contato e dia', async () => {
    await enviar();
    const chave = chamadas[0].dedupeKey!;
    expect(chave).toContain('auto-1');
    expect(chave).toContain('no-email-1');
    expect(chave).toContain('contato-1');
    expect(chave).toMatch(/\d{4}-\d{2}-\d{2}$/);
  });

  it('passos diferentes do mesmo fluxo têm chaves diferentes', async () => {
    await enviar({ nodeId: 'no-1' });
    await enviar({ nodeId: 'no-2' });
    expect(chamadas[0].dedupeKey).not.toBe(chamadas[1].dedupeKey);
  });

  it('contatos diferentes têm chaves diferentes', async () => {
    await enviar({ contactId: 'c-1' });
    await enviar({ contactId: 'c-2' });
    expect(chamadas[0].dedupeKey).not.toBe(chamadas[1].dedupeKey);
  });

  it('mesmo passo, mesmo contato, mesmo dia → MESMA chave', async () => {
    // É exatamente o caso das seis runs paralelas: mesma chave, e o
    // índice único deixa passar só a primeira.
    await enviar();
    await enviar();
    expect(chamadas[0].dedupeKey).toBe(chamadas[1].dedupeKey);
  });

  it('automações diferentes não se bloqueiam', async () => {
    await enviar({ automationId: 'auto-1' });
    await enviar({ automationId: 'auto-2' });
    expect(chamadas[0].dedupeKey).not.toBe(chamadas[1].dedupeKey);
  });
});

describe('quando a trava age', () => {
  it('o nó devolve sucesso pulado, e o fluxo segue', async () => {
    proximoResultado = { success: true, skipped: true, reason: 'duplicate_send' };
    const r = await enviar();
    expect(r.status).toBe('success');
    expect(r.output.sent).toBe(false);
    expect(r.output.skipped).toBe(true);
  });

  it('envio normal continua reportando sucesso', async () => {
    const r = await enviar();
    expect(r.status).toBe('success');
    expect(r.output.skipped).toBeFalsy();
  });
});
