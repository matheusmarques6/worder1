// 9.4 — a trilha única que a Atividade lê. O contrato: tudo escopado pela
// org DENTRO da query (a view não tem RLS — quem lê é service_role); o
// detalhe só sai se a conversa pertencer à org (guarda anti-IDOR); erro de
// banco sobe como exceção — a rota decide o 500.

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { listRuntimeActivity, runtimeConversationDetail } from '../activity';

const ORG = 'a0000000-0000-0000-0000-000000000000';
const CONV = 'c0000000-0000-0000-0000-000000000000';

type Result = { data: unknown; error: { message: string } | null };

function chain(result: Result) {
  const target: Record<string, unknown> = {};
  const handler = {
    get(_t: unknown, prop: string) {
      if (prop === 'then') {
        return (resolve: (r: Result) => void) => resolve(result);
      }
      return (...args: unknown[]) => {
        calls.push([prop, args]);
        return proxy;
      };
    },
  };
  const calls: [string, unknown[]][] = [];
  const proxy = new Proxy(target, handler) as any;
  return { proxy, calls };
}

function clientReturning(byTable: Record<string, Result>) {
  const seen: Record<string, [string, unknown[]][]> = {};
  return {
    seen,
    client: {
      from(table: string) {
        const { proxy, calls } = chain(
          byTable[table] ?? { data: [], error: null }
        );
        seen[table] = calls;
        return proxy;
      },
    } as any,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('listRuntimeActivity', () => {
  it('lê a view escopada pela org, mais recente primeiro', async () => {
    const row = { conversation_id: CONV, cost_usd: 0.0015 };
    const { client, seen } = clientReturning({
      ai_runtime_activity: { data: [row], error: null },
    });

    const rows = await listRuntimeActivity(client, ORG);

    expect(rows).toEqual([row]);
    const calls = seen.ai_runtime_activity;
    expect(calls).toContainEqual(['eq', ['organization_id', ORG]]);
    expect(calls.find(([m]) => m === 'order')).toBeTruthy();
    expect(calls).toContainEqual(['limit', [50]]);
  });

  it('erro do banco vira exceção, não lista vazia silenciosa', async () => {
    const { client } = clientReturning({
      ai_runtime_activity: { data: null, error: { message: 'boom' } },
    });
    await expect(listRuntimeActivity(client, ORG)).rejects.toThrow('boom');
  });
});

describe('runtimeConversationDetail', () => {
  it('detalhe sai com a conversa, as chamadas e as tools', async () => {
    const { client, seen } = clientReturning({
      ai_runtime_activity: { data: [{ conversation_id: CONV }], error: null },
      ai_runtime_activity_calls: { data: [{ purpose: 'agent_reply' }], error: null },
      ai_runtime_activity_tools: { data: [{ tool_name: 'create_coupon' }], error: null },
    });

    const detail = await runtimeConversationDetail(client, ORG, CONV);

    expect(detail).toEqual({
      conversation: { conversation_id: CONV },
      calls: [{ purpose: 'agent_reply' }],
      tools: [{ tool_name: 'create_coupon' }],
    });
    expect(seen.ai_runtime_activity).toContainEqual(['eq', ['organization_id', ORG]]);
    expect(seen.ai_runtime_activity_calls).toContainEqual([
      'eq', ['conversation_id', CONV],
    ]);
    expect(seen.ai_runtime_activity_tools).toContainEqual([
      'eq', ['conversation_id', CONV],
    ]);
    // A view não avalia RLS (sem security_invoker) — o filtro de org na query
    // é a fronteira, mesmo já existindo o guard da conversa acima.
    expect(seen.ai_runtime_activity_calls).toContainEqual([
      'eq', ['organization_id', ORG],
    ]);
    expect(seen.ai_runtime_activity_tools).toContainEqual([
      'eq', ['organization_id', ORG],
    ]);
  });

  it('conversa de outra org é null — nunca vaza pelo id', async () => {
    const { client, seen } = clientReturning({
      ai_runtime_activity: { data: [], error: null },
    });

    const detail = await runtimeConversationDetail(client, ORG, CONV);

    expect(detail).toBeNull();
    expect(seen.ai_runtime_activity_calls).toBeUndefined();
  });
});
