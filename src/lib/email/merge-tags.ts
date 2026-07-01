// =============================================
// WORDER: Email Merge Tags (editor de TEXTO)
// /src/lib/email/merge-tags.ts
//
// Fonte ÚNICA das variáveis oferecidas no editor de e-mail em texto.
// Espelha EXATAMENTE as variáveis do editor de blocos
// (src/components/email-builder/config/merge-tags.ts) e, principalmente,
// as que o pipeline de envio realmente resolve (send-campaign-email.ts +
// renderMergeTags): chaves FLAT ({{first_name}}, {{checkout_url}},
// {{store_name}}, ...) e o grupo {{event.*}} achatado do event_data.
//
// ⚠️ NÃO usar sintaxe pontilhada tipo {{contact.first_name}} / {{cart.url}}
// aqui — essas NÃO são populadas no mergeData e não chegam nos eventos.
// (O renderer mantém alguns aliases legados por retrocompatibilidade, mas
//  o painel deve mostrar somente as tags reais/funcionais.)
// =============================================

export interface MergeTag {
  tag: string;
  label: string;
  category:
    | 'contact'
    | 'purchases'
    | 'last_order'
    | 'cart'
    | 'store'
    | 'event'
    | 'system'
    | 'custom';
  sampleValue: string;
  description?: string;
}

