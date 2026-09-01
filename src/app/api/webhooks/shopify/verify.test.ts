/**
 * `verifyShopifyWebhook` só checava o header de assinatura (`if (!hmacHeader)
 * return false`) — nunca o secret. Chamada com secret vazio ela calcula um
 * HMAC-SHA256 com chave vazia e compara: qualquer um que soubesse (ou
 * adivinhasse) que o secret está ausente forjava a assinatura sozinho, sem
 * nunca ter visto um segredo de verdade. A rota (route.ts) hoje só chama
 * esta função quando `effectiveSecret` já é truthy, mas a função em si
 * ficava sem essa garantia — um pé de cabra para o próximo chamador que
 * esquecer o guarda (item 26 da auditoria).
 *
 * A comparação também era `===` simples entre strings (não é tempo
 * constante) — passa a usar `timingSafeEqual` com checagem de tamanho
 * antes, como as outras três implementações desta auditoria.
 */

import { describe, it, expect } from 'vitest'
import { verifyShopifyWebhook } from './verify'

const SECRET = 'shhh-shopify-secret'

async function sign(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

describe('verifyShopifyWebhook (api/webhooks/shopify)', () => {
  it('nega sem secret configurado, mesmo com um header de assinatura presente', async () => {
    await expect(verifyShopifyWebhook('{"id":1}', 'qualquer-coisa==', '')).resolves.toBe(false)
  })

  it('nega sem header de assinatura', async () => {
    await expect(verifyShopifyWebhook('{"id":1}', null, SECRET)).resolves.toBe(false)
  })

  it('aceita assinatura correta', async () => {
    const body = '{"id":1}'
    const hmac = await sign(body, SECRET)
    await expect(verifyShopifyWebhook(body, hmac, SECRET)).resolves.toBe(true)
  })

  it('rejeita assinatura errada', async () => {
    const hmac = await sign('{"id":2}', SECRET)
    await expect(verifyShopifyWebhook('{"id":1}', hmac, SECRET)).resolves.toBe(false)
  })

  it('não lança com header malformado (tamanho diferente do hash)', async () => {
    await expect(verifyShopifyWebhook('{"id":1}', 'curto', SECRET)).resolves.toBe(false)
  })
})
