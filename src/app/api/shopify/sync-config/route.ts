// =============================================
// API: Shopify Sync Config
// /api/shopify/sync-config/route.ts
//
// GET  - Buscar configuração de sincronização
// POST - Criar/Atualizar configuração
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

// =============================================
// TYPES
// =============================================

interface SyncConfig {
  id?: string;
  store_id: string;
  organization_id: string;
  
  // Customer sync
  sync_new_customers: boolean;
  customer_contact_type: 'lead' | 'customer' | 'auto';
  customer_pipeline_id: string | null;
  customer_stage_id: string | null;
  customer_auto_tags: string[];
  create_deal_for_customer: boolean;
  customer_deal_title_template: string;
  
  // Order sync
  sync_new_orders: boolean;
  order_pipeline_id: string | null;
  order_stage_id: string | null;
  order_auto_tags: string[];
  order_deal_title_template: string;
  
  // Abandoned checkout
  sync_abandoned_checkouts: boolean;
  abandoned_pipeline_id: string | null;
  abandoned_stage_id: string | null;
  abandoned_delay_minutes: number;
  abandoned_auto_tags: string[];
  
  // General
  update_existing_contacts: boolean;
  prevent_duplicate_deals: boolean;
  duplicate_check_hours: number;
}

// =============================================
// GET - Buscar configuração
// =============================================

export async function GET(request: NextRequest) {
  // ✅ Autenticação
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    
    if (!storeId) {
      return NextResponse.json(
        { error: 'storeId is required' },
        { status: 400 }
      );
    }
    
    // Verificar se o usuário tem acesso à loja (via RLS)
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('id, organization_id')
      .eq('id', storeId)
      .single();
    
    if (storeError || !store) {
      return NextResponse.json(
        { error: 'Store not found or access denied' },
        { status: 404 }
      );
    }
    
    // Buscar configuração existente
    const { data: config, error } = await supabase
      .from('shopify_sync_config')
      .select('*')
      .eq('store_id', storeId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (not an error, just no config yet)
      console.error('[SyncConfig API] Error fetching config:', error);
      return NextResponse.json(
        { error: 'Failed to fetch config' },
        { status: 500 }
      );
    }
    
    // Se não existe config, retornar defaults
    if (!config) {
      return NextResponse.json({
        config: {
          store_id: storeId,
          organization_id: store.organization_id,
          sync_new_customers: true,
          customer_contact_type: 'auto',
          customer_pipeline_id: null,
          customer_stage_id: null,
          customer_auto_tags: ['shopify'],
          create_deal_for_customer: false,
          customer_deal_title_template: 'Novo Lead: {{customer_name}}',
          sync_new_orders: true,
          order_pipeline_id: null,
          order_stage_id: null,
          order_auto_tags: ['shopify', 'pedido'],
          order_deal_title_template: 'Pedido #{{order_number}} - {{customer_name}}',
          sync_abandoned_checkouts: false,
          abandoned_pipeline_id: null,
          abandoned_stage_id: null,
          abandoned_delay_minutes: 60,
          abandoned_auto_tags: ['shopify', 'carrinho-abandonado'],
          update_existing_contacts: true,
          prevent_duplicate_deals: true,
          duplicate_check_hours: 24,
        },
        isNew: true,
      });
    }
    
    return NextResponse.json({ config, isNew: false });
    
  } catch (error: any) {
    console.error('[SyncConfig API] Error in GET:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// =============================================
// POST - Criar ou Atualizar configuração
// =============================================

export async function POST(request: NextRequest) {
  // ✅ Autenticação
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;
  
  try {
    const body = await request.json();
    const { storeId, organizationId, ...configData } = body;
    
    if (!storeId) {
      return NextResponse.json(
        { error: 'storeId is required' },
        { status: 400 }
      );
    }
    
    // Verificar se o usuário tem acesso à loja (via RLS)
    const { data: store, error: storeError } = await supabase
      .from('shopify_stores')
      .select('id, organization_id')
      .eq('id', storeId)
      .single();
    
    if (storeError || !store) {
      return NextResponse.json(
        { error: 'Store not found or access denied' },
        { status: 404 }
      );
    }
    
    // Usar organization_id da loja (mais seguro que confiar no client)
    const orgId = store.organization_id;
    
    // Preparar dados para upsert
    const syncConfig = {
      store_id: storeId,
      organization_id: orgId,
      
      // Customer sync
      sync_new_customers: configData.syncNewCustomers ?? true,
      customer_contact_type: configData.customerContactType ?? 'auto',
      customer_pipeline_id: configData.customerPipelineId || null,
      customer_stage_id: configData.customerStageId || null,
      customer_auto_tags: configData.customerAutoTags ?? ['shopify'],
      create_deal_for_customer: configData.createDealForCustomer ?? false,
      customer_deal_title_template: configData.customerDealTitleTemplate ?? 'Novo Lead: {{customer_name}}',
      
      // Order sync
      sync_new_orders: configData.syncNewOrders ?? true,
      order_pipeline_id: configData.orderPipelineId || null,
      order_stage_id: configData.orderStageId || null,
      order_auto_tags: configData.orderAutoTags ?? ['shopify', 'pedido'],
      order_deal_title_template: configData.orderDealTitleTemplate ?? 'Pedido #{{order_number}} - {{customer_name}}',
      
      // Abandoned checkout
      sync_abandoned_checkouts: configData.syncAbandonedCheckouts ?? false,
      abandoned_pipeline_id: configData.abandonedPipelineId || null,
      abandoned_stage_id: configData.abandonedStageId || null,
      abandoned_delay_minutes: configData.abandonedDelayMinutes ?? 60,
      abandoned_auto_tags: configData.abandonedAutoTags ?? ['shopify', 'carrinho-abandonado'],
      
      // General
      update_existing_contacts: configData.updateExistingContacts ?? true,
      prevent_duplicate_deals: configData.preventDuplicateDeals ?? true,
      duplicate_check_hours: configData.duplicateCheckHours ?? 24,
      
      updated_at: new Date().toISOString(),
    };
    
    // Usar admin para upsert (RLS pode bloquear insert em algumas configs)
    const supabaseAdmin = getSupabaseAdmin();
    
    // Upsert (insert ou update se já existir)
    const { data: config, error } = await supabaseAdmin
      .from('shopify_sync_config')
      .upsert(syncConfig, {
        onConflict: 'store_id',
        ignoreDuplicates: false,
      })
      .select()
      .single();
    
    if (error) {
      console.error('[SyncConfig API] Error upserting config:', error);
      return NextResponse.json(
        { error: 'Failed to save config', details: error.message },
        { status: 500 }
      );
    }
    
    // Também atualizar a loja para marcar como configurada
    await supabaseAdmin
      .from('shopify_stores')
      .update({ 
        is_configured: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', storeId);
    
    return NextResponse.json({
      success: true,
      config,
      message: 'Configuração salva com sucesso',
    });
    
  } catch (error: any) {
    console.error('[SyncConfig API] Error in POST:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
