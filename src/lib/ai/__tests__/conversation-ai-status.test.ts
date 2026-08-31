/**
 * O badge "vai responder?" do inbox (pacote F2 / achado L1).
 *
 * Este módulo decide o que o atendente lê antes de a mensagem chegar, e hoje
 * ele avalia SÓ os guards do cloud-runner (activate_on, cooldown de
 * transferência, max_messages, stop_on_human_reply) — guards que o runtime
 * Python não lê. Para uma org migrada, o badge responde pela régua errada.
 *
 * O que este arquivo faz AGORA: fixa o comportamento atual, guard por guard,
 * na ordem em que eles rodam. É a rede que prova que o conserto do L1 mudou
 * exatamente uma coisa — a resposta para org em `runtime` — e não mexeu no
 * caminho legado, que continua atendendo todas as outras orgs.
 *
 * O contrato de DEPOIS do conserto está no fim do arquivo, no describe "L1 —
 * o badge precisa responder pela régua do caminho certo" — já são testes
 * reais, não mais `it.todo`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Duplo do Supabase: encadeamento livre, resultado decidido pela tabela e
// pela forma da chamada (o count de `head:true` não é a mesma pergunta que o
// select de `hasHumanReply`, e as duas batem na mesma tabela).
// ---------------------------------------------------------------------------

interface DbState {
  activeAgentRows: Array<{ agent_id: string }> | null;
  agent: { id: string; name: string; settings: any } | null;
  botMessages: number;
  hasHumanReply: boolean;
  /** 'legacy' | 'runtime' | null — null simula erro de leitura (fail-closed). */
  runtimeMode: 'legacy' | 'runtime' | null;
}

const db: DbState = {
  activeAgentRows: null,
  agent: null,
  botMessages: 0,
  hasHumanReply: false,
  runtimeMode: 'legacy',
};

const rpc = vi.fn(async (name: string, _args?: any): Promise<{ data: any; error: any }> => {
  if (name === 'get_active_agent_for_conversation') return { data: db.activeAgentRows, error: null };
  return { data: null, error: null };
});

function resultFor(table: string, calls: Array<{ m: string; a: any[] }>) {
  if (table === 'ai_agents') return { data: db.agent, error: null };
  if (table === 'whatsapp_cloud_messages') {
    const isCount = calls.some((c) => c.m === 'select' && c.a[1]?.head === true);
    if (isCount) return { count: db.botMessages, error: null };
    return { data: db.hasHumanReply ? { id: 'msg-humana' } : null, error: null };
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

import { resolveConversationAiStatus, AI_BLOCKER_LABELS } from '../conversation-ai-status';
import { clearRuntimeModeCache } from '../runtime-rollout';

// ---------------------------------------------------------------------------

const ORG = '11111111-1111-1111-1111-111111111111';
const AGENT = '22222222-2222-2222-2222-222222222222';

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
  clearRuntimeModeCache();
  db.activeAgentRows = [{ agent_id: AGENT }];
  db.agent = { id: AGENT, name: 'Matheus', settings: { behavior: {} } };
  db.botMessages = 0;
  db.hasHumanReply = false;
  db.runtimeMode = 'legacy';
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
// O contrato DEPOIS do conserto do L1: resolveConversationAiStatus já
// consulta getRuntimeMode; cada `it` abaixo prova uma linha do contrato.
// ---------------------------------------------------------------------------

describe('L1 — o badge precisa responder pela régua do caminho certo', () => {
  it('org em runtime: nenhum guard do cloud-runner bloqueia o badge', async () => {
    db.runtimeMode = 'runtime';
    // Cenário desenhado pra bloquear em TODOS os guards do cloud-runner ao
    // mesmo tempo, se algum deles ainda pesasse: activate_on manual sem
    // atribuição, cooldown de transferência correndo, max_messages estourado
    // e humano já respondeu. Nenhum desses campos existe do lado do runtime
    // Python — só ai_enabled e ter versão ativa (checados antes) importam lá.
    db.agent!.settings.behavior = {
      activate_on: 'manual',
      cooldown_after_transfer: 300,
      max_messages_per_conversation: 1,
    };
    db.botMessages = 999;
    db.hasHumanReply = true;
    const status = await ask({
      ai_agent_id: null,
      ai_transferred_at: new Date(Date.now() - 60_000).toISOString(),
    });
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

  it('org em runtime: a resposta reflete o freio manual do inbox, não max_messages', async () => {
    db.runtimeMode = 'runtime';
    db.agent!.settings.behavior = { max_messages_per_conversation: 1 };
    db.botMessages = 5; // bem acima do limite — irrelevante para o runtime
    // Com o freio manual (ai_enabled) desligado, o motivo tem que ser
    // ai_disabled — o freio de verdade — nunca max_messages, que o runtime
    // não lê e portanto não pode aparecer como explicação.
    expect(await ask({ ai_enabled: false })).toMatchObject({
      willRespond: false,
      reason: 'ai_disabled',
    });
    // Com o freio manual ligado (ai_enabled=true, o default), a contagem que
    // estouraria o limite no legado não bloqueia nada no runtime.
    expect(await ask({ ai_enabled: true })).toMatchObject({ willRespond: true, reason: null });
  });

  it('org em legacy: a matriz acima continua idêntica, guard por guard', async () => {
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

  it('erro ao ler ai_runtime_rollout: badge cai para a régua legacy (fail-closed)', async () => {
    db.runtimeMode = null; // resultFor devolve error para a leitura de ai_runtime_rollout
    db.agent!.settings.behavior = { max_messages_per_conversation: 1 };
    db.botMessages = 5;
    // getRuntimeMode falha aberto para 'legacy' — o guard do cloud-runner
    // continua valendo, do jeito que valia antes desta tarefa existir.
    expect(await ask()).toMatchObject({ willRespond: false, reason: 'max_messages' });
  });
});
