// =============================================
// Automation Rule Engine
// src/lib/services/automation/rule-engine.ts
//
// Motor de processamento de regras de automação
// Usado pelos webhooks para criar/mover deals
// =============================================

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// =============================================
// TYPES
// =============================================

export interface AutomationRule {
  rule_id: string;
  pipeline_id: string;
  pipeline_name: string;
  rule_name: string;
  filters: Record<string, any>;
  initial_stage_id: string | null;
  initial_stage_name: string | null;
  assign_to_user_id: string | null;
  deal_tags: string[];
  deal_title_template: string | null;
  prevent_duplicates: boolean;
  duplicate_check_period_hours: number;
  update_existing_deal: boolean;
}

export interface StageTransition {
  transition_id: string;
  pipeline_id: string;
  transition_name: string;
  filters: Record<string, any>;
  from_stage_id: string | null;
  to_stage_id: string;
  to_stage_name: string;
  mark_as_won: boolean;
  mark_as_lost: boolean;
}

export interface EventData {
  // Comum
  contact_id?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_name?: string;
  
  // Shopify
  order_id?: string;
  order_number?: string;
  order_value?: number;
  customer_tags?: string[];
  product_ids?: string[];
  checkout_id?: string;
  
  // WhatsApp
  conversation_id?: string;
  message_text?: string;
  message_timestamp?: string;
  
  // Genérico
  source_id?: string;
  [key: string]: any;
}

export interface ProcessResult {
  success: boolean;
  action: 'deal_created' | 'deal_updated' | 'deal_moved' | 'skipped' | 'error';
  deal_id?: string;
  rule_id?: string;
  transition_id?: string;
  reason?: string;
  error?: string;
}

// =============================================
// SUPABASE CLIENT
// =============================================

function getSupabase() {
  return getSupabaseAdmin();
}

// =============================================
// FILTER EVALUATOR
// =============================================

export function evaluateFilters(filters: Record<string, any>, eventData: EventData): boolean {
  if (!filters || Object.keys(filters).length === 0) {
    return true; // Sem filtros = passa sempre
  }
  
  // Filtro: valor mínimo
  if (filters.min_value !== undefined && filters.min_value !== null) {
    const orderValue = eventData.order_value || 0;
    if (orderValue < filters.min_value) {
      console.log(`[RuleEngine] Filtered out: order_value ${orderValue} < min_value ${filters.min_value}`);
      return false;
    }
  }
  
  // Filtro: valor máximo
  if (filters.max_value !== undefined && filters.max_value !== null) {
    const orderValue = eventData.order_value || 0;
    if (orderValue > filters.max_value) {
      console.log(`[RuleEngine] Filtered out: order_value ${orderValue} > max_value ${filters.max_value}`);
      return false;
    }
  }
  
  // Filtro: tags do cliente (deve ter pelo menos uma)
  if (filters.customer_tags && filters.customer_tags.length > 0) {
    const customerTags = eventData.customer_tags || [];
    const hasMatchingTag = filters.customer_tags.some((tag: string) => 
      customerTags.map(t => t.toLowerCase()).includes(tag.toLowerCase())
    );
    if (!hasMatchingTag) {
      console.log(`[RuleEngine] Filtered out: customer tags don't match`);
      return false;
    }
  }
  
  // Filtro: excluir tags
  if (filters.exclude_tags && filters.exclude_tags.length > 0) {
    const customerTags = eventData.customer_tags || [];
    const hasExcludedTag = filters.exclude_tags.some((tag: string) => 
      customerTags.map(t => t.toLowerCase()).includes(tag.toLowerCase())
    );
    if (hasExcludedTag) {
      console.log(`[RuleEngine] Filtered out: customer has excluded tag`);
      return false;
    }
  }
  
  // Filtro: keywords na mensagem (WhatsApp)
  if (filters.keywords && filters.keywords.length > 0) {
    const messageText = (eventData.message_text || '').toLowerCase();
    const hasKeyword = filters.keywords.some((keyword: string) => 
      messageText.includes(keyword.toLowerCase())
    );
    if (!hasKeyword) {
      console.log(`[RuleEngine] Filtered out: message doesn't contain keywords`);
      return false;
    }
  }
  
  // Filtro: apenas horário comercial
  if (filters.business_hours_only) {
    const now = new Date();
    const hour = now.getHours();
    if (hour < 8 || hour >= 18) {
      console.log(`[RuleEngine] Filtered out: outside business hours`);
      return false;
    }
  }
  
  // Filtro: IDs de produtos específicos
  if (filters.product_ids && filters.product_ids.length > 0) {
    const eventProductIds = eventData.product_ids || [];
    const hasMatchingProduct = filters.product_ids.some((pid: string) => 
      eventProductIds.includes(pid)
    );
    if (!hasMatchingProduct) {
      console.log(`[RuleEngine] Filtered out: no matching product IDs`);
      return false;
    }
  }
  
  return true;
}

