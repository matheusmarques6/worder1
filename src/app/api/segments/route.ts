import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// =============================================
// API: /api/segments
// CRUD de segmentos de clientes
// =============================================

// GET - Listar segmentos
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organization_id = searchParams.get('organization_id')
    const segment_id = searchParams.get('id')
    const include_count = searchParams.get('include_count') === 'true'

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id required' }, { status: 400 })
    }

    // Buscar segmento específico
    if (segment_id) {
      const { data, error } = await supabase
        .from('customer_segments')
        .select('*')
        .eq('id', segment_id)
        .eq('organization_id', organization_id)
        .single()

      if (error) throw error

      // Buscar membros se for estático
      let members = []
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

    // Listar todos
    let query = supabase
      .from('customer_segments')
      .select('*')
      .eq('organization_id', organization_id)
      .order('created_at', { ascending: false })

    const { data: segments, error } = await query
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
      contact_ids = [], // Para segmentos estáticos
    } = body

    if (!organization_id || !name) {
      return NextResponse.json({ error: 'organization_id and name required' }, { status: 400 })
    }

    // Criar segmento
    const { data: segment, error } = await supabase
      .from('customer_segments')
      .insert({
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
      })
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
      
      // Atualizar contagem
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
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }

    // Remover membros primeiro
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
      // Construir query dinâmica baseada nas regras
      let query = supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', segment.organization_id)

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
