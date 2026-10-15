'use client'

// A nota do Conhecimento no formato do protótipo: Props (propriedades),
// NoteView (título, leitura ou edição), RightSide (Detalhes, Links, Testar)
// e TestTab (pergunta de cliente respondida pelas notas de um agente).

import { useEffect, useRef, useState, type RefObject } from 'react'
import { Icon } from '../proto/ui'
import MdView from './MdView'
import { KT, headings, kindOf, noteState, outLinks, shortDate, type KbFolder, type KbNote } from './kb-model'
import type { KbAgent } from './KbPanels'

export interface NoteBody { body: string; backlinks: Array<{ id: string; name: string; before?: string; after?: string }> }

function Pill({ st }: { st: ReturnType<typeof noteState> }) {
  if (st === 'ok') return <span className="w-pill live"><i />Pronta</span>
  if (st === 'sync') return <span className="w-pill sync"><i />Sincronizando</span>
  if (st === 'proc') return <span className="w-pill sync"><i />Processando</span>
  return <span className="w-pill" style={{ background: '#FDEEEE', color: '#D23B3B' }}><i style={{ background: '#D23B3B' }} />Erro</span>
}

export function Props({ n, folder, folders, agents, setReaders, patch }: {
  n: KbNote; folder: KbFolder | undefined; folders: KbFolder[]; agents: KbAgent[]
  setReaders: (ids: string[]) => void; patch: (p: Record<string, unknown>) => void
}) {
  const [open, setOpen] = useState(true)
  const [add, setAdd] = useState(false)
  const [tag, setTag] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name || 'Agente'
  const tags = n.tags ?? []
  const ro = Boolean(n.read_only)
  const st = noteState(n)
  return (
    <div className="kp">
      <button type="button" className="kp-h" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon n="chevR" s={12} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s' }} />Propriedades
      </button>
      {open && (
        <div className="kp-b">
          <div className="kp-r"><span><Icon n="bot" s={14} />Lida por</span>
            <div className="kp-v">
              {n.readers.map((a) => (
                <span key={a} className="kp-ag">{agentName(a)}
                  <button type="button" aria-label={`Tirar ${agentName(a)}`} onClick={() => setReaders(n.readers.filter((x) => x !== a))}><Icon n="x" s={10} /></button>
                </span>
              ))}
              {agents.some((a) => !n.readers.includes(a.id)) && (
                <span className="kp-add-w">
                  <button type="button" className="kp-add" onClick={() => setAdd((o) => !o)}><Icon n="plus" s={11} />Agente</button>
                  {add && (
                    <div className="kp-menu">
                      {agents.filter((a) => !n.readers.includes(a.id)).map((a) => (
                        <button key={a.id} type="button" onClick={() => { setReaders([...n.readers, a.id]); setAdd(false) }}>{a.name}<span>{a.role || 'Agente'}</span></button>
                      ))}
                    </div>
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="kp-r"><span><Icon n={kindOf(n.kind).icon} s={14} />Tipo</span><div className="kp-v">{kindOf(n.kind).label}</div></div>
          <div className="kp-r"><span><Icon n="checkC" s={14} />Situação</span>
            <div className="kp-v"><Pill st={st} />
              {st === 'ok' && <span className="kp-sub">pronta para consulta</span>}
              {st === 'err' && n.error_message && <span className="kp-sub">{n.error_message}</span>}
            </div>
          </div>
          <div className="kp-r"><span><Icon n="tag" s={14} />Tags</span>
            <div className="kp-v">
              {tags.map((t) => <span key={t} className="kp-tag">#{t}</span>)}
              {!ro && (tag === null
                ? <button type="button" className="kp-add" onClick={() => setTag('')}><Icon n="plus" s={11} />Tag</button>
                : <input autoFocus className="kp-add" style={{ width: 110, outline: 'none' }} value={tag} placeholder="nova tag"
                    onChange={(e) => setTag(e.target.value)} onBlur={() => setTag(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setTag(null)
                      if (e.key === 'Enter') {
                        const t = (tag ?? '').trim().replace(/^#/, '')
                        if (t && !tags.includes(t)) patch({ tags: [...tags, t] })
                        setTag(null)
                      }
                    }} />)}
            </div>
          </div>
          <div className="kp-r"><span><Icon n="clock" s={14} />Atualizada</span><div className="kp-v">{shortDate(n.updated_at)}{ro ? ' · sincronização automática' : ''}</div></div>
          <div className="kp-r"><span><span className="kx-fi" style={{ background: KT[folder?.tone ?? 'slate'][1], margin: '0 3px' }} />Pasta</span>
            <div className="kp-v">
              {moving === null
                ? <button type="button" onClick={() => setMoving(n.folder)} title="Mudar de pasta" style={{ font: 'inherit' }}>{folder?.label ?? n.folder}</button>
                : <>
                  <input autoFocus list="kb-folders" className="kp-add" style={{ width: 160, outline: 'none' }} value={moving}
                    onChange={(e) => setMoving(e.target.value)} onBlur={() => setMoving(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setMoving(null)
                      if (e.key === 'Enter') { const f = (moving ?? '').trim(); if (f && f !== n.folder) patch({ folder: f }); setMoving(null) }
                    }} />
                  <datalist id="kb-folders">{folders.filter((f) => !f.sync).map((f) => <option key={f.id} value={f.id} />)}</datalist>
                </>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function NoteView({ n, body, exists, mode, setMode, setBody, rename, onLink, hi, scroller, props }: {
  n: KbNote; body: string; exists: (t: string) => boolean; mode: 'read' | 'edit'; setMode: (m: 'read' | 'edit') => void
  setBody: (b: string) => void; rename: (t: string) => void; onLink: (t: string) => void
  hi: number | null; scroller: RefObject<HTMLDivElement>; props: React.ReactNode
}) {
  const [title, setTitle] = useState(n.name)
  useEffect(() => setTitle(n.name), [n.id, n.name])
  const ta = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` } }, [mode, body])
  useEffect(() => {
    if (hi == null || !scroller.current) return
    const t = setTimeout(() => {
      const el = scroller.current?.querySelector(`[data-bi="${hi}"]`) as HTMLElement | null
      if (el && scroller.current) scroller.current.scrollTo({ top: el.offsetTop - 120, behavior: 'smooth' })
    }, 60)
    return () => clearTimeout(t)
  }, [hi, n.id, scroller])
  const ro = Boolean(n.read_only)
  return (
    <div className="kn">
      {ro && <div className="kn-ro"><Icon n="refresh" s={14} />Sincronizada automaticamente. Para mudar, edite na origem; esta nota se atualiza sozinha.</div>}
      <input className="kn-title" value={title} readOnly={ro} onChange={(e) => setTitle(e.target.value)}
        onBlur={() => { if (title.trim() && title.trim() !== n.name) rename(title.trim()); else setTitle(n.name) }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label="Título da nota" />
      {props}
      {mode === 'edit' && !ro
        ? <>
          <textarea ref={ta} className="kn-src" value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} autoFocus />
          <div className="kn-hint"><span className="kbd">[[</span>liga notas<span className="kbd">**</span>negrito<span className="kbd">&gt; [!regra]</span>regra<span className="kbd">&gt; [!resposta]</span>resposta pronta</div>
        </>
        : <div onDoubleClick={() => !ro && setMode('edit')}><MdView markdown={body} onLink={onLink} exists={exists} hi={hi} /></div>}
    </div>
  )
}

interface Usage { series: number[]; total: number; questions: Array<{ question: string | null; agent_name: string | null; at: string; transferred: boolean | null }> }

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function Spark({ v }: { v: number[] }) {
  const m = Math.max(1, ...v)
  return <div className="kspark">{v.map((x, i) => <i key={i} style={{ height: Math.max(2, (x / m) * 28) }} title={`${x} usos`} />)}</div>
}

function when(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const hm = `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === now.toDateString()) return `hoje, ${hm}`
  if (d.toDateString() === new Date(now.getTime() - 86_400_000).toDateString()) return 'ontem'
  return shortDate(iso)
}

export function RightSide({ note, body, notes, backlinks, agents, tab, setTab, onOpen, onCreateTitled, onToggleAg, onJump, test, open, onClose }: {
  note: KbNote; body: string; notes: KbNote[]; backlinks: NoteBody['backlinks']; agents: KbAgent[]
  tab: 'info' | 'links' | 'test'; setTab: (t: 'info' | 'links' | 'test') => void
  onOpen: (id: string) => void; onCreateTitled: (t: string) => void; onToggleAg: (id: string) => void; onJump: (i: number) => void
  test: React.ReactNode; open: boolean; onClose: () => void
}) {
  const [usage, setUsage] = useState<Usage | null>(null)
  useEffect(() => {
    setUsage(null)
    fetch(`/api/ai/knowledge/${note.id}/usage`).then((r) => (r.ok ? r.json() : null)).then(setUsage).catch(() => {})
  }, [note.id])
  const out = outLinks(body)
  const heads = headings(body)
  const byTitle = (t: string) => notes.find((x) => x.name.trim().toLowerCase() === t.trim().toLowerCase())
  const first = new Date(Date.now() - 6 * 86_400_000)
  const tabs: Array<['info' | 'links' | 'test', string, string]> = [['info', 'Detalhes', 'sliders'], ['links', 'Links', 'link'], ['test', 'Testar', 'play']]
  return (
    <aside className={'kr' + (open ? ' open' : '')}>
      <div className="kr-tabs">
        {tabs.map(([k, l, ic]) => (
          <button key={k} type="button" className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            <Icon n={ic} s={14} />{l}{k === 'links' && backlinks.length > 0 && <span>{backlinks.length}</span>}
          </button>
        ))}
        <button type="button" className="kr-x" onClick={onClose} aria-label="Fechar detalhes"><Icon n="x" s={15} /></button>
      </div>
      <div className="kr-b">
        {tab === 'info' && <>
          <div className="kr-sec">
            <div className="kr-h">Quem lê esta nota</div>
            {agents.map((a) => {
              const on = note.readers.includes(a.id)
              return (
                <div key={a.id} className="kr-ag">
                  <span className="kr-av">{(a.name || '?')[0]}</span>
                  <div><b>{a.name}</b><span>{a.role || 'Agente'}</span></div>
                  <button type="button" className={'w-sw' + (on ? ' on' : '')} role="switch" aria-checked={on} aria-label={a.name} onClick={() => onToggleAg(a.id)} />
                </div>
              )
            })}
            {!note.readers.length && <div className="kr-warn"><Icon n="alert" s={13} />Nenhum agente lê esta nota. Ela não é usada em conversa.</div>}
          </div>
          <div className="kr-sec">
            <div className="kr-h">Uso nos últimos 7 dias<b>{usage ? usage.total : '—'}</b></div>
            <Spark v={usage?.series ?? [0, 0, 0, 0, 0, 0, 0]} />
            <div className="kr-days"><span>{WEEKDAY[first.getDay()]}</span><span>{WEEKDAY[new Date().getDay()]}</span></div>
          </div>
          <div className="kr-sec">
            <div className="kr-h">Perguntas que respondeu</div>
            {usage?.questions.filter((q) => q.question).length
              ? usage.questions.filter((q) => q.question).slice(0, 8).map((q, i) => (
                <div key={i} className="kr-ev">
                  <span className={'kr-evi ' + (q.transferred ? 'no' : 'ok')}><Icon n={q.transferred ? 'x' : 'check'} s={10} sw={2.6} /></span>
                  <div><b>&quot;{q.question}&quot;</b><span>{q.agent_name || 'Agente'} · {when(q.at)}{q.transferred ? ' · transferiu' : ''}</span></div>
                </div>
              ))
              : <div className="kr-empty">Ainda sem perguntas registradas.</div>}
          </div>
        </>}
        {tab === 'links' && <>
          <div className="kr-sec">
            <div className="kr-h">Links para cá<b>{backlinks.length}</b></div>
            {backlinks.length
              ? backlinks.map((b) => (
                <button key={b.id} type="button" className="kr-bl" onClick={() => onOpen(b.id)}>
                  <b>{b.name}</b>{b.before !== undefined && <span>…{b.before}<mark>{note.name}</mark>{b.after}…</span>}
                </button>
              ))
              : <div className="kr-empty">Nenhuma nota aponta para esta.</div>}
          </div>
          <div className="kr-sec">
            <div className="kr-h">Links desta nota<b>{out.length}</b></div>
            {out.map((t) => {
              const n = byTitle(t)
              return (
                <button key={t} type="button" className={'kr-ol' + (n ? '' : ' un')} onClick={() => (n ? onOpen(n.id) : onCreateTitled(t))}>
                  <Icon n={n ? 'link' : 'plus'} s={13} />{t}{!n && <em>criar</em>}
                </button>
              )
            })}
            {!out.length && <div className="kr-empty">Use [[nome da nota]] para ligar notas.</div>}
          </div>
          <div className="kr-sec">
            <div className="kr-h">Estrutura</div>
            {heads.length
              ? heads.map((h) => <button key={h.i} type="button" className={`kr-oh lv${h.level}`} onClick={() => onJump(h.i)}>{h.text}</button>)
              : <div className="kr-empty">Sem títulos.</div>}
          </div>
        </>}
        {tab === 'test' && test}
      </div>
    </aside>
  )
}

interface AskResult {
  q: string
  error?: string
  answered?: boolean
  best?: { content: string; source_id: string; source_name: string | null; chunk_kind: string } | null
}

const SUGGESTIONS = ['Quanto tempo tenho pra trocar?', 'Tem PIX parcelado?', 'Qual o prazo de entrega?', 'Vocês têm loja física?']

export function TestTab({ agents, onSee, onGap }: {
  agents: KbAgent[]; onSee: (sourceId: string, content: string) => void; onGap: (question: string, agentId: string) => void
}) {
  const [ag, setAg] = useState<string | null>(agents[0]?.id ?? null)
  const [q, setQ] = useState('')
  const [res, setRes] = useState<AskResult | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!ag && agents[0]) setAg(agents[0].id) }, [agents, ag])
  const name = agents.find((a) => a.id === ag)?.name || 'O agente'
  const ask = async (t: string) => {
    if (!t.trim() || !ag) return
    setQ(t); setBusy(true); setRes(null)
    try {
      const r = await fetch('/api/ai/knowledge/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: ag, question: t }) })
      const d = await r.json().catch(() => null)
      setRes(r.ok ? { q: t, answered: d.answered, best: d.best } : { q: t, error: d?.error || 'Não foi possível perguntar' })
    } catch {
      setRes({ q: t, error: 'Não foi possível perguntar' })
    } finally { setBusy(false) }
  }
  const rule = res?.best?.chunk_kind === 'regra'
  return (
    <div className="kt">
      <div className="kr-sec">
        <div className="kr-h">Perguntar a</div>
        <div className="w-seg">{agents.map((a) => <button key={a.id} type="button" className={ag === a.id ? 'on' : ''} onClick={() => { setAg(a.id); setRes(null) }}>{a.name}</button>)}</div>
        <form className="kt-in" onSubmit={(e) => { e.preventDefault(); void ask(q) }}>
          <input placeholder="Pergunta de um cliente" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="w-btn sm" type="submit" disabled={!q.trim() || busy || !ag}>Perguntar</button>
        </form>
        {!res && !busy && <div className="kt-sug">{SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => void ask(s)}>{s}</button>)}</div>}
      </div>
      {busy && <div className="kt-busy"><i /><i /><i />{name} está procurando nas notas</div>}
      {res && (
        <div className="kr-sec rise">
          <div className="kt-q">&quot;{res.q}&quot;</div>
          {res.error
            ? <div className="kt-miss"><Icon n="alert" s={14} /><div><b>Não deu para testar</b>{res.error}</div></div>
            : res.best && rule
              ? <>
                <div className="kt-rule"><Icon n="shield" s={14} /><div><b>{name} não responde e transfere</b>Uma regra da nota proíbe: &quot;{res.best.content}&quot;</div></div>
                <div className="kt-src"><Icon n="bookOpen" s={13} /><span>Regra em <b>{res.best.source_name}</b></span><button type="button" className="w-btn sm" onClick={() => onSee(res.best!.source_id, res.best!.content)}>Ver regra</button></div>
              </>
              : res.best
                ? <>
                  <div className="kt-a">{res.best.content}</div>
                  <div className="kt-src"><Icon n="bookOpen" s={13} /><span>Veio de <b>{res.best.source_name}</b></span><button type="button" className="w-btn sm" onClick={() => onSee(res.best!.source_id, res.best!.content)}>Ver trecho</button></div>
                  <div className="kt-note">No atendimento real, {name} reescreve com a própria voz e passa pela revisão antes de enviar.</div>
                </>
                : <>
                  <div className="kt-miss"><Icon n="alert" s={14} /><div><b>{name} não encontrou resposta</b>Nenhuma nota que {name} lê fala disso. Em conversa real, transferiria para a equipe.</div></div>
                  <button type="button" className="w-btn sm" onClick={() => { if (ag) onGap(res.q, ag); setRes(null); setQ('') }}>Adicionar às lacunas</button>
                </>}
        </div>
      )}
    </div>
  )
}
