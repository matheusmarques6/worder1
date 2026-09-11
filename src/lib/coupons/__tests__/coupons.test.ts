import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdmin: () => ({}), supabaseAdmin: {} }))
vi.mock('@/lib/shopify/graphql-client', () => ({ shopifyGraphQL: vi.fn(), ShopifyThrottledError: class extends Error {} }))

import { generateCouponCode, isDuplicateCodeError, ShopifyDiscountError } from '../shopify-discounts'
import { readCouponBlock } from '../pool-service'

describe('código do cupom', () => {
  it('PREFIXO-XXXXXXXX sem caracteres que se confundem', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateCouponCode('bem vindo!')
      expect(code).toMatch(/^BEMVINDO-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/)
    }
  })

  it('prefixo vazio ou inválido vira POPUP; longo demais é cortado', () => {
    expect(generateCouponCode('')).toMatch(/^POPUP-/)
    expect(generateCouponCode('!!!')).toMatch(/^POPUP-/)
    expect(generateCouponCode('ABCDEFGHIJKLMNOP')).toMatch(/^ABCDEFGHIJKL-/)
  })

  it('duplicidade na Shopify é reconhecida pela mensagem', () => {
    expect(isDuplicateCodeError(new ShopifyDiscountError('x', [{ message: 'Code is already in use' }]))).toBe(true)
    expect(isDuplicateCodeError(new ShopifyDiscountError('x', [{ message: 'Title is invalid' }]))).toBe(false)
    expect(isDuplicateCodeError(new Error('already'))).toBe(false)
  })
})

describe('bloco de cupom → configuração do pool', () => {
  const design = (props: Record<string, unknown>, where: 'step' | 'success' = 'success') => ({
    steps: [{ blocks: where === 'step' ? [{ id: 'k', type: 'coupon', props }] : [] }],
    successStep: { blocks: where === 'success' ? [{ id: 'k', type: 'coupon', props }] : [] },
  })

  it('sem bloco → null', () => {
    expect(readCouponBlock({ steps: [{ blocks: [] }] })).toBeNull()
    expect(readCouponBlock(null)).toBeNull()
  })

  it('o modo legado "dynamic" é lido como único', () => {
    expect(readCouponBlock(design({ mode: 'dynamic', code: 'X' }))?.mode).toBe('unique')
    expect(readCouponBlock(design({ mode: 'unique' }))?.mode).toBe('unique')
    expect(readCouponBlock(design({}))?.mode).toBe('static')
  })

  it('tipos, valores e limites', () => {
    const pct = readCouponBlock(design({ mode: 'unique', discountType: 'percentage', discountValue: 15, validityDays: 900, codePrefix: 'bem-vindo', minimumAmount: 99.9, code: 'fallback' }))!
    expect(pct).toMatchObject({ kind: 'percent', value: 15, validityDays: 365, codePrefix: 'BEMVINDO', minimumSubtotal: 99.9, staticCode: 'FALLBACK', autoApply: true, showCode: true })

    const fixed = readCouponBlock(design({ discountType: 'fixed_amount', discountValue: 20 }))!
    expect(fixed).toMatchObject({ kind: 'fixed', value: 20 })

    const ship = readCouponBlock(design({ discountType: 'free_shipping', discountValue: 999 }))!
    expect(ship).toMatchObject({ kind: 'free_shipping', value: 0 })

    const none = readCouponBlock(design({ validityDays: 0, minimumAmount: 0 }))!
    expect(none.validityDays).toBe(7)
    expect(none.minimumSubtotal).toBeNull()
  })

  it('combinações: pedido desligado por padrão, produto e frete ligados', () => {
    expect(readCouponBlock(design({}))!.combinesWith).toEqual({ order: false, product: true, shipping: true })
    expect(readCouponBlock(design({ combinesWith: { order: true, product: false } }))!.combinesWith).toEqual({ order: true, product: false, shipping: true })
  })

  it('auto-apply e mostrar código são desligáveis; coleções só por gid', () => {
    const b = readCouponBlock(design({ autoApply: false, showCode: false, collectionIds: ['gid://shopify/Collection/1', 'abc', 42] }))!
    expect(b.autoApply).toBe(false)
    expect(b.showCode).toBe(false)
    expect(b.collectionIds).toEqual(['gid://shopify/Collection/1'])
  })

  it('o bloco pode estar numa etapa, não só no sucesso', () => {
    expect(readCouponBlock(design({ mode: 'unique' }, 'step'))?.mode).toBe('unique')
  })
})