export const MERGE_TAGS: MergeTag[] = [
  // Contato
  { tag: 'first_name', label: 'Primeiro Nome', category: 'contact', sampleValue: 'Maria', description: 'Padrão: "Cliente" se vazio' },
  { tag: 'last_name', label: 'Sobrenome', category: 'contact', sampleValue: 'Silva' },
  { tag: 'full_name', label: 'Nome Completo', category: 'contact', sampleValue: 'Maria Silva', description: 'Padrão: "Cliente" se vazio' },
  { tag: 'email', label: 'E-mail', category: 'contact', sampleValue: 'maria@email.com' },
  { tag: 'phone', label: 'Telefone', category: 'contact', sampleValue: '+5531999999999' },
  { tag: 'company', label: 'Empresa', category: 'contact', sampleValue: 'Acme Corp' },
  { tag: 'city', label: 'Cidade', category: 'contact', sampleValue: 'São Paulo' },
  { tag: 'state', label: 'Estado', category: 'contact', sampleValue: 'SP' },
  { tag: 'country', label: 'País', category: 'contact', sampleValue: 'Brasil' },
  { tag: 'birthday', label: 'Aniversário', category: 'contact', sampleValue: '15/03' },
  { tag: 'source', label: 'Origem', category: 'contact', sampleValue: 'shopify' },
  { tag: 'tags', label: 'Tags', category: 'contact', sampleValue: 'VIP, Recorrente' },

  // Compras (perfil do contato)
  { tag: 'total_orders', label: 'Total de Pedidos', category: 'purchases', sampleValue: '5' },
  { tag: 'total_spent', label: 'Total Gasto', category: 'purchases', sampleValue: 'R$ 1.250,00' },
  { tag: 'average_order_value', label: 'Ticket Médio', category: 'purchases', sampleValue: 'R$ 250,00' },
  { tag: 'last_order_at', label: 'Último Pedido', category: 'purchases', sampleValue: '05/04/2026' },

  // Último Pedido
  { tag: 'order_number', label: 'Nº do Pedido', category: 'last_order', sampleValue: '#1234', description: 'Do pedido mais recente' },
  { tag: 'order_total', label: 'Total', category: 'last_order', sampleValue: 'R$ 199,90' },
  { tag: 'order_date', label: 'Data', category: 'last_order', sampleValue: '30/03/2026' },
  { tag: 'order_status', label: 'Status', category: 'last_order', sampleValue: 'paid' },
  { tag: 'tracking_url', label: 'Link de Rastreio', category: 'last_order', sampleValue: 'https://...' },
  { tag: 'tracking_number', label: 'Código de Rastreio', category: 'last_order', sampleValue: 'BR123456789' },

  // Carrinho Abandonado
  { tag: 'checkout_url', label: 'Link de Recuperação', category: 'cart', sampleValue: 'https://loja.myshopify.com/checkouts/recover/...' },
  { tag: 'cart_total', label: 'Total do Carrinho', category: 'cart', sampleValue: 'R$ 299,90' },
  { tag: 'cart_first_item', label: '1º Produto', category: 'cart', sampleValue: 'Camiseta Premium' },
  { tag: 'cart_first_item_price', label: '1º Preço', category: 'cart', sampleValue: 'R$ 89,90' },
  { tag: 'cart_item_count', label: 'Qtd. de Itens', category: 'cart', sampleValue: '3' },

  // Loja
  { tag: 'store_name', label: 'Nome da Loja', category: 'store', sampleValue: 'Minha Loja' },
  { tag: 'store_url', label: 'URL da Loja', category: 'store', sampleValue: 'https://minhaloja.com' },
  { tag: 'store_email', label: 'E-mail da Loja', category: 'store', sampleValue: 'contato@loja.com' },
  { tag: 'store_phone', label: 'Telefone da Loja', category: 'store', sampleValue: '+5531999999999' },

  // Evento (Automações) — campos achatados do event_data no envio
  { tag: 'event.ProductName', label: 'Nome do Produto', category: 'event', sampleValue: 'Camiseta Premium', description: 'Primeiro produto do evento' },
  { tag: 'event.Price', label: 'Preço do Produto', category: 'event', sampleValue: '89.90' },
  { tag: 'event.CompareAtPrice', label: 'Preço Comparativo', category: 'event', sampleValue: '129.90' },
  { tag: 'event.ImageURL', label: 'Imagem do Produto', category: 'event', sampleValue: 'https://cdn.shopify.com/...' },
  { tag: 'event.ProductURL', label: 'URL do Produto', category: 'event', sampleValue: 'https://loja.com/produto' },
  { tag: 'event.SKU', label: 'SKU', category: 'event', sampleValue: 'CAM-001' },
  { tag: 'event.VariantName', label: 'Variante', category: 'event', sampleValue: 'Azul / M' },
  { tag: 'event.Brand', label: 'Marca', category: 'event', sampleValue: 'Azzurro Milano' },
  { tag: 'event.OrderId', label: 'ID do Pedido', category: 'event', sampleValue: '#1234' },
  { tag: 'event.OrderNumber', label: 'Número do Pedido', category: 'event', sampleValue: '1234' },
  { tag: 'event.Value', label: 'Valor Total', category: 'event', sampleValue: '199.90' },
  { tag: 'event.SubtotalPrice', label: 'Subtotal', category: 'event', sampleValue: '189.90' },
  { tag: 'event.TotalDiscounts', label: 'Total de Descontos', category: 'event', sampleValue: '20.00' },
  { tag: 'event.Currency', label: 'Moeda', category: 'event', sampleValue: 'BRL' },
  { tag: 'event.ItemCount', label: 'Qtd. de Itens', category: 'event', sampleValue: '3' },
  { tag: 'event.CheckoutURL', label: 'URL do Checkout', category: 'event', sampleValue: 'https://loja.com/checkout/recover' },
  { tag: 'event.order_status_url', label: 'URL do Pedido', category: 'event', sampleValue: 'https://loja.com/orders/...' },
  { tag: 'event.email', label: 'E-mail do Cliente', category: 'event', sampleValue: 'maria@email.com' },
  { tag: 'event.customer_name', label: 'Nome do Cliente', category: 'event', sampleValue: 'Maria Silva' },
  { tag: 'event.DiscountCode', label: 'Código de Desconto', category: 'event', sampleValue: 'BEMVINDO10' },
  { tag: 'event.FinancialStatus', label: 'Status Financeiro', category: 'event', sampleValue: 'paid' },
  { tag: 'event.FulfillmentStatus', label: 'Status Envio', category: 'event', sampleValue: 'fulfilled' },
  { tag: 'event.TrackingNumber', label: 'Número de Rastreio', category: 'event', sampleValue: 'BR123456789' },
  { tag: 'event.TrackingUrl', label: 'URL de Rastreio', category: 'event', sampleValue: 'https://rastreio.correios.com.br/...' },
  { tag: 'event.TrackingCompany', label: 'Transportadora', category: 'event', sampleValue: 'Correios' },

  // Sistema
  { tag: 'unsubscribe_url', label: 'Link Descadastrar', category: 'system', sampleValue: '#', description: 'Obrigatório em todo e-mail' },
  { tag: 'view_in_browser_url', label: 'Ver no Navegador', category: 'system', sampleValue: '#' },
  { tag: 'current_date', label: 'Data Atual', category: 'system', sampleValue: '17/04/2026' },
  { tag: 'current_year', label: 'Ano Atual', category: 'system', sampleValue: '2026' },

  // Personalizado
  {
    tag: 'custom.nome_do_campo|valor padrão',
    label: 'Campo Custom',
    category: 'custom',
    sampleValue: 'valor padrão',
    description: 'Troque "nome_do_campo" pelo seu campo. Use | para o valor padrão (fallback).',
  },
];

