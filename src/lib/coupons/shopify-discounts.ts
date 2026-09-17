// =============================================
// Descontos únicos na Shopify — GraphQL Admin API
//
// Um código = um desconto (DiscountCodeNode) com usageLimit = 1. A
// Shopify limita uso POR DESCONTO, não por código dentro de um desconto
// com vários códigos — então "uso único" só é verdade quando cada código
// é o seu próprio desconto. Custa ~10 pontos por criação, com 1.000 de
// orçamento e reposição de 50/s; o cron cria em lotes pequenos, longe do
// caminho do submit.
//
// A REST price_rules que o serviço anterior usava está deprecada desde
// 2024-04 e não existe para apps novos.
// =============================================

import { shopifyGraphQL, type ShopifyStoreConfig } from '@/lib/shopify/graphql-client'
import { randomBytes } from 'crypto'

export type CouponKind = 'percent' | 'fixed' | 'free_shipping'

export interface CombinesWith {
  order: boolean
  product: boolean
  shipping: boolean
}

export interface UniqueDiscountInput {
  code: string
  title: string
  kind: CouponKind
  value: number
  currency: string
  endsAt: Date
  minimumSubtotal?: number | null
  combinesWith?: Partial<CombinesWith>
  /** gids de coleções; vazio = todos os produtos */
  collectionIds?: string[]
}

export interface UniqueDiscountResult {
  discountId: string
  code: string
}

// Sem 0/O/1/I/L: o código é lido em voz alta e digitado no celular.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateCouponCode(prefix: string, length = 8): string {
  const clean = String(prefix || 'POPUP').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'POPUP'
  const bytes = randomBytes(length)
  let suffix = ''
  for (let i = 0; i < length; i++) suffix += ALPHABET[bytes[i] % ALPHABET.length]
  return `${clean}-${suffix}`
}

const BASIC_CREATE = `
  mutation PopupDiscountBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field code message }
    }
  }
`

const FREE_SHIPPING_CREATE = `
  mutation PopupDiscountFreeShippingCreate($freeShippingCodeDiscount: DiscountCodeFreeShippingInput!) {
    discountCodeFreeShippingCreate(freeShippingCodeDiscount: $freeShippingCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field code message }
    }
  }
`

const DISCOUNT_DELETE = `
  mutation PopupDiscountDelete($id: ID!) {
    discountCodeDelete(id: $id) {
      deletedCodeDiscountId
      userErrors { field code message }
    }
  }
`

export class ShopifyDiscountError extends Error {
  constructor(message: string, public readonly userErrors: Array<{ field?: string[] | null; code?: string | null; message: string }> = []) {
    super(message)
    this.name = 'ShopifyDiscountError'
  }
}

function money(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2)
}

function buildCommon(input: UniqueDiscountInput) {
  const cw = { order: false, product: true, shipping: true, ...(input.combinesWith || {}) }
  const common: Record<string, any> = {
    title: input.title,
    code: input.code,
    startsAt: new Date().toISOString(),
    endsAt: input.endsAt.toISOString(),
    usageLimit: 1,
    appliesOncePerCustomer: true,
    customerSelection: { all: true },
    combinesWith: {
      orderDiscounts: !!cw.order,
      productDiscounts: !!cw.product,
      shippingDiscounts: !!cw.shipping,
    },
  }
  if (input.minimumSubtotal && input.minimumSubtotal > 0) {
    common.minimumRequirement = { subtotal: { greaterThanOrEqualToSubtotal: money(input.minimumSubtotal) } }
  }
  return common
}

/**
 * Cria um desconto de código único. Idempotente por código: se a Shopify
 * responder que o código já existe, quem chamou gera outro e tenta de novo.
 */
export async function createUniqueDiscount(
  store: ShopifyStoreConfig,
  input: UniqueDiscountInput,
): Promise<UniqueDiscountResult> {
  const common = buildCommon(input)

  if (input.kind === 'free_shipping') {
    const res = await shopifyGraphQL<any>(store, FREE_SHIPPING_CREATE, {
      freeShippingCodeDiscount: { ...common, destination: { all: true } },
    })
    const payload = res.data?.discountCodeFreeShippingCreate
    const errors = payload?.userErrors || []
    if (errors.length) throw new ShopifyDiscountError(errors.map((e: any) => e.message).join('; '), errors)
    const id = payload?.codeDiscountNode?.id
    if (!id) throw new ShopifyDiscountError('Shopify não devolveu o id do desconto de frete grátis')
    return { discountId: id, code: input.code }
  }

  const value = input.kind === 'percent'
    ? { percentage: Math.max(0, Math.min(1, input.value / 100)) }
    : { discountAmount: { amount: money(input.value), appliesOnEachItem: false } }

  const items = input.collectionIds && input.collectionIds.length > 0
    ? { collections: { add: input.collectionIds } }
    : { all: true }

  const res = await shopifyGraphQL<any>(store, BASIC_CREATE, {
    basicCodeDiscount: { ...common, customerGets: { value, items } },
  })
  const payload = res.data?.discountCodeBasicCreate
  const errors = payload?.userErrors || []
  if (errors.length) throw new ShopifyDiscountError(errors.map((e: any) => e.message).join('; '), errors)
  const id = payload?.codeDiscountNode?.id
  if (!id) throw new ShopifyDiscountError('Shopify não devolveu o id do desconto')
  return { discountId: id, code: input.code }
}

export async function deleteDiscount(store: ShopifyStoreConfig, discountId: string): Promise<void> {
  const res = await shopifyGraphQL<any>(store, DISCOUNT_DELETE, { id: discountId })
  const errors = res.data?.discountCodeDelete?.userErrors || []
  // "não encontrado" é sucesso para quem quer apagar.
  const real = errors.filter((e: any) => !/not found|does not exist/i.test(e.message || ''))
  if (real.length) throw new ShopifyDiscountError(real.map((e: any) => e.message).join('; '), real)
}

/** A Shopify recusa código repetido na loja com esta mensagem. */
export function isDuplicateCodeError(err: unknown): boolean {
  return err instanceof ShopifyDiscountError && err.userErrors.some((e) => /already|taken|in use|duplicate/i.test(e.message || ''))
}
