'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent, DragOverlay, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft, Save, Loader2, Monitor, Smartphone, Plus, Trash2, X, Undo2, Redo2, Copy,
  ChevronDown, ChevronRight, GripVertical, Users, CalendarDays, Target, Power,
  AtSign, ShieldCheck, Phone, TextCursorInput, User, Calendar,
  CircleDot, CheckSquare, Type, MousePointerClick, ImageIcon, Minus,
  GripHorizontal, Tag, Clock, Eye, Settings, Palette, Upload, LayoutGrid,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Bold, Italic, Underline, Link2, ExternalLink, Sparkles,
  SlidersHorizontal, Layers, Square, Sun, CornerDownRight,
  MoveHorizontal, MoveVertical, Check, MoreHorizontal, Pencil,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Block { id: string; type: string; props: Record<string, any> }
interface Step { id: string; name: string; blocks: Block[] }
interface PopupDesign {
  formType: 'popup' | 'flyout' | 'fullpage' | 'embed' | 'banner'
  steps: Step[]
  successStep: Step
  /** Global field styles applied to new inputs and updatable via "Apply to all inputs" */
  fieldStyles?: Record<string, any>
  styles: {
    width: number; minHeight?: number; backgroundColor: string; borderRadius: number; padding: number; fontFamily: string
    paddingTop?: number; paddingRight?: number; paddingBottom?: number; paddingLeft?: number
    overlay: { enabled: boolean; color: string; opacity: number; closeOnClick: boolean }
    closeButton: { show: boolean; color: string; size: number }
    sideImage: { enabled: boolean; src: string; position: 'left' | 'right'; width: number }
    animation: 'fade' | 'slide-up' | 'none'
  }
  behavior: {
    display: {
      // Legacy kept for backwards compat
      trigger?: 'time_delay' | 'scroll' | 'exit_intent' | 'click'
      // New Klaviyo-style independent toggles
      exitEnabled?: boolean
      timeEnabled?: boolean
      delay: number
      scrollEnabled?: boolean
      scrollPercent: number
      pageViewEnabled?: boolean
      pageViewCount?: number
      matchAll?: boolean // true = AND, false = OR
    }
    visibility: {
      devices: 'all' | 'desktop' | 'mobile'
      visitorType: 'all' | 'new' | 'returning'
      hideFromSubscribers: boolean
    }
    frequency: {
      showAfterDays: number
      stopAfterSubmission: boolean
    }
    targeting: {
      pages: 'all' | 'specific'
      pageUrls: string[]
      excludeUrls: string[]
    }
    scheduling: { enabled: boolean; startDate: string; endDate: string }
    audience: { tags: string[]; listId: string; doubleOptIn: boolean }
    // NEW Klaviyo-style targeting extensions
    urls?: {
      includeEnabled: boolean
      includeUrls: string[]
      excludeEnabled: boolean
      excludeUrls: string[]
    }
    location?: {
      includeEnabled: boolean
      includeCountries: string[]
      excludeEnabled: boolean
      excludeCountries: string[]
    }
    utm?: {
      storeOnConsent: boolean
      filterEnabled: boolean
      filters: Array<{ param: string; value: string }>
    }
    clickOutsideClose?: { desktop: boolean; mobile: boolean }
    customTrigger?: boolean
  }
  postSubmit?: {
    action: 'close' | 'redirect' | 'show-success'
    redirectUrl: string
    closeDelay: number
  }
  successMessage?: string
}

const uid = () => Math.random().toString(36).slice(2, 9)

const BLOCK_TYPES = [
  { type: 'email', label: 'Email', icon: AtSign },
  { type: 'legal-consent', label: 'Consentimento', icon: ShieldCheck },
  { type: 'phone', label: 'Telefone', icon: Phone },
  { type: 'text-input', label: 'Campo Texto', icon: TextCursorInput },
  { type: 'name-input', label: 'Nome', icon: User },
  { type: 'date-input', label: 'Data', icon: Calendar },
  { type: 'dropdown', label: 'Dropdown', icon: ChevronDown },
  { type: 'radio', label: 'Radio', icon: CircleDot },
  { type: 'checkbox', label: 'Checkbox', icon: CheckSquare },
  { type: 'text', label: 'Texto', icon: Type },
  { type: 'button', label: 'Botão', icon: MousePointerClick },
  { type: 'image', label: 'Imagem', icon: ImageIcon },
  { type: 'spacer', label: 'Espaçador', icon: Minus },
  { type: 'line', label: 'Linha', icon: GripHorizontal },
  { type: 'coupon', label: 'Cupom', icon: Tag },
  { type: 'countdown', label: 'Contagem', icon: Clock },
]

// Profile fields available for mapping (destinos no contato)
const PROFILE_FIELDS = [
  { value: 'first_name', label: 'Primeiro nome' },
  { value: 'last_name', label: 'Sobrenome' },
  { value: 'full_name', label: 'Nome completo' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Telefone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'birthday', label: 'Data de nascimento' },
  { value: 'gender', label: 'Genero' },
  { value: 'company', label: 'Empresa' },
  { value: 'position', label: 'Cargo' },
  { value: 'city', label: 'Cidade' },
  { value: 'state', label: 'Estado' },
  { value: 'country', label: 'Pais' },
  { value: 'zip', label: 'CEP' },
  { value: 'address', label: 'Endereco' },
  { value: 'custom', label: 'Campo personalizado' },
]

// Defaults compartilhados por inputs (estilos + layout)
const INPUT_BASE_DEFAULTS = {
  // Input config
  required: false,
  requiredMsg: 'Este campo e obrigatorio',
  showLabel: false,
  mapTo: '',
  mapToCustom: '',
  // Block layout
  align: 'full' as 'left' | 'center' | 'right' | 'full',
  paddingTop: 0, paddingRight: 0, paddingBottom: 8, paddingLeft: 0,
  // Input visual (Fields tab)
  inputStyle: 'solid' as 'solid' | 'underline',
  corners: 'medium' as 'none' | 'small' | 'medium' | 'large' | 'custom',
  cornerRadius: 8,
  backgroundColor: '#FFFFFF',
  errorColor: '#EF4444',
  fontFamily: 'inherit',
  fontSize: 14,
  bold: false,
  italic: false,
  underline: false,
  textColor: '#111827',
  placeholderColor: '#9CA3AF',
  labelColor: '#374151',
  textAlign: 'left' as 'left' | 'center' | 'right',
  borderWidth: 1,
  borderStyle: 'solid' as 'solid' | 'dashed' | 'dotted',
  borderColor: '#E5E7EB',
  inputPadTop: 12, inputPadRight: 16, inputPadBottom: 12, inputPadLeft: 16,
}

const defaultProps: Record<string, Record<string, any>> = {
  email: { ...INPUT_BASE_DEFAULTS, placeholder: 'Seu email', label: 'Email', required: true, mapTo: 'email' },
  phone: { ...INPUT_BASE_DEFAULTS, placeholder: 'WhatsApp', label: 'Telefone', countryCode: '+55', mapTo: 'phone' },
  'name-input': { ...INPUT_BASE_DEFAULTS, placeholder: 'Seu nome', label: 'Nome', mapTo: 'first_name' },
  'text-input': { ...INPUT_BASE_DEFAULTS, placeholder: 'Digite aqui...', label: 'Campo', showLabel: true, mapTo: 'custom' },
  'date-input': { ...INPUT_BASE_DEFAULTS, label: 'Data de nascimento', showLabel: true, mapTo: 'birthday' },
  dropdown: { label: 'Selecione', options: ['Opcao 1', 'Opcao 2'], placeholder: 'Escolha...', showLabel: true, mapTo: 'custom', mapToCustom: '' },
  radio: { label: 'Escolha', options: ['Opcao 1', 'Opcao 2'], layout: 'vertical', showLabel: true, mapTo: 'custom', mapToCustom: '' },
  checkbox: { label: 'Escolha', options: ['Opcao 1', 'Opcao 2'], showLabel: true, mapTo: 'custom', mapToCustom: '' },
  'legal-consent': { text: 'Aceito receber comunicações e concordo com a política de privacidade.', required: true, fontSize: 12, color: '#6B7280' },
  text: { content: 'Ganhe 10% de desconto!', fontSize: 28, color: '#111827', fontWeight: 'bold', align: 'center', tag: 'h2', lineHeight: 1.3 },
  button: { text: 'QUERO MEU DESCONTO', bgColor: '#F97316', textColor: '#fff', fontSize: 15, borderRadius: 8, fullWidth: true, action: 'submit', paddingV: 14, paddingH: 28 },
  image: { src: '', alt: '', imgWidth: 100, maxHeight: 300, borderRadius: 0, align: 'center', padding: 0 },
  spacer: { height: 24 },
  line: { color: '#E5E7EB', thickness: 1, style: 'solid' },
  coupon: { code: 'DESCONTO10', description: 'Seu cupom de desconto:', bgColor: '#FFF7ED', borderColor: '#F97316', fontSize: 20 },
  countdown: { endDate: '', style: 'dark', numberColor: '#FFFFFF', labelColor: '#9CA3AF', boxColor: '#1F2937', fontSize: 28, labels: { days: 'DIAS', hours: 'HORAS', minutes: 'MIN', seconds: 'SEG' } },
}

const defaultDesign: PopupDesign = {
  formType: 'popup',
  steps: [{ id: uid(), name: 'Etapa 1', blocks: [
    { id: uid(), type: 'text', props: { ...defaultProps.text } },
    { id: uid(), type: 'email', props: { ...defaultProps.email } },
    { id: uid(), type: 'button', props: { ...defaultProps.button } },
  ]}],
  successStep: { id: uid(), name: 'Sucesso', blocks: [
    { id: uid(), type: 'text', props: { content: 'Obrigado!', fontSize: 24, color: '#111827', fontWeight: 'bold', align: 'center' } },
  ]},
  styles: {
    width: 700, minHeight: 500, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 32, fontFamily: 'Inter, sans-serif',
    overlay: { enabled: true, color: '#000000', opacity: 50, closeOnClick: true },
    closeButton: { show: true, color: '#6B7280', size: 24 },
    sideImage: { enabled: false, src: '', position: 'left', width: 200 },
    animation: 'fade',
  },
  behavior: {
    display: {
      exitEnabled: false,
      timeEnabled: true,
      delay: 5,
      scrollEnabled: false,
      scrollPercent: 30,
      pageViewEnabled: false,
      pageViewCount: 3,
      matchAll: false,
    },
    visibility: { devices: 'all', visitorType: 'all', hideFromSubscribers: false },
    frequency: { showAfterDays: 1, stopAfterSubmission: true },
    targeting: { pages: 'all', pageUrls: [], excludeUrls: [] },
    scheduling: { enabled: false, startDate: '', endDate: '' },
    audience: { tags: [], listId: '', doubleOptIn: false },
    urls: { includeEnabled: false, includeUrls: [], excludeEnabled: false, excludeUrls: [] },
    location: { includeEnabled: false, includeCountries: [], excludeEnabled: false, excludeCountries: [] },
    utm: { storeOnConsent: false, filterEnabled: false, filters: [] },
    clickOutsideClose: { desktop: true, mobile: true },
    customTrigger: false,
  },
  postSubmit: { action: 'show-success', redirectUrl: '', closeDelay: 4 },
  successMessage: '',
}

// ── Small helpers ──────────────────────────────────────────────────────────────
function Section({ title, children, defaultOpen = false, noPadding = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean; noPadding?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full px-5 py-3.5 text-[13px] font-semibold text-gray-900 hover:bg-gray-50 transition-colors group">
        <span>{title}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className={noPadding ? 'pb-3' : 'px-5 pb-4 space-y-3'}>{children}</div>}
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-gray-700">{label}</label>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{hint}</p>}
      <div className="mt-1">{children}</div>
    </div>
  )
}

