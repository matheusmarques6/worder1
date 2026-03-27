export interface MergeTag {
  name: string
  value: string
  sample: string
  category: 'contact' | 'order' | 'store' | 'cart'
}

export const mergeTags: Record<string, MergeTag> = {
  first_name: { name: 'Nome', value: '{{first_name}}', sample: 'João', category: 'contact' },
  last_name: { name: 'Sobrenome', value: '{{last_name}}', sample: 'Silva', category: 'contact' },
  email: { name: 'Email', value: '{{email}}', sample: 'joao@email.com', category: 'contact' },
  phone: { name: 'Telefone', value: '{{phone}}', sample: '(11) 99999-9999', category: 'contact' },
  company: { name: 'Empresa', value: '{{company}}', sample: 'Empresa LTDA', category: 'contact' },
  store_name: { name: 'Nome da Loja', value: '{{store_name}}', sample: 'Minha Loja', category: 'store' },
  store_url: { name: 'URL da Loja', value: '{{store_url}}', sample: 'https://minhaloja.com.br', category: 'store' },
  order_number: { name: 'Nº Pedido', value: '{{order_number}}', sample: '#1234', category: 'order' },
  order_total: { name: 'Total Pedido', value: '{{order_total}}', sample: 'R$ 199,90', category: 'order' },
  order_date: { name: 'Data Pedido', value: '{{order_date}}', sample: '27/03/2026', category: 'order' },
  cart_total: { name: 'Total Carrinho', value: '{{cart_total}}', sample: 'R$ 299,90', category: 'cart' },
  cart_url: { name: 'Link Carrinho', value: '{{cart_url}}', sample: 'https://loja.com/cart/recover', category: 'cart' },
  product_name: { name: 'Produto', value: '{{product_name}}', sample: 'Camiseta Premium', category: 'order' },
  product_price: { name: 'Preço', value: '{{product_price}}', sample: 'R$ 89,90', category: 'order' },
  product_url: { name: 'Link Produto', value: '{{product_url}}', sample: 'https://loja.com/produto', category: 'order' },
}

export function getMergeTagsByCategory(category: MergeTag['category']) {
  return Object.entries(mergeTags)
    .filter(([, tag]) => tag.category === category)
    .map(([key, tag]) => ({ key, ...tag }))
}
