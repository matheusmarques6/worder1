// ============================================
// VERIFICAÇÃO DE ASSINATURA — src/app/api/webhooks/shopify
//
// Extraído de route.ts para um módulo próprio: um route.ts do App Router só
// pode exportar os nomes que o Next reconhece (GET/POST/dynamic/etc.) —
// exportar esta função dali quebra `next build`/`tsc --noEmit`. Continua
// específica desta rota, sem compartilhar com as outras três implementações
// (unificação é item à parte da auditoria).
// ============================================

import { timingSafeEqual } from 'crypto';

export async function verifyShopifyWebhook(
  body: string,
  hmacHeader: string | null,
  secret: string
): Promise<boolean> {
  // Item 26 da auditoria: só o header era checado aqui — nunca o secret.
  // Chamada com secret vazio, o Web Crypto rejeita a chave de tamanho zero
  // (DataError) e cai no catch, então hoje isto não responde "válido" sem
  // secret; mas era proteção incidental de uma exceção interna, não uma
  // decisão do código. Explícito agora, para não depender desse detalhe de
  // implementação — e para o próximo chamador que esquecer o guard (a rota
  // de hoje só chama esta função com secret já garantido truthy).
  if (!secret || !hmacHeader) return false;

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const bodyData = encoder.encode(body);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, bodyData);
    const generatedHmac = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    // Comparação em tempo constante (as outras três implementações desta
    // auditoria já usam timingSafeEqual) em vez do `===` de strings.
    const generatedBuf = Buffer.from(generatedHmac);
    const headerBuf = Buffer.from(hmacHeader);
    if (generatedBuf.length !== headerBuf.length) return false;

    return timingSafeEqual(generatedBuf, headerBuf);
  } catch (error) {
    console.error('[Shopify Webhook] Signature verification error:', error);
    return false;
  }
}
