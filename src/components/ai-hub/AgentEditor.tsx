'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Check, FlaskConical, History, Loader2, MessageCircle, Pause, Play, Plus, Save, Workflow, X,
} from 'lucide-react'
import { Card } from '@/components/agents/ui/primitives'
import { agentToHub, hubToAgentPatch, type HubState } from '@/lib/ai/agent-hub'
import type { AgentEntry } from '@/lib/ai/agent-entries'
import type { Readiness } from '@/lib/ai/agent-readiness'
import type { RuntimeMode } from '@/lib/ai/runtime-rollout'
import RadialView from './RadialView'
import ClassicView from './ClassicView'
import { STATUS_LABEL, initials } from './AgentsList'
import AgentTestPanel from './AgentTestPanel'
import AgentVersionsPanel from './AgentVersionsPanel'
import EvalRunner from './EvalRunner'

/**
 * O editor de UM agente (plano IA, M2 passo 16): cabeçalho com nome, função,
 * "onde atua" e o interruptor (ativar com checklist / pausar com modal), a
 * barra com Versões e Testar (desabilitados até o M4), e a órbita (radial no
 * desktop, clássica no mobile) sobre o MESMO HubState de antes.
 */

interface AgentRow {
  id: string
  name: string | null
  role: string | null
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

interface WhatsAppAccount { id: string; label: string }

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(true)
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return isDesktop
}

