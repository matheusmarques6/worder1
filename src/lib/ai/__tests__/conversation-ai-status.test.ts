/**
 * O badge "vai responder?" do inbox (pacote F2 / achado L1, revisto no
 * item 37 da auditoria de 28/08).
 *
 * Este módulo decide o que o atendente lê antes de a mensagem chegar.
 * Histórico: o L1 original fez o badge avaliar activate_on, cooldown de
 * transferência, max_messages e stop_on_human_reply — mas com um
 * early-return que DESLIGAVA essa cadeia inteira para org `runtime`, com o
 * argumento de que "o runtime Python nunca lê essa coluna". O item 30
 * portou os oito guards pro runtime Python (`guards.py`), lendo o mesmo
 * espelho legado que esta cadeia já lia — e o early-return virou mentira:
 * badge "Bot ativo" numa conversa calada por qualquer um desses guards.
 *
 * O que este arquivo faz AGORA: fixa o comportamento ATUAL (pós item 37) —
 * a cadeia de guards do cloud-runner roda por igual para os dois motores, e
 * horário (`outside_schedule`) entra na cadeia só para `runtime`, porque é
 * o único dos cinco que o legacy nunca expôs no badge (ele checa horário de
 * verdade dentro de `engine.ts:checkSchedule`, mas isso nunca alimentou este
 * módulo — mudar o legacy aqui seria escopo novo, não o achado do item 37).
 *
 * O describe "item 37 — o badge para de mentir em runtime" prova a inversão:
 * cada guard que antes era ignorado em `runtime` agora bloqueia igual ao
 * `legacy`, e o describe "org em legacy" ao lado prova que nada mudou nesse
 * caminho — a mesma régua de sempre, guard por guard.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Duplo do Supabase: encadeamento livre, resultado decidido pela tabela e
// pela forma da chamada (o count de `head:true` não é a mesma pergunta que o
// select de `hasHumanReply`, e as duas batem na mesma tabela).
// ---------------------------------------------------------------------------

interface DbState {
  activeAgentRows: Array<{ agent_id: string }> | null;
  agent: { id: string; name: string; settings: any } | null;
  agentError: { message: string } | null;
  botMessages: number;
  botMessagesError: { message: string } | null;
  hasHumanReply: boolean;
  humanReplyError: { message: string } | null;
  /** 'legacy' | 'runtime' | null — null simula erro de leitura (fail-closed). */
  runtimeMode: 'legacy' | 'runtime' | null;
}

const db: DbState = {
  activeAgentRows: null,
  agent: null,
  agentError: null,
  botMessages: 0,
  botMessagesError: null,
  hasHumanReply: false,
  humanReplyError: null,
  runtimeMode: 'legacy',
};

const rpc = vi.fn(async (name: string, _args?: any): Promise<{ data: any; error: any }> => {
  if (name === 'get_active_agent_for_conversation') return { data: db.activeAgentRows, error: null };
  return { data: null, error: null };
});

function resultFor(table: string, calls: Array<{ m: string; a: any[] }>) {
  if (table === 'ai_agents') return { data: db.agent, error: db.agentError };
  if (table === 'whatsapp_cloud_messages') {
    const isCount = calls.some((c) => c.m === 'select' && c.a[1]?.head === true);
    if (isCount) return { count: db.botMessages, error: db.botMessagesError };
    return { data: db.hasHumanReply ? { id: 'msg-humana' } : null, error: db.humanReplyError };
  }
  if (table === 'ai_runtime_rollout') {
    if (db.runtimeMode === null) return { data: null, error: { message: 'leitura falhou' } };
    return { data: { mode: db.runtimeMode }, error: null };
  }
  return { data: null, error: null };
}

function from(table: string) {
  const calls: Array<{ m: string; a: any[] }> = [];
  const chain: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (onOk: any, onErr: any) => Promise.resolve(resultFor(table, calls)).then(onOk, onErr);
        }
        return (...a: any[]) => {
          calls.push({ m: prop, a });
          return chain;
        };
      },
    },
  );
  return chain;
}

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: { from: (t: string) => from(t), rpc: (n: string, a: any) => rpc(n, a) },
  getSupabaseAdmin: () => ({ from: (t: string) => from(t), rpc: (n: string, a: any) => rpc(n, a) }),
}));

import {
  resolveConversationAiStatus,
  AI_BLOCKER_LABELS,
  AI_BLOCKER_REASON_ALIASES,
} from '../conversation-ai-status';

// ---------------------------------------------------------------------------

