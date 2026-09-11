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
  category: 'capture' | 'recovery' | 'whatsapp' | 'promo' | 'launch' | 'game' | 'blank'
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
// Escolhas: um clique responde E avança. É o primeiro passo de quase todo
// popup que converte por aí — e a resposta vira segmento depois.
const choice = (id: string, label: string, options: Array<{ label: string; next?: string }>, over: Record<string, any> = {}) => ({
  id, type: 'choice',
  props: {
    label, showLabel: true, labelSize: 17, labelColor: '#FFFFFF', labelGap: 16,
    options: options.map((o, i) => ({ id: `o${i + 1}`, label: o.label, value: o.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 30), next: o.next || '' })),
    mapTo: 'custom', mapToCustom: 'interesse',
    optionBg: '#FFFFFF', optionColor: '#111827', hoverBg: '#F3F4F6',
    fontSize: 16, fontWeight: '600', paddingV: 16, paddingH: 18,
    borderRadius: 2, gap: 10, borderWidth: 0, uppercase: false,
    declineText: '', declineColor: '#E5E7EB', declineSize: 13, declineGap: 16,
    ...over,
  },
})
const radio = (id: string, label: string, options: string[], over: Record<string, any> = {}) => ({
  id, type: 'radio',
  props: { label, options, layout: 'vertical', showLabel: true, required: true, mapTo: 'custom', mapToCustom: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '').slice(0, 30), ...over },
})
// Jogos: cada segmento aponta para a oferta do bloco de cupom (base, um
// nível progressivo pelo id, ou nada). O sorteio é do servidor.
const wheel = (id: string, segments: any[], over: Record<string, any> = {}) => ({
  id, type: 'wheel',
  props: {
    segments, buttonText: 'Girar a roleta', size: 330, labelSize: 12, labelColor: '#FFFFFF',
    strokeColor: '#FFFFFF', pointerColor: '#FFFFFF', rimColor: '#F2C200', rimWidth: 14, rimLights: false, dividerWidth: 2, sound: true,
    // O anel com o convite no meio: tocar no miolo é o que gira.
    hubRadius: 74, hubMode: 'tap', hubText: 'Toque para girar', hubBg: '#FFFFFF', hubColor: '#111827', hubFontSize: 14,
    bgColor: '#111827', textColor: '#FFFFFF', fontSize: 15, borderRadius: 8, fullWidth: true, ...over,
  },
})
// Cartas viradas para baixo: escolher é o jogo, e a escolhida vira em 3D
// no envio mostrando o prêmio que o servidor sorteou.
const cards = (id: string, segments: any[], over: Record<string, any> = {}) => ({
  id, type: 'cards',
  props: {
    segments, showButton: false, count: 3, cardWidth: 104, cardHeight: 138, cardRadius: 14, gap: 12,
    backColor: '#FFFFFF', backText: '?', backTextColor: '#DC2626',
    faceBg: '#FFFFFF', faceColor: '#111827', faceSize: 15,
    ...over,
  },
})
const scratch = (id: string, segments: any[], over: Record<string, any> = {}) => ({
  id, type: 'scratch',
  props: { segments, showButton: false, width: 360, height: 200, coverStyle: 'gold', coverColor: '#C9A227', coverText: 'Raspe aqui', coverTextColor: '#FFFFFF', prizeBg: '#111827', prizeColor: '#FFFFFF', prizeSize: 30, cardRadius: 16, ...over },
})

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
    id: 'quiz-reward',
    name: 'Quiz com recompensa',
    formType: 'popup',
    category: 'capture',
    description: 'Uma pergunta antes do e-mail. Quem responde ganha um nível a mais de desconto — e a resposta vira dado do contato.',
    design: design('popup',
      [
        [
          text('t1', 'Qual é o seu objetivo?'),
          sub('t2', 'Uma pergunta rápida e o desconto sobe.'),
          spacer('sp1'),
          radio('q1', 'Objetivo', ['Hidratar', 'Controlar oleosidade', 'Reduzir manchas', 'Prevenir sinais']),
          button('b1', 'Continuar', { action: 'next-step' }),
        ],
        [
          text('t3', 'Seu desconto está pronto'),
          sub('t4', 'Deixe o e-mail para receber o cupom de 15%.'),
          spacer('sp2'),
          email('e1'),
          consent('c1', ['email'], EMAIL_CONSENT),
          button('b2', 'Quero 15% OFF'),
        ],
      ],
      [
        text('s1', 'Pronto! 15% na primeira compra'),
        sub('s2', 'Já está aplicado no seu carrinho e vale por 7 dias.'),
        coupon('k1', { code: 'QUIZ15', codePrefix: 'QUIZ', tiers: [{ id: 't-quiz', label: '15% por responder o quiz', afterStepId: 'step-2', discountType: 'percentage', discountValue: 15, code: 'QUIZ15' }] }),
      ],
    ),
  },
  {
    id: 'foto-escolha',
    name: 'Foto de fundo + escolhas',
    formType: 'popup',
    category: 'capture',
    description: 'O formato das lojas grandes: foto sangrando, título gigante e botões empilhados. A escolha vira segmento e o e-mail vem na etapa seguinte.',
    design: design('popup',
      [
        [
          // Sem espaço em branco, sem caixa branca: a foto é o fundo, o
          // texto vive por cima dela e o primeiro clique é a resposta.
          sub('m1', 'SUA MARCA', { fontSize: 12, color: '#FFFFFF', letterSpacing: 3, fontWeight: 'bold' }),
          spacer('sp0', 120),
          text('t1', 'VOCÊ GANHOU UMA OFERTA EXCLUSIVA', { fontSize: 40, lineHeight: 1, letterSpacing: -0.5, color: '#FFFFFF' }),
          spacer('sp1', 10),
          choice('c1', 'O que você está procurando?', [
            { label: 'Novidades' },
            { label: 'Mais vendidos' },
            { label: 'Promoções' },
          ], { declineText: 'Só estou olhando' }),
        ],
        [
          text('t2', 'QUASE LÁ', { fontSize: 34, lineHeight: 1.05, color: '#FFFFFF' }),
          sub('t3', 'Deixe seu e-mail e o desconto é seu.', { fontSize: 15, color: '#F3F4F6' }),
          spacer('sp2', 14),
          email('e1', { placeholder: 'Seu melhor e-mail', showLabel: false }),
          consent('cs1', ['email'], EMAIL_CONSENT),
          button('b1', 'QUERO MEU DESCONTO', { bgColor: '#FFFFFF', textColor: '#111827', fontSize: 15, paddingV: 16, borderRadius: 2 }),
        ],
      ],
      [
        text('s1', 'Pronto', { fontSize: 32, color: '#FFFFFF' }),
        sub('s2', 'Seu cupom já está no carrinho e vale por 7 dias.', { color: '#F3F4F6' }),
        coupon('k1', { code: 'EXCLUSIVO10', codePrefix: 'EXCLUSIVO' }),
      ],
      {
        styles: {
          width: 460, minHeight: 560, padding: 28, borderRadius: 4,
          backgroundColor: '#111827',
          // A foto entra pela biblioteca de mídia — o template já vem com
          // o formato montado para ela.
          backgroundImage: { enabled: true, src: '', overlay: { enabled: true, color: '#000000', opacity: 45, style: 'gradient' } },
          fullscreenMobile: true,
          closeButton: { show: true, color: '#FFFFFF', size: 28 },
        },
      },
    ),
  },
  {
    id: 'spin-to-win',
    name: 'Roleta de prêmios',
    formType: 'popup',
    category: 'game',
    description: 'E-mail para girar. O servidor sorteia entre 10%, frete grátis e "tente de novo"; a roleta para no prêmio.',
    design: design('popup',
      [[
        // A ordem das referências que convertem: título grande, uma linha
        // de contexto, o JOGO em destaque, e só depois o campo e o botão.
        // Roleta com botão grudado embaixo dela empurra o e-mail para
        // fora da primeira dobra no celular.
        text('t1', 'Gire e ganhe', { fontSize: 40, lineHeight: 1.05, letterSpacing: -0.5, color: '#111827' }),
        sub('t2', 'Deixe seu e-mail e gire. Todo mundo leva alguma coisa.', { fontSize: 16, color: '#4B5563' }),
        spacer('sp1', 14),
        wheel('w1', [
          { id: 's1', label: '10% OFF', prize: 'base', weight: 35, color: '#F97316' },
          { id: 's2', label: 'Quase!', prize: 'none', weight: 15, color: '#111827' },
          { id: 's3', label: 'Frete grátis', prize: 't-frete', weight: 15, color: '#F97316' },
          { id: 's4', label: '10% OFF', prize: 'base', weight: 20, color: '#111827' },
          { id: 's5', label: 'Tente de novo', prize: 'none', weight: 5, color: '#F97316' },
          { id: 's6', label: '10% OFF', prize: 'base', weight: 10, color: '#111827' },
        ], { showButton: false, size: 300 }),
        spacer('sp2', 16),
        email('e1', { placeholder: 'Seu melhor e-mail' }),
        consent('c1', ['email'], EMAIL_CONSENT),
        button('b1', 'GIRAR A ROLETA', { bgColor: '#111827', fontSize: 15, paddingV: 16, borderRadius: 10 }),
      ]],
      [
        text('s1', 'Você ganhou {{prize}}', { fontSize: 32 }),
        sub('s2', 'Seu cupom já está no carrinho e vale por 7 dias.'),
        coupon('k1', { code: 'ROLETA10', codePrefix: 'ROLETA', tiers: [{ id: 't-frete', label: 'Frete grátis', afterStepId: '', discountType: 'free_shipping', discountValue: 0, code: 'FRETEGRATIS' }] }),
      ],
      { styles: { width: 460, minHeight: 0, fullscreenMobile: true } },
    ),
  },
  {
    id: 'try-your-luck',
    name: 'Cartas da sorte',
    formType: 'popup',
    category: 'game',
    description: 'Três cartas viradas para baixo. O visitante escolhe uma, ela vira em 3D no envio e mostra o desconto que o servidor sorteou.',
    design: design('popup',
      [[
        text('t1', 'Tente a sorte', { fontSize: 38, lineHeight: 1.05, letterSpacing: -0.5, color: '#FFFFFF' }),
        sub('t2', 'Escolha uma carta para descobrir o seu desconto.', { fontSize: 16, color: '#F3F4F6' }),
        spacer('sp1', 18),
        cards('cd1', [
          { id: 's1', label: '10% OFF', prize: 'base', weight: 55, color: '#F97316' },
          { id: 's2', label: 'Frete grátis', prize: 't-frete', weight: 30, color: '#FDBA74' },
          { id: 's3', label: '20% OFF', prize: 't-vinte', weight: 15, color: '#111827' },
        ]),
        spacer('sp2', 18),
        email('e1', { placeholder: 'Seu melhor e-mail', showLabel: false }),
        consent('c1', ['email'], EMAIL_CONSENT),
        button('b1', 'REVELAR MEU PRÊMIO', { bgColor: '#FFFFFF', textColor: '#111827', fontSize: 15, paddingV: 16, borderRadius: 40 }),
      ]],
      [
        text('s1', 'Você ganhou {{prize}}', { fontSize: 32, color: '#FFFFFF' }),
        sub('s2', 'Seu cupom já está no carrinho e vale por 7 dias.', { color: '#F3F4F6' }),
        coupon('k1', {
          code: 'SORTE10', codePrefix: 'SORTE',
          tiers: [
            { id: 't-frete', label: 'Frete grátis', afterStepId: '', discountType: 'free_shipping', discountValue: 0, code: 'FRETEGRATIS' },
            { id: 't-vinte', label: '20% OFF', afterStepId: '', discountType: 'percentage', discountValue: 20, code: 'SORTE20' },
          ],
        }),
      ],
      {
        styles: {
          width: 480, minHeight: 0, padding: 30, borderRadius: 16,
          backgroundColor: '#B91C1C',
          fullscreenMobile: true,
          closeButton: { show: true, color: '#FFFFFF', size: 28 },
        },
      },
    ),
  },
  {
    id: 'scratch-card',
    name: 'Raspadinha',
    formType: 'popup',
    category: 'game',
    description: 'Cartão grande, raspado com o dedo. O prêmio é sorteado no servidor quando o e-mail entra.',
    design: design('popup',
      [[
        text('t1', 'Tente a sorte', { fontSize: 40, lineHeight: 1.05, letterSpacing: -0.5, color: '#111827' }),
        sub('t2', 'Raspe o cartão e veja o seu desconto.', { fontSize: 16, color: '#4B5563' }),
        spacer('sp1', 18),
        scratch('sc1', [
          { id: 's1', label: '10% OFF', prize: 'base', weight: 70, color: '#F97316' },
          { id: 's2', label: 'Frete grátis', prize: 't-frete', weight: 20, color: '#FDBA74' },
          { id: 's3', label: 'Não foi dessa vez', prize: 'none', weight: 10, color: '#111827' },
        ]),
        spacer('sp2', 18),
        email('e1', { placeholder: 'Seu melhor e-mail' }),
        consent('c1', ['email'], EMAIL_CONSENT),
        button('b1', 'Raspar e ver meu prêmio', { bgColor: '#111827', fontSize: 15, paddingV: 16, borderRadius: 10 }),
      ]],
      [
        text('s1', 'Você ganhou {{prize}}', { fontSize: 32 }),
        sub('s2', 'Seu cupom já está no carrinho e vale por 7 dias.'),
        coupon('k1', { code: 'RASPOU10', codePrefix: 'RASPOU', tiers: [{ id: 't-frete', label: 'Frete grátis', afterStepId: '', discountType: 'free_shipping', discountValue: 0, code: 'FRETEGRATIS' }] }),
      ],
      { styles: { width: 460, minHeight: 0, fullscreenMobile: true } },
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
  { id: 'game', label: 'Jogos' },
]

export function findTemplate(id: string): PopupTemplate | undefined {
  return POPUP_TEMPLATES.find((t) => t.id === id)
}
