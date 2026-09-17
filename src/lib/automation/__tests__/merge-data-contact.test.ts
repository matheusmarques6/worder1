// =============================================================
// O contato do contexto tem DUAS formas — e o nó de e-mail precisa
// aceitar as duas.
//
// Os dois crons que executam automação de verdade (process-runs e
// auto-process) montam context.contact em camelCase, que é a forma
// canônica do VariableContext. O nó de e-mail lia só snake_case, então
// {{first_name}} virava string vazia em TODO envio real — enquanto o
// preview e o /execute, que passam a linha crua do banco, mostravam o
// nome certo. Resultado na caixa de entrada: assuntos começando com
// vírgula (", your order is ready for pickup!").
//
// Aqui travamos o contrato: as duas formas produzem o mesmo mergeData.
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// O nó recusa enviar sem provedor configurado; aqui só precisamos passar
// por esse portão para chegar ao mergeData.
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 'test-key';

const enviados: Array<{ subject: string; mergeData: Record<string, string> }> = [];

vi.mock('@/lib/email/send-campaign-email', () => ({
  sendCampaignEmail: async (args: any) => {
    enviados.push({ subject: args.subject, mergeData: args.mergeData });
    return { success: true, messageId: 'msg-1' };
  },
}));

// O executor resolve o remetente e prepara o HTML antes de enviar;
// nada disso é o objeto deste teste.
vi.mock('@/lib/email/sender-identity', () => ({
  resolveSenderIdentity: async () => ({
    senderEmail: 'loja@exemplo.com',
    senderName: 'Loja',
    replyTo: undefined,
  }),
}));

import { nodeExecutors } from '../node-executors';

const CONTATO_BASE = {
  id: 'c-1',
  email: 'edward@exemplo.com',
  phone: '+5511999999999',
  tags: [],
  createdAt: '2026-09-02T12:54:23Z',
};

/** Forma canônica: a que process-runs e auto-process montam. */
const camelCase = {
  ...CONTATO_BASE,
  firstName: 'Edward',
  lastName: 'Murphy',
  customFields: { plano: 'ouro' },
  totalOrders: 3,
  totalSpent: 450,
};

/** Forma crua do banco: a que /execute e o preview passam. */
const snakeCase = {
  ...CONTATO_BASE,
  first_name: 'Edward',
  last_name: 'Murphy',
  custom_fields: { plano: 'ouro' },
  total_orders: 3,
  total_spent: 450,
};

function contexto(contact: any) {
  return {
    organizationId: 'org-1',
    contact,
    trigger: { type: 'trigger_placed_order', data: {}, timestamp: '2026-09-04T12:59:00Z' },
  } as any;
}

const CONFIG = {
  // 'live' é obrigatório: um nó em rascunho retorna antes de montar o
  // mergeData (é o portão de publicação por nó).
  emailStatus: 'live',
  subject: '{{first_name}}, your order is ready for pickup!',
  html: '<p>Olá {{first_name}} {{last_name}}</p>',
  fromEmail: 'loja@exemplo.com',
};

/** Supabase encadeável que devolve vazio — nenhuma consulta é objeto
 *  deste teste, só não podem explodir no caminho até o envio. */
function supabaseVazio(): any {
  const chain: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') return undefined; // não é uma promise
        if (prop === 'single' || prop === 'maybeSingle') {
          return async () => ({ data: null, error: null });
        }
        return () => chain;
      },
    }
  );
  return chain;
}

async function executar(contact: any) {
  enviados.length = 0;
  await (nodeExecutors as any).action_email.execute({
    node: { id: 'n-email', data: { config: CONFIG } },
    config: CONFIG,
    context: contexto(contact),
    isTest: false,
    supabase: supabaseVazio(),
    // Sem organizationId as regras de quiet hours / frequency cap e a
    // busca de consentimento não entram — fora do escopo daqui.
    organizationId: undefined,
  });
  return enviados[0];
}

beforeEach(() => {
  enviados.length = 0;
});

describe('mergeData do nó de e-mail', () => {
  it('resolve o primeiro nome a partir do contato camelCase (o dos crons)', async () => {
    const enviado = await executar(camelCase);
    expect(enviado?.mergeData.first_name).toBe('Edward');
    expect(enviado?.mergeData.last_name).toBe('Murphy');
    expect(enviado?.mergeData.full_name).toBe('Edward Murphy');
  });

  it('continua resolvendo a partir do contato snake_case (preview e /execute)', async () => {
    const enviado = await executar(snakeCase);
    expect(enviado?.mergeData.first_name).toBe('Edward');
    expect(enviado?.mergeData.full_name).toBe('Edward Murphy');
  });

  it('as duas formas produzem exatamente o mesmo mergeData', async () => {
    const a = await executar(camelCase);
    const b = await executar(snakeCase);
    expect(a?.mergeData).toEqual(b?.mergeData);
  });

  it('total_orders e total_spent deixam de ser sempre zero', async () => {
    const enviado = await executar(camelCase);
    expect(enviado?.mergeData.total_orders).toBe('3');
    expect(enviado?.mergeData.total_spent).toBe('450');
  });

  it('campos personalizados chegam nas duas formas', async () => {
    expect((await executar(camelCase))?.mergeData['custom.plano']).toBe('ouro');
    expect((await executar(snakeCase))?.mergeData['custom.plano']).toBe('ouro');
  });

  it('o assunto nunca começa com vírgula por nome vazio', async () => {
    const enviado = await executar(camelCase);
    expect(enviado?.subject.startsWith(',')).toBe(false);
  });
});
