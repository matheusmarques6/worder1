// =============================================
// Shopify Sync Config Integration
// /src/lib/services/shopify/sync-config-integration.ts
//
// Funções para integrar sync_config e transition_rules
// com o processamento de webhooks
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin';

// =============================================
// TYPES
// =============================================

export interface SyncConfig {
  id: string;
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

export interface TransitionRule {
  id: string;
  store_id: string;
  organization_id: string;
  rule_name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  trigger_event: string;
  from_pipeline_id: string | null;
  from_stage_id: string | null;
  min_order_value: number | null;
  max_order_value: number | null;
  customer_tags_include: string[];
  customer_tags_exclude: string[];
  product_ids_include: string[];
  action_type: string;
  to_pipeline_id: string | null;
  to_stage_id: string | null;
  mark_as_won: boolean;
  mark_as_lost: boolean;
  add_tags: string[];
  remove_tags: string[];
  update_deal_value: boolean;
}

// =============================================
// GET SYNC CONFIG
// =============================================

export async function getSyncConfig(storeId: string): Promise<SyncConfig | null> {
  const supabase = getSupabaseAdmin();
  
  const { data, error } = await supabase
    .from('shopify_sync_config')
    .select('*')
    .eq('store_id', storeId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      // No config found - return null
      return null;
    }
    console.error('[SyncConfig] Error fetching config:', error);
    return null;
  }
  
  return data as SyncConfig;
}

// =============================================
// GET TRANSITION RULES
// =============================================

export async function getActiveTransitionRules(
  storeId: string,
  triggerEvent: string
): Promise<TransitionRule[]> {
  const supabase = getSupabaseAdmin();
  
  const { data, error } = await supabase
    .from('shopify_transition_rules')
    .select('*')
    .eq('store_id', storeId)
    .eq('trigger_event', triggerEvent)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  
  if (error) {
    console.error('[TransitionRules] Error fetching rules:', error);
    return [];
  }
  
  return (data || []) as TransitionRule[];
}

// =============================================
// APPLY TRANSITION RULES
// =============================================

export interface ApplyRulesContext {
  storeId: string;
  contactId: string;
  orderValue?: number;
  customerTags?: string[];
  productIds?: string[];
}

export interface ApplyRulesResult {
  applied: boolean;
  rule?: TransitionRule;
  dealId?: string;
  action?: string;
  error?: string;
}