// Klaviyo-style toggle (label left, switch right)
function ToggleRow({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-start gap-3 py-1">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-gray-800 leading-tight">{label}</p>
        {hint && <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{hint}</p>}
      </div>
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${checked ? 'bg-brand-500' : 'bg-gray-200'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

// Panel-level color field
function PanelColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500/20">
        <input type="text" className="flex-1 px-3 py-2 text-[13px] font-mono text-gray-800 outline-none" value={value || ''} onChange={e => onChange(e.target.value)} placeholder="#000000" />
        <label className="relative w-9 h-9 border-l border-gray-200 cursor-pointer flex-shrink-0" style={{ backgroundColor: value || '#FFFFFF' }}>
          <input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
      </div>
    </Field>
  )
}

const inp = "w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors"
const sel = inp + " bg-white cursor-pointer"

// Helper: compute input styles from props (used by preview AND public script logic)
function cornerPx(corners: string, cornerRadius: number) {
  if (corners === 'none') return 0
  if (corners === 'small') return 4
  if (corners === 'medium') return 8
  if (corners === 'large') return 16
  if (corners === 'custom') return cornerRadius || 0
  return 8
}

function buildInputStyle(p: any): React.CSSProperties {
  const radius = cornerPx(p.corners || 'medium', p.cornerRadius || 8)
  const isUnderline = p.inputStyle === 'underline'
  return {
    width: '100%',
    boxSizing: 'border-box',
    paddingTop: p.inputPadTop ?? 12,
    paddingRight: p.inputPadRight ?? 16,
    paddingBottom: p.inputPadBottom ?? 12,
    paddingLeft: p.inputPadLeft ?? 16,
    backgroundColor: isUnderline ? 'transparent' : (p.backgroundColor || '#FFFFFF'),
    color: p.textColor || '#111827',
    fontFamily: p.fontFamily && p.fontFamily !== 'inherit' ? p.fontFamily : 'inherit',
    fontSize: p.fontSize || 14,
    fontWeight: p.bold ? 700 : 400,
    fontStyle: p.italic ? 'italic' : 'normal',
    textDecoration: p.underline ? 'underline' : 'none',
    textAlign: (p.textAlign || 'left') as any,
    borderTop: isUnderline ? 'none' : `${p.borderWidth ?? 1}px ${p.borderStyle || 'solid'} ${p.borderColor || '#E5E7EB'}`,
    borderLeft: isUnderline ? 'none' : `${p.borderWidth ?? 1}px ${p.borderStyle || 'solid'} ${p.borderColor || '#E5E7EB'}`,
    borderRight: isUnderline ? 'none' : `${p.borderWidth ?? 1}px ${p.borderStyle || 'solid'} ${p.borderColor || '#E5E7EB'}`,
    borderBottom: `${p.borderWidth ?? 1}px ${p.borderStyle || 'solid'} ${p.borderColor || '#E5E7EB'}`,
    borderRadius: isUnderline ? 0 : radius,
    outline: 'none',
  }
}

function buildBlockWrapperStyle(p: any): React.CSSProperties {
  const align = p.align || 'full'
  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
  const width = align === 'full' ? '100%' : 'auto'
  const innerMaxWidth = align === 'full' ? '100%' : '80%'
  return {
    display: 'flex',
    justifyContent: justify,
    paddingTop: p.paddingTop ?? 0,
    paddingRight: p.paddingRight ?? 0,
    paddingBottom: p.paddingBottom ?? 8,
    paddingLeft: p.paddingLeft ?? 0,
    width: '100%',
    marginTop: p.marginTop || 0,
    marginBottom: p.marginBottom ?? 0,
    // Legacy block wrapper styles
    backgroundColor: p.blockBg || undefined,
    borderRadius: p.blockRadius || 0,
    boxShadow: p.shadow || undefined,
    opacity: p.opacity != null ? p.opacity / 100 : undefined,
    ['--worder-input-width' as any]: innerMaxWidth,
  }
}

// CSS injected once for placeholder color on preview inputs
function InputPreviewStyles() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      .worder-input::placeholder { color: var(--worder-ph-color, #9CA3AF) !important; opacity: 1; }
      .worder-input-wrap { width: var(--worder-input-width, 100%); max-width: 100%; }
    ` }} />
  )
}

function InputBlockPreview({ block, children }: { block: Block; children?: React.ReactNode }) {
  const p = block.props
  const wrapper = buildBlockWrapperStyle(p)
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 500,
    color: p.labelColor || '#374151',
    marginBottom: 4,
    textAlign: (p.textAlign || 'left') as any,
  }
  return (
    <div style={wrapper}>
      <div className="worder-input-wrap">
        {p.showLabel && p.label && <label style={labelStyle}>{p.label}</label>}
        {children}
      </div>
    </div>
  )
}

// ── Inline editable primitive (Klaviyo-style) ────────────────────────────────
// Renders a contentEditable element whose content stays in sync with `value`
// without overwriting the user's in-progress edit while focused.
function InlineEditable({
  value,
  onCommit,
  tag = 'div',
  style,
  className,
  editable,
  autoFocus,
  singleLine,
  placeholder,
}: {
  value: string
  onCommit: (v: string) => void
  tag?: string
  style?: React.CSSProperties
  className?: string
  editable: boolean
  autoFocus?: boolean
  singleLine?: boolean
  placeholder?: string
}) {
  const ref = useRef<HTMLElement | null>(null)

  // Sync external value → DOM, but never while the user is editing this node.
  // Depends on `tag` too because changing the tag remounts the element, and
  // the fresh DOM node starts with empty innerText.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (document.activeElement === el) return
    if (el.innerText !== (value ?? '')) {
      el.innerText = value ?? ''
    }
  }, [value, tag])

  // Auto-focus and place caret at end when entering edit mode.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (editable && autoFocus && document.activeElement !== el) {
      el.focus()
      const sel = window.getSelection()
      if (sel) {
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
  }, [editable, autoFocus])

  const Tag = tag as any
  // Don't pass children — React would otherwise reconcile DOM text and
  // overwrite the user's in-progress contentEditable edits. innerText is
  // managed entirely via the useEffect above.
  return (
    <Tag
      ref={ref}
      contentEditable={editable}
      suppressContentEditableWarning
      data-placeholder={placeholder || ''}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === 'Escape') { (e.currentTarget as HTMLElement).blur(); return }
        if (singleLine && e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur() }
      }}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const txt = e.currentTarget.innerText.replace(/\u00A0/g, ' ')
        if (txt !== (value ?? '')) onCommit(txt)
      }}
      onClick={(e: React.MouseEvent) => { if (editable) e.stopPropagation() }}
      className={`worder-inline-editable ${className || ''}`}
      style={{
        outline: 'none',
        cursor: editable ? 'text' : 'inherit',
        minHeight: '1em',
        ...style,
      }}
    />
  )
}

function InlineEditableStyles() {
  return (
    <style dangerouslySetInnerHTML={{ __html: `
      .worder-inline-editable:empty:before {
        content: attr(data-placeholder);
        color: rgba(0,0,0,0.3);
        pointer-events: none;
      }
      .worder-inline-editable[contenteditable="true"]:focus {
        box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.15) inset;
      }
    ` }} />
  )
}

// ── Block Renderer (canvas) ────────────────────────────────────────────────────
function BlockPreview({ block, selected, onContentChange }: { block: Block; selected?: boolean; onContentChange?: (key: string, value: string) => void }) {
  const p = block.props
  const blockStyle: React.CSSProperties = {
    marginTop: p.marginTop || 0, marginBottom: p.marginBottom ?? 8,
    padding: p.blockPadding || 0, backgroundColor: p.blockBg || undefined,
    borderRadius: p.blockRadius || 0,
    border: p.borderWidth && !['email','phone','name-input','text-input','date-input'].includes(block.type) ? `${p.borderWidth}px ${p.borderStyle || 'solid'} ${p.borderColor || '#E5E7EB'}` : undefined,
    boxShadow: p.shadow || undefined,
    opacity: p.opacity != null ? p.opacity / 100 : undefined,
  }
  const inputStyle = "w-full border border-gray-200 rounded-lg px-4 py-3 text-sm bg-white placeholder-gray-400 outline-none"
  const phCssVar = { ['--worder-ph-color' as any]: p.placeholderColor || '#9CA3AF' } as React.CSSProperties
  switch (block.type) {
    case 'text': {
      const Tag = (p.tag === 'h1' || p.tag === 'h2' || p.tag === 'h3') ? p.tag : 'p'
      const textStyle: React.CSSProperties = {
        ...blockStyle,
        fontSize: p.fontSize || 16,
        color: p.color || '#111827',
        fontWeight: p.fontWeight || 'normal',
        fontStyle: p.fontStyle || 'normal',
        textDecoration: p.textDecoration || 'none',
        textAlign: p.align || 'left',
        lineHeight: p.lineHeight || 1.4,
        fontFamily: p.fontFamily || 'inherit',
        letterSpacing: p.letterSpacing != null ? `${p.letterSpacing}px` : undefined,
        paddingTop: p.blockPadTop ?? 0,
        paddingRight: p.blockPadRight ?? 0,
        paddingBottom: p.blockPadBottom ?? 0,
        paddingLeft: p.blockPadLeft ?? 0,
        minHeight: '1em',
        margin: 0,
        marginTop: blockStyle.marginTop ?? 0,
        marginBottom: blockStyle.marginBottom ?? 8,
      }
      if (onContentChange) {
        return (
          <InlineEditable
            tag={Tag}
            value={p.content || ''}
            editable={!!selected}
            autoFocus={!!selected}
            placeholder="Digite seu texto..."
            onCommit={(v) => onContentChange('content', v)}
            style={textStyle}
          />
        )
      }
      return <Tag style={textStyle}>{p.content}</Tag>
    }
    case 'email':
      return <InputBlockPreview block={block}><><InputPreviewStyles /><input readOnly placeholder={p.placeholder || 'Seu email'} className="worder-input" style={{ ...buildInputStyle(p), ...phCssVar }} /></></InputBlockPreview>
    case 'phone':
      return <InputBlockPreview block={block}><><InputPreviewStyles /><div style={{ display: 'flex', gap: 8, width: '100%' }}>
        <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', border: `${p.borderWidth ?? 1}px ${p.borderStyle || 'solid'} ${p.borderColor || '#E5E7EB'}`, borderRadius: cornerPx(p.corners || 'medium', p.cornerRadius || 8), fontSize: p.fontSize || 14, color: p.textColor || '#111827', background: p.backgroundColor || '#F9FAFB', whiteSpace: 'nowrap' }}>{p.countryCode || '+55'}</span>
        <input readOnly placeholder={p.placeholder || 'Telefone'} className="worder-input" style={{ ...buildInputStyle(p), ...phCssVar }} />
      </div></></InputBlockPreview>
    case 'name-input': case 'text-input':
      return <InputBlockPreview block={block}><><InputPreviewStyles /><input readOnly placeholder={p.placeholder || ''} className="worder-input" style={{ ...buildInputStyle(p), ...phCssVar }} /></></InputBlockPreview>
    case 'date-input':
      return <InputBlockPreview block={block}><><InputPreviewStyles /><input type="date" className="worder-input" style={{ ...buildInputStyle(p), ...phCssVar }} /></></InputBlockPreview>
    case 'button': {
      const btnStyle: React.CSSProperties = {
        backgroundColor: p.bgColor || '#F97316', color: p.textColor || '#fff',
        borderRadius: p.borderRadius || 8, width: p.fullWidth ? '100%' : 'auto',
        fontSize: p.fontSize || 15,
        fontWeight: p.btnFontWeight || 700,
        fontFamily: p.fontFamily || 'inherit',
        letterSpacing: p.btnLetterSpacing != null ? `${p.btnLetterSpacing}px` : undefined,
        textTransform: p.textTransform || 'none',
        padding: `${p.paddingV || 14}px ${p.paddingH || 28}px`,
        border: p.btnBorderWidth ? `${p.btnBorderWidth}px ${p.btnBorderStyle || 'solid'} ${p.btnBorderColor || '#E5E7EB'}` : 'none',
        boxShadow: p.btnShadow || undefined,
        cursor: 'pointer', transition: 'background-color 0.2s',
        display: 'inline-block', textAlign: 'center' as const,
      }
      return <div style={{ ...blockStyle, textAlign: p.fullWidth ? undefined : (p.align || 'center') as any }}>
        {onContentChange ? (
          <InlineEditable
            tag="button"
            value={p.text || ''}
            editable={!!selected}
            autoFocus={!!selected}
            singleLine
            placeholder="Clique para editar..."
            onCommit={(v) => onContentChange('text', v)}
            style={btnStyle}
          />
        ) : (
          <button
            onMouseEnter={e => { if (p.hoverColor) (e.currentTarget as HTMLButtonElement).style.backgroundColor = p.hoverColor }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = p.bgColor || '#F97316' }}
            style={btnStyle}>{p.text || 'Enviar'}</button>
        )}
      </div>
    }
    case 'image': {
      const imgStyle: React.CSSProperties = { width: `${p.imgWidth || 100}%`, maxHeight: p.maxHeight || 300, objectFit: (p.objectFit || 'contain') as any, borderRadius: p.borderRadius || 0, display: 'inline-block', boxShadow: p.shadow || undefined }
      const imgEl = p.src
        ? <img src={p.src} alt={p.alt || ''} style={imgStyle} />
        : <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center text-gray-300"><ImageIcon className="w-10 h-10" /></div>
      return <div style={{ ...blockStyle, boxShadow: undefined, textAlign: (p.align || 'center') as any, padding: p.padding || 0 }}>
        {p.href ? <a href={p.href} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block' }}>{imgEl}</a> : imgEl}
      </div>
    }
    case 'spacer': return <div style={{ ...blockStyle, height: p.height || 24 }} />
    case 'line': return <div style={blockStyle}><hr style={{ border: 'none', borderTop: `${p.thickness || 1}px ${p.style || 'solid'} ${p.color || '#E5E7EB'}`, margin: 0 }} /></div>
    case 'coupon':
      return <div style={{ ...blockStyle, padding: '16px', border: `2px dashed ${p.borderColor || '#F97316'}`, borderRadius: p.borderRadius ?? 8, textAlign: 'center', background: p.bgColor || '#FFF7ED' }}>
        <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 4px' }}>{p.description}</p>
        <p onClick={() => { navigator.clipboard?.writeText(p.code || ''); }}
          style={{ fontSize: p.fontSize || 20, fontWeight: 700, color: p.codeColor || '#F97316', letterSpacing: 2, margin: 0, cursor: 'pointer' }}
          title="Clique para copiar">{p.code}</p>
      </div>
    case 'countdown': {
      const vals = ['03', '12', '45', '30']
      const lbls = p.labels || { days: 'DIAS', hours: 'HORAS', minutes: 'MIN', seconds: 'SEG' }
      return <div style={{ ...blockStyle, textAlign: 'center', padding: '16px', backgroundColor: p.boxColor || '#1F2937', borderRadius: 8 }}><div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>{vals.map((v, i) => (<span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{i > 0 && <span style={{ color: p.labelColor || '#9CA3AF', fontSize: 20, fontWeight: 700 }}>:</span>}<span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><span style={{ fontSize: p.fontSize || 28, fontWeight: 800, color: p.numberColor || '#FFFFFF', lineHeight: 1 }}>{v}</span><span style={{ fontSize: 9, color: p.labelColor || '#9CA3AF', marginTop: 4, letterSpacing: 1 }}>{[lbls.days, lbls.hours, lbls.minutes, lbls.seconds][i]}</span></span></span>))}</div></div>
    }
    case 'legal-consent':
      return <div style={blockStyle}><label className="flex items-start gap-2" style={{ fontSize: p.fontSize || 12, color: p.color || '#6B7280', lineHeight: p.lineHeight || 1.4 }}><input type="checkbox" className="mt-0.5 flex-shrink-0" /><span dangerouslySetInnerHTML={{ __html: (p.text || '').replace(/<a /g, `<a style="color:${p.linkColor || '#F97316'};text-decoration:underline;" `) }} /></label></div>
    case 'dropdown':
      return <div style={blockStyle}>
        {p.showLabel !== false && p.label && <label className="block text-[13px] font-medium text-gray-700 mb-1">{p.label}</label>}
        <select className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm bg-white text-gray-600 outline-none">
          <option>{p.placeholder || 'Escolha...'}</option>
          {(p.options || []).map((o: string) => <option key={o}>{o}</option>)}
        </select>
      </div>
    case 'radio':
      return <div style={blockStyle}>
        {p.showLabel !== false && p.label && <label className="block text-[13px] font-medium text-gray-700 mb-1.5">{p.label}</label>}
        <div style={{ display: 'flex', flexDirection: p.layout === 'horizontal' ? 'row' : 'column', gap: p.layout === 'horizontal' ? 12 : 8 }}>
          {(p.options || []).map((o: string) => <label key={o} className="flex items-center gap-2.5 text-[13px] text-gray-700 cursor-pointer"><input type="radio" name={block.id} className="accent-brand-500" />{o}</label>)}
        </div>
      </div>
    case 'checkbox':
      return <div style={blockStyle}>
        {p.showLabel !== false && p.label && <label className="block text-[13px] font-medium text-gray-700 mb-1.5">{p.label}</label>}
        <div className="space-y-2">
          {(p.options || []).map((o: string) => <label key={o} className="flex items-center gap-2.5 text-[13px] text-gray-700 cursor-pointer"><input type="checkbox" className="rounded accent-brand-500" />{o}</label>)}
        </div>
      </div>
    default: return <div className="text-xs text-gray-400 p-2">[{block.type}]</div>
  }
}

// ── Block Props Editor primitives ────────────────────────────────────────────
// IMPORTANT: these MUST live at module scope. Defining them inside BlockEditor
// makes them new function references on every render, which makes React treat
// every <UnitInput/> etc. as a different component type and unmount/remount
// the underlying <input>. That destroys focus on every keystroke — typing "10"
// in a px field would commit "1", lose focus, and require another click to
// type the second digit. Keep these out of BlockEditor.

const AlignButtons = ({ value, onChange: oc, showFull = true }: { value: string; onChange: (v: string) => void; showFull?: boolean }) => {
  const opts: Array<{ v: string; I: React.ComponentType<any>; label: string }> = [
    { v: 'left', I: AlignLeft, label: 'Esquerda' },
    { v: 'center', I: AlignCenter, label: 'Centro' },
    { v: 'right', I: AlignRight, label: 'Direita' },
  ]
  if (showFull) opts.push({ v: 'full', I: AlignJustify, label: 'Preencher' })
  return (
    <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden bg-white w-full">
      {opts.map(({ v, I, label }) => (
        <button key={v} onClick={() => oc(v)} title={label}
          className={`flex-1 py-2 flex items-center justify-center transition-colors ${value === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
          <I className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  )
}

const Toggle = ({ label, checked, onChange: oc, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) => (
  <div className="flex items-start gap-3 py-1 min-w-0">
    <div className="flex-1 min-w-0">
      <p className="text-[13px] text-gray-800 leading-tight">{label}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{hint}</p>}
    </div>
    <button type="button" onClick={() => oc(!checked)}
      className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${checked ? 'bg-brand-500' : 'bg-gray-200'}`}>
      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  </div>
)

const LabeledField = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div>
    <label className="block text-[12px] font-medium text-gray-800">{label}</label>
    {hint && <p className="text-[11px] text-gray-400 mt-0.5 mb-1.5 leading-snug">{hint}</p>}
    <div className={hint ? '' : 'mt-1'}>{children}</div>
  </div>
)

const Group = ({ title, children, defaultOpen = true, icon }: { title: string; children: React.ReactNode; defaultOpen?: boolean; icon?: React.ReactNode }) => {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full py-3 text-[13px] font-semibold text-gray-800 hover:text-gray-900">
        <span className="flex items-center gap-2">
          {icon && <span className="text-gray-400">{icon}</span>}
          {title}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="pb-4 space-y-3">{children}</div>}
    </div>
  )
}

const ColorRow = ({ label, value, onChange: oc, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) => (
  <LabeledField label={label} hint={hint}>
    <ColorPicker value={value || ''} onChange={oc} />
  </LabeledField>
)
const CleanColor = ColorRow
const ColorField = ColorRow

const UnitInput = ({ value, onChange: oc, unit = 'px', min = 0, max = 999, step = 1, className = '' }: { value: number; onChange: (v: number) => void; unit?: string; min?: number; max?: number; step?: number; className?: string }) => (
  <div className={`relative ${className}`}>
    <input type="number" min={min} max={max} step={step}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-8 text-[13px] text-gray-800 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-colors"
      value={value} onChange={e => oc(+e.target.value)} />
    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium text-gray-400">{unit}</span>
  </div>
)

const Stepper = ({ value, onChange: oc, min = 0, max = 999, step = 1, unit }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string }) => (
  <div className="inline-flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
    <button type="button" onClick={() => oc(Math.max(min, value - step))}
      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
      <Minus className="w-3 h-3" />
    </button>
    <input type="number" min={min} max={max} step={step}
      value={value}
      onChange={e => oc(+e.target.value)}
      className="w-12 h-8 text-center text-[12px] text-gray-800 bg-transparent outline-none border-x border-gray-200" />
    <button type="button" onClick={() => oc(Math.min(max, value + step))}
      className="w-8 h-8 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors">
      <Plus className="w-3 h-3" />
    </button>
    {unit && <span className="px-2 text-[10px] text-gray-400 border-l border-gray-200 h-8 flex items-center">{unit}</span>}
  </div>
)

const Slider = ({ value, onChange: oc, min = 0, max = 100, step = 1, unit = 'px' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string }) => (
  <div className="flex items-center gap-3">
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => oc(+e.target.value)}
      className="flex-1 accent-brand-500 h-1" />
    <div className="flex items-center gap-1 w-[64px] justify-end">
      <input type="number" min={min} max={max} step={step} value={value} onChange={e => oc(+e.target.value)}
        className="w-10 px-1.5 py-1 text-[11px] text-gray-800 border border-gray-200 rounded text-center outline-none focus:border-brand-500" />
      <span className="text-[10px] text-gray-400">{unit}</span>
    </div>
  </div>
)

const Segmented = <T extends string,>({ value, onChange: oc, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label?: string; icon?: React.ReactNode; title?: string }> }) => (
  <div className="flex border border-gray-200 rounded-lg overflow-hidden bg-white">
    {options.map(opt => (
      <button key={opt.value} type="button" onClick={() => oc(opt.value)} title={opt.title}
        className={`flex-1 py-2 px-2 flex items-center justify-center gap-1.5 text-[12px] font-medium transition-colors ${value === opt.value ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
        {opt.icon}
        {opt.label && <span className="truncate">{opt.label}</span>}
      </button>
    ))}
  </div>
)

const FontSelect = ({ value, onChange: oc }: { value: string; onChange: (v: string) => void }) => {
  const fonts = [
    { v: 'inherit', l: 'Padrão' },
    { v: "'Inter', sans-serif", l: 'Inter' },
    { v: "'Montserrat', sans-serif", l: 'Montserrat' },
    { v: "'Poppins', sans-serif", l: 'Poppins' },
    { v: "'Roboto', sans-serif", l: 'Roboto' },
    { v: "'Open Sans', sans-serif", l: 'Open Sans' },
    { v: 'Georgia, serif', l: 'Georgia' },
    { v: "'Times New Roman', serif", l: 'Times New Roman' },
    { v: 'Arial, sans-serif', l: 'Arial' },
    { v: "'Helvetica Neue', sans-serif", l: 'Helvetica' },
  ]
  return (
    <select className={sel} value={value || 'inherit'} onChange={e => oc(e.target.value)}
      style={{ fontFamily: value || 'inherit' }}>
      {fonts.map(f => <option key={f.v} value={f.v} style={{ fontFamily: f.v }}>{f.l}</option>)}
    </select>
  )
}

