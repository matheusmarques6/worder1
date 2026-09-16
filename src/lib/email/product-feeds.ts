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
function catalogQuery(orgId: string, storeId: string, excluded?: Set<string>) {
  let q = supabaseAdmin.from('shopify_products')
    .select(CATALOG_COLS)
    .eq('organization_id', orgId)
    .eq('store_id', storeId)
    .eq('hidden_from_feeds', false)
    .or('available.is.null,available.eq.true')
  // Exclusão POR FEED: feita no banco, não depois — assim o `limit` continua
  // devolvendo a quantidade pedida em vez de um feed com buracos.
  const ids = safeIdList(excluded)
  if (ids) q = q.not('shopify_product_id', 'in', ids)
  return q
}

/**
 * Lista de ids para o filtro `in` do PostgREST — só dígitos e traços passam,
 * então nada do que vem do banco vira sintaxe de filtro.
 */
export function safeIdList(excluded?: Set<string> | null): string | null {
  if (!excluded || excluded.size === 0) return null
  const ids = Array.from(excluded)
    .map((v) => String(v).trim())
    .filter((v) => /^[A-Za-z0-9_-]+$/.test(v))
  if (!ids.length) return null
  return `(${ids.map((v) => `"${v}"`).join(',')})`
}

/**
 * O produto está na lista de excluídos do feed?
 *
 * Aceita os vários nomes de id porque nem todo ramo passa pelos mappers:
 * `cart_items` devolve os itens do carrinho salvo como estão, e ali o id
 * pode vir do pixel (`ProductID`), do webhook (`product_id`) ou do canônico.
 */
export function isExcluded(p: any, excluded: Set<string>): boolean {
  if (excluded.size === 0 || !p) return false
  const id =
    p.product_id ??
    p.shopify_product_id ??
    p.ProductID ??
    p.productId ??
    p.product?.id ??
    p.id
  return id != null && excluded.has(String(id))
}

// Fetch newest active catalog products for a store, tolerant of how the
// status was stored. Some historical syncs saved the Shopify enum verbatim
// ('ACTIVE') or left it null, so a strict .eq('status','active') silently
// returned nothing. We try the case-insensitive/null-tolerant filter first,
// and if that still yields zero we fall back to ANY product of the store so
// a recommendation block never renders empty when the catalog IS synced.
/**
 * A janela de tempo do feed, em dias. `3d`/`7d`/`30d`/`90d` é o que a
 * tela oferece; qualquer outra coisa vira 90 dias, que é o horizonte
 * mais largo que ela deixa escolher.
 */
function janelaEmDias(timePeriod?: string | null): number {
  const m = String(timePeriod || '').trim().match(/^(\d+)\s*d$/i)
  const n = m ? parseInt(m[1], 10) : 0
  return n > 0 && n <= 365 ? n : 90
}

const desdeISO = (dias: number) =>
  new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString()

/**
 * Os rankings de loja — mais vendidos e mais vistos — valem para TODOS
 * os destinatários do mesmo disparo, então são calculados uma vez e
 * reaproveitados por alguns minutos. Sem isso, uma campanha para mil
 * contatos refaria a mesma contagem mil vezes.
 */
const CACHE_TTL_MS = 10 * 60 * 1000
const rankingCache = new Map<string, { em: number; ids: string[] }>()

async function comCache(chave: string, calcular: () => Promise<string[]>): Promise<string[]> {
  const agora = Date.now()
  const guardado = rankingCache.get(chave)
  if (guardado && agora - guardado.em < CACHE_TTL_MS) return guardado.ids
  const ids = await calcular()
  rankingCache.set(chave, { em: agora, ids })
  // O mapa não pode crescer sem fim num processo longo.
  if (rankingCache.size > 200) {
    for (const [k, v] of rankingCache) {
      if (agora - v.em >= CACHE_TTL_MS) rankingCache.delete(k)
    }
  }
  return ids
}