export const MERGE_TAG_CATEGORIES = [
  { key: 'contact', label: 'Contato' },
  { key: 'purchases', label: 'Compras' },
  { key: 'last_order', label: 'Último Pedido' },
  { key: 'cart', label: 'Carrinho Abandonado' },
  { key: 'store', label: 'Loja' },
  { key: 'event', label: 'Evento (Automações)' },
  { key: 'system', label: 'Sistema' },
  { key: 'custom', label: 'Personalizado' },
] as const;

// =============================================
// CANONICAL_TRIGGER_PATHS
// The 29 canonical merge-tag paths mirrored EXACTLY from the block
// editor's picker spec (src/components/email-builder/modals/MergeTagPicker.tsx
// canonicalGroup SPEC). These resolve un-prefixed ({{ CheckoutURL }}) AND
// as the legacy alias ({{ trigger.CheckoutURL }}). Keep in sync with the
// picker if the spec changes.
// =============================================
export const CANONICAL_TRIGGER_PATHS: string[] = [
  'CheckoutURL',
  'ProductURL',
  'OrderStatusURL',
  'TotalPrice',
  'SubtotalPrice',
  'Currency',
  'ItemCount',
  'OrderNumber',
  'OrderID',
  'CheckoutID',
  'Customer.Email',
  'Customer.FirstName',
  'Customer.LastName',
  'Customer.FullName',
  'Customer.Phone',
  'Customer.TotalOrders',
  'Customer.TotalSpent',
  'Items[0].ProductName',
  'Items[0].ItemPrice',
  'Items[0].ImageURL',
  'Items[0].ProductURL',
  'Items[0].Quantity',
  'FinancialStatus',
  'FulfillmentStatus',
  'Tracking.Number',
  'Tracking.URL',
  'BillingAddress.City',
  'ShippingAddress.City',
  'DiscountCodes',
];

// =============================================
// resolveTriggerSmartTags
// Retrocompatibilidade: substitui {{ trigger.* }} legados por valores do
// event_data. Mantido para templates antigos; o painel usa {{event.*}}.
//   - trigger.link    → CheckoutURL > AbandonedCheckoutURL >
//                       ProductURL > order_status_url > store URL
//   - trigger.first_item_*  → primeiro item de Items[] com fallbacks
//   - trigger.total / items_count → top-level e fallback bruto
// =============================================