const SectionHeader = ({ title }: { title: string; icon?: React.ReactNode }) => (
  <div className="pt-1 pb-1">
    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">{title}</p>
  </div>
)

// Single padding-side number input. Used by PaddingControl below — kept at
// module scope (not nested) so its <input> doesn't remount per keystroke.
const PaddingNum = ({ value, onChange: oc }: { value: number; onChange: (v: number) => void }) => (
  <div className="relative">
    <input type="number" min={0} max={120}
      className="w-full px-2 py-1.5 pr-6 border border-gray-200 rounded-md text-[12px] text-gray-800 text-center outline-none focus:border-brand-500"
      value={value} onChange={e => oc(+e.target.value)} />
    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">px</span>
  </div>
)

const PaddingControl = ({ p, up, prefix, defaults }: { p: any; up: (k: string, v: any) => void; prefix: 'padding' | 'inputPad' | 'blockPad'; defaults?: { t?: number; r?: number; b?: number; l?: number } }) => {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const keyT = prefix === 'padding' ? 'paddingTop' : `${prefix}${cap('top')}`
  const keyR = prefix === 'padding' ? 'paddingRight' : `${prefix}${cap('right')}`
  const keyB = prefix === 'padding' ? 'paddingBottom' : `${prefix}${cap('bottom')}`
  const keyL = prefix === 'padding' ? 'paddingLeft' : `${prefix}${cap('left')}`
  const d = defaults || {}
  return (
    <div className="grid grid-cols-3 gap-1.5 max-w-[220px] mx-auto">
      <div />
      <PaddingNum value={p[keyT] ?? (d.t ?? 0)} onChange={v => up(keyT, v)} />
      <div />
      <PaddingNum value={p[keyL] ?? (d.l ?? 0)} onChange={v => up(keyL, v)} />
      <div className="flex items-center justify-center">
        <div className="w-7 h-7 rounded-sm bg-gradient-to-br from-gray-100 to-gray-50 border border-gray-200" />
      </div>
      <PaddingNum value={p[keyR] ?? (d.r ?? 0)} onChange={v => up(keyR, v)} />
      <div />
      <PaddingNum value={p[keyB] ?? (d.b ?? 0)} onChange={v => up(keyB, v)} />
      <div />
    </div>
  )
}

const TextFormat = ({ p, up, keyWeight = 'fontWeight', keyStyle = 'fontStyle', keyDeco = 'textDecoration' }: { p: any; up: (k: string, v: any) => void; keyWeight?: string; keyStyle?: string; keyDeco?: string }) => (
  <div className="inline-flex items-center gap-0.5 border border-gray-200 rounded-lg p-0.5 bg-white">
    <button onClick={() => up(keyWeight, p[keyWeight] === 'bold' ? 'normal' : 'bold')}
      className={`w-9 h-8 flex items-center justify-center rounded transition-colors ${p[keyWeight] === 'bold' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`} title="Negrito">
      <Bold className="w-3.5 h-3.5" />
    </button>
    <button onClick={() => up(keyStyle, p[keyStyle] === 'italic' ? 'normal' : 'italic')}
      className={`w-9 h-8 flex items-center justify-center rounded transition-colors ${p[keyStyle] === 'italic' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`} title="Itálico">
      <Italic className="w-3.5 h-3.5" />
    </button>
    <button onClick={() => up(keyDeco, p[keyDeco] === 'underline' ? 'none' : 'underline')}
      className={`w-9 h-8 flex items-center justify-center rounded transition-colors ${p[keyDeco] === 'underline' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`} title="Sublinhado">
      <Underline className="w-3.5 h-3.5" />
    </button>
  </div>
)

const BorderStyleControl = ({ p, up }: { p: any; up: (k: string, v: any) => void }) => (
  <Segmented value={p.borderStyle || 'solid'} onChange={v => up('borderStyle', v)} options={[
    { value: 'solid', label: '───', title: 'Sólida' },
    { value: 'dashed', label: '╌╌╌', title: 'Tracejada' },
    { value: 'dotted', label: '· · ·', title: 'Pontilhada' },
  ]} />
)

