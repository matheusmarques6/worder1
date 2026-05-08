// =============================================
// Helper: snapshot do estado canônico de um agente em ai_agent_versions.
//
// Usado quando o agente é publicado (ou explicitamente versionado pelo
// usuário). Registra todas as colunas de comportamento do shape canônico
// pra permitir rollback 1-clique sem perder contexto.
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { Agent } from './types'

const SNAPSHOT_FIELDS: Array<keyof Agent> = [
  'name',
  'description',
  'role',
  'persona',
  'identity',
  'behavior',
  'store_variables',
  'settings',
  'escalation_rules',
  'llm_config',
  'safety',
]

export interface SnapshotResult {
  versionId: string
  versionNumber: number
}

export async function snapshotAgent(
  agentId: string,
  organizationId: string,
  options: { deployNotes?: string; createdByUserId?: string } = {},
): Promise<SnapshotResult> {
  const supabase = getSupabaseAdmin()

  const { data: agent, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('id', agentId)
    .eq('organization_id', organizationId)
    .single()
  if (error || !agent) {
    throw new Error(`Agente ${agentId} não encontrado`)
  }
  const typed = agent as unknown as Agent

  // Próximo número de versão
  const { count: existingVersions } = await supabase
    .from('ai_agent_versions')
    .select('id', { count: 'exact', head: true })
    .eq('agent_id', agentId)
  const versionNumber = (existingVersions ?? 0) + 1

  const snapshot: Record<string, unknown> = {}
  SNAPSHOT_FIELDS.forEach((f) => {
    snapshot[f as string] = (typed as unknown as Record<string, unknown>)[f as string]
  })

  const { data: version, error: insErr } = await supabase
    .from('ai_agent_versions')
    .insert({
      organization_id: organizationId,
      agent_id: agentId,
      version_number: versionNumber,
      snapshot,
      deploy_notes: options.deployNotes ?? null,
      created_by_user_id: options.createdByUserId ?? null,
    })
    .select('id, version_number')
    .single()
  if (insErr || !version) throw new Error(insErr?.message ?? 'falha ao snapshot')

  // Atualiza ai_agents.current_version_id + total_versions + last_published_at
  await supabase
    .from('ai_agents')
    .update({
      current_version_id: version.id,
      total_versions: versionNumber,
      last_published_at: new Date().toISOString(),
    })
    .eq('id', agentId)

  return { versionId: version.id as string, versionNumber: version.version_number as number }
}

export async function restoreVersion(
  agentId: string,
  versionId: string,
  organizationId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { data: version, error } = await supabase
    .from('ai_agent_versions')
    .select('snapshot, version_number')
    .eq('id', versionId)
    .eq('agent_id', agentId)
    .eq('organization_id', organizationId)
    .single()
  if (error || !version) {
    throw new Error('Versão não encontrada')
  }
  const snap = (version.snapshot as Record<string, unknown>) ?? {}

  const update: Record<string, unknown> = { current_version_id: versionId }
  for (const k of SNAPSHOT_FIELDS) {
    if (k in snap) update[k as string] = snap[k as string]
  }
  await supabase
    .from('ai_agents')
    .update(update)
    .eq('id', agentId)
    .eq('organization_id', organizationId)
}