// =============================================
// TEMPLATE PROCESSOR
// =============================================

export function processTemplate(template: string | null, eventData: EventData): string {
  if (!template) {
    // Template padrão
    if (eventData.order_number) {
      return `Pedido #${eventData.order_number}${eventData.contact_name ? ` - ${eventData.contact_name}` : ''}`;
    }
    if (eventData.contact_name) {
      return `Lead: ${eventData.contact_name}`;
    }
    return `Novo Deal`;
  }
  
  // Substituir variáveis
  let result = template;
  
  const replacements: Record<string, string> = {
    '{{customer_name}}': eventData.contact_name || 'Cliente',
    '{{contact_name}}': eventData.contact_name || 'Cliente',
    '{{order_number}}': eventData.order_number || '',
    '{{order_value}}': eventData.order_value?.toFixed(2) || '0',
    '{{value}}': eventData.order_value?.toFixed(2) || '0',
    '{{phone}}': eventData.contact_phone || '',
    '{{email}}': eventData.contact_email || '',
    '{{product_name}}': eventData.product_ids?.[0] || '',
  };
  
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(key, 'g'), value);
  }
  
  return result;
}

// =============================================
// MAIN FUNCTIONS
// =============================================

/**
 * Busca regras de automação ativas para um evento
 */
export async function getActiveRules(
  organizationId: string,
  sourceType: string,
  triggerEvent: string
): Promise<AutomationRule[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  
  try {
    const { data, error } = await supabase
      .rpc('get_active_automation_rules', {
        p_organization_id: organizationId,
        p_source_type: sourceType,
        p_trigger_event: triggerEvent,
      });
    
    if (error) {
      console.error('[RuleEngine] Error fetching rules:', error);
      return [];
    }
    
    return data || [];
  } catch (e) {
    console.error('[RuleEngine] Exception fetching rules:', e);
    return [];
  }
}

/**
 * Busca transições de estágio ativas para um evento
 */
export async function getActiveTransitions(
  organizationId: string,
  sourceType: string,
  triggerEvent: string,
  currentStageId?: string
): Promise<StageTransition[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  
  try {
    const { data, error } = await supabase
      .rpc('get_active_stage_transitions', {
        p_organization_id: organizationId,
        p_source_type: sourceType,
        p_trigger_event: triggerEvent,
        p_current_stage_id: currentStageId || null,
      });
    
    if (error) {
      console.error('[RuleEngine] Error fetching transitions:', error);
      return [];
    }
    
    return data || [];
  } catch (e) {
    console.error('[RuleEngine] Exception fetching transitions:', e);
    return [];
  }
}

/**
 * Processa regras de criação de deal
 */
