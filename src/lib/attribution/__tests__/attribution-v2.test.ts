// =============================================================
// Atribuição v2 — crédito único e as duas receitas.
//
// Estes testes exercitam o orquestrador contra um Supabase simulado.
// A regra de negócio de verdade mora na função attribute_order do
// Postgres (que a PK (organization_id, order_id) protege); aqui
// travamos o contrato do lado TypeScript:
//
//   • um pedido gera UMA chamada de atribuição, não uma por canal;
//   • a janela é medida a partir da data do PEDIDO;
//   • o modelo first_touch chega ao SQL (antes era ignorado);
//   • 'recipient' não conta como atribuído;
//   • reembolso e cancelamento chamam as funções certas.
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcCalls: Array<{ fn: string; args: any }> = [];
let rpcResult: any = null;
let orgSettings: any = {};

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { email_settings: { attribution: orgSettings } }, error: null }),
        }),
      }),
    }),
    rpc: async (fn: string, args: any) => {
      rpcCalls.push({ fn, args });
      return { data: rpcResult, error: null };
    },
  },
}));

import {
  attributeOrder,
  attributeAcrossChannels,
  refundOrderAttribution,
  revokeOrderAttribution,
} from '../index';

const ORG = 'org-1';
const CONTACT = 'contact-1';
const STORE = 'store-1';

function linha(over: Record<string, any> = {}) {
  return {
    organization_id: ORG, order_id: '12345', contact_id: CONTACT,
    channel: 'email', send_id: 'send-1', campaign_id: null, automation_id: 'auto-1',
    classification: 'attributed', net_revenue: '250.00', ...over,
  };
}

beforeEach(() => {
  rpcCalls.length = 0;
  rpcResult = null;
  orgSettings = {};
});

describe('crédito único', () => {
  it('faz UMA chamada de atribuição para o pedido, não uma por canal', async () => {
    rpcResult = linha();
    await attributeOrder({
      contactId: CONTACT, organizationId: ORG, orderId: '12345', orderValue: 250,
    });
    const atribuicoes = rpcCalls.filter(c => c.fn === 'attribute_order');
    expect(atribuicoes).toHaveLength(1);
  });

  it('o atalho de compatibilidade também credita um canal só', async () => {
    rpcResult = linha({ channel: 'whatsapp', send_id: 'wa-1' });
    const r = await attributeAcrossChannels({
      contactId: CONTACT, organizationId: ORG, orderId: '12345', orderValue: 250,
    });
    // Só o canal vencedor volta marcado — antes os três vinham com o
    // valor cheio e a soma passava de 100% do pedido.
    expect(r.whatsapp.attributed).toBe(true);
    expect(r.email.attributed).toBe(false);
    expect(r.sms.attributed).toBe(false);
    expect(rpcCalls.filter(c => c.fn === 'attribute_order')).toHaveLength(1);
  });
});

describe('janela medida a partir do pedido', () => {
  it('envia a data do pedido para o SQL', async () => {
    rpcResult = linha();
    const quando = '2026-06-15T10:00:00.000Z';
    await attributeOrder({
      contactId: CONTACT, organizationId: ORG, orderId: '1', orderValue: 100, orderAt: quando,
    });
    expect(rpcCalls[0].args.p_order_at).toBe(quando);
  });

  it('usa agora como referência quando a data não vem', async () => {
    rpcResult = linha();
    await attributeOrder({ contactId: CONTACT, organizationId: ORG, orderId: '1', orderValue: 100 });
    expect(rpcCalls[0].args.p_order_at).toBeTruthy();
  });
});

