// ═══════════════════════════════════════════════════════════════
// Prebuilt Email Templates
// Cada template é um EmailDocument completo com sections/columns/blocks
// reais do editor — assim o usuário pode continuar editando
// normalmente e merge tags funcionam em produção.
// ═══════════════════════════════════════════════════════════════

import type { EmailDocument, EmailSection, EmailBlock } from './types'

export interface PrebuiltTemplate {
  id: string
  name: string
  category: string
  description: string
  icon: string
  /** EmailDocument carregado no editor — blocos reais editáveis */
  design: EmailDocument
  /** HTML pré-renderizado usado para thumbnail na listagem */
  html: string
}

// ── ID helpers (determinísticos por template para evitar colisões) ──
let _uidCounter = 0
function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${(++_uidCounter).toString(36)}`
}

function block(type: EmailBlock['type'], props: Record<string, any>): EmailBlock {
  return { id: uid('b'), type, props }
}

function section(blocks: EmailBlock[], styles: Partial<EmailSection['styles']> = {}): EmailSection {
  return {
    id: uid('s'),
    columns: [{ id: uid('c'), width: 100, blocks }],
    styles: {
      backgroundColor: '',
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      stackOnMobile: true,
      ...styles,
    },
  }
}

function twoColSection(
  leftBlocks: EmailBlock[],
  rightBlocks: EmailBlock[],
  widths: [number, number] = [50, 50],
  styles: Partial<EmailSection['styles']> = {}
): EmailSection {
  return {
    id: uid('s'),
    columns: [
      { id: uid('c'), width: widths[0], blocks: leftBlocks },
      { id: uid('c'), width: widths[1], blocks: rightBlocks },
    ],
    styles: {
      backgroundColor: '',
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      stackOnMobile: true,
      ...styles,
    },
  }
}

// ── Settings padrão dos templates (Worder brand) ──
const BASE_SETTINGS: EmailDocument['settings'] = {
  backgroundColor: '#f3f4f6',
  contentBackgroundColor: '#ffffff',
  contentWidth: 600,
  fontFamily: "'DM Sans', Arial, Helvetica, sans-serif",
  borderRadius: 8,
  preheaderText: '',
  textStyles: {
    body: { fontSize: 16, color: '#374151', lineHeight: 1.6 },
    h1: { fontSize: 28, color: '#111827', lineHeight: 1.2 },
    h2: { fontSize: 22, color: '#111827', lineHeight: 1.3 },
    h3: { fontSize: 18, color: '#111827', lineHeight: 1.4 },
    h4: { fontSize: 16, color: '#111827', lineHeight: 1.4 },
    link: { color: '#F97316', underline: true },
  },
  buttonStyles: {
    primary: { bgColor: '#F97316', textColor: '#FFFFFF', borderRadius: 8, fontWeight: 'bold' },
    secondary: { bgColor: '#FFFFFF', textColor: '#F97316', borderRadius: 8, fontWeight: 'bold' },
  },
}

// ── Blocos reutilizáveis ──
const headerLogo = () => block('header', {
  logoSrc: 'https://placehold.co/160x45/FFFFFF/F97316?text=LOGO',
  logoWidth: 160,
  logoHref: '{{store_url}}',
  showLinks: false,
  links: [],
  padding: { top: 24, right: 24, bottom: 8, left: 24 },
  backgroundColor: '#FFFFFF',
})

const footerStandard = () => block('footer', {
  companyName: '{{store_name}}',
  address: '',
  showUnsubscribe: true,
  showPreferences: false,
  showViewInBrowser: true,
  textColor: '#9CA3AF',
  fontSize: 11,
  padding: { top: 32, right: 24, bottom: 32, left: 24 },
  backgroundColor: '#F9FAFB',
})

// ═══════════════════════════════════════════════════════════════
// 1. BOAS-VINDAS
// ═══════════════════════════════════════════════════════════════
const welcomeDoc: EmailDocument = {
  version: 2,
  settings: BASE_SETTINGS,
  sections: [
    section([headerLogo()]),
    section([
      block('text', {
        contentHtml: '<h1 style="margin:0;text-align:center;font-size:28px;font-weight:700;color:#111827;">Bem-vindo(a), {{first_name}}! 🎉</h1>',
        fontSize: 28,
        color: '#111827',
        lineHeight: 1.2,
        align: 'center',
        padding: { top: 16, right: 24, bottom: 8, left: 24 },
        backgroundColor: '',
      }),
      block('text', {
        contentHtml: '<p style="margin:0;text-align:center;font-size:16px;color:#4B5563;line-height:1.6;">Estamos muito felizes em ter você conosco! Como presente de boas-vindas, preparamos um cupom especial para sua primeira compra.</p>',
        fontSize: 16,
        color: '#4B5563',
        lineHeight: 1.6,
        align: 'center',
        padding: { top: 8, right: 32, bottom: 20, left: 32 },
        backgroundColor: '',
      }),
      block('coupon', {
        headerText: 'Use o cupom abaixo:',
        code: 'BEMVINDO10',
        footerText: '10% de desconto · Válido por 7 dias',
        codeFontSize: 32,
        codeColor: '#EA580C',
        borderStyle: 'dashed',
        borderColor: '#EA580C',
        borderRadius: 12,
        padding: { top: 24, right: 24, bottom: 24, left: 24 },
        backgroundColor: '#FFF7ED',
      }),
      block('button', {
        text: 'Explorar a Loja',
        href: '{{store_url}}',
        bgColor: '#F97316',
        textColor: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        borderRadius: 8,
        paddingH: 32,
        paddingV: 14,
        align: 'center',
        fullWidth: false,
        padding: { top: 16, right: 24, bottom: 32, left: 24 },
        backgroundColor: '',
      }),
    ]),
    section([footerStandard()]),
  ],
}

// ═══════════════════════════════════════════════════════════════
// 2. CARRINHO ABANDONADO
// ═══════════════════════════════════════════════════════════════
const abandonedCartDoc: EmailDocument = {
  version: 2,
  settings: BASE_SETTINGS,
  sections: [
    section([headerLogo()]),
    section([
      block('text', {
        contentHtml: '<h1 style="margin:0;text-align:center;font-size:26px;font-weight:700;color:#111827;">Esqueceu algo? 🛒</h1>',
        fontSize: 26,
        color: '#111827',
        lineHeight: 1.2,
        align: 'center',
        padding: { top: 16, right: 24, bottom: 8, left: 24 },
        backgroundColor: '',
      }),
      block('text', {
        contentHtml: '<p style="margin:0;text-align:center;font-size:15px;color:#6B7280;line-height:1.5;">Olá {{first_name}}, seus itens ainda estão esperando por você!</p>',
        fontSize: 15,
        color: '#6B7280',
        lineHeight: 1.5,
        align: 'center',
        padding: { top: 8, right: 32, bottom: 20, left: 32 },
        backgroundColor: '',
      }),
      block('abandoned-cart', {
        layoutType: 'image-left',
        maxItems: 3,
        showImage: true,
        showName: true,
        showDescription: false,
        showPrice: true,
        showOldPrice: false,
        showButton: false,
        nameFontSize: 15,
        nameColor: '#111827',
        nameWeight: '600',
        nameFontFamily: 'inherit',
        descFontSize: 13,
        descColor: '#6B7280',
        descWeight: '400',
        priceFontSize: 16,
        priceColor: '#F97316',
        priceWeight: '700',
        oldPriceColor: '#9CA3AF',
        buttonText: 'Shop now',
        buttonHref: '{{checkout_url}}',
        buttonColor: '#111827',
        buttonTextColor: '#FFFFFF',
        buttonRadius: 4,
        buttonFontSize: 14,
        buttonAlign: 'left',
        buttonPaddingV: 10,
        buttonPaddingH: 24,
        imageWidth: 100,
        imageBorderRadius: 8,
        showOutOfStock: false,
        stackOnMobile: true,
        separator: true,
        separatorColor: '#E5E7EB',
        padding: { top: 8, right: 24, bottom: 16, left: 24 },
        backgroundColor: '',
        visibility: 'all',
      }),
      block('button', {
        text: 'Finalizar Compra',
        href: '{{checkout_url}}',
        bgColor: '#F97316',
        textColor: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        borderRadius: 8,
        paddingH: 32,
        paddingV: 14,
        align: 'center',
        fullWidth: false,
        padding: { top: 16, right: 24, bottom: 32, left: 24 },
        backgroundColor: '',
      }),
    ]),
    section([footerStandard()]),
  ],
}

// ═══════════════════════════════════════════════════════════════
// 3. PROMOÇÃO / FLASH SALE
// ═══════════════════════════════════════════════════════════════
const promotionDoc: EmailDocument = {
  version: 2,
  settings: BASE_SETTINGS,
  sections: [
    section([
      block('text', {
        contentHtml: '<h1 style="margin:0 0 8px;text-align:center;font-size:32px;font-weight:700;color:#FFFFFF;">🔥 PROMOÇÃO RELÂMPAGO</h1><p style="margin:0;text-align:center;font-size:18px;color:#FED7AA;">Até 50% OFF em produtos selecionados</p>',
        fontSize: 32,
        color: '#FFFFFF',
        lineHeight: 1.2,
        align: 'center',
        padding: { top: 40, right: 24, bottom: 40, left: 24 },
        backgroundColor: '',
      }),
    ], { backgroundColor: '#F97316' }),
    section([
      block('text', {
        contentHtml: '<p style="margin:0;text-align:center;font-size:16px;color:#4B5563;line-height:1.6;">Olá {{first_name}}, não perca essa oportunidade!</p>',
        fontSize: 16,
        color: '#4B5563',
        lineHeight: 1.6,
        align: 'center',
        padding: { top: 24, right: 32, bottom: 16, left: 32 },
        backgroundColor: '',
      }),
      block('product-grid', {
        mode: 'dynamic',
        feedType: 'bestsellers',
        feedId: '',
        feedName: 'Mais Vendidos',
        title: '',
        columns: 2,
        rows: 2,
        maxImageHeight: 260,
        layout: 'grid',
        imageRatio: 'square',
        showName: true,
        showPrice: true,
        showComparePrice: true,
        showButton: false,
        buttonText: 'Comprar',
        buttonColor: '#F97316',
        buttonTextColor: '#FFFFFF',
        buttonRadius: 6,
        nameFontSize: 14,
        nameColor: '#111827',
        nameWeight: '600',
        priceFontSize: 18,
        priceColor: '#F97316',
        priceWeight: '700',
        comparePriceColor: '#9CA3AF',
        productPadding: 12,
        productBorderColor: '#E5E7EB',
        productBorderRadius: 8,
        showSeparator: false,
        stackOnMobile: true,
        padding: { top: 8, right: 16, bottom: 16, left: 16 },
        backgroundColor: '',
      }),
      block('button', {
        text: 'Ver Todas as Ofertas',
        href: '{{store_url}}',
        bgColor: '#F97316',
        textColor: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        borderRadius: 8,
        paddingH: 32,
        paddingV: 14,
        align: 'center',
        fullWidth: false,
        padding: { top: 8, right: 24, bottom: 32, left: 24 },
        backgroundColor: '',
      }),
    ]),
    section([footerStandard()]),
  ],
}

// ═══════════════════════════════════════════════════════════════
// 4. CONFIRMAÇÃO DE PEDIDO
// ═══════════════════════════════════════════════════════════════
const orderConfirmationDoc: EmailDocument = {
  version: 2,
  settings: BASE_SETTINGS,
  sections: [
    section([headerLogo()]),
    section([
      block('text', {
        contentHtml: '<div style="text-align:center;"><div style="display:inline-block;width:56px;height:56px;background-color:#D1FAE5;border-radius:50%;line-height:56px;font-size:28px;margin-bottom:12px;">✅</div><h1 style="margin:0;font-size:26px;font-weight:700;color:#111827;">Pedido Confirmado!</h1></div>',
        fontSize: 26,
        color: '#111827',
        lineHeight: 1.2,
        align: 'center',
        padding: { top: 16, right: 24, bottom: 8, left: 24 },
        backgroundColor: '',
      }),
      block('text', {
        contentHtml: '<p style="margin:0;text-align:center;font-size:15px;color:#6B7280;line-height:1.5;">Olá {{first_name}}, recebemos seu pedido <strong>{{order_number}}</strong>.</p>',
        fontSize: 15,
        color: '#6B7280',
        lineHeight: 1.5,
        align: 'center',
        padding: { top: 8, right: 32, bottom: 20, left: 32 },
        backgroundColor: '',
      }),
      block('table', {
        rows: 3,
        cols: 2,
        headerRow: false,
        data: [
          ['Número do Pedido', '{{order_number}}'],
          ['Data', '{{order_date}}'],
          ['Total', '{{order_total}}'],
        ],
        headerBgColor: '#F9FAFB',
        headerTextColor: '#111827',
        headerFontWeight: '600',
        cellTextColor: '#374151',
        cellFontSize: 14,
        borderColor: '#E5E7EB',
        borderWidth: 1,
        stripedRows: true,
        stripedColor: '#F9FAFB',
        padding: { top: 8, right: 24, bottom: 16, left: 24 },
        backgroundColor: '',
      }),
      block('button', {
        text: 'Rastrear Pedido',
        href: '{{tracking_url}}',
        bgColor: '#F97316',
        textColor: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        borderRadius: 8,
        paddingH: 32,
        paddingV: 14,
        align: 'center',
        fullWidth: false,
        padding: { top: 16, right: 24, bottom: 32, left: 24 },
        backgroundColor: '',
      }),
    ]),
    section([footerStandard()]),
  ],
}

// ═══════════════════════════════════════════════════════════════
// 5. NEWSLETTER
// ═══════════════════════════════════════════════════════════════
const newsletterDoc: EmailDocument = {
  version: 2,
  settings: BASE_SETTINGS,
  sections: [
    section([headerLogo()]),
    section([
      block('text', {
        contentHtml: '<h1 style="margin:0 0 12px;font-size:26px;font-weight:700;color:#111827;">Novidades da Semana 📰</h1><p style="margin:0;font-size:15px;color:#4B5563;line-height:1.7;">Olá {{first_name}}! Confira o que preparamos para você esta semana. Temos novidades incríveis na loja e dicas exclusivas.</p>',
        fontSize: 15,
        color: '#4B5563',
        lineHeight: 1.7,
        align: 'left',
        padding: { top: 16, right: 24, bottom: 16, left: 24 },
        backgroundColor: '',
      }),
      block('image', {
        src: 'https://placehold.co/600x280/F3F4F6/9CA3AF?text=Imagem+Destaque',
        alt: 'Destaque da semana',
        href: '',
        width: 600,
        align: 'center',
        borderRadius: 8,
        padding: { top: 0, right: 24, bottom: 16, left: 24 },
        backgroundColor: '',
      }),
      block('text', {
        contentHtml: '<h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">Destaque da Semana</h2><p style="margin:0;font-size:15px;color:#4B5563;line-height:1.7;">Conteúdo editorial, novidades e dicas exclusivas para você aproveitar ao máximo sua jornada com a nossa marca.</p>',
        fontSize: 15,
        color: '#4B5563',
        lineHeight: 1.7,
        align: 'left',
        padding: { top: 0, right: 24, bottom: 16, left: 24 },
        backgroundColor: '',
      }),
      block('button', {
        text: 'Ler Mais',
        href: '{{store_url}}',
        bgColor: '#F97316',
        textColor: '#FFFFFF',
        fontSize: 15,
        fontWeight: 'bold',
        borderRadius: 8,
        paddingH: 28,
        paddingV: 12,
        align: 'center',
        fullWidth: false,
        padding: { top: 8, right: 24, bottom: 24, left: 24 },
        backgroundColor: '',
      }),
      block('social', {
        networks: [
          { type: 'instagram', url: '#', enabled: true },
          { type: 'facebook', url: '#', enabled: true },
          { type: 'tiktok', url: '#', enabled: true },
          { type: 'youtube', url: '#', enabled: false },
        ],
        iconSize: 32,
        spacing: 12,
        align: 'center',
        padding: { top: 16, right: 24, bottom: 16, left: 24 },
      }),
    ]),
    section([footerStandard()]),
  ],
}

// ═══════════════════════════════════════════════════════════════
// 6. ENVIO / RASTREIO
// ═══════════════════════════════════════════════════════════════
const shippingDoc: EmailDocument = {
  version: 2,
  settings: BASE_SETTINGS,
  sections: [
    section([headerLogo()]),
    section([
      block('text', {
        contentHtml: '<div style="text-align:center;font-size:40px;margin-bottom:12px;">🚚</div><h1 style="margin:0;text-align:center;font-size:26px;font-weight:700;color:#111827;">Seu pedido está a caminho!</h1>',
        fontSize: 26,
        color: '#111827',
        lineHeight: 1.2,
        align: 'center',
        padding: { top: 16, right: 24, bottom: 8, left: 24 },
        backgroundColor: '',
      }),
      block('text', {
        contentHtml: '<p style="margin:0;text-align:center;font-size:15px;color:#6B7280;">Olá {{first_name}}, o pedido <strong>{{order_number}}</strong> foi enviado.</p>',
        fontSize: 15,
        color: '#6B7280',
        lineHeight: 1.5,
        align: 'center',
        padding: { top: 8, right: 32, bottom: 20, left: 32 },
        backgroundColor: '',
      }),
      block('text', {
        contentHtml: '<p style="margin:0;font-size:13px;color:#6B7280;">Código de rastreio</p><p style="margin:4px 0 0;font-size:18px;font-weight:600;color:#111827;">{{tracking_number}}</p>',
        fontSize: 15,
        color: '#111827',
        lineHeight: 1.5,
        align: 'center',
        padding: { top: 16, right: 24, bottom: 16, left: 24 },
        backgroundColor: '#F9FAFB',
      }),
      block('button', {
        text: 'Rastrear Pedido',
        href: '{{tracking_url}}',
        bgColor: '#F97316',
        textColor: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        borderRadius: 8,
        paddingH: 32,
        paddingV: 14,
        align: 'center',
        fullWidth: false,
        padding: { top: 24, right: 24, bottom: 32, left: 24 },
        backgroundColor: '',
      }),
    ]),
    section([footerStandard()]),
  ],
}

// ═══════════════════════════════════════════════════════════════
// 7. PEDIR AVALIAÇÃO
// ═══════════════════════════════════════════════════════════════
const reviewRequestDoc: EmailDocument = {
  version: 2,
  settings: BASE_SETTINGS,
  sections: [
    section([headerLogo()]),
    section([
      block('text', {
        contentHtml: '<h1 style="margin:0;text-align:center;font-size:26px;font-weight:700;color:#111827;">Como foi sua experiência?</h1>',
        fontSize: 26,
        color: '#111827',
        lineHeight: 1.2,
        align: 'center',
        padding: { top: 16, right: 24, bottom: 8, left: 24 },
        backgroundColor: '',
      }),
      block('text', {
        contentHtml: '<p style="margin:0;text-align:center;font-size:15px;color:#6B7280;line-height:1.5;">Olá {{first_name}}, gostaríamos de saber sua opinião sobre sua última compra.</p>',
        fontSize: 15,
        color: '#6B7280',
        lineHeight: 1.5,
        align: 'center',
        padding: { top: 8, right: 32, bottom: 8, left: 32 },
        backgroundColor: '',
      }),
      block('text', {
        contentHtml: '<p style="margin:0;text-align:center;font-size:36px;letter-spacing:4px;">⭐⭐⭐⭐⭐</p>',
        fontSize: 36,
        color: '#FBBF24',
        lineHeight: 1.2,
        align: 'center',
        padding: { top: 16, right: 24, bottom: 20, left: 24 },
        backgroundColor: '',
      }),
      block('button', {
        text: 'Avaliar Agora',
        href: '{{store_url}}/review',
        bgColor: '#F97316',
        textColor: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        borderRadius: 8,
        paddingH: 32,
        paddingV: 14,
        align: 'center',
        fullWidth: false,
        padding: { top: 8, right: 24, bottom: 32, left: 24 },
        backgroundColor: '',
      }),
    ]),
    section([footerStandard()]),
  ],
}

// ═══════════════════════════════════════════════════════════════
// 8. REENGAJAMENTO (WINBACK)
// ═══════════════════════════════════════════════════════════════
const winbackDoc: EmailDocument = {
  version: 2,
  settings: BASE_SETTINGS,
  sections: [
    section([headerLogo()]),
    section([
      block('text', {
        contentHtml: '<h1 style="margin:0;text-align:center;font-size:26px;font-weight:700;color:#111827;">Sentimos sua falta, {{first_name}}! 💌</h1>',
        fontSize: 26,
        color: '#111827',
        lineHeight: 1.2,
        align: 'center',
        padding: { top: 16, right: 24, bottom: 8, left: 24 },
        backgroundColor: '',
      }),
      block('text', {
        contentHtml: '<p style="margin:0;text-align:center;font-size:15px;color:#6B7280;line-height:1.6;">Faz um tempo que não nos visitamos. Preparamos algo especial para você voltar!</p>',
        fontSize: 15,
        color: '#6B7280',
        lineHeight: 1.6,
        align: 'center',
        padding: { top: 8, right: 32, bottom: 20, left: 32 },
        backgroundColor: '',
      }),
      block('coupon', {
        headerText: 'Cupom exclusivo:',
        code: 'VOLTEI15',
        footerText: '15% OFF · Válido por 48h',
        codeFontSize: 28,
        codeColor: '#EA580C',
        borderStyle: 'dashed',
        borderColor: '#EA580C',
        borderRadius: 12,
        padding: { top: 20, right: 24, bottom: 20, left: 24 },
        backgroundColor: '#FFF7ED',
      }),
      block('button', {
        text: 'Voltar à Loja',
        href: '{{store_url}}',
        bgColor: '#F97316',
        textColor: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        borderRadius: 8,
        paddingH: 32,
        paddingV: 14,
        align: 'center',
        fullWidth: false,
        padding: { top: 16, right: 24, bottom: 32, left: 24 },
        backgroundColor: '',
      }),
    ]),
    section([footerStandard()]),
  ],
}

// ═══════════════════════════════════════════════════════════════
// 9. NOVIDADES (NEW ARRIVALS)
// ═══════════════════════════════════════════════════════════════
const newArrivalsDoc: EmailDocument = {
  version: 2,
  settings: BASE_SETTINGS,
  sections: [
    section([headerLogo()]),
    section([
      block('text', {
        contentHtml: '<h1 style="margin:0;text-align:center;font-size:26px;font-weight:700;color:#111827;">✨ Acabou de Chegar!</h1>',
        fontSize: 26,
        color: '#111827',
        lineHeight: 1.2,
        align: 'center',
        padding: { top: 16, right: 24, bottom: 8, left: 24 },
        backgroundColor: '',
      }),
      block('text', {
        contentHtml: '<p style="margin:0;text-align:center;font-size:15px;color:#6B7280;">Confira os produtos mais novos da nossa loja.</p>',
        fontSize: 15,
        color: '#6B7280',
        lineHeight: 1.5,
        align: 'center',
        padding: { top: 8, right: 32, bottom: 20, left: 32 },
        backgroundColor: '',
      }),
      block('product-grid', {
        mode: 'dynamic',
        feedType: 'new',
        feedId: '',
        feedName: 'Novidades',
        title: '',
        columns: 2,
        rows: 2,
        maxImageHeight: 260,
        layout: 'grid',
        imageRatio: 'square',
        showName: true,
        showPrice: true,
        showComparePrice: false,
        showButton: false,
        buttonText: 'Comprar',
        buttonColor: '#F97316',
        buttonTextColor: '#FFFFFF',
        buttonRadius: 6,
        nameFontSize: 14,
        nameColor: '#111827',
        nameWeight: '600',
        priceFontSize: 16,
        priceColor: '#F97316',
        priceWeight: '700',
        comparePriceColor: '#9CA3AF',
        productPadding: 12,
        productBorderColor: '#E5E7EB',
        productBorderRadius: 8,
        showSeparator: false,
        stackOnMobile: true,
        padding: { top: 8, right: 16, bottom: 16, left: 16 },
        backgroundColor: '',
      }),
      block('button', {
        text: 'Ver Tudo',
        href: '{{store_url}}',
        bgColor: '#F97316',
        textColor: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
        borderRadius: 8,
        paddingH: 32,
        paddingV: 14,
        align: 'center',
        fullWidth: false,
        padding: { top: 8, right: 24, bottom: 32, left: 24 },
        backgroundColor: '',
      }),
    ]),
    section([footerStandard()]),
  ],
}

// ═══════════════════════════════════════════════════════════════
// 10. BLACK FRIDAY
// ═══════════════════════════════════════════════════════════════
const blackFridayDoc: EmailDocument = {
  version: 2,
  settings: BASE_SETTINGS,
  sections: [
    section([
      block('text', {
        contentHtml: '<h1 style="margin:0 0 10px;text-align:center;font-size:36px;font-weight:700;color:#FFFFFF;letter-spacing:2px;">BLACK FRIDAY</h1><p style="margin:0;text-align:center;font-size:20px;color:#F97316;font-weight:700;">ATÉ 70% OFF</p>',
        fontSize: 36,
        color: '#FFFFFF',
        lineHeight: 1.2,
        align: 'center',
        padding: { top: 40, right: 24, bottom: 40, left: 24 },
        backgroundColor: '',
      }),
    ], { backgroundColor: '#111827' }),
    section([
      block('countdown', {
        endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
        style: 'dark',
        title: 'OFERTA TERMINA EM',
        titleColor: '#111827',
        labels: { days: 'DIAS', hours: 'HORAS', minutes: 'MIN', seconds: 'SEG' },
        expiredText: 'Oferta encerrada',
        fontSize: 36,
        labelFontSize: 11,
        numberColor: '#FFFFFF',
        labelColor: '#9CA3AF',
        boxColor: '#111827',
        separatorColor: '#374151',
        boxBorderRadius: 12,
        boxBorder: '',
        padding: { top: 24, right: 24, bottom: 16, left: 24 },
        backgroundColor: '',
      }),
      block('text', {
        contentHtml: '<p style="margin:0;text-align:center;font-size:16px;color:#4B5563;line-height:1.6;">{{first_name}}, as melhores ofertas do ano estão aqui! Corra antes que acabe.</p>',
        fontSize: 16,
        color: '#4B5563',
        lineHeight: 1.6,
        align: 'center',
        padding: { top: 8, right: 32, bottom: 16, left: 32 },
        backgroundColor: '',
      }),
      block('product-grid', {
        mode: 'dynamic',
        feedType: 'sale',
        feedId: '',
        feedName: 'Promoções',
        title: '',
        columns: 2,
        rows: 2,
        maxImageHeight: 260,
        layout: 'grid',
        imageRatio: 'square',
        showName: true,
        showPrice: true,
        showComparePrice: true,
        showButton: false,
        buttonText: 'Comprar',
        buttonColor: '#F97316',
        buttonTextColor: '#FFFFFF',
        buttonRadius: 6,
        nameFontSize: 14,
        nameColor: '#111827',
        nameWeight: '600',
        priceFontSize: 20,
        priceColor: '#F97316',
        priceWeight: '700',
        comparePriceColor: '#9CA3AF',
        productPadding: 12,
        productBorderColor: '#E5E7EB',
        productBorderRadius: 8,
        showSeparator: false,
        stackOnMobile: true,
        padding: { top: 8, right: 16, bottom: 16, left: 16 },
        backgroundColor: '',
      }),
      block('button', {
        text: 'COMPRAR AGORA',
        href: '{{store_url}}',
        bgColor: '#F97316',
        textColor: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
        borderRadius: 8,
        paddingH: 40,
        paddingV: 14,
        align: 'center',
        fullWidth: false,
        padding: { top: 8, right: 24, bottom: 32, left: 24 },
        backgroundColor: '',
      }),
    ]),
    section([footerStandard()]),
  ],
}

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════
export const DEFAULT_TEMPLATES: PrebuiltTemplate[] = [
  {
    id: 'welcome',
    name: 'Boas-vindas',
    category: 'marketing',
    description: 'Email de boas-vindas com cupom de primeira compra',
    icon: '👋',
    design: welcomeDoc,
    html: '',
  },
  {
    id: 'abandoned-cart',
    name: 'Carrinho Abandonado',
    category: 'transactional',
    description: 'Recuperação de carrinho com produtos e botão de finalizar',
    icon: 'ShoppingCart',
    design: abandonedCartDoc,
    html: '',
  },
  {
    id: 'promotion',
    name: 'Promoção / Flash Sale',
    category: 'marketing',
    description: 'Email promocional com destaque de oferta e produtos',
    icon: '🔥',
    design: promotionDoc,
    html: '',
  },
  {
    id: 'order-confirmation',
    name: 'Confirmação de Pedido',
    category: 'transactional',
    description: 'Email transacional de confirmação de pedido',
    icon: '✅',
    design: orderConfirmationDoc,
    html: '',
  },
  {
    id: 'newsletter',
    name: 'Newsletter',
    category: 'marketing',
    description: 'Newsletter com conteúdo editorial e produtos',
    icon: '📰',
    design: newsletterDoc,
    html: '',
  },
  {
    id: 'shipping',
    name: 'Envio / Rastreio',
    category: 'transactional',
    description: 'Notificação de envio com link de rastreio',
    icon: '🚚',
    design: shippingDoc,
    html: '',
  },
  {
    id: 'review-request',
    name: 'Pedir Avaliação',
    category: 'transactional',
    description: 'Solicitar avaliação após a compra',
    icon: 'Star',
    design: reviewRequestDoc,
    html: '',
  },
  {
    id: 'winback',
    name: 'Reengajamento',
    category: 'marketing',
    description: 'Reconquistar clientes inativos',
    icon: '💌',
    design: winbackDoc,
    html: '',
  },
  {
    id: 'new-arrivals',
    name: 'Novidades',
    category: 'marketing',
    description: 'Apresentar produtos recém-chegados',
    icon: '✨',
    design: newArrivalsDoc,
    html: '',
  },
  {
    id: 'black-friday',
    name: 'Black Friday',
    category: 'marketing',
    description: 'Campanha Black Friday com countdown',
    icon: '🖤',
    design: blackFridayDoc,
    html: '',
  },
]
