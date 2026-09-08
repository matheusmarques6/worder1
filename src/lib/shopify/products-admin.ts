// =============================================================
// Criar produto na Shopify a partir da Worder
//
// A tela de Produtos passa a ter "Novo produto". O produto nasce NA
// SHOPIFY (é ela a fonte da verdade: preço, estoque, publicação) e
// só então é gravado em shopify_products — a mesma linha que a
// sincronização e os webhooks mantêm depois.
//
// Passos, cada um com a permissão (scope) que exige:
//   1. productCreate (+ imagens)          write_products
//   2. productVariantsBulkUpdate           write_products
//      preço, preço comparativo, SKU, controle de estoque
//   3. inventorySetQuantities              write_inventory (opcional)
//   4. publishablePublish na Loja online   write_publications (opcional)
//   5. reler o produto e gravar localmente read_products
//
// Os passos 3 e 4 são "melhor esforço": sem a permissão, o produto é
// criado mesmo assim e a resposta traz um aviso dizendo exatamente o
// que faltou. O passo 1 sem permissão é erro claro (ScopeError) — a
// tela mostra quais scopes adicionar no app da Shopify.
// =============================================================

import { shopifyGraphQL, ShopifyGraphQLError, type ShopifyStoreConfig } from '@/lib/shopify/graphql-client'
import { computeProductAvailability, normalizeSyncedVariant, gidToId } from '@/lib/shopify/product-availability'

export interface NewProductInput {
  title: string
  descriptionHtml?: string | null
  price: number
  compareAtPrice?: number | null
  sku?: string | null
  /** Controlar estoque na Shopify. Quando true, `quantity` é aplicado. */
  trackInventory?: boolean
  quantity?: number | null
  status?: 'active' | 'draft'
  vendor?: string | null
  productType?: string | null
  tags?: string[]
  imageUrls?: string[]
  /** Publicar na Loja online. Padrão: true. */
  publish?: boolean
}

export interface CreatedProduct {
  /** Linha pronta para shopify_products (sem store_id/organization_id). */
  row: Record<string, any>
  shopifyProductId: string
  warnings: string[]
}

/** Falta uma permissão no app da Shopify. */
export class ShopifyScopeError extends Error {
  constructor(public readonly scope: string, public readonly step: string) {
    super(`O app da Shopify não tem a permissão ${scope} (necessária para ${step}).`)
    this.name = 'ShopifyScopeError'
  }
}

/** Erro de validação da própria Shopify (userErrors). */
export class ShopifyUserError extends Error {
  constructor(public readonly step: string, public readonly userErrors: Array<{ field?: string[] | null; message: string }>) {
    super(`${step}: ${userErrors.map((e) => e.message).join('; ')}`)
    this.name = 'ShopifyUserError'
  }
}

const ACCESS_DENIED_RE = /access denied|ACCESS_DENIED|requires? (the )?(merchant approval for )?([a-z_]+ )?scope|not approved to access/i

function isAccessDenied(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err instanceof ShopifyGraphQLError) {
    if (err.errors.some((e) => e.extensions?.code === 'ACCESS_DENIED')) return true
    if (err.statusCode === 403) return true
  }
  return ACCESS_DENIED_RE.test(err.message)
}

function money(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return null
  return Number(n).toFixed(2)
}

export const CREATE_PRODUCT_MUTATION = `
mutation WorderCreateProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
  productCreate(product: $product, media: $media) {
    product {
      id
      variants(first: 1) { nodes { id inventoryItem { id } } }
    }
    userErrors { field message }
  }
}`

export const UPDATE_VARIANTS_MUTATION = `
mutation WorderUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants { id inventoryItem { id tracked } }
    userErrors { field message }
  }
}`

export const PRIMARY_LOCATION_QUERY = `
query WorderPrimaryLocation {
  locations(first: 1, query: "active:true") { nodes { id name } }
}`

export const SET_INVENTORY_MUTATION = `
mutation WorderSetInventory($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryAdjustmentGroup { reason }
    userErrors { field message code }
  }
}`

export const PUBLICATIONS_QUERY = `
query WorderPublications {
  publications(first: 10) { nodes { id name catalog { title } } }
}`

export const PUBLISH_MUTATION = `
mutation WorderPublish($id: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) { userErrors { field message } }
}`

