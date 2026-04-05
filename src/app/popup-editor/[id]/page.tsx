'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Save, Loader2, Monitor, Smartphone, Plus, Trash2, X,
  ChevronDown, ChevronRight, GripVertical,
  AtSign, ShieldCheck, Phone, TextCursorInput, User, Calendar,
  CircleDot, CheckSquare, Type, MousePointerClick, ImageIcon, Minus,
  GripHorizontal, Tag, Clock, Eye, Settings, Palette,
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
  email: { placeholder: 'Seu email', label: 'Email', required: true },
  phone: { placeholder: 'WhatsApp', label: 'Telefone' },
  'name-input': { placeholder: 'Seu nome', label: 'Nome' },
  'text-input': { placeholder: 'Digite aqui...', label: 'Campo' },
  'date-input': { label: 'Data' },
  dropdown: { label: 'Selecione', options: ['Opção 1', 'Opção 2'] },
  radio: { label: 'Escolha', options: ['Opção 1', 'Opção 2'] },
  checkbox: { label: 'Escolha', options: ['Opção 1', 'Opção 2'] },
  'legal-consent': { text: 'Aceito receber comunicações.', required: true },
  text: { content: 'Ganhe 10% de desconto!', fontSize: 24, color: '#111827', fontWeight: 'bold', align: 'center' },
  button: { text: 'QUERO MEU DESCONTO', bgColor: '#F97316', textColor: '#fff', borderRadius: 8, fullWidth: true },
  image: { src: '', alt: 'Imagem', width: '100%' },
  spacer: { height: 24 },
  line: { color: '#E5E7EB', thickness: 1 },
  coupon: { code: 'DESCONTO10', description: 'Copie o código acima' },
  countdown: { minutes: 15, label: 'Oferta expira em:' },
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
    width: 480, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 32, fontFamily: 'Inter, sans-serif',
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
  switch (block.type) {
    case 'text': return <div style={{ fontSize: p.fontSize, color: p.color, fontWeight: p.fontWeight, textAlign: p.align }}>{p.content}</div>
    case 'email': case 'phone': case 'name-input': case 'text-input':
      return <input readOnly placeholder={p.placeholder} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
    case 'date-input': return <input type="date" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white" />
    case 'button': return <button style={{ backgroundColor: p.bgColor, color: p.textColor, borderRadius: p.borderRadius, width: p.fullWidth ? '100%' : 'auto' }} className="px-6 py-2.5 font-semibold text-sm">{p.text}</button>
    case 'image': return p.src ? <img src={p.src} alt={p.alt} style={{ width: p.width }} /> : <div className="w-full h-24 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">Imagem</div>
    case 'spacer': return <div style={{ height: p.height }} />
    case 'line': return <hr style={{ borderColor: p.color, borderWidth: p.thickness }} />
    case 'coupon': return <div className="border-2 border-dashed border-orange-300 rounded-lg p-3 text-center"><code className="text-lg font-bold text-orange-600">{p.code}</code><p className="text-xs text-gray-500 mt-1">{p.description}</p></div>
    case 'countdown': return <div className="text-center"><span className="text-xs text-gray-500">{p.label}</span><span className="block text-2xl font-mono font-bold">{p.minutes}:00</span></div>
    case 'legal-consent': return <label className="flex items-start gap-2 text-xs text-gray-600"><input type="checkbox" className="mt-0.5" />{p.text}</label>
    case 'dropdown': return <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"><option>{p.label}</option>{(p.options as string[]).map((o: string) => <option key={o}>{o}</option>)}</select>
    case 'radio': return <div className="space-y-1">{(p.options as string[]).map((o: string) => <label key={o} className="flex items-center gap-2 text-sm"><input type="radio" name={block.id} />{o}</label>)}</div>
    case 'checkbox': return <div className="space-y-1">{(p.options as string[]).map((o: string) => <label key={o} className="flex items-center gap-2 text-sm"><input type="checkbox" />{o}</label>)}</div>
    default: return <div className="text-xs text-gray-400">[{block.type}]</div>
  }
}