// ── Block Props Editor (Klaviyo-style per-block panels) ──────────────────────
function BlockEditor({ block, onChange, onDelete, onOpenMedia, onApplyToAllInputs }: { block: Block; onChange: (b: Block) => void; onDelete: () => void; onOpenMedia?: (cb: (url: string) => void) => void; onApplyToAllInputs?: (b: Block) => void }) {
  const up = (key: string, val: any) => onChange({ ...block, props: { ...block.props, [key]: val } })
  const p = block.props
  const [tab, setTab] = useState<'props' | 'fields' | 'layout'>('props')
  const isInputBlock = ['email', 'phone', 'name-input', 'text-input', 'date-input'].includes(block.type)

  const blockLabel: Record<string, string> = {
    email: 'Email', phone: 'Telefone', 'name-input': 'Nome', 'text-input': 'Campo',
    'date-input': 'Data', dropdown: 'Dropdown', radio: 'Radio', checkbox: 'Checkbox',
    'legal-consent': 'Consentimento', text: 'Conteúdo', button: 'Botão', image: 'Imagem',
    spacer: 'Espaçador', line: 'Linha', coupon: 'Cupom', countdown: 'Contagem',
  }

  // Unified input "Input" tab renderer (Omnisend-style clean sections)
  const renderInputConfig = () => {
    // Lock email/phone mapping since the type implies the target
    const lockedMap = block.type === 'email' ? 'email' : block.type === 'phone' ? 'phone' : null
    return (
      <div className="space-y-5">
        {/* Content section */}
        <div className="space-y-3">
          <SectionHeader title="Conteúdo" />

          <LabeledField label="Mapear para" hint="Onde o valor deste campo será salvo no perfil do contato.">
            <select className={sel} value={lockedMap || p.mapTo || ''} disabled={!!lockedMap} onChange={e => up('mapTo', e.target.value)}>
              <option value="">Não mapear</option>
              {PROFILE_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </LabeledField>

          {(p.mapTo === 'custom' && !lockedMap) && (
            <LabeledField label="Nome do campo personalizado" hint="Identificador técnico salvo em custom_fields.">
              <input className={inp} value={p.mapToCustom || ''} onChange={e => up('mapToCustom', e.target.value)} placeholder="ex: favoriteColor" />
            </LabeledField>
          )}

          <LabeledField label="Placeholder" hint="Texto de dica exibido quando o campo está vazio.">
            <input className={inp} value={p.placeholder || ''} onChange={e => up('placeholder', e.target.value)} placeholder="Ex: Seu email" />
          </LabeledField>

          {block.type === 'phone' && (
            <LabeledField label="Código do país padrão">
              <select className={sel} value={p.countryCode || '+55'} onChange={e => up('countryCode', e.target.value)}>
                <option value="+55">Brasil (+55)</option>
                <option value="+1">EUA / Canadá (+1)</option>
                <option value="+351">Portugal (+351)</option>
                <option value="+44">Reino Unido (+44)</option>
                <option value="+34">Espanha (+34)</option>
                <option value="+49">Alemanha (+49)</option>
                <option value="+33">França (+33)</option>
              </select>
            </LabeledField>
          )}

          <div className="pt-1">
            <Toggle label="Mostrar label acima do campo" hint="Exibe um texto descritivo antes do input." checked={p.showLabel || false} onChange={v => up('showLabel', v)} />
          </div>
          {p.showLabel && (
            <LabeledField label="Texto do label">
              <input className={inp} value={p.label || ''} onChange={e => up('label', e.target.value)} placeholder="Ex: Seu melhor email" />
            </LabeledField>
          )}
        </div>

        {/* Validation section */}
        <div className="pt-4 border-t border-gray-100 space-y-3">
          <SectionHeader title="Validação" icon={<ShieldCheck className="w-3 h-3" />} />

          <Toggle label="Campo obrigatório" hint={block.type === 'email' ? 'Email é sempre obrigatório.' : 'Impede o envio quando vazio.'} checked={block.type === 'email' ? true : !!p.required} onChange={v => { if (block.type !== 'email') up('required', v) }} />
          {(p.required || block.type === 'email') && (
            <LabeledField label="Mensagem quando vazio" hint="Exibida quando o usuário não preenche o campo.">
              <input className={inp} value={p.requiredMsg || 'Este campo é obrigatório'} onChange={e => up('requiredMsg', e.target.value)} />
            </LabeledField>
          )}
          {(block.type === 'email' || block.type === 'phone') && (
            <LabeledField label="Mensagem quando inválido" hint="Exibida quando o formato não corresponde ao esperado.">
              <input className={inp} value={p.errorMsg || (block.type === 'email' ? 'Email inválido' : 'Telefone inválido')} onChange={e => up('errorMsg', e.target.value)} />
            </LabeledField>
          )}
        </div>

        {/* Layout section */}
        <div className="pt-4 border-t border-gray-100 space-y-3">
          <SectionHeader title="Layout" icon={<LayoutGrid className="w-3 h-3" />} />
          <LabeledField label="Largura">
            <Segmented value={p.align || 'full'} onChange={v => up('align', v)} options={[
              { value: 'left', label: 'Esq', icon: <AlignLeft className="w-3 h-3" /> },
              { value: 'center', label: 'Centro', icon: <AlignCenter className="w-3 h-3" /> },
              { value: 'right', label: 'Dir', icon: <AlignRight className="w-3 h-3" /> },
              { value: 'full', label: 'Preencher', icon: <AlignJustify className="w-3 h-3" /> },
            ]} />
          </LabeledField>

          <LabeledField label="Espaçamento externo" hint="Margem ao redor do campo (fora da borda).">
            <PaddingControl p={p} up={up} prefix="padding" defaults={{ b: 8 }} />
          </LabeledField>
        </div>

        {/* Tip about Field settings */}
        {onApplyToAllInputs && (
          <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100 flex items-start gap-2.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-900/80 leading-relaxed">
              Edite cores, borda e tipografia do campo na aba <span className="font-semibold">Fields</span>.
              Use o botão <span className="font-semibold">"Aplicar a todos"</span> lá para replicar o estilo em todos os inputs.
            </p>
          </div>
        )}
      </div>
    )
  }

  // Unified "Fields" tab renderer (Klaviyo-style grouped sections)
  const renderInputFields = () => {
    const handleApplyToAll = () => {
      if (!onApplyToAllInputs) return
      if (confirm('Aplicar estes estilos a TODOS os campos de input do popup?')) {
        onApplyToAllInputs(block)
      }
    }
    return (
      <div className="space-y-5">
        {onApplyToAllInputs && (
          <button onClick={handleApplyToAll}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-[12px] font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg transition-colors">
            <Sparkles className="w-3.5 h-3.5" />
            Aplicar estes estilos a todos os inputs
          </button>
        )}

        {/* Shape section */}
        <div className="space-y-3">
          <SectionHeader title="Forma" icon={<Square className="w-3 h-3" />} />
          <LabeledField label="Estilo do campo">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => up('inputStyle', 'solid')}
                className={`py-4 rounded-lg border-2 transition-colors flex items-center justify-center ${p.inputStyle !== 'underline' ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="w-16 h-5 rounded border border-gray-700 bg-white" />
              </button>
              <button onClick={() => up('inputStyle', 'underline')}
                className={`py-4 rounded-lg border-2 transition-colors flex items-center justify-center ${p.inputStyle === 'underline' ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="w-16 h-5 border-b-2 border-gray-700" />
              </button>
            </div>
          </LabeledField>

          {p.inputStyle !== 'underline' && (
            <LabeledField label="Raio dos cantos">
              <Slider value={p.cornerRadius ?? 8} onChange={v => { up('cornerRadius', v); up('corners', 'custom') }} min={0} max={50} unit="px" />
            </LabeledField>
          )}
        </div>

        {/* Colors */}
        <div className="pt-4 border-t border-gray-100 space-y-3">
          <SectionHeader title="Cores" icon={<Palette className="w-3 h-3" />} />
          <ColorRow label="Fundo" value={p.backgroundColor || '#FFFFFF'} onChange={v => up('backgroundColor', v)} />
          <ColorRow label="Texto digitado" value={p.textColor || '#111827'} onChange={v => up('textColor', v)} />
          <ColorRow label="Placeholder" value={p.placeholderColor || '#9CA3AF'} onChange={v => up('placeholderColor', v)} />
          <ColorRow label="Label" value={p.labelColor || '#374151'} onChange={v => up('labelColor', v)} />
          <ColorRow label="Erro" hint="Cor usada ao exibir mensagens de validação." value={p.errorColor || '#EF4444'} onChange={v => up('errorColor', v)} />
        </div>

        {/* Border */}
        {p.inputStyle !== 'underline' && (
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Borda" icon={<Square className="w-3 h-3" />} />
            <div className="grid grid-cols-2 gap-2">
              <LabeledField label="Largura">
                <UnitInput value={p.borderWidth ?? 1} onChange={v => up('borderWidth', v)} min={0} max={8} />
              </LabeledField>
              <LabeledField label="Estilo">
                <BorderStyleControl p={p} up={up} />
              </LabeledField>
            </div>
            {(p.borderWidth ?? 1) > 0 && (
              <ColorRow label="Cor da borda" value={p.borderColor || '#E5E7EB'} onChange={v => up('borderColor', v)} />
            )}
          </div>
        )}

        {/* Typography */}
        <div className="pt-4 border-t border-gray-100 space-y-3">
          <SectionHeader title="Tipografia" icon={<Type className="w-3 h-3" />} />
          <LabeledField label="Fonte">
            <FontSelect value={p.fontFamily || 'inherit'} onChange={v => up('fontFamily', v)} />
          </LabeledField>
          <div className="grid grid-cols-2 gap-2">
            <LabeledField label="Tamanho">
              <UnitInput value={p.fontSize || 14} onChange={v => up('fontSize', v)} min={10} max={32} />
            </LabeledField>
            <LabeledField label="Peso">
              <select className={sel} value={String(p.inputFontWeight || '400')} onChange={e => up('inputFontWeight', e.target.value)}>
                <option value="400">400 (regular)</option>
                <option value="500">500 (médio)</option>
                <option value="600">600 (semi)</option>
                <option value="700">700 (negrito)</option>
              </select>
            </LabeledField>
          </div>
          <div className="flex items-center gap-3">
            <LabeledField label="Formatação">
              <div className="inline-flex items-center gap-0.5 border border-gray-200 rounded-lg p-0.5 bg-white">
                <button onClick={() => up('bold', !p.bold)} className={`w-9 h-8 flex items-center justify-center rounded transition-colors ${p.bold ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`} title="Negrito">
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => up('italic', !p.italic)} className={`w-9 h-8 flex items-center justify-center rounded transition-colors ${p.italic ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`} title="Itálico">
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => up('underline', !p.underline)} className={`w-9 h-8 flex items-center justify-center rounded transition-colors ${p.underline ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`} title="Sublinhado">
                  <Underline className="w-3.5 h-3.5" />
                </button>
              </div>
            </LabeledField>
            <div className="flex-1">
              <LabeledField label="Alinhamento">
                <AlignButtons value={p.textAlign || 'left'} onChange={v => up('textAlign', v)} showFull={false} />
              </LabeledField>
            </div>
          </div>
        </div>

        {/* Inner padding */}
        <div className="pt-4 border-t border-gray-100 space-y-3">
          <SectionHeader title="Espaçamento interno" icon={<MoveHorizontal className="w-3 h-3" />} />
          <PaddingControl p={p} up={up} prefix="inputPad" defaults={{ t: 12, r: 16, b: 12, l: 16 }} />
        </div>
      </div>
    )
  }

  const renderProps = () => {
    // Unified editor for all input types (email, phone, name-input, text-input, date-input)
    if (isInputBlock) {
      return renderInputConfig()
    }
    switch (block.type) {

      case 'text':
        return <div className="space-y-5">
          {/* Content section */}
          <div className="space-y-3">
            <SectionHeader title="Conteúdo" icon={<Type className="w-3 h-3" />} />
            <LabeledField label="Estilo do texto">
              <Segmented value={p.tag || 'p'} onChange={v => up('tag', v)} options={[
                { value: 'h1', label: 'H1', title: 'Título grande' },
                { value: 'h2', label: 'H2', title: 'Título médio' },
                { value: 'h3', label: 'H3', title: 'Título pequeno' },
                { value: 'p', label: 'P', title: 'Parágrafo' },
              ]} />
            </LabeledField>
            <LabeledField label="Texto" hint="Também editável clicando diretamente no texto no canvas.">
              <textarea className={inp} rows={3} value={p.content || ''} onChange={e => up('content', e.target.value)} />
            </LabeledField>
          </div>

          {/* Typography section */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Tipografia" icon={<Type className="w-3 h-3" />} />
            <LabeledField label="Fonte">
              <FontSelect value={p.fontFamily || 'inherit'} onChange={v => up('fontFamily', v)} />
            </LabeledField>
            <div className="grid grid-cols-2 gap-2">
              <LabeledField label="Tamanho">
                <UnitInput value={p.fontSize || 16} onChange={v => up('fontSize', v)} min={8} max={120} />
              </LabeledField>
              <LabeledField label="Altura da linha">
                <UnitInput value={Number(p.lineHeight || 1.4)} onChange={v => up('lineHeight', v)} min={0.8} max={3} step={0.1} unit="×" />
              </LabeledField>
            </div>
            <LabeledField label="Peso">
              <Segmented value={String(p.fontWeight || 'normal')} onChange={v => up('fontWeight', v)} options={[
                { value: 'normal', label: '400' },
                { value: '500', label: '500' },
                { value: '600', label: '600' },
                { value: 'bold', label: '700' },
                { value: '800', label: '800' },
              ]} />
            </LabeledField>
            <div className="flex items-center gap-3">
              <LabeledField label="Formatação"><TextFormat p={p} up={up} /></LabeledField>
              <div className="flex-1">
                <LabeledField label="Alinhamento">
                  <AlignButtons value={p.align || 'left'} onChange={v => up('align', v)} showFull={false} />
                </LabeledField>
              </div>
            </div>
            <LabeledField label="Espaçamento entre letras">
              <UnitInput value={p.letterSpacing ?? 0} onChange={v => up('letterSpacing', v)} min={-2} max={20} step={0.5} />
            </LabeledField>
          </div>

          {/* Colors */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Cores" />
            <ColorRow label="Cor do texto" value={p.color || '#111827'} onChange={v => up('color', v)} />
            <ColorRow label="Cor dos links" value={p.linkColor || '#F97316'} onChange={v => up('linkColor', v)} />
            <ColorRow label="Cor de fundo do bloco" hint="Aplicado a todo o bloco de texto." value={p.blockBg || ''} onChange={v => up('blockBg', v)} />
          </div>

          {/* Spacing */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Espaçamento" />
            <LabeledField label="Margem externa" hint="Espaço acima e abaixo do bloco de texto.">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-gray-400 block mb-1">Topo</span>
                  <UnitInput value={p.marginTop ?? 0} onChange={v => up('marginTop', v)} min={0} max={200} />
                </div>
                <div>
                  <span className="text-[10px] text-gray-400 block mb-1">Base</span>
                  <UnitInput value={p.marginBottom ?? 8} onChange={v => up('marginBottom', v)} min={0} max={200} />
                </div>
              </div>
            </LabeledField>
            <LabeledField label="Preenchimento interno" hint="Espaço entre a borda e o texto (padding).">
              <PaddingControl p={p} up={up} prefix="blockPad" defaults={{ t: 0, r: 0, b: 0, l: 0 }} />
            </LabeledField>
          </div>
        </div>

      case 'button':
        return <div className="space-y-5">
          {/* Content & action */}
          <div className="space-y-3">
            <SectionHeader title="Conteúdo" icon={<MousePointerClick className="w-3 h-3" />} />
            <LabeledField label="Texto" hint="Também editável diretamente no botão no canvas.">
              <input className={inp} value={p.text || ''} onChange={e => up('text', e.target.value)} />
            </LabeledField>
            <LabeledField label="Ação ao clicar">
              <Segmented value={p.action || 'submit'} onChange={v => up('action', v)} options={[
                { value: 'submit', label: 'Enviar', title: 'Submeter formulário' },
                { value: 'next-step', label: 'Próxima', title: 'Ir para a próxima etapa' },
                { value: 'url', label: 'URL', title: 'Abrir link' },
                { value: 'close', label: 'Fechar', title: 'Fechar popup' },
              ]} />
            </LabeledField>
            {p.action === 'url' && (
              <LabeledField label="URL de destino" hint="Abre em nova aba quando clicado.">
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center border border-gray-200 rounded-lg focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500/20">
                    <Link2 className="w-3.5 h-3.5 text-gray-400 ml-3" />
                    <input className="flex-1 px-2 py-2 text-[13px] text-gray-800 outline-none bg-transparent" value={p.url || ''} onChange={e => up('url', e.target.value)} placeholder="https://..." />
                  </div>
                </div>
              </LabeledField>
            )}
          </div>

          {/* Colors */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Cores" icon={<Palette className="w-3 h-3" />} />
            <ColorRow label="Fundo" value={p.bgColor || '#F97316'} onChange={v => up('bgColor', v)} />
            <ColorRow label="Texto" value={p.textColor || '#FFFFFF'} onChange={v => up('textColor', v)} />
            <ColorRow label="Hover (opcional)" hint="Cor de fundo ao passar o mouse." value={p.hoverColor || ''} onChange={v => up('hoverColor', v)} />
          </div>

          {/* Typography */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Tipografia" icon={<Type className="w-3 h-3" />} />
            <LabeledField label="Fonte">
              <FontSelect value={p.fontFamily || 'inherit'} onChange={v => up('fontFamily', v)} />
            </LabeledField>
            <div className="grid grid-cols-2 gap-2">
              <LabeledField label="Tamanho">
                <UnitInput value={p.fontSize || 15} onChange={v => up('fontSize', v)} min={10} max={48} />
              </LabeledField>
              <LabeledField label="Peso">
                <select className={sel} value={String(p.btnFontWeight || '700')} onChange={e => up('btnFontWeight', e.target.value)}>
                  <option value="400">400 (regular)</option>
                  <option value="500">500 (médio)</option>
                  <option value="600">600 (semi)</option>
                  <option value="700">700 (negrito)</option>
                  <option value="800">800 (extra)</option>
                </select>
              </LabeledField>
            </div>
            <LabeledField label="Espaçamento entre letras">
              <Slider value={p.btnLetterSpacing ?? 0} onChange={v => up('btnLetterSpacing', v)} min={-1} max={8} step={0.5} unit="px" />
            </LabeledField>
          </div>

          {/* Shape & border */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Forma & borda" icon={<Square className="w-3 h-3" />} />
            <LabeledField label="Raio da borda">
              <Slider value={p.borderRadius ?? 8} onChange={v => up('borderRadius', v)} min={0} max={50} unit="px" />
            </LabeledField>
            <div className="grid grid-cols-2 gap-2">
              <LabeledField label="Largura da borda">
                <UnitInput value={p.btnBorderWidth ?? 0} onChange={v => up('btnBorderWidth', v)} min={0} max={8} />
              </LabeledField>
              <LabeledField label="Estilo">
                <BorderStyleControl p={p} up={up} />
              </LabeledField>
            </div>
            {(p.btnBorderWidth || 0) > 0 && (
              <ColorRow label="Cor da borda" value={p.btnBorderColor || '#E5E7EB'} onChange={v => up('btnBorderColor', v)} />
            )}
          </div>

          {/* Size & spacing */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Tamanho & espaçamento" icon={<MoveHorizontal className="w-3 h-3" />} />
            <LabeledField label="Largura">
              <Segmented value={p.fullWidth ? 'full' : 'auto'} onChange={v => up('fullWidth', v === 'full')} options={[
                { value: 'auto', label: 'Auto', title: 'Largura automática' },
                { value: 'full', label: 'Preencher', title: 'Preencher container' },
              ]} />
            </LabeledField>
            {!p.fullWidth && (
              <LabeledField label="Alinhamento">
                <AlignButtons value={p.align || 'center'} onChange={v => up('align', v)} showFull={false} />
              </LabeledField>
            )}
            <div className="grid grid-cols-2 gap-2">
              <LabeledField label="Padding vertical">
                <UnitInput value={p.paddingV ?? 14} onChange={v => up('paddingV', v)} min={4} max={40} />
              </LabeledField>
              <LabeledField label="Padding horizontal">
                <UnitInput value={p.paddingH ?? 28} onChange={v => up('paddingH', v)} min={4} max={80} />
              </LabeledField>
            </div>
          </div>
        </div>

      case 'image':
        return <div className="space-y-5">
          {/* Source */}
          <div className="space-y-3">
            <SectionHeader title="Imagem" icon={<ImageIcon className="w-3 h-3" />} />
            <LabeledField label="Arquivo" hint="JPG, PNG, GIF ou WebP. Máx 2000px.">
              {p.src ? (
                <div className="space-y-2">
                  <div className="relative rounded-xl overflow-hidden border border-gray-200 bg-[linear-gradient(45deg,#f3f4f6_25%,transparent_25%,transparent_75%,#f3f4f6_75%),linear-gradient(45deg,#f3f4f6_25%,transparent_25%,transparent_75%,#f3f4f6_75%)] bg-[length:16px_16px] bg-[0_0,8px_8px]">
                    <img src={p.src} alt="" className="w-full h-36 object-contain" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => onOpenMedia?.(url => up('src', url))}
                      className="flex-1 py-2 text-[12px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors">
                      Substituir
                    </button>
                    <button onClick={() => up('src', '')} className="flex-1 py-2 text-[12px] font-semibold text-red-600 bg-white border border-gray-200 rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors">
                      Remover
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => onOpenMedia?.(url => up('src', url))}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors group">
                  <div className="w-12 h-12 rounded-xl bg-gray-50 group-hover:bg-brand-100 flex items-center justify-center mx-auto mb-3 transition-colors">
                    <Upload className="w-5 h-5 text-gray-400 group-hover:text-brand-500" />
                  </div>
                  <span className="text-[13px] font-semibold text-gray-700 block">Escolher imagem</span>
                  <span className="text-[11px] text-gray-400">da biblioteca ou enviar nova</span>
                </button>
              )}
            </LabeledField>
            <LabeledField label="Texto alternativo" hint="Descreva a imagem para acessibilidade e SEO.">
              <input className={inp} value={p.alt || ''} onChange={e => up('alt', e.target.value)} placeholder="Ex: Desconto de 10% em primeiros pedidos" />
            </LabeledField>
            <LabeledField label="Link ao clicar (opcional)">
              <div className="flex items-center border border-gray-200 rounded-lg focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500/20">
                <Link2 className="w-3.5 h-3.5 text-gray-400 ml-3" />
                <input className="flex-1 px-2 py-2 text-[13px] text-gray-800 outline-none bg-transparent" value={p.href || ''} onChange={e => up('href', e.target.value)} placeholder="https://..." />
              </div>
            </LabeledField>
          </div>

          {/* Layout */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Layout" icon={<LayoutGrid className="w-3 h-3" />} />
            <LabeledField label="Alinhamento">
              <AlignButtons value={p.align || 'center'} onChange={v => up('align', v)} showFull={false} />
            </LabeledField>
            <div className="grid grid-cols-2 gap-2">
              <LabeledField label="Largura">
                <UnitInput value={p.imgWidth ?? 100} onChange={v => up('imgWidth', v)} min={10} max={100} unit="%" />
              </LabeledField>
              <LabeledField label="Altura máxima">
                <UnitInput value={p.maxHeight ?? 300} onChange={v => up('maxHeight', v)} min={50} max={800} />
              </LabeledField>
            </div>
            <LabeledField label="Ajuste da imagem" hint="Como a imagem se acomoda dentro do espaço.">
              <Segmented value={p.objectFit || 'contain'} onChange={v => up('objectFit', v)} options={[
                { value: 'contain', label: 'Conter', title: 'Preserva proporção dentro da caixa' },
                { value: 'cover', label: 'Cobrir', title: 'Preenche a caixa, pode cortar' },
                { value: 'fill', label: 'Preencher', title: 'Estica para preencher' },
              ]} />
            </LabeledField>
          </div>

          {/* Style */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Estilo" icon={<Sparkles className="w-3 h-3" />} />
            <LabeledField label="Raio da borda">
              <UnitInput value={p.borderRadius ?? 0} onChange={v => up('borderRadius', v)} min={0} max={100} />
            </LabeledField>
            <LabeledField label="Sombra">
              <Segmented value={p.shadow || ''} onChange={v => up('shadow', v)} options={[
                { value: '', label: 'Nenhuma' },
                { value: '0 1px 3px rgba(0,0,0,0.08)', label: 'Leve' },
                { value: '0 4px 12px rgba(0,0,0,0.12)', label: 'Média' },
                { value: '0 12px 32px rgba(0,0,0,0.18)', label: 'Forte' },
              ]} />
            </LabeledField>
          </div>
        </div>

      case '__unused__':
        return <>
          {/* Input blocks handled above via renderInputConfig */}
        </>

      case 'dropdown': case 'radio': case 'checkbox':
        return <div className="space-y-5">
          {/* Content */}
          <div className="space-y-3">
            <SectionHeader title="Conteúdo" icon={<CheckSquare className="w-3 h-3" />} />
            <LabeledField label="Label">
              <input className={inp} value={p.label || ''} onChange={e => up('label', e.target.value)} placeholder="Ex: Qual sua preferência?" />
            </LabeledField>
            <Toggle label="Mostrar label" checked={p.showLabel !== false} onChange={v => up('showLabel', v)} />
            {block.type === 'dropdown' && (
              <LabeledField label="Placeholder">
                <input className={inp} value={p.placeholder || ''} onChange={e => up('placeholder', e.target.value)} placeholder="Escolha uma opção..." />
              </LabeledField>
            )}
          </div>

          {/* Options */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Opções" icon={<LayoutGrid className="w-3 h-3" />} />
            <div className="space-y-1.5">
              {(p.options || []).map((opt: string, i: number) => (
                <div key={i} className="flex items-center gap-1.5 group">
                  <div className="w-6 h-6 flex items-center justify-center rounded bg-gray-50 border border-gray-200 text-[10px] font-semibold text-gray-400 flex-shrink-0">{i + 1}</div>
                  <input className={inp + ' flex-1'} value={opt} onChange={e => {
                    const next = [...(p.options || [])]; next[i] = e.target.value; up('options', next)
                  }} placeholder={`Opção ${i + 1}`} />
                  <button onClick={() => { const next = [...(p.options || [])]; if (i > 0) { [next[i-1], next[i]] = [next[i], next[i-1]]; up('options', next) } }}
                    className="p-1.5 text-gray-300 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors" title="Mover para cima" disabled={i === 0}>
                    <ChevronDown className="w-3 h-3 rotate-180" />
                  </button>
                  <button onClick={() => { const next = [...(p.options || [])]; if (i < next.length - 1) { [next[i+1], next[i]] = [next[i], next[i+1]]; up('options', next) } }}
                    className="p-1.5 text-gray-300 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors" title="Mover para baixo" disabled={i === (p.options || []).length - 1}>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <button onClick={() => up('options', (p.options || []).filter((_: any, j: number) => j !== i))}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Remover">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button onClick={() => up('options', [...(p.options || []), `Opção ${(p.options || []).length + 1}`])}
                className="w-full py-2 text-[12px] font-semibold text-brand-600 border-2 border-dashed border-brand-200 rounded-lg hover:bg-brand-50 hover:border-brand-400 transition-colors flex items-center justify-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Adicionar opção
              </button>
            </div>
            {block.type === 'radio' && (
              <LabeledField label="Direção">
                <Segmented value={p.layout || 'vertical'} onChange={v => up('layout', v)} options={[
                  { value: 'vertical', label: 'Vertical' },
                  { value: 'horizontal', label: 'Horizontal' },
                ]} />
              </LabeledField>
            )}
          </div>

          {/* Mapping */}
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Mapeamento de perfil" icon={<User className="w-3 h-3" />} />
            <LabeledField label="Campo do perfil" hint="Onde salvar a resposta no contato.">
              <select className={sel} value={p.mapTo || 'custom'} onChange={e => up('mapTo', e.target.value)}>
                <option value="custom">Campo personalizado</option>
                {PROFILE_FIELDS.filter(f => f.value !== 'custom').map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </LabeledField>
            {p.mapTo === 'custom' && (
              <LabeledField label="Nome do campo personalizado">
                <input className={inp} value={p.mapToCustom || p.label || ''} onChange={e => up('mapToCustom', e.target.value)} placeholder="ex: preferencia" />
              </LabeledField>
            )}
            <Toggle label="Campo obrigatório" checked={!!p.required} onChange={v => up('required', v)} />
          </div>
        </div>

      case 'legal-consent':
        return <div className="space-y-5">
          <div className="space-y-3">
            <SectionHeader title="Conteúdo" icon={<ShieldCheck className="w-3 h-3" />} />
            <LabeledField label="Texto de consentimento" hint='Suporta HTML. Use <a href="url">link</a> para links.'>
              <textarea className={inp} rows={4} value={p.text || ''} onChange={e => up('text', e.target.value)}
                placeholder='Aceito receber comunicações e concordo com a <a href="/politica">política de privacidade</a>.' />
            </LabeledField>
            <Toggle label="Obrigatório" checked={p.required !== false} onChange={v => up('required', v)} hint="Usuário precisa marcar para enviar." />
          </div>
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Estilo" icon={<Type className="w-3 h-3" />} />
            <div className="grid grid-cols-2 gap-2">
              <LabeledField label="Tamanho">
                <UnitInput value={p.fontSize || 12} onChange={v => up('fontSize', v)} min={10} max={18} />
              </LabeledField>
              <LabeledField label="Altura linha">
                <UnitInput value={Number(p.lineHeight || 1.4)} onChange={v => up('lineHeight', v)} min={1} max={2.4} step={0.1} unit="×" />
              </LabeledField>
            </div>
            <ColorRow label="Cor do texto" value={p.color || '#6B7280'} onChange={v => up('color', v)} />
            <ColorRow label="Cor dos links" value={p.linkColor || '#F97316'} onChange={v => up('linkColor', v)} />
          </div>
        </div>

      case 'coupon':
        return <div className="space-y-5">
          <div className="space-y-3">
            <SectionHeader title="Conteúdo" icon={<Tag className="w-3 h-3" />} />
            <LabeledField label="Código do cupom" hint="Exibido em destaque para ser copiado.">
              <input className={inp + ' font-mono tracking-wider uppercase'} value={p.code || ''} onChange={e => up('code', e.target.value.toUpperCase())} placeholder="DESCONTO10" />
            </LabeledField>
            <LabeledField label="Descrição">
              <input className={inp} value={p.description || ''} onChange={e => up('description', e.target.value)} placeholder="Seu cupom de desconto:" />
            </LabeledField>
          </div>
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Cores" icon={<Palette className="w-3 h-3" />} />
            <ColorRow label="Fundo" value={p.bgColor || '#FFF7ED'} onChange={v => up('bgColor', v)} />
            <ColorRow label="Borda" value={p.borderColor || '#F97316'} onChange={v => up('borderColor', v)} />
            <ColorRow label="Código" value={p.codeColor || '#F97316'} onChange={v => up('codeColor', v)} />
          </div>
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Estilo" icon={<Sparkles className="w-3 h-3" />} />
            <LabeledField label="Tamanho do código">
              <Slider value={p.fontSize || 20} onChange={v => up('fontSize', v)} min={14} max={48} unit="px" />
            </LabeledField>
            <LabeledField label="Raio da borda">
              <Slider value={p.borderRadius ?? 8} onChange={v => up('borderRadius', v)} min={0} max={30} unit="px" />
            </LabeledField>
            <LabeledField label="Estilo da borda">
              <BorderStyleControl p={p} up={up} />
            </LabeledField>
          </div>
        </div>

      case 'spacer':
        return <div className="space-y-5">
          <div className="space-y-3">
            <SectionHeader title="Espaçador" icon={<MoveVertical className="w-3 h-3" />} />
            <LabeledField label="Altura" hint="Espaço em branco entre blocos.">
              <Slider value={p.height || 24} onChange={v => up('height', v)} min={4} max={200} unit="px" />
            </LabeledField>
            <div className="grid grid-cols-4 gap-2">
              {[8, 16, 24, 48].map(h => (
                <button key={h} onClick={() => up('height', h)}
                  className={`py-2.5 rounded-lg border text-[12px] font-medium transition-colors ${p.height === h ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {h}px
                </button>
              ))}
            </div>
          </div>
        </div>

      case 'line':
        return <div className="space-y-5">
          <div className="space-y-3">
            <SectionHeader title="Linha divisória" icon={<GripHorizontal className="w-3 h-3" />} />
            <ColorRow label="Cor" value={p.color || '#E5E7EB'} onChange={v => up('color', v)} />
            <LabeledField label="Espessura">
              <Slider value={p.thickness || 1} onChange={v => up('thickness', v)} min={1} max={12} unit="px" />
            </LabeledField>
            <LabeledField label="Estilo">
              <Segmented value={p.style || 'solid'} onChange={v => up('style', v)} options={[
                { value: 'solid', label: 'Sólida' },
                { value: 'dashed', label: 'Tracejada' },
                { value: 'dotted', label: 'Pontilhada' },
                { value: 'double', label: 'Dupla' },
              ]} />
            </LabeledField>
            <LabeledField label="Largura">
              <Slider value={p.width ?? 100} onChange={v => up('width', v)} min={20} max={100} unit="%" />
            </LabeledField>
          </div>
        </div>

      case 'countdown':
        return <div className="space-y-5">
          <div className="space-y-3">
            <SectionHeader title="Contagem regressiva" icon={<Clock className="w-3 h-3" />} />
            <LabeledField label="Data de término" hint="Popup exibe tempo restante até esta data.">
              <input type="datetime-local" className={inp} value={p.endDate || ''} onChange={e => up('endDate', e.target.value)} />
            </LabeledField>
            <LabeledField label="Tamanho dos números">
              <Slider value={p.fontSize || 28} onChange={v => up('fontSize', v)} min={16} max={72} unit="px" />
            </LabeledField>
          </div>
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Cores" icon={<Palette className="w-3 h-3" />} />
            <ColorRow label="Fundo" value={p.boxColor || '#1F2937'} onChange={v => up('boxColor', v)} />
            <ColorRow label="Números" value={p.numberColor || '#FFFFFF'} onChange={v => up('numberColor', v)} />
            <ColorRow label="Rótulos" value={p.labelColor || '#9CA3AF'} onChange={v => up('labelColor', v)} />
          </div>
          <div className="pt-4 border-t border-gray-100 space-y-3">
            <SectionHeader title="Rótulos" icon={<Type className="w-3 h-3" />} />
            <div className="grid grid-cols-4 gap-2">
              {['days', 'hours', 'minutes', 'seconds'].map(k => (
                <LabeledField key={k} label={k === 'days' ? 'Dias' : k === 'hours' ? 'Horas' : k === 'minutes' ? 'Min' : 'Seg'}>
                  <input className={inp + ' text-center uppercase text-[11px]'} value={(p.labels || {})[k] || ''} onChange={e => up('labels', { ...(p.labels || {}), [k]: e.target.value })} />
                </LabeledField>
              ))}
            </div>
          </div>
        </div>

      default:
        return <p className="text-sm text-gray-400">Selecione um bloco</p>
    }
  }

  return (
    <div className="px-4 pt-3 pb-6">
      {/* Tab switcher (Input | Fields | Layout for inputs, Props | Layout for others) */}
      <div className="flex border-b border-gray-200 mb-4 -mx-4 px-4">
        <button onClick={() => setTab('props')} className={`px-4 py-2 text-[12px] font-semibold transition-colors ${tab === 'props' ? 'text-gray-900 border-b-2 border-gray-900 -mb-px' : 'text-gray-400 hover:text-gray-600'}`}>
          {isInputBlock ? 'Input' : (blockLabel[block.type] || block.type)}
        </button>
        {isInputBlock && (
          <button onClick={() => setTab('fields')} className={`px-4 py-2 text-[12px] font-semibold transition-colors ${tab === 'fields' ? 'text-gray-900 border-b-2 border-gray-900 -mb-px' : 'text-gray-400 hover:text-gray-600'}`}>
            Fields
          </button>
        )}
        <button onClick={() => setTab('layout')} className={`px-4 py-2 text-[12px] font-semibold transition-colors ${tab === 'layout' ? 'text-gray-900 border-b-2 border-gray-900 -mb-px' : 'text-gray-400 hover:text-gray-600'}`}>
          Layout
        </button>
      </div>

      {tab === 'props' ? (
        <div>{renderProps()}</div>
      ) : tab === 'fields' && isInputBlock ? (
        <div>{renderInputFields()}</div>
      ) : (
        <div className="space-y-1">
          {/* Fill */}
          <div className="border border-gray-100 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Fill</span>
              <div className="flex items-center gap-1">
                <button onClick={() => up('blockBg', p.blockBg ? '' : '#F3F4F6')} className="text-gray-400 hover:text-gray-600"><Plus className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            {p.blockBg ? (
              <div className="flex items-center gap-2">
                <input type="color" value={p.blockBg} onChange={e => up('blockBg', e.target.value)} className="w-7 h-7 rounded border border-gray-200 p-0.5 cursor-pointer flex-shrink-0" />
                <input className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs font-mono" value={p.blockBg} onChange={e => up('blockBg', e.target.value)} />
                <span className="text-xs text-gray-400 w-8">100%</span>
                <button onClick={() => up('blockBg', '')} className="text-gray-400 hover:text-red-500"><Minus className="w-3.5 h-3.5" /></button>
              </div>
            ) : <p className="text-xs text-gray-400">Sem preenchimento</p>}
          </div>

          {/* Stroke */}
          <div className="border border-gray-100 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Stroke</span>
              <button onClick={() => up('borderWidth', p.borderWidth ? 0 : 1)} className="text-gray-400 hover:text-gray-600"><Plus className="w-3.5 h-3.5" /></button>
            </div>
            {(p.borderWidth || 0) > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input type="color" value={p.borderColor || '#E5E7EB'} onChange={e => up('borderColor', e.target.value)} className="w-7 h-7 rounded border border-gray-200 p-0.5 cursor-pointer flex-shrink-0" />
                  <input className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs font-mono" value={p.borderColor || '#E5E7EB'} onChange={e => up('borderColor', e.target.value)} />
                  <button onClick={() => up('borderWidth', 0)} className="text-gray-400 hover:text-red-500"><Minus className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex items-center gap-2">
                  <select className="px-2 py-1 border border-gray-200 rounded text-xs bg-white" value={p.borderStyle || 'solid'} onChange={e => up('borderStyle', e.target.value)}>
                    <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
                  </select>
                  <input type="number" className="w-14 px-2 py-1 border border-gray-200 rounded text-xs" value={p.borderWidth || 1} onChange={e => up('borderWidth', +e.target.value)} min={0} max={10} />
                </div>
              </div>
            ) : <p className="text-xs text-gray-400">Sem borda</p>}
          </div>

          {/* Effects */}
          <div className="border border-gray-100 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Effects</span>
              <button onClick={() => up('shadow', p.shadow ? '' : '0 2px 8px rgba(0,0,0,0.1)')} className="text-gray-400 hover:text-gray-600"><Plus className="w-3.5 h-3.5" /></button>
            </div>
            {p.shadow ? (
              <div className="flex items-center gap-2">
                <select className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs bg-white" value={p.shadow} onChange={e => up('shadow', e.target.value)}>
                  <option value="0 1px 3px rgba(0,0,0,0.08)">Sutil</option>
                  <option value="0 2px 8px rgba(0,0,0,0.1)">Média</option>
                  <option value="0 4px 16px rgba(0,0,0,0.15)">Grande</option>
                  <option value="0 8px 32px rgba(0,0,0,0.2)">Extra</option>
                  <option value="inset 0 2px 4px rgba(0,0,0,0.06)">Inner</option>
                </select>
                <button onClick={() => up('shadow', '')} className="text-gray-400 hover:text-red-500"><Minus className="w-3.5 h-3.5" /></button>
              </div>
            ) : <p className="text-xs text-gray-400">Sem efeito</p>}
          </div>

          {/* Layout */}
          <div className="border border-gray-100 rounded-lg p-3">
            <span className="text-xs font-semibold text-gray-700 block mb-2">Layout</span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-gray-400">Margem T</span>
                <input type="number" className="w-full px-2 py-1 border border-gray-200 rounded text-xs" value={p.marginTop ?? 0} onChange={e => up('marginTop', +e.target.value)} />
              </div>
              <div>
                <span className="text-[10px] text-gray-400">Margem B</span>
                <input type="number" className="w-full px-2 py-1 border border-gray-200 rounded text-xs" value={p.marginBottom ?? 8} onChange={e => up('marginBottom', +e.target.value)} />
              </div>
              <div>
                <span className="text-[10px] text-gray-400">Padding</span>
                <input type="number" className="w-full px-2 py-1 border border-gray-200 rounded text-xs" value={p.blockPadding ?? 0} onChange={e => up('blockPadding', +e.target.value)} />
              </div>
              <div>
                <span className="text-[10px] text-gray-400">Raio</span>
                <input type="number" className="w-full px-2 py-1 border border-gray-200 rounded text-xs" value={p.blockRadius ?? 0} onChange={e => up('blockRadius', +e.target.value)} />
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div className="border border-gray-100 rounded-lg p-3">
            <span className="text-xs font-semibold text-gray-700 block mb-2">Appearance</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-gray-400" />
                <input type="number" className="w-14 px-2 py-1 border border-gray-200 rounded text-xs" value={p.opacity ?? 100} onChange={e => up('opacity', +e.target.value)} min={0} max={100} />
                <span className="text-xs text-gray-400">%</span>
              </div>
            </div>
          </div>

          {/* Device visibility */}
          <div className="border border-gray-100 rounded-lg p-3">
            <span className="text-xs font-semibold text-gray-700 block mb-2">Visibilidade por dispositivo</span>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!p.hideOnDesktop} onChange={e => up('hideOnDesktop', !e.target.checked)} className="accent-brand-500" />
                <Monitor className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-700">Exibir no desktop</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!p.hideOnMobile} onChange={e => up('hideOnMobile', !e.target.checked)} className="accent-brand-500" />
                <Smartphone className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-700">Exibir no mobile</span>
              </label>
            </div>
          </div>

          <button onClick={onDelete} className="w-full py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 mt-2 flex items-center justify-center gap-2">
            <Trash2 className="w-4 h-4" /> Remover bloco
          </button>
        </div>
      )}
    </div>
  )
}

// ── Behavior Panel ─────────────────────────────────────────────────────────────
function BehaviorPanel({ beh, onChange, formId, postSubmit, onPostSubmitChange, successMessage, onSuccessMessageChange }: {
  beh: PopupDesign['behavior']
  onChange: (b: PopupDesign['behavior']) => void
  formId: string
  postSubmit: NonNullable<PopupDesign['postSubmit']>
  onPostSubmitChange: (ps: NonNullable<PopupDesign['postSubmit']>) => void
  successMessage: string
  onSuccessMessageChange: (v: string) => void
}) {
  const [tab, setTab] = useState<'display' | 'targeting' | 'postsubmit'>('display')
  const setG = (key: keyof PopupDesign['behavior'], val: any) =>
    onChange({ ...beh, [key]: { ...((beh as any)[key] || {}), ...val } })

  const d: any = beh.display || {}
  const freq = beh.frequency
  const vis = beh.visibility
  const urls = beh.urls || { includeEnabled: false, includeUrls: [], excludeEnabled: false, excludeUrls: [] }
  const loc = beh.location || { includeEnabled: false, includeCountries: [], excludeEnabled: false, excludeCountries: [] }
  const utm = beh.utm || { storeOnConsent: false, filterEnabled: false, filters: [] }
  const cox = beh.clickOutsideClose || { desktop: true, mobile: true }
  const sched = beh.scheduling

  const timeOn = d.timeEnabled ?? (d.trigger === 'time_delay')
  const scrollOn = d.scrollEnabled ?? (d.trigger === 'scroll')
  const exitOn = d.exitEnabled ?? (d.trigger === 'exit_intent')
  const pvOn = d.pageViewEnabled || false

  const [copiedSnippet, setCopiedSnippet] = useState(false)
  const snippet = `window._worderOnsite = window._worderOnsite || [];\nwindow._worderOnsite.push(['openForm', '${formId}']);`

  return (
    <div>
      {/* Sub-tabs: Display | Targeting | Post-submit */}
      <div className="flex border-b border-gray-200">
        <button onClick={() => setTab('display')} className={`flex-1 py-3 text-[12px] font-semibold transition-colors ${tab === 'display' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
          Exibicao
        </button>
        <button onClick={() => setTab('targeting')} className={`flex-1 py-3 text-[12px] font-semibold transition-colors ${tab === 'targeting' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
          Segmentacao
        </button>
        <button onClick={() => setTab('postsubmit')} className={`flex-1 py-3 text-[12px] font-semibold transition-colors ${tab === 'postsubmit' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
          Apos envio
        </button>
      </div>

      {tab === 'postsubmit' ? (
        <div>
          <Section title="Acao apos envio" defaultOpen>
            <div className="space-y-2">
              {[
                { value: 'show-success', label: 'Mostrar mensagem de sucesso', hint: 'Exibe a etapa de sucesso configurada dentro do popup.' },
                { value: 'close', label: 'Fechar formulario', hint: 'Fecha o popup imediatamente apos o envio.' },
                { value: 'redirect', label: 'Redirecionar para URL', hint: 'Envia o visitante para uma pagina especifica.' },
              ].map(opt => (
                <label key={opt.value} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${postSubmit.action === opt.value ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="postAction" value={opt.value} checked={postSubmit.action === opt.value}
                    onChange={() => onPostSubmitChange({ ...postSubmit, action: opt.value as any })}
                    className="accent-brand-500 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[13px] font-medium text-gray-900">{opt.label}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{opt.hint}</p>
                  </div>
                </label>
              ))}
            </div>

            {postSubmit.action === 'redirect' && (
              <div className="pt-3 border-t border-gray-100 mt-3">
                <Field label="URL de destino" hint="Inicie com https:// para URLs externas ou /rota para URLs internas.">
                  <input type="url" className={inp} placeholder="https://..."
                    value={postSubmit.redirectUrl || ''}
                    onChange={e => onPostSubmitChange({ ...postSubmit, redirectUrl: e.target.value })} />
                </Field>
              </div>
            )}

            {postSubmit.action === 'show-success' && (
              <div className="pt-3 border-t border-gray-100 mt-3 space-y-3">
                <Field label="Fechar automaticamente apos" hint="Segundos ate fechar o popup. Zero mantem aberto ate o visitante fechar.">
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={60} className={inp + ' w-24'}
                      value={postSubmit.closeDelay ?? 4}
                      onChange={e => onPostSubmitChange({ ...postSubmit, closeDelay: +e.target.value })} />
                    <span className="text-[12px] text-gray-500">segundos</span>
                  </div>
                </Field>
                <Field label="Mensagem curta (opcional)" hint="Salva em success_message. Editavel como bloco de texto na etapa de sucesso.">
                  <input className={inp} placeholder="Inscricao confirmada!"
                    value={successMessage} onChange={e => onSuccessMessageChange(e.target.value)} />
                </Field>
              </div>
            )}
          </Section>
        </div>
      ) : tab === 'display' ? (
        <div>
          <Section title="Quando exibir" defaultOpen>
            <ToggleRow label="Quando o visitante estiver saindo da pagina" hint="Detecta movimento do mouse em direcao a barra de enderecos."
              checked={exitOn} onChange={v => setG('display', { exitEnabled: v })} />

            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Apos tempo decorrido" hint="Tempo que o visitante precisa permanecer na pagina."
                checked={timeOn} onChange={v => setG('display', { timeEnabled: v })} />
              {timeOn && (
                <div className="flex items-center gap-2 mt-2 ml-0">
                  <input type="number" min={0} max={300} className="w-20 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    value={d.delay ?? 5} onChange={e => setG('display', { delay: +e.target.value })} />
                  <span className="text-[12px] text-gray-500">segundos</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Apos rolar uma certa quantidade" hint="Percentual de rolagem da pagina."
                checked={scrollOn} onChange={v => setG('display', { scrollEnabled: v })} />
              {scrollOn && (
                <div className="flex items-center gap-2 mt-2">
                  <input type="number" min={0} max={100} className="w-20 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    value={d.scrollPercent ?? 30} onChange={e => setG('display', { scrollPercent: +e.target.value })} />
                  <span className="text-[12px] text-gray-500">% da pagina</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Apos visitar X paginas" hint="Numero minimo de paginas visitadas antes de exibir."
                checked={pvOn} onChange={v => setG('display', { pageViewEnabled: v })} />
              {pvOn && (
                <div className="flex items-center gap-2 mt-2">
                  <input type="number" min={1} max={50} className="w-20 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    value={d.pageViewCount ?? 3} onChange={e => setG('display', { pageViewCount: +e.target.value })} />
                  <span className="text-[12px] text-gray-500">paginas</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Exibir somente se TODAS as condicoes forem atendidas"
                hint={d.matchAll ? 'Modo AND: todas as condicoes ativas precisam ser satisfeitas.' : 'Modo OR: qualquer condicao ativa dispara o popup.'}
                checked={!!d.matchAll} onChange={v => setG('display', { matchAll: v })} />
            </div>
          </Section>

          <Section title="Frequencia">
            <ToggleRow label="Nao mostrar novamente se o formulario foi enviado"
              checked={freq.stopAfterSubmission} onChange={v => setG('frequency', { stopAfterSubmission: v })} />
            <div className="pt-2">
              <Field label="Se o visitante fechar, mostrar novamente apos" hint="Numero de dias ate reaparecer.">
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={365} className={inp + ' w-24'}
                    value={freq.showAfterDays} onChange={e => setG('frequency', { showAfterDays: +e.target.value })} />
                  <span className="text-[12px] text-gray-500">dias</span>
                </div>
              </Field>
            </div>
          </Section>

          <Section title="Dispositivos">
            <div className="space-y-2">
              {[
                { value: 'all', label: 'Todos os dispositivos', icon: Monitor },
                { value: 'desktop', label: 'Somente desktop', icon: Monitor },
                { value: 'mobile', label: 'Somente mobile', icon: Smartphone },
              ].map(opt => (
                <label key={opt.value} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${vis.devices === opt.value ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="devices" value={opt.value} checked={vis.devices === opt.value}
                    onChange={() => setG('visibility', { devices: opt.value })}
                    className="accent-brand-500" />
                  <opt.icon className="w-4 h-4 text-gray-500" />
                  <span className="text-[13px] text-gray-800">{opt.label}</span>
                </label>
              ))}
            </div>
          </Section>

          <Section title="Fechar ao clicar fora">
            <ToggleRow label="No desktop" checked={cox.desktop} onChange={v => setG('clickOutsideClose', { desktop: v })} />
            <ToggleRow label="No mobile" checked={cox.mobile} onChange={v => setG('clickOutsideClose', { mobile: v })} />
          </Section>

          <Section title="Agendamento">
            <ToggleRow label="Agendar periodo de exibicao" checked={sched.enabled} onChange={v => setG('scheduling', { enabled: v })} />
            {sched.enabled && (
              <div className="space-y-3 mt-3">
                <Field label="Inicio">
                  <input type="datetime-local" className={inp} value={sched.startDate} onChange={e => setG('scheduling', { startDate: e.target.value })} />
                </Field>
                <Field label="Fim">
                  <input type="datetime-local" className={inp} value={sched.endDate} onChange={e => setG('scheduling', { endDate: e.target.value })} />
                </Field>
              </div>
            )}
          </Section>

          <Section title="Gatilho personalizado">
            <ToggleRow label="Permitir abrir via JavaScript" hint="Chame window._worderOnsite.push(['openForm', '...']) no seu site."
              checked={!!beh.customTrigger} onChange={v => onChange({ ...beh, customTrigger: v })} />
            {beh.customTrigger && (
              <div className="mt-3">
                <div className="relative">
                  <pre className="bg-gray-900 text-gray-100 text-[11px] font-mono p-3 rounded-lg overflow-x-auto leading-relaxed">{snippet}</pre>
                  <button onClick={() => { navigator.clipboard?.writeText(snippet).catch(() => {}); setCopiedSnippet(true); setTimeout(() => setCopiedSnippet(false), 2000) }}
                    className="absolute top-2 right-2 px-2 py-1 text-[10px] font-medium text-white bg-gray-700 hover:bg-gray-600 rounded">
                    {copiedSnippet ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}
          </Section>
        </div>
      ) : (
        <div>
          <Section title="Visitantes" defaultOpen>
            <Field label="Quem deve ver o formulario">
              <select className={sel} value={vis.visitorType} onChange={e => setG('visibility', { visitorType: e.target.value as any })}>
                <option value="all">Todos os visitantes</option>
                <option value="new">Somente visitantes novos</option>
                <option value="returning">Somente visitantes retornantes</option>
              </select>
            </Field>
            <ToggleRow label="Nao mostrar a inscritos existentes" hint="Oculta para visitantes ja cadastrados."
              checked={vis.hideFromSubscribers} onChange={v => setG('visibility', { hideFromSubscribers: v })} />
          </Section>

          <Section title="URLs">
            <p className="text-[11px] text-gray-400 leading-snug -mt-1">Use <code className="px-1 bg-gray-100 rounded text-[10px]">*</code> como coringa. Uma URL por linha.</p>

            <ToggleRow label="Exibir somente em certas URLs" checked={urls.includeEnabled} onChange={v => setG('urls', { includeEnabled: v })} />
            {urls.includeEnabled && (
              <textarea rows={3} className={inp + ' font-mono text-[11px] mt-2'}
                placeholder="/produtos/*&#10;/promocao"
                value={urls.includeUrls.join('\n')}
                onChange={e => setG('urls', { includeUrls: e.target.value.split('\n').map(u => u.trim()).filter(Boolean) })} />
            )}

            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Nao exibir em certas URLs" checked={urls.excludeEnabled} onChange={v => setG('urls', { excludeEnabled: v })} />
              {urls.excludeEnabled && (
                <textarea rows={3} className={inp + ' font-mono text-[11px] mt-2'}
                  placeholder="/checkout&#10;/admin/*"
                  value={urls.excludeUrls.join('\n')}
                  onChange={e => setG('urls', { excludeUrls: e.target.value.split('\n').map(u => u.trim()).filter(Boolean) })} />
              )}
            </div>
          </Section>

          <Section title="Localizacao">
            <p className="text-[11px] text-gray-400 leading-snug -mt-1">Codigo do pais ISO (BR, US, PT). Um por linha.</p>

            <ToggleRow label="Exibir em certos paises" checked={loc.includeEnabled} onChange={v => setG('location', { includeEnabled: v })} />
            {loc.includeEnabled && (
              <textarea rows={2} className={inp + ' font-mono text-[11px] mt-2 uppercase'}
                placeholder="BR&#10;PT"
                value={loc.includeCountries.join('\n')}
                onChange={e => setG('location', { includeCountries: e.target.value.split('\n').map(c => c.trim().toUpperCase()).filter(Boolean) })} />
            )}

            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Nao exibir em certos paises" checked={loc.excludeEnabled} onChange={v => setG('location', { excludeEnabled: v })} />
              {loc.excludeEnabled && (
                <textarea rows={2} className={inp + ' font-mono text-[11px] mt-2 uppercase'}
                  placeholder="US"
                  value={loc.excludeCountries.join('\n')}
                  onChange={e => setG('location', { excludeCountries: e.target.value.split('\n').map(c => c.trim().toUpperCase()).filter(Boolean) })} />
              )}
            </div>
          </Section>

          <Section title="Audiencia">
            <p className="text-[11px] text-gray-400 leading-snug -mt-1">Tags e listas aplicadas ao contato quando o formulario for enviado.</p>
            <Field label="Tags (separadas por virgula)" hint="Ex: newsletter, promo. Adicionadas ao contato criado.">
              <input className={inp} placeholder="newsletter, promo"
                value={(beh.audience?.tags || []).join(', ')}
                onChange={e => setG('audience', { tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} />
            </Field>
            <Field label="ID da lista (opcional)" hint="UUID da lista de contatos; o contato sera associado a ela.">
              <input className={inp} placeholder="uuid da lista"
                value={beh.audience?.listId || ''}
                onChange={e => setG('audience', { listId: e.target.value })} />
            </Field>
            <ToggleRow label="Double opt-in" hint="Envia email de confirmacao antes de marcar como inscrito."
              checked={!!beh.audience?.doubleOptIn}
              onChange={v => setG('audience', { doubleOptIn: v })} />
          </Section>

          <Section title="Parametros UTM">
            <ToggleRow label="Salvar UTMs no perfil do contato ao confirmar"
              hint="Quando o visitante enviar o formulario, os parametros UTM serao salvos em contacts.utm_data."
              checked={utm.storeOnConsent} onChange={v => setG('utm', { storeOnConsent: v })} />

            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Exibir com base em parametros UTM" checked={utm.filterEnabled} onChange={v => setG('utm', { filterEnabled: v })} />
              {utm.filterEnabled && (
                <div className="mt-3 space-y-2">
                  {utm.filters.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select className={sel + ' flex-[1.2]'} value={f.param} onChange={e => {
                        const next = [...utm.filters]; next[i] = { ...f, param: e.target.value }; setG('utm', { filters: next })
                      }}>
                        <option value="utm_source">utm_source</option>
                        <option value="utm_medium">utm_medium</option>
                        <option value="utm_campaign">utm_campaign</option>
                        <option value="utm_term">utm_term</option>
                        <option value="utm_content">utm_content</option>
                      </select>
                      <input className={inp + ' flex-1'} placeholder="valor" value={f.value} onChange={e => {
                        const next = [...utm.filters]; next[i] = { ...f, value: e.target.value }; setG('utm', { filters: next })
                      }} />
                      <button onClick={() => setG('utm', { filters: utm.filters.filter((_, j) => j !== i) })}
                        className="p-1.5 text-gray-400 hover:text-red-500 flex-shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setG('utm', { filters: [...utm.filters, { param: 'utm_source', value: '' }] })}
                    className="w-full py-2 text-[12px] font-medium text-brand-600 border border-dashed border-brand-300 rounded-lg hover:bg-brand-50 transition-colors">
                    + Adicionar filtro UTM
                  </button>
                </div>
              )}
            </div>
          </Section>
        </div>
      )}
    </div>
  )
}

// ── Theme Panel ────────────────────────────────────────────────────────────────
function ThemePanel({ design, onChange, onOpenMedia }: { design: PopupDesign; onChange: (d: PopupDesign) => void; onOpenMedia?: (cb: (url: string) => void) => void }) {
  const s = design.styles
  const setS = (val: Partial<PopupDesign['styles']>) => onChange({ ...design, styles: { ...s, ...val } })
  const setOv = (val: Partial<PopupDesign['styles']['overlay']>) => onChange({ ...design, styles: { ...s, overlay: { ...s.overlay, ...val } } })
  const setSi = (val: Partial<PopupDesign['styles']['sideImage']>) => onChange({ ...design, styles: { ...s, sideImage: { ...s.sideImage, ...val } } })
  const setCb = (val: Partial<PopupDesign['styles']['closeButton']>) => onChange({ ...design, styles: { ...s, closeButton: { ...s.closeButton, ...val } } })

  // Resolve per-side padding (fallback to legacy single value)
  const pt = s.paddingTop ?? s.padding ?? 32
  const pr = s.paddingRight ?? s.padding ?? 32
  const pb = s.paddingBottom ?? s.padding ?? 32
  const pl = s.paddingLeft ?? s.padding ?? 32

  return (
    <div>
      <Section title="Layout" defaultOpen>
        <Field label="Tipo de formulario">
          <select className={sel} value={design.formType} onChange={e => onChange({ ...design, formType: e.target.value as any })}>
            <option value="popup">Popup</option>
            <option value="flyout">Flyout</option>
            <option value="fullpage">Pagina inteira</option>
            <option value="embed">Embed</option>
            <option value="banner">Banner</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Largura"><div className="relative"><input type="number" className={inp + ' pr-8'} value={s.width} onChange={e => setS({ width: +e.target.value })} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">px</span></div></Field>
          <Field label="Altura mínima"><div className="relative"><input type="number" className={inp + ' pr-8'} value={s.minHeight ?? 500} onChange={e => setS({ minHeight: +e.target.value })} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">px</span></div></Field>
        </div>
        <Field label="Borda"><div className="relative"><input type="number" className={inp + ' pr-8'} value={s.borderRadius} onChange={e => setS({ borderRadius: +e.target.value })} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">px</span></div></Field>
        <Field label="Fonte">
          <select className={sel} value={s.fontFamily || 'Inter, sans-serif'} onChange={e => setS({ fontFamily: e.target.value })}>
            <option value="Inter, sans-serif">Inter</option>
            <option value="'Helvetica Neue', sans-serif">Helvetica</option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="'Montserrat', sans-serif">Montserrat</option>
            <option value="'Poppins', sans-serif">Poppins</option>
            <option value="'Roboto', sans-serif">Roboto</option>
            <option value="'Open Sans', sans-serif">Open Sans</option>
          </select>
        </Field>
        <Field label="Animacao">
          <select className={sel} value={s.animation} onChange={e => setS({ animation: e.target.value as any })}>
            <option value="fade">Fade</option>
            <option value="slide-up">Slide up</option>
            <option value="none">Nenhuma</option>
          </select>
        </Field>

        <div>
          <p className="text-[12px] font-medium text-gray-700 mb-2">Padding interno</p>
          <div className="grid grid-cols-3 gap-1.5 max-w-[220px] mx-auto">
            <div />
            <div className="relative"><input type="number" min={0} max={100} className="w-full px-2 py-1.5 pr-6 border border-gray-200 rounded-md text-[12px] text-center outline-none focus:border-brand-500" value={pt} onChange={e => setS({ paddingTop: +e.target.value })} /><span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">px</span></div>
            <div />
            <div className="relative"><input type="number" min={0} max={100} className="w-full px-2 py-1.5 pr-6 border border-gray-200 rounded-md text-[12px] text-center outline-none focus:border-brand-500" value={pl} onChange={e => setS({ paddingLeft: +e.target.value })} /><span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">px</span></div>
            <div className="flex items-center justify-center"><div className="w-6 h-6 rounded-sm bg-gray-100 border border-gray-200" /></div>
            <div className="relative"><input type="number" min={0} max={100} className="w-full px-2 py-1.5 pr-6 border border-gray-200 rounded-md text-[12px] text-center outline-none focus:border-brand-500" value={pr} onChange={e => setS({ paddingRight: +e.target.value })} /><span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">px</span></div>
            <div />
            <div className="relative"><input type="number" min={0} max={100} className="w-full px-2 py-1.5 pr-6 border border-gray-200 rounded-md text-[12px] text-center outline-none focus:border-brand-500" value={pb} onChange={e => setS({ paddingBottom: +e.target.value })} /><span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">px</span></div>
            <div />
          </div>
        </div>
      </Section>

      <Section title="Cores" defaultOpen={true}>
        <Field label="Cor de fundo do popup">
          <ColorPicker value={s.backgroundColor} onChange={v => setS({ backgroundColor: v })} />
        </Field>

        <div className="pt-2 border-t border-gray-100">
          <ToggleRow label="Exibir overlay de fundo" checked={s.overlay.enabled} onChange={v => setOv({ enabled: v })} hint="Fundo escurecido atrás do popup" />
          {s.overlay.enabled && (
            <div className="space-y-3 mt-3">
              <Field label="Cor do overlay">
                <ColorPicker value={s.overlay.color} onChange={v => setOv({ color: v })} />
              </Field>
              <Field label={`Opacidade: ${s.overlay.opacity}%`}>
                <input type="range" min={0} max={100} value={s.overlay.opacity} onChange={e => setOv({ opacity: +e.target.value })} className="w-full accent-orange-500" />
              </Field>
            </div>
          )}
        </div>
      </Section>

      <Section title="Imagem lateral">
        <ToggleRow label="Ativar imagem lateral" checked={s.sideImage.enabled} onChange={v => setSi({ enabled: v })} />
        {s.sideImage.enabled && (
          <div className="mt-3 space-y-3">
            {s.sideImage.src ? (
              <div className="space-y-2">
                <img src={s.sideImage.src} alt="" className="w-full h-28 object-cover rounded-lg border border-gray-200" />
                <div className="flex gap-2">
                  <button onClick={() => onOpenMedia?.(url => setSi({ src: url }))}
                    className="flex-1 py-2 text-[12px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                    Trocar
                  </button>
                  <button onClick={() => setSi({ src: '' })} className="flex-1 py-2 text-[12px] font-medium text-red-600 bg-white border border-gray-200 rounded-lg hover:bg-red-50">
                    Remover
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => onOpenMedia?.(url => setSi({ src: url }))}
                className="w-full border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
                <Upload className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <span className="text-[12px] text-gray-500">Escolher imagem da biblioteca</span>
              </button>
            )}
            <Field label="Posicao">
              <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                <button onClick={() => setSi({ position: 'left' })} className={`flex-1 py-2 text-[12px] font-medium transition-colors ${s.sideImage.position === 'left' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Esquerda</button>
                <button onClick={() => setSi({ position: 'right' })} className={`flex-1 py-2 text-[12px] font-medium transition-colors ${s.sideImage.position === 'right' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Direita</button>
              </div>
            </Field>
            <p className="text-[11px] text-gray-400 leading-snug">A imagem ocupa 50% da largura do popup para um visual limpo e profissional.</p>
          </div>
        )}
      </Section>

      <Section title="Botao fechar">
        <ToggleRow label="Mostrar botao fechar" checked={s.closeButton.show} onChange={v => setCb({ show: v })} />
        {s.closeButton.show && (
          <div className="mt-3 space-y-3">
            <Field label="Cor do botão">
              <ColorPicker value={s.closeButton.color} onChange={v => setCb({ color: v })} />
            </Field>
            <Field label={`Tamanho: ${s.closeButton.size || 24}px`}>
              <input type="range" min={16} max={48} value={s.closeButton.size || 24} onChange={e => setCb({ size: +e.target.value })} className="w-full accent-orange-500" />
            </Field>
          </div>
        )}
      </Section>
    </div>
  )
}

// ── Sortable Block Wrapper ────────────────────────────────────────────────────
function SortablePopupBlock({ block, isSelected, onSelect, onDelete, onDuplicate, onContentChange, onPropChange }: {
  block: Block; isSelected: boolean; onSelect: () => void; onDelete: () => void; onDuplicate: () => void
  onContentChange: (key: string, value: string) => void
  onPropChange: (key: string, value: any) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const p = block.props
  const isText = block.type === 'text'
  const isButton = block.type === 'button'
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, position: 'relative' }}
      onClick={e => { e.stopPropagation(); onSelect() }}
      className={`group relative rounded transition ${isSelected ? 'ring-2 ring-gray-400/60 ring-offset-2 ring-offset-white' : 'hover:ring-1 hover:ring-gray-300 cursor-pointer'}`}>
      {/* Visible drag handle pill — sits at top-center of the block, inside bounds */}
      <div {...attributes} {...listeners}
        className={`absolute left-1/2 -translate-x-1/2 top-0.5 z-10 flex items-center gap-1 px-2 h-5 bg-white border border-gray-200 rounded shadow-sm text-[10px] font-medium text-gray-500 cursor-grab active:cursor-grabbing transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        title="Arraste para reordenar"
        onClick={e => e.stopPropagation()}>
        <GripHorizontal className="w-3 h-3" />
        <span>Arrastar</span>
      </div>
      {/* Floating inline format toolbar (text only, when selected) */}
      {isSelected && isText && (
        <div
          onMouseDown={e => e.preventDefault()}
          className="absolute left-1/2 -translate-x-1/2 -top-11 z-20 flex items-center gap-0.5 bg-gray-900 text-white rounded-lg shadow-lg px-1 py-1">
          <button onClick={(e) => { e.stopPropagation(); onPropChange('fontWeight', p.fontWeight === 'bold' ? 'normal' : 'bold') }}
            className={`px-2 py-1 text-xs font-bold rounded hover:bg-white/10 ${p.fontWeight === 'bold' ? 'bg-white/20' : ''}`} title="Negrito">B</button>
          <button onClick={(e) => { e.stopPropagation(); onPropChange('fontStyle', p.fontStyle === 'italic' ? 'normal' : 'italic') }}
            className={`px-2 py-1 text-xs italic rounded hover:bg-white/10 ${p.fontStyle === 'italic' ? 'bg-white/20' : ''}`} title="Itálico">I</button>
          <button onClick={(e) => { e.stopPropagation(); onPropChange('textDecoration', p.textDecoration === 'underline' ? 'none' : 'underline') }}
            className={`px-2 py-1 text-xs underline rounded hover:bg-white/10 ${p.textDecoration === 'underline' ? 'bg-white/20' : ''}`} title="Sublinhado">U</button>
          <div className="w-px h-4 bg-white/20 mx-0.5" />
          {['left','center','right'].map(a => (
            <button key={a} onClick={(e) => { e.stopPropagation(); onPropChange('align', a) }}
              className={`px-2 py-1 text-[10px] rounded hover:bg-white/10 ${p.align === a ? 'bg-white/20' : ''}`} title={`Alinhar ${a}`}>
              {a === 'left' ? '⇤' : a === 'center' ? '≡' : '⇥'}
            </button>
          ))}
          <div className="w-px h-4 bg-white/20 mx-0.5" />
          <select value={p.tag || 'p'} onChange={(e) => { e.stopPropagation(); onPropChange('tag', e.target.value) }}
            onClick={e => e.stopPropagation()}
            className="bg-transparent text-[11px] px-1 py-0.5 rounded focus:outline-none cursor-pointer hover:bg-white/10" title="Estilo">
            <option value="h1" className="text-gray-900">H1</option>
            <option value="h2" className="text-gray-900">H2</option>
            <option value="h3" className="text-gray-900">H3</option>
            <option value="p" className="text-gray-900">P</option>
          </select>
        </div>
      )}
      {/* Floating toolbar for button blocks */}
      {isSelected && isButton && (
        <div
          onMouseDown={e => e.preventDefault()}
          className="absolute left-1/2 -translate-x-1/2 -top-11 z-20 flex items-center gap-1 bg-gray-900 text-white rounded-lg shadow-lg px-2 py-1.5 text-[11px]">
          <span className="text-white/60">Editando botão — clique fora p/ concluir</span>
        </div>
      )}
      <BlockPreview block={block} selected={isSelected} onContentChange={onContentChange} />
      {/* Action buttons — visible while selected, top-right corner */}
      {isSelected && (
        <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5 bg-white border border-gray-200 rounded-md shadow-sm px-0.5 py-0.5 z-10">
          <button onClick={e => { e.stopPropagation(); onDuplicate() }} className="p-1 text-gray-400 hover:text-gray-700 rounded" title="Duplicar"><Copy className="w-3 h-3" /></button>
          <button onClick={e => { e.stopPropagation(); onDelete() }} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Remover"><Trash2 className="w-3 h-3" /></button>
        </div>
      )}
    </div>
  )
}

// ── Media Library Modal (uses shared component) ─────────────────────────────
import { MediaLibraryModal } from '@/components/shared/MediaLibraryModal'
import { ColorPicker } from '@/components/email-builder/ui/ColorPicker'
import { useStoreStore } from '@/stores'

// ── Step Bar (Omnisend-style, centered, editable step names) ──────────────────
function StepBar({ steps, activeIdx, showSuccess, onSelectStep, onSelectSuccess, onRenameStep, onCloneStep, onDeleteStep, onAddStep }: {
  steps: Step[]
  activeIdx: number
  showSuccess: boolean
  onSelectStep: (i: number) => void
  onSelectSuccess: () => void
  onRenameStep: (i: number, name: string) => void
  onCloneStep: (i: number) => void
  onDeleteStep: (i: number) => void
  onAddStep: () => void
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [menuIdx, setMenuIdx] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const startEdit = (i: number, current: string) => { setEditingIdx(i); setDraft(current); setMenuIdx(null) }
  const commit = () => {
    if (editingIdx != null && draft.trim()) onRenameStep(editingIdx, draft.trim())
    setEditingIdx(null)
  }

  useEffect(() => {
    if (menuIdx == null) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuIdx(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuIdx])

  return (
    <div className="relative flex items-center justify-center h-[48px] bg-white border-t border-gray-200 w-full shrink-0 px-4">
      {/* Centered step pills */}
      <div className="flex items-center gap-1">
        {steps.map((step, i) => {
          const isActive = !showSuccess && activeIdx === i
          const isEditing = editingIdx === i
          return (
            <div key={step.id} className="flex items-center">
              <div className={`relative flex items-center gap-0.5 rounded-lg transition-colors ${isActive ? 'bg-gray-900' : 'hover:bg-gray-100'}`}>
                <span className={`flex items-center justify-center w-5 h-5 ml-1.5 rounded-full text-[10px] font-bold ${isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  {i + 1}
                </span>
                {isEditing ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={commit}
                    onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditingIdx(null) }}
                    className="bg-transparent text-[12px] font-medium text-white px-2 py-1 outline-none border-b border-white/40 min-w-[80px] max-w-[180px]"
                  />
                ) : (
                  <button
                    onClick={() => onSelectStep(i)}
                    onDoubleClick={() => startEdit(i, step.name)}
                    title="Duplo clique para renomear"
                    className={`px-2 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors ${isActive ? 'text-white' : 'text-gray-600'}`}>
                    {step.name}
                  </button>
                )}
                {isActive && !isEditing && (
                  <div className="relative pr-1">
                    <button onClick={() => setMenuIdx(menuIdx === i ? null : i)}
                      className="p-1 text-white/50 hover:text-white rounded transition-colors">
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                    {menuIdx === i && (
                      <div ref={menuRef}
                        className="absolute bottom-full right-0 mb-2 w-44 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[60]">
                        <button onClick={() => startEdit(i, step.name)}
                          className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-gray-700 hover:bg-gray-50 transition-colors">
                          <Pencil className="w-3.5 h-3.5 text-gray-400" /> Renomear
                        </button>
                        <button onClick={() => { onCloneStep(i); setMenuIdx(null) }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-gray-700 hover:bg-gray-50 transition-colors">
                          <Copy className="w-3.5 h-3.5 text-gray-400" /> Duplicar etapa
                        </button>
                        {steps.length > 1 && (
                          <>
                            <div className="h-px bg-gray-100 my-1" />
                            <button onClick={() => { onDeleteStep(i); setMenuIdx(null) }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-[12px] text-red-600 hover:bg-red-50 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" /> Excluir etapa
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0 mx-1" />}
            </div>
          )
        })}

        {steps.length > 0 && <div className="w-px h-5 bg-gray-200 mx-2" />}

        <button onClick={onSelectSuccess}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium whitespace-nowrap transition-colors ${showSuccess ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
          <Check className="w-3 h-3" /> Sucesso
        </button>
      </div>

      <button onClick={onAddStep}
        className="absolute right-4 flex items-center gap-1.5 px-2.5 h-7 text-[11px] font-medium text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors">
        <Plus className="w-3 h-3" /> Etapa
      </button>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function PopupEditorPage() {
  const params = useParams()
  const router = useRouter()
  const formId = params.id as string
  const { currentStore } = useStoreStore()

  const [design, setDesign] = useState<PopupDesign>(defaultDesign)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formStatus, setFormStatus] = useState<'draft' | 'published'>('draft')
  const [formName, setFormName] = useState('Popup sem título')
  const [editingName, setEditingName] = useState(false)
  const [preview, setPreview] = useState<'desktop' | 'mobile'>('desktop')
  const [activeStepIdx, setActiveStepIdx] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  // Left sidebar view: 'hub' (overview with Styles/Targeting/Blocks cards) | 'styles' | 'targeting' | 'blocks'
  const [leftView, setLeftView] = useState<'hub' | 'styles' | 'targeting' | 'blocks'>('hub')
  const [showPreview, setShowPreview] = useState(false)
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [showMediaLibrary, setShowMediaLibrary] = useState(false)
  const mediaCallbackRef = useRef<((url: string) => void) | null>(null)
  // Undo/Redo
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const activeStep = showSuccess ? design.successStep : design.steps[activeStepIdx]
  const selectedBlock = activeStep?.blocks.find(b => b.id === selectedBlockId) ?? null

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const blocks = activeStep.blocks
    const oldIdx = blocks.findIndex(b => b.id === active.id)
    const newIdx = blocks.findIndex(b => b.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    updateBlocks(arrayMove(blocks, oldIdx, newIdx))
  }, [activeStep])

  const pushHistory = useCallback((d: PopupDesign) => {
    const json = JSON.stringify(d)
    setHistory(prev => [...prev.slice(0, historyIdx + 1), json].slice(-30))
    setHistoryIdx(prev => prev + 1)
  }, [historyIdx])

  const undo = useCallback(() => {
    if (historyIdx > 0) { setHistoryIdx(prev => prev - 1); setDesign(JSON.parse(history[historyIdx - 1])) }
  }, [history, historyIdx])

  const redo = useCallback(() => {
    if (historyIdx < history.length - 1) { setHistoryIdx(prev => prev + 1); setDesign(JSON.parse(history[historyIdx + 1])) }
  }, [history, historyIdx])

  // Load
  useEffect(() => {
    fetch(`/api/forms/${formId}`).then(r => r.json()).then(data => {
      const form = data.form || data
      if (form.name) setFormName(form.name)
      if (form.design_json && Object.keys(form.design_json).length > 0) {
        // Deep-merge to preserve new default fields (styles/behavior sub-objects)
        const saved = form.design_json
        const merged: PopupDesign = {
          ...defaultDesign,
          ...saved,
          styles: { ...defaultDesign.styles, ...(saved.styles || {}),
            overlay: { ...defaultDesign.styles.overlay, ...(saved.styles?.overlay || {}) },
            closeButton: { ...defaultDesign.styles.closeButton, ...(saved.styles?.closeButton || {}) },
            sideImage: { ...defaultDesign.styles.sideImage, ...(saved.styles?.sideImage || {}) },
          },
          behavior: {
            ...defaultDesign.behavior,
            ...(saved.behavior || {}),
            display: { ...defaultDesign.behavior.display, ...((saved.behavior || {}).display || {}) },
            visibility: { ...defaultDesign.behavior.visibility, ...((saved.behavior || {}).visibility || {}) },
            frequency: { ...defaultDesign.behavior.frequency, ...((saved.behavior || {}).frequency || {}) },
            targeting: { ...defaultDesign.behavior.targeting, ...((saved.behavior || {}).targeting || {}) },
            scheduling: { ...defaultDesign.behavior.scheduling, ...((saved.behavior || {}).scheduling || {}) },
            audience: { ...defaultDesign.behavior.audience, ...((saved.behavior || {}).audience || {}) },
            urls: { ...defaultDesign.behavior.urls!, ...((saved.behavior || {}).urls || {}) },
            location: { ...defaultDesign.behavior.location!, ...((saved.behavior || {}).location || {}) },
            utm: { ...defaultDesign.behavior.utm!, ...((saved.behavior || {}).utm || {}) },
            clickOutsideClose: { ...defaultDesign.behavior.clickOutsideClose!, ...((saved.behavior || {}).clickOutsideClose || {}) },
          },
          postSubmit: { ...defaultDesign.postSubmit!, ...(saved.postSubmit || {}) },
          successMessage: saved.successMessage || form.success_message || '',
        }
        // Seed postSubmit.redirectUrl from top-level form.redirect_url if not already set
        if (!merged.postSubmit!.redirectUrl && form.redirect_url) {
          merged.postSubmit!.redirectUrl = form.redirect_url
          if (merged.postSubmit!.action === 'show-success') merged.postSubmit!.action = 'redirect'
        }
        setDesign(merged)
      }
      if (form.status) setFormStatus(form.status === 'published' ? 'published' : 'draft')
    }).catch(() => {}).finally(() => setLoading(false))
  }, [formId])

  // Save
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await fetch(`/api/forms/${formId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          design_json: design,
          form_type: design.formType,
          behavior: design.behavior,
          status: formStatus,
          success_message: design.successMessage || null,
          redirect_url: design.postSubmit?.action === 'redirect' ? (design.postSubmit.redirectUrl || null) : null,
          audience: design.behavior.audience || null,
          tags: design.behavior.audience?.tags || [],
          list_id: design.behavior.audience?.listId || null,
          // Auto-attach to the current store on every save. Covers the case where
          // the form was created with store_id=NULL because currentStore was still
          // hydrating when the merchant clicked Create — without this, the popup
          // is invisible in the per-store list and stuck as orphan forever.
          ...(currentStore?.id ? { store_id: currentStore.id } : {}),
        }),
      })
    } finally { setSaving(false) }
  }, [formId, design, formStatus, formName, currentStore?.id])

  const handlePublish = useCallback(async () => {
    const newStatus = formStatus === 'published' ? 'draft' : 'published'
    setFormStatus(newStatus)
    await fetch(`/api/forms/${formId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: newStatus,
        design_json: design,
        form_type: design.formType,
        behavior: design.behavior,
        ...(currentStore?.id ? { store_id: currentStore.id } : {}),
      }),
    })
  }, [formId, design, formStatus, currentStore?.id])

  const updateBlocks = (blocks: Block[]) => {
    const updater = (d: PopupDesign) => {
      const newDesign = showSuccess
        ? { ...d, successStep: { ...d.successStep, blocks } }
        : { ...d, steps: d.steps.map((s, i) => i === activeStepIdx ? { ...s, blocks } : s) }
      pushHistory(newDesign)
      return newDesign
    }
    setDesign(updater)
  }

  const addBlock = (type: string) => {
    // If adding an input and design has global fieldStyles, merge them as seed
    const INPUT_TYPES = ['email', 'phone', 'name-input', 'text-input', 'date-input']
    const base = { ...(defaultProps[type] || {}) }
    if (INPUT_TYPES.includes(type) && design.fieldStyles) {
      Object.assign(base, design.fieldStyles)
    }
    const b: Block = { id: uid(), type, props: base }
    updateBlocks([...activeStep.blocks, b])
    setSelectedBlockId(b.id)
  }

  const duplicateBlock = (id: string) => {
    const block = activeStep.blocks.find(b => b.id === id)
    if (!block) return
    const clone: Block = { id: uid(), type: block.type, props: { ...JSON.parse(JSON.stringify(block.props)) } }
    const idx = activeStep.blocks.findIndex(b => b.id === id)
    const newBlocks = [...activeStep.blocks]
    newBlocks.splice(idx + 1, 0, clone)
    updateBlocks(newBlocks)
    setSelectedBlockId(clone.id)
  }

  const updateBlock = (block: Block) => updateBlocks(activeStep.blocks.map(b => b.id === block.id ? block : b))
  const deleteBlock = (id: string) => { updateBlocks(activeStep.blocks.filter(b => b.id !== id)); if (selectedBlockId === id) setSelectedBlockId(null) }

  // Apply a source input block's visual styles to all other input blocks across ALL steps
  const applyStylesToAllInputs = useCallback((sourceBlock: Block) => {
    const INPUT_TYPES = ['email', 'phone', 'name-input', 'text-input', 'date-input']
    const STYLE_KEYS = [
      'inputStyle', 'corners', 'cornerRadius', 'backgroundColor', 'errorColor',
      'fontFamily', 'fontSize', 'bold', 'italic', 'underline',
      'textColor', 'placeholderColor', 'labelColor', 'textAlign',
      'borderWidth', 'borderStyle', 'borderColor',
      'inputPadTop', 'inputPadRight', 'inputPadBottom', 'inputPadLeft',
    ]
    const stylePayload: Record<string, any> = {}
    for (const k of STYLE_KEYS) {
      if (sourceBlock.props[k] !== undefined) stylePayload[k] = sourceBlock.props[k]
    }
    const patchBlocks = (blocks: Block[]) =>
      blocks.map(b => INPUT_TYPES.includes(b.type) ? { ...b, props: { ...b.props, ...stylePayload } } : b)

    setDesign(d => {
      const newDesign = {
        ...d,
        steps: d.steps.map(s => ({ ...s, blocks: patchBlocks(s.blocks) })),
        successStep: { ...d.successStep, blocks: patchBlocks(d.successStep.blocks) },
        fieldStyles: stylePayload, // store as global defaults for future inputs
      }
      pushHistory(newDesign)
      return newDesign
    })
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo() }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, handleSave])

  const openMediaLibrary = useCallback((callback: (url: string) => void) => {
    mediaCallbackRef.current = callback
    setShowMediaLibrary(true)
  }, [])

  const addStep = () => {
    const s: Step = { id: uid(), name: `Etapa ${design.steps.length + 1}`, blocks: [] }
    setDesign(d => ({ ...d, steps: [...d.steps, s] }))
    setActiveStepIdx(design.steps.length)
    setShowSuccess(false)
  }

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>

  const s = design.styles

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <InlineEditableStyles />
      {/* Top bar — Omnisend-inspired with Worder identity */}
      <header className="flex items-center justify-between px-5 h-[52px] bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button onClick={() => router.back()} className="flex-shrink-0 p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors" title="Voltar">
            <ArrowLeft className="w-[18px] h-[18px]" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Worder" className="h-7 flex-shrink-0" />
          <div className="h-5 w-px bg-gray-200 flex-shrink-0 mx-1" />
          <div className="flex items-center gap-2.5 min-w-0">
            {editingName ? (
              <input
                autoFocus
                value={formName}
                onChange={e => setFormName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={e => { if (e.key === 'Enter') setEditingName(false) }}
                className="text-[14px] font-medium text-gray-900 bg-transparent border-b border-gray-400 outline-none min-w-[200px] max-w-[400px] pb-0.5"
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="group flex items-center gap-1.5 text-[14px] font-medium text-gray-900 hover:text-gray-600 transition-colors"
                title="Renomear"
              >
                <span className="truncate max-w-[280px]">{formName}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
            {formStatus === 'published' && (
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-600 rounded flex-shrink-0 tracking-wide">ATIVO</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={undo} disabled={historyIdx <= 0} className="p-2 text-gray-400 hover:text-gray-700 rounded-md disabled:opacity-25 transition-colors" title="Desfazer"><Undo2 className="w-4 h-4" /></button>
          <button onClick={redo} disabled={historyIdx >= history.length - 1} className="p-2 text-gray-400 hover:text-gray-700 rounded-md disabled:opacity-25 transition-colors" title="Refazer"><Redo2 className="w-4 h-4" /></button>
          <div className="h-5 w-px bg-gray-200 mx-1" />
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setPreview('desktop')} className={`p-1.5 rounded-md transition-all ${preview === 'desktop' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-700'}`} title="Desktop"><Monitor className="w-4 h-4" /></button>
            <button onClick={() => setPreview('mobile')} className={`p-1.5 rounded-md transition-all ${preview === 'mobile' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-700'}`} title="Mobile"><Smartphone className="w-4 h-4" /></button>
          </div>
          <div className="h-5 w-px bg-gray-200 mx-1" />
          <button onClick={() => setShowPreview(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
            <Eye className="w-4 h-4" /> Preview
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-lg transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
          </button>
          <button onClick={handlePublish} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${formStatus === 'published' ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-gray-900 text-white hover:bg-gray-800'}`}>
            <Power className="w-4 h-4" /> {formStatus === 'published' ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — all controls (Klaviyo-style hub + drill-down panels) */}
        <aside className="w-[300px] bg-white border-r border-gray-200 flex flex-col shrink-0">
          {selectedBlock ? (
            <>
              {/* Block editor header */}
              <div className="flex items-center gap-2.5 px-4 h-[44px] border-b border-gray-100 shrink-0">
                <button onClick={() => setSelectedBlockId(null)}
                  title="Voltar"
                  className="p-1 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <h2 className="text-[13px] font-semibold text-gray-900 truncate">
                    {(() => {
                      const labels: Record<string, string> = {
                        email: 'Email', phone: 'Telefone', 'name-input': 'Nome',
                        'text-input': 'Campo de texto', 'date-input': 'Data',
                        dropdown: 'Dropdown', radio: 'Radio', checkbox: 'Checkbox',
                        'legal-consent': 'Consentimento', text: 'Texto', button: 'Botão', image: 'Imagem',
                        spacer: 'Espaçador', line: 'Linha', coupon: 'Cupom', countdown: 'Contagem',
                      }
                      return labels[selectedBlock.type] || selectedBlock.type
                    })()}
                  </h2>
                </div>
                <button onClick={() => deleteBlock(selectedBlock.id)}
                  title="Excluir bloco"
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <BlockEditor block={selectedBlock} onChange={updateBlock} onDelete={() => deleteBlock(selectedBlock.id)} onOpenMedia={openMediaLibrary} onApplyToAllInputs={applyStylesToAllInputs} />
              </div>
            </>
          ) : leftView === 'hub' ? (
            <>
              {/* Hub view — Klaviyo-style minimal nav rows */}
              <div className="flex-1 overflow-y-auto">
                <div className="py-2">
                  <button onClick={() => setLeftView('styles')}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left group">
                    <Palette className="w-[18px] h-[18px] text-gray-400 group-hover:text-gray-600 flex-shrink-0 transition-colors" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-medium text-gray-900">Estilos</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </button>
                  <button onClick={() => setLeftView('targeting')}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left group">
                    <Target className="w-[18px] h-[18px] text-gray-400 group-hover:text-gray-600 flex-shrink-0 transition-colors" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-medium text-gray-900">Segmentação e comportamento</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </button>
                  <button onClick={() => setLeftView('blocks')}
                    className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors text-left group">
                    <LayoutGrid className="w-[18px] h-[18px] text-gray-400 group-hover:text-gray-600 flex-shrink-0 transition-colors" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-medium text-gray-900">Adicionar blocos</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </button>
                </div>
              </div>
            </>
          ) : leftView === 'styles' ? (
            <>
              <div className="flex items-center gap-2.5 px-4 h-[44px] border-b border-gray-100 shrink-0">
                <button onClick={() => setLeftView('hub')}
                  className="p-1 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-[13px] font-semibold text-gray-900 flex-1">Estilos</h2>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ThemePanel design={design} onChange={setDesign} onOpenMedia={openMediaLibrary} />
              </div>
            </>
          ) : leftView === 'targeting' ? (
            <>
              <div className="flex items-center gap-2.5 px-4 h-[44px] border-b border-gray-100 shrink-0">
                <button onClick={() => setLeftView('hub')}
                  className="p-1 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-[13px] font-semibold text-gray-900 flex-1">Segmentação e comportamento</h2>
              </div>
              <div className="flex-1 overflow-y-auto">
                <BehaviorPanel
                  beh={design.behavior}
                  onChange={b => setDesign(d => ({ ...d, behavior: b }))}
                  formId={formId}
                  postSubmit={design.postSubmit || defaultDesign.postSubmit!}
                  onPostSubmitChange={ps => setDesign(d => ({ ...d, postSubmit: ps }))}
                  successMessage={design.successMessage || ''}
                  onSuccessMessageChange={v => setDesign(d => ({ ...d, successMessage: v }))}
                />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 px-4 h-[44px] border-b border-gray-100 shrink-0">
                <button onClick={() => setLeftView('hub')}
                  className="p-1 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-[13px] font-semibold text-gray-900 flex-1">Adicionar blocos</h2>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="grid grid-cols-2 gap-1.5">
                  {BLOCK_TYPES.map(bt => (
                    <button key={bt.type} onClick={() => addBlock(bt.type)}
                      title={`Adicionar ${bt.label}`}
                      className="group flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-lg border border-gray-100 bg-white hover:border-gray-300 hover:bg-gray-50 transition-all text-gray-500 hover:text-gray-900">
                      <bt.icon className="w-5 h-5" />
                      <span className="text-[11px] font-medium leading-tight text-center">{bt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* Center canvas — dark Omnisend-inspired background with subtle gradient for depth */}
        <main className="flex-1 flex flex-col items-center overflow-y-auto"
          onClick={() => setSelectedBlockId(null)}
          style={{
            backgroundColor: '#e8eaed',
          }}>
          <div className="flex-1 flex items-center justify-center w-full p-8">
            {/* Popup container — total width stays s.width; when side image is
                enabled the interior splits 50/50 (Omnisend-style) instead of
                appending image width on top. Default min-height: 500px. */}
            <div className="relative flex overflow-hidden shadow-xl ring-1 ring-black/[0.06]" style={{
              width: preview === 'mobile' ? 360 : s.width,
              maxWidth: '95%',
              minHeight: s.minHeight ?? 500,
              borderRadius: s.borderRadius,
            }}>
              {/* Close button — always top-right of entire popup */}
              {s.closeButton.show && (
                <button className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center transition-colors z-20">
                  <X style={{ color: s.closeButton.color || '#FFFFFF' }} className="w-4 h-4" />
                </button>
              )}
              {/* Side image LEFT */}
              {s.sideImage.enabled && s.sideImage.position === 'left' && s.sideImage.src && !(preview === 'mobile') && (
                <div style={{ flex: 1, flexBasis: 0, minWidth: 0 }} className="overflow-hidden">
                  <img src={s.sideImage.src} className="w-full h-full object-cover" alt="" />
                </div>
              )}
              {/* Popup body — 50% when side image active, full when not */}
              <div style={{
                backgroundColor: s.backgroundColor,
                paddingTop: s.paddingTop ?? s.padding ?? 32,
                paddingRight: s.paddingRight ?? s.padding ?? 32,
                paddingBottom: s.paddingBottom ?? s.padding ?? 32,
                paddingLeft: s.paddingLeft ?? s.padding ?? 32,
                fontFamily: s.fontFamily,
                flex: 1,
                flexBasis: 0,
                minWidth: 0,
                minHeight: s.minHeight ?? 500,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }} className="relative">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={activeStep.blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2 min-h-[100px]">
                      {activeStep.blocks.map(block => (
                        <SortablePopupBlock key={block.id} block={block} isSelected={selectedBlockId === block.id}
                          onSelect={() => setSelectedBlockId(block.id)}
                          onDelete={() => deleteBlock(block.id)}
                          onDuplicate={() => duplicateBlock(block.id)}
                          onContentChange={(k, v) => updateBlock({ ...block, props: { ...block.props, [k]: v } })}
                          onPropChange={(k, v) => updateBlock({ ...block, props: { ...block.props, [k]: v } })} />
                      ))}
                      {activeStep.blocks.length === 0 && (
                        <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-xl">
                          <Plus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-400">Clique em um bloco na paleta</p>
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
              {/* Side image RIGHT */}
              {s.sideImage.enabled && s.sideImage.position === 'right' && s.sideImage.src && !(preview === 'mobile') && (
                <div style={{ flex: 1, flexBasis: 0, minWidth: 0 }} className="overflow-hidden">
                  <img src={s.sideImage.src} className="w-full h-full object-cover" alt="" />
                </div>
              )}
              {/* Side image placeholder (no src) */}
              {s.sideImage.enabled && !s.sideImage.src && !(preview === 'mobile') && (
                <div style={{ flex: 1, flexBasis: 0, minWidth: 0, order: s.sideImage.position === 'left' ? -1 : 1 }}
                  className="bg-gray-100 flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <ImageIcon className="w-8 h-8 mx-auto mb-1" />
                    <p className="text-xs">Imagem lateral</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step bar — Omnisend-style centered with editable names */}
          <StepBar
            steps={design.steps}
            activeIdx={activeStepIdx}
            showSuccess={showSuccess}
            onSelectStep={i => { setActiveStepIdx(i); setShowSuccess(false); setSelectedBlockId(null) }}
            onSelectSuccess={() => { setShowSuccess(true); setSelectedBlockId(null) }}
            onRenameStep={(i, name) => setDesign(d => ({ ...d, steps: d.steps.map((s, j) => j === i ? { ...s, name } : s) }))}
            onCloneStep={i => {
              const step = design.steps[i]
              const clone: Step = { id: uid(), name: `${step.name} (cópia)`, blocks: JSON.parse(JSON.stringify(step.blocks)) }
              setDesign(d => { const next = [...d.steps]; next.splice(i + 1, 0, clone); return { ...d, steps: next } })
              setActiveStepIdx(i + 1)
            }}
            onDeleteStep={i => {
              if (design.steps.length <= 1) return
              setDesign(d => ({ ...d, steps: d.steps.filter((_, j) => j !== i) }))
              setActiveStepIdx(Math.max(0, i - 1))
            }}
            onAddStep={addStep}
          />
        </main>

      </div>

      {/* Preview Mode Overlay */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col">
          {/* Preview toolbar */}
          <div className="flex items-center justify-between px-6 py-3 bg-gray-900 shrink-0">
            <span className="text-sm font-medium text-white">Preview Mode</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 bg-gray-800 rounded-lg p-0.5">
                <button onClick={() => setPreviewDevice('desktop')} className={`px-3 py-1.5 rounded text-xs font-medium ${previewDevice === 'desktop' ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'}`}>
                  <Monitor className="w-4 h-4 inline mr-1" />Desktop
                </button>
                <button onClick={() => setPreviewDevice('mobile')} className={`px-3 py-1.5 rounded text-xs font-medium ${previewDevice === 'mobile' ? 'bg-white text-gray-900' : 'text-gray-400 hover:text-white'}`}>
                  <Smartphone className="w-4 h-4 inline mr-1" />Mobile
                </button>
              </div>
            </div>
            <button onClick={() => setShowPreview(false)} className="flex items-center gap-2 px-4 py-1.5 bg-white text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-100">
              <X className="w-4 h-4" /> Fechar Preview
            </button>
          </div>
          {/* Simulated website background */}
          <div className="flex-1 overflow-auto bg-gray-200" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, #d1d5db 40px, #d1d5db 41px)' }}>
            {/* Fake website content */}
            <div className="max-w-4xl mx-auto px-8 py-12">
              <div className="h-8 w-48 bg-gray-300 rounded mb-8" />
              <div className="flex gap-6 mb-6">
                <div className="h-4 flex-1 bg-gray-300 rounded" /><div className="h-4 w-24 bg-gray-300 rounded" /><div className="h-4 w-32 bg-gray-300 rounded" />
              </div>
              <div className="space-y-3 mb-8">
                <div className="h-3 w-full bg-gray-300/60 rounded" /><div className="h-3 w-5/6 bg-gray-300/60 rounded" /><div className="h-3 w-4/6 bg-gray-300/60 rounded" />
              </div>
              <div className="h-48 bg-gray-300/40 rounded-lg mb-8" />
              <div className="space-y-3">
                <div className="h-3 w-full bg-gray-300/60 rounded" /><div className="h-3 w-3/4 bg-gray-300/60 rounded" /><div className="h-3 w-5/6 bg-gray-300/60 rounded" />
              </div>
            </div>
            {/* Popup overlay */}
            <div className="fixed inset-0 top-[52px] flex items-center justify-center" style={{ zIndex: 10 }}>
              {s.overlay.enabled && <div className="absolute inset-0" style={{ backgroundColor: s.overlay.color, opacity: s.overlay.opacity / 100 }} />}
              <div className="relative flex overflow-hidden shadow-2xl" style={{
                width: previewDevice === 'mobile' ? 360 : s.width,
                maxWidth: '95%',
                minHeight: s.minHeight ?? 500,
                borderRadius: s.borderRadius,
                animation: s.animation === 'fade' ? 'fadeIn 0.3s ease' : s.animation === 'slide-up' ? 'slideUp 0.3s ease' : undefined,
              }}>
                {s.closeButton.show && (
                  <button className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 flex items-center justify-center z-20">
                    <X style={{ color: s.closeButton.color || '#FFFFFF' }} className="w-4 h-4" />
                  </button>
                )}
                {s.sideImage.enabled && s.sideImage.position === 'left' && s.sideImage.src && previewDevice !== 'mobile' && (
                  <div style={{ flex: 1, flexBasis: 0, minWidth: 0 }} className="overflow-hidden">
                    <img src={s.sideImage.src} className="w-full h-full object-cover" alt="" />
                  </div>
                )}
                <div style={{ backgroundColor: s.backgroundColor, paddingTop: s.paddingTop ?? s.padding ?? 32, paddingRight: s.paddingRight ?? s.padding ?? 32, paddingBottom: s.paddingBottom ?? s.padding ?? 32, paddingLeft: s.paddingLeft ?? s.padding ?? 32, fontFamily: s.fontFamily, flex: 1, flexBasis: 0, minWidth: 0, minHeight: s.minHeight ?? 500, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  {activeStep.blocks.map(block => <BlockPreview key={block.id} block={block} />)}
                </div>
                {s.sideImage.enabled && s.sideImage.position === 'right' && s.sideImage.src && previewDevice !== 'mobile' && (
                  <div style={{ flex: 1, flexBasis: 0, minWidth: 0 }} className="overflow-hidden">
                    <img src={s.sideImage.src} className="w-full h-full object-cover" alt="" />
                  </div>
                )}
              </div>
            </div>
          </div>
          <style>{`
            @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes slideUp { from { opacity: 0; transform: translateY(30px) } to { opacity: 1; transform: translateY(0) } }
          `}</style>
        </div>
      )}

      {/* Media Library Modal */}
      {showMediaLibrary && (
        <MediaLibraryModal
          onSelect={(url) => { mediaCallbackRef.current?.(url); mediaCallbackRef.current = null }}
          onClose={() => { setShowMediaLibrary(false); mediaCallbackRef.current = null }}
        />
      )}
    </div>
  )
}
