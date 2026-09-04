// Resolve a store's public shop_domain by store id, for building ABSOLUTE
// product/checkout links in automation message bodies (email/WhatsApp/SMS).
//
// Why this exists: the automation execution context reads the store host from
// `context.store?.domain`, but the context builders (process-runs,
// workers/automation, auto-process, webhooks/flow) historically only set
// `storeId`. Without the host, a relative ProductURL ("/products/x") ships as
// a broken link (404 on the app domain). Every context builder should call
// this and attach `store: { domain }` so variableEngine + node-executors +
// resolveCartBlocks always have the authoritative host.
//
// Module-cached: shop_domain is stable, so we cache per warm lambda to avoid a
// lookup on every run.

type MinimalClient = {
  from: (t: string) => any
}

export interface StoreIdentity {
  domain: string | null
  name: string | null
  email: string | null
  phone: string | null
}

const cache = new Map<string, StoreIdentity>()

/**
 * Identidade da loja para o contexto da automação.
 *
 * Antes só o domínio era carregado, então {{store_name}} lia
 * context.store.name — que nunca existia — e saía vazio em TODO e-mail
 * de automação; {{store_email}} e {{store_phone}} nem chegavam ao
 * mergeData. As três eram oferecidas no seletor e nenhuma funcionava.
 */
export async function resolveStoreIdentity(
  supabase: MinimalClient | null | undefined,
  storeId: string | null | undefined
): Promise<StoreIdentity> {
  const vazio: StoreIdentity = { domain: null, name: null, email: null, phone: null }
  if (!storeId || !supabase) return vazio
  const hit = cache.get(storeId)
  if (hit) return hit
  let identity = vazio
  try {
    const { data } = await supabase
      .from('shopify_stores')
      .select('shop_domain, shop_name, shop_email, shop_phone')
      // maybeSingle + tratamento explícito: um select com coluna errada
      // devolve erro, e engolir isso foi o que deixou as variáveis de
      // loja vazias por meses sem nenhum sinal.
      .eq('id', storeId)
      .maybeSingle()
    if (data) {
      identity = {
        domain: (data.shop_domain as string) || null,
        name: (data.shop_name as string) || null,
        email: (data.shop_email as string) || null,
        phone: (data.shop_phone as string) || null,
      }
    }
  } catch {
    identity = vazio
  }
  cache.set(storeId, identity)
  return identity
}

export async function resolveStoreShopDomain(
  supabase: MinimalClient | null | undefined,
  storeId: string | null | undefined
): Promise<string | null> {
  return (await resolveStoreIdentity(supabase, storeId)).domain
}

/** Build the `store` context field ({ domain }) or undefined when unknown. */
export async function buildStoreContext(
  supabase: MinimalClient | null | undefined,
  storeId: string | null | undefined
): Promise<{ domain: string } | undefined> {
  const domain = await resolveStoreShopDomain(supabase, storeId)
  return domain ? { domain } : undefined
}
