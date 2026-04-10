// ═══════════════════════════════════════════
// Worder Email Builder v2 — Type Definitions
// Hierarchy: EmailDocument → EmailSection → EmailColumn → EmailBlock
// ═══════════════════════════════════════════

export type BlockType =
  | 'text' | 'image' | 'button' | 'divider' | 'spacer'
  | 'columns' | 'html' | 'social' | 'video'
  | 'product-grid' | 'coupon' | 'abandoned-cart'
  | 'header' | 'footer'
  | 'split' | 'header-bar' | 'drop-shadow' | 'table' | 'review-quote' | 'countdown'

export interface Padding {
  top: number; right: number; bottom: number; left: number
}

export interface Border {
  width: number; color: string; style: 'solid' | 'dashed' | 'dotted' | 'none'; radius: number
}

// ── Block ──
export interface EmailBlock {
  id: string
  type: BlockType
  props: Record<string, any>
}

// ── Column (contains blocks) ──
export interface EmailColumn {
  id: string
  width: number
  blocks: EmailBlock[]
}

// ── Section (contains columns) ──
export interface EmailSection {
  id: string
  columns: EmailColumn[]
  styles: {
    backgroundColor: string
    backgroundImage?: string
    backgroundRepeat?: string
    backgroundSize?: string
    contentBackgroundColor?: string  // Content color (Auto/Custom/None)
    contentColorMode?: 'auto' | 'custom' | 'none'
    sectionColor?: string  // Section color (expandable)
    padding: Padding
    border?: { width: number; color: string; style: string; radius: number }
    columnAlignment?: 'top' | 'middle' | 'bottom'
    stackOnMobile: boolean
    mobileStackOrder?: 'rtl' | 'ltr' | 'none'
  }
  label?: string
}

// ── Document ──
export interface TextStyleConfig {
  fontSize: number; color: string; lineHeight: number
}

export interface ButtonStyleConfig {
  bgColor: string; textColor: string; borderRadius: number; fontWeight: string
}

export interface EmailDocument {
  version: 2
  settings: {
    backgroundColor: string
    contentBackgroundColor: string
    contentWidth: number
    fontFamily: string
    borderRadius: number
    preheaderText?: string
    textStyles?: {
      body?: TextStyleConfig
      h1?: TextStyleConfig
      h2?: TextStyleConfig
      h3?: TextStyleConfig
      h4?: TextStyleConfig
      link?: { color?: string; underline?: boolean }
    }
    buttonStyles?: {
      primary?: ButtonStyleConfig
      secondary?: ButtonStyleConfig
    }
  }
  sections: EmailSection[]
}

// ── Section Layout Presets ──
export interface SectionLayout {
  label: string
  icon: string
  columns: number[]
}

export const SECTION_LAYOUTS: SectionLayout[] = [
  { label: '1 Coluna', icon: 'Square', columns: [100] },
  { label: '2 Colunas', icon: 'Columns', columns: [50, 50] },
  { label: '2 Col (L)', icon: 'PanelLeft', columns: [66, 34] },
  { label: '2 Col (R)', icon: 'PanelRight', columns: [34, 66] },
  { label: '3 Colunas', icon: 'Columns', columns: [33, 34, 33] },
]

// ── Block Definitions ──
export interface BlockDef {
  type: BlockType
  label: string
  icon: string
  category: 'Conteúdo' | 'E-commerce' | 'Estrutura'
  defaultProps: Record<string, any>
}

// ═══════════════════════════════════════════
// Best practices email design spacing:
// - Content width: 600px
// - Text: 24-32px lateral padding for readability (max 65-75 chars/line)
// - Images: 600px full width, 0 padding for hero, 24px lateral for inline
// - Buttons: min 44px height (touch target), 16-20px vertical breathing room
// - Divider: 20-24px vertical for visual separation
// - Spacer: 24-40px default (breathing room between sections)
// - Social: 24px vertical for footer-like spacing
// - Products: 20px padding, 12px gap between cards
// - Header: 16-20px vertical, centered
// - Footer: 24-32px padding, smaller text (11-12px)
// ═══════════════════════════════════════════