// ── Block Props Editor (Omnisend-style per-block panels) ──────────────────────
function BlockEditor({ block, onChange, onDelete }: { block: Block; onChange: (b: Block) => void; onDelete: () => void }) {
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
                <label className="flex-1 py-1.5 text-xs font-medium text-center text-gray-700 bg-white border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                  Trocar
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0]; if (!file) return
                    const form = new FormData(); form.append('file', file)
                    try { const res = await fetch('/api/images/upload', { method: 'POST', body: form }); const data = await res.json(); if (data.url) up('src', data.url) } catch {}
                  }} />
                </label>
                <button onClick={() => up('src', '')} className="flex-1 py-1.5 text-xs font-medium text-red-600 bg-white border border-gray-200 rounded-lg hover:bg-red-50">Remover</button>
              </div>
            </div>
          ) : (
            <label className="block border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-brand-400">
              <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <span className="text-xs text-gray-500">Clique para enviar imagem</span>
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return
                const form = new FormData(); form.append('file', file)
                try { const res = await fetch('/api/images/upload', { method: 'POST', body: form }); const data = await res.json(); if (data.url) up('src', data.url) } catch {}
              }} />
            </label>
          )}
          <Field label="URL da imagem"><input className={inp} value={p.src || ''} onChange={e => up('src', e.target.value)} placeholder="https://" /></Field>
          <Field label="Texto alternativo"><input className={inp} value={p.alt || ''} onChange={e => up('alt', e.target.value)} placeholder="Descreva a imagem" /></Field>
          <Field label="Link"><input className={inp} value={p.href || ''} onChange={e => up('href', e.target.value)} placeholder="https://" /></Field>
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
        <div className="space-y-3 px-1">
          <Field label="Margem superior (px)"><input type="number" className={inp} value={p.marginTop ?? 0} onChange={e => up('marginTop', +e.target.value)} /></Field>
          <Field label="Margem inferior (px)"><input type="number" className={inp} value={p.marginBottom ?? 8} onChange={e => up('marginBottom', +e.target.value)} /></Field>
          <Field label="Padding (px)"><input type="number" className={inp} value={p.blockPadding ?? 0} onChange={e => up('blockPadding', +e.target.value)} /></Field>
          <ColorField label="Cor de fundo" value={p.blockBg || ''} onChange={v => up('blockBg', v)} />
          <Field label="Raio borda"><input type="number" className={inp} value={p.blockRadius ?? 0} onChange={e => up('blockRadius', +e.target.value)} /></Field>
          <button onClick={onDelete} className="w-full py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 mt-4">
            Remover bloco
          </button>
        </div>
      )}
    </div>
  )
}

