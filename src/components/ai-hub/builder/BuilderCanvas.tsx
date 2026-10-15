'use client'

// O Construtor em tela cheia (protótipo: function Builder em "IA Construtor
// do Agente v2"). Barra escura com nome, versão salva, loja, desfazer e
// refazer, Métricas, Histórico, Diagnosticar, Testar, Ativo e Fechar; à
// esquerda a paleta, o inspector ou o diagnóstico; no meio o canvas; à
// direita o Testar ou o Histórico. O que se edita aqui é o HubState do
// agente (agent-hub.ts); Salvar grava pelo mesmo PATCH e vira versão.

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useStoreStore } from '@/stores'
import { agentToHub, hubToAgentPatch, type HubState } from '@/lib/ai/agent-hub'
import {
  buildPalette, deriveModel, issueNode, runPath, setAdapt, setDelivery, setModel, setPhrases, setPresentation,
  setReview, setRules, setTopics, setVoice, toggleTool, type PaletteItem,
} from '@/lib/ai/builder-model'
import type { Diagnostic } from '@/lib/ai/block-metrics'
import type { AgentEntry } from '@/lib/ai/agent-entries'
import { USD_BRL_FALLBACK } from '@/lib/ai/brl'
import { Icon, Modal, Toast } from '../proto/ui'
import NewSource from './NewSource'
import { AgentMissionsArea } from '../AreaFields'
import Canvas, { type AgentHead, type RunState } from './Canvas'
import { Diagnostics, Inspector, Palette } from './Panels'
import { Checklist, Playground, Versions, type MissionOption } from './RightPanels'