export async function processCreationRules(
  organizationId: string,
  sourceType: string,
  triggerEvent: string,
  eventData: EventData
): Promise<ProcessResult[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [{ success: false, action: 'error', error: 'Database not configured' }];
  }
  
  const results: ProcessResult[] = [];
  
  try {
    // 1. Buscar regras ativas
    const rules = await getActiveRules(organizationId, sourceType, triggerEvent);
    
    if (rules.length === 0) {
      console.log(`[RuleEngine] No active rules for ${sourceType}:${triggerEvent}`);
      return [{ success: true, action: 'skipped', reason: 'No active rules' }];
    }
    
    console.log(`[RuleEngine] Found ${rules.length} active rules for ${sourceType}:${triggerEvent}`);
    
    // 2. Processar cada regra
    for (const rule of rules) {
      try {
        // 2.1 Avaliar filtros
        if (!evaluateFilters(rule.filters, eventData)) {
          results.push({
            success: true,
            action: 'skipped',
            rule_id: rule.rule_id,
            reason: 'Filtered out',
          });
          continue;
        }
        
        // 2.2 Verificar duplicatas
        if (rule.prevent_duplicates && eventData.contact_id) {
          const duplicateCheck = await checkDuplicate(
            supabase,
            organizationId,
            rule.pipeline_id,
            eventData.contact_id,
            rule.duplicate_check_period_hours,
            eventData.order_id
          );
          
          if (duplicateCheck.exists) {
            if (rule.update_existing_deal && duplicateCheck.deal_id) {
              // Atualizar deal existente
              await updateExistingDeal(supabase, duplicateCheck.deal_id, eventData);
              results.push({
                success: true,
                action: 'deal_updated',
                deal_id: duplicateCheck.deal_id,
                rule_id: rule.rule_id,
              });
            } else {
              results.push({
                success: true,
                action: 'skipped',
                rule_id: rule.rule_id,
                reason: 'Duplicate prevented',
              });
            }
            continue;
          }
        }
        
        // 2.3 Criar deal
        const dealTitle = processTemplate(rule.deal_title_template, eventData);
        
        const { data: deal, error: dealError } = await supabase
          .from('deals')
          .insert({
            organization_id: organizationId,
            pipeline_id: rule.pipeline_id,
            stage_id: rule.initial_stage_id,
            contact_id: eventData.contact_id || null,
            assigned_to: rule.assign_to_user_id || null,
            title: dealTitle,
            value: eventData.order_value || 0,
            currency: 'BRL',
            status: 'open',
            tags: rule.deal_tags || [],
            source: sourceType,
            source_id: eventData.source_id || eventData.order_id || eventData.conversation_id || null,
            custom_fields: {
              automation_rule_id: rule.rule_id,
              trigger_event: triggerEvent,
              order_number: eventData.order_number,
            },
          })
          .select('id')
          .single();
        
        if (dealError) {
          console.error('[RuleEngine] Error creating deal:', dealError);
          results.push({
            success: false,
            action: 'error',
            rule_id: rule.rule_id,
            error: dealError.message,
          });
          continue;
        }
        
        // 2.4 Incrementar contador
        await supabase.rpc('increment_automation_rule_counter', { p_rule_id: rule.rule_id });
        
        // 2.5 Registrar log
        await logAutomationAction(supabase, {
          organization_id: organizationId,
          rule_id: rule.rule_id,
          action_type: 'deal_created',
          source_type: sourceType,
          trigger_event: triggerEvent,
          deal_id: deal.id,
          contact_id: eventData.contact_id,
          event_data: eventData,
          success: true,
        });
        
        results.push({
          success: true,
          action: 'deal_created',
          deal_id: deal.id,
          rule_id: rule.rule_id,
        });
        
        console.log(`[RuleEngine] Deal created: ${deal.id} for rule ${rule.rule_name}`);
        
      } catch (ruleError: any) {
        console.error(`[RuleEngine] Error processing rule ${rule.rule_id}:`, ruleError);
        results.push({
          success: false,
          action: 'error',
          rule_id: rule.rule_id,
          error: ruleError.message,
        });
      }
    }
    
    return results;
    
  } catch (error: any) {
    console.error('[RuleEngine] Error in processCreationRules:', error);
    return [{ success: false, action: 'error', error: error.message }];
  }
}

/**
 * Processa transições de estágio para deals existentes
 */
