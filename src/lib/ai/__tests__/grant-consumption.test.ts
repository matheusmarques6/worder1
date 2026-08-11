// 9.2 — o helper que o webhook de pedido pago chama. O contrato: melhor
// esforço SEMPRE (nada aqui derruba o pedido), um RPC por cupom, e a
// idempotência é do banco — este lado só repassa o que o Postgres decidiu.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: { rpc } }));

import { consumeGrantsForOrder } from '../grant-consumption';

const ORG = 'a0000000-0000-0000-0000-000000000000';

beforeEach(() => {
  rpc.mockReset();
});

describe('consumeGrantsForOrder', () => {
  it('um RPC por cupom, com o pedido como referência', async () => {
    rpc.mockResolvedValue({ data: [{ status: 'consumed', grant_id: 'g1' }], error: null });

    const results = await consumeGrantsForOrder(ORG, {
      id: 987654,
      discount_codes: [{ code: 'WD-ABC123' }, { code: 'FRETEGRATIS' }],
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    const [, args] = rpc.mock.calls[0];
    expect(args).toEqual({
      p_organization_id: ORG,
      p_coupon_code: 'WD-ABC123',
      p_order_ref: '987654',
    });
    expect(results[0]).toEqual({ code: 'WD-ABC123', status: 'consumed', grant_id: 'g1' });
  });

  it('pedido sem cupom não toca o banco', async () => {
    const results = await consumeGrantsForOrder(ORG, { id: 1, discount_codes: [] });
    expect(results).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('falha de RPC vira status error, nunca exceção', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const results = await consumeGrantsForOrder(ORG, {
      id: 2,
      discount_codes: [{ code: 'WD-X' }],
    });

    expect(results).toEqual([{ code: 'WD-X', status: 'error' }]);
  });

  it('o already do banco atravessa sem drama', async () => {
    rpc.mockResolvedValue({ data: [{ status: 'already', grant_id: 'g1' }], error: null });

    const results = await consumeGrantsForOrder(ORG, {
      id: 3,
      discount_codes: [{ code: 'WD-ABC123' }],
    });

    expect(results[0].status).toBe('already');
  });
});
