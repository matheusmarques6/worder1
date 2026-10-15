'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, EyeOff, FilePlus2, Loader2, ShieldAlert, Users } from 'lucide-react'

/**
 * Lacunas (plano IA M3 passos 22–23): perguntas que os agentes não
 * conseguiram responder com as fontes. Lista com filtro por agente; o
 * detalhe mostra como os clientes perguntaram, a resposta sugerida (editável)
 * e as ações — ignorar 30 dias, criar fonte, adicionar a uma fonte, ou (tema
 * sensível) adicionar aos limites.
 */

interface Gap {
  id: string; question: string; count: number; outcome: string; status: string
  agent_ids: string[] | null; examples: Array<{ text: string; conversation_id?: string | null; human_reply?: string | null }>
  suggested_answer: string | null; safe: boolean; last_seen: string
}
interface Agent { id: string; name: string | null }

const OUTCOME_LABEL: Record<string, string> = {
  transferred: 'Transferiu para a equipe',
  answered_without_source: 'Respondeu sem fonte',
  blocked: 'Revisão bloqueou',
  no_source: 'Não soube responder',
}

export default function GapsPanel({ agents, notes, onOpenNote, onChanged }: {
  agents: Agent[]
  notes: Array<{ id: string; name: string; read_only?: boolean | null }>
  onOpenNote: (id: string) => void
  onChanged: () => Promise<void>
}) {
  const [gaps, setGaps] = useState<Gap[]>([])
  const [agentFilter, setAgentFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ai/knowledge/gaps${agentFilter ? `?agent_id=${agentFilter}` : ''}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha ao carregar as lacunas')
      setGaps(body.gaps ?? [])
      setError(null)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }, [agentFilter])
  useEffect(() => { void load() }, [load])

  const gap = gaps.find((g) => g.id === selected) ?? null
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name || 'agente'

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <div style={{ width: 360, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface)' }}>
        <div style={{ padding: 12, display: 'grid', gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={15} />Lacunas</div>
          <select className="field" style={{ height: 32, fontSize: 12.5 }} value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
            <option value="">Todos os agentes</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name || 'Agente'}</option>)}
          </select>
        </div>
        {loading ? <div style={{ padding: 12 }}><Loader2 size={16} className="animate-spin" /></div>
          : error ? <p style={{ padding: 12, color: 'var(--red)', fontSize: 12.5 }}>{error}</p>
          : gaps.length === 0 ? <p style={{ padding: 12, fontSize: 12.5, color: 'var(--text-3)' }}>Nenhuma lacuna aberta. Os agentes estão encontrando resposta nas fontes.</p>
          : gaps.map((g) => (
            <button key={g.id} type="button" onClick={() => setSelected(g.id)}
              style={{ width: '100%', textAlign: 'left', border: 0, borderTop: '1px solid var(--border)', padding: '10px 12px', cursor: 'pointer', background: selected === g.id ? 'var(--brand-soft, #FFF3EA)' : 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{g.question}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                {g.count} conversa(s) · {OUTCOME_LABEL[g.outcome] ?? g.outcome}{!g.safe ? ' · tema sensível' : ''}
              </div>
            </button>
          ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
        {gap ? (
          <GapDetail key={gap.id} gap={gap} notes={notes} agentName={agentName} onOpenNote={onOpenNote}
            onResolved={async () => { setSelected(null); await load(); await onChanged() }} />
        ) : (
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Escolha uma lacuna para ver como os clientes perguntaram e resolver.</p>
        )}
      </div>
    </div>
  )
}

function GapDetail({ gap, notes, agentName, onOpenNote, onResolved }: {
  gap: Gap; notes: Array<{ id: string; name: string; read_only?: boolean | null }>
  agentName: (id: string) => string; onOpenNote: (id: string) => void; onResolved: () => Promise<void>
}) {
  const [answer, setAnswer] = useState(gap.suggested_answer ?? '')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const editable = notes.filter((n) => !n.read_only)

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action); setError(null)
    try {
      const res = await fetch(`/api/ai/knowledge/gaps/${gap.id}/resolve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Não foi possível resolver')
      if (body?.source?.id) onOpenNote(body.source.id)
      await onResolved()
    } catch (e: any) { setError(e.message) } finally { setBusy(null) }
  }

  const humanReplies = gap.examples.map((e) => e.human_reply).filter(Boolean) as string[]

  return (
    <div style={{ maxWidth: 720, display: 'grid', gap: 18 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{gap.question}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>{gap.count} conversa(s)</span>
          <span>{OUTCOME_LABEL[gap.outcome] ?? gap.outcome}</span>
          <span><Users size={12} style={{ display: 'inline' }} /> {(gap.agent_ids ?? []).map(agentName).join(', ') || '—'}</span>
          <span>última em {new Date(gap.last_seen).toLocaleDateString('pt-BR')}</span>
        </div>
      </div>

      <Section title="Como os clientes perguntaram">
        {gap.examples.length === 0 ? <Muted>Sem exemplos.</Muted> : gap.examples.map((e, i) => (
          <div key={i} style={{ fontSize: 13, padding: '6px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>“{e.text}”</div>
        ))}
      </Section>

      <Section title="O que a equipe respondeu">
        {humanReplies.length === 0 ? <Muted>Nenhuma resposta humana registrada nessas conversas (a rotina diária procura).</Muted>
          : humanReplies.map((r, i) => <div key={i} style={{ fontSize: 13 }}>— {r}</div>)}
      </Section>

      <Section title="Resposta sugerida">
        <textarea className="field" rows={4} style={{ height: 'auto', fontSize: 13, paddingTop: 8 }} value={answer}
          placeholder="Escreva a resposta que o agente deve dar…" onChange={(e) => setAnswer(e.target.value)} />
        {!gap.suggested_answer && <Muted>A rotina diária sugere uma resposta a partir dos exemplos e da equipe.</Muted>}
      </Section>

      {!gap.safe && (
        <div className="callout red"><ShieldAlert size={14} />Tema sensível: em vez de ensinar o agente, considere adicionar aos limites (ele passa a transferir).</div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-primary btn-sm" disabled={!!busy || !answer.trim()} onClick={() => void act('create_source', { answer })}>
          {busy === 'create_source' ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />}Criar fonte
        </button>
        <select className="field" style={{ height: 32, fontSize: 12.5, width: 200 }} value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Adicionar à nota…</option>
          {editable.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <button type="button" className="btn btn-soft btn-sm" disabled={!!busy || !answer.trim() || !target} onClick={() => void act('append_to', { source_id: target, answer })}>
          <Check size={14} />Adicionar
        </button>
        <button type="button" className="btn btn-soft btn-sm" disabled={!!busy} onClick={() => void act('add_limit')}>
          <ShieldAlert size={14} />Adicionar aos limites
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void act('ignore')}>
          <EyeOff size={14} />Ignorar 30 dias
        </button>
      </div>
      {error && <p style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-3)' }}>{title}</div>
      {children}
    </div>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, color: 'var(--text-3)', margin: 0 }}>{children}</p>
}
