import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks do supabaseAdmin — chain para SELECT de subscriptions/automations,
// rpc pra detect, insert pra browse_abandoned_emissions (gate atômico),
// single pra shopify_stores e maybeSingle pra shopify_products.
const mockSubsList = vi.fn();
const mockRpc = vi.fn();
const mockInsertEmission = vi.fn();
const mockStoreFetch = vi.fn();
const mockProductFetch = vi.fn();
const mockEmit = vi.fn();
const mockDispatch = vi.fn();

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
      limit: () => builder,
      // shopify_products: .eq().eq().maybeSingle(); automations
      // (trigger_config): .eq()x3.limit(1).maybeSingle() — só produtos
      // têm mock dedicado, o resto cai no default null.
      maybeSingle: () =>
        table === 'shopify_products'
          ? mockProductFetch()
          : Promise.resolve({ data: null, error: null }),
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

// O detector importa dispatchTrigger dinamicamente pra rodar a automação
// interna SEMPRE (independente de subscription outbound).
vi.mock('@/lib/automation/trigger-dispatcher', () => ({
  dispatchTrigger: (opts: any) => mockDispatch(opts),
}));

import { runBrowseAbandonedDetection } from '../detector';

beforeEach(() => {
  mockSubsList.mockReset();
  mockRpc.mockReset();
  mockInsertEmission.mockReset();
  mockStoreFetch.mockReset();
  mockProductFetch.mockReset();
  mockEmit.mockReset();
  mockDispatch.mockReset();
  // defaults seguros: candidato sem produto cadastrado / dispatch ok
  mockProductFetch.mockResolvedValue({ data: null, error: null });
  mockDispatch.mockResolvedValue({ automationsMatched: 0, runsCreated: 0, runIds: [] });
});

const CAND_1 = {
  view_event_id: 'v1',
  contact_id: 'c1',
  store_id: 'store_1',
  product_id: 'p1',
  viewed_at: '2026-04-19T10:00:00Z',
};

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
    mockRpc.mockResolvedValue({ data: [CAND_1], error: null });
    mockInsertEmission.mockResolvedValue({ error: null });
    mockStoreFetch.mockResolvedValue({
      data: { id: 'store_1', shop_domain: 'x.myshopify.com', shop_name: 'X' },
    });
    mockProductFetch.mockResolvedValue({
      data: { title: 'Produto', handle: 'produto', price: 10, images: [], variants: [] },
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
    // Automação interna SEMPRE roda, escopada pela loja do candidato
    // (fix do vazamento cross-loja).
    expect(mockDispatch).toHaveBeenCalledOnce();
    expect(mockDispatch.mock.calls[0][0]).toMatchObject({
      organizationId: 'org_1',
      storeId: 'store_1',
      triggerType: 'trigger_browse_abandoned',
      contactId: 'c1',
    });
  });

  it('idempotência: 23505 (unique violation) pula emit sem quebrar', async () => {
    mockSubsList.mockResolvedValue({
      data: [{ organization_id: 'org_1', store_id: 'store_1' }],
      error: null,
    });
    mockRpc.mockResolvedValue({ data: [CAND_1], error: null });
    mockInsertEmission.mockResolvedValue({ error: { code: '23505', message: 'dup' } });

    const result = await runBrowseAbandonedDetection();

    expect(result.totalEmitted).toBe(0);
    expect(mockEmit).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('store sem subscription outbound: não emite webhook, mas roda a automação interna', async () => {
    mockSubsList.mockResolvedValue({
      data: [{ organization_id: 'org_1', store_id: 'store_1' }],
      error: null,
    });
    mockRpc.mockResolvedValue({
      data: [{ ...CAND_1, store_id: 'store_OUTRA' }], // loja sem subscription
      error: null,
    });
    mockInsertEmission.mockResolvedValue({ error: null });
    mockStoreFetch.mockResolvedValue({
      data: { id: 'store_OUTRA', shop_domain: 'y.myshopify.com', shop_name: 'Y' },
    });

    const result = await runBrowseAbandonedDetection();

    // O gate atômico registra o candidato e a automação interna dispara
    // (escopada em store_OUTRA); só o webhook de saída é filtrado.
    expect(mockInsertEmission).toHaveBeenCalledOnce();
    expect(mockEmit).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledOnce();
    expect(mockDispatch.mock.calls[0][0]).toMatchObject({ storeId: 'store_OUTRA' });
    expect(result.totalEmitted).toBe(1);
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
        return Promise.resolve({ data: [CAND_1], error: null });
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
      Promise.resolve({ data: { id: 's', shop_domain: 'x', shop_name: 'X' } })
    );

    const result = await runBrowseAbandonedDetection();

    expect(result.orgsProcessed).toBe(2);
    expect(result.totalEmitted).toBe(2);
    expect(mockEmit).toHaveBeenCalledTimes(2);
    expect(mockDispatch).toHaveBeenCalledTimes(2);
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