export async function processStageTransitions(
  organizationId: string,
  sourceType: string,
  triggerEvent: string,
  eventData: EventData,
  dealId?: string
): Promise<ProcessResult[]> {
  const supabase = getSupabase();
  if (!supabase) {
    return [{ success: false, action: 'error', error: 'Database not configured' }];
  }
  
  const results: ProcessResult[] = [];
  
  try {
    // 1. Encontrar deal(s) relacionado(s)
    let deals: any[] = [];
    
    if (dealId) {
      const { data } = await supabase
        .from('deals')
        .select('id, pipeline_id, stage_id, status')
        .eq('id', dealId)
        .eq('organization_id', organizationId);
      deals = data || [];
    } else if (eventData.order_id) {
      // Buscar por source_id (order_id)
      const { data } = await supabase
        .from('deals')
        .select('id, pipeline_id, stage_id, status')
        .eq('organization_id', organizationId)
        .eq('source_id', eventData.order_id)
        .eq('status', 'open');
      deals = data || [];
    } else if (eventData.contact_id) {
      // Buscar deals abertos do contato
      const { data } = await supabase
        .from('deals')
        .select('id, pipeline_id, stage_id, status')
        .eq('organization_id', organizationId)
        .eq('contact_id', eventData.contact_id)
        .eq('status', 'open');
      deals = data || [];
    }
    
    if (deals.length === 0) {
      return [{ success: true, action: 'skipped', reason: 'No matching deals' }];
    }
    
    // 2. Para cada deal, verificar transições aplicáveis
    for (const deal of deals) {
      const transitions = await getActiveTransitions(
        organizationId,
        sourceType,
        triggerEvent,
        deal.stage_id
      );
      
      // Filtrar transições para esta pipeline
      const applicableTransitions = transitions.filter(t => t.pipeline_id === deal.pipeline_id);
      
      for (const transition of applicableTransitions) {
        // Avaliar filtros
        if (!evaluateFilters(transition.filters, eventData)) {
          continue;
        }
        
        // Mover deal
        const updateData: Record<string, any> = {
          stage_id: transition.to_stage_id,
          updated_at: new Date().toISOString(),
        };
        
        if (transition.mark_as_won) {
          updateData.status = 'won';
          updateData.won_at = new Date().toISOString();
          updateData.probability = 100;
        } else if (transition.mark_as_lost) {
          updateData.status = 'lost';
          updateData.probability = 0;
        }
        
        const { error: updateError } = await supabase
          .from('deals')
          .update(updateData)
          .eq('id', deal.id);
        
        if (updateError) {
          results.push({
            success: false,
            action: 'error',
            deal_id: deal.id,
            transition_id: transition.transition_id,
            error: updateError.message,
          });
          continue;
        }
        
        // Incrementar contador
        await supabase.rpc('increment_transition_counter', { p_transition_id: transition.transition_id });
        
        // Log
        await logAutomationAction(supabase, {
          organization_id: organizationId,
          transition_id: transition.transition_id,
          action_type: 'deal_moved',
          source_type: sourceType,
          trigger_event: triggerEvent,
          deal_id: deal.id,
          contact_id: eventData.contact_id,
          event_data: eventData,
          success: true,
          details: {
            from_stage: deal.stage_id,
            to_stage: transition.to_stage_id,
            mark_as_won: transition.mark_as_won,
            mark_as_lost: transition.mark_as_lost,
          },
        });
        
        results.push({
          success: true,
          action: 'deal_moved',
          deal_id: deal.id,
          transition_id: transition.transition_id,
        });
        
        console.log(`[RuleEngine] Deal ${deal.id} moved to stage ${transition.to_stage_name}`);
        
        // Uma transição por deal (primeira que match)
        break;
      }
    }
    
    return results.length > 0 ? results : [{ success: true, action: 'skipped', reason: 'No transitions applied' }];
    
  } catch (error: any) {
    console.error('[RuleEngine] Error in processStageTransitions:', error);
    return [{ success: false, action: 'error', error: error.message }];
  }
}

// =============================================
// HELPER FUNCTIONS
// =============================================

async function checkDuplicate(
  supabase: SupabaseClient,
  organizationId: string,
  pipelineId: string,
  contactId: string,
  periodHours: number,
  orderId?: string
): Promise<{ exists: boolean; deal_id?: string }> {
  try {
    // Se temos order_id, verificar se já existe deal para esse pedido
    if (orderId) {
      const { data } = await supabase
        .from('deals')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('source_id', orderId)
        .limit(1)
        .single();
      
      if (data) {
        return { exists: true, deal_id: data.id };
      }
    }
    
    // Verificar por contato + pipeline + período
    let query = supabase
      .from('deals')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('pipeline_id', pipelineId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (periodHours > 0) {
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() - periodHours);
      query = query.gte('created_at', cutoff.toISOString());
    }
    
    const { data } = await query.single();
    
    return { exists: !!data, deal_id: data?.id };
    
  } catch (e) {
    return { exists: false };
  }
}

async function updateExistingDeal(
  supabase: SupabaseClient,
  dealId: string,
  eventData: EventData
): Promise<void> {
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  
  if (eventData.order_value) {
    updateData.value = eventData.order_value;
  }
  
  await supabase
    .from('deals')
    .update(updateData)
    .eq('id', dealId);
}

async function logAutomationAction(
  supabase: SupabaseClient,
  data: {
    organization_id: string;
    rule_id?: string;
    transition_id?: string;
    action_type: string;
    source_type: string;
    trigger_event: string;
    deal_id?: string;
    contact_id?: string;
    event_data?: any;
    success: boolean;
    error_message?: string;
    details?: any;
  }
): Promise<void> {
  try {
    await supabase.from('automation_logs').insert({
      organization_id: data.organization_id,
      rule_id: data.rule_id || null,
      transition_id: data.transition_id || null,
      action_type: data.action_type,
      source_type: data.source_type,
      trigger_event: data.trigger_event,
      deal_id: data.deal_id || null,
      contact_id: data.contact_id || null,
      event_data: data.event_data || {},
      success: data.success,
      error_message: data.error_message || null,
      details: data.details || {},
    });
  } catch (e) {
    console.error('[RuleEngine] Error logging action:', e);
  }
}

// =============================================
// EXPORT
// =============================================

export const RuleEngine = {
  getActiveRules,
  getActiveTransitions,
  processCreationRules,
  processStageTransitions,
  evaluateFilters,
  processTemplate,
};

export default RuleEngine;
