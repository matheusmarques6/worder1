/**
 * Rollout do runtime de agentes (Agentes por Evento, D3).
 *
 * Uma org está em exatamente UM mecanismo de resposta de IA:
 *   - 'legacy'  → debounce ai_debounce_until/ai_pending + QStash + cloud-runner
 *   - 'runtime' → RPC ingest_inbound_message + coalescer do runtime Python
 *
 * A fonte é a tabela ai_runtime_rollout (linha ausente = legacy). FAIL-CLOSED
 * PARA LEGACY: erro de leitura nunca silencia o bot atual de uma org não
 * migrada, nem migra uma org por acidente. Cache por org com TTL curto — o
 * flip de rollout é raro e a guarda no worker QStash cobre jobs em voo.
 */

export type RuntimeMode = 'legacy' | 'runtime';

const TTL_MS = 30_000;

const cache = new Map<string, { mode: RuntimeMode; at: number }>();

export function clearRuntimeModeCache(): void {
  cache.clear();
}

type MinimalSupabase = {
  from: (table: string) => any;
};

export async function getRuntimeMode(
  supabase: MinimalSupabase,
  organizationId: string,
  now: () => number = Date.now,
): Promise<RuntimeMode> {
  const hit = cache.get(organizationId);
  if (hit && now() - hit.at < TTL_MS) return hit.mode;

  try {
    const { data, error } = await supabase
      .from('ai_runtime_rollout')
      .select('mode')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) {
      // Não cacheia o erro: a próxima leitura tenta de novo.
      return hit?.mode ?? 'legacy';
    }

    const mode: RuntimeMode = data?.mode === 'runtime' ? 'runtime' : 'legacy';
    cache.set(organizationId, { mode, at: now() });
    return mode;
  } catch {
    return hit?.mode ?? 'legacy';
  }
}
