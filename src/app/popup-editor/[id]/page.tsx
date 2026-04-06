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
  GripHorizontal, Tag, Clock, Eye, Settings, Palette, Upload,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Block { id: string; type: string; props: Record<string, any> }
interface Step { id: string; name: string; blocks: Block[] }
interface PopupDesign {
  formType: 'popup' | 'flyout' | 'fullpage' | 'embed' | 'banner'
  steps: Step[]
  successStep: Step
  styles: {
    width: number; backgroundColor: string; borderRadius: number; padding: number; fontFamily: string
    overlay: { enabled: boolean; color: string; opacity: number; closeOnClick: boolean }
    closeButton: { show: boolean; color: string; size: number }
    sideImage: { enabled: boolean; src: string; position: 'left' | 'right'; width: number }
    animation: 'fade' | 'slide-up' | 'none'
  }
  behavior: {
    display: { trigger: 'time_delay' | 'scroll' | 'exit_intent' | 'click'; delay: number; scrollPercent: number }
    visibility: { devices: 'all' | 'desktop' | 'mobile'; visitorType: 'all' | 'new' | 'returning'; hideFromSubscribers: boolean }
    frequency: { showAfterDays: number; stopAfterSubmission: boolean }
    targeting: { pages: 'all' | 'specific'; pageUrls: string[]; excludeUrls: string[] }
    scheduling: { enabled: boolean; startDate: string; endDate: string }
    audience: { tags: string[]; listId: string; doubleOptIn: boolean }
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

const defaultProps: Record<string, Record<string, any>> = {
  email: { placeholder: 'Seu email', label: 'Email', required: true, showLabel: false },
  phone: { placeholder: 'WhatsApp', label: 'Telefone', countryCode: '+55', showLabel: false },
  'name-input': { placeholder: 'Seu nome', label: 'Nome', showLabel: false },
  'text-input': { placeholder: 'Digite aqui...', label: 'Campo', showLabel: true },
  'date-input': { label: 'Data de nascimento', showLabel: true },
  dropdown: { label: 'Selecione', options: ['Opção 1', 'Opção 2'], placeholder: 'Escolha...' },
  radio: { label: 'Escolha', options: ['Opção 1', 'Opção 2'], layout: 'vertical' },
  checkbox: { label: 'Escolha', options: ['Opção 1', 'Opção 2'] },
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
    display: { trigger: 'time_delay', delay: 5, scrollPercent: 50 },
    visibility: { devices: 'all', visitorType: 'all', hideFromSubscribers: false },
    frequency: { showAfterDays: 1, stopAfterSubmission: true },
    targeting: { pages: 'all', pageUrls: [], excludeUrls: [] },
    scheduling: { enabled: false, startDate: '', endDate: '' },
    audience: { tags: [], listId: '', doubleOptIn: false },
  },
}

// ── Small helpers ──────────────────────────────────────────────────────────────
function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
        {title} {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs text-gray-500"><span className="mb-1 block">{label}</span>{children}</label>
}

const inp = "w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
const sel = inp + " bg-white"

// ── Block Renderer (canvas) ────────────────────────────────────────────────────
function BlockPreview({ block }: { block: Block }) {
  const p = block.props
  const blockStyle: React.CSSProperties = {
    marginTop: p.marginTop || 0, marginBottom: p.marginBottom ?? 8,
    padding: p.blockPadding || 0, backgroundColor: p.blockBg || undefined,
    borderRadius: p.blockRadius || 0,
    border: p.borderWidth ? `${p.borderWidth}px ${p.borderStyle || 'solid'} ${p.borderColor || '#E5E7EB'}` : undefined,
    boxShadow: p.shadow || undefined,
    opacity: p.opacity != null ? p.opacity / 100 : undefined,
  }
  const inputStyle = "w-full border border-gray-200 rounded-lg px-4 py-3 text-sm bg-white placeholder-gray-400 outline-none"
  switch (block.type) {
    case 'text': return <div contentEditable suppressContentEditableWarning
      onBlur={e => { const newText = e.currentTarget.textContent || ''; if (newText !== p.content) { block.props.content = newText } }}
      style={{ ...blockStyle, fontSize: p.fontSize || 16, color: p.color || '#111827', fontWeight: p.fontWeight || 'normal', fontStyle: p.fontStyle || 'normal', textAlign: p.align || 'left', lineHeight: p.lineHeight || 1.4, fontFamily: p.fontFamily || 'inherit', outline: 'none', cursor: 'text', minHeight: '1em' }}>{p.content}</div>
    case 'email':
      return <div style={blockStyle}>{p.showLabel && <label className="block text-sm font-medium text-gray-700 mb-1">{p.label}</label>}<input readOnly placeholder={p.placeholder || 'Seu email'} className={inputStyle} /></div>
    case 'phone':
      return <div style={blockStyle}>{p.showLabel && <label className="block text-sm font-medium text-gray-700 mb-1">{p.label}</label>}<div className="flex gap-2"><span className="flex items-center px-3 border border-gray-200 rounded-lg text-sm text-gray-500 bg-gray-50">{p.countryCode || '+55'}</span><input readOnly placeholder={p.placeholder || 'Telefone'} className={inputStyle} /></div></div>
    case 'name-input': case 'text-input':
      return <div style={blockStyle}>{p.showLabel && <label className="block text-sm font-medium text-gray-700 mb-1">{p.label}</label>}<input readOnly placeholder={p.placeholder} className={inputStyle} /></div>
    case 'date-input':
      return <div style={blockStyle}>{p.showLabel && <label className="block text-sm font-medium text-gray-700 mb-1">{p.label}</label>}<input type="date" className={inputStyle} /></div>
    case 'button':
      return <div style={{ ...blockStyle, textAlign: p.fullWidth ? undefined : (p.align || 'center') as any }}><button style={{ backgroundColor: p.bgColor || '#F97316', color: p.textColor || '#fff', borderRadius: p.borderRadius || 8, width: p.fullWidth ? '100%' : 'auto', fontSize: p.fontSize || 15, fontWeight: 700, padding: `${p.paddingV || 14}px ${p.paddingH || 28}px`, border: 'none', cursor: 'pointer' }}>{p.text || 'Enviar'}</button></div>
    case 'image':
      return <div style={{ ...blockStyle, textAlign: (p.align || 'center') as any, padding: p.padding || 0 }}>{p.src ? <img src={p.src} alt={p.alt} style={{ width: `${p.imgWidth || 100}%`, maxHeight: p.maxHeight || 300, objectFit: 'contain', borderRadius: p.borderRadius || 0, display: 'inline-block' }} /> : <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center text-gray-300"><ImageIcon className="w-10 h-10" /></div>}</div>
    case 'spacer': return <div style={{ ...blockStyle, height: p.height || 24 }} />
    case 'line': return <div style={blockStyle}><hr style={{ border: 'none', borderTop: `${p.thickness || 1}px ${p.style || 'solid'} ${p.color || '#E5E7EB'}`, margin: 0 }} /></div>
    case 'coupon':
      return <div style={{ ...blockStyle, padding: '16px', border: `2px dashed ${p.borderColor || '#F97316'}`, borderRadius: 8, textAlign: 'center', background: p.bgColor || '#FFF7ED' }}><p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 4px' }}>{p.description}</p><p style={{ fontSize: p.fontSize || 20, fontWeight: 700, color: '#F97316', letterSpacing: 2, margin: 0 }}>{p.code}</p></div>
    case 'countdown': {
      const vals = ['03', '12', '45', '30']
      const lbls = p.labels || { days: 'DIAS', hours: 'HORAS', minutes: 'MIN', seconds: 'SEG' }
      return <div style={{ ...blockStyle, textAlign: 'center', padding: '16px', backgroundColor: p.boxColor || '#1F2937', borderRadius: 8 }}><div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>{vals.map((v, i) => (<span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{i > 0 && <span style={{ color: p.labelColor || '#9CA3AF', fontSize: 20, fontWeight: 700 }}>:</span>}<span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><span style={{ fontSize: p.fontSize || 28, fontWeight: 800, color: p.numberColor || '#FFFFFF', lineHeight: 1 }}>{v}</span><span style={{ fontSize: 9, color: p.labelColor || '#9CA3AF', marginTop: 4, letterSpacing: 1 }}>{[lbls.days, lbls.hours, lbls.minutes, lbls.seconds][i]}</span></span></span>))}</div></div>
    }
    case 'legal-consent':
      return <div style={blockStyle}><label className="flex items-start gap-2" style={{ fontSize: p.fontSize || 12, color: p.color || '#6B7280', lineHeight: 1.4 }}><input type="checkbox" className="mt-0.5 flex-shrink-0" /><span>{p.text}</span></label></div>
    case 'dropdown':
      return <div style={blockStyle}><select className={inputStyle}><option>{p.placeholder || p.label}</option>{(p.options || []).map((o: string) => <option key={o}>{o}</option>)}</select></div>
    case 'radio':
      return <div style={blockStyle}><div style={{ display: 'flex', flexDirection: p.layout === 'horizontal' ? 'row' : 'column', gap: p.layout === 'horizontal' ? 12 : 6 }}>{(p.options || []).map((o: string) => <label key={o} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="radio" name={block.id} className="text-brand-500" />{o}</label>)}</div></div>
    case 'checkbox':
      return <div style={blockStyle}><div className="space-y-2">{(p.options || []).map((o: string) => <label key={o} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" className="rounded text-brand-500" />{o}</label>)}</div></div>
    default: return <div className="text-xs text-gray-400 p-2">[{block.type}]</div>
  }
}

// ── Block Props Editor (Omnisend-style per-block panels) ──────────────────────
function BlockEditor({ block, onChange, onDelete, onOpenMedia }: { block: Block; onChange: (b: Block) => void; onDelete: () => void; onOpenMedia?: (cb: (url: string) => void) => void }) {
  const up = (key: string, val: any) => onChange({ ...block, props: { ...block.props, [key]: val } })
  const p = block.props
  const [tab, setTab] = useState<'props' | 'layout'>('props')

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
    <label className="flex items-center gap-2.5 cursor-pointer py-0.5">
      <div className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-gray-200'}`} onClick={() => oc(!checked)}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )

  const renderProps = () => {
    switch (block.type) {
      case 'email':
        return <>
          <Field label="Placeholder"><input className={inp} value={p.placeholder || ''} onChange={e => up('placeholder', e.target.value)} /></Field>
          <Toggle label="Adicionar label" checked={p.showLabel || false} onChange={v => up('showLabel', v)} />
          {p.showLabel && <Field label="Texto do label"><input className={inp} value={p.label || ''} onChange={e => up('label', e.target.value)} /></Field>}
          <Toggle label="Campo obrigatório" checked={p.required !== false} onChange={v => up('required', v)} />
          {p.required !== false && <Field label="Mensagem obrigatório"><input className={inp} value={p.requiredMsg || 'Este campo é obrigatório'} onChange={e => up('requiredMsg', e.target.value)} /></Field>}
          <Field label="Mensagem de erro"><input className={inp} value={p.errorMsg || 'Email deve conter @ e domínio'} onChange={e => up('errorMsg', e.target.value)} /></Field>
          <Field label="Alinhamento"><AlignButtons value={p.align || 'full'} onChange={v => up('align', v)} /></Field>
        </>

      case 'phone':
        return <>
          <Field label="Placeholder"><input className={inp} value={p.placeholder || ''} onChange={e => up('placeholder', e.target.value)} /></Field>
          <Field label="País padrão">
            <select className={sel} value={p.countryCode || '+55'} onChange={e => up('countryCode', e.target.value)}>
              <option value="+55">Brasil (+55)</option><option value="+1">EUA (+1)</option><option value="+351">Portugal (+351)</option>
            </select>
          </Field>
          <Toggle label="Adicionar label" checked={p.showLabel || false} onChange={v => up('showLabel', v)} />
          {p.showLabel && <Field label="Texto do label"><input className={inp} value={p.label || ''} onChange={e => up('label', e.target.value)} /></Field>}
          <Toggle label="Campo obrigatório" checked={p.required || false} onChange={v => up('required', v)} />
          {p.required && <Field label="Mensagem obrigatório"><input className={inp} value={p.requiredMsg || 'Este campo é obrigatório'} onChange={e => up('requiredMsg', e.target.value)} /></Field>}
          <Field label="Mensagem de erro"><input className={inp} value={p.errorMsg || 'Telefone inválido'} onChange={e => up('errorMsg', e.target.value)} /></Field>
          <Field label="Alinhamento"><AlignButtons value={p.align || 'full'} onChange={v => up('align', v)} /></Field>
        </>

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
          <Field label="Ação do botão">
            <select className={sel} value={p.action || 'submit'} onChange={e => up('action', e.target.value)}>
              <option value="submit">Enviar formulário</option><option value="url">Abrir link</option><option value="next-step">Próxima etapa</option><option value="close">Fechar popup</option>
            </select>
          </Field>
          {p.action === 'url' && <Field label="URL"><input className={inp} value={p.url || ''} onChange={e => up('url', e.target.value)} placeholder="https://" /></Field>}
          <Field label="Texto do botão"><input className={inp} value={p.text || ''} onChange={e => up('text', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Cor fundo" value={p.bgColor || '#111827'} onChange={v => up('bgColor', v)} />
            <ColorField label="Cor texto" value={p.textColor || '#FFFFFF'} onChange={v => up('textColor', v)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tamanho fonte"><input type="number" className={inp} value={p.fontSize || 15} onChange={e => up('fontSize', +e.target.value)} /></Field>
            <Field label="Raio borda"><input type="number" className={inp} value={p.borderRadius || 8} onChange={e => up('borderRadius', +e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Padding V"><input type="number" className={inp} value={p.paddingV || 14} onChange={e => up('paddingV', +e.target.value)} min={4} max={40} /></Field>
            <Field label="Padding H"><input type="number" className={inp} value={p.paddingH || 28} onChange={e => up('paddingH', +e.target.value)} min={4} max={60} /></Field>
          </div>
          <Field label="Alinhamento"><AlignButtons value={p.fullWidth ? 'full' : (p.align || 'full')} onChange={v => { up('fullWidth', v === 'full'); if (v !== 'full') up('align', v) }} /></Field>
          <ColorField label="Cor hover" value={p.hoverColor || ''} onChange={v => up('hoverColor', v)} />
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

      case 'name-input': case 'text-input': case 'date-input':
        return <>
          <Field label="Placeholder"><input className={inp} value={p.placeholder || ''} onChange={e => up('placeholder', e.target.value)} /></Field>
          <Toggle label="Adicionar label" checked={p.showLabel || false} onChange={v => up('showLabel', v)} />
          {p.showLabel && <Field label="Texto do label"><input className={inp} value={p.label || ''} onChange={e => up('label', e.target.value)} /></Field>}
          <Toggle label="Campo obrigatório" checked={p.required || false} onChange={v => up('required', v)} />
          <Field label="Mapear para contato">
            <select className={sel} value={p.mapTo || ''} onChange={e => up('mapTo', e.target.value)}>
              <option value="">Nenhum</option><option value="first_name">Nome</option><option value="last_name">Sobrenome</option><option value="company">Empresa</option><option value="city">Cidade</option>
            </select>
          </Field>
          <Field label="Alinhamento"><AlignButtons value={p.align || 'full'} onChange={v => up('align', v)} /></Field>
        </>

      case 'dropdown': case 'radio': case 'checkbox':
        return <>
          <Field label="Label"><input className={inp} value={p.label || ''} onChange={e => up('label', e.target.value)} /></Field>
          <Field label="Opções (uma por linha)"><textarea className={inp} rows={4} value={(p.options || []).join('\n')} onChange={e => up('options', e.target.value.split('\n').filter(Boolean))} /></Field>
          <Toggle label="Campo obrigatório" checked={p.required || false} onChange={v => up('required', v)} />
          {block.type === 'radio' && <Field label="Direção">
            <select className={sel} value={p.layout || 'vertical'} onChange={e => up('layout', e.target.value)}>
              <option value="vertical">Vertical</option><option value="horizontal">Horizontal</option>
            </select>
          </Field>}
        </>

      case 'legal-consent':
        return <>
          <Field label="Texto de consentimento"><textarea className={inp} rows={3} value={p.text || ''} onChange={e => up('text', e.target.value)} /></Field>
          <Toggle label="Obrigatório" checked={p.required !== false} onChange={v => up('required', v)} />
          <Field label="Tamanho fonte"><input type="number" className={inp} value={p.fontSize || 12} onChange={e => up('fontSize', +e.target.value)} /></Field>
          <ColorField label="Cor do texto" value={p.color || '#6B7280'} onChange={v => up('color', v)} />
        </>

      case 'coupon':
        return <>
          <Field label="Código do cupom"><input className={inp} value={p.code || ''} onChange={e => up('code', e.target.value)} /></Field>
          <Field label="Descrição"><input className={inp} value={p.description || ''} onChange={e => up('description', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Cor fundo" value={p.bgColor || '#FFF7ED'} onChange={v => up('bgColor', v)} />
            <ColorField label="Cor borda" value={p.borderColor || '#F97316'} onChange={v => up('borderColor', v)} />
          </div>
          <Field label="Tamanho fonte"><input type="number" className={inp} value={p.fontSize || 20} onChange={e => up('fontSize', +e.target.value)} /></Field>
        </>

      case 'spacer':
        return <Field label="Altura (px)"><input type="range" min={4} max={80} value={p.height || 16} onChange={e => up('height', +e.target.value)} className="w-full" /><span className="text-xs text-gray-400">{p.height || 16}px</span></Field>

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
    <div>
      {/* Block type tabs like Omnisend: "Email | Layout" */}
      <div className="flex border-b border-gray-200 mb-4">
        <button onClick={() => setTab('props')} className={`flex-1 py-2.5 text-xs font-semibold ${tab === 'props' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400'}`}>
          {blockLabel[block.type] || block.type}
        </button>
        <button onClick={() => setTab('layout')} className={`flex-1 py-2.5 text-xs font-semibold ${tab === 'layout' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400'}`}>
          Layout
        </button>
      </div>

      {tab === 'props' ? (
        <div className="space-y-3 px-1">{renderProps()}</div>
      ) : (
        <div className="space-y-1 px-1">
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
function BehaviorPanel({ beh, onChange }: { beh: PopupDesign['behavior']; onChange: (b: PopupDesign['behavior']) => void }) {
  const set = (key: string, val: any) =>
    onChange({ ...beh, [key]: { ...(beh as any)[key], ...val } })
  const d = beh.display as any
  const timeOn = d.trigger === 'time_delay' || d.timeEnabled || false
  const scrollOn = d.trigger === 'scroll' || d.scrollEnabled || false
  const exitOn = d.trigger === 'exit_intent' || d.exitEnabled || false
  return (
    <div>
      <Section title="Exibição" defaultOpen>
        <p className="text-xs text-gray-500 mb-3">Decidir quando mostrar este formulário ao visitante:</p>
        <div className="space-y-3">
          <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-gray-300 cursor-pointer transition-colors">
            <input type="checkbox" checked={timeOn}
              onChange={e => set('display', { timeEnabled: e.target.checked, trigger: e.target.checked ? 'time_delay' : beh.display.trigger })}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">Tempo na página</p>
              <p className="text-xs text-gray-400 mt-0.5">Tempo que o visitante precisa permanecer.</p>
              {timeOn && (
                <div className="flex items-center gap-2 mt-2">
                  <input type="number" className="w-20 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none" value={beh.display.delay} onChange={e => set('display', { delay: +e.target.value })} />
                  <span className="text-xs text-gray-400">segundos</span>
                </div>
              )}
            </div>
          </label>
          <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-gray-300 cursor-pointer transition-colors">
            <input type="checkbox" checked={scrollOn}
              onChange={e => set('display', { scrollEnabled: e.target.checked, trigger: e.target.checked ? 'scroll' : beh.display.trigger })}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">Profundidade do scroll</p>
              <p className="text-xs text-gray-400 mt-0.5">O quanto o visitante precisa rolar.</p>
              {scrollOn && (
                <div className="flex items-center gap-2 mt-2">
                  <input type="number" className="w-20 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none" value={beh.display.scrollPercent} onChange={e => set('display', { scrollPercent: +e.target.value })} />
                  <span className="text-xs text-gray-400">%</span>
                </div>
              )}
            </div>
          </label>
          <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:border-gray-300 cursor-pointer transition-colors">
            <input type="checkbox" checked={exitOn}
              onChange={e => set('display', { exitEnabled: e.target.checked, trigger: e.target.checked ? 'exit_intent' : beh.display.trigger })}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">Intenção de saída</p>
              <p className="text-xs text-gray-400 mt-0.5">Exibir quando o visitante está prestes a sair da página.</p>
            </div>
          </label>
        </div>
        <div className="mt-3 p-3 bg-brand-50 rounded-xl border border-brand-100">
          <p className="text-xs text-brand-700">O formulário aparecerá quando <strong>qualquer</strong> condição ativada for atendida.</p>
        </div>
      </Section>
      <Section title="Visibilidade">
        <Field label="Dispositivos">
          <select className={sel} value={beh.visibility.devices} onChange={e => set('visibility', { devices: e.target.value as any })}>
            <option value="all">Todos</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option>
          </select>
        </Field>
        <Field label="Tipo visitante">
          <select className={sel} value={beh.visibility.visitorType} onChange={e => set('visibility', { visitorType: e.target.value as any })}>
            <option value="all">Todos</option><option value="new">Novos</option><option value="returning">Retornantes</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={beh.visibility.hideFromSubscribers} onChange={e => set('visibility', { hideFromSubscribers: e.target.checked })} /> Ocultar de inscritos
        </label>
      </Section>
      <Section title="Frequência">
        <Field label="Exibir novamente após (dias)"><input type="number" className={inp} value={beh.frequency.showAfterDays} onChange={e => set('frequency', { showAfterDays: +e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={beh.frequency.stopAfterSubmission} onChange={e => set('frequency', { stopAfterSubmission: e.target.checked })} /> Parar após envio
        </label>
      </Section>
      <Section title="Segmentação">
        <Field label="Páginas">
          <select className={sel} value={beh.targeting.pages} onChange={e => set('targeting', { pages: e.target.value as any })}>
            <option value="all">Todas</option><option value="specific">Específicas</option>
          </select>
        </Field>
        {beh.targeting.pages === 'specific' && <Field label="URLs (uma por linha)"><textarea className={inp} rows={3} value={beh.targeting.pageUrls.join('\n')} onChange={e => set('targeting', { pageUrls: e.target.value.split('\n').filter(Boolean) })} /></Field>}
      </Section>
      <Section title="Agendamento">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={beh.scheduling.enabled} onChange={e => set('scheduling', { enabled: e.target.checked })} /> Ativar agendamento
        </label>
        {beh.scheduling.enabled && <>
          <Field label="Início"><input type="datetime-local" className={inp} value={beh.scheduling.startDate} onChange={e => set('scheduling', { startDate: e.target.value })} /></Field>
          <Field label="Fim"><input type="datetime-local" className={inp} value={beh.scheduling.endDate} onChange={e => set('scheduling', { endDate: e.target.value })} /></Field>
        </>}
      </Section>
      <Section title="Audiência">
        <Field label="ID da Lista"><input className={inp} value={beh.audience.listId} onChange={e => set('audience', { listId: e.target.value })} /></Field>
        <Field label="Tags (separadas por vírgula)"><input className={inp} value={beh.audience.tags.join(', ')} onChange={e => set('audience', { tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} /></Field>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={beh.audience.doubleOptIn} onChange={e => set('audience', { doubleOptIn: e.target.checked })} /> Double Opt-in
        </label>
      </Section>
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
  return (
    <div>
      <Section title="Layout" defaultOpen>
        <Field label="Tipo formulário">
          <select className={sel} value={design.formType} onChange={e => onChange({ ...design, formType: e.target.value as any })}>
            <option value="popup">Popup</option><option value="flyout">Flyout</option><option value="fullpage">Página Inteira</option><option value="embed">Embed</option><option value="banner">Banner</option>
          </select>
        </Field>
        <Field label="Largura (px)"><input type="number" className={inp} value={s.width} onChange={e => setS({ width: +e.target.value })} /></Field>
        <Field label="Borda arredondada"><input type="number" className={inp} value={s.borderRadius} onChange={e => setS({ borderRadius: +e.target.value })} /></Field>
        <Field label="Padding"><input type="number" className={inp} value={s.padding} onChange={e => setS({ padding: +e.target.value })} /></Field>
        <Field label="Animação">
          <select className={sel} value={s.animation} onChange={e => setS({ animation: e.target.value as any })}>
            <option value="fade">Fade</option><option value="slide-up">Slide Up</option><option value="none">Nenhuma</option>
          </select>
        </Field>
      </Section>
      <Section title="Cores">
        <Field label="Fundo"><input type="color" value={s.backgroundColor} onChange={e => setS({ backgroundColor: e.target.value })} className="w-full h-8 rounded cursor-pointer" /></Field>
        <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={s.overlay.enabled} onChange={e => setOv({ enabled: e.target.checked })} /> Overlay</label>
        {s.overlay.enabled && <>
          <Field label="Cor overlay"><input type="color" value={s.overlay.color} onChange={e => setOv({ color: e.target.value })} className="w-full h-8 rounded cursor-pointer" /></Field>
          <Field label="Opacidade (%)"><input type="number" className={inp} value={s.overlay.opacity} onChange={e => setOv({ opacity: +e.target.value })} /></Field>
        </>}
      </Section>
      <Section title="Imagem Lateral">
        <label className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
          <div className={`relative w-9 h-5 rounded-full transition-colors ${s.sideImage.enabled ? 'bg-emerald-500' : 'bg-gray-200'}`} onClick={() => setSi({ enabled: !s.sideImage.enabled })}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${s.sideImage.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          Ativar imagem lateral
        </label>
        {s.sideImage.enabled && <div className="mt-3 space-y-3">
          <p className="text-xs text-gray-400">JPG, PNG e GIF. Máximo 2000px.</p>
          {s.sideImage.src ? (
            <div className="space-y-2">
              <img src={s.sideImage.src} alt="" className="w-full h-24 object-cover rounded-lg border" />
              <div className="flex gap-2">
                <button onClick={() => onOpenMedia?.(url => setSi({ src: url }))}
                  className="flex-1 py-1.5 text-xs font-medium text-center text-gray-700 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  Trocar
                </button>
                <button onClick={() => setSi({ src: '' })} className="flex-1 py-1.5 text-xs font-medium text-red-600 bg-white border border-gray-200 rounded-lg hover:bg-red-50">Remover</button>
              </div>
            </div>
          ) : (
            <button onClick={() => onOpenMedia?.(url => setSi({ src: url }))}
              className="w-full border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-brand-400">
              <Upload className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <span className="text-xs text-gray-500">Clique para escolher imagem</span>
            </button>
          )}
          <Field label="Posição">
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={() => setSi({ position: 'left' })} className={`flex-1 py-1.5 text-xs font-medium ${s.sideImage.position === 'left' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}>Esquerda</button>
              <button onClick={() => setSi({ position: 'right' })} className={`flex-1 py-1.5 text-xs font-medium ${s.sideImage.position === 'right' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}>Direita</button>
            </div>
          </Field>
          <Field label="Largura">
            <div className="flex items-center gap-2">
              <input type="range" min={100} max={400} value={s.sideImage.width} onChange={e => setSi({ width: +e.target.value })} className="flex-1" />
              <span className="text-xs text-gray-500 w-12 text-right">{s.sideImage.width}px</span>
            </div>
          </Field>
        </div>}
      </Section>
      <Section title="Botão Fechar">
        <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={s.closeButton.show} onChange={e => setCb({ show: e.target.checked })} /> Mostrar</label>
        {s.closeButton.show && <Field label="Cor"><input type="color" value={s.closeButton.color} onChange={e => setCb({ color: e.target.value })} className="w-full h-8 rounded cursor-pointer" /></Field>}
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

// ── Media Library Modal ───────────────────────────────────────────────────────
function MediaLibraryModal({ onSelect, onClose }: { onSelect: (url: string) => void; onClose: () => void }) {
  const [images, setImages] = useState<{ url: string; name?: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/content/media').then(r => r.json()).then(data => {
      setImages(Array.isArray(data) ? data : data.images || data.media || [])
    }).catch(() => {})
  }, [])

  const handleUpload = async (file: File) => {
    setUploading(true)
    const form = new FormData(); form.append('file', file)
    try {
      const res = await fetch('/api/images/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (data.url) {
        setImages(prev => [{ url: data.url, name: file.name }, ...prev])
      }
    } catch {} finally { setUploading(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[640px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-800">Biblioteca de Imagens</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4 text-gray-500" /></button>
        </div>
        <div className="px-5 py-3 border-b border-gray-100">
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Enviando...' : 'Enviar imagem'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {images.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">Nenhuma imagem encontrada</div>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {images.map((img, i) => (
                <button key={i} onClick={() => { onSelect(img.url); onClose() }}
                  className="group aspect-square rounded-lg border-2 border-gray-200 hover:border-orange-400 overflow-hidden transition-colors">
                  <img src={img.url} alt={img.name || ''} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

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
  const [rightTab, setRightTab] = useState<'block' | 'behavior' | 'theme'>('theme')
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
      if (form.design_json && Object.keys(form.design_json).length > 0) setDesign({ ...defaultDesign, ...form.design_json })
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
    const b: Block = { id: uid(), type, props: { ...(defaultProps[type] || {}) } }
    updateBlocks([...activeStep.blocks, b])
    setSelectedBlockId(b.id)
    setRightTab('block')
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
        {/* Left sidebar — palette */}
        <aside className="w-[240px] bg-white border-r border-gray-200 overflow-y-auto shrink-0">
          <p className="px-4 pt-4 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Blocos</p>
          <div className="grid grid-cols-2 gap-1.5 px-3 pb-4">
            {BLOCK_TYPES.map(bt => (
              <button key={bt.type} onClick={() => addBlock(bt.type)}
                className="flex flex-col items-center gap-1 p-2.5 rounded-lg border border-gray-100 hover:border-orange-300 hover:bg-orange-50 transition text-gray-600 hover:text-orange-600 cursor-grab active:cursor-grabbing">
                <bt.icon className="w-5 h-5" />
                <span className="text-[11px] leading-tight">{bt.label}</span>
              </button>
            ))}
          </div>
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
                padding: s.padding,
                fontFamily: s.fontFamily,
                flexGrow: 1,
                minHeight: 200,
              }} className="relative">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={activeStep.blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2 min-h-[100px]">
                      {activeStep.blocks.map(block => (
                        <SortablePopupBlock key={block.id} block={block} isSelected={selectedBlockId === block.id}
                          onSelect={() => { setSelectedBlockId(block.id); setRightTab('block') }}
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

        {/* Right sidebar */}
        <aside className="w-[320px] bg-white border-l border-gray-200 flex flex-col shrink-0">
          <div className="flex border-b border-gray-200">
            {selectedBlock && <button onClick={() => setRightTab('block')} className={`flex-1 py-2.5 text-xs font-medium ${rightTab === 'block' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-500'}`}>Bloco</button>}
            <button onClick={() => setRightTab('behavior')} className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1 ${rightTab === 'behavior' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-500'}`}><Settings className="w-3.5 h-3.5" />Comportamento</button>
            <button onClick={() => setRightTab('theme')} className={`flex-1 py-2.5 text-xs font-medium flex items-center justify-center gap-1 ${rightTab === 'theme' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-500'}`}><Palette className="w-3.5 h-3.5" />Tema</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {rightTab === 'block' && selectedBlock && (
              <div className="p-4"><BlockEditor block={selectedBlock} onChange={updateBlock} onDelete={() => deleteBlock(selectedBlock.id)} onOpenMedia={openMediaLibrary} /></div>
            )}
            {rightTab === 'block' && !selectedBlock && (
              <div className="p-8 text-center text-sm text-gray-400">Selecione um bloco no canvas</div>
            )}
            {rightTab === 'behavior' && <BehaviorPanel beh={design.behavior} onChange={b => setDesign(d => ({ ...d, behavior: b }))} />}
            {rightTab === 'theme' && <ThemePanel design={design} onChange={setDesign} onOpenMedia={openMediaLibrary} />}
          </div>
        </aside>
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
                <div style={{ backgroundColor: s.backgroundColor, padding: s.padding, fontFamily: s.fontFamily, flexGrow: 1, minHeight: 200 }}>
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