export const PRODUCT_REFETCH_QUERY = `
query WorderProductById($id: ID!) {
  product(id: $id) {
    id title handle status vendor productType tags descriptionHtml
    totalInventory createdAt updatedAt publishedAt
    variants(first: 100) {
      nodes {
        id title sku price compareAtPrice inventoryQuantity inventoryPolicy availableForSale barcode
        inventoryItem { id tracked }
      }
    }
    images(first: 20) { nodes { url altText } }
  }
}`

type Gql = typeof shopifyGraphQL

/** Produto lido da Shopify → linha de shopify_products (sem as chaves de dono). */
export function productNodeToRow(p: any): Record<string, any> {
  const variants = (p?.variants?.nodes || []).map(normalizeSyncedVariant)
  const main = variants[0] || {}
  const availability = computeProductAvailability(variants)
  const bodyHtml: string | null = p?.descriptionHtml || null
  const plain = bodyHtml ? String(bodyHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null
  return {
    shopify_product_id: gidToId(p?.id),
    title: p?.title ?? '',
    handle: p?.handle ?? null,
    vendor: p?.vendor ?? null,
    product_type: p?.productType ?? null,
    status: String(p?.status || 'ACTIVE').toLowerCase(),
    tags: Array.isArray(p?.tags) ? p.tags.join(', ') : (p?.tags || ''),
    price: main.price != null ? parseFloat(String(main.price)) : 0,
    compare_at_price: main.compare_at_price != null ? parseFloat(String(main.compare_at_price)) : null,
    sku: main.sku || null,
    inventory_quantity: availability.inventoryQuantity ?? (typeof p?.totalInventory === 'number' ? p.totalInventory : 0),
    available: availability.available,
    variants,
    images: (p?.images?.nodes || []).map((img: any) => ({ url: img.url, alt: img.altText })),
    body_html: bodyHtml,
    description: plain,
    published_at: p?.publishedAt ?? null,
    created_at: p?.createdAt ?? new Date().toISOString(),
    updated_at: p?.updatedAt ?? new Date().toISOString(),
  }
}

function userErrorsOf(payload: any): Array<{ field?: string[] | null; message: string }> {
  return Array.isArray(payload?.userErrors) ? payload.userErrors : []
}

/**
 * Cria o produto na Shopify e devolve a linha para gravar localmente.
 * `gql` é injetável para os testes.
 */
export async function createProductInShopify(
  store: ShopifyStoreConfig,
  input: NewProductInput,
  gql: Gql = shopifyGraphQL
): Promise<CreatedProduct> {
  const warnings: string[] = []
  const title = String(input.title || '').trim()
  if (!title) throw new Error('Título é obrigatório')
  if (!Number.isFinite(Number(input.price)) || Number(input.price) < 0) throw new Error('Preço inválido')

  // 1. Produto + imagens
  const media = (input.imageUrls || [])
    .map((u) => String(u || '').trim())
    .filter((u) => /^https?:\/\//i.test(u))
    .map((u) => ({ originalSource: u, mediaContentType: 'IMAGE', alt: title }))

  let created: any
  try {
    created = await gql(store, CREATE_PRODUCT_MUTATION, {
      product: {
        title,
        descriptionHtml: input.descriptionHtml || undefined,
        vendor: input.vendor || undefined,
        productType: input.productType || undefined,
        tags: (input.tags || []).map((t) => String(t).trim()).filter(Boolean),
        status: input.status === 'draft' ? 'DRAFT' : 'ACTIVE',
      },
      media: media.length ? media : undefined,
    })
  } catch (err) {
    if (isAccessDenied(err)) throw new ShopifyScopeError('write_products', 'criar produtos')
    throw err
  }
  const createPayload = created?.data?.productCreate
  const createErrors = userErrorsOf(createPayload)
  if (createErrors.length) throw new ShopifyUserError('Criar produto', createErrors)
  const productGid: string | undefined = createPayload?.product?.id
  if (!productGid) throw new Error('A Shopify não devolveu o produto criado')
  const variantGid: string | undefined = createPayload?.product?.variants?.nodes?.[0]?.id
  let inventoryItemGid: string | undefined = createPayload?.product?.variants?.nodes?.[0]?.inventoryItem?.id

  // 2. Variante padrão: preço, comparativo, SKU, controle de estoque
  const track = input.trackInventory === true
  if (variantGid) {
    const variantInput: Record<string, any> = {
      id: variantGid,
      price: money(input.price),
      compareAtPrice: input.compareAtPrice != null && Number(input.compareAtPrice) > 0 ? money(input.compareAtPrice) : null,
      inventoryPolicy: 'DENY',
      inventoryItem: {
        ...(input.sku ? { sku: String(input.sku).trim() } : {}),
        tracked: track,
      },
    }
    try {
      const upd = await gql(store, UPDATE_VARIANTS_MUTATION, { productId: productGid, variants: [variantInput] })
      const payload = upd?.data?.productVariantsBulkUpdate
      const errs = userErrorsOf(payload)
      if (errs.length) throw new ShopifyUserError('Definir preço/SKU', errs)
      inventoryItemGid = payload?.productVariants?.[0]?.inventoryItem?.id || inventoryItemGid
    } catch (err) {
      if (err instanceof ShopifyUserError) throw err
      if (isAccessDenied(err)) throw new ShopifyScopeError('write_products', 'definir preço e SKU')
      throw err
    }
  }

  // 3. Estoque inicial (opcional)
  if (track && input.quantity != null && Number.isFinite(Number(input.quantity)) && inventoryItemGid) {
    try {
      const loc = await gql(store, PRIMARY_LOCATION_QUERY, {})
      const locationId: string | undefined = loc?.data?.locations?.nodes?.[0]?.id
      if (!locationId) {
        warnings.push('Estoque não definido: a loja não tem um local de estoque ativo.')
      } else {
        const inv = await gql(store, SET_INVENTORY_MUTATION, {
          input: {
            name: 'available',
            reason: 'correction',
            ignoreCompareQuantity: true,
            quantities: [{ inventoryItemId: inventoryItemGid, locationId, quantity: Math.max(0, Math.trunc(Number(input.quantity))) }],
          },
        })
        const errs = userErrorsOf(inv?.data?.inventorySetQuantities)
        if (errs.length) warnings.push(`Estoque não definido: ${errs.map((e) => e.message).join('; ')}`)
      }
    } catch (err) {
      warnings.push(isAccessDenied(err)
        ? 'Estoque não definido: o app da Shopify precisa das permissões read_locations e write_inventory. Ajuste o estoque na Shopify.'
        : `Estoque não definido: ${(err as Error).message}`)
    }
  }

  // 4. Publicar na Loja online (opcional, padrão sim)
  if (input.publish !== false && input.status !== 'draft') {
    try {
      const pubs = await gql(store, PUBLICATIONS_QUERY, {})
      const nodes: any[] = pubs?.data?.publications?.nodes || []
      const online = nodes.find((n) => /online store|loja online/i.test(String(n?.catalog?.title || n?.name || '')))
        || nodes.find((n) => /online/i.test(String(n?.name || '')))
      if (!online) {
        warnings.push('Não publicado: canal "Loja online" não encontrado. Publique na Shopify.')
      } else {
        const pub = await gql(store, PUBLISH_MUTATION, { id: productGid, input: [{ publicationId: online.id }] })
        const errs = userErrorsOf(pub?.data?.publishablePublish)
        if (errs.length) warnings.push(`Não publicado na Loja online: ${errs.map((e) => e.message).join('; ')}`)
      }
    } catch (err) {
      warnings.push(isAccessDenied(err)
        ? 'Criado, mas não publicado na Loja online: o app da Shopify precisa das permissões read_publications e write_publications. Publique na Shopify ou adicione as permissões.'
        : `Não publicado na Loja online: ${(err as Error).message}`)
    }
  }

  // 5. Reler e montar a linha local
  let row: Record<string, any>
  try {
    const re = await gql(store, PRODUCT_REFETCH_QUERY, { id: productGid })
    row = productNodeToRow(re?.data?.product)
  } catch {
    // Sem releitura, grava o que sabemos; a próxima sync completa.
    row = {
      shopify_product_id: gidToId(productGid),
      title,
      handle: null,
      vendor: input.vendor || null,
      product_type: input.productType || null,
      status: input.status === 'draft' ? 'draft' : 'active',
      tags: (input.tags || []).join(', '),
      price: Number(input.price),
      compare_at_price: input.compareAtPrice ?? null,
      sku: input.sku || null,
      inventory_quantity: track ? (input.quantity ?? 0) : 0,
      available: track ? (Number(input.quantity || 0) > 0) : true,
      variants: [],
      images: (input.imageUrls || []).map((u) => ({ url: u, alt: title })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    warnings.push('Produto criado; alguns dados locais serão completados na próxima sincronização.')
  }

  return { row, shopifyProductId: String(row.shopify_product_id), warnings }
}
