'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, History, Loader2, RotateCcw, X } from 'lucide-react'

/**
 * Versões (plano IA M4 passo 25): cada salvamento vira uma versão com o
 * resumo por área do que mudou, a nota da avaliação automática (passo 26),
 * os casos graves e, quando for o caso, de qual versão foi restaurada.
 * Restaurar abre "o que muda em relação a hoje" e cria uma versão NOVA.
 */

interface VersionItem {
  id: string; tag: string; label: string; author: string; date: string
  status: string; current: boolean; summary: string[] | null
  restored_from: string | null; eval_score: number | null; eval_grave: number | null
}

export default function AgentVersionsPanel({ agentId, onClose, onRestored }: {
  agentId: string; onClose: () => void; onRestored: () => Promise<void>
}) {
  const [versions, setVersions] = useState<VersionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<{ version: VersionItem; summary: string[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/versions`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha ao carregar as versões')
      setVersions(body.versions ?? [])
      setError(null)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [agentId])
  useEffect(() => { void load() }, [load])

  const askRestore = async (version: VersionItem) => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/versions/${version.id}/restore`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha ao comparar')
      setConfirm({ version, summary: body.summary ?? [] })
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  const restore = async () => {
    if (!confirm) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/versions/${confirm.version.id}/restore`, { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Falha ao restaurar')
      setConfirm(null)
      await load()
      await onRestored()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  const tagOf = (id: string | null) => versions.find((v) => v.id === id)?.tag

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 100vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 24px rgba(15,23,42,.08)', zIndex: 40, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <History size={16} /><div style={{ fontWeight: 800, fontSize: 14 }}>Versões</div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={16} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'grid', gap: 10, alignContent: 'start' }}>
        {loading ? <Loader2 size={16} className="animate-spin" />
          : versions.length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Nenhuma versão ainda. Cada vez que você salva o agente, uma versão nasce aqui.</p>
          : versions.map((v) => {
            const expanded = open.has(v.id)
            return (
              <div key={v.id} className={`act-row${v.current ? ' on' : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 12.5 }}>{v.tag}</span>
                  {v.current && <span className="chip chip-green">em uso</span>}
                  {v.eval_score !== null && <span className="chip chip-outline" title="Nota da avaliação automática">nota {Math.round(v.eval_score)}</span>}
                  {v.eval_grave ? <span className="chip chip-red"><AlertTriangle size={11} /> {v.eval_grave} grave(s)</span> : null}
                  <div style={{ flex: 1 }} />
                  {!v.current && (
                    <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => void askRestore(v)}>
                      <RotateCcw size={13} />Restaurar
                    </button>
                  )}
                </div>
                <div className="act-t" style={{ fontSize: 12.5 }}>{v.label}</div>
                <div className="act-d">
                  {v.author} · {new Date(v.date).toLocaleString('pt-BR')}
                  {v.restored_from ? ` · restaurada de ${tagOf(v.restored_from) ?? 'versão anterior'}` : ''}
                </div>
                {v.summary && v.summary.length > 0 && (
                  <>
                    <button type="button" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(v.id)) n.delete(v.id); else n.add(v.id); return n })}
                      style={{ background: 'none', border: 0, padding: 0, fontSize: 11.5, color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{v.summary.length} mudança(s)
                    </button>
                    {expanded && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, display: 'grid', gap: 2 }}>{v.summary.map((line, i) => <li key={i}>{line}</li>)}</ul>}
                  </>
                )}
              </div>
            )
          })}
        {error && <p style={{ fontSize: 12, color: 'var(--red)' }}>{error}</p>}
      </div>

      {confirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 60 }} onClick={() => setConfirm(null)}>
          <div className="card" style={{ padding: 20, width: 'min(480px, calc(100vw - 32px))', display: 'grid', gap: 10 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Restaurar {confirm.version.tag}?</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>O que muda em relação a hoje:</p>
            {confirm.summary.length === 0
              ? <p style={{ fontSize: 12.5, margin: 0 }}>Nenhuma diferença de configuração.</p>
              : <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, display: 'grid', gap: 3 }}>{confirm.summary.map((l, i) => <li key={i}>{l}</li>)}</ul>}
            <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: 0 }}>Uma versão nova é criada com este conteúdo; a atual fica no histórico.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-soft btn-sm" onClick={() => setConfirm(null)}>Cancelar</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void restore()}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}Restaurar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
