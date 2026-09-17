// =============================================================
// Catálogo único de variáveis do e-mail
//
// Antes existiam CINCO fontes competindo no seletor: o catálogo
// estático, a lista canônica, as variáveis auto-descobertas do payload
// (281 delas), as personalizadas e os apelidos pontilhados. O mesmo
// conceito aparecia três vezes com nomes diferentes —
// {{store_url}} (LOJA), {{ StoreURL }} (gatilho) e
// {{ event.extra.referring_site }} (payload cru) — e nada dizia qual
// delas de fato preenche alguma coisa no envio.
//
// Aqui cada conceito existe UMA vez, com duas famílias:
//
//   'platform' — não depende de evento nenhum. Sai do contato, da
//     loja ou do sistema, e vale igual em campanha e em automação.
//     {{first_name}}, {{store_url}}, {{unsubscribe_url}}.
//
//   'event' — sai do que chegou no evento. O nome é estável
//     ({{ CheckoutURL }}), o CAMINHO até o valor é configurável em
//     Integrações → Mapeamento de variáveis. Assim uma integração
//     nova, que mande o link do checkout em outro campo, é
//     acomodada sem tocar em nenhum template.
//
// Os apelidos legados ({{contact.first_name}}, {{store.url}},
// {{trigger.*}}) CONTINUAM resolvendo no envio — só deixam de ser
// oferecidos, porque oferecer duas grafias da mesma coisa é o que
// deixava a tela com 281 linhas.
// =============================================================

export type TagFamily = 'platform' | 'event';

export type TagGroup =
  | 'contact'
  | 'purchases'
  | 'store'
  | 'system'
  | 'order'
  | 'cart'
  | 'product'
  | 'customer'
  | 'shipping';

export interface CatalogTag {
  /** O que o usuário escreve, sem chaves. */
  tag: string;
  label: string;
  family: TagFamily;
  group: TagGroup;
  sample: string;
  description?: string;
  /**
   * Só para family 'event': a ordem em que procuramos o valor no
   * payload. O primeiro caminho que existir vence. É exatamente isso
   * que a tela de mapeamento deixa editar.
   */
  paths?: string[];
  /** Gatilhos em que a variável costuma existir. Vazio = todos. */
  triggers?: string[];
  /** URL relativa vira absoluta no domínio da loja. */
  isUrl?: boolean;
}

export const TAG_GROUP_LABELS: Record<TagGroup, string> = {
  contact: 'Contato',
  purchases: 'Histórico de compras',
  store: 'Loja',
  system: 'Sistema',
  order: 'Pedido',
  cart: 'Carrinho e checkout',
  product: 'Produto',
  customer: 'Cliente do evento',
  shipping: 'Entrega',
};

