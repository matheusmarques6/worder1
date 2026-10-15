'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, BookOpen, Check, ChevronDown, ChevronRight, FileText, FlaskConical, Folder, Link2,
  Loader2, Lock, Network, Pencil, Plus, Search, Trash2, Upload, X,
} from 'lucide-react'
import MdView from './MdView'
import KnowledgeGraph from './KnowledgeGraph'
import GapsPanel from './GapsPanel'

/**
 * Conhecimento em tela cheia (plano IA M3 passo 22), como o protótipo:
 * trilho (Arquivos, Buscar, Grafo, Lacunas, Nova nota), explorador por
 * pastas, abas de notas, nota com título editável e propriedades, leitura
 * (MdView) ou edição (textarea com dicas), e o painel direito com Detalhes,
 * Links e Testar. Tudo sobre /api/ai/knowledge/* (passo 21).
 */

type View = 'files' | 'search' | 'graph' | 'gaps'

interface NoteSummary {
  id: string; name: string; folder: string; kind: string; status: string | null
  read_only: boolean | null; tags: string[] | null; links: string[] | null
  updated_at: string | null; readers: string[]; chunks_count?: number | null
  error_message?: string | null
}
interface Folder { folder: string; notes: NoteSummary[] }
interface NoteFull extends NoteSummary { body_markdown: string | null; text_content: string | null }
interface Agent { id: string; name: string | null; status: string }

const KIND_LABEL: Record<string, string> = {
  note: 'Nota', document: 'Documento', url: 'Página', faq: 'FAQ', catalog: 'Catálogo', site_page: 'Página do site',
}
const STATUS_LABEL: Record<string, string> = { ready: 'Pronta', pending: 'Processando', processing: 'Processando', error: 'Erro' }

const EDIT_HINTS = '# Título · ## Seção · - item · [!regra] … · > [!resposta] Título · [!atencao] … · [[Outra nota]]'

