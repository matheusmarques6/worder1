// =============================================
// WORDER: Email Merge Tags
// /src/lib/email/merge-tags.ts
//
// 15 merge tags in 4 categories with PT-BR labels.
// =============================================

export interface MergeTag {
  tag: string;
  label: string;
  category: 'contact' | 'order' | 'store' | 'cart';
  sampleValue: string;
}

export const MERGE_TAGS: MergeTag[] = [
  // Contact tags
  {
    tag: 'contact.first_name',
    label: 'Primeiro Nome',
    category: 'contact',
    sampleValue: 'Maria',
  },
  {
    tag: 'contact.last_name',
    label: 'Sobrenome',
    category: 'contact',
    sampleValue: 'Silva',
  },
  {
    tag: 'contact.email',
    label: 'E-mail',
    category: 'contact',
    sampleValue: 'maria@exemplo.com',
  },
  {
    tag: 'contact.phone',
    label: 'Telefone',
    category: 'contact',
    sampleValue: '(11) 99999-0000',
  },

  // Order tags
  {
    tag: 'order.number',
    label: 'Número do Pedido',
    category: 'order',
    sampleValue: '#1042',
  },
  {
    tag: 'order.total',
    label: 'Total do Pedido',
    category: 'order',
    sampleValue: 'R$ 199,90',
  },
  {
    tag: 'order.status',
    label: 'Status do Pedido',
    category: 'order',
    sampleValue: 'Enviado',
  },
  {
    tag: 'order.tracking_url',
    label: 'URL de Rastreio',
    category: 'order',
    sampleValue: 'https://rastreio.exemplo.com/abc123',
  },

  // Store tags
  {
    tag: 'store.name',
    label: 'Nome da Loja',
    category: 'store',
    sampleValue: 'Minha Loja',
  },
  {
    tag: 'store.url',
    label: 'URL da Loja',
    category: 'store',
    sampleValue: 'https://minhaloja.com.br',
  },
  {
    tag: 'store.email',
    label: 'E-mail da Loja',
    category: 'store',
    sampleValue: 'contato@minhaloja.com.br',
  },
  {
    tag: 'store.phone',
    label: 'Telefone da Loja',
    category: 'store',
    sampleValue: '(11) 3000-0000',
  },

  // Cart tags
  {
    tag: 'cart.url',
    label: 'URL do Carrinho',
    category: 'cart',
    sampleValue: 'https://minhaloja.com.br/cart/recover/abc123',
  },
  {
    tag: 'cart.total',
    label: 'Total do Carrinho',
    category: 'cart',
    sampleValue: 'R$ 349,90',
  },
  {
    tag: 'cart.items_count',
    label: 'Quantidade de Itens',
    category: 'cart',
    sampleValue: '3',
  },
];

export const MERGE_TAG_CATEGORIES = [
  { key: 'contact', label: 'Contato' },
  { key: 'order', label: 'Pedido' },
  { key: 'store', label: 'Loja' },
  { key: 'cart', label: 'Carrinho' },
] as const;

/**
 * Returns a map of tag -> sampleValue for test/preview purposes.
 */
export function getSampleMergeData(): Record<string, string> {
  const data: Record<string, string> = {};
  for (const tag of MERGE_TAGS) {
    data[tag.tag] = tag.sampleValue;
  }
  return data;
}