// -------------------------------------------------------------
// PLATAFORMA — sempre disponível, não depende de evento
// -------------------------------------------------------------
const PLATFORM: CatalogTag[] = [
  // Contato
  { tag: 'first_name', label: 'Primeiro nome', family: 'platform', group: 'contact', sample: 'Maria' },
  { tag: 'last_name', label: 'Sobrenome', family: 'platform', group: 'contact', sample: 'Silva' },
  { tag: 'full_name', label: 'Nome completo', family: 'platform', group: 'contact', sample: 'Maria Silva' },
  { tag: 'email', label: 'E-mail', family: 'platform', group: 'contact', sample: 'maria@email.com' },
  { tag: 'phone', label: 'Telefone', family: 'platform', group: 'contact', sample: '+5531999999999' },
  { tag: 'city', label: 'Cidade', family: 'platform', group: 'contact', sample: 'São Paulo' },
  { tag: 'state', label: 'Estado', family: 'platform', group: 'contact', sample: 'SP' },
  { tag: 'country', label: 'País', family: 'platform', group: 'contact', sample: 'Brasil' },
  { tag: 'birthday', label: 'Aniversário', family: 'platform', group: 'contact', sample: '15/03' },
  { tag: 'tags', label: 'Tags do contato', family: 'platform', group: 'contact', sample: 'VIP, Recorrente' },

  // Histórico de compras (perfil acumulado do contato)
  { tag: 'total_orders', label: 'Total de pedidos', family: 'platform', group: 'purchases', sample: '5' },
  { tag: 'total_spent', label: 'Total gasto', family: 'platform', group: 'purchases', sample: 'R$ 1.250,00' },
  { tag: 'average_order_value', label: 'Ticket médio', family: 'platform', group: 'purchases', sample: 'R$ 250,00' },
  { tag: 'last_order_at', label: 'Data do último pedido', family: 'platform', group: 'purchases', sample: '05/04/2026' },

  // Loja — vem das configurações da loja, nunca do evento
  { tag: 'store_name', label: 'Nome da loja', family: 'platform', group: 'store', sample: 'Minha Loja',
    description: 'Configurações da loja.' },
  { tag: 'store_url', label: 'URL da loja', family: 'platform', group: 'store', sample: 'https://minhaloja.com',
    description: 'Domínio principal da loja na Shopify. Se você trocar o domínio, atualiza sozinho.', isUrl: true },
  { tag: 'store_email', label: 'E-mail da loja', family: 'platform', group: 'store', sample: 'contato@loja.com',
    description: 'Configurações da loja.' },
  { tag: 'store_phone', label: 'Telefone da loja', family: 'platform', group: 'store', sample: '+5531999999999',
    description: 'Telefone cadastrado na Shopify (endereço de cobrança da loja). Atualiza a cada sincronização.' },

  // Sistema
  { tag: 'unsubscribe_url', label: 'Link de descadastro', family: 'platform', group: 'system', sample: 'https://…',
    description: 'Obrigatório por lei em e-mail de marketing.', isUrl: true },
  { tag: 'view_in_browser_url', label: 'Ver no navegador', family: 'platform', group: 'system', sample: 'https://…', isUrl: true },
  { tag: 'current_date', label: 'Data de hoje', family: 'platform', group: 'system', sample: '04/09/2026' },
  { tag: 'current_year', label: 'Ano atual', family: 'platform', group: 'system', sample: '2026' },
];

// -------------------------------------------------------------
// EVENTO — nome estável, caminho configurável
//
// A ordem de `paths` é a cascata: o primeiro caminho presente no
// payload vence. Os caminhos canônicos vêm primeiro de propósito, e
// os brutos (raw.*) por último — assim uma integração nova que já
// mande o campo no formato canônico funciona sem configurar nada.
// -------------------------------------------------------------
const CART_TRIGGERS = ['trigger_abandon', 'trigger_checkout_abandoned', 'trigger_added_to_cart'];
const ORDER_TRIGGERS = [
  'trigger_order', 'trigger_order_paid', 'trigger_first_purchase',
  'trigger_repeat_purchase', 'trigger_fulfilled_order', 'trigger_cancelled_order',
];
const PRODUCT_TRIGGERS = [
  'trigger_viewed_product', 'trigger_browse_abandoned', 'trigger_back_in_stock',
  'trigger_price_drop', 'trigger_viewed_collection', ...CART_TRIGGERS,
];

