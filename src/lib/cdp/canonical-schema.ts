// =============================================
// WORDER CANONICAL EVENT SCHEMA
//
// THE source-of-truth shape every event in the system flows through.
// Integrations (Shopify webhook, Shopify pixel, storefront tracker,
// Yampi, WooCommerce, manual API) all normalize their incoming
// payloads to THIS shape via `normalizeToCanonical()`.
//
// Why a canonical layer?
//   - Templates use stable merge tag names: {{ CheckoutURL }} always
//     resolves to the recovery URL whether the source is Shopify or
//     Yampi. Renaming a field in one integration doesn't break every
//     downstream template.
//   - Internal blocks (Produtos do Gatilho, Resumo do Pedido, etc.)
//     read from canonical paths. New integrations are plug-and-play.
//   - Event log and metrics dashboards aggregate identically across
//     platforms.
//   - WhatsApp / SMS / Email all use the same merge-tag dictionary.
//
// Conventions:
//   - Top-level fields use PascalCase (Klaviyo/Omnisend convention,
//     same look-and-feel merchants are used to).
//   - Nested customer/items/addresses use the same case for consistency.
//   - Original integration payload is preserved on `raw` so flow
//     templates can still reach into source-specific fields when needed
//     via `{{ trigger.raw.<path> }}`.
//
// To add a new integration:
//   1. Write a normalizer function returning WorderCanonicalEvent
//   2. Call it in your webhook/handler before createEvent()
//   3. Done — every existing block, template, automation, metric works
// =============================================

export interface WorderCanonicalAddress {
  FirstName?: string | null;
  LastName?: string | null;
  Name?: string | null;             // Full name when only one field provided
  Address1?: string | null;
  Address2?: string | null;
  City?: string | null;
  Province?: string | null;         // State/region
  ProvinceCode?: string | null;
  Country?: string | null;
  CountryCode?: string | null;
  Zip?: string | null;
  Phone?: string | null;
}

export interface WorderCanonicalCustomer {
  ID?: string | null;               // Source-specific customer id (Shopify customer id, etc.)
  Email?: string | null;
  Phone?: string | null;
  FirstName?: string | null;
  LastName?: string | null;
  FullName?: string | null;
  AcceptsMarketing?: boolean;
  AcceptsSmsMarketing?: boolean;
  TotalOrders?: number;
  TotalSpent?: number;              // In the customer's currency
  Tags?: string[];
  Locale?: string | null;
  // Last-known addresses for quick-fill in templates
  DefaultAddress?: WorderCanonicalAddress | null;
}

export interface WorderCanonicalItem {
  ProductID: string;
  VariantID?: string | null;
  ProductName: string;
  VariantName?: string | null;
  SKU?: string | null;
  Quantity: number;
  ItemPrice: number;                // Per-unit price
  RowTotal: number;                 // ItemPrice * Quantity
  CompareAtPrice?: number | null;   // For "old price" strikethrough
  ImageURL?: string | null;         // Best image — variant if available, else product
  ProductURL?: string | null;
  Brand?: string | null;            // Vendor
  ProductType?: string | null;
  Categories?: string[];            // Collection / category names
  Tags?: string[];
  Description?: string | null;      // Plain text (HTML stripped)
  // Optional rich product object — sized for templates that want
  // additional images, full HTML body, etc. Optional because some
  // integrations don't provide these fields.
  Product?: {
    Description?: string | null;
    BodyHTML?: string | null;
    Tags?: string[];
    Collections?: { id: string; title: string }[];
    Images?: string[];
    VariantImage?: string | null;
  };
}

export interface WorderCanonicalEvent {
  // Core identifiers
  EventType: string;                // canonical event name (see WorderCanonicalEventType)
  OccurredAt: string;               // ISO 8601
  Source: string;                   // 'shopify_pixel' | 'shopify_webhook' | 'yampi' | 'woocommerce' | 'manual_api' | etc.
  SourceEventID?: string | null;

  // Resource identifiers (what this event is about)
  CheckoutID?: string | null;       // Shopify checkout id, Yampi cart id, etc.
  CartToken?: string | null;
  OrderID?: string | null;
  OrderNumber?: string | null;
  ProductID?: string | null;        // For viewed_product / added_to_cart events

