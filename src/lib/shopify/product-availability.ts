// =============================================================
// Disponibilidade de um produto — o que a Shopify diz sobre poder
// comprar, reduzido a um booleano por produto.
//
// As variantes chegam em duas formas:
//   REST (webhooks products/*):  inventory_management ('shopify'|null),
//       inventory_policy ('deny'|'continue'), inventory_quantity
//   GraphQL (sync):              availableForSale, inventoryPolicy,
//       inventoryItem.tracked, inventoryQuantity — gravadas em snake_case
//       por normalizeSyncedVariant abaixo.
//
// Regra por variante: sem controle de estoque → sempre disponível;
// venda permitida sem estoque (continue) → disponível; senão, estoque
// maior que zero. Produto disponível = alguma variante disponível.
// Quando nenhuma variante informa o suficiente, devolve null — "não
// sei" — e quem consome trata como disponível em vez de esconder um
// produto por falta de dado.
// =============================================================

export interface VariantLike {
  inventory_quantity?: number | string | null
  inventory_policy?: string | null
  inventory_management?: string | null
  tracked?: boolean | null
  available_for_sale?: boolean | null
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? n : null
}

/** A variante controla estoque? null quando a forma não diz. */
export function isVariantTracked(v: VariantLike): boolean | null {
  if (typeof v.tracked === 'boolean') return v.tracked
  if (v.inventory_management !== undefined) return v.inventory_management === 'shopify'
  return null
}

export function isVariantAvailable(v: VariantLike): boolean | null {
  // A Shopify já fez a conta (política + controle + estoque).
  if (typeof v.available_for_sale === 'boolean') return v.available_for_sale
  const tracked = isVariantTracked(v)
  if (tracked === false) return true
  if (String(v.inventory_policy || '').toLowerCase() === 'continue') return true
  const qty = toInt(v.inventory_quantity)
  // -1 é o "não controlado" da REST antiga.
  if (qty === -1) return true
  if (qty !== null) return qty > 0
  return null
}

export interface ProductAvailability {
  /** Alguma variante pode ser comprada; null quando não dá para saber. */
  available: boolean | null
  /** Soma do estoque das variantes controladas; null quando nenhuma controla. */
  inventoryQuantity: number | null
}

export function computeProductAvailability(variants: VariantLike[] | null | undefined): ProductAvailability {
  const list = Array.isArray(variants) ? variants : []
  let anyTrue = false
  let anyKnown = false
  let sum = 0
  let anyTracked = false
  for (const v of list) {
    const a = isVariantAvailable(v)
    if (a !== null) {
      anyKnown = true
      if (a) anyTrue = true
    }
    const qty = toInt(v.inventory_quantity)
    const tracked = isVariantTracked(v)
    // Sem informação de controle, um número não negativo conta como estoque.
    if (qty !== null && qty >= 0 && tracked !== false) {
      sum += qty
      anyTracked = true
    }
  }
  return {
    available: anyKnown ? anyTrue : null,
    inventoryQuantity: anyTracked ? sum : null,
  }
}

/** Extrai o id numérico de um gid://shopify/Tipo/123; devolve o que veio se não for gid. */
export function gidToId(gid: string | null | undefined): string | null {
  if (!gid) return null
  const s = String(gid)
  const m = s.match(/\/(\d+)$/)
  return m ? m[1] : s
}

/**
 * Variante do GraphQL → forma gravada em shopify_products.variants.
 * Mantém as chaves que o resto do sistema já lê (id, sku, price,
 * compare_at_price, inventory_quantity) e acrescenta o que a
 * disponibilidade e o webhook de estoque precisam.
 */
export function normalizeSyncedVariant(v: any): Record<string, any> {
  return {
    id: gidToId(v?.id),
    title: v?.title ?? null,
    sku: v?.sku ?? null,
    price: v?.price ?? null,
    compare_at_price: v?.compareAtPrice ?? null,
    inventory_quantity: v?.inventoryQuantity ?? null,
    inventory_policy: v?.inventoryPolicy ? String(v.inventoryPolicy).toLowerCase() : null,
    tracked: typeof v?.inventoryItem?.tracked === 'boolean' ? v.inventoryItem.tracked : null,
    available_for_sale: typeof v?.availableForSale === 'boolean' ? v.availableForSale : null,
    inventory_item_id: gidToId(v?.inventoryItem?.id),
    barcode: v?.barcode ?? null,
  }
}
