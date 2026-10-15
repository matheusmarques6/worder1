'use client'

// O Construtor (plano IA M6 passo 32): o agente desenhado como um fluxo —
// entradas → agente (com conhecimento e ferramentas ao lado) → adaptação →
// limites → revisão → precisa de pessoa? → transferir | enviar. O desenho
// vem de buildBuilderGraph (puro, testado); este componente só pinta, abre
// o inspector (os MESMOS AreaFields do editor), acende o caminho de um
// teste, mostra métricas por bloco e o diagnóstico, e salva o hub.

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap, Handle, Position, useReactFlow,
  type Edge, type Node, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  AlertTriangle, ArrowLeft, BarChart3, BookOpen, FlaskConical, History as HistoryIcon, Loader2, MessageCircle, Plus,
  Redo2, Save, Search, Stethoscope, Trash2, Undo2, Workflow, Wrench, X,
} from 'lucide-react'
import { agentToHub, hubToAgentPatch, type HubAreaId, type HubState } from '@/lib/ai/agent-hub'
import {
  buildBuilderGraph, historyInit, historyPush, historyRedo, historyUndo, litEdges, litPath,
  type BuilderNode, type BuilderNodeKind, type History,
} from '@/lib/ai/builder-graph'
import type { Diagnostic } from '@/lib/ai/block-metrics'
import type { RuntimeMode } from '@/lib/ai/runtime-rollout'
import { TOOL_CATALOG } from '@/lib/ai/tools/catalog'
import AreaFields from '../AreaFields'
import AgentTestPanel from '../AgentTestPanel'
import AgentVersionsPanel from '../AgentVersionsPanel'

const KIND_STYLE: Record<BuilderNodeKind, { color: string; tint: string; title: string }> = {
  entry: { color: '#16A34A', tint: '#E9F7EE', title: 'Entrada' },
  knowledge: { color: '#0E9384', tint: '#E6F5F3', title: 'Conhecimento' },
  tool: { color: '#0B7285', tint: '#E3F3F6', title: 'Ferramenta' },
  agent: { color: '#F97316', tint: '#FFF3EA', title: 'Agente' },
  adapt: { color: '#7C5CFC', tint: '#F2EFFF', title: 'Adaptação' },
  limits: { color: '#E5484D', tint: '#FDECEC', title: 'Limites' },
  review: { color: '#E0930B', tint: '#FCF3E0', title: 'Revisão' },
  needs_person: { color: '#3B6EF6', tint: '#EEF3FF', title: 'Decisão' },
  transfer: { color: '#16A34A', tint: '#E9F7EE', title: 'Transferir' },
  send: { color: '#64748B', tint: '#EEF1F5', title: 'Enviar' },
  slot: { color: '#94A3B8', tint: '#F8FAFC', title: 'Vazio' },
}

interface AgentRow {
  id: string
  name: string | null
  status: 'draft' | 'active' | 'paused'
  provider: string | null
  model: string | null
  monthly_cap_usd: number | null
  persona: Record<string, any> | null
  settings: Record<string, any> | null
  presentation_mode: string | null
  client_adaptation: Record<string, unknown> | null
  sources_count?: number
}

interface Entry { id: string; kind: string; label: string; ref_id?: string }
interface Note { id: string; name: string; status?: string | null; readers: string[] }
interface BlockNodeData extends Record<string, unknown> {
  node: BuilderNode
  metric: string | null
  diagnostic: 'error' | 'warning' | null
  lit: boolean
  selected: boolean
}

