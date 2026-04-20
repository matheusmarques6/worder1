import { describe, it, expect } from 'vitest';
import { buildEnvelope, MAX_PAYLOAD_BYTES } from '../payload-builder';

const STORE = { id: 's1', shop_domain: 'minha.myshopify.com', name: 'Minha' };

describe('buildEnvelope', () => {
  it('inclui todos os campos obrigatórios', () => {
    const env = buildEnvelope({
      eventId: 'evt_x',
      event: 'order.created',
      organizationId: 'org_1',
      store: STORE,
      data: { order_id: '123' },
    });
    expect(env).toMatchObject({
      id: 'evt_x',
      event: 'order.created',
      version: '1',
      organization_id: 'org_1',
      store_id: 's1',
      store: STORE,
      data: { order_id: '123' },
    });
    expect(env.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('payload <= 256KB serializa direto', () => {
    const env = buildEnvelope({
      eventId: 'evt_x', event: 'order.created', organizationId: 'o',
      store: STORE, data: { items: Array(50).fill({ title: 'p', price: 1 }) },
    });
    const json = JSON.stringify(env);
    expect(json.length).toBeLessThan(MAX_PAYLOAD_BYTES);
    expect((env.data as any)._truncated).toBeUndefined();
  });

  it('payload com >100 items trunca + adiciona marker', () => {
    const items = Array(500).fill({ title: 'produto', price: 99.9, sku: 'x' });
    const env = buildEnvelope({
      eventId: 'evt_x', event: 'order.created', organizationId: 'o',
      store: STORE, data: { items },
    });
    expect((env.data as any).items.length).toBe(100);
    expect((env.data as any)._truncated).toEqual({ items: true, original_count: 500 });
  });

  it('payload muito grande sem items[] cai pro slim payload', () => {
    const huge = 'x'.repeat(300_000);
    const env = buildEnvelope({
      eventId: 'evt_x', event: 'browse.abandoned', organizationId: 'o',
      store: STORE, data: { product_id: 'p1', payload_grande: huge },
    });
    expect(JSON.stringify(env).length).toBeLessThan(MAX_PAYLOAD_BYTES);
    expect((env.data as any)._truncated).toBe(true);
  });
});
