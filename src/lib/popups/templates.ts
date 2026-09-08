// =============================================
// Templates de popup — pontos de partida que funcionam de verdade
//
// Cada template é um design completo (etapas, blocos, comportamento) que
// o editor abre pronto para publicar. A galeria anterior listava nomes
// como "Spin the Wheel" e "Pesquisa NPS" que criavam um popup em branco —
// a promessa não cabia no produto. Aqui só entra o que o editor entrega.
// =============================================

export type PopupFormType = 'popup' | 'flyout' | 'embed' | 'fullpage' | 'banner'

export interface PopupTemplate {
  id: string
  name: string
  formType: PopupFormType
  category: 'capture' | 'recovery' | 'whatsapp' | 'promo' | 'launch' | 'blank'
  description: string
  /** design_json completo; vazio = o editor usa o padrão. */
  design: Record<string, any>
}

const text = (id: string, content: string, over: Record<string, any> = {}) => ({
  id, type: 'text',
  props: { content, fontSize: 28, color: '#111827', fontWeight: 'bold', align: 'center', tag: 'h2', lineHeight: 1.25, ...over },
})
const sub = (id: string, content: string, over: Record<string, any> = {}) => ({
  id, type: 'text',
  props: { content, fontSize: 15, color: '#6B7280', fontWeight: 'normal', align: 'center', tag: 'p', lineHeight: 1.5, ...over },
})
const email = (id: string, over: Record<string, any> = {}) => ({
  id, type: 'email',
  props: { placeholder: 'Seu melhor e-mail', label: 'E-mail', required: true, mapTo: 'email', ...over },
})
const phone = (id: string, over: Record<string, any> = {}) => ({
  id, type: 'phone',
  props: { placeholder: 'Seu WhatsApp', label: 'WhatsApp', required: true, countryCode: '+55', mapTo: 'whatsapp', ...over },
})
const button = (id: string, label: string, over: Record<string, any> = {}) => ({
  id, type: 'button',
  props: { text: label, bgColor: '#111827', textColor: '#FFFFFF', fontSize: 15, borderRadius: 8, fullWidth: true, action: 'submit', paddingV: 14, paddingH: 28, ...over },
})
const consent = (id: string, channels: string[], label: string) => ({
  id, type: 'legal-consent',
  props: { text: label, channels, required: true, fontSize: 12, color: '#6B7280', consentVersion: 'v1' },
})
const coupon = (id: string, over: Record<string, any> = {}) => ({
  id, type: 'coupon',
  props: {
    mode: 'unique', code: 'BEMVINDO10', description: 'Seu cupom:', discountType: 'percentage', discountValue: 10,
    validityDays: 7, codePrefix: 'BEMVINDO', autoApply: true, showCode: true,
    bgColor: '#FFF7ED', borderColor: '#F97316', borderStyle: 'dashed', codeColor: '#F97316', fontSize: 22, ...over,
  },
})
const spacer = (id: string, height = 8) => ({ id, type: 'spacer', props: { height } })

const baseStyles = {
  width: 480, minHeight: 420, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 32, fontFamily: 'Inter, sans-serif',
  overlay: { enabled: true, color: '#000000', opacity: 50, closeOnClick: true },
  closeButton: { show: true, color: '#6B7280', size: 28 },
  sideImage: { enabled: false, src: '', position: 'left', width: 50 },
  animation: 'fade',
}

const baseBehavior = {
  display: { exitEnabled: false, timeEnabled: true, delay: 5, scrollEnabled: false, scrollPercent: 30, pageViewEnabled: false, pageViewCount: 3, matchAll: false },
  visibility: { devices: 'all', visitorType: 'all', hideFromSubscribers: true },
  frequency: { showAfterDays: 7, stopAfterSubmission: true, perVisitor: { enabled: false, maxShows: 1, windowDays: 7 } },
  targeting: { pages: 'all', pageUrls: [], excludeUrls: [] },
  scheduling: { enabled: false, startDate: '', endDate: '' },
  audience: { tags: [], listId: '', doubleOptIn: false },
  urls: { includeEnabled: false, includeUrls: [], excludeEnabled: false, excludeUrls: [] },
  location: { includeEnabled: false, includeCountries: [], excludeEnabled: false, excludeCountries: [] },
  utm: { storeOnConsent: true, filterEnabled: false, filters: [] },
  clickOutsideClose: { desktop: true, mobile: true },
  customTrigger: false,
  cart: { enabled: false, minTotal: 0, maxTotal: 0, minItems: 0 },
  experiment: { holdoutPercent: 0 },
}

function design(formType: PopupFormType, steps: any[], successBlocks: any[], over: Record<string, any> = {}) {
  return {
    formType,
    steps: steps.map((blocks, i) => ({ id: `step-${i + 1}`, name: `Etapa ${i + 1}`, blocks })),
    successStep: { id: 'success', name: 'Sucesso', blocks: successBlocks },
    styles: { ...baseStyles, ...(over.styles || {}) },
    behavior: { ...baseBehavior, ...(over.behavior || {}) },
    postSubmit: { action: 'show-success', redirectUrl: '', closeDelay: 0 },
    successMessage: '',
    errorMessage: '',
  }
}

const EMAIL_CONSENT = 'Quero receber ofertas e novidades da loja por e-mail. Posso cancelar quando quiser.'
const WHATSAPP_CONSENT = 'Autorizo a loja a me enviar ofertas pelo WhatsApp. Para parar, basta responder PARAR.'

