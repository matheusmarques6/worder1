// =============================================
// Trigger-aware CTA link resolution for the "Produtos do Gatilho"
// (abandoned-cart) email block.
//
// The button link should adapt to the automation's trigger — like Omnisend:
//   - checkout abandoned  → checkout recovery URL
//   - add to cart / cart  → cart permalink with the items (/cart/variant:qty),
//                            which Shopify turns into a pre-filled cart/checkout
//   - viewed / browse / back-in-stock → the product page URL
//   - order (paid/fulfilled/...) → order status URL
// Always with a universal fallback cascade (checkout → cart → product → store)
// so the button is NEVER broken.
//
// Pure + dependency-free so it's unit-testable and safe to call from the
// render pipeline.
// =============================================

export type TriggerFamily = 'checkout' | 'cart' | 'product' | 'order' | 'generic'

/** Classify any trigger-type identifier into a link "family". */
export function triggerFamily(triggerType?: string | null): TriggerFamily {
  const t = String(triggerType || '').toLowerCase()
  if (!t) return 'generic'
  // checkout wins even though the id also contains "abandon"
  if (t.includes('checkout')) return 'checkout'
  // Pending-payment abandon (pix/boleto/card) → the shopper must pay the
  // EXISTING order, not start a fresh cart. Route to checkout recovery,
  // before the generic "abandon → cart" rule below.
  if (t.includes('payment') || t.includes('pix') || t.includes('boleto')) return 'checkout'
  // browse/view/back-in-stock BEFORE the generic "abandon" (browse_abandoned)
  if (
    t.includes('browse') ||
    t.includes('viewed_product') ||
    t.includes('view_product') ||
    t.includes('product_view') ||
    t.includes('back_in_stock')
  ) {
    return 'product'
  }
  if (t.includes('order') || t.includes('placed') || t.includes('fulfilled') || t.includes('paid')) {
    return 'order'
  }
  if (t.includes('cart') || t.includes('abandon')) return 'cart'
  if (t.includes('product') || t.includes('view')) return 'product'
  return 'generic'
}

/** Human label for the auto-resolved link, shown in the editor panel. */
export function triggerCtaLabel(triggerType?: string | null): string {
  switch (triggerFamily(triggerType)) {
    case 'checkout': return 'Recuperação de checkout'
    case 'cart': return 'Carrinho com os itens (checkout)'
    case 'product': return 'Página do produto'
    case 'order': return 'Status do pedido'
    default: return 'Melhor link disponível'
  }
}

/** Normalize a domain/URL into `https://host` (no path, no trailing slash). */
export function normalizeHost(input?: string | null): string {
  if (!input) return ''
  let s = String(input).trim()
  if (!s) return ''
  s = s.replace(/^https?:\/\//i, '') // strip protocol
  s = s.split(/[/?#]/)[0]            // host only
  s = s.replace(/\/+$/, '')
  if (!s) return ''
  return `https://${s}`
}

/** Extract `https://host` from a full URL, if any. */
export function hostFromUrl(url?: string | null): string {
  if (!url) return ''
  const s = String(url)
  if (!/^https?:\/\//i.test(s)) return ''
  return normalizeHost(s)
}

/**
 * Build a Shopify cart permalink from line items with variant ids:
 *   https://{host}/cart/{variantId}:{qty},{variantId}:{qty}
 * Shopify adds the items to the cart (and can advance to checkout). Items
 * without a numeric variant id are skipped; returns '' when none qualify.
 */
export function buildCartPermalink(
  shopDomain: string | null | undefined,
  items?: Array<{ variant_id?: any; quantity?: any }> | null
): string {
  const host = normalizeHost(shopDomain)
  if (!host) return ''
  const parts = (items || [])
    .map((it) => {
      const vid = String(it?.variant_id ?? '').replace(/[^0-9]/g, '')
      const qN = parseInt(String(it?.quantity ?? 1), 10)
      const qty = Number.isFinite(qN) && qN > 0 ? qN : 1
      return vid ? `${vid}:${qty}` : ''
    })
    .filter(Boolean)
  if (!parts.length) return ''
  return `${host}/cart/${parts.join(',')}`
}

/** Derive the store's `https://host` from any event payload shape. */
export function getShopDomain(eventData?: Record<string, any> | null): string {
  const ev: any = eventData || {}
  const props: any = ev.properties || ev
  const raw: any = props.raw || ev.raw || {}
  const direct =
    raw.shop_domain ||
    raw.myshopify_domain ||
    raw.domain ||
    props.shop_domain ||
    props.store_domain ||
    ev.shop_domain ||
    ''
  if (direct) return normalizeHost(String(direct))
  // else pull the host out of any URL we have
  return hostFromUrl(
    props.StoreURL ||
      props.store_url ||
      props.CheckoutURL ||
      props.checkout_url ||
      props.AbandonedCheckoutURL ||
      props.ProductURL ||
      raw.abandoned_checkout_url ||
      raw.recovery_url ||
      raw.order_status_url ||
      raw.landing_site ||
      raw.referring_site ||
      ''
  )
}

export interface CtaInput {
  triggerType?: string | null
  family?: TriggerFamily
  /** Recovery/checkout URL already resolved by the render layer, if any. */
  eventCheckoutUrl?: string | null
  shopDomain?: string | null
  /** Cart items (with variant_id + quantity) for the cart permalink. */
  items?: Array<{ variant_id?: any; quantity?: any }> | null
  /** Per-product URL (used for the product family / per-card links). */
  productUrl?: string | null
  orderStatusUrl?: string | null
}

/**
 * Resolve the correct CTA URL for a trigger. Chooses a primary by family,
 * then falls back through checkout → cart → product → order → store home so
 * the button always lands somewhere useful.
 */
export function resolveTriggerCtaUrl(input: CtaInput): string {
  const fam = input.family || triggerFamily(input.triggerType)
  const checkout = (input.eventCheckoutUrl || '').trim()
  const cart = buildCartPermalink(input.shopDomain, input.items)
  const product = input.productUrl && input.productUrl !== '#' ? String(input.productUrl).trim() : ''
  const order = (input.orderStatusUrl || '').trim()
  const home = normalizeHost(input.shopDomain)

  let primary = ''
  switch (fam) {
    case 'checkout': primary = checkout || cart; break
    case 'cart': primary = cart || checkout; break
    case 'product': primary = product || checkout || cart; break
    case 'order': primary = order || checkout; break
    default: primary = checkout || cart || product
  }
  // Universal fallback so the button is never dead.
  return primary || checkout || cart || product || order || home || ''
}

// Placeholders that mean "auto" (older blocks defaulted to these) — they are
// treated as NOT a manual override so the trigger-aware link applies.
const AUTO_PLACEHOLDERS = new Set([
  '',
  '{{ trigger.link }}',
  '{{trigger.link}}',
  '{{ checkout_url }}',
  '{{checkout_url}}',
  '{{ CheckoutURL }}',
  '{{CheckoutURL}}',
])

/** True when buttonHref is a real, user-set custom link (not an auto placeholder). */
export function isManualCtaOverride(buttonHref?: string | null): boolean {
  if (!buttonHref) return false
  return !AUTO_PLACEHOLDERS.has(String(buttonHref).trim())
}
