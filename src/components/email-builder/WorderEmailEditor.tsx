'use client'

import { useState, useCallback, useEffect } from 'react'
import { ArrowLeft, Save, Send, Loader2, CheckCircle, Undo2, Redo2, Monitor, Smartphone, Plus, Eye, Tag, Copy, Trash2, GripVertical, Palette, X, Columns, Square, PanelLeft, PanelRight, LayoutGrid } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BlockPalette } from './panels/BlockPalette'
import { BlockPreview } from './blocks/BlockPreview'
import { BlockProperties } from './panels/BlockProperties'
import { MergeTagPicker } from './modals/MergeTagPicker'
import { SendTestModal } from './modals/SendTestModal'
import {
  BLOCK_DEFS, SECTION_LAYOUTS, createBlock, createSection, migrateV1toV2, DEFAULT_DOCUMENT,
  type EmailBlock, type EmailDocument, type EmailSection,
} from './config/types'
import { renderDocumentToHtml } from '@/lib/email/render-html'

interface WorderEmailEditorProps {
  templateName: string
  design?: EmailDocument | Record<string, any>
  onSave: (design: Record<string, any>, html: string) => Promise<boolean>
  onBack: () => void
}

// ── Sortable Block Wrapper ──
function SortableBlock({ blockId, children, isSelected, onSelect, onClone, onDelete }: {
  blockId: string; children: React.ReactNode; isSelected: boolean;
  onSelect: () => void; onClone: () => void; onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: blockId })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 50 : 'auto' }}
      onClick={e => { e.stopPropagation(); onSelect() }}
      className={`relative group ${isSelected ? 'ring-2 ring-brand-500 ring-offset-1' : 'hover:ring-1 hover:ring-brand-300'}`}
    >
      <div {...attributes} {...listeners}
        className="absolute -left-7 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5 text-gray-300 hover:text-gray-500 transition-opacity z-10">
        <GripVertical className="w-4 h-4" />
      </div>
      {isSelected && (
        <div className="absolute -right-9 top-0 flex flex-col gap-0.5 bg-white border border-gray-200 rounded-lg shadow-md p-0.5 z-20">
          <button onClick={e => { e.stopPropagation(); onClone() }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Duplicar"><Copy className="w-3.5 h-3.5" /></button>
          <button onClick={e => { e.stopPropagation(); onDelete() }} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" title="Excluir"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {children}
    </div>
  )
}

// ── Section Properties Panel ──
function SectionProperties({ section, onChange }: { section: EmailSection; onChange: (patch: Partial<EmailSection['styles']>) => void }) {
  const s = section.styles
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-[11px] font-medium text-gray-500 mb-1">Cor de Fundo</label>
        <div className="flex items-center gap-2">
          <input type="color" value={s.backgroundColor || '#ffffff'} onChange={e => onChange({ backgroundColor: e.target.value })}
            className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5" />
          <input type="text" value={s.backgroundColor || ''} onChange={e => onChange({ backgroundColor: e.target.value })}
            placeholder="Transparente" className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono text-gray-900" />
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Padding</label>
        <div className="grid grid-cols-2 gap-2">
          {(['top', 'right', 'bottom', 'left'] as const).map(side => (
            <div key={side} className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 w-3 capitalize">{side[0].toUpperCase()}</span>
              <input type="number" min={0} max={100} value={s.padding[side]}
                onChange={e => onChange({ padding: { ...s.padding, [side]: Number(e.target.value) } })}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-900" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-medium text-gray-500">Empilhar no Mobile</label>
        <button onClick={() => onChange({ stackOnMobile: !s.stackOnMobile })}
          className={`relative w-9 h-5 rounded-full transition-colors ${s.stackOnMobile ? 'bg-brand-500' : 'bg-gray-300'}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${s.stackOnMobile ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>
    </div>
  )
}

// ── Helpers ──
function findBlockLocation(doc: EmailDocument, blockId: string): { sectionIdx: number; columnIdx: number; blockIdx: number } | null {
  for (let si = 0; si < doc.sections.length; si++) {
    for (let ci = 0; ci < doc.sections[si].columns.length; ci++) {
      const bi = doc.sections[si].columns[ci].blocks.findIndex(b => b.id === blockId)
      if (bi !== -1) return { sectionIdx: si, columnIdx: ci, blockIdx: bi }
    }
  }
  return null
}

function allBlocks(doc: EmailDocument): EmailBlock[] {
  return doc.sections.flatMap(s => s.columns.flatMap(c => c.blocks))
}

const LAYOUT_ICONS: Record<string, typeof Square> = { Square, Columns, PanelLeft, PanelRight, LayoutGrid }

export default function WorderEmailEditor({ templateName, design, onSave, onBack }: WorderEmailEditorProps) {
  // ── State ──
  const [doc, setDoc] = useState<EmailDocument>(() => {
    if (design) return migrateV1toV2(design)
    return JSON.parse(JSON.stringify(DEFAULT_DOCUMENT))
  })
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [leftTab, setLeftTab] = useState<'content' | 'styles'>('content')
  const [previewHtml, setPreviewHtml] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [showMergeTags, setShowMergeTags] = useState(false)
  const [showSendTest, setShowSendTest] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Undo/Redo
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)

  const selectedBlock = selectedBlockId ? allBlocks(doc).find(b => b.id === selectedBlockId) || null : null
  const selectedSection = selectedSectionId ? doc.sections.find(s => s.id === selectedSectionId) || null : null

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const pushHistory = useCallback((newDoc: EmailDocument) => {
    const json = JSON.stringify(newDoc)
    setHistory(prev => [...prev.slice(0, historyIdx + 1), json].slice(-40))
    setHistoryIdx(prev => prev + 1)
  }, [historyIdx])

  const updateDoc = useCallback((newDoc: EmailDocument) => {
    setDoc(newDoc)
    pushHistory(newDoc)
  }, [pushHistory])

  const undo = useCallback(() => {
    if (historyIdx > 0) { setHistoryIdx(prev => prev - 1); setDoc(JSON.parse(history[historyIdx - 1])) }
  }, [history, historyIdx])

  const redo = useCallback(() => {
    if (historyIdx < history.length - 1) { setHistoryIdx(prev => prev + 1); setDoc(JSON.parse(history[historyIdx + 1])) }
  }, [history, historyIdx])

  // ── Selection helpers ──
  const selectBlock = useCallback((blockId: string) => {
    setSelectedBlockId(blockId)
    setSelectedSectionId(null)
  }, [])

  const selectSection = useCallback((sectionId: string) => {
    setSelectedSectionId(sectionId)
    setSelectedBlockId(null)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedBlockId(null)
    setSelectedSectionId(null)
  }, [])

  // ── Section Operations ──
  const addSection = useCallback((columnWidths: number[] = [100]) => {
    const section = createSection(columnWidths)
    updateDoc({ ...doc, sections: [...doc.sections, section] })
    selectSection(section.id)
  }, [doc, updateDoc, selectSection])

  const removeSection = useCallback((sectionId: string) => {
    updateDoc({ ...doc, sections: doc.sections.filter(s => s.id !== sectionId) })
    if (selectedSectionId === sectionId) clearSelection()
  }, [doc, updateDoc, selectedSectionId, clearSelection])

  const updateSectionStyles = useCallback((sectionId: string, patch: Partial<EmailSection['styles']>) => {
    setDoc(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === sectionId ? { ...s, styles: { ...s.styles, ...patch } } : s),
    }))
  }, [])

  // ── Block Operations ──
  const addBlock = useCallback((type: string) => {
    const block = createBlock(type as any)
    const sections = JSON.parse(JSON.stringify(doc.sections)) as EmailSection[]
    if (sections.length === 0) {
      const section = createSection([100])
      section.columns[0].blocks.push(block)
      sections.push(section)
    } else {
      const lastSection = sections[sections.length - 1]
      lastSection.columns[0].blocks.push(block)
    }
    updateDoc({ ...doc, sections })
    selectBlock(block.id)
  }, [doc, updateDoc, selectBlock])

  const addSavedBlock = useCallback((blockJson: any) => {
    if (!blockJson) return
    const restored: EmailBlock = { ...blockJson, id: 'b_' + Math.random().toString(36).substring(2, 9) }
    const sections = JSON.parse(JSON.stringify(doc.sections)) as EmailSection[]
    if (sections.length === 0) {
      const section = createSection([100])
      section.columns[0].blocks.push(restored)
      sections.push(section)
    } else {
      const lastSection = sections[sections.length - 1]
      lastSection.columns[0].blocks.push(restored)
    }
    updateDoc({ ...doc, sections })
    selectBlock(restored.id)
  }, [doc, updateDoc, selectBlock])

  const removeBlock = useCallback((id: string) => {
    const loc = findBlockLocation(doc, id)
    if (!loc) return
    const sections = JSON.parse(JSON.stringify(doc.sections)) as EmailSection[]
    sections[loc.sectionIdx].columns[loc.columnIdx].blocks.splice(loc.blockIdx, 1)
    updateDoc({ ...doc, sections })
    if (selectedBlockId === id) setSelectedBlockId(null)
  }, [doc, selectedBlockId, updateDoc])

  const cloneBlock = useCallback((id: string) => {
    const loc = findBlockLocation(doc, id)
    if (!loc) return
    const sections = JSON.parse(JSON.stringify(doc.sections)) as EmailSection[]
    const original = sections[loc.sectionIdx].columns[loc.columnIdx].blocks[loc.blockIdx]
    const clone: EmailBlock = { ...JSON.parse(JSON.stringify(original)), id: 'b_' + Math.random().toString(36).substring(2, 9) }
    sections[loc.sectionIdx].columns[loc.columnIdx].blocks.splice(loc.blockIdx + 1, 0, clone)
    updateDoc({ ...doc, sections })
    selectBlock(clone.id)
  }, [doc, updateDoc, selectBlock])

  const moveBlock = useCallback((id: string, dir: 'up' | 'down') => {
    const loc = findBlockLocation(doc, id)
    if (!loc) return
    const sections = JSON.parse(JSON.stringify(doc.sections)) as EmailSection[]
    const blocks = sections[loc.sectionIdx].columns[loc.columnIdx].blocks
    const target = dir === 'up' ? loc.blockIdx - 1 : loc.blockIdx + 1
    if (target < 0 || target >= blocks.length) return
    ;[blocks[loc.blockIdx], blocks[target]] = [blocks[target], blocks[loc.blockIdx]]
    updateDoc({ ...doc, sections })
  }, [doc, updateDoc])

  const updateProp = useCallback((id: string, key: string, value: any) => {
    setDoc(prev => ({
      ...prev,
      sections: prev.sections.map(s => ({
        ...s,
        columns: s.columns.map(c => ({
          ...c,
          blocks: c.blocks.map(b => b.id === id ? { ...b, props: { ...b.props, [key]: value } } : b),
        })),
      })),
    }))
  }, [])

  // ── DnD within a column ──
  const handleSortEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeLoc = findBlockLocation(doc, active.id as string)
    const overLoc = findBlockLocation(doc, over.id as string)
    if (!activeLoc || !overLoc) return
    if (activeLoc.sectionIdx !== overLoc.sectionIdx || activeLoc.columnIdx !== overLoc.columnIdx) return
    const sections = JSON.parse(JSON.stringify(doc.sections)) as EmailSection[]
    const blocks = sections[activeLoc.sectionIdx].columns[activeLoc.columnIdx].blocks
    const [moved] = blocks.splice(activeLoc.blockIdx, 1)
    blocks.splice(overLoc.blockIdx, 0, moved)
    updateDoc({ ...doc, sections })
  }, [doc, updateDoc])

  // ── Drop from palette ──
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('blockType')
    if (type) addBlock(type)
  }, [addBlock])

  // ── Save ──
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const html = renderDocumentToHtml(doc)
      const success = await onSave(doc as any, html)
      if (success) showToast('Template salvo com sucesso!')
    } catch (err: any) { showToast('Erro: ' + err.message, 'error') }
    setSaving(false)
  }, [doc, onSave, showToast])

  // ── Preview ──
  const handlePreview = useCallback(() => {
    setPreviewHtml(renderDocumentToHtml(doc))
    setShowPreview(true)
  }, [doc])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      if (e.key === 'Delete' && selectedBlockId) removeBlock(selectedBlockId)
      if (e.key === 'Escape') { clearSelection(); setShowPreview(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave, undo, redo, selectedBlockId, removeBlock, clearSelection])

  const canvasWidth = device === 'mobile' ? 375 : doc.settings.contentWidth
  const isSaved = toast?.type === 'success' && toast.msg.includes('salvo')

  // ── Render ──
  return (
    <div className="flex flex-col h-screen w-screen bg-gray-100 overflow-hidden">
      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-3 h-[52px] bg-white border-b border-gray-200 flex-shrink-0 z-20">
        <div className="flex items-center gap-2.5">
          <button onClick={onBack} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <span className="text-sm font-semibold text-gray-900 truncate max-w-[200px]">{templateName}</span>
          <span className="text-[9px] px-1.5 py-0.5 bg-brand-100 text-brand-700 rounded font-bold tracking-wider hidden sm:inline">WORDER</span>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={historyIdx <= 0} className="p-1.5 text-gray-400 hover:text-gray-700 rounded disabled:opacity-30" title="Desfazer"><Undo2 size={15} /></button>
          <button onClick={redo} disabled={historyIdx >= history.length - 1} className="p-1.5 text-gray-400 hover:text-gray-700 rounded disabled:opacity-30" title="Refazer"><Redo2 size={15} /></button>
          <div className="w-px h-4 bg-gray-200 mx-1" />
          <button onClick={() => setDevice('desktop')} className={`p-1.5 rounded transition-colors ${device === 'desktop' ? 'text-brand-600 bg-brand-50' : 'text-gray-400 hover:text-gray-700'}`}><Monitor size={15} /></button>
          <button onClick={() => setDevice('mobile')} className={`p-1.5 rounded transition-colors ${device === 'mobile' ? 'text-brand-600 bg-brand-50' : 'text-gray-400 hover:text-gray-700'}`}><Smartphone size={15} /></button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowMergeTags(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors" title="Merge Tags">
            <Tag size={14} /> Tags
          </button>
          <button onClick={handlePreview} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            <Eye size={14} /> Preview
          </button>
          <button onClick={() => setShowSendTest(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
            <Send size={14} /> Teste
          </button>
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-500 text-white text-xs font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : isSaved ? <CheckCircle size={14} /> : <Save size={14} />}
            {saving ? 'Salvando...' : isSaved ? 'Salvo!' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* ── Main Layout ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar ── */}
        <div className="w-[240px] bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
          <div className="flex border-b border-gray-200 flex-shrink-0">
            <button onClick={() => setLeftTab('content')} className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${leftTab === 'content' ? 'text-brand-600 border-b-2 border-brand-500 -mb-px' : 'text-gray-400 hover:text-gray-600'}`}>Content</button>
            <button onClick={() => setLeftTab('styles')} className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${leftTab === 'styles' ? 'text-brand-600 border-b-2 border-brand-500 -mb-px' : 'text-gray-400 hover:text-gray-600'}`}>Styles</button>
          </div>
          <div className="flex-1 overflow-hidden">
            {leftTab === 'content' ? (
              <div className="flex flex-col h-full overflow-y-auto">
                {/* Layouts sub-section */}
                <div className="p-3 border-b border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Layouts</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SECTION_LAYOUTS.map(layout => {
                      const Icon = LAYOUT_ICONS[layout.icon] || Square
                      return (
                        <button key={layout.label} onClick={() => addSection(layout.columns)}
                          className="flex flex-col items-center gap-1 p-2 rounded-lg border border-gray-100 hover:border-brand-300 hover:bg-brand-50 transition-colors text-gray-500 hover:text-brand-600">
                          <Icon className="w-4 h-4" />
                          <span className="text-[9px] font-medium leading-tight text-center">{layout.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                {/* Block palette */}
                <BlockPalette onAddBlock={addBlock} onAddSavedBlock={addSavedBlock} />
              </div>
            ) : (
              <div className="p-4 space-y-4 overflow-y-auto h-full">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Fundo do Email</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={doc.settings.backgroundColor} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, backgroundColor: e.target.value } }))}
                      className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5" />
                    <input type="text" value={doc.settings.backgroundColor} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, backgroundColor: e.target.value } }))}
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono text-gray-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Fundo do Conteudo</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={doc.settings.contentBackgroundColor} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, contentBackgroundColor: e.target.value } }))}
                      className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5" />
                    <input type="text" value={doc.settings.contentBackgroundColor} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, contentBackgroundColor: e.target.value } }))}
                      className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono text-gray-900" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Largura (px)</label>
                  <input type="number" value={doc.settings.contentWidth} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, contentWidth: Number(e.target.value) } }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm text-gray-900" min={400} max={800} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Raio da Borda</label>
                  <input type="number" value={doc.settings.borderRadius} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, borderRadius: Number(e.target.value) } }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm text-gray-900" min={0} max={24} />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Fonte</label>
                  <select value={doc.settings.fontFamily} onChange={e => setDoc(prev => ({ ...prev, settings: { ...prev.settings, fontFamily: e.target.value } }))}
                    className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm text-gray-900 bg-white">
                    <option value="'DM Sans', Arial, Helvetica, sans-serif">DM Sans</option>
                    <option value="Arial, Helvetica, sans-serif">Arial</option>
                    <option value="Georgia, Times, serif">Georgia</option>
                    <option value="'Courier New', Courier, monospace">Courier New</option>
                    <option value="Verdana, Geneva, sans-serif">Verdana</option>
                    <option value="Tahoma, Geneva, sans-serif">Tahoma</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Canvas ── */}
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: doc.settings.backgroundColor }}
          onDrop={handleDrop} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
          onClick={clearSelection}>
          <div className="transition-all duration-300 mx-auto my-6" style={{ maxWidth: canvasWidth }}>
            <div style={{
              backgroundColor: doc.settings.contentBackgroundColor,
              borderRadius: doc.settings.borderRadius,
              minHeight: 200,
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              overflow: 'hidden',
            }}>
              {doc.sections.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-gray-400">
                  <Plus size={36} className="mb-3 text-gray-300" />
                  <p className="text-sm font-medium text-gray-500">Arraste blocos aqui</p>
                  <p className="text-xs mt-1 text-gray-400">ou adicione um layout na barra lateral</p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSortEnd}>
                  {doc.sections.map((section) => (
                    <div
                      key={section.id}
                      className={`relative group/section ${selectedSectionId === section.id ? 'ring-2 ring-indigo-400 ring-inset' : 'hover:ring-1 hover:ring-indigo-200 hover:ring-inset'}`}
                      style={{ backgroundColor: section.styles.backgroundColor || undefined }}
                      onClick={e => { e.stopPropagation(); selectSection(section.id) }}
                    >
                      {/* Section toolbar */}
                      {selectedSectionId === section.id && (
                        <div className="absolute -right-9 top-0 flex flex-col gap-0.5 bg-white border border-gray-200 rounded-lg shadow-md p-0.5 z-20">
                          <button onClick={e => { e.stopPropagation(); removeSection(section.id) }}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" title="Excluir secao">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          gap: 0,
                          padding: `${section.styles.padding.top}px ${section.styles.padding.right}px ${section.styles.padding.bottom}px ${section.styles.padding.left}px`,
                        }}
                      >
                        {section.columns.map((column) => {
                          const colBlocks = column.blocks
                          return (
                            <div key={column.id} style={{ width: `${column.width}%`, minHeight: 40 }} className="relative">
                              {colBlocks.length === 0 ? (
                                <div className="flex items-center justify-center h-full min-h-[60px] border border-dashed border-gray-200 rounded text-gray-300 text-xs">
                                  <Plus className="w-3.5 h-3.5" />
                                </div>
                              ) : (
                                <SortableContext items={colBlocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                                  {colBlocks.map((block) => (
                                    <SortableBlock
                                      key={block.id}
                                      blockId={block.id}
                                      isSelected={selectedBlockId === block.id}
                                      onSelect={() => selectBlock(block.id)}
                                      onClone={() => cloneBlock(block.id)}
                                      onDelete={() => removeBlock(block.id)}
                                    >
                                      <BlockPreview
                                        block={block}
                                        selected={selectedBlockId === block.id}
                                        onSelect={() => selectBlock(block.id)}
                                        onMoveUp={() => moveBlock(block.id, 'up')}
                                        onMoveDown={() => moveBlock(block.id, 'down')}
                                        onClone={() => cloneBlock(block.id)}
                                        onDelete={() => removeBlock(block.id)}
                                        isFirst={false}
                                        isLast={false}
                                      />
                                    </SortableBlock>
                                  ))}
                                </SortableContext>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </DndContext>
              )}
            </div>
          </div>
        </div>

        {/* ── Right Sidebar ── */}
        <div className="w-[280px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
          <div className="py-2.5 px-4 border-b border-gray-200 flex-shrink-0">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              {selectedBlock ? (BLOCK_DEFS.find(d => d.type === selectedBlock.type)?.label || selectedBlock.type)
                : selectedSection ? 'Secao' : 'Propriedades'}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {selectedBlock ? (
              <BlockProperties
                block={selectedBlock}
                onChange={(key, value) => updateProp(selectedBlock.id, key, value)}
                onSaveAsReusable={() => {
                  const name = prompt('Nome do bloco reutilizavel:')
                  if (!name) return
                  fetch('/api/email/saved-blocks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, block_json: selectedBlock }),
                  }).then(() => showToast('Bloco salvo!')).catch(() => showToast('Erro ao salvar bloco', 'error'))
                }}
              />
            ) : selectedSection ? (
              <SectionProperties
                section={selectedSection}
                onChange={(patch) => updateSectionStyles(selectedSection.id, patch)}
              />
            ) : (
              <div className="text-center py-16 text-gray-400">
                <span className="block mb-3"><Palette className="w-8 h-8 text-gray-300 mx-auto" /></span>
                <p className="text-xs font-medium text-gray-500">Selecione um bloco ou secao</p>
                <p className="text-[10px] text-gray-400 mt-1">para editar suas propriedades</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Preview Modal ── */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8" onClick={() => setShowPreview(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-[680px] w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-900">Preview do Email</span>
              <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-100">
              <iframe srcDoc={previewHtml} title="Preview" className="w-full border border-gray-200 rounded bg-white" style={{ height: 600 }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Send Test Modal ── */}
      <SendTestModal
        isOpen={showSendTest}
        onClose={() => setShowSendTest(false)}
        html={renderDocumentToHtml(doc)}
        defaultSubject={templateName}
      />

      {/* ── Merge Tag Picker Modal ── */}
      <MergeTagPicker
        isOpen={showMergeTags}
        onClose={() => setShowMergeTags(false)}
        onSelect={(tag) => {
          navigator.clipboard.writeText(tag).catch(() => {})
          setShowMergeTags(false)
        }}
      />
    </div>
  )
}
