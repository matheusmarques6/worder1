/**
 * Rollout do runtime (Agentes por Evento, D3): a flag por org que decide se o
 * inbound vai pro caminho legado (QStash + cloud-runner) ou pro canônico
 * (ingest_inbound_message + coalescer do runtime Python).
 *
 * O contrato que importa: linha ausente ou valor desconhecido caem para
 * legacy. Erro de leitura devolve o modo já cacheado da org quando existe,
 * mesmo vencido, e só cai para legacy se ainda não há nada em cache — evita
 * silenciar o bot de uma org não migrada e evita migrar uma org por
 * acidente numa falha transitória do banco.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getRuntimeMode, clearRuntimeModeCache } from '../runtime-rollout';

function supabaseReturning(result: { data: any; error: any }) {
  const maybeSingle = vi.fn(async () => result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as any, from };
}

const ORG = '11111111-1111-1111-1111-111111111111';

describe('getRuntimeMode', () => {
  beforeEach(() => clearRuntimeModeCache());

  it('org sem linha em ai_runtime_rollout é legacy (por ausência)', async () => {
    const { client } = supabaseReturning({ data: null, error: null });
    expect(await getRuntimeMode(client, ORG)).toBe('legacy');
  });

  it('mode=runtime devolve runtime', async () => {
    const { client } = supabaseReturning({ data: { mode: 'runtime' }, error: null });
    expect(await getRuntimeMode(client, ORG)).toBe('runtime');
  });

  it('mode desconhecido cai para legacy', async () => {
    const { client } = supabaseReturning({ data: { mode: 'whatever' }, error: null });
    expect(await getRuntimeMode(client, ORG)).toBe('legacy');
  });

  it('erro de leitura cai para legacy (fail-closed) e não envenena o cache', async () => {
    const { client } = supabaseReturning({ data: null, error: { message: 'boom' } });
    expect(await getRuntimeMode(client, ORG)).toBe('legacy');

    // A leitura seguinte volta ao banco (o erro não ficou cacheado como modo).
    const ok = supabaseReturning({ data: { mode: 'runtime' }, error: null });
    expect(await getRuntimeMode(ok.client, ORG)).toBe('runtime');
  });

  it('cacheia por org dentro do TTL e revalida depois dele', async () => {
    let t = 1_000_000;
    const now = () => t;

    const first = supabaseReturning({ data: { mode: 'runtime' }, error: null });
    expect(await getRuntimeMode(first.client, ORG, now)).toBe('runtime');
    expect(first.from).toHaveBeenCalledTimes(1);

    // Dentro do TTL: nem toca o banco.
    const second = supabaseReturning({ data: { mode: 'legacy' }, error: null });
    t += 5_000;
    expect(await getRuntimeMode(second.client, ORG, now)).toBe('runtime');
    expect(second.from).not.toHaveBeenCalled();

    // Depois do TTL: revalida e pega o valor novo.
    t += 60_000;
    expect(await getRuntimeMode(second.client, ORG, now)).toBe('legacy');
    expect(second.from).toHaveBeenCalledTimes(1);
  });

  it('o cache é por organização', async () => {
    const OTHER = '22222222-2222-2222-2222-222222222222';
    const a = supabaseReturning({ data: { mode: 'runtime' }, error: null });
    expect(await getRuntimeMode(a.client, ORG)).toBe('runtime');

    const b = supabaseReturning({ data: null, error: null });
    expect(await getRuntimeMode(b.client, OTHER)).toBe('legacy');
    expect(b.from).toHaveBeenCalledTimes(1);
  });
});
