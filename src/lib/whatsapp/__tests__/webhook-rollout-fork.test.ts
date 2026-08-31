/**
 * A bifurcação legacy × runtime do webhook (pacote F3).
 *
 * `webhook-processor.ts` é o único lugar onde uma mensagem que chega decide
 * qual cérebro vai respondê-la: o cloud-runner antigo (debounce em
 * `ai_debounce_until` + job QStash) ou o runtime Python (RPC
 * `ingest_inbound_message` + coalescer). O arquivo tinha ZERO testes — e é
 * exatamente a peça que a F3 quer remover.
 *
 * O contrato provado aqui, nos dois sentidos:
 *   - uma conversa NUNCA está nos dois mecanismos ao mesmo tempo;
 *   - org sem linha de rollout, ou com erro de leitura, continua no legado
 *     (fail-closed — nunca migra ninguém por acidente, nunca silencia o bot
 *     de quem não migrou);
 *   - falha do caminho runtime não derruba a ingestão da mensagem.
 *
 * Enquanto o legado for o plano de rollback, esta suíte é o que autoriza
 * mexer nele. Quando ele for removido, ela vira a prova de que não sobrou
 * agendamento legado em lugar nenhum.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Estado e gravação do banco
// ---------------------------------------------------------------------------

const ORG = '11111111-1111-1111-1111-111111111111';
const ACCOUNT_ID = '22222222-2222-2222-2222-222222222222';
const CONVERSATION_ID = '33333333-3333-3333-3333-333333333333';
const CONTACT_ID = '44444444-4444-4444-4444-444444444444';
const PHONE_NUMBER_ID = '555000111';

interface Recorded {
  rpcs: Array<{ name: string; args: any }>;
  updates: Array<{ table: string; patch: any }>;
}

const rec: Recorded = { rpcs: [], updates: [] };

const state = {
  conversationAiEnabled: true as boolean | null,
  messageAlreadySeen: false,
};

function resultFor(table: string, calls: Array<{ m: string; a: any[] }>) {
  const called = (m: string) => calls.some((c) => c.m === m);

  if (table === 'whatsapp_business_accounts') {
    return {
      data: [
        {
          id: ACCOUNT_ID,
          organization_id: ORG,
          store_id: null,
          phone_number_id: PHONE_NUMBER_ID,
          phone_number: '5511999990000',
          waba_id: 'waba-1',
        },
      ],
      error: null,
    };
  }

  if (table === 'whatsapp_contacts') {
    return { data: { id: CONTACT_ID, name: 'Matheus', crm_contact_id: 'crm-1' }, error: null };
  }

  if (table === 'whatsapp_cloud_conversations') {
    return {
      data: {
        id: CONVERSATION_ID,
        organization_id: ORG,
        contact_id: CONTACT_ID,
        store_id: null,
        ai_enabled: state.conversationAiEnabled,
      },
      error: null,
    };
  }

  if (table === 'whatsapp_cloud_messages') {
    if (called('insert')) return { data: { id: 'msg-row-1' }, error: null };
    return { data: state.messageAlreadySeen ? { id: 'msg-row-1' } : null, error: null };
  }

  if (table === 'contacts') return { data: { id: 'crm-1' }, error: null };

  return { data: null, error: null };
}

function from(table: string) {
  const calls: Array<{ m: string; a: any[] }> = [];
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (onOk: any, onErr: any) =>
            Promise.resolve(resultFor(table, calls)).then(onOk, onErr);
        }
        return (...a: any[]) => {
          calls.push({ m: prop, a });
          if (prop === 'update') rec.updates.push({ table, patch: a[0] });
          return chain;
        };
      },
    },
  );
  return chain;
}

const rpc = vi.fn(
  async (name: string, args: any): Promise<{ data: any; error: any }> => {
    rec.rpcs.push({ name, args });
    return { data: null, error: null };
  },
);

const supabaseDouble = { from: (t: string) => from(t), rpc };

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => from(t), rpc: (n: string, a: any) => rpc(n, a) },
  getSupabaseAdmin: () => supabaseDouble,
}));

// ---------------------------------------------------------------------------
// Vizinhança: nada disso é o objeto do teste, só não pode atrapalhar
// ---------------------------------------------------------------------------

vi.mock('@/lib/services/automation/rule-engine', () => ({
  RuleEngine: { processCreationRules: vi.fn(async () => undefined) },
}));

vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const enqueueWhatsAppAiRespond = vi.fn(async (..._a: any[]) => 'qstash-msg-1');
vi.mock('@/lib/queue', () => ({
  enqueueWhatsAppAiRespond: (...a: any[]) => enqueueWhatsAppAiRespond(...a),
  enqueueWhatsAppInboundMedia: vi.fn(async () => 'qstash-media-1'),
}));

const recordAiStep = vi.fn(async (_input: any) => undefined);
vi.mock('@/lib/ai/run-steps', () => ({
  recordAiStep: (input: any) => recordAiStep(input),
  AI_RUN_STEPS: { QUEUED: 'queued', SKIPPED: 'skipped' },
}));

const getDeliveryDebounceSeconds = vi.fn(async () => 12);
vi.mock('@/lib/ai/delivery-settings', () => ({
  getDeliveryDebounceSeconds: () => getDeliveryDebounceSeconds(),
}));

const getRuntimeMode = vi.fn(
  async (_client?: any, _org?: string): Promise<'legacy' | 'runtime'> => 'legacy',
);
vi.mock('@/lib/ai/runtime-rollout', () => ({
  getRuntimeMode: (client: any, org: string) => getRuntimeMode(client, org),
  clearRuntimeModeCache: vi.fn(),
}));

vi.mock('@/lib/ai/cloud-runner', () => ({
  maybeRunAgentForCloudConversation: vi.fn(async () => undefined),
}));

import { processWebhookPayload } from '../webhook-processor';

// ---------------------------------------------------------------------------

function inboundTextPayload(text = 'boa tarde') {
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
              contacts: [{ wa_id: '5511988887777', profile: { name: 'Matheus' } }],
              messages: [
                {
                  id: 'wamid.TESTE1',
                  from: '5511988887777',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function inboundMediaPayload(message: any) {
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
              contacts: [{ wa_id: '5511988887777', profile: { name: 'Matheus' } }],
              messages: [
                {
                  id: 'wamid.TESTE1',
                  from: '5511988887777',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  ...message,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function inboundAudioPayload() {
  return inboundMediaPayload({
    type: 'audio',
    audio: { id: 'media-audio-1', mime_type: 'audio/ogg', sha256: 'x' },
  });
}

function inboundImagePayload(overrides: { caption?: string } = {}) {
  return inboundMediaPayload({
    type: 'image',
    image: { id: 'media-img-1', mime_type: 'image/jpeg', sha256: 'x', ...overrides },
  });
}

const UNSUPPORTED_MESSAGES: Record<string, any> = {
  sticker: { type: 'sticker', sticker: { id: 'media-sticker-1', mime_type: 'image/webp', sha256: 'x' } },
  document: {
    type: 'document',
    document: { id: 'media-doc-1', filename: 'nota.pdf', mime_type: 'application/pdf', sha256: 'x' },
  },
  location: { type: 'location', location: { latitude: -23.5, longitude: -46.6 } },
  video: { type: 'video', video: { id: 'media-video-1', mime_type: 'video/mp4', sha256: 'x' } },
};

function inboundUnsupportedPayload(type: keyof typeof UNSUPPORTED_MESSAGES) {
  return inboundMediaPayload(UNSUPPORTED_MESSAGES[type]);
}

const ingestCalls = () => rec.rpcs.filter((r) => r.name === 'ingest_inbound_message');
const cancelCalls = () => rec.rpcs.filter((r) => r.name === 'cancel_pending_ai_response');
const legacyDebounceUpdates = () =>
  rec.updates.filter((u) => u.patch && 'ai_debounce_until' in u.patch);

beforeEach(() => {
  rec.rpcs = [];
  rec.updates = [];
  state.conversationAiEnabled = true;
  state.messageAlreadySeen = false;
  rpc.mockClear();
  enqueueWhatsAppAiRespond.mockClear();
  recordAiStep.mockClear();
  getDeliveryDebounceSeconds.mockClear();
  getRuntimeMode.mockReset();
  getRuntimeMode.mockResolvedValue('legacy');
});

describe('org NÃO migrada (legacy) — o cinto de segurança', () => {
  beforeEach(() => getRuntimeMode.mockResolvedValue('legacy'));

  it('agenda pelo debounce legado e enfileira o worker QStash', async () => {
    await processWebhookPayload(inboundTextPayload());

    expect(legacyDebounceUpdates()).toHaveLength(1);
    expect(legacyDebounceUpdates()[0].table).toBe('whatsapp_cloud_conversations');
    expect(legacyDebounceUpdates()[0].patch.ai_pending).toBe(true);
    expect(enqueueWhatsAppAiRespond).toHaveBeenCalledTimes(1);
  });

  it('NÃO chama a RPC do runtime — uma conversa nunca está nos dois mecanismos', async () => {
    await processWebhookPayload(inboundTextPayload());
    expect(ingestCalls()).toHaveLength(0);
  });

  it('conversa com o bot desligado não agenda nada', async () => {
    state.conversationAiEnabled = false;
    await processWebhookPayload(inboundTextPayload());

    expect(legacyDebounceUpdates()).toHaveLength(0);
    expect(enqueueWhatsAppAiRespond).not.toHaveBeenCalled();
  });

  it('mensagem sem texto útil não agenda (rota unsupported)', async () => {
    await processWebhookPayload(inboundTextPayload('   '));
    expect(enqueueWhatsAppAiRespond).not.toHaveBeenCalled();
  });

  it('sticker não agenda no legado — paridade com o filtro do runtime (item 07)', async () => {
    await processWebhookPayload(inboundUnsupportedPayload('sticker'));
    expect(enqueueWhatsAppAiRespond).not.toHaveBeenCalled();
  });
});

describe('org migrada (runtime) — o caminho canônico', () => {
  beforeEach(() => getRuntimeMode.mockResolvedValue('runtime'));

  it('chama ingest_inbound_message com a janela de agrupamento da loja', async () => {
    await processWebhookPayload(inboundTextPayload());

    expect(ingestCalls()).toHaveLength(1);
    expect(ingestCalls()[0].args).toMatchObject({
      p_organization_id: ORG,
      p_channel: 'whatsapp',
      p_provider_message_id: 'wamid.TESTE1',
      p_debounce_seconds: 12,
    });
    expect(getDeliveryDebounceSeconds).toHaveBeenCalled();
  });

  it('texto mantém o payload de hoje — sem campos de mídia (item 06)', async () => {
    await processWebhookPayload(inboundTextPayload('boa tarde'));

    expect(ingestCalls()[0].args.p_content).toEqual({ type: 'text', text: 'boa tarde' });
  });

  it('áudio leva media_id e mime_type conhecidos no ingest (item 06)', async () => {
    await processWebhookPayload(inboundAudioPayload());

    expect(ingestCalls()).toHaveLength(1);
    expect(ingestCalls()[0].args.p_content).toMatchObject({
      type: 'audio',
      media_id: 'media-audio-1',
      mime_type: 'audio/ogg',
    });
  });

  it('imagem leva media_id, mime_type e caption quando existir (item 06)', async () => {
    await processWebhookPayload(inboundImagePayload({ caption: 'olha isso' }));

    expect(ingestCalls()[0].args.p_content).toMatchObject({
      type: 'image',
      media_id: 'media-img-1',
      mime_type: 'image/jpeg',
      caption: 'olha isso',
    });
  });

  it.each(['sticker', 'document', 'location', 'video'] as const)(
    '%s não chama ingest_inbound_message — tipo não suportado no runtime (item 07)',
    async (type) => {
      await processWebhookPayload(inboundUnsupportedPayload(type));
      expect(ingestCalls()).toHaveLength(0);
    },
  );

  it('NÃO marca ai_debounce_until nem enfileira QStash — o bloco legado é pulado inteiro', async () => {
    await processWebhookPayload(inboundTextPayload());

    expect(legacyDebounceUpdates()).toHaveLength(0);
    expect(enqueueWhatsAppAiRespond).not.toHaveBeenCalled();
  });

  it('bot desligado: ingere o histórico mas CANCELA a resposta agendada', async () => {
    state.conversationAiEnabled = false;
    await processWebhookPayload(inboundTextPayload());

    // O histórico da conversa canônica não pode ter buraco…
    expect(ingestCalls()).toHaveLength(1);
    // …mas a resposta é freada pela mesma RPC do botão do inbox.
    expect(cancelCalls()).toHaveLength(1);
    expect(cancelCalls()[0].args).toMatchObject({ p_organization_id: ORG });
  });

  it('emite o chip de progresso no chat (o inbox não fica mudo durante o debounce)', async () => {
    await processWebhookPayload(inboundTextPayload());

    expect(recordAiStep).toHaveBeenCalledTimes(1);
    expect(recordAiStep.mock.calls[0][0]).toMatchObject({
      organizationId: ORG,
      conversationId: CONVERSATION_ID,
      step: 'queued',
      metadata: { runtime: true, debounce_seconds: 12 },
    });
  });

  it('falha da RPC não derruba o webhook — a mensagem já foi persistida', async () => {
    rpc.mockImplementation(async (name: string, args: any) => {
      rec.rpcs.push({ name, args });
      if (name === 'ingest_inbound_message') return { data: null, error: { message: 'boom' } };
      return { data: null, error: null };
    });

    const result = await processWebhookPayload(inboundTextPayload());

    expect(result.errors).toBe(0);
    expect(result.processed).toBe(1);
    // E não caiu para o legado por causa do erro: a org segue migrada.
    expect(legacyDebounceUpdates()).toHaveLength(0);
  });
});

describe('fail-closed — o rollout na dúvida é legacy', () => {
  it('org sem linha em ai_runtime_rollout usa o legado', async () => {
    // getRuntimeMode já devolve 'legacy' por ausência (contrato provado em
    // runtime-rollout.test.ts); aqui o que se prova é que o processor OBEDECE.
    getRuntimeMode.mockResolvedValue('legacy');
    await processWebhookPayload(inboundTextPayload());

    expect(ingestCalls()).toHaveLength(0);
    expect(enqueueWhatsAppAiRespond).toHaveBeenCalledTimes(1);
  });

  it('o rollout é consultado uma vez por mensagem, com a org da conta resolvida', async () => {
    await processWebhookPayload(inboundTextPayload());

    expect(getRuntimeMode).toHaveBeenCalledTimes(1);
    expect(getRuntimeMode.mock.calls[0][1]).toBe(ORG);
  });
});

describe('ingestão — o que a bifurcação não pode quebrar', () => {
  it('mensagem repetida (mesmo wamid) sai antes de qualquer agendamento', async () => {
    state.messageAlreadySeen = true;
    getRuntimeMode.mockResolvedValue('runtime');

    await processWebhookPayload(inboundTextPayload());

    expect(ingestCalls()).toHaveLength(0);
    expect(enqueueWhatsAppAiRespond).not.toHaveBeenCalled();
    expect(recordAiStep).not.toHaveBeenCalled();
  });

  it('envelope que não é do WhatsApp é ignorado sem tocar em nada', async () => {
    const result = await processWebhookPayload({ object: 'page', entry: [] });

    expect(result.skipped).toBe(1);
    expect(rec.rpcs).toEqual([]);
    expect(getRuntimeMode).not.toHaveBeenCalled();
  });
});
