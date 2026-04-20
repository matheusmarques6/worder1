import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
export const dynamic = 'force-dynamic';

// =============================================
// API: /api/segments
// CRUD de segmentos de clientes
// =============================================

// GET - Listar segmentos
export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  try {
    const { searchParams } = new URL(request.url)
    let organization_id = searchParams.get('organization_id')
    const segment_id = searchParams.get('id')
    const include_count = searchParams.get('include_count') === 'true'
    const storeId = searchParams.get('store_id')

    // If no org_id provided, try to get from auth
    if (!organization_id) {
      const auth = await getAuthClient()
      if (auth) {
        organization_id = auth.user.organization_id
      }
    }

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id required' }, { status: 400 })
    }

    // Multi-org: get all orgs user has access to
    const auth = await getAuthClient()
    let orgIds = [organization_id]
    if (auth) {
      const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', auth.user.id)
      if (memberships?.length) {
        orgIds = [...new Set([organization_id, ...memberships.map((m: any) => m.organization_id)])]
      }
    }

    // Buscar segmento específico
    if (segment_id) {
      let singleQuery = supabase
        .from('customer_segments')
        .select('*')
        .eq('id', segment_id)
        .in('organization_id', orgIds)

      if (storeId) {
        singleQuery = singleQuery.or(`store_id.eq.${storeId},store_id.is.null`)
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
    let listQuery = supabase
      .from('customer_segments')
      .select('*')
      .in('organization_id', orgIds)
      .order('created_at', { ascending: false })

    if (storeId) {
      listQuery = listQuery.or(`store_id.eq.${storeId},store_id.is.null`)
    }

    const { data: segments, error } = await listQuery

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
    const body = await request.json()
    const {
      organization_id,
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

    if (!organization_id || !name) {
      return NextResponse.json({ error: 'organization_id and name required' }, { status: 400 })
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
    if (store_id) insertData.store_id = store_id

    const { data: segment, error } = await supabase
      .from('customer_segments')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error

    // Se for estático e tiver contatos, adicionar
    if (segment_type === 'static' && contact_ids.length > 0) {
      const members = contact_ids.map((contact_id: string) => ({
        segment_id: segment.id,
        contact_id,
      }))

      await supabase.from('segment_members').insert(members)
      
      await supabase
        .from('customer_segments')
        .update({ contact_count: contact_ids.length, last_count_at: new Date().toISOString() })
        .eq('id', segment.id)
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
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    const { data: segment, error } = await supabase
      .from('customer_segments')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

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

    await supabase.from('segment_members').delete().eq('segment_id', id)

    const { error } = await supabase
      .from('customer_segments')
      .delete()
      .eq('id', id)

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

    if (segment.segment_type === 'dynamic' && segment.rules?.length) {
      let query: any = supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', segment.organization_id)
        .not('store_id', 'is', null) // Only count contacts linked to a store

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
