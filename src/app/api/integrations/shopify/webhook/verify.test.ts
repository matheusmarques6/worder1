/**
 * `verifyShopifyWebhook` respondia "válido" quando faltava secret ou header
 * de assinatura — comentário "Dev mode" incluso. As chamadoras de hoje
 * fecham a porta antes de chegar aqui, mas a função em si é um pé de cabra
 * esperando um próximo chamador que esqueça o guarda (item 26 da auditoria).
 *
 * Ambiente não é credencial (mesma decisão do item 25): sem segredo
 * configurado, a resposta é sempre "inválido", sem exceção de NODE_ENV.
 */

import { describe, it, expect, vi } from 'vitest'
import crypto from 'crypto'
import { verifyShopifyWebhook } from './verify'

const SECRET = 'shhh-shopify-secret'

function sign(body: string, secret: string): string {
  const crypto = require('crypto')
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64')
}

describe('verifyShopifyWebhook (integrations/shopify/webhook)', () => {
  it('nega sem secret configurado, mesmo com um header de assinatura presente', () => {
    expect(verifyShopifyWebhook('{"id":1}', 'qualquer-coisa==', '')).toBe(false)
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

  it('achado 5: uma falha inesperada na verificação é logada, não engolida calada', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const hmacSpy = vi.spyOn(crypto, 'createHmac').mockImplementation(() => {
      throw new Error('boom')
    })

    expect(verifyShopifyWebhook('{"id":1}', 'qualquer-coisa==', SECRET)).toBe(false)
    expect(errorSpy).toHaveBeenCalled()

    hmacSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