const EVENT: CatalogTag[] = [
  // ---- Carrinho e checkout ----
  {
    tag: 'CheckoutURL', label: 'Link de recuperação do checkout',
    family: 'event', group: 'cart', isUrl: true,
    sample: 'https://loja.myshopify.com/checkouts/recover/abc123',
    description: 'O link que devolve a pessoa ao carrinho dela.',
    triggers: CART_TRIGGERS,
    paths: ['CheckoutURL', 'checkout_url', 'AbandonedCheckoutURL',
            'raw.abandoned_checkout_url', 'raw.recovery_url', 'abandoned_checkout_url'],
  },
  {
    tag: 'TotalPrice', label: 'Valor total', family: 'event', group: 'cart',
    sample: '199.90', triggers: [...CART_TRIGGERS, ...ORDER_TRIGGERS],
    paths: ['TotalPrice', '$value', 'Value', 'total_price', 'raw.total_price'],
  },
  {
    tag: 'SubtotalPrice', label: 'Subtotal', family: 'event', group: 'cart',
    sample: '189.90', triggers: [...CART_TRIGGERS, ...ORDER_TRIGGERS],
    paths: ['SubtotalPrice', 'subtotal_price', 'raw.subtotal_price'],
  },
  {
    tag: 'Currency', label: 'Moeda', family: 'event', group: 'cart',
    sample: 'BRL', paths: ['Currency', 'currency', 'raw.currency'],
  },
  {
    tag: 'ItemCount', label: 'Quantidade de itens', family: 'event', group: 'cart',
    sample: '3', triggers: [...CART_TRIGGERS, ...ORDER_TRIGGERS],
    paths: ['ItemCount', 'item_count', 'raw.item_count'],
  },
  {
    tag: 'DiscountCodes', label: 'Cupons aplicados', family: 'event', group: 'cart',
    sample: 'BEMVINDO10', triggers: [...CART_TRIGGERS, ...ORDER_TRIGGERS],
    paths: ['DiscountCodes', 'discount_codes', 'raw.discount_codes'],
  },
  {
    tag: 'CheckoutID', label: 'ID do checkout', family: 'event', group: 'cart',
    sample: '987654', triggers: CART_TRIGGERS,
    paths: ['CheckoutID', 'CheckoutId', 'checkout_id', 'raw.id'],
  },

  // ---- Pedido ----
  {
    tag: 'OrderNumber', label: 'Número do pedido', family: 'event', group: 'order',
    sample: '1234', triggers: ORDER_TRIGGERS,
    paths: ['OrderNumber', 'order_number', 'raw.order_number', 'raw.name'],
  },
  {
    tag: 'OrderID', label: 'ID do pedido', family: 'event', group: 'order',
    sample: '4567890', triggers: ORDER_TRIGGERS,
    paths: ['OrderID', 'OrderId', 'order_id', 'raw.id'],
  },
  {
    tag: 'OrderStatusURL', label: 'Página de status do pedido',
    family: 'event', group: 'order', isUrl: true,
    sample: 'https://loja.com/orders/abc123', triggers: ORDER_TRIGGERS,
    paths: ['OrderStatusURL', 'order_status_url', 'raw.order_status_url'],
  },
  {
    tag: 'FinancialStatus', label: 'Status do pagamento', family: 'event', group: 'order',
    sample: 'paid', triggers: ORDER_TRIGGERS,
    paths: ['FinancialStatus', 'financial_status', 'raw.financial_status'],
  },
  {
    tag: 'FulfillmentStatus', label: 'Status do envio', family: 'event', group: 'order',
    sample: 'fulfilled', triggers: ORDER_TRIGGERS,
    paths: ['FulfillmentStatus', 'fulfillment_status', 'raw.fulfillment_status'],
  },

  // ---- Entrega ----
  {
    tag: 'Tracking.Number', label: 'Código de rastreio', family: 'event', group: 'shipping',
    sample: 'BR123456789', triggers: ['trigger_fulfilled_order'],
    paths: ['Tracking.Number', 'TrackingNumber', 'tracking_number',
            'raw.tracking_number', 'raw.fulfillments.0.tracking_number'],
  },
  {
    tag: 'Tracking.URL', label: 'Link de rastreio', family: 'event', group: 'shipping',
    isUrl: true, sample: 'https://rastreio.correios.com.br/BR123456789',
    triggers: ['trigger_fulfilled_order'],
    paths: ['Tracking.URL', 'TrackingUrl', 'tracking_url',
            'raw.tracking_url', 'raw.fulfillments.0.tracking_url'],
  },
  {
    tag: 'Tracking.Company', label: 'Transportadora', family: 'event', group: 'shipping',
    sample: 'Correios', triggers: ['trigger_fulfilled_order'],
    paths: ['Tracking.Company', 'TrackingCompany', 'tracking_company', 'raw.tracking_company'],
  },
  {
    tag: 'ShippingAddress.City', label: 'Cidade de entrega', family: 'event', group: 'shipping',
    sample: 'São Paulo', triggers: ORDER_TRIGGERS,
    paths: ['ShippingAddress.City', 'shipping_address.city', 'raw.shipping_address.city'],
  },

  // ---- Produto ----
  {
    tag: 'ProductURL', label: 'Link do produto', family: 'event', group: 'product',
    isUrl: true, sample: 'https://loja.com/products/camiseta',
    triggers: PRODUCT_TRIGGERS,
    paths: ['ProductURL', 'product_url', 'Items.0.ProductURL', 'raw.product_url'],
  },
  {
    tag: 'Items[0].ProductName', label: 'Nome do produto', family: 'event', group: 'product',
    sample: 'Camiseta Premium', triggers: PRODUCT_TRIGGERS,
    paths: ['Items.0.ProductName', 'ProductName', 'Items.0.title',
            'line_items.0.title', 'raw.line_items.0.title'],
  },
  {
    tag: 'Items[0].ItemPrice', label: 'Preço do produto', family: 'event', group: 'product',
    sample: '89.90', triggers: PRODUCT_TRIGGERS,
    paths: ['Items.0.ItemPrice', 'Price', 'Items.0.price',
            'line_items.0.price', 'raw.line_items.0.price'],
  },
  {
    tag: 'Items[0].CompareAtPrice', label: 'Preço antigo (de)', family: 'event', group: 'product',
    sample: '129.90', triggers: PRODUCT_TRIGGERS,
    paths: ['Items.0.CompareAtPrice', 'CompareAtPrice', 'Items.0.compare_at_price',
            'raw.line_items.0.compare_at_price'],
  },
  {
    tag: 'Items[0].ImageURL', label: 'Imagem do produto', family: 'event', group: 'product',
    isUrl: true, sample: 'https://cdn.shopify.com/produto.jpg', triggers: PRODUCT_TRIGGERS,
    paths: ['Items.0.ImageURL', 'ImageURL', 'Items.0.image_url', 'raw.line_items.0.image'],
  },
  {
    tag: 'Items[0].ProductURL', label: 'Link do 1º item', family: 'event', group: 'product',
    isUrl: true, sample: 'https://loja.com/products/camiseta', triggers: PRODUCT_TRIGGERS,
    paths: ['Items.0.ProductURL', 'Items.0.url', 'ProductURL'],
  },
  {
    tag: 'Items[0].Quantity', label: 'Quantidade do 1º item', family: 'event', group: 'product',
    sample: '1', triggers: PRODUCT_TRIGGERS,
    paths: ['Items.0.Quantity', 'Items.0.quantity', 'raw.line_items.0.quantity'],
  },
  {
    tag: 'Items[0].SKU', label: 'SKU do produto', family: 'event', group: 'product',
    sample: 'CAM-001', triggers: PRODUCT_TRIGGERS,
    paths: ['Items.0.SKU', 'SKU', 'Items.0.sku', 'raw.line_items.0.sku'],
  },
  {
    tag: 'Items[0].VariantName', label: 'Variante', family: 'event', group: 'product',
    sample: 'Azul / M', triggers: PRODUCT_TRIGGERS,
    paths: ['Items.0.VariantName', 'VariantName', 'Items.0.variant_title',
            'raw.line_items.0.variant_title'],
  },

  // ---- Cliente do evento (o que veio NO evento, não o perfil salvo) ----
  {
    tag: 'Customer.FirstName', label: 'Primeiro nome (do evento)', family: 'event', group: 'customer',
    sample: 'Maria',
    description: 'Vem do payload. Para o cadastro salvo, use {{first_name}}.',
    paths: ['Customer.FirstName', 'CustomerFirstName', 'first_name',
            'raw.customer.first_name', 'raw.billing_address.first_name'],
  },
  {
    tag: 'Customer.LastName', label: 'Sobrenome (do evento)', family: 'event', group: 'customer',
    sample: 'Silva',
    paths: ['Customer.LastName', 'CustomerLastName', 'last_name', 'raw.customer.last_name'],
  },
  {
    tag: 'Customer.Email', label: 'E-mail (do evento)', family: 'event', group: 'customer',
    sample: 'maria@email.com',
    paths: ['Customer.Email', 'CustomerEmail', 'email', 'raw.email', 'raw.customer.email'],
  },
  {
    tag: 'Customer.Phone', label: 'Telefone (do evento)', family: 'event', group: 'customer',
    sample: '+5531999999999',
    paths: ['Customer.Phone', 'CustomerPhone', 'phone', 'raw.phone', 'raw.customer.phone'],
  },
];

