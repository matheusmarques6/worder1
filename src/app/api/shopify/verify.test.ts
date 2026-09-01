/**
 * `verifyShopifyWebhook` calculava o HMAC com `process.env.SHOPIFY_WEBHOOK_SECRET
 * || ''` — sem a env configurada, a chave vira string vazia e qualquer um
 * que soubesse (ou adivinhasse) que o secret está ausente forja a
 * assinatura sozinho, sem nunca ter visto um segredo de verdade. E o
 * `timingSafeEqual` direto, sem checar o tamanho antes, lança RangeError
 * (vira 500) quando o header de assinatura tem tamanho diferente do hash
 * calculado — um header malformado não pode derrubar a rota.
 *
 * Item 26 da auditoria: sem secret ou sem assinatura, a resposta é sempre
 * inválida — sem exceção de ambiente (mesma decisão do item 25).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { verifyShopifyWebhook } from './verify'

const SECRET = 'shhh-shopify-secret'
const ORIGINAL_ENV = { ...process.env }

function sign(body: string, secret: string): string {
  const crypto = require('crypto')
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64')
}

describe('verifyShopifyWebhook (api/shopify)', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it('nega sem SHOPIFY_WEBHOOK_SECRET configurado, mesmo com uma assinatura presente', () => {
    delete process.env.SHOPIFY_WEBHOOK_SECRET
    expect(verifyShopifyWebhook('{"id":1}', 'qualquer-coisa==')).toBe(false)
  })

  it('nega sem assinatura', () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = SECRET
    expect(verifyShopifyWebhook('{"id":1}', '')).toBe(false)
  })

  it('aceita assinatura correta', () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = SECRET
    const body = '{"id":1}'
    expect(verifyShopifyWebhook(body, sign(body, SECRET))).toBe(true)
  })

  it('rejeita assinatura errada', () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = SECRET
    expect(verifyShopifyWebhook('{"id":1}', sign('{"id":2}', SECRET))).toBe(false)
  })

  it('não lança com header malformado (tamanho diferente do hash)', () => {
    process.env.SHOPIFY_WEBHOOK_SECRET = SECRET
    expect(() => verifyShopifyWebhook('{"id":1}', 'curto')).not.toThrow()
    expect(verifyShopifyWebhook('{"id":1}', 'curto')).toBe(false)
  })
})