interface AgentRow {
  id: string
  name: string | null
  role: string | null
  status: 'draft' | 'active' | 'paused'
  is_active?: boolean
  provider: string | null
  model: string | null
  monthly_cap_usd: number | null
  persona: Record<string, any> | null
  settings: Record<string, any> | null
  presentation_mode: string | null
  client_adaptation: Record<string, unknown> | null
}
interface ListAgent { id: string; name: string | null; role: string | null; status: string; entries: AgentEntry[] }
interface Note { id: string; name: string; status?: string | null; source_type?: string | null; kind?: string | null; chunks_count?: number | null; readers: string[] }
interface Snapshot { hub: HubState; dest: string }

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export default function BuilderCanvas({ organizationId, agentId }: { organizationId: string; agentId: string }) {
  const router = useRouter()
  const store = useStoreStore((s) => s.currentStore)
  const [agent, setAgent] = useState<AgentRow | null>(null)
  const [agents, setAgents] = useState<ListAgent[]>([])
  const [entries, setEntries] = useState<AgentEntry[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [missions, setMissions] = useState<MissionOption[]>([])
  const [metrics, setMetrics] = useState<any>(null)
  const [issues, setIssues] = useState<Diagnostic[]>([])
  const [accounts, setAccounts] = useState<Array<{ id: string; label: string }>>([])
  const [spentUsd, setSpentUsd] = useState<number | null>(null)
  const [keyMask, setKeyMask] = useState<string | null>(null)
  const [rejected, setRejected] = useState<Array<{ at: string; text: string }>>([])
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [version, setVersion] = useState<string | null>(null)

  // Estado editável com desfazer/refazer (hist/fut do protótipo).
  const [f, setF] = useState<Snapshot | null>(null)
  const [saved, setSaved] = useState<Snapshot | null>(null)
  const [hist, setHist] = useState<Snapshot[]>([])
  const [fut, setFut] = useState<Snapshot[]>([])

  const [sel, setSel] = useState<string | null>(null)
  const [drag, setDrag] = useState<PaletteItem | null>(null)
  const [run, setRun] = useState<RunState | null>(null)
  const [mode, setMode] = useState<'test' | 'ver' | null>(null)
  const [mets, setMets] = useState(true)
  const [diag, setDiag] = useState(false)
  const [pal, setPal] = useState(false)
  const [ck, setCk] = useState(false)
  const [cp, setCp] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [newSource, setNewSource] = useState<PaletteItem['sourceKind'] | null>(null)
  const [missionsOpen, setMissionsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const usdBrl = Number(metrics?.usd_brl) || USD_BRL_FALLBACK

  const loadSide = useCallback(async () => {
    const [ag, en, kn, mi, me, di, sp, wa, ev, ve] = await Promise.all([
      fetch(`/api/ai/agents?organization_id=${encodeURIComponent(organizationId)}`).then((r) => (r.ok ? r.json() : { agents: [] })).catch(() => ({ agents: [] })),
      fetch(`/api/ai/agents/${agentId}/entries`).then((r) => (r.ok ? r.json() : { entries: [] })).catch(() => ({ entries: [] })),
      fetch('/api/ai/knowledge').then((r) => (r.ok ? r.json() : { folders: [] })).catch(() => ({ folders: [] })),
      fetch(`/api/ai/missions?agent_id=${agentId}`).then((r) => (r.ok ? r.json() : { missions: [] })).catch(() => ({ missions: [] })),
      fetch(`/api/ai/agents/${agentId}/block-metrics`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/ai/agents/${agentId}/diagnostics`).then((r) => (r.ok ? r.json() : { diagnostics: [] })).catch(() => ({ diagnostics: [] })),
      fetch(`/api/ai/agents/${agentId}/spend`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/whatsapp/business-accounts', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/ai/activity/events?kind=blocked&agent=${agentId}&limit=3`).then((r) => (r.ok ? r.json() : { events: [] })).catch(() => ({ events: [] })),
      fetch(`/api/ai/agents/${agentId}/versions`).then((r) => (r.ok ? r.json() : { versions: [] })).catch(() => ({ versions: [] })),
    ])
    setAgents(ag.agents ?? [])
    setEntries(en.entries ?? [])
    setNotes((kn.folders ?? []).flatMap((x: any) => x.notes ?? []))
    setMissions(mi.missions ?? [])
    setMetrics(me)
    setIssues(di.diagnostics ?? [])
    setSpentUsd(sp && typeof sp.spent_usd === 'number' ? sp.spent_usd : null)
    const list = Array.isArray(wa) ? wa : wa?.accounts ?? wa?.data ?? []
    setAccounts(list.map((a: any) => ({ id: a.id, label: a.verified_name ? `${a.verified_name} · ${a.display_phone_number || a.phone_number || ''}` : a.display_phone_number || a.phone_number || 'WhatsApp' })))
    setRejected((ev.events ?? []).map((e: any) => ({ at: whenLabel(e.created_at), text: e.text })))
    const cur = (ve.versions ?? []).find((v: any) => v.current) ?? (ve.versions ?? [])[0]
    setVersion(cur ? String(cur.tag).replace(/^v/i, '') : null)
  }, [agentId, organizationId])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}`)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Agente não encontrado')
      const row: AgentRow = body.agent ?? body
      row.status = row.status ?? (row.is_active ? 'active' : 'paused')
      setAgent(row)
      const snap: Snapshot = { hub: agentToHub(row), dest: String(row.settings?.safety?.handoff_destination || 'team') }
      setF(snap); setSaved(snap); setHist([]); setFut([])
      setError(null)
      await loadSide()
    } catch (e: any) {
      setError(e.message)
    }
  }, [agentId, loadSide])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    fetch('/api/api-keys').then((r) => (r.ok ? r.json() : { keys: [] })).then((d) => {
      const k = (d.keys ?? []).find((x: any) => x.is_active !== false && x.provider === (agent?.provider || 'openrouter')) ?? (d.keys ?? [])[0]
      setKeyMask(k?.api_key_hint ? `${String(k.api_key_hint).split('-')[0]}-••••${String(k.api_key_hint).slice(-4)}` : null)
    }).catch(() => {})
  }, [agent?.provider])

  const dirty = f !== null && saved !== null && JSON.stringify(f) !== JSON.stringify(saved)
  const upd = useCallback((fn: (s: Snapshot) => Snapshot) => {
    setF((cur) => {
      if (!cur) return cur
      const next = fn(cur)
      if (JSON.stringify(next) === JSON.stringify(cur)) return cur
      setHist((h) => [...h.slice(-30), cur]); setFut([])
      return next
    })
  }, [])
  const updHub = useCallback((fn: (h: HubState) => HubState) => upd((s) => ({ ...s, hub: fn(s.hub) })), [upd])
  const undo = useCallback(() => {
    if (!hist.length || !f) return
    setFut((x) => [f, ...x]); setF(hist[hist.length - 1]); setHist((h) => h.slice(0, -1))
  }, [hist, f])
  const redo = useCallback(() => {
    if (!fut.length || !f) return
    setHist((h) => [...h, f]); setF(fut[0]); setFut((x) => x.slice(1))
  }, [fut, f])

  const save = useCallback(async () => {
    if (!dirty || !f || !agent || saving) return
    setSaving(true)
    try {
      const patch = hubToAgentPatch(agent, f.hub)
      patch.settings = { ...patch.settings, safety: { ...(patch.settings.safety ?? {}), handoff_destination: f.dest === 'team' ? null : f.dest } }
      const res = await fetch(`/api/ai/agents/${agent.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Erro ao salvar')
      await load()
      setToast('Salvo como versão nova')
    } catch (e: any) {
      setToast(e.message)
    } finally {
      setSaving(false)
    }
  }, [dirty, f, agent, saving, load])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const m = e.metaKey || e.ctrlKey
      const typing = (e.target as HTMLElement | null)?.closest('input,textarea,select,[contenteditable]')
      if (m && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); return }
      if (typing) return
      if (m && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      if (m && e.key.toLowerCase() === 'y') { e.preventDefault(); redo() }
      if (e.key === 'Escape') { setSel(null); setDiag(false) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [save, undo, redo])

  // Caminho do teste: um bloco a cada 320 ms (run.i do protótipo).
  useEffect(() => {
    if (!run || run.i >= run.path.length) return
    const t = setTimeout(() => setRun((o) => o && { ...o, i: o.i + 1 }), 320)
    return () => clearTimeout(t)
  }, [run])

  const model = useMemo(() => {
    if (!f || !agent) return null
    const m = deriveModel({
      hub: f.hub, agentId, entries, missions, agents, metrics, usdBrl, handoffDest: f.dest,
      notes: notes.map((n) => ({ ...n, preview: previews[n.id] ?? '' })),
      spentBrl: spentUsd == null ? null : Math.round(spentUsd * usdBrl * 100) / 100,
    })
    return m
  }, [f, agent, agentId, entries, missions, agents, metrics, usdBrl, notes, previews, spentUsd])

  // A prévia da fonte vem quando o bloco é aberto.
  useEffect(() => {
    if (!sel?.startsWith('k:')) return
    const id = sel.slice(2)
    if (previews[id] !== undefined) return
    fetch(`/api/ai/knowledge/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      const text = String(d?.note?.body_markdown ?? d?.note?.text_content ?? '').replace(/[#>*_[\]]/g, '').trim()
      setPreviews((p) => ({ ...p, [id]: text.slice(0, 280) }))
    }).catch(() => {})
  }, [sel, previews])

  if (error && !agent) return <div style={{ padding: 24 }}>{error} · <Link href="/ai/agentes">Voltar</Link></div>
  if (!agent || !f || !model) return <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon n="refresh" s={20} className="spin" /></div>

  const active = agent.status === 'active'
  const head: AgentHead & { id: string } = { id: agent.id, name: f.hub.identity.name || agent.name || 'Agente', role: agent.role || 'Agente', active, draft: agent.status === 'draft' }
  const linked = new Set(entries.filter((e) => e.kind === 'whatsapp_account').map((e) => e.ref_id))
  const ownerOf = (accountId: string) => {
    const owner = agents.find((a) => (a.entries ?? []).some((e) => e.kind === 'whatsapp_account' && e.ref_id === accountId))
    return owner ? owner.name || 'Agente' : null
  }
  const palette = buildPalette({
    accounts: accounts.map((a) => ({ ...a, agentName: ownerOf(a.id) })), linkedAccountIds: linked,
    enabledTools: f.hub.tools.enabled, agents, agentId, dest: f.dest,
  })
  const warns = issues.filter((i) => i.lv !== 'ok').length

  const add = async (it: PaletteItem) => {
    setDrag(null); setDiag(false); setPal(false)
    if (it.k === 'entry' && it.accountId) {
      const res = await fetch(`/api/ai/agents/${agentId}/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'whatsapp_account', ref_id: it.accountId }) })
      const body = await res.json().catch(() => null)
      if (!res.ok) { setToast(res.status === 409 ? 'Este número já é atendido por outro agente' : body?.error || 'Não foi possível ligar'); return }
      await loadSide(); setToast('Entrada adicionada'); return
    }
    if (it.k === 'kb' && it.sourceKind) { setNewSource(it.sourceKind); return }
    if (it.k === 'tool' && it.toolName) { updHub((h) => toggleTool(h, it.toolName!, true)); setSel(`t:${it.toolName}`); setToast('Ferramenta ligada'); return }
    if (it.k === 'limit') {
      updHub((h) => (it.limitKind === 'topic' ? setTopics(h, [...h.limits.blocked, 'Novo assunto']) : setRules(h, [...h.limits.invariants, 'Nova regra'])))
      setSel('n-limits'); setToast('Regra adicionada em Limites'); return
    }
    if (it.k === 'crit') { updHub((h) => setReview(h, [...h.judges.custom.filter((j) => j.active).map((j) => j.criterion), 'Novo critério'])); setSel('n-review'); setToast('Critério adicionado na Revisão'); return }
    if (it.k === 'dest' && it.dest) { upd((s) => ({ ...s, dest: it.dest! })); setSel('n-transfer'); setToast(`Transferência agora vai para ${it.t.replace('Transferir p/ ', '')}`) }
  }

  const remove = async (id: string) => {
    if (id.startsWith('t:')) { updHub((h) => toggleTool(h, id.slice(2), false)); setSel(null); setToast('Bloco removido. Ctrl+Z desfaz'); return }
    if (id.startsWith('e:')) {
      const e = entries.find((x) => `e:${x.id}` === id)
      if (!e) return
      if (e.kind === 'flow_touch') { setToast('Este toque vem de um fluxo. Tire o agente no nó de IA do fluxo.'); return }
      const res = await fetch(`/api/ai/agents/${agentId}/entries?entry_id=${encodeURIComponent(e.id)}`, { method: 'DELETE' })
      if (res.ok) { await loadSide(); setSel(null); setToast('Entrada removida') }
      return
    }
    if (id.startsWith('k:')) {
      const note = notes.find((n) => `k:${n.id}` === id)
      if (!note) return
      const res = await fetch(`/api/ai/knowledge/${note.id}/agents`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_ids: note.readers.filter((r) => r !== agentId) }),
      })
      if (res.ok) { await loadSide(); setSel(null); setToast(`${head.name} parou de ler esta fonte`) }
    }
  }

  const copyId = (id: string) => {
    const real = id.replace(/^[ekt]:/, '')
    void navigator.clipboard?.writeText(real).catch(() => {})
    setToast('ID copiado: ' + real)
  }

  const publish = async (accountId: string | null) => {
    if (accountId) {
      await fetch(`/api/ai/agents/${agentId}/entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'whatsapp_account', ref_id: accountId }) })
    }
    const res = await fetch(`/api/ai/agents/${agentId}/activate`, { method: 'POST' })
    const body = await res.json().catch(() => null)
    if (!res.ok) { setToast(body?.error || 'Não foi possível ativar'); return }
    setCk(false); await load(); setToast(`${head.name} está ativo`)
  }
  const pause = async () => {
    const res = await fetch(`/api/ai/agents/${agentId}/pause`, { method: 'POST' })
    if (res.ok) { setCp(false); await load(); setToast(`${head.name} pausado`) }
  }

  const draftPatch = dirty ? (hubToAgentPatch(agent, f.hub) as unknown as Record<string, unknown>) : null
  const now = new Date()
  const left = diag
    ? <Diagnostics issues={issues} onClose={() => setDiag(false)} onPick={(node) => { setDiag(false); setSel(issueNode(node, model)) }} />
    : sel
      ? <Inspector id={sel} f={model} agent={head} modelSlug={f.hub.budget.model} handoffMessage={f.hub.handoff.message} keyMask={keyMask}
          monthLabel={MONTHS[now.getMonth()]} agents={agents} rejected={rejected} onClose={() => setSel(null)} onRemove={(id) => void remove(id)} onCopy={copyId}
          actions={{
            setVoice: (l) => updHub((h) => setVoice(h, l)),
            setPres: (l) => updHub((h) => setPresentation(h, l)),
            setModel: (s) => updHub((h) => setModel(h, s)),
            setCapBrl: (v) => updHub((h) => ({ ...h, budget: { ...h.budget, cap_usd: v == null || !Number.isFinite(v) || v <= 0 ? null : Math.round((v / usdBrl) * 100) / 100 } })),
            setAdapt: (l, on) => updHub((h) => setAdapt(h, l, on)),
            setTopics: (l) => updHub((h) => setTopics(h, l)),
            setRules: (l) => updHub((h) => setRules(h, l)),
            setReview: (l) => updHub((h) => setReview(h, l)),
            setPhrases: (l) => updHub((h) => setPhrases(h, l)),
            setMessage: (m) => updHub((h) => ({ ...h, handoff: { ...h.handoff, message: m } })),
            setDest: (d) => upd((s) => ({ ...s, dest: d })),
            setDelivery: (p) => updHub((h) => setDelivery(h, p)),
            editMissions: () => setMissionsOpen(true),
          }} />
      : <Palette groups={palette} agents={agents} agentId={agentId} setDrag={setDrag} onAdd={(it) => void add(it)}
          setAgent={(id) => { if (id !== agentId) router.push(`/ai/construtor/${id}`) }} />

  const tb = (ic: string, l: string, on: boolean, fn: () => void, extra?: React.ReactNode) => (
    <button type="button" className={'w-tb' + (on ? ' on' : '')} onClick={fn}><Icon n={ic} s={15} />{l}{extra}</button>
  )

  return (
    <div className={'w-app' + (pal ? ' pal-open' : '')}>
      <header className="w-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ia/worder-mark.png" alt="Worder" className="w-logo" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
        <span className="w-vd"></span>
        <div className="w-title">
          {renaming ? (
            <input autoFocus className="w-select" style={{ height: 30, width: 220 }} defaultValue={f.hub.identity.name}
              onBlur={(e) => { const v = e.target.value.trim(); if (v) updHub((h) => ({ ...h, identity: { ...h.identity, name: v } })); setRenaming(false) }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false) }} />
          ) : <b>{head.name} · Agente de {head.role.toLowerCase()}</b>}
          <button type="button" className="w-tb ic" aria-label="Renomear" onClick={() => setRenaming(true)}><Icon n="edit" s={14} /></button>
        </div>
        {head.draft && !active && <span className="w-store" style={{ background: '#3A2A0F', color: '#F5C46B' }}>Rascunho</span>}
        {dirty ? <span className="w-saved dirty"><i></i>Alterações não salvas</span> : <span className="w-saved"><Icon n="check" s={13} />Salvo{version ? ` · versão ${version}` : ''}</span>}
        <span className="w-store"><Icon n="store" s={12} />{store?.name || 'Loja'}</span>
        <span className="w-sp"></span>
        <button type="button" className="w-tb ic" onClick={undo} disabled={!hist.length} aria-label="Desfazer"><Icon n="undo" s={15} /></button>
        <button type="button" className="w-tb ic" onClick={redo} disabled={!fut.length} aria-label="Refazer"><Icon n="redo" s={15} /></button>
        <span className="w-vd"></span>
        {tb('chart', 'Métricas', mets, () => setMets((m) => !m))}
        {tb('clock', 'Histórico', mode === 'ver', () => setMode((m) => (m === 'ver' ? null : 'ver')))}
        {tb('alert', 'Diagnosticar', diag, () => { setSel(null); setDiag((d) => !d) }, warns > 0 ? <span className="w-badge">{warns}</span> : null)}
        {tb('play', 'Testar', mode === 'test', () => { setMode((m) => (m === 'test' ? null : 'test')); setRun(null) })}
        {dirty && <button type="button" className="w-save" onClick={() => void save()} disabled={saving}>Salvar</button>}
        <label className={'w-active' + (active ? ' on' : '')}>
          <button type="button" className={'w-sw' + (active ? ' on' : '')} role="switch" aria-checked={active} aria-label="Ativo" onClick={() => (active ? setCp(true) : setCk(true))}></button>
          {active ? 'Ativo' : 'Pausado'}{active && <i></i>}
        </label>
        <Link className="w-close" href="/ai/agentes">Fechar</Link>
      </header>
      <div className="w-body">
        {left}
        <div className="w-main">
          <Canvas f={model} agent={head} sel={sel} setSel={(id) => { setSel(id); if (id) setDiag(false) }} drag={drag} onDrop={(it) => void add(it)}
            run={run} onRemove={(id) => void remove(id)} mets={mets} issues={issues} fitKey={`${Boolean(mode)}-${sel ? 1 : 0}`}
            nodeIdOf={(node) => issueNode(node, model)} />
          {run && run.i >= run.path.length && (
            <div className={'w-run' + (run.fail ? ' fail' : '')}>
              <Icon n={run.fail ? 'alert' : 'check'} s={14} />
              {run.fail ? 'A revisão bloqueou a resposta. Nada foi enviado.' : `Caminho da resposta: ${run.path.length} blocos`}
              <button type="button" onClick={() => setRun(null)} aria-label="Limpar"><Icon n="x" s={13} /></button>
            </div>
          )}
          {drag && <div className="w-hint">Solte no lugar destacado</div>}
        </div>
        {mode && (
          <aside className="w-right">
            {mode === 'test'
              ? <Playground agentId={agentId} agentName={head.name} missions={missions} draft={draftPatch} usdBrl={usdBrl}
                  onClose={() => { setMode(null); setRun(null) }}
                  onRun={(trace, flow) => { const r = runPath(trace, model, flow); setRun({ path: r.path, i: 0, fail: r.fail }) }} />
              : <Versions agentId={agentId} agentName={head.name} onClose={() => setMode(null)} onRestored={load} onToast={setToast} />}
          </aside>
        )}
      </div>
      {ck && (
        <Checklist agentId={agentId} agentName={head.name} onClose={() => setCk(false)} onPublish={publish}
          accounts={accounts.map((a) => ({ ...a, agentName: ownerOf(a.id), linkedHere: linked.has(a.id) }))} />
      )}
      {cp && (
        <Modal title={`Pausar ${head.name}?`} width={460} onClose={() => setCp(false)}
          sub={`Conversas em andamento vão para a equipe no Inbox. Toques de fluxo com ${head.name} ficam parados até você ativar de novo.`}
          footer={<><button type="button" className="btn" onClick={() => setCp(false)}>Cancelar</button><button type="button" className="btn dark" onClick={() => void pause()}>Pausar</button></>} />
      )}
      {newSource && <NewSource kind={newSource} agentId={agentId} onClose={() => setNewSource(null)} onDone={async (msg) => { setNewSource(null); await loadSide(); setToast(msg) }} />}
      {missionsOpen && (
        <Modal title={`Missões de ${head.name}`} width={720} onClose={() => setMissionsOpen(false)}
          footer={<button type="button" className="btn" onClick={() => { setMissionsOpen(false); void loadSide() }}>Fechar</button>}>
          <AgentMissionsArea agentId={agentId} />
        </Modal>
      )}
      {!sel && !diag && (
        <button type="button" className="w-fab" onClick={() => setPal((o) => !o)} aria-expanded={pal}><Icon n={pal ? 'x' : 'plus'} s={18} />{pal ? 'Fechar' : 'Blocos'}</button>
      )}
      {pal && <div className="w-palscrim" onClick={() => setPal(false)}></div>}
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  )
}

function whenLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  const hm = `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === today.toDateString()) return `Hoje, ${hm}`
  if (d.toDateString() === yesterday.toDateString()) return `Ontem, ${hm}`
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}, ${hm}`
}
