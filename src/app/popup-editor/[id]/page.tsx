'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent, DragOverlay, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TRAFFIC_TYPES, PAGE_TEMPLATES } from '@/lib/popups/targeting'
import { wheelSectorPath, wheelLabelPos, wheelPinPos, WHEEL_R, WHEEL_C, WHEEL_RIM_W } from '@/lib/popups/games'
import { splitLines } from '@/lib/popups/lines'
import {
  ArrowLeft, Save, Loader2, Monitor, Smartphone, Plus, Trash2, X, Undo2, Redo2, Copy,
  ChevronDown, ChevronRight, GripVertical, Users, CalendarDays, Target, Power,
  AtSign, ShieldCheck, Phone, TextCursorInput, User, Calendar,
  CircleDot, CheckSquare, Type, MousePointerClick, ImageIcon, Minus,
  GripHorizontal, Tag, Clock, Eye, Settings, Palette, Upload, LayoutGrid,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Bold, Italic, Underline, Link2, ExternalLink, Sparkles, Disc3, Eraser, Gift, Hand,
  BarChart3,
  SlidersHorizontal, Layers, Square, Sun, CornerDownRight,
  MoveHorizontal, MoveVertical, Check, MoreHorizontal, Pencil,
  AlertTriangle, RotateCcw, Rows,
} from 'lucide-react'
import {
  type HistoryState, historySeed, historyPush, historyUndo, historyRedo, canUndo, canRedo,
  isBlockTypeDrag, mergeBlockProps, repairDesignSteps, countdownValues,
} from '../editor-utils'

// ── Types ──────────────────────────────────────────────────────────────────────
interface Block { id: string; type: string; props: Record<string, any> }
// kind: o papel da etapa no fluxo (boas-vindas, formulário, quiz, lição,
// recompensa, consentimento). Informativo para o editor e o relatório; o
// runtime segue a ramificação, não o tipo.
interface Step { id: string; name: string; blocks: Block[]; kind?: 'welcome' | 'form' | 'quiz' | 'lesson' | 'reward' | 'consent' }

const STEP_KIND_LABELS: Record<NonNullable<Step['kind']>, string> = {
  welcome: 'Boas-vindas', form: 'Formulário', quiz: 'Quiz', lesson: 'Lição', reward: 'Recompensa', consent: 'Consentimento',
}
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
    // A foto sangrando atrás do conteúdo inteiro — o formato dos popups
    // que convertem hoje. Diferente da imagem LATERAL, que é formato de
    // e-mail: aqui o texto fica POR CIMA da foto, e o véu é o que mantém
    // ele legível.
    backgroundImage?: { enabled: boolean; src: string; overlay?: { enabled?: boolean; color?: string; opacity?: number; style?: 'gradient' | 'flat' } }
    /** No celular o popup ocupa a tela inteira, sem cantos nem margem. */
    fullscreenMobile?: boolean
    animation: 'fade' | 'slide-up' | 'none'
    // Barra de progresso entre etapas (só aparece com 2+ etapas).
    progress?: { enabled: boolean; color?: string; trackColor?: string; height?: number }
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
      // Per-visitor cap, independent of the per-form cookie. Uses the
      // __worder_id cookie to identify the same visitor across sessions /
      // form rotations. Stored as a rolling timestamp list in localStorage.
      perVisitor?: { enabled: boolean; maxShows: number; windowDays: number }
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
    // Cart-value gate — hits Shopify's /cart.js. minTotal/maxTotal in
    // store currency. 0 means no bound. minItems is a separate condition.
    cart?: {
      enabled: boolean
      minTotal?: number
      maxTotal?: number
      minItems?: number
      // Pelo conteúdo: só quando o carrinho tem (any) ou não tem (none)
      // algum dos produtos — por handle, tipo ou fornecedor.
      contains?: { enabled: boolean; match: 'any' | 'none'; handles: string[]; types: string[]; vendors: string[] }
    }
    // Quem vê, pelo que sabemos da pessoa: só quem está (ou exceto quem
    // está) em segmentos e listas. Decidido no servidor, nunca no navegador.
    audienceTargeting?: { mode: 'off' | 'include' | 'exclude'; segmentIds: string[]; listIds: string[] }
    // Contexto da página: template da Shopify e o produto/coleção em vista.
    page?: {
      enabled: boolean
      templates: string[]
      productHandles: string[]
      productTypes: string[]
      productVendors: string[]
      productTags: string[]
      collectionHandles: string[]
    }
    // Origem do tráfego da sessão (direto, busca, anúncio, social...).
    traffic?: { enabled: boolean; types: string[] }
    // WhatsApp com confirmação: a caixa marcada só vira opt-in quando a
    // pessoa responde ao template (UTILITY, aprovado pela Meta).
    whatsapp?: { doubleOptIn: boolean; templateName: string; templateLanguage: string; bodyVariables: string[] }
    progressiveProfiling?: {
      enabled: boolean
      hideKnownFields: boolean
      prefillKnownFields: boolean
    }
    // Grupo de controle: fatia dos elegíveis que nunca vê o popup, para
    // medir receita incremental (não só atribuída). 0 = desligado; teto 50.
    experiment?: {
      holdoutPercent: number
    }
    // Quando dois popups são elegíveis na mesma página, o de maior número
    // aparece; o outro espera a próxima visita. 0 = normal.
    priority?: number
    // Segunda chance na sessão para quem fechou e depois mostrou intenção
    // (rolagem, permanência, páginas, produtos, carrinho). Uma vez por
    // sessão, nunca antes do delay mínimo.
    smartTrigger?: { enabled: boolean; threshold: number; minDelaySec: number }
  }
  postSubmit?: {
    action: 'close' | 'redirect' | 'show-success'
    redirectUrl: string
    closeDelay: number
  }
  successMessage?: string
  /** Merchant-configurable message shown by the runtime when the submit fails.
   *  Empty → runtime falls back to a neutral default. */
  errorMessage?: string
}

const uid = () => Math.random().toString(36).slice(2, 9)

// Etapa apagada: nenhuma ramificação, botão ou nível de recompensa pode
// continuar apontando para ela — o runtime ignoraria em silêncio.
function stripStepRefs(d: PopupDesign, stepId: string | undefined): PopupDesign {
  if (!stepId) return d
  const clean = (b: Block): Block => {
    const p: any = { ...b.props }
    let changed = false
    if (p.nextStepId === stepId) { delete p.nextStepId; changed = true }
    if (p.branches && typeof p.branches === 'object') {
      const next: Record<string, string> = {}
      for (const [k, v] of Object.entries(p.branches)) if (v !== stepId) next[k] = v as string
      if (Object.keys(next).length !== Object.keys(p.branches).length) { p.branches = next; changed = true }
    }
    if (Array.isArray(p.tiers) && p.tiers.some((t: any) => t?.afterStepId === stepId)) {
      p.tiers = p.tiers.map((t: any) => (t?.afterStepId === stepId ? { ...t, afterStepId: '' } : t)); changed = true
    }
    return changed ? { ...b, props: p } : b
  }
  return {
    ...d,
    steps: d.steps.map(s => ({ ...s, blocks: s.blocks.map(clean) })),
    successStep: d.successStep ? { ...d.successStep, blocks: d.successStep.blocks.map(clean) } : d.successStep,
  }
}

// Stable IDs for the brand-new-popup defaults. Using uid() (Math.random)
// here breaks SSR hydration: Next.js evaluates this module on the server
// AND on the client, each pass produces different random IDs, and React
// throws #422/#425 ("Text content does not match server-rendered HTML")
// when the canvas eventually renders block.id-derived attributes that
// don't line up. Fixed strings hydrate identically and get replaced the
// moment the merchant adds or saves a block (those use the runtime uid()
// inside event handlers, which is client-only).
const DEFAULT_IDS = {
  step: 'default-step-1',
  successStep: 'default-success-step',
  blockText: 'default-block-text',
  blockEmail: 'default-block-email',
  blockButton: 'default-block-button',
  blockSuccessText: 'default-success-text',
} as const

// Block types grouped by category, Klaviyo/Omnisend-style. Order inside each
// group is the order they appear in the sidebar grid.
const BLOCK_CATEGORIES: Array<{ name: string; items: Array<{ type: string; label: string; icon: any }> }> = [
  {
    name: 'Conteúdo',
    items: [
      { type: 'text', label: 'Texto', icon: Type },
      { type: 'button', label: 'Botão', icon: MousePointerClick },
      { type: 'image', label: 'Imagem', icon: ImageIcon },
      { type: 'coupon', label: 'Cupom', icon: Tag },
      { type: 'countdown', label: 'Contagem', icon: Clock },
    ],
  },
  {
    name: 'Jogos',
    items: [
      { type: 'wheel', label: 'Roleta', icon: Disc3 },
      { type: 'scratch', label: 'Raspadinha', icon: Eraser },
      { type: 'cards', label: 'Cartas', icon: Layers },
    ],
  },
  {
    name: 'Campos',
    items: [
      { type: 'email', label: 'Email', icon: AtSign },
      // Botões empilhados que respondem E avançam num clique só — o
      // primeiro passo de quase todo popup que converte por aí.
      { type: 'choice', label: 'Escolhas', icon: Rows },
      { type: 'name-input', label: 'Nome', icon: User },
      { type: 'phone', label: 'Telefone', icon: Phone },
      { type: 'text-input', label: 'Texto', icon: TextCursorInput },
      { type: 'date-input', label: 'Data', icon: Calendar },
      { type: 'dropdown', label: 'Lista', icon: ChevronDown },
      { type: 'radio', label: 'Radio', icon: CircleDot },
      { type: 'checkbox', label: 'Checkbox', icon: CheckSquare },
      { type: 'legal-consent', label: 'Consentimento', icon: ShieldCheck },
    ],
  },
  {
    name: 'Layout',
    items: [
      { type: 'spacer', label: 'Espaço', icon: Minus },
      { type: 'line', label: 'Linha', icon: GripHorizontal },
    ],
  },
]

// Flat list kept around for any code that previously imported BLOCK_TYPES.
const BLOCK_TYPES = BLOCK_CATEGORIES.flatMap(c => c.items)

// Profile fields available for mapping (destinos no contato)
const PROFILE_FIELDS = [
  { value: 'first_name', label: 'Primeiro nome' },
  { value: 'last_name', label: 'Sobrenome' },
  { value: 'full_name', label: 'Nome completo' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Telefone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'birthday', label: 'Data de nascimento' },
  { value: 'gender', label: 'Gênero' },
  { value: 'company', label: 'Empresa' },
  { value: 'position', label: 'Cargo' },
  { value: 'city', label: 'Cidade' },
  { value: 'state', label: 'Estado' },
  { value: 'country', label: 'País' },
  { value: 'zip', label: 'CEP' },
  { value: 'address', label: 'Endereço' },
  { value: 'custom', label: 'Campo personalizado' },
]

// Defaults compartilhados por inputs (estilos + layout)
const INPUT_BASE_DEFAULTS = {
  // Input config
  required: false,
  requiredMsg: 'Este campo é obrigatório',
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
  dropdown: { label: 'Selecione', options: ['Opção 1', 'Opção 2'], placeholder: 'Escolha...', showLabel: true, mapTo: 'custom', mapToCustom: '' },
  radio: { label: 'Escolha', options: ['Opção 1', 'Opção 2'], layout: 'vertical', showLabel: true, mapTo: 'custom', mapToCustom: '' },
  checkbox: { label: 'Escolha', options: ['Opção 1', 'Opção 2'], showLabel: true, mapTo: 'custom', mapToCustom: '' },
  'legal-consent': { text: 'Aceito receber comunicações e concordo com a política de privacidade.', required: true, fontSize: 12, color: '#6B7280' },
  text: { content: 'Ganhe 10% de desconto!', fontSize: 28, color: '#111827', fontWeight: 'bold', align: 'center', tag: 'h2', lineHeight: 1.3 },
  button: { text: 'QUERO MEU DESCONTO', bgColor: '#F97316', textColor: '#fff', fontSize: 15, borderRadius: 8, fullWidth: true, action: 'submit', paddingV: 14, paddingH: 28 },
  image: { src: '', alt: '', imgWidth: 100, maxHeight: 300, borderRadius: 0, align: 'center', padding: 0 },
  // Escolhas: os botões empilhados que abrem quase todo popup bom que
  // existe por aí ("O que você está procurando?"). Clicar é a resposta E o
  // avanço — sem bolinha de rádio e sem um segundo botão "continuar".
  choice: {
    label: 'O que você está procurando?', showLabel: true, labelSize: 17, labelColor: '#111827', labelGap: 16,
    options: [
      { id: 'o1', label: 'Opção 1', value: 'opcao-1', next: '' },
      { id: 'o2', label: 'Opção 2', value: 'opcao-2', next: '' },
      { id: 'o3', label: 'Opção 3', value: 'opcao-3', next: '' },
    ],
    mapTo: 'custom', mapToCustom: 'escolha',
    optionBg: '#FFFFFF', optionColor: '#111827', hoverBg: '#F3F4F6',
    fontSize: 16, fontWeight: '600', paddingV: 16, paddingH: 18,
    borderRadius: 4, gap: 10, borderWidth: 1, borderColor: '#E5E7EB', uppercase: false,
    declineText: '', declineColor: '#6B7280', declineSize: 13, declineGap: 16,
  },
  spacer: { height: 24 },
  line: { color: '#E5E7EB', thickness: 1, style: 'solid', width: 100 },
  coupon: { code: 'DESCONTO10', description: 'Seu cupom de desconto:', bgColor: '#FFF7ED', borderColor: '#F97316', borderStyle: 'dashed', fontSize: 20 },
  countdown: { endDate: '', style: 'dark', numberColor: '#FFFFFF', labelColor: '#9CA3AF', boxColor: '#1F2937', fontSize: 28, labels: { days: 'DIAS', hours: 'HORAS', minutes: 'MIN', seconds: 'SEG' } },
  // Jogos: o prêmio de cada segmento aponta para a oferta do bloco de cupom
  // (base, um nível progressivo ou nada). Rótulos iguais em segmentos
  // diferentes são normais — a roleta fica mais cheia sem inventar prêmio.
  wheel: {
    segments: [
      { id: 's1', label: '10% OFF', prize: 'base', weight: 35, color: '#F97316' },
      { id: 's2', label: 'Quase!', prize: 'none', weight: 15, color: '#111827' },
      { id: 's3', label: '10% OFF', prize: 'base', weight: 35, color: '#FDBA74' },
      { id: 's4', label: 'Tente de novo', prize: 'none', weight: 15, color: '#374151' },
    ],
    buttonText: 'Girar a roleta', size: 320, labelSize: 13, labelColor: '#FFFFFF', strokeColor: '#FFFFFF', pointerColor: '#111827', rimColor: '#111827', sound: true,
    dividerWidth: 2, rimWidth: 17, rimLights: true,
    // Miolo vazado e tocável por padrão: o convite fica no centro, onde o
    // olho já está, em vez de num botão embaixo que disputa com o e-mail.
    hubRadius: 72, hubMode: 'tap', hubText: 'Toque para girar', hubBg: '#FFFFFF', hubColor: '#111827', hubFontSize: 14,
    bgColor: '#F97316', textColor: '#FFFFFF', fontSize: 15, borderRadius: 8, fullWidth: false,
  },
  // Cartas: viradas para baixo, o visitante escolhe uma e ela vira em 3D
  // no envio. Escolher é o jogo — e o prêmio continua sendo do servidor.
  cards: {
    segments: [
      { id: 's1', label: '10% OFF', prize: 'base', weight: 50, color: '#F97316' },
      { id: 's2', label: 'Frete grátis', prize: 'none', weight: 30, color: '#111827' },
      { id: 's3', label: 'Não foi dessa vez', prize: 'none', weight: 20, color: '#374151' },
    ],
    buttonText: 'Revelar', count: 3, cardWidth: 96, cardHeight: 128, cardRadius: 12, gap: 12,
    backColor: '#FFFFFF', backText: '?', backTextColor: '#F97316',
    faceBg: '#111827', faceColor: '#FFFFFF', faceSize: 15,
    teaserText: '★', teaserBg: '#F3F4F6', teaserColor: '#9CA3AF',
    lockedText: 'Deixe seu e-mail para virar a última carta', lockedColor: '#6B7280',
    bgColor: '#F97316', textColor: '#FFFFFF', fontSize: 15, borderRadius: 8, fullWidth: false,
  },
  scratch: {
    segments: [
      { id: 's1', label: '10% OFF', prize: 'base', weight: 80, color: '#F97316' },
      { id: 's2', label: 'Não foi dessa vez', prize: 'none', weight: 20, color: '#111827' },
    ],
    buttonText: 'Raspar', width: 320, height: 190, coverStyle: 'foil', coverImage: '', coverColor: '#C0C6CF', coverText: 'Raspe aqui', coverTextColor: '#FFFFFF', prizeBg: '#FFF7ED', prizeColor: '#F97316', prizeSize: 26, cardRadius: 14,
    bgColor: '#F97316', textColor: '#FFFFFF', fontSize: 15, borderRadius: 8, fullWidth: false,
  },
}

const defaultDesign: PopupDesign = {
  formType: 'popup',
  steps: [{ id: DEFAULT_IDS.step, name: 'Etapa 1', blocks: [
    { id: DEFAULT_IDS.blockText, type: 'text', props: { ...defaultProps.text } },
    { id: DEFAULT_IDS.blockEmail, type: 'email', props: { ...defaultProps.email } },
    { id: DEFAULT_IDS.blockButton, type: 'button', props: { ...defaultProps.button } },
  ]}],
  successStep: { id: DEFAULT_IDS.successStep, name: 'Sucesso', blocks: [
    { id: DEFAULT_IDS.blockSuccessText, type: 'text', props: { content: 'Obrigado!', fontSize: 24, color: '#111827', fontWeight: 'bold', align: 'center' } },
  ]},
  styles: {
    width: 700, minHeight: 500, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 32, fontFamily: 'Inter, sans-serif',
    overlay: { enabled: true, color: '#000000', opacity: 50, closeOnClick: true },
    closeButton: { show: true, color: '#6B7280', size: 24 },
    sideImage: { enabled: false, src: '', position: 'left', width: 50 },
    backgroundImage: { enabled: false, src: '', overlay: { enabled: true, color: '#000000', opacity: 45, style: 'gradient' } },
    fullscreenMobile: false,
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
    frequency: {
      showAfterDays: 1,
      stopAfterSubmission: true,
      perVisitor: { enabled: false, maxShows: 1, windowDays: 7 },
    },
    targeting: { pages: 'all', pageUrls: [], excludeUrls: [] },
    scheduling: { enabled: false, startDate: '', endDate: '' },
    audience: { tags: [], listId: '', doubleOptIn: false },
    urls: { includeEnabled: false, includeUrls: [], excludeEnabled: false, excludeUrls: [] },
    location: { includeEnabled: false, includeCountries: [], excludeEnabled: false, excludeCountries: [] },
    utm: { storeOnConsent: false, filterEnabled: false, filters: [] },
    clickOutsideClose: { desktop: true, mobile: true },
    customTrigger: false,
    cart: { enabled: false, minTotal: 0, maxTotal: 0, minItems: 0, contains: { enabled: false, match: 'any', handles: [], types: [], vendors: [] } },
    experiment: { holdoutPercent: 0 },
    priority: 0,
    smartTrigger: { enabled: false, threshold: 60, minDelaySec: 20 },
    audienceTargeting: { mode: 'off', segmentIds: [], listIds: [] },
    page: { enabled: false, templates: [], productHandles: [], productTypes: [], productVendors: [], productTags: [], collectionHandles: [] },
    traffic: { enabled: false, types: [] },
    whatsapp: { doubleOptIn: false, templateName: '', templateLanguage: 'pt_BR', bodyVariables: [] },
  },
  postSubmit: { action: 'show-success', redirectUrl: '', closeDelay: 4 },
  successMessage: '',
  errorMessage: '',
}

