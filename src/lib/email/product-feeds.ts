// =============================================
// Product feed resolution — shared library
//
// Extracted from /api/email/product-feeds/resolve so it can be called
// DIRECTLY (no internal HTTP round-trip) from the email render pipeline
// (resolveProductBlocks / resolveCartBlocks) as well as from the route.
//
// Pure data function: takes the org + feed descriptor and returns the
// resolved product list. No auth here — callers (route = session auth,
// render pipeline = trusted server context) authorize before calling.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { publicStoreHost } from '@/lib/shopify/store-url'
import { hasPlaceholderDomain } from '@/lib/stores/placeholder'
import { extractEventPayloadStoreId } from '@/lib/events'

export interface ResolveFeedOptions {
  orgId: string
  /**
   * Loja do e-mail. Produtos e links saem SÓ dela. Sem isto, o feed
   * escolhia "a loja ativa mais nova da organização" — foi assim que um
   * e-mail da Dr. Groot saiu com links da Medicube, cadastrada no dia.
   */
  storeId?: string | null
  feedId?: string | null
  feedType?: string | null
  contactId?: string | null
  maxProducts?: number
  eventData?: Record<string, any> | null
}

// Map a line item from any payload shape (pixel = lowercase, webhook =
// capitalized, raw Shopify = nested under .product/.variant).
function mapTriggerItem(it: any) {
  const imageUrl =
    it.ImageURL ||
    it.image_url ||
    it.imageUrl ||
    it.featured_image?.url ||
    it.featured_image?.src ||
    (typeof it.image === 'string' ? it.image : null) ||
    it.image?.src ||
    it.image?.url ||
    it.product?.variant_images_url ||
    it.product?.image?.src ||
    it.product?.images?.[0]?.src ||
    it.product?.images?.[0]?.url ||
    it.product?.product_image_urls?.[0] ||
    it.variant?.image?.src ||
    it.Product?.VariantImage ||
    it.Product?.Images?.[0] ||
    null
  const productUrl =
    it.ProductURL ||
    it.product_url ||
    it.productUrl ||
    it.url ||
    it.product?.product_url ||
    it.product?.url ||
    '#'
  const productId =
    it.ProductID ||
    it.product_id ||
    it.productId ||
    it.product?.id ||
    it.variant?.product?.id ||
    null
  // Variant id — needed to build the Shopify cart permalink (/cart/variant:qty)
  // for add-to-cart triggers. Covers pixel/webhook/canonical/raw shapes.
  const variantId =
    it.VariantID ||
    it.variant_id ||
    it.variantId ||
    it.variant?.id ||
    it.Variant?.id ||
    null
  return {
    product_id: productId,
    variant_id: variantId,
    title: it.ProductName || it.title || it.name || it.product?.title || 'Product',
    price: parseFloat(
      it.ItemPrice ||
      it.price ||
      it.variant?.price?.amount ||
      it.variant?.price ||
      '0'
    ),
    compare_at_price: it.CompareAtPrice
      ? parseFloat(it.CompareAtPrice)
      : it.compare_at_price
        ? parseFloat(it.compare_at_price)
        : it.compareAtPrice
          ? parseFloat(it.compareAtPrice)
          : null,
    image_url: imageUrl,
    url: productUrl,
    quantity: it.Quantity || it.quantity || 1,
    sku: it.SKU || it.sku || it.variant?.sku || null,
    variant_title: it.VariantName || it.variant_title || it.variantTitle || it.variant?.title || null,
    brand: it.Brand || it.vendor || it.product?.vendor || null,
  }
}

// -------------------------------------------------------------
// De qual loja é este e-mail?
//
// Uma organização tem VÁRIAS lojas, e cada uma tem o seu catálogo e o
// seu domínio. Tudo que este módulo devolve — produto, imagem, link —
// tem de vir de UMA loja: a do e-mail. A ordem abaixo é a das fontes
// mais confiáveis para as menos:
//
//   1. storeId explícito — a campanha (email_campaigns.store_id) ou o
//      fluxo (automations.store_id) sabe a que loja pertence.
//   2. o evento que disparou — webhooks e pixel carregam store_id.
//   3. o contato — contacts.store_id; um fluxo da organização inteira
//      ainda fala com um cliente de UMA loja.
//   4. a única loja ativa da organização — sem ambiguidade possível.
//
// Se nada disso resolve, o feed NÃO adivinha: numa organização com
// várias lojas, adivinhar é exatamente o vazamento que se quer evitar.
// -------------------------------------------------------------