export const BLOCK_DEFS: BlockDef[] = [
  // ── Texto: 24px lateral para legibilidade, 10px vertical ──
  { type: 'text', label: 'Texto', icon: 'Type', category: 'Conteúdo',
    defaultProps: {
      contentHtml: '<p>Escreva seu texto aqui.</p>',
      fontSize: 16, color: '#374151', lineHeight: 1.6, align: 'left',
      padding: { top: 10, right: 24, bottom: 10, left: 24 },
      backgroundColor: '',
    } },

  // ── Imagem: 600px full width, 0 padding (hero style) ──
  { type: 'image', label: 'Imagem', icon: 'Image', category: 'Conteúdo',
    defaultProps: {
      src: 'https://placehold.co/600x300/F3F4F6/9CA3AF?text=Sua+Imagem+Aqui',
      alt: '', href: '', width: 600, align: 'center', borderRadius: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      backgroundColor: '',
    } },

  // ── Botão: 44px+ touch target, 16px vertical, 24px lateral, 48px interno ──
  { type: 'button', label: 'Botão', icon: 'MousePointerClick', category: 'Conteúdo',
    defaultProps: {
      text: 'Clique Aqui', href: '#',
      bgColor: '#F97316', textColor: '#FFFFFF',
      fontSize: 16, fontWeight: 'bold', borderRadius: 8,
      paddingH: 32, paddingV: 14,
      align: 'center', fullWidth: false,
      padding: { top: 16, right: 24, bottom: 16, left: 24 },
      backgroundColor: '',
    } },

  // ── Divisor: 20px vertical para separação visual clara ──
  { type: 'divider', label: 'Divisor', icon: 'Minus', category: 'Conteúdo',
    defaultProps: {
      color: '#E5E7EB', thickness: 1, style: 'solid',
      padding: { top: 20, right: 24, bottom: 20, left: 24 },
    } },

  // ── Espaço: 32px default (entre seções de conteúdo) ──
  { type: 'spacer', label: 'Espaço', icon: 'MoveVertical', category: 'Conteúdo',
    defaultProps: { height: 32 } },

  // ── Redes Sociais: 24px vertical, centralizado ──
  { type: 'social', label: 'Redes Sociais', icon: 'Share2', category: 'Conteúdo',
    defaultProps: {
      networks: [
        { type: 'instagram', url: '#', enabled: true },
        { type: 'facebook', url: '#', enabled: true },
        { type: 'tiktok', url: '', enabled: false },
        { type: 'youtube', url: '', enabled: false },
      ],
      iconSize: 32, spacing: 12, align: 'center',
      padding: { top: 24, right: 24, bottom: 24, left: 24 },
    } },

  // ── Vídeo: 600px placeholder, 0 padding (hero style) ──
  { type: 'video', label: 'Vídeo', icon: 'Play', category: 'Conteúdo',
    defaultProps: {
      videoUrl: '',
      thumbnailUrl: 'https://placehold.co/600x338/111827/FFFFFF?text=Video',
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    } },

  // ── HTML: 16px padding padrão ──
  { type: 'html', label: 'HTML', icon: 'Code', category: 'Conteúdo',
    defaultProps: {
      code: '<div style="padding:16px;text-align:center;"><p>HTML customizado</p></div>',
      padding: { top: 8, right: 24, bottom: 8, left: 24 },
    } },

  // ── Produtos: 20px padding, 12px gap, cards com border ──
  { type: 'product-grid', label: 'Produtos', icon: 'ShoppingBag', category: 'E-commerce',
    defaultProps: {
      mode: 'dynamic', feedType: '', feedId: '', feedName: '',
      title: 'Recomendados Para Voce',
      columns: 2, rows: 2, maxImageHeight: 300,
      layout: 'grid' as 'grid' | 'list',
      imageRatio: 'square' as 'square' | 'portrait' | 'landscape',
      showName: true, showPrice: true, showComparePrice: true,
      showButton: true, buttonText: 'Comprar',
      buttonColor: '#F97316', buttonTextColor: '#FFFFFF', buttonRadius: 6,
      nameFontSize: 14, nameColor: '#111827', nameWeight: '600',
      priceFontSize: 16, priceColor: '#F97316', priceWeight: '700',
      comparePriceColor: '#9CA3AF',
      productPadding: 12, productBorderColor: '#E5E7EB', productBorderRadius: 8,
      showSeparator: false, separatorColor: '#E5E7EB',
      stackOnMobile: true,
      padding: { top: 20, right: 20, bottom: 20, left: 20 },
      backgroundColor: '',
    } },

  // ── Carrinho Abandonado (Omnisend-style) ──
  { type: 'abandoned-cart', label: 'Carrinho', icon: 'ShoppingCart', category: 'E-commerce',
    defaultProps: {
      // Layout
      layoutType: 'image-left' as 'image-left' | 'image-right' | 'vertical',
      maxItems: 2,
      // Element visibility
      showImage: true,
      showName: true,
      showDescription: true,
      showPrice: true,
      showOldPrice: true,
      showButton: true,
      // Name styling
      nameFontSize: 14, nameColor: '#111827', nameWeight: '600',
      nameFontFamily: 'inherit',
      // Description styling
      descFontSize: 13, descColor: '#6B7280', descWeight: '400',
      // Price styling
      priceFontSize: 14, priceColor: '#111827', priceWeight: '600',
      oldPriceColor: '#9CA3AF',
      // Button styling
      buttonText: 'Shop now',
      buttonColor: '#111827', buttonTextColor: '#FFFFFF',
      buttonRadius: 4, buttonFontSize: 14,
      buttonAlign: 'left' as 'left' | 'center' | 'right' | 'full',
      buttonPaddingV: 10, buttonPaddingH: 24,
      // Image
      imageWidth: 200, imageBorderRadius: 0,
      // Display
      showOutOfStock: false,
      stackOnMobile: true,
      separator: true, separatorColor: '#E5E7EB',
      // Block
      padding: { top: 24, right: 24, bottom: 24, left: 24 },
      backgroundColor: '',
      visibility: 'all',
    } },

  // ── Cupom: 32px padding, fundo laranja suave, código grande ──
  { type: 'coupon', label: 'Cupom', icon: 'Tag', category: 'E-commerce',
    defaultProps: {
      headerText: 'Seu desconto especial:',
      code: '{{coupon_code}}',
      footerText: 'Válido até {{coupon_expiry}}',
      codeFontSize: 32, codeColor: '#EA580C',
      borderStyle: 'dashed', borderColor: '#EA580C', borderRadius: 12,
      padding: { top: 32, right: 24, bottom: 32, left: 24 },
      backgroundColor: '#FFF7ED',
    } },

  // ── Cabeçalho: 16px vertical, 24px lateral, logo centralizado ──
  { type: 'header', label: 'Cabeçalho', icon: 'PanelTop', category: 'Estrutura',
    defaultProps: {
      logoSrc: 'https://placehold.co/160x45/FFFFFF/F97316?text=LOGO',
      logoWidth: 160, logoHref: '{{store_url}}',
      showLinks: false,
      links: [{ text: 'Loja', url: '{{store_url}}' }],
      padding: { top: 16, right: 24, bottom: 16, left: 24 },
      backgroundColor: '#FFFFFF',
    } },

  // ── Rodapé: 32px vertical, 24px lateral, texto pequeno, fundo cinza ──
  { type: 'footer', label: 'Rodapé', icon: 'PanelBottom', category: 'Estrutura',
    defaultProps: {
      companyName: '{{store_name}}', address: '',
      showUnsubscribe: true, showPreferences: false, showViewInBrowser: true,
      textColor: '#9CA3AF', fontSize: 11,
      padding: { top: 32, right: 24, bottom: 32, left: 24 },
      backgroundColor: '#F9FAFB',
    } },

  // ══════════════════════════════════════════
  // NOVOS BLOCOS (Klaviyo/Omnisend parity)
  // ══════════════════════════════════════════

  // ── Split: 2 colunas imagem + texto pré-configuradas ──
  { type: 'split', label: 'Dividido', icon: 'Columns', category: 'Conteúdo',
    defaultProps: {
      layout: 'image-left', // 'image-left' | 'image-right'
      imageSrc: 'https://placehold.co/300x300/F3F4F6/9CA3AF?text=Imagem',
      imageAlt: '', imageHref: '', imageWidth: 300,
      textHtml: '<h3 style="margin:0 0 8px;font-size:20px;font-weight:bold;color:#111827;">Título</h3><p style="margin:0;font-size:15px;color:#6B7280;line-height:1.5;">Descrição do conteúdo aqui.</p>',
      buttonText: 'Saiba Mais', buttonHref: '#', buttonColor: '#F97316', buttonTextColor: '#FFFFFF',
      showButton: true, splitRatio: '50-50', // '50-50' | '40-60' | '60-40'
      padding: { top: 20, right: 24, bottom: 20, left: 24 },
      backgroundColor: '',
    } },

  // ── Header Bar: barra de links horizontal ──
  { type: 'header-bar', label: 'Barra de Links', icon: 'Menu', category: 'Estrutura',
    defaultProps: {
      links: [
        { text: 'Loja', url: '{{store_url}}' },
        { text: 'Novidades', url: '#' },
        { text: 'Promoções', url: '#' },
        { text: 'Contato', url: '#' },
      ],
      align: 'center', fontSize: 13, textColor: '#374151',
      separator: '|', separatorColor: '#D1D5DB',
      padding: { top: 12, right: 24, bottom: 12, left: 24 },
      backgroundColor: '#FFFFFF',
    } },

  // ── Drop Shadow: bloco decorativo de sombra ──
  { type: 'drop-shadow', label: 'Sombra', icon: 'Layers', category: 'Conteúdo',
    defaultProps: {
      shadowType: 'light', // 'light' | 'dark' | 'darker'
      height: 8,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      backgroundColor: '',
    } },

  // ── Table: tabela editável com linhas e colunas ──
  { type: 'table', label: 'Tabela', icon: 'Table', category: 'Conteúdo',
    defaultProps: {
      rows: 3, cols: 2,
      headerRow: true,
      data: [
        ['Coluna 1', 'Coluna 2'],
        ['Dado 1', 'Dado 2'],
        ['Dado 3', 'Dado 4'],
      ],
      headerBgColor: '#F9FAFB', headerTextColor: '#111827', headerFontWeight: '600',
      cellTextColor: '#374151', cellFontSize: 14,
      borderColor: '#E5E7EB', borderWidth: 1,
      stripedRows: false, stripedColor: '#F9FAFB',
      padding: { top: 16, right: 24, bottom: 16, left: 24 },
      backgroundColor: '',
    } },

  // ── Review Quote: avaliação/depoimento de cliente ──
  { type: 'review-quote', label: 'Avaliação', icon: 'Quote', category: 'Conteúdo',
    defaultProps: {
      quote: 'Produto incrível! Superou minhas expectativas. Recomendo para todos.',
      author: 'Maria Silva',
      rating: 5, // 1-5 estrelas
      showStars: true, starColor: '#FBBF24',
      quoteFontSize: 16, quoteColor: '#374151', quoteStyle: 'italic',
      authorFontSize: 14, authorColor: '#6B7280',
      padding: { top: 24, right: 32, bottom: 24, left: 32 },
      backgroundColor: '#F9FAFB',
    } },

  // ── Countdown Timer: cronômetro regressivo ──
  { type: 'countdown', label: 'Cronômetro', icon: 'Clock', category: 'E-commerce',
    defaultProps: {
      endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      style: 'dark', // 'dark' | 'light' | 'brand' | 'minimal' | 'urgent'
      title: '',
      titleColor: '',
      labels: { days: 'DIAS', hours: 'HORAS', minutes: 'MIN', seconds: 'SEG' },
      expiredText: 'Oferta encerrada',
      fontSize: 36, labelFontSize: 11,
      numberColor: '', labelColor: '', boxColor: '', separatorColor: '',
      boxBorderRadius: 12, boxBorder: '',
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      backgroundColor: '',
    } },
]

