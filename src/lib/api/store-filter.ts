import type { SupabaseClient } from '@supabase/supabase-js'

export type StoreScope =
  | 'org-wide'        // Recurso da org. Ignora storeId.
  | 'store-or-org'    // Filtra por storeId OU NULL (recursos que podem ser globais ou store-specific).
  | 'store-required'  // Exige storeId válido. Rejeita se org tem 0 lojas E storeId é null.

/**
 * Resolve o storeId que o backend deve usar pra filtrar queries.
 *
 * Comportamento:
 *   - Valida storeId contra `shopify_stores` (escopado por org) — se for órfão
 *     (UUID que não existe em shopify_stores da org), trata como null.
 *   - Conta lojas ativas da org pra decidir se vale aplicar o filtro de store.
 *
 * Retorna { storeId, hasStores } onde:
 *   - `storeId` é o valor sanitizado a ser usado (null se inválido ou ausente)
 *   - `hasStores` indica se a org tem ao menos 1 loja ativa
 */
export async function resolveStoreContext(
  rawStoreId: string | null,
  orgId: string,
  supabase: SupabaseClient,
): Promise<{ storeId: string | null; hasStores: boolean }> {
  let storeId: string | null = null
  let hasStores = false

  const { count: storeCount } = await supabase
    .from('shopify_stores')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('is_active', true)
  hasStores = (storeCount || 0) > 0

  if (rawStoreId && hasStores) {
    // Confirma que o storeId pertence à org (defensivo contra cache poisoning)
    const { data: store } = await supabase
      .from('shopify_stores')
      .select('id')
      .eq('id', rawStoreId)
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .maybeSingle()
    if (store) storeId = store.id
  }

  return { storeId, hasStores }
}

/**
 * Aplica filtro de store_id em queries Supabase de acordo com o scope.
 *
 *   'org-wide'       — Ignora storeId. Para recursos que pertencem à org (ex: templates).
 *   'store-or-org'   — Filtra `store_id = X OR store_id IS NULL`. Para conversas, contatos,
 *                       deals — recursos que podem ser globais ou específicos da loja.
 *   'store-required' — Filtra `store_id = X`. Se storeId for null E org tem lojas, retorna
 *                       a flag `requiresStore=true` pro caller decidir se rejeita.
 *
 * Uso:
 * ```ts
 * const auth = await requireOrgFromAuth(request)
 * if (auth instanceof NextResponse) return auth
 * const { orgId } = auth
 * const rawStoreId = new URL(request.url).searchParams.get('storeId')
 *
 * const ctx = await resolveStoreContext(rawStoreId, orgId, supabase)
 * if (scope === 'store-required' && !ctx.storeId && ctx.hasStores) {
 *   return NextResponse.json({ error: 'storeId is required' }, { status: 400 })
 * }
 *
 * let query = supabase.from('whatsapp_cloud_conversations')
 *   .select('*').eq('organization_id', orgId)
 * query = applyStoreFilter(query, ctx, 'store-or-org')
 * ```
 *
 * Retorna a query encadeada — caller continua com `.order(...).limit(...)`.
 */
export function applyStoreFilter<Q extends { eq: any; or: any }>(
  query: Q,
  ctx: { storeId: string | null; hasStores: boolean },
  scope: StoreScope,
): Q {
  if (scope === 'org-wide') return query
  if (!ctx.hasStores) return query // single-tenant: nada pra filtrar

  if (scope === 'store-or-org') {
    if (ctx.storeId) {
      return query.or(`store_id.eq.${ctx.storeId},store_id.is.null`)
    }
    return query // sem storeId: devolve tudo da org (org-wide implícito)
  }

  if (scope === 'store-required') {
    if (ctx.storeId) return query.eq('store_id', ctx.storeId)
    return query // caller já deve ter retornado 400 antes de chegar aqui
  }

  return query
}
