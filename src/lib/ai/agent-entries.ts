// Entradas de um agente (ai_agent_entries, 20261016000008): onde ele atua.
// Leitura compartilhada por GET /api/ai/agents e GET /api/ai/agents/[id]/entries.

import type { SupabaseClient } from '@supabase/supabase-js'

export type EntryKind = 'whatsapp_account' | 'flow_touch'

export interface AgentEntry {
  id: string
  agent_id: string
  kind: EntryKind
  ref_id: string
  active: boolean
  label: string
  created_at: string
  /** Só em flow_touch: famílias de missão que os nós de IA do fluxo chamam
   *  para este agente e quantos nós são (ref_id é o id do FLUXO). */
  families?: string[]
  touches?: number
}

export const ENTRY_KINDS: EntryKind[] = ['whatsapp_account', 'flow_touch']

export async function listEntries(
  supabase: SupabaseClient,
  organizationId: string,
  agentIds?: string[],
): Promise<AgentEntry[]> {
  let query = supabase
    .from('ai_agent_entries')
    .select('id, agent_id, kind, ref_id, active, created_at')
    .eq('organization_id', organizationId)
    .eq('active', true)
    .order('created_at', { ascending: true })
  if (agentIds) query = query.in('agent_id', agentIds)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<Omit<AgentEntry, 'label'>>

  const accountIds = rows.filter((r) => r.kind === 'whatsapp_account').map((r) => r.ref_id)
  const labels = new Map<string, string>()
  if (accountIds.length > 0) {
    const { data: accounts } = await supabase
      .from('whatsapp_business_accounts')
      .select('id, display_phone_number, phone_number, verified_name')
      .eq('organization_id', organizationId)
      .in('id', accountIds)
    for (const a of accounts ?? []) {
      const phone = a.display_phone_number || a.phone_number || ''
      labels.set(a.id, a.verified_name ? `${a.verified_name} · ${phone}` : phone || 'WhatsApp')
    }
  }
  return rows.map((r) => ({
    ...r,
    label: r.kind === 'whatsapp_account' ? labels.get(r.ref_id) ?? 'WhatsApp' : `Fluxo ${r.ref_id.slice(0, 8)}`,
  }))
}
