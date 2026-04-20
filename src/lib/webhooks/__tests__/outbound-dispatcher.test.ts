import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSubsResponse = vi.fn();
const mockRpc = vi.fn();
const mockEnqueue = vi.fn();

vi.mock('@/lib/supabase-admin', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    contains: () => mockSubsResponse(),
  };
  return {
    supabaseAdmin: {
      from: () => chain,
      rpc: (name: string, args: any) => mockRpc(name, args),
    },
  };
});

vi.mock('@/lib/queue', () => ({
  enqueueWebhookDelivery: (id: string) => mockEnqueue(id),
}));

import { dispatchToOutbound } from '../outbound-dispatcher';

beforeEach(() => {
  mockSubsResponse.mockReset();
  mockRpc.mockReset();
  mockEnqueue.mockReset();
});

const baseInput = {
  eventType: 'order.created' as const,
  organizationId: 'o',
  storeId: 'store1',
  sourceEventId: '123',
  source: 'shopify',
  store: { id: 'store1', shop_domain: 'x.myshopify.com', name: 'X' },
  data: { order_id: '123' },
};

describe('dispatchToOutbound', () => {
  it('cria N deliveries pra N subscriptions matching', async () => {
    mockSubsResponse.mockResolvedValue({
      data: [
        { id: 's1', store_id: 'store1', organization_id: 'o', url: 'https://a', events: ['order.created'], status: 'active' },
        { id: 's2', store_id: 'store1', organization_id: 'o', url: 'https://b', events: ['order.created'], status: 'active' },
      ],
      error: null,
    });
    mockRpc.mockResolvedValue({ data: [{ id: 'd1' }, { id: 'd2' }], error: null });

    await dispatchToOutbound(baseInput);

    expect(mockRpc).toHaveBeenCalledOnce();
    const [name, args] = mockRpc.mock.calls[0];
    expect(name).toBe('dispatch_insert_deliveries');
    expect(args.p_rows.length).toBe(2);
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it('strips _webhook_dispatch_meta do payload antes de persistir', async () => {
    mockSubsResponse.mockResolvedValue({
      data: [{ id: 's1', store_id: 'store1', organization_id: 'o', url: 'https://a', events: ['order.created'], status: 'active' }],
      error: null,
    });
    mockRpc.mockResolvedValue({ data: [{ id: 'd1' }], error: null });

    await dispatchToOutbound({
      ...baseInput,
      data: { order_id: '123', _webhook_dispatch_meta: { secret: 'leak' } },
    });

    const [, args] = mockRpc.mock.calls[0];
    const payload = args.p_rows[0].payload;
    expect(payload.data._webhook_dispatch_meta).toBeUndefined();
    expect(payload.data.order_id).toBe('123');
  });

  it('eventos sem subscription matching não fazem INSERT nem enqueue', async () => {
    mockSubsResponse.mockResolvedValue({ data: [], error: null });

    await dispatchToOutbound(baseInput);

    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('erro de SELECT não propaga (fluxo de automação não deve quebrar)', async () => {
    mockSubsResponse.mockResolvedValue({ data: null, error: { message: 'db down' } });

    await expect(dispatchToOutbound(baseInput)).resolves.toBeUndefined();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('zero linhas retornadas pelo RPC (todas duplicatas) não enfileira', async () => {
    mockSubsResponse.mockResolvedValue({
      data: [{ id: 's1', store_id: 'store1', organization_id: 'o', url: 'https://a', events: ['order.created'], status: 'active' }],
      error: null,
    });
    mockRpc.mockResolvedValue({ data: [], error: null });

    await dispatchToOutbound(baseInput);

    expect(mockRpc).toHaveBeenCalledOnce();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