export default function AgentEditor({ organizationId, agentId }: { organizationId: string; agentId: string }) {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const [agent, setAgent] = useState<AgentRow | null>(null)
  const [entries, setEntries] = useState<AgentEntry[]>([])
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>('runtime')
  const [hub, setHub] = useState<HubState | null>(null)
  const [savedHub, setSavedHub] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checklist, setChecklist] = useState<Readiness | null>(null)
  const [pauseModal, setPauseModal] = useState(false)
  const [entriesModal, setEntriesModal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [versionsOpen, setVersionsOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [agentRes, entriesRes, sourcesRes] = await Promise.all([
        fetch(`/api/ai/agents/${agentId}`),
        fetch(`/api/ai/agents/${agentId}/entries`),
        fetch(`/api/ai/agents/${agentId}/sources`),
      ])
      const agentBody = await agentRes.json().catch(() => null)
      if (!agentRes.ok) throw new Error(agentBody?.error || 'Agente não encontrado')
      const row: AgentRow = agentBody.agent ?? agentBody
      const entriesBody = entriesRes.ok ? await entriesRes.json() : { entries: [] }
      const sourcesBody = sourcesRes.ok ? await sourcesRes.json().catch(() => null) : null
      const sources = Array.isArray(sourcesBody) ? sourcesBody : sourcesBody?.sources ?? []
      row.sources_count = sources.filter((s: any) => s.status === 'ready').length
      row.status = row.status ?? ((row as any).is_active ? 'active' : 'paused')
      setAgent(row)
      setEntries(entriesBody.entries ?? [])
      const next = agentToHub(row)
      setHub(next)
      setSavedHub(JSON.stringify(next))
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    fetch('/api/ai/runtime-mode').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.mode === 'legacy') setRuntimeMode('legacy')
    }).catch(() => {})
  }, [])

  const dirty = useMemo(() => hub !== null && JSON.stringify(hub) !== savedHub, [hub, savedHub])

  const save = async () => {
    if (!hub || !agent) return
    setSaving(true)
    setError(null)
    try {
      const patch = hubToAgentPatch(agent, hub)
      const res = await fetch(`/api/ai/agents/${agent.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || 'Erro ao salvar o agente')
      }
      await load()
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const activate = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/activate`, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (res.status === 422 && body?.items) { setChecklist(body); return }
      if (!res.ok) throw new Error(body?.error || 'Não foi possível ativar')
      setChecklist(null)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Passo 26: Ativar abre o checklist primeiro (com a avaliação automática).
  const openChecklist = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/readiness`)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Não foi possível carregar o checklist')
      setChecklist(body)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const pause = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/pause`, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Não foi possível pausar')
      setPauseModal(false)
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8, color: 'var(--text-3)' }}>
        <Loader2 size={16} className="animate-spin" />Carregando…
      </div>
    )
  }
  if (!agent || !hub) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: 'var(--red)', fontSize: 13 }}>{error ?? 'Agente não encontrado'}</p>
        <Link href="/ai/agentes" className="btn btn-soft btn-sm"><ArrowLeft size={14} />Agentes</Link>
      </div>
    )
  }

  const status = STATUS_LABEL[agent.status] ?? STATUS_LABEL.draft
  const isActive = agent.status === 'active'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '11px 22px',
        background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap',
      }}>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Agentes" onClick={() => router.push('/ai/agentes')}>
          <ArrowLeft size={16} />
        </button>
        <div style={{
          width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center',
          background: 'var(--brand-soft, #FFF3EA)', color: 'var(--brand, #F97316)', fontWeight: 800, fontSize: 12,
        }}>
          {initials(agent.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.01em', display: 'flex', alignItems: 'center', gap: 8 }}>
            {agent.name || 'Sem nome'}
            <span className={status.chip}>{status.label}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>{agent.role || 'Sem função definida'}</span>
            <span>·</span>
            <button type="button" onClick={() => setEntriesModal(true)}
              style={{ background: 'none', border: 0, padding: 0, color: 'var(--brand)', fontSize: 12, cursor: 'pointer', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {entries.length === 0 ? 'Definir onde atua' : entries.map((e) => (
                <span key={e.id} className="chip chip-outline" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  {e.kind === 'whatsapp_account' ? <MessageCircle size={11} /> : <Workflow size={11} />}{e.label}
                </span>
              ))}
            </button>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {error && <span style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</span>}
        {savedFlash && (
          <span style={{ fontSize: 12.5, color: 'var(--green)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Check size={14} />Salvo
          </span>
        )}
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setVersionsOpen(true)}>
          <History size={14} />Versões
        </button>
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setTesting(true)}>
          <FlaskConical size={14} />Testar
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar
        </button>
        {isActive ? (
          <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => setPauseModal(true)}
            style={{ color: 'var(--red)' }}>
            <Pause size={14} />Pausar
          </button>
        ) : (
          <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => void openChecklist()}
            style={{ color: 'var(--green)' }}>
            <Play size={14} />Ativar
          </button>
        )}
      </div>

      {dirty && (
        <div className="callout" style={{ margin: '10px 22px 0' }}>
          Alterações não salvas. {isActive ? 'O agente continua respondendo com a configuração anterior até você salvar.' : ''}
        </div>
      )}

      {isDesktop ? (
        <RadialView hub={hub} onChange={setHub} organizationId={organizationId} agentId={agent.id} runtimeMode={runtimeMode} />
      ) : (
        <ClassicView hub={hub} onChange={setHub} organizationId={organizationId} agentId={agent.id} runtimeMode={runtimeMode} />
      )}

      {checklist && (
        <Modal title="Antes de ativar" onClose={() => setChecklist(null)}>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
            O agente só liga com o mínimo garantido. Itens em vermelho bloqueiam; em amarelo são avisos.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            {checklist.items.map((item) => (
              <div key={item.id} className={`act-row${item.ok ? ' on' : ''}`}>
                {item.ok ? <Check size={16} style={{ color: 'var(--green)' }} /> : <X size={16} style={{ color: item.blocking ? 'var(--red)' : 'var(--amber, #E0930B)' }} />}
                <div style={{ flex: 1 }}>
                  <div className="act-t">{item.label}</div>
                  <div className="act-d">{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <EvalRunner agentId={agent.id} onDone={() => void openChecklist()} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setChecklist(null)}>Fechar</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !checklist.ready} onClick={() => void activate()}>
              <Play size={14} />Ativar
            </button>
          </div>
        </Modal>
      )}

      {pauseModal && (
        <Modal title="Pausar este agente?" onClose={() => setPauseModal(false)}>
          <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
            Ele deixa de responder nos números e fluxos onde atua. As conversas abertas que ele atendia passam para a equipe.
            Entradas e configuração ficam guardadas; ativar de novo o traz de volta aos mesmos lugares.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setPauseModal(false)}>Cancelar</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void pause()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Pause size={14} />}Pausar
            </button>
          </div>
        </Modal>
      )}

      {versionsOpen && (
        <AgentVersionsPanel agentId={agent.id} onClose={() => setVersionsOpen(false)} onRestored={load} />
      )}

      {testing && (
        <AgentTestPanel
          agentId={agent.id}
          draft={dirty ? (hubToAgentPatch(agent, hub) as unknown as Record<string, unknown>) : null}
          onClose={() => setTesting(false)}
        />
      )}

      {entriesModal && (
        <EntriesModal agentId={agent.id} organizationId={organizationId} entries={entries}
          onClose={() => setEntriesModal(false)} onChanged={load} />
      )}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 50 }}
      onClick={onClose}>
      <Card style={{ padding: 20, width: 'min(520px, calc(100vw - 32px))' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>{title}</div>
        {children}
      </Card>
    </div>
  )
}

