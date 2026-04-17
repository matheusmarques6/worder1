'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { ArrowLeft, Save, Send, Loader2, CheckCircle, Undo2, Redo2, Monitor, Smartphone, Plus, Eye, Tag, Copy, Trash2, GripVertical, X, Columns, Square, PanelLeft, PanelRight, LayoutGrid, Star, RotateCcw } from 'lucide-react'
import { DndContext, pointerWithin, PointerSensor, useSensor, useSensors, useDroppable, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BlockPalette } from './panels/BlockPalette'
import { BlockPreview } from './blocks/BlockPreview'
import { BlockProperties } from './panels/BlockProperties'
import { MergeTagPicker } from './modals/MergeTagPicker'
import { SendTestModal } from './modals/SendTestModal'
import { PreviewModal } from './modals/PreviewModal'
import { EmailPreviewMode } from '../flow-builder/panels/EmailPreviewMode'
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
  onRename?: (name: string) => void
  flowContext?: {
    templateId: string
    triggerType: string
    organizationId: string
  }
}

// ── Sortable Block Wrapper (drag from anywhere on the block) ──
function SortableBlock({
  blockId, children, isSelected, onSelect, onClone, onDelete,
  isUniversal, savedBlockName, onSaveAsUniversal, onUnlink,
  hiddenOnDevice,
}: {
  blockId: string;
  children: React.ReactNode;
  isSelected: boolean;
  onSelect: () => void;
  onClone: () => void;
  onDelete: () => void;
  isUniversal: boolean;
  savedBlockName?: string;
  onSaveAsUniversal: () => void;
  onUnlink: () => void;
  /** 'desktop' | 'mobile' when the block is hidden on the currently previewed device */
  hiddenOnDevice?: 'desktop' | 'mobile' | null;
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
      className={`relative group cursor-grab active:cursor-grabbing ${isSelected ? 'ring-2 ring-brand-500 ring-offset-1' : isUniversal ? 'hover:ring-1 hover:ring-violet-300' : 'hover:ring-1 hover:ring-brand-300'}`}
    >
      {/* Universal badge — always visible when linked to saved block */}
      {isUniversal && (
        <div
          className="absolute left-1 top-1 z-20 flex items-center gap-1 px-1.5 py-0.5 bg-violet-500 text-white text-[10px] font-semibold rounded shadow-sm"
          title={savedBlockName ? `Bloco universal: ${savedBlockName}` : 'Bloco universal'}
        >
          <Star className="w-2.5 h-2.5 fill-white" />
          <span className="uppercase tracking-wide">Universal</span>
        </div>
      )}

      {/* Hidden-on-device indicator: dim + diagonal stripes so the user sees
          that visibility settings are taking effect in the current preview. */}
      {hiddenOnDevice && (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-10 bg-gray-100/60"
            style={{ backgroundImage: 'repeating-linear-gradient(-45deg, rgba(0,0,0,0.04) 0 6px, transparent 6px 12px)' }}
          />
          <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 z-20 flex items-center gap-1 px-1.5 py-0.5 bg-gray-900/85 text-white text-[10px] font-semibold rounded shadow">
            {hiddenOnDevice === 'desktop' ? 'Oculto no Desktop' : 'Oculto no Mobile'}
          </div>
        </>
      )}

      {/* Hover toolbar — appears on hover OR when selected */}
      <div
        className={`absolute -right-9 top-0 flex flex-col gap-0.5 bg-white border border-gray-200 rounded-lg shadow-md p-0.5 z-30 transition-opacity ${
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <button
          onClick={e => { e.stopPropagation(); onClone() }}
          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
          title="Duplicar"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        {isUniversal ? (
          <button
            onClick={e => { e.stopPropagation(); onUnlink() }}
            className="p-1.5 text-violet-500 hover:text-amber-600 hover:bg-amber-50 rounded"
            title="Desvincular do bloco universal (editar só aqui)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onSaveAsUniversal() }}
            className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded"
            title="Salvar como bloco universal"
          >
            <Star className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
          title="Excluir"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Universal overlay tint — subtle indicator the whole block is linked */}
      {isUniversal && !isSelected && (
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-violet-200/60 rounded-[1px]" />
      )}

      {children}
    </div>
  )
}

// ── Sortable Section Wrapper (drag sections to reorder) ──
function SortableSection({ sectionId, children, isSelected, hiddenOnDevice, isUniversal, savedSectionName }: {
  sectionId: string;
  children: React.ReactNode;
  isSelected: boolean;
  /** 'desktop' | 'mobile' when the section is hidden on the currently previewed device */
  hiddenOnDevice?: 'desktop' | 'mobile' | null;
  /** True when the section is linked to a saved_section in the library */
  isUniversal?: boolean;
  savedSectionName?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sectionId,
    data: { type: 'section', sectionId },
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1, zIndex: isDragging ? 40 : 'auto' }}
      className="relative group/sectiondrag"
    >
      {/* Drag handle inside the section at top-right — always accessible */}
      <div
        {...attributes}
        {...listeners}
        className={`absolute right-2 top-2 cursor-grab active:cursor-grabbing p-1.5 rounded-md z-30 transition-all ${isSelected ? 'opacity-100 bg-indigo-100 text-indigo-600' : 'opacity-0 group-hover/sectiondrag:opacity-100 bg-white/90 text-gray-400 hover:text-indigo-500 border border-gray-200 shadow-sm'}`}
        title="Arrastar seção"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      {/* Hidden-on-device indicator for the whole section */}
      {hiddenOnDevice && (
        <>
          <div
            className="pointer-events-none absolute inset-0 z-10 bg-gray-100/60"
            style={{ backgroundImage: 'repeating-linear-gradient(-45deg, rgba(0,0,0,0.05) 0 8px, transparent 8px 16px)' }}
          />
          <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 z-20 flex items-center gap-1 px-2 py-0.5 bg-indigo-700/90 text-white text-[10px] font-semibold rounded shadow">
            {hiddenOnDevice === 'desktop' ? 'Seção oculta no Desktop' : 'Seção oculta no Mobile'}
          </div>
        </>
      )}
      {/* Universal section badge — mirrors the block-level badge so users can
          see at a glance which sections are linked to the library. */}
      {isUniversal && !isSelected && (
        <>
          <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-violet-300/60 z-[5]" />
          <div
            className="absolute left-1 top-1 z-20 flex items-center gap-1 px-1.5 py-0.5 bg-violet-500 text-white text-[10px] font-semibold rounded shadow-sm"
            title={savedSectionName ? `Seção universal: ${savedSectionName}` : 'Seção universal'}
          >
            <Star className="w-2.5 h-2.5 fill-white" />
            <span className="uppercase tracking-wide">Universal</span>
          </div>
        </>
      )}
      {children}
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

// ── Inline Color Picker (click to open, doesn't close on drag) ──
function InlineColorPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const handler = (e: MouseEvent) => { if (!node.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  return (
    <div ref={ref} className="relative">
      {label && <label className="block text-[11px] font-medium text-gray-500 mb-1">{label}</label>}
      <div className="flex items-center gap-1.5">
        <button onClick={() => setOpen(!open)} className="w-8 h-8 rounded-lg border-2 border-gray-200 cursor-pointer flex-shrink-0 hover:border-gray-400 transition-colors" style={{ backgroundColor: value || '#ffffff' }} />
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder="#000000"
          className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-mono text-gray-900 focus:border-brand-500 focus:outline-none" />
      </div>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-3" onMouseDown={e => e.stopPropagation()}>
          <input type="color" value={value || '#ffffff'} onChange={e => onChange(e.target.value)}
            className="w-48 h-36 rounded-lg cursor-pointer border-0 p-0 block" />
        </div>
      )}
    </div>
  )
}

// ── Styles Tab ──
function StylesTab({ doc, setDoc }: { doc: EmailDocument; setDoc: React.Dispatch<React.SetStateAction<EmailDocument>> }) {
  const s = doc.settings
  const update = (key: string, value: any) => setDoc(prev => ({ ...prev, settings: { ...prev.settings, [key]: value } }))

  const FONTS = [
    { value: "'DM Sans', Arial, sans-serif", label: 'DM Sans' },
    { value: "Arial, Helvetica, sans-serif", label: 'Arial' },
    { value: "Georgia, Times, serif", label: 'Georgia' },
    { value: "Verdana, Geneva, sans-serif", label: 'Verdana' },
    { value: "'Inter', Arial, sans-serif", label: 'Inter' },
    { value: "'Montserrat', Arial, sans-serif", label: 'Montserrat' },
    { value: "'Roboto', Arial, sans-serif", label: 'Roboto' },
    { value: "Tahoma, Geneva, sans-serif", label: 'Tahoma' },
    { value: "'Trebuchet MS', sans-serif", label: 'Trebuchet MS' },
  ]

  return (
    <div className="overflow-y-auto h-full">
      {/* ── Layout & Fundos ── */}
      <div className="p-4 space-y-4 border-b border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Layout</p>
        <div className="space-y-3">
          <InlineColorPicker label="Fundo do Email" value={s.backgroundColor} onChange={v => update('backgroundColor', v)} />
          <InlineColorPicker label="Fundo do Conteúdo" value={s.contentBackgroundColor} onChange={v => update('contentBackgroundColor', v)} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Largura (px)</label>
              <input type="number" value={s.contentWidth} onChange={e => update('contentWidth', Number(e.target.value))} min={400} max={800}
                className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 focus:outline-none transition-all" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Bordas</label>
              <input type="number" value={s.borderRadius} onChange={e => update('borderRadius', Number(e.target.value))} min={0} max={24}
                className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 focus:outline-none transition-all" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Tipografia ── */}
      <div className="p-4 space-y-4 border-b border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tipografia</p>
        <div>
          <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Fonte Global</label>
          <select value={s.fontFamily} onChange={e => update('fontFamily', e.target.value)}
            className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 focus:outline-none transition-all"
            style={{ fontFamily: s.fontFamily }}>
            {FONTS.map(f => <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          {[
            { key: 'body', label: 'Body', defaults: { fontSize: 15, color: '#374151', lineHeight: 1.6 } },
            { key: 'h1', label: 'Título H1', defaults: { fontSize: 28, color: '#111827', lineHeight: 1.3 } },
            { key: 'h2', label: 'Título H2', defaults: { fontSize: 22, color: '#111827', lineHeight: 1.3 } },
            { key: 'h3', label: 'Título H3', defaults: { fontSize: 18, color: '#111827', lineHeight: 1.4 } },
            { key: 'h4', label: 'Título H4', defaults: { fontSize: 16, color: '#374151', lineHeight: 1.4 } },
          ].map(style => {
            const tsKey = style.key as 'body' | 'h1' | 'h2' | 'h3' | 'h4'
            const ts = s.textStyles?.[tsKey] || style.defaults
            const updateTS = (field: string, val: any) => {
              const textStyles: Record<string, any> = { ...(s.textStyles || {}) }
              textStyles[style.key] = { ...ts, [field]: val }
              update('textStyles', textStyles)
            }
            return (
              <details key={style.key} className="group border border-gray-100 rounded-lg overflow-hidden">
                <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-gray-50/80 transition-colors">
                  <span className="text-[12px] font-medium text-gray-700">{style.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">{ts.fontSize}px</span>
                    <div className="w-3 h-3 rounded-full border border-gray-200" style={{ backgroundColor: ts.color }} />
                  </div>
                </summary>
                <div className="px-3 pb-3 pt-1 space-y-2 bg-gray-50/40">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400">Tamanho</label>
                      <input type="number" value={ts.fontSize} onChange={e => updateTS('fontSize', Number(e.target.value))} min={8} max={72}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:border-brand-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">Altura</label>
                      <input type="number" value={ts.lineHeight} onChange={e => updateTS('lineHeight', Number(e.target.value))} min={0.8} max={3} step={0.1}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:border-brand-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">Cor</label>
                      <div className="flex items-center gap-1">
                        <button onClick={() => {
                          const input = document.createElement('input')
                          input.type = 'color'; input.value = ts.color
                          input.addEventListener('input', (e) => updateTS('color', (e.target as HTMLInputElement).value))
                          input.click()
                        }} className="w-8 h-[30px] rounded-lg border border-gray-200 cursor-pointer flex-shrink-0" style={{ backgroundColor: ts.color }} />
                        <input type="text" value={ts.color} onChange={e => updateTS('color', e.target.value)}
                          className="flex-1 min-w-0 px-1.5 py-1.5 border border-gray-200 rounded-lg text-[10px] font-mono text-gray-900 focus:border-brand-500 focus:outline-none" />
                      </div>
                    </div>
                  </div>
                </div>
              </details>
            )
          })}
        </div>
      </div>

      {/* ── Links ── */}
      <div className="p-4 space-y-3 border-b border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Links</p>
        <InlineColorPicker label="Cor do Link" value={s.textStyles?.link?.color || '#F97316'} onChange={v => {
          const textStyles = { ...(s.textStyles || {}) }
          textStyles.link = { ...(textStyles.link || {}), color: v }
          update('textStyles', textStyles)
        }} />
        <label className="flex items-center gap-2.5 cursor-pointer">
          <div className={`relative w-9 h-5 rounded-full transition-colors ${s.textStyles?.link?.underline !== false ? 'bg-brand-500' : 'bg-gray-200'}`}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${s.textStyles?.link?.underline !== false ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <span className="text-[12px] text-gray-700">Sublinhado</span>
        </label>
      </div>

      {/* ── Botões ── */}
      <div className="p-4 space-y-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Botões Padrão</p>
        {(['primary', 'secondary'] as const).map(variant => {
          const bs = s.buttonStyles?.[variant] || { bgColor: variant === 'primary' ? '#F97316' : '#FFFFFF', textColor: variant === 'primary' ? '#FFFFFF' : '#F97316', borderRadius: 8, fontWeight: 'bold' }
          const updateBS = (field: string, val: any) => {
            const buttonStyles: Record<string, any> = { ...(s.buttonStyles || {}) }
            buttonStyles[variant] = { ...bs, [field]: val }
            update('buttonStyles', buttonStyles)
          }
          return (
            <details key={variant} className="group border border-gray-100 rounded-lg overflow-hidden">
              <summary className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-gray-50/80 transition-colors">
                <span className="text-[12px] font-medium text-gray-700">{variant === 'primary' ? 'Primário' : 'Secundário'}</span>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: bs.bgColor, color: bs.textColor, border: '1px solid #e5e7eb' }}>
                    Aa
                  </div>
                </div>
              </summary>
              <div className="px-3 pb-3 pt-1 space-y-2.5 bg-gray-50/40">
                <div className="grid grid-cols-2 gap-2">
                  <InlineColorPicker label="Fundo" value={bs.bgColor} onChange={v => updateBS('bgColor', v)} />
                  <InlineColorPicker label="Texto" value={bs.textColor} onChange={v => updateBS('textColor', v)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400">Raio</label>
                    <input type="number" value={bs.borderRadius} onChange={e => updateBS('borderRadius', Number(e.target.value))} min={0} max={50}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:border-brand-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">Peso</label>
                    <select value={bs.fontWeight} onChange={e => updateBS('fontWeight', e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:border-brand-500 focus:outline-none">
                      <option value="normal">Normal</option>
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

export default function WorderEmailEditor({ templateName, design, onSave, onBack, onRename, flowContext }: WorderEmailEditorProps) {
  const [editableName, setEditableName] = useState(templateName)
  const [editingName, setEditingName] = useState(false)
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
  const [showFlowPreview, setShowFlowPreview] = useState(false)
  const [showMergeTags, setShowMergeTags] = useState(false)
  const [showSendTest, setShowSendTest] = useState(false)
  const [versionsModal, setVersionsModal] = useState<{ blockId: string; savedBlockId: string } | null>(null)
  const [showSaveBlockModal, setShowSaveBlockModal] = useState(false)
  const [showSaveSectionModal, setShowSaveSectionModal] = useState(false)
  const [sectionToSaveId, setSectionToSaveId] = useState<string | null>(null)
  const [showColumnModal, setShowColumnModal] = useState(false)
  const [columnModalCols, setColumnModalCols] = useState(2)
  const [columnModalLayout, setColumnModalLayout] = useState<number[]>([50, 50])
  const [saveBlockName, setSaveBlockName] = useState('')
  const [saveSectionName, setSaveSectionName] = useState('')
  // Bumped every time a save-as-universal (block or section) succeeds so the
  // palette re-fetches the library without switching tabs manually.
  const [savedLibraryVersion, setSavedLibraryVersion] = useState(0)
  // Sync status for visible feedback in the universal banner so the user
  // can SEE that edits are landing in the library (Klaviyo shows the same).
  const [universalSyncStatus, setUniversalSyncStatus] = useState<'idle' | 'syncing' | 'saved' | 'error'>('idle')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Undo/Redo — single snapshot frame array + idx as ref to avoid
  // stale-closure race conditions when mutations fire in quick succession.
  const [history, setHistory] = useState<string[]>(() => [JSON.stringify(
    design ? migrateV1toV2(design) : DEFAULT_DOCUMENT
  )])
  const [historyIdx, setHistoryIdx] = useState(0)
  const historyIdxRef = useRef(0)
  useEffect(() => { historyIdxRef.current = historyIdx }, [historyIdx])

  const selectedBlock = selectedBlockId ? allBlocks(doc).find(b => b.id === selectedBlockId) || null : null
  const selectedSection = selectedSectionId ? doc.sections.find(s => s.id === selectedSectionId) || null : null

  const showToast = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const pushHistory = useCallback((newDoc: EmailDocument) => {
    const json = JSON.stringify(newDoc)
    setHistory(prev => {
      // Drop any "future" frames after current idx, append new, cap at 40
      const truncated = prev.slice(0, historyIdxRef.current + 1)
      const next = [...truncated, json].slice(-40)
      const newIdx = next.length - 1
      historyIdxRef.current = newIdx
      setHistoryIdx(newIdx)
      return next
    })
  }, [])

  const updateDoc = useCallback((newDoc: EmailDocument) => {
    setDoc(newDoc)
    pushHistory(newDoc)
  }, [pushHistory])

  const undo = useCallback(() => {
    setHistoryIdx(prev => {
      if (prev <= 0) return prev
      const next = prev - 1
      historyIdxRef.current = next
      setDoc(JSON.parse(history[next]))
      return next
    })
  }, [history])

  const redo = useCallback(() => {
    setHistoryIdx(prev => {
      if (prev >= history.length - 1) return prev
      const next = prev + 1
      historyIdxRef.current = next
      setDoc(JSON.parse(history[next]))
      return next
    })
  }, [history])

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
    setDoc(prev => {
      const next = {
        ...prev,
        sections: prev.sections.map(s => s.id === sectionId ? { ...s, styles: { ...s.styles, ...patch } } : s),
      }
      // If this section is linked to a saved_section, propagate the change.
      const edited = next.sections.find(s => s.id === sectionId)
      if (edited?._savedSectionId) scheduleUniversalSectionSync(edited._savedSectionId, edited)
      return next
    })
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

  const addSavedBlock = useCallback((blockJson: any, savedBlockId?: string, savedBlockName?: string) => {
    if (!blockJson) return
    // Restore a fresh block id so duplicates have their own instance, but
    // KEEP the link to the saved_block (_savedBlockId) so edits propagate.
    const restored: EmailBlock = {
      ...blockJson,
      id: 'b_' + Math.random().toString(36).substring(2, 9),
      ...(savedBlockId ? { _savedBlockId: savedBlockId, _savedBlockName: savedBlockName } : {}),
    }
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

  const addSavedSection = useCallback((sectionJson: any, savedSectionId?: string, savedSectionName?: string) => {
    if (!sectionJson) return
    // Fresh IDs for the cloned instance. Keep the library link so edits propagate.
    const restored: EmailSection = {
      ...sectionJson,
      id: 's_' + Math.random().toString(36).substring(2, 9),
      columns: (sectionJson.columns || []).map((c: any) => ({
        ...c,
        id: 'c_' + Math.random().toString(36).substring(2, 9),
        blocks: (c.blocks || []).map((b: any) => ({ ...b, id: 'b_' + Math.random().toString(36).substring(2, 9) })),
      })),
      ...(savedSectionId ? { _savedSectionId: savedSectionId, _savedSectionName: savedSectionName } : {}),
    }
    updateDoc({ ...doc, sections: [...doc.sections, restored] })
    selectSection(restored.id)
  }, [doc, updateDoc, selectSection])

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

  // ── Universal Blocks (Klaviyo-style) ──
  // Open the "Save as Universal" modal pre-filled with the selected block
  const saveBlockAsUniversal = useCallback((id: string) => {
    setSelectedBlockId(id)
    setSaveBlockName('')
    setShowSaveBlockModal(true)
  }, [])

  // Unlink: keep the current block instance but drop its _savedBlockId so
  // further edits only affect THIS email (not the saved library entry).
  const unlinkUniversalBlock = useCallback((id: string) => {
    const loc = findBlockLocation(doc, id)
    if (!loc) return
    const sections = JSON.parse(JSON.stringify(doc.sections)) as EmailSection[]
    const b = sections[loc.sectionIdx].columns[loc.columnIdx].blocks[loc.blockIdx]
    delete b._savedBlockId
    delete b._savedBlockName
    updateDoc({ ...doc, sections })
    showToast('Bloco desvinculado — edições agora ficam só neste email')
  }, [doc, updateDoc, showToast])

  // ── Universal Sections (Klaviyo/Omnisend parity) ──
  const saveSectionAsUniversal = useCallback((sectionId: string) => {
    setSectionToSaveId(sectionId)
    setSaveSectionName('')
    setShowSaveSectionModal(true)
  }, [])

  const unlinkUniversalSection = useCallback((sectionId: string) => {
    setDoc(prev => ({
      ...prev,
      sections: prev.sections.map(s => {
        if (s.id !== sectionId) return s
        const copy = { ...s }
        delete copy._savedSectionId
        delete copy._savedSectionName
        return copy
      }),
    }))
    showToast('Seção desvinculada — edições agora ficam só neste email')
  }, [showToast])

  // Debounced propagation queue for universal blocks AND sections — when the
  // user edits a linked block/section, we PATCH the saved_blocks entry so
  // every email using it picks up the change. We debounce so rapid keystrokes
  // make one request.
  const universalSyncTimersRef = useRef<Map<string, any>>(new Map())
  const scheduleUniversalSync = useCallback((savedBlockId: string, block: EmailBlock) => {
    const timers = universalSyncTimersRef.current
    if (timers.has(savedBlockId)) clearTimeout(timers.get(savedBlockId))
    setUniversalSyncStatus('syncing')
    const t = setTimeout(async () => {
      timers.delete(savedBlockId)
      try {
        // Never persist the link fields back into the saved_block body
        const clean: EmailBlock = { ...block } as EmailBlock
        delete (clean as any)._savedBlockId
        delete (clean as any)._savedBlockName
        const res = await fetch(`/api/email/saved-blocks/${savedBlockId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ block_json: clean }),
        })
        if (!res.ok) throw new Error('patch failed')
        setUniversalSyncStatus('saved')
        // Broadcast to any other open tab so its email editor re-hydrates.
        try { localStorage.setItem('worder:universal-saved', JSON.stringify({ id: savedBlockId, at: Date.now() })) } catch {}
        // Let the "Saved" chip linger briefly, then settle to idle.
        setTimeout(() => setUniversalSyncStatus(s => s === 'saved' ? 'idle' : s), 1500)
      } catch (err) {
        console.warn('[UniversalBlock] sync failed', err)
        setUniversalSyncStatus('error')
      }
    }, 600)
    timers.set(savedBlockId, t)
  }, [])

  // Same debounce, but for SECTIONS. We wrap the section in a
  // `{ _kind: 'section', section: {...} }` envelope so the saved_blocks table
  // can store both kinds without a schema change.
  const scheduleUniversalSectionSync = useCallback((savedSectionId: string, section: EmailSection) => {
    const timers = universalSyncTimersRef.current
    const key = 'section:' + savedSectionId
    if (timers.has(key)) clearTimeout(timers.get(key))
    setUniversalSyncStatus('syncing')
    const t = setTimeout(async () => {
      timers.delete(key)
      try {
        const clean: EmailSection = JSON.parse(JSON.stringify(section))
        delete (clean as any)._savedSectionId
        delete (clean as any)._savedSectionName
        // Strip per-block save links on nested blocks — the section body
        // should be self-contained when stored in the library.
        for (const col of clean.columns || []) {
          for (const b of col.blocks || []) {
            delete (b as any)._savedBlockId
            delete (b as any)._savedBlockName
          }
        }
        const res = await fetch(`/api/email/saved-blocks/${savedSectionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            block_json: { _kind: 'section', section: clean },
          }),
        })
        if (!res.ok) throw new Error('patch failed')
        setUniversalSyncStatus('saved')
        try { localStorage.setItem('worder:universal-saved', JSON.stringify({ id: savedSectionId, at: Date.now() })) } catch {}
        setTimeout(() => setUniversalSyncStatus(s => s === 'saved' ? 'idle' : s), 1500)
      } catch (err) {
        console.warn('[UniversalSection] sync failed', err)
        setUniversalSyncStatus('error')
      }
    }, 600)
    timers.set(key, t)
  }, [])

  // ── Hydrate linked blocks/sections from the library ──
  // This is what actually makes edits in one email propagate to another: the
  // saved email stores a snapshot of the block/section, but every time we
  // refresh (mount, tab focus, cross-tab save broadcast) we override the
  // snapshot with the latest library content. Klaviyo/Omnisend behave the
  // same way — the library is the source of truth, each email's stored copy
  // is just a cache.
  const hydrateFromLibrary = useCallback(async () => {
    // Never clobber local state while the user has in-flight edits — their
    // debounced PATCH hasn't landed yet and re-fetching would roll them back.
    if (universalSyncTimersRef.current.size > 0) return
    try {
      const res = await fetch('/api/email/saved-blocks')
      if (!res.ok) return
      const data = await res.json()
      const byId = new Map<string, any>()
      for (const row of (data.blocks || [])) byId.set(row.id, row)
      // Intentionally proceed even when byId is empty so we can strip
      // dangling _savedBlockId/_savedSectionId links if the library row
      // was deleted elsewhere (otherwise blocks would keep a ghost link).
      setDoc(prev => {
        let changed = false
        const nextSections = prev.sections.map(sec => {
          if (sec._savedSectionId) {
            const row = byId.get(sec._savedSectionId)
            const saved = row?.block_json
            if (saved?._kind === 'section' && saved.section) {
              changed = true
              return {
                ...saved.section,
                id: sec.id,
                _savedSectionId: sec._savedSectionId,
                _savedSectionName: sec._savedSectionName || row.name,
              } as EmailSection
            }
            if (!row) {
              // Library row deleted → strip the dangling link so the UI
              // stops showing the "UNIVERSAL" badge and future edits don't
              // try to PATCH a 404 endpoint.
              changed = true
              const { _savedSectionId: _a, _savedSectionName: _b, ...rest } = sec
              return rest as EmailSection
            }
          }
          const nextCols = sec.columns.map(col => ({
            ...col,
            blocks: col.blocks.map(b => {
              if (b._savedBlockId) {
                const row = byId.get(b._savedBlockId)
                const saved = row?.block_json
                if (saved && !saved._kind) {
                  changed = true
                  return {
                    ...saved,
                    id: b.id,
                    _savedBlockId: b._savedBlockId,
                    _savedBlockName: b._savedBlockName || row.name,
                  } as EmailBlock
                }
                if (!row) {
                  changed = true
                  const { _savedBlockId: _a, _savedBlockName: _b, ...rest } = b
                  return rest as EmailBlock
                }
              }
              return b
            }),
          }))
          return { ...sec, columns: nextCols }
        })
        return changed ? { ...prev, sections: nextSections } : prev
      })
    } catch {
      // Silent — editor still works with the cached copy in design_json.
    }
  }, [])

  // Initial hydration on mount.
  const hydratedOnce = useRef(false)
  useEffect(() => {
    if (hydratedOnce.current) return
    hydratedOnce.current = true
    hydrateFromLibrary()
  }, [hydrateFromLibrary])

  // Cross-tab + tab-focus re-hydration — when the user saves in the
  // dedicated universal editor (opened in a new tab), that tab writes to
  // localStorage. This tab picks up the storage event and re-hydrates.
  // Same thing happens when the tab regains visibility (user switches back).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'worder:universal-saved') hydrateFromLibrary()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') hydrateFromLibrary()
    }
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [hydrateFromLibrary])

  const updateProp = useCallback((id: string, key: string, value: any) => {
    setDoc(prev => {
      let parentSection: EmailSection | null = null
      const next = {
        ...prev,
        sections: prev.sections.map(s => {
          if (!s.columns.some(c => c.blocks.some(b => b.id === id))) return s
          const updated: EmailSection = {
            ...s,
            columns: s.columns.map(c => ({
              ...c,
              blocks: c.blocks.map(b => b.id === id ? { ...b, props: { ...b.props, [key]: value } } : b),
            })),
          }
          parentSection = updated
          return updated
        }),
      }
      // If this block is linked to a saved_block, propagate the mutation.
      const edited = allBlocks(next).find(b => b.id === id)
      if (edited?._savedBlockId) scheduleUniversalSync(edited._savedBlockId, edited)
      // If the parent SECTION is linked to a saved_section, propagate the
      // whole section — nested block edits are part of the section content.
      if (parentSection && (parentSection as EmailSection)._savedSectionId) {
        scheduleUniversalSectionSync((parentSection as EmailSection)._savedSectionId!, parentSection)
      }
      return next
    })
  }, [scheduleUniversalSync, scheduleUniversalSectionSync])

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
  // Supports three payloads: standard block types, saved/universal blocks,
  // and saved/universal sections (Klaviyo-style). Saved items arrive with
  // both the block/section JSON and the saved_blocks row id so we can keep
  // the link alive on the dropped instance.
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    // 1. Saved section (entire section-level universal content)
    const savedSectionJson = e.dataTransfer.getData('savedSectionJson')
    const savedSectionId = e.dataTransfer.getData('savedSectionId')
    const savedSectionName = e.dataTransfer.getData('savedSectionName')
    if (savedSectionJson) {
      try {
        const incoming = JSON.parse(savedSectionJson) as EmailSection
        const restored: EmailSection = {
          ...incoming,
          id: 's_' + Math.random().toString(36).substring(2, 9),
          columns: incoming.columns.map(c => ({
            ...c,
            id: 'c_' + Math.random().toString(36).substring(2, 9),
            blocks: c.blocks.map(b => ({ ...b, id: 'b_' + Math.random().toString(36).substring(2, 9) })),
          })),
          ...(savedSectionId ? { _savedSectionId: savedSectionId, _savedSectionName: savedSectionName } : {}),
        }
        updateDoc({ ...doc, sections: [...doc.sections, restored] })
        selectSection(restored.id)
        return
      } catch { /* fall through */ }
    }
    // 2. Saved block
    const savedBlockJson = e.dataTransfer.getData('savedBlockJson')
    const savedBlockId = e.dataTransfer.getData('savedBlockId')
    const savedBlockName = e.dataTransfer.getData('savedBlockName')
    if (savedBlockJson) {
      try {
        addSavedBlock(JSON.parse(savedBlockJson), savedBlockId || undefined, savedBlockName || undefined)
        return
      } catch { /* fall through */ }
    }
    // 3. Regular new block
    const type = e.dataTransfer.getData('blockType')
    if (type) addBlock(type)
  }, [addBlock, addSavedBlock, doc, updateDoc, selectSection])

  // ── Save ──
  // Force-flush every pending universal sync PATCH before we leave the
  // editor (save / unmount). Without this, rapid Edit → Save closes would
  // drop the last in-flight debounce and the library row would never learn
  // about the final change — which is exactly what "editei e nao propagou"
  // looks like to the user.
  const flushUniversalSync = useCallback(async () => {
    const timers = universalSyncTimersRef.current
    if (timers.size === 0) return
    const pending: Array<{ id: string; kind: 'block' | 'section'; payload: any }> = []
    // Walk the current doc to produce fresh payloads for every scheduled id.
    for (const key of timers.keys()) {
      clearTimeout(timers.get(key))
      if (key.startsWith('section:')) {
        const savedSectionId = key.slice('section:'.length)
        const sec = doc.sections.find(s => s._savedSectionId === savedSectionId)
        if (!sec) continue
        const clean: EmailSection = JSON.parse(JSON.stringify(sec))
        delete (clean as any)._savedSectionId
        delete (clean as any)._savedSectionName
        for (const col of clean.columns || []) {
          for (const b of col.blocks || []) {
            delete (b as any)._savedBlockId
            delete (b as any)._savedBlockName
          }
        }
        pending.push({ id: savedSectionId, kind: 'section', payload: { _kind: 'section', section: clean } })
      } else {
        const savedBlockId = key
        const block = allBlocks(doc).find(b => b._savedBlockId === savedBlockId)
        if (!block) continue
        const clean: EmailBlock = { ...block } as EmailBlock
        delete (clean as any)._savedBlockId
        delete (clean as any)._savedBlockName
        pending.push({ id: savedBlockId, kind: 'block', payload: clean })
      }
    }
    timers.clear()
    // Fire all PATCHes in parallel and wait — the user is saving so it's OK
    // to make them wait the round-trip.
    await Promise.all(pending.map(p =>
      fetch(`/api/email/saved-blocks/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ block_json: p.payload }),
      }).catch(() => { /* non-blocking */ })
    ))
  }, [doc])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      // 1. Flush any pending universal-sync debounces so nothing is lost.
      await flushUniversalSync()
      // 2. Render + persist the email itself.
      const html = renderDocumentToHtml(doc)
      const success = await onSave(doc as any, html)
      if (success) showToast('Template salvo com sucesso!')
      // 3. Bump the palette counter so neighbouring UI re-fetches the
      //    updated library immediately (useful when saving then dragging
      //    the same universal into another section without leaving).
      setSavedLibraryVersion(v => v + 1)
    } catch (err: any) { showToast('Erro: ' + err.message, 'error') }
    setSaving(false)
  }, [doc, onSave, showToast, flushUniversalSync])

  // ── Preview ──
  const handlePreview = useCallback(async () => {
    // When inside a flow, use the flow preview mode with real data
    if (flowContext) {
      // Save first so the template HTML is up to date
      const html = renderDocumentToHtml(doc)
      await onSave(doc as Record<string, any>, html)
      setShowFlowPreview(true)
      return
    }
    // Resolve dynamic product blocks before rendering
    let resolvedDoc = doc
    const hasDynamicProducts = doc.sections?.some((s: any) =>
      s.columns?.some((c: any) =>
        c.blocks?.some((b: any) => b.type === 'product-grid' && (!b.props.staticProducts || b.props.staticProducts.length === 0))
      )
    )
    if (hasDynamicProducts) {
      try {
        const { resolveProductBlocks } = await import('@/lib/email/render-html')
        resolvedDoc = await resolveProductBlocks(doc, async () => {
          const res = await fetch('/api/products')
          if (!res.ok) return []
          const data = await res.json()
          return data.products || []
        })
      } catch (e) {
        console.error('Failed to resolve products:', e)
      }
    }
    let html = renderDocumentToHtml(resolvedDoc)
    // Resolve placeholders dinâmicos para preview (products sample, cart sample, countdown)
    try {
      const { resolvePreviewPlaceholders } = await import('@/lib/email/preview-samples')
      html = resolvePreviewPlaceholders(html, window.location.origin)
    } catch { /* fallback silencioso */ }
    // Replace common merge tags with preview values
    html = html.replace(/\{\{first_name\}\}/g, 'Cliente')
    html = html.replace(/\{\{store_name\}\}/g, 'Minha Loja')
    html = html.replace(/\{\{store_url\}\}/g, window.location.origin)
    html = html.replace(/\{\{unsubscribe_url\}\}/g, '#')
    html = html.replace(/\{\{view_in_browser_url\}\}/g, '#')
    setPreviewHtml(html)
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

  // ── Universal-sync safeguards ──
  // If the user closes the tab or SPA-unmounts the editor mid-debounce, we
  // must still push pending saved_blocks PATCHes; otherwise their last edits
  // never land in the library and the next email shows stale content.
  //
  // NOTE: we deliberately split this into TWO effects. The naïve approach
  // (single effect with [doc, flushUniversalSync] deps) re-runs the cleanup
  // on every edit — which would force-flush on every keystroke and defeat
  // the 600ms debounce in scheduleUniversalSync/scheduleUniversalSectionSync.
  // We use a ref to keep a handle to the latest flush fn so the unmount
  // cleanup can call it without the effect itself depending on it.
  const flushRef = useRef<() => Promise<void>>()
  useEffect(() => { flushRef.current = flushUniversalSync }, [flushUniversalSync])

  // beforeunload — needs latest doc, so it re-binds when doc changes. Cheap.
  useEffect(() => {
    const onBeforeUnload = () => {
      const timers = universalSyncTimersRef.current
      if (timers.size === 0) return
      // beforeunload can't await — use sendBeacon so the PATCH actually
      // leaves before the tab dies. For each pending timer, fire now.
      for (const key of timers.keys()) {
        clearTimeout(timers.get(key))
        try {
          if (key.startsWith('section:')) {
            const id = key.slice('section:'.length)
            const sec = doc.sections.find(s => s._savedSectionId === id)
            if (!sec) continue
            const clean: any = JSON.parse(JSON.stringify(sec))
            delete clean._savedSectionId
            delete clean._savedSectionName
            for (const col of clean.columns || []) {
              for (const b of col.blocks || []) { delete b._savedBlockId; delete b._savedBlockName }
            }
            navigator.sendBeacon(
              `/api/email/saved-blocks/${id}`,
              new Blob([JSON.stringify({ block_json: { _kind: 'section', section: clean } })], { type: 'application/json' })
            )
          } else {
            const block = allBlocks(doc).find(b => b._savedBlockId === key)
            if (!block) continue
            const clean: any = { ...block }
            delete clean._savedBlockId
            delete clean._savedBlockName
            navigator.sendBeacon(
              `/api/email/saved-blocks/${key}`,
              new Blob([JSON.stringify({ block_json: clean })], { type: 'application/json' })
            )
          }
        } catch { /* best-effort */ }
      }
      timers.clear()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [doc])

  // Unmount-only flush (SPA navigation). Empty deps → cleanup runs ONCE
  // on real unmount, not on every doc change.
  useEffect(() => {
    return () => {
      // Both the call and the .catch are optional-chained so this stays a
      // no-op if the ref never got populated (shouldn't happen in practice).
      flushRef.current?.()?.catch(() => {})
    }
  }, [])

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

      {/* ── Toolbar (black theme, restored from 8442103) ── */}
      <div className="flex items-center justify-between px-4 h-[52px] bg-zinc-900 flex-shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/worder-favicon.svg" alt="Worder" className="w-7 h-7 flex-shrink-0" />
          <div className="h-5 w-px bg-zinc-700" />
          {editingName ? (
            <input
              autoFocus
              type="text"
              value={editableName}
              onChange={(e) => setEditableName(e.target.value)}
              onBlur={() => {
                setEditingName(false)
                const trimmed = editableName.trim()
                if (trimmed && trimmed !== templateName && onRename) onRename(trimmed)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') { setEditableName(templateName); setEditingName(false) }
              }}
              className="text-sm font-semibold text-white bg-zinc-700 border border-zinc-600 rounded px-2 py-0.5 max-w-[280px] outline-none focus:border-brand-500"
            />
          ) : (
            <button
              type="button"
              onClick={() => { setEditingName(true); setEditableName(editableName || templateName) }}
              className="text-sm font-semibold text-white truncate max-w-[280px] hover:bg-zinc-700 px-2 py-0.5 rounded transition-colors cursor-text"
              title="Clique para renomear"
            >
              {editableName || templateName}
            </button>
          )}
          <span className="text-[9px] px-1.5 py-0.5 bg-white/10 text-white rounded font-bold tracking-wider hidden sm:inline">WORDER</span>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={historyIdx <= 0} className="p-1.5 text-zinc-500 hover:text-white rounded disabled:opacity-30 transition-colors" title="Desfazer"><Undo2 size={15} /></button>
          <button onClick={redo} disabled={historyIdx >= history.length - 1} className="p-1.5 text-zinc-500 hover:text-white rounded disabled:opacity-30 transition-colors" title="Refazer"><Redo2 size={15} /></button>
          <div className="w-px h-4 bg-zinc-700 mx-1" />
          <button onClick={() => setDevice('desktop')} className={`p-1.5 rounded transition-colors ${device === 'desktop' ? 'text-white bg-zinc-700' : 'text-zinc-500 hover:text-white'}`}><Monitor size={15} /></button>
          <button onClick={() => setDevice('mobile')} className={`p-1.5 rounded transition-colors ${device === 'mobile' ? 'text-white bg-zinc-700' : 'text-zinc-500 hover:text-white'}`}><Smartphone size={15} /></button>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowMergeTags(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 text-xs font-medium text-zinc-300 rounded-lg hover:bg-zinc-800 hover:text-white transition-colors" title="Merge Tags">
            <Tag size={14} /> Tags
          </button>
          <button onClick={handlePreview} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 text-xs font-medium text-zinc-300 rounded-lg hover:bg-zinc-800 hover:text-white transition-colors">
            <Eye size={14} /> Preview
          </button>
          <button onClick={() => setShowSendTest(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 text-xs font-medium text-zinc-300 rounded-lg hover:bg-zinc-800 hover:text-white transition-colors">
            <Send size={14} /> Teste
          </button>
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-zinc-900 text-xs font-semibold rounded-lg hover:bg-zinc-100 disabled:opacity-50 transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : isSaved ? <CheckCircle size={14} /> : <Save size={14} />}
            {saving ? 'Salvando...' : isSaved ? 'Salvo!' : 'Salvar'}
          </button>
          <button onClick={async () => {
            if (!confirm('Sair sem salvar? Alterações não salvas serão perdidas.')) return
            // Even when the user leaves without saving the EMAIL, any pending
            // universal-sync PATCHes for blocks/sections they did edit should
            // still land — the library is a separate resource. Flush first,
            // then leave.
            await flushUniversalSync()
            onBack()
          }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 text-xs font-medium text-zinc-400 rounded-lg hover:bg-zinc-800 hover:text-white transition-colors" title="Sair">
            Sair
          </button>
        </div>
      </div>

      {/* ── Main Layout (Klaviyo-style: Left = contextual panel, Right = canvas) ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Sidebar (contextual: palette OR block/section properties) ── */}
        <div className="w-[360px] bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
          {selectedBlock ? (
            <>
              {/* Header with back button when editing a block */}
              <div className="flex items-center gap-2 py-2.5 px-3 border-b border-gray-200 flex-shrink-0">
                <button onClick={clearSelection} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors" title="Voltar">
                  <ArrowLeft size={14} />
                </button>
                <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wider flex-1">
                  {BLOCK_DEFS.find(d => d.type === selectedBlock.type)?.label || selectedBlock.type}
                </p>
                {selectedBlock._savedBlockId && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-700">
                    <Star className="w-2.5 h-2.5 fill-violet-600" />
                    UNIVERSAL
                  </span>
                )}
              </div>

              {/* Universal block banner — appears only when the selected block
                  is linked to a saved_block. Explains propagation + unlink action. */}
              {selectedBlock._savedBlockId && (
                <div className="mx-3 mt-3 p-3 rounded-lg bg-violet-50 border border-violet-200">
                  <div className="flex items-start gap-2">
                    <Star className="w-4 h-4 text-violet-600 fill-violet-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-semibold text-violet-900 leading-tight flex-1 truncate">
                          {selectedBlock._savedBlockName || 'Bloco Universal'}
                        </p>
                        {/* Live sync status chip (Klaviyo-style) */}
                        {universalSyncStatus === 'syncing' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600">
                            <Loader2 className="w-3 h-3 animate-spin" /> Sincronizando…
                          </span>
                        )}
                        {universalSyncStatus === 'saved' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                            <CheckCircle className="w-3 h-3" /> Salvo na biblioteca
                          </span>
                        )}
                        {universalSyncStatus === 'error' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600">Erro ao sincronizar</span>
                        )}
                      </div>
                      <p className="text-[11px] text-violet-700/80 leading-snug mt-0.5">
                        Edições se aplicam a todos os emails que usam este bloco.
                      </p>
                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        <a
                          href={`/email/universal/${selectedBlock._savedBlockId}/edit`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-violet-600 rounded-md hover:bg-violet-700"
                        >
                          Abrir editor dedicado
                        </a>
                        <button
                          onClick={() => unlinkUniversalBlock(selectedBlock.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 hover:text-violet-900 underline underline-offset-2"
                        >
                          Desvincular — editar só neste email
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-3">
                <BlockProperties
                  block={selectedBlock}
                  onChange={(key, value) => updateProp(selectedBlock.id, key, value)}
                  onSaveAsReusable={() => {
                    setSaveBlockName('')
                    setShowSaveBlockModal(true)
                  }}
                />
              </div>
            </>
          ) : selectedSection ? (
            <>
              {/* Header with back button when editing a section */}
              <div className="flex items-center gap-2 py-2.5 px-3 border-b border-gray-200 flex-shrink-0">
                <button onClick={clearSelection} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors" title="Voltar">
                  <ArrowLeft size={14} />
                </button>
                <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wider flex-1">Seção</p>
                {selectedSection._savedSectionId && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-700">
                    <Star className="w-2.5 h-2.5 fill-violet-600" />
                    UNIVERSAL
                  </span>
                )}
              </div>
              {/* Universal section banner — appears only when the selected
                  section is linked to a saved_section. Explains propagation
                  + offers unlink action. Mirrors the block banner above. */}
              {selectedSection._savedSectionId && (
                <div className="mx-3 mt-3 p-3 rounded-lg bg-violet-50 border border-violet-200">
                  <div className="flex items-start gap-2">
                    <Star className="w-4 h-4 text-violet-600 fill-violet-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[12px] font-semibold text-violet-900 leading-tight flex-1 truncate">
                          {selectedSection._savedSectionName || 'Seção Universal'}
                        </p>
                        {universalSyncStatus === 'syncing' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600">
                            <Loader2 className="w-3 h-3 animate-spin" /> Sincronizando…
                          </span>
                        )}
                        {universalSyncStatus === 'saved' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                            <CheckCircle className="w-3 h-3" /> Salvo na biblioteca
                          </span>
                        )}
                        {universalSyncStatus === 'error' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600">Erro ao sincronizar</span>
                        )}
                      </div>
                      <p className="text-[11px] text-violet-700/80 leading-snug mt-0.5">
                        Edições (blocos, cores, visibilidade, padding…) se aplicam
                        a todos os emails que usam essa seção.
                      </p>
                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        <a
                          href={`/email/universal/${selectedSection._savedSectionId}/edit`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-violet-600 rounded-md hover:bg-violet-700"
                        >
                          Abrir editor dedicado
                        </a>
                        <button
                          onClick={() => unlinkUniversalSection(selectedSection.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 hover:text-violet-900 underline underline-offset-2"
                        >
                          Desvincular — editar só neste email
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-3">
                <SectionProperties
                  section={selectedSection}
                  onStyleChange={(key, value) => updateSectionStyles(selectedSection.id, { [key]: value })}
                  onColumnLayoutChange={(cols) => {
                    setDoc(prev => {
                      const next = {
                        ...prev,
                        sections: prev.sections.map(s => {
                          if (s.id !== selectedSection.id) return s
                          const newCols = cols.map((w, i) => ({
                            id: s.columns[i]?.id || ('c_' + Date.now().toString(36) + '_' + i),
                            width: w,
                            blocks: s.columns[i]?.blocks || [],
                          }))
                          if (s.columns.length > cols.length) {
                            const overflow = s.columns.slice(cols.length).flatMap(c => c.blocks)
                            newCols[newCols.length - 1].blocks.push(...overflow)
                          }
                          return { ...s, columns: newCols }
                        })
                      }
                      // Column layout is part of the section — propagate to
                      // the library if the section is linked.
                      const edited = next.sections.find(s => s.id === selectedSection.id)
                      if (edited?._savedSectionId) scheduleUniversalSectionSync(edited._savedSectionId, edited)
                      return next
                    })
                  }}
                />
              </div>
            </>
          ) : (
            <>
              {/* Default: palette / styles tabs */}
              <div className="flex border-b border-gray-200 flex-shrink-0">
                <button onClick={() => setLeftTab('content')} className={`flex-1 py-3 text-[12px] font-semibold transition-colors ${leftTab === 'content' ? 'text-zinc-900 border-b-2 border-zinc-900 -mb-px' : 'text-gray-400 hover:text-gray-600'}`}>Conteúdo</button>
                <button onClick={() => setLeftTab('styles')} className={`flex-1 py-3 text-[12px] font-semibold transition-colors ${leftTab === 'styles' ? 'text-zinc-900 border-b-2 border-zinc-900 -mb-px' : 'text-gray-400 hover:text-gray-600'}`}>Estilos</button>
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
                    <BlockPalette
                      onAddBlock={addBlock}
                      onAddSavedBlock={addSavedBlock}
                      onAddSavedSection={addSavedSection}
                      savedLibraryVersion={savedLibraryVersion}
                    />
                  </div>
                ) : (
                  <StylesTab doc={doc} setDoc={setDoc} />
                )}
              </div>
            </>
          )}
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
                {doc.sections.map((section, sectionIndex) => {
                  const isFirst = sectionIndex === 0
                  const isLast = sectionIndex === doc.sections.length - 1
                  const br = doc.settings.borderRadius || 0
                  const sectionBorderRadius = br > 0 ? `${isFirst ? br : 0}px ${isFirst ? br : 0}px ${isLast ? br : 0}px ${isLast ? br : 0}px` : undefined
                  // Device visibility for the section (mirrors render-html behaviour
                  // so what the user sees in the canvas matches the exported HTML).
                  const ss = section.styles as any
                  const sectionShowDesktop = ss.showOnDesktop !== false
                  const sectionShowMobile = ss.showOnMobile !== false
                  const sectionHiddenOnDevice: 'desktop' | 'mobile' | null =
                    device === 'desktop' && !sectionShowDesktop ? 'desktop'
                    : device === 'mobile' && !sectionShowMobile ? 'mobile'
                    : null
                  return (
                  <SortableSection
                    key={section.id}
                    sectionId={section.id}
                    isSelected={selectedSectionId === section.id}
                    hiddenOnDevice={sectionHiddenOnDevice}
                    isUniversal={!!section._savedSectionId}
                    savedSectionName={section._savedSectionName}
                  >
                  {/* Section = FULL WIDTH with section color */}
                  <div
                    className={`relative group/section ${selectedSectionId === section.id ? 'ring-2 ring-indigo-400 ring-inset' : 'hover:ring-1 hover:ring-indigo-200 hover:ring-inset'}`}
                    style={{ backgroundColor: section.styles.backgroundColor || undefined }}
                    onClick={e => { e.stopPropagation(); selectSection(section.id) }}
                  >
                      {/* Section toolbar INSIDE the section - always visible */}
                      {selectedSectionId === section.id && (
                        <div className="absolute left-1 top-1 z-20 flex items-center gap-1">
                          <span className={`px-2 py-0.5 text-white text-[10px] font-semibold rounded ${section._savedSectionId ? 'bg-violet-500' : 'bg-indigo-500'}`}>
                            {section._savedSectionId ? 'Seção Universal' : 'Seção'}
                          </span>
                          <div className="flex gap-0.5 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-md shadow-sm px-0.5 py-0.5">
                            <button onClick={e => { e.stopPropagation(); cloneSection(section.id) }}
                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Duplicar">
                              <Copy className="w-3 h-3" />
                            </button>
                            {section._savedSectionId ? (
                              <button onClick={e => { e.stopPropagation(); unlinkUniversalSection(section.id) }}
                                className="p-1 text-violet-500 hover:text-amber-600 hover:bg-amber-50 rounded" title="Desvincular da seção universal">
                                <X className="w-3 h-3" />
                              </button>
                            ) : (
                              <button onClick={e => { e.stopPropagation(); saveSectionAsUniversal(section.id) }}
                                className="p-1 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded" title="Salvar como seção universal">
                                <Star className="w-3 h-3" />
                              </button>
                            )}
                            <button onClick={e => { e.stopPropagation(); removeSection(section.id) }}
                              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded" title="Excluir">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Content area = centered, max-width, with content bg.
                          NOTE: we deliberately do NOT set overflow:hidden here even
                          when a border-radius is applied — that wrapper was clipping
                          the block's hover toolbar (positioned at -right-9), which
                          hid the "save as reusable block" star icon. The rounded
                          corners still look correct because children don't have
                          their own colored backgrounds at the corners. */}
                      <div style={{
                        maxWidth: canvasWidth,
                        margin: '0 auto',
                        backgroundColor: section.styles.contentBackgroundColor || doc.settings.contentBackgroundColor || undefined,
                        borderRadius: sectionBorderRadius,
                        fontFamily: doc.settings.fontFamily || undefined,
                      }}>
                      <div
                        style={{
                          display: 'flex',
                          gap: 0,
                          alignItems: section.styles.columnAlignment === 'middle' ? 'center' : section.styles.columnAlignment === 'bottom' ? 'flex-end' : 'flex-start',
                          padding: `${section.styles.padding.top}px ${section.styles.padding.right}px ${section.styles.padding.bottom}px ${section.styles.padding.left}px`,
                        }}
                      >
                        {section.columns.map((column) => {
                          const colBlocks = column.blocks
                          return (
                            <div key={column.id} style={{ width: `${column.width}%`, minHeight: 40 }} className="relative"
                              onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('ring-2', 'ring-brand-400', 'ring-inset', 'bg-brand-50/30') }}
                              onDragLeave={e => { e.currentTarget.classList.remove('ring-2', 'ring-brand-400', 'ring-inset', 'bg-brand-50/30') }}
                              onDrop={e => {
                                e.preventDefault(); e.stopPropagation();
                                e.currentTarget.classList.remove('ring-2', 'ring-brand-400', 'ring-inset', 'bg-brand-50/30')
                                // Saved SECTION can't live inside a column — insert it as a
                                // new section AFTER the current one (Klaviyo does the same).
                                const ssJson = e.dataTransfer.getData('savedSectionJson')
                                if (ssJson) {
                                  try {
                                    const parsed = JSON.parse(ssJson) as EmailSection
                                    const ssId = e.dataTransfer.getData('savedSectionId') || undefined
                                    const ssName = e.dataTransfer.getData('savedSectionName') || undefined
                                    const restored: EmailSection = {
                                      ...parsed,
                                      id: 's_' + Math.random().toString(36).substring(2, 9),
                                      columns: parsed.columns.map(c => ({
                                        ...c,
                                        id: 'c_' + Math.random().toString(36).substring(2, 9),
                                        blocks: c.blocks.map(b => ({ ...b, id: 'b_' + Math.random().toString(36).substring(2, 9) })),
                                      })),
                                      ...(ssId ? { _savedSectionId: ssId, _savedSectionName: ssName } : {}),
                                    }
                                    const idx = doc.sections.findIndex(s => s.id === section.id)
                                    const nextSections = [...doc.sections]
                                    nextSections.splice(idx + 1, 0, restored)
                                    updateDoc({ ...doc, sections: nextSections })
                                    selectSection(restored.id)
                                    return
                                  } catch { /* fall through */ }
                                }
                                // Saved block dropped directly into a column → add here, not at doc level
                                const sbJson = e.dataTransfer.getData('savedBlockJson')
                                if (sbJson) {
                                  try {
                                    const parsed = JSON.parse(sbJson)
                                    const sbId = e.dataTransfer.getData('savedBlockId') || undefined
                                    const sbName = e.dataTransfer.getData('savedBlockName') || undefined
                                    const restored: EmailBlock = {
                                      ...parsed,
                                      id: 'b_' + Math.random().toString(36).substring(2, 9),
                                      ...(sbId ? { _savedBlockId: sbId, _savedBlockName: sbName } : {}),
                                    }
                                    const nextSections = JSON.parse(JSON.stringify(doc.sections)) as EmailSection[]
                                    const sec = nextSections.find(s => s.id === section.id)
                                    const col = sec?.columns.find(c => c.id === column.id)
                                    if (col) col.blocks.push(restored)
                                    updateDoc({ ...doc, sections: nextSections })
                                    selectBlock(restored.id)
                                    return
                                  } catch { /* fall through */ }
                                }
                                const type = e.dataTransfer.getData('blockType')
                                if (type) addBlock(type, section.id, column.id)
                              }}
                            >
                              {colBlocks.length === 0 ? (
                                <DroppableColumn columnId={column.id} sectionId={section.id}>
                                  <div className="flex items-center justify-center h-full min-h-[60px] border border-dashed border-gray-300 bg-gray-50/50 text-gray-400 text-xs gap-2 rounded">
                                    <span>Solte conteúdo aqui</span>
                                  </div>
                                </DroppableColumn>
                              ) : (
                                <SortableContext items={colBlocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                                  {colBlocks.map((block) => {
                                    const bv = (block.props as any)?.visibility as string | undefined
                                    const blockHiddenOnDevice: 'desktop' | 'mobile' | null =
                                      device === 'desktop' && bv === 'mobile' ? 'desktop'
                                      : device === 'mobile' && bv === 'desktop' ? 'mobile'
                                      : null
                                    return (
                                    <SortableBlock
                                      key={block.id}
                                      blockId={block.id}
                                      isSelected={selectedBlockId === block.id}
                                      onSelect={() => selectBlock(block.id)}
                                      onClone={() => cloneBlock(block.id)}
                                      onDelete={() => removeBlock(block.id)}
                                      isUniversal={!!block._savedBlockId}
                                      savedBlockName={block._savedBlockName}
                                      onSaveAsUniversal={() => saveBlockAsUniversal(block.id)}
                                      onUnlink={() => unlinkUniversalBlock(block.id)}
                                      hiddenOnDevice={blockHiddenOnDevice}
                                    >
                                      <BlockPreview
                                        block={block}
                                        selected={selectedBlockId === block.id}
                                        onSelect={() => selectBlock(block.id)}
                                        onClone={() => cloneBlock(block.id)}
                                        onDelete={() => removeBlock(block.id)}
                                      />
                                    </SortableBlock>
                                    )
                                  })}
                                </SortableContext>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      </div>{/* close content area wrapper */}
                    </div>
                  </SortableSection>
                  )
                })}
                </SortableContext>
                </DndContext>
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

      {/* ── Flow Preview Mode (real data from automation) ── */}
      {showFlowPreview && flowContext && (
        <EmailPreviewMode
          templateId={flowContext.templateId}
          triggerType={flowContext.triggerType}
          organizationId={flowContext.organizationId}
          onClose={() => setShowFlowPreview(false)}
        />
      )}

      {/* ── Send Test Modal ── */}
      <SendTestModal
        isOpen={showSendTest}
        onClose={() => setShowSendTest(false)}
        html={(() => {
          let h = previewHtml || renderDocumentToHtml(doc)
          h = h.replace(/\{\{countdown_base_url\}\}/g, typeof window !== 'undefined' ? window.location.origin : '')
          h = h.replace(/\{\{first_name\}\}/g, 'Cliente')
          h = h.replace(/\{\{store_name\}\}/g, 'Minha Loja')
          h = h.replace(/\{\{store_url\}\}/g, typeof window !== 'undefined' ? window.location.origin : '')
          h = h.replace(/\{\{unsubscribe_url\}\}/g, '#')
          h = h.replace(/\{\{view_in_browser_url\}\}/g, '#')
          return h
        })()}
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

      {/* ── Save Block as Universal Modal ── */}
      {showSaveBlockModal && selectedBlock && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowSaveBlockModal(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-[420px] p-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-md bg-violet-100 flex items-center justify-center">
                <Star className="w-3.5 h-3.5 text-violet-600 fill-violet-600" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Salvar como Bloco Universal</h3>
            </div>
            <p className="text-[12px] text-gray-500 leading-relaxed mb-4 pl-8">
              Blocos universais ficam disponíveis em todos os emails. Edições
              no bloco se propagam automaticamente para cada email que o usa.
            </p>
            <input
              type="text"
              value={saveBlockName}
              onChange={e => setSaveBlockName(e.target.value)}
              placeholder="Nome do bloco universal..."
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none mb-3"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSaveBlockModal(false)}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                disabled={!saveBlockName.trim()}
                onClick={async () => {
                  const name = saveBlockName.trim()
                  try {
                    // Strip any existing link fields before saving to library
                    const cleanBlock: EmailBlock = { ...selectedBlock } as EmailBlock
                    delete (cleanBlock as any)._savedBlockId
                    delete (cleanBlock as any)._savedBlockName
                    const res = await fetch('/api/email/saved-blocks', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name, block_json: cleanBlock }),
                    })
                    if (!res.ok) throw new Error('save failed')
                    const json = await res.json()
                    const savedId: string | undefined = json?.block?.id
                    // Link THIS block instance to the new saved_block so it
                    // acts as a linked universal block from now on.
                    if (savedId) {
                      const loc = findBlockLocation(doc, selectedBlock.id)
                      if (loc) {
                        const sections = JSON.parse(JSON.stringify(doc.sections)) as EmailSection[]
                        const b = sections[loc.sectionIdx].columns[loc.columnIdx].blocks[loc.blockIdx]
                        b._savedBlockId = savedId
                        b._savedBlockName = name
                        updateDoc({ ...doc, sections })
                      }
                    }
                    setSavedLibraryVersion(v => v + 1)
                    showToast('Bloco universal criado!')
                    setShowSaveBlockModal(false)
                  } catch {
                    showToast('Erro ao salvar', 'error')
                  }
                }}
                className="px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50"
              >
                Salvar como Universal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Save Section as Universal Modal (Klaviyo/Omnisend parity) ── */}
      {showSaveSectionModal && sectionToSaveId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowSaveSectionModal(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-[440px] p-5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-md bg-violet-100 flex items-center justify-center">
                <Star className="w-3.5 h-3.5 text-violet-600 fill-violet-600" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Salvar como Seção Universal</h3>
            </div>
            <p className="text-[12px] text-gray-500 leading-relaxed mb-4 pl-8">
              Seções universais incluem o layout, todos os blocos e os ajustes
              de cor/padding/visibilidade. Edições se propagam para todos os
              emails que usam essa seção.
            </p>
            <input
              type="text"
              value={saveSectionName}
              onChange={e => setSaveSectionName(e.target.value)}
              placeholder="Nome da seção universal..."
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 outline-none mb-3"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowSaveSectionModal(false)}
                className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                disabled={!saveSectionName.trim()}
                onClick={async () => {
                  const name = saveSectionName.trim()
                  const section = doc.sections.find(s => s.id === sectionToSaveId)
                  if (!section) return
                  try {
                    const cleanSection: EmailSection = JSON.parse(JSON.stringify(section))
                    delete (cleanSection as any)._savedSectionId
                    delete (cleanSection as any)._savedSectionName
                    // Strip nested block links — the section is the unit now.
                    for (const col of cleanSection.columns) {
                      for (const b of col.blocks) {
                        delete (b as any)._savedBlockId
                        delete (b as any)._savedBlockName
                      }
                    }
                    const res = await fetch('/api/email/saved-blocks', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name,
                        category: 'section',
                        block_json: { _kind: 'section', section: cleanSection },
                      }),
                    })
                    if (!res.ok) throw new Error('save failed')
                    const json = await res.json()
                    const savedId: string | undefined = json?.block?.id
                    if (savedId) {
                      setDoc(prev => ({
                        ...prev,
                        sections: prev.sections.map(s => s.id === sectionToSaveId
                          ? { ...s, _savedSectionId: savedId, _savedSectionName: name }
                          : s),
                      }))
                    }
                    setSavedLibraryVersion(v => v + 1)
                    showToast('Seção universal criada!')
                    setShowSaveSectionModal(false)
                  } catch {
                    showToast('Erro ao salvar', 'error')
                  }
                }}
                className="px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50"
              >
                Salvar como Universal
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

      {/* ── Saved Block Versions Modal ── */}
      {versionsModal && (
        <SavedBlockVersionsModal
          savedBlockId={versionsModal.savedBlockId}
          onClose={() => setVersionsModal(null)}
          onRestored={() => {
            setVersionsModal(null)
            if (typeof window !== 'undefined') window.location.reload()
          }}
        />
      )}
    </div>
  )
}

function SavedBlockVersionsModal({ savedBlockId, onClose, onRestored }: {
  savedBlockId: string; onClose: () => void; onRestored: () => void
}) {
  const [versions, setVersions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<number | null>(null)

  useEffect(() => {
    fetch(`/api/email/saved-blocks/${savedBlockId}/versions`)
      .then(r => r.json())
      .then(d => setVersions(d.versions || []))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false))
  }, [savedBlockId])

  const restore = async (version: number) => {
    if (!confirm(`Restaurar versão ${version}?`)) return
    setRestoring(version)
    try {
      const res = await fetch(`/api/email/saved-blocks/${savedBlockId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      })
      if (res.ok) onRestored()
    } finally { setRestoring(null) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Histórico de versões</h3>
            <p className="text-xs text-gray-500 mt-0.5">Restaure uma versão anterior do bloco universal.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-12 text-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></div>
          ) : versions.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">Nenhuma versão anterior.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {versions.map((v: any) => (
                <div key={v.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Versão {v.version}</p>
                    <p className="text-xs text-gray-500">{new Date(v.created_at).toLocaleString('pt-BR')}{v.comment && ` — ${v.comment}`}</p>
                  </div>
                  <button onClick={() => restore(v.version)} disabled={restoring === v.version}
                    className="text-xs font-medium text-violet-600 hover:text-violet-700 px-3 py-1.5 rounded-lg hover:bg-violet-50 disabled:opacity-50">
                    {restoring === v.version ? 'Restaurando...' : 'Restaurar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