export interface FeedStore {
  /** Linha de shopify_stores, ou null quando não dá para saber. */
  id: string | null
  /** Host público (domínio principal, senão *.myshopify.com), ou ''. */
  host: string
  /** De onde veio a decisão — aparece no log quando algo sai errado. */
  source: 'explicit' | 'event' | 'contact' | 'single' | 'none'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type StoreRow = { id: string; organization_id: string; shop_domain: string | null; primary_domain: string | null; is_active: boolean | null }

// Cache curto por lambda: um lote de campanha chama isto uma vez por
// contato e por bloco. Curto porque o domínio principal pode mudar.
const STORE_TTL_MS = 5 * 60_000
const storeCache = new Map<string, { at: number; row: StoreRow | null }>()

async function loadStoreRow(storeId: string): Promise<StoreRow | null> {
  const hit = storeCache.get(storeId)
  if (hit && Date.now() - hit.at < STORE_TTL_MS) return hit.row
  let row: StoreRow | null = null
  try {
    const { data } = await supabaseAdmin
      .from('shopify_stores')
      .select('id, organization_id, shop_domain, primary_domain, is_active')
      .eq('id', storeId)
      .maybeSingle()
    row = (data as StoreRow) || null
  } catch { row = null }
  // Leitura falha não entra no cache — a próxima tenta de novo.
  if (row) storeCache.set(storeId, { at: Date.now(), row })
  return row
}

/** Para os testes: esquece o que foi lido. */
export function __resetFeedStoreCache() { storeCache.clear() }

function toFeedStore(row: StoreRow | null, orgId: string, source: FeedStore['source']): FeedStore | null {
  if (!row) return null
  // Uma loja de OUTRA organização nunca serve, venha de onde vier o id.
  if (row.organization_id !== orgId) return null
  return { id: row.id, host: publicStoreHost(row), source }
}

export async function resolveFeedStore(
  orgId: string,
  storeId?: string | null,
  contactId?: string | null,
  eventData?: Record<string, any> | null
): Promise<FeedStore> {
  const none: FeedStore = { id: null, host: '', source: 'none' }
  if (!orgId) return none

  // 1. Explícito.
  if (storeId && UUID_RE.test(storeId)) {
    const found = toFeedStore(await loadStoreRow(storeId), orgId, 'explicit')
    if (found) return found
    console.warn(`[product-feeds] storeId ${storeId} não é da organização ${orgId} — ignorado`)
  }

  // 2. O evento.
  const eventStoreId = extractEventPayloadStoreId(eventData)
  if (eventStoreId) {
    const found = toFeedStore(await loadStoreRow(eventStoreId), orgId, 'event')
    if (found) return found
  }

  // 3. O contato.
  if (contactId && UUID_RE.test(contactId)) {
    try {
      const { data: contact } = await supabaseAdmin
        .from('contacts')
        .select('store_id')
        .eq('id', contactId)
        .eq('organization_id', orgId)
        .maybeSingle()
      if (contact?.store_id) {
        const found = toFeedStore(await loadStoreRow(contact.store_id), orgId, 'contact')
        if (found) return found
      }
    } catch { /* segue para o próximo */ }
  }

  // 4. A única loja ativa. Lojas "sem integração" (domínio sintético)
  // não contam: não têm catálogo nem domínio para linkar.
  try {
    const { data: stores } = await supabaseAdmin
      .from('shopify_stores')
      .select('id, organization_id, shop_domain, primary_domain, is_active')
      .eq('organization_id', orgId)
      .eq('is_active', true)
    const reais = ((stores || []) as StoreRow[]).filter((s) => !hasPlaceholderDomain(s))
    if (reais.length === 1) return { id: reais[0].id, host: publicStoreHost(reais[0]), source: 'single' }
    if (reais.length > 1) {
      console.warn(`[product-feeds] organização ${orgId} tem ${reais.length} lojas e o e-mail não diz qual é — bloco de catálogo fica vazio`)
    }
  } catch { /* sem loja */ }

  return none
}

// Map a synced shopify_products row to the feed product shape the email
// renderer expects. Catalog feeds (bestsellers/newest/etc.) read from
// shopify_products — the generic `products` table is never populated by
// the Shopify sync, which is why these feeds came back empty.
function mapCatalogProduct(p: any, shopDomain: string) {
  const imgs = Array.isArray(p.images) ? p.images : []
  const image_url = imgs.length > 0 ? (imgs[0]?.url || imgs[0]?.src || null) : null
  const url = shopDomain && p.handle ? `https://${shopDomain}/products/${p.handle}` : '#'
  return {
    product_id: p.shopify_product_id || p.id || null,
    title: p.title || 'Produto',
    price: p.price != null ? parseFloat(String(p.price)) : 0,
    compare_at_price: p.compare_at_price != null ? parseFloat(String(p.compare_at_price)) : null,
    image_url,
    url,
    quantity: 1,
    sku: p.sku || null,
    variant_title: null,
    brand: p.vendor || null,
    product_type: p.product_type || null,
  }
}

const CATALOG_COLS = 'shopify_product_id, title, handle, price, compare_at_price, images, vendor, sku, status, product_type, created_at'

// Catálogo de UMA loja. organization_id fica como segunda cerca: mesmo
// que um store_id errado chegue aqui, não atravessa organizações.
//
// Dois filtros que valem para TODO feed dinâmico:
//   hidden_from_feeds — o lojista escondeu o produto na tela de Produtos.
//   available         — a Shopify diz que não dá para comprar (esgotado
//                       sem venda permitida). NULL é "não sei" e passa.
function catalogQuery(orgId: string, storeId: string) {
  return supabaseAdmin.from('shopify_products')
    .select(CATALOG_COLS)
    .eq('organization_id', orgId)
    .eq('store_id', storeId)
    .eq('hidden_from_feeds', false)
    .or('available.is.null,available.eq.true')
}

// Fetch newest active catalog products for a store, tolerant of how the
// status was stored. Some historical syncs saved the Shopify enum verbatim
// ('ACTIVE') or left it null, so a strict .eq('status','active') silently
// returned nothing. We try the case-insensitive/null-tolerant filter first,
// and if that still yields zero we fall back to ANY product of the store so
// a recommendation block never renders empty when the catalog IS synced.
async function fetchNewestCatalog(orgId: string, storeId: string, limit: number): Promise<any[]> {
  const base = () => catalogQuery(orgId, storeId)
    .order('created_at', { ascending: false })
    .limit(limit)
  let { data } = await base().or('status.ilike.active,status.is.null')
  if (!data || data.length === 0) {
    const retry = await base()
    data = retry.data || []
  }
  return data || []
}

export async function resolveProductFeed(opts: ResolveFeedOptions): Promise<any[]> {
  const { orgId } = opts
  if (!orgId) return []
  const type = opts.feedType || 'bestsellers'
  const limit = opts.maxProducts ?? 4
  const contact_id = opts.contactId || null
  const event_data = opts.eventData || null
  const feed_id = opts.feedId || null

  // Uma loja por e-mail. Resolvida uma vez, vale para todos os ramos.
  const store = await resolveFeedStore(orgId, opts.storeId, contact_id, event_data)
  const shopDomain = store.host

  let products: any[] = []

  switch (type) {
    case 'bestsellers':
    case 'most_viewed':
    case 'newest': {
      if (!store.id) break
      const data = await fetchNewestCatalog(orgId, store.id, limit)
      products = data.map((p: any) => mapCatalogProduct(p, shopDomain))
      break
    }

    case 'random': {
      if (!store.id) break
      const { data } = await catalogQuery(orgId, store.id)
        .or('status.ilike.active,status.is.null')
        .limit(limit * 3)
      const shuffled = (data || []).map((p: any) => mapCatalogProduct(p, shopDomain)).sort(() => Math.random() - 0.5)
      products = shuffled.slice(0, limit)
      break
    }

    case 'recently_viewed': {
      if (!store.id) break
      if (contact_id) {
        try {
          const { data: events } = await supabaseAdmin.from('tracking_events')
            .select('properties')
            .eq('visitor_id', contact_id)
            .eq('event_type', 'product_viewed')
            .order('created_at', { ascending: false })
            .limit(limit)
          const productIds = (events || [])
            .map((e: any) => e.properties?.product_id)
            .filter(Boolean)
            .map((id: any) => String(id))
          if (productIds.length > 0) {
            // Só o que existe no catálogo DESTA loja: um produto visto na
            // loja irmã não entra no e-mail desta.
            const { data } = await catalogQuery(orgId, store.id)
              .in('shopify_product_id', productIds)
            products = (data || []).map((p: any) => mapCatalogProduct(p, shopDomain))
          }
        } catch {}
      }
      if (products.length === 0) {
        const data = await fetchNewestCatalog(orgId, store.id, limit)
        products = data.map((p: any) => mapCatalogProduct(p, shopDomain))
      }
      break
    }

    case 'cart_items': {
      if (contact_id) {
        try {
          const { data: recovery } = await supabaseAdmin.from('recovery_carts')
            .select('items')
            .eq('contact_id', contact_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
          if (recovery?.items && Array.isArray(recovery.items)) {
            products = recovery.items.slice(0, limit)
          }
        } catch {}
      }
      break
    }

    case 'trigger_cart': {
      const items = event_data?.Items || event_data?.line_items || event_data?.extra?.line_items || []
      products = items.slice(0, limit).map((it: any) => mapTriggerItem(it))
      break
    }

    case 'trigger_auto': {
      const eventType = String(event_data?.event_type || event_data?.type || '').toLowerCase()
      const itemsList: any[] =
        event_data?.raw?.line_items ||
        event_data?.properties?.raw?.line_items ||
        event_data?.Items ||
        event_data?.items ||
        event_data?.line_items ||
        event_data?.extra?.line_items ||
        event_data?.properties?.Items ||
        event_data?.properties?.items ||
        event_data?.properties?.line_items ||
        (event_data?.added_item ? [event_data.added_item] : null) ||
        (event_data?.properties?.added_item ? [event_data.properties.added_item] : null) ||
        (event_data?.viewed_product ? [event_data.viewed_product] : null) ||
        (event_data?.properties?.viewed_product ? [event_data.properties.viewed_product] : null) ||
        []

      if (Array.isArray(itemsList) && itemsList.length > 0) {
        products = itemsList.slice(0, limit).map((it: any, idx: number) => ({
          ...mapTriggerItem(it),
          _variant_id: String(it.VariantID || it.variant_id || it.variantId || it.id || '') || null,
          _idx: idx,
        }))
        const needEnrichment = products.filter((p: any) => p.product_id && (!p.image_url || !p.url || p.url === '#'))
        if (needEnrichment.length > 0) {
          const ids = Array.from(new Set(needEnrichment.map((p: any) => String(p.product_id))))
          try {
            // Os ids vêm do evento, então são produtos concretos; ainda
            // assim, com a loja conhecida, só a linha DELA serve — o
            // handle e o domínio do link têm de ser os dessa loja.
            let enrichQuery = supabaseAdmin
              .from('shopify_products')
              .select('shopify_product_id, title, handle, images, variants, price')
              .eq('organization_id', orgId)
              .in('shopify_product_id', ids)
            if (store.id) enrichQuery = enrichQuery.eq('store_id', store.id)
            const { data: dbProducts } = await enrichQuery
            const byId = new Map<string, any>()
            for (const dp of dbProducts || []) {
              if (dp.shopify_product_id) byId.set(String(dp.shopify_product_id), dp)
            }
            for (const p of products) {
              const pid = p.product_id ? String(p.product_id) : null
              if (!pid) continue
              const dp = byId.get(pid)
              if (!dp) continue
              if (!p.image_url) {
                const variantId = (p as any)._variant_id
                const variants: any[] = Array.isArray(dp.variants) ? dp.variants : []
                const matchedVariant = variantId
                  ? variants.find((v: any) => String(v.id) === String(variantId))
                  : null
                let pickedImage: string | null = null
                if (matchedVariant?.image_id && Array.isArray(dp.images)) {
                  const variantImg = dp.images.find((img: any) => String(img?.id) === String(matchedVariant.image_id))
                  pickedImage = variantImg?.src || variantImg?.url || null
                }
                if (!pickedImage && Array.isArray(dp.images) && dp.images.length > 0) {
                  pickedImage = dp.images[0]?.url || dp.images[0]?.src || null
                }
                if (pickedImage) p.image_url = pickedImage
              }
              if ((!p.url || p.url === '#') && shopDomain && dp.handle) {
                const variantId = (p as any)._variant_id
                p.url = variantId
                  ? `https://${shopDomain}/products/${dp.handle}?variant=${variantId}`
                  : `https://${shopDomain}/products/${dp.handle}`
              }
              if (!p.title || p.title === 'Product') {
                p.title = dp.title || p.title
              }
              if ((!p.price || p.price === 0) && dp.price) {
                p.price = parseFloat(String(dp.price))
              }
              delete (p as any)._variant_id
              delete (p as any)._idx
            }
          } catch { /* non-blocking */ }
        }
        for (const p of products) {
          delete (p as any)._variant_id
          delete (p as any)._idx
        }
      } else if (
        eventType === 'viewed_product' ||
        eventType === 'product_viewed' ||
        eventType === 'browse_abandoned' ||
        eventType === 'back_in_stock' ||
        event_data?.ProductName ||
        event_data?.product_title ||
        event_data?.properties?.product_id
      ) {
        const props = event_data?.properties || event_data || {}
        const raw = props.raw || event_data?.raw || {}
        products = [{
          id: props.ProductID || props.product_id || raw.product_id || null,
          title:
            props.ProductName ||
            props.product_title ||
            props.title ||
            raw.title ||
            'Produto',
          price: parseFloat(
            props.Price || props.price || props.ItemPrice ||
            raw.price || '0'
          ),
          compare_at_price: props.CompareAtPrice
            ? parseFloat(props.CompareAtPrice)
            : props.compare_at_price
              ? parseFloat(props.compare_at_price)
              : raw.compare_at_price
                ? parseFloat(raw.compare_at_price)
                : null,
          image_url: props.ImageURL || props.image_url || raw.image_url || null,
          url:
            props.ProductURL ||
            props.product_url ||
            raw.product_url ||
            raw.url ||
            '#',
          sku: props.SKU || props.sku || raw.sku || null,
          variant_title: props.VariantName || props.variant_title || raw.variant_title || null,
          brand: props.Brand || props.vendor || raw.vendor || null,
          description: props.Description || props.description || raw.description || null,
        }]
      }
      if (products.length === 0 && contact_id) {
        try {
          const { data: recovery } = await supabaseAdmin.from('recovery_carts')
            .select('items')
            .eq('contact_id', contact_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
          if (recovery?.items && Array.isArray(recovery.items)) {
            products = recovery.items.slice(0, limit).map((it: any) => mapTriggerItem(it))
          }
        } catch {}
      }
      break
    }

    case 'trigger_viewed_product': {
      if (event_data) {
        const props = event_data.properties || event_data
        products = [{
          title: props.ProductName || props.product_title || props.title || 'Product',
          price: parseFloat(props.Price || props.price || props.ItemPrice || '0'),
          compare_at_price: props.CompareAtPrice ? parseFloat(props.CompareAtPrice) : (props.compare_at_price ? parseFloat(props.compare_at_price) : null),
          image_url: props.ImageURL || props.image_url || null,
          url: props.ProductURL || props.product_url || '#',
          sku: props.SKU || props.sku || null,
          variant_title: props.VariantName || props.variant_title || null,
          brand: props.Brand || props.vendor || null,
        }]
      }
      break
    }

    case 'trigger_order': {
      const items = event_data?.Items || event_data?.line_items || []
      products = items.slice(0, limit).map((it: any) => mapTriggerItem(it))
      break
    }

    case 'recommendations':
    default: {
      if (!store.id) break
      const data = await fetchNewestCatalog(orgId, store.id, limit)
      products = data.map((p: any) => mapCatalogProduct(p, shopDomain))
    }
  }

  // If feed_id provided, load feed config for filters. A organização é
  // a cerca: um feed de outra org não filtra nada aqui.
  if (feed_id) {
    try {
      const { data: feed } = await supabaseAdmin.from('product_feeds')
        .select('filters').eq('id', feed_id).eq('organization_id', orgId).maybeSingle()
      if (feed && feed.filters && Array.isArray(feed.filters) && feed.filters.length > 0) {
        for (const filter of feed.filters as any[]) {
          if (filter.field === 'category' && filter.value !== 'all') {
            products = products.filter((p: any) =>
              p.product_type === filter.value || p.category === filter.value
            )
          }
        }
      }
    } catch {}
  }

  return products.slice(0, limit)
}
