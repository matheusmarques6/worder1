/**
 * item 10 da auditoria — o webhook de status passa a chamar
 * `correlate_channel_status` quando o status carrega `biz_opaque_callback_data`
 * (a idempotency_key que o runtime Python grava no envio, cloud_api.py).
 *
 * Sem isso a outbox nunca saía de `sent` e falha de entrega nunca virava
 * `last_error` — a RPC existe em SQL desde 20260813000003 mas não tinha
 * chamador nenhum em src/.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG = '11111111-1111-1111-1111-111111111111';
const ACCOUNT_ID = '22222222-2222-2222-2222-222222222222';
const PHONE_NUMBER_ID = '555000111';

const ACCOUNT = {
  id: ACCOUNT_ID,
  organization_id: ORG,
  phone_number_id: PHONE_NUMBER_ID,
  phone_number: '5511999990000',
  waba_id: 'waba-1',
};

interface Recorded {
  rpcs: Array<{ name: string; args: any }>;
}

const rec: Recorded = { rpcs: [] };

// null = sem mirror local (mensagem pura do runtime, o caso comum nos testes
// de correlação). Fix round 1 no guard anti-retrógrado usa isto pra simular
// uma row já em 'delivered' quando um 'sent' atrasado chega depois.
const cloudMessagesState: { currentRow: { status: string; delivered_at?: string | null; read_at?: string | null } | null } = {
  currentRow: null,
};

function resultFor(table: string) {
  if (table === 'whatsapp_business_accounts') {
    return { data: [ACCOUNT], error: null };
  }
  // A leitura do currentRow e o update final ambos caem aqui — o update não
  // precisa de um retorno específico pra estes testes.
  if (table === 'whatsapp_cloud_messages') {
    return { data: cloudMessagesState.currentRow, error: null };
  }
  return { data: null, error: null };
}

function from(table: string) {
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (onOk: any, onErr: any) => Promise.resolve(resultFor(table)).then(onOk, onErr);
        }
        return (..._a: any[]) => chain;
      },
    },
  );
  return chain;
}

const rpc = vi.fn(async (name: string, args: any): Promise<{ data: any; error: any }> => {
  rec.rpcs.push({ name, args });
  return { data: null, error: null };
});

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => from(t), rpc: (n: string, a: any) => rpc(n, a) },
}));

vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { processWebhookPayload } from '../webhook-processor';
import { wlog } from '@/lib/observability/whatsapp-logger';

function statusPayload(status: Partial<Record<string, any>>) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { phone_number_id: PHONE_NUMBER_ID, display_phone_number: '5511999990000' },
              statuses: [
                {
                  id: 'wamid.OUT1',
                  status: 'sent',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: '5511988887777',
                  ...status,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

const correlateCalls = () => rec.rpcs.filter((r) => r.name === 'correlate_channel_status');

beforeEach(() => {
  rec.rpcs = [];
  cloudMessagesState.currentRow = null;
  rpc.mockClear();
  rpc.mockImplementation(async (name: string, args: any) => {
    rec.rpcs.push({ name, args });
    return { data: null, error: null };
  });
  (wlog.error as any).mockClear?.();
  (wlog.info as any).mockClear?.();
});

describe('status COM biz_opaque_callback_data — chama correlate_channel_status', () => {
  it('chama a RPC com a chave, o status traduzido e o message_id da Meta', async () => {
    await processWebhookPayload(
      statusPayload({ status: 'sent', biz_opaque_callback_data: 'idem-key-1' }),
    );

    expect(correlateCalls()).toHaveLength(1);
    expect(correlateCalls()[0].args).toEqual({
      p_idempotency_key: 'idem-key-1',
      p_status: 'sent',
      p_provider_message_id: 'wamid.OUT1',
      p_error: null,
    });
  });

  it.each([
    ['sent', 'sent'],
    ['delivered', 'sent'],
    ['read', 'sent'],
    ['failed', 'failed'],
  ])('traduz o status da Meta "%s" para "%s" (vocabulário da outbox)', async (metaStatus, outboxStatus) => {
    await processWebhookPayload(
      statusPayload({ status: metaStatus, biz_opaque_callback_data: 'idem-key-2' }),
    );

    expect(correlateCalls()[0].args.p_status).toBe(outboxStatus);
  });

  it('retorno false não é erro — loga informativo e segue', async () => {
    rpc.mockImplementation(async (name: string, args: any) => {
      rec.rpcs.push({ name, args });
      if (name === 'correlate_channel_status') return { data: false, error: null };
      return { data: null, error: null };
    });

    const result = await processWebhookPayload(
      statusPayload({ status: 'sent', biz_opaque_callback_data: 'idem-sem-linha' }),
    );

    expect(result.errors).toBe(0);
    expect(wlog.error).not.toHaveBeenCalled();
    expect(wlog.info).toHaveBeenCalledWith(
      expect.stringContaining('correlate'),
      expect.objectContaining({ idempotency_key: 'idem-sem-linha' }),
    );
  });

  it('RPC devolvendo erro não derruba o processamento do webhook', async () => {
    rpc.mockImplementation(async (name: string, args: any) => {
      rec.rpcs.push({ name, args });
      if (name === 'correlate_channel_status') return { data: null, error: { message: 'boom' } };
      return { data: null, error: null };
    });

    const result = await processWebhookPayload(
      statusPayload({ status: 'sent', biz_opaque_callback_data: 'idem-key-3' }),
    );

    expect(result.errors).toBe(0);
    expect(result.processed).toBe(1);
    expect(wlog.error).toHaveBeenCalledWith(
      expect.stringContaining('correlate'),
      expect.objectContaining({ idempotency_key: 'idem-key-3', error: 'boom' }),
    );
  });
});

describe('status SEM biz_opaque_callback_data — caminho de hoje intacto', () => {
  it('não chama a RPC — mensagem sem linha de outbox pra correlacionar', async () => {
    const result = await processWebhookPayload(statusPayload({ status: 'delivered' }));

    expect(correlateCalls()).toHaveLength(0);
    expect(result.errors).toBe(0);
  });
});

describe('fix round 1 — o motivo da falha chega em p_error', () => {
  it('status failed manda code e message da Meta juntos em p_error', async () => {
    await processWebhookPayload(
      statusPayload({
        status: 'failed',
        biz_opaque_callback_data: 'idem-falha-1',
        errors: [{ code: 131047, message: 'Re-engagement message' }],
      }),
    );

    expect(correlateCalls()[0].args.p_error).toBe('131047 - Re-engagement message');
  });

  it('sem errors[] no status, p_error vai null — não inventa motivo', async () => {
    await processWebhookPayload(
      statusPayload({ status: 'sent', biz_opaque_callback_data: 'idem-ok-1' }),
    );

    expect(correlateCalls()[0].args.p_error).toBeNull();
  });

  it('code sem message (ou vice-versa) ainda manda o que existe, sem "undefined" colado', async () => {
    await processWebhookPayload(
      statusPayload({
        status: 'failed',
        biz_opaque_callback_data: 'idem-falha-2',
        errors: [{ code: 131047 }],
      }),
    );

    expect(correlateCalls()[0].args.p_error).toBe('131047');
  });
});

describe('fix round 1 — guarda anti-retrógrado não vaza uma correlação de status velho', () => {
  it('status retrógrado (chega depois de um mais avançado) NÃO chama correlate_channel_status, mesmo com a chave', async () => {
    // A row já está em 'delivered' (ordinal 2); um 'sent' (ordinal 1) chega
    // atrasado — o guard de webhook-processor.ts:659 dá `return` ANTES do
    // bloco de correlação. Hoje isso não perde nada de verdade (sent/
    // delivered/read colapsam no mesmo 'sent' da outbox), mas o guard corta
    // o caminho inteiro — inclusive a correlação — sem saber disso. Este
    // teste fixa esse comportamento: se o vocabulário da outbox um dia
    // ganhar um status próprio para 'delivered'/'read', é aqui que a
    // regressão aparece primeiro.
    cloudMessagesState.currentRow = { status: 'delivered' };

    const result = await processWebhookPayload(
      statusPayload({ status: 'sent', biz_opaque_callback_data: 'idem-retrogrado' }),
    );

    expect(correlateCalls()).toHaveLength(0);
    expect(result.errors).toBe(0);
  });

  it('status NÃO retrógrado com a mesma chave chama a RPC normalmente (controle)', async () => {
    cloudMessagesState.currentRow = { status: 'sent' };

    await processWebhookPayload(
      statusPayload({ status: 'delivered', biz_opaque_callback_data: 'idem-avanco' }),
    );

    expect(correlateCalls()).toHaveLength(1);
  });
});
