'use client'

// Lado esquerdo do Conhecimento no formato do protótipo: Explorer (pastas
// coloridas), SearchPanel, GapsPanel e o Command (Ctrl K).

import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from '../proto/ui'
import { KT, kindOf, noteState, type KbFolder, type KbNote } from './kb-model'

export interface KbAgent { id: string; name: string; role: string | null; status: string }
export interface KbGap {
  id: string; question: string; count: number; agent_ids: string[]; safe: boolean
  suggested_answer: string | null
  suggested_source: { id: string; name: string; folder: string | null } | null
}

export function Explorer({ folders, cur, open, onNew, collapsed, setCollapsed }: {
  folders: KbFolder[]; cur: string | null; open: (id: string) => void; onNew: (folder?: string) => void
  collapsed: Record<string, boolean>; setCollapsed: (fn: (o: Record<string, boolean>) => Record<string, boolean>) => void
}) {
  return (
    <div className="kx">
      <div className="kx-h">
        <span className="kx-t">Arquivos</span>
        <div className="kx-acts">
          <button type="button" className="kx-ib" onClick={() => onNew()} title="Nova nota" aria-label="Nova nota"><Icon n="edit" s={15} /></button>
          <button type="button" className="kx-ib" title="Recolher tudo" aria-label="Recolher tudo" onClick={() => setCollapsed(() => Object.fromEntries(folders.map((f) => [f.id, true])))}><Icon n="layers" s={15} /></button>
        </div>
      </div>
      <div className="kx-b">
        {folders.length === 0 && <div className="ks-empty">Nenhuma nota ainda. Crie uma ou importe um arquivo, um link do site ou um CSV de perguntas.</div>}
        {folders.map((f) => {
          const c = collapsed[f.id]
          return (
            <div key={f.id} className="kx-f">
              <button type="button" className="kx-fr" onClick={() => setCollapsed((o) => ({ ...o, [f.id]: !o[f.id] }))} aria-expanded={!c}>
                <Icon n="chevR" s={13} style={{ transform: c ? 'none' : 'rotate(90deg)', transition: 'transform .18s' }} c="#9CA3AF" />
                <span className="kx-fi" style={{ background: KT[f.tone][1] }} />
                <span className="kx-fn">{f.label}</span><span className="kx-c">{f.notes.length}</span>
              </button>
              {!c && (
                <div className="kx-list">
                  {f.notes.map((n) => {
                    const st = noteState(n)
                    return (
                      <button key={n.id} type="button" className={'kx-n' + (cur === n.id ? ' on' : '')} onClick={() => open(n.id)}>
                        <Icon n={kindOf(n.kind).icon} s={14} /><span>{n.name}</span>
                        {st !== 'ok' && <i className={`kx-st ${st === 'err' ? 'proc' : st}`} style={st === 'err' ? { background: '#D23B3B' } : undefined}
                          title={st === 'sync' ? 'Sincronizando' : st === 'err' ? `Erro${n.error_message ? `: ${n.error_message}` : ''}` : 'Processando'} />}
                        {n.read_only && <Icon n="lock" s={11} c="#B0B5BD" />}
                      </button>
                    )
                  })}
                  {!f.sync && <button type="button" className="kx-add" onClick={() => onNew(f.id)}><Icon n="plus" s={12} />Nova nota</button>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface SearchHit { id: string; name: string; snippet: string | null }

export function SearchPanel({ open }: { open: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<SearchHit[]>([])
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); return }
    const t = setTimeout(() => {
      fetch(`/api/ai/knowledge/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => (r.ok ? r.json() : { results: [] })).then((d) => setRes(d.results ?? [])).catch(() => {})
    }, 220)
    return () => clearTimeout(t)
  }, [q])
  const hl = (s: string): ReactNode => {
    const i = s.toLowerCase().indexOf(q.trim().toLowerCase())
    return i < 0 ? s : <>{s.slice(0, i)}<mark>{s.slice(i, i + q.trim().length)}</mark>{s.slice(i + q.trim().length)}</>
  }
  const clean = (s: string) => s.replace(/[#>\-*]/g, '').replace(/\[!\w+\]/g, '').replace(/\[\[|\]\]/g, '')
  return (
    <div className="kx">
      <div className="kx-h"><span className="kx-t">Buscar</span></div>
      <div className="ks-in"><Icon n="search" s={14} /><input autoFocus placeholder="Buscar em todas as notas" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="kx-b">
        {q.trim().length >= 2 && <div className="ks-cnt">{res.length} {res.length === 1 ? 'nota' : 'notas'}</div>}
        {res.map((r) => (
          <button key={r.id} type="button" className="ks-r" onClick={() => open(r.id)}>
            <b>{hl(r.name)}</b><span>{hl(clean(r.snippet ?? ''))}</span>
          </button>
        ))}
        {q.trim().length < 2 && <div className="ks-empty">Busque por palavra, como &quot;PIX&quot; ou &quot;30 dias&quot;.</div>}
      </div>
    </div>
  )
}

export function GapsPanel({ gaps, notes, agentName, onCreate, onAppend, onLimit }: {
  gaps: KbGap[]; notes: KbNote[]; agentName: (id: string) => string
  onCreate: (g: KbGap) => void; onAppend: (g: KbGap) => void; onLimit: (g: KbGap) => void
}) {
  return (
    <div className="kx">
      <div className="kx-h"><span className="kx-t">Lacunas</span><span className="kx-c solid">{gaps.length}</span></div>
      <div className="kg-intro">Perguntas de clientes que nenhuma nota respondeu nos últimos 7 dias.</div>
      <div className="kx-b">
        {gaps.map((g) => {
          const ln = g.suggested_source ? notes.find((n) => n.id === g.suggested_source!.id) : null
          return (
            <div key={g.id} className="kgap">
              <b>{g.question}</b>
              <div className="kgap-m"><span>{g.count} {g.count === 1 ? 'conversa' : 'conversas'}</span>{g.agent_ids.length > 0 && <>·<span>{g.agent_ids.map(agentName).join(', ')}</span></>}</div>
              {!g.safe && <div className="kgap-w"><Icon n="alert" s={12} />Tema de saúde. Prefira um Limite a uma resposta.</div>}
              <div className="kgap-a">
                {ln && !ln.read_only && <button type="button" className="w-btn sm" onClick={() => onAppend(g)}><Icon n="edit" s={12} style={{ marginRight: 6, verticalAlign: -1 }} />Responder em {ln.name}</button>}
                {!g.safe && <button type="button" className="w-btn sm" onClick={() => onLimit(g)}><Icon n="shield" s={12} style={{ marginRight: 6, verticalAlign: -1 }} />Virar limite</button>}
                <button type="button" className="w-btn sm ghost" onClick={() => onCreate(g)}><Icon n="plus" s={12} style={{ marginRight: 6, verticalAlign: -1 }} />Criar nota nova</button>
              </div>
            </div>
          )
        })}
        {!gaps.length && <div className="ks-empty">Nenhuma lacuna. Todas as perguntas tiveram resposta.</div>}
      </div>
    </div>
  )
}

const CMDS: Array<[string, string, string]> = [
  ['cmd:new', 'Nova nota', 'edit'], ['cmd:graph', 'Abrir grafo', 'globe'], ['cmd:gaps', 'Ver lacunas', 'alert'],
  ['cmd:search', 'Buscar em todas as notas', 'search'], ['cmd:builder', 'Voltar ao construtor do agente', 'sparkle'],
]

export function Command({ notes, folderLabel, onClose, run, extra = [] }: {
  notes: KbNote[]; folderLabel: (folder: string) => string; onClose: () => void; run: (id: string) => void
  /** Comandos da nota aberta (ex.: excluir), depois dos fixos. */
  extra?: Array<[string, string, string]>
}) {
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const ql = q.toLowerCase()
  const items: Array<[string, string, string, string]> = [
    ...notes.filter((n) => n.name.toLowerCase().includes(ql)).map((n) => [n.id, n.name, kindOf(n.kind).icon, folderLabel(n.folder)] as [string, string, string, string]),
    ...[...CMDS, ...extra].filter((c) => c[1].toLowerCase().includes(ql)).map((c) => [...c, 'Comando'] as [string, string, string, string]),
  ].slice(0, 9)
  useEffect(() => setI(0), [q])
  return (
    <div className="scrim kc-scrim" onClick={onClose}>
      <div className="kc" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Comandos">
        <div className="kc-in">
          <Icon n="search" s={16} />
          <input autoFocus placeholder="Abrir nota ou rodar comando" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
              if (e.key === 'Enter' && items[i]) run(items[i][0])
              if (e.key === 'Escape') onClose()
            }} />
          <span className="kbd">esc</span>
        </div>
        <div className="kc-l">
          {items.map((it, j) => (
            <button key={it[0]} type="button" className={j === i ? 'on' : ''} onMouseEnter={() => setI(j)} onClick={() => run(it[0])}>
              <Icon n={it[2]} s={15} /><b>{it[1]}</b><span>{it[3]}</span>
            </button>
          ))}
          {!items.length && <div className="ks-empty">Nada encontrado.</div>}
        </div>
        <div className="kc-f"><span><span className="kbd">↑</span><span className="kbd">↓</span> navegar</span><span><span className="kbd">enter</span> abrir</span></div>
      </div>
    </div>
  )
}
