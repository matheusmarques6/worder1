/**
 * Rollout do runtime de agentes (Agentes por Evento, D3).
 *
 * Uma org está em exatamente UM mecanismo de resposta de IA:
 *   - 'legacy'  → debounce ai_debounce_until/ai_pending + QStash + cloud-runner
 *   - 'runtime' → RPC ingest_inbound_message + coalescer do runtime Python
 *
 * A fonte é a tabela ai_runtime_rollout (linha ausente = legacy). Cada decisão
 * consulta a fonte: um flip deve valer imediatamente e erro de leitura sobe
 * para o chamador, que pode repetir o envelope sem inventar um modo stale.
 */

export type RuntimeMode = 'legacy' | 'runtime';

type MinimalSupabase = {
  from: (table: string) => any;
};

export async function getRuntimeMode(
  supabase: MinimalSupabase,
  organizationId: string,
): Promise<RuntimeMode> {
  const { data, error } = await supabase
    .from('ai_runtime_rollout')
    .select('mode')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error) throw error;
  return data?.mode === 'runtime' ? 'runtime' : 'legacy';
}
