// =============================================
// Resolução do domínio digitado pelo merchant → domínio canônico
// <shop>.myshopify.com. Compartilhado pelo connect manual
// (client_credentials) e pelo connect OAuth manual (authorization code):
// os dois fluxos só funcionam contra o domínio canônico, e merchants
// rotineiramente colam o domínio público da vitrine.
// =============================================

export function cleanDomainInput(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
}

// Domínios custom (shopnow-drgroot.store) fazem 301 do /admin para o
// admin canônico (<shop>.myshopify.com/admin) ou direto para
// admin.shopify.com/store/<slug> nos tenants novos. Uma requisição com
// redirect:'manual' recupera o canônico do Location.
export async function resolveMyshopifyFromCustomDomain(domain: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`https://${domain}/admin`, {
      redirect: 'manual',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const loc = res.headers.get('location') || '';
    const direct = loc.match(/^https?:\/\/([a-z0-9][a-z0-9-]*\.myshopify\.com)/i);
    if (direct) return direct[1].toLowerCase();
    const newAdmin = loc.match(/^https?:\/\/admin\.shopify\.com\/store\/([a-z0-9][a-z0-9-]*)/i);
    if (newAdmin) return `${newAdmin[1].toLowerCase()}.myshopify.com`;
    return null;
  } catch {
    return null;
  }
}

export type ResolvedShopDomain =
  | { ok: true; shopDomain: string }
  | { ok: false; error: string };

/**
 * Quatro casos: canônico passa direto; slug puro ganha o sufixo;
 * domínio custom é resolvido via redirect do /admin; qualquer outra
 * coisa é rejeitada com mensagem acionável.
 */
export async function resolveShopDomainInput(raw: string): Promise<ResolvedShopDomain> {
  const cleaned = cleanDomainInput(String(raw || ''));
  if (!cleaned) {
    return { ok: false, error: 'Domínio da loja é obrigatório.' };
  }
  if (cleaned.endsWith('.myshopify.com')) {
    return { ok: true, shopDomain: cleaned };
  }
  if (!cleaned.includes('.')) {
    return { ok: true, shopDomain: `${cleaned}.myshopify.com` };
  }
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(cleaned)) {
    const resolved = await resolveMyshopifyFromCustomDomain(cleaned);
    if (!resolved) {
      return {
        ok: false,
        error: `Não foi possível descobrir o domínio .myshopify.com a partir de "${cleaned}". Use o domínio técnico da loja (Shopify Admin → Configurações → Domínios), ex: minhaloja.myshopify.com.`,
      };
    }
    return { ok: true, shopDomain: resolved };
  }
  return {
    ok: false,
    error: `Domínio inválido: "${cleaned}". Use o formato minhaloja.myshopify.com.`,
  };
}
