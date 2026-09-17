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

import { normalizeHost, getShopDomain, absolutizeSiteUrl } from './trigger-cta';
import { CATALOG_BY_TAG, EVENT_TAGS, MERGE_TAG_CATALOG } from '@/lib/merge-tags/catalog';
import { resolveEventTag, type TagMappingIndex } from '@/lib/merge-tags/resolve';

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
    tag: 'custom.nome_do_campo',
    label: 'Campo Custom',
    category: 'custom',
    sampleValue: 'valor do campo',
    description: 'Troque nome_do_campo pelo seu campo. Defina o valor padrão clicando na variável inserida.',
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
// CANONICAL_SPEC — SINGLE SOURCE of the canonical merge-tag list.
// The 29 canonical paths the block editor's picker (MergeTagPicker
// canonicalGroup) offers as un-prefixed tags. These resolve un-prefixed
// ({{ CheckoutURL }}) AND as the legacy alias ({{ trigger.CheckoutURL }}).
// The picker imports this spec (tag === path for every entry), and
// CANONICAL_TRIGGER_PATHS below is derived from it — edit HERE only.
// =============================================
export const CANONICAL_SPEC: { tag: string; path: string; description: string; sampleValue: string }[] = [
  { tag: 'CheckoutURL', path: 'CheckoutURL', description: 'Link de recuperação do checkout.', sampleValue: 'https://loja.myshopify.com/checkouts/recover/abc123' },
  { tag: 'ProductURL', path: 'ProductURL', description: 'URL do produto.', sampleValue: 'https://loja.com/products/camiseta-premium' },
  { tag: 'OrderStatusURL', path: 'OrderStatusURL', description: 'Página de status do pedido.', sampleValue: 'https://loja.com/orders/abc123' },
  { tag: 'TotalPrice', path: 'TotalPrice', description: 'Total do checkout/pedido.', sampleValue: '199.90' },
  { tag: 'SubtotalPrice', path: 'SubtotalPrice', description: 'Subtotal antes de taxas.', sampleValue: '189.90' },
  { tag: 'Currency', path: 'Currency', description: 'Moeda (BRL, USD, GBP).', sampleValue: 'BRL' },
  { tag: 'ItemCount', path: 'ItemCount', description: 'Quantidade total de itens.', sampleValue: '3' },
  { tag: 'OrderNumber', path: 'OrderNumber', description: 'Número do pedido.', sampleValue: '1234' },
  { tag: 'OrderID', path: 'OrderID', description: 'ID do pedido.', sampleValue: '4567890' },
  { tag: 'CheckoutID', path: 'CheckoutID', description: 'ID do checkout.', sampleValue: '987654' },
  { tag: 'Customer.Email', path: 'Customer.Email', description: 'Email do cliente.', sampleValue: 'maria@email.com' },
  { tag: 'Customer.FirstName', path: 'Customer.FirstName', description: 'Primeiro nome.', sampleValue: 'Maria' },
  { tag: 'Customer.LastName', path: 'Customer.LastName', description: 'Sobrenome.', sampleValue: 'Silva' },
  { tag: 'Customer.FullName', path: 'Customer.FullName', description: 'Nome completo.', sampleValue: 'Maria Silva' },
  { tag: 'Customer.Phone', path: 'Customer.Phone', description: 'Telefone.', sampleValue: '+5531999999999' },
  { tag: 'Customer.TotalOrders', path: 'Customer.TotalOrders', description: 'Total de pedidos do cliente.', sampleValue: '5' },
  { tag: 'Customer.TotalSpent', path: 'Customer.TotalSpent', description: 'Total gasto pelo cliente.', sampleValue: '1250.00' },
  { tag: 'Items[0].ProductName', path: 'Items[0].ProductName', description: 'Nome do primeiro produto.', sampleValue: 'Camiseta Premium' },
  { tag: 'Items[0].ItemPrice', path: 'Items[0].ItemPrice', description: 'Preço do primeiro produto.', sampleValue: '89.90' },
  { tag: 'Items[0].ImageURL', path: 'Items[0].ImageURL', description: 'Imagem do primeiro produto.', sampleValue: 'https://cdn.shopify.com/produto.jpg' },
  { tag: 'Items[0].ProductURL', path: 'Items[0].ProductURL', description: 'Link do primeiro produto.', sampleValue: 'https://loja.com/products/camiseta-premium' },
  { tag: 'Items[0].Quantity', path: 'Items[0].Quantity', description: 'Quantidade do primeiro produto.', sampleValue: '1' },
  { tag: 'Items[0].CompareAtPrice', path: 'Items[0].CompareAtPrice', description: 'Preço antigo (de) do primeiro produto.', sampleValue: '99.90' },
  { tag: 'FinancialStatus', path: 'FinancialStatus', description: 'Status financeiro.', sampleValue: 'paid' },
  { tag: 'FulfillmentStatus', path: 'FulfillmentStatus', description: 'Status de envio.', sampleValue: 'fulfilled' },
  { tag: 'Tracking.Number', path: 'Tracking.Number', description: 'Código de rastreio.', sampleValue: 'BR123456789' },
  { tag: 'Tracking.URL', path: 'Tracking.URL', description: 'Link de rastreio.', sampleValue: 'https://rastreio.correios.com.br/BR123456789' },
  { tag: 'BillingAddress.City', path: 'BillingAddress.City', description: 'Cidade de cobrança.', sampleValue: 'São Paulo' },
  { tag: 'ShippingAddress.City', path: 'ShippingAddress.City', description: 'Cidade de entrega.', sampleValue: 'São Paulo' },
  { tag: 'DiscountCodes', path: 'DiscountCodes', description: 'Cupons aplicados.', sampleValue: 'BEMVINDO10' },
];