/**
 * Os mais VENDIDOS de verdade, contados nos itens dos pedidos da janela.
 *
 * Antes, "Produtos mais vendidos" e "Produtos mais vistos" caíam no
 * mesmo código de "Produtos mais recentes": as três opções da tela
 * davam exatamente a mesma lista. O dado para fazer certo sempre esteve
 * lá — 1.072 pedidos em 90 dias só numa das lojas.
 */
async function rankingMaisVendidos(storeId: string, dias: number): Promise<string[]> {
  return comCache(`vendidos:${storeId}:${dias}`, async () => {
    const { data } = await supabaseAdmin
      .from('shopify_orders')
      .select('line_items')
      .eq('store_id', storeId)
      .gte('created_at', desdeISO(dias))
      .order('created_at', { ascending: false })
      .limit(1000)
    const contagem = new Map<string, number>()
    for (const pedido of (data || []) as any[]) {
      for (const item of (pedido.line_items || []) as any[]) {
        const id = item?.product_id != null ? String(item.product_id) : ''
        if (!id) continue
        const qtd = Number(item.quantity) || 1
        contagem.set(id, (contagem.get(id) || 0) + qtd)
      }
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  })
}

/** Os mais VISTOS, contados nas visualizações de produto da janela. */
async function rankingMaisVistos(orgId: string, storeId: string, dias: number): Promise<string[]> {
  return comCache(`vistos:${storeId}:${dias}`, async () => {
    const { data } = await supabaseAdmin
      .from('contact_events')
      .select('properties')
      .eq('organization_id', orgId)
      .eq('store_id', storeId)
      .eq('event_type', 'viewed_product')
      .gte('occurred_at', desdeISO(dias))
      .order('occurred_at', { ascending: false })
      .limit(5000)
    const contagem = new Map<string, number>()
    for (const ev of (data || []) as any[]) {
      const id = ev?.properties?.product_id != null ? String(ev.properties.product_id) : ''
      if (!id) continue
      contagem.set(id, (contagem.get(id) || 0) + 1)
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  })
}

/**
 * Busca no catálogo por uma lista de ids e devolve NA ORDEM da lista.
 * O `in` do banco não preserva ordem, e num ranking a ordem é o dado.
 */
async function catalogoNaOrdem(
  orgId: string, storeId: string, ids: string[], limite: number, excluded?: Set<string>
): Promise<any[]> {
  if (ids.length === 0) return []
  // Busca com folga: parte dos ids do ranking pode estar escondida,
  // esgotada ou sem foto, e aí o corte final ficaria curto.
  const candidatos = ids.slice(0, Math.min(limite * 6, 200))
  const { data } = await catalogQuery(orgId, storeId, excluded).in('shopify_product_id', candidatos)
  const porId = new Map<string, any>()
  for (const p of (data || []) as any[]) porId.set(String(p.shopify_product_id), p)
  const temFoto = (p: any) => Array.isArray(p?.images) && p.images.length > 0
  const achados = candidatos.map((id) => porId.get(id)).filter(Boolean)
  // Mesma regra da grade: quem tem foto na frente, sem banir os outros.
  return [...achados.filter(temFoto), ...achados.filter((p) => !temFoto(p))].slice(0, limite)
}

async function fetchNewestCatalog(orgId: string, storeId: string, limit: number, excluded?: Set<string>): Promise<any[]> {
  // Busca com folga para poder descartar quem não tem foto sem devolver
  // menos produto do que o bloco pediu.
  const fetchSize = Math.min(Math.max(limit * 4, limit + 8), 100)
  const base = () => catalogQuery(orgId, storeId, excluded)
    .order('created_at', { ascending: false })
    .limit(fetchSize)
  let { data } = await base().or('status.ilike.active,status.is.null')
  if (!data || data.length === 0) {
    const retry = await base()
    data = retry.data || []
  }
  const todos = data || []

  // Cartão de recomendação sem foto vira um retângulo cinza no e-mail.
  // Medido no catálogo real: os dois produtos mais recentes de uma das
  // lojas são "Test Product" sem imagem, e como a ordem é do mais novo
  // para o mais antigo eles ocupavam as duas primeiras vagas de toda
  // grade daquela loja. Quem tem foto vem primeiro; os sem foto só
  // entram para completar, e ainda assim é melhor do que grade vazia.
  const temFoto = (p: any) => Array.isArray(p?.images) && p.images.length > 0
  const comFoto = todos.filter(temFoto)
  const semFoto = todos.filter((p: any) => !temFoto(p))
  return [...comFoto, ...semFoto].slice(0, limit)
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

  // Configuração do feed lida ANTES da busca: as exclusões entram na
  // consulta ao catálogo (o limite continua valendo) e os filtros dizem
  // quanto buscar a mais para não sobrar menos produto que o pedido.
  // A organização é a cerca: feed de outra org não configura nada aqui.
  let feedFilters: any[] = []
  let fallbackType = ''
  let timePeriod = ''
  const excluded = new Set<string>()
  if (feed_id) {
    try {
      // `fallback_type` e `time_period` entram na leitura. A tela sempre
      // os ofereceu e a API sempre os gravou — os cinco feeds salvos têm
      // os dois preenchidos — mas o envio lia só filtros e exclusões, e
      // ignorava ambos. Dois controles que não faziam nada.
      const { data: feed } = await supabaseAdmin.from('product_feeds')
        .select('filters, excluded_product_ids, fallback_type, time_period')
        .eq('id', feed_id).eq('organization_id', orgId).maybeSingle()
      if (feed) {
        if (Array.isArray(feed.filters)) feedFilters = feed.filters as any[]
        fallbackType = String((feed as any).fallback_type || '')
        timePeriod = String((feed as any).time_period || '')
        for (const id of (feed.excluded_product_ids as any[]) || []) {
          if (id != null && String(id).trim()) excluded.add(String(id).trim())
        }
      }
    } catch { /* coluna nova pode não existir num banco antigo */ }
  }
  // Filtros são aplicados em memória depois da busca; sem folga, um feed de
  // 4 produtos com filtro de categoria voltaria com 1.
  const fetchLimit = feedFilters.length > 0 ? Math.min(limit * 5, 100) : limit
  // Os feeds de evento (carrinho, pedido) cortam a lista antes de a exclusão
  // rodar. A mesma folga, aqui pela quantidade de excluídos: um carrinho de
  // 3 itens com 1 excluído continua mostrando os 2 que o cliente pode ver.
  const eventLimit = excluded.size > 0 ? Math.min(limit + excluded.size, 100) : limit

  let products: any[] = []

  const dias = janelaEmDias(timePeriod)

  switch (type) {
    // As três eram a MESMA consulta — "mais vendidos", "mais vistos" e
    // "mais recentes" davam listas idênticas, e quem escolhia na tela
    // não recebia o que escolheu. Agora cada uma conta o que promete, na
    // janela de tempo do feed.
    case 'bestsellers': {
      if (!store.id) break
      const ids = await rankingMaisVendidos(store.id, dias)
      const data = await catalogoNaOrdem(orgId, store.id, ids, fetchLimit, excluded)
      products = data.map((p: any) => mapCatalogProduct(p, shopDomain))
      break
    }

    case 'most_viewed': {
      if (!store.id) break
      const ids = await rankingMaisVistos(orgId, store.id, dias)
      const data = await catalogoNaOrdem(orgId, store.id, ids, fetchLimit, excluded)
      products = data.map((p: any) => mapCatalogProduct(p, shopDomain))
      break
    }

    case 'newest': {
      if (!store.id) break
      const data = await fetchNewestCatalog(orgId, store.id, fetchLimit, excluded)
      products = data.map((p: any) => mapCatalogProduct(p, shopDomain))
      break
    }

    case 'random': {
      if (!store.id) break
      const { data } = await catalogQuery(orgId, store.id, excluded)
        .or('status.ilike.active,status.is.null')
        .limit(fetchLimit * 3)
      const shuffled = (data || []).map((p: any) => mapCatalogProduct(p, shopDomain)).sort(() => Math.random() - 0.5)
      products = shuffled.slice(0, limit)
      break
    }

    case 'recently_viewed': {
      if (!store.id) break
      if (contact_id) {
        try {
          // A visualização de produto mora em `contact_events`, por
          // `contact_id`. A consulta antiga ia em `tracking_events` por
          // `visitor_id` — e `tracking_events` está VAZIA: zero linhas.
          // Quer dizer que "Produtos visualizados recentemente" nunca
          // devolveu nada e sempre caiu no catálogo. Os cinco feeds
          // salvos são justamente desse tipo.
          const { data: events } = await supabaseAdmin.from('contact_events')
            .select('properties, occurred_at')
            .eq('organization_id', orgId)
            .eq('store_id', store.id)
            .eq('contact_id', contact_id)
            .eq('event_type', 'viewed_product')
            .gte('occurred_at', desdeISO(dias))
            .order('occurred_at', { ascending: false })
            .limit(Math.max(limit * 4, 20))
          // Ordem de visualização preservada e sem repetir produto.
          const productIds: string[] = []
          for (const e of (events || []) as any[]) {
            const id = e?.properties?.product_id != null ? String(e.properties.product_id) : ''
            if (id && !productIds.includes(id)) productIds.push(id)
          }
          if (productIds.length > 0) {
            // Só o que existe no catálogo DESTA loja: um produto visto na
            // loja irmã não entra no e-mail desta.
            products = (await catalogoNaOrdem(orgId, store.id, productIds, limit, excluded))
              .map((p: any) => mapCatalogProduct(p, shopDomain))
          }
        } catch {}
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
            products = recovery.items.slice(0, eventLimit)
          }
        } catch {}
      }
      break
    }

    case 'trigger_cart': {
      const items = event_data?.Items || event_data?.line_items || event_data?.extra?.line_items || []
      products = items.slice(0, eventLimit).map((it: any) => mapTriggerItem(it))
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
        products = itemsList.slice(0, eventLimit).map((it: any, idx: number) => ({
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
      // Gatilho que só manda o id. `trigger_order_paid` é o caso: o
      // despacho carrega `order_id`, `order_number`, `total_price` e
      // `currency` — e nenhum produto. Um fluxo de "Pedido Pago" com o
      // bloco "Produtos do Gatilho" saía sem produto nenhum, que é
      // justamente o conteúdo do e-mail de confirmação.
      //
      // O pedido está no banco, com os itens completos. Buscar por id é
      // barato e acontece só quando o evento não trouxe nada. O
      // enriquecimento logo acima é que completa imagem e link, porque
      // `line_items` da Shopify não traz foto.
      if (products.length === 0) {
        const orderId =
          event_data?.order_id || event_data?.OrderID || event_data?.orderId ||
          event_data?.properties?.order_id || event_data?.properties?.OrderID
        const checkoutId =
          event_data?.checkout_id || event_data?.CheckoutID || event_data?.CheckoutId ||
          event_data?.properties?.checkout_id || event_data?.properties?.CheckoutID

        const fonte: Array<{ tabela: 'shopify_orders' | 'shopify_checkouts'; coluna: string; valor: string }> = []
        if (orderId) fonte.push({ tabela: 'shopify_orders', coluna: 'shopify_order_id', valor: String(orderId) })
        if (checkoutId) fonte.push({ tabela: 'shopify_checkouts', coluna: 'shopify_checkout_id', valor: String(checkoutId) })

        for (const f of fonte) {
          if (products.length > 0) break
          try {
            let q = supabaseAdmin
              .from(f.tabela)
              .select('line_items')
              .eq('organization_id', orgId)
              .eq(f.coluna, f.valor)
              .limit(1)
            if (store.id) q = q.eq('store_id', store.id)
            const { data: rows } = await q
            const li = rows?.[0]?.line_items
            if (Array.isArray(li) && li.length > 0) {
              products = li.slice(0, eventLimit).map((it: any, idx: number) => ({
                ...mapTriggerItem(it),
                _variant_id: String(it.variant_id || it.VariantID || '') || null,
                _idx: idx,
              }))
            }
          } catch { /* o e-mail sai sem produto, não quebra */ }
        }

        // Os itens do banco vêm sem foto: o mesmo enriquecimento que a
        // lista do evento usa completa imagem, link e título.
        const faltando = products.filter((p: any) => p.product_id && (!p.image_url || !p.url || p.url === '#'))
        if (faltando.length > 0) {
          try {
            const ids = Array.from(new Set(faltando.map((p: any) => String(p.product_id))))
            let eq = supabaseAdmin
              .from('shopify_products')
              .select('shopify_product_id, title, handle, images, variants, price')
              .eq('organization_id', orgId)
              .in('shopify_product_id', ids)
            if (store.id) eq = eq.eq('store_id', store.id)
            const { data: dbProducts } = await eq
            const byId = new Map<string, any>()
            for (const dp of dbProducts || []) {
              if (dp.shopify_product_id) byId.set(String(dp.shopify_product_id), dp)
            }
            for (const p of products) {
              const dp = p.product_id ? byId.get(String(p.product_id)) : null
              if (!dp) continue
              if (!p.image_url) {
                const vId = (p as any)._variant_id
                const variants: any[] = Array.isArray(dp.variants) ? dp.variants : []
                const mv = vId ? variants.find((v: any) => String(v.id) === String(vId)) : null
                let img: string | null = null
                if (mv?.image_id && Array.isArray(dp.images)) {
                  const vi = dp.images.find((i: any) => String(i?.id) === String(mv.image_id))
                  img = vi?.src || vi?.url || null
                }
                if (!img && Array.isArray(dp.images) && dp.images.length > 0) {
                  img = dp.images[0]?.url || dp.images[0]?.src || null
                }
                if (img) p.image_url = img
              }
              if ((!p.url || p.url === '#') && shopDomain && dp.handle) {
                const vId = (p as any)._variant_id
                p.url = vId
                  ? `https://${shopDomain}/products/${dp.handle}?variant=${vId}`
                  : `https://${shopDomain}/products/${dp.handle}`
              }
              if (!p.title || p.title === 'Product') p.title = dp.title || p.title
              if ((!p.price || p.price === 0) && dp.price) p.price = parseFloat(String(dp.price))
            }
          } catch { /* não bloqueia */ }
        }
        for (const p of products) {
          delete (p as any)._variant_id
          delete (p as any)._idx
        }
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
            products = recovery.items.slice(0, eventLimit).map((it: any) => mapTriggerItem(it))
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
      products = items.slice(0, eventLimit).map((it: any) => mapTriggerItem(it))
      break
    }

    case 'recommendations':
    default: {
      if (!store.id) break
      const data = await fetchNewestCatalog(orgId, store.id, fetchLimit, excluded)
      products = data.map((p: any) => mapCatalogProduct(p, shopDomain))
    }
  }

  // Exclusão por feed, agora sobre TUDO — inclusive os feeds de evento
  // (carrinho abandonado, pedido, produto visto), que não passam pelo
  // catálogo. Um produto excluído não aparece nem se veio do evento.
  if (excluded.size > 0) products = products.filter((p: any) => !isExcluded(p, excluded))

  for (const filter of feedFilters) {
    if (filter?.field === 'category' && filter.value !== 'all') {
      products = products.filter((p: any) =>
        p.product_type === filter.value || p.category === filter.value
      )
    }
  }

  // ── Não recomende o que a pessoa acabou de comprar ─────────────────
  //
  // Os fluxos de Upsell e de pós-compra disparam em `order_paid` e
  // mostram "Recomendados Para Você". Sem esta regra, a grade oferece o
  // produto que está na nota fiscal do próprio e-mail. Medido nos
  // envios reais: 3 de 3 no Dr. Groot, cujo catálogo é pequeno o
  // bastante para a sobreposição ser quase certa.
  //
  // Só vale para as listas de CATÁLOGO. Um feed que existe para mostrar
  // os itens do pedido ou do carrinho continua mostrando-os — ali o
  // produto comprado é o assunto, não uma recomendação ruim.
  //
  // Duas regras, dois critérios. O feed montado a partir do EVENTO
  // (gatilho, carrinho) fica de fora das duas: ali a lista é o assunto
  // do e-mail, não uma sugestão. Já "visualizados recentemente" aceita
  // reserva — sempre aceitou — mas não a exclusão de comprados: se a
  // pessoa viu o produto, mostrá-lo é justamente o ponto do feed.
  const vemDoEvento = type.startsWith('trigger_') || type === 'cart_items'
  const aceitaReserva = !vemDoEvento
  const aceitaExclusaoDeComprados = !vemDoEvento && type !== 'recently_viewed'
  if (aceitaExclusaoDeComprados && products.length > 0) {
    const comprados = idsDoPedidoNoEvento(event_data)
    if (comprados.size > 0) {
      const sobram = products.filter((p: any) => {
        const id = p?.product_id != null ? String(p.product_id) : ''
        return !id || !comprados.has(id)
      })
      // Nunca esvazia: sem nada para pôr no lugar, é melhor repetir o
      // produto do que mandar o e-mail com um buraco.
      if (sobram.length > 0) products = sobram
    }
  }

  // ── Reserva configurada ────────────────────────────────────────────
  //
  // A tela sempre ofereceu "se não houver resultado, usar…" e os cinco
  // feeds salvos têm uma escolhida. O envio ignorava: o bloco sumia, ou
  // caía num "mais recentes" cravado no código. Agora a escolha vale.
  //
  // Só para as listas de catálogo, pela mesma razão da regra acima: um
  // gatilho que por natureza não tem produto — "Visualizou Página",
  // "Inscrito via Popup" — tem de devolver nada. Encher de mais-vendido
  // o e-mail de quem só visitou uma página não é reserva, é invenção.
  if (products.length === 0 && store.id && aceitaReserva) {
    const reserva = (fallbackType || '').trim()
    const cadeia = reserva && reserva !== type ? [reserva] : []
    // `newest` fecha a cadeia porque é a única que não depende de
    // histórico: uma loja recém-conectada não tem venda nem visita.
    if (!cadeia.includes('newest') && type !== 'newest') cadeia.push('newest')
    for (const alternativa of cadeia) {
      try {
        let ids: string[] = []
        if (alternativa === 'bestsellers') ids = await rankingMaisVendidos(store.id, dias)
        else if (alternativa === 'most_viewed') ids = await rankingMaisVistos(orgId, store.id, dias)
        const linhas = ids.length > 0
          ? await catalogoNaOrdem(orgId, store.id, ids, fetchLimit, excluded)
          : await fetchNewestCatalog(orgId, store.id, fetchLimit, excluded)
        if (linhas.length > 0) {
          products = linhas.map((p: any) => mapCatalogProduct(p, shopDomain))
          break
        }
      } catch { /* a próxima da cadeia tenta */ }
    }
  }

  return products.slice(0, limit)
}

/**
 * Os ids de produto que o evento diz que a pessoa comprou.
 *
 * Cobre as duas formas que chegam ao envio: `Items` (o que o webhook
 * despacha e o que a hidratação do pedido preenche) e `line_items` (o
 * formato cru da Shopify).
 */
function idsDoPedidoNoEvento(eventData: any): Set<string> {
  const ids = new Set<string>()
  if (!eventData || typeof eventData !== 'object') return ids
  const ehPedido =
    eventData.order_id != null || eventData.OrderId != null || eventData.OrderID != null ||
    String(eventData.event_type || '').includes('order')
  if (!ehPedido) return ids
  const listas = [eventData.Items, eventData.items, eventData.line_items, eventData.extra?.line_items]
  for (const lista of listas) {
    if (!Array.isArray(lista)) continue
    for (const item of lista) {
      const id = item?.ProductID ?? item?.product_id ?? item?.productId
      if (id != null && String(id).trim()) ids.add(String(id).trim())
    }
  }
  return ids
}
