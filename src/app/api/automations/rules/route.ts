// =============================================
// Automation Rules API
// src/app/api/automations/rules/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// GET - List all automation rules
export async function GET(request: NextRequest) {
  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const searchParams = request.nextUrl.searchParams
  const organizationId = searchParams.get('organizationId')
  const pipelineId = searchParams.get('pipelineId')
  const sourceType = searchParams.get('source')
  const actionType = searchParams.get('action')

  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
  }

  try {
    let query = supabase
      .from('automation_rules')
      .select(`
        *,
        pipeline:pipelines(id, name, color),
        initial_stage:pipeline_stages!automation_rules_initial_stage_id_fkey(id, name, color),
        target_stage:pipeline_stages!automation_rules_target_stage_id_fkey(id, name, color)
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

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
  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const {
      organizationId,
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
    } = body

    if (!organizationId || !name || !source_type || !trigger_event || !action_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get max position
    const { data: maxPos } = await supabase
      .from('automation_rules')
      .select('position')
      .eq('organization_id', organizationId)
      .order('position', { ascending: false })
      .limit(1)
      .single()

    const position = (maxPos?.position || 0) + 1

    const { data, error } = await supabase
      .from('automation_rules')
      .insert({
        organization_id: organizationId,
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
