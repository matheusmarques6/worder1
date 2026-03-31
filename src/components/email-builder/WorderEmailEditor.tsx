'use client'

import { useState, useCallback, useEffect } from 'react'
import { ArrowLeft, Save, Send, Loader2, CheckCircle, Undo2, Redo2, Monitor, Smartphone, Plus, Eye, Tag, Copy, Trash2, GripVertical, Palette, X, Columns, Square, PanelLeft, PanelRight, LayoutGrid, Star } from 'lucide-react'
import { DndContext, pointerWithin, PointerSensor, useSensor, useSensors, useDroppable, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BlockPalette } from './panels/BlockPalette'
import { BlockPreview } from './blocks/BlockPreview'
import { BlockProperties } from './panels/BlockProperties'
import { MergeTagPicker } from './modals/MergeTagPicker'
import { SendTestModal } from './modals/SendTestModal'
import { PreviewModal } from './modals/PreviewModal'
import { SectionProperties } from './panels/SectionProperties'
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

// ── Sortable Block Wrapper (drag from anywhere on the block) ──
function SortableBlock({ blockId, children, isSelected, onSelect, onClone, onDelete }: {
  blockId: string; children: React.ReactNode; isSelected: boolean;
  onSelect: () => void; onClone: () => void; onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: blockId,
    data: { type: 'block', blockId },
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1, zIndex: isDragging ? 50 : 'auto' }}
      onClick={e => { e.stopPropagation(); onSelect() }}
      className={`relative group cursor-grab active:cursor-grabbing ${isSelected ? 'ring-2 ring-brand-500 ring-offset-1' : 'hover:ring-1 hover:ring-brand-300'}`}
    >
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

// ── Sortable Section Wrapper (drag sections to reorder) ──
function SortableSection({ sectionId, children }: { sectionId: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sectionId,
    data: { type: 'section', sectionId },
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1, zIndex: isDragging ? 40 : 'auto' }}
    >
      {/* Drag handle for sections — visible on hover */}
      <div className="relative group/sectiondrag">
        <div
          {...attributes}
          {...listeners}
          className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover/sectiondrag:opacity-100 cursor-grab active:cursor-grabbing p-1 text-gray-300 hover:text-indigo-500 transition-opacity z-30 bg-white/80 backdrop-blur-sm rounded shadow-sm border border-gray-200"
          title="Arrastar seção"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Droppable Column (accept blocks into empty columns) ──
