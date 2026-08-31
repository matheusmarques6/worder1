/**
 * Item 14 da auditoria — fechar o double-send do fallback síncrono.
 *
 * webhook-processor.ts chamava o runner (maybeRunAgentForCloudConversation)
 * direto quando o QStash não está configurado, sem passar pelo CLAIM atômico
 * de ai_pending que o worker QStash usa (api/workers/whatsapp-ai-respond).
 * Duas entregas do mesmo webhook pela Meta (ela reentrega) viravam duas
 * respostas ao mesmo cliente.
 *
 * Esta suíte prova, isolada da fork legacy×runtime (webhook-rollout-fork.test.ts):
 *   (a) duas mensagens que caem no fallback síncrono da MESMA conversa só
 *       disparam UMA chamada ao runner — a segunda perde o claim;
 *   (b) com QStash configurado (enqueue retorna um id), nem o claim nem o
 *       runner síncrono são chamados — o worker cuida disso, nada muda;
 *   (c) se o runner lança exceção depois do claim, o claim é LIBERADO
 *       (ai_pending volta a true) em vez de deixar a conversa muda pra
 *       sempre, e o webhook não quebra por causa disso.
 *
 * O claim/release em si (claimAiPendingResponse/releaseAiPendingClaim) é
 * mockado como caixa-preta — a atomicidade da query já é do guard original
 * do worker (extraído, não reescrito); o que se prova aqui é que o caminho
 * síncrono agora OBEDECE esse guard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const ORG = 'aaaaaaaa-1111-1111-1111-111111111111';
const ACCOUNT_ID = 'bbbbbbbb-2222-2222-2222-222222222222';
const CONVERSATION_ID = 'cccccccc-3333-3333-3333-333333333333';
const CONTACT_ID = 'dddddddd-4444-4444-4444-444444444444';
const PHONE_NUMBER_ID = '555000222';

interface Recorded {
  rpcs: Array<{ name: string; args: any }>;
  updates: Array<{ table: string; patch: any }>;
}

const rec: Recorded = { rpcs: [], updates: [] };

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
        ai_enabled: true,
      },
      error: null,
    };
  }

  if (table === 'whatsapp_cloud_messages') {
    if (called('insert')) return { data: { id: 'msg-row-1' }, error: null };
    // Cada teste usa um message_id novo — nunca é visto como duplicata.
    return { data: null, error: null };
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

const rpc = vi.fn(async (name: string, args: any) => {
  rec.rpcs.push({ name, args });
  return { data: null, error: null };
});

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => from(t), rpc: (n: string, a: any) => rpc(n, a) },
}));

vi.mock('@/lib/services/automation/rule-engine', () => ({
  RuleEngine: { processCreationRules: vi.fn(async () => undefined) },
}));

vi.mock('@/lib/observability/whatsapp-logger', () => ({
  wlog: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const enqueueWhatsAppAiRespond = vi.fn(async (..._a: any[]): Promise<string | null> => null);
vi.mock('@/lib/queue', () => ({
  enqueueWhatsAppAiRespond: (...a: any[]) => enqueueWhatsAppAiRespond(...a),
  enqueueWhatsAppInboundMedia: vi.fn(async () => 'qstash-media-1'),
}));

const recordAiStep = vi.fn(async (_input: any) => undefined);
vi.mock('@/lib/ai/run-steps', () => ({
  recordAiStep: (input: any) => recordAiStep(input),
  AI_RUN_STEPS: { QUEUED: 'queued', SKIPPED: 'skipped' },
}));

const getRuntimeMode = vi.fn(async (_c?: any, _o?: string) => 'legacy' as const);
vi.mock('@/lib/ai/runtime-rollout', () => ({
  getRuntimeMode: (client: any, org: string) => getRuntimeMode(client, org),
  clearRuntimeModeCache: vi.fn(),
}));

// O guard em si é caixa-preta aqui — o que se prova é que webhook-processor
// obedece o resultado dele, não a atomicidade da query (já provada no
// código original do worker, só extraído).
type MockRunnerResult = {
  replied: boolean;
  transferred: boolean;
  failure?: 'transient' | 'permanent';
  error?: string;
};
const maybeRunAgentForCloudConversation = vi.fn(
  async (..._a: any[]): Promise<MockRunnerResult> => ({ replied: true, transferred: false }),
);
const claimAiPendingResponse = vi.fn(async (..._a: any[]) => true);
const releaseAiPendingClaim = vi.fn(async (..._a: any[]) => undefined);
vi.mock('@/lib/ai/cloud-runner', () => ({
  maybeRunAgentForCloudConversation: (...a: any[]) => maybeRunAgentForCloudConversation(...a),
  claimAiPendingResponse: (...a: any[]) => claimAiPendingResponse(...a),
  releaseAiPendingClaim: (...a: any[]) => releaseAiPendingClaim(...a),
}));

import { processWebhookPayload } from '../webhook-processor';

function inboundTextPayload(wamid: string, text = 'oi') {
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
                  id: wamid,
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

beforeEach(() => {
  rec.rpcs = [];
  rec.updates = [];
  rpc.mockClear();
  enqueueWhatsAppAiRespond.mockReset();
  enqueueWhatsAppAiRespond.mockResolvedValue(null); // QStash não configurado, por padrão
  recordAiStep.mockClear();
  getRuntimeMode.mockReset();
  getRuntimeMode.mockResolvedValue('legacy');
  maybeRunAgentForCloudConversation.mockReset();
  maybeRunAgentForCloudConversation.mockResolvedValue({ replied: true, transferred: false });
  claimAiPendingResponse.mockReset();
  claimAiPendingResponse.mockResolvedValue(true);
  releaseAiPendingClaim.mockReset();
});

describe('fallback síncrono (QStash indisponível) — claim compartilhado com o worker', () => {
  it('(a) duas entregas na mesma conversa: a 2ª perde o claim e o runner roda só 1 vez', async () => {
    claimAiPendingResponse.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await processWebhookPayload(inboundTextPayload('wamid.A1'));
    await processWebhookPayload(inboundTextPayload('wamid.A2'));

    expect(claimAiPendingResponse).toHaveBeenCalledTimes(2);
    expect(claimAiPendingResponse).toHaveBeenNthCalledWith(1, CONVERSATION_ID);
    expect(claimAiPendingResponse).toHaveBeenNthCalledWith(2, CONVERSATION_ID);
    expect(maybeRunAgentForCloudConversation).toHaveBeenCalledTimes(1);
  });

  it('claim não obtido: nem chama o runner nem libera (não havia claim seu pra liberar)', async () => {
    claimAiPendingResponse.mockResolvedValueOnce(false);

    await processWebhookPayload(inboundTextPayload('wamid.B1'));

    expect(maybeRunAgentForCloudConversation).not.toHaveBeenCalled();
    expect(releaseAiPendingClaim).not.toHaveBeenCalled();
  });

  it('(c) runner lança exceção após o claim: libera ai_pending e não derruba o webhook', async () => {
    claimAiPendingResponse.mockResolvedValueOnce(true);
    maybeRunAgentForCloudConversation.mockRejectedValueOnce(new Error('boom no runner'));

    const result = await processWebhookPayload(inboundTextPayload('wamid.C1'));

    expect(releaseAiPendingClaim).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(result.errors).toBe(0);
    expect(result.processed).toBe(1);
  });

  // Fix round 1 (review de 91d51603): result.failure === 'transient' volta
  // SEM lançar exceção — o cloud-runner devolve isso normalmente (é assim
  // que o worker QStash também detecta transient, ver route.ts:214). Sem
  // este release, essa saída deixava a conversa muda até a próxima mensagem
  // do cliente, exatamente o que a prova (c) do brief cobre.
  it('(d) runner retorna failure=transient (sem lançar): libera o claim — igual a uma exceção', async () => {
    claimAiPendingResponse.mockResolvedValueOnce(true);
    maybeRunAgentForCloudConversation.mockResolvedValueOnce({
      replied: false,
      transferred: false,
      failure: 'transient',
      error: 'timeout do provider',
    });

    const result = await processWebhookPayload(inboundTextPayload('wamid.D-transient'));

    // Distingue "liberou pra uma entrega futura tentar de novo" de "nunca
    // chegou a reivindicar": o claim FOI tomado (chamado com o id certo) e o
    // runner FOI chamado — só depois disso é que o release acontece.
    expect(claimAiPendingResponse).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(maybeRunAgentForCloudConversation).toHaveBeenCalledTimes(1);
    expect(releaseAiPendingClaim).toHaveBeenCalledTimes(1);
    expect(releaseAiPendingClaim).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(result.errors).toBe(0);
  });

  // Falha PERMANENTE == vai falhar de novo do mesmo jeito. Liberar aqui
  // convida o mesmo trabalho fadado na próxima reentrega da Meta — o worker
  // QStash também não reabre o claim pra isso (route.ts só reabre quando
  // failure === 'transient'; permanent cai direto no fluxo de "consumido").
  it('(e) runner retorna failure=permanent: NÃO libera — evita repetir o trabalho fadado numa reentrega', async () => {
    claimAiPendingResponse.mockResolvedValueOnce(true);
    maybeRunAgentForCloudConversation.mockResolvedValueOnce({
      replied: false,
      transferred: false,
      failure: 'permanent',
      error: 'sem agente ativo',
    });

    await processWebhookPayload(inboundTextPayload('wamid.E-permanent'));

    expect(maybeRunAgentForCloudConversation).toHaveBeenCalledTimes(1);
    expect(releaseAiPendingClaim).not.toHaveBeenCalled();
  });

  it('sucesso normal (sem failure): também não libera — o claim fica consumido', async () => {
    claimAiPendingResponse.mockResolvedValueOnce(true);
    maybeRunAgentForCloudConversation.mockResolvedValueOnce({ replied: true, transferred: false });

    await processWebhookPayload(inboundTextPayload('wamid.F-success'));

    expect(releaseAiPendingClaim).not.toHaveBeenCalled();
  });

  it('(f) após liberar por transient, uma entrega seguinte consegue reivindicar de novo e rodar — release não é double-send', async () => {
    claimAiPendingResponse
      .mockResolvedValueOnce(true) // 1ª entrega: reivindica
      .mockResolvedValueOnce(true); // 2ª entrega: reivindica de novo (o release da 1ª reabriu o ai_pending)
    maybeRunAgentForCloudConversation
      .mockResolvedValueOnce({ replied: false, transferred: false, failure: 'transient', error: 'timeout' })
      .mockResolvedValueOnce({ replied: true, transferred: false });

    await processWebhookPayload(inboundTextPayload('wamid.F1'));
    await processWebhookPayload(inboundTextPayload('wamid.F2'));

    expect(claimAiPendingResponse).toHaveBeenCalledTimes(2);
    expect(maybeRunAgentForCloudConversation).toHaveBeenCalledTimes(2);
    // só a 1ª (transient) libera — a 2ª terminou bem, claim fica consumido.
    expect(releaseAiPendingClaim).toHaveBeenCalledTimes(1);
  });
});

describe('(b) QStash configurado — nada muda no fallback síncrono', () => {
  it('não chama o claim nem o runner direto: o worker QStash é quem responde', async () => {
    enqueueWhatsAppAiRespond.mockResolvedValue('qstash-msg-1');

    await processWebhookPayload(inboundTextPayload('wamid.D1'));

    expect(enqueueWhatsAppAiRespond).toHaveBeenCalledTimes(1);
    expect(claimAiPendingResponse).not.toHaveBeenCalled();
    expect(maybeRunAgentForCloudConversation).not.toHaveBeenCalled();
    expect(releaseAiPendingClaim).not.toHaveBeenCalled();
  });
});
