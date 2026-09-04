import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError, validateStoreAccess } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

// =============================================================
// Feeds de produto — configuração (nome, tipo, filtros) que o editor
// de e-mail salva no bloco. Os PRODUTOS em si são resolvidos na hora
// do envio pela loja do e-mail (resolveProductFeed); aqui só se guarda
// a receita.
//
// Cada feed pertence a uma loja (store_id). Feeds antigos, criados
// antes da coluna existir, ficam com store_id nulo e valem para a
// organização inteira — continuam aparecendo em todas as lojas.
// =============================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Confere que a loja pedida é do usuário. Devolve o id validado, null
 * quando não veio loja, ou uma resposta de erro quando a loja é de outra
 * organização — nunca "ignora e segue".
 */
async function resolveRequestedStore(
  auth: NonNullable<Awaited<ReturnType<typeof getAuthClient>>>,
  raw: string | null | undefined
): Promise<string | null | NextResponse> {
  if (!raw) return null
  if (!UUID_RE.test(raw)) return NextResponse.json({ error: 'store_id inválido' }, { status: 400 })
  const access = await validateStoreAccess(auth.supabase as any, auth.user.organization_id, raw, auth.user.id)
  if (!access.valid) return NextResponse.json({ error: access.error }, { status: access.status || 403 })
  return raw
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const storeOrErr = await resolveRequestedStore(auth, request.nextUrl.searchParams.get('store_id'))
    if (storeOrErr instanceof NextResponse) return storeOrErr
    const storeId = storeOrErr

    let query = supabaseAdmin
      .from('product_feeds')
      .select('*')
      .eq('organization_id', auth.user.organization_id)
      .order('created_at', { ascending: false })
    // Com loja: os feeds dela + os da organização inteira (store_id nulo).
    // Sem loja: tudo da organização, como antes.
    if (storeId) query = query.or(`store_id.eq.${storeId},store_id.is.null`)

    const { data, error } = await query

    if (error) {
      console.error('[ProductFeeds] GET error:', error.message)
      // Table may not exist yet
      return NextResponse.json([])
    }
    return NextResponse.json(data || [])
  } catch (error: any) {
    console.error('[ProductFeeds] GET exception:', error)
    return NextResponse.json([])
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const body = await request.json()

    if (!body.name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const storeOrErr = await resolveRequestedStore(auth, body.store_id)
    if (storeOrErr instanceof NextResponse) return storeOrErr
    const storeId = storeOrErr

    // Only insert columns that exist in the table
    const insertData: Record<string, any> = {
      organization_id: auth.user.organization_id,
      store_id: storeId,
      name: body.name,
      feed_type: body.feed_type || 'bestsellers',
    }

    // Optional fields - only add if provided
    if (body.fallback_type) insertData.fallback_type = body.fallback_type
    if (body.time_period) insertData.time_period = body.time_period
    if (body.filters && Array.isArray(body.filters)) insertData.filters = body.filters
    if (body.max_products) insertData.max_products = body.max_products
    if (body.columns) insertData.columns = body.columns

    console.log('[ProductFeeds] Creating:', insertData)

    const { data, error } = await supabaseAdmin
      .from('product_feeds')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('[ProductFeeds] POST error:', error.message)

      // If column error, retry with minimal fields
      if (error.message?.includes('column') || error.code === '42703') {
        const minimalData = {
          organization_id: auth.user.organization_id,
          name: body.name,
          feed_type: body.feed_type || 'bestsellers',
        }
        const { data: d2, error: e2 } = await supabaseAdmin
          .from('product_feeds').insert(minimalData).select().single()
        if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
        return NextResponse.json(d2, { status: 201 })
      }

      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    console.error('[ProductFeeds] POST exception:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