  // Money (always present even if zero)
  Currency: string;
  TotalPrice?: number;
  SubtotalPrice?: number;
  TotalTax?: number;
  TotalDiscounts?: number;
  TotalShipping?: number;

  // URLs (THE canonical names — templates reference these directly)
  CheckoutURL?: string | null;      // Recovery URL for abandoned checkouts
  ProductURL?: string | null;       // For single-product events
  OrderStatusURL?: string | null;
  StoreURL?: string | null;

  // Counts
  ItemCount?: number;

  // Items (always an array — empty for non-cart events)
  Items: WorderCanonicalItem[];

  // Customer
  Customer?: WorderCanonicalCustomer | null;

  // Addresses
  BillingAddress?: WorderCanonicalAddress | null;
  ShippingAddress?: WorderCanonicalAddress | null;

  // Marketing context
  Source_Name?: string | null;      // Shopify source_name (web, pos, mobile_app)
  ReferringSite?: string | null;
  LandingSite?: string | null;
  CustomerLocale?: string | null;
  UTM?: Record<string, string>;
  ClickIDs?: Record<string, string>;

  // Discounts
  DiscountCodes?: string[];

  // Status (orders / refunds)
  FinancialStatus?: string | null;
  FulfillmentStatus?: string | null;
  PaymentGateway?: string | null;
  Tracking?: { Number?: string | null; URL?: string | null; Company?: string | null } | null;

  // Original payload for power-user templates ({{ trigger.raw.<path> }})
  raw?: Record<string, any>;
  // Top-level Klaviyo aliases preserved on the event for back-compat —
  // older templates wrote `{{trigger.Items[0].ProductName}}` against
  // pre-canonical events, and we want them to keep working.
  // (These are populated by the normalizer too.)
}

// Canonical event type names. Source-specific names map to one of these.
export type WorderCanonicalEventType =
  | 'viewed_product'
  | 'added_to_cart'
  | 'removed_from_cart'
  | 'cart_viewed'
  | 'checkout_started'
  | 'checkout_completed'
  | 'placed_order'
  | 'order_paid'
  | 'order_fulfilled'
  | 'order_cancelled'
  | 'order_refunded'
  | 'subscribed_email'
  | 'subscribed_sms'
  | 'unsubscribed_email'
  | 'page_viewed'
  | 'submitted_search'
  | 'identified'
  | 'form_submitted'
  | 'back_in_stock'
  | 'pixel_loaded'
  | 'active_on_site';

// Mapping table: integration-specific event names → canonical name.
// Add new integrations here as they're built.
export const EVENT_TYPE_MAP: Record<string, WorderCanonicalEventType> = {
  // Shopify pixel
  product_viewed: 'viewed_product',
  product_added_to_cart: 'added_to_cart',
  product_removed_from_cart: 'removed_from_cart',
  cart_viewed: 'cart_viewed',
  checkout_started: 'checkout_started',
  checkout_completed: 'checkout_completed',
  // Shopify webhook
  'orders/create': 'placed_order',
  'orders/paid': 'order_paid',
  'orders/fulfilled': 'order_fulfilled',
  'orders/cancelled': 'order_cancelled',
  'refunds/create': 'order_refunded',
  'checkouts/create': 'checkout_started',
  'checkouts/update': 'checkout_started',
  // Klaviyo / Omnisend conventions (in case we ingest from those)
  'Started Checkout': 'checkout_started',
  'Placed Order': 'placed_order',
  'Viewed Product': 'viewed_product',
  'Added to Cart': 'added_to_cart',
};

// The set of "stable" merge tags merchants can use in any template
// regardless of which integration produced the event. Each maps to a
// path inside WorderCanonicalEvent. Future integrations don't change
// this list — they just feed canonical events.
export interface CanonicalMergeTagSpec {
  tag: string;             // The tag merchants type, e.g. "{{ CheckoutURL }}"
  path: string;            // Lodash-style path into the canonical event
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'currency' | 'url';
  description: string;
  example?: string;
}