export const CANONICAL_TRIGGER_PATHS: string[] = CANONICAL_SPEC.map((s) => s.path);

// =============================================
// resolveTriggerSmartTags
// Retrocompatibilidade: substitui {{ trigger.* }} legados por valores do
// event_data. Mantido para templates antigos; o painel usa {{event.*}}.
//   - trigger.link    → CheckoutURL > AbandonedCheckoutURL >
//                       ProductURL > order_status_url > store URL
//   - trigger.first_item_*  → primeiro item de Items[] com fallbacks
//   - trigger.total / items_count → top-level e fallback bruto
// =============================================

export interface ResolveTriggerSmartTagsOptions {
  /**
   * When true, substituted VALUES are HTML-escaped (& < > " ') before being
   * interpolated. Enable at HTML call sites (send-campaign-email html half,
   * preview, test send); keep OFF for the text/plain half so the inbox
   * preview doesn't show `&amp;`. Note: hrefs stay functional because
   * render.ts's decodeHtmlEntitiesInUrl un-escapes URLs before the
   * click-tracking encoding.
   */
  escapeHtml?: boolean;
  /**
   * Mapeamento de variáveis da organização (Integrações → Mapeamento de
   * variáveis). Quando presente, o caminho configurado pelo lojista é
   * consultado ANTES da cascata padrão — é o que permite acomodar uma
   * integração que manda o link do checkout em outro campo sem tocar em
   * template nenhum. Ausente = só a cascata padrão, comportamento de
   * quem nunca abriu a tela.
   */
  mapping?: TagMappingIndex;
}

// Tiny local escape — keep this module client-safe (no server imports).
// Exported so the automation variable engine can apply the SAME escaping
// to values it substitutes into HTML email bodies (XSS parity with the
// downstream resolvers).
export function escapeHtmlValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Normalize a canonical-tag value to the string that should reach the
 * customer. SINGLE SOURCE for resolveCanonicalPath (below) AND the
 * automation variable engine's canonical-alias branch — without sharing
 * this, the engine JSON.stringify'd arrays and {{ DiscountCodes }} showed
 * `["CUPOM10"]` in automation emails/WhatsApp while previews showed
 * `CUPOM10`.
 *
 *   - array of scalars           → join(', ')            (['CUPOM10'] → 'CUPOM10')
 *   - array of { code: string }  → join the .code fields (Shopify discount shape)
 *   - other arrays / objects     → undefined (treated as a miss)
 *   - null / undefined           → undefined
 *   - scalar                     → String(value)
 */
export function normalizeCanonicalValue(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    const scalars = value.filter((v) => v !== null && v !== undefined);
    if (scalars.every((v) => typeof v !== 'object')) {
      return scalars.map((v) => String(v)).join(', ');
    }
    if (scalars.length > 0 && scalars.every((v) => typeof v === 'object' && typeof (v as any).code === 'string')) {
      return scalars.map((v) => String((v as any).code)).join(', ');
    }
    return undefined;
  }
  if (typeof value === 'object') return undefined;
  return String(value);
}

// The 6 "smart" trigger tags with multi-source fallback chains. Exported
// so the variable engine can whitelist them by name.
export const SMART_TRIGGER_TAG_NAMES = [
  'trigger.link',
  'trigger.first_item_image',
  'trigger.first_item_name',
  'trigger.first_item_price',
  'trigger.total',
  'trigger.items_count',
] as const;

