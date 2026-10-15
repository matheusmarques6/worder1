'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useStoreStore } from '@/stores'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Icon, Toast } from '../proto/ui'
import NewSource from '../builder/NewSource'
import KnowledgeGraph from './KnowledgeGraph'
import { Command, Explorer, GapsPanel, SearchPanel, type KbAgent, type KbGap } from './KbPanels'
import { NoteView, Props, RightSide, TestTab, type NoteBody } from './KbNote'
import {
  KT, findBlock, folderLabel, freshTitle, kbFolders, kindOf, titleFromQuestion, wordCount, type KbNote,
} from './kb-model'

/**
 * Conhecimento em tela cheia, porte do protótipo (KB): barra escura com
 * busca de comandos (Ctrl K), trilho (Arquivos, Buscar, Grafo, Lacunas),
 * explorador por pastas coloridas, abas de notas e grafo, nota com
 * propriedades, leitura ou edição (salva sozinha), e o painel direito com
 * Detalhes, Links e Testar. Tudo sobre /api/ai/knowledge/*.
 */

type Left = 'files' | 'search' | 'gaps'

export default function KnowledgeWorkspace({ organizationId }: { organizationId: string }) {
  const router = useRouter()
  const store = useStoreStore((s) => s.currentStore)
  const { confirm } = useConfirm()
  const [tree, setTree] = useState<Array<{ folder: string; notes: KbNote[] }>>([])
  const [loaded, setLoaded] = useState(false)
  const [agents, setAgents] = useState<KbAgent[]>([])
  const [gaps, setGaps] = useState<KbGap[]>([])
  const [bodies, setBodies] = useState<Record<string, NoteBody>>({})
  const [tabs, setTabs] = useState<string[]>([])
  const [cur, setCur] = useState<string | null>(null)
  const [modes, setModes] = useState<Record<string, 'read' | 'edit'>>({})
  const [left, setLeft] = useState<Left>('files')
  const [rt, setRt] = useState<'info' | 'links' | 'test'>('info')
  const [cmd, setCmd] = useState(false)
  const [importing, setImporting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const clearToast = useCallback(() => setToast(null), [])
  const [hi, setHi] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(0)
  const [lOpen, setLOpen] = useState(false)
  const [rOpen, setROpen] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const tabsEl = useRef<HTMLDivElement>(null)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const folders = useMemo(() => kbFolders(tree), [tree])
  const notes = useMemo(() => folders.flatMap((f) => f.notes), [folders])
  const note = cur && cur !== 'graph' ? notes.find((n) => n.id === cur) ?? null : null
  const agentName = useCallback((id: string) => agents.find((a) => a.id === id)?.name || 'Agente', [agents])

  const loadTree = useCallback(async () => {
    const r = await fetch('/api/ai/knowledge')
    const d = await r.json().catch(() => null)
    if (r.ok) setTree(d.folders ?? [])
    else setToast(d?.error || 'Falha ao carregar o conhecimento')
    setLoaded(true)
    return (d?.folders ?? []) as Array<{ folder: string; notes: KbNote[] }>
  }, [])
  const loadGaps = useCallback(async () => {
    const r = await fetch('/api/ai/knowledge/gaps')
    if (r.ok) setGaps((await r.json()).gaps ?? [])
  }, [])
  const loadBody = useCallback(async (id: string) => {
    const r = await fetch(`/api/ai/knowledge/${id}`)
    if (!r.ok) return
    const d = await r.json()
    setBodies((b) => ({ ...b, [id]: { body: d.note.body_markdown ?? d.note.text_content ?? '', backlinks: d.backlinks ?? [] } }))
  }, [])

  useEffect(() => {
    void (async () => {
      const t = await loadTree()
      const want = new URLSearchParams(window.location.search).get('note')
      const first = want || t.flatMap((f) => f.notes)[0]?.id
      if (first) { setTabs([first, 'graph']); setCur(first) } else { setTabs(['graph']); setCur('graph') }
    })()
    void loadGaps()
    fetch(`/api/ai/agents?organization_id=${encodeURIComponent(organizationId)}`)
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((d) => setAgents((d.agents ?? []).filter((a: any) => a.status !== 'archived').map((a: any) => ({ id: a.id, name: a.name || 'Agente', role: a.role, status: a.status }))))
      .catch(() => {})
  }, [organizationId, loadTree, loadGaps])

  useEffect(() => { if (note && !bodies[note.id]) void loadBody(note.id) }, [note, bodies, loadBody])

  const open = (id: string) => {
    setLOpen(false)
    setTabs((t) => (t.includes(id) ? t : [...t, id]))
    setCur(id)
    setHi(null)
  }
  const close = (id: string) => {
    setTabs((t) => {
      const nt = t.filter((x) => x !== id)
      if (cur === id) setCur(nt[nt.length - 1] ?? null)
      return nt
    })
  }

  const create = async (folder?: string, title?: string, body = '') => {
    const editable = folders.find((f) => !f.sync)?.id
    const res = await fetch('/api/ai/knowledge', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: freshTitle(title || 'Sem título', notes.map((n) => n.name)),
        folder: folder || (note && !note.read_only ? note.folder : editable) || 'geral',
        body_markdown: body,
        agent_ids: agents.filter((a) => a.status === 'active').map((a) => a.id),
      }),
    })
    const d = await res.json().catch(() => null)
    if (!res.ok) { setToast(d?.error || 'Não foi possível criar a nota'); return }
    await loadTree()
    setBodies((b) => ({ ...b, [d.note.id]: { body, backlinks: [] } }))
    setModes((m) => ({ ...m, [d.note.id]: 'edit' }))
    open(d.note.id)
  }

  const patch = async (id: string, payload: Record<string, unknown>) => {
    setSaving((n) => n + 1)
    try {
      const res = await fetch(`/api/ai/knowledge/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const d = await res.json().catch(() => null)
      if (!res.ok) { setToast(d?.error || 'Não foi possível salvar'); return null }
      await loadTree()
      return d
    } finally { setSaving((n) => n - 1) }
  }
  // Edição salva sozinha, como no protótipo ("Salvando…" → "Salvo").
  const setBody = (id: string, body: string) => {
    setBodies((b) => ({ ...b, [id]: { ...(b[id] ?? { backlinks: [] }), body } }))
    // Um "Salvando…" por nota com gravação pendente, não por tecla.
    if (timers.current[id]) clearTimeout(timers.current[id])
    else setSaving((n) => n + 1)
    timers.current[id] = setTimeout(() => {
      delete timers.current[id]
      void patch(id, { body_markdown: body }).finally(() => setSaving((n) => n - 1))
    }, 800)
  }
  const rename = async (id: string, name: string) => {
    const d = await patch(id, { name })
    if (!d) return
    setBodies((b) => (b[id] ? { [id]: b[id] } : {}))
    setToast(d.relinked ? 'Renomeada. Links nas outras notas foram atualizados' : 'Renomeada')
  }
  const setReaders = async (id: string, ids: string[]) => {
    setTree((t) => t.map((f) => ({ ...f, notes: f.notes.map((n) => (n.id === id ? { ...n, readers: ids } : n)) })))
    const res = await fetch(`/api/ai/knowledge/${id}/agents`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_ids: ids }) })
    if (!res.ok) { setToast('Não foi possível mudar quem lê'); await loadTree() }
  }
  const remove = async () => {
    if (!note || note.read_only) return
    const ok = await confirm({ title: `Excluir ${note.name}?`, description: 'Os agentes deixam de ler esta nota.', confirmLabel: 'Excluir', destructive: true })
    if (!ok) return
    const res = await fetch(`/api/ai/knowledge/${note.id}`, { method: 'DELETE' })
    if (!res.ok) { setToast('Não foi possível excluir'); return }
    close(note.id)
    await loadTree()
    setToast('Nota excluída')
  }

  const onLink = (t: string) => {
    const n = notes.find((x) => x.name.trim().toLowerCase() === t.trim().toLowerCase())
    if (n) open(n.id); else void create(note?.folder, t)
  }
  const resolveGap = async (g: KbGap, payload: Record<string, unknown>) => {
    const res = await fetch(`/api/ai/knowledge/gaps/${g.id}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const d = await res.json().catch(() => null)
    if (!res.ok) { setToast(d?.error || 'Não foi possível resolver a lacuna'); return null }
    setGaps((gs) => gs.filter((x) => x.id !== g.id))
    return d
  }
  const fromGap = async (g: KbGap) => {
    const d = await resolveGap(g, {
      action: 'create_source', name: titleFromQuestion(g.question),
      folder: g.suggested_source?.folder || undefined,
      answer: g.suggested_answer || 'Escreva aqui a resposta que o agente deve dar.',
    })
    if (!d?.source) return
    await loadTree()
    setModes((m) => ({ ...m, [d.source.id]: 'edit' }))
    open(d.source.id)
    setLeft('files')
    setToast('Nota criada a partir da lacuna')
  }
  const appendGap = async (g: KbGap) => {
    if (!g.suggested_source) return
    const id = g.suggested_source.id
    const d = await resolveGap(g, { action: 'append_to', source_id: id, answer: g.suggested_answer || 'Escreva aqui a resposta.' })
    if (!d) return
    await loadTree()
    await loadBody(id)
    setModes((m) => ({ ...m, [id]: 'edit' }))
    open(id)
    setLeft('files')
    setToast(`Pergunta adicionada em ${g.suggested_source.name}`)
  }
  const limitGap = async (g: KbGap) => {
    const d = await resolveGap(g, { action: 'add_limit' })
    if (d) setToast(`Virou limite: ${g.agent_ids.map(agentName).join(', ') || 'agentes'} transferem esse assunto`)
  }
  const addGap = async (question: string, agentId: string) => {
    const res = await fetch('/api/ai/knowledge/gaps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, agent_id: agentId }) })
    if (!res.ok) { setToast('Não foi possível adicionar'); return }
    await loadGaps()
    setToast('Adicionada às lacunas')
    setLeft('gaps')
  }
  const seeExcerpt = async (sourceId: string, content: string) => {
    let body = bodies[sourceId]?.body
    if (body === undefined) {
      const r = await fetch(`/api/ai/knowledge/${sourceId}`)
      if (r.ok) {
        const d = await r.json()
        body = d.note.body_markdown ?? d.note.text_content ?? ''
        setBodies((b) => ({ ...b, [sourceId]: { body: body!, backlinks: d.backlinks ?? [] } }))
      }
    }
    open(sourceId)
    setModes((m) => ({ ...m, [sourceId]: 'read' }))
    const i = body !== undefined ? findBlock(body, content) : null
    if (i !== null) { setTimeout(() => setHi(i), 50); setTimeout(() => setHi(null), 3000) }
  }

  const run = (id: string) => {
    setCmd(false)
    if (id === 'cmd:new') void create()
    else if (id === 'cmd:graph') open('graph')
    else if (id === 'cmd:gaps') { setLeft('gaps'); setLOpen(true) }
    else if (id === 'cmd:search') { setLeft('search'); setLOpen(true) }
    else if (id === 'cmd:builder') router.push('/ai/construtor')
    else if (id === 'cmd:delete') void remove()
    else open(id)
  }

  const mode = (cur && modes[cur]) || 'read'
  const setMode = (m: 'read' | 'edit') => cur && setModes((o) => ({ ...o, [cur]: m }))
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const m = e.metaKey || e.ctrlKey
      if (m && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmd((c) => !c) }
      if (m && e.key.toLowerCase() === 'e' && note && !note.read_only) { e.preventDefault(); setMode(mode === 'edit' ? 'read' : 'edit') }
      if (m && e.key.toLowerCase() === 'g') { e.preventDefault(); open('graph') }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })
  useEffect(() => {
    const el = tabsEl.current
    if (!el) return
    const t = el.querySelector('.kb-tab.on') as HTMLElement | null
    if (t) {
      const l = t.offsetLeft; const r = l + t.offsetWidth
      if (l < el.scrollLeft) el.scrollLeft = l - 8
      else if (r > el.scrollLeft + el.clientWidth) el.scrollLeft = r - el.clientWidth + 40
    }
  }, [cur, tabs])

  const body = note ? bodies[note.id]?.body ?? '' : ''
  const folder = note ? folders.find((f) => f.id === note.folder) : undefined
  const backCount = note ? bodies[note.id]?.backlinks.length ?? 0 : 0
  const exists = (t: string) => notes.some((x) => x.name.trim().toLowerCase() === t.trim().toLowerCase())
  const rib = (k: Left | 'graph', ic: string, l: string, badge?: number) => (
    <button type="button" className={'kb-rb' + (left === k ? ' on' : '') + (k === 'graph' && cur === 'graph' ? ' on' : '')}
      onClick={() => { if (k === 'graph') { open('graph'); return } setLOpen((o) => (left === k ? !o : true)); setLeft(k) }} title={l} aria-label={l}>
      <Icon n={ic} s={18} />{badge ? <span>{badge}</span> : null}
    </button>
  )

  return (
    <div className={'w-app kb' + (lOpen ? ' l-open' : '')}>
      <header className="w-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ia/worder-mark.png" alt="Worder" className="w-logo" /><span className="w-vd" />
        <div className="w-title"><b>Conhecimento</b></div>
        <span className="w-store"><Icon n="store" s={12} />{store?.name || 'Loja'}</span>
        <span className="w-saved">{saving > 0 ? 'Salvando…' : <><Icon n="check" s={13} />Salvo</>}</span>
        <span className="w-sp" />
        <button type="button" className="kb-cmdk" onClick={() => setCmd(true)}><Icon n="search" s={14} />Buscar ou rodar comando<span>Ctrl K</span></button>
        <span className="w-sp" />
        <button type="button" className="w-tb" onClick={() => setImporting(true)}><Icon n="upload" s={15} />Importar</button>
        <Link className="w-tb" href="/ai/construtor"><Icon n="sparkle" s={15} />Construtor</Link>
        <Link className="w-close" href="/ai/agentes">Fechar</Link>
      </header>
      <div className="w-body">
        <nav className="kb-rib">
          {rib('files', 'file', 'Arquivos')}{rib('search', 'search', 'Buscar')}{rib('graph', 'globe', 'Grafo')}{rib('gaps', 'alert', 'Lacunas', gaps.length)}
          <span style={{ flex: 1 }} />
          <button type="button" className="kb-rb" onClick={() => void create()} title="Nova nota" aria-label="Nova nota"><Icon n="edit" s={18} /></button>
        </nav>
        <div className="kb-left">
          {left === 'files'
            ? <Explorer folders={folders} cur={cur} open={open} onNew={(f) => void create(f)} collapsed={collapsed} setCollapsed={setCollapsed} />
            : left === 'search'
              ? <SearchPanel open={open} />
              : <GapsPanel gaps={gaps} notes={notes} agentName={agentName} onCreate={(g) => void fromGap(g)} onAppend={(g) => void appendGap(g)} onLimit={(g) => void limitGap(g)} />}
        </div>
        {lOpen && <div className="kb-lscrim" onClick={() => setLOpen(false)} />}
        <main className="kb-main">
          <div className="kb-tabs" ref={tabsEl}>
            {tabs.map((id) => {
              const n = id === 'graph' ? null : notes.find((x) => x.id === id)
              if (id !== 'graph' && !n) return null
              return (
                <div key={id} className={'kb-tab' + (cur === id ? ' on' : '')} onClick={() => { setCur(id); setHi(null) }} role="tab" aria-selected={cur === id}>
                  <Icon n={id === 'graph' ? 'globe' : kindOf(n!.kind).icon} s={13} /><span>{id === 'graph' ? 'Grafo' : n!.name}</span>
                  <button type="button" onClick={(e) => { e.stopPropagation(); close(id) }} aria-label="Fechar aba"><Icon n="x" s={12} /></button>
                </div>
              )
            })}
            <button type="button" className="kb-tabadd" onClick={() => void create()} aria-label="Nova nota"><Icon n="plus" s={14} /></button>
          </div>
          {cur === 'graph'
            ? <KnowledgeGraph notes={notes} folders={folders} agents={agents} gaps={gaps} onOpen={open} onGap={(g) => void fromGap(g)} />
            : note
              ? <>
                <div className="kb-bar">
                  <div className="kb-crumb"><span className="kx-fi" style={{ background: KT[folder?.tone ?? 'slate'][1] }} />{folder?.label ?? folderLabel(note.folder)}<Icon n="chevR" s={12} c="#B0B5BD" /><b>{note.name}</b></div>
                  <div className="kb-bar-r">
                    {!note.read_only && (
                      <div className="w-seg kb-mode">
                        {([['read', 'Leitura', 'eye'], ['edit', 'Edição', 'edit']] as const).map(([k, l, ic]) => (
                          <button key={k} type="button" className={mode === k ? 'on' : ''} onClick={() => setMode(k)}><Icon n={ic} s={13} />{l}</button>
                        ))}
                      </div>
                    )}
                    <button type="button" className={'kb-rtog' + (rOpen ? ' on' : '')} onClick={() => setROpen((o) => !o)} aria-label="Detalhes da nota" aria-expanded={rOpen}><Icon n="sliders" s={15} /><span>Detalhes</span></button>
                  </div>
                </div>
                <div className="kb-scroll" ref={scroller}>
                  <NoteView n={note} body={body} exists={exists} mode={mode} setMode={setMode} setBody={(b) => setBody(note.id, b)}
                    rename={(t) => void rename(note.id, t)} onLink={onLink} hi={hi} scroller={scroller}
                    props={<Props n={note} folder={folder} folders={folders} agents={agents} setReaders={(ids) => void setReaders(note.id, ids)} patch={(p) => void patch(note.id, p)} />} />
                </div>
                <div className="kb-status">
                  <span>{note.readers.length ? `${note.readers.map(agentName).join(', ')} ${note.readers.length > 1 ? 'leem' : 'lê'} esta nota` : 'Nenhum agente lê esta nota'}</span>
                  <span>{wordCount(body)} palavras</span>
                  <span>{backCount} links para cá</span>
                  <span>{mode === 'edit' ? 'Editando · Ctrl+E para ler' : 'Clique duas vezes para editar'}</span>
                </div>
              </>
              : <div className="kb-empty">
                <b>{loaded && notes.length === 0 ? 'Nenhuma nota ainda' : 'Nenhuma nota aberta'}</b>
                <p>{loaded && notes.length === 0 ? 'Crie a primeira nota ou importe um arquivo, um link do site ou um CSV de perguntas.' : 'Escolha uma nota à esquerda ou crie uma nova.'}</p>
                <button type="button" className="w-btn" onClick={() => void create()}><Icon n="plus" s={14} />Nova nota</button>
              </div>}
        </main>
        {note && rOpen && <div className="kr-scrim" onClick={() => setROpen(false)} />}
        {note && (
          <RightSide open={rOpen} onClose={() => setROpen(false)} note={note} body={body} notes={notes} backlinks={bodies[note.id]?.backlinks ?? []}
            agents={agents} tab={rt} setTab={setRt} onOpen={open} onCreateTitled={(t) => void create(note.folder, t)}
            onToggleAg={(a) => void setReaders(note.id, note.readers.includes(a) ? note.readers.filter((x) => x !== a) : [...note.readers, a])}
            onJump={(i) => { setMode('read'); setHi(i); setTimeout(() => setHi(null), 2400) }}
            test={<TestTab agents={agents} onSee={(id, c) => void seeExcerpt(id, c)} onGap={(q, a) => void addGap(q, a)} />} />
        )}
      </div>
      {cmd && (
        <Command notes={notes} folderLabel={(f) => folders.find((x) => x.id === f)?.label ?? folderLabel(f)} onClose={() => setCmd(false)}
          run={run} extra={note && !note.read_only ? [['cmd:delete', `Excluir ${note.name}`, 'trash']] : []} />
      )}
      {importing && (
        <NewSource kind="text" agents={agents} onClose={() => setImporting(false)}
          onDone={async (msg, id) => { setImporting(false); await loadTree(); setToast(msg); if (id) open(id) }} />
      )}
      {toast && <Toast msg={toast} onDone={clearToast} />}
    </div>
  )
}
