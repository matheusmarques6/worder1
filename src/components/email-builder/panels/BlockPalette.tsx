'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ShoppingBag, Tag, ShoppingCart, Type, ImageIcon, MousePointerClick, Minus, MoveVertical, Share2, Code, Play, PanelTop, PanelBottom, Columns, Package, User, Store, Package2, Link, LucideIcon, Menu, Layers, Table, Quote, Clock, Trash2, Search, Receipt, Pencil, Copy, Loader2, AlertTriangle } from 'lucide-react'
import { BLOCK_DEFS, type BlockDef, type EmailBlock, type EmailSection } from '../config/types'
import { UniversalThumb, UsageBadge, UniversalIcon, usageText } from '../universal/UniversalBits'

const ICON_MAP: Record<string, LucideIcon> = {
  ShoppingBag, Tag, ShoppingCart, Type, Image: ImageIcon, MousePointerClick, Minus, MoveVertical, Share2, Code, Play, PanelTop, PanelBottom, Columns, Menu, Layers, Table, Quote, Clock, Receipt,
}

// ── Pre-built section definitions with SVG previews ──
const PREBUILT_SECTIONS = [
  {
    type: 'hero', label: 'Hero',
    description: 'Titulo, subtitulo e botao CTA',
    preview: (
      <div className="w-full bg-zinc-100 rounded-md p-3 space-y-1.5">
        <div className="h-2.5 w-16 bg-zinc-300 rounded mx-auto" />
        <div className="h-1.5 w-24 bg-zinc-200 rounded mx-auto" />
        <div className="h-5 w-16 bg-zinc-800 rounded mx-auto mt-1" />
      </div>
    ),
  },
  {
    type: 'cta', label: 'CTA',
    description: 'Chamada para acao com botao destaque',
    preview: (
      <div className="w-full bg-zinc-100 rounded-md p-3 space-y-1.5">
        <div className="h-2 w-20 bg-zinc-300 rounded mx-auto" />
        <div className="h-1.5 w-28 bg-zinc-200 rounded mx-auto" />
        <div className="h-5 w-full bg-zinc-800 rounded mx-auto mt-1" />
      </div>
    ),
  },
  {
    type: 'products', label: 'Produtos',
    description: 'Grid de produtos recomendados',
    preview: (
      <div className="w-full bg-white rounded-md p-2 border border-zinc-100">
        <div className="h-2 w-16 bg-zinc-300 rounded mx-auto mb-2" />
        <div className="grid grid-cols-2 gap-1.5">
          <div className="space-y-1"><div className="h-8 bg-zinc-100 rounded" /><div className="h-1.5 w-8 bg-zinc-200 rounded" /></div>
          <div className="space-y-1"><div className="h-8 bg-zinc-100 rounded" /><div className="h-1.5 w-8 bg-zinc-200 rounded" /></div>
        </div>
      </div>
    ),
  },
  {
    type: 'footer', label: 'Rodape',
    description: 'Redes sociais + links legais',
    preview: (
      <div className="w-full bg-zinc-100 rounded-md p-3 space-y-1.5">
        <div className="flex justify-center gap-1.5"><div className="w-3.5 h-3.5 bg-zinc-300 rounded-full" /><div className="w-3.5 h-3.5 bg-zinc-300 rounded-full" /><div className="w-3.5 h-3.5 bg-zinc-300 rounded-full" /></div>
        <div className="h-1 w-20 bg-zinc-200 rounded mx-auto" />
      </div>
    ),
  },
  {
    type: 'image-hero', label: 'Hero + Imagem',
    description: 'Imagem grande com titulo sobreposto',
    preview: (
      <div className="w-full bg-zinc-200 rounded-md p-2 relative overflow-hidden">
        <div className="h-14 bg-gradient-to-b from-zinc-300 to-zinc-200 rounded" />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="h-2 w-14 bg-white/80 rounded mb-1" />
          <div className="h-4 w-12 bg-zinc-800 rounded" />
        </div>
      </div>
    ),
  },
  {
    type: 'testimonial', label: 'Depoimento',
    description: 'Citacao com avatar do cliente',
    preview: (
      <div className="w-full bg-white rounded-md p-3 border border-zinc-100 space-y-1.5">
        <div className="text-zinc-300 text-center text-lg leading-none">&ldquo;</div>
        <div className="h-1.5 w-24 bg-zinc-200 rounded mx-auto" />
        <div className="flex items-center justify-center gap-1 mt-1">
          <div className="w-3 h-3 bg-zinc-300 rounded-full" />
          <div className="h-1 w-8 bg-zinc-300 rounded" />
        </div>
      </div>
    ),
  },
  {
    type: 'order-confirmation', label: 'Pedido',
    description: 'Resumo do pedido com produtos',
    preview: (
      <div className="w-full bg-white rounded-md p-2 border border-zinc-100 space-y-1.5">
        <div className="h-2 w-16 bg-zinc-300 rounded mx-auto" />
        <div className="h-1 w-12 bg-zinc-200 rounded mx-auto" />
        <div className="flex gap-1.5 items-start">
          <div className="w-6 h-6 bg-zinc-100 rounded flex-shrink-0" />
          <div className="flex-1 space-y-0.5">
            <div className="h-1.5 w-14 bg-zinc-200 rounded" />
            <div className="h-1 w-10 bg-zinc-100 rounded" />
          </div>
          <div className="h-1.5 w-6 bg-zinc-200 rounded" />
        </div>
        <div className="border-t border-zinc-100 pt-1 flex justify-between">
          <div className="h-1.5 w-8 bg-zinc-300 rounded" />
          <div className="h-1.5 w-8 bg-zinc-800 rounded" />
        </div>
      </div>
    ),
  },
]

