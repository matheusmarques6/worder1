import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// =====================================================
// SUPABASE CLIENT
// =====================================================

function getSupabase() {
  return getSupabaseAdmin();
}

// =====================================================
// GET - BUSCAR AGENTE POR ID
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase()
    const agentId = params.id

    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    // Buscar agente
    const { data: agent, error } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('id', agentId)
      .eq('organization_id', organizationId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ agent })

  } catch (error: any) {
    console.error('Error in GET /api/ai/agents/[id]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// PUT - ATUALIZAR AGENTE COMPLETO
// =====================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase()
    const agentId = params.id
    const body = await request.json()

    const { organization_id } = body

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    // Verificar se agente existe
    const { data: existing, error: checkError } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('id', agentId)
      .eq('organization_id', organization_id)
      .single()

    if (checkError || !existing) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    // Preparar dados para atualização
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Campos atualizáveis
    const allowedFields = [
      'name',
      'description',
      'system_prompt',
      'provider',
      'model',
      'temperature',
      'max_tokens',
      'is_active',
      'persona',
      'settings',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Atualizar
    const { data: agent, error } = await supabase
      .from('ai_agents')
      .update(updateData)
      .eq('id', agentId)
      .eq('organization_id', organization_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating agent:', error)
      throw error
    }

    return NextResponse.json({ agent })

  } catch (error: any) {
    console.error('Error in PUT /api/ai/agents/[id]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// PATCH - ATUALIZAR CAMPOS ESPECÍFICOS
// =====================================================

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase()
    const agentId = params.id
    const body = await request.json()

    const { organization_id } = body

    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    // Preparar dados para atualização
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Campos permitidos em PATCH
    const allowedFields = [
      'name',
      'description',
      'is_active',
      'persona',
      'settings',
      'system_prompt',
      'provider',
      'model',
      'temperature',
      'max_tokens',
    ]

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field]
      }
    }

    // Atualizar
    const { data: agent, error } = await supabase
      .from('ai_agents')
      .update(updateData)
      .eq('id', agentId)
      .eq('organization_id', organization_id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ agent })

  } catch (error: any) {
    console.error('Error in PATCH /api/ai/agents/[id]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// DELETE - REMOVER AGENTE
// =====================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase()
    const agentId = params.id

    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    // Deletar (cascata remove fontes, chunks, ações, integrações)
    const { error } = await supabase
      .from('ai_agents')
      .delete()
      .eq('id', agentId)
      .eq('organization_id', organizationId)

    if (error) {
      console.error('Error deleting agent:', error)
      throw error
    }

    return NextResponse.json({ success: true, message: 'Agente excluído com sucesso' })

  } catch (error: any) {
    console.error('Error in DELETE /api/ai/agents/[id]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
