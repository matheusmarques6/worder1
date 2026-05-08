// =============================================
// WORDER: Email Merge Tags
// /src/lib/email/merge-tags.ts
//
// 15 merge tags in 4 categories with PT-BR labels.
// =============================================

export interface MergeTag {
  tag: string;
  label: string;
  category: 'contact' | 'order' | 'store' | 'cart' | 'trigger';
  sampleValue: string;
  description?: string;
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

  // Trigger tags — adapt based on whatever event fired the email.
  // The renderer resolves these via resolveTriggerSmartTags() against
  // the active event_data, so the same template works for any trigger.
  {
    tag: 'trigger.link',
    label: 'Link do Gatilho',
    category: 'trigger',
    sampleValue: 'https://minhaloja.com.br/checkouts/recover/abc123',
    description:
      'Resolve para a URL mais relevante do evento: recuperação de checkout para abandono, página do produto para browse/back-in-stock, status do pedido para purchase.',
  },
  {
    tag: 'trigger.first_item_image',
    label: 'Imagem do 1º Item',
    category: 'trigger',
    sampleValue: 'https://cdn.shopify.com/.../product.jpg',
  },
  {
    tag: 'trigger.first_item_name',
    label: 'Nome do 1º Item',
    category: 'trigger',
    sampleValue: 'Camiseta Premium Black',
  },
  {
    tag: 'trigger.first_item_price',
    label: 'Preço do 1º Item',
    category: 'trigger',
    sampleValue: 'R$ 99,90',
  },
  {
    tag: 'trigger.total',
    label: 'Total do Gatilho',
    category: 'trigger',
    sampleValue: 'R$ 199,90',
  },
  {
    tag: 'trigger.items_count',
    label: 'Itens do Gatilho',
    category: 'trigger',
    sampleValue: '2',
  },
];

export const MERGE_TAG_CATEGORIES = [
  { key: 'contact', label: 'Contato' },
  { key: 'order', label: 'Pedido' },
  { key: 'store', label: 'Loja' },
  { key: 'cart', label: 'Carrinho' },
  { key: 'trigger', label: 'Gatilho (Adapta)' },
] as const;

// =============================================
// resolveTriggerSmartTags
// Replaces {{ trigger.* }} placeholders with values pulled from the
// active event_data. Smart resolution priority:
//   - trigger.link    → CheckoutURL > AbandonedCheckoutURL >
//                       ProductURL > order_status_url > store URL
//   - trigger.first_item_*  → first item from Items[] with all fallbacks
//   - trigger.total / items_count → top-level then raw fallback
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
  // template might use. Powered by lodash get against the event_data
  // root so {{ trigger.raw.customer.first_name }}, {{ trigger.Items[0].sku }},
  // {{ trigger.OrderId }} all resolve. Falls back to '' for missing
  // paths so unknown vars don't show as literals.
  // Hand-rolled lodash-style get to avoid bundling lodash here
  function getPath(root: any, segments: string[]): any {
    let cur: any = root;
    for (const seg of segments) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[seg];
    }
    return cur;
  }

  result = result.replace(
    /\{\{\s*trigger\.([a-zA-Z0-9_.\[\]]+)\s*\}\}/g,
    (_match, path: string) => {
      try {
        // Normalize "Items[0].sku" → ["Items", "0", "sku"] so lodash-style
        // walk handles array indices uniformly.
        const segments = path
          .replace(/\[(\d+)\]/g, '.$1')
          .split('.')
          .filter(Boolean);
        // Three lookup attempts (most → least common shape):
        //   1. event_data.<path>                 (flat shape)
        //   2. event_data.properties.<path>      (CDP shape — most events)
        //   3. event_data.properties.raw.<path>  (full Shopify payload)
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