const ORG = '11111111-1111-1111-1111-111111111111';
const AGENT = '22222222-2222-2222-2222-222222222222';
const { state_cases: stateCases } = JSON.parse(readFileSync('fixtures/ai-guard-contract.json', 'utf8')) as {
  state_cases: Array<{ id: string; now: string; settings: any; state: any; expected_badge: string | null }>
};

describe('errors from guard reads do not become factual status (Task 37)', () => {
  it('throws when ai_agents lookup fails instead of returning agent_not_found', async () => {
    db.agentError = { message: 'ai_agents unavailable' };

    await expect(ask()).rejects.toThrow(/ai_agents lookup failed/);
  });

  it('throws when bot message count fails instead of returning active', async () => {
    db.agent!.settings.behavior = { max_messages_per_conversation: 1 };
    db.botMessagesError = { message: 'count unavailable' };

    await expect(ask()).rejects.toThrow(/bot message count failed/);
  });

  it('throws when human reply lookup fails instead of returning active', async () => {
    db.humanReplyError = { message: 'lookup unavailable' };

    await expect(ask()).rejects.toThrow(/human reply lookup failed/);
  });
});

function conversation(over: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    waba_id: '44444444-4444-4444-4444-444444444444',
    ai_enabled: true,
    ai_agent_id: null,
    ai_transferred_at: null,
    ...over,
  } as any;
}

function ask(over: Record<string, unknown> = {}) {
  return resolveConversationAiStatus({ conversation: conversation(over), organizationId: ORG });
}

beforeEach(() => {
  rpc.mockClear();
  db.activeAgentRows = [{ agent_id: AGENT }];
  db.agent = { id: AGENT, name: 'Matheus', settings: { behavior: {} } };
  db.agentError = null;
  db.botMessages = 0;
  db.botMessagesError = null;
  db.hasHumanReply = false;
  db.humanReplyError = null;
  db.runtimeMode = 'legacy';
});

