/**
 * Entrega por loja (Pacote B 17/08): o webhook lê o debounce da org em
 * ai_agents.settings.delivery, com cache de 30s e FAIL-SAFE para o default —
 * erro de leitura jamais muda o comportamento do webhook.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getDeliveryDebounceSeconds,
  clearDeliveryCache,
} from '../delivery-settings';

function supabaseReturning(result: { data: any; error: any }) {
  const maybeSingle = vi.fn(async () => result);
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const eqActive = vi.fn(() => ({ order }));
  const eqOrg = vi.fn(() => ({ eq: eqActive }));
  const select = vi.fn(() => ({ eq: eqOrg }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as any, from };
}

const ORG = '22222222-2222-2222-2222-222222222222';

describe('getDeliveryDebounceSeconds', () => {
  beforeEach(() => clearDeliveryCache());

  it('sem agente ou sem delivery, vale o default de 8s', async () => {
    const { client } = supabaseReturning({ data: null, error: null });
    expect(await getDeliveryDebounceSeconds(client, ORG)).toBe(8);
  });

  it('o valor da loja vale, com clamp de 3..60', async () => {
    const low = supabaseReturning({
      data: { settings: { delivery: { debounce_seconds: 1 } } },
      error: null,
    });
    expect(await getDeliveryDebounceSeconds(low.client, ORG)).toBe(3);
  });

  it('erro de leitura cai para o default e não envenena o cache', async () => {
    const bad = supabaseReturning({ data: null, error: { message: 'boom' } });
    expect(await getDeliveryDebounceSeconds(bad.client, ORG)).toBe(8);

    const ok = supabaseReturning({
      data: { settings: { delivery: { debounce_seconds: 15 } } },
      error: null,
    });
    expect(await getDeliveryDebounceSeconds(ok.client, ORG)).toBe(15);
  });

  it('cacheia por org dentro do TTL', async () => {
    let t = 5_000_000;
    const now = () => t;

    const first = supabaseReturning({
      data: { settings: { delivery: { debounce_seconds: 20 } } },
      error: null,
    });
    expect(await getDeliveryDebounceSeconds(first.client, ORG, now)).toBe(20);

    const second = supabaseReturning({
      data: { settings: { delivery: { debounce_seconds: 40 } } },
      error: null,
    });
    t += 10_000; // dentro do TTL: nem toca o banco
    expect(await getDeliveryDebounceSeconds(second.client, ORG, now)).toBe(20);
    expect(second.from).not.toHaveBeenCalled();

    t += 30_000; // TTL vencido: revalida
    expect(await getDeliveryDebounceSeconds(second.client, ORG, now)).toBe(40);
  });
});
