import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils';

// =====================================================
// GET - BUSCAR AÇÃO ESPECÍFICA
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; actionId: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const { id: agentId, actionId } = params

    const { data: action, error } = await supabase
      .from('ai_agent_actions')
      .select('*')
      .eq('id', actionId)
      .eq('agent_id', agentId)
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
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const { id: agentId, actionId } = params
    const body = await request.json()

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    const allowedFields = [
      'name',
      'description',
      'action_type',
      'trigger_keywords',
      'conditions',
      'actions',
      'is_active',
      'priority',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    const { data: action, error } = await supabase
      .from('ai_agent_actions')
      .update(updateData)
      .eq('id', actionId)
      .eq('agent_id', agentId)
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
    console.error('Error in PUT /api/ai/agents/[id]/actions/[actionId]:', error)
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
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const { id: agentId, actionId } = params

    const { error } = await supabase
      .from('ai_agent_actions')
      .delete()
      .eq('id', actionId)
      .eq('agent_id', agentId)

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
