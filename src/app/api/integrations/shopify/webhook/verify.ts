// =============================================
// Verificação HMAC do Shopify (timing-safe) — src/app/api/integrations/shopify/webhook
//
// Extraído de route.ts para um módulo próprio: um arquivo route.ts do App
// Router só pode exportar os nomes que o Next reconhece (GET/POST/dynamic/
// etc.) — exportar esta função dali quebra `next build`/`tsc --noEmit`
// (os .next/types gerados recusam exports extras). Continua específica
// desta rota, não compartilhada com as outras três implementações.
// =============================================

import crypto from 'crypto';

export function verifyShopifyWebhook(rawBody: string, hmacHeader: string, secret: string): boolean {
  // Item 26 da auditoria: isto respondia "válido" sem secret/header, com um
  // comentário chamando isso de "Dev mode". Ambiente não é credencial (mesma
  // decisão do item 25) — sem os dois, a resposta é sempre inválida, mesmo
  // que a chamadora de hoje já feche essa porta antes de nos chamar.
  if (!secret || !hmacHeader) return false;

  try {
    const hash = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');

    // Timing-safe comparison
    if (hash.length !== hmacHeader.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(hmacHeader)
    );
  } catch {
    return false;
  }
}