export async function applyTransitionRules(
  triggerEvent: string,
  context: ApplyRulesContext
): Promise<ApplyRulesResult> {
  const supabase = getSupabaseAdmin();
  
  // 1. Buscar regras ativas para este evento
  const rules = await getActiveTransitionRules(context.storeId, triggerEvent);
  
  if (rules.length === 0) {
    return { applied: false };
  }
  
  // 2. Buscar deals do contato
  const { data: deals, error: dealsError } = await supabase
    .from('deals')
    .select('id, pipeline_id, stage_id, value, tags')
    .eq('contact_id', context.contactId)
    .is('closed_at', null); // Apenas deals abertos
  
  if (dealsError) {
    console.error('[TransitionRules] Error fetching deals:', dealsError);
    return { applied: false, error: dealsError.message };
  }
  
  if (!deals || deals.length === 0) {
    return { applied: false };
  }
  
  // 3. Para cada regra, verificar se algum deal match
  for (const rule of rules) {
    const matchingDeal = deals.find(deal => {
      // Verificar from_pipeline
      if (rule.from_pipeline_id && deal.pipeline_id !== rule.from_pipeline_id) {
        return false;
      }
      
      // Verificar from_stage
      if (rule.from_stage_id && deal.stage_id !== rule.from_stage_id) {
        return false;
      }
      
      // Verificar min_order_value
      if (rule.min_order_value && context.orderValue !== undefined) {
        if (context.orderValue < rule.min_order_value) {
          return false;
        }
      }
      
      // Verificar max_order_value
      if (rule.max_order_value && context.orderValue !== undefined) {
        if (context.orderValue > rule.max_order_value) {
          return false;
        }
      }
      
      // Verificar customer_tags_include
      if (rule.customer_tags_include && rule.customer_tags_include.length > 0) {
        const hasAllTags = rule.customer_tags_include.every(tag =>
          context.customerTags?.includes(tag)
        );
        if (!hasAllTags) {
          return false;
        }
      }
      
      // Verificar customer_tags_exclude
      if (rule.customer_tags_exclude && rule.customer_tags_exclude.length > 0) {
        const hasExcludedTag = rule.customer_tags_exclude.some(tag =>
          context.customerTags?.includes(tag)
        );
        if (hasExcludedTag) {
          return false;
        }
      }
      
      return true;
    });
    
    if (matchingDeal && rule.to_pipeline_id && rule.to_stage_id) {
      // 4. Aplicar a regra
      const updateData: Record<string, any> = {
        pipeline_id: rule.to_pipeline_id,
        stage_id: rule.to_stage_id,
        updated_at: new Date().toISOString(),
      };
      
      // Marcar como ganho/perdido
      if (rule.mark_as_won) {
        updateData.status = 'won';
        updateData.closed_at = new Date().toISOString();
      } else if (rule.mark_as_lost) {
        updateData.status = 'lost';
        updateData.closed_at = new Date().toISOString();
      }
      
      // Atualizar valor se configurado
      if (rule.update_deal_value && context.orderValue !== undefined) {
        updateData.value = context.orderValue;
      }
      
      // Atualizar tags
      if (rule.add_tags && rule.add_tags.length > 0) {
        const currentTags = matchingDeal.tags || [];
        updateData.tags = [...new Set([...currentTags, ...rule.add_tags])];
      }
      
      const { error: updateError } = await supabase
        .from('deals')
        .update(updateData)
        .eq('id', matchingDeal.id);
      
      if (updateError) {
        console.error('[TransitionRules] Error applying rule:', updateError);
        return { applied: false, error: updateError.message };
      }
      
      // 5. Log da automação
      await logAutomation({
        storeId: context.storeId,
        ruleId: rule.id,
        contactId: context.contactId,
        dealId: matchingDeal.id,
        triggerEvent,
        action: rule.mark_as_won ? 'deal_won' : rule.mark_as_lost ? 'deal_lost' : 'deal_moved',
        success: true,
        details: {
          from_pipeline_id: matchingDeal.pipeline_id,
          from_stage_id: matchingDeal.stage_id,
          to_pipeline_id: rule.to_pipeline_id,
          to_stage_id: rule.to_stage_id,
          order_value: context.orderValue,
        },
      });
      
      console.log(`[TransitionRules] Applied rule "${rule.rule_name}" to deal ${matchingDeal.id}`);
      
      return {
        applied: true,
        rule,
        dealId: matchingDeal.id,
        action: rule.mark_as_won ? 'deal_won' : rule.mark_as_lost ? 'deal_lost' : 'deal_moved',
      };
    }
  }
  
  return { applied: false };
}

// =============================================
// LOG AUTOMATION
// =============================================

interface AutomationLogData {
  storeId: string;
  ruleId?: string;
  configId?: string;
  contactId?: string;
  dealId?: string;
  triggerEvent: string;
  shopifyEventId?: string;
  shopifyOrderId?: string;
  shopifyCustomerId?: string;
  action: string;
  success: boolean;
  errorMessage?: string;
  details?: Record<string, any>;
}

