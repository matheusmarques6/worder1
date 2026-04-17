export interface MergeTagGroup {
  name: string
  icon: string
  tags: { name: string; value: string; sample: string; hint?: string }[]
}

export const MERGE_TAGS: MergeTagGroup[] = [
  {
    name: 'Contato', icon: 'User',
    tags: [
      { name: 'Primeiro Nome', value: '{{first_name}}', sample: 'Maria', hint: 'Padrão: "Cliente" se vazio' },
      { name: 'Sobrenome', value: '{{last_name}}', sample: 'Silva' },
      { name: 'Nome Completo', value: '{{full_name}}', sample: 'Maria Silva', hint: 'Padrão: "Cliente" se vazio' },
      { name: 'Email', value: '{{email}}', sample: 'maria@email.com' },
      { name: 'Telefone', value: '{{phone}}', sample: '+5531999999999' },
      { name: 'Empresa', value: '{{company}}', sample: 'Acme Corp' },
      { name: 'Cidade', value: '{{city}}', sample: 'São Paulo' },
      { name: 'Estado', value: '{{state}}', sample: 'SP' },
      { name: 'País', value: '{{country}}', sample: 'Brasil' },
      { name: 'Aniversário', value: '{{birthday}}', sample: '15/03' },
      { name: 'Origem', value: '{{source}}', sample: 'shopify' },
      { name: 'Tags', value: '{{tags}}', sample: 'VIP, Recorrente' },
    ],
  },
  {
    name: 'Compras', icon: 'ShoppingBag',
    tags: [
      { name: 'Total de Pedidos', value: '{{total_orders}}', sample: '5' },
      { name: 'Total Gasto', value: '{{total_spent}}', sample: 'R$ 1.250,00' },
      { name: 'Ticket Médio', value: '{{average_order_value}}', sample: 'R$ 250,00' },
      { name: 'Último Pedido', value: '{{last_order_at}}', sample: '05/04/2026' },
    ],
  },
  {
    name: 'Último Pedido', icon: 'Package',
    tags: [
      { name: 'Nº do Pedido', value: '{{order_number}}', sample: '#1234', hint: 'Do pedido mais recente' },
      { name: 'Total', value: '{{order_total}}', sample: 'R$ 199,90' },
      { name: 'Data', value: '{{order_date}}', sample: '30/03/2026' },
      { name: 'Status', value: '{{order_status}}', sample: 'paid' },
      { name: 'Link de Rastreio', value: '{{tracking_url}}', sample: 'https://...' },
      { name: 'Código de Rastreio', value: '{{tracking_number}}', sample: 'BR123456789' },
    ],
  },
  {
    name: 'Carrinho Abandonado', icon: 'ShoppingCart',
    tags: [
      { name: 'Link de Recuperação', value: '{{checkout_url}}', sample: 'https://loja.myshopify.com/checkouts/recover/...' },
      { name: 'Total do Carrinho', value: '{{cart_total}}', sample: 'R$ 299,90' },
      { name: '1º Produto', value: '{{cart_first_item}}', sample: 'Camiseta Premium' },
      { name: '1º Preço', value: '{{cart_first_item_price}}', sample: 'R$ 89,90' },
      { name: 'Qtd. de Itens', value: '{{cart_item_count}}', sample: '3' },
    ],
  },
  {
    name: 'Loja', icon: 'Store',
    tags: [
      { name: 'Nome da Loja', value: '{{store_name}}', sample: 'Minha Loja' },
      { name: 'URL da Loja', value: '{{store_url}}', sample: 'https://minhaloja.com' },
      { name: 'Email da Loja', value: '{{store_email}}', sample: 'contato@loja.com' },
      { name: 'Telefone da Loja', value: '{{store_phone}}', sample: '+5531999999999' },
    ],
  },
  {
    name: 'Evento (Automações)', icon: 'Zap',
    tags: [
      { name: 'Nome do Produto', value: '{{event.ProductName}}', sample: 'Camiseta Premium', hint: 'Dados do gatilho da automação' },
      { name: 'Preço do Produto', value: '{{event.Price}}', sample: 'R$ 89,90' },
      { name: 'Imagem do Produto', value: '{{event.ImageURL}}', sample: 'https://cdn.shopify.com/...' },
      { name: 'URL do Produto', value: '{{event.ProductURL}}', sample: 'https://loja.com/produto' },
      { name: 'ID do Pedido', value: '{{event.OrderId}}', sample: '#1234' },
      { name: 'Valor Total', value: '{{event.Value}}', sample: 'R$ 199,90' },
      { name: 'Moeda', value: '{{event.Currency}}', sample: 'BRL' },
      { name: 'Qtd. de Itens', value: '{{event.ItemCount}}', sample: '3' },
      { name: 'URL do Checkout', value: '{{event.CheckoutURL}}', sample: 'https://loja.com/checkout' },
      { name: 'Email do Cliente', value: '{{event.email}}', sample: 'maria@email.com' },
      { name: 'Nome do Cliente', value: '{{event.customer_name}}', sample: 'Maria Silva' },
      { name: 'Código de Desconto', value: '{{event.DiscountCode}}', sample: 'BEMVINDO10' },
    ],
  },
  {
    name: 'Personalizado', icon: 'Tag',
    tags: [
      { name: 'Campo Custom', value: '{{custom.nome_do_campo|valor padrão}}', sample: 'valor padrão', hint: 'Use | para definir fallback' },
    ],
  },
  {
    name: 'Sistema', icon: 'Link',
    tags: [
      { name: 'Link Descadastrar', value: '{{unsubscribe_url}}', sample: '#', hint: 'Obrigatório em todo email' },
      { name: 'Ver no Navegador', value: '{{view_in_browser_url}}', sample: '#' },
      { name: 'Data Atual', value: '{{current_date}}', sample: '17/04/2026' },
      { name: 'Ano Atual', value: '{{current_year}}', sample: '2026' },
    ],
  },
]