const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`)
const fmtUsd = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `US$ ${Number(v).toFixed(2)}`)

/** A linha de métrica de cada bloco (janela de 7 dias, passo 31). */
function metricFor(node: BuilderNode, m: any): string | null {
  if (!m) return null
  switch (node.kind) {
    case 'entry': {
      const e = (m.entries ?? []).find((x: any) => `entry:${x.id}` === node.id)
      return e?.conversations === null || e?.conversations === undefined ? null : `${e.conversations} conversas · compra ${fmtPct(e.purchase_rate)}`
    }
    case 'knowledge': {
      const k = (m.knowledge ?? []).find((x: any) => x.id === node.refId)
      return k ? `${k.uses} consulta(s)` : null
    }
    case 'tool': {
      const t = (m.tools ?? []).find((x: any) => x.name === node.refId)
      if (!t) return '0 chamadas'
      return `${t.calls} chamada(s) · ${fmtPct(t.success_rate)} ok${t.issued !== undefined ? ` · ${t.issued} emitido(s)` : ''}`
    }
    case 'agent': return `${m.agent.conversations} conversas · ${fmtUsd(m.agent.cost_usd)}`
    case 'limits': return `${m.limits.blocked} bloqueio(s)`
    case 'review': return `${fmtPct(m.review.approved_rate)} aprovadas`
    case 'needs_person': return `${m.needs_person.transferred} transferida(s)`
    case 'transfer': return `${Object.keys(m.transfer.reasons ?? {}).length} motivo(s)`
    case 'send': return `${m.send.replies} resposta(s) · ${fmtPct(m.send.resolved_rate)} sem humano`
    default: return null
  }
}

/** O nó do canvas que um diagnóstico aponta (passo 31 usa nomes de grupo). */
function diagnosticNode(d: Diagnostic, nodes: BuilderNode[]): string {
  const first = (kind: BuilderNodeKind, slot: string) => nodes.find((n) => n.kind === kind)?.id ?? slot
  if (d.node === 'entries') return first('entry', 'slot-entry')
  if (d.node === 'tools') return first('tool', 'slot-tool')
  if (d.node === 'knowledge') {
    const id = d.id.split(':')[1]
    return id && nodes.some((n) => n.id === `knowledge:${id}`) ? `knowledge:${id}` : first('knowledge', 'slot-knowledge')
  }
  return nodes.some((n) => n.id === d.node) ? d.node : 'agent'
}

const BlockNode = memo(function BlockNode({ data }: NodeProps<Node<BlockNodeData>>) {
  const { node, metric, diagnostic, lit, selected } = data
  const style = KIND_STYLE[node.kind]
  const slot = node.kind === 'slot'
  return (
    <div style={{
      width: node.kind === 'agent' ? 220 : 190, padding: '10px 12px', borderRadius: 12, position: 'relative',
      background: slot ? 'transparent' : '#fff',
      border: `${selected ? 2 : 1.5}px ${slot ? 'dashed' : 'solid'} ${selected || lit ? style.color : 'var(--border, #E5E7EB)'}`,
      boxShadow: lit ? `0 0 0 4px ${style.tint}` : '0 1px 2px rgba(0,0,0,.05)',
      opacity: slot ? 0.8 : 1, transition: 'box-shadow .2s, border-color .2s',
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: style.color, flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: style.color, textTransform: 'uppercase', letterSpacing: '.04em' }}>
          {style.title}
        </span>
        {diagnostic && (
          <span title="Veja o diagnóstico" style={{
            marginLeft: 'auto', width: 9, height: 9, borderRadius: 5,
            background: diagnostic === 'error' ? 'var(--red, #E5484D)' : 'var(--amber, #E0930B)',
          }} />
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4, color: slot ? 'var(--text-3)' : undefined }}>
        {slot && <Plus size={12} />}{node.label}
      </div>
      {node.sub && <div style={{ fontSize: 11, color: 'var(--text-3, #6B7280)' }}>{node.sub}</div>}
      {metric && (
        <div style={{ fontSize: 10.5, marginTop: 5, paddingTop: 5, borderTop: '1px solid var(--border, #E5E7EB)', color: 'var(--text-2, #374151)' }}>
          {metric}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="source" id="left" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" id="right" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
})

const nodeTypes = { block: BlockNode }

export default function BuilderCanvas(props: { organizationId: string; agentId: string }) {
  return (
    <ReactFlowProvider>
      <BuilderInner {...props} />
    </ReactFlowProvider>
  )
}

function BuilderInner({ organizationId, agentId }: { organizationId: string; agentId: string }) {
  const flow = useReactFlow()
  const [agent, setAgent] = useState<AgentRow | null>(null)
  const [history, setHistory] = useState<History<HubState> | null>(null)
  const [savedHub, setSavedHub] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [accounts, setAccounts] = useState<Array<{ id: string; label: string }>>([])
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>('runtime')
  const [metrics, setMetrics] = useState<any>(null)
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [showMetrics, setShowMetrics] = useState(true)
  const [panel, setPanel] = useState<'diagnostics' | 'history' | 'test' | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [trace, setTrace] = useState<any>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hub = history?.present ?? null

  const loadSide = useCallback(async () => {
    const [entriesRes, notesRes, metricsRes, diagRes] = await Promise.all([
      fetch(`/api/ai/agents/${agentId}/entries`),
      fetch('/api/ai/knowledge'),
      fetch(`/api/ai/agents/${agentId}/block-metrics`),
      fetch(`/api/ai/agents/${agentId}/diagnostics`),
    ])
    const entriesBody = entriesRes.ok ? await entriesRes.json() : { entries: [] }
    setEntries(entriesBody.entries ?? [])
    const notesBody = notesRes.ok ? await notesRes.json() : { folders: [] }
    setNotes((notesBody.folders ?? []).flatMap((f: any) => f.notes ?? []))
    setMetrics(metricsRes.ok ? await metricsRes.json() : null)
    const diagBody = diagRes.ok ? await diagRes.json() : { diagnostics: [] }
    setDiagnostics(diagBody.diagnostics ?? [])
  }, [agentId])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}`)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Agente não encontrado')
      const row: AgentRow = body.agent ?? body
      row.status = row.status ?? ((row as any).is_active ? 'active' : 'paused')
      await loadSide()
      setAgent(row)
      const next = agentToHub(row)
      setHistory(historyInit(next))
      setSavedHub(JSON.stringify(next))
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [agentId, loadSide])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    fetch('/api/ai/runtime-mode').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.mode === 'legacy') setRuntimeMode('legacy')
    }).catch(() => {})
    fetch('/api/whatsapp/business-accounts', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = Array.isArray(d) ? d : d?.accounts ?? d?.data ?? []
        setAccounts(list.map((a: any) => ({
          id: a.id,
          label: a.verified_name ? `${a.verified_name} · ${a.display_phone_number || a.phone_number || ''}` : (a.display_phone_number || a.phone_number || 'WhatsApp'),
        })))
      })
      .catch(() => {})
  }, [organizationId])

  const readNotes = useMemo(() => notes.filter((n) => n.readers.includes(agentId)), [notes, agentId])
  const dirty = hub !== null && JSON.stringify(hub) !== savedHub

  // O hub mostra quantas fontes o agente lê (área Conhecimento).
  const hubForGraph = useMemo(
    () => (hub ? { ...hub, knowledge: { sources: readNotes.length } } : null),
    [hub, readNotes.length],
  )
  const graph = useMemo(
    () => (hubForGraph ? buildBuilderGraph({ hub: hubForGraph, entries, sources: readNotes }) : { nodes: [], edges: [] }),
    [hubForGraph, entries, readNotes],
  )
  const lit = useMemo(() => litPath(trace, graph.nodes), [trace, graph.nodes])
  const litE = useMemo(() => litEdges(graph.edges, lit), [graph.edges, lit])
  const diagByNode = useMemo(() => {
    const map = new Map<string, 'error' | 'warning'>()
    for (const d of diagnostics) {
      const id = diagnosticNode(d, graph.nodes)
      if (map.get(id) !== 'error') map.set(id, d.severity)
    }
    return map
  }, [diagnostics, graph.nodes])

  const rfNodes: Node<BlockNodeData>[] = useMemo(() => graph.nodes.map((n) => ({
    id: n.id, type: 'block', position: { x: n.x, y: n.y }, draggable: false,
    data: {
      node: n,
      metric: showMetrics ? metricFor(n, metrics) : null,
      diagnostic: diagByNode.get(n.id) ?? null,
      lit: lit.has(n.id),
      selected: selected === n.id,
    },
  })), [graph.nodes, showMetrics, metrics, diagByNode, lit, selected])

  const rfEdges: Edge[] = useMemo(() => graph.edges.map((e) => {
    const on = litE.has(e.id)
    const fromSide = e.source.startsWith('knowledge:') || e.source === 'slot-knowledge'
      || (e.source === 'agent' && (e.target.startsWith('tool:') || e.target === 'slot-tool'))
    return {
      id: e.id, source: e.source, target: e.target, label: e.label,
      sourceHandle: fromSide ? 'right' : undefined,
      animated: on,
      style: { stroke: on ? 'var(--brand, #F97316)' : '#CBD5E1', strokeWidth: on ? 2.5 : 1.5 },
      labelStyle: { fontSize: 11, fontWeight: 700 },
    }
  }), [graph.edges, litE])

  const change = useCallback((next: HubState) => {
    setHistory((h) => (h ? historyPush(h, next) : h))
  }, [])
  const undo = useCallback(() => setHistory((h) => (h ? historyUndo(h) : h)), [])
  const redo = useCallback(() => setHistory((h) => (h ? historyRedo(h) : h)), [])

  const save = useCallback(async () => {
    if (!hub || !agent || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/agents/${agent.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hubToAgentPatch(agent, hub)),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || 'Erro ao salvar o agente')
      }
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }, [hub, agent, saving, load])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey)) return
      const target = ev.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      const key = ev.key.toLowerCase()
      if (key === 's') { ev.preventDefault(); void save(); return }
      if (typing) return
      if (key === 'z' && ev.shiftKey) { ev.preventDefault(); redo() }
      else if (key === 'z') { ev.preventDefault(); undo() }
      else if (key === 'y') { ev.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, undo, redo])

  const focusNode = useCallback((id: string) => {
    const node = graph.nodes.find((n) => n.id === id)
    if (!node) return
    setSelected(id)
    void flow.setCenter(node.x + 100, node.y + 40, { zoom: 1.1, duration: 400 })
  }, [graph.nodes, flow])

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    setError(null)
    try { await fn(); await loadSide() } catch (e: any) { setError(e.message) } finally { setBusy(null) }
  }

  const linkAccount = (accountId: string) => run(`acc:${accountId}`, async () => {
    const res = await fetch(`/api/ai/agents/${agentId}/entries`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'whatsapp_account', ref_id: accountId }),
    })
    const body = await res.json().catch(() => null)
    if (res.status === 409) throw new Error(`${body?.error}. Desligue-o lá primeiro.`)
    if (!res.ok) throw new Error(body?.error || 'Não foi possível ligar a entrada')
  })
  const unlinkEntry = (entryId: string) => run(`entry:${entryId}`, async () => {
    const res = await fetch(`/api/ai/agents/${agentId}/entries?entry_id=${encodeURIComponent(entryId)}`, { method: 'DELETE' })
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Não foi possível desligar')
    setSelected(null)
  })
  const setNoteReader = (note: Note, reads: boolean) => run(`note:${note.id}`, async () => {
    const agentIds = reads ? Array.from(new Set([...note.readers, agentId])) : note.readers.filter((id) => id !== agentId)
    const res = await fetch(`/api/ai/knowledge/${note.id}/agents`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_ids: agentIds }),
    })
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Não foi possível mudar quem lê a nota')
    if (!reads) setSelected(null)
  })
  const addTool = (name: string) => {
    if (!hub || hub.tools.enabled.includes(name)) return
    change({ ...hub, tools: { enabled: [...hub.tools.enabled, name] } })
  }
  const removeTool = (name: string) => {
    if (!hub) return
    change({ ...hub, tools: { enabled: hub.tools.enabled.filter((t) => t !== name) } })
    setSelected(null)
  }

  if (loading && !hub) {
    return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 className="animate-spin" /></div>
  }
  if (!hub || !agent) {
    return <div style={{ padding: 24, color: 'var(--red)' }}>{error || 'Agente não encontrado'}</div>
  }

  const q = query.trim().toLowerCase()
  const match = (text: string) => !q || text.toLowerCase().includes(q)
  const linkedAccounts = new Set(entries.filter((e) => e.kind === 'whatsapp_account').map((e) => e.ref_id))
  const selectedNode = graph.nodes.find((n) => n.id === selected) ?? null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <Link href={`/ai/agentes/${agentId}`} className="btn btn-soft btn-sm"><ArrowLeft size={14} />Editor</Link>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{agent.name || 'Sem nome'}</div>
        {dirty && <span className="chip chip-outline" style={{ color: 'var(--amber, #E0930B)' }}>não salvo</span>}
        {error && <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>}
        <div style={{ flex: 1 }} />
        <button type="button" className={`btn btn-sm ${showMetrics ? 'btn-primary' : 'btn-soft'}`} onClick={() => setShowMetrics((v) => !v)}>
          <BarChart3 size={14} />Métricas
        </button>
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setPanel(panel === 'diagnostics' ? null : 'diagnostics')}>
          <Stethoscope size={14} />Diagnosticar{diagnostics.length > 0 && ` (${diagnostics.length})`}
        </button>
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setPanel('history')}><HistoryIcon size={14} />Histórico</button>
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setPanel('test')}><FlaskConical size={14} />Testar</button>
        {trace && <button type="button" className="btn btn-soft btn-sm" onClick={() => setTrace(null)}><X size={14} />Apagar caminho</button>}
        <button type="button" className="btn btn-soft btn-sm" title="Desfazer (Ctrl+Z)" disabled={history!.past.length === 0} onClick={undo}><Undo2 size={14} /></button>
        <button type="button" className="btn btn-soft btn-sm" title="Refazer (Ctrl+Y)" disabled={history!.future.length === 0} onClick={redo}><Redo2 size={14} /></button>
        <button type="button" className="btn btn-primary btn-sm" title="Salvar (Ctrl+S)" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <aside style={{ width: 240, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px' }}>
            <Search size={13} style={{ color: 'var(--text-3)' }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar bloco"
              style={{ border: 0, outline: 'none', fontSize: 12.5, flex: 1, background: 'transparent' }} />
          </label>

          <PaletteGroup title="Entradas">
            {accounts.filter((a) => match(a.label)).map((a) => (
              <PaletteItem key={a.id} icon={<MessageCircle size={13} />} label={a.label}
                done={linkedAccounts.has(a.id)} busy={busy === `acc:${a.id}`} onClick={() => void linkAccount(a.id)} />
            ))}
            {match('Instagram') && <PaletteItem icon={<MessageCircle size={13} />} label="Instagram" disabled hint="em breve" />}
            {match('E-mail') && <PaletteItem icon={<MessageCircle size={13} />} label="E-mail" disabled hint="em breve" />}
            <Link href="/automations" style={{ fontSize: 11.5, color: 'var(--brand)' }}>Toques de fluxo nascem no Flow Builder</Link>
          </PaletteGroup>

          <PaletteGroup title="Conhecimento">
            {notes.filter((n) => match(n.name)).slice(0, 40).map((n) => (
              <PaletteItem key={n.id} icon={<BookOpen size={13} />} label={n.name}
                done={n.readers.includes(agentId)} busy={busy === `note:${n.id}`} onClick={() => void setNoteReader(n, true)} />
            ))}
            {notes.length === 0 && <Link href="/ai/conhecimento" style={{ fontSize: 11.5, color: 'var(--brand)' }}>Criar a primeira nota</Link>}
          </PaletteGroup>

          <PaletteGroup title="Ferramentas">
            {TOOL_CATALOG.filter((t) => match(t.label)).map((t) => (
              <PaletteItem key={t.name} icon={<Wrench size={13} />} label={t.label}
                done={hub.tools.enabled.includes(t.name)} onClick={() => addTool(t.name)} />
            ))}
          </PaletteGroup>

          <PaletteGroup title="Regras e transferência">
            {match('Limites') && <PaletteItem icon={<AlertTriangle size={13} />} label="Limites" onClick={() => focusNode('limits')} />}
            {match('Revisão') && <PaletteItem icon={<AlertTriangle size={13} />} label="Revisão" onClick={() => focusNode('review')} />}
            {match('Transferência') && <PaletteItem icon={<Workflow size={13} />} label="Transferência" onClick={() => focusNode('needs_person')} />}
          </PaletteGroup>
        </aside>

        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodeClick={(_e, node) => setSelected(node.id)}
            onPaneClick={() => setSelected(null)}
            nodesConnectable={false}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => KIND_STYLE[(n.data as BlockNodeData).node.kind].color} />
          </ReactFlow>

          {panel === 'diagnostics' && (
            <div style={{ position: 'absolute', top: 12, right: 12, width: 320, maxHeight: '70%', overflowY: 'auto', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: 13 }}>Diagnóstico</strong>
                <button type="button" className="btn btn-soft btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setPanel(null)}><X size={13} /></button>
              </div>
              {diagnostics.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--green)', margin: 0 }}>Nada a corrigir.</p>
              ) : diagnostics.map((d) => (
                <button key={d.id} type="button" className="act-row" onClick={() => focusNode(diagnosticNode(d, graph.nodes))}
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, cursor: 'pointer' }}>
                  <AlertTriangle size={14} style={{ color: d.severity === 'error' ? 'var(--red)' : 'var(--amber, #E0930B)', flexShrink: 0 }} />
                  <span className="act-d" style={{ fontSize: 12 }}>{d.message}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedNode && (
          <aside style={{ width: 380, borderLeft: '1px solid var(--border)', overflowY: 'auto', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: KIND_STYLE[selectedNode.kind].color }} />
              <strong style={{ fontSize: 14 }}>{selectedNode.label}</strong>
              <button type="button" className="btn btn-soft btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setSelected(null)}><X size={13} /></button>
            </div>
            <Inspector
              node={selectedNode}
              hub={hub}
              onChange={change}
              organizationId={organizationId}
              agentId={agentId}
              runtimeMode={runtimeMode}
              entries={entries}
              notes={readNotes}
              busy={busy}
              onUnlinkEntry={(id) => void unlinkEntry(id)}
              onStopReading={(note) => void setNoteReader(note, false)}
              onRemoveTool={removeTool}
            />
          </aside>
        )}
      </div>

      {panel === 'history' && (
        <AgentVersionsPanel agentId={agentId} onClose={() => setPanel(null)} onRestored={load} />
      )}
      {panel === 'test' && (
        <AgentTestPanel
          agentId={agentId}
          draft={dirty ? (hubToAgentPatch(agent, hub) as unknown as Record<string, unknown>) : null}
          onClose={() => setPanel(null)}
          onTrace={setTrace}
        />
      )}
    </div>
  )
}

function PaletteGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-3)' }}>{title}</div>
      {children}
    </div>
  )
}

function PaletteItem({ icon, label, onClick, done, busy, disabled, hint }: {
  icon: React.ReactNode; label: string; onClick?: () => void; done?: boolean; busy?: boolean; disabled?: boolean; hint?: string
}) {
  return (
    <button type="button" disabled={disabled || done || busy} onClick={onClick} title={done ? 'Já está no agente' : hint}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, fontSize: 12.5, textAlign: 'left',
        border: '1px solid var(--border)', background: done ? 'var(--bg)' : '#fff',
        cursor: disabled || done ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
      }}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : icon}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {hint && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{hint}</span>}
      {done && <span style={{ fontSize: 10, color: 'var(--green)' }}>no agente</span>}
      {!done && !disabled && !busy && <Plus size={12} style={{ color: 'var(--text-3)' }} />}
    </button>
  )
}

function Inspector({ node, hub, onChange, organizationId, agentId, runtimeMode, entries, notes, busy, onUnlinkEntry, onStopReading, onRemoveTool }: {
  node: BuilderNode
  hub: HubState
  onChange: (next: HubState) => void
  organizationId: string
  agentId: string
  runtimeMode: RuntimeMode
  entries: Entry[]
  notes: Note[]
  busy: string | null
  onUnlinkEntry: (entryId: string) => void
  onStopReading: (note: Note) => void
  onRemoveTool: (name: string) => void
}) {
  const fields = (area: HubAreaId) => (
    <AreaFields area={area} hub={hub} onChange={onChange} organizationId={organizationId} agentId={agentId} runtimeMode={runtimeMode} />
  )
  const hint = (text: string) => <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>{text}</p>

  switch (node.kind) {
    case 'agent':
      return (
        <div style={{ display: 'grid', gap: 18 }}>
          {fields('identity')}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>{fields('budget')}</div>
        </div>
      )
    case 'entry': {
      const entry = entries.find((e) => `entry:${e.id}` === node.id)
      if (!entry) return null
      if (entry.kind === 'flow_touch') {
        return <>{hint('Este toque nasce de um nó "Missão de IA" no Flow Builder. Para tirar, edite o fluxo.')}<Link href="/automations" className="btn btn-soft btn-sm">Abrir fluxos</Link></>
      }
      return (
        <>
          {hint('Mensagens que chegam neste número são respondidas por este agente.')}
          <button type="button" className="btn btn-soft btn-sm" style={{ color: 'var(--red)' }} disabled={busy === `entry:${entry.id}`} onClick={() => onUnlinkEntry(entry.id)}>
            <Trash2 size={13} />Desligar do agente
          </button>
        </>
      )
    }
    case 'knowledge': {
      const note = notes.find((n) => n.id === node.refId)
      if (!note) return null
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {hint(`Status: ${note.status ?? '—'}. O agente busca nesta nota quando a pergunta é factual.`)}
          <Link href={`/ai/conhecimento?note=${note.id}`} className="btn btn-soft btn-sm"><BookOpen size={13} />Abrir em Conhecimento</Link>
          <button type="button" className="btn btn-soft btn-sm" style={{ color: 'var(--red)' }} disabled={busy === `note:${note.id}`} onClick={() => onStopReading(note)}>
            <X size={13} />Parar de ler
          </button>
        </div>
      )
    }
    case 'tool': {
      const tool = TOOL_CATALOG.find((t) => t.name === node.refId)
      return (
        <>
          {hint(tool?.description ?? 'Ferramenta fora do catálogo.')}
          {tool?.requiresStore && hint('Só funciona com a loja Shopify conectada.')}
          <button type="button" className="btn btn-soft btn-sm" style={{ color: 'var(--red)' }} onClick={() => onRemoveTool(node.refId!)}>
            <Trash2 size={13} />Remover do agente
          </button>
        </>
      )
    }
    case 'slot':
      return hint(node.id === 'slot-entry'
        ? 'Ligue um número na paleta à esquerda (Entradas).'
        : node.id === 'slot-knowledge'
          ? 'Escolha uma nota na paleta à esquerda (Conhecimento).'
          : 'Escolha uma ferramenta na paleta à esquerda.')
    case 'review':
      return fields('judges')
    case 'needs_person':
    case 'transfer':
      return fields('handoff')
    default:
      return node.area ? fields(node.area) : null
  }
}
