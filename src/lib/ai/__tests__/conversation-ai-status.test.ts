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
 * O contrato de DEPOIS do conserto está no fim do arquivo, como `it.todo`.
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
}

const db: DbState = {
  activeAgentRows: null,
  agent: null,
  botMessages: 0,
  hasHumanReply: false,
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
  db.activeAgentRows = [{ agent_id: AGENT }];
  db.agent = { id: AGENT, name: 'Matheus', settings: { behavior: {} } };
  db.botMessages = 0;
  db.hasHumanReply = false;
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
// O contrato DEPOIS do conserto do L1. Cada linha vira um `it` quando
// `resolveConversationAiStatus` passar a consultar `getRuntimeMode`.
// ---------------------------------------------------------------------------

describe('L1 — o badge precisa responder pela régua do caminho certo', () => {
  it.todo('org em runtime: nenhum guard do cloud-runner bloqueia o badge');
  it.todo('org em runtime: ai_enabled=false continua sendo o freio (a RPC é a mesma nos dois)');
  it.todo('org em runtime: a resposta reflete o freio manual do inbox, não max_messages');
  it.todo('org em legacy: a matriz acima continua idêntica, guard por guard');
  it.todo('erro ao ler ai_runtime_rollout: badge cai para a régua legacy (fail-closed)');
});
