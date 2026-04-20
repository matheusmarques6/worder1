import { describe, it, expect } from 'vitest';
import { deriveEventId } from '../event-id';

describe('deriveEventId', () => {
  it('produz mesmo event_id pra mesma tupla', () => {
    const a = deriveEventId('shopify', '5678901234', 'order.created');
    const b = deriveEventId('shopify', '5678901234', 'order.created');
    expect(a).toBe(b);
  });

  it('produz event_ids diferentes pra event_types diferentes', () => {
    const a = deriveEventId('shopify', '5678901234', 'order.created');
    const b = deriveEventId('shopify', '5678901234', 'order.paid');
    expect(a).not.toBe(b);
  });

  it('produz event_ids diferentes pra source_event_ids diferentes', () => {
    const a = deriveEventId('shopify', '111', 'order.created');
    const b = deriveEventId('shopify', '222', 'order.created');
    expect(a).not.toBe(b);
  });

  it('começa com prefixo evt_', () => {
    expect(deriveEventId('shopify', '1', 'order.created')).toMatch(/^evt_/);
  });
});
