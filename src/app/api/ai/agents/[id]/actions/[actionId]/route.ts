import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// =====================================================
// SUPABASE CLIENT
// =====================================================

function getSupabase() {
  return getSupabaseAdmin();
}

// =====================================================
// GET - BUSCAR AÇÃO ESPECÍFICA
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; actionId: string } }
) {
  try {
    const supabase = getSupabase()
    const { id: agentId, actionId } = params

    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    const { data: action, error } = await supabase
      .from('ai_agent_actions')
      .select('*')
      .eq('id', actionId)
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Ação não encontrada' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ action })

  } catch (error: any) {
    console.error('Error in GET /api/ai/agents/[id]/actions/[actionId]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// PUT - ATUALIZAR AÇÃO
// =====================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; actionId: string } }
) {
  try {
    const supabase = getSupabase()
    const { id: agentId, actionId } = params
    const body = await request.json()

    const { organization_id } = body

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    // Verificar se ação existe
    const { data: existing, error: checkError } = await supabase
      .from('ai_agent_actions')
      .select('id')
      .eq('id', actionId)
      .eq('agent_id', agentId)
      .eq('organization_id', organization_id)
      .single()

    if (checkError || !existing) {
      return NextResponse.json({ error: 'Ação não encontrada' }, { status: 404 })
    }

    // Preparar dados para atualização
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Campos atualizáveis
    if (body.name !== undefined) updateData.name = body.name.trim()
    if (body.description !== undefined) updateData.description = body.description?.trim() || null
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.priority !== undefined) updateData.priority = body.priority

    // Conditions
    if (body.conditions) {
      updateData.conditions = {
        match_type: body.conditions.match_type || 'all',
        items: body.conditions.items?.map((item: any) => ({
          id: item.id || crypto.randomUUID(),
          type: item.type,
          intent: item.intent,
          custom_intent: item.custom_intent,
          sentiment: item.sentiment,
          keywords: item.keywords,
          time_range: item.time_range,
          days: item.days,
        })) || [],
      }
    }

    // Actions
    if (body.actions) {
      updateData.actions = body.actions.map((action: any) => ({
        id: action.id || crypto.randomUUID(),
        type: action.type,
        transfer_to: action.transfer_to,
        agent_id: action.agent_id,
        message: action.message,
        source_id: action.source_id,
        ask_field: action.ask_field,
        custom_field: action.custom_field,
        topic: action.topic,
      }))
    }

    // Atualizar
    const { data: action, error } = await supabase
      .from('ai_agent_actions')
      .update(updateData)
      .eq('id', actionId)
      .eq('agent_id', agentId)
      .eq('organization_id', organization_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating action:', error)
      throw error
    }

    return NextResponse.json({ action })

  } catch (error: any) {
    console.error('Error in PUT /api/ai/agents/[id]/actions/[actionId]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// PATCH - ATUALIZAR CAMPOS ESPECÍFICOS
// =====================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; actionId: string } }
) {
  try {
    const supabase = getSupabase()
    const { id: agentId, actionId } = params
    const body = await request.json()

    const { organization_id } = body

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    // Preparar dados
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Campos permitidos em PATCH
    if (body.name !== undefined) updateData.name = body.name
    if (body.is_active !== undefined) updateData.is_active = body.is_active
    if (body.priority !== undefined) updateData.priority = body.priority

    // Atualizar
    const { data: action, error } = await supabase
      .from('ai_agent_actions')
      .update(updateData)
      .eq('id', actionId)
      .eq('agent_id', agentId)
      .eq('organization_id', organization_id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Ação não encontrada' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ action })

  } catch (error: any) {
    console.error('Error in PATCH /api/ai/agents/[id]/actions/[actionId]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// DELETE - REMOVER AÇÃO
// =====================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; actionId: string } }
) {
  try {
    const supabase = getSupabase()
    const { id: agentId, actionId } = params

    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    const { error } = await supabase
      .from('ai_agent_actions')
      .delete()
      .eq('id', actionId)
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)

    if (error) {
      console.error('Error deleting action:', error)
      throw error
    }

    return NextResponse.json({ success: true, message: 'Ação excluída com sucesso' })

  } catch (error: any) {
    console.error('Error in DELETE /api/ai/agents/[id]/actions/[actionId]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
