// ═══════════════════════════════════════════
// Worder Email Builder — Type Definitions
// ═══════════════════════════════════════════

export type BlockType =
  | 'text' | 'image' | 'button' | 'divider' | 'spacer'
  | 'columns' | 'html' | 'social' | 'video'
  | 'header' | 'footer'
  | 'product-grid' | 'coupon' | 'abandoned-cart'

export interface Padding {
  top: number
  right: number
  bottom: number
  left: number
}

export interface EmailBlock {
  id: string
  type: BlockType
  props: Record<string, any>
}

export interface EmailDocument {
  settings: {
    backgroundColor: string
    contentBackgroundColor: string
    contentWidth: number
    fontFamily: string
    borderRadius: number
  }
  blocks: EmailBlock[]
}

export interface BlockDef {
  type: BlockType
  label: string
  icon: string
  category: 'Layout' | 'Conteúdo' | 'E-commerce' | 'Estrutura'
  defaultProps: Record<string, any>
}

export const BLOCK_DEFS: BlockDef[] = [
  // ── Layout ──
  {
    type: 'columns', label: 'Colunas', icon: 'Columns', category: 'Layout',
    defaultProps: {
      columns: 2, gap: 16, padding: { top: 8, right: 16, bottom: 8, left: 16 },
      leftContent: '<p style="margin:0;font-size:14px;color:#374151;">Coluna esquerda</p>',
      rightContent: '<p style="margin:0;font-size:14px;color:#374151;">Coluna direita</p>',
    },
  },

  // ── Conteúdo ──
  {
    type: 'text', label: 'Texto', icon: 'Type', category: 'Conteúdo',
    defaultProps: {
      content: '<p style="margin:0;">Escreva seu texto aqui. Use as <strong>merge tags</strong> para personalizar.</p>',
      fontSize: 15, color: '#374151', lineHeight: 1.6, align: 'left',
      padding: { top: 12, right: 24, bottom: 12, left: 24 },
      backgroundColor: '',
    },
  },
  {
    type: 'image', label: 'Imagem', icon: 'Image', category: 'Conteúdo',
    defaultProps: {
      src: 'https://placehold.co/560x280/F3F4F6/9CA3AF?text=Sua+Imagem+Aqui',
      alt: '', href: '', width: 560,
      align: 'center', borderRadius: 0,
      padding: { top: 8, right: 24, bottom: 8, left: 24 },
      backgroundColor: '',
      fullWidthMobile: true,
    },
  },
  {
    type: 'button', label: 'Botão', icon: 'MousePointerClick', category: 'Conteúdo',
    defaultProps: {
      text: 'Clique Aqui', href: '#',
      bgColor: '#F97316', textColor: '#FFFFFF',
      fontSize: 15, fontWeight: 'bold', borderRadius: 8,
      paddingH: 28, paddingV: 13,
      align: 'center', fullWidth: false,
      borderWidth: 0, borderColor: '#E5E7EB',
      padding: { top: 12, right: 24, bottom: 12, left: 24 },
      backgroundColor: '',
    },
  },
  {
    type: 'divider', label: 'Divisor', icon: 'Minus', category: 'Conteúdo',
    defaultProps: {
      color: '#E5E7EB', thickness: 1, style: 'solid',
      padding: { top: 12, right: 24, bottom: 12, left: 24 },
    },
  },
  {
    type: 'spacer', label: 'Espaço', icon: 'MoveVertical', category: 'Conteúdo',
    defaultProps: { height: 32 },
  },
  {
    type: 'social', label: 'Redes Sociais', icon: 'Share2', category: 'Conteúdo',
    defaultProps: {
      networks: [
        { type: 'instagram', url: '#' },
        { type: 'facebook', url: '#' },
        { type: 'tiktok', url: '' },
        { type: 'youtube', url: '' },
      ],
      iconSize: 32, spacing: 10, align: 'center', iconStyle: 'color',
      padding: { top: 16, right: 24, bottom: 16, left: 24 },
    },
  },
  {
    type: 'video', label: 'Vídeo', icon: 'Play', category: 'Conteúdo',
    defaultProps: {
      videoUrl: '', thumbnailUrl: 'https://placehold.co/560x315/111827/FFFFFF?text=%E2%96%B6+Assistir+V%C3%ADdeo',
      padding: { top: 8, right: 24, bottom: 8, left: 24 },
    },
  },
  {
    type: 'html', label: 'HTML', icon: 'Code', category: 'Conteúdo',
    defaultProps: {
      code: '<div style="padding:16px;background:#f3f4f6;border-radius:8px;text-align:center;"><p style="margin:0;color:#6b7280;">HTML customizado</p></div>',
      padding: { top: 8, right: 24, bottom: 8, left: 24 },
    },
  },

  // ── E-commerce ──
  {
    type: 'product-grid', label: 'Produtos', icon: 'ShoppingBag', category: 'E-commerce',
    defaultProps: {
      mode: 'dynamic', feedType: 'bestsellers',
      title: 'Recomendados Para Você', columns: 2, rows: 2,
      maxImageHeight: 200, showName: true, showPrice: true, showComparePrice: true,
      showButton: true, buttonText: 'Comprar', buttonColor: '#F97316', buttonTextColor: '#FFFFFF',
      buttonRadius: 6, stackOnMobile: true,
      nameFontSize: 14, nameColor: '#111827', nameWeight: '600',
      priceFontSize: 16, priceColor: '#F97316', priceWeight: '700',
      comparePriceColor: '#9CA3AF',
      productPadding: 8, productBorderColor: '#E5E7EB', productBorderRadius: 8,
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
      backgroundColor: '',
    },
  },
  {
    type: 'abandoned-cart', label: 'Carrinho', icon: 'ShoppingCart', category: 'E-commerce',
    defaultProps: {
      title: 'Você esqueceu algo!', subtitle: 'Seus itens estão esperando',
      buttonText: 'Finalizar Compra', buttonColor: '#F97316', buttonTextColor: '#FFFFFF',
      maxItems: 3, showImage: true, showPrice: true, showQuantity: true,
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
      backgroundColor: '#FFFBEB',
    },
  },
  {
    type: 'coupon', label: 'Cupom', icon: 'Tag', category: 'E-commerce',
    defaultProps: {
      headerText: 'Seu desconto especial:', code: '{{coupon_code}}',
      footerText: 'Válido até {{coupon_expiry}}',
      codeFontSize: 32, codeColor: '#EA580C',
      borderStyle: 'dashed', borderColor: '#EA580C', borderRadius: 12,
      padding: { top: 24, right: 24, bottom: 24, left: 24 },
      backgroundColor: '#FFF7ED',
    },
  },

  // ── Estrutura ──
  {
    type: 'header', label: 'Cabeçalho', icon: 'PanelTop', category: 'Estrutura',
    defaultProps: {
      logoSrc: 'https://placehold.co/160x45/FFFFFF/F97316?text=LOGO',
      logoWidth: 160, logoHref: '{{store_url}}',
      showLinks: false, links: [{ text: 'Loja', url: '{{store_url}}' }],
      padding: { top: 20, right: 24, bottom: 20, left: 24 },
      backgroundColor: '#FFFFFF',
    },
  },
  {
    type: 'footer', label: 'Rodapé', icon: 'PanelBottom', category: 'Estrutura',
    defaultProps: {
      companyName: '{{store_name}}', address: '',
      showUnsubscribe: true, showPreferences: false, showViewInBrowser: true,
      textColor: '#9CA3AF', fontSize: 11,
      padding: { top: 24, right: 24, bottom: 24, left: 24 },
      backgroundColor: '#F9FAFB',
    },
  },
]

// Helper
export function getBlockDef(type: BlockType): BlockDef | undefined {
  return BLOCK_DEFS.find(d => d.type === type)
}

export function createBlock(type: BlockType): EmailBlock {
  const def = getBlockDef(type)
  return {
    id: 'b_' + Math.random().toString(36).substring(2, 9),
    type,
    props: JSON.parse(JSON.stringify(def?.defaultProps || {})),
  }
}

export const DEFAULT_DOCUMENT: EmailDocument = {
  settings: {
    backgroundColor: '#f3f4f6',
    contentBackgroundColor: '#ffffff',
    contentWidth: 600,
    fontFamily: "'DM Sans', Arial, Helvetica, sans-serif",
    borderRadius: 0,
  },
  blocks: [],
}