// ── Behavior Panel ─────────────────────────────────────────────────────────────
function BehaviorPanel({ beh, onChange }: { beh: PopupDesign['behavior']; onChange: (b: PopupDesign['behavior']) => void }) {
  const set = <K extends keyof PopupDesign['behavior']>(key: K, val: Partial<PopupDesign['behavior'][K]>) =>
    onChange({ ...beh, [key]: { ...beh[key], ...val } })
  return (
    <div>
      <Section title="Exibição" defaultOpen>
        <Field label="Gatilho">
          <select className={sel} value={beh.display.trigger} onChange={e => set('display', { trigger: e.target.value as any })}>
            <option value="time_delay">Tempo</option><option value="scroll">Scroll</option><option value="exit_intent">Exit Intent</option><option value="click">Clique</option>
          </select>
        </Field>
        {beh.display.trigger === 'time_delay' && <Field label="Atraso (seg)"><input type="number" className={inp} value={beh.display.delay} onChange={e => set('display', { delay: +e.target.value })} /></Field>}
        {beh.display.trigger === 'scroll' && <Field label="Scroll (%)"><input type="number" className={inp} value={beh.display.scrollPercent} onChange={e => set('display', { scrollPercent: +e.target.value })} /></Field>}
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
function ThemePanel({ design, onChange }: { design: PopupDesign; onChange: (d: PopupDesign) => void }) {
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
        <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={s.sideImage.enabled} onChange={e => setSi({ enabled: e.target.checked })} /> Ativar</label>
        {s.sideImage.enabled && <>
          <Field label="URL"><input className={inp} value={s.sideImage.src} onChange={e => setSi({ src: e.target.value })} /></Field>
          <Field label="Posição">
            <select className={sel} value={s.sideImage.position} onChange={e => setSi({ position: e.target.value as any })}>
              <option value="left">Esquerda</option><option value="right">Direita</option>
            </select>
          </Field>
          <Field label="Largura (px)"><input type="number" className={inp} value={s.sideImage.width} onChange={e => setSi({ width: +e.target.value })} /></Field>
        </>}
      </Section>
      <Section title="Botão Fechar">
        <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={s.closeButton.show} onChange={e => setCb({ show: e.target.checked })} /> Mostrar</label>
        {s.closeButton.show && <Field label="Cor"><input type="color" value={s.closeButton.color} onChange={e => setCb({ color: e.target.value })} className="w-full h-8 rounded cursor-pointer" /></Field>}
      </Section>
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
  const [preview, setPreview] = useState<'desktop' | 'mobile'>('desktop')
  const [activeStepIdx, setActiveStepIdx] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  const [rightTab, setRightTab] = useState<'block' | 'behavior' | 'theme'>('theme')

  const activeStep = showSuccess ? design.successStep : design.steps[activeStepIdx]
  const selectedBlock = activeStep?.blocks.find(b => b.id === selectedBlockId) ?? null

  // Load
  useEffect(() => {
    fetch(`/api/forms/${formId}`).then(r => r.json()).then(data => {
      if (data.design_json) setDesign({ ...defaultDesign, ...data.design_json })
    }).catch(() => {}).finally(() => setLoading(false))
  }, [formId])

  // Save
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await fetch(`/api/forms/${formId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design_json: design, form_type: design.formType, behavior: design.behavior }),
      })
    } finally { setSaving(false) }
  }, [formId, design])

  const updateBlocks = (blocks: Block[]) => {
    if (showSuccess) setDesign(d => ({ ...d, successStep: { ...d.successStep, blocks } }))
    else setDesign(d => ({ ...d, steps: d.steps.map((s, i) => i === activeStepIdx ? { ...s, blocks } : s) }))
  }

  const addBlock = (type: string) => {
    const b: Block = { id: uid(), type, props: { ...(defaultProps[type] || {}) } }
    updateBlocks([...activeStep.blocks, b])
    setSelectedBlockId(b.id)
    setRightTab('block')
  }

  const updateBlock = (block: Block) => updateBlocks(activeStep.blocks.map(b => b.id === block.id ? block : b))
  const deleteBlock = (id: string) => { updateBlocks(activeStep.blocks.filter(b => b.id !== id)); if (selectedBlockId === id) setSelectedBlockId(null) }

  const addStep = () => {
    const s: Step = { id: uid(), name: `Etapa ${design.steps.length + 1}`, blocks: [] }
    setDesign(d => ({ ...d, steps: [...d.steps, s] }))
    setActiveStepIdx(design.steps.length)
    setShowSuccess(false)
  }

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>

  const s = design.styles
  const canvasW = preview === 'mobile' ? 375 : Math.min(s.width + (s.sideImage.enabled ? s.sideImage.width : 0), 700)

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-md hover:bg-gray-100"><ArrowLeft className="w-5 h-5" /></button>
          <span className="text-sm font-semibold text-gray-800">Editor de Popup</span>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          <button onClick={() => setPreview('desktop')} className={`p-1.5 rounded ${preview === 'desktop' ? 'bg-white shadow-sm' : ''}`}><Monitor className="w-4 h-4" /></button>
          <button onClick={() => setPreview('mobile')} className={`p-1.5 rounded ${preview === 'mobile' ? 'bg-white shadow-sm' : ''}`}><Smartphone className="w-4 h-4" /></button>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-1.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
        </button>
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
        <main className="flex-1 flex flex-col items-center overflow-y-auto">
          <div className="flex-1 flex items-center justify-center w-full p-8">
            {/* Overlay */}
            <div style={{ width: canvasW + 80, minHeight: 300 }} className="relative rounded-xl overflow-hidden shadow-2xl">
              {s.overlay.enabled && <div className="absolute inset-0" style={{ backgroundColor: s.overlay.color, opacity: s.overlay.opacity / 100 }} />}
              <div className="relative flex" style={{ margin: '40px auto', width: canvasW }}>
                {/* Side image left */}
                {s.sideImage.enabled && s.sideImage.position === 'left' && (
                  <div style={{ width: s.sideImage.width, flexShrink: 0 }} className="bg-gray-200 rounded-l-xl overflow-hidden">
                    {s.sideImage.src ? <img src={s.sideImage.src} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">Imagem</div>}
                  </div>
                )}
                {/* Popup body */}
                <div style={{ backgroundColor: s.backgroundColor, borderRadius: s.borderRadius, padding: s.padding, fontFamily: s.fontFamily, flexGrow: 1 }} className="relative">
                  {s.closeButton.show && <button className="absolute top-3 right-3"><X style={{ color: s.closeButton.color }} className="w-5 h-5" /></button>}
                  <div className="space-y-3">
                    {activeStep.blocks.map(block => (
                      <div key={block.id} onClick={() => { setSelectedBlockId(block.id); setRightTab('block') }}
                        className={`group relative rounded-md cursor-pointer transition ${selectedBlockId === block.id ? 'ring-2 ring-orange-400 ring-offset-1' : 'hover:ring-1 hover:ring-gray-300'}`}>
                        <BlockPreview block={block} />
                        <button onClick={e => { e.stopPropagation(); deleteBlock(block.id) }}
                          className="absolute -top-2 -right-2 hidden group-hover:flex w-5 h-5 bg-red-500 text-white rounded-full items-center justify-center">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {activeStep.blocks.length === 0 && <div className="py-12 text-center text-gray-400 text-sm">Clique em um bloco para adicionar</div>}
                  </div>
                </div>
                {/* Side image right */}
                {s.sideImage.enabled && s.sideImage.position === 'right' && (
                  <div style={{ width: s.sideImage.width, flexShrink: 0 }} className="bg-gray-200 rounded-r-xl overflow-hidden">
                    {s.sideImage.src ? <img src={s.sideImage.src} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">Imagem</div>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Step tabs */}
          <div className="flex items-center gap-1 px-4 py-2 bg-white border-t border-gray-200 w-full overflow-x-auto shrink-0">
            {design.steps.map((step, i) => (
              <button key={step.id} onClick={() => { setActiveStepIdx(i); setShowSuccess(false); setSelectedBlockId(null) }}
                className={`px-3 py-1.5 text-xs rounded-md font-medium whitespace-nowrap ${!showSuccess && activeStepIdx === i ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                {step.name}
              </button>
            ))}
            <button onClick={() => { setShowSuccess(true); setSelectedBlockId(null) }}
              className={`px-3 py-1.5 text-xs rounded-md font-medium whitespace-nowrap ${showSuccess ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-100'}`}>
              Sucesso
            </button>
            <button onClick={addStep} className="p-1 rounded-md text-gray-400 hover:text-orange-500 hover:bg-gray-100"><Plus className="w-4 h-4" /></button>
            {design.steps.length > 1 && !showSuccess && (
              <button onClick={() => { setDesign(d => ({ ...d, steps: d.steps.filter((_, i) => i !== activeStepIdx) })); setActiveStepIdx(Math.max(0, activeStepIdx - 1)) }}
                className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-gray-100 ml-auto"><Trash2 className="w-4 h-4" /></button>
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
              <div className="p-4"><BlockEditor block={selectedBlock} onChange={updateBlock} onDelete={() => deleteBlock(selectedBlock.id)} /></div>
            )}
            {rightTab === 'block' && !selectedBlock && (
              <div className="p-8 text-center text-sm text-gray-400">Selecione um bloco no canvas</div>
            )}
            {rightTab === 'behavior' && <BehaviorPanel beh={design.behavior} onChange={b => setDesign(d => ({ ...d, behavior: b }))} />}
            {rightTab === 'theme' && <ThemePanel design={design} onChange={setDesign} />}
          </div>
        </aside>
      </div>
    </div>
  )
}
