// O Construtor (plano IA M6 passo 32) — a parte pura: o grafo do agente
// com layout determinístico (porte do layout2 do protótipo), o caminho que
// um teste acende a partir do trace do simulate, e o histórico de
// desfazer/refazer. O canvas (@xyflow/react) só desenha isto.

import type { HubAreaId, HubState } from './agent-hub'
import { TOOL_CATALOG } from './tools/catalog'

export type BuilderNodeKind =
  | 'entry' | 'knowledge' | 'tool' | 'agent' | 'adapt' | 'limits' | 'review' | 'needs_person' | 'transfer' | 'send' | 'slot'

export interface BuilderNode {
  id: string
  kind: BuilderNodeKind
  label: string
  sub?: string
  x: number
  y: number
  /** Área do hub que o inspector edita para este nó (AreaFields). */
  area?: HubAreaId
  refId?: string
}

export interface BuilderEdge { id: string; source: string; target: string; label?: string }

const COL = 240
const ROW = 96
const CENTER_X = 520

/** O fluxo do protótipo: entradas → agente (com conhecimento e ferramentas
 *  ao lado) → adaptação → limites → revisão → precisa de pessoa? → transferir | enviar. */
export function buildBuilderGraph(input: {
  hub: HubState
  entries: Array<{ id: string; kind: string; label: string }>
  sources: Array<{ id: string; name: string }>
}): { nodes: BuilderNode[]; edges: BuilderEdge[] } {
  const nodes: BuilderNode[] = []
  const edges: BuilderEdge[] = []
  const entries = input.entries.length ? input.entries : [{ id: 'slot-entry', kind: 'slot', label: 'Adicionar entrada' }]
  const entryStart = CENTER_X - ((entries.length - 1) * COL) / 2
  entries.forEach((e, i) => {
    const id = e.kind === 'slot' ? 'slot-entry' : `entry:${e.id}`
    nodes.push({ id, kind: e.kind === 'slot' ? 'slot' : 'entry', label: e.label, sub: e.kind === 'flow_touch' ? 'toque de fluxo' : e.kind === 'slot' ? 'número ou fluxo' : 'WhatsApp', x: entryStart + i * COL, y: 0, refId: e.id })
    edges.push({ id: `e:${id}:agent`, source: id, target: 'agent' })
  })

  const agentY = ROW * 2
  nodes.push({ id: 'agent', kind: 'agent', label: input.hub.identity.name || 'Agente', sub: input.hub.budget.model, x: CENTER_X, y: agentY, area: 'identity' })

  const sources = input.sources.length ? input.sources : [{ id: 'slot-knowledge', name: 'Adicionar fonte' }]
  sources.forEach((s, i) => {
    const id = s.id === 'slot-knowledge' ? 'slot-knowledge' : `knowledge:${s.id}`
    nodes.push({ id, kind: s.id === 'slot-knowledge' ? 'slot' : 'knowledge', label: s.name, sub: 'conhecimento', x: CENTER_X - COL * 1.6, y: agentY - ROW + i * (ROW * 0.8), refId: s.id, area: 'knowledge' })
    edges.push({ id: `e:${id}:agent`, source: id, target: 'agent' })
  })

  const label = new Map(TOOL_CATALOG.map((t) => [t.name, t.label]))
  const tools = input.hub.tools.enabled.length ? input.hub.tools.enabled : ['slot-tool']
  tools.forEach((name, i) => {
    const id = name === 'slot-tool' ? 'slot-tool' : `tool:${name}`
    nodes.push({ id, kind: name === 'slot-tool' ? 'slot' : 'tool', label: name === 'slot-tool' ? 'Adicionar ferramenta' : label.get(name) ?? name, sub: 'ferramenta', x: CENTER_X + COL * 1.6, y: agentY - ROW + i * (ROW * 0.8), refId: name, area: 'tools' })
    edges.push({ id: `e:agent:${id}`, source: 'agent', target: id })
  })

  const chain: Array<[BuilderNodeKind, string, string, HubAreaId]> = [
    ['adapt', 'Adaptação', 'ao jeito do cliente', 'adapt'],
    ['limits', 'Limites', `${input.hub.limits.blocked.length + input.hub.limits.invariants.length} regra(s)`, 'limits'],
    ['review', 'Revisão', `${input.hub.judges.custom.filter((j) => j.active).length} juiz(es) da loja`, 'judges'],
    ['needs_person', 'Precisa de uma pessoa?', `${input.hub.handoff.keywords.length} palavra(s)`, 'handoff'],
  ]
  let prev = 'agent'
  chain.forEach(([kind, title, sub, area], i) => {
    nodes.push({ id: kind, kind, label: title, sub, x: CENTER_X, y: agentY + ROW * (i + 1.4), area })
    edges.push({ id: `e:${prev}:${kind}`, source: prev, target: kind })
    prev = kind
  })
  const endY = agentY + ROW * (chain.length + 1.6)
  nodes.push({ id: 'transfer', kind: 'transfer', label: 'Transferir', sub: 'para a equipe', x: CENTER_X - COL * 0.8, y: endY, area: 'handoff' })
  nodes.push({ id: 'send', kind: 'send', label: 'Enviar', sub: 'resposta ao cliente', x: CENTER_X + COL * 0.8, y: endY, area: 'adapt' })
  edges.push({ id: 'e:needs_person:transfer', source: 'needs_person', target: 'transfer', label: 'sim' })
  edges.push({ id: 'e:needs_person:send', source: 'needs_person', target: 'send', label: 'não' })
  return { nodes, edges }
}

/** Os nós que um teste percorreu, a partir do trace do simulate (passo 24). */
export function litPath(trace: {
  blocked?: boolean
  reply?: string | null
  knowledge?: Array<{ source_id?: string | null }>
  tools?: Array<{ name: string }>
} | null, nodes: BuilderNode[]): Set<string> {
  const lit = new Set<string>()
  if (!trace) return lit
  for (const n of nodes) if (n.kind === 'entry') { lit.add(n.id); break }
  lit.add('agent')
  for (const k of trace.knowledge ?? []) if (k.source_id) lit.add(`knowledge:${k.source_id}`)
  const transferred = (trace.tools ?? []).some((t) => t.name === 'transfer_to_human')
  for (const t of trace.tools ?? []) lit.add(`tool:${t.name}`)
  lit.add('adapt'); lit.add('limits'); lit.add('review')
  if (trace.blocked) return lit
  lit.add('needs_person')
  lit.add(transferred ? 'transfer' : 'send')
  return lit
}

export function litEdges(edges: BuilderEdge[], lit: Set<string>): Set<string> {
  return new Set(edges.filter((e) => lit.has(e.source) && lit.has(e.target)).map((e) => e.id))
}

/** Histórico de desfazer/refazer do estado do hub (sem limite de memória
 *  prático: guarda as últimas 50 versões). */
export interface History<T> { past: T[]; present: T; future: T[] }

export function historyInit<T>(present: T): History<T> { return { past: [], present, future: [] } }

export function historyPush<T>(h: History<T>, next: T, limit = 50): History<T> {
  if (JSON.stringify(next) === JSON.stringify(h.present)) return h
  return { past: [...h.past, h.present].slice(-limit), present: next, future: [] }
}

export function historyUndo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
}

export function historyRedo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
}
