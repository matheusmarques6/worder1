// =============================================================
// URL pública da loja — a fonte de {{store_url}}
//
// Uma loja Shopify tem DOIS hosts, e confundi-los era o defeito:
//
//   shop_domain     — 0p7tsk-i5.myshopify.com. É o host da Admin API.
//                     Nunca muda enquanto a loja existir. É por ele
//                     que webhooks, sync e tokens falam com a Shopify.
//
//   primary_domain  — drgroot.com. É o que o cliente vê na barra do
//                     navegador. O lojista troca quando quiser, e a
//                     Shopify informa o atual em shop.primaryDomain.
//
// {{store_url}} montava https://<shop_domain>, então todo link de
// rodapé, todo "voltar à loja", apontava para o *.myshopify.com. A
// Shopify até redireciona, mas o cliente vê um domínio estranho no
// e-mail e o clique perde a confiança.
//
// Aqui o público sai de primary_domain e cai em shop_domain só quando
// ainda não sabemos o principal. O principal é reconsultado a cada
// conexão e a cada sincronização — se o lojista trocar o domínio, a
// variável acompanha sozinha.
// =============================================================

export interface StoreHostLike {
  shop_domain?: string | null;
  primary_domain?: string | null;
}

const PLACEHOLDER_TLD = '.worder.local';

/**
 * Reduz qualquer forma ("https://Loja.com/path", "loja.com/") ao host
 * puro em minúsculas. Devolve '' para vazio, placeholder interno ou
 * lixo — assim quem chama trata '' como "não sei" e não monta link.
 */
export function normalizePublicHost(input?: string | null): string {
  if (!input || typeof input !== 'string') return '';
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, '');
  s = s.split(/[/?#]/)[0] || '';
  s = s.replace(/^www\./, '');
  if (!s || s.endsWith(PLACEHOLDER_TLD)) return '';
  // Um host tem letras/dígitos/hífens separados por ponto; recusa
  // espaços, aspas ou o que quer que tenha vazado de um payload.
  if (!/^[a-z0-9.-]+$/.test(s) || !s.includes('.')) return '';
  return s;
}

/** Host público da vitrine: o principal quando conhecido, senão o da API. */
export function publicStoreHost(store: StoreHostLike | null | undefined): string {
  if (!store) return '';
  return normalizePublicHost(store.primary_domain) || normalizePublicHost(store.shop_domain);
}

/** https://<host público>, ou '' quando não há host nenhum. */
export function publicStoreUrl(store: StoreHostLike | null | undefined): string {
  const host = publicStoreHost(store);
  return host ? `https://${host}` : '';
}

// -------------------------------------------------------------
// Consulta e atualização do domínio principal
// -------------------------------------------------------------

export interface ShopDomains {
  /** Host que o cliente vê (shop.primaryDomain.host). */
  primaryHost: string | null;
  /** *.myshopify.com permanente. */
  myshopifyHost: string | null;
  /**
   * Telefone público da loja (shop.billingAddress.phone). Alimenta
   * {{store_phone}}, que tinha coluna e nenhuma fonte.
   */
  phone: string | null;
}

/** Telefone só com o que faz sentido num rodapé: dígitos, +, espaços, ( ) -. */
export function normalizePhone(input?: string | null): string {
  if (!input || typeof input !== 'string') return '';
  // Limpa primeiro, apara depois: "tel: 31 3333-4444 ramal" perde as
  // letras e só então perde os espaços que elas deixaram nas pontas.
  const s = input.replace(/[^\d+()\-\s]/g, '').replace(/\s+/g, ' ').trim();
  return s.replace(/\D/g, '').length >= 8 ? s : '';
}

/**
 * Pergunta à Shopify quais são os dois hosts da loja. GraphQL porque o
 * campo primaryDomain é estável entre versões da API e vem já como host,
 * sem depender de a REST devolver `domain` com ou sem esquema.
 */
export async function fetchShopDomains(
  shopDomain: string,
  accessToken: string,
  apiVersion: string = '2026-04'
): Promise<ShopDomains | null> {
  try {
    const res = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `{ shop { myshopifyDomain primaryDomain { host } billingAddress { phone } } }`,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const shop = json?.data?.shop;
    if (!shop) return null;
    return {
      primaryHost: normalizePublicHost(shop.primaryDomain?.host) || null,
      myshopifyHost: normalizePublicHost(shop.myshopifyDomain) || null,
      phone: normalizePhone(shop.billingAddress?.phone) || null,
    };
  } catch {
    return null;
  }
}

/** Não vale a pena perguntar de novo antes disto. */
const REFRESH_TTL_MS = 6 * 60 * 60_000;

type MinimalClient = { from: (t: string) => any };

/**
 * Reconsulta o domínio principal (e o telefone público) e grava quando
 * mudaram. Silenciosa em erro: a sincronização que a chama não pode
 * falhar por causa disto.
 *
 * `force` ignora o intervalo mínimo — usado logo depois de conectar,
 * quando a linha acabou de nascer e ainda não tem domínio principal.
 */
export async function refreshPrimaryDomain(
  supabase: MinimalClient,
  store: {
    id: string;
    shop_domain?: string | null;
    access_token?: string | null;
    api_version?: string | null;
    primary_domain?: string | null;
    primary_domain_checked_at?: string | null;
    shop_phone?: string | null;
  },
  opts: { force?: boolean } = {}
): Promise<string | null> {
  if (!store?.id || !store.shop_domain || !store.access_token) return store?.primary_domain ?? null;
  if (store.access_token === 'manual') return store.primary_domain ?? null;

  if (!opts.force && store.primary_domain && store.primary_domain_checked_at) {
    const age = Date.now() - Date.parse(store.primary_domain_checked_at);
    if (Number.isFinite(age) && age < REFRESH_TTL_MS) return store.primary_domain;
  }

  const domains = await fetchShopDomains(store.shop_domain, store.access_token, store.api_version || '2026-04');
  if (!domains) return store.primary_domain ?? null;

  const primary = domains.primaryHost;
  const patch: Record<string, any> = { primary_domain_checked_at: new Date().toISOString() };
  // Só grava o principal quando a Shopify respondeu um de fato. Uma
  // resposta sem primaryDomain não pode apagar o que já sabíamos.
  if (primary && primary !== store.primary_domain) patch.primary_domain = primary;
  // Telefone segue a mesma regra: acompanha a Shopify quando ela informa,
  // nunca apaga por resposta vazia. Não há tela para editar à mão, então
  // a Shopify é a única fonte — se um dia houver, ela ganha desta.
  if (domains.phone && domains.phone !== (store.shop_phone || '')) patch.shop_phone = domains.phone;

  try {
    await supabase.from('shopify_stores').update(patch).eq('id', store.id);
  } catch {
    /* melhor esforço */
  }
  return primary || store.primary_domain || null;
}
