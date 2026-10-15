'use client'

import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, FlaskConical, Loader2, RotateCcw, Save, Send, ShieldCheck, Wrench, X } from 'lucide-react'

/**
 * Testar (plano IA M4 passo 24): conversa de mentira com o agente, rodando
 * o turno real em sandbox (POST /api/ai/agents/[id]/simulate). Canal,
 * perfil do contato e missão escolhidos aqui; o rascunho NÃO salvo do
 * editor vai junto, então dá para testar antes de salvar. Cada resposta
 * abre "Por dentro da resposta": fontes, ferramentas (as de escrita só
 * simuladas), tentativas do juiz e custo.
 */

interface Turn { author: 'contact' | 'agent'; text: string; trace?: any; blocked?: boolean }
interface MissionOption { id: string; event_type: string; display_name?: string | null; status: string }

const SUGGESTIONS = [
  'Oi, vocês entregam em todo o Brasil?',
  'Quanto tempo leva pra chegar?',
  'Quero trocar um produto',
  'Tem desconto pra pagar no pix?',
  'Quero falar com uma pessoa',
]

const PROFILES = [
  { v: 'novo', t: 'Novo' },
  { v: 'recorrente', t: 'Recorrente' },
  { v: 'carrinho', t: 'Carrinho aberto' },
] as const

