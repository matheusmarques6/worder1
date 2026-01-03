// =============================================
// API: Shopify Debug / Diagnóstico
// src/app/api/shopify/debug/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/api-utils'

// =============================================
// PROTEÇÃO: Debug routes devem ser bloqueadas em produção
// =============================================
const DEBUG_SECRET = process.env.DEBUG_ROUTE_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function isAuthorized(request: NextRequest): boolean {
  if (!IS_PRODUCTION) return true;
  if (!DEBUG_SECRET) return false;
  
  const providedSecret = request.headers.get('x-debug-secret') || 
                         request.nextUrl.searchParams.get('secret');
  return providedSecret === DEBUG_SECRET;
}

export async function GET(request: NextRequest) {
  // VERIFICAR AUTORIZAÇÃO
  if (!isAuthorized(request)) {
    console.warn('[Shopify Debug] Unauthorized access attempt');
    return NextResponse.json(
      { error: 'Not available in production without authorization' },
      { status: 403 }
    );
  }

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
    const diagnosis: any = {
      timestamp: new Date().toISOString(),
      organizationId,
      issues: [],
      recommendations: [],
    }

    // 1. Verificar se a loja existe
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (storeError) {
      diagnosis.issues.push(`Erro ao buscar loja: ${storeError.message}`)
    }

    if (!store) {
      diagnosis.issues.push('❌ Nenhuma loja Shopify encontrada')
      diagnosis.recommendations.push('Conecte sua loja Shopify em /integrations/shopify')
      return NextResponse.json(diagnosis)
    }

    diagnosis.store = {
      id: store.id,
      shop_domain: store.shop_domain,
      shop_name: store.shop_name,
      is_active: store.is_active,
      is_configured: store.is_configured,
      connection_status: store.connection_status,
      has_access_token: !!store.access_token,
      has_api_secret: !!store.api_secret,
    }

    // 2. Verificar configurações
    diagnosis.config = {
      default_pipeline_id: store.default_pipeline_id,
      default_stage_id: store.default_stage_id,
      contact_type: store.contact_type,
      sync_customers: store.sync_customers,
      sync_orders: store.sync_orders,
      sync_checkouts: store.sync_checkouts,
      auto_tags: store.auto_tags,
    }

    // Verificar problemas de configuração
    if (!store.is_active) {
      diagnosis.issues.push('❌ Integração está DESATIVADA')
      diagnosis.recommendations.push('Ative a integração na página de configurações')
    }

    if (!store.access_token) {
      diagnosis.issues.push('❌ Access token não encontrado')
      diagnosis.recommendations.push('Reconecte a loja Shopify')
    }

    if (!store.api_secret) {
      diagnosis.issues.push('⚠️ API Secret não configurado - webhooks não serão validados')
      diagnosis.recommendations.push('Configure o API Secret da sua app Shopify')
    }

    if (!store.default_pipeline_id) {
      diagnosis.issues.push('⚠️ Pipeline padrão não configurado')
      diagnosis.recommendations.push('Configure um pipeline padrão para criar deals')
    }

    if (!store.sync_customers && !store.sync_orders) {
      diagnosis.issues.push('❌ Nenhum evento habilitado para sincronização')
      diagnosis.recommendations.push('Habilite sync_customers e/ou sync_orders')
    }

    // 3. Verificar se pipeline existe
    if (store.default_pipeline_id) {
      const { data: pipeline } = await supabase
        .from('pipelines')
        .select('id, name')
        .eq('id', store.default_pipeline_id)
        .maybeSingle()

      if (!pipeline) {
        diagnosis.issues.push('❌ Pipeline configurado não existe')
        diagnosis.recommendations.push('Configure um pipeline válido')
      } else {
        diagnosis.pipeline = pipeline
      }
    }

    // 4. Verificar webhooks registrados no Shopify
    if (store.access_token) {
      try {
        const webhooksResponse = await fetch(
          `https://${store.shop_domain}/admin/api/2024-01/webhooks.json`,
          {
            headers: {
              'X-Shopify-Access-Token': store.access_token,
            },
          }
        )

        if (webhooksResponse.ok) {
          const { webhooks } = await webhooksResponse.json()
          diagnosis.registeredWebhooks = webhooks?.map((w: any) => ({
            id: w.id,
            topic: w.topic,
            address: w.address,
            created_at: w.created_at,
          })) || []

          if (!webhooks || webhooks.length === 0) {
            diagnosis.issues.push('❌ Nenhum webhook registrado no Shopify')
            diagnosis.recommendations.push('Registre os webhooks usando POST /api/shopify/webhooks/register')
          } else {
            // Verificar se webhooks apontam para URL correta
            const expectedUrl = process.env.NEXT_PUBLIC_APP_URL || ''
            const wrongUrls = webhooks.filter((w: any) => !w.address.includes(expectedUrl))
            if (wrongUrls.length > 0) {
              diagnosis.issues.push(`⚠️ ${wrongUrls.length} webhook(s) apontam para URL incorreta`)
            }
          }
        } else {
          diagnosis.issues.push('❌ Não foi possível verificar webhooks - token pode estar inválido')
        }
      } catch (e: any) {
        diagnosis.issues.push(`❌ Erro ao verificar webhooks: ${e.message}`)
      }
    }

    // 5. Verificar eventos de webhook recebidos
    const { data: recentEvents, error: eventsError } = await supabase
      .from('shopify_webhook_events')
      .select('*')
      .eq('store_id', store.id)
      .order('received_at', { ascending: false })
      .limit(10)

    if (!eventsError) {
      diagnosis.recentWebhookEvents = recentEvents || []
      
      if (!recentEvents || recentEvents.length === 0) {
        diagnosis.issues.push('⚠️ Nenhum evento de webhook recebido ainda')
        diagnosis.recommendations.push('Faça um pedido de teste ou cadastre um cliente na loja Shopify')
      }
    }

    // 6. Verificar pedidos importados
    const { data: recentOrders } = await supabase
      .from('shopify_orders')
      .select('id, shopify_order_id, shopify_order_number, financial_status, created_at')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(5)

    diagnosis.recentOrders = recentOrders || []

    // 7. Verificar checkouts
    const { data: recentCheckouts } = await supabase
      .from('shopify_checkouts')
      .select('id, shopify_checkout_id, status, created_at')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(5)

    diagnosis.recentCheckouts = recentCheckouts || []

    // 8. Verificar contatos criados pelo Shopify
    const { data: shopifyContacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, phone, source, created_at')
      .eq('organization_id', organizationId)
      .eq('source', 'shopify')
      .order('created_at', { ascending: false })
      .limit(10)

    diagnosis.shopifyContacts = shopifyContacts || []

    if (!shopifyContacts || shopifyContacts.length === 0) {
      diagnosis.issues.push('⚠️ Nenhum contato com source="shopify" encontrado')
    }

    // 9. Verificar deals criados
    if (store.default_pipeline_id) {
      const { data: recentDeals } = await supabase
        .from('deals')
        .select('id, title, value, stage_id, created_at, metadata')
        .eq('organization_id', organizationId)
        .eq('pipeline_id', store.default_pipeline_id)
        .order('created_at', { ascending: false })
        .limit(10)

      diagnosis.recentDeals = recentDeals || []
    }

    // 10. Resumo
    diagnosis.summary = {
      storeConnected: !!store,
      storeActive: store?.is_active,
      hasAccessToken: !!store?.access_token,
      hasApiSecret: !!store?.api_secret,
      hasPipelineConfigured: !!store?.default_pipeline_id,
      syncCustomersEnabled: store?.sync_customers,
      syncOrdersEnabled: store?.sync_orders,
      webhooksRegistered: diagnosis.registeredWebhooks?.length || 0,
      webhookEventsReceived: diagnosis.recentWebhookEvents?.length || 0,
      contactsCreated: diagnosis.shopifyContacts?.length || 0,
      ordersImported: diagnosis.recentOrders?.length || 0,
      issuesCount: diagnosis.issues.length,
    }

    // Status geral
    if (diagnosis.issues.length === 0) {
      diagnosis.status = '✅ Tudo OK'
    } else if (diagnosis.issues.some((i: string) => i.startsWith('❌'))) {
      diagnosis.status = '❌ Problemas críticos encontrados'
    } else {
      diagnosis.status = '⚠️ Avisos encontrados'
    }

    return NextResponse.json(diagnosis)
  } catch (error: any) {
    console.error('Error in Shopify debug:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
