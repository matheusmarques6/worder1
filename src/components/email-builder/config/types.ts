export type BlockType =
  | 'text' | 'image' | 'button' | 'divider' | 'spacer'
  | 'columns' | 'html' | 'social'
  | 'header' | 'footer'
  | 'product-grid' | 'coupon'

export interface EmailBlock {
  id: string
  type: BlockType
  props: Record<string, any>
}

export interface EmailDocument {
  settings: {
    backgroundColor: string
    contentWidth: number
    fontFamily: string
  }
  blocks: EmailBlock[]
}

export interface BlockDef {
  type: BlockType
  label: string
  icon: string
  category: string
  defaultProps: Record<string, any>
}

export const BLOCK_DEFS: BlockDef[] = [
  { type: 'text', label: 'Texto', icon: 'T', category: 'Conteúdo', defaultProps: { content: '<p>Escreva seu texto aqui.</p>', color: '#374151', fontSize: 15, align: 'left', padding: 20 } },
  { type: 'image', label: 'Imagem', icon: '🖼', category: 'Conteúdo', defaultProps: { src: 'https://placehold.co/560x280/F3F4F6/9CA3AF?text=Sua+Imagem', alt: '', width: 560, href: '', padding: 16 } },
  { type: 'button', label: 'Botão', icon: '🔘', category: 'Conteúdo', defaultProps: { text: 'Clique Aqui', href: '#', bgColor: '#F97316', textColor: '#FFFFFF', borderRadius: 8, fontSize: 15, padding: 20, fullWidth: false } },
  { type: 'divider', label: 'Divisor', icon: '—', category: 'Conteúdo', defaultProps: { color: '#E5E7EB', thickness: 1, padding: 16 } },
  { type: 'spacer', label: 'Espaço', icon: '↕', category: 'Conteúdo', defaultProps: { height: 32 } },
  { type: 'columns', label: 'Colunas', icon: '▦', category: 'Layout', defaultProps: { columns: 2, gap: 16, padding: 16, leftContent: '<p>Coluna esquerda</p>', rightContent: '<p>Coluna direita</p>' } },
  { type: 'html', label: 'HTML', icon: '</>', category: 'Conteúdo', defaultProps: { code: '<div style="padding:16px;background:#f3f4f6;border-radius:8px;text-align:center;"><p>HTML customizado</p></div>', padding: 16 } },
  { type: 'social', label: 'Redes Sociais', icon: '📱', category: 'Conteúdo', defaultProps: { instagram: '#', facebook: '#', tiktok: '', youtube: '', iconSize: 28, padding: 20 } },
  { type: 'header', label: 'Cabeçalho', icon: '🔝', category: 'Estrutura', defaultProps: { logoSrc: 'https://placehold.co/160x45/FFFFFF/F97316?text=LOGO', logoWidth: 160, bgColor: '#FFFFFF', padding: 24 } },
  { type: 'footer', label: 'Rodapé', icon: '📄', category: 'Estrutura', defaultProps: { text: '{{store_name}}', showUnsubscribe: true, bgColor: '#F9FAFB', padding: 24 } },
  { type: 'product-grid', label: 'Produtos', icon: '🛍️', category: 'E-commerce', defaultProps: { title: 'Recomendados', columns: 2, maxProducts: 4, showPrice: true, showButton: true, buttonText: 'Comprar', buttonColor: '#F97316', padding: 16 } },
  { type: 'coupon', label: 'Cupom', icon: '🏷️', category: 'E-commerce', defaultProps: { header: 'Seu desconto especial:', code: 'BEMVINDO10', footer: 'Válido por tempo limitado', bgColor: '#FFF7ED', borderColor: '#EA580C', padding: 24 } },
]