export default function AgentTestPanel({ agentId, draft, onClose }: {
  agentId: string
  draft: Record<string, unknown> | null
  onClose: () => void
}) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [profile, setProfile] = useState<'novo' | 'recorrente' | 'carrinho'>('novo')
  const [cartValue, setCartValue] = useState('250')
  const [missions, setMissions] = useState<MissionOption[]>([])
  const [missionId, setMissionId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/ai/missions?agent_id=${agentId}`)
      .then((r) => (r.ok ? r.json() : { missions: [] }))
      .then((d) => setMissions((d.missions ?? []).filter((m: MissionOption) => m.status !== 'archived')))
      .catch(() => {})
  }, [agentId])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [turns])

  const totalCost = turns.reduce((sum, t) => sum + (t.trace?.cost_usd ?? 0), 0)

  const send = async (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    setBusy(true); setError(null); setInput('')
    const history = turns.map((t) => ({ author: t.author, text: t.text }))
    setTurns((prev) => [...prev, { author: 'contact', text: message }])
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/simulate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message, history, agent_draft: draft,
          mission_version_id: missionId || null,
          contact_profile: { kind: profile, cart_value: profile === 'carrinho' ? Number(cartValue) || null : null },
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'A simulação falhou')
      setTurns((prev) => [...prev, {
        author: 'agent',
        text: body.reply ?? body.last_draft ?? '(nenhuma resposta)',
        blocked: Boolean(body.blocked),
        trace: body,
      }])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const saveScenario = async () => {
    const userTurns = turns.filter((t) => t.author === 'contact').map((t) => t.text)
    if (userTurns.length === 0) return
    const title = prompt('Nome do cenário', userTurns[0].slice(0, 60))
    if (!title) return
    const res = await fetch(`/api/ai/agents/${agentId}/scenarios`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, user_turns: userTurns, persona: profile }),
    })
    const body = await res.json().catch(() => null)
    setSaved(res.ok ? `Cenário "${body.scenario.title}" salvo` : body?.error || 'Não foi possível salvar')
    setTimeout(() => setSaved(null), 3000)
  }

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(460px, 100vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 24px rgba(15,23,42,.08)', zIndex: 40, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
        <FlaskConical size={16} />
        <div style={{ fontWeight: 800, fontSize: 14 }}>Testar</div>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{draft ? 'com as alterações não salvas' : 'versão salva'}</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Recomeçar" onClick={() => setTurns([])}><RotateCcw size={14} /></button>
        <button type="button" className="btn btn-ghost btn-icon btn-sm" title="Fechar" onClick={onClose}><X size={16} /></button>
      </div>

      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'grid', gap: 8, fontSize: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 62, color: 'var(--text-3)' }}>Canal</span>
          <div className="seg-ctl">
            <button type="button" className="on">WhatsApp</button>
            <button type="button" disabled title="Em breve">E-mail</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 62, color: 'var(--text-3)' }}>Contato</span>
          <div className="seg-ctl">
            {PROFILES.map((p) => <button key={p.v} type="button" className={profile === p.v ? 'on' : ''} onClick={() => setProfile(p.v)}>{p.t}</button>)}
          </div>
          {profile === 'carrinho' && (
            <input className="field" style={{ height: 28, width: 80, fontSize: 12 }} value={cartValue} onChange={(e) => setCartValue(e.target.value)} aria-label="Valor do carrinho" />
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ width: 62, color: 'var(--text-3)' }}>Missão</span>
          <select className="field" style={{ height: 30, fontSize: 12, flex: 1 }} value={missionId} onChange={(e) => setMissionId(e.target.value)}>
            <option value="">A ativa do WhatsApp direto</option>
            {missions.map((m) => <option key={m.id} value={m.id}>{m.display_name || m.event_type}{m.status === 'draft' ? ' (rascunho)' : ''}</option>)}
          </select>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {turns.length === 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SUGGESTIONS.map((s) => <button key={s} type="button" className="pickchip" onClick={() => void send(s)}>{s}</button>)}
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} style={{ alignSelf: turn.author === 'contact' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
            <div style={{
              padding: '8px 11px', borderRadius: 12, fontSize: 13, whiteSpace: 'pre-wrap',
              background: turn.author === 'contact' ? 'var(--brand-soft, #FFF3EA)' : turn.blocked ? '#FDECEC' : 'var(--bg)',
              border: '1px solid var(--border)',
            }}>
              {turn.blocked && <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700, marginBottom: 4 }}>Bloqueada pela revisão — não seria enviada</div>}
              {turn.text}
            </div>
            {turn.trace && <InsideTheReply trace={turn.trace} />}
          </div>
        ))}
        {busy && <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-3)' }}><Loader2 size={14} className="animate-spin" />Gerando e revisando…</div>}
        {error && <p style={{ fontSize: 12, color: 'var(--red)' }}>{error}</p>}
        <div ref={bottom} />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: 10, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="field" style={{ flex: 1, height: 36, fontSize: 13 }} placeholder="Escreva como o cliente…"
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input) } }} />
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !input.trim()} onClick={() => void send(input)}><Send size={14} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-3)' }}>
          <span>Total desta conversa: US$ {totalCost.toFixed(4)}</span>
          <div style={{ flex: 1 }} />
          {saved && <span style={{ color: 'var(--green)' }}>{saved}</span>}
          <button type="button" className="btn btn-ghost btn-sm" disabled={!turns.some((t) => t.author === 'contact')} onClick={() => void saveScenario()}>
            <Save size={13} />Salvar como cenário
          </button>
        </div>
      </div>
    </div>
  )
}

function InsideTheReply({ trace }: { trace: any }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 4 }}>
      <button type="button" onClick={() => setOpen(!open)}
        style={{ background: 'none', border: 0, padding: 0, fontSize: 11.5, color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}Por dentro da resposta
      </button>
      {open && (
        <div style={{ marginTop: 6, padding: 10, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface)', display: 'grid', gap: 10, fontSize: 12 }}>
          {trace.mission && <Row label="Missão">{trace.mission.event_type} — {trace.mission.objective}</Row>}
          <Row label={<><BookOpen size={12} /> Fontes</>}>
            {trace.knowledge?.length ? trace.knowledge.map((k: any, i: number) => (
              <div key={i}>{k.source} · {Math.round(k.similarity * 100)}%<div style={{ color: 'var(--text-3)' }}>{String(k.content).slice(0, 140)}</div></div>
            )) : <span style={{ color: 'var(--text-3)' }}>nenhuma acima do limiar</span>}
            {trace.rules?.length ? <div style={{ color: 'var(--text-3)' }}>{trace.rules.length} regra(s) da loja no prompt</div> : null}
          </Row>
          <Row label={<><Wrench size={12} /> Ferramentas</>}>
            {trace.tools?.length ? trace.tools.map((t: any, i: number) => (
              <div key={i}>{t.name}{t.simulated ? ' (simulada — não executou)' : ''}<div style={{ color: 'var(--text-3)' }}>{JSON.stringify(t.arguments)}</div></div>
            )) : <span style={{ color: 'var(--text-3)' }}>nenhuma</span>}
          </Row>
          <Row label={<><ShieldCheck size={12} /> Revisão</>}>
            {trace.attempts?.length ? trace.attempts.map((a: any) => (
              <div key={a.attempt}>Tentativa {a.attempt + 1}: {a.outcome} ({Math.round(a.score * 100)}%){a.failed?.length ? ` — falhou: ${a.failed.join(', ')}` : ''}</div>
            )) : <span style={{ color: 'var(--text-3)' }}>sem nota</span>}
            {trace.blocked_by && <div style={{ color: 'var(--red)' }}>Bloqueada por: {trace.blocked_by}</div>}
          </Row>
          <Row label="Custo">US$ {Number(trace.cost_usd ?? 0).toFixed(4)}{trace.cost_unknown ? ' + chamadas sem preço' : ''} · {trace.calls} chamada(s) · {trace.model}</Row>
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-3)', display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'grid', gap: 4 }}>{children}</div>
    </div>
  )
}