export async function logAutomation(data: AutomationLogData): Promise<void> {
  const supabase = getSupabaseAdmin();
  
  // Buscar organization_id do store
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('organization_id')
    .eq('id', data.storeId)
    .single();
  
  if (!store) {
    console.error('[AutomationLog] Store not found:', data.storeId);
    return;
  }
  
  try {
    await supabase
      .from('shopify_automation_logs')
      .insert({
        store_id: data.storeId,
        organization_id: store.organization_id,
        rule_id: data.ruleId || null,
        config_id: data.configId || null,
        contact_id: data.contactId || null,
        deal_id: data.dealId || null,
        trigger_event: data.triggerEvent,
        shopify_event_id: data.shopifyEventId || null,
        shopify_order_id: data.shopifyOrderId || null,
        shopify_customer_id: data.shopifyCustomerId || null,
        action_taken: data.action,
        success: data.success,
        error_message: data.errorMessage || null,
        details: data.details || {},
      });
  } catch (err) {
    console.error('[AutomationLog] Error logging:', err);
  }
}

// =============================================
// CREATE DEAL FROM SYNC CONFIG
// =============================================

export interface CreateDealFromConfigParams {
  config: SyncConfig;
  contactId: string;
  contactName: string;
  orderNumber?: string;
  orderValue?: number;
  type: 'customer' | 'order' | 'abandoned';
}

export async function createDealFromSyncConfig(
  params: CreateDealFromConfigParams
): Promise<{ dealId: string } | null> {
  const { config, contactId, contactName, orderNumber, orderValue, type } = params;
  const supabase = getSupabaseAdmin();
  
  let pipelineId: string | null = null;
  let stageId: string | null = null;
  let tags: string[] = [];
  let titleTemplate: string = '';
  
  switch (type) {
    case 'customer':
      if (!config.create_deal_for_customer) return null;
      pipelineId = config.customer_pipeline_id;
      stageId = config.customer_stage_id;
      tags = config.customer_auto_tags;
      titleTemplate = config.customer_deal_title_template;
      break;
    case 'order':
      if (!config.sync_new_orders) return null;
      pipelineId = config.order_pipeline_id;
      stageId = config.order_stage_id;
      tags = config.order_auto_tags;
      titleTemplate = config.order_deal_title_template;
      break;
    case 'abandoned':
      if (!config.sync_abandoned_checkouts) return null;
      pipelineId = config.abandoned_pipeline_id;
      stageId = config.abandoned_stage_id;
      tags = config.abandoned_auto_tags;
      titleTemplate = 'Carrinho Abandonado: {{customer_name}}';
      break;
  }
  
  if (!pipelineId || !stageId) {
    return null;
  }
  
  // Verificar duplicatas se configurado
  if (config.prevent_duplicate_deals) {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - config.duplicate_check_hours);
    
    const { data: existingDeals } = await supabase
      .from('deals')
      .select('id')
      .eq('contact_id', contactId)
      .eq('pipeline_id', pipelineId)
      .gte('created_at', cutoffDate.toISOString())
      .limit(1);
    
    if (existingDeals && existingDeals.length > 0) {
      console.log('[SyncConfig] Skipping deal creation - duplicate found');
      return null;
    }
  }
  
  // Processar template do título
  let title = titleTemplate
    .replace('{{customer_name}}', contactName)
    .replace('{{order_number}}', orderNumber || '')
    .replace('{{order_value}}', orderValue?.toString() || '0');
  
  // Criar deal
  const { data: deal, error } = await supabase
    .from('deals')
    .insert({
      organization_id: config.organization_id,
      contact_id: contactId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      title,
      value: orderValue || 0,
      tags,
      status: 'open',
    })
    .select('id')
    .single();
  
  if (error) {
    console.error('[SyncConfig] Error creating deal:', error);
    return null;
  }
  
  // Log
  await logAutomation({
    storeId: config.store_id,
    configId: config.id,
    contactId,
    dealId: deal.id,
    triggerEvent: type === 'customer' ? 'customers/create' : type === 'order' ? 'orders/create' : 'checkouts/create',
    action: 'deal_created',
    success: true,
    details: {
      pipeline_id: pipelineId,
      stage_id: stageId,
      type,
    },
  });
  
  return { dealId: deal.id };
}
