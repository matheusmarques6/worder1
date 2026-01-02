// =============================================
// Automation Rule by ID API
// src/app/api/automations/rules/[id]/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic'

function getSupabase() {
  return getSupabaseAdmin();
}

// GET - Get single rule
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const searchParams = request.nextUrl.searchParams
  const organizationId = searchParams.get('organizationId')

  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
  }

  try {
    const { data, error } = await supabase
      .from('automation_rules')
      .select(`
        *,
        pipeline:pipelines(id, name, color),
        initial_stage:pipeline_stages!automation_rules_initial_stage_id_fkey(id, name, color),
        target_stage:pipeline_stages!automation_rules_target_stage_id_fkey(id, name, color)
      `)
      .eq('id', params.id)
      .eq('organization_id', organizationId)
      .single()

    if (error) throw error

    return NextResponse.json({ rule: data })
  } catch (error: any) {
    console.error('Error fetching automation rule:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT - Update rule
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (name !== undefined) updates.name = name
    if (source_type !== undefined) updates.source_type = source_type
    if (trigger_event !== undefined) updates.trigger_event = trigger_event
    if (action_type !== undefined) updates.action_type = action_type
    if (pipeline_id !== undefined) updates.pipeline_id = pipeline_id
    if (initial_stage_id !== undefined) updates.initial_stage_id = initial_stage_id
    if (target_stage_id !== undefined) updates.target_stage_id = target_stage_id
    if (from_stage_id !== undefined) updates.from_stage_id = from_stage_id
    if (filters !== undefined) updates.filters = filters
    if (mark_as_won !== undefined) updates.mark_as_won = mark_as_won
    if (mark_as_lost !== undefined) updates.mark_as_lost = mark_as_lost
    if (is_enabled !== undefined) updates.is_enabled = is_enabled

    const { data, error } = await supabase
      .from('automation_rules')
      .update(updates)
      .eq('id', params.id)
      .eq('organization_id', organizationId)
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
    console.error('Error updating automation rule:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - Toggle or partial update
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { organizationId, is_enabled } = body

    if (!organizationId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
    }

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (is_enabled !== undefined) updates.is_enabled = is_enabled

    const { data, error } = await supabase
      .from('automation_rules')
      .update(updates)
      .eq('id', params.id)
      .eq('organization_id', organizationId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ rule: data })
  } catch (error: any) {
    console.error('Error patching automation rule:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete rule
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const searchParams = request.nextUrl.searchParams
  const organizationId = searchParams.get('organizationId')

  if (!organizationId) {
    return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
  }

  try {
    const { error } = await supabase
      .from('automation_rules')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', organizationId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting automation rule:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