describe('configuração da organização', () => {
  it('aplica as janelas por canal e os padrões', async () => {
    orgSettings = { email_window_days: 10, whatsapp_window_days: 3 };
    rpcResult = linha();
    await attributeOrder({ contactId: CONTACT, organizationId: ORG, orderId: '1', orderValue: 100 });
    const a = rpcCalls[0].args;
    expect(a.p_email_days).toBe(10);
    expect(a.p_whatsapp_days).toBe(3);
    expect(a.p_sms_days).toBe(2);          // padrão
    expect(a.p_count_opens).toBe(true);
    expect(a.p_exclude_mpp).toBe(true);
  });

  it('first_touch finalmente chega ao motor', async () => {
    orgSettings = { model: 'first_touch' };
    rpcResult = linha();
    await attributeOrder({ contactId: CONTACT, organizationId: ORG, orderId: '1', orderValue: 100 });
    expect(rpcCalls[0].args.p_model).toBe('first_touch');
  });

  it('modelo desconhecido volta para last_touch', async () => {
    orgSettings = { model: 'multi_touch_inventado' };
    rpcResult = linha();
    await attributeOrder({ contactId: CONTACT, organizationId: ORG, orderId: '1', orderValue: 100 });
    expect(rpcCalls[0].args.p_model).toBe('last_touch');
  });
});

describe('as duas receitas', () => {
  it('classification=attributed conta como atribuído', async () => {
    rpcResult = linha({ classification: 'attributed' });
    const r = await attributeOrder({ contactId: CONTACT, organizationId: ORG, orderId: '1', orderValue: 250 });
    expect(r.attributed).toBe(true);
    expect(r.classification).toBe('attributed');
    expect(r.netRevenue).toBe(250);
  });

  it('classification=recipient NÃO conta como atribuído', async () => {
    // Recebeu a mensagem mas não engajou: entra só na receita dos
    // destinatários (o totalRevenue da Omnisend).
    rpcResult = linha({ classification: 'recipient', channel: null, send_id: null });
    const r = await attributeOrder({ contactId: CONTACT, organizationId: ORG, orderId: '1', orderValue: 250 });
    expect(r.attributed).toBe(false);
    expect(r.classification).toBe('recipient');
    expect(r.channel).toBeNull();
  });

  it('pedido sem candidato nenhum não vira crédito', async () => {
    rpcResult = null;
    const r = await attributeOrder({ contactId: CONTACT, organizationId: ORG, orderId: '1', orderValue: 250 });
    expect(r.attributed).toBe(false);
  });
});

describe('reembolso e cancelamento', () => {
  it('reembolso ajusta o total reembolsado do pedido', async () => {
    rpcResult = true;
    await refundOrderAttribution(ORG, '12345', 80);
    const c = rpcCalls.find(x => x.fn === 'refund_order_attribution');
    expect(c?.args.p_refunded_total).toBe(80);
    expect(c?.args.p_order_id).toBe('12345');
  });

  it('cancelamento revoga pelo pedido', async () => {
    rpcResult = true;
    const ok = await revokeOrderAttribution({ organizationId: ORG, orderId: '12345' });
    expect(ok).toBe(true);
    expect(rpcCalls.find(x => x.fn === 'revoke_order_attribution')).toBeTruthy();
  });

  it('atribuição já nasce líquida quando há reembolso parcial', async () => {
    rpcResult = linha({ net_revenue: '170.00' });
    await attributeOrder({
      contactId: CONTACT, organizationId: ORG, orderId: '1', orderValue: 250, refunded: 80,
    });
    expect(rpcCalls[0].args.p_refunded).toBe(80);
  });
});

describe('escopo de loja e moeda', () => {
  it('propaga a loja do pedido (impede crédito entre lojas da mesma org)', async () => {
    rpcResult = linha();
    await attributeOrder({
      contactId: CONTACT, organizationId: ORG, orderId: '1', orderValue: 100, storeId: STORE,
    });
    expect(rpcCalls[0].args.p_store_id).toBe(STORE);
  });

  it('propaga a moeda do pedido', async () => {
    rpcResult = linha();
    await attributeOrder({
      contactId: CONTACT, organizationId: ORG, orderId: '1', orderValue: 100, currency: 'USD',
    });
    expect(rpcCalls[0].args.p_currency).toBe('USD');
  });
});