/**
 * Compute the value of one of the 6 smart trigger tags from an event
 * payload. SINGLE SOURCE for resolveTriggerSmartTags (email pipeline)
 * AND the automation variable engine (WhatsApp/SMS channels) — the exact
 * fallback chains (CheckoutURL > checkout_url > AbandonedCheckoutURL >
 * ProductURL > ... for trigger.link, etc.) live only here.
 *
 * Returns undefined on a genuine miss so each caller can apply its own
 * channel default (email: storeUrl/'#'/'' — engine: non-consuming or '').
 */
export function computeSmartTagValue(eventData: any, name: string): string | undefined {
  const ev = eventData || {};
  const props = ev.properties || ev;
  const raw = props.raw || ev.raw || {};

  const items = props.Items || props.line_items || raw.line_items || [];
  const first = Array.isArray(items) && items.length > 0 ? items[0] : null;

  switch (name) {
    case 'trigger.link': {
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
        '';
      return link ? String(link) : undefined;
    }
    case 'trigger.first_item_image': {
      const v = first?.ImageURL || first?.image_url || first?.product?.image?.src || '';
      return v ? String(v) : undefined;
    }
    case 'trigger.first_item_name': {
      const v = first?.ProductName || first?.title || first?.name || '';
      return v ? String(v) : undefined;
    }
    case 'trigger.first_item_price': {
      const v = first?.ItemPrice ?? first?.price ?? null;
      return v != null ? String(v) : undefined;
    }
    case 'trigger.total': {
      const v = props.TotalPrice ?? props.$value ?? props.total_price ?? raw.total_price ?? null;
      return v != null ? String(v) : undefined;
    }
    case 'trigger.items_count': {
      if (props.ItemCount != null) return String(props.ItemCount);
      const arr = props.Items || props.line_items || raw.line_items;
      return Array.isArray(arr) ? String(arr.length) : undefined;
    }
    default:
      return undefined;
  }
}

