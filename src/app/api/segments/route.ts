import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient, authError } from '@/lib/api-utils'
export const dynamic = 'force-dynamic';

// =============================================
// API: /api/segments
// CRUD de segmentos de clientes
// =============================================

// GET - Listar segmentos
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  try {
    // Require a session — scope is derived from the caller, never the query.
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { searchParams } = new URL(request.url)
    const segment_id = searchParams.get('id')
    const include_count = searchParams.get('include_count') === 'true'
    const storeId = searchParams.get('store_id')
    const activeOnly = searchParams.get('active_only') === 'true'

    // Multi-org: all orgs the caller actually belongs to.
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', auth.user.id)
    const orgIds = [...new Set([
      auth.user.organization_id,
      ...((memberships || []).map((m: any) => m.organization_id)),
    ])]

    // Buscar segmento específico
    if (segment_id) {
      let singleQuery = supabase
        .from('customer_segments')
        .select('*')
        .eq('id', segment_id)
        .in('organization_id', orgIds)

      if (storeId) {
        singleQuery = singleQuery.eq('store_id', storeId)
      }

      const { data, error } = await singleQuery.single()

      if (error) throw error

      let members: any[] = []
      if (data.segment_type === 'static') {
        const { data: memberData } = await supabase
          .from('segment_members')
          .select('contact_id, contacts(*)')
          .eq('segment_id', segment_id)
          .limit(100)
        members = memberData || []
      }

      return NextResponse.json({ segment: data, members })
    }

    // Listar todos de TODAS as orgs do usuário
    let listQuery: any = supabase
      .from('customer_segments')
      .select('*')
      .in('organization_id', orgIds)
      .order('created_at', { ascending: false })

    if (storeId) {
      listQuery = listQuery.eq('store_id', storeId)
    }

    const { data: rawSegments, error } = await listQuery

    // Filter active-only in JS to avoid PostgREST duplicate .or() issues
    let segments = rawSegments
    if (activeOnly && segments) {
      segments = segments.filter((s: any) => s.is_active !== false)
    }

    if (error) throw error

    // Contar membros se solicitado
    if (include_count && segments) {
      for (const segment of segments) {
        const count = await getSegmentCount(segment)
        segment.contact_count = count
      }
    }

    return NextResponse.json({ segments })

  } catch (error: any) {
    console.error('[Segments] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Criar segmento
export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Resolve the user's actual orgs. Body's organization_id is only
    // honored if it's in this list; otherwise we drop back to the
    // primary org. Without this, anyone with an auth token could
    // create segments in any org by setting body.organization_id.
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', auth.user.id)
    const orgIds = [...new Set([auth.user.organization_id, ...(memberships || []).map((m: any) => m.organization_id)])]

    const body = await request.json()
    const {
      organization_id: bodyOrgId,
      name,
      description,
      color,
      icon,
      segment_type = 'dynamic',
      rules = [],
      rules_logic = 'AND',
      rfm_segments = [],
      contact_ids = [],
      store_id,
    } = body

    const organization_id =
      bodyOrgId && orgIds.includes(bodyOrgId) ? bodyOrgId : auth.user.organization_id

    if (!name) {
      return NextResponse.json({ error: 'name required' }, { status: 400 })
    }

    // Validate store_id belongs to this org so a leaked id can't
    // plant a segment on a foreign store.
    let validatedStoreId: string | null = null
    if (store_id) {
      const { data: storeRow } = await supabase
        .from('shopify_stores')
        .select('id')
        .eq('id', store_id)
        .eq('organization_id', organization_id)
        .maybeSingle()
      validatedStoreId = storeRow?.id || null
    }

    // Criar segmento
    const insertData: Record<string, any> = {
      organization_id,
      name,
      description,
      color,
      icon,
      segment_type,
      rules,
      rules_logic,
      rfm_segments,
      is_active: true,
    }
    if (validatedStoreId) insertData.store_id = validatedStoreId

    const { data: segment, error } = await supabase
      .from('customer_segments')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error

    // Se for estático e tiver contatos, validar que pertencem à
    // mesma org antes de adicionar — caso contrário um id leakado
    // permitiria plantar contatos estrangeiros num segmento.
    if (segment_type === 'static' && contact_ids.length > 0) {
      const { data: ownContacts } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organization_id)
        .in('id', contact_ids)
      const validIds = (ownContacts || []).map((c: any) => c.id)
      if (validIds.length > 0) {
        const members = validIds.map((contact_id: string) => ({
          segment_id: segment.id,
          contact_id,
        }))
        await supabase.from('segment_members').insert(members)
        await supabase
          .from('customer_segments')
          .update({ contact_count: validIds.length, last_count_at: new Date().toISOString() })
          .eq('id', segment.id)
      }
    }

    // Calcular contagem inicial para dinâmicos
    if (segment_type !== 'static') {
      const count = await getSegmentCount(segment)
      await supabase
        .from('customer_segments')
        .update({ contact_count: count, last_count_at: new Date().toISOString() })
        .eq('id', segment.id)
      segment.contact_count = count
    }

    return NextResponse.json({ segment })

  } catch (error: any) {
    console.error('[Segments] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Atualizar segmento
export async function PATCH(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Multi-org lookup: PATCH always scopes by user's actual orgs
    // so a leaked segment id can't be used to modify a foreign org's
    // segment.
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', auth.user.id)
    const orgIds = [...new Set([auth.user.organization_id, ...(memberships || []).map((m: any) => m.organization_id)])]

    const body = await request.json()
    const { id, organization_id: _ignored, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    // Confirm ownership before update.
    const { data: existing } = await supabase
      .from('customer_segments')
      .select('id, organization_id')
      .eq('id', id)
      .in('organization_id', orgIds)
      .maybeSingle()
    if (!existing) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 })
    }

    const { data: segment, error } = await supabase
      .from('customer_segments')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('organization_id', orgIds)
      .select()
      .single()

    if (error) throw error

    // Recalculate contact_count when rules changed
    if (updates.rules && segment) {
      const count = await getSegmentCount(segment)
      await supabase
        .from('customer_segments')
        .update({ contact_count: count, last_count_at: new Date().toISOString() })
        .eq('id', id)
      segment.contact_count = count
    }

    return NextResponse.json({ segment })

  } catch (error: any) {
    console.error('[Segments] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Remover segmento
export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    // Verify ownership before deleting. Multi-org members can
    // delete from any org they actually belong to, not only their
    // primary — earlier .eq('organization_id', user.organization_id)
    // silently no-op'd for secondary-org members.
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', auth.user.id)
    const orgIds = [...new Set([
      auth.user.organization_id,
      ...((memberships || []).map((m: any) => m.organization_id)),
    ])]

    const { data: seg } = await supabase
      .from('customer_segments')
      .select('organization_id')
      .eq('id', id)
      .in('organization_id', orgIds)
      .maybeSingle()

    if (!seg) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    await supabase.from('segment_members').delete().eq('segment_id', id)

    const { error } = await supabase
      .from('customer_segments')
      .delete()
      .eq('id', id)
      .in('organization_id', orgIds)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('[Segments] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =============================================
// HELPER: Contar membros do segmento
// =============================================
async function getSegmentCount(segment: any): Promise<number> {
  const supabase = getSupabaseAdmin()
  try {
    if (segment.segment_type === 'static') {
      const { count } = await supabase
        .from('segment_members')
        .select('*', { count: 'exact', head: true })
        .eq('segment_id', segment.id)
      return count || 0
    }

    if (segment.segment_type === 'rfm' && segment.rfm_segments?.length) {
      const { count } = await supabase
        .from('customer_rfm_scores')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', segment.organization_id)
        .in('rfm_segment', segment.rfm_segments)
      return count || 0
    }

    if (segment.segment_type === 'dynamic' && segment.rules) {
      // v2 segments live in the same `rules` JSONB but have shape
      // { version: 2, root: { type: 'group', ... } }. The simple
      // applyRule() helper only handles v1 ProfileRule shapes, so
      // for v2 we route through the dispatcher that understands the
      // full DSL (events, frequencies, sub-filters, anniversaries…).
      if (segment.rule_version === 2 || (segment.rules && typeof segment.rules === 'object' && segment.rules.version === 2)) {
        const { resolveSegment } = await import('@/lib/segments')
        const r = await resolveSegment(supabase, segment.id, segment.organization_id)
        return r.contactIds.length
      }

      if (!Array.isArray(segment.rules) || segment.rules.length === 0) return 0

      let query: any = supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', segment.organization_id)
        .not('store_id', 'is', null) // Only count contacts linked to a store

      // If the segment is itself store-scoped, narrow the count to
      // that store. Previous version always counted org-wide, so a
      // segment bound to Dr. Melaxin would show member counts that
      // included Based's matching contacts.
      if (segment.store_id) {
        query = query.eq('store_id', segment.store_id)
      }

      for (const rule of segment.rules) {
        query = applyRule(query, rule)
      }

      const { count } = await query
      return count || 0
    }

    return 0
  } catch (error) {
    console.error('[Segment Count] Error:', error)
    return 0
  }
}

// =============================================
// HELPER: Aplicar regra na query
// =============================================
function applyRule(query: any, rule: any) {
  const { field, operator, value } = rule

  switch (operator) {
    case 'equals':
      return query.eq(field, value)
    case 'not_equals':
      return query.neq(field, value)
    case 'contains':
      return query.ilike(field, `%${value}%`)
    case 'greater_than':
      return query.gt(field, value)
    case 'less_than':
      return query.lt(field, value)
    case 'is_null':
      return query.is(field, null)
    case 'is_not_null':
      return query.not(field, 'is', null)
    case 'in':
      return query.in(field, value)
    default:
      return query
  }
}
