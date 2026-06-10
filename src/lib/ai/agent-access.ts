// =====================================================
// P1 — Acesso a agentes escopado por organização.
// Único jeito permitido de resolver "este agente é desta org?"
// nas rotas de /api/ai/agents/[id]/**. A org SEMPRE vem do
// usuário autenticado (getAuthClient), NUNCA de query/body.
// =====================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export type AgentAccessResult =
  | { ok: true }
  | { ok: false; status: number; error: string }

export async function assertAgentInOrg(
  supabase: SupabaseClient,
  agentId: string,
  organizationId: string
): Promise<AgentAccessResult> {
  if (!organizationId) {
    return { ok: false, status: 400, error: 'organization_id é obrigatório' }
  }

  const { data, error } = await supabase
    .from('ai_agents')
    .select('id')
    .eq('id', agentId)
    .eq('organization_id', organizationId)
    .single()

  if (error || !data) {
    return { ok: false, status: 404, error: 'Agente não encontrado' }
  }
  return { ok: true }
}