export const CANONICAL_MERGE_TAGS: CanonicalMergeTagSpec[] = [
  // URLs
  { tag: 'CheckoutURL', path: 'CheckoutURL', type: 'url', description: 'Link de recuperação do checkout abandonado.' },
  { tag: 'ProductURL', path: 'ProductURL', type: 'url', description: 'URL do produto (eventos de produto único).' },
  { tag: 'OrderStatusURL', path: 'OrderStatusURL', type: 'url', description: 'Página de status do pedido.' },
  { tag: 'StoreURL', path: 'StoreURL', type: 'url', description: 'URL da loja.' },

  // Money
  { tag: 'TotalPrice', path: 'TotalPrice', type: 'currency', description: 'Total do checkout/carrinho/pedido.' },
  { tag: 'SubtotalPrice', path: 'SubtotalPrice', type: 'currency', description: 'Subtotal antes de taxas e frete.' },
  { tag: 'TotalTax', path: 'TotalTax', type: 'currency', description: 'Impostos totais.' },
  { tag: 'TotalDiscounts', path: 'TotalDiscounts', type: 'currency', description: 'Descontos aplicados.' },
  { tag: 'TotalShipping', path: 'TotalShipping', type: 'currency', description: 'Frete total.' },
  { tag: 'Currency', path: 'Currency', type: 'string', description: 'Moeda (BRL, USD, GBP, etc.).' },

  // Counts
  { tag: 'ItemCount', path: 'ItemCount', type: 'number', description: 'Quantidade total de itens.' },

  // Identifiers
  { tag: 'OrderNumber', path: 'OrderNumber', type: 'string', description: 'Número do pedido.' },
  { tag: 'OrderID', path: 'OrderID', type: 'string', description: 'ID do pedido.' },
  { tag: 'CheckoutID', path: 'CheckoutID', type: 'string', description: 'ID do checkout.' },

  // Customer
  { tag: 'Customer.Email', path: 'Customer.Email', type: 'string', description: 'Email do cliente.' },
  { tag: 'Customer.FirstName', path: 'Customer.FirstName', type: 'string', description: 'Primeiro nome.' },
  { tag: 'Customer.LastName', path: 'Customer.LastName', type: 'string', description: 'Sobrenome.' },
  { tag: 'Customer.FullName', path: 'Customer.FullName', type: 'string', description: 'Nome completo.' },
  { tag: 'Customer.Phone', path: 'Customer.Phone', type: 'string', description: 'Telefone.' },
  { tag: 'Customer.TotalOrders', path: 'Customer.TotalOrders', type: 'number', description: 'Total de pedidos.' },
  { tag: 'Customer.TotalSpent', path: 'Customer.TotalSpent', type: 'currency', description: 'Total gasto pelo cliente.' },

  // First item shortcuts (most common cart-recovery use case)
  { tag: 'Items[0].ProductName', path: 'Items[0].ProductName', type: 'string', description: 'Nome do primeiro produto.' },
  { tag: 'Items[0].ItemPrice', path: 'Items[0].ItemPrice', type: 'currency', description: 'Preço do primeiro produto.' },
  { tag: 'Items[0].ImageURL', path: 'Items[0].ImageURL', type: 'url', description: 'Imagem do primeiro produto.' },
  { tag: 'Items[0].ProductURL', path: 'Items[0].ProductURL', type: 'url', description: 'Link do primeiro produto.' },
  { tag: 'Items[0].Quantity', path: 'Items[0].Quantity', type: 'number', description: 'Quantidade do primeiro produto.' },

  // Status
  { tag: 'FinancialStatus', path: 'FinancialStatus', type: 'string', description: 'Status financeiro (paid/pending/refunded).' },
  { tag: 'FulfillmentStatus', path: 'FulfillmentStatus', type: 'string', description: 'Status de envio.' },
  { tag: 'Tracking.Number', path: 'Tracking.Number', type: 'string', description: 'Código de rastreio.' },
  { tag: 'Tracking.URL', path: 'Tracking.URL', type: 'url', description: 'Link de rastreio.' },

  // Address
  { tag: 'BillingAddress.City', path: 'BillingAddress.City', type: 'string', description: 'Cidade de cobrança.' },
  { tag: 'BillingAddress.Country', path: 'BillingAddress.Country', type: 'string', description: 'País de cobrança.' },
  { tag: 'ShippingAddress.City', path: 'ShippingAddress.City', type: 'string', description: 'Cidade de entrega.' },

  // Discount
  { tag: 'DiscountCodes', path: 'DiscountCodes', type: 'array', description: 'Cupons aplicados.' },
];
