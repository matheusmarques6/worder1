// =============================================
// Verificação HMAC do Shopify (timing-safe) — src/app/api/shopify
//
// Extraído de route.ts para um módulo próprio: um route.ts do App Router só
// pode exportar os nomes que o Next reconhece (GET/POST/dynamic/etc.) —
// exportar esta função dali quebra `next build`/`tsc --noEmit`. Continua
// específica desta rota, não compartilhada com as outras três implementações
// (unificação é item à parte da auditoria).
// =============================================

import crypto from 'crypto';

export function verifyShopifyWebhook(body: string, signature: string): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || '';
  // Item 26 da auditoria: sem SHOPIFY_WEBHOOK_SECRET configurado, o HMAC era
  // calculado com uma chave vazia — qualquer um que soubesse (ou adivinhasse)
  // que o secret está ausente forjava a assinatura sozinho, sem nunca ter
  // visto um segredo de verdade. Sem secret ou sem assinatura, a resposta é
  // sempre inválida (ambiente não é credencial, item 25).
  if (!secret || !signature) return false;

  try {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(body, 'utf8');
    const digest = hmac.digest('base64');

    const sigBuf = Buffer.from(signature);
    const digestBuf = Buffer.from(digest);
    // Checagem de tamanho antes do timingSafeEqual: buffers de tamanhos
    // diferentes fazem a função lançar RangeError em vez de responder
    // "inválido" — um header malformado não pode virar 500.
    if (sigBuf.length !== digestBuf.length) return false;

    return crypto.timingSafeEqual(sigBuf, digestBuf);
  } catch {
    return false;
  }
}
