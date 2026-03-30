// ═══════════════════════════════════════════
// Worder Email Builder v2 — Type Definitions
// Hierarchy: EmailDocument → EmailSection → EmailColumn → EmailBlock
// ═══════════════════════════════════════════

export type BlockType =
  | 'text' | 'image' | 'button' | 'divider' | 'spacer'
  | 'columns' | 'html' | 'social' | 'video'
  | 'product-grid' | 'coupon' | 'abandoned-cart'
  | 'header' | 'footer'

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
export interface EmailDocument {
  version: 2
  settings: {
    backgroundColor: string
    contentBackgroundColor: string
    contentWidth: number
    fontFamily: string
    borderRadius: number
    preheaderText?: string
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

export const BLOCK_DEFS: BlockDef[] = [
  { type: 'text', label: 'Texto', icon: 'Type', category: 'Conteúdo',
    defaultProps: { contentHtml: '<p>Escreva seu texto aqui.</p>', fontSize: 15, color: '#374151', lineHeight: 1.6, align: 'left', padding: { top: 12, right: 0, bottom: 12, left: 0 }, backgroundColor: '' } },
  { type: 'image', label: 'Imagem', icon: 'Image', category: 'Conteúdo',
    defaultProps: { src: 'https://placehold.co/560x280/F3F4F6/9CA3AF?text=Sua+Imagem', alt: '', href: '', width: 560, align: 'center', borderRadius: 0, padding: { top: 8, right: 0, bottom: 8, left: 0 }, backgroundColor: '' } },
  { type: 'button', label: 'Botão', icon: 'MousePointerClick', category: 'Conteúdo',
    defaultProps: { text: 'Clique Aqui', href: '#', bgColor: '#F97316', textColor: '#FFFFFF', fontSize: 15, fontWeight: 'bold', borderRadius: 8, paddingH: 28, paddingV: 13, align: 'center', fullWidth: false, padding: { top: 12, right: 0, bottom: 12, left: 0 }, backgroundColor: '' } },
  { type: 'divider', label: 'Divisor', icon: 'Minus', category: 'Conteúdo',
    defaultProps: { color: '#E5E7EB', thickness: 1, style: 'solid', padding: { top: 12, right: 0, bottom: 12, left: 0 } } },
  { type: 'spacer', label: 'Espaço', icon: 'MoveVertical', category: 'Conteúdo',
    defaultProps: { height: 32 } },
  { type: 'social', label: 'Redes Sociais', icon: 'Share2', category: 'Conteúdo',
    defaultProps: { networks: [{ type: 'instagram', url: '#', enabled: true }, { type: 'facebook', url: '#', enabled: true }, { type: 'tiktok', url: '', enabled: false }, { type: 'youtube', url: '', enabled: false }], iconSize: 32, spacing: 10, align: 'center', padding: { top: 16, right: 0, bottom: 16, left: 0 } } },
  { type: 'video', label: 'Vídeo', icon: 'Play', category: 'Conteúdo',
    defaultProps: { videoUrl: '', thumbnailUrl: 'https://placehold.co/560x315/111827/FFFFFF?text=Video', padding: { top: 8, right: 0, bottom: 8, left: 0 } } },
  { type: 'html', label: 'HTML', icon: 'Code', category: 'Conteúdo',
    defaultProps: { code: '<div style="padding:16px;text-align:center;"><p>HTML customizado</p></div>', padding: { top: 8, right: 0, bottom: 8, left: 0 } } },
  { type: 'product-grid', label: 'Produtos', icon: 'ShoppingBag', category: 'E-commerce',
    defaultProps: { mode: 'dynamic', feedType: 'bestsellers', title: 'Recomendados', columns: 2, rows: 2, maxImageHeight: 200, showName: true, showPrice: true, showComparePrice: true, showButton: true, buttonText: 'Comprar', buttonColor: '#F97316', buttonTextColor: '#FFFFFF', buttonRadius: 6, nameFontSize: 14, nameColor: '#111827', nameWeight: '600', priceFontSize: 16, priceColor: '#F97316', priceWeight: '700', comparePriceColor: '#9CA3AF', productPadding: 8, productBorderColor: '#E5E7EB', productBorderRadius: 8, stackOnMobile: true, padding: { top: 16, right: 0, bottom: 16, left: 0 }, backgroundColor: '' } },
  { type: 'abandoned-cart', label: 'Carrinho', icon: 'ShoppingCart', category: 'E-commerce',
    defaultProps: { title: 'Você esqueceu algo!', subtitle: 'Seus itens estão esperando', buttonText: 'Finalizar Compra', buttonColor: '#F97316', buttonTextColor: '#FFFFFF', maxItems: 3, showImage: true, showPrice: true, showQuantity: true, padding: { top: 16, right: 0, bottom: 16, left: 0 }, backgroundColor: '#FFFBEB' } },
  { type: 'coupon', label: 'Cupom', icon: 'Tag', category: 'E-commerce',
    defaultProps: { headerText: 'Seu desconto especial:', code: '{{coupon_code}}', footerText: 'Válido até {{coupon_expiry}}', codeFontSize: 32, codeColor: '#EA580C', borderStyle: 'dashed', borderColor: '#EA580C', borderRadius: 12, padding: { top: 24, right: 0, bottom: 24, left: 0 }, backgroundColor: '#FFF7ED' } },
  { type: 'header', label: 'Cabeçalho', icon: 'PanelTop', category: 'Estrutura',
    defaultProps: { logoSrc: 'https://placehold.co/160x45/FFFFFF/F97316?text=LOGO', logoWidth: 160, logoHref: '{{store_url}}', showLinks: false, links: [{ text: 'Loja', url: '{{store_url}}' }], padding: { top: 20, right: 24, bottom: 20, left: 24 }, backgroundColor: '#FFFFFF' } },
  { type: 'footer', label: 'Rodapé', icon: 'PanelBottom', category: 'Estrutura',
    defaultProps: { companyName: '{{store_name}}', address: '', showUnsubscribe: true, showPreferences: false, showViewInBrowser: true, textColor: '#9CA3AF', fontSize: 11, padding: { top: 24, right: 24, bottom: 24, left: 24 }, backgroundColor: '#F9FAFB' } },
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
    styles: { backgroundColor: '', padding: { top: 16, right: 24, bottom: 16, left: 24 }, stackOnMobile: true },
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
  },
  sections: [],
}