export function resolveTriggerSmartTags(
  html: string,
  eventData: any,
  storeUrl?: string,
  options?: ResolveTriggerSmartTagsOptions
): string {
  if (!html) return html;
  if (!eventData && !storeUrl) return html;

  const esc = options?.escapeHtml
    ? (v: string) => escapeHtmlValue(v)
    : (v: string) => v;

  const ev = eventData || {};
  const props = ev.properties || ev;
  const raw = props.raw || ev.raw || {};

  // Store host for absolutizing SITE-RELATIVE urls (e.g. ProductURL that came
  // through as "/products/<handle>"). Prefer the explicit storeUrl passed by
  // the caller (resolved from shopify_stores.shop_domain), else derive it from
  // the event payload. Without a host, values are left untouched.
  const shopHost = normalizeHost(storeUrl) || getShopDomain(eventData);
  const isUrlLeaf = (path: string) => /url$/i.test(path.split(/[.\[]/).filter(Boolean).pop() || '');

  // Smart values come from computeSmartTagValue (single source shared with
  // the automation variable engine). This resolver applies the email-channel
  // defaults on a miss: link falls back to the store URL / '#', counts to
  // '0', everything else to '' (historical consuming behavior).
  const link = absolutizeSiteUrl(
    computeSmartTagValue(eventData, 'trigger.link') ?? (storeUrl || '#'),
    shopHost
  );
  const firstImage = computeSmartTagValue(eventData, 'trigger.first_item_image') ?? '';
  const firstName = computeSmartTagValue(eventData, 'trigger.first_item_name') ?? '';
  const firstPrice = computeSmartTagValue(eventData, 'trigger.first_item_price') ?? '';
  const total = computeSmartTagValue(eventData, 'trigger.total') ?? '';
  const itemsCount = computeSmartTagValue(eventData, 'trigger.items_count') ?? '0';

  // Smart-tag map — whitespace-tolerant regexes ({{trigger.link}},
  // {{ trigger.link }}, {{  trigger.link  }} all match) and FUNCTION
  // replacers so `$` sequences in values ($&, $1, prices like R$ 10)
  // never get interpreted as regex replacement patterns.
  const smartReplacements: Array<[RegExp, string]> = [
    [/\{\{\s*trigger\.link\s*\}\}/g, String(link)],
    [/\{\{\s*trigger\.first_item_image\s*\}\}/g, firstImage],
    [/\{\{\s*trigger\.first_item_name\s*\}\}/g, firstName],
    [/\{\{\s*trigger\.first_item_price\s*\}\}/g, firstPrice],
    [/\{\{\s*trigger\.total\s*\}\}/g, total],
    [/\{\{\s*trigger\.items_count\s*\}\}/g, itemsCount],
  ];

  let result = html;
  for (const [re, value] of smartReplacements) {
    result = result.replace(re, () => esc(value));
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

  // Case-tolerant variant: when an exact segment lookup misses, retry the
  // segment with a case-insensitive key scan (legacy payloads say OrderId
  // while the canonical spec says OrderID).
  function getPathCI(root: any, segments: string[]): any {
    let cur: any = root;
    for (const seg of segments) {
      if (cur === null || cur === undefined) return undefined;
      let next = cur[seg];
      if (next === undefined && typeof cur === 'object') {
        const lower = seg.toLowerCase();
        const key = Object.keys(cur).find((k) => k.toLowerCase() === lower);
        if (key !== undefined) next = cur[key];
      }
      cur = next;
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
    // Exact miss → retry case-insensitively (OrderID vs OrderId etc.)
    if (value === undefined || value === null) value = getPathCI(ev, segments);
    if (value === undefined || value === null) value = getPathCI(props, segments);
    if (value === undefined || value === null) value = getPathCI(raw, segments);
    // Array of scalars → human-readable join (fixes {{ DiscountCodes }}
    // when codes come as ['CUPOM10']). Shopify also ships discount codes
    // as [{ code, amount, type }] — join the .code fields in that case.
    // Shared with the variable engine via normalizeCanonicalValue so the
    // channels can't drift.
    return normalizeCanonicalValue(value);
  }

  // CANONICAL WHITELIST — the exact 29 paths the block editor's picker
  // (MergeTagPicker canonicalGroup) offers as un-prefixed tags. Only these
  // paths resolve WITHOUT the `trigger.` prefix; every other un-prefixed
  // `{{ something }}` is left untouched so flat contact tags like
  // {{ email }} / {{ first_name }} (resolved later by renderMergeTags from
  // mergeData) are NOT clobbered. The whitelist is PascalCase/dotted and
  // collision-free with the flat snake_case tags.
  // União da whitelist histórica com o catálogo novo: nenhum template
  // existente pode parar de resolver por causa da reorganização, e as
  // variáveis novas (SKU, variante, transportadora) passam a valer.
  const resolvablePaths = Array.from(
    new Set([...CANONICAL_TRIGGER_PATHS, ...EVENT_TAGS.map((t) => t.tag)])
  );

  for (const path of resolvablePaths) {
    // Quando o catálogo conhece a variável, quem resolve é o motor com
    // mapeamento — assim o caminho configurado pelo lojista vale aqui,
    // no envio de verdade, e não só na tela de mapeamento.
    let value = CATALOG_BY_TAG.has(path)
      ? resolveEventTag(path, ev, options?.mapping).value
      : resolveCanonicalPath(path);
    // Absolutize URL-typed canonical tags (…URL) so a relative "/products/x"
    // becomes "https://<store>/products/x" instead of hitting the app domain.
    if (value !== undefined && isUrlLeaf(path)) value = absolutizeSiteUrl(value, shopHost);
    const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match BOTH {{ Path }} and {{ trigger.Path }} (optional whitespace),
    // with an optional |fallback group, e.g. {{CheckoutURL}},
    // {{ CheckoutURL }}, {{ trigger.CheckoutURL }}, {{ CheckoutURL | https://loja.com }}.
    const re = new RegExp(`\\{\\{\\s*(?:trigger\\.)?${escapedPath}\\s*(?:\\|([^}]*))?\\}\\}`, 'g');
    result = result.replace(re, (match, fallback?: string) => {
      if (value !== undefined) return esc(value);
      if (fallback !== undefined) return esc(fallback.trim());
      return match; // no value + no fallback → leave intact
    });
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
        // Absolutize a site-relative value (e.g. {{ event.ProductURL }} =
        // "/products/<handle>") so the link points at the store, not the app.
        return esc(absolutizeSiteUrl(String(value), shopHost));
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
        return esc(absolutizeSiteUrl(String(value), shopHost));
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
  // Canonical un-prefixed tags ({{ CheckoutURL }}, {{ Customer.Email }}, ...)
  // so test sends / previews resolve them like real sends do.
  for (const spec of CANONICAL_SPEC) {
    data[spec.tag] = spec.sampleValue;
  }
  // Catálogo novo — inclui as variáveis que a lista canônica antiga não
  // tinha (SKU, variante, transportadora). Sem isto, a pré-visualização
  // mostraria a tag literal para elas enquanto o envio real resolve.
  for (const spec of MERGE_TAG_CATALOG) {
    if (!(spec.tag in data)) data[spec.tag] = spec.sample;
  }
  return data;
}
