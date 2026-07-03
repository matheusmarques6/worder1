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

const cache = new Map<string, string | null>()

export async function resolveStoreShopDomain(
  supabase: MinimalClient | null | undefined,
  storeId: string | null | undefined
): Promise<string | null> {
  if (!storeId || !supabase) return null
  if (cache.has(storeId)) return cache.get(storeId)!
  let domain: string | null = null
  try {
    const { data } = await supabase
      .from('shopify_stores')
      .select('shop_domain')
      .eq('id', storeId)
      .maybeSingle()
    domain = (data?.shop_domain as string) || null
  } catch {
    domain = null
  }
  cache.set(storeId, domain)
  return domain
}

/** Build the `store` context field ({ domain }) or undefined when unknown. */
export async function buildStoreContext(
  supabase: MinimalClient | null | undefined,
  storeId: string | null | undefined
): Promise<{ domain: string } | undefined> {
  const domain = await resolveStoreShopDomain(supabase, storeId)
  return domain ? { domain } : undefined
}