// Render-safety fallback when design.steps is empty AND the active index is
// stale (e.g. right after an undo that removed steps). Stable ID: hydration.
const EMPTY_FALLBACK_STEP: Step = { id: 'empty-fallback-step', name: 'Etapa 1', blocks: [] }

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
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${checked ? 'bg-zinc-900' : 'bg-gray-200'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

// ── Experimento A/B ──────────────────────────────────────────────────────────
// O popup é a variante A. Cada variante extra é uma cópia editável; o
// experimento sorteia por visitante e o cron declara a vencedora.
type ExperimentBundle = {
  parent: { id: string; name: string; status: string }
  experiment: null | {
    id: string; status: 'draft' | 'running' | 'ended'; mode: 'split' | 'bandit'; kpi: 'submit' | 'optin' | 'revenue'
    split: Record<string, number>; min_sample: number; max_days: number; confidence: number; auto_apply_winner: boolean; bandit_min_views: number
    started_at: string | null; ended_at: string | null; winner_variant_id: string | null; end_reason: string | null; stats: any
  }
  variants: Array<{ id: string; label: string; name: string; is_control: boolean; status: string }>
  split: Record<string, number>
  stats: Array<{ variantId: string; impressions: number; submissions: number; optins: number; orders: number; revenue: number }>
  evaluation: null | {
    kpi: string; leaderId: string | null; winnerId: string | null; ready: boolean; reason: string
    comparisons: Array<{ variantId: string; n: number; k: number; rate: number; lift: number | null; p: number | null; significant: boolean; enoughSample: boolean }>
  }
}
const KPI_LABEL: Record<string, string> = { submit: 'Inscrições', optin: 'Opt-in de e-mail', revenue: 'Pedidos' }
const END_REASON: Record<string, string> = { manual: 'encerrado manualmente', manual_apply: 'vencedora aplicada manualmente', auto_winner: 'vencedora aplicada automaticamente', auto_control_wins: 'a versão principal venceu', max_days: 'prazo esgotado sem vencedora' }

function ExperimentDrawer({ formId, formName, formStatus, dirty, onClose, onOpenVariant, onApplied }: { formId: string; formName: string; formStatus: string; dirty: boolean; onClose: () => void; onOpenVariant: (id: string) => void; onApplied: () => void }) {
  const [data, setData] = useState<ExperimentBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [split, setSplit] = useState<Record<string, number>>({})
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/forms/${formId}/experiment`, { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'erro')
      setData(d); setSplit(d.split || {}); setError(null)
    } catch (e: any) { setError(e?.message || 'Não foi possível carregar o experimento') }
  }, [formId])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  // Foco entra no botão de fechar e volta para onde estava ao sair.
  const closeRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    return () => { try { prev?.focus() } catch { /* elemento pode ter sumido */ } }
  }, [])
  const act = async (action: string, extra: Record<string, any> = {}) => {
    setBusy(action)
    try {
      const r = await fetch(`/api/forms/${formId}/experiment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'erro')
      setData(d); setSplit(d.split || {}); setError(null)
      // Aplicar a vencedora troca o design do popup principal no servidor:
      // o editor recarrega para não salvar por cima com a versão antiga.
      if (action === 'apply_winner') onApplied()
    } catch (e: any) { setError(e?.message || 'Não foi possível atualizar') }
    finally { setBusy(null) }
  }
  const exp = data?.experiment || null
  const running = exp?.status === 'running'
  const ended = exp?.status === 'ended'
  const variants = data?.variants || []
  const splitTotal = Object.values(split).reduce((a, b) => a + (Number(b) || 0), 0)
  const cmp = (id: string) => data?.evaluation?.comparisons.find(c => c.variantId === id)
  const st = (id: string) => data?.stats.find(x => x.variantId === id)
  const fmtP = (p: number | null) => p == null ? '—' : p < 0.001 ? '<0,001' : p.toFixed(3).replace('.', ',')
  const pct1 = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`
  const winnerName = exp?.winner_variant_id ? (variants.find(v => v.id === exp.winner_variant_id)?.label || '?') : null
  return (
    <div className="fixed inset-0 z-[70] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div role="dialog" aria-modal="true" aria-label="Experimento A/B" onClick={e => e.stopPropagation()} className="relative h-full w-full max-w-[520px] bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.08em]">Experimento A/B</p>
            <h2 className="text-[15px] font-semibold text-gray-900 mt-0.5 truncate max-w-[380px]">{formName}</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {!exp ? 'Sem experimento. Crie uma variante para começar.' : running ? `Em andamento desde ${exp.started_at ? new Date(exp.started_at).toLocaleDateString('pt-BR') : 'hoje'} · KPI ${KPI_LABEL[exp.kpi]}` : ended ? `Encerrado · ${END_REASON[exp.end_reason || ''] || exp.end_reason}${winnerName ? ` · vencedora ${winnerName}` : ''}` : 'Rascunho — configure e inicie.'}
            </p>
          </div>
          <button ref={closeRef} onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {error && <p className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          {formStatus !== 'published' && <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">O popup não está ativo: o experimento só recebe visitantes quando o popup principal estiver no ar.</p>}
          {dirty && <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Há alterações não salvas neste popup. Salve antes de criar variantes — a cópia parte do que está salvo.</p>}

          {/* Variantes */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">Variantes</p>
              {!running && variants.length < 4 && (
                <button onClick={() => act('create_variant')} disabled={!!busy} className="text-[12px] font-semibold text-zinc-900 underline underline-offset-2 disabled:opacity-50">{busy === 'create_variant' ? 'Criando…' : '+ Criar variante'}</button>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
              {variants.map(v => {
                const c = cmp(v.id); const s = st(v.id)
                const isWinner = exp?.winner_variant_id === v.id || (data?.evaluation?.winnerId === v.id)
                const isLeader = !isWinner && data?.evaluation?.leaderId === v.id && (s?.impressions || 0) > 0
                return (
                  <div key={v.id} className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold ${v.is_control ? 'bg-gray-900 text-white' : 'bg-violet-100 text-violet-800'}`}>{v.label}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-gray-800 truncate">{v.is_control ? 'Este popup (controle)' : v.name}</p>
                        {(exp && exp.status !== 'draft') && (
                          <p className="text-[11px] text-gray-500 tabular-nums">
                            {(s?.impressions || 0).toLocaleString('pt-BR')} vis. · {(c?.k ?? s?.submissions ?? 0).toLocaleString('pt-BR')} {KPI_LABEL[exp.kpi]?.toLowerCase()} · {pct1(c?.rate || 0)}
                            {!v.is_control && c?.lift != null && <span className={c.lift >= 0 ? 'text-emerald-700' : 'text-red-700'}> · {c.lift >= 0 ? '+' : ''}{(c.lift * 100).toFixed(0)}%</span>}
                            {!v.is_control && c && <span className="text-gray-400"> · p {fmtP(c.p)}{c.significant ? ' · significativo' : ''}</span>}
                          </p>
                        )}
                      </div>
                      {isWinner && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 uppercase tracking-wide">vencedora</span>}
                      {isLeader && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase tracking-wide">líder</span>}
                      {!running && (
                        <div className="w-16">
                          <div className="relative"><input type="number" min={0} max={100} value={split[v.id] ?? 0} onChange={e => setSplit({ ...split, [v.id]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} onBlur={() => act('update', { patch: { split } })} className={inp + ' pr-6 text-right text-[12px] py-1'} aria-label={`Fatia da variante ${v.label}`} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">%</span></div>
                        </div>
                      )}
                      {running && <span className="text-[11px] text-gray-500 tabular-nums w-10 text-right">{split[v.id] ?? 0}%</span>}
                      {!v.is_control && <button onClick={() => onOpenVariant(v.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Editar variante"><Pencil className="w-3.5 h-3.5" /></button>}
                      {!v.is_control && !running && <button onClick={() => act('remove_variant', { variant_id: v.id })} disabled={!!busy} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600" title="Remover variante"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  </div>
                )
              })}
            </div>
            {!running && variants.length > 1 && splitTotal !== 100 && <p className="text-[11px] text-amber-700 mt-1.5">As fatias somam {splitTotal}%; ao salvar são normalizadas para 100%.</p>}
          </section>

          {exp && variants.length > 1 && (
            <section className="space-y-3">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">Regras</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="O que decide">
                  <select className={sel} value={exp.kpi} disabled={running} onChange={e => act('update', { patch: { kpi: e.target.value } })}>
                    <option value="submit">Inscrições ÷ visualizações</option>
                    <option value="optin">Opt-in de e-mail ÷ visualizações</option>
                    <option value="revenue">Pedidos ÷ visualizações</option>
                  </select>
                </Field>
                <Field label="Confiança">
                  <select className={sel} value={String(exp.confidence)} disabled={running} onChange={e => act('update', { patch: { confidence: Number(e.target.value) } })}>
                    <option value="0.9">90%</option>
                    <option value="0.95">95%</option>
                    <option value="0.99">99%</option>
                  </select>
                </Field>
                <Field label="Amostra mínima" hint="Visualizações por variante antes de decidir.">
                  <input type="number" min={20} className={inp} defaultValue={exp.min_sample} disabled={running} onBlur={e => act('update', { patch: { min_sample: Number(e.target.value) } })} />
                </Field>
                <Field label="Prazo máximo" hint="Dias. Sem vencedora até lá, encerra.">
                  <input type="number" min={1} max={180} className={inp} defaultValue={exp.max_days} disabled={running} onBlur={e => act('update', { patch: { max_days: Number(e.target.value) } })} />
                </Field>
              </div>
              <ToggleRow label="Aplicar a vencedora sozinho" hint="Quando o teste bater a confiança com a amostra mínima, o design vencedor vira o do popup e o experimento encerra."
                checked={!!exp.auto_apply_winner} onChange={v => !running && act('update', { patch: { auto_apply_winner: v } })} />
              <Field label="Modo" hint={exp.mode === 'bandit' ? `Bandit: depois de ${exp.bandit_min_views.toLocaleString('pt-BR')} visualizações por variante, a divisão passa a favorecer quem converte mais em cada contexto (página, origem, dispositivo). Sem vencedora automática.` : 'Divisão fixa com teste de significância e vencedora.'}>
                <select className={sel} value={exp.mode} disabled={running} onChange={e => act('update', { patch: { mode: e.target.value } })}>
                  <option value="split">Teste A/B (divisão fixa)</option>
                  <option value="bandit">Otimização contínua (bandit)</option>
                </select>
              </Field>
              {exp.mode === 'bandit' && (
                <Field label="Visualizações mínimas por variante para o bandit assumir">
                  <input type="number" min={100} className={inp} defaultValue={exp.bandit_min_views} disabled={running} onBlur={e => act('update', { patch: { bandit_min_views: Number(e.target.value) } })} />
                </Field>
              )}
            </section>
          )}

          {data?.evaluation && exp && exp.status !== 'draft' && (
            <section className="rounded-lg border border-gray-200 p-3 text-[12px] text-gray-700 space-y-1">
              <p className="font-semibold text-gray-900">Leitura</p>
              {data.evaluation.reason === 'no_data' && <p>Ainda sem visualizações.</p>}
              {data.evaluation.reason === 'sample_too_small' && <p>Amostra ainda pequena: cada variante precisa de {exp.min_sample.toLocaleString('pt-BR')} visualizações. {data.evaluation.leaderId && <>Por enquanto a variante {variants.find(v => v.id === data.evaluation!.leaderId)?.label} lidera — sem valor estatístico ainda.</>}</p>}
              {data.evaluation.reason === 'not_significant' && <p>Diferença dentro do ruído: nenhuma variante bate a outra com {Math.round(exp.confidence * 100)}% de confiança. O teste segue até o prazo.</p>}
              {data.evaluation.reason === 'winner' && <p className="text-emerald-800">A variante {variants.find(v => v.id === data.evaluation!.winnerId)?.label} vence a versão principal com {Math.round(exp.confidence * 100)}% de confiança.</p>}
              {data.evaluation.reason === 'control_wins' && <p className="text-emerald-800">A versão principal venceu: nenhuma variante a supera.</p>}
              {running && exp.mode === 'bandit' && exp.stats?.bandit && <p className="text-gray-500">Bandit {exp.stats.bandit.eligible ? 'ativo: a divisão já segue as conversões por contexto.' : 'ainda observando — a divisão fixa vale até a amostra mínima.'}</p>}
            </section>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-400">As variantes compartilham gatilhos, segmentação e cupom do popup principal.</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            {running && data?.evaluation?.winnerId && !exp?.auto_apply_winner && (
              <button onClick={() => act('apply_winner', { variant_id: data.evaluation!.winnerId })} disabled={!!busy || dirty} title={dirty ? 'Salve ou descarte as alterações deste popup antes de aplicar a vencedora.' : undefined} className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Aplicar vencedora</button>
            )}
            {running && <button onClick={() => act('stop')} disabled={!!busy} className="px-3 py-1.5 text-[12px] font-semibold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">Encerrar</button>}
            {!running && variants.length > 1 && (
              <button onClick={() => act('start', { patch: { split } })} disabled={!!busy} className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-50">{busy === 'start' ? 'Iniciando…' : ended ? 'Rodar de novo' : 'Iniciar experimento'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Lista de caixas de seleção com rolagem, para segmentos e listas.
function CheckList({ items, selected, onToggle }: { items: Array<{ id: string; name: string }>; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
      {items.map(it => (
        <label key={it.id} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-gray-700 cursor-pointer hover:bg-gray-50">
          <input type="checkbox" className="rounded border-gray-300" checked={selected.includes(it.id)} onChange={() => onToggle(it.id)} />
          <span className="truncate">{it.name}</span>
        </label>
      ))}
    </div>
  )
}

function LinesTextarea({ value, onChange, rows = 2, className, placeholder, transform }: {
  value: string[]; onChange: (lines: string[]) => void; rows?: number; className?: string; placeholder?: string; transform?: (s: string) => string
}) {
  const joined = (value || []).join('\n')
  const [raw, setRaw] = useState(joined)
  useEffect(() => {
    // Mudança vinda de fora (undo, troca de bloco): ressincroniza sem
    // apagar a linha em branco que a pessoa acabou de abrir.
    if (splitLines(raw, transform).join('\n') !== joined) setRaw(joined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined])
  return (
    <textarea rows={rows} className={className} placeholder={placeholder} value={raw}
      onChange={e => { setRaw(e.target.value); onChange(splitLines(e.target.value, transform)) }} />
  )
}

// Panel-level color field
function PanelColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:border-zinc-900 focus-within:ring-1 focus-within:ring-zinc-900/10">
        <input type="text" className="flex-1 px-3 py-2 text-[13px] font-mono text-gray-800 outline-none" value={value || ''} onChange={e => onChange(e.target.value)} placeholder="#000000" />
        <label className="relative w-9 h-9 border-l border-gray-200 cursor-pointer flex-shrink-0" style={{ backgroundColor: value || '#FFFFFF' }}>
          <input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
      </div>
    </Field>
  )
}

const inp = "w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-colors"
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
    // `bold` (script-side prop) wins; otherwise honor the "Peso" select
    // (inputFontWeight) so the preview reflects what the merchant picked.
    fontWeight: p.bold ? 700 : (Number(p.inputFontWeight) || 400),
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
  onFocus,
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
  onFocus?: () => void
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
      onFocus={() => { if (editable) onFocus?.() }}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const txt = e.currentTarget.innerText.replace(/\u00A0/g, ' ')
        if (txt !== (value ?? '')) onCommit(txt)
      }}
      onClick={(e: React.MouseEvent) => { if (editable) e.stopPropagation() }}
      onMouseDown={(e: React.MouseEvent) => {
        // Stop propagation BEFORE the focus event, so the outer block's
        // click-to-select doesn't override the contentEditable's native
        // cursor-positioning. This makes a click on the text put the caret
        // exactly where the user clicked, like in Omnisend.
        if (editable) e.stopPropagation()
      }}
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
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700;800&family=Roboto:wght@400;500;700&family=Open+Sans:wght@400;500;600;700&display=swap" />
      <style dangerouslySetInnerHTML={{ __html: `
      .worder-inline-editable:empty:before {
        content: attr(data-placeholder);
        color: rgba(0,0,0,0.3);
        pointer-events: none;
      }
      .worder-inline-editable[contenteditable="true"] { cursor: text; }
      .worder-inline-editable[contenteditable="true"]:hover {
        box-shadow: 0 0 0 1px rgba(24, 24, 27, 0.18) inset;
      }
      .worder-inline-editable[contenteditable="true"]:focus {
        box-shadow: 0 0 0 2px rgba(24, 24, 27, 0.55) inset;
      }
    ` }} />
    </>
  )
}

// ── Block Renderer (canvas) ────────────────────────────────────────────────────
// Como a oferta base é escrita onde o lojista digita {{offer}}. Mesma regra
// do runtime (offerText): rótulo manual > tipo/valor do desconto.
function offerLabelOf(cp: any): string {
  if (!cp) return ''
  if (cp.offerLabel) return String(cp.offerLabel)
  if (cp.discountType === 'free_shipping') return 'Frete grátis'
  if (cp.discountType === 'fixed_amount' || cp.discountType === 'fixed') return `R$ ${Math.round(Number(cp.discountValue) * 100) / 100} OFF`
  return `${Math.round(Number(cp.discountValue) || 0)}% OFF`
}
function applyOfferPreview(text: string, label: string | undefined, prize?: string): string {
  if (label === undefined) return text
  return String(text || '').replace(/\{\{\s*offer\s*\}\}/g, label).replace(/\{\{\s*prize\s*\}\}/g, prize || '')
}
const GAME_TYPES = new Set(['wheel', 'scratch', 'cards'])
// O que impede publicar: erros que o visitante veria como popup quebrado.
function publishProblems(design: PopupDesign): string[] {
  const out: string[] = []
  const all = [...design.steps, design.successStep].filter(Boolean).flatMap(st => st.blocks || [])
  const hasCoupon = all.some(b => b.type === 'coupon')
  for (const b of all) {
    const segs = gameSegments(b.props)
    if (b.type === 'wheel' && segs.length < 2) out.push('A roleta precisa de pelo menos dois segmentos para ir ao ar.')
    if (b.type === 'scratch' && segs.length < 1) out.push('A raspadinha precisa de pelo menos um prêmio para ir ao ar.')
    if (b.type === 'cards' && segs.length < 2) out.push('As cartas precisam de pelo menos dois prêmios para ir ao ar.')
    if (GAME_TYPES.has(b.type) && !hasCoupon) out.push('O jogo promete um prêmio, mas não há bloco de cupom na etapa de sucesso.')
    if (b.type === 'countdown' && !b.props?.endDate) out.push('A contagem regressiva está sem data final — ficaria zerada na loja.')
  }
  // Jogo sem botão próprio depende do botão da etapa. Se a etapa não tem
  // nenhum botão de envio, o visitante não tem como jogar — o popup abre e
  // fica de enfeite, sem nada quebrado à vista.
  for (const st of design.steps) {
    const blocks = st.blocks || []
    if (!blocks.some(b => GAME_TYPES.has(b.type) && b.props?.showButton === false)) continue
    if (!blocks.some(b => b.type === 'button' && (b.props?.action || 'submit') === 'submit')) {
      out.push('O jogo está sem botão próprio e a etapa não tem botão de envio — ninguém conseguiria jogar.')
    }
  }
  return Array.from(new Set(out))
}
// Alternância estrita entre a cor da marca e o escuro. Seis tons
// diferentes (laranja, preto, laranja claro, cinza…) viram uma roleta
// suja: o olho não acha o padrão, e sem padrão não há roda.
const GAME_PALETTE = ['#F97316', '#111827', '#F97316', '#111827', '#F97316', '#111827', '#F97316', '#111827']
function gameSegments(p: any): Array<{ id: string; label: string; prize: string; weight: number; color: string; textColor?: string }> {
  const list: any[] = Array.isArray(p?.segments) ? p.segments.slice(0, 12) : []
  return list.map((s, i) => ({
    id: String(s?.id || `s${i + 1}`), label: String(s?.label || `Prêmio ${i + 1}`).slice(0, 40), prize: String(s?.prize || 'base'),
    weight: Math.max(0, Number(s?.weight) || 0), color: /^#[0-9a-fA-F]{6}$/.test(String(s?.color || '')) ? s.color : GAME_PALETTE[i % GAME_PALETTE.length],
    textColor: /^#[0-9a-fA-F]{6}$/.test(String(s?.textColor || '')) ? s.textColor : undefined,
  }))
}
function GameButtonPreview({ p, fallback }: { p: any; fallback: string }) {
  // showButton:false → o jogo vai sozinho e quem dispara é o botão da
  // etapa. É como as referências mostram o cartão e a roleta.
  if (p?.showButton === false) return null
  return <button type="button" style={{ marginTop: 14, padding: `${p.paddingV || 14}px ${p.paddingH || 28}px`, background: p.bgColor || '#F97316', color: p.textColor || '#fff', fontSize: p.fontSize || 15, fontWeight: 700, border: 'none', borderRadius: p.borderRadius ?? 8, cursor: 'pointer', display: p.fullWidth ? 'block' : 'inline-block', width: p.fullWidth ? '100%' : 'auto' }}>{p.buttonText || fallback}</button>
}

/** Clareia (amt>0) ou escurece um #rrggbb. Espelha wfShade do runtime. */
// O acabamento da lâmina da raspadinha em CSS — o mesmo que paintFoil
// pinta no canvas do runtime. Os dois têm de casar: a pré-visualização
// que mostra outra coisa é o bug que esta tela já pagou caro.
function laminaCss(p: any, cor: string): string {
  const estilo = p?.coverStyle || 'foil'
  if (estilo === 'image') {
    return p?.coverImage ? `url("${String(p.coverImage).replace(/"/g, '%22')}")` : 'none'
  }
  if (estilo === 'solid') return 'none'
  if (estilo === 'gold') {
    // Ouro não é uma cor só: é uma sequência de claros e escuros. Um
    // dourado chapado lê como amarelo mostarda.
    return 'linear-gradient(135deg, #8C6D1F 0%, #E8C766 22%, #FFF3C4 42%, #D8AE3E 55%, #B8892A 78%, #F0D07A 100%), repeating-linear-gradient(135deg, rgba(255,255,255,.16) 0 1px, transparent 1px 7px)'
  }
  return `linear-gradient(135deg, ${shadeHex(cor, 20)} 0%, ${cor} 45%, ${shadeHex(cor, 12)} 55%, ${shadeHex(cor, -16)} 100%), repeating-linear-gradient(135deg, rgba(255,255,255,.10) 0 1px, transparent 1px 12px)`
}
function shadeHex(hex: string, amt: number): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex || ''))
  if (!m) return String(hex || '#C0C6CF')
  const n = parseInt(m[1], 16)
  const cl = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)
  const r = cl((n >> 16) + amt), g = cl(((n >> 8) & 255) + amt), b = cl((n & 255) + amt)
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

const NO_LAYOUT_BORDER = new Set(['email', 'phone', 'name-input', 'text-input', 'date-input', 'dropdown', 'radio', 'checkbox', 'legal-consent', 'coupon', 'countdown', 'wheel', 'scratch', 'cards'])
const NO_LAYOUT_SHADOW = new Set(['wheel', 'scratch', 'cards', 'image'])

function BlockPreview({ block, selected, onContentChange, onSelect, offerLabel, prizeLabel }: { block: Block; selected?: boolean; onContentChange?: (key: string, value: string) => void; onSelect?: () => void; offerLabel?: string; prizeLabel?: string }) {
  const p = block.props
  const blockStyle: React.CSSProperties = {
    marginTop: p.marginTop || 0, marginBottom: p.marginBottom ?? 8,
    padding: p.blockPadding || 0, backgroundColor: p.blockBg || undefined,
    borderRadius: p.blockRadius || 0,
    // Mesmas exceções do runtime (blockStyleStr com noBorder/noShadow):
    // blocos com moldura própria não recebem a borda do layout.
    border: p.borderWidth && !NO_LAYOUT_BORDER.has(block.type) ? `${p.borderWidth}px ${p.borderStyle || 'solid'} ${p.borderColor || '#E5E7EB'}` : undefined,
    boxShadow: p.shadow && !NO_LAYOUT_SHADOW.has(block.type) ? p.shadow : undefined,
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
        // Always editable so a single click on the text positions the
        // caret where the user clicked (Omnisend-style). Focusing the
        // text auto-selects the block.
        return (
          <InlineEditable
            tag={Tag}
            value={p.content || ''}
            editable={true}
            autoFocus={false}
            placeholder="Digite seu texto..."
            onCommit={(v) => onContentChange('content', v)}
            onFocus={onSelect}
            style={textStyle}
          />
        )
      }
      return <Tag style={textStyle}>{applyOfferPreview(p.content, offerLabel, prizeLabel)}</Tag>
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
            editable={true}
            autoFocus={false}
            singleLine
            placeholder="Clique para editar..."
            onCommit={(v) => onContentChange('text', v)}
            onFocus={onSelect}
            style={btnStyle}
          />
        ) : (
          <button
            onMouseEnter={e => { if (p.hoverColor) (e.currentTarget as HTMLButtonElement).style.backgroundColor = p.hoverColor }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = p.bgColor || '#F97316' }}
            style={btnStyle}>{applyOfferPreview(p.text, offerLabel, prizeLabel) || 'Enviar'}</button>
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
    // Prop-less spacers render 24px on the storefront (generator.ts
    // nv(p.height,24)); match that default here so the canvas doesn't
    // under-draw the gap. New inserts already carry height: 24.
    // Escolhas: o mesmo empilhado que o runtime desenha. Clicar responde
    // E avança — na tela de edição os botões são só a forma.
    case 'choice': {
      const opts: any[] = Array.isArray(p.options) ? p.options.slice(0, 8) : []
      if (!opts.length) return <div style={{ ...blockStyle, padding: 16, textAlign: 'center', border: '1px dashed #FCA5A5', borderRadius: 8, color: '#B91C1C', fontSize: 12 }}>Adicione pelo menos uma opção.</div>
      return <div style={blockStyle}>
        {p.showLabel !== false && p.label && (
          <div style={{ fontSize: p.labelSize || 17, color: p.labelColor || '#111827', textAlign: 'center', margin: `0 0 ${p.labelGap ?? 16}px` }}>{p.label}</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: p.gap ?? 10 }}>
          {opts.map((o: any, i: number) => (
            <button key={o?.id || i} type="button" style={{
              boxSizing: 'border-box', display: 'block', width: '100%',
              padding: `${p.paddingV ?? 16}px ${p.paddingH ?? 18}px`,
              background: p.optionBg || '#FFFFFF', color: p.optionColor || '#111827',
              fontSize: p.fontSize || 16, fontWeight: (p.fontWeight as any) || 600, lineHeight: 1.25, textAlign: 'center',
              textTransform: p.uppercase ? 'uppercase' : 'none', letterSpacing: p.uppercase ? (p.letterSpacing ?? 1) : undefined,
              border: (p.borderWidth ?? 1) > 0 ? `${p.borderWidth ?? 1}px solid ${p.borderColor || '#E5E7EB'}` : 'none',
              borderRadius: p.borderRadius ?? 4, cursor: 'pointer',
            }}>{String(o?.label ?? o ?? '')}</button>
          ))}
        </div>
        {p.declineText && (
          <button type="button" style={{ display: 'block', margin: `${p.declineGap ?? 16}px auto 0`, background: 'none', border: 'none', padding: 4, fontSize: p.declineSize || 13, color: p.declineColor || '#6B7280', textDecoration: 'underline', cursor: 'pointer' }}>{p.declineText}</button>
        )}
      </div>
    }
    case 'spacer': return <div style={{ ...blockStyle, height: p.height ?? 24 }} />
    case 'line': return <div style={blockStyle}><hr style={{ border: 'none', borderTop: `${p.thickness || 1}px ${p.style || 'solid'} ${p.color || '#E5E7EB'}`, margin: '0 auto', width: `${p.width ?? 100}%` }} /></div>
    case 'coupon': {
      const unique = p.mode === 'unique' || p.mode === 'dynamic'
      const preview = unique ? `${(p.codePrefix || 'POPUP').toUpperCase()}-XXXXXXXX` : (p.code || 'CODIGO')
      const applied = unique && p.showCode === false
      return <div style={{ ...blockStyle, padding: '16px', border: `2px ${p.borderStyle || 'dashed'} ${p.borderColor || '#F97316'}`, borderRadius: p.borderRadius ?? 8, textAlign: 'center', background: p.bgColor || '#FFF7ED' }}>
        {applied ? (
          <p style={{ fontSize: Math.round((p.fontSize || 20) * 0.8), fontWeight: 700, color: p.codeColor || '#F97316', margin: 0 }}>{p.appliedText || 'Desconto aplicado no seu carrinho'}</p>
        ) : (
          <>
            <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 4px' }}>{p.description}</p>
            <p style={{ fontSize: p.fontSize || 20, fontWeight: 700, color: p.codeColor || '#F97316', letterSpacing: 2, margin: 0 }}
              title={unique ? 'Cada inscrito recebe um código único' : 'Clique para copiar'}>{preview}</p>
            {unique && <p style={{ fontSize: 10, color: '#9CA3AF', margin: '6px 0 0' }}>código único por inscrito</p>}
            {Array.isArray(p.tiers) && p.tiers.length > 0 && <p style={{ fontSize: 10, color: '#9CA3AF', margin: '4px 0 0' }}>+{p.tiers.length} {p.tiers.length === 1 ? 'nível progressivo' : 'níveis progressivos'}</p>}
          </>
        )}
      </div>
    }
    case 'wheel': {
      // A pré-visualização é a MESMA peça que vai ao ar: disco, aro com
      // volume, pinos nas divisões, brilho fixo no alto, cubo no centro e
      // o ponteiro em forma de alfinete. O que o lojista arruma aqui é o
      // que o visitante vê girar.
      const segs = gameSegments(p)
      const size = Math.max(200, Math.min(460, Number(p.size) || 320))
      if (segs.length < 2) return <div style={{ ...blockStyle, padding: 16, textAlign: 'center', border: '1px dashed #FCA5A5', borderRadius: 8, color: '#B91C1C', fontSize: 12 }}>A roleta precisa de pelo menos dois segmentos.</div>
      const rim = p.rimColor || '#111827'
      const ptr = p.pointerColor || '#111827'
      const hub = p.strokeColor || '#FFFFFF'
      const gid = `wprev-${String(block.id).replace(/[^a-zA-Z0-9_-]/g, "")}`
      // Miolo vazado: a roleta vira anel e o centro pode ser o botão.
      const hubR = Math.max(0, Math.min(WHEEL_R - 8, Number(p.hubRadius) || 0))
      const tap = p.hubMode === 'tap' && hubR >= 30
      const rimW = Math.max(4, Math.min(34, Number(p.rimWidth) || WHEEL_RIM_W))
      const rimR = WHEEL_R + rimW / 2 - 2.5
      return <div style={{ ...blockStyle, textAlign: 'center' }}>
        <div style={{ position: 'relative', display: 'inline-block', width: size, maxWidth: '100%', filter: 'drop-shadow(0 14px 28px rgba(0,0,0,.24))' }}>
          <svg viewBox="0 0 300 300" role="img" aria-label="Roleta de prêmios" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
            <defs>
              <linearGradient id={`${gid}-rim`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={shadeHex(rim, 46)} />
                <stop offset=".48" stopColor={rim} />
                <stop offset="1" stopColor={shadeHex(rim, -30)} />
              </linearGradient>
              <radialGradient id={`${gid}-sheen`} cx=".33" cy=".24" r=".8">
                <stop offset="0" stopColor="#FFFFFF" stopOpacity=".3" />
                <stop offset=".52" stopColor="#FFFFFF" stopOpacity=".05" />
                <stop offset="1" stopColor="#000000" stopOpacity=".16" />
              </radialGradient>
            </defs>
            <circle cx={150} cy={150} r={rimR} fill="none" stroke={`url(#${gid}-rim)`} strokeWidth={rimW} />
            <g>
              {segs.map((sg, i) => {
                const lp = wheelLabelPos(i, segs.length, WHEEL_R, WHEEL_C, hubR)
                return <g key={sg.id + i}>
                  <path d={wheelSectorPath(i, segs.length, WHEEL_R, WHEEL_C, hubR)} fill={sg.color} stroke={hub} strokeWidth={p.dividerWidth ?? 2} />
                  <text x={lp.x} y={lp.y} transform={`rotate(${lp.angle} ${lp.x} ${lp.y})`} textAnchor="middle" dominantBaseline="middle" fontSize={p.labelSize || 13} fontWeight={800} fill={sg.textColor || p.labelColor || '#FFFFFF'}>{sg.label}</text>
                </g>
              })}
              {segs.map((sg, i) => {
                const pin = wheelPinPos(i, segs.length)
                return <circle key={`pin${sg.id}${i}`} cx={pin.x} cy={pin.y} r={3.2} fill="#FFFFFF" fillOpacity={0.92} />
              })}
            </g>
            <circle cx={150} cy={150} r={WHEEL_R} fill={`url(#${gid}-sheen)`} pointerEvents="none" />
            <circle cx={150} cy={150} r={WHEEL_R + 0.5} fill="none" stroke="rgba(255,255,255,.45)" strokeWidth={1.5} />
            {/* As luzinhas do aro não giram: é o que faz o aro parecer a
                moldura da máquina, e não a borda do desenho que roda. */}
            {p.rimLights !== false && Array.from({ length: Math.min(24, Math.max(12, segs.length * 3)) }).map((_, i, arr) => {
              const a = (i * 360 / arr.length - 90) * Math.PI / 180
              return <circle key={`luz${i}`} cx={(150 + rimR * Math.cos(a)).toFixed(2)} cy={(150 + rimR * Math.sin(a)).toFixed(2)} r={2.3} fill="#FFFFFF" fillOpacity={i % 2 ? 0.32 : 0.62} />
            })}
            {hubR <= 0 && <>
              <circle cx={150} cy={150} r={26} fill={hub} />
              <circle cx={150} cy={150} r={26} fill="none" stroke="rgba(0,0,0,.12)" strokeWidth={1} />
              <circle cx={150} cy={150} r={8.5} fill={ptr} />
            </>}
          </svg>
          {tap && (
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: `${(200 * hubR / 300).toFixed(2)}%`, transform: 'translate(-50%,-50%)', zIndex: 3 }}>
              <div style={{
                width: '100%', padding: '50% 0', position: 'relative', borderRadius: '50%',
                background: p.hubBg || '#FFFFFF', color: p.hubColor || '#111827', boxShadow: '0 4px 14px rgba(0,0,0,.22)',
              }}>
                <span style={{ position: 'absolute', left: '10%', right: '10%', top: '50%', transform: 'translateY(-50%)', fontSize: p.hubFontSize || 14, fontWeight: 800, lineHeight: 1.15, letterSpacing: '.4px', textTransform: 'uppercase', textAlign: 'center' }}>{p.hubText || 'Toque para girar'}</span>
              </div>
            </div>
          )}
          <div style={{ position: 'absolute', left: '50%', top: -3, width: 30, height: 46, marginLeft: -15, zIndex: 2, pointerEvents: 'none' }}>
            <svg viewBox="0 0 30 46" width={30} height={46} aria-hidden="true" style={{ display: 'block', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.32))' }}>
              <path d="M15 46 L4.4 17.5 A11 11 0 1 1 25.6 17.5 Z" fill={ptr} stroke="#FFFFFF" strokeWidth={2.6} strokeLinejoin="round" />
              <circle cx={15} cy={14.5} r={3.4} fill="#FFFFFF" fillOpacity={0.92} />
            </svg>
          </div>
        </div>
        <GameButtonPreview p={p} fallback="Girar" />
      </div>
    }
    // Cartas: viradas para baixo, como o visitante vê antes de escolher.
    // Aqui na tela de edição elas não viram — quem vira é o runtime, no
    // envio, e a pré-visualização roda o runtime.
    case 'cards': {
      const segs = gameSegments(p)
      if (segs.length < 2) return <div style={{ ...blockStyle, padding: 16, textAlign: 'center', border: '1px dashed #FCA5A5', borderRadius: 8, color: '#B91C1C', fontSize: 12 }}>As cartas precisam de pelo menos dois prêmios.</div>
      const n = Math.max(2, Math.min(5, Number(p.count) || 3))
      const cw = Math.max(60, Math.min(160, Number(p.cardWidth) || 96))
      const ch = Math.max(80, Math.min(220, Number(p.cardHeight) || 128))
      return <div style={{ ...blockStyle, textAlign: 'center' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: p.gap ?? 12 }}>
          {Array.from({ length: n }).map((_, i) => (
            <div key={`cd${i}`} style={{
              width: cw, height: ch, flex: '0 0 auto', borderRadius: p.cardRadius ?? 12,
              background: p.backColor || '#FFFFFF', color: p.backTextColor || '#F97316',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: Math.round(ch * 0.34), fontWeight: 800, boxShadow: '0 6px 16px rgba(0,0,0,.16)',
            }}>{String(p.backText || '?').slice(0, 3)}</div>
          ))}
        </div>
        <GameButtonPreview p={p} fallback="Revelar" />
      </div>
    }
    case 'scratch': {
      // A pré-visualização tem de ser a MESMA coisa que vai ao ar. Antes,
      // aqui, a cobertura era um polígono cinza com zigue-zague — um
      // borrão que não existe em lugar nenhum do runtime, e que fazia o
      // lojista achar que a raspadinha era isso.
      const segs = gameSegments(p)
      const w = Math.max(160, Math.min(480, Number(p.width) || 320))
      const h = Math.max(80, Math.min(360, Number(p.height) || 190))
      const foil = p.coverColor || '#C0C6CF'
      return <div style={{ ...blockStyle, textAlign: 'center' }}>
        <div style={{ position: 'relative', display: 'inline-block', width: w, maxWidth: '100%', height: h, borderRadius: p.cardRadius ?? 14, overflow: 'hidden', background: p.prizeBg || '#FFF7ED', boxShadow: '0 6px 20px rgba(0,0,0,.14)' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, fontSize: p.prizeSize || 26, fontWeight: 800, color: p.prizeColor || '#F97316', lineHeight: 1.2 }}>{segs[0]?.label || '?'}</div>
          {/* A lâmina: o MESMO acabamento que o runtime pinta no canvas —
              metalizado, dourado escovado, cor chapada ou uma foto. */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundColor: foil,
            backgroundImage: laminaCss(p, foil),
            backgroundSize: 'cover', backgroundPosition: 'center',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            color: p.coverTextColor || '#FFFFFF', fontWeight: 800, fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase', textShadow: '0 1px 2px rgba(0,0,0,.28)',
          }}>
            <Hand className="w-[22px] h-[22px]" strokeWidth={1.8} />
            <span>{p.coverText || 'Raspe aqui'}</span>
          </div>
        </div>
        <GameButtonPreview p={p} fallback="Raspar" />
      </div>
    }
    case 'countdown': {
      // Real remaining time (what the storefront shows). No endDate → zeros +
      // warning icon so the merchant sees the timer would render dead on site.
      const vals = countdownValues(p.endDate)
      const lbls = p.labels || { days: 'DIAS', hours: 'HORAS', minutes: 'MIN', seconds: 'SEG' }
      return <div style={{ ...blockStyle, position: 'relative', textAlign: 'center', padding: '16px', backgroundColor: p.boxColor || '#1F2937', borderRadius: 8 }}>
        {!p.endDate && (
          <span title="Defina a data final — sem ela o cronômetro fica zerado no site" style={{ position: 'absolute', top: 6, right: 8 }}>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          </span>
        )}
        <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>{vals.map((v, i) => (<span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{i > 0 && <span style={{ color: p.labelColor || '#9CA3AF', fontSize: 20, fontWeight: 700 }}>:</span>}<span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><span style={{ fontSize: p.fontSize || 28, fontWeight: 800, color: p.numberColor || '#FFFFFF', lineHeight: 1 }}>{v}</span><span style={{ fontSize: 9, color: p.labelColor || '#9CA3AF', marginTop: 4, letterSpacing: 1 }}>{[lbls.days, lbls.hours, lbls.minutes, lbls.seconds][i]}</span></span></span>))}</div>
      </div>
    }
    case 'legal-consent':
      return <div style={blockStyle}><label className="flex items-start gap-2" style={{ fontSize: p.fontSize || 12, color: p.color || '#6B7280', lineHeight: p.lineHeight || 1.4 }}><input type="checkbox" className="mt-0.5 flex-shrink-0" /><span dangerouslySetInnerHTML={{ __html: (p.text || '').replace(/<a /g, `<a style="color:${p.linkColor || '#F97316'};text-decoration:underline;" `) }} /></label></div>
    case 'dropdown':
      return <div style={blockStyle}>
        {p.showLabel !== false && p.label && <label className="block text-[13px] font-medium text-gray-700 mb-1">{p.label}</label>}
        <select className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm bg-white text-gray-600 outline-none">
          <option>{p.placeholder || 'Escolha...'}</option>
          {(p.options || []).map((o: string, i: number) => <option key={i}>{o}</option>)}
        </select>
      </div>
    case 'radio':
      return <div style={blockStyle}>
        {p.showLabel !== false && p.label && <label className="block text-[13px] font-medium text-gray-700 mb-1.5">{p.label}</label>}
        <div style={{ display: 'flex', flexDirection: p.layout === 'horizontal' ? 'row' : 'column', gap: p.layout === 'horizontal' ? 12 : 8 }}>
          {(p.options || []).map((o: string, i: number) => <label key={i} className="flex items-center gap-2.5 text-[13px] text-gray-700 cursor-pointer"><input type="radio" name={block.id} className="accent-orange-500" />{o}</label>)}
        </div>
      </div>
    case 'checkbox':
      return <div style={blockStyle}>
        {p.showLabel !== false && p.label && <label className="block text-[13px] font-medium text-gray-700 mb-1.5">{p.label}</label>}
        <div className="space-y-2">
          {(p.options || []).map((o: string, i: number) => <label key={i} className="flex items-center gap-2.5 text-[13px] text-gray-700 cursor-pointer"><input type="checkbox" className="rounded accent-orange-500" />{o}</label>)}
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
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => oc(!checked)}
      className={`relative w-9 h-5 rounded-full flex-shrink-0 transition-colors ${checked ? 'bg-zinc-900' : 'bg-gray-200'}`}>
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
const ColorField = ColorRow