interface BlockPaletteProps {
  onAddBlock: (type: string) => void
  onAddSavedBlock?: (block: EmailBlock, savedBlockId?: string, savedBlockName?: string) => void
  onAddSavedSection?: (section: EmailSection, savedSectionId?: string, savedSectionName?: string) => void
  onAddPrebuiltSection?: (type: string) => void
  /** Incremented by the editor whenever a new saved block/section is created
   *  so the palette re-fetches the library without requiring a tab switch. */
  savedLibraryVersion?: number
  /** Abre o universal sozinho, para editar em todos os e-mails. */
  onEditUniversal?: (savedId: string) => void
}

type SavedItem = {
  id: string
  name: string
  category: string | null
  block_json: any
  // Computed fields:
  kind: 'block' | 'section'
  /** Em quantos e-mails este universal está. */
  usageCount: number
}

export function BlockPalette({ onAddBlock, onAddSavedBlock, onAddSavedSection, onAddPrebuiltSection, savedLibraryVersion = 0, onEditUniversal }: BlockPaletteProps) {
  const [tab, setTab] = useState<'blocks' | 'prebuilt' | 'saved'>('blocks')
  const [savedItems, setSavedItems] = useState<SavedItem[]>([])
  const [savedLoading, setSavedLoading] = useState(false)
  const [savedFilter, setSavedFilter] = useState<'all' | 'blocks' | 'sections'>('all')
  const [search, setSearch] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<SavedItem | null>(null)

  const loadLibrary = useCallback(async (): Promise<void> => {
    setSavedLoading(true)
    try {
      // withUsage: a contagem vem junto, numa consulta só. Sem ela a
      // lista é um punhado de nomes parecidos e nada diz qual está no ar.
      const res = await fetch('/api/email/saved-blocks?withUsage=1')
      const d = await res.json()
      const rows: any[] = d.blocks || []
      setSavedItems(rows.map(r => ({
        id: r.id,
        name: r.name,
        category: r.category,
        block_json: r.block_json,
        kind: (r.block_json && r.block_json._kind === 'section') || r.category === 'section' ? 'section' : 'block',
        usageCount: r.usage_count || 0,
      })))
    } catch {
      setSavedItems([])
    } finally {
      setSavedLoading(false)
    }
  }, [])

  // Recarrega ao montar e sempre que o editor cria um universal novo.
  useEffect(() => { loadLibrary() }, [loadLibrary, savedLibraryVersion])

  // Outra aba salvou um universal: a lista aqui já está velha.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'worder:universal-saved') loadLibrary()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [loadLibrary])

  const commitRename = useCallback(async (item: SavedItem) => {
    const next = renameValue.trim()
    setRenamingId(null)
    if (!next || next === item.name) return
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/email/saved-blocks/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: next }),
      })
      if (res.ok) setSavedItems(prev => prev.map(i => (i.id === item.id ? { ...i, name: next } : i)))
    } catch { /* a lista continua com o nome antigo */ }
    setBusyId(null)
  }, [renameValue])

  /**
   * Duplicar existe por causa do caso real: querer mudar um rodapé só
   * para uma campanha. Sem uma cópia nomeada, a saída era editar o
   * universal e desfazer depois — nos vinte e três e-mails.
   */
  const duplicateItem = useCallback(async (item: SavedItem) => {
    setBusyId(item.id)
    try {
      const res = await fetch('/api/email/saved-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${item.name} (cópia)`,
          category: item.category,
          block_json: item.block_json,
        }),
      })
      if (res.ok) await loadLibrary()
    } catch { /* nada muda */ }
    setBusyId(null)
  }, [loadLibrary])

  const deleteItem = useCallback(async (item: SavedItem) => {
    setBusyId(item.id)
    try {
      await fetch(`/api/email/saved-blocks/${item.id}`, { method: 'DELETE' })
      setSavedItems(prev => prev.filter(i => i.id !== item.id))
    } catch { /* nada muda */ }
    setBusyId(null)
    setConfirmDelete(null)
  }, [])

  const categories = ['Conteúdo', 'E-commerce', 'Estrutura']

  const handleDragStart = (e: React.DragEvent, def: BlockDef) => {
    e.dataTransfer.setData('blockType', def.type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const filteredSaved = useMemo(() => {
    const q = search.trim().toLowerCase()
    return savedItems.filter(item => {
      if (savedFilter === 'blocks' && item.kind !== 'block') return false
      if (savedFilter === 'sections' && item.kind !== 'section') return false
      if (q && !item.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [savedItems, savedFilter, search])

  const savedCount = savedItems.length
  const blocksCount = savedItems.filter(i => i.kind === 'block').length
  const sectionsCount = savedItems.filter(i => i.kind === 'section').length

  return (
    <div className="h-full flex flex-col">
      {/* Tab switcher — Klaviyo style: pill-shaped segmented control */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex bg-zinc-100 rounded-lg p-0.5">
          {([
            { id: 'blocks' as const, label: 'Blocos' },
            { id: 'prebuilt' as const, label: 'Pre-built' },
            { id: 'saved' as const, label: 'Universais', count: savedCount },
          ]).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-1.5 text-[11px] font-semibold rounded-md transition-all flex items-center justify-center gap-1 ${tab === t.id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
              <span>{t.label}</span>
              {'count' in t && t.count ? (
                <span className={`text-[9px] px-1 rounded ${tab === t.id ? 'bg-violet-100 text-violet-700' : 'bg-zinc-200 text-zinc-600'}`}>{t.count}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Blocks tab — Klaviyo-style cards */}
        {tab === 'blocks' && (
          <div className="space-y-5">
            {categories.map(cat => {
              const blocks = BLOCK_DEFS.filter(b => b.category === cat)
              if (blocks.length === 0) return null
              return (
                <div key={cat}>
                  <p className="text-[11px] font-semibold text-zinc-900 mb-2.5">{cat === 'Conteúdo' ? 'Blocos' : cat}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {blocks.map(def => (
                      <button key={def.type} onClick={() => onAddBlock(def.type)} draggable onDragStart={(e) => handleDragStart(e, def)}
                        className="relative flex flex-col items-center justify-center gap-1.5 py-4 px-2 bg-white border border-zinc-200 rounded-xl hover:border-zinc-400 hover:shadow-md transition-all cursor-grab active:cursor-grabbing active:scale-[0.97] group">
                        {/* Drag dots — top-right, visible on hover like Klaviyo */}
                        <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-40 transition-opacity">
                          <svg width="10" height="10" viewBox="0 0 10 10" className="text-zinc-400">
                            <circle cx="2" cy="2" r="1" fill="currentColor"/><circle cx="5" cy="2" r="1" fill="currentColor"/><circle cx="8" cy="2" r="1" fill="currentColor"/>
                            <circle cx="2" cy="5" r="1" fill="currentColor"/><circle cx="5" cy="5" r="1" fill="currentColor"/><circle cx="8" cy="5" r="1" fill="currentColor"/>
                          </svg>
                        </div>
                        <span className="select-none">{(() => { const Icon = ICON_MAP[def.icon]; return Icon ? <Icon className="w-[22px] h-[22px] text-zinc-800" strokeWidth={1.5} /> : <span className="text-zinc-800">{def.icon}</span> })()}</span>
                        <span className="text-[10px] font-medium text-zinc-600 leading-tight select-none">{def.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pre-built sections tab */}
        {tab === 'prebuilt' && (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-zinc-900">Secoes prontas</p>
            <div className="grid grid-cols-2 gap-2.5">
              {PREBUILT_SECTIONS.map(section => (
                <button
                  key={section.type}
                  onClick={() => onAddPrebuiltSection?.(section.type)}
                  className="flex flex-col bg-white border border-zinc-200 rounded-xl overflow-hidden hover:border-zinc-400 hover:shadow-md transition-all group text-left"
                >
                  <div className="p-2.5 bg-zinc-50 border-b border-zinc-100 flex items-center justify-center min-h-[72px]">
                    {section.preview}
                  </div>
                  <div className="p-2.5">
                    <p className="text-[11px] font-semibold text-zinc-800 group-hover:text-zinc-900 transition-colors">{section.label}</p>
                    <p className="text-[9px] text-zinc-400 mt-0.5 leading-tight">{section.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Universal content (Saved blocks + sections, Klaviyo/Omnisend parity) ── */}
        {tab === 'saved' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-violet-50 border border-violet-100">
              <Layers className="w-3.5 h-3.5 text-violet-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-violet-900/80 leading-snug">
                Guardado uma vez, usado em vários e-mails. Editar um destes
                muda todos os e-mails que o contêm — o selo diz quantos são.
              </p>
            </div>

            {/* Filter pills: all / blocks / sections */}
            <div className="flex bg-zinc-100 rounded-md p-0.5">
              {([
                { id: 'all' as const, label: 'Tudo', count: savedCount },
                { id: 'blocks' as const, label: 'Blocos', count: blocksCount },
                { id: 'sections' as const, label: 'Seções', count: sectionsCount },
              ]).map(f => (
                <button key={f.id} onClick={() => setSavedFilter(f.id)}
                  className={`flex-1 py-1 text-[10px] font-semibold rounded transition-colors flex items-center justify-center gap-1 ${savedFilter === f.id ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
                  <span>{f.label}</span>
                  <span className="text-[9px] text-zinc-400">{f.count}</span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar universais..."
                className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-zinc-200 rounded-md text-[11px] text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-400" />
            </div>

            {savedLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-4 h-4 border-2 border-zinc-300 border-t-violet-500 rounded-full animate-spin" />
              </div>
            ) : filteredSaved.length === 0 ? (
              <div className="text-center py-10 px-4">
                <Package className="w-9 h-9 text-zinc-300 mx-auto mb-2" />
                <p className="text-[12px] text-zinc-600 font-medium">
                  {savedCount === 0 ? 'Nenhum universal ainda' : 'Nada encontrado'}
                </p>
                <p className="text-[10px] text-zinc-400 mt-1 leading-relaxed">
                  {savedCount === 0
                    ? 'Selecione uma seção ou um bloco no e-mail e clique na estrela da barra de ferramentas para guardar aqui.'
                    : 'Ajuste o filtro ou a busca.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSaved.map((item) => {
                  const isSection = item.kind === 'section'
                  const payloadJson = isSection ? (item.block_json?.section || item.block_json) : item.block_json
                  const renaming = renamingId === item.id
                  return (
                    <div key={item.id}
                      draggable={!renaming}
                      onDragStart={(e) => {
                        if (isSection) {
                          e.dataTransfer.setData('savedSectionJson', JSON.stringify(payloadJson))
                          e.dataTransfer.setData('savedSectionId', item.id)
                          e.dataTransfer.setData('savedSectionName', item.name)
                        } else {
                          e.dataTransfer.setData('savedBlockJson', JSON.stringify(payloadJson))
                          e.dataTransfer.setData('savedBlockId', item.id)
                          e.dataTransfer.setData('savedBlockName', item.name)
                        }
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      onClick={() => {
                        if (renaming) return
                        if (isSection) onAddSavedSection?.(payloadJson, item.id, item.name)
                        else onAddSavedBlock?.(payloadJson, item.id, item.name)
                      }}
                      title={`Inserir neste e-mail — ${usageText(item.usageCount)}`}
                      className="bg-white border border-zinc-200 rounded-lg overflow-hidden hover:border-violet-400 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing group"
                    >
                      {/* A miniatura é o que identifica: "Rodapé preto" e
                          "rodape preto" só se distinguem olhando. */}
                      <UniversalThumb content={payloadJson} kind={item.kind} height={78} />

                      <div className="flex items-center gap-2 px-2 py-1.5">
                        <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${isSection ? 'bg-violet-100 text-violet-600' : 'bg-zinc-100 text-zinc-500'}`}>
                          <UniversalIcon kind={item.kind} className="w-3.5 h-3.5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          {renaming ? (
                            <input
                              autoFocus
                              value={renameValue}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setRenameValue(e.target.value)}
                              onBlur={() => commitRename(item)}
                              onKeyDown={e => {
                                e.stopPropagation()
                                if (e.key === 'Enter') commitRename(item)
                                if (e.key === 'Escape') setRenamingId(null)
                              }}
                              className="w-full px-1.5 py-0.5 border border-violet-300 rounded text-[12px] text-zinc-900 outline-none focus:border-violet-500"
                            />
                          ) : (
                            <p className="text-[12px] font-medium text-zinc-900 truncate leading-tight">{item.name}</p>
                          )}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <UsageBadge count={item.usageCount} />
                            <span className="text-[9px] text-zinc-400">{isSection ? 'Seção' : 'Bloco'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          {busyId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 text-violet-500 animate-spin mx-1" />
                          ) : (
                            <>
                              <button
                                onClick={e => { e.stopPropagation(); onEditUniversal?.(item.id) }}
                                className="p-1 text-zinc-400 hover:text-violet-600 hover:bg-violet-50 rounded"
                                title={`Editar — muda em ${item.usageCount === 1 ? '1 e-mail' : `${item.usageCount} e-mails`}`}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setRenamingId(item.id); setRenameValue(item.name) }}
                                className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded"
                                title="Renomear"
                              >
                                <Type className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); duplicateItem(item) }}
                                className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded"
                                title="Duplicar — para variar sem mexer no original"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setConfirmDelete(item) }}
                                className="p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded"
                                title="Excluir da biblioteca"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Excluir da biblioteca ──
          O conteúdo não some dos e-mails: ele é escrito por extenso em
          cada um antes de a linha ser apagada. O que se perde é o
          vínculo — daqui em diante cada e-mail segue por conta. */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-4" onClick={() => setConfirmDelete(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4.5 h-4.5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold text-gray-900">Excluir “{confirmDelete.name}”?</h3>
                <p className="text-[12px] text-gray-500 leading-relaxed mt-1">
                  {confirmDelete.usageCount === 0
                    ? 'Não está em nenhum e-mail — some sem deixar rastro.'
                    : `Os ${confirmDelete.usageCount} e-mails que usam continuam exatamente como estão: o conteúdo fica gravado neles. O que acaba é o vínculo — a partir daqui, mudar um não muda os outros.`}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancelar
              </button>
              <button
                onClick={() => deleteItem(confirmDelete)}
                disabled={busyId === confirmDelete.id}
                className="px-3.5 py-1.5 bg-red-600 text-white text-[12px] font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {busyId === confirmDelete.id && <Loader2 className="w-3 h-3 animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
