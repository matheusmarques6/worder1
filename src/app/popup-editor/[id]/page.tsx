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
    width: number; backgroundColor: string; borderRadius: number; padding: number; fontFamily: string
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
    width: 420, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 32, fontFamily: 'Inter, sans-serif',
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
}

// ── Small helpers ──────────────────────────────────────────────────────────────
function Section({ title, children, defaultOpen = false, noPadding = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean; noPadding?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full px-4 py-3.5 text-[13px] font-semibold text-gray-900 hover:bg-gray-50 transition-colors">
        <span>{title}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className={noPadding ? 'pb-3' : 'px-4 pb-4 space-y-3'}>{children}</div>}
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

// ── Block Renderer (canvas) ────────────────────────────────────────────────────
function BlockPreview({ block }: { block: Block }) {
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
    case 'text': return <div
      style={{ ...blockStyle, fontSize: p.fontSize || 16, color: p.color || '#111827', fontWeight: p.fontWeight || 'normal', fontStyle: p.fontStyle || 'normal', textDecoration: p.textDecoration || 'none', textAlign: p.align || 'left', lineHeight: p.lineHeight || 1.4, fontFamily: p.fontFamily || 'inherit', minHeight: '1em' }}>{p.content}</div>
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
    case 'button':
      return <div style={{ ...blockStyle, textAlign: p.fullWidth ? undefined : (p.align || 'center') as any }}>
        <button
          onMouseEnter={e => { if (p.hoverColor) (e.currentTarget as HTMLButtonElement).style.backgroundColor = p.hoverColor }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = p.bgColor || '#F97316' }}
          style={{
            backgroundColor: p.bgColor || '#F97316', color: p.textColor || '#fff',
            borderRadius: p.borderRadius || 8, width: p.fullWidth ? '100%' : 'auto',
            fontSize: p.fontSize || 15, fontWeight: 700,
            padding: `${p.paddingV || 14}px ${p.paddingH || 28}px`,
            border: p.btnBorderWidth ? `${p.btnBorderWidth}px solid ${p.btnBorderColor || '#E5E7EB'}` : 'none',
            cursor: 'pointer', transition: 'background-color 0.2s',
          }}>{p.text || 'Enviar'}</button>
      </div>
    case 'image': {
      const imgEl = p.src
        ? <img src={p.src} alt={p.alt || ''} style={{ width: `${p.imgWidth || 100}%`, maxHeight: p.maxHeight || 300, objectFit: 'contain', borderRadius: p.borderRadius || 0, display: 'inline-block' }} />
        : <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center text-gray-300"><ImageIcon className="w-10 h-10" /></div>
      return <div style={{ ...blockStyle, textAlign: (p.align || 'center') as any, padding: p.padding || 0 }}>
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

// ── Block Props Editor (Omnisend-style per-block panels) ──────────────────────
function BlockEditor({ block, onChange, onDelete, onOpenMedia, onApplyToAllInputs }: { block: Block; onChange: (b: Block) => void; onDelete: () => void; onOpenMedia?: (cb: (url: string) => void) => void; onApplyToAllInputs?: (b: Block) => void }) {
  const up = (key: string, val: any) => onChange({ ...block, props: { ...block.props, [key]: val } })
  const p = block.props
  const [tab, setTab] = useState<'props' | 'fields' | 'layout'>('props')
  const isInputBlock = ['email', 'phone', 'name-input', 'text-input', 'date-input'].includes(block.type)

  const blockLabel: Record<string, string> = {
    email: 'Email', phone: 'Telefone', 'name-input': 'Nome', 'text-input': 'Campo',
    'date-input': 'Data', dropdown: 'Dropdown', radio: 'Radio', checkbox: 'Checkbox',
    'legal-consent': 'Consentimento', text: 'Texto', button: 'Botão', image: 'Imagem',
    spacer: 'Espaçador', line: 'Linha', coupon: 'Cupom', countdown: 'Contagem',
  }

  const AlignButtons = ({ value, onChange: oc }: { value: string; onChange: (v: string) => void }) => (
    <div className="flex border border-gray-200 rounded-lg overflow-hidden">
      {['left', 'center', 'right', 'full'].map(a => (
        <button key={a} onClick={() => oc(a === 'full' ? 'full' : a)}
          className={`flex-1 py-1.5 text-xs font-medium ${value === a ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
          {a === 'left' ? 'Esq' : a === 'center' ? 'Centro' : a === 'right' ? 'Dir' : 'Total'}
        </button>
      ))}
    </div>
  )

  const ColorField = ({ label, value, onChange: oc }: { label: string; value: string; onChange: (v: string) => void }) => (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="text" className={inp} value={value || ''} onChange={e => oc(e.target.value)} placeholder="#000000" />
        <input type="color" value={value || '#000000'} onChange={e => oc(e.target.value)} className="w-8 h-8 rounded border border-gray-200 p-0.5 cursor-pointer flex-shrink-0" />
      </div>
    </Field>
  )

  const Toggle = ({ label, checked, onChange: oc }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center justify-between gap-3 cursor-pointer py-0.5 w-full">
      <span className="text-[13px] text-gray-800">{label}</span>
      <div className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-emerald-500' : 'bg-gray-200'}`} onClick={() => oc(!checked)}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </label>
  )

  // Labeled field with helper text below — Klaviyo style
  const LabeledField = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-[12px] font-medium text-gray-800">{label}</label>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5 mb-1.5 leading-snug">{hint}</p>}
      <div className={hint ? '' : 'mt-1'}>{children}</div>
    </div>
  )

  // Collapsible section with title (plus/chevron icon) — Klaviyo style
  const Group = ({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) => {
    const [open, setOpen] = useState(defaultOpen)
    return (
      <div className="border-t border-gray-100 first:border-t-0">
        <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full py-3 text-[13px] font-semibold text-gray-800 hover:text-gray-900">
          <span>{title}</span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
        {open && <div className="pb-4 space-y-3">{children}</div>}
      </div>
    )
  }

  // Klaviyo-style clean color field (hex input with color square on right)
  const CleanColor = ({ label, value, onChange: oc }: { label: string; value: string; onChange: (v: string) => void }) => (
    <LabeledField label={label}>
      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500/20">
        <input type="text" className="flex-1 px-3 py-2 text-[13px] font-mono text-gray-800 outline-none" value={value || ''} onChange={e => oc(e.target.value)} placeholder="#000000" />
        <label className="relative w-9 h-9 border-l border-gray-200 cursor-pointer flex items-center justify-center flex-shrink-0" style={{ backgroundColor: value || '#FFFFFF' }}>
          <input type="color" value={value || '#000000'} onChange={e => oc(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
      </div>
    </LabeledField>
  )

  // 4-side padding control (compact top/right/bottom/left grid)
  const PaddingControl = ({ prefix, defaults }: { prefix: 'padding' | 'inputPad'; defaults?: { t?: number; r?: number; b?: number; l?: number } }) => {
    const keyT = prefix === 'padding' ? 'paddingTop' : 'inputPadTop'
    const keyR = prefix === 'padding' ? 'paddingRight' : 'inputPadRight'
    const keyB = prefix === 'padding' ? 'paddingBottom' : 'inputPadBottom'
    const keyL = prefix === 'padding' ? 'paddingLeft' : 'inputPadLeft'
    const d = defaults || {}
    const Num = ({ k, def }: { k: string; def: number }) => (
      <div className="relative">
        <input type="number" min={0} max={80}
          className="w-full px-2 py-1.5 pr-6 border border-gray-200 rounded-md text-[12px] text-gray-800 text-center outline-none focus:border-brand-500"
          value={p[k] ?? def} onChange={e => up(k, +e.target.value)} />
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">px</span>
      </div>
    )
    return (
      <div className="grid grid-cols-3 gap-1.5 max-w-[220px] mx-auto">
        <div />
        <Num k={keyT} def={d.t ?? 0} />
        <div />
        <Num k={keyL} def={d.l ?? 0} />
        <div className="flex items-center justify-center">
          <div className="w-6 h-6 rounded-sm bg-gray-100 border border-gray-200" />
        </div>
        <Num k={keyR} def={d.r ?? 0} />
        <div />
        <Num k={keyB} def={d.b ?? 0} />
        <div />
      </div>
    )
  }

  // Unified input "Input" tab renderer (Klaviyo-style clean layout)
  const renderInputConfig = () => {
    // Lock email/phone mapping since the type implies the target
    const lockedMap = block.type === 'email' ? 'email' : block.type === 'phone' ? 'phone' : null
    return (
      <div className="space-y-4">
        {/* Conteudo section */}
        <div className="space-y-3">
          <p className="text-[13px] font-semibold text-gray-900">Conteudo</p>

          <LabeledField label="Campo do perfil" hint="Onde o valor deste campo sera salvo no perfil do contato.">
            <select className={sel} value={lockedMap || p.mapTo || ''} disabled={!!lockedMap} onChange={e => up('mapTo', e.target.value)}>
              <option value="">Nao mapear</option>
              {PROFILE_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </LabeledField>

          {(p.mapTo === 'custom' && !lockedMap) && (
            <LabeledField label="Nome do campo personalizado" hint="Identificador tecnico salvo em custom_fields.">
              <input className={inp} value={p.mapToCustom || ''} onChange={e => up('mapToCustom', e.target.value)} placeholder="ex: favoriteColor" />
            </LabeledField>
          )}

          <LabeledField label="Placeholder">
            <input className={inp} value={p.placeholder || ''} onChange={e => up('placeholder', e.target.value)} placeholder="Texto exibido quando vazio" />
          </LabeledField>

          {block.type === 'phone' && (
            <LabeledField label="Pais padrao">
              <select className={sel} value={p.countryCode || '+55'} onChange={e => up('countryCode', e.target.value)}>
                <option value="+55">Brasil (+55)</option>
                <option value="+1">EUA (+1)</option>
                <option value="+351">Portugal (+351)</option>
                <option value="+44">Reino Unido (+44)</option>
                <option value="+34">Espanha (+34)</option>
                <option value="+49">Alemanha (+49)</option>
                <option value="+33">Franca (+33)</option>
              </select>
            </LabeledField>
          )}

          <div className="pt-1"><Toggle label="Mostrar label no formulario" checked={p.showLabel || false} onChange={v => up('showLabel', v)} /></div>
          {p.showLabel && (
            <LabeledField label="Texto do label">
              <input className={inp} value={p.label || ''} onChange={e => up('label', e.target.value)} />
            </LabeledField>
          )}
        </div>

        {/* Validacao section */}
        <div className="pt-4 border-t border-gray-100 space-y-3">
          <p className="text-[13px] font-semibold text-gray-900">Validacao</p>

          <Toggle label="Campo obrigatorio" checked={block.type === 'email' ? true : !!p.required} onChange={v => up('required', v)} />
          {p.required && (
            <LabeledField label="Mensagem quando vazio" hint="Exibida quando o usuario nao preenche o campo.">
              <input className={inp} value={p.requiredMsg || 'Este campo e obrigatorio'} onChange={e => up('requiredMsg', e.target.value)} />
            </LabeledField>
          )}
          {(block.type === 'email' || block.type === 'phone') && (
            <LabeledField label="Mensagem quando invalido" hint="Exibida quando o formato nao corresponde ao esperado.">
              <input className={inp} value={p.errorMsg || (block.type === 'email' ? 'Email invalido' : 'Telefone invalido')} onChange={e => up('errorMsg', e.target.value)} />
            </LabeledField>
          )}
        </div>

        {/* Layout section */}
        <div className="pt-4 border-t border-gray-100 space-y-3">
          <p className="text-[13px] font-semibold text-gray-900">Layout do bloco</p>
          <LabeledField label="Alinhamento">
            <AlignButtons value={p.align || 'full'} onChange={v => up('align', v)} />
          </LabeledField>

          <Group title="Espacamento externo" defaultOpen={false}>
            <PaddingControl prefix="padding" defaults={{ b: 8 }} />
          </Group>
        </div>
      </div>
    )
  }

  // Unified "Fields" tab renderer (Klaviyo-style grouped sections)
  const renderInputFields = () => {
    const CornerBtn = ({ value, label }: { value: string; label: string }) => (
      <button onClick={() => up('corners', value)}
        className={`flex-1 py-2 text-[11px] font-medium transition-colors ${p.corners === value ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
        {label}
      </button>
    )
    const handleApplyToAll = () => {
      if (!onApplyToAllInputs) return
      if (confirm('Aplicar estes estilos a TODOS os campos de input do popup?')) {
        onApplyToAllInputs(block)
      }
    }
    return (
      <div>
        {onApplyToAllInputs && (
          <button onClick={handleApplyToAll}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg transition-colors mb-4">
            Aplicar estes estilos a todos os inputs
          </button>
        )}

        <Group title="Estilo" defaultOpen={true}>
          <LabeledField label="Tipo de borda">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => up('inputStyle', 'solid')}
                className={`py-3 rounded-lg border-2 transition-colors ${p.inputStyle !== 'underline' ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="w-12 h-4 mx-auto rounded border border-gray-700" />
              </button>
              <button onClick={() => up('inputStyle', 'underline')}
                className={`py-3 rounded-lg border-2 transition-colors ${p.inputStyle === 'underline' ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="w-12 h-4 mx-auto border-b-2 border-dashed border-gray-700" />
              </button>
            </div>
          </LabeledField>

          {p.inputStyle !== 'underline' && (
            <LabeledField label="Cantos">
              <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                <CornerBtn value="none" label="Reto" />
                <CornerBtn value="small" label="Peq" />
                <CornerBtn value="medium" label="Med" />
                <CornerBtn value="large" label="Grd" />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input type="number" className="flex-1 px-2 py-1.5 border border-gray-200 rounded-md text-[12px] outline-none focus:border-brand-500"
                  value={p.cornerRadius ?? 8} onChange={e => { up('cornerRadius', +e.target.value); up('corners', 'custom') }} min={0} max={50} placeholder="Personalizado" />
                <span className="text-[11px] text-gray-400">px</span>
              </div>
            </LabeledField>
          )}
        </Group>

        <Group title="Cores" defaultOpen={true}>
          <CleanColor label="Cor de fundo" value={p.backgroundColor || '#FFFFFF'} onChange={v => up('backgroundColor', v)} />
          <CleanColor label="Cor do texto" value={p.textColor || '#111827'} onChange={v => up('textColor', v)} />
          <CleanColor label="Cor do placeholder" value={p.placeholderColor || '#9CA3AF'} onChange={v => up('placeholderColor', v)} />
          <CleanColor label="Cor do label" value={p.labelColor || '#374151'} onChange={v => up('labelColor', v)} />
          <CleanColor label="Cor de erro" value={p.errorColor || '#EF4444'} onChange={v => up('errorColor', v)} />
        </Group>

        <Group title="Tipografia" defaultOpen={false}>
          <div className="grid grid-cols-[1fr_70px] gap-2">
            <LabeledField label="Fonte">
              <select className={sel} value={p.fontFamily || 'inherit'} onChange={e => up('fontFamily', e.target.value)}>
                <option value="inherit">Padrao</option>
                <option value="Arial, sans-serif">Arial</option>
                <option value="'Helvetica Neue', sans-serif">Helvetica</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="'Times New Roman', serif">Times</option>
                <option value="'Inter', sans-serif">Inter</option>
                <option value="'Montserrat', sans-serif">Montserrat</option>
                <option value="'Poppins', sans-serif">Poppins</option>
                <option value="'Roboto', sans-serif">Roboto</option>
                <option value="'Open Sans', sans-serif">Open Sans</option>
              </select>
            </LabeledField>
            <LabeledField label="Tamanho">
              <input type="number" className={inp} value={p.fontSize || 14} onChange={e => up('fontSize', +e.target.value)} min={10} max={32} />
            </LabeledField>
          </div>

          <LabeledField label="Decoracao">
            <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1 w-fit">
              <button onClick={() => up('bold', !p.bold)} className={`px-3 py-1 text-sm font-bold rounded ${p.bold ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'}`}>B</button>
              <button onClick={() => up('italic', !p.italic)} className={`px-3 py-1 text-sm italic rounded ${p.italic ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'}`}>I</button>
              <button onClick={() => up('underline', !p.underline)} className={`px-3 py-1 text-sm underline rounded ${p.underline ? 'bg-gray-900 text-white' : 'hover:bg-gray-100'}`}>U</button>
            </div>
          </LabeledField>

          <LabeledField label="Alinhamento do texto">
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              {['left', 'center', 'right'].map(a => (
                <button key={a} onClick={() => up('textAlign', a)}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors ${p.textAlign === a ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {a === 'left' ? 'Esq' : a === 'center' ? 'Centro' : 'Dir'}
                </button>
              ))}
            </div>
          </LabeledField>
        </Group>

        <Group title="Borda" defaultOpen={false}>
          <div className="grid grid-cols-2 gap-2">
            <LabeledField label="Largura">
              <div className="relative">
                <input type="number" className={inp + ' pr-7'} value={p.borderWidth ?? 1} onChange={e => up('borderWidth', +e.target.value)} min={0} max={10} />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">px</span>
              </div>
            </LabeledField>
            <LabeledField label="Estilo">
              <select className={sel} value={p.borderStyle || 'solid'} onChange={e => up('borderStyle', e.target.value)}>
                <option value="solid">Solido</option>
                <option value="dashed">Tracejado</option>
                <option value="dotted">Pontilhado</option>
              </select>
            </LabeledField>
          </div>
          <CleanColor label="Cor da borda" value={p.borderColor || '#E5E7EB'} onChange={v => up('borderColor', v)} />
        </Group>

        <Group title="Espacamento interno" defaultOpen={false}>
          <PaddingControl prefix="inputPad" defaults={{ t: 12, r: 16, b: 12, l: 16 }} />
        </Group>
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
        return <>
          <Field label="Estilo do texto">
            <select className={sel} value={p.tag || 'p'} onChange={e => up('tag', e.target.value)}>
              <option value="h1">Título 1</option><option value="h2">Título 2</option><option value="h3">Título 3</option><option value="p">Parágrafo</option>
            </select>
          </Field>
          <Field label="Conteúdo"><textarea className={inp} rows={3} value={p.content || ''} onChange={e => up('content', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Fonte">
              <select className={sel} value={p.fontFamily || 'inherit'} onChange={e => up('fontFamily', e.target.value)}>
                <option value="inherit">Padrão</option><option value="Georgia, serif">Georgia</option><option value="Arial, sans-serif">Arial</option><option value="'Inter', sans-serif">Inter</option>
              </select>
            </Field>
            <Field label="Tamanho"><input type="number" className={inp} value={p.fontSize || 16} onChange={e => up('fontSize', +e.target.value)} /></Field>
          </div>
          <Field label="Altura da linha">
            <select className={sel} value={String(p.lineHeight || 1.5)} onChange={e => up('lineHeight', +e.target.value)}>
              <option value="1">1.0</option><option value="1.2">1.2</option><option value="1.5">1.5</option><option value="1.8">1.8</option><option value="2">2.0</option>
            </select>
          </Field>
          <ColorField label="Cor do texto" value={p.color || '#111827'} onChange={v => up('color', v)} />
          <ColorField label="Cor do link" value={p.linkColor || '#0094EB'} onChange={v => up('linkColor', v)} />
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1">
            {[{ v: 'bold', l: 'B', s: 'font-bold' }, { v: 'italic', l: 'I', s: 'italic' }, { v: 'underline', l: 'U', s: 'underline' }].map(f => (
              <button key={f.v} onClick={() => up(f.v === 'bold' ? 'fontWeight' : f.v === 'italic' ? 'fontStyle' : 'textDecoration',
                p[f.v === 'bold' ? 'fontWeight' : f.v === 'italic' ? 'fontStyle' : 'textDecoration'] === f.v ? 'normal' : f.v)}
                className={`px-2.5 py-1 text-sm rounded ${f.s} ${(p.fontWeight === 'bold' && f.v === 'bold') || (p.fontStyle === 'italic' && f.v === 'italic') || (p.textDecoration === 'underline' && f.v === 'underline') ? 'bg-gray-200' : 'hover:bg-gray-100'}`}>
                {f.l}
              </button>
            ))}
          </div>
          <Field label="Alinhamento"><AlignButtons value={p.align || 'left'} onChange={v => up('align', v)} /></Field>
        </>

      case 'button':
        return <>
          <Field label="Acao do botao">
            <select className={sel} value={p.action || 'submit'} onChange={e => up('action', e.target.value)}>
              <option value="submit">Enviar formulario</option><option value="url">Abrir link</option><option value="next-step">Proxima etapa</option><option value="close">Fechar popup</option>
            </select>
          </Field>
          {p.action === 'url' && <Field label="URL"><input className={inp} value={p.url || ''} onChange={e => up('url', e.target.value)} placeholder="https://" /></Field>}
          <Field label="Texto do botao"><input className={inp} value={p.text || ''} onChange={e => up('text', e.target.value)} /></Field>

          <PanelColorField label="Cor de fundo" value={p.bgColor || '#F97316'} onChange={v => up('bgColor', v)} />
          <PanelColorField label="Cor do texto" value={p.textColor || '#FFFFFF'} onChange={v => up('textColor', v)} />
          <PanelColorField label="Cor ao passar o mouse" value={p.hoverColor || ''} onChange={v => up('hoverColor', v)} />

          <div className="grid grid-cols-2 gap-2">
            <Field label="Tamanho fonte"><input type="number" className={inp} value={p.fontSize || 15} onChange={e => up('fontSize', +e.target.value)} min={10} max={30} /></Field>
            <Field label="Raio borda"><input type="number" className={inp} value={p.borderRadius || 8} onChange={e => up('borderRadius', +e.target.value)} min={0} max={50} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Padding vertical"><input type="number" className={inp} value={p.paddingV || 14} onChange={e => up('paddingV', +e.target.value)} min={4} max={40} /></Field>
            <Field label="Padding horizontal"><input type="number" className={inp} value={p.paddingH || 28} onChange={e => up('paddingH', +e.target.value)} min={4} max={60} /></Field>
          </div>
          <Field label="Alinhamento"><AlignButtons value={p.fullWidth ? 'full' : (p.align || 'full')} onChange={v => { up('fullWidth', v === 'full'); if (v !== 'full') up('align', v) }} /></Field>

          <div className="pt-2 border-t border-gray-100">
            <p className="text-[12px] font-medium text-gray-700 mb-2">Borda do botao</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Largura"><input type="number" className={inp} value={p.btnBorderWidth ?? 0} onChange={e => up('btnBorderWidth', +e.target.value)} min={0} max={5} /></Field>
              <PanelColorField label="Cor" value={p.btnBorderColor || '#E5E7EB'} onChange={v => up('btnBorderColor', v)} />
            </div>
          </div>
        </>

      case 'image':
        return <>
          <p className="text-xs text-gray-400">JPG, PNG e GIF. Máximo 2000px.</p>
          {p.src ? (
            <div className="space-y-2">
              <img src={p.src} alt="" className="w-full h-24 object-contain bg-gray-50 rounded-lg border" />
              <div className="flex gap-2">
                <button onClick={() => onOpenMedia?.(url => up('src', url))}
                  className="flex-1 py-1.5 text-xs font-medium text-center text-gray-700 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  Trocar
                </button>
                <button onClick={() => up('src', '')} className="flex-1 py-1.5 text-xs font-medium text-red-600 bg-white border border-gray-200 rounded-lg hover:bg-red-50">Remover</button>
              </div>
            </div>
          ) : (
            <button onClick={() => onOpenMedia?.(url => up('src', url))}
              className="w-full border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-brand-400">
              <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <span className="text-xs text-gray-500">Clique para escolher imagem</span>
            </button>
          )}
          <Field label="URL da imagem"><input className={inp} value={p.src || ''} onChange={e => up('src', e.target.value)} placeholder="https://" /></Field>
          <Field label="Texto alternativo"><input className={inp} value={p.alt || ''} onChange={e => up('alt', e.target.value)} placeholder="Descreva a imagem" /></Field>
          <Field label="Link"><input className={inp} value={p.href || ''} onChange={e => up('href', e.target.value)} placeholder="https://" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Largura">
              <div className="flex items-center gap-1">
                <input type="number" className={inp} value={p.imgWidth ?? 100} onChange={e => up('imgWidth', +e.target.value)} min={10} max={100} />
                <span className="text-xs text-gray-400 flex-shrink-0">%</span>
              </div>
            </Field>
            <Field label="Altura máx">
              <div className="flex items-center gap-1">
                <input type="number" className={inp} value={p.maxHeight ?? 300} onChange={e => up('maxHeight', +e.target.value)} min={50} max={800} />
                <span className="text-xs text-gray-400 flex-shrink-0">px</span>
              </div>
            </Field>
          </div>
          <Field label="Raio da borda"><input type="number" className={inp} value={p.borderRadius ?? 0} onChange={e => up('borderRadius', +e.target.value)} min={0} max={50} /></Field>
          <Field label="Alinhamento"><AlignButtons value={p.align || 'center'} onChange={v => up('align', v)} /></Field>
          <Field label="Padding (px)"><input type="number" className={inp} value={p.padding ?? 0} onChange={e => up('padding', +e.target.value)} /></Field>
        </>

      case '__unused__':
        return <>
          {/* Input blocks handled above via renderInputConfig */}
        </>

      case 'dropdown': case 'radio': case 'checkbox':
        return <>
          <Field label="Campo do perfil" hint="Onde salvar a resposta no contato.">
            <select className={sel} value={p.mapTo || 'custom'} onChange={e => up('mapTo', e.target.value)}>
              <option value="custom">Campo personalizado</option>
              {PROFILE_FIELDS.filter(f => f.value !== 'custom').map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
          {p.mapTo === 'custom' && (
            <Field label="Nome do campo"><input className={inp} value={p.mapToCustom || p.label || ''} onChange={e => up('mapToCustom', e.target.value)} placeholder="ex: preferencia" /></Field>
          )}
          {block.type === 'dropdown' && (
            <Field label="Placeholder"><input className={inp} value={p.placeholder || ''} onChange={e => up('placeholder', e.target.value)} placeholder="Escolha uma opcao..." /></Field>
          )}
          <Field label="Label"><input className={inp} value={p.label || ''} onChange={e => up('label', e.target.value)} /></Field>
          <ToggleRow label="Mostrar label" checked={p.showLabel !== false} onChange={v => up('showLabel', v)} />
          <Field label="Opcoes" hint="Uma opcao por linha. Arraste para reordenar.">
            <div className="space-y-1">
              {(p.options || []).map((opt: string, i: number) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-gray-300 w-4 text-center flex-shrink-0">{i + 1}</span>
                  <input className={inp + ' flex-1'} value={opt} onChange={e => {
                    const next = [...(p.options || [])]; next[i] = e.target.value; up('options', next)
                  }} />
                  <button onClick={() => { const next = [...(p.options || [])]; if (i > 0) { [next[i-1], next[i]] = [next[i], next[i-1]]; up('options', next) } }}
                    className="p-1 text-gray-300 hover:text-gray-600" title="Mover para cima">
                    <ChevronDown className="w-3 h-3 rotate-180" />
                  </button>
                  <button onClick={() => up('options', (p.options || []).filter((_: any, j: number) => j !== i))}
                    className="p-1 text-gray-300 hover:text-red-500" title="Remover">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <button onClick={() => up('options', [...(p.options || []), `Opcao ${(p.options || []).length + 1}`])}
                className="w-full py-1.5 text-[11px] font-medium text-brand-600 border border-dashed border-brand-300 rounded-lg hover:bg-brand-50">
                + Adicionar opcao
              </button>
            </div>
          </Field>
          <ToggleRow label="Campo obrigatorio" checked={p.required || false} onChange={v => up('required', v)} />
          {block.type === 'radio' && <Field label="Direcao">
            <select className={sel} value={p.layout || 'vertical'} onChange={e => up('layout', e.target.value)}>
              <option value="vertical">Vertical</option><option value="horizontal">Horizontal</option>
            </select>
          </Field>}
        </>

      case 'legal-consent':
        return <>
          <Field label="Texto de consentimento" hint="Suporta HTML basico. Use &lt;a href=&quot;url&quot;&gt;link&lt;/a&gt; para links.">
            <textarea className={inp} rows={4} value={p.text || ''} onChange={e => up('text', e.target.value)}
              placeholder='Aceito receber comunicacoes e concordo com a <a href="/politica">politica de privacidade</a>.' />
          </Field>
          <ToggleRow label="Obrigatorio" checked={p.required !== false} onChange={v => up('required', v)} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tamanho fonte"><input type="number" className={inp} value={p.fontSize || 12} onChange={e => up('fontSize', +e.target.value)} min={10} max={18} /></Field>
            <Field label="Altura linha">
              <select className={sel} value={String(p.lineHeight || 1.4)} onChange={e => up('lineHeight', +e.target.value)}>
                <option value="1.2">1.2</option><option value="1.4">1.4</option><option value="1.6">1.6</option><option value="1.8">1.8</option>
              </select>
            </Field>
          </div>
          <PanelColorField label="Cor do texto" value={p.color || '#6B7280'} onChange={v => up('color', v)} />
          <PanelColorField label="Cor dos links" value={p.linkColor || '#F97316'} onChange={v => up('linkColor', v)} />
        </>

      case 'coupon':
        return <>
          <Field label="Codigo do cupom"><input className={inp} value={p.code || ''} onChange={e => up('code', e.target.value)} /></Field>
          <Field label="Descricao"><input className={inp} value={p.description || ''} onChange={e => up('description', e.target.value)} /></Field>
          <PanelColorField label="Cor do fundo" value={p.bgColor || '#FFF7ED'} onChange={v => up('bgColor', v)} />
          <PanelColorField label="Cor da borda" value={p.borderColor || '#F97316'} onChange={v => up('borderColor', v)} />
          <PanelColorField label="Cor do codigo" value={p.codeColor || '#F97316'} onChange={v => up('codeColor', v)} />
          <Field label="Tamanho fonte"><input type="number" className={inp} value={p.fontSize || 20} onChange={e => up('fontSize', +e.target.value)} min={14} max={36} /></Field>
          <Field label="Raio borda"><input type="number" className={inp} value={p.borderRadius ?? 8} onChange={e => up('borderRadius', +e.target.value)} min={0} max={20} /></Field>
        </>

      case 'spacer':
        return <Field label={`Altura: ${p.height || 16}px`}>
          <input type="range" min={4} max={120} value={p.height || 16} onChange={e => up('height', +e.target.value)} className="w-full accent-brand-500" />
        </Field>

      case 'line':
        return <>
          <ColorField label="Cor" value={p.color || '#E5E7EB'} onChange={v => up('color', v)} />
          <Field label="Espessura"><input type="number" className={inp} value={p.thickness || 1} onChange={e => up('thickness', +e.target.value)} min={1} max={5} /></Field>
          <Field label="Estilo">
            <select className={sel} value={p.style || 'solid'} onChange={e => up('style', e.target.value)}>
              <option value="solid">Sólido</option><option value="dashed">Tracejado</option><option value="dotted">Pontilhado</option>
            </select>
          </Field>
        </>

      case 'countdown':
        return <>
          <Field label="Data de término"><input type="datetime-local" className={inp} value={p.endDate || ''} onChange={e => up('endDate', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Cor números" value={p.numberColor || '#FFFFFF'} onChange={v => up('numberColor', v)} />
            <ColorField label="Cor labels" value={p.labelColor || '#9CA3AF'} onChange={v => up('labelColor', v)} />
          </div>
          <ColorField label="Cor fundo" value={p.boxColor || '#1F2937'} onChange={v => up('boxColor', v)} />
          <Field label="Tamanho números"><input type="number" className={inp} value={p.fontSize || 28} onChange={e => up('fontSize', +e.target.value)} min={16} max={48} /></Field>
          <div className="grid grid-cols-4 gap-1">
            {['days', 'hours', 'minutes', 'seconds'].map(k => (
              <Field key={k} label={k === 'days' ? 'Dias' : k === 'hours' ? 'Horas' : k === 'minutes' ? 'Min' : 'Seg'}>
                <input className={inp} value={(p.labels || {})[k] || ''} onChange={e => up('labels', { ...(p.labels || {}), [k]: e.target.value })} />
              </Field>
            ))}
          </div>
        </>

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

          <button onClick={onDelete} className="w-full py-2.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 mt-2 flex items-center justify-center gap-2">
            <Trash2 className="w-4 h-4" /> Remover bloco
          </button>
        </div>
      )}
    </div>
  )
}

// ── Behavior Panel ─────────────────────────────────────────────────────────────
function BehaviorPanel({ beh, onChange, formId }: { beh: PopupDesign['behavior']; onChange: (b: PopupDesign['behavior']) => void; formId: string }) {
  const [tab, setTab] = useState<'display' | 'targeting'>('display')
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
      {/* Sub-tabs: Display | Targeting */}
      <div className="flex border-b border-gray-200">
        <button onClick={() => setTab('display')} className={`flex-1 py-3 text-[12px] font-semibold transition-colors ${tab === 'display' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
          Exibicao
        </button>
        <button onClick={() => setTab('targeting')} className={`flex-1 py-3 text-[12px] font-semibold transition-colors ${tab === 'targeting' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
          Segmentacao
        </button>
      </div>

      {tab === 'display' ? (
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
          <Field label="Borda"><div className="relative"><input type="number" className={inp + ' pr-8'} value={s.borderRadius} onChange={e => setS({ borderRadius: +e.target.value })} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">px</span></div></Field>
        </div>
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

      <Section title="Cores">
        <PanelColorField label="Cor de fundo do popup" value={s.backgroundColor} onChange={v => setS({ backgroundColor: v })} />

        <div className="pt-2 border-t border-gray-100">
          <ToggleRow label="Exibir overlay de fundo" checked={s.overlay.enabled} onChange={v => setOv({ enabled: v })} hint="Fundo escurecido atras do popup" />
          {s.overlay.enabled && (
            <div className="space-y-3 mt-3">
              <PanelColorField label="Cor do overlay" value={s.overlay.color} onChange={v => setOv({ color: v })} />
              <Field label={`Opacidade: ${s.overlay.opacity}%`}>
                <input type="range" min={0} max={100} value={s.overlay.opacity} onChange={e => setOv({ opacity: +e.target.value })} className="w-full accent-brand-500" />
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
            <Field label={`Largura: ${s.sideImage.width}px`}>
              <input type="range" min={100} max={600} value={s.sideImage.width} onChange={e => setSi({ width: +e.target.value })} className="w-full accent-brand-500" />
            </Field>
          </div>
        )}
      </Section>

      <Section title="Botao fechar">
        <ToggleRow label="Mostrar botao fechar" checked={s.closeButton.show} onChange={v => setCb({ show: v })} />
        {s.closeButton.show && (
          <div className="mt-3 space-y-3">
            <PanelColorField label="Cor" value={s.closeButton.color} onChange={v => setCb({ color: v })} />
            <Field label={`Tamanho: ${s.closeButton.size || 24}px`}>
              <input type="range" min={16} max={48} value={s.closeButton.size || 24} onChange={e => setCb({ size: +e.target.value })} className="w-full accent-brand-500" />
            </Field>
          </div>
        )}
      </Section>
    </div>
  )
}

// ── Sortable Block Wrapper ────────────────────────────────────────────────────
function SortablePopupBlock({ block, isSelected, onSelect, onDelete, onDuplicate }: {
  block: Block; isSelected: boolean; onSelect: () => void; onDelete: () => void; onDuplicate: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      onClick={e => { e.stopPropagation(); onSelect() }}
      className={`group relative rounded-md cursor-pointer transition ${isSelected ? 'ring-2 ring-orange-400 ring-offset-1' : 'hover:ring-1 hover:ring-gray-300'}`}>
      <div {...attributes} {...listeners} className="absolute -left-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5 text-gray-300 hover:text-gray-500 z-10">
        <GripVertical className="w-3.5 h-3.5" />
      </div>
      <BlockPreview block={block} />
      <div className="absolute -top-2 right-2 hidden group-hover:flex items-center gap-0.5 bg-white border border-gray-200 rounded-md shadow-sm px-0.5 py-0.5 z-10">
        <button onClick={e => { e.stopPropagation(); onDuplicate() }} className="p-1 text-gray-400 hover:text-blue-500 rounded" title="Duplicar"><Plus className="w-3 h-3" /></button>
        <button onClick={e => { e.stopPropagation(); onDelete() }} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Remover"><Trash2 className="w-3 h-3" /></button>
      </div>
    </div>
  )
}

// ── Media Library Modal (uses shared component) ─────────────────────────────
import { MediaLibraryModal } from '@/components/shared/MediaLibraryModal'

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function PopupEditorPage() {
  const params = useParams()
  const router = useRouter()
  const formId = params.id as string

  const [design, setDesign] = useState<PopupDesign>(defaultDesign)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formStatus, setFormStatus] = useState<'draft' | 'published'>('draft')
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
        body: JSON.stringify({ design_json: design, form_type: design.formType, behavior: design.behavior, status: formStatus }),
      })
    } finally { setSaving(false) }
  }, [formId, design, formStatus])

  const handlePublish = useCallback(async () => {
    const newStatus = formStatus === 'published' ? 'draft' : 'published'
    setFormStatus(newStatus)
    await fetch(`/api/forms/${formId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, design_json: design, form_type: design.formType, behavior: design.behavior }),
    })
  }, [formId, design, formStatus])

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
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-md hover:bg-gray-100"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
          <div className="h-5 w-px bg-gray-200" />
          <span className="text-sm font-semibold text-gray-800">Editor de Popup</span>
          {formStatus === 'published' && <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 rounded-full">ATIVO</span>}
        </div>
        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <button onClick={undo} disabled={historyIdx <= 0} className="p-1.5 text-gray-400 hover:text-gray-700 rounded disabled:opacity-30" title="Desfazer"><Undo2 className="w-4 h-4" /></button>
          <button onClick={redo} disabled={historyIdx >= history.length - 1} className="p-1.5 text-gray-400 hover:text-gray-700 rounded disabled:opacity-30" title="Refazer"><Redo2 className="w-4 h-4" /></button>
          <div className="h-5 w-px bg-gray-200" />
          {/* Desktop/Mobile */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setPreview('desktop')} className={`p-1.5 rounded ${preview === 'desktop' ? 'bg-white shadow-sm' : ''}`}><Monitor className="w-4 h-4" /></button>
            <button onClick={() => setPreview('mobile')} className={`p-1.5 rounded ${preview === 'mobile' ? 'bg-white shadow-sm' : ''}`}><Smartphone className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPreview(true)} className="flex items-center gap-2 px-4 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Eye className="w-4 h-4" /> Preview
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
          </button>
          <button onClick={handlePublish} className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${formStatus === 'published' ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}>
            <Power className="w-4 h-4" /> {formStatus === 'published' ? 'Desativar' : 'Ativar'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — all controls (Klaviyo-style hub + drill-down panels) */}
        <aside className="w-[340px] bg-white border-r border-gray-200 flex flex-col shrink-0">
          {selectedBlock ? (
            <>
              {/* Header with back button */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
                <button onClick={() => setSelectedBlockId(null)}
                  className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-[13px] font-semibold text-gray-900 flex-1">
                  {(() => {
                    const labels: Record<string, string> = {
                      email: 'Email input', phone: 'Telefone', 'name-input': 'Nome',
                      'text-input': 'Campo de texto', 'date-input': 'Data',
                      dropdown: 'Dropdown', radio: 'Radio', checkbox: 'Checkbox',
                      'legal-consent': 'Consentimento', text: 'Texto', button: 'Botao', image: 'Imagem',
                      spacer: 'Espacador', line: 'Linha', coupon: 'Cupom', countdown: 'Contagem',
                    }
                    return labels[selectedBlock.type] || selectedBlock.type
                  })()}
                </h2>
                <button onClick={() => deleteBlock(selectedBlock.id)}
                  title="Excluir bloco"
                  className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <BlockEditor block={selectedBlock} onChange={updateBlock} onDelete={() => deleteBlock(selectedBlock.id)} onOpenMedia={openMediaLibrary} onApplyToAllInputs={applyStylesToAllInputs} />
              </div>
            </>
          ) : leftView === 'hub' ? (
            <>
              {/* Hub view: 3 big cards (Styles, Targeting, Blocks) */}
              <div className="flex items-center px-4 py-3.5 border-b border-gray-100 shrink-0">
                <h2 className="text-[14px] font-semibold text-gray-900">Visao geral</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                <button onClick={() => setLeftView('styles')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all text-left group">
                  <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <Palette className="w-4 h-4 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900">Estilos</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Layout, cores, imagem lateral</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                </button>

                <button onClick={() => setLeftView('targeting')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all text-left group">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Target className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900">Segmentacao e comportamento</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Quando e para quem exibir</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                </button>

                <button onClick={() => setLeftView('blocks')}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all text-left group">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <LayoutGrid className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-gray-900">Adicionar blocos</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Inputs, texto, botoes, imagens</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                </button>
              </div>
            </>
          ) : leftView === 'styles' ? (
            <>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
                <button onClick={() => setLeftView('hub')}
                  className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors">
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
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
                <button onClick={() => setLeftView('hub')}
                  className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-[13px] font-semibold text-gray-900 flex-1">Segmentacao e comportamento</h2>
              </div>
              <div className="flex-1 overflow-y-auto">
                <BehaviorPanel beh={design.behavior} onChange={b => setDesign(d => ({ ...d, behavior: b }))} formId={formId} />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 shrink-0">
                <button onClick={() => setLeftView('hub')}
                  className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-[13px] font-semibold text-gray-900 flex-1">Adicionar blocos</h2>
              </div>
              <div className="flex-1 overflow-y-auto">
                <p className="px-4 pt-4 pb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Blocos</p>
                <div className="grid grid-cols-2 gap-1.5 px-3 pb-4">
                  {BLOCK_TYPES.map(bt => (
                    <button key={bt.type} onClick={() => addBlock(bt.type)}
                      className="flex flex-col items-center gap-1 p-2.5 rounded-lg border border-gray-100 hover:border-brand-300 hover:bg-brand-50 transition text-gray-600 hover:text-brand-600 cursor-grab active:cursor-grabbing">
                      <bt.icon className="w-5 h-5" />
                      <span className="text-[11px] leading-tight">{bt.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </aside>

        {/* Center canvas */}
        <main className="flex-1 flex flex-col items-center overflow-y-auto" style={{ backgroundColor: 'rgba(0,0,0,0.15)' }}>
          <div className="flex-1 flex items-center justify-center w-full p-8">
            {/* Popup container */}
            <div className="relative flex overflow-hidden shadow-2xl" style={{
              width: preview === 'mobile' ? 360 : s.width + (s.sideImage.enabled && s.sideImage.src ? s.sideImage.width : 0),
              maxWidth: '95%',
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
                <div style={{ width: s.sideImage.width, flexShrink: 0 }} className="overflow-hidden">
                  <img src={s.sideImage.src} className="w-full h-full object-cover" alt="" />
                </div>
              )}
              {/* Popup body */}
              <div style={{
                backgroundColor: s.backgroundColor,
                paddingTop: s.paddingTop ?? s.padding ?? 32,
                paddingRight: s.paddingRight ?? s.padding ?? 32,
                paddingBottom: s.paddingBottom ?? s.padding ?? 32,
                paddingLeft: s.paddingLeft ?? s.padding ?? 32,
                fontFamily: s.fontFamily,
                flexGrow: 1,
                minHeight: 200,
              }} className="relative">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={activeStep.blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2 min-h-[100px]">
                      {activeStep.blocks.map(block => (
                        <SortablePopupBlock key={block.id} block={block} isSelected={selectedBlockId === block.id}
                          onSelect={() => setSelectedBlockId(block.id)}
                          onDelete={() => deleteBlock(block.id)}
                          onDuplicate={() => duplicateBlock(block.id)} />
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
                <div style={{ width: s.sideImage.width, flexShrink: 0 }} className="overflow-hidden">
                  <img src={s.sideImage.src} className="w-full h-full object-cover" alt="" />
                </div>
              )}
              {/* Side image placeholder (no src) */}
              {s.sideImage.enabled && !s.sideImage.src && !(preview === 'mobile') && (
                <div style={{ width: s.sideImage.width, flexShrink: 0, order: s.sideImage.position === 'left' ? -1 : 1 }}
                  className="bg-gray-100 flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <ImageIcon className="w-8 h-8 mx-auto mb-1" />
                    <p className="text-xs">Imagem lateral</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Step tabs - professional design */}
          <div className="flex items-center gap-2 px-6 py-3 bg-white border-t border-gray-200 w-full shrink-0">
            {design.steps.map((step, i) => (
              <div key={step.id} className="flex items-center gap-2">
                <button onClick={() => { setActiveStepIdx(i); setShowSuccess(false); setSelectedBlockId(null) }}
                  className={`px-4 py-2 text-sm rounded-lg font-medium whitespace-nowrap transition-colors ${!showSuccess && activeStepIdx === i ? 'bg-brand-500 text-white shadow-sm' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'}`}>
                  {step.name}
                </button>
                {i < design.steps.length - 1 && <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />}
              </div>
            ))}
            <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            <button onClick={() => { setShowSuccess(true); setSelectedBlockId(null) }}
              className={`px-4 py-2 text-sm rounded-lg font-medium whitespace-nowrap transition-colors ${showSuccess ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'}`}>
              Sucesso
            </button>
            <div className="flex-1" />
            <button onClick={addStep} className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors">
              <Plus className="w-3.5 h-3.5" /> Adicionar etapa
            </button>
            {design.steps.length > 1 && !showSuccess && (
              <button onClick={() => { setDesign(d => ({ ...d, steps: d.steps.filter((_, i) => i !== activeStepIdx) })); setActiveStepIdx(Math.max(0, activeStepIdx - 1)) }}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
            )}
          </div>
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
                width: previewDevice === 'mobile' ? 360 : s.width + (s.sideImage.enabled && s.sideImage.src ? s.sideImage.width : 0),
                maxWidth: '95%', borderRadius: s.borderRadius,
                animation: s.animation === 'fade' ? 'fadeIn 0.3s ease' : s.animation === 'slide-up' ? 'slideUp 0.3s ease' : undefined,
              }}>
                {s.closeButton.show && (
                  <button className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 flex items-center justify-center z-20">
                    <X style={{ color: s.closeButton.color || '#FFFFFF' }} className="w-4 h-4" />
                  </button>
                )}
                {s.sideImage.enabled && s.sideImage.position === 'left' && s.sideImage.src && previewDevice !== 'mobile' && (
                  <div style={{ width: s.sideImage.width, flexShrink: 0 }} className="overflow-hidden">
                    <img src={s.sideImage.src} className="w-full h-full object-cover" alt="" />
                  </div>
                )}
                <div style={{ backgroundColor: s.backgroundColor, paddingTop: s.paddingTop ?? s.padding ?? 32, paddingRight: s.paddingRight ?? s.padding ?? 32, paddingBottom: s.paddingBottom ?? s.padding ?? 32, paddingLeft: s.paddingLeft ?? s.padding ?? 32, fontFamily: s.fontFamily, flexGrow: 1, minHeight: 200 }}>
                  {activeStep.blocks.map(block => <BlockPreview key={block.id} block={block} />)}
                </div>
                {s.sideImage.enabled && s.sideImage.position === 'right' && s.sideImage.src && previewDevice !== 'mobile' && (
                  <div style={{ width: s.sideImage.width, flexShrink: 0 }} className="overflow-hidden">
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
