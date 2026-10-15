'use client'

// Painéis do Construtor portados do protótipo: Testar (Playground),
// Histórico (Versions) e o checklist "Antes de ativar" (Checklist).
// Ligados às rotas reais: simulate, scenarios, versions, readiness, evals.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { brl } from '@/lib/ai/brl'
import { TOOL_CATALOG } from '@/lib/ai/tools/catalog'
import type { Readiness } from '@/lib/ai/agent-readiness'
import { Icon } from '../proto/ui'

// ---------------------------------------------------------------------------
// Testar
// ---------------------------------------------------------------------------

export const PROFILES: Array<[string, string, number | null]> = [
  ['novo', 'Cliente novo, sem pedidos', null],
  ['recorrente', 'Recorrente, já comprou antes', null],
  ['carrinho', 'Carrinho aberto de R$ 289,90', 289.9],
]
const SUGGESTIONS = ['Quanto fica o frete?', 'Consegue 15% de desconto?', 'Posso trocar se não servir?', 'Esse sérum cura queda de cabelo?']
const toolLabel = new Map(TOOL_CATALOG.map((t) => [t.name, t.label]))

export interface MissionOption { id: string; event_type: string; display_name?: string | null; status: string; concession?: any }

export function missionLabel(m: MissionOption): string {
  if (m.event_type === 'whatsapp.received') return 'Atendimento direto (cliente chamou)'
  const c = m.concession
  const inc = c && c.kind && c.kind !== 'none' ? ` · cupom até ${c.max ?? c.max_percent ?? '?'}%` : ''
  return `${m.display_name || m.event_type}${inc}`
}

interface Msg { me?: boolean; t: string | null; trace?: any; q?: string }

export function Playground({ agentId, agentName, missions, draft, usdBrl, onClose, onRun }: {
  agentId: string
  agentName: string
  missions: MissionOption[]
  draft: Record<string, unknown> | null
  usdBrl: number
  onClose: () => void
  onRun: (trace: any, missionFlow: boolean) => void
}) {
  const [ch, setCh] = useState<'wa' | 'em'>('wa')
  const [prof, setProf] = useState('novo')
  const active = missions.filter((m) => m.status === 'active')
  const [mis, setMis] = useState(active[0]?.id ?? '')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [typing, setTyping] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const [saved, setSaved] = useState<Record<number, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }, [msgs, typing])
  useEffect(() => { if (!mis && active[0]) setMis(active[0].id) }, [active, mis])

  const reset = () => { setMsgs([]); setOpen(null); setSaved({}); setError(null) }
  const send = async (text: string) => {
    if (!text.trim() || typing) return
    const history = msgs.map((m) => ({ author: m.me ? 'contact' : 'agent', text: m.t ?? '' }))
    setMsgs((m) => [...m, { me: true, t: text }])
    setQ(''); setTyping(true); setError(null)
    const profile = PROFILES.find(([k]) => k === prof)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/simulate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text, history, agent_draft: draft, channel: ch === 'wa' ? 'whatsapp' : 'email',
          mission_version_id: mis || null,
          contact_profile: { kind: prof, cart_value: profile?.[2] ?? null },
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'O teste falhou')
      const mission = active.find((m) => m.id === mis)
      onRun(body, Boolean(mission && mission.event_type !== 'whatsapp.received'))
      setMsgs((m) => { const nm = [...m, { t: body.blocked ? null : body.reply ?? body.last_draft ?? '', trace: body, q: text }]; setOpen(nm.length - 1); return nm })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setTyping(false)
    }
  }
  const saveScenario = async (i: number) => {
    const turns = msgs.slice(0, i).filter((m) => m.me).map((m) => m.t as string)
    const res = await fetch(`/api/ai/agents/${agentId}/scenarios`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: (turns[0] || 'Cenário').slice(0, 60), user_turns: turns, persona: prof }),
    })
    if (res.ok) setSaved((s) => ({ ...s, [i]: true }))
  }
  const cost = (m: Msg) => Number(m.trace?.cost_usd ?? 0) * usdBrl
  const replies = msgs.filter((m) => !m.me)
  const total = replies.reduce((a, m) => a + cost(m), 0)

  return (
    <div className="pg rise">
      <div className="pn-h">
        <div><div className="ct">Testar {agentName}</div><div className="help" style={{ marginTop: 2 }}>Nada daqui chega a clientes. Usa o que está na tela, mesmo sem salvar.</div></div>
        <button type="button" className="ib" onClick={onClose} aria-label="Fechar"><Icon n="x" s={17} /></button>
      </div>
      <div className="pg-ctx">
        <div><label className="flbl">Canal</label><div className="seg2">{([['wa', 'WhatsApp'], ['em', 'E-mail']] as const).map(([k, l]) => <button type="button" key={k} className={ch === k ? 'on' : ''} onClick={() => setCh(k)}>{l}</button>)}</div></div>
        <div><label className="flbl" htmlFor="pf">Perfil do cliente</label>
          <select id="pf" className="field" value={prof} onChange={(e) => { setProf(e.target.value); reset() }}>{PROFILES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label className="flbl" htmlFor="ms">Missão</label>
          <select id="ms" className="field" value={mis} onChange={(e) => { setMis(e.target.value); reset() }}>
            {active.length === 0 && <option value="">Nenhuma missão ativa</option>}
            {active.map((m) => <option key={m.id} value={m.id}>{missionLabel(m)}</option>)}
          </select></div>
      </div>
      <div className="pg-thread" ref={box}>
        {!msgs.length && <div className="pg-empty"><b>Escreva como um cliente escreveria</b>Cada resposta mostra as fontes consultadas, as ações e quanto custou.</div>}
        {msgs.map((m, i) => m.me ? <div key={i} className="pb me">{m.t}</div> : (
          <div key={i} className="pb-wrap">
            {m.t !== null ? <div className="pb ai">{m.t}</div> : <div className="pb blk"><Icon n="alert" s={15} />A revisão reprovou a resposta. Nada seria enviado.</div>}
            <button type="button" className="pb-tr" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>{open === i ? 'Ocultar' : 'Por dentro da resposta'}<span>{brl(cost(m))}</span></button>
            {open === i && <Inside m={m} saved={Boolean(saved[i])} onSave={() => void saveScenario(i)} />}
          </div>
        ))}
        {typing && <div className="pb ai typ"><i></i><i></i><i></i></div>}
        {error && <div className="pb blk"><Icon n="alert" s={15} />{error}</div>}
      </div>
      {!msgs.length && <div className="pg-sug">{SUGGESTIONS.map((s) => <button type="button" key={s} onClick={() => void send(s)}>{s}</button>)}</div>}
      <form className="pg-in" onSubmit={(e) => { e.preventDefault(); void send(q) }}>
        <input className="field" placeholder="Mensagem do cliente" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn pri" type="submit" disabled={!q.trim() || typing} aria-label="Enviar"><Icon n="send2" s={16} /></button>
      </form>
      {msgs.length > 0 && <div className="pg-ft"><span>{replies.length} respostas · {brl(total)}</span><button type="button" className="btn ghost sm" onClick={reset}><Icon n="refresh" s={14} />Reiniciar</button></div>}
    </div>
  )
}

