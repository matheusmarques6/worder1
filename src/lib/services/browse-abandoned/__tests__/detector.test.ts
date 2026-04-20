import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks do supabaseAdmin — chain para SELECT de subscriptions, rpc pra detect,
// insert pra browse_abandoned_emissions, single pra shopify_stores.
const mockSubsList = vi.fn();
const mockRpc = vi.fn();
const mockInsertEmission = vi.fn();
const mockStoreFetch = vi.fn();
const mockEmit = vi.fn();

vi.mock('@/lib/supabase-admin', () => {
  // from(table) retorna builder. Usamos table string pra desambiguar.
  const makeBuilder = (table: string) => {
    const builder: any = {
      select: () => builder,
      eq: (col: string, _val: any) => {
        if (table === 'shopify_stores' && col === 'id') {
          // Depois do .eq chamamos .single() — retorna store mock.
          return { single: () => mockStoreFetch() };
        }
        return builder;
      },
      contains: () => mockSubsList(),
      insert: (row: any) => mockInsertEmission(row),
    };
    return builder;
  };
  return {
    supabaseAdmin: {
      from: (table: string) => makeBuilder(table),
      rpc: (name: string, args: any) => mockRpc(name, args),
    },
  };
});

vi.mock('@/lib/events', () => ({
  EventBus: {
    emit: (type: string, payload: any) => mockEmit(type, payload),
  },
  EventType: {
    BROWSE_ABANDONED: 'browse.abandoned',
  },
}));

import { runBrowseAbandonedDetection } from '../detector';

beforeEach(() => {
  mockSubsList.mockReset();
  mockRpc.mockReset();
  mockInsertEmission.mockReset();
  mockStoreFetch.mockReset();
  mockEmit.mockReset();
});

describe('runBrowseAbandonedDetection', () => {
  it('sem subscriptions ativas, não chama rpc nem emite', async () => {
    mockSubsList.mockResolvedValue({ data: [], error: null });
    const result = await runBrowseAbandonedDetection();
    expect(result).toEqual({ totalEmitted: 0, orgsProcessed: 0 });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('emite browse.abandoned pra cada candidato novo', async () => {
    mockSubsList.mockResolvedValue({
      data: [{ organization_id: 'org_1', store_id: 'store_1' }],
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: [
        {
          view_event_id: 'v1',
          contact_id: 'c1',
          store_id: 'store_1',
          product_id: 'p1',
          viewed_at: '2026-04-19T10:00:00Z',
        },
      ],
      error: null,
    });
    mockInsertEmission.mockResolvedValue({ error: null });
    mockStoreFetch.mockResolvedValue({
      data: { id: 'store_1', shop_domain: 'x.myshopify.com', name: 'X' },
    });

    const result = await runBrowseAbandonedDetection();

    expect(result.totalEmitted).toBe(1);
    expect(result.orgsProcessed).toBe(1);
    expect(mockEmit).toHaveBeenCalledOnce();
    const [evType, payload] = mockEmit.mock.calls[0];
    expect(evType).toBe('browse.abandoned');
    expect(payload.organization_id).toBe('org_1');
    expect(payload.data.product_id).toBe('p1');
    expect(payload.data._webhook_dispatch_meta.store_id).toBe('store_1');
    expect(payload.data._webhook_dispatch_meta.source).toBe('browse_detector');
  });

  it('idempotência: 23505 (unique violation) pula emit sem quebrar', async () => {
    mockSubsList.mockResolvedValue({
      data: [{ organization_id: 'org_1', store_id: 'store_1' }],
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: [
        {
          view_event_id: 'v1',
          contact_id: 'c1',
          store_id: 'store_1',
          product_id: 'p1',
          viewed_at: '2026-04-19T10:00:00Z',
        },
      ],
      error: null,
    });
    mockInsertEmission.mockResolvedValue({ error: { code: '23505', message: 'dup' } });

    const result = await runBrowseAbandonedDetection();

    expect(result.totalEmitted).toBe(0);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('candidato cuja store não tem subscription ativa é filtrado', async () => {
    mockSubsList.mockResolvedValue({
      data: [{ organization_id: 'org_1', store_id: 'store_1' }],
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: [
        {
          view_event_id: 'v1',
          contact_id: 'c1',
          store_id: 'store_OUTRA', // loja sem subscription
          product_id: 'p1',
          viewed_at: '2026-04-19T10:00:00Z',
        },
      ],
      error: null,
    });

    const result = await runBrowseAbandonedDetection();

    expect(result.totalEmitted).toBe(0);
    expect(mockInsertEmission).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('múltiplas orgs processadas independentemente', async () => {
    mockSubsList.mockResolvedValue({
      data: [
        { organization_id: 'org_1', store_id: 'store_1' },
        { organization_id: 'org_2', store_id: 'store_2' },
      ],
      error: null,
    });
    mockRpc.mockImplementation((_name: string, args: any) => {
      if (args.p_organization_id === 'org_1') {
        return Promise.resolve({
          data: [
            {
              view_event_id: 'v1',
              contact_id: 'c1',
              store_id: 'store_1',
              product_id: 'p1',
              viewed_at: '2026-04-19T10:00:00Z',
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({
        data: [
          {
            view_event_id: 'v2',
            contact_id: 'c2',
            store_id: 'store_2',
            product_id: 'p2',
            viewed_at: '2026-04-19T10:00:00Z',
          },
        ],
        error: null,
      });
    });
    mockInsertEmission.mockResolvedValue({ error: null });
    mockStoreFetch.mockImplementation(() =>
      Promise.resolve({ data: { id: 's', shop_domain: 'x', name: 'X' } })
    );

    const result = await runBrowseAbandonedDetection();

    expect(result.orgsProcessed).toBe(2);
    expect(result.totalEmitted).toBe(2);
    expect(mockEmit).toHaveBeenCalledTimes(2);
  });

  it('rpc com erro: loga mas não propaga (fallback gracioso)', async () => {
    mockSubsList.mockResolvedValue({
      data: [{ organization_id: 'org_1', store_id: 'store_1' }],
      error: null,
    });
    mockRpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await expect(runBrowseAbandonedDetection()).resolves.toEqual({
      totalEmitted: 0,
      orgsProcessed: 1,
    });
  });
});