export const POPUP_TEMPLATES: PopupTemplate[] = [
  {
    id: 'welcome-coupon',
    name: 'Boas-vindas com cupom',
    formType: 'popup',
    category: 'capture',
    description: 'E-mail em troca de um cupom único, aplicado sozinho no checkout.',
    design: design('popup',
      [[
        text('t1', 'Ganhe 10% na primeira compra'),
        sub('t2', 'Deixe seu e-mail e receba o cupom na hora.'),
        spacer('sp1'),
        email('e1'),
        consent('c1', ['email'], EMAIL_CONSENT),
        button('b1', 'Quero meu cupom'),
      ]],
      [
        text('s1', 'Pronto! Aqui está o seu cupom'),
        sub('s2', 'Ele já está aplicado no seu carrinho e vale por 7 dias.'),
        coupon('k1'),
      ],
    ),
  },
  {
    id: 'exit-intent',
    name: 'Antes de sair',
    formType: 'popup',
    category: 'recovery',
    description: 'Aparece quando o visitante vai fechar a aba. Última chance de captura.',
    design: design('popup',
      [[
        text('t1', 'Espera — ainda não vai?'),
        sub('t2', 'Deixe seu e-mail e ganhe frete grátis no primeiro pedido.'),
        spacer('sp1'),
        email('e1'),
        consent('c1', ['email'], EMAIL_CONSENT),
        button('b1', 'Quero frete grátis'),
      ]],
      [
        text('s1', 'Frete grátis garantido'),
        sub('s2', 'Já está no seu carrinho. Bom pedido!'),
        coupon('k1', { discountType: 'free_shipping', discountValue: 0, codePrefix: 'FRETE', code: 'FRETEGRATIS', description: 'Seu código:' }),
      ],
      { behavior: { display: { ...baseBehavior.display, exitEnabled: true, timeEnabled: false } } },
    ),
  },
  {
    id: 'whatsapp-optin',
    name: 'Opt-in de WhatsApp',
    formType: 'popup',
    category: 'whatsapp',
    description: 'Número com autorização explícita. Dispara a régua de boas-vindas no WhatsApp.',
    design: design('popup',
      [[
        text('t1', 'Ofertas primeiro no seu WhatsApp'),
        sub('t2', 'Lançamentos e promoções antes de todo mundo. Sem spam.'),
        spacer('sp1'),
        phone('p1'),
        consent('c1', ['whatsapp'], WHATSAPP_CONSENT),
        button('b1', 'Quero receber no WhatsApp'),
      ]],
      [
        text('s1', 'Anotado!'),
        sub('s2', 'Você vai receber uma mensagem nossa em instantes.'),
      ],
    ),
  },
  {
    id: 'newsletter-embed',
    name: 'Newsletter no rodapé',
    formType: 'embed',
    category: 'capture',
    description: 'Formulário inline para o rodapé ou uma página. Sem gatilho, sem overlay.',
    design: design('embed',
      [[
        text('t1', 'Receba as novidades', { fontSize: 20, align: 'left' }),
        email('e1'),
        consent('c1', ['email'], EMAIL_CONSENT),
        button('b1', 'Assinar'),
      ]],
      [text('s1', 'Inscrição confirmada', { fontSize: 18, align: 'left' })],
      { styles: { width: 420, minHeight: 0, padding: 0, overlay: { enabled: false, color: '#000000', opacity: 0, closeOnClick: false }, closeButton: { show: false, color: '#6B7280', size: 24 } } },
    ),
  },
  {
    id: 'promo-banner',
    name: 'Faixa de promoção',
    formType: 'banner',
    category: 'promo',
    description: 'Uma linha no topo com a oferta e um botão. Sem formulário.',
    design: design('banner',
      [[
        text('t1', 'Frete grátis acima de R$ 199 só até domingo', { fontSize: 15, tag: 'p', fontWeight: '600' }),
        button('b1', 'Ver ofertas', { action: 'url', url: '/collections/all', fullWidth: false, paddingV: 8, paddingH: 16, fontSize: 13 }),
      ]],
      [],
      { styles: { width: 1200, minHeight: 0, padding: 12, borderRadius: 0, overlay: { enabled: false, color: '#000000', opacity: 0, closeOnClick: false } }, behavior: { display: { ...baseBehavior.display, delay: 0 }, visibility: { devices: 'all', visitorType: 'all', hideFromSubscribers: false } } },
    ),
  },
  {
    id: 'launch-fullpage',
    name: 'Lista de espera',
    formType: 'fullpage',
    category: 'launch',
    description: 'Tela cheia para pré-lançamento: nome e e-mail de quem quer saber primeiro.',
    design: design('fullpage',
      [[
        text('t1', 'Está chegando', { fontSize: 40 }),
        sub('t2', 'Entre na lista e seja avisado no minuto em que abrir.'),
        spacer('sp1', 12),
        { id: 'n1', type: 'name-input', props: { placeholder: 'Seu nome', label: 'Nome', mapTo: 'first_name' } },
        email('e1'),
        consent('c1', ['email'], EMAIL_CONSENT),
        button('b1', 'Me avise'),
      ]],
      [text('s1', 'Você está na lista'), sub('s2', 'Avisamos por e-mail assim que abrir.')],
      { styles: { width: 560, minHeight: 0 } },
    ),
  },
  {
    id: 'blank',
    name: 'Em branco',
    formType: 'popup',
    category: 'blank',
    description: 'Comece do zero com o padrão do editor.',
    design: {},
  },
]

export const TEMPLATE_CATEGORIES: Array<{ id: PopupTemplate['category'] | 'all'; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'capture', label: 'Captura' },
  { id: 'recovery', label: 'Recuperação' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'promo', label: 'Promoção' },
  { id: 'launch', label: 'Lançamento' },
]

export function findTemplate(id: string): PopupTemplate | undefined {
  return POPUP_TEMPLATES.find((t) => t.id === id)
}