// Onde o agente atua: liga/desliga números de WhatsApp da org. Toques de
// fluxo são derivados dos nós (passo 17), não editados aqui.
function EntriesModal({ agentId, organizationId, entries, onClose, onChanged }: {
  agentId: string; organizationId: string; entries: AgentEntry[]; onClose: () => void; onChanged: () => Promise<void>
}) {
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // /api/whatsapp/business-accounts devolve { accounts } da org do usuário.
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

  const link = async (accountId: string) => {
    setBusy(accountId)
    setError(null)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/entries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'whatsapp_account', ref_id: accountId }),
      })
      const body = await res.json().catch(() => null)
      if (res.status === 409) throw new Error(`${body?.error}. Desligue-o lá primeiro.`)
      if (!res.ok) throw new Error(body?.error || 'Não foi possível ligar')
      await onChanged()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const unlink = async (entryId: string) => {
    setBusy(entryId)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/entries?entry_id=${entryId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Não foi possível desligar')
      await onChanged()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal title="Onde este agente atua" onClose={onClose}>
      <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
        Um número tem um agente por vez. Toques de fluxo aparecem aqui quando um nó de IA aponta para uma missão deste agente.
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {accounts.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Nenhuma conta WhatsApp conectada.</p>}
        {accounts.map((a) => {
          const entry = entries.find((e) => e.kind === 'whatsapp_account' && e.ref_id === a.id)
          return (
            <div key={a.id} className={`act-row${entry ? ' on' : ''}`}>
              <MessageCircle size={16} style={{ color: entry ? 'var(--green)' : 'var(--text-3)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="act-t">{a.label}</div>
                <div className="act-d">{entry ? 'Este agente atende' : 'Não ligado a este agente'}</div>
              </div>
              {entry ? (
                <button type="button" className="btn btn-soft btn-sm" disabled={busy === entry.id} onClick={() => void unlink(entry.id)}>Desligar</button>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy === a.id} onClick={() => void link(a.id)}><Plus size={14} />Ligar</button>
              )}
            </div>
          )
        })}
        {entries.filter((e) => e.kind === 'flow_touch').map((e) => (
          <div key={e.id} className="act-row on">
            <Workflow size={16} style={{ color: 'var(--green)' }} />
            <div style={{ flex: 1 }}><div className="act-t">{e.label}</div><div className="act-d">Toque de fluxo</div></div>
          </div>
        ))}
      </div>
      {error && <p style={{ fontSize: 12, color: 'var(--red)', margin: '10px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button type="button" className="btn btn-soft btn-sm" onClick={onClose}>Fechar</button>
      </div>
    </Modal>
  )
}
