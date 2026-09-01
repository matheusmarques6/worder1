/**
 * `verifyShopifyWebhook` não checava se `secret` estava vazio. `createHmac`
 * do Node aceita chave de tamanho zero sem lançar, então com secret ''
 * a função calculava um HMAC de verdade sobre uma chave vazia — qualquer um
 * que soubesse (ou adivinhasse) que o secret está ausente forjava a
 * assinatura sozinho (a chave é pública: string vazia), sem nunca ter visto
 * um segredo de verdade. Item 26 da auditoria.
 *
 * Esta implementação não tem chamador hoje (só `ShopifyClient` é importado
 * de src/lib/integrations/shopify.ts em código do repo) — é exatamente o pé
 * de cabra no chão esperando um próximo chamador que esqueça o guard.
 * Ambiente não é credencial (mesma decisão do item 25).
 */

import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import { verifyShopifyWebhook } from './shopify'

const SECRET = 'shhh-shopify-secret'

function sign(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64')
}

describe('verifyShopifyWebhook (lib/integrations/shopify)', () => {
  it('nega sem secret, mesmo com uma assinatura "correta" para a chave vazia', () => {
    const body = '{"id":1}'
    const forgedWithEmptyKey = sign(body, '')
    expect(verifyShopifyWebhook(body, forgedWithEmptyKey, '')).toBe(false)
  })

  it('nega sem header de assinatura', () => {
    expect(verifyShopifyWebhook('{"id":1}', '', SECRET)).toBe(false)
  })

  it('aceita assinatura correta', () => {
    const body = '{"id":1}'
    expect(verifyShopifyWebhook(body, sign(body, SECRET), SECRET)).toBe(true)
  })

  it('rejeita assinatura errada', () => {
    expect(verifyShopifyWebhook('{"id":1}', sign('{"id":2}', SECRET), SECRET)).toBe(false)
  })

  it('não lança com header malformado (tamanho diferente do hash)', () => {
    expect(() => verifyShopifyWebhook('{"id":1}', 'curto', SECRET)).not.toThrow()
    expect(verifyShopifyWebhook('{"id":1}', 'curto', SECRET)).toBe(false)
  })
})