function DroppableColumn({ columnId, sectionId, children }: { columnId: string; sectionId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${columnId}`,
    data: { type: 'column', columnId, sectionId },
  })
  return (
    <div ref={setNodeRef} className={`${isOver ? 'ring-2 ring-brand-400 ring-inset bg-brand-50/30' : ''}`}>
      {children}
    </div>
  )
}

// ── Styles Tab (Klaviyo-level) ──
function StylesTab({ doc, setDoc }: { doc: EmailDocument; setDoc: React.Dispatch<React.SetStateAction<EmailDocument>> }) {
  const s = doc.settings
  const update = (key: string, value: any) => setDoc(prev => ({ ...prev, settings: { ...prev.settings, [key]: value } }))

  const ColorRow = ({ label, value, field }: { label: string; value: string; field: string }) => (
    <div>
      <label className="block text-[11px] font-medium text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value || '#ffffff'} onChange={e => update(field, e.target.value)} className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0.5" />
        <input type="text" value={value || ''} onChange={e => update(field, e.target.value)} className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono text-gray-900 focus:border-brand-500 focus:outline-none" />
      </div>
    </div>
  )

  return (
    <div className="p-3 space-y-5 overflow-y-auto h-full">
      {/* Backgrounds */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Fundos</p>
        <div className="space-y-3">
          <ColorRow label="Email" value={s.backgroundColor} field="backgroundColor" />
          <ColorRow label="Conteúdo" value={s.contentBackgroundColor} field="contentBackgroundColor" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Largura</label>
              <input type="number" value={s.contentWidth} onChange={e => update('contentWidth', Number(e.target.value))} min={400} max={800}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 focus:border-brand-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Raio Borda</label>
              <input type="number" value={s.borderRadius} onChange={e => update('borderRadius', Number(e.target.value))} min={0} max={24}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 focus:border-brand-500 focus:outline-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Typography */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Tipografia</p>
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Fonte Global</label>
            <select value={s.fontFamily} onChange={e => update('fontFamily', e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 bg-white focus:border-brand-500 focus:outline-none">
              <option value="'DM Sans', Arial, sans-serif">DM Sans</option>
              <option value="Arial, Helvetica, sans-serif">Arial</option>
              <option value="Georgia, Times, serif">Georgia</option>
              <option value="Verdana, Geneva, sans-serif">Verdana</option>
              <option value="'Inter', sans-serif">Inter</option>
              <option value="'Montserrat', sans-serif">Montserrat</option>
              <option value="Tahoma, Geneva, sans-serif">Tahoma</option>
            </select>
          </div>

          {/* Text Styles - Body + H1-H4 */}
          {[
            { key: 'body', label: 'Body', defaults: { fontSize: 15, color: '#374151', lineHeight: 1.6 } },
            { key: 'h1', label: 'H1', defaults: { fontSize: 28, color: '#111827', lineHeight: 1.3 } },
            { key: 'h2', label: 'H2', defaults: { fontSize: 22, color: '#111827', lineHeight: 1.3 } },
            { key: 'h3', label: 'H3', defaults: { fontSize: 18, color: '#111827', lineHeight: 1.4 } },
            { key: 'h4', label: 'H4', defaults: { fontSize: 16, color: '#374151', lineHeight: 1.4 } },
          ].map(style => {
            const tsKey = style.key as 'body' | 'h1' | 'h2' | 'h3' | 'h4'
            const ts = s.textStyles?.[tsKey] || style.defaults
            const updateTS = (field: string, val: any) => {
              const textStyles: Record<string, any> = { ...(s.textStyles || {}) }
              textStyles[style.key] = { ...ts, [field]: val }
              update('textStyles', textStyles)
            }
            return (
              <details key={style.key} className="group border border-gray-100 rounded-lg">
                <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-semibold text-gray-600 hover:bg-gray-50 rounded-lg">
                  {style.label}
                  <span className="text-[10px] font-normal text-gray-400">{ts.fontSize}px</span>
                </summary>
                <div className="px-3 pb-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400">Tamanho</label>
                      <input type="number" value={ts.fontSize} onChange={e => updateTS('fontSize', Number(e.target.value))} min={8} max={72}
                        className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 focus:border-brand-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">Line Height</label>
                      <input type="number" value={ts.lineHeight} onChange={e => updateTS('lineHeight', Number(e.target.value))} min={0.8} max={3} step={0.1}
                        className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 focus:border-brand-500 focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">Cor</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={ts.color} onChange={e => updateTS('color', e.target.value)} className="w-6 h-6 rounded border border-gray-200 cursor-pointer p-0.5" />
                      <input type="text" value={ts.color} onChange={e => updateTS('color', e.target.value)} className="flex-1 px-2 py-1 border border-gray-200 rounded text-[10px] font-mono text-gray-900 focus:border-brand-500 focus:outline-none" />
                    </div>
                  </div>
                </div>
              </details>
            )
          })}
        </div>
      </div>

      {/* Links */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Links</p>
        <div className="space-y-2">
          <div>
            <label className="text-[11px] font-medium text-gray-500 mb-1 block">Cor do Link</label>
            <div className="flex items-center gap-2">
              <input type="color" value={s.textStyles?.link?.color || '#F97316'} onChange={e => {
                const textStyles = { ...(s.textStyles || {}) }
                textStyles.link = { ...(textStyles.link || {}), color: e.target.value }
                update('textStyles', textStyles)
              }} className="w-6 h-6 rounded border border-gray-200 cursor-pointer p-0.5" />
              <input type="text" value={s.textStyles?.link?.color || '#F97316'} onChange={e => {
                const textStyles = { ...(s.textStyles || {}) }
                textStyles.link = { ...(textStyles.link || {}), color: e.target.value }
                update('textStyles', textStyles)
              }} className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono text-gray-900 focus:border-brand-500 focus:outline-none" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={s.textStyles?.link?.underline !== false}
              onChange={e => {
                const textStyles = { ...(s.textStyles || {}) }
                textStyles.link = { ...(textStyles.link || {}), underline: e.target.checked }
                update('textStyles', textStyles)
              }} className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
            <span className="text-xs text-gray-700">Sublinhado</span>
          </label>
        </div>
      </div>

      {/* Buttons */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Botões Default</p>
        {(['primary', 'secondary'] as const).map(variant => {
          const bs = s.buttonStyles?.[variant] || { bgColor: variant === 'primary' ? '#F97316' : '#FFFFFF', textColor: variant === 'primary' ? '#FFFFFF' : '#F97316', borderRadius: 8, fontWeight: 'bold' }
          const updateBS = (field: string, val: any) => {
            const buttonStyles: Record<string, any> = { ...(s.buttonStyles || {}) }
            buttonStyles[variant] = { ...bs, [field]: val }
            update('buttonStyles', buttonStyles)
          }
          return (
            <details key={variant} className="group border border-gray-100 rounded-lg mb-2">
              <summary className="flex items-center justify-between px-3 py-2 cursor-pointer text-[11px] font-semibold text-gray-600 hover:bg-gray-50 rounded-lg capitalize">
                {variant === 'primary' ? 'Primário' : 'Secundário'}
                <div className="w-5 h-5 rounded" style={{ backgroundColor: bs.bgColor, border: '1px solid #e5e7eb' }} />
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400">Fundo</label>
                    <div className="flex gap-1">
                      <input type="color" value={bs.bgColor} onChange={e => updateBS('bgColor', e.target.value)} className="w-6 h-6 rounded border border-gray-200 p-0.5 cursor-pointer" />
                      <input type="text" value={bs.bgColor} onChange={e => updateBS('bgColor', e.target.value)} className="flex-1 px-1.5 py-1 border border-gray-200 rounded text-[10px] font-mono" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">Texto</label>
                    <div className="flex gap-1">
                      <input type="color" value={bs.textColor} onChange={e => updateBS('textColor', e.target.value)} className="w-6 h-6 rounded border border-gray-200 p-0.5 cursor-pointer" />
                      <input type="text" value={bs.textColor} onChange={e => updateBS('textColor', e.target.value)} className="flex-1 px-1.5 py-1 border border-gray-200 rounded text-[10px] font-mono" />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400">Raio</label>
                    <input type="number" value={bs.borderRadius} onChange={e => updateBS('borderRadius', Number(e.target.value))} min={0} max={50}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 focus:border-brand-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">Peso</label>
                    <select value={bs.fontWeight} onChange={e => updateBS('fontWeight', e.target.value)}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 bg-white focus:border-brand-500 focus:outline-none">
                      <option value="normal">Normal</option>
                      <option value="500">Médio</option>
                      <option value="600">Semibold</option>
                      <option value="bold">Bold</option>
                    </select>
                  </div>
                </div>
              </div>
            </details>
          )
        })}
      </div>

      {/* Preheader */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Preheader</p>
        <input type="text" value={s.preheaderText || ''} onChange={e => update('preheaderText', e.target.value)}
          placeholder="Texto de preview no inbox (aceita {{merge_tags}})"
          className="w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none" />
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
  const [showSaveBlockModal, setShowSaveBlockModal] = useState(false)
  const [showColumnModal, setShowColumnModal] = useState(false)
  const [columnModalCols, setColumnModalCols] = useState(2)
  const [columnModalLayout, setColumnModalLayout] = useState<number[]>([50, 50])
  const [saveBlockName, setSaveBlockName] = useState('')

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

  const cloneSection = useCallback((sectionId: string) => {
    const idx = doc.sections.findIndex(s => s.id === sectionId)
    if (idx === -1) return
    const clone = JSON.parse(JSON.stringify(doc.sections[idx]))
    clone.id = 's_' + Date.now().toString(36)
    clone.columns = clone.columns.map((c: any) => ({ ...c, id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), blocks: c.blocks.map((b: any) => ({ ...b, id: 'b_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) })) }))
    const sections = [...doc.sections]
    sections.splice(idx + 1, 0, clone)
    updateDoc({ ...doc, sections })
    selectSection(clone.id)
  }, [doc, updateDoc, selectSection])

  const updateSectionStyles = useCallback((sectionId: string, patch: Partial<EmailSection['styles']>) => {
    setDoc(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.id === sectionId ? { ...s, styles: { ...s.styles, ...patch } } : s),
    }))
  }, [])

  // ── Block Operations ──
  const addBlock = useCallback((type: string, targetSectionId?: string, targetColumnId?: string) => {
    const block = createBlock(type as any)
    const sections = JSON.parse(JSON.stringify(doc.sections)) as EmailSection[]

    if (targetSectionId && targetColumnId) {
      // Add to specific column
      const section = sections.find(s => s.id === targetSectionId)
      if (section) {
        const column = section.columns.find(c => c.id === targetColumnId)
        if (column) {
          column.blocks.push(block)
          updateDoc({ ...doc, sections })
          selectBlock(block.id)
          return
        }
      }
    }

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

  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  // ── DnD: supports reorder within column, cross-column, cross-section, and section reordering ──
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeData = active.data.current
    const overData = over.data.current

    // ── Section reordering ──
    if (activeData?.type === 'section' && overData?.type === 'section') {
      const oldIdx = doc.sections.findIndex(s => s.id === active.id)
      const newIdx = doc.sections.findIndex(s => s.id === over.id)
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        updateDoc({ ...doc, sections: arrayMove(doc.sections, oldIdx, newIdx) })
      }
      return
    }

    // ── Block reordering / cross-column move ──
    const activeLoc = findBlockLocation(doc, active.id as string)
    if (!activeLoc) return

    const sections = JSON.parse(JSON.stringify(doc.sections)) as EmailSection[]

    // Check if dropped onto an empty column droppable
    if (overData?.type === 'column') {
      const targetSectionIdx = sections.findIndex(s => s.id === overData.sectionId)
      const targetSection = sections[targetSectionIdx]
      if (targetSection) {
        const targetColIdx = targetSection.columns.findIndex((c: any) => c.id === overData.columnId)
        if (targetColIdx !== -1) {
          const srcBlocks = sections[activeLoc.sectionIdx].columns[activeLoc.columnIdx].blocks
          const [moved] = srcBlocks.splice(activeLoc.blockIdx, 1)
          sections[targetSectionIdx].columns[targetColIdx].blocks.push(moved)
          updateDoc({ ...doc, sections })
        }
      }
      return
    }

    const overLoc = findBlockLocation(doc, over.id as string)
    if (!overLoc) return

    // Same column — simple reorder
    if (activeLoc.sectionIdx === overLoc.sectionIdx && activeLoc.columnIdx === overLoc.columnIdx) {
      const blocks = sections[activeLoc.sectionIdx].columns[activeLoc.columnIdx].blocks
      const [moved] = blocks.splice(activeLoc.blockIdx, 1)
      blocks.splice(overLoc.blockIdx, 0, moved)
    } else {
      // Cross-column / cross-section move
      const srcBlocks = sections[activeLoc.sectionIdx].columns[activeLoc.columnIdx].blocks
      const [moved] = srcBlocks.splice(activeLoc.blockIdx, 1)
      const dstBlocks = sections[overLoc.sectionIdx].columns[overLoc.columnIdx].blocks
      dstBlocks.splice(overLoc.blockIdx, 0, moved)
    }

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
      <div className="flex items-center justify-between px-4 h-[52px] bg-white border-b border-gray-200 flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => { if (confirm('Sair sem salvar? Alterações não salvas serão perdidas.')) onBack() }}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors" title="Voltar para templates">
            <ArrowLeft size={18} />
          </button>
          <div className="h-5 w-px bg-gray-200" />
          <span className="text-sm font-semibold text-gray-900 truncate max-w-[250px]">{templateName}</span>
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
        <div className="w-[280px] bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
          <div className="flex border-b border-gray-200 flex-shrink-0">
            <button onClick={() => setLeftTab('content')} className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${leftTab === 'content' ? 'text-brand-600 border-b-2 border-brand-500 -mb-px' : 'text-gray-400 hover:text-gray-600'}`}>Content</button>
            <button onClick={() => setLeftTab('styles')} className={`flex-1 py-2.5 text-[11px] font-semibold transition-colors ${leftTab === 'styles' ? 'text-brand-600 border-b-2 border-brand-500 -mb-px' : 'text-gray-400 hover:text-gray-600'}`}>Styles</button>
          </div>
          <div className="flex-1 overflow-hidden">
            {leftTab === 'content' ? (
              <div className="flex flex-col h-full overflow-y-auto">
                {/* Layout section — Columns + Section like Klaviyo */}
                <div className="p-3 border-b border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Layout</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={() => setShowColumnModal(true)}
                      className="flex flex-col items-center gap-1.5 py-3 px-2 bg-white border border-gray-200 rounded-lg hover:border-brand-400 hover:shadow-sm transition-all cursor-pointer">
                      <Columns className="w-5 h-5 text-gray-500" />
                      <span className="text-[10px] font-medium text-gray-600">Colunas</span>
                    </button>
                    <button onClick={() => addSection([100])}
                      className="flex flex-col items-center gap-1.5 py-3 px-2 bg-white border border-gray-200 rounded-lg hover:border-brand-400 hover:shadow-sm transition-all cursor-pointer">
                      <LayoutGrid className="w-5 h-5 text-gray-500" />
                      <span className="text-[10px] font-medium text-gray-600">Seção</span>
                    </button>
                  </div>
                </div>
                {/* Block palette */}
                <BlockPalette onAddBlock={addBlock} onAddSavedBlock={addSavedBlock} />
              </div>
            ) : (
              <StylesTab doc={doc} setDoc={setDoc} />
            )}
          </div>
        </div>

        {/* ── Canvas ── */}
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: doc.settings.backgroundColor }}
          onDrop={handleDrop} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
          onClick={clearSelection}>
          <div className="py-4">
            {doc.sections.length === 0 ? (
              <div className="mx-auto transition-all duration-300" style={{ maxWidth: canvasWidth }}>
                <div style={{ backgroundColor: doc.settings.contentBackgroundColor, borderRadius: doc.settings.borderRadius, minHeight: 200, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}
                  className="flex flex-col items-center justify-center py-24 text-gray-400">
                  <Plus size={36} className="mb-3 text-gray-300" />
                  <p className="text-sm font-medium text-gray-500">Arraste blocos aqui</p>
                  <p className="text-xs mt-1 text-gray-400">ou adicione um layout na barra lateral</p>
                </div>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <SortableContext items={doc.sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
                {doc.sections.map((section) => (
                  <SortableSection key={section.id} sectionId={section.id}>
                  {/* Section = FULL WIDTH with section color */}
                  <div
                    className={`relative group/section ${selectedSectionId === section.id ? 'ring-2 ring-indigo-400 ring-inset' : 'hover:ring-1 hover:ring-indigo-200 hover:ring-inset'}`}
                    style={{ backgroundColor: section.styles.backgroundColor || undefined }}
                    onClick={e => { e.stopPropagation(); selectSection(section.id) }}
                  >
                      {/* Section toolbar INSIDE the section - always visible */}
                      {selectedSectionId === section.id && (
                        <div className="absolute left-1 top-1 z-20 flex items-center gap-1">
                          <span className="px-2 py-0.5 bg-indigo-500 text-white text-[10px] font-semibold rounded">Seção</span>
                          <div className="flex gap-0.5 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-md shadow-sm px-0.5 py-0.5">
                            <button onClick={e => { e.stopPropagation(); cloneSection(section.id) }}
                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Duplicar">
                              <Copy className="w-3 h-3" />
                            </button>
                            <button onClick={e => { e.stopPropagation(); showToast('Seção salva!') }}
                              className="p-1 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded" title="Salvar">
                              <Star className="w-3 h-3" />
                            </button>
                            <button onClick={e => { e.stopPropagation(); removeSection(section.id) }}
                              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" title="Excluir">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Content area = centered, max-width, with content bg */}
                      <div style={{
                        maxWidth: canvasWidth,
                        margin: '0 auto',
                        backgroundColor: section.styles.contentBackgroundColor || doc.settings.contentBackgroundColor || undefined,
                        borderRadius: doc.settings.borderRadius || undefined,
                      }}>
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
                            <div key={column.id} style={{ width: `${column.width}%`, minHeight: 40 }} className="relative"
                              onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('ring-2', 'ring-brand-400', 'ring-inset', 'bg-brand-50/30') }}
                              onDragLeave={e => { e.currentTarget.classList.remove('ring-2', 'ring-brand-400', 'ring-inset', 'bg-brand-50/30') }}
                              onDrop={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove('ring-2', 'ring-brand-400', 'ring-inset', 'bg-brand-50/30'); const type = e.dataTransfer.getData('blockType'); if (type) addBlock(type, section.id, column.id) }}
                            >
                              {colBlocks.length === 0 ? (
                                <DroppableColumn columnId={column.id} sectionId={section.id}>
                                  <div className="flex items-center justify-center h-full min-h-[60px] border border-dashed border-gray-300 bg-gray-50/50 text-gray-400 text-xs gap-2 rounded">
                                    <span>Solte conteúdo aqui</span>
                                  </div>
                                </DroppableColumn>
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
                                        onClone={() => cloneBlock(block.id)}
                                        onDelete={() => removeBlock(block.id)}
                                      />
                                    </SortableBlock>
                                  ))}
                                </SortableContext>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      </div>{/* close content area wrapper */}
                    </div>
                  </SortableSection>
                  ))}
                </SortableContext>
                </DndContext>
              )}
          </div>
        </div>

        {/* ── Right Sidebar ── */}
        <div className="w-[340px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
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
                  setSaveBlockName('')
                  setShowSaveBlockModal(true)
                }}
              />
            ) : selectedSection ? (
              <SectionProperties
                section={selectedSection}
                onStyleChange={(key, value) => updateSectionStyles(selectedSection.id, { [key]: value })}
                onColumnLayoutChange={(cols) => {
                  setDoc(prev => ({
                    ...prev,
                    sections: prev.sections.map(s => {
                      if (s.id !== selectedSection.id) return s
                      const newCols = cols.map((w, i) => ({
                        id: s.columns[i]?.id || ('c_' + Date.now().toString(36) + '_' + i),
                        width: w,
                        blocks: s.columns[i]?.blocks || [],
                      }))
                      // Move overflow blocks to last column
                      if (s.columns.length > cols.length) {
                        const overflow = s.columns.slice(cols.length).flatMap(c => c.blocks)
                        newCols[newCols.length - 1].blocks.push(...overflow)
                      }
                      return { ...s, columns: newCols }
                    })
                  }))
                }}
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
      <PreviewModal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        html={previewHtml}
        subject={templateName}
        onSendTest={() => { setShowPreview(false); setShowSendTest(true) }}
      />

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

      {/* ── Save Block Modal ── */}
      {showSaveBlockModal && selectedBlock && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowSaveBlockModal(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-[380px] p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Salvar Bloco Reutilizável</h3>
            <input type="text" value={saveBlockName} onChange={e => setSaveBlockName(e.target.value)}
              placeholder="Nome do bloco..." autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none mb-3" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSaveBlockModal(false)}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button disabled={!saveBlockName.trim()} onClick={() => {
                fetch('/api/email/saved-blocks', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: saveBlockName.trim(), block_json: selectedBlock }),
                }).then(() => { showToast('Bloco salvo!'); setShowSaveBlockModal(false) }).catch(() => showToast('Erro', 'error'))
              }} className="px-4 py-2 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Configure Column Layout Modal (Klaviyo-style) ── */}
      {showColumnModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowColumnModal(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-[480px] p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-900">Configurar layout de colunas</h3>
              <button onClick={() => setShowColumnModal(false)} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {/* Number of columns */}
            <p className="text-sm font-medium text-gray-700 mb-2">Número de colunas</p>
            <div className="flex border border-gray-200 rounded-lg overflow-hidden mb-5">
              {[1, 2, 3, 4].map(n => (
                <button key={n} onClick={() => {
                  setColumnModalCols(n)
                  if (n === 1) setColumnModalLayout([100])
                  else if (n === 2) setColumnModalLayout([50, 50])
                  else if (n === 3) setColumnModalLayout([33, 34, 33])
                  else setColumnModalLayout([25, 25, 25, 25])
                }}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${columnModalCols === n ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {n}
                </button>
              ))}
            </div>

            {/* Column layout */}
            {columnModalCols >= 2 && (
              <>
                <p className="text-sm font-medium text-gray-700 mb-2">Layout das colunas</p>
                <div className="grid grid-cols-3 gap-2 mb-5">
                  {(columnModalCols === 2 ? [
                    { label: 'Igual', cols: [50, 50] },
                    { label: '33% | 67%', cols: [33, 67] },
                    { label: '67% | 33%', cols: [67, 33] },
                    { label: '25% | 75%', cols: [25, 75] },
                    { label: '75% | 25%', cols: [75, 25] },
                  ] : columnModalCols === 3 ? [
                    { label: 'Igual', cols: [33, 34, 33] },
                    { label: '25% | 50% | 25%', cols: [25, 50, 25] },
                    { label: '50% | 25% | 25%', cols: [50, 25, 25] },
                  ] : [
                    { label: 'Igual', cols: [25, 25, 25, 25] },
                  ]).map(opt => {
                    const isActive = JSON.stringify(columnModalLayout) === JSON.stringify(opt.cols)
                    return (
                      <button key={opt.label} onClick={() => setColumnModalLayout(opt.cols)}
                        className={`p-3 border-2 rounded-lg text-center transition-all ${isActive ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <div className="flex gap-0.5 justify-center mb-1">
                          {opt.cols.map((w, i) => (
                            <div key={i} className={`h-5 rounded-sm ${isActive ? 'bg-brand-500' : 'bg-gray-300'}`} style={{ width: `${w * 0.6}px` }} />
                          ))}
                        </div>
                        <span className="text-[10px] text-gray-600">{opt.label}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowColumnModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={() => { addSection(columnModalLayout); setShowColumnModal(false) }}
                className="px-4 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800">
                Adicionar colunas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