export const MERGE_TAG_CATALOG: CatalogTag[] = [...PLATFORM, ...EVENT];

export const PLATFORM_TAGS = PLATFORM;
export const EVENT_TAGS = EVENT;

export const CATALOG_BY_TAG = new Map(MERGE_TAG_CATALOG.map((t) => [t.tag, t]));

/** As variáveis de evento que fazem sentido para um gatilho. */
export function eventTagsForTrigger(triggerType?: string | null): CatalogTag[] {
  if (!triggerType) return EVENT;
  return EVENT.filter((t) => !t.triggers || t.triggers.length === 0 || t.triggers.includes(triggerType));
}

/**
 * Grafias antigas que continuam resolvendo no envio mas não são mais
 * oferecidas — cada uma é o MESMO conceito de uma tag do catálogo.
 * A tela de mapeamento usa esta lista para avisar "isso aqui virou
 * aquilo" em vez de deixar o usuário achando que sumiu.
 */
export const DEPRECATED_ALIASES: Record<string, string> = {
  'contact.first_name': 'first_name',
  'contact.last_name': 'last_name',
  'contact.full_name': 'full_name',
  'contact.email': 'email',
  'contact.phone': 'phone',
  'store.name': 'store_name',
  'store.url': 'store_url',
  'store.email': 'store_email',
  'store.phone': 'store_phone',
  'event.CheckoutURL': 'CheckoutURL',
  'event.ProductURL': 'ProductURL',
  'event.ProductName': 'Items[0].ProductName',
  'event.Price': 'Items[0].ItemPrice',
  'event.ImageURL': 'Items[0].ImageURL',
  'event.CompareAtPrice': 'Items[0].CompareAtPrice',
  'event.SKU': 'Items[0].SKU',
  'event.VariantName': 'Items[0].VariantName',
  'event.OrderNumber': 'OrderNumber',
  'event.OrderId': 'OrderID',
  'event.Value': 'TotalPrice',
  'event.SubtotalPrice': 'SubtotalPrice',
  'event.Currency': 'Currency',
  'event.ItemCount': 'ItemCount',
  'event.order_status_url': 'OrderStatusURL',
  'event.FinancialStatus': 'FinancialStatus',
  'event.FulfillmentStatus': 'FulfillmentStatus',
  'event.TrackingNumber': 'Tracking.Number',
  'event.TrackingUrl': 'Tracking.URL',
  'event.TrackingCompany': 'Tracking.Company',
  'event.DiscountCode': 'DiscountCodes',
  'event.email': 'Customer.Email',
  'event.customer_name': 'Customer.FirstName',
  'trigger.link': 'CheckoutURL',
  'trigger.first_item_name': 'Items[0].ProductName',
  'trigger.first_item_price': 'Items[0].ItemPrice',
  'trigger.first_item_image': 'Items[0].ImageURL',
  'trigger.total': 'TotalPrice',
  'trigger.items_count': 'ItemCount',
  cart_total: 'TotalPrice',
  cart_item_count: 'ItemCount',
  cart_first_item: 'Items[0].ProductName',
  cart_first_item_price: 'Items[0].ItemPrice',
  checkout_url: 'CheckoutURL',
  order_number: 'OrderNumber',
  order_total: 'TotalPrice',
  tracking_url: 'Tracking.URL',
  tracking_number: 'Tracking.Number',
};

/**
 * O caminho de um `Items[0].X` do catálogo para a forma pontilhada que
 * o resolvedor entende (`Items.0.X`). Mantido aqui para o seletor, a
 * tela de mapeamento e o resolvedor não divergirem.
 */
export function toDotPath(path: string): string {
  return path.replace(/\[(\d+)\]/g, '.$1');
}