describe('contrato comum de estado — badge', () => {
  it.each(stateCases)('$id', async (testCase) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(testCase.now));
    try {
      const state = testCase.state;
      db.agent!.settings = testCase.settings;
      db.botMessages = state.bot_message_count ?? 0;
      db.hasHumanReply = state.has_human_reply ?? false;
      const status = await ask({
        ai_enabled: state.ai_enabled ?? true,
        ai_agent_id: state.assignment === 'self' ? AGENT : state.assignment === 'other' ? 'other-agent' : null,
        ai_transferred_at: state.transferred_at ?? null,
      });

      expect(status.reason).toBe(testCase.expected_badge);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ordem dos guards — o caminho legado, como está hoje', () => {
  it('ai_enabled=false curto-circuita antes de qualquer consulta', async () => {
    const status = await ask({ ai_enabled: false });
    expect(status).toMatchObject({ willRespond: false, reason: 'ai_disabled' });
    // Não chegou a perguntar quem é o agente: o desligado vence tudo.
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sem agente ativo para o canal → no_active_agent', async () => {
    db.activeAgentRows = [];
    expect(await ask()).toMatchObject({ willRespond: false, reason: 'no_active_agent' });
  });

  it('agente apontado mas ausente da tabela → agent_not_found (e devolve o id)', async () => {
    db.agent = null;
    expect(await ask()).toMatchObject({
      willRespond: false,
      reason: 'agent_not_found',
      agentId: AGENT,
    });
  });

  it('activate_on=manual sem atribuição na conversa → manual_activation_required', async () => {
    db.agent!.settings.behavior = { activate_on: 'manual' };
    expect(await ask({ ai_agent_id: null })).toMatchObject({
      willRespond: false,
      reason: 'manual_activation_required',
    });
  });

  it('activate_on=manual COM o agente atribuído deixa passar', async () => {
    db.agent!.settings.behavior = { activate_on: 'manual' };
    expect(await ask({ ai_agent_id: AGENT })).toMatchObject({ willRespond: true, reason: null });
  });

  it('cooldown de transferência ainda correndo → transfer_cooldown', async () => {
    db.agent!.settings.behavior = { cooldown_after_transfer: 300 };
    const agoraMenos1min = new Date(Date.now() - 60_000).toISOString();
    expect(await ask({ ai_transferred_at: agoraMenos1min })).toMatchObject({
      willRespond: false,
      reason: 'transfer_cooldown',
    });
  });

  it('cooldown já vencido não bloqueia', async () => {
    db.agent!.settings.behavior = { cooldown_after_transfer: 60 };
    const agoraMenos1h = new Date(Date.now() - 3_600_000).toISOString();
    expect(await ask({ ai_transferred_at: agoraMenos1h })).toMatchObject({ willRespond: true });
  });

  it('max_messages atingido → max_messages', async () => {
    db.agent!.settings.behavior = { max_messages_per_conversation: 5 };
    db.botMessages = 5;
    expect(await ask()).toMatchObject({ willRespond: false, reason: 'max_messages' });
  });

  it('max_messages=0 significa sem limite (não consulta contagem)', async () => {
    db.agent!.settings.behavior = { max_messages_per_conversation: 0 };
    db.botMessages = 999;
    expect(await ask()).toMatchObject({ willRespond: true });
  });

  it('stop_on_human_reply é ligado por omissão: humano respondeu → stop_on_human', async () => {
    db.agent!.settings.behavior = {};
    db.hasHumanReply = true;
    expect(await ask()).toMatchObject({ willRespond: false, reason: 'stop_on_human' });
  });

  it('stop_on_human_reply=false explícito deixa o agente seguir', async () => {
    db.agent!.settings.behavior = { stop_on_human_reply: false };
    db.hasHumanReply = true;
    expect(await ask()).toMatchObject({ willRespond: true, reason: null });
  });

  it('nada bloqueando → Bot ativo, com nome do agente', async () => {
    expect(await ask()).toMatchObject({
      willRespond: true,
      reason: null,
      label: 'Bot ativo',
      agentId: AGENT,
      agentName: 'Matheus',
    });
  });

  it('todo motivo de bloqueio tem rótulo e explicação acionável', async () => {
    db.hasHumanReply = true;
    const status = await ask();
    expect(status.label).toBe(AI_BLOCKER_LABELS.stop_on_human);
    expect(status.detail).toBeTruthy();
    expect(status.detail!.length).toBeGreaterThan(20);
  });

  it('settings sem behavior não explode (agente antigo)', async () => {
    db.agent = { id: AGENT, name: 'Matheus', settings: null };
    expect(await ask()).toMatchObject({ willRespond: true });
  });
});

// ---------------------------------------------------------------------------
// O contrato DEPOIS do item 37: resolveConversationAiStatus não early-return
// mais para `runtime` — a cadeia do cloud-runner roda igual, mais horário.
// ---------------------------------------------------------------------------

describe('item 37 — o badge para de mentir em runtime', () => {
  it('declara outside_schedule como alias do outside_business_hours do runtime', () => {
    expect(AI_BLOCKER_REASON_ALIASES.outside_business_hours).toBe('outside_schedule');
  });
  it('org em runtime: activate_on=manual sem atribuição bloqueia igual ao legacy', async () => {
    db.runtimeMode = 'runtime';
    db.agent!.settings.behavior = { activate_on: 'manual' };
    expect(await ask({ ai_agent_id: null })).toMatchObject({
      willRespond: false,
      reason: 'manual_activation_required',
    });
  });

  it('org em runtime: cooldown de transferência ainda correndo bloqueia', async () => {
    db.runtimeMode = 'runtime';
    db.agent!.settings.behavior = { cooldown_after_transfer: 300 };
    const agoraMenos1min = new Date(Date.now() - 60_000).toISOString();
    expect(await ask({ ai_transferred_at: agoraMenos1min })).toMatchObject({
      willRespond: false,
      reason: 'transfer_cooldown',
    });
  });

  it('org em runtime: max_messages atingido bloqueia', async () => {
    db.runtimeMode = 'runtime';
    db.agent!.settings.behavior = { max_messages_per_conversation: 1 };
    db.botMessages = 5;
    expect(await ask()).toMatchObject({ willRespond: false, reason: 'max_messages' });
  });

  it('org em runtime: humano já respondeu (stop_on_human_reply) bloqueia', async () => {
    db.runtimeMode = 'runtime';
    db.agent!.settings.behavior = {};
    db.hasHumanReply = true;
    expect(await ask()).toMatchObject({ willRespond: false, reason: 'stop_on_human' });
  });

  it('org em runtime: fora do horário configurado → outside_schedule', async () => {
    db.runtimeMode = 'runtime';
    // days: [] não bate com dia nenhum da semana — bloqueia sempre, sem
    // depender de que horas são agora (o mesmo truque vale pra
    // isWithinSchedule sozinha, testada em guards.test.ts).
    db.agent!.settings = { behavior: {}, schedule: { days: [] } };
    expect(await ask()).toMatchObject({ willRespond: false, reason: 'outside_schedule' });
  });

  it('org em runtime: schedule.always_active ignora o resto do bloco', async () => {
    db.runtimeMode = 'runtime';
    db.agent!.settings = { behavior: {}, schedule: { always_active: true, days: [] } };
    expect(await ask()).toMatchObject({ willRespond: true, reason: null });
  });

  it('org em runtime: schedule vazio permite resposta mesmo no sábado', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-09-05T15:00:00Z'));
      db.runtimeMode = 'runtime';
      db.agent!.settings = { behavior: {}, schedule: {} };

      expect(await ask()).toMatchObject({ willRespond: true, reason: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it('org em runtime: nada bloqueando (sem settings.schedule) → Bot ativo', async () => {
    db.runtimeMode = 'runtime';
    db.agent!.settings.behavior = {};
    const status = await ask();
    expect(status).toMatchObject({
      willRespond: true,
      reason: null,
      label: 'Bot ativo',
      agentId: AGENT,
      agentName: 'Matheus',
    });
  });

  it('org em runtime: ai_enabled=false continua sendo o freio (a RPC é a mesma nos dois)', async () => {
    db.runtimeMode = 'runtime';
    const status = await ask({ ai_enabled: false });
    expect(status).toMatchObject({ willRespond: false, reason: 'ai_disabled' });
    // O curto-circuito acontece ANTES de sequer perguntar o modo do rollout —
    // é o mesmo código, sem ramificação, para os dois mecanismos.
    expect(rpc).not.toHaveBeenCalled();
  });

  it('org em legacy: a matriz acima continua idêntica, guard por guard (sem regressão)', async () => {
    db.runtimeMode = 'legacy';

    db.agent!.settings.behavior = { activate_on: 'manual' };
    expect(await ask({ ai_agent_id: null })).toMatchObject({
      reason: 'manual_activation_required',
    });

    db.agent!.settings.behavior = { cooldown_after_transfer: 300 };
    expect(
      await ask({ ai_transferred_at: new Date(Date.now() - 60_000).toISOString() }),
    ).toMatchObject({ reason: 'transfer_cooldown' });

    db.agent!.settings.behavior = { max_messages_per_conversation: 5 };
    db.botMessages = 5;
    expect(await ask()).toMatchObject({ reason: 'max_messages' });
    db.botMessages = 0;

    db.agent!.settings.behavior = {};
    db.hasHumanReply = true;
    expect(await ask()).toMatchObject({ reason: 'stop_on_human' });
  });

  it('org em legacy: horário fora da janela NÃO bloqueia o badge (fora de escopo do item 37)', async () => {
    db.runtimeMode = 'legacy';
    // Mesmo schedule que bloqueia em runtime (days: []) — em legacy o badge
    // nunca avaliou horário e continua não avaliando: comportamento intacto.
    db.agent!.settings = { behavior: {}, schedule: { days: [] } };
    expect(await ask()).toMatchObject({ willRespond: true, reason: null });
  });

  it('erro ao ler ai_runtime_rollout sobe em vez de inventar um modo', async () => {
    db.runtimeMode = null; // resultFor devolve error para a leitura de ai_runtime_rollout
    await expect(ask()).rejects.toEqual({ message: 'leitura falhou' });
  });
});

// ---------------------------------------------------------------------------
// Item 49, ruling D — o terceiro sabor do silêncio do item 43: aqui o erro não
// virava dado errado, virava EXPLICAÇÃO errada. `.rpc()` resolve com {error} em
// vez de lançar, o destructuring descartava `error`, `agentRows` ficava null e
// o badge dizia "nenhum agente ativo para esta conversa" — plausível, e falso.
// O par de testes abaixo é a discriminação que faltava: falha e ausência não
// podem produzir a mesma resposta.
// ---------------------------------------------------------------------------
describe('erro da RPC de agente ativo não vira diagnóstico (item 49)', () => {
  it('erro da RPC sobe em vez de virar no_active_agent', async () => {
    rpc.mockImplementationOnce(async () => ({
      data: null,
      error: { message: 'function public.get_active_agent_for_conversation does not exist' },
    }));
    // Sobe até o catch da rota /ai-status (500) → cliente fica com aiStatus
    // null → botBadgeVariant pinta 'unknown'. Nenhum AiBlockerReason novo.
    await expect(ask()).rejects.toThrow(/get_active_agent_for_conversation falhou/);
  });

  it('ausência de agente, sem erro, continua sendo no_active_agent', async () => {
    db.activeAgentRows = [];
    await expect(ask()).resolves.toMatchObject({
      willRespond: false,
      reason: 'no_active_agent',
    });
  });
});