export default function KnowledgeWorkspace({ organizationId }: { organizationId: string }) {
  const [view, setView] = useState<View>('files')
  const [folders, setFolders] = useState<Folder[]>([])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [agents, setAgents] = useState<Agent[]>([])
  const [tabs, setTabs] = useState<string[]>([])
  const [current, setCurrent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const loadTree = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/knowledge')
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha ao carregar o conhecimento')
      setFolders(body.folders ?? [])
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadTree() }, [loadTree])
  // /ai/conhecimento?note=<id> (vindo do Construtor) abre a nota direto.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('note')
    if (id) { setTabs((t) => (t.includes(id) ? t : [...t, id])); setCurrent(id) }
  }, [])
  useEffect(() => {
    fetch(`/api/ai/agents?organization_id=${encodeURIComponent(organizationId)}`)
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((d) => setAgents(d.agents ?? []))
      .catch(() => {})
  }, [organizationId])

  // Ctrl/Cmd K abre a busca.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setView('search'); setTimeout(() => searchRef.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const allNotes = useMemo(() => folders.flatMap((f) => f.notes), [folders])
  const byTitle = useMemo(() => new Map(allNotes.map((n) => [n.name.trim().toLowerCase(), n.id])), [allNotes])

  const open = (id: string) => {
    setTabs((t) => (t.includes(id) ? t : [...t, id]))
    setCurrent(id)
    setView((v) => (v === 'graph' || v === 'gaps' ? 'files' : v))
  }
  const close = (id: string) => {
    setTabs((t) => {
      const next = t.filter((x) => x !== id)
      if (current === id) setCurrent(next[next.length - 1] ?? null)
      return next
    })
  }

  const createNote = async (folder = 'geral') => {
    const res = await fetch('/api/ai/knowledge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nova nota', folder, body_markdown: '' }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) { setError(body?.error || 'Não foi possível criar a nota'); return }
    await loadTree()
    open(body.note.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <BookOpen size={17} style={{ color: 'var(--text-3)' }} />
        <div style={{ fontWeight: 800, fontSize: 15 }}>Conhecimento da loja</div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-soft btn-sm" onClick={() => { setView('search'); setTimeout(() => searchRef.current?.focus(), 0) }}>
          <Search size={14} />Buscar <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Ctrl K</span>
        </button>
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setImportOpen(true)}><Upload size={14} />Importar</button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void createNote()}><Plus size={14} />Nova nota</button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* trilho */}
        <div style={{ width: 52, borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 10 }}>
          <RailButton on={view === 'files'} title="Arquivos" onClick={() => setView('files')}><Folder size={18} /></RailButton>
          <RailButton on={view === 'search'} title="Buscar" onClick={() => setView('search')}><Search size={18} /></RailButton>
          <RailButton on={view === 'graph'} title="Grafo" onClick={() => setView('graph')}><Network size={18} /></RailButton>
          <RailButton on={view === 'gaps'} title="Lacunas" onClick={() => setView('gaps')}><AlertTriangle size={18} /></RailButton>
          <RailButton on={false} title="Nova nota" onClick={() => void createNote()}><Plus size={18} /></RailButton>
        </div>

        {view === 'graph' ? (
          <div style={{ flex: 1, overflow: 'auto' }}><KnowledgeGraph onOpenNote={open} /></div>
        ) : view === 'gaps' ? (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <GapsPanel agents={agents} notes={allNotes} onOpenNote={open} onChanged={loadTree} />
          </div>
        ) : (
          <>
            {/* explorador / busca */}
            <div style={{ width: 260, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface)' }}>
              {view === 'search' ? (
                <SearchPane inputRef={searchRef} onOpen={open} />
              ) : loading ? (
                <div style={{ padding: 16 }}><Loader2 size={16} className="animate-spin" /></div>
              ) : folders.length === 0 ? (
                <p style={{ padding: 16, fontSize: 12.5, color: 'var(--text-3)' }}>Nenhuma nota ainda. Crie uma ou importe um CSV de perguntas e respostas.</p>
              ) : (
                <div style={{ padding: '8px 6px' }}>
                  {folders.map((f) => {
                    const isCollapsed = collapsed.has(f.folder)
                    return (
                      <div key={f.folder}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <button type="button" onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(f.folder)) n.delete(f.folder); else n.add(f.folder); return n })}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 0, padding: '6px 6px', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', textAlign: 'left' }}>
                            {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}<Folder size={13} />{f.folder}
                            <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>{f.notes.length}</span>
                          </button>
                          <button type="button" title="Nova nota nesta pasta" onClick={() => void createNote(f.folder)} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--text-3)' }}><Plus size={13} /></button>
                        </div>
                        {!isCollapsed && f.notes.map((n) => (
                          <button key={n.id} type="button" onClick={() => open(n.id)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, background: current === n.id ? 'var(--brand-soft, #FFF3EA)' : 'none', border: 0, borderRadius: 6, padding: '5px 8px 5px 24px', fontSize: 12.5, cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }}>
                            {n.read_only ? <Lock size={12} style={{ color: 'var(--text-3)' }} /> : <FileText size={12} style={{ color: 'var(--text-3)' }} />}
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</span>
                            {n.status === 'error' && <AlertTriangle size={12} style={{ color: 'var(--red)' }} />}
                            {n.readers.length === 0 && <span title="Nenhum agente lê esta nota" style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--amber, #E0930B)' }} />}
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* nota */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              {tabs.length > 0 && (
                <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', background: 'var(--surface)', overflowX: 'auto' }}>
                  {tabs.map((id) => {
                    const n = allNotes.find((x) => x.id === id)
                    return (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', fontSize: 12.5, borderBottom: current === id ? '2px solid var(--brand)' : '2px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        onClick={() => setCurrent(id)}>
                        {n?.name ?? 'Nota'}
                        <button type="button" onClick={(e) => { e.stopPropagation(); close(id) }} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--text-3)', padding: 0 }}><X size={12} /></button>
                      </div>
                    )
                  })}
                </div>
              )}
              {error && <p style={{ margin: '8px 16px 0', fontSize: 12.5, color: 'var(--red)' }}>{error}</p>}
              {current ? (
                <NoteEditor key={current} id={current} agents={agents}
                  onLink={(title) => { const id = byTitle.get(title.trim().toLowerCase()); if (id) open(id); else setError(`Nota "${title}" não existe ainda`) }}
                  onChanged={loadTree} onDeleted={() => { close(current); void loadTree() }} />
              ) : (
                <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  Abra uma nota no explorador, ou crie uma nova.
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {importOpen && <ImportModal agents={agents} onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); void loadTree() }} />}
    </div>
  )
}

function RailButton({ on, title, onClick, children }: { on: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick}
      style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', border: 0, cursor: 'pointer', background: on ? 'var(--brand-soft, #FFF3EA)' : 'none', color: on ? 'var(--brand)' : 'var(--text-3)' }}>
      {children}
    </button>
  )
}

function SearchPane({ inputRef, onOpen }: { inputRef: React.RefObject<HTMLInputElement>; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Array<{ id: string; name: string; folder: string; snippet: string | null }>>([])
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    const t = setTimeout(() => {
      fetch(`/api/ai/knowledge/search?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((d) => setResults(d.results ?? [])).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <div style={{ padding: 10 }}>
      <input ref={inputRef} className="field" style={{ height: 34, fontSize: 12.5 }} placeholder="Buscar em títulos e textos…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
        {results.map((r) => (
          <button key={r.id} type="button" onClick={() => onOpen(r.id)} style={{ textAlign: 'left', background: 'none', border: 0, borderRadius: 6, padding: 6, cursor: 'pointer' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>{r.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{r.folder}{r.snippet ? ` · …${r.snippet}…` : ''}</div>
          </button>
        ))}
        {q.trim().length >= 2 && results.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Nada encontrado.</p>}
      </div>
    </div>
  )
}

type Panel = 'details' | 'links' | 'test'

function NoteEditor({ id, agents, onLink, onChanged, onDeleted }: {
  id: string; agents: Agent[]; onLink: (title: string) => void; onChanged: () => Promise<void>; onDeleted: () => void
}) {
  const [note, setNote] = useState<NoteFull | null>(null)
  const [backlinks, setBacklinks] = useState<Array<{ id: string; name: string }>>([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel>('details')

  const load = useCallback(async () => {
    const res = await fetch(`/api/ai/knowledge/${id}`)
    const body = await res.json().catch(() => null)
    if (!res.ok) { setError(body?.error || 'Nota não encontrada'); return }
    setNote(body.note); setBacklinks(body.backlinks ?? [])
    setTitle(body.note.name); setDraft(body.note.body_markdown ?? body.note.text_content ?? '')
  }, [id])
  useEffect(() => { void load() }, [load])

  const patch = async (payload: Record<string, unknown>) => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/ai/knowledge/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Não foi possível salvar')
      await load(); await onChanged()
      return true
    } catch (e: any) { setError(e.message); return false } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!confirm('Excluir esta nota? Os agentes deixam de lê-la.')) return
    const res = await fetch(`/api/ai/knowledge/${id}`, { method: 'DELETE' })
    if (res.ok) onDeleted()
  }

  if (!note) {
    return <div style={{ padding: 20 }}>{error ? <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p> : <Loader2 size={16} className="animate-spin" />}</div>
  }

  const readers = agents.filter((a) => note.readers.includes(a.id))
  const readOnly = Boolean(note.read_only)

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '18px 26px' }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={readOnly}
          onBlur={() => { if (title.trim() && title.trim() !== note.name) void patch({ name: title.trim() }) }}
          style={{ width: '100%', fontSize: 22, fontWeight: 800, border: 0, background: 'transparent', outline: 'none', color: 'var(--text)' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '6px 12px', fontSize: 12.5, margin: '10px 0 16px', color: 'var(--text-2)' }}>
          <span style={{ color: 'var(--text-3)' }}>Lida por</span>
          <span>{readers.length ? readers.map((a) => a.name || 'Agente').join(', ') : <span style={{ color: 'var(--amber, #E0930B)' }}>nenhum agente</span>}</span>
          <span style={{ color: 'var(--text-3)' }}>Tipo</span><span>{KIND_LABEL[note.kind] ?? note.kind}</span>
          <span style={{ color: 'var(--text-3)' }}>Situação</span>
          <span>{STATUS_LABEL[note.status ?? ''] ?? note.status}{note.status === 'error' && note.error_message ? ` — ${note.error_message}` : ''}{note.status === 'ready' ? ` · ${note.chunks_count ?? 0} trechos` : ''}</span>
          <span style={{ color: 'var(--text-3)' }}>Tags</span>
          <TagsField value={note.tags ?? []} disabled={readOnly} onSave={(tags) => void patch({ tags })} />
          <span style={{ color: 'var(--text-3)' }}>Pasta</span>
          <FolderField value={note.folder} onSave={(folder) => void patch({ folder })} />
          <span style={{ color: 'var(--text-3)' }}>Atualizada</span><span>{note.updated_at ? new Date(note.updated_at).toLocaleString('pt-BR') : '—'}</span>
        </div>

        {readOnly && (
          <div className="callout" style={{ marginBottom: 12 }}>
            <Lock size={14} /> Fonte sincronizada: o conteúdo vem da integração e é atualizado por ela. Você pode mudar pasta, tags e quem lê.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {!readOnly && (editing ? (
            <>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy}
                onClick={async () => { if (await patch({ body_markdown: draft })) setEditing(false) }}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}Salvar
              </button>
              <button type="button" className="btn btn-soft btn-sm" onClick={() => { setDraft(note.body_markdown ?? ''); setEditing(false) }}>Cancelar</button>
            </>
          ) : (
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setEditing(true)}><Pencil size={14} />Editar</button>
          ))}
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-soft btn-sm" onClick={() => void remove()} style={{ color: 'var(--red)' }}><Trash2 size={14} /></button>
        </div>
        {error && <p style={{ fontSize: 12.5, color: 'var(--red)' }}>{error}</p>}

        {editing ? (
          <div>
            <textarea className="field" value={draft} onChange={(e) => setDraft(e.target.value)} rows={22}
              style={{ width: '100%', height: 'auto', fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.55, paddingTop: 10, resize: 'vertical' }} />
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>{EDIT_HINTS}</div>
          </div>
        ) : (
          <MdView markdown={note.body_markdown ?? note.text_content ?? ''} onLink={onLink} />
        )}
      </div>

      <div style={{ width: 300, borderLeft: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
        <div className="tabs-row" style={{ padding: '0 8px' }}>
          <button type="button" className={`tab${panel === 'details' ? ' on' : ''}`} onClick={() => setPanel('details')}>Detalhes</button>
          <button type="button" className={`tab${panel === 'links' ? ' on' : ''}`} onClick={() => setPanel('links')}><Link2 />Links</button>
          <button type="button" className={`tab${panel === 'test' ? ' on' : ''}`} onClick={() => setPanel('test')}><FlaskConical />Testar</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {panel === 'details' && <DetailsPanel note={note} agents={agents} onChanged={async () => { await load(); await onChanged() }} />}
          {panel === 'links' && <LinksPanel note={note} backlinks={backlinks} onLink={onLink} />}
          {panel === 'test' && <TestPanel agents={agents} defaultAgent={readers[0]?.id ?? agents[0]?.id ?? ''} noteId={note.id} />}
        </div>
      </div>
    </div>
  )
}

function TagsField({ value, disabled, onSave }: { value: string[]; disabled: boolean; onSave: (tags: string[]) => void }) {
  const [text, setText] = useState(value.join(', '))
  useEffect(() => setText(value.join(', ')), [value])
  return (
    <input className="field" style={{ height: 28, fontSize: 12 }} value={text} disabled={disabled} placeholder="separe por vírgula"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { const next = text.split(',').map((t) => t.trim()).filter(Boolean); if (next.join('|') !== value.join('|')) onSave(next) }} />
  )
}

function FolderField({ value, onSave }: { value: string; onSave: (folder: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <input className="field" style={{ height: 28, fontSize: 12 }} value={text} onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text.trim() && text.trim() !== value) onSave(text.trim()) }} />
  )
}

function DetailsPanel({ note, agents, onChanged }: { note: NoteFull; agents: Agent[]; onChanged: () => Promise<void> }) {
  const [usage, setUsage] = useState<{ series: number[]; total: number; questions: Array<{ question: string | null; agent_name: string | null; at: string }> } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    fetch(`/api/ai/knowledge/${note.id}/usage`).then((r) => (r.ok ? r.json() : null)).then(setUsage).catch(() => {})
  }, [note.id])

  const toggle = async (agentId: string) => {
    setBusy(true)
    const next = note.readers.includes(agentId) ? note.readers.filter((x) => x !== agentId) : [...note.readers, agentId]
    await fetch(`/api/ai/knowledge/${note.id}/agents`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_ids: next }) })
    await onChanged()
    setBusy(false)
  }

  const max = Math.max(1, ...(usage?.series ?? [0]))
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <PanelLabel>Quem lê</PanelLabel>
        {agents.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Nenhum agente criado.</p>}
        {agents.map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
            <span style={{ flex: 1, fontSize: 12.5 }}>{a.name || 'Agente'}{a.status !== 'active' ? ' · pausado' : ''}</span>
            <button type="button" className={`tog${note.readers.includes(a.id) ? ' on' : ''}`} disabled={busy} onClick={() => void toggle(a.id)} />
          </div>
        ))}
      </div>
      <div>
        <PanelLabel>Uso nos últimos 7 dias</PanelLabel>
        {usage ? (
          <>
            <svg viewBox="0 0 140 36" style={{ width: '100%', height: 40 }}>
              {usage.series.map((v, i) => (
                <rect key={i} x={i * 20 + 2} y={34 - (v / max) * 30} width={14} height={(v / max) * 30 + 0.5} rx={2} fill="var(--brand, #F97316)" opacity={v ? 0.9 : 0.25} />
              ))}
            </svg>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{usage.total} consulta(s)</div>
          </>
        ) : <Loader2 size={14} className="animate-spin" />}
      </div>
      <div>
        <PanelLabel>Perguntas respondidas</PanelLabel>
        {(usage?.questions ?? []).length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Nenhuma ainda.</p> : (
          <div style={{ display: 'grid', gap: 6 }}>
            {usage!.questions.map((q, i) => (
              <div key={i} style={{ fontSize: 12 }}>
                <div>“{q.question ?? '—'}”</div>
                <div style={{ color: 'var(--text-3)', fontSize: 11 }}>{q.agent_name ?? 'agente'} · {new Date(q.at).toLocaleDateString('pt-BR')}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function LinksPanel({ note, backlinks, onLink }: { note: NoteFull; backlinks: Array<{ id: string; name: string }>; onLink: (title: string) => void }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div>
        <PanelLabel>Para cá</PanelLabel>
        {backlinks.length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Nenhuma nota aponta para esta.</p>
          : backlinks.map((b) => <LinkRow key={b.id} title={b.name} onClick={() => onLink(b.name)} />)}
      </div>
      <div>
        <PanelLabel>Desta nota</PanelLabel>
        {(note.links ?? []).length === 0 ? <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Use [[Título]] para ligar a outra nota.</p>
          : (note.links ?? []).map((t) => <LinkRow key={t} title={t} onClick={() => onLink(t)} />)}
      </div>
    </div>
  )
}

function LinkRow({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'none', border: 0, padding: '4px 0', cursor: 'pointer', fontSize: 12.5, color: 'var(--brand)', textAlign: 'left' }}>
      <Link2 size={12} />{title}
    </button>
  )
}

function TestPanel({ agents, defaultAgent, noteId }: { agents: Agent[]; defaultAgent: string; noteId: string }) {
  const [agentId, setAgentId] = useState(defaultAgent)
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const ask = async () => {
    setBusy(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/ai/knowledge/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: agentId, question }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha na busca')
      setResult(body)
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <PanelLabel>Perguntar a um agente</PanelLabel>
      <select className="field" style={{ height: 32, fontSize: 12.5 }} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.name || 'Agente'}</option>)}
      </select>
      <textarea className="field" rows={3} style={{ height: 'auto', fontSize: 12.5, paddingTop: 8 }} placeholder="Como o cliente perguntaria…" value={question} onChange={(e) => setQuestion(e.target.value)} />
      <button type="button" className="btn btn-primary btn-sm" disabled={busy || !agentId || !question.trim()} onClick={() => void ask()}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}Buscar resposta
      </button>
      <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0 }}>Só a busca: mostra o trecho que o agente receberia, sem gerar texto.</p>
      {error && <p style={{ fontSize: 12, color: 'var(--red)' }}>{error}</p>}
      {result && (result.answered ? (
        <div className="card" style={{ padding: 10, fontSize: 12.5 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
            {result.best.source_name ?? 'fonte'} · {result.best.chunk_kind} · {Math.round(result.best.similarity * 100)}%
            {result.best.source_id === noteId ? ' · esta nota' : ''}
          </div>
          {result.best.content}
          {result.hit_rule && <div style={{ marginTop: 6, color: 'var(--red)', fontSize: 11.5 }}>Bateu numa regra.</div>}
        </div>
      ) : (
        <p style={{ fontSize: 12.5, color: 'var(--amber, #E0930B)' }}>Nenhuma fonte deste agente responde. Isso viraria uma lacuna.</p>
      ))}
    </div>
  )
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-3)', marginBottom: 6 }}>{children}</div>
}

function ImportModal({ agents, onClose, onDone }: { agents: Agent[]; onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = useState('')
  const [mode, setMode] = useState<'faq' | 'notes'>('faq')
  const [readers, setReaders] = useState<string[]>(agents.filter((a) => a.status === 'active').map((a) => a.id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/ai/knowledge/import/csv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv, mode, agent_ids: readers }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha ao importar')
      onDone()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={onClose}>
      <div className="card" style={{ padding: 20, width: 'min(560px, calc(100vw - 32px))', display: 'grid', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Importar perguntas e respostas (CSV)</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>Colunas <b>pergunta</b> e <b>resposta</b> (ou as duas primeiras). Vírgula ou ponto e vírgula.</p>
        <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()) }} />
        <textarea className="field" rows={6} style={{ height: 'auto', fontSize: 12, fontFamily: 'ui-monospace, monospace', paddingTop: 8 }} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'pergunta;resposta\nTem frete grátis?;Sim, acima de R$ 199.'} />
        <div className="seg-ctl">
          <button type="button" className={mode === 'faq' ? 'on' : ''} onClick={() => setMode('faq')}>Uma FAQ</button>
          <button type="button" className={mode === 'notes' ? 'on' : ''} onClick={() => setMode('notes')}>Uma nota por pergunta</button>
        </div>
        <div>
          <PanelLabel>Lida por</PanelLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {agents.map((a) => (
              <button key={a.id} type="button" className={`pickchip${readers.includes(a.id) ? ' on' : ''}`}
                onClick={() => setReaders((r) => (r.includes(a.id) ? r.filter((x) => x !== a.id) : [...r, a.id]))}>{a.name || 'Agente'}</button>
            ))}
          </div>
        </div>
        {error && <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-soft btn-sm" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy || !csv.trim()} onClick={() => void submit()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}Importar
          </button>
        </div>
      </div>
    </div>
  )
}
