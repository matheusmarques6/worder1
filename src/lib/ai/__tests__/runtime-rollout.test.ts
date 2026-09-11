/**
 * Rollout do runtime (Agentes por Evento, D3): a flag por org que decide se o
 * inbound vai pro caminho legado (QStash + cloud-runner) ou pro canônico
 * (ingest_inbound_message + coalescer do runtime Python).
 *
 * O contrato que importa: linha ausente ou valor desconhecido caem para
 * legacy. Cada decisão relê a fonte e erro de leitura sobe para o chamador,
 * porque nenhum dos dois motores pode ser escolhido a partir de estado stale.
 */
import { describe, it, expect, vi } from 'vitest';
import { getRuntimeMode } from '../runtime-rollout';

function supabaseReturning(result: { data: any; error: any }) {
  const maybeSingle = vi.fn(async () => result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as any, from };
}

const ORG = '11111111-1111-1111-1111-111111111111';

describe('getRuntimeMode', () => {
  it('org sem linha em ai_runtime_rollout é legacy (por ausência)', async () => {
    const { client } = supabaseReturning({ data: null, error: null });
    expect(await getRuntimeMode(client, ORG)).toBe('legacy');
  });

  it('mode=runtime devolve runtime', async () => {
    const { client } = supabaseReturning({ data: { mode: 'runtime' }, error: null });
    expect(await getRuntimeMode(client, ORG)).toBe('runtime');
  });

  it('observa o flip na próxima decisão sem esperar TTL', async () => {
    const first = supabaseReturning({ data: { mode: 'runtime' }, error: null });
    const second = supabaseReturning({ data: { mode: 'legacy' }, error: null });

    expect(await getRuntimeMode(first.client, ORG)).toBe('runtime');
    expect(await getRuntimeMode(second.client, ORG)).toBe('legacy');
  });

  it('mode desconhecido cai para legacy', async () => {
    const { client } = supabaseReturning({ data: { mode: 'whatever' }, error: null });
    expect(await getRuntimeMode(client, ORG)).toBe('legacy');
  });

  it('erro de leitura sobe e a próxima decisão consulta novamente', async () => {
    const error = { message: 'boom' };
    const { client } = supabaseReturning({ data: null, error });
    await expect(getRuntimeMode(client, ORG)).rejects.toBe(error);

    const ok = supabaseReturning({ data: { mode: 'runtime' }, error: null });
    expect(await getRuntimeMode(ok.client, ORG)).toBe('runtime');
  });
});
