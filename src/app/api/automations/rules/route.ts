// =============================================
// Automation Rules API
// src/app/api/automations/rules/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic'

// GET - List all automation rules
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  const searchParams = request.nextUrl.searchParams
  const pipelineId = searchParams.get('pipelineId')
  const sourceType = searchParams.get('source')
  const actionType = searchParams.get('action')
  const storeId = searchParams.get('storeId') // ✅ NOVO: Filtro por loja

  try {
    // RLS filtra automaticamente por organization_id
    let query = supabase
      .from('automation_rules')
      .select(`
        *,
        pipeline:pipelines(id, name, color),
        initial_stage:pipeline_stages!automation_rules_initial_stage_id_fkey(id, name, color),
        target_stage:pipeline_stages!automation_rules_target_stage_id_fkey(id, name, color)
      `)
      .order('created_at', { ascending: false })

    // ✅ CRÍTICO: Filtrar por store_id para multi-tenant
    if (storeId) {
      query = query.eq('store_id', storeId)
    }
    
    if (pipelineId) {
      query = query.eq('pipeline_id', pipelineId)
    }
    if (sourceType) {
      query = query.eq('source_type', sourceType)
    }
    if (actionType) {
      query = query.eq('action_type', actionType)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ rules: data || [] })
  } catch (error: any) {
    console.error('Error fetching automation rules:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create new automation rule
export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    const body = await request.json()
    const {
      name,
      source_type,
      trigger_event,
      action_type,
      pipeline_id,
      initial_stage_id,
      target_stage_id,
      from_stage_id,
      filters,
      mark_as_won,
      mark_as_lost,
      is_enabled,
      store_id, // ✅ NOVO: Receber store_id
    } = body

    if (!name || !source_type || !trigger_event || !action_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ✅ NOVO: Validar store_id se fornecido
    if (store_id) {
      const { data: store, error: storeError } = await supabase
        .from('stores')
        .select('id')
        .eq('id', store_id)
        .single()
      
      if (storeError || !store) {
        return NextResponse.json({ error: 'Store not found or access denied' }, { status: 403 })
      }
    }

    // Get max position - RLS filtra automaticamente
    const { data: maxPos } = await supabase
      .from('automation_rules')
      .select('position')
      .order('position', { ascending: false })
      .limit(1)
      .single()

    const position = (maxPos?.position || 0) + 1

    // Usa organization_id do usuário autenticado
    const { data, error } = await supabase
      .from('automation_rules')
      .insert({
        organization_id: user.organization_id,
        store_id: store_id || null, // ✅ NOVO: Salvar store_id
        name,
        source_type,
        trigger_event,
        action_type,
        pipeline_id,
        initial_stage_id: initial_stage_id || null,
        target_stage_id: target_stage_id || null,
        from_stage_id: from_stage_id || null,
        filters: filters || {},
        mark_as_won: mark_as_won || false,
        mark_as_lost: mark_as_lost || false,
        is_enabled: is_enabled !== false,
        position,
        deals_created_count: 0,
        deals_moved_count: 0,
      })
      .select(`
        *,
        pipeline:pipelines(id, name, color),
        initial_stage:pipeline_stages!automation_rules_initial_stage_id_fkey(id, name, color),
        target_stage:pipeline_stages!automation_rules_target_stage_id_fkey(id, name, color)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ rule: data })
  } catch (error: any) {
    console.error('Error creating automation rule:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