// ── Helpers ──
let _counter = 0
function uid(prefix: string) { return `${prefix}_${Date.now().toString(36)}_${(++_counter).toString(36)}` }

export function getBlockDef(type: BlockType): BlockDef | undefined {
  return BLOCK_DEFS.find(d => d.type === type)
}

export function createBlock(type: BlockType): EmailBlock {
  const def = getBlockDef(type)
  return { id: uid('b'), type, props: JSON.parse(JSON.stringify(def?.defaultProps || {})) }
}

export function createSection(columnWidths: number[] = [100]): EmailSection {
  return {
    id: uid('s'),
    columns: columnWidths.map(w => ({ id: uid('c'), width: w, blocks: [] })),
    styles: { backgroundColor: '', padding: { top: 0, right: 0, bottom: 0, left: 0 }, stackOnMobile: true },
  }
}

// Migrate v1 flat blocks to v2 sections
export function migrateV1toV2(doc: any): EmailDocument {
  if (doc?.version === 2 && Array.isArray(doc.sections)) return doc as EmailDocument
  const blocks: EmailBlock[] = doc?.blocks || []
  const sections: EmailSection[] = blocks.map(block => {
    if (block.type === 'text' && typeof block.props?.content === 'string') {
      block.props.contentHtml = block.props.content
    }
    const section = createSection([100])
    section.columns[0].blocks = [block]
    return section
  })
  return {
    version: 2,
    settings: {
      backgroundColor: doc?.settings?.backgroundColor || '#f3f4f6',
      contentBackgroundColor: doc?.settings?.contentBackgroundColor || '#ffffff',
      contentWidth: doc?.settings?.contentWidth || 600,
      fontFamily: doc?.settings?.fontFamily || "'DM Sans', Arial, sans-serif",
      borderRadius: doc?.settings?.borderRadius || 0,
      preheaderText: '',
    },
    sections,
  }
}

export const DEFAULT_DOCUMENT: EmailDocument = {
  version: 2,
  settings: {
    backgroundColor: '#f3f4f6',
    contentBackgroundColor: '#ffffff',
    contentWidth: 600,
    fontFamily: "'DM Sans', Arial, Helvetica, sans-serif",
    borderRadius: 0,
    preheaderText: '',
    textStyles: {
      body: { fontSize: 16, color: '#374151', lineHeight: 1.6 },
      h1: { fontSize: 32, color: '#111827', lineHeight: 1.2 },
      h2: { fontSize: 24, color: '#111827', lineHeight: 1.3 },
      h3: { fontSize: 20, color: '#111827', lineHeight: 1.3 },
      h4: { fontSize: 18, color: '#111827', lineHeight: 1.4 },
      link: { color: '#F97316', underline: true },
    },
    buttonStyles: {
      primary: { bgColor: '#F97316', textColor: '#FFFFFF', borderRadius: 8, fontWeight: 'bold' },
      secondary: { bgColor: '#FFFFFF', textColor: '#F97316', borderRadius: 8, fontWeight: 'bold' },
    },
  },
  sections: [],
}
