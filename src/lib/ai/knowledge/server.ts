// Leituras compartilhadas pelas rotas /api/ai/knowledge/* (passo 21).

import type { SupabaseClient } from '@supabase/supabase-js'

export const NOTE_COLUMNS =
  'id, name, folder, kind, status, read_only, tags, links, updated_at, chunks_count, source_type, url, error_message'

export async function readersBySource(
  supabase: SupabaseClient,
  organizationId: string,
  sourceIds?: string[],
): Promise<Map<string, string[]>> {
  let query = supabase.from('ai_source_agents').select('source_id, agent_id').eq('organization_id', organizationId)
  if (sourceIds) query = query.in('source_id', sourceIds)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const map = new Map<string, string[]>()
  for (const row of data ?? []) {
    const list = map.get(row.source_id) ?? []
    list.push(row.agent_id)
    map.set(row.source_id, list)
  }
  return map
}

/** Só agentes da org — o que chega do cliente é filtrado aqui. */
export async function ownAgentIds(supabase: SupabaseClient, organizationId: string, ids: unknown): Promise<string[] | null> {
  if (!Array.isArray(ids)) return []
  const wanted = ids.filter((x): x is string => typeof x === 'string' && x.length > 0)
  if (wanted.length === 0) return []
  const { data } = await supabase.from('ai_agents').select('id').eq('organization_id', organizationId).in('id', wanted)
  return (data?.length ?? 0) === new Set(wanted).size ? wanted : null
}

export async function setReaders(
  supabase: SupabaseClient,
  organizationId: string,
  sourceId: string,
  agentIds: string[],
): Promise<void> {
  const { error: delError } = await supabase
    .from('ai_source_agents')
    .delete()
    .eq('organization_id', organizationId)
    .eq('source_id', sourceId)
  if (delError) throw new Error(delError.message)
  if (agentIds.length === 0) return
  const { error } = await supabase
    .from('ai_source_agents')
    .insert(agentIds.map((agent_id) => ({ source_id: sourceId, agent_id, organization_id: organizationId })))
  if (error) throw new Error(error.message)
}