export function resolveTriggerSmartTags(html: string, eventData: any, storeUrl?: string): string {
  if (!html) return html;
  if (!eventData && !storeUrl) return html;

  const ev = eventData || {};
  const props = ev.properties || ev;
  const raw = props.raw || ev.raw || {};

  // Smart link — first non-empty wins. Canonical fields tried FIRST so
  // future integrations work without changing this resolver.
  const link =
    props.CheckoutURL ||                   // canonical
    props.checkout_url ||                  // legacy lowercase
    props.AbandonedCheckoutURL ||
    props.ProductURL ||                    // canonical (single-product events)
    props.OrderStatusURL ||                // canonical
    raw.abandoned_checkout_url ||
    raw.recovery_url ||
    props.product_url ||
    (Array.isArray(props.Items) && props.Items[0]?.ProductURL) ||
    raw.order_status_url ||
    storeUrl ||
    '#';

  const items =
    props.Items ||
    props.line_items ||
    raw.line_items ||
    [];
  const first = Array.isArray(items) && items.length > 0 ? items[0] : null;

  const firstName = first?.ProductName || first?.title || first?.name || '';
  const firstImage = first?.ImageURL || first?.image_url || first?.product?.image?.src || '';
  const firstPrice = first?.ItemPrice ?? first?.price ?? null;

  const total = props.TotalPrice ?? props.$value ?? props.total_price ?? raw.total_price ?? null;
  const itemsCount = props.ItemCount ?? (Array.isArray(items) ? items.length : 0);

  const replacements: Record<string, string> = {
    '{{ trigger.link }}': String(link),
    '{{trigger.link}}': String(link),
    '{{ trigger.first_item_image }}': String(firstImage || ''),
    '{{trigger.first_item_image}}': String(firstImage || ''),
    '{{ trigger.first_item_name }}': String(firstName || ''),
    '{{trigger.first_item_name}}': String(firstName || ''),
    '{{ trigger.first_item_price }}': firstPrice != null ? String(firstPrice) : '',
    '{{trigger.first_item_price}}': firstPrice != null ? String(firstPrice) : '',
    '{{ trigger.total }}': total != null ? String(total) : '',
    '{{trigger.total}}': total != null ? String(total) : '',
    '{{ trigger.items_count }}': String(itemsCount),
    '{{trigger.items_count}}': String(itemsCount),
  };

  let result = html;
  for (const [tag, value] of Object.entries(replacements)) {
    // Escape regex special chars in the tag for safe global replace
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), value);
  }

  // Generic deep-path resolver for any other {{ trigger.<path> }} the
  // template might use.
  function getPath(root: any, segments: string[]): any {
    let cur: any = root;
    for (const seg of segments) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[seg];
    }
    return cur;
  }

  // Resolve a canonical whitelist path from the event data. Shared by the
  // un-prefixed ({{ CheckoutURL }}) and prefixed ({{ trigger.CheckoutURL }})
  // resolvers so both forms yield identical values.
  function resolveCanonicalPath(path: string): string | undefined {
    const segments = path
      .replace(/\[(\d+)\]/g, '.$1') // Items[0] -> Items.0
      .split('.')
      .filter(Boolean);
    let value: any = getPath(ev, segments);
    if (value === undefined || value === null) value = getPath(props, segments);
    if (value === undefined || value === null) value = getPath(raw, segments);
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'object') return undefined;
    return String(value);
  }

  // CANONICAL WHITELIST — the exact 29 paths the block editor's picker
  // (MergeTagPicker canonicalGroup) offers as un-prefixed tags. Only these
  // paths resolve WITHOUT the `trigger.` prefix; every other un-prefixed
  // `{{ something }}` is left untouched so flat contact tags like
  // {{ email }} / {{ first_name }} (resolved later by renderMergeTags from
  // mergeData) are NOT clobbered. The whitelist is PascalCase/dotted and
  // collision-free with the flat snake_case tags.
  for (const path of CANONICAL_TRIGGER_PATHS) {
    const value = resolveCanonicalPath(path);
    if (value === undefined) continue;
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match BOTH {{ Path }} and {{ trigger.Path }} (optional whitespace),
    // e.g. {{CheckoutURL}}, {{ CheckoutURL }}, {{ trigger.CheckoutURL }}.
    const re = new RegExp(`\\{\\{\\s*(?:trigger\\.)?${escapedPath}\\s*\\}\\}`, 'g');
    result = result.replace(re, value);
  }

  // Clean namespace for auto-detected / raw event fields: {{ event.<path> }}.
  // This is the CLEAN form the picker + preview now emit for every payload
  // leaf (e.g. {{ event.raw.abandoned_checkout_url }}), replacing the
  // {{ trigger.<path> }} form (which stays as an alias below).
  //
  // ⚠️ NON-CONSUMING on miss: if the path isn't present in THIS event, we
  // leave the tag intact so renderMergeTags can still resolve the curated
  // `event.*` subset that send-campaign-email flattens into mergeData
  // (e.g. {{ event.ProductName }}). Otherwise we'd empty those tags.
  result = result.replace(
    /\{\{\s*event\.([a-zA-Z0-9_.\[\]]+)\s*\}\}/g,
    (match, path: string) => {
      try {
        const segments = path
          .replace(/\[(\d+)\]/g, '.$1')
          .split('.')
          .filter(Boolean);
        let value: any = getPath(ev, segments);
        if (value === undefined || value === null) value = getPath(props, segments);
        if (value === undefined || value === null) value = getPath(raw, segments);
        if (value === undefined || value === null) return match; // deixa p/ renderMergeTags
        if (typeof value === 'object') return match;
        return String(value);
      } catch {
        return match;
      }
    }
  );

  // Legacy alias: {{ trigger.<path> }} — resolve the same deep paths so
  // every email already built with the trigger. prefix keeps working until
  // users migrate to the clean {{ event.* }} / {{ CheckoutURL }} forms.
  // Consuming on miss (historical behavior).
  result = result.replace(
    /\{\{\s*trigger\.([a-zA-Z0-9_.\[\]]+)\s*\}\}/g,
    (_match, path: string) => {
      try {
        const segments = path
          .replace(/\[(\d+)\]/g, '.$1')
          .split('.')
          .filter(Boolean);
        let value: any = getPath(ev, segments);
        if (value === undefined || value === null) value = getPath(props, segments);
        if (value === undefined || value === null) value = getPath(raw, segments);
        if (value === undefined || value === null) return '';
        if (typeof value === 'object') return '';
        return String(value);
      } catch {
        return '';
      }
    }
  );

  return result;
}

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
