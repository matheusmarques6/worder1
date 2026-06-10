import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient } from '@/lib/api-utils';
import { assertAgentInOrg } from '@/lib/ai/agent-access';
export const dynamic = 'force-dynamic';

// =====================================================
// GET - BUSCAR INTEGRAÇÃO ESPECÍFICA
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; integrationId: string } }
) {
  try {
    // ✅ P1: org SEMPRE do usuário autenticado; organization_id da
    // querystring é aceito e IGNORADO (compat com frontend atual).
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin()
    const { id: agentId, integrationId } = params
    const organizationId = auth.user.organization_id

    const access = await assertAgentInOrg(supabase, agentId, organizationId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    const { data: integration, error } = await supabase
      .from('ai_agent_integrations')
      .select('*')
      .eq('id', integrationId)
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)
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
  try {
    // ✅ P1: org SEMPRE do usuário autenticado; organization_id do
    // body é aceito e IGNORADO (compat com frontend atual).
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin()
    const { id: agentId, integrationId } = params
    const organizationId = auth.user.organization_id
    const body = await request.json()

    const access = await assertAgentInOrg(supabase, agentId, organizationId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    // Preparar dados para atualização
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    // Campos atualizáveis
    if (body.sync_products !== undefined) updateData.sync_products = body.sync_products
    if (body.sync_orders !== undefined) updateData.sync_orders = body.sync_orders
    if (body.allow_price_info !== undefined) updateData.allow_price_info = body.allow_price_info
    if (body.allow_stock_info !== undefined) updateData.allow_stock_info = body.allow_stock_info

    // Atualizar
    const { data: integration, error } = await supabase
      .from('ai_agent_integrations')
      .update(updateData)
      .eq('id', integrationId)
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)
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
  try {
    // ✅ P1: org SEMPRE do usuário autenticado; organization_id da
    // querystring é aceito e IGNORADO (compat com frontend atual).
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin()
    const { id: agentId, integrationId } = params
    const organizationId = auth.user.organization_id

    const access = await assertAgentInOrg(supabase, agentId, organizationId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    // Buscar integração para obter source_id
    const { data: integration } = await supabase
      .from('ai_agent_integrations')
      .select('source_id')
      .eq('id', integrationId)
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)
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

    // Deletar integração
    const { error } = await supabase
      .from('ai_agent_integrations')
      .delete()
      .eq('id', integrationId)
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)

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
