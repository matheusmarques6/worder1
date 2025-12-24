import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'

// GET - List installed integrations for an organization
export async function GET(request: NextRequest) {
  const supabase = getSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const searchParams = request.nextUrl.searchParams
  const organizationId = searchParams.get('organizationId')

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
  }

  try {
    // 1. Buscar integrações instaladas da tabela padrão
    const { data: installed, error } = await supabase
      .from('installed_integrations')
      .select(`
        *,
        integration:integrations(*)
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const result = [...(installed || [])]

    // 2. Verificar se tem Shopify conectado na tabela shopify_stores
    const { data: shopifyStore } = await supabase
      .from('shopify_stores')
      .select('id, shop_name, shop_domain, is_active, is_configured, connection_status, created_at')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle()

    // 3. Se tem Shopify conectado, buscar o ID da integração Shopify
    if (shopifyStore) {
      const { data: shopifyIntegration } = await supabase
        .from('integrations')
        .select('*')
        .ilike('slug', '%shopify%')
        .maybeSingle()

      if (shopifyIntegration) {
        // Verificar se já não está na lista (evitar duplicata)
        const alreadyInList = result.some(i => i.integration_id === shopifyIntegration.id)
        
        if (!alreadyInList) {
          // Adicionar Shopify como integração instalada
          result.push({
            id: `shopify-${shopifyStore.id}`,
            organization_id: organizationId,
            integration_id: shopifyIntegration.id,
            status: shopifyStore.connection_status === 'active' ? 'active' : 
                   shopifyStore.connection_status === 'error' ? 'error' : 
                   shopifyStore.is_configured ? 'active' : 'configuring',
            configuration: {
              shop_domain: shopifyStore.shop_domain,
              shop_name: shopifyStore.shop_name,
            },
            default_pipeline_id: null,
            auto_tags: ['shopify'],
            last_sync_at: null,
            error_count: 0,
            last_error_message: null,
            created_at: shopifyStore.created_at,
            integration: shopifyIntegration,
            // Flag para identificar que vem da tabela shopify_stores
            _source: 'shopify_stores',
            _store_id: shopifyStore.id,
          })
        }
      }
    }

    return NextResponse.json({ installed: result })
  } catch (error: any) {
    console.error('Error fetching installed integrations:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Install a new integration
export async function POST(request: NextRequest) {
  const supabase = getSupabaseClient()

  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const {
      organizationId,
      integrationId,
      defaultPipelineId,
      defaultStageId,
      autoTags,
      configuration,
    } = body

    if (!organizationId || !integrationId) {
      return NextResponse.json(
        { error: 'organizationId and integrationId required' },
        { status: 400 }
      )
    }

    // Check if already installed
    const { data: existing } = await supabase
      .from('installed_integrations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('integration_id', integrationId)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'Integration already installed' },
        { status: 400 }
      )
    }

    // Install
    const { data: installed, error } = await supabase
      .from('installed_integrations')
      .insert({
        organization_id: organizationId,
        integration_id: integrationId,
        default_pipeline_id: defaultPipelineId || null,
        default_stage_id: defaultStageId || null,
        auto_tags: autoTags || [],
        configuration: configuration || {},
        status: 'configuring',
      })
      .select(`
        *,
        integration:integrations(*)
      `)
      .single()

    if (error) throw error

    return NextResponse.json({ installed }, { status: 201 })
  } catch (error: any) {
    console.error('Error installing integration:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