const UnitInput = ({ value, onChange: oc, unit = 'px', min = 0, max = 999, step = 1, className = '' }: { value: number; onChange: (v: number) => void; unit?: string; min?: number; max?: number; step?: number; className?: string }) => (
  <div className={`relative ${className}`}>
    <input type="number" min={min} max={max} step={step}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-8 text-[13px] text-gray-800 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900/10 transition-colors"
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
      className="flex-1 accent-zinc-900 h-1" />
    <div className="flex items-center gap-1 w-[64px] justify-end">
      <input type="number" min={min} max={max} step={step} value={value} onChange={e => oc(+e.target.value)}
        className="w-10 px-1.5 py-1 text-[11px] text-gray-800 border border-gray-200 rounded text-center outline-none focus:border-zinc-900" />
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
      className="w-full px-2 py-1.5 pr-6 border border-gray-200 rounded-md text-[12px] text-gray-800 text-center outline-none focus:border-zinc-900"
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

const BorderStyleControl = ({ p, up, def = 'solid' }: { p: any; up: (k: string, v: any) => void; def?: string }) => (
  <Segmented value={p.borderStyle || def} onChange={v => up('borderStyle', v)} options={[
    { value: 'solid', label: '───', title: 'Sólida' },
    { value: 'dashed', label: '╌╌╌', title: 'Tracejada' },
    { value: 'dotted', label: '· · ·', title: 'Pontilhada' },
  ]} />
)

// Recompensa progressiva: o desconto cresce conforme a pessoa avança
// (10% ao entrar o e-mail, 15% depois do quiz). Cada tier é desbloqueado
// por uma etapa; vale o último tier cuja etapa foi visitada. Em modo
// único, cada tier tem o próprio estoque de códigos.
// Smart Offers: a oferta segue a intenção medida na hora de mostrar. Cada
// faixa (baixa / média / alta) recebe a base, um nível progressivo ou
// nenhuma oferta; uma fatia de controle recebe sempre a base.
// Fora do editor para não remontar (e perder o foco) a cada render.
function OfferSelectField({ value, onChange, label, hint, baseLabel, tiers }: { value: string; onChange: (v: string) => void; label: string; hint: string; baseLabel: string; tiers: any[] }) {
  return (
    <LabeledField label={label} hint={hint}>
      <select className={sel} value={value} onChange={e => onChange(e.target.value)}>
        <option value="base">Oferta base · {baseLabel}</option>
        {tiers.map((t: any) => <option key={t.id} value={t.id}>{t.label || 'Nível'} · {t.discountType === 'free_shipping' ? 'Frete grátis' : `${t.discountValue ?? 0}${t.discountType === 'fixed_amount' ? '' : '%'} OFF`}</option>)}
        <option value="none">Sem desconto (só a inscrição)</option>
      </select>
    </LabeledField>
  )
}

function SmartOfferEditor({ p, up }: { p: any; up: (k: string, v: any) => void }) {
  const so = { enabled: false, lowMax: 35, highMin: 70, lowTier: 'base', midTier: 'base', highTier: 'base', controlPercent: 20, ...(p.smartOffer || {}) }
  const set = (patch: Record<string, any>) => up('smartOffer', { ...so, ...patch })
  const tiers: any[] = Array.isArray(p.tiers) ? p.tiers : []
  const baseLabel = p.discountType === 'free_shipping' ? 'Frete grátis' : p.discountType === 'fixed_amount' ? `R$ ${p.discountValue ?? 0} OFF` : `${p.discountValue ?? 10}% OFF`
  return (
    <div className="pt-3 border-t border-gray-100 space-y-2">
      <Toggle label="Oferta por intenção" hint="Quem está quase comprando não precisa do desconto inteiro; quem chegou frio precisa de mais. A intenção é medida na hora de mostrar (rolagem, permanência, páginas, carrinho)." checked={!!so.enabled} onChange={v => set({ enabled: v })} />
      {so.enabled && (
        <div className="space-y-2">
          <p className="text-[11px] text-gray-500 leading-snug bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">Escreva <code className="px-1 bg-white border border-gray-200 rounded text-[10px]">{'{{offer}}'}</code> no texto ou no botão e a oferta escolhida aparece no lugar (ex.: "Ganhe {'{{offer}}'} agora"). Com "sem desconto", o bloco de cupom some.</p>
          <OfferSelectField value={so.lowTier} onChange={v => set({ lowTier: v })} baseLabel={baseLabel} tiers={tiers} label={`Intenção baixa (score < ${so.lowMax})`} hint="Chegou frio: aqui cabe o empurrão maior." />
          <OfferSelectField value={so.midTier} onChange={v => set({ midTier: v })} baseLabel={baseLabel} tiers={tiers} label={`Intenção média (${so.lowMax}–${so.highMin - 1})`} hint="O padrão." />
          <OfferSelectField value={so.highTier} onChange={v => set({ highTier: v })} baseLabel={baseLabel} tiers={tiers} label={`Intenção alta (score ≥ ${so.highMin})`} hint="Já ia comprar: dá para segurar margem." />
          <div className="grid grid-cols-2 gap-2">
            <LabeledField label="Baixa até">
              <div className="relative"><input type="number" min={5} max={90} className={inp + ' pr-6'} value={so.lowMax} onChange={e => set({ lowMax: Math.max(5, Math.min(90, +e.target.value || 35)) })} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">pts</span></div>
            </LabeledField>
            <LabeledField label="Alta a partir de">
              <div className="relative"><input type="number" min={10} max={95} className={inp + ' pr-6'} value={so.highMin} onChange={e => set({ highMin: Math.max(so.lowMax + 5, Math.min(95, +e.target.value || 70)) })} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">pts</span></div>
            </LabeledField>
          </div>
          <LabeledField label={`Grupo de controle · ${so.controlPercent}%`} hint="Recebe sempre a oferta base, para medir no analytics se a economia de margem custou conversão.">
            <input type="range" min={0} max={50} step={5} value={so.controlPercent} onChange={e => set({ controlPercent: +e.target.value })} className="w-full accent-zinc-900" aria-label="Grupo de controle" />
          </LabeledField>
        </div>
      )}
    </div>
  )
}

// Roleta e raspadinha: segmentos com rótulo, prêmio (oferta base, nível
// progressivo ou nada) e peso. O sorteio é do servidor no envio; aqui só
// se descreve o que pode sair e com que chance.
function GameEditor({ type, p, up, hints, onOpenMedia }: { type: string; p: any; up: (k: string, v: any) => void; hints: { hasCoupon: boolean; couponTiers: any[]; baseOfferLabel: string; gameBlocks: number }; onOpenMedia?: (cb: (url: string) => void) => void }) {
  const isWheel = type === 'wheel'
  const isCards = type === 'cards'
  const nomeDoJogo = isWheel ? 'Roleta' : isCards ? 'Cartas' : 'Raspadinha'
  const acaoPadrao = isWheel ? 'Girar' : isCards ? 'Revelar' : 'Raspar'
  const oQueFaz = isWheel ? 'a roleta para' : isCards ? 'a carta escolhida vira' : 'a raspadinha revela'
  const segs: any[] = Array.isArray(p.segments) ? p.segments : []
  const total = segs.reduce((a, s) => a + Math.max(0, Number(s?.weight) || 0), 0)
  const minSegs = type === 'scratch' ? 1 : 2
  const setSeg = (i: number, patch: Record<string, any>) => up('segments', segs.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const addSeg = () => up('segments', [...segs, { id: 's' + Math.random().toString(36).slice(2, 8), label: hints.baseOfferLabel || 'Prêmio', prize: 'base', weight: 10, color: GAME_PALETTE[segs.length % GAME_PALETTE.length] }])
  const tierText = (t: any) => t.discountType === 'free_shipping' ? 'Frete grátis' : `${t.discountValue ?? 0}${t.discountType === 'fixed_amount' ? '' : '%'} OFF`
  const Warn = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
      <p className="text-[11px] text-amber-800 leading-snug">{children}</p>
    </div>
  )
  return <div className="space-y-5">
    <div className="space-y-3">
      <SectionHeader title={nomeDoJogo} icon={<Gift className="w-3 h-3" />} />
      <p className="text-[11px] text-gray-500 leading-snug bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
        {isCards ? 'O visitante escolhe uma carta, preenche e envia' : 'O visitante preenche e envia'} — o servidor sorteia pelo peso e {oQueFaz} no prêmio decidido. O cupom sai pelo bloco de cupom, no nível escolhido aqui. Na etapa de sucesso, <code className="px-1 bg-white border border-gray-200 rounded text-[10px]">{'{{prize}}'}</code> vira o prêmio sorteado.
      </p>
      {!hints.hasCoupon && <Warn>Sem bloco de cupom neste popup: o jogo mostra o prêmio, mas nenhum código é emitido. Adicione um bloco de cupom na etapa de sucesso.</Warn>}
      {hints.gameBlocks > 1 && <Warn>Há {hints.gameBlocks} jogos neste popup. Só o primeiro sorteia; os outros ficam decorativos.</Warn>}
      {segs.length < minSegs && <Warn>{type === 'scratch' ? 'A raspadinha precisa de pelo menos um prêmio.' : `${nomeDoJogo} ${isCards ? 'precisam' : 'precisa'} de pelo menos dois prêmios.`}</Warn>}
      {isCards && segs.length < (Number(p.count) || 3) && <Warn>Há {Number(p.count) || 3} cartas e só {segs.length} prêmios. As cartas que sobram viram vazias — cadastre um prêmio por carta.</Warn>}
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">Segmentos</p>
        <button type="button" onClick={addSeg} disabled={segs.length >= 12} className="text-[11px] font-semibold text-zinc-900 underline underline-offset-2 disabled:opacity-40">Adicionar</button>
      </div>
      <div className="space-y-2">
        {segs.map((sg, i) => {
          const w = Math.max(0, Number(sg?.weight) || 0)
          const chance = total > 0 ? Math.round((w / total) * 100) : Math.round(100 / Math.max(1, segs.length))
          return (
            <div key={sg?.id || i} className="rounded-lg border border-gray-200 p-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <input type="color" value={sg?.color || GAME_PALETTE[i % GAME_PALETTE.length]} onChange={e => setSeg(i, { color: e.target.value })} className="w-7 h-7 rounded border border-gray-200 p-0 cursor-pointer flex-shrink-0" aria-label={`Cor do segmento ${i + 1}`} />
                <input className={inp + ' flex-1'} value={sg?.label || ''} onChange={e => setSeg(i, { label: e.target.value.slice(0, 40) })} placeholder="O que o visitante lê" aria-label={`Rótulo do segmento ${i + 1}`} />
                <button type="button" onClick={() => up('segments', segs.filter((_, j) => j !== i))} disabled={segs.length <= minSegs} className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 flex-shrink-0" title="Remover segmento"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="grid grid-cols-[1fr_96px] gap-2">
                <select className={sel} value={sg?.prize || 'base'} onChange={e => setSeg(i, { prize: e.target.value })} aria-label={`Prêmio do segmento ${i + 1}`}>
                  <option value="base">Oferta base{hints.baseOfferLabel ? ` · ${hints.baseOfferLabel}` : ''}</option>
                  {hints.couponTiers.map((t: any) => <option key={t.id} value={t.id}>{t.label || 'Nível'} · {tierText(t)}</option>)}
                  {sg?.prize && sg.prize !== 'base' && sg.prize !== 'none' && !hints.couponTiers.some((t: any) => t.id === sg.prize) && <option value={sg.prize}>Nível removido (vira oferta base)</option>}
                  <option value="none">Nada (só a inscrição)</option>
                </select>
                <div className="relative">
                  <input type="number" min={0} max={1000} className={inp + ' pr-9 text-right tabular-nums'} value={sg?.weight ?? 0} onChange={e => setSeg(i, { weight: Math.max(0, Math.min(1000, Math.round(Number(e.target.value) || 0))) })} aria-label={`Peso do segmento ${i + 1}`} />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 tabular-nums">{chance}%</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-gray-400 leading-snug">O peso define a chance de cada segmento (a porcentagem ao lado). Mantenha o rótulo coerente com o prêmio: quem lê "15% OFF" e recebe 10% não volta.</p>
    </div>
    <div className="pt-4 border-t border-gray-100 space-y-3">
      <SectionHeader title="Botão" icon={<MousePointerClick className="w-3 h-3" />} />
      {/* Nas referências que convertem, o jogo não tem botão grudado
          embaixo: quem dispara é o botão da etapa, no fim do formulário.
          Desligado aqui, o bloco entrega só o jogo — e o sorteio acontece
          no envio de qualquer maneira. */}
      <Toggle label="Botão junto do jogo" checked={p.showButton !== false} onChange={v => up('showButton', v)} />
      {p.showButton === false ? (
        <p className="text-[11px] text-gray-400 leading-snug">Quem dispara é o botão da etapa. Confira se existe um bloco de botão com a ação "Enviar" abaixo do jogo.</p>
      ) : (
        <>
          <LabeledField label="Texto">
            <input className={inp} value={p.buttonText || ''} onChange={e => up('buttonText', e.target.value.slice(0, 40))} placeholder={acaoPadrao} />
          </LabeledField>
          <ColorRow label="Fundo" value={p.bgColor || '#F97316'} onChange={v => up('bgColor', v)} />
          <ColorRow label="Texto" value={p.textColor || '#FFFFFF'} onChange={v => up('textColor', v)} />
          <Toggle label="Largura total" checked={!!p.fullWidth} onChange={v => up('fullWidth', v)} />
        </>
      )}
    </div>
    {isCards && (
      <div className="pt-4 border-t border-gray-100 space-y-3">
        <SectionHeader title="A trava do e-mail" icon={<AtSign className="w-3 h-3" />} />
        <p className="text-[11px] text-gray-400 leading-snug">As primeiras cartas viram de graça e mostram só um brinde. A última cobra o e-mail — e é ela que traz o prêmio. É o que transforma curiosidade em inscrição: a pessoa já gastou dois cliques, e parar ali custa mais do que preencher um campo.</p>
        <LabeledField label="Viram de graça" hint={`Sempre sobra pelo menos uma. Máximo: ${Math.max(1, (Number(p.count) || 3) - 1)}.`}>
          <Slider value={p.freeFlips == null ? (Number(p.count) || 3) - 1 : p.freeFlips} onChange={v => up('freeFlips', v)} min={0} max={Math.max(1, (Number(p.count) || 3) - 1)} unit="" />
        </LabeledField>
        <LabeledField label="Marca do brinde" hint="O que aparece nas cartas viradas de graça. Nunca um prêmio — prêmio quem decide é o servidor.">
          <input className={inp} value={p.teaserText || ''} onChange={e => up('teaserText', e.target.value.slice(0, 16))} placeholder="★" />
        </LabeledField>
        <ColorRow label="Fundo do brinde" value={p.teaserBg || '#F3F4F6'} onChange={v => up('teaserBg', v)} />
        <ColorRow label="Texto do brinde" value={p.teaserColor || '#9CA3AF'} onChange={v => up('teaserColor', v)} />
        <LabeledField label="Aviso da trava">
          <input className={inp} value={p.lockedText || ''} onChange={e => up('lockedText', e.target.value.slice(0, 120))} placeholder="Deixe seu e-mail para virar a última carta" />
        </LabeledField>
        <ColorRow label="Cor do aviso" value={p.lockedColor || '#6B7280'} onChange={v => up('lockedColor', v)} />
      </div>
    )}
    {isWheel && (
      <div className="pt-4 border-t border-gray-100 space-y-3">
        <SectionHeader title="Miolo" icon={<Disc3 className="w-3 h-3" />} />
        <p className="text-[11px] text-gray-400 leading-snug">Com o miolo vazado a roleta vira um anel e o centro pode ser o próprio botão — o convite fica onde o olho já está, em vez de num botão embaixo.</p>
        <LabeledField label="Miolo vazado" hint="0 mantém o disco cheio, com o cubo no centro.">
          <Slider value={p.hubRadius ?? 0} onChange={v => up('hubRadius', v)} min={0} max={110} unit="px" />
        </LabeledField>
        {(p.hubRadius ?? 0) >= 30 && (
          <>
            <Toggle label="Tocar no miolo gira" checked={p.hubMode === 'tap'} onChange={v => up('hubMode', v ? 'tap' : 'plain')} />
            {p.hubMode === 'tap' && (
              <>
                <LabeledField label="Texto do miolo">
                  <input className={inp} value={p.hubText || ''} onChange={e => up('hubText', e.target.value.slice(0, 30))} placeholder="Toque para girar" />
                </LabeledField>
                <ColorRow label="Fundo do miolo" value={p.hubBg || '#FFFFFF'} onChange={v => up('hubBg', v)} />
                <ColorRow label="Texto do miolo" value={p.hubColor || '#111827'} onChange={v => up('hubColor', v)} />
                <LabeledField label="Tamanho do texto"><Slider value={p.hubFontSize || 14} onChange={v => up('hubFontSize', v)} min={9} max={24} unit="px" /></LabeledField>
                <Toggle label="Manter também o botão embaixo" checked={p.showButton === true} onChange={v => up('showButton', v ? true : undefined)} />
              </>
            )}
          </>
        )}
      </div>
    )}
    <div className="pt-4 border-t border-gray-100 space-y-3">
      <SectionHeader title="Aparência" icon={<Palette className="w-3 h-3" />} />
      {isWheel ? (
        <>
          <LabeledField label="Tamanho"><Slider value={p.size || 320} onChange={v => up('size', v)} min={200} max={460} unit="px" /></LabeledField>
          <LabeledField label="Texto dos segmentos"><Slider value={p.labelSize || 13} onChange={v => up('labelSize', v)} min={8} max={20} unit="px" /></LabeledField>
          <ColorRow label="Cor do texto" value={p.labelColor || '#FFFFFF'} onChange={v => up('labelColor', v)} />
          <ColorRow label="Aro" value={p.rimColor || '#111827'} onChange={v => up('rimColor', v)} />
          <ColorRow label="Ponteiro e cubo" value={p.pointerColor || '#111827'} onChange={v => up('pointerColor', v)} />
          <ColorRow label="Divisórias" value={p.strokeColor || '#FFFFFF'} onChange={v => up('strokeColor', v)} />
          <LabeledField label="Espessura das divisórias"><Slider value={p.dividerWidth ?? 2} onChange={v => up('dividerWidth', v)} min={0} max={8} unit="px" /></LabeledField>
          <LabeledField label="Espessura do aro"><Slider value={p.rimWidth ?? 17} onChange={v => up('rimWidth', v)} min={4} max={34} unit="px" /></LabeledField>
          <Toggle label="Luzinhas no aro" checked={p.rimLights !== false} onChange={v => up('rimLights', v)} />
          {/* O tique de cada pino que passa é o que faz o giro parecer
              mecânico. Quem não quiser som na loja desliga aqui. */}
          <Toggle label="Tique ao girar" checked={p.sound !== false} onChange={v => up('sound', v)} />
        </>
      ) : isCards ? (
        <>
          <LabeledField label="Quantas cartas"><Slider value={Number(p.count) || 3} onChange={v => up('count', v)} min={2} max={5} unit="" /></LabeledField>
          <LabeledField label="Largura da carta"><Slider value={p.cardWidth || 96} onChange={v => up('cardWidth', v)} min={60} max={160} unit="px" /></LabeledField>
          <LabeledField label="Altura da carta"><Slider value={p.cardHeight || 128} onChange={v => up('cardHeight', v)} min={80} max={220} unit="px" /></LabeledField>
          <LabeledField label="Cantos"><Slider value={p.cardRadius ?? 12} onChange={v => up('cardRadius', v)} min={0} max={28} unit="px" /></LabeledField>
          <LabeledField label="Espaço entre cartas"><Slider value={p.gap ?? 12} onChange={v => up('gap', v)} min={0} max={28} unit="px" /></LabeledField>
          <LabeledField label="Marca do verso" hint="O que aparece na carta virada para baixo.">
            <input className={inp} value={p.backText || ''} onChange={e => up('backText', e.target.value.slice(0, 3))} placeholder="?" />
          </LabeledField>
          <ColorRow label="Verso da carta" value={p.backColor || '#FFFFFF'} onChange={v => up('backColor', v)} />
          <ColorRow label="Marca do verso" value={p.backTextColor || '#F97316'} onChange={v => up('backTextColor', v)} />
          <ColorRow label="Frente (prêmio)" value={p.faceBg || '#111827'} onChange={v => up('faceBg', v)} />
          <ColorRow label="Texto do prêmio" value={p.faceColor || '#FFFFFF'} onChange={v => up('faceColor', v)} />
          <LabeledField label="Tamanho do prêmio"><Slider value={p.faceSize || 15} onChange={v => up('faceSize', v)} min={11} max={28} unit="px" /></LabeledField>
        </>
      ) : (
        <>
          <LabeledField label="Altura"><Slider value={p.height || 150} onChange={v => up('height', v)} min={80} max={320} unit="px" /></LabeledField>
          <LabeledField label="Texto da cobertura"><input className={inp} value={p.coverText || ''} onChange={e => up('coverText', e.target.value.slice(0, 40))} placeholder="Raspe aqui" /></LabeledField>
          {/* O acabamento da lâmina. "Foto" é o que as marcas boas fazem:
              o que se raspa é a embalagem do produto, e o produto aparece
              antes do desconto. */}
          <LabeledField label="Acabamento">
            <div className="grid grid-cols-2 gap-1.5">
              {([['foil', 'Metalizado'], ['gold', 'Dourado'], ['solid', 'Cor chapada'], ['image', 'Foto']] as const).map(([v, rot]) => (
                <button key={v} onClick={() => up('coverStyle', v)}
                  className={`py-2 text-[12px] font-medium rounded-lg border transition-colors ${(p.coverStyle || 'foil') === v ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>{rot}</button>
              ))}
            </div>
          </LabeledField>
          {p.coverStyle === 'image' ? (
            p.coverImage ? (
              <div className="space-y-2">
                <img src={p.coverImage} alt="" className="w-full h-24 object-cover rounded-lg border border-gray-200" />
                <div className="flex gap-2">
                  <button onClick={() => onOpenMedia?.(url => up('coverImage', url))} className="flex-1 py-2 text-[12px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Trocar</button>
                  <button onClick={() => up('coverImage', '')} className="flex-1 py-2 text-[12px] font-medium text-red-600 bg-white border border-gray-200 rounded-lg hover:bg-red-50">Remover</button>
                </div>
              </div>
            ) : (
              <button onClick={() => onOpenMedia?.(url => up('coverImage', url))}
                className="w-full border-2 border-dashed border-gray-200 rounded-lg p-5 text-center hover:border-gray-400 hover:bg-gray-100/40 transition-colors">
                <Upload className="w-5 h-5 text-gray-300 mx-auto mb-1.5" />
                <span className="text-[12px] text-gray-500">Escolher a foto da lâmina</span>
              </button>
            )
          ) : null}
          {(p.coverStyle || 'foil') !== 'gold' && <ColorRow label="Cobertura" value={p.coverColor || '#9CA3AF'} onChange={v => up('coverColor', v)} />}
          <ColorRow label="Texto da cobertura" value={p.coverTextColor || '#FFFFFF'} onChange={v => up('coverTextColor', v)} />
          <ColorRow label="Fundo do prêmio" value={p.prizeBg || '#FFF7ED'} onChange={v => up('prizeBg', v)} />
          <ColorRow label="Texto do prêmio" value={p.prizeColor || '#F97316'} onChange={v => up('prizeColor', v)} />
          <LabeledField label="Tamanho do prêmio"><Slider value={p.prizeSize || 24} onChange={v => up('prizeSize', v)} min={14} max={40} unit="px" /></LabeledField>
        </>
      )}
    </div>
  </div>
}

// ── Escolhas ─────────────────────────────────────────────────────────
// Um clique é a resposta E o avanço. É por isso que este bloco não tem
// "botão continuar": pedir dois cliques onde um basta é o que separa um
// popup que converte de um formulário.
function ChoiceEditor({ p, up, steps }: { p: any; up: (k: string, v: any) => void; steps: Array<{ id: string; name: string }> }) {
  const opts: any[] = Array.isArray(p.options) ? p.options : []
  const setOpt = (i: number, patch: Record<string, any>) => up('options', opts.map((o, j) => (j === i ? { ...(typeof o === 'string' ? { label: o, value: o } : o), ...patch } : o)))
  const rotulo = (o: any) => String(typeof o === 'string' ? o : o?.label ?? '')
  return <div className="space-y-5">
    <div className="space-y-3">
      <SectionHeader title="Escolhas" icon={<Rows className="w-3 h-3" />} />
      <p className="text-[11px] text-gray-400 leading-snug">O visitante clica numa opção e já avança — a resposta entra na submissão no campo abaixo. Cada opção pode levar a uma etapa própria.</p>
      <LabeledField label="Pergunta">
        <input className={inp} value={p.label || ''} onChange={e => up('label', e.target.value.slice(0, 120))} placeholder="O que você está procurando?" />
      </LabeledField>
      <Toggle label="Mostrar a pergunta" checked={p.showLabel !== false} onChange={v => up('showLabel', v)} />
      <LabeledField label="Nome do campo" hint="É como a resposta aparece no contato e nos segmentos.">
        <input className={inp} value={p.mapToCustom || ''} onChange={e => up('mapToCustom', e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30))} placeholder="escolha" />
      </LabeledField>
    </div>

    <div className="space-y-2">
      <SectionHeader title="Opções" icon={<LayoutGrid className="w-3 h-3" />} />
      {opts.map((o, i) => (
        <div key={(typeof o === 'object' && o?.id) || i} className="p-2.5 rounded-lg border border-gray-200 bg-white space-y-2">
          <div className="flex items-center gap-2">
            <input className={inp} value={rotulo(o)} onChange={e => setOpt(i, { label: e.target.value.slice(0, 60), value: (typeof o === 'object' && o?.value) || e.target.value.slice(0, 60) })} placeholder={`Opção ${i + 1}`} />
            <button onClick={() => up('options', opts.filter((_, j) => j !== i))} disabled={opts.length <= 1}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400" title="Remover opção">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <select className={inp} value={(typeof o === 'object' && o?.next) || ''} onChange={e => setOpt(i, { next: e.target.value })}>
            <option value="">Avançar para a próxima etapa</option>
            {steps.map(st => <option key={st.id} value={st.id}>Ir para: {st.name}</option>)}
          </select>
        </div>
      ))}
      {opts.length < 8 && (
        <button onClick={() => up('options', [...opts, { id: `o${Date.now().toString(36)}`, label: `Opção ${opts.length + 1}`, value: `opcao-${opts.length + 1}`, next: '' }])}
          className="w-full py-2 text-[12px] font-medium text-gray-600 bg-white border border-dashed border-gray-300 rounded-lg hover:bg-gray-50">
          + Adicionar opção
        </button>
      )}
    </div>

    <div className="pt-4 border-t border-gray-100 space-y-3">
      <SectionHeader title="Aparência" icon={<Palette className="w-3 h-3" />} />
      <ColorRow label="Fundo do botão" value={p.optionBg || '#FFFFFF'} onChange={v => up('optionBg', v)} />
      <ColorRow label="Texto do botão" value={p.optionColor || '#111827'} onChange={v => up('optionColor', v)} />
      <ColorRow label="Fundo ao passar o mouse" value={p.hoverBg || '#F3F4F6'} onChange={v => up('hoverBg', v)} />
      <ColorRow label="Cor da pergunta" value={p.labelColor || '#111827'} onChange={v => up('labelColor', v)} />
      <LabeledField label="Tamanho do texto"><Slider value={p.fontSize || 16} onChange={v => up('fontSize', v)} min={12} max={24} unit="px" /></LabeledField>
      <LabeledField label="Altura do botão"><Slider value={p.paddingV ?? 16} onChange={v => up('paddingV', v)} min={8} max={28} unit="px" /></LabeledField>
      <LabeledField label="Cantos"><Slider value={p.borderRadius ?? 4} onChange={v => up('borderRadius', v)} min={0} max={30} unit="px" /></LabeledField>
      <LabeledField label="Espaço entre botões"><Slider value={p.gap ?? 10} onChange={v => up('gap', v)} min={0} max={24} unit="px" /></LabeledField>
      <LabeledField label="Borda"><Slider value={p.borderWidth ?? 1} onChange={v => up('borderWidth', v)} min={0} max={4} unit="px" /></LabeledField>
      {(p.borderWidth ?? 1) > 0 && <ColorRow label="Cor da borda" value={p.borderColor || '#E5E7EB'} onChange={v => up('borderColor', v)} />}
      <Toggle label="Tudo em maiúsculas" checked={!!p.uppercase} onChange={v => up('uppercase', v)} />
    </div>

    <div className="pt-4 border-t border-gray-100 space-y-3">
      <SectionHeader title="Recusar" icon={<X className="w-3 h-3" />} />
      <p className="text-[11px] text-gray-400 leading-snug">O link discreto de saída. Vazio, não aparece — e quem quiser sair usa o X do popup.</p>
      <LabeledField label="Texto">
        <input className={inp} value={p.declineText || ''} onChange={e => up('declineText', e.target.value.slice(0, 40))} placeholder="Não, obrigado" />
      </LabeledField>
      {p.declineText && <ColorRow label="Cor" value={p.declineColor || '#6B7280'} onChange={v => up('declineColor', v)} />}
    </div>
  </div>
}

function RewardTiersEditor({ p, up, steps }: { p: any; up: (k: string, v: any) => void; steps: Array<{ id: string; name: string }> }) {
  const tiers: any[] = Array.isArray(p.tiers) ? p.tiers : []
  const setTier = (i: number, patch: Record<string, any>) => up('tiers', tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const unique = p.mode === 'unique' || p.mode === 'dynamic'
  return (
    <div className="pt-3 border-t border-gray-100 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">Recompensa progressiva</p>
        <button type="button"
          onClick={() => up('tiers', [...tiers, { id: 't' + Math.random().toString(36).slice(2, 8), label: `Nível ${tiers.length + 2}`, afterStepId: steps.length >= 2 ? steps[1].id : '', discountType: p.discountType || 'percentage', discountValue: (Number(p.discountValue) || 10) + 5, code: '' }])}
          className="text-[11px] font-semibold text-zinc-900 underline underline-offset-2">
          Adicionar nível
        </button>
      </div>
      {tiers.length === 0 ? (
        <p className="text-[11px] text-gray-400 leading-snug">Sem níveis: todo inscrito recebe o desconto acima. Adicione um nível para dar mais a quem chega a uma etapa (quiz, lição).</p>
      ) : (
        <p className="text-[11px] text-gray-400 leading-snug">Vale o último nível cuja etapa a pessoa chegou a ver. A base é o desconto acima.</p>
      )}
      {steps.length < 2 && tiers.length > 0 && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Com uma etapa só, nenhum nível é desbloqueado. Adicione uma segunda etapa e ligue o nível a ela.</p>
      )}
      {tiers.map((t, i) => (
        <div key={t.id || i} className="rounded-lg border border-gray-200 p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <input className={inp + ' flex-1'} value={t.label || ''} onChange={e => setTier(i, { label: e.target.value })} placeholder="Nome do nível" />
            <button type="button" onClick={() => up('tiers', tiers.filter((_, j) => j !== i))} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded" title="Remover">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          <LabeledField label="Desbloqueia ao chegar em" hint={t.afterStepId && !steps.some(s => s.id === t.afterStepId) ? 'A etapa ligada a este nível foi apagada. Escolha outra.' : undefined}>
            <select className={sel} value={steps.some(s => s.id === t.afterStepId) ? t.afterStepId : ''} onChange={e => setTier(i, { afterStepId: e.target.value })}>
              <option value="">Escolha a etapa</option>
              {steps.map((s, j) => <option key={s.id} value={s.id}>{j + 1}. {s.name}</option>)}
            </select>
          </LabeledField>
          <div className="grid grid-cols-2 gap-2">
            <LabeledField label="Tipo">
              <select className={sel} value={t.discountType || 'percentage'} onChange={e => setTier(i, { discountType: e.target.value })}>
                <option value="percentage">Percentual (%)</option>
                <option value="fixed_amount">Valor fixo</option>
                <option value="free_shipping">Frete grátis</option>
              </select>
            </LabeledField>
            {t.discountType !== 'free_shipping' && (
              <LabeledField label={t.discountType === 'fixed_amount' ? 'Valor' : 'Desconto (%)'}>
                <input type="number" min={0} step="0.01" className={inp} value={t.discountValue ?? 0} onChange={e => setTier(i, { discountValue: +e.target.value })} />
              </LabeledField>
            )}
          </div>
          <LabeledField label={unique ? 'Código reserva deste nível' : 'Código deste nível'} hint={unique ? 'Se o estoque do nível acabar.' : 'Crie na Shopify com este código.'}>
            <input className={inp + ' font-mono tracking-wider uppercase'} value={t.code || ''} onChange={e => setTier(i, { code: e.target.value.toUpperCase() })} placeholder="QUIZ15" />
          </LabeledField>
          {unique && (
            <LabeledField label="Prefixo dos códigos" hint="Vazio = o mesmo da base.">
              <input className={inp + ' font-mono uppercase'} value={t.codePrefix || ''} onChange={e => setTier(i, { codePrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) })} placeholder={(p.codePrefix || 'POPUP')} />
            </LabeledField>
          )}
        </div>
      ))}
    </div>
  )
}

// Estoque de códigos únicos do popup — a base e um por nível de recompensa.
// Lê /api/forms/:id/coupon-pool; o botão sincroniza os pools com o bloco e
// cria um lote agora, sem esperar o cron. O popup precisa estar salvo com
// o bloco em modo único.
function CouponPoolPanel({ dirty = false }: { dirty?: boolean }) {
  const params = useParams()
  const formId = String(params?.id || '')
  const [state, setState] = useState<{ loading: boolean; data: any; error: string | null; working: boolean }>({ loading: true, data: null, error: null, working: false })
  const load = useCallback(async () => {
    if (!formId) return
    try {
      const r = await fetch(`/api/forms/${formId}/coupon-pool`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      setState(s => ({ ...s, loading: false, data: r.ok ? d : null, error: r.ok ? null : (d.error || 'Não foi possível ler o estoque') }))
    } catch (e: any) {
      setState(s => ({ ...s, loading: false, error: e?.message || 'erro' }))
    }
  }, [formId])
  useEffect(() => { load() }, [load])
  const generate = async () => {
    setState(s => ({ ...s, working: true, error: null }))
    try {
      const r = await fetch(`/api/forms/${formId}/coupon-pool`, { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setState(s => ({ ...s, working: false, error: d.error || 'Não foi possível gerar códigos' }))
      else setState(s => ({ ...s, working: false, data: d, error: d.error || null }))
    } catch (e: any) {
      setState(s => ({ ...s, working: false, error: e?.message || 'erro' }))
    }
  }
  const d = state.data
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">Estoque de códigos</p>
        <button type="button" onClick={generate} disabled={state.working || dirty}
          title={dirty ? 'Salve o popup primeiro: os códigos seguem o desconto salvo.' : undefined}
          className="text-[11px] font-semibold text-zinc-900 underline underline-offset-2 disabled:opacity-50 disabled:no-underline">
          {state.working ? 'Gerando…' : dirty ? 'Salve para gerar' : 'Gerar códigos agora'}
        </button>
      </div>
      {state.loading ? (
        <p className="text-[11px] text-gray-400">Carregando…</p>
      ) : !d?.pools?.length ? (
        <p className="text-[11px] text-gray-500 leading-snug">Nenhum pool ainda. Salve o popup com o cupom em modo único (e uma loja vinculada) — o pool é criado no save e os primeiros códigos ao publicar.</p>
      ) : (
        <div className="space-y-2">
          {d.pools.map((pool: any) => (
            <div key={pool.id} className={pool.status === 'paused' ? 'opacity-50' : ''}>
              {d.pools.length > 1 && (
                <p className="text-[10px] font-semibold text-gray-600 mb-1">{pool.tier_key === 'base' ? 'Base' : (pool.name.split(' · ').pop() || pool.tier_key)} · {pool.kind === 'free_shipping' ? 'frete grátis' : pool.kind === 'fixed' ? `R$ ${pool.value}` : `${pool.value}%`}</p>
              )}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-[15px] font-semibold text-gray-900 tabular-nums">{pool.stock.usable}</p><p className="text-[10px] text-gray-500">prontos</p></div>
                <div><p className="text-[15px] font-semibold text-gray-900 tabular-nums">{pool.stock.reserved}</p><p className="text-[10px] text-gray-500">entregues</p></div>
                <div><p className="text-[15px] font-semibold text-gray-900 tabular-nums">{pool.stock.consumed}</p><p className="text-[10px] text-gray-500">usados</p></div>
              </div>
              <p className="text-[11px] text-gray-500 leading-snug mt-1">
                {pool.status === 'error' ? `Última reposição falhou: ${pool.last_error || 'erro'}` :
                  pool.status === 'paused' ? 'Pausado — não está mais no bloco.' :
                    pool.needs_replenish ? `Abaixo do mínimo (${pool.min_stock}). O cron repõe a cada 2 minutos.` : 'Estoque em dia. O cron repõe sozinho.'}
              </p>
            </div>
          ))}
        </div>
      )}
      {state.error && <p className="text-[11px] text-red-600">{state.error}</p>}
    </div>
  )
}

// ── Block Props Editor (Klaviyo-style per-block panels) ──────────────────────
function BlockEditor({ block, onChange, onDelete, onOpenMedia, onApplyToAllInputs, steps = [], dirty = false, couponBlocks = 1, hints }: { block: Block; onChange: (b: Block) => void; onDelete: () => void; onOpenMedia?: (cb: (url: string) => void) => void; onApplyToAllInputs?: (b: Block) => void; steps?: Array<{ id: string; name: string }>; dirty?: boolean; couponBlocks?: number; hints?: { hasCoupon: boolean; couponTiers: any[]; baseOfferLabel: string; gameBlocks: number } }) {
  const up = (key: string, val: any) => onChange(mergeBlockProps(block, { [key]: val }))
  // Multi-key updates MUST go through a single onChange — two `up()` calls in
  // a row both spread the same stale block.props and the 2nd reverts the 1st.
  const upMany = (patch: Record<string, any>) => onChange(mergeBlockProps(block, patch))
  const p = block.props
  const [tab, setTab] = useState<'props' | 'fields' | 'layout'>('props')
  const isInputBlock = ['email', 'phone', 'name-input', 'text-input', 'date-input'].includes(block.type)

  const blockLabel: Record<string, string> = {
    email: 'Email', phone: 'Telefone', 'name-input': 'Nome', 'text-input': 'Campo',
    'date-input': 'Data', dropdown: 'Dropdown', radio: 'Radio', checkbox: 'Checkbox',
    'legal-consent': 'Consentimento', text: 'Conteúdo', button: 'Botão', image: 'Imagem',
    spacer: 'Espaçador', line: 'Linha', coupon: 'Cupom', countdown: 'Contagem', wheel: 'Roleta', scratch: 'Raspadinha', choice: 'Escolhas', cards: 'Cartas',
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
            <LabeledField label="Código do país padrão" hint="O código é adicionado automaticamente ao número salvo (ex.: +55 11 99999-9999).">
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
            <LabeledField label="Mensagem quando vazio" hint="Aparece abaixo do campo no site quando o visitante não preenche.">
              <input className={inp} value={p.requiredMsg || 'Este campo é obrigatório'} onChange={e => up('requiredMsg', e.target.value)} />
            </LabeledField>
          )}
          {(block.type === 'email' || block.type === 'phone') && (
            <LabeledField label="Mensagem quando inválido" hint="Aparece abaixo do campo no site quando o formato não corresponde ao esperado.">
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
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-[12px] font-semibold text-zinc-900 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg transition-colors">
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
                className={`py-4 rounded-lg border-2 transition-colors flex items-center justify-center ${p.inputStyle !== 'underline' ? 'border-zinc-900 bg-gray-100' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="w-16 h-5 rounded border border-gray-700 bg-white" />
              </button>
              <button onClick={() => up('inputStyle', 'underline')}
                className={`py-4 rounded-lg border-2 transition-colors flex items-center justify-center ${p.inputStyle === 'underline' ? 'border-zinc-900 bg-gray-100' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="w-16 h-5 border-b-2 border-gray-700" />
              </button>
            </div>
          </LabeledField>

          {p.inputStyle !== 'underline' && (
            <LabeledField label="Raio dos cantos">
              <Slider value={p.cornerRadius ?? 8} onChange={v => upMany({ cornerRadius: v, corners: 'custom' })} min={0} max={50} unit="px" />
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
          <ColorRow label="Erro" hint="Cor das mensagens de validação exibidas abaixo do campo no site." value={p.errorColor || '#EF4444'} onChange={v => up('errorColor', v)} />
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
        return <div className="space-y-4">
          {/* Style preset — first thing the merchant changes (Heading vs body) */}
          <LabeledField label="Estilo do texto">
            <Segmented value={p.tag || 'p'} onChange={v => up('tag', v)} options={[
              { value: 'h1', label: 'H1', title: 'Título grande' },
              { value: 'h2', label: 'H2', title: 'Título médio' },
              { value: 'h3', label: 'H3', title: 'Título pequeno' },
              { value: 'p', label: 'Texto', title: 'Parágrafo' },
            ]} />
          </LabeledField>

          <p className="text-[11px] text-gray-400 leading-snug">
            Para editar o texto, clique direto no popup ao lado.
          </p>

          {/* Font + Size on same row, Omnisend-style */}
          <div className="grid grid-cols-[1fr_72px] gap-2">
            <LabeledField label="Fonte">
              <FontSelect value={p.fontFamily || 'inherit'} onChange={v => up('fontFamily', v)} />
            </LabeledField>
            <LabeledField label="Tamanho">
              <UnitInput value={p.fontSize || 16} onChange={v => up('fontSize', v)} min={8} max={120} />
            </LabeledField>
          </div>

          {/* Format + Alignment in one row */}
          <div className="grid grid-cols-2 gap-2">
            <LabeledField label="Formatação"><TextFormat p={p} up={up} /></LabeledField>
            <LabeledField label="Alinhamento">
              <AlignButtons value={p.align || 'left'} onChange={v => up('align', v)} showFull={false} />
            </LabeledField>
          </div>

          {/* Colors — most edited after content. No "Cor dos links" here: the
              text block renders escaped innerText, links can't exist in it
              (legal-consent keeps its own linkColor — that one supports HTML). */}
          <div className="pt-3 border-t border-gray-100 space-y-2.5">
            <ColorRow label="Cor do texto" value={p.color || '#111827'} onChange={v => up('color', v)} />
          </div>

          {/* Padding — direct, visible */}
          <div className="pt-3 border-t border-gray-100">
            <LabeledField label="Preenchimento (padding)">
              <PaddingControl p={p} up={up} prefix="blockPad" defaults={{ t: 0, r: 0, b: 0, l: 0 }} />
            </LabeledField>
          </div>

          {/* Less-used controls hidden behind a collapsible group */}
          <Group title="Avançado" defaultOpen={false} icon={<Settings className="w-3 h-3" />}>
            <LabeledField label="Peso da fonte">
              <Segmented value={String(p.fontWeight || 'normal')} onChange={v => up('fontWeight', v)} options={[
                { value: 'normal', label: '400' },
                { value: '500', label: '500' },
                { value: '600', label: '600' },
                { value: 'bold', label: '700' },
                { value: '800', label: '800' },
              ]} />
            </LabeledField>
            <LabeledField label="Altura da linha">
              <UnitInput value={Number(p.lineHeight || 1.4)} onChange={v => up('lineHeight', v)} min={0.8} max={3} step={0.1} unit="×" />
            </LabeledField>
            <LabeledField label="Espaçamento entre letras">
              <UnitInput value={p.letterSpacing ?? 0} onChange={v => up('letterSpacing', v)} min={-2} max={20} step={0.5} />
            </LabeledField>
            <ColorRow label="Cor de fundo do bloco" value={p.blockBg || ''} onChange={v => up('blockBg', v)} />
            <LabeledField label="Margem externa">
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
            <LabeledField label="Conteúdo (texto)" hint="Também editável diretamente no popup ao lado.">
              <textarea className={inp} rows={3} value={p.content || ''} onChange={e => up('content', e.target.value)} />
            </LabeledField>
          </Group>
        </div>

      case 'button':
        return <div className="space-y-4">
          {/* Action — first thing to set up; controls everything else */}
          <LabeledField label="Ação ao clicar">
            <Segmented value={p.action || 'submit'} onChange={v => up('action', v)} options={[
              { value: 'submit', label: 'Enviar' },
              { value: 'next-step', label: 'Próxima' },
              { value: 'prev-step', label: 'Voltar' },
              { value: 'url', label: 'URL' },
              { value: 'close', label: 'Fechar' },
            ]} />
          </LabeledField>
          {p.action === 'next-step' && steps.length > 1 && (
            <LabeledField label="Ir para" hint="A opção escolhida num bloco de escolha com ramificação vence este destino.">
              <select className={sel} value={p.nextStepId || ''} onChange={e => up('nextStepId', e.target.value || undefined)}>
                <option value="">Próxima na sequência</option>
                {steps.map((s, i) => <option key={s.id} value={s.id}>{i + 1}. {s.name}</option>)}
              </select>
            </LabeledField>
          )}
          {p.action === 'url' && (
            <LabeledField label="URL de destino" hint="Abre em nova aba.">
              <div className="flex items-center border border-gray-200 rounded-lg focus-within:border-zinc-900 focus-within:ring-1 focus-within:ring-zinc-900/10">
                <Link2 className="w-3.5 h-3.5 text-gray-400 ml-3" />
                <input className="flex-1 px-2 py-2 text-[13px] text-gray-800 outline-none bg-transparent" value={p.url || ''} onChange={e => up('url', e.target.value)} placeholder="https://..." />
              </div>
            </LabeledField>
          )}

          <p className="text-[11px] text-gray-400 leading-snug">
            Para editar o texto do botão, clique direto no popup ao lado.
          </p>

          {/* Colors — most edited */}
          <div className="pt-3 border-t border-gray-100 space-y-2.5">
            <ColorRow label="Cor de fundo" value={p.bgColor || '#F97316'} onChange={v => up('bgColor', v)} />
            <ColorRow label="Cor do texto" value={p.textColor || '#FFFFFF'} onChange={v => up('textColor', v)} />
          </div>

          {/* Size & shape */}
          <div className="pt-3 border-t border-gray-100 space-y-2.5">
            <LabeledField label="Largura">
              <Segmented value={p.fullWidth ? 'full' : 'auto'} onChange={v => up('fullWidth', v === 'full')} options={[
                { value: 'auto', label: 'Auto' },
                { value: 'full', label: 'Preencher' },
              ]} />
            </LabeledField>
            <LabeledField label="Raio da borda">
              <Slider value={p.borderRadius ?? 8} onChange={v => up('borderRadius', v)} min={0} max={50} unit="px" />
            </LabeledField>
            <div className="grid grid-cols-2 gap-2">
              <LabeledField label="Padding vertical">
                <UnitInput value={p.paddingV ?? 14} onChange={v => up('paddingV', v)} min={4} max={40} />
              </LabeledField>
              <LabeledField label="Padding horizontal">
                <UnitInput value={p.paddingH ?? 28} onChange={v => up('paddingH', v)} min={4} max={80} />
              </LabeledField>
            </div>
          </div>

          {/* Less-used controls behind a collapsible group */}
          <Group title="Avançado" defaultOpen={false} icon={<Settings className="w-3 h-3" />}>
            <LabeledField label="Texto do botão" hint="Também editável diretamente no popup ao lado.">
              <input className={inp} value={p.text || ''} onChange={e => up('text', e.target.value)} />
            </LabeledField>
            <ColorRow label="Cor no hover" hint="Cor de fundo ao passar o mouse." value={p.hoverColor || ''} onChange={v => up('hoverColor', v)} />
            {!p.fullWidth && (
              <LabeledField label="Alinhamento">
                <AlignButtons value={p.align || 'center'} onChange={v => up('align', v)} showFull={false} />
              </LabeledField>
            )}
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
            <div className="grid grid-cols-2 gap-2">
              <LabeledField label="Largura da borda">
                <UnitInput value={p.btnBorderWidth ?? 0} onChange={v => up('btnBorderWidth', v)} min={0} max={8} />
              </LabeledField>
              <LabeledField label="Estilo da borda">
                <BorderStyleControl p={p} up={up} />
              </LabeledField>
            </div>
            {(p.btnBorderWidth || 0) > 0 && (
              <ColorRow label="Cor da borda" value={p.btnBorderColor || '#E5E7EB'} onChange={v => up('btnBorderColor', v)} />
            )}
          </Group>
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
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-gray-400 hover:bg-gray-100/40 transition-colors group">
                  <div className="w-12 h-12 rounded-xl bg-gray-50 group-hover:bg-gray-200 flex items-center justify-center mx-auto mb-3 transition-colors">
                    <Upload className="w-5 h-5 text-gray-400 group-hover:text-zinc-900" />
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
              <div className="flex items-center border border-gray-200 rounded-lg focus-within:border-zinc-900 focus-within:ring-1 focus-within:ring-zinc-900/10">
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
                    const next = [...(p.options || [])]; next[i] = e.target.value
                    // Ramificação e tags são indexadas pelo rótulo: renomear
                    // a opção leva o que estava ligado a ela junto.
                    const patch: Record<string, any> = { options: next }
                    for (const key of ['branches', 'tagsByOption'] as const) {
                      const map = p[key]
                      if (map && typeof map === 'object' && opt in map) {
                        const { [opt]: moved, ...rest } = map
                        patch[key] = { ...rest, [e.target.value]: moved }
                      }
                    }
                    upMany(patch)
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
                className="w-full py-2 text-[12px] font-semibold text-zinc-900 border-2 border-dashed border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-400 transition-colors flex items-center justify-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Adicionar opção
              </button>
            </div>
            {/* Quiz: cada opção pode levar a uma etapa e marcar o contato com tags. */}
            {(p.options || []).length > 0 && (
              <div className="pt-3 space-y-2">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">Por opção</p>
                <p className="text-[11px] text-gray-400 leading-snug">Para onde a resposta leva e que tags ela grava no contato (viram segmento).</p>
                {(p.options || []).map((opt: string, i: number) => {
                  const branches: Record<string, string> = p.branches || {}
                  const tagsBy: Record<string, string> = p.tagsByOption || {}
                  return (
                    <div key={i} className="rounded-lg border border-gray-200 p-2 space-y-1.5">
                      <p className="text-[11px] font-medium text-gray-700 truncate">{opt || `Opção ${i + 1}`}</p>
                      {steps.length > 1 && (
                        <select className={sel} value={branches[opt] || ''}
                          onChange={e => {
                            const next = { ...branches }
                            if (e.target.value) next[opt] = e.target.value; else delete next[opt]
                            up('branches', next)
                          }}>
                          <option value="">Segue a sequência</option>
                          {steps.map((s, j) => <option key={s.id} value={s.id}>→ {j + 1}. {s.name}</option>)}
                        </select>
                      )}
                      <input className={inp} value={tagsBy[opt] || ''} placeholder="tags, separadas por vírgula"
                        onChange={e => up('tagsByOption', { ...tagsBy, [opt]: e.target.value })} />
                    </div>
                  )
                })}
              </div>
            )}
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
            <LabeledField label="Texto de consentimento" hint='Suporta HTML. Use <a href="url">link</a> para links. Diga o nome da loja e o que a pessoa vai receber — autorização genérica não vale.'>
              <textarea className={inp} rows={4} value={p.text || ''} onChange={e => up('text', e.target.value)}
                placeholder='Aceito receber ofertas da Loja por e-mail e concordo com a <a href="/politica">política de privacidade</a>.' />
            </LabeledField>
            <LabeledField label="Canais cobertos" hint="Marcar a caixa autoriza estes canais. WhatsApp e SMS só recebem mensagem com autorização explícita aqui.">
              <div className="grid grid-cols-3 gap-2">
                {([['email', 'E-mail'], ['whatsapp', 'WhatsApp'], ['sms', 'SMS']] as const).map(([ch, label]) => {
                  const channels: string[] = Array.isArray(p.channels) && p.channels.length ? p.channels : ['email']
                  const on = channels.includes(ch)
                  return (
                    <button key={ch} type="button"
                      onClick={() => {
                        const next = on ? channels.filter(c => c !== ch) : [...channels, ch]
                        up('channels', next.length ? next : ['email'])
                      }}
                      className={`px-2 py-2 text-[12px] rounded-lg border transition-colors ${on ? 'border-zinc-900 bg-gray-100 text-gray-900 font-semibold' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </LabeledField>
            <LabeledField label="Versão do texto" hint="Mude quando alterar o texto. Fica registrada em cada consentimento como prova do que foi aceito.">
              <input className={inp} value={p.consentVersion || ''} onChange={e => up('consentVersion', e.target.value)} placeholder="v1" />
            </LabeledField>
            <Toggle label="Obrigatório" checked={p.required !== false} onChange={v => up('required', v)} hint="Usuário precisa marcar para enviar. Nunca vem pré-marcado." />
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
            <LabeledField label="Modo do cupom" hint="Estático: o mesmo código para todo mundo. Único: cada inscrito recebe um código de uso único, criado antes na Shopify e reservado na hora.">
              <div className="grid grid-cols-2 gap-2">
                {([['static', 'Estático'], ['unique', 'Único por inscrito']] as const).map(([m, label]) => {
                  const cur = p.mode === 'dynamic' ? 'unique' : (p.mode || 'static')
                  return (
                    <button key={m} type="button" onClick={() => up('mode', m)}
                      className={`px-3 py-2 text-[12px] rounded-lg border transition-colors ${cur === m ? 'border-zinc-900 bg-gray-100 text-gray-900 font-semibold' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </LabeledField>
            {(p.mode === 'unique' || p.mode === 'dynamic') ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <LabeledField label="Tipo">
                    <select className={sel} value={p.discountType || 'percentage'} onChange={e => up('discountType', e.target.value)}>
                      <option value="percentage">Percentual (%)</option>
                      <option value="fixed_amount">Valor fixo</option>
                      <option value="free_shipping">Frete grátis</option>
                    </select>
                  </LabeledField>
                  {p.discountType !== 'free_shipping' && (
                    <LabeledField label={p.discountType === 'fixed_amount' ? 'Valor' : 'Desconto (%)'}>
                      <input type="number" min={1} step="0.01" className={inp}
                        value={p.discountValue ?? 10}
                        onChange={e => up('discountValue', +e.target.value)} />
                    </LabeledField>
                  )}
                </div>
                <LabeledField label="Rótulo da oferta" hint={`Aparece onde você escrever {{offer}} no texto ou no botão. Vazio: "${offerLabelOf({ ...p, offerLabel: '' })}".`}>
                  <input className={inp} value={p.offerLabel || ''} onChange={e => up('offerLabel', e.target.value.slice(0, 40))} placeholder={offerLabelOf({ ...p, offerLabel: '' })} />
                </LabeledField>
                <div className="grid grid-cols-2 gap-2">
                  <LabeledField label="Prefixo" hint="O código sai como PREFIXO-XXXXXXXX.">
                    <input className={inp + ' font-mono uppercase'}
                      value={p.codePrefix || 'POPUP'}
                      onChange={e => up('codePrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))} />
                  </LabeledField>
                  <LabeledField label="Validade (dias)" hint="Contada da inscrição.">
                    <input type="number" min={1} max={365} className={inp}
                      value={p.validityDays ?? 7}
                      onChange={e => up('validityDays', +e.target.value)} />
                  </LabeledField>
                </div>
                <LabeledField label="Valor mínimo do pedido" hint="0 = sem mínimo.">
                  <input type="number" min={0} step="0.01" className={inp}
                    value={p.minimumAmount ?? 0}
                    onChange={e => up('minimumAmount', +e.target.value)} />
                </LabeledField>
                <LabeledField label="Só nestas coleções" hint="Opcional. ID da coleção na Shopify (gid://shopify/Collection/123 ou só o número), um por linha. Vazio = loja inteira.">
                  <LinesTextarea rows={2} className={inp + ' font-mono text-[11px]'} value={Array.isArray(p.collectionIds) ? p.collectionIds : []}
                    transform={c => (/^\d+$/.test(c) ? `gid://shopify/Collection/${c}` : c)}
                    onChange={v => up('collectionIds', v)} />
                </LabeledField>
                <LabeledField label="Combina com" hint="Outros descontos que podem ser usados no mesmo pedido.">
                  <div className="grid grid-cols-3 gap-2">
                    {([['product', 'Produto'], ['order', 'Pedido'], ['shipping', 'Frete']] as const).map(([k, label]) => {
                      const cw = p.combinesWith || { product: true, order: false, shipping: true }
                      const on = k === 'order' ? cw.order === true : cw[k] !== false
                      return (
                        <button key={k} type="button" onClick={() => up('combinesWith', { ...cw, [k]: !on })}
                          className={`px-2 py-2 text-[12px] rounded-lg border transition-colors ${on ? 'border-zinc-900 bg-gray-100 text-gray-900 font-semibold' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </LabeledField>
                <Toggle label="Aplicar no carrinho automaticamente" hint="O checkout já abre com o desconto. A pessoa não precisa digitar nada." checked={p.autoApply !== false} onChange={v => (v ? up('autoApply', true) : upMany({ autoApply: false, showCode: true }))} />
                {p.autoApply !== false && (
                  <Toggle label="Mostrar o código mesmo assim" hint="Desligado, o bloco diz só que o desconto foi aplicado." checked={p.showCode !== false} onChange={v => up('showCode', v)} />
                )}
                {p.autoApply !== false && p.showCode === false && (
                  <LabeledField label="Texto quando aplicado">
                    <input className={inp} value={p.appliedText || ''} onChange={e => up('appliedText', e.target.value)} placeholder="Desconto aplicado no seu carrinho" />
                  </LabeledField>
                )}
                <LabeledField label="Código reserva" hint="Usado se o estoque de códigos únicos acabar. Fica registrado quando acontece.">
                  <input className={inp + ' font-mono tracking-wider uppercase'} value={p.code || ''} onChange={e => up('code', e.target.value.toUpperCase())} placeholder="BEMVINDO10" />
                </LabeledField>
                {couponBlocks > 1 && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Há {couponBlocks} blocos de cupom neste popup. O desconto e o estoque seguem o primeiro; os outros só repetem o mesmo código.</p>
                )}
                <RewardTiersEditor p={p} up={up} steps={steps} />
                <SmartOfferEditor p={p} up={up} />
                <CouponPoolPanel dirty={dirty} />
              </>
            ) : (
              <>
                <LabeledField label="Código do cupom" hint="Crie o desconto na Shopify com este código. Ele aparece em destaque e é aplicado no carrinho.">
                  <input className={inp + ' font-mono tracking-wider uppercase'} value={p.code || ''} onChange={e => up('code', e.target.value.toUpperCase())} placeholder="DESCONTO10" />
                </LabeledField>
                <div className="grid grid-cols-2 gap-2">
                  <LabeledField label="Tipo" hint="Só para o relatório.">
                    <select className={sel} value={p.discountType || 'percentage'} onChange={e => up('discountType', e.target.value)}>
                      <option value="percentage">Percentual (%)</option>
                      <option value="fixed_amount">Valor fixo</option>
                      <option value="free_shipping">Frete grátis</option>
                    </select>
                  </LabeledField>
                  {p.discountType !== 'free_shipping' && (
                    <LabeledField label={p.discountType === 'fixed_amount' ? 'Valor' : 'Desconto (%)'}>
                      <input type="number" min={0} step="0.01" className={inp} value={p.discountValue ?? 10} onChange={e => up('discountValue', +e.target.value)} />
                    </LabeledField>
                  )}
                </div>
                <Toggle label="Aplicar no carrinho automaticamente" hint="O checkout já abre com o desconto." checked={p.autoApply !== false} onChange={v => (v ? up('autoApply', true) : upMany({ autoApply: false, showCode: true }))} />
                <RewardTiersEditor p={p} up={up} steps={steps} />
              </>
            )}
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
              <BorderStyleControl p={p} up={up} def="dashed" />
            </LabeledField>
          </div>
        </div>

      case 'spacer':
        return <div className="space-y-5">
          <div className="space-y-3">
            <SectionHeader title="Espaçador" icon={<MoveVertical className="w-3 h-3" />} />
            <LabeledField label="Altura" hint="Espaço em branco entre blocos.">
              <Slider value={p.height ?? 24} onChange={v => up('height', v)} min={4} max={200} unit="px" />
            </LabeledField>
            <div className="grid grid-cols-4 gap-2">
              {[8, 16, 24, 48].map(h => (
                <button key={h} onClick={() => up('height', h)}
                  className={`py-2.5 rounded-lg border text-[12px] font-medium transition-colors ${p.height === h ? 'border-zinc-900 bg-gray-100 text-zinc-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
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

      case 'choice':
        return <ChoiceEditor p={p} up={up} steps={steps} />
      case 'wheel':
      case 'scratch':
      case 'cards':
        return <GameEditor type={block.type} p={p} up={up} onOpenMedia={onOpenMedia} hints={hints || { hasCoupon: true, couponTiers: [], baseOfferLabel: '', gameBlocks: 1 }} />
      case 'countdown':
        return <div className="space-y-5">
          <div className="space-y-3">
            <SectionHeader title="Contagem regressiva" icon={<Clock className="w-3 h-3" />} />
            <LabeledField label="Data de término" hint="Popup exibe tempo restante até esta data.">
              <input type="datetime-local" className={inp} value={p.endDate || ''} onChange={e => up('endDate', e.target.value)} />
            </LabeledField>
            {!p.endDate && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 leading-snug">Defina a data final — sem ela o cronômetro fica zerado no site.</p>
              </div>
            )}
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
                <input type="checkbox" checked={!p.hideOnDesktop} onChange={e => up('hideOnDesktop', !e.target.checked)} className="accent-zinc-900" />
                <Monitor className="w-3.5 h-3.5 text-gray-500" />
                <span className="text-xs text-gray-700">Exibir no desktop</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!p.hideOnMobile} onChange={e => up('hideOnMobile', !e.target.checked)} className="accent-zinc-900" />
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
// Aplica o patch de regras (vindo da IA) por cima do behavior atual: cada
// grupo funde com o que já existe, e cart.contains funde um nível a mais.
function mergeBehaviorPatch(beh: PopupDesign['behavior'], patch: Record<string, any>): PopupDesign['behavior'] {
  const out: any = { ...beh }
  for (const [k, v] of Object.entries(patch || {})) {
    if (!v || typeof v !== 'object') continue
    const cur = (out[k] && typeof out[k] === 'object') ? out[k] : {}
    if (k === 'cart' && v.contains && typeof v.contains === 'object') {
      out[k] = { ...cur, ...v, contains: { ...(cur.contains || {}), ...v.contains } }
    } else {
      out[k] = { ...cur, ...v }
    }
  }
  return out
}

// "Descreva quem deve ver" → o servidor pede ao modelo um patch de regras,
// devolve o resumo do que entendeu e o que não dá para fazer. Nada é salvo
// até o lojista aplicar — e mesmo aí é só o design em memória.
function AiTargetingBox({ formId, onApply }: { formId: string; onApply: (patch: Record<string, any>) => void }) {
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ patch: Record<string, any>; summary: string[]; unsupported: string[] } | null>(null)
  const [applied, setApplied] = useState(false)
  const ask = async () => {
    if (!prompt.trim() || busy) return
    setBusy(true); setError(null); setResult(null); setApplied(false)
    try {
      const r = await fetch(`/api/forms/${formId}/ai-targeting`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: prompt.trim() }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Não foi possível gerar as regras')
      setResult({ patch: d.patch || {}, summary: Array.isArray(d.summary) ? d.summary : [], unsupported: Array.isArray(d.unsupported) ? d.unsupported : [] })
    } catch (e: any) { setError(e?.message || 'Não foi possível gerar as regras') }
    finally { setBusy(false) }
  }
  const hasPatch = !!result && Object.keys(result.patch).length > 0
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500 leading-snug">Escreva em português quem deve ver este popup. Ex.: "só no celular, para quem chegou de anúncio, na página de produto, depois de 10 segundos, e nunca para inscritos".</p>
      <textarea className={inp + ' resize-none'} rows={3} value={prompt} onChange={e => setPrompt(e.target.value.slice(0, 600))} placeholder="Quem deve ver e quando…"
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') ask() }} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-gray-400">{prompt.length}/600</span>
        <button type="button" onClick={ask} disabled={busy || !prompt.trim()} className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 inline-flex items-center gap-1.5">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}{busy ? 'Pensando…' : 'Sugerir regras'}
        </button>
      </div>
      {error && <p className="text-[12px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
      {result && (
        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
          {result.summary.length > 0 ? (
            <ul className="space-y-1">
              {result.summary.map((line, i) => <li key={i} className="text-[12px] text-gray-800 flex gap-2"><span className="text-emerald-600 flex-shrink-0">✓</span><span>{line}</span></li>)}
            </ul>
          ) : <p className="text-[12px] text-gray-500">Não entendi uma regra aplicável nesse pedido.</p>}
          {result.unsupported.length > 0 && (
            <ul className="space-y-1 pt-1 border-t border-gray-100">
              {result.unsupported.map((line, i) => <li key={i} className="text-[12px] text-amber-800 flex gap-2"><span className="flex-shrink-0">–</span><span>{line} <span className="text-gray-400">(não existe no produto)</span></span></li>)}
            </ul>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => { setResult(null); setApplied(false) }} className="px-3 py-1.5 text-[12px] font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Descartar</button>
            <button type="button" disabled={!hasPatch || applied} onClick={() => { onApply(result.patch); setApplied(true) }} className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">{applied ? 'Aplicado' : 'Aplicar regras'}</button>
          </div>
          {applied && <p className="text-[11px] text-gray-500">As seções abaixo já refletem as regras. Confira e salve o popup.</p>}
        </div>
      )}
    </div>
  )
}

function BehaviorPanel({ beh, onChange, formId, postSubmit, onPostSubmitChange, successMessage, onSuccessMessageChange, errorMessage, onErrorMessageChange, trackingIds, onTrackingIdsChange }: {
  beh: PopupDesign['behavior']
  onChange: (b: PopupDesign['behavior']) => void
  formId: string
  postSubmit: NonNullable<PopupDesign['postSubmit']>
  onPostSubmitChange: (ps: NonNullable<PopupDesign['postSubmit']>) => void
  successMessage: string
  onSuccessMessageChange: (v: string) => void
  errorMessage: string
  onErrorMessageChange: (v: string) => void
  trackingIds: { facebook_pixel_id: string; google_ads_id: string; google_analytics_id: string }
  onTrackingIdsChange: React.Dispatch<React.SetStateAction<{ facebook_pixel_id: string; google_ads_id: string; google_analytics_id: string }>>
}) {
  const [tab, setTab] = useState<'display' | 'targeting' | 'postsubmit'>('display')
  const setG = (key: keyof PopupDesign['behavior'], val: any) =>
    onChange({ ...beh, [key]: { ...((beh as any)[key] || {}), ...val } })

  // Fetch the org's contact lists once on mount so the Audience section
  // can show a select instead of asking the merchant to paste a UUID.
  // Failure here is non-fatal — we fall back to a free-text input.
  const [orgLists, setOrgLists] = useState<Array<{ id: string; name: string }>>([])
  const [listsLoaded, setListsLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch('/api/lists')
      .then(r => r.ok ? r.json() : { lists: [] })
      .then(d => { if (!cancelled) setOrgLists(d?.lists || d || []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setListsLoaded(true) })
    return () => { cancelled = true }
  }, [])

  // Segmentos da org, para o gate de audiência. Só nome e id.
  const [orgSegments, setOrgSegments] = useState<Array<{ id: string; name: string; segment_type?: string }>>([])
  const [segmentsLoaded, setSegmentsLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch('/api/segments?active_only=true')
      .then(r => r.ok ? r.json() : { segments: [] })
      .then(d => { if (!cancelled) setOrgSegments((d?.segments || []).map((s: any) => ({ id: s.id, name: s.name, segment_type: s.segment_type }))) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSegmentsLoaded(true) })
    return () => { cancelled = true }
  }, [])

  // Templates aprovados de WhatsApp, para o pedido de confirmação.
  const [waTemplates, setWaTemplates] = useState<Array<{ name: string; language: string; category: string; body_text: string | null; body_variables: number; buttons: any }>>([])
  const [waTemplatesLoaded, setWaTemplatesLoaded] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch('/api/whatsapp/templates?status=APPROVED')
      .then(r => r.ok ? r.json() : { templates: [] })
      .then(d => { if (!cancelled) setWaTemplates((d?.templates || []).map((t: any) => ({ name: t.name, language: t.language || 'pt_BR', category: String(t.category || '').toUpperCase(), body_text: t.body_text || null, body_variables: Number(t.body_variables || 0), buttons: t.buttons }))) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setWaTemplatesLoaded(true) })
    return () => { cancelled = true }
  }, [])

  const d: any = beh.display || {}
  const freq = beh.frequency
  const vis = beh.visibility
  const wa = beh.whatsapp || { doubleOptIn: false, templateName: '', templateLanguage: 'pt_BR', bodyVariables: [] }
  const waTemplate = waTemplates.find(t => t.name === wa.templateName && (!wa.templateLanguage || t.language === wa.templateLanguage)) || waTemplates.find(t => t.name === wa.templateName) || null
  const aud = beh.audienceTargeting || { mode: 'off' as const, segmentIds: [], listIds: [] }
  const page = beh.page || { enabled: false, templates: [], productHandles: [], productTypes: [], productVendors: [], productTags: [], collectionHandles: [] }
  const traffic = beh.traffic || { enabled: false, types: [] }
  const smart = beh.smartTrigger || { enabled: false, threshold: 60, minDelaySec: 20 }
  const cartHas = beh.cart?.contains || { enabled: false, match: 'any' as const, handles: [], types: [], vendors: [] }
  const toggleIn = (list: string[], key: string) => list.includes(key) ? list.filter(k => k !== key) : [...list, key]
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
          Exibição
        </button>
        <button onClick={() => setTab('targeting')} className={`flex-1 py-3 text-[12px] font-semibold transition-colors ${tab === 'targeting' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
          Segmentação
        </button>
        <button onClick={() => setTab('postsubmit')} className={`flex-1 py-3 text-[12px] font-semibold transition-colors ${tab === 'postsubmit' ? 'text-gray-900 border-b-2 border-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
          Após envio
        </button>
      </div>

      {tab === 'postsubmit' ? (
        <div>
          <Section title="Ação após envio" defaultOpen>
            <div className="space-y-2">
              {[
                { value: 'show-success', label: 'Mostrar mensagem de sucesso', hint: 'Exibe a etapa de sucesso configurada dentro do popup.' },
                { value: 'close', label: 'Fechar formulário', hint: 'Fecha o popup imediatamente após o envio.' },
                { value: 'redirect', label: 'Redirecionar para URL', hint: 'Envia o visitante para uma página especifica.' },
              ].map(opt => (
                <label key={opt.value} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${postSubmit.action === opt.value ? 'border-zinc-900 bg-gray-100' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="postAction" value={opt.value} checked={postSubmit.action === opt.value}
                    onChange={() => onPostSubmitChange({ ...postSubmit, action: opt.value as any })}
                    className="accent-zinc-900 mt-0.5" />
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
                <Field label="Fechar automaticamente após" hint="Segundos ate fechar o popup. Zero mantem aberto ate o visitante fechar.">
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

          <Section title="Mensagem de erro do envio" defaultOpen>
            <Field label="Mensagem de erro do envio" hint="Mostrada ao visitante quando o envio falha. Deixe em branco para o padrão.">
              <input className={inp} placeholder="Não foi possível enviar. Tente novamente."
                value={errorMessage} onChange={e => onErrorMessageChange(e.target.value)} />
            </Field>
          </Section>

          <Section title="Audiência">
            <p className="text-[11px] text-gray-400 leading-snug -mt-1">Tags e listas aplicadas ao contato quando o formulário for enviado.</p>
            <Field label="Tags (separadas por virgula)" hint="Ex: newsletter, promo. Adicionadas ao contato criado.">
              <input className={inp} placeholder="newsletter, promo"
                value={(beh.audience?.tags || []).join(', ')}
                onChange={e => setG('audience', { tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} />
            </Field>
            <Field label="Lista de contatos (opcional)" hint="O contato sera adicionado a esta lista quando o formulário for enviado.">
              {listsLoaded && orgLists.length > 0 ? (
                <select className={sel}
                  value={beh.audience?.listId || ''}
                  onChange={e => setG('audience', { listId: e.target.value })}>
                  <option value="">Sem lista</option>
                  {orgLists.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              ) : listsLoaded && orgLists.length === 0 ? (
                <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                  Nenhuma lista criada ainda. <a href="/contacts/lists" target="_blank" className="text-zinc-900 underline underline-offset-2 font-medium">Criar agora</a>.
                </div>
              ) : (
                <input className={inp + ' opacity-60'} placeholder="Carregando..." disabled />
              )}
            </Field>
            <ToggleRow label="Double opt-in" hint="Envia email de confirmacao antes de marcar como inscrito."
              checked={!!beh.audience?.doubleOptIn}
              onChange={v => setG('audience', { doubleOptIn: v })} />

            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="WhatsApp: confirmar por mensagem" hint="Quem marcar o consentimento de WhatsApp recebe um template pedindo para responder SIM. O opt-in só vale depois da resposta — e a régua no WhatsApp começa daí."
                checked={!!wa.doubleOptIn}
                onChange={v => setG('whatsapp', { ...wa, doubleOptIn: v })} />
              {wa.doubleOptIn && (
                <div className="mt-2 space-y-2">
                  <Field label="Template de confirmação" hint="Precisa estar aprovado pela Meta na categoria Utilidade (UTILITY). Um botão de resposta rápida 'Confirmar' torna a resposta mais fácil.">
                    {!waTemplatesLoaded ? (
                      <input className={inp + ' opacity-60'} placeholder="Carregando..." disabled />
                    ) : waTemplates.length === 0 ? (
                      <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                        Nenhum template aprovado. <a href="/whatsapp/templates" target="_blank" className="text-zinc-900 underline underline-offset-2 font-medium">Criar template</a>.
                      </div>
                    ) : (
                      <select className={sel} value={wa.templateName ? `${wa.templateName}|${wa.templateLanguage || ''}` : ''}
                        onChange={e => {
                          const [name, language] = e.target.value.split('|')
                          const t = waTemplates.find(x => x.name === name && x.language === language) || waTemplates.find(x => x.name === name)
                          setG('whatsapp', { ...wa, templateName: name || '', templateLanguage: t?.language || language || 'pt_BR', bodyVariables: Array.from({ length: t?.body_variables || 0 }, (_, i) => wa.bodyVariables?.[i] || (i === 0 ? '{{first_name}}' : '')) })
                        }}>
                        <option value="">Escolha um template</option>
                        {waTemplates.map(t => (
                          <option key={t.name + t.language} value={`${t.name}|${t.language}`}>{t.name} · {t.language} · {t.category === 'UTILITY' ? 'Utilidade' : t.category === 'MARKETING' ? 'Marketing' : t.category}</option>
                        ))}
                      </select>
                    )}
                  </Field>
                  {wa.doubleOptIn && !wa.templateName && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Sem template escolhido a confirmação fica desligada: o consentimento marcado no popup vale na hora, sem pedido no WhatsApp.</p>
                  )}
                  {waTemplatesLoaded && wa.templateName && !waTemplate && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">O template salvo ("{wa.templateName}") não está mais aprovado ou foi removido. Escolha outro — até lá o pedido não sai.</p>
                  )}
                  {waTemplate && waTemplate.category !== 'UTILITY' && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Este template é de {waTemplate.category === 'MARKETING' ? 'Marketing' : waTemplate.category}. A Meta não permite marketing antes do opt-in, então o pedido não será enviado. Use um template de Utilidade.</p>
                  )}
                  {waTemplate?.body_text && (
                    <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 whitespace-pre-wrap leading-snug">{waTemplate.body_text}</p>
                  )}
                  {waTemplate && waTemplate.body_variables > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">Variáveis do corpo <span className="normal-case font-normal tracking-normal text-gray-400">({'{{first_name}}'}, {'{{form_name}}'}, {'{{store_name}}'})</span></p>
                      {Array.from({ length: waTemplate.body_variables }, (_, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-gray-400 w-8">{'{{' + (i + 1) + '}}'}</span>
                          <input className={inp} value={wa.bodyVariables?.[i] || ''} placeholder={i === 0 ? '{{first_name}}' : ''}
                            onChange={e => { const next = [...(wa.bodyVariables || [])]; next[i] = e.target.value; setG('whatsapp', { ...wa, bodyVariables: next }) }} />
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-gray-400 leading-snug">Valem como confirmação: SIM, CONFIRMAR, QUERO, ACEITO, OK, 1 ou o botão do template. Quem já tinha opt-in não recebe o pedido. Enquanto não responde, nenhuma campanha ou automação de marketing fala com a pessoa.</p>
                </div>
              )}
            </div>
          </Section>

          <Section title="Rastreamento (Pixels)">
            <p className="text-[11px] text-gray-400 leading-snug -mt-1">
              Dispara eventos de conversão para Facebook Ads e Google Ads/Analytics quando o formulário é enviado. Deixe em branco para não rastrear.
            </p>
            <Field label="Facebook Pixel ID" hint="Número do pixel (ex: 1234567890123456). Dispara o evento Lead.">
              <input className={inp} placeholder="1234567890123456"
                value={trackingIds.facebook_pixel_id}
                onChange={e => onTrackingIdsChange(s => ({ ...s, facebook_pixel_id: e.target.value }))} />
            </Field>
            <Field label="Google Ads Conversion ID" hint="Formato AW-XXXXXXXXXX. Dispara o evento generate_lead.">
              <input className={inp} placeholder="AW-123456789"
                value={trackingIds.google_ads_id}
                onChange={e => onTrackingIdsChange(s => ({ ...s, google_ads_id: e.target.value }))} />
            </Field>
            <Field label="Google Analytics ID" hint="Formato G-XXXXXXXXXX (GA4) ou UA-XXXXXXXX-X.">
              <input className={inp} placeholder="G-XXXXXXXXXX"
                value={trackingIds.google_analytics_id}
                onChange={e => onTrackingIdsChange(s => ({ ...s, google_analytics_id: e.target.value }))} />
            </Field>
          </Section>
        </div>
      ) : tab === 'display' ? (
        <div>
          <Section title="Quando exibir" defaultOpen>
            <ToggleRow label="Quando o visitante estiver saindo da página" hint="Detecta movimento do mouse em direcao a barra de enderecos."
              checked={exitOn} onChange={v => setG('display', { exitEnabled: v })} />

            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Após tempo decorrido" hint="Tempo que o visitante precisa permanecer na página."
                checked={timeOn} onChange={v => setG('display', { timeEnabled: v })} />
              {timeOn && (
                <div className="flex items-center gap-2 mt-2 ml-0">
                  <input type="number" min={0} max={300} className="w-20 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    value={d.delay ?? 5} onChange={e => setG('display', { delay: +e.target.value })} />
                  <span className="text-[12px] text-gray-500">segundos</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Após rolar uma certa quantidade" hint="Percentual de rolagem da página."
                checked={scrollOn} onChange={v => setG('display', { scrollEnabled: v })} />
              {scrollOn && (
                <div className="flex items-center gap-2 mt-2">
                  <input type="number" min={0} max={100} className="w-20 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    value={d.scrollPercent ?? 30} onChange={e => setG('display', { scrollPercent: +e.target.value })} />
                  <span className="text-[12px] text-gray-500">% da página</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Após visitar X páginas" hint="Número mínimo de páginas visitadas antes de exibir."
                checked={pvOn} onChange={v => setG('display', { pageViewEnabled: v })} />
              {pvOn && (
                <div className="flex items-center gap-2 mt-2">
                  <input type="number" min={1} max={50} className="w-20 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    value={d.pageViewCount ?? 3} onChange={e => setG('display', { pageViewCount: +e.target.value })} />
                  <span className="text-[12px] text-gray-500">páginas</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Exibir somente se TODAS as condições forem atendidas"
                hint={d.matchAll ? 'Modo AND: todas as condições ativas precisam ser satisfeitas.' : 'Modo OR: qualquer condição ativa dispara o popup.'}
                checked={!!d.matchAll} onChange={v => setG('display', { matchAll: v })} />
            </div>

            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Segunda chance por intenção" hint="Quem fechou o popup e depois mostra intenção de compra (rola bastante, fica na página, vê produtos, põe no carrinho) vê de novo — uma vez por sessão."
                checked={!!smart.enabled} onChange={v => setG('smartTrigger', { ...smart, enabled: v })} />
              {smart.enabled && (
                <div className="mt-2 space-y-2">
                  <Field label={`Intenção mínima · ${smart.threshold ?? 60}`} hint="Score de 0 a 100 somando rolagem, permanência, páginas vistas, produtos vistos, carrinho, visitante retornante e origem paga. 40 = cedo, 60 = equilibrado, 80 = só quem está quase comprando.">
                    <input type="range" min={20} max={95} step={5} value={smart.threshold ?? 60} onChange={e => setG('smartTrigger', { ...smart, threshold: +e.target.value })} className="w-full accent-zinc-900" aria-label="Intenção mínima" />
                    <div className="flex justify-between text-[10px] text-gray-400 -mt-1"><span>cedo</span><span>equilibrado</span><span>só quase comprando</span></div>
                  </Field>
                  <Field label="Nunca antes de" hint="Segundos desde o carregamento da página e desde o fechamento. Evita o popup voltando na cara de quem acabou de fechar.">
                    <div className="relative w-28"><input type="number" min={5} max={300} className={inp + ' pr-8'} value={smart.minDelaySec ?? 20} onChange={e => setG('smartTrigger', { ...smart, minDelaySec: Math.max(5, Math.min(300, +e.target.value || 20)) })} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">s</span></div>
                  </Field>
                </div>
              )}
            </div>
          </Section>

          <Section title="Frequência">
            <ToggleRow label="Não mostrar novamente se o formulário foi enviado"
              checked={freq.stopAfterSubmission} onChange={v => setG('frequency', { stopAfterSubmission: v })} />
            <div className="pt-2">
              <Field label="Se o visitante fechar, mostrar novamente após" hint="Número de dias até reaparecer.">
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={365} className={inp + ' w-24'}
                    value={freq.showAfterDays} onChange={e => setG('frequency', { showAfterDays: +e.target.value })} />
                  <span className="text-[12px] text-gray-500">dias</span>
                </div>
              </Field>
            </div>
            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Limite por visitante (anti-spam)"
                hint="Limite por pessoa, independente de qual formulário. Usa o cookie __worder_id para identificar o mesmo visitante entre sessões."
                checked={!!freq.perVisitor?.enabled}
                onChange={v => setG('frequency', { perVisitor: { ...(freq.perVisitor || {}), enabled: v } })} />
              {freq.perVisitor?.enabled && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Field label="Máximo de exibicoes">
                    <input type="number" min={1} max={20} className={inp}
                      value={freq.perVisitor?.maxShows ?? 1}
                      onChange={e => setG('frequency', { perVisitor: { ...(freq.perVisitor || {}), maxShows: +e.target.value } })} />
                  </Field>
                  <Field label="Janela (dias)">
                    <input type="number" min={1} max={365} className={inp}
                      value={freq.perVisitor?.windowDays ?? 7}
                      onChange={e => setG('frequency', { perVisitor: { ...(freq.perVisitor || {}), windowDays: +e.target.value } })} />
                  </Field>
                </div>
              )}
            </div>
          </Section>

          <Section title="Dispositivos">
            <div className="space-y-2">
              {[
                { value: 'all', label: 'Todos os dispositivos', icon: Monitor },
                { value: 'desktop', label: 'Somente desktop', icon: Monitor },
                { value: 'mobile', label: 'Somente mobile', icon: Smartphone },
              ].map(opt => (
                <label key={opt.value} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${vis.devices === opt.value ? 'border-zinc-900 bg-gray-100' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" name="devices" value={opt.value} checked={vis.devices === opt.value}
                    onChange={() => setG('visibility', { devices: opt.value })}
                    className="accent-zinc-900" />
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

          <Section title="Prioridade">
            <Field label="Quando outro popup também for elegível" hint="O de maior número aparece; o outro fica para a próxima visita. Só um popup por página.">
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={100} step={1} className={inp + ' max-w-[100px]'}
                  value={beh.priority ?? 0}
                  onChange={e => onChange({ ...beh, priority: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })} />
                <span className="text-[12px] text-gray-500">0 = normal · 100 = sempre primeiro</span>
              </div>
            </Field>
          </Section>

          <Section title="Grupo de controle">
            <p className="text-[11px] text-gray-400 leading-snug">
              Uma parte dos visitantes elegíveis não vê o popup. Comparar as compras dos dois grupos mostra quanto o popup gera de verdade — e não só quanto é creditado a ele. O sorteio é fixo por visitante.
            </p>
            <Field label="Visitantes no grupo de controle" hint="0 desliga. Entre 5% e 20% costuma bastar; o máximo é 50%.">
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={50} step={1} className={inp + ' max-w-[100px]'}
                  value={beh.experiment?.holdoutPercent ?? 0}
                  onChange={e => setG('experiment', { holdoutPercent: Math.max(0, Math.min(50, Math.round(Number(e.target.value) || 0))) })} />
                <span className="text-[12px] text-gray-500">%</span>
              </div>
            </Field>
          </Section>

          <Section title="Perfil progressivo">
            <p className="text-[11px] text-gray-400 leading-snug -mt-1 mb-3">
              Esconde campos que o visitante ja preencheu em visitas anteriores.
              Mostra apenas campos novos, coletando dados incrementalmente.
            </p>
            <ToggleRow label="Ativar perfil progressivo" hint="Visitantes identificados veem menos campos."
              checked={!!(beh as any).progressiveProfiling?.enabled}
              onChange={v => onChange({ ...beh, progressiveProfiling: { ...(beh as any).progressiveProfiling, enabled: v } })} />
            {(beh as any).progressiveProfiling?.enabled && (
              <div className="space-y-2 mt-2">
                <ToggleRow label="Esconder campos ja conhecidos" hint="Ex: se ja temos o email, não mostra o campo email."
                  checked={(beh as any).progressiveProfiling?.hideKnownFields !== false}
                  onChange={v => onChange({ ...beh, progressiveProfiling: { ...(beh as any).progressiveProfiling, hideKnownFields: v } })} />
                <ToggleRow label="Pre-preencher campos conhecidos" hint="Mostra o campo com o valor existente preenchido."
                  checked={!!(beh as any).progressiveProfiling?.prefillKnownFields}
                  onChange={v => onChange({ ...beh, progressiveProfiling: { ...(beh as any).progressiveProfiling, prefillKnownFields: v } })} />
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
          <Section title="Descrever com IA" defaultOpen>
            <AiTargetingBox formId={formId} onApply={patch => onChange(mergeBehaviorPatch(beh, patch))} />
          </Section>
          <Section title="Visitantes" defaultOpen>
            <Field label="Quem deve ver o formulário">
              <select className={sel} value={vis.visitorType} onChange={e => setG('visibility', { visitorType: e.target.value as any })}>
                <option value="all">Todos os visitantes</option>
                <option value="new">Somente visitantes novos</option>
                <option value="returning">Somente visitantes retornantes</option>
              </select>
            </Field>
            <ToggleRow label="Não mostrar a inscritos existentes" hint="Oculta para visitantes ja cadastrados."
              checked={vis.hideFromSubscribers} onChange={v => setG('visibility', { hideFromSubscribers: v })} />
          </Section>

          <Section title="Segmentos e listas">
            <p className="text-[11px] text-gray-400 leading-snug -mt-1">
              Vale para visitantes que já reconhecemos (cookie, link de e-mail ou WhatsApp, login na loja). Quem é desconhecido não está em segmento nenhum.
            </p>
            <Field label="Regra">
              <select className={sel} value={aud.mode} onChange={e => setG('audienceTargeting', { ...aud, mode: e.target.value })}>
                <option value="off">Não filtrar por segmento</option>
                <option value="include">Mostrar somente a quem está em…</option>
                <option value="exclude">Mostrar a todos, exceto quem está em…</option>
              </select>
            </Field>
            {aud.mode !== 'off' && (
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-1.5">Segmentos</p>
                  {!segmentsLoaded ? (
                    <p className="text-[11px] text-gray-400">Carregando…</p>
                  ) : orgSegments.length === 0 ? (
                    <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                      Nenhum segmento ainda. <a href="/contacts/segments" target="_blank" className="text-zinc-900 underline underline-offset-2 font-medium">Criar segmento</a>.
                    </div>
                  ) : (
                    <CheckList items={orgSegments} selected={aud.segmentIds} onToggle={id => setG('audienceTargeting', { ...aud, segmentIds: toggleIn(aud.segmentIds, id) })} />
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-1.5">Listas</p>
                  {!listsLoaded ? (
                    <p className="text-[11px] text-gray-400">Carregando…</p>
                  ) : orgLists.length === 0 ? (
                    <div className="text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">Nenhuma lista criada ainda.</div>
                  ) : (
                    <CheckList items={orgLists} selected={aud.listIds} onToggle={id => setG('audienceTargeting', { ...aud, listIds: toggleIn(aud.listIds, id) })} />
                  )}
                </div>
                {aud.segmentIds.length + aud.listIds.length === 0 && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Escolha ao menos um segmento ou lista — sem isso a regra não faz nada.</p>
                )}
                <p className="text-[11px] text-gray-400 leading-snug">Segmentos dinâmicos são reavaliados a cada 15 minutos; listas valem na hora.</p>
              </div>
            )}
          </Section>

          <Section title="Carrinho">
            <p className="text-[11px] text-gray-400 leading-snug -mt-1">
              Mostra o formulário somente quando o carrinho do visitante atende os critérios. Le <code className="px-1 bg-gray-100 rounded text-[10px]">/cart.js</code> da Shopify.
            </p>
            <ToggleRow label="Filtrar por valor do carrinho"
              checked={!!(beh.cart && beh.cart.enabled)}
              onChange={v => setG('cart', { enabled: v })} />
            {beh.cart?.enabled && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Valor mínimo" hint="Em moeda da loja. 0 = sem mínimo.">
                    <input type="number" min={0} step={0.01} className={inp}
                      placeholder="0"
                      value={beh.cart?.minTotal ?? ''}
                      onChange={e => setG('cart', { minTotal: e.target.value === '' ? 0 : +e.target.value })} />
                  </Field>
                  <Field label="Valor máximo" hint="0 = sem máximo.">
                    <input type="number" min={0} step={0.01} className={inp}
                      placeholder="0"
                      value={beh.cart?.maxTotal ?? ''}
                      onChange={e => setG('cart', { maxTotal: e.target.value === '' ? 0 : +e.target.value })} />
                  </Field>
                </div>
                <Field label="Mínimo de itens" hint="Número mínimo de produtos no carrinho. 0 = sem mínimo.">
                  <input type="number" min={0} className={inp + ' w-24'}
                    placeholder="0"
                    value={beh.cart?.minItems ?? ''}
                    onChange={e => setG('cart', { minItems: e.target.value === '' ? 0 : +e.target.value })} />
                </Field>
              </div>
            )}
            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Filtrar pelo que está no carrinho" hint="Por handle do produto, tipo ou fornecedor. Aceita * como coringa."
                checked={!!cartHas.enabled}
                onChange={v => setG('cart', { contains: { ...cartHas, enabled: v } })} />
              {cartHas.enabled && (
                <div className="mt-2 space-y-2">
                  <Field label="Mostrar quando o carrinho">
                    <select className={sel} value={cartHas.match} onChange={e => setG('cart', { contains: { ...cartHas, match: e.target.value } })}>
                      <option value="any">tem algum destes produtos</option>
                      <option value="none">não tem nenhum destes produtos</option>
                    </select>
                  </Field>
                  <Field label="Handles de produto" hint="Um por linha. Ex.: kit-skincare, camiseta-*">
                    <LinesTextarea rows={2} className={inp + ' font-mono text-[11px]'} value={cartHas.handles} onChange={v => setG('cart', { contains: { ...cartHas, handles: v } })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Tipos de produto">
                      <LinesTextarea rows={2} className={inp + ' font-mono text-[11px]'} value={cartHas.types} onChange={v => setG('cart', { contains: { ...cartHas, types: v } })} />
                    </Field>
                    <Field label="Fornecedores">
                      <LinesTextarea rows={2} className={inp + ' font-mono text-[11px]'} value={cartHas.vendors} onChange={v => setG('cart', { contains: { ...cartHas, vendors: v } })} />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          </Section>

          <Section title="URLs">
            <p className="text-[11px] text-gray-400 leading-snug -mt-1">Use <code className="px-1 bg-gray-100 rounded text-[10px]">*</code> como coringa. Uma URL por linha.</p>

            <ToggleRow label="Exibir somente em certas URLs" checked={urls.includeEnabled} onChange={v => setG('urls', { includeEnabled: v })} />
            {urls.includeEnabled && (
              <LinesTextarea rows={3} className={inp + ' font-mono text-[11px] mt-2'} placeholder="/produtos/*&#10;/promocao" value={urls.includeUrls} onChange={v => setG('urls', { includeUrls: v })} />
            )}

            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Não exibir em certas URLs" checked={urls.excludeEnabled} onChange={v => setG('urls', { excludeEnabled: v })} />
              {urls.excludeEnabled && (
                <LinesTextarea rows={3} className={inp + ' font-mono text-[11px] mt-2'} placeholder="/checkout&#10;/admin/*" value={urls.excludeUrls} onChange={v => setG('urls', { excludeUrls: v })} />
              )}
            </div>
          </Section>

          <Section title="Página">
            <p className="text-[11px] text-gray-400 leading-snug -mt-1">
              Pelo tipo de página da Shopify e, em páginas de produto ou coleção, pelo que está sendo visto. Precisa do bloco de tema da Worder ativo; sem ele, deduz pela URL.
            </p>
            <ToggleRow label="Filtrar pelo contexto da página" checked={page.enabled} onChange={v => setG('page', { ...page, enabled: v })} />
            {page.enabled && (
              <div className="mt-2 space-y-3">
                <div>
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-1.5">Tipos de página <span className="normal-case font-normal tracking-normal text-gray-400">(nenhum = todos)</span></p>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    {PAGE_TEMPLATES.map(t => (
                      <label key={t.key} className="flex items-center gap-2 text-[12px] text-gray-700 cursor-pointer py-0.5">
                        <input type="checkbox" className="rounded border-gray-300" checked={page.templates.includes(t.key)}
                          onChange={() => setG('page', { ...page, templates: toggleIn(page.templates, t.key) })} />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="pt-3 border-t border-gray-100 space-y-2">
                  <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">Produto em vista <span className="normal-case font-normal tracking-normal text-gray-400">(basta bater um)</span></p>
                  <Field label="Handles" hint="Um por linha. Aceita * como coringa."><LinesTextarea rows={2} className={inp + ' font-mono text-[11px]'} value={page.productHandles} onChange={v => setG('page', { ...page, productHandles: v })} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Tipos"><LinesTextarea rows={2} className={inp + ' font-mono text-[11px]'} value={page.productTypes} onChange={v => setG('page', { ...page, productTypes: v })} /></Field>
                    <Field label="Fornecedores"><LinesTextarea rows={2} className={inp + ' font-mono text-[11px]'} value={page.productVendors} onChange={v => setG('page', { ...page, productVendors: v })} /></Field>
                  </div>
                  <Field label="Tags do produto"><LinesTextarea rows={2} className={inp + ' font-mono text-[11px]'} value={page.productTags} onChange={v => setG('page', { ...page, productTags: v })} /></Field>
                </div>
                <div className="pt-3 border-t border-gray-100">
                  <Field label="Coleção em vista" hint="Handles, um por linha."><LinesTextarea rows={2} className={inp + ' font-mono text-[11px]'} value={page.collectionHandles} onChange={v => setG('page', { ...page, collectionHandles: v })} /></Field>
                </div>
              </div>
            )}
          </Section>

          <Section title="Origem do tráfego">
            <p className="text-[11px] text-gray-400 leading-snug -mt-1">
              Classificada uma vez por sessão pelos parâmetros da URL de entrada e pelo site de origem. Vale nas páginas seguintes da mesma visita.
            </p>
            <ToggleRow label="Mostrar só para certas origens" checked={traffic.enabled} onChange={v => setG('traffic', { ...traffic, enabled: v })} />
            {traffic.enabled && (
              <div className="mt-2 space-y-1">
                {TRAFFIC_TYPES.map(t => (
                  <label key={t.key} className="flex items-start gap-2 text-[12px] text-gray-700 cursor-pointer py-1">
                    <input type="checkbox" className="rounded border-gray-300 mt-0.5" checked={traffic.types.includes(t.key)}
                      onChange={() => setG('traffic', { ...traffic, types: toggleIn(traffic.types, t.key) })} />
                    <span><span className="font-medium">{t.label}</span><span className="block text-[11px] text-gray-400 leading-snug">{t.hint}</span></span>
                  </label>
                ))}
                {traffic.types.length === 0 && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-1">Marque ao menos uma origem — sem isso o filtro não faz nada.</p>
                )}
              </div>
            )}
          </Section>

          <Section title="Localização">
            <p className="text-[11px] text-gray-400 leading-snug -mt-1">Código do país ISO (BR, US, PT). Um por linha.</p>

            <ToggleRow label="Exibir em certos países" checked={loc.includeEnabled} onChange={v => setG('location', { includeEnabled: v })} />
            {loc.includeEnabled && (
              <LinesTextarea rows={2} className={inp + ' font-mono text-[11px] mt-2'} placeholder="BR&#10;PT" value={loc.includeCountries} transform={c => c.toUpperCase()} onChange={v => setG('location', { includeCountries: v })} />
            )}

            <div className="pt-3 border-t border-gray-100">
              <ToggleRow label="Não exibir em certos países" checked={loc.excludeEnabled} onChange={v => setG('location', { excludeEnabled: v })} />
              {loc.excludeEnabled && (
                <LinesTextarea rows={2} className={inp + ' font-mono text-[11px] mt-2'} placeholder="US" value={loc.excludeCountries} transform={c => c.toUpperCase()} onChange={v => setG('location', { excludeCountries: v })} />
              )}
            </div>
          </Section>


          <Section title="Parâmetros UTM">
            <ToggleRow label="Salvar UTMs no perfil do contato ao confirmar"
              hint="Quando o visitante enviar o formulário, os parametros UTM serao salvos em contacts.utm_data."
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
                    className="w-full py-2 text-[12px] font-medium text-zinc-900 border border-dashed border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">
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
  const bgi = s.backgroundImage || { enabled: false, src: '' }
  const bgOv = bgi.overlay || {}
  const setBgi = (val: Partial<NonNullable<PopupDesign['styles']['backgroundImage']>>) => onChange({ ...design, styles: { ...s, backgroundImage: { ...bgi, ...val } } })
  const setBgOv = (val: Partial<NonNullable<NonNullable<PopupDesign['styles']['backgroundImage']>['overlay']>>) => onChange({ ...design, styles: { ...s, backgroundImage: { ...bgi, overlay: { ...bgOv, ...val } } } })
  const setCb = (val: Partial<PopupDesign['styles']['closeButton']>) => onChange({ ...design, styles: { ...s, closeButton: { ...s.closeButton, ...val } } })

  // Resolve per-side padding (fallback to legacy single value)
  const pt = s.paddingTop ?? s.padding ?? 32
  const pr = s.paddingRight ?? s.padding ?? 32
  const pb = s.paddingBottom ?? s.padding ?? 32
  const pl = s.paddingLeft ?? s.padding ?? 32

  return (
    <div>
      <Section title="Layout" defaultOpen>
        <Field label="Tipo de formulário">
          <select className={sel} value={design.formType} onChange={e => onChange({ ...design, formType: e.target.value as any })}>
            <option value="popup">Popup</option>
            <option value="flyout">Flyout</option>
            <option value="fullpage">Página inteira</option>
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
        <Field label="Animação">
          <select className={sel} value={s.animation} onChange={e => setS({ animation: e.target.value as any })}>
            <option value="fade">Fade</option>
            <option value="slide-up">Slide up</option>
            <option value="none">Nenhuma</option>
          </select>
        </Field>

        {design.steps.length > 1 && (
          <div className="rounded-lg border border-gray-200 p-2.5 space-y-2">
            <ToggleRow label="Barra de progresso" hint="Mostra em que etapa a pessoa está. Só aparece com duas ou mais etapas."
              checked={!!s.progress?.enabled}
              onChange={v => setS({ progress: { ...(s.progress || {}), enabled: v } })} />
            {s.progress?.enabled && (
              <div className="grid grid-cols-2 gap-2">
                <PanelColorField label="Cor" value={s.progress?.color || '#F97316'} onChange={v => setS({ progress: { ...(s.progress || { enabled: true }), color: v } })} />
                <PanelColorField label="Trilho" value={s.progress?.trackColor || '#E5E7EB'} onChange={v => setS({ progress: { ...(s.progress || { enabled: true }), trackColor: v } })} />
                <Field label="Altura"><div className="relative"><input type="number" min={2} max={16} className={inp + ' pr-8'} value={s.progress?.height ?? 4} onChange={e => setS({ progress: { ...(s.progress || { enabled: true }), height: Math.min(16, Math.max(2, +e.target.value || 4)) } })} /><span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">px</span></div></Field>
              </div>
            )}
          </div>
        )}

        <div>
          <p className="text-[12px] font-medium text-gray-700 mb-2">Padding interno</p>
          <div className="grid grid-cols-3 gap-1.5 max-w-[220px] mx-auto">
            <div />
            <div className="relative"><input type="number" min={0} max={100} className="w-full px-2 py-1.5 pr-6 border border-gray-200 rounded-md text-[12px] text-center outline-none focus:border-zinc-900" value={pt} onChange={e => setS({ paddingTop: +e.target.value })} /><span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">px</span></div>
            <div />
            <div className="relative"><input type="number" min={0} max={100} className="w-full px-2 py-1.5 pr-6 border border-gray-200 rounded-md text-[12px] text-center outline-none focus:border-zinc-900" value={pl} onChange={e => setS({ paddingLeft: +e.target.value })} /><span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">px</span></div>
            <div className="flex items-center justify-center"><div className="w-6 h-6 rounded-sm bg-gray-100 border border-gray-200" /></div>
            <div className="relative"><input type="number" min={0} max={100} className="w-full px-2 py-1.5 pr-6 border border-gray-200 rounded-md text-[12px] text-center outline-none focus:border-zinc-900" value={pr} onChange={e => setS({ paddingRight: +e.target.value })} /><span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">px</span></div>
            <div />
            <div className="relative"><input type="number" min={0} max={100} className="w-full px-2 py-1.5 pr-6 border border-gray-200 rounded-md text-[12px] text-center outline-none focus:border-zinc-900" value={pb} onChange={e => setS({ paddingBottom: +e.target.value })} /><span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">px</span></div>
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

      {/* A foto sangrando atrás de tudo. É o formato dos popups que
          convertem hoje — logo pequena, título gigante e a foto inteira
          por trás —, e até agora o runtime sabia desenhar e o editor não
          sabia pedir. */}
      <Section title="Imagem de fundo">
        <ToggleRow label="Foto atrás do conteúdo" checked={!!bgi.enabled} onChange={v => setBgi({ enabled: v })} />
        {bgi.enabled && (
          <div className="mt-3 space-y-3">
            {bgi.src ? (
              <div className="space-y-2">
                <img src={bgi.src} alt="" className="w-full h-28 object-cover rounded-lg border border-gray-200" />
                <div className="flex gap-2">
                  <button onClick={() => onOpenMedia?.(url => setBgi({ src: url }))}
                    className="flex-1 py-2 text-[12px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">Trocar</button>
                  <button onClick={() => setBgi({ src: '' })} className="flex-1 py-2 text-[12px] font-medium text-red-600 bg-white border border-gray-200 rounded-lg hover:bg-red-50">Remover</button>
                </div>
              </div>
            ) : (
              <button onClick={() => onOpenMedia?.(url => setBgi({ src: url }))}
                className="w-full border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:border-gray-400 hover:bg-gray-100/40 transition-colors">
                <Upload className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <span className="text-[12px] text-gray-500">Escolher imagem da biblioteca</span>
              </button>
            )}
            {/* Sem véu, texto branco sobre foto clara some. Com véu demais,
                a foto vira fundo cinza e não valeu a pena. */}
            <ToggleRow label="Escurecer a foto" checked={bgOv.enabled !== false} onChange={v => setBgOv({ enabled: v })} />
            {bgOv.enabled !== false && (
              <div className="space-y-3">
                <Field label="Cor do véu"><ColorPicker value={bgOv.color || '#000000'} onChange={v => setBgOv({ color: v })} /></Field>
                <Field label={`Intensidade: ${bgOv.opacity ?? 45}%`}>
                  <input type="range" min={0} max={100} value={bgOv.opacity ?? 45} onChange={e => setBgOv({ opacity: +e.target.value })} className="w-full accent-orange-500" />
                </Field>
                <Field label="Como escurecer">
                  <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                    <button onClick={() => setBgOv({ style: 'gradient' })} className={`flex-1 py-2 text-[12px] font-medium transition-colors ${(bgOv.style || 'gradient') === 'gradient' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Degradê</button>
                    <button onClick={() => setBgOv({ style: 'flat' })} className={`flex-1 py-2 text-[12px] font-medium transition-colors ${bgOv.style === 'flat' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Chapado</button>
                  </div>
                </Field>
                <p className="text-[11px] text-gray-400 leading-snug">Degradê escurece só onde o texto fica, preservando a foto em cima. Chapado é para foto muito clara.</p>
              </div>
            )}
          </div>
        )}
        <div className="mt-3">
          <ToggleRow label="Tela cheia no celular" checked={!!s.fullscreenMobile} onChange={v => setS({ fullscreenMobile: v })} />
          <p className="mt-1 text-[11px] text-gray-400 leading-snug">O popup ocupa a tela inteira do celular, sem cantos nem margem — é o que as lojas grandes fazem com foto de fundo.</p>
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
                className="w-full border-2 border-dashed border-gray-200 rounded-lg p-6 text-center hover:border-gray-400 hover:bg-gray-100/40 transition-colors">
                <Upload className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <span className="text-[12px] text-gray-500">Escolher imagem da biblioteca</span>
              </button>
            )}
            <Field label="Posição">
              <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                <button onClick={() => setSi({ position: 'left' })} className={`flex-1 py-2 text-[12px] font-medium transition-colors ${s.sideImage.position === 'left' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Esquerda</button>
                <button onClick={() => setSi({ position: 'right' })} className={`flex-1 py-2 text-[12px] font-medium transition-colors ${s.sideImage.position === 'right' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>Direita</button>
              </div>
            </Field>
            <p className="text-[11px] text-gray-400 leading-snug">A imagem ocupa 50% da largura do popup para um visual limpo e profissional.</p>
          </div>
        )}
      </Section>

      <Section title="Botão fechar">
        <ToggleRow label="Mostrar botão fechar" checked={s.closeButton.show} onChange={v => setCb({ show: v })} />
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
function SortablePopupBlock({ block, isSelected, onSelect, onDelete, onDuplicate, onContentChange }: {
  block: Block; isSelected: boolean; onSelect: () => void; onDelete: () => void; onDuplicate: () => void
  onContentChange: (key: string, value: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, position: 'relative' }}
      onClick={e => { e.stopPropagation(); onSelect() }}
      className={`group relative rounded transition ${isSelected ? 'outline outline-2 outline-offset-1 outline-zinc-900/70' : 'hover:outline hover:outline-1 hover:outline-gray-300 cursor-pointer'}`}>
      {/* Omnisend-style toolbar — small, icon-only. Rendered INSIDE the block
          as a top-right overlay: the popup body has overflow-hidden, so a
          toolbar hanging outside (-left-10) got clipped and was unusable. */}
      {isSelected && (
        <div
          onMouseDown={e => e.preventDefault()}
          onClick={e => e.stopPropagation()}
          className="absolute top-1 right-1 z-20 flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg shadow-md p-0.5"
        >
          <button {...attributes} {...listeners}
            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded cursor-grab active:cursor-grabbing"
            title="Arraste para reordenar">
            <GripHorizontal className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDuplicate()}
            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded"
            title="Duplicar">
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete()}
            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
            title="Remover">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <BlockPreview block={block} selected={isSelected} onContentChange={onContentChange} onSelect={onSelect} />
    </div>
  )
}

// ── Media Library Modal (uses shared component) ─────────────────────────────
import { MediaLibraryModal } from '@/components/shared/MediaLibraryModal'
import { ColorPicker } from '@/components/email-builder/ui/ColorPicker'
import { useStoreStore } from '@/stores'

// ── Step Bar (Omnisend-style, centered, editable step names) ──────────────────
function StepBar({ steps, activeIdx, showSuccess, onSelectStep, onSelectSuccess, onRenameStep, onCloneStep, onDeleteStep, onAddStep, onSetStepKind }: {
  steps: Step[]
  activeIdx: number
  showSuccess: boolean
  onSelectStep: (i: number) => void
  onSelectSuccess: () => void
  onRenameStep: (i: number, name: string) => void
  onCloneStep: (i: number) => void
  onDeleteStep: (i: number) => void
  onAddStep: () => void
  onSetStepKind?: (i: number, kind: Step['kind']) => void
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
                    title={`${step.kind ? STEP_KIND_LABELS[step.kind] + ' · ' : ''}Duplo clique para renomear`}
                    className={`px-2 py-1.5 text-[12px] font-medium whitespace-nowrap transition-colors ${isActive ? 'text-white' : 'text-gray-600'}`}>
                    {step.name}
                    {step.kind && step.kind !== 'form' && (
                      <span className={`ml-1.5 text-[9px] font-semibold uppercase tracking-wide ${isActive ? 'text-white/60' : 'text-gray-400'}`}>{STEP_KIND_LABELS[step.kind]}</span>
                    )}
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
                        {onSetStepKind && (
                          <div className="px-3 py-2 border-t border-gray-100">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Tipo da etapa</p>
                            <select className="w-full text-[12px] border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700"
                              value={step.kind || 'form'}
                              onChange={e => onSetStepKind(i, e.target.value as Step['kind'])}>
                              {(Object.keys(STEP_KIND_LABELS) as Array<NonNullable<Step['kind']>>).map(k => (
                                <option key={k} value={k}>{STEP_KIND_LABELS[k]}</option>
                              ))}
                            </select>
                          </div>
                        )}
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

  // Hydration gate — see the `!mounted` guard before render.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [design, setDesign] = useState<PopupDesign>(defaultDesign)
  // Mirror of `design` updated synchronously by commitDesign/undo/redo so
  // functional updaters resolve against the latest value without putting
  // side effects inside setState updaters (StrictMode double-invokes those).
  const designRef = useRef<PopupDesign>(defaultDesign)
  const [loading, setLoading] = useState(true)
  // Load failure = blocking error state. Rendering defaultDesign after a
  // failed load and letting Ctrl+S through would OVERWRITE the merchant's
  // real popup with the blank template.
  const [loadError, setLoadError] = useState(false)
  const [designLoaded, setDesignLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  // Unsaved-changes tracking: set by every design/name/tracking mutation,
  // cleared on successful save. Guards beforeunload and the Back button.
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [formStatus, setFormStatus] = useState<'draft' | 'published' | 'paused'>('draft')
  // Variante de experimento: edita o design, mas quem vai ao ar é o pai.
  const [abParent, setAbParent] = useState<{ id: string; name: string; label: string } | null>(null)
  // Loja do popup como veio do servidor: salvar só liga uma loja quando não há nenhuma.
  const [formStoreId, setFormStoreId] = useState<string | null>(null)
  const [showExperiment, setShowExperiment] = useState(false)
  const [formName, setFormName] = useState('Popup sem título')
  // Tracking pixel IDs live on the crm_forms row (not in design_json) so
  // the public popup script can pull them server-side and fire fbq/gtag
  // on submit. The editor surfaces them here under the "Após envio" tab.
  const [trackingIds, setTrackingIds] = useState<{
    facebook_pixel_id: string
    google_ads_id: string
    google_analytics_id: string
  }>({ facebook_pixel_id: '', google_ads_id: '', google_analytics_id: '' })
  const [editingName, setEditingName] = useState(false)
  const [preview, setPreview] = useState<'desktop' | 'mobile'>('desktop')
  const [activeStepIdx, setActiveStepIdx] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  // Left sidebar view: 'hub' (overview with Styles/Targeting/Blocks cards) | 'styles' | 'targeting' | 'blocks'
  // Persistent top-level tab in the left sidebar (Omnisend-style). No more
  // drill-down + back button — the merchant always knows which section they're
  // in and switching is one click. Default to "blocks" because that's the most
  // common action when starting from a blank popup.
  const [leftTab, setLeftTab] = useState<'blocks' | 'styles' | 'targeting'>('blocks')
  const [showPreview, setShowPreview] = useState(false)
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')
  // A pré-visualização roda o popup DE VERDADE num iframe (/popup-preview).
  // O nonce remonta o iframe: é o "rodar de novo" depois de fechar o popup
  // ou de jogar uma vez.
  const [previewNonce, setPreviewNonce] = useState(0)
  const previewFrameRef = useRef<HTMLIFrameElement>(null)
  const [showMediaLibrary, setShowMediaLibrary] = useState(false)
  const mediaCallbackRef = useRef<((url: string) => void) | null>(null)
  // Undo/Redo — index-consistent history (seeded on load, trimmed with the
  // index re-derived, all design mutations flow through commitDesign).
  const [hist, setHist] = useState<HistoryState>({ stack: [], idx: -1 })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  // Guarded: a design with steps: [] (or a stale index after undo) must not
  // crash the canvas. Steps are also repaired on load — this is the belt.
  const activeStep: Step = (showSuccess ? design.successStep : (design.steps[activeStepIdx] ?? design.steps[0])) ?? EMPTY_FALLBACK_STEP
  const selectedBlock = activeStep?.blocks.find(b => b.id === selectedBlockId) ?? null

  // ── A bancada de teste ──────────────────────────────────────────────
  // O que o lojista vê ao clicar em "Visualizar" é o POPUP DE VERDADE: o
  // mesmo script que o snippet carrega na loja, rodando dentro de um
  // iframe com a rede encenada (/popup-preview). Antes, aqui, havia uma
  // segunda implementação em React que só DESENHAVA o popup — não dava
  // para avançar de etapa, nem raspar, nem girar, e qualquer diferença
  // entre as duas só aparecia na loja do cliente.
  //
  // Os gatilhos e as travas de frequência são neutralizados na cópia
  // enviada: teste tem de abrir na hora e quantas vezes for preciso.
  const previewDadosRef = useRef({ design, formId, formName })
  previewDadosRef.current = { design, formId, formName }
  useEffect(() => {
    if (!showPreview) return
    let vivo = true
    let carga: { script: string; design: any } | null = null
    let quadroPronto = false
    const enviar = () => {
      const w = previewFrameRef.current?.contentWindow
      if (!vivo || !quadroPronto || !carga || !w) return
      w.postMessage({ type: 'wf-preview-script', script: carga.script, design: carga.design, formId: previewDadosRef.current.formId }, window.location.origin)
    }
    const aoReceber = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return
      if ((ev.data as any)?.type !== 'wf-preview-ready') return
      quadroPronto = true
      enviar()
    }
    window.addEventListener('message', aoReceber)
    void (async () => {
      try {
        const { buildPopupScript } = await import('@/app/api/public/forms/[id]/script/generator')
        const { design: d, formId: fid, formName: fname } = previewDadosRef.current
        const comportamento = {
          ...(d.behavior || {}),
          display: { timeEnabled: true, delay: 0, exitEnabled: false, scrollEnabled: false, pageViewEnabled: false, matchAll: false },
          visibility: { devices: 'all', visitorType: 'all', hideFromSubscribers: false },
          frequency: { showAfterDays: 0, stopAfterSubmission: false },
          // Segmento, carrinho, país, agenda, UTM, re-disparo inteligente e
          // gatilho por código: todos fora. Nenhum deles se pode conferir
          // aqui, e qualquer um deles seguraria o popup para sempre.
          audienceTargeting: null, cart: null, location: null, page: null,
          scheduling: null, smartTrigger: null, targeting: null, traffic: null,
          urls: null, utm: null, customTrigger: null, experiment: null,
        }
        const script = buildPopupScript({ id: fid, name: fname, design_json: d, behavior: comportamento }, window.location.origin)
        if (!vivo) return
        carga = { script, design: d }
        enviar()
      } catch (e) {
        console.error('[preview] não deu para montar o script do popup', e)
      }
    })()
    return () => { vivo = false; window.removeEventListener('message', aoReceber) }
  }, [showPreview, previewNonce])
  // O que o editor de blocos precisa saber do popup inteiro: o bloco de
  // cupom (níveis e oferta base, para os prêmios do jogo) e quantos jogos há.
  const designHints = useMemo(() => {
    const all = [...design.steps, design.successStep].filter(Boolean).flatMap(st => st.blocks || [])
    const cp = all.find(b => b.type === 'coupon')
    return {
      hasCoupon: !!cp,
      // A mesma leitura do servidor: nível sem id não existe para o jogo.
      couponTiers: (Array.isArray(cp?.props?.tiers) ? cp!.props.tiers.filter((t: any) => t && String(t.id || '').replace(/[^a-zA-Z0-9_-]/g, '')) : []) as any[],
      baseOfferLabel: cp ? offerLabelOf(cp.props) : '',
      gameBlocks: all.filter(b => GAME_TYPES.has(b.type)).length,
    }
  }, [design.steps, design.successStep])

  // Drop-zone state for HTML5-drag from the block palette. dropIndicatorIdx
  // is the insertion index inside the active step (0 = before first block,
  // blocks.length = after last). null while no drag is hovering.
  const [dropIndicatorIdx, setDropIndicatorIdx] = useState<number | null>(null)
  const dragLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const blocks = activeStep.blocks
    const oldIdx = blocks.findIndex(b => b.id === active.id)
    const newIdx = blocks.findIndex(b => b.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    updateBlocks(arrayMove(blocks, oldIdx, newIdx))
  }

  const showToast = useCallback((msg: string, type: 'error' | 'success' = 'error') => {
    setToast({ msg, type })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), type === 'error' ? 6000 : 2500)
  }, [])

  // Single choke-point for EVERY design mutation (blocks, styles, behavior,
  // steps, post-submit). Pushes history AFTER resolving the next state —
  // never inside the setState updater (StrictMode double-invokes those and
  // produced duplicate history entries) — and marks the editor dirty.
  const commitDesign = useCallback((next: PopupDesign | ((d: PopupDesign) => PopupDesign)) => {
    const resolved = typeof next === 'function' ? next(designRef.current) : next
    designRef.current = resolved
    setDesign(resolved)
    setHist(h => historyPush(h, JSON.stringify(resolved)))
    setDirty(true)
  }, [])

  const undo = useCallback(() => {
    const res = historyUndo(hist)
    if (!res) return
    const parsed = JSON.parse(res.json) as PopupDesign
    designRef.current = parsed
    setDesign(parsed)
    setHist(res.state)
    setDirty(true)
    setActiveStepIdx(i => Math.max(0, Math.min(i, parsed.steps.length - 1)))
  }, [hist])

  const redo = useCallback(() => {
    const res = historyRedo(hist)
    if (!res) return
    const parsed = JSON.parse(res.json) as PopupDesign
    designRef.current = parsed
    setDesign(parsed)
    setHist(res.state)
    setDirty(true)
    setActiveStepIdx(i => Math.max(0, Math.min(i, parsed.steps.length - 1)))
  }, [hist])

  // Load. Any failure (network, 401, 500, invalid JSON) puts the editor in a
  // blocking error state instead of silently rendering defaultDesign — that
  // silent fallback meant the next Ctrl+S overwrote the merchant's real
  // popup with the blank template.
  const loadForm = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const r = await fetch(`/api/forms/${formId}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      const form = data.form || data
      if (form.name) setFormName(form.name)
      setFormStoreId(form.store_id || null)
      let nextDesign: PopupDesign = defaultDesign
      if (form.design_json && Object.keys(form.design_json).length > 0) {
        // Deep-merge to preserve new default fields (styles/behavior sub-objects)
        // O runtime lê a coluna behavior antes do design_json.behavior; o
        // editor precisa partir do mesmo lugar, senão "aplicar a vencedora"
        // (que só copia design_json) faria o próximo salvar reverter regras.
        const colBehavior = form.behavior && typeof form.behavior === 'object' && Object.keys(form.behavior).length ? form.behavior : null
        const saved = colBehavior ? { ...form.design_json, behavior: colBehavior } : form.design_json
        const merged: PopupDesign = {
          ...defaultDesign,
          ...saved,
          styles: { ...defaultDesign.styles, ...(saved.styles || {}),
            overlay: { ...defaultDesign.styles.overlay, ...(saved.styles?.overlay || {}) },
            closeButton: { ...defaultDesign.styles.closeButton, ...(saved.styles?.closeButton || {}) },
            sideImage: { ...defaultDesign.styles.sideImage, ...(saved.styles?.sideImage || {}) },
            backgroundImage: { ...defaultDesign.styles.backgroundImage, ...(saved.styles?.backgroundImage || {}), overlay: { ...defaultDesign.styles.backgroundImage?.overlay, ...(saved.styles?.backgroundImage?.overlay || {}) } },
          },
          behavior: {
            ...defaultDesign.behavior,
            ...(saved.behavior || {}),
            display: { ...defaultDesign.behavior.display, ...((saved.behavior || {}).display || {}) },
            visibility: { ...defaultDesign.behavior.visibility, ...((saved.behavior || {}).visibility || {}) },
            frequency: {
              ...defaultDesign.behavior.frequency,
              ...((saved.behavior || {}).frequency || {}),
              // Deep-merge perVisitor so disabling it on save doesn't wipe
              // maxShows/windowDays back to undefined on the next load.
              perVisitor: {
                ...defaultDesign.behavior.frequency.perVisitor!,
                ...((((saved.behavior || {}).frequency || {}).perVisitor) || {}),
              },
            },
            targeting: { ...defaultDesign.behavior.targeting, ...((saved.behavior || {}).targeting || {}) },
            scheduling: { ...defaultDesign.behavior.scheduling, ...((saved.behavior || {}).scheduling || {}) },
            audience: { ...defaultDesign.behavior.audience, ...((saved.behavior || {}).audience || {}) },
            urls: { ...defaultDesign.behavior.urls!, ...((saved.behavior || {}).urls || {}) },
            location: { ...defaultDesign.behavior.location!, ...((saved.behavior || {}).location || {}) },
            utm: { ...defaultDesign.behavior.utm!, ...((saved.behavior || {}).utm || {}) },
            clickOutsideClose: { ...defaultDesign.behavior.clickOutsideClose!, ...((saved.behavior || {}).clickOutsideClose || {}) },
            cart: {
              ...defaultDesign.behavior.cart!,
              ...((saved.behavior || {}).cart || {}),
              contains: { ...defaultDesign.behavior.cart!.contains!, ...(((saved.behavior || {}).cart || {}).contains || {}) },
            },
            audienceTargeting: { ...defaultDesign.behavior.audienceTargeting!, ...((saved.behavior || {}).audienceTargeting || {}) },
            smartTrigger: { ...defaultDesign.behavior.smartTrigger!, ...((saved.behavior || {}).smartTrigger || {}) },
            page: { ...defaultDesign.behavior.page!, ...((saved.behavior || {}).page || {}) },
            traffic: { ...defaultDesign.behavior.traffic!, ...((saved.behavior || {}).traffic || {}) },
            whatsapp: { ...defaultDesign.behavior.whatsapp!, ...((saved.behavior || {}).whatsapp || {}) },
          },
          postSubmit: { ...defaultDesign.postSubmit!, ...(saved.postSubmit || {}) },
          successMessage: saved.successMessage || form.success_message || '',
          errorMessage: saved.errorMessage || '',
        }
        // Legacy trigger normalization: popups authored in the OLD editor
        // stored a single `behavior.display.trigger` string and NO boolean
        // flags. The deep-merge above fills timeEnabled/exitEnabled/… from
        // defaults (timeEnabled:true), which defeats the `?? (trigger===…)`
        // fallback and silently flips an exit/scroll popup to time-delay on
        // the next save. Derive the booleans from the legacy trigger when
        // the saved data carried none of them.
        const savedDisplay: any = ((saved.behavior || {}) as any).display || {}
        const hadBooleanTriggers =
          savedDisplay.timeEnabled !== undefined ||
          savedDisplay.scrollEnabled !== undefined ||
          savedDisplay.exitEnabled !== undefined ||
          savedDisplay.pageViewEnabled !== undefined
        if (!hadBooleanTriggers && typeof savedDisplay.trigger === 'string') {
          const t = savedDisplay.trigger
          merged.behavior.display.scrollEnabled = t === 'scroll'
          merged.behavior.display.exitEnabled = t === 'exit_intent'
          merged.behavior.display.pageViewEnabled = t === 'page_view'
          // 'time_delay', unsupported 'click' and any unknown value fall
          // back to the time-delay trigger so the popup still shows.
          merged.behavior.display.timeEnabled = t !== 'scroll' && t !== 'exit_intent' && t !== 'page_view'
        }
        // Seed postSubmit.redirectUrl da coluna legada form.redirect_url apenas
        // para EXIBIÇÃO — NÃO auto-flipar action p/ 'redirect'. O runtime só
        // redireciona quando action==='redirect', então flipar aqui alteraria
        // silenciosamente (no 1º save) um popup que hoje mostra o success step.
        if (!merged.postSubmit!.redirectUrl && form.redirect_url) {
          merged.postSubmit!.redirectUrl = form.redirect_url
        }
        nextDesign = merged
      }
      // Repair malformed step data (steps: [], missing successStep, step
      // without blocks) so the canvas never indexes into undefined.
      nextDesign = repairDesignSteps(nextDesign, uid)
      designRef.current = nextDesign
      setDesign(nextDesign)
      // Seed history with the loaded design so the first undo returns HERE,
      // not to a broken empty stack.
      setHist(historySeed(JSON.stringify(nextDesign)))
      setDirty(false)
      if (form.status) setFormStatus(form.status === 'published' ? 'published' : form.status === 'paused' ? 'paused' : 'draft')
      if (form.ab_parent_id) {
        let parentName = ''
        try { const pr = await fetch(`/api/forms/${form.ab_parent_id}`); const pd = await pr.json(); parentName = pd?.form?.name || pd?.name || '' } catch {}
        setAbParent({ id: form.ab_parent_id, name: parentName, label: form.ab_variant || 'B' })
      } else setAbParent(null)
      // Hydrate pixel IDs from top-level columns. Empty string is the
      // controlled-input-friendly default; null/undefined from the API
      // would put React in uncontrolled mode and warn.
      setTrackingIds({
        facebook_pixel_id: form.facebook_pixel_id || '',
        google_ads_id: form.google_ads_id || '',
        google_analytics_id: form.google_analytics_id || '',
      })
      setDesignLoaded(true)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [formId])

  useEffect(() => { loadForm() }, [loadForm])

  // Save — checks res.ok (401/500 used to look like success), keeps the
  // dirty flag on failure and surfaces the server's error message verbatim
  // (e.g. the 400 "Selecione a loja do popup antes de publicar.").
  const handleSave = useCallback(async () => {
    if (!designLoaded) return false // never save the blank template over a design that didn't load
    setSaving(true)
    try {
      const res = await fetch(`/api/forms/${formId}`, {
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
          // Tracking pixel IDs — null when blank so the public script's
          // existence checks (tr.facebook_pixel_id) actually short-circuit.
          facebook_pixel_id: trackingIds.facebook_pixel_id.trim() || null,
          google_ads_id: trackingIds.google_ads_id.trim() || null,
          google_analytics_id: trackingIds.google_analytics_id.trim() || null,
          // Auto-attach to the current store on every save. Covers the case where
          // the form was created with store_id=NULL because currentStore was still
          // hydrating when the merchant clicked Create — without this, the popup
          // is invisible in the per-store list and stuck as orphan forever.
          ...(!formStoreId && currentStore?.id ? { store_id: currentStore.id } : {}),
        }),
      })
      if (!res.ok) {
        let msg = 'Não foi possível salvar — tente novamente'
        try {
          const d = await res.json()
          if (typeof d?.error === 'string' && d.error) msg = d.error
        } catch { /* body not JSON — keep generic message */ }
        showToast(msg, 'error')
        return false
      }
      setDirty(false)
      if (!formStoreId && currentStore?.id) setFormStoreId(currentStore.id)
      showToast('Alterações salvas', 'success')
      return true
    } catch {
      showToast('Não foi possível salvar — tente novamente', 'error')
      return false
    } finally { setSaving(false) }
  }, [formId, design, formStatus, formName, currentStore?.id, formStoreId, trackingIds, designLoaded, showToast])

  // Publish/unpublish — optimistic toggle WITH rollback: awaits the response
  // and reverts + toasts on failure (e.g. the server pack's 400 when a visual
  // popup has no store in a multi-store org).
  const handlePublish = useCallback(async () => {
    if (!designLoaded || publishing) return
    const prevStatus = formStatus
    // Desativar um popup que já esteve no ar é pausar, não voltar a rascunho.
    const newStatus: 'draft' | 'published' | 'paused' = prevStatus === 'published' ? 'paused' : 'published'
    if (newStatus === 'published') {
      // O que quebraria na loja não vai ao ar: roleta sem setores, contagem
      // sem data, jogo sem cupom.
      const problems = publishProblems(design)
      if (problems.length) { showToast(problems[0], 'error'); return }
      // Ativar publica o que está salvo — nome, pixels e design incluídos.
      if (dirty) { const ok = await handleSave(); if (!ok) return }
    }
    setFormStatus(newStatus)
    setPublishing(true)
    try {
      const res = await fetch(`/api/forms/${formId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          ...(!formStoreId && currentStore?.id ? { store_id: currentStore.id } : {}),
        }),
      })
      if (!res.ok) {
        setFormStatus(prevStatus)
        let msg = newStatus === 'published'
          ? 'Não foi possível ativar o popup — tente novamente'
          : 'Não foi possível desativar o popup — tente novamente'
        try {
          const d = await res.json()
          if (typeof d?.error === 'string' && d.error) msg = d.error
        } catch { /* body not JSON — keep generic message */ }
        showToast(msg, 'error')
        return
      }
      if (!formStoreId && currentStore?.id) setFormStoreId(currentStore.id)
      showToast(newStatus === 'published' ? 'Popup ativado' : 'Popup pausado', 'success')
    } catch {
      setFormStatus(prevStatus)
      showToast('Não foi possível atualizar o status — tente novamente', 'error')
    } finally { setPublishing(false) }
  }, [formId, design, formStatus, currentStore?.id, formStoreId, designLoaded, publishing, dirty, handleSave, showToast])

  const updateBlocks = (blocks: Block[]) => {
    commitDesign(d => {
      if (showSuccess) return { ...d, successStep: { ...d.successStep, blocks } }
      if (d.steps.length === 0) return { ...d, steps: [{ id: uid(), name: 'Etapa 1', blocks }] }
      const idx = Math.max(0, Math.min(activeStepIdx, d.steps.length - 1))
      return { ...d, steps: d.steps.map((s, i) => i === idx ? { ...s, blocks } : s) }
    })
  }

  const addBlock = (type: string) => {
    insertBlockAt(type, activeStep.blocks.length)
  }

  // Compute the insertion index for a native drag at viewport-Y `clientY`
  // by comparing against each rendered block's vertical midpoint.
  const computeDropIdx = (container: HTMLElement, clientY: number): number => {
    const blockEls = Array.from(container.querySelectorAll('[data-popup-block]')) as HTMLElement[]
    for (let i = 0; i < blockEls.length; i++) {
      const rect = blockEls[i].getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    return blockEls.length
  }

  // Insert at a specific index — used by the palette click (appends) and
  // by the HTML5 drop handler on the canvas (drops between siblings).
  const insertBlockAt = (type: string, index: number) => {
    const INPUT_TYPES = ['email', 'phone', 'name-input', 'text-input', 'date-input']
    const base = { ...(defaultProps[type] || {}) }
    if (INPUT_TYPES.includes(type) && design.fieldStyles) {
      Object.assign(base, design.fieldStyles)
    }
    const b: Block = { id: uid(), type, props: base }
    const clamped = Math.max(0, Math.min(index, activeStep.blocks.length))
    const next = [...activeStep.blocks]
    next.splice(clamped, 0, b)
    updateBlocks(next)
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

    commitDesign(d => ({
      ...d,
      steps: d.steps.map(s => ({ ...s, blocks: patchBlocks(s.blocks) })),
      successStep: { ...d.successStep, blocks: patchBlocks(d.successStep.blocks) },
      fieldStyles: stylePayload, // store as global defaults for future inputs
    }))
  }, [commitDesign])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      // Dentro de um campo, Ctrl+Z é o desfazer do próprio campo.
      if ((e.metaKey || e.ctrlKey) && key === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo() }
      if ((e.metaKey || e.ctrlKey) && key === 's') { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, handleSave])

  // Warn before closing/refreshing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const openMediaLibrary = useCallback((callback: (url: string) => void) => {
    mediaCallbackRef.current = callback
    setShowMediaLibrary(true)
  }, [])

  const addStep = () => {
    const s: Step = { id: uid(), name: `Etapa ${design.steps.length + 1}`, blocks: [] }
    commitDesign(d => ({ ...d, steps: [...d.steps, s] }))
    // designRef is updated synchronously by commitDesign
    setActiveStepIdx(designRef.current.steps.length - 1)
    setShowSuccess(false)
  }

  // SSR/hydration mismatch belt-and-suspenders. Even with stable IDs in
  // defaultDesign, useState's lazy init runs on the server pass AND on
  // the client pass. A `mounted` gate guarantees the first commit on
  // the client matches the server output (just the spinner), eliminating
  // every React #422/#425 path. Costs one render frame; users never see
  // a flash because the spinner is the same in both states.
  if (!mounted || loading) {
    return <div className="flex items-center justify-center h-screen"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  // Blocking error state: with the load failed we do NOT render the editor
  // over defaultDesign (saving from there would wipe the merchant's popup).
  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-gray-50 px-6">
        <AlertTriangle className="w-8 h-8 text-amber-500" />
        <div className="text-center max-w-md">
          <p className="text-[15px] font-semibold text-gray-900">Não foi possível carregar o popup</p>
          <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">
            Para proteger o design salvo, a edição fica bloqueada até o popup carregar. Verifique sua conexão e tente novamente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadForm}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-700 transition-colors">
            Tentar novamente
          </button>
          <button onClick={() => router.back()}
            className="px-4 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors">
            Voltar
          </button>
        </div>
      </div>
    )
  }

  const s = design.styles

  // A paridade entre editor e loja não mora mais aqui: a
  // pré-visualização roda o script de verdade (/popup-preview), então
  // tipo de formulário, fundo, tamanho e alinhamento são calculados uma
  // vez só — no runtime. O que sobra nesta tela é a tela de edição.

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <InlineEditableStyles />
      {/* Top bar — Omnisend-inspired with Worder identity */}
      <header className="flex items-center justify-between px-5 h-[52px] bg-zinc-900 shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => {
              if (!dirty || window.confirm('Você tem alterações não salvas. Sair mesmo assim?')) router.back()
            }}
            className="flex-shrink-0 p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors" title="Voltar">
            <ArrowLeft className="w-[18px] h-[18px]" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Worder" className="h-7 flex-shrink-0" />
          <div className="h-5 w-px bg-zinc-700 flex-shrink-0 mx-1" />
          <div className="flex items-center gap-2.5 min-w-0">
            {editingName ? (
              <input
                autoFocus
                value={formName}
                onChange={e => { setFormName(e.target.value); setDirty(true) }}
                onBlur={() => setEditingName(false)}
                onKeyDown={e => { if (e.key === 'Enter') setEditingName(false) }}
                className="text-[14px] font-semibold text-white bg-zinc-700 border border-zinc-600 rounded px-2 py-0.5 outline-none min-w-[200px] max-w-[400px]"
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="group flex items-center gap-1.5 text-[14px] font-semibold text-white hover:bg-zinc-700 px-2 py-0.5 rounded transition-colors"
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
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 rounded flex-shrink-0 tracking-wide">ATIVO</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={undo} disabled={!canUndo(hist)} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-md disabled:opacity-25 transition-colors" title="Desfazer"><Undo2 className="w-4 h-4" /></button>
          <button onClick={redo} disabled={!canRedo(hist)} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-md disabled:opacity-25 transition-colors" title="Refazer"><Redo2 className="w-4 h-4" /></button>
          <div className="h-5 w-px bg-zinc-700 mx-1" />
          <div className="flex items-center bg-zinc-800 rounded-lg p-0.5">
            <button onClick={() => setPreview('desktop')} className={`p-1.5 rounded-md transition-all ${preview === 'desktop' ? 'bg-zinc-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}`} title="Desktop"><Monitor className="w-4 h-4" /></button>
            <button onClick={() => setPreview('mobile')} className={`p-1.5 rounded-md transition-all ${preview === 'mobile' ? 'bg-zinc-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}`} title="Mobile"><Smartphone className="w-4 h-4" /></button>
          </div>
          <div className="h-5 w-px bg-zinc-700 mx-1" />
          <button onClick={() => setShowPreview(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors">
            <Eye className="w-4 h-4" /> Preview
          </button>
          {!abParent && (
            <button onClick={() => { if (!dirty || window.confirm('Você tem alterações não salvas. Sair mesmo assim?')) router.push(`/forms/${formId}/analytics`) }} className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors" title="Resultados do popup">
              <BarChart3 className="w-4 h-4" /> Resultados
            </button>
          )}
          {!abParent && (
            <button onClick={() => setShowExperiment(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-lg transition-colors" title="Teste A/B">
              <span className="font-mono text-[11px] font-bold tracking-wider">A/B</span> Experimento
            </button>
          )}
          <button onClick={handleSave} disabled={saving || !designLoaded} className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar{dirty ? ' •' : ''}
          </button>
          {!abParent && (
            <button onClick={handlePublish} disabled={publishing || !designLoaded} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-50 ${formStatus === 'published' ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700' : 'bg-emerald-500 text-white hover:bg-emerald-600'}`}>
              {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />} {formStatus === 'published' ? 'Pausar' : 'Ativar'}
            </button>
          )}
        </div>
      </header>
      {formStoreId && currentStore?.id && currentStore.id !== formStoreId && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-[12px] text-amber-900">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Este popup é de outra loja, não da loja selecionada agora ({currentStore.name || currentStore.domain}). As alterações valem para a loja dele.</span>
        </div>
      )}
      {abParent && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-violet-50 border-b border-violet-200 text-[12px] text-violet-900">
          <span>Você está editando a <strong>variante {abParent.label}</strong> de <strong>{abParent.name || 'um popup'}</strong>. Ela só aparece na loja pela fatia do experimento — as regras de exibição e o cupom são os do popup principal.</span>
          <button onClick={() => { if (!dirty || window.confirm('Você tem alterações não salvas. Sair mesmo assim?')) router.push(`/popup-editor/${abParent.id}`) }} className="flex-shrink-0 font-semibold underline underline-offset-2 hover:text-violet-700">Voltar ao popup principal</button>
        </div>
      )}
      {showExperiment && !abParent && (
        <ExperimentDrawer formId={formId} formName={formName} formStatus={formStatus} dirty={dirty} onClose={() => setShowExperiment(false)} onOpenVariant={id => { if (!dirty || window.confirm('Você tem alterações não salvas. Sair mesmo assim?')) router.push(`/popup-editor/${id}`) }} onApplied={() => { setShowExperiment(false); loadForm() }} />
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — all controls (Klaviyo-style hub + drill-down panels) */}
        <aside className="w-[340px] bg-white border-r border-gray-200 flex flex-col shrink-0">
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
                        spacer: 'Espaçador', line: 'Linha', coupon: 'Cupom', countdown: 'Contagem', wheel: 'Roleta', scratch: 'Raspadinha', choice: 'Escolhas', cards: 'Cartas',
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
                <BlockEditor block={selectedBlock} onChange={updateBlock} onDelete={() => deleteBlock(selectedBlock.id)} onOpenMedia={openMediaLibrary} onApplyToAllInputs={applyStylesToAllInputs} steps={design.steps.map(s => ({ id: s.id, name: s.name }))} dirty={dirty} couponBlocks={[...design.steps, design.successStep].reduce((n, st) => n + (st?.blocks || []).filter(b => b.type === 'coupon').length, 0)} hints={designHints} />
              </div>
            </>
          ) : (
            <>
              {/* Persistent tab bar — Klaviyo/Worder email-editor style.
                  Removed the inline icons that made "Comportamento" wrap
                  awkwardly inside the 360px sidebar; text-only tabs
                  breathe better and match the email editor's pattern
                  (WorderEmailEditor.tsx). "Regras" is shorter than
                  "Comportamento" and is what Klaviyo calls this section
                  internally ("Targeting Rules"). */}
              <div className="flex border-b border-gray-200 shrink-0 bg-white">
                {([
                  { k: 'blocks', label: 'Blocos' },
                  { k: 'styles', label: 'Estilos' },
                  { k: 'targeting', label: 'Regras' },
                ] as const).map(({ k, label }) => (
                  <button
                    key={k}
                    onClick={() => setLeftTab(k)}
                    className={`flex-1 py-3 text-[12px] font-semibold tracking-tight transition-colors ${leftTab === k ? 'text-zinc-900 border-b-2 border-zinc-900 -mb-px' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {leftTab === 'blocks' ? (
                <div className="flex-1 overflow-y-auto px-4 pb-4">
                  {/* Block palette — same Klaviyo/Omnisend-style cards we
                      use in the email editor (BlockPalette.tsx): white
                      tiles with zinc border, drag dots on hover, grouped
                      by category. Familiar UX, less cognitive load. */}
                  {BLOCK_CATEGORIES.map((cat, idx) => (
                    <div key={cat.name} className={idx > 0 ? 'mt-5' : 'mt-4'}>
                      <p className="text-[11px] font-semibold text-zinc-900 mb-2.5">
                        {cat.name}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {cat.items.map(bt => (
                          <button
                            key={bt.type}
                            onClick={() => addBlock(bt.type)}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('blockType', bt.type)
                              e.dataTransfer.effectAllowed = 'copy'
                            }}
                            title={`Adicionar ${bt.label}`}
                            className="group relative flex flex-col items-center justify-center gap-1.5 py-4 px-2 bg-white border border-zinc-200 rounded-xl hover:border-zinc-400 hover:shadow-md transition-all cursor-grab active:cursor-grabbing active:scale-[0.97]"
                          >
                            {/* Drag dots — top-right, visible on hover. Same
                                grid the email BlockPalette uses for affordance. */}
                            <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-40 transition-opacity">
                              <svg width="10" height="10" viewBox="0 0 10 10" className="text-zinc-400">
                                <circle cx="2" cy="2" r="1" fill="currentColor"/><circle cx="5" cy="2" r="1" fill="currentColor"/><circle cx="8" cy="2" r="1" fill="currentColor"/>
                                <circle cx="2" cy="5" r="1" fill="currentColor"/><circle cx="5" cy="5" r="1" fill="currentColor"/><circle cx="8" cy="5" r="1" fill="currentColor"/>
                              </svg>
                            </div>
                            <bt.icon className="w-[22px] h-[22px] text-zinc-800" strokeWidth={1.5} />
                            <span className="text-[10px] font-medium text-zinc-600 leading-tight select-none text-center">{bt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : leftTab === 'styles' ? (
                <div className="flex-1 overflow-y-auto">
                  <ThemePanel design={design} onChange={commitDesign} onOpenMedia={openMediaLibrary} />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <BehaviorPanel
                    beh={design.behavior}
                    onChange={b => commitDesign(d => ({ ...d, behavior: b }))}
                    formId={formId}
                    postSubmit={design.postSubmit || defaultDesign.postSubmit!}
                    onPostSubmitChange={ps => commitDesign(d => ({ ...d, postSubmit: ps }))}
                    successMessage={design.successMessage || ''}
                    onSuccessMessageChange={v => commitDesign(d => ({ ...d, successMessage: v }))}
                    errorMessage={design.errorMessage || ''}
                    onErrorMessageChange={v => commitDesign(d => ({ ...d, errorMessage: v }))}
                    trackingIds={trackingIds}
                    onTrackingIdsChange={action => { setDirty(true); setTrackingIds(action) }}
                  />
                </div>
              )}
            </>
          )}
        </aside>

        {/* Center canvas — dark Omnisend-inspired background with subtle gradient for depth */}
        <main className="flex-1 flex flex-col items-center overflow-y-auto"
          onClick={() => setSelectedBlockId(null)}
          style={{
            backgroundColor: '#e8eaed',
          }}>
          {showSuccess && (
            <div className="w-full flex justify-center pt-4 -mb-6 relative z-10 pointer-events-none">
              <p className="text-[11px] text-gray-600 bg-white/90 border border-gray-200 rounded-full px-3.5 py-1.5 shadow-sm">
                Etapa de sucesso — o aviso de dupla confirmação (double opt-in) aparece automaticamente aqui quando ativado.
              </p>
            </div>
          )}
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
                {!showSuccess && design.steps.length > 1 && design.styles.progress?.enabled && (
                  <div title="Barra de progresso (Tema → Layout)" style={{ height: design.styles.progress.height ?? 4, background: design.styles.progress.trackColor || '#E5E7EB', borderRadius: 999, margin: '0 0 16px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.round(((activeStepIdx + 1) / design.steps.length) * 100)}%`, height: '100%', background: design.styles.progress.color || '#F97316' }} />
                  </div>
                )}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={activeStep.blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                    {/* Outer drop zone — accepts native HTML5 drags from the
                        block palette. dnd-kit's PointerSensor handles
                        reordering of existing blocks; this layer handles
                        the "drop a new block from the palette" path. */}
                    <div
                      className="space-y-2 min-h-[100px]"
                      onDragOver={(e) => {
                        // Case-insensitive: the HTML DnD spec lowercases custom
                        // format names, so setData('blockType') shows up as
                        // 'blocktype' in .types. A case-sensitive check made
                        // this always false and killed palette drag-and-drop.
                        if (!isBlockTypeDrag(e.dataTransfer.types)) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'copy'
                        if (dragLeaveTimerRef.current) {
                          clearTimeout(dragLeaveTimerRef.current)
                          dragLeaveTimerRef.current = null
                        }
                        setDropIndicatorIdx(computeDropIdx(e.currentTarget as HTMLElement, e.clientY))
                      }}
                      onDragLeave={(e) => {
                        // Ignore boundaries crossed between inner children —
                        // only debounce-clear when the cursor actually left
                        // the drop zone, otherwise the indicator flickers off
                        // mid-list.
                        if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return
                        if (dragLeaveTimerRef.current) clearTimeout(dragLeaveTimerRef.current)
                        dragLeaveTimerRef.current = setTimeout(() => setDropIndicatorIdx(null), 60)
                      }}
                      onDrop={(e) => {
                        const type = e.dataTransfer.getData('blockType')
                        if (!type) return
                        e.preventDefault()
                        // Cancel any pending leave-clear and recompute the
                        // index from the drop position — don't trust the
                        // possibly-stale/null dropIndicatorIdx state.
                        if (dragLeaveTimerRef.current) {
                          clearTimeout(dragLeaveTimerRef.current)
                          dragLeaveTimerRef.current = null
                        }
                        const idx = computeDropIdx(e.currentTarget as HTMLElement, e.clientY)
                        insertBlockAt(type, idx)
                        setDropIndicatorIdx(null)
                      }}
                    >
                      {activeStep.blocks.map((block, i) => (
                        <div key={block.id}>
                          {dropIndicatorIdx === i && (
                            <div className="h-0.5 my-1 bg-blue-500 rounded-full" />
                          )}
                          <div data-popup-block>
                            <SortablePopupBlock block={block} isSelected={selectedBlockId === block.id}
                              onSelect={() => setSelectedBlockId(block.id)}
                              onDelete={() => deleteBlock(block.id)}
                              onDuplicate={() => duplicateBlock(block.id)}
                              onContentChange={(k, v) => updateBlock({ ...block, props: { ...block.props, [k]: v } })}
 />
                          </div>
                        </div>
                      ))}
                      {/* Trailing indicator — after the last block */}
                      {dropIndicatorIdx === activeStep.blocks.length && activeStep.blocks.length > 0 && (
                        <div className="h-0.5 my-1 bg-blue-500 rounded-full" />
                      )}
                      {activeStep.blocks.length === 0 && (
                        <div className={`py-16 text-center border-2 border-dashed rounded-xl transition-colors ${
                          dropIndicatorIdx !== null ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}>
                          <Plus className={`w-8 h-8 mx-auto mb-2 ${dropIndicatorIdx !== null ? 'text-blue-500' : 'text-gray-300'}`} />
                          <p className={`text-sm ${dropIndicatorIdx !== null ? 'text-blue-600' : 'text-gray-400'}`}>
                            {dropIndicatorIdx !== null ? 'Solte para adicionar' : 'Clique ou arraste um bloco da paleta'}
                          </p>
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
            onRenameStep={(i, name) => commitDesign(d => ({ ...d, steps: d.steps.map((s, j) => j === i ? { ...s, name } : s) }))}
            onCloneStep={i => {
              const step = design.steps[i]
              if (!step) return
              const clone: Step = { ...step, id: uid(), name: `${step.name} (cópia)`, blocks: (JSON.parse(JSON.stringify(step.blocks)) as Block[]).map(b => ({ ...b, id: uid() })) }
              commitDesign(d => { const next = [...d.steps]; next.splice(i + 1, 0, clone); return { ...d, steps: next } })
              setActiveStepIdx(i + 1)
            }}
            onDeleteStep={i => {
              if (design.steps.length <= 1) return
              const gone = design.steps[i]?.id
              commitDesign(d => stripStepRefs({ ...d, steps: d.steps.filter((_, j) => j !== i) }, gone))
              setActiveStepIdx(Math.max(0, i - 1))
            }}
            onAddStep={addStep}
            onSetStepKind={(i, kind) => commitDesign(d => ({ ...d, steps: d.steps.map((s, j) => j === i ? { ...s, kind } : s) }))}
          />
        </main>

      </div>

      {/* Preview Mode Overlay */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true" aria-label="Visualização do popup" onKeyDown={e => { if (e.key === 'Escape') setShowPreview(false) }}>
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
              {/* Fechou o popup, jogou uma vez, quer testar outro caminho:
                  recarregar devolve tudo ao começo. */}
              <button onClick={() => setPreviewNonce(n => n + 1)} className="px-3 py-1.5 rounded text-xs font-medium text-gray-300 hover:text-white hover:bg-gray-800" title="Rodar de novo">
                <RotateCcw className="w-4 h-4 inline mr-1" />Rodar de novo
              </button>
            </div>
            <button autoFocus onClick={() => setShowPreview(false)} className="flex items-center gap-2 px-4 py-1.5 bg-white text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-100">
              <X className="w-4 h-4" /> Fechar Preview
            </button>
          </div>
          {/* O popup DE VERDADE, num iframe: mesmo script que a loja
              carrega, com a rede encenada. É onde se avança de etapa, se
              raspa e se gira — não há segunda implementação para mentir. */}
          <div className="flex-1 overflow-hidden bg-gray-200 flex justify-center">
            <iframe
              key={previewNonce}
              ref={previewFrameRef}
              src="/popup-preview?wf_debug=1"
              title="Pré-visualização do popup"
              className="border-0 bg-gray-200"
              style={{
                width: previewDevice === 'mobile' ? 390 : '100%',
                height: '100%',
                maxWidth: '100%',
                boxShadow: previewDevice === 'mobile' ? '0 0 0 1px rgba(0,0,0,.18)' : undefined,
              }}
            />
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

      {/* Toast — save/publish feedback (errors surface the server message verbatim) */}
      {toast && (
        <div role="status"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-[13px] font-medium text-white ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
          {toast.type === 'error' && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
