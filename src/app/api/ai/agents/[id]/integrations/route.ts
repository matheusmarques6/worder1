import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// =====================================================
// SUPABASE CLIENT
// =====================================================

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Supabase não configurado')
  }

  return createClient(url, key)
}

// =====================================================
// GET - LISTAR INTEGRAÇÕES DO AGENTE
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

    // Buscar integrações do agente
    const { data: integrations, error } = await supabase
      .from('ai_agent_integrations')
      .select('*')
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching integrations:', error)
      throw error
    }

    // Buscar integrações disponíveis (configuradas no sistema)
    const { data: availableIntegrations } = await supabase
      .from('integrations')
      .select('id, name, type, config')
      .eq('organization_id', organizationId)
      .in('type', ['shopify', 'woocommerce', 'nuvemshop'])
      .eq('is_active', true)

    return NextResponse.json({
      integrations: integrations || [],
      available: availableIntegrations || [],
    })

  } catch (error: any) {
    console.error('Error in GET /api/ai/agents/[id]/integrations:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// POST - CONECTAR INTEGRAÇÃO AO AGENTE
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabase()
    const agentId = params.id
    const body = await request.json()

    const { organization_id, integration_id, integration_type } = body

    // Validações
    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    if (!integration_type || !['shopify', 'woocommerce', 'nuvemshop'].includes(integration_type)) {
      return NextResponse.json({ error: 'integration_type inválido' }, { status: 400 })
    }

    // Verificar se agente existe
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('id', agentId)
      .eq('organization_id', organization_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    // Verificar se já existe integração do mesmo tipo
    const { data: existing } = await supabase
      .from('ai_agent_integrations')
      .select('id')
      .eq('agent_id', agentId)
      .eq('integration_type', integration_type)
      .single()

    if (existing) {
      return NextResponse.json({ 
        error: `Já existe uma integração ${integration_type} para este agente` 
      }, { status: 400 })
    }

    // Criar integração
    const integrationData = {
      organization_id,
      agent_id: agentId,
      integration_id: integration_id || null,
      integration_type,
      sync_products: body.sync_products ?? true,
      sync_orders: body.sync_orders ?? false,
      allow_price_info: body.allow_price_info ?? true,
      allow_stock_info: body.allow_stock_info ?? true,
      products_synced: 0,
      sync_status: 'pending',
    }

    const { data: integration, error } = await supabase
      .from('ai_agent_integrations')
      .insert(integrationData)
      .select()
      .single()

    if (error) {
      console.error('Error creating integration:', error)
      throw error
    }

    // Se sync_products está ativo, criar fonte de produtos
    if (integrationData.sync_products) {
      await createProductSource(supabase, organization_id, agentId, integration.id, integration_type)
    }

    return NextResponse.json({ integration }, { status: 201 })

  } catch (error: any) {
    console.error('Error in POST /api/ai/agents/[id]/integrations:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// HELPER: Criar fonte de produtos
// =====================================================

async function createProductSource(
  supabase: any,
  organizationId: string,
  agentId: string,
  integrationId: string,
  integrationType: string
) {
  try {
    const { data: source, error } = await supabase
      .from('ai_agent_sources')
      .insert({
        organization_id: organizationId,
        agent_id: agentId,
        source_type: 'products',
        name: `Produtos ${integrationType}`,
        integration_id: integrationId,
        integration_type: integrationType,
        products_count: 0,
        status: 'pending',
        chunks_count: 0,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating product source:', error)
    }

    // Atualizar integração com source_id
    if (source) {
      await supabase
        .from('ai_agent_integrations')
        .update({ source_id: source.id })
        .eq('id', integrationId)
    }

    return source
  } catch (err) {
    console.error('Error in createProductSource:', err)
    return null
  }
}
