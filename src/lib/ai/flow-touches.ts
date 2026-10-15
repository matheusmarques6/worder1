// Toques de fluxo (plano IA, M2 passo 17): a entrada "flow_touch" de um
// agente é DERIVADA dos nós `action_ai_mission` dos fluxos da org — o nó
// aponta para uma família, a missão ativa da família tem um agente dono.
// Nada é gravado em ai_agent_entries: o fluxo é a fonte, e a lista de
// agentes mostra "2 fluxos" lendo daqui.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentEntry } from './agent-entries'

export interface FlowTouchNode {
  automation_id: string
  automation_name: string
  node_id: string
  event_family: string
  active: boolean
}

type AutomationRow = { id: string; name: string | null; nodes: unknown; is_active?: boolean | null; status?: string | null }

/** Os nós de toque de IA de cada fluxo (puro, testável). */
export function flowTouchNodes(automations: AutomationRow[]): FlowTouchNode[] {
  const out: FlowTouchNode[] = []
  for (const flow of automations) {
    const nodes = Array.isArray(flow.nodes) ? (flow.nodes as any[]) : []
    for (const node of nodes) {
      if (node?.type !== 'action_ai_mission') continue
      const family = node?.data?.config?.eventFamily
      if (typeof family !== 'string' || !family) continue
      out.push({
        automation_id: flow.id,
        automation_name: flow.name || 'Fluxo sem nome',
        node_id: String(node.id ?? ''),
        event_family: family,
        active: flow.is_active !== false && flow.status !== 'archived',
      })
    }
  }
  return out
}

/**
 * Entradas derivadas por agente: um fluxo conta uma vez por agente, mesmo
 * com vários nós apontando para missões dele. `activeMissionOwner` mapeia
 * família → agent_id da missão ATIVA (missão sem dono não gera entrada).
 */
export function flowTouchEntries(
  touches: FlowTouchNode[],
  activeMissionOwner: Map<string, string | null>,
): AgentEntry[] {
  const seen = new Set<string>()
  const out: AgentEntry[] = []
  for (const touch of touches) {
    if (!touch.active) continue
    const owner = activeMissionOwner.get(touch.event_family)
    if (!owner) continue
    const key = `${owner}:${touch.automation_id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: `flow:${touch.automation_id}:${owner}`,
      agent_id: owner,
      kind: 'flow_touch',
      ref_id: touch.automation_id,
      active: true,
      label: touch.automation_name,
      created_at: '',
    })
  }
  return out
}

export async function loadFlowTouchEntries(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<AgentEntry[]> {
  const [flows, missions] = await Promise.all([
    supabase.from('automations').select('id, name, nodes, is_active, status').eq('organization_id', organizationId),
    supabase.from('ai_missions').select('event_type, agent_id').eq('organization_id', organizationId).eq('status', 'active'),
  ])
  if (flows.error) throw new Error(flows.error.message)
  const owner = new Map<string, string | null>()
  for (const m of missions.data ?? []) owner.set(m.event_type, m.agent_id ?? null)
  return flowTouchEntries(flowTouchNodes((flows.data ?? []) as AutomationRow[]), owner)
}
