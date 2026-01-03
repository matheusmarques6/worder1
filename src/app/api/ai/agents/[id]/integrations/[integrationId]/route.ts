import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils';

// =====================================================
// GET - BUSCAR INTEGRAÇÃO ESPECÍFICA
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; integrationId: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const { id: agentId, integrationId } = params

    // RLS filtra automaticamente por organization_id
    const { data: integration, error } = await supabase
      .from('ai_agent_integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('agent_id', agentId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Integração não encontrada' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ integration })

  } catch (error: any) {
    console.error('Error in GET /api/ai/agents/[id]/integrations/[integrationId]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// PUT - ATUALIZAR INTEGRAÇÃO
// =====================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; integrationId: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const { id: agentId, integrationId } = params
    const body = await request.json()

    // Preparar dados para atualização
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Campos atualizáveis
    if (body.sync_products !== undefined) updateData.sync_products = body.sync_products
    if (body.sync_orders !== undefined) updateData.sync_orders = body.sync_orders
    if (body.allow_price_info !== undefined) updateData.allow_price_info = body.allow_price_info
    if (body.allow_stock_info !== undefined) updateData.allow_stock_info = body.allow_stock_info

    // Atualizar - RLS filtra automaticamente
    const { data: integration, error } = await supabase
      .from('ai_agent_integrations')
      .update(updateData)
      .eq('id', integrationId)
      .eq('agent_id', agentId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Integração não encontrada' }, { status: 404 })
      }
      throw error
    }

    return NextResponse.json({ integration })

  } catch (error: any) {
    console.error('Error in PUT /api/ai/agents/[id]/integrations/[integrationId]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// DELETE - REMOVER INTEGRAÇÃO
// =====================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; integrationId: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const { id: agentId, integrationId } = params

    // Buscar integração para obter source_id - RLS filtra automaticamente
    const { data: integration } = await supabase
      .from('ai_agent_integrations')
      .select('source_id')
      .eq('id', integrationId)
      .eq('agent_id', agentId)
      .single()

    // Deletar fonte de produtos associada
    if (integration?.source_id) {
      await supabase
        .from('ai_agent_chunks')
        .delete()
        .eq('source_id', integration.source_id)

      await supabase
        .from('ai_agent_sources')
        .delete()
        .eq('id', integration.source_id)
    }

    // Deletar integração - RLS filtra automaticamente
    const { error } = await supabase
      .from('ai_agent_integrations')
      .delete()
      .eq('id', integrationId)
      .eq('agent_id', agentId)

    if (error) {
      console.error('Error deleting integration:', error)
      throw error
    }

    return NextResponse.json({ success: true, message: 'Integração removida com sucesso' })

  } catch (error: any) {
    console.error('Error in DELETE /api/ai/agents/[id]/integrations/[integrationId]:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
