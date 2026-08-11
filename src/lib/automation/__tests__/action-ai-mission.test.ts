// =============================================================
// Tests for the action_ai_mission node executor (§3.2.2 F1 passo 1).
//
// O nó faz UMA chamada — emit_ai_mission_job — e vive dos statuses dela:
//   - isTest nunca toca o banco (painel de teste do builder)
//   - config sem eventFamily é erro de configuração, não RPC
//   - 'queued' vira success com conversation_id/msg_id no output
//   - qualquer recusa (not_rolled_out / no_active_mission / contact_not_found)
//     vira o caminho de ERRO do nó, com o status legível no error
//   - o delta enviado só carrega o que o nó pode refinar; node_ref é
//     workflow.id:node.id (a trilha do grant aponta de volta para cá)
// =============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { rpc } }));

import { nodeExecutors } from '../node-executors';

const NODE = { id: 'node-9' } as any;

function baseContext(): any {
  return {
    contact: { id: 'c0ffee00-0000-0000-0000-000000000001' },
    workflow: { id: 'flow-42', name: 'Recuperar carrinho', executionId: 'run-1' },
  };
}

function execute(config: Record<string, any>, overrides: Record<string, any> = {}) {
  return nodeExecutors.action_ai_mission.execute({
    node: NODE,
    config,
    context: baseContext(),
    supabase: {} as any,
    isTest: false,
    organizationId: 'a0000000-0000-0000-0000-000000000000',
    ...overrides,
  });
}

beforeEach(() => {
  rpc.mockReset();
});

describe('action_ai_mission executor', () => {
  it('test mode never touches the database', async () => {
    const res = await execute({ eventFamily: 'cart.abandoned' }, { isTest: true });
    expect(res.status).toBe('success');
    expect(res.output.test).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a node without a mission_ref is a configuration error', async () => {
    const res = await execute({});
    expect(res.status).toBe('error');
    expect(res.error).toContain('eventFamily');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('queued becomes success with the conversation and job ids', async () => {
    rpc.mockResolvedValue({
      data: [{ status: 'queued', conversation_id: 'conv-1', msg_id: 77 }],
      error: null,
    });

    const res = await execute({
      eventFamily: 'cart.abandoned',
      objective: 'lembrar do frete grátis',
      concession: { kind: 'percent', value: 10, object_kind: 'cart', object_ref: 'cart-5' },
    });

    expect(res.status).toBe('success');
    expect(res.output).toMatchObject({ queued: true, conversation_id: 'conv-1', msg_id: 77 });

    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('emit_ai_mission_job');
    expect(args.p_event_family).toBe('cart.abandoned');
    expect(args.p_node_ref).toBe('flow-42:node-9');
    expect(args.p_delta).toEqual({ objective: 'lembrar do frete grátis' });
    expect(args.p_concession_request).toEqual({
      kind: 'percent', value: 10, object_kind: 'cart', object_ref: 'cart-5',
    });
  });

  it('a refusal takes the node error path with the status readable', async () => {
    rpc.mockResolvedValue({
      data: [{ status: 'no_active_mission', conversation_id: null, msg_id: null }],
      error: null,
    });

    const res = await execute({ eventFamily: 'cart.abandoned' });
    expect(res.status).toBe('error');
    expect(res.error).toContain('no_active_mission');
  });

  it('an rpc failure is the node error, not an exception', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

    const res = await execute({ eventFamily: 'cart.abandoned' });
    expect(res.status).toBe('error');
    expect(res.error).toContain('permission denied');
  });

  it('a missing contact in the flow context is refused before the rpc', async () => {
    const context = baseContext();
    delete context.contact;
    const res = await execute({ eventFamily: 'cart.abandoned' }, { context });
    expect(res.status).toBe('error');
    expect(rpc).not.toHaveBeenCalled();
  });
});