function Inside({ m, saved, onSave }: { m: Msg; saved: boolean; onSave: () => void }) {
  const tr = m.trace ?? {}
  const sources: string[] = Array.from(new Set<string>((tr.knowledge ?? []).map((k: any) => k.source).filter(Boolean)))
  const actions: string[] = (tr.tools ?? []).filter((t: any) => t.name !== 'search_knowledge')
    .map((t: any) => `${toolLabel.get(t.name) ?? t.name}${t.simulated ? ' (simulada)' : ''}`)
  const attempts = (tr.attempts ?? []).length
  const blocked = Boolean(tr.blocked)
  return (
    <div className="tr rise">
      <div><span>Fontes</span>{sources.length ? sources.map((s) => <em key={s} className="chip sm">{s}</em>) : <i>Nenhuma consultada</i>}</div>
      <div><span>Ações</span>{actions.length ? actions.map((a) => <p key={a} className={blocked ? 'er' : ''}>{a}</p>) : <i>Nenhuma</i>}</div>
      <div><span>Revisão</span><p className={blocked ? 'er' : 'ok'}>{blocked ? `Reprovada${tr.blocked_by ? `: ${tr.blocked_by}` : ''}` : attempts > 1 ? `Aprovada na ${attempts}ª tentativa` : 'Aprovada na primeira tentativa'}</p></div>
      <button type="button" className="btn sm" disabled={saved} onClick={onSave}>{saved ? <><Icon n="check" s={14} />Salvo em Avaliação</> : 'Salvar como cenário de avaliação'}</button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------------

interface VersionItem {
  id: string; tag: string; label: string; author: string; date: string; status: string; current: boolean
  summary: string[] | null; restored_from: string | null; eval_score: number | null; eval_grave: number | null
}

const when = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  const hm = `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === today.toDateString()) return `hoje, ${hm}`
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}, ${hm}`
}
const vnum = (tag: string) => tag.replace(/^v/i, '')

export function Versions({ agentId, agentName, onClose, onRestored, onToast }: {
  agentId: string; agentName: string; onClose: () => void; onRestored: () => Promise<void>; onToast: (m: string) => void
}) {
  const [list, setList] = useState<VersionItem[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ v: VersionItem; summary: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const res = await fetch(`/api/ai/agents/${agentId}/versions`)
    const body = await res.json().catch(() => null)
    setList(res.ok ? body?.versions ?? [] : [])
  }, [agentId])
  useEffect(() => { void load() }, [load])

  const ask = async (v: VersionItem) => {
    const res = await fetch(`/api/ai/agents/${agentId}/versions/${v.id}/restore`)
    const body = await res.json().catch(() => null)
    setConfirm({ v, summary: res.ok ? body?.summary ?? [] : [] })
  }
  const restore = async () => {
    if (!confirm) return
    setBusy(true)
    const res = await fetch(`/api/ai/agents/${agentId}/versions/${confirm.v.id}/restore`, { method: 'POST' })
    const body = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) { onToast(body?.error || 'Não foi possível restaurar'); return }
    setConfirm(null); setSel(null)
    await load()
    await onRestored()
    onToast(`Versão ${vnum(confirm.v.tag)} restaurada como versão nova`)
  }

  return (
    <div className="vs rise">
      <div className="pn-h">
        <div><div className="ct">Versões de {agentName}</div><div className="help" style={{ marginTop: 2 }}>Cada Salvar cria uma versão. Restaurar não apaga nada: vira uma versão nova.</div></div>
        <button type="button" className="ib" onClick={onClose} aria-label="Fechar"><Icon n="x" s={17} /></button>
      </div>
      <ol className="vl">
        {list.map((v) => {
          const what = v.summary?.length ? v.summary : [v.label]
          return (
            <li key={v.id} className={(v.current ? 'cur ' : '') + (sel === v.id ? 'sel' : '')}>
              <button type="button" className="vl-b" onClick={() => setSel(sel === v.id ? null : v.id)} aria-expanded={sel === v.id}>
                <div className="vl-top"><b>Versão {vnum(v.tag)}</b>{v.current && <span className="chip sm ok">Em uso</span>}
                  <span className="vl-sc" title="Nota da avaliação">{v.eval_score == null ? '' : Math.round(v.eval_score)}{v.eval_grave ? <em className="chip sm er">{v.eval_grave} Grave</em> : null}</span></div>
                <div className="vl-m">{v.author} · {when(v.date)}</div>
                <ul>{what.slice(0, sel === v.id ? 9 : 1).map((w) => <li key={w}>{w}</li>)}</ul>
                {what.length > 1 && sel !== v.id && <div className="vl-more">+{what.length - 1} alteração</div>}
              </button>
              {sel === v.id && !v.current && <div className="vl-act rise"><button type="button" className="btn sm" onClick={() => void ask(v)}><Icon n="undo" s={14} />Restaurar esta versão</button></div>}
            </li>
          )
        })}
      </ol>
      {confirm && (
        <div className="scrim" onClick={() => setConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-h"><div><h3>Restaurar a versão {vnum(confirm.v.tag)}?</h3><p>{agentName} volta a funcionar como em {when(confirm.v.date)}. A versão atual fica guardada e pode ser restaurada depois.</p></div></div>
            <div className="modal-b">
              {confirm.v.eval_grave ? <div className="warn" style={{ marginBottom: 12 }}><Icon n="alert" s={16} /><div><b>Esta versão teve {confirm.v.eval_grave} cenário Grave na avaliação</b>Recomendamos rodar a avaliação de novo depois de restaurar.</div></div> : null}
              <div className="lbl" style={{ marginBottom: 8 }}>O que muda em relação a hoje</div>
              <ul className="vl-diff">{confirm.summary.length ? confirm.summary.map((w) => <li key={w}>{w}</li>) : <li>Nada muda na configuração.</li>}</ul>
            </div>
            <div className="modal-f"><button type="button" className="btn" onClick={() => setConfirm(null)}>Cancelar</button><button type="button" className="btn pri" disabled={busy} onClick={() => void restore()}>Restaurar</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Antes de ativar
// ---------------------------------------------------------------------------

export function Checklist({ agentId, agentName, accounts, onClose, onPublish }: {
  agentId: string
  agentName: string
  accounts: Array<{ id: string; label: string; agentName: string | null; linkedHere: boolean }>
  onClose: () => void
  onPublish: (accountId: string | null) => Promise<void>
}) {
  const [ready, setReady] = useState<Readiness | null>(null)
  const [evalSt, setEval] = useState<'idle' | 'run' | 'failed'>('idle')
  const [num, setNum] = useState('none')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const res = await fetch(`/api/ai/agents/${agentId}/readiness`)
    setReady(res.ok ? await res.json() : null)
  }, [agentId])
  useEffect(() => { void load() }, [load])

  const runEval = async () => {
    setEval('run')
    const res = await fetch('/api/ai/evals/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: agentId }) })
    const body = await res.json().catch(() => null)
    if (!res.ok) { setEval('failed'); return }
    const poll = async () => {
      const r = await fetch(`/api/ai/evals/${body.run_id}`)
      const b = await r.json().catch(() => null)
      if (b?.status === 'running') { setTimeout(() => void poll(), 2500); return }
      setEval(b?.status === 'done' ? 'idle' : 'failed')
      await load()
    }
    void poll()
  }

  const items = (ready?.items ?? []).filter((i) => i.id !== 'entry')
  const entryItem = ready?.items.find((i) => i.id === 'entry')
  const req = items.every((i) => i.ok || !i.blocking)
  const nDone = items.filter((i) => i.ok).length + (num !== 'none' || entryItem?.ok ? 1 : 0)
  const free = accounts.filter((a) => !a.linkedHere)

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal ck" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ckt">
        <div className="modal-h"><div style={{ flex: 1 }}><h3 id="ckt">Antes de ativar {agentName}</h3><p>Ao ativar, {agentName} passa a responder clientes de verdade. Confira o que falta.</p></div><span className="ck-cnt">{nDone} de {items.length + 1}</span></div>
        <div className="modal-b">
          <ul className="ck-l">
            {items.map((i) => {
              const bad = !i.ok && i.blocking
              return (
                <li key={i.id} className={i.ok ? 'ok' : bad ? 'bad' : ''}>
                  <span className="ck-i">{i.ok ? <Icon n="check" s={13} sw={2.6} /> : i.id === 'eval' && evalSt === 'run' ? <Icon n="refresh" s={13} className="spin" /> : bad ? <Icon n="x" s={13} sw={2.6} /> : null}</span>
                  <div className="ck-t"><b>{i.label}</b><p>{i.id === 'eval' && evalSt === 'run' ? 'Rodando cenários de Conversação e Segurança…' : i.id === 'eval' && evalSt === 'failed' ? 'A avaliação não terminou. Tente de novo.' : i.detail}</p></div>
                  {i.id === 'eval' && !i.ok && evalSt !== 'run' && <button type="button" className="btn sm dark" onClick={() => void runEval()}>Rodar avaliação</button>}
                </li>
              )
            })}
            <li className={num !== 'none' || entryItem?.ok ? 'ok' : 'opt'}>
              <span className="ck-i">{num !== 'none' || entryItem?.ok ? <Icon n="check" s={13} sw={2.6} /> : null}</span>
              <div className="ck-t"><b>Número de WhatsApp <span className="chip sm">Opcional</span></b>
                <p>{num === 'none' ? entryItem?.detail ?? '' : `Quem chamar esse número passa a ser atendido por ${agentName}.`}</p>
                {free.length > 0 && (
                  <select className="field" style={{ marginTop: 8, maxWidth: 340 }} value={num} onChange={(e) => setNum(e.target.value)} aria-label="Número de WhatsApp">
                    <option value="none">Não ligar agora</option>
                    {free.map((a) => <option key={a.id} value={a.id}>{a.label.split(' · ').pop()} · {a.agentName ? `hoje com ${a.agentName}` : 'sem agente'}</option>)}
                  </select>
                )}
              </div>
            </li>
          </ul>
        </div>
        <div className="modal-f">
          <span className="l">{req ? 'Tudo certo para ativar.' : 'Resolva os itens obrigatórios para ativar.'}</span>
          <button type="button" className="btn" onClick={onClose}>Agora não</button>
          <button type="button" className="btn pri" disabled={!req || busy} onClick={async () => { setBusy(true); await onPublish(num === 'none' ? null : num); setBusy(false) }}>Ativar {agentName}</button>
        </div>
      </div>
    </div>
  )
}
