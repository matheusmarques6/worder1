// =============================================
// Test Automation Rules API
// src/app/api/automations/test-rules/route.ts
//
// GET: Verifica regras ativas e simula execução
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const organizationId = request.nextUrl.searchParams.get('organizationId');
  const sourceType = request.nextUrl.searchParams.get('sourceType') || 'shopify';
  const triggerEvent = request.nextUrl.searchParams.get('triggerEvent') || 'order_paid';

  if (!organizationId) {
    return NextResponse.json({ error: 'organizationId required' }, { status: 400 });
  }

  try {
    // 1. Verificar se tabela existe
    const { data: tableCheck, error: tableError } = await supabase
      .from('pipeline_automation_rules')
      .select('id')
      .limit(1);

    if (tableError) {
      return NextResponse.json({
        success: false,
        error: 'Table pipeline_automation_rules does not exist',
        details: tableError.message,
        solution: 'Execute the SQL migration: supabase/migrations/pipeline-automation-rules.sql',
      }, { status: 500 });
    }

    // 2. Buscar todas as regras da organização
    const { data: allRules, error: allRulesError } = await supabase
      .from('pipeline_automation_rules')
      .select(`
        *,
        pipeline:pipelines!pipeline_id(id, name),
        initial_stage:pipeline_stages!initial_stage_id(id, name, color)
      `)
      .eq('organization_id', organizationId);

    if (allRulesError) {
      return NextResponse.json({
        success: false,
        error: 'Error fetching rules',
        details: allRulesError.message,
      }, { status: 500 });
    }

    // 3. Buscar regras ativas para o evento específico
    const { data: activeRules, error: activeError } = await supabase
      .from('pipeline_automation_rules')
      .select(`
        *,
        pipeline:pipelines!pipeline_id(id, name),
        initial_stage:pipeline_stages!initial_stage_id(id, name, color)
      `)
      .eq('organization_id', organizationId)
      .eq('source_type', sourceType)
      .eq('trigger_event', triggerEvent)
      .eq('is_enabled', true);

    if (activeError) {
      return NextResponse.json({
        success: false,
        error: 'Error fetching active rules',
        details: activeError.message,
      }, { status: 500 });
    }

    // 4. Verificar configuração do Shopify
    const { data: shopifyStore } = await supabase
      .from('shopify_stores')
      .select('id, shop_domain, is_active, default_pipeline_id, default_stage_id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();

    // 5. Verificar webhooks registrados
    const { data: webhookEvents } = await supabase
      .from('shopify_webhook_events')
      .select('id, topic, status, received_at')
      .eq('organization_id', organizationId)
      .order('received_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      success: true,
      organizationId,
      query: { sourceType, triggerEvent },
      
      // Resumo
      summary: {
        totalRules: allRules?.length || 0,
        activeRulesForEvent: activeRules?.length || 0,
        shopifyConnected: !!shopifyStore,
        recentWebhooks: webhookEvents?.length || 0,
      },
      
      // Todas as regras
      allRules: allRules?.map(r => ({
        id: r.id,
        name: r.name,
        source_type: r.source_type,
        trigger_event: r.trigger_event,
        is_enabled: r.is_enabled,
        pipeline: r.pipeline?.name,
        initial_stage: r.initial_stage?.name,
        deals_created_count: r.deals_created_count,
        last_triggered_at: r.last_triggered_at,
      })),
      
      // Regras ativas para o evento
      activeRulesForEvent: activeRules?.map(r => ({
        id: r.id,
        name: r.name,
        filters: r.filters,
        pipeline: r.pipeline?.name,
        initial_stage: r.initial_stage?.name,
      })),
      
      // Config Shopify
      shopifyStore: shopifyStore ? {
        id: shopifyStore.id,
        domain: shopifyStore.shop_domain,
        default_pipeline_id: shopifyStore.default_pipeline_id,
        default_stage_id: shopifyStore.default_stage_id,
      } : null,
      
      // Webhooks recentes
      recentWebhooks: webhookEvents?.map(w => ({
        topic: w.topic,
        status: w.status,
        received_at: w.received_at,
      })),
      
      // Diagnóstico
      diagnosis: {
        tableExists: true,
        hasRules: (allRules?.length || 0) > 0,
        hasActiveRulesForEvent: (activeRules?.length || 0) > 0,
        shopifyConnected: !!shopifyStore,
        webhooksReceived: (webhookEvents?.length || 0) > 0,
        
        issues: [
          ...(allRules?.length === 0 ? ['No automation rules created'] : []),
          ...(activeRules?.length === 0 ? [`No active rules for ${sourceType}/${triggerEvent}`] : []),
          ...(!shopifyStore ? ['No Shopify store connected'] : []),
          ...(webhookEvents?.length === 0 ? ['No webhooks received yet - make a test purchase'] : []),
        ],
      },
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
