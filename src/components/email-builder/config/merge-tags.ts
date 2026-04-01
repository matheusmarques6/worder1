export interface MergeTagGroup {
  name: string
  icon: string
  tags: { name: string; value: string; sample: string }[]
}

export const MERGE_TAGS: MergeTagGroup[] = [
  {
    name: 'Contato', icon: 'User',
    tags: [
      { name: 'Primeiro Nome', value: '{{first_name}}', sample: 'Maria' },
      { name: 'Sobrenome', value: '{{last_name}}', sample: 'Silva' },
      { name: 'Email', value: '{{email}}', sample: 'maria@email.com' },
      { name: 'Telefone', value: '{{phone}}', sample: '+5531999999999' },
    ],
  },
  {
    name: 'Loja', icon: 'Store',
    tags: [
      { name: 'Nome da Loja', value: '{{store_name}}', sample: 'Minha Loja' },
      { name: 'URL da Loja', value: '{{store_url}}', sample: 'https://minhaloja.com' },
    ],
  },
  {
    name: 'Pedido', icon: 'Package',
    tags: [
      { name: 'Nº do Pedido', value: '{{order_number}}', sample: '#1234' },
      { name: 'Total', value: '{{order_total}}', sample: 'R$ 199,90' },
      { name: 'Data', value: '{{order_date}}', sample: '30/03/2026' },
      { name: 'Link Rastreio', value: '{{tracking_url}}', sample: 'https://...' },
    ],
  },
  {
    name: 'Carrinho', icon: 'ShoppingCart',
    tags: [
      { name: 'Link do Carrinho', value: '{{cart_url}}', sample: 'https://loja.com/cart' },
      { name: 'Total', value: '{{cart_total}}', sample: 'R$ 299,90' },
      { name: '1º Produto', value: '{{cart_first_item}}', sample: 'Camiseta Premium' },
      { name: '1º Preço', value: '{{cart_first_item_price}}', sample: 'R$ 89,90' },
    ],
  },
  {
    name: 'Cupom', icon: 'Tag',
    tags: [
      { name: 'Código', value: '{{coupon_code}}', sample: 'BEMVINDO10' },
      { name: 'Valor', value: '{{coupon_value}}', sample: '10%' },
      { name: 'Validade', value: '{{coupon_expiry}}', sample: '05/04/2026' },
    ],
  },
  {
    name: 'Evento', icon: 'Zap',
    tags: [
      { name: 'Nome do Produto', value: '{{event.ProductName}}', sample: 'Camiseta Premium' },
      { name: 'Preço', value: '{{event.Price}}', sample: 'R$ 89,90' },
      { name: 'Imagem do Produto', value: '{{event.ImageURL}}', sample: 'https://cdn.shopify.com/image.jpg' },
      { name: 'URL do Produto', value: '{{event.ProductURL}}', sample: 'https://loja.com/produto' },
      { name: 'Nº do Pedido', value: '{{event.OrderId}}', sample: '#1234' },
      { name: 'Valor', value: '{{event.Value}}', sample: 'R$ 199,90' },
      { name: 'Moeda', value: '{{event.Currency}}', sample: 'BRL' },
      { name: 'Itens', value: '{{event.Items}}', sample: '[Camiseta, Calça]' },
      { name: 'Qtd. de Itens', value: '{{event.ItemCount}}', sample: '3' },
      { name: 'URL do Checkout', value: '{{event.CheckoutURL}}', sample: 'https://loja.com/checkout' },
      { name: 'Código de Desconto', value: '{{event.DiscountCode}}', sample: 'BEMVINDO10' },
    ],
  },
  {
    name: 'Sistema', icon: 'Link',
    tags: [
      { name: 'Descadastrar', value: '{{unsubscribe_url}}', sample: '#' },
      { name: 'Ver no Navegador', value: '{{view_in_browser_url}}', sample: '#' },
    ],
  },
]
