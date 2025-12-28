// =============================================
// Automation Executor Service
// src/lib/services/automation/automation-executor.ts
//
// Executa regras de automação da tabela pipeline_automation_rules
// quando eventos de integrações são recebidos
// =============================================

import { createClient } from '@supabase/supabase-js';

// =============================================
// TYPES
// =============================================

interface AutomationRule {
  id: string;
  pipeline_id: string;
  name: string;
  source_type: string;
  trigger_event: string;
  filters: Record<string, any>;
  initial_stage_id: string | null;
  assign_to_user_id: string | null;
  deal_tags: string[];
  deal_title_template: string | null;
  prevent_duplicates: boolean;
  duplicate_check_period_hours: number;
  update_existing_deal: boolean;
  is_enabled: boolean;
}

interface EventData {
  order_id?: string;
  order_number?: string;
  total_price?: number;
  currency?: string;
  customer_tags?: string[];
  financial_status?: string;
  fulfillment_status?: string;
  line_items?: any[];
  customer?: {
    id?: string;
    email?: string;
    tags?: string;
  };
  [key: string]: any;
}

interface ExecuteResult {
  success: boolean;
  rulesExecuted: number;
  dealsCreated: number;
  errors: string[];
  details: Array<{
    ruleId: string;
    ruleName: string;
    action: 'created' | 'updated' | 'skipped';
    dealId?: string;
    reason?: string;
  }>;
}

// =============================================
// SUPABASE CLIENT
// =============================================

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// =============================================
// BUSCAR REGRAS ATIVAS
// =============================================

export async function getActiveRulesForEvent(
  organizationId: string,
  sourceType: string,
  triggerEvent: string
): Promise<AutomationRule[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const { data: rules, error } = await supabase
      .from('pipeline_automation_rules')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('source_type', sourceType)
      .eq('trigger_event', triggerEvent)
      .eq('is_enabled', true)
      .order('position', { ascending: true });

    if (error) {
      console.error('[AutomationExecutor] Error fetching rules:', error);
      return [];
    }

    return rules || [];
  } catch (error) {
    console.error('[AutomationExecutor] Error:', error);
    return [];
  }
}

// =============================================
// VERIFICAR FILTROS
// =============================================

function checkFilters(rule: AutomationRule, eventData: EventData): boolean {
  const filters = rule.filters || {};
  
  // Filtro: Valor mínimo
  if (filters.min_value !== undefined && filters.min_value !== null && filters.min_value !== '') {
    const minValue = Number(filters.min_value);
    const orderValue = Number(eventData.total_price || 0);
    if (orderValue < minValue) {
      console.log(`[AutomationExecutor] Rule ${rule.name}: Order value ${orderValue} < min ${minValue}`);
      return false;
    }
  }
  
  // Filtro: Valor máximo
  if (filters.max_value !== undefined && filters.max_value !== null && filters.max_value !== '') {
    const maxValue = Number(filters.max_value);
    const orderValue = Number(eventData.total_price || 0);
    if (orderValue > maxValue) {
      console.log(`[AutomationExecutor] Rule ${rule.name}: Order value ${orderValue} > max ${maxValue}`);
      return false;
    }
  }
  
  // Filtro: Tags do cliente (deve ter pelo menos uma)
  if (filters.customer_tags && Array.isArray(filters.customer_tags) && filters.customer_tags.length > 0) {
    const customerTags = eventData.customer?.tags?.split(',').map(t => t.trim().toLowerCase()) || [];
    const requiredTags = filters.customer_tags.map((t: string) => t.toLowerCase());
    const hasRequiredTag = requiredTags.some((tag: string) => customerTags.includes(tag));
    
    if (!hasRequiredTag) {
      console.log(`[AutomationExecutor] Rule ${rule.name}: Customer missing required tags`);
      return false;
    }
  }
  
  // Filtro: Excluir tags (não pode ter nenhuma)
  if (filters.exclude_tags && Array.isArray(filters.exclude_tags) && filters.exclude_tags.length > 0) {
    const customerTags = eventData.customer?.tags?.split(',').map(t => t.trim().toLowerCase()) || [];
    const excludeTags = filters.exclude_tags.map((t: string) => t.toLowerCase());
    const hasExcludedTag = excludeTags.some((tag: string) => customerTags.includes(tag));
    
    if (hasExcludedTag) {
      console.log(`[AutomationExecutor] Rule ${rule.name}: Customer has excluded tag`);
      return false;
    }
  }
  
  return true;
}

// =============================================
// GERAR TÍTULO DO DEAL
// =============================================

function generateDealTitle(template: string | null, eventData: EventData, defaultTitle: string): string {
  if (!template) return defaultTitle;
  
  let title = template;
  
  // Substituir variáveis
  title = title.replace(/\{\{customer_name\}\}/g, 
    eventData.customer_name || eventData.customer?.first_name || 'Cliente');
  title = title.replace(/\{\{order_number\}\}/g, 
    eventData.order_number?.toString() || '');
  title = title.replace(/\{\{value\}\}/g, 
    eventData.total_price?.toFixed(2) || '0');
  title = title.replace(/\{\{product_name\}\}/g, 
    eventData.line_items?.[0]?.title || 'Produto');
  
  return title || defaultTitle;
}

// =============================================
// VERIFICAR DUPLICATAS
// =============================================

async function checkDuplicate(
  supabase: any,
  contactId: string,
  pipelineId: string,
  periodHours: number
): Promise<string | null> {
  if (periodHours <= 0) {
    // Verificar qualquer deal aberto
    const { data } = await supabase
      .from('deals')
      .select('id')
      .eq('contact_id', contactId)
      .eq('pipeline_id', pipelineId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    return data?.id || null;
  }
  
  // Verificar deals criados no período
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - periodHours);
  
  const { data } = await supabase
    .from('deals')
    .select('id')
    .eq('contact_id', contactId)
    .eq('pipeline_id', pipelineId)
    .gte('created_at', cutoffDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  return data?.id || null;
}

// =============================================
// EXECUTAR REGRAS
// =============================================

export async function executeAutomationRules(
  organizationId: string,
  sourceType: string,
  triggerEvent: string,
  contactId: string,
  eventData: EventData
): Promise<ExecuteResult> {
  const result: ExecuteResult = {
    success: true,
    rulesExecuted: 0,
    dealsCreated: 0,
    errors: [],
    details: [],
  };

  const supabase = getSupabase();
  if (!supabase) {
    result.success = false;
    result.errors.push('Database not configured');
    return result;
  }

  try {
    // 1. Buscar regras ativas
    const rules = await getActiveRulesForEvent(organizationId, sourceType, triggerEvent);
    
    if (rules.length === 0) {
      console.log(`[AutomationExecutor] No active rules for ${sourceType}/${triggerEvent}`);
      return result;
    }

    console.log(`[AutomationExecutor] Found ${rules.length} active rules for ${sourceType}/${triggerEvent}`);

    // 2. Executar cada regra
    for (const rule of rules) {
      try {
        // Verificar filtros
        if (!checkFilters(rule, eventData)) {
          result.details.push({
            ruleId: rule.id,
            ruleName: rule.name,
            action: 'skipped',
            reason: 'Filters not matched',
          });
          continue;
        }

        // Verificar duplicatas
        if (rule.prevent_duplicates) {
          const existingDealId = await checkDuplicate(
            supabase,
            contactId,
            rule.pipeline_id,
            rule.duplicate_check_period_hours
          );

          if (existingDealId) {
            if (rule.update_existing_deal) {
              // Atualizar deal existente
              await supabase
                .from('deals')
                .update({
                  value: eventData.total_price || 0,
                  updated_at: new Date().toISOString(),
                  metadata: {
                    ...eventData,
                    last_updated_by_automation: rule.id,
                  },
                })
                .eq('id', existingDealId);

              result.details.push({
                ruleId: rule.id,
                ruleName: rule.name,
                action: 'updated',
                dealId: existingDealId,
              });
              result.rulesExecuted++;
            } else {
              result.details.push({
                ruleId: rule.id,
                ruleName: rule.name,
                action: 'skipped',
                reason: 'Duplicate deal exists',
                dealId: existingDealId,
              });
            }
            continue;
          }
        }

        // Gerar título do deal
        const dealTitle = generateDealTitle(
          rule.deal_title_template,
          eventData,
          `${rule.name} - ${eventData.order_number || new Date().toLocaleDateString('pt-BR')}`
        );

        // Criar deal
        const { data: newDeal, error: dealError } = await supabase
          .from('deals')
          .insert({
            organization_id: organizationId,
            pipeline_id: rule.pipeline_id,
            stage_id: rule.initial_stage_id,
            contact_id: contactId,
            title: dealTitle,
            value: eventData.total_price || 0,
            probability: 50,
            status: 'open',
            tags: rule.deal_tags || [],
            assigned_to: rule.assign_to_user_id,
            metadata: {
              source: sourceType,
              trigger_event: triggerEvent,
              automation_rule_id: rule.id,
              order_id: eventData.order_id,
              order_number: eventData.order_number,
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (dealError) {
          console.error(`[AutomationExecutor] Error creating deal for rule ${rule.name}:`, dealError);
          result.errors.push(`Rule ${rule.name}: ${dealError.message}`);
          result.details.push({
            ruleId: rule.id,
            ruleName: rule.name,
            action: 'skipped',
            reason: dealError.message,
          });
          continue;
        }

        // Incrementar contador da regra
        await supabase
          .from('pipeline_automation_rules')
          .update({
            deals_created_count: (rule as any).deals_created_count + 1,
            last_triggered_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', rule.id);

        // Registrar log
        await supabase.from('automation_logs').insert({
          organization_id: organizationId,
          rule_id: rule.id,
          action_type: 'deal_created',
          source_type: sourceType,
          trigger_event: triggerEvent,
          deal_id: newDeal.id,
          contact_id: contactId,
          event_data: eventData,
          success: true,
          details: { deal_title: dealTitle },
        });

        result.details.push({
          ruleId: rule.id,
          ruleName: rule.name,
          action: 'created',
          dealId: newDeal.id,
        });
        result.rulesExecuted++;
        result.dealsCreated++;

        console.log(`[AutomationExecutor] ✅ Deal created by rule "${rule.name}": ${newDeal.id}`);

      } catch (ruleError: any) {
        console.error(`[AutomationExecutor] Error executing rule ${rule.name}:`, ruleError);
        result.errors.push(`Rule ${rule.name}: ${ruleError.message}`);
      }
    }

  } catch (error: any) {
    console.error('[AutomationExecutor] Error:', error);
    result.success = false;
    result.errors.push(error.message);
  }

  return result;
}

// =============================================
// MAPEAR EVENTOS SHOPIFY
// =============================================

export function mapShopifyEventToTrigger(topic: string): string | null {
  const mapping: Record<string, string> = {
    'orders/create': 'order_created',
    'orders/paid': 'order_paid',
    'orders/fulfilled': 'order_fulfilled',
    'orders/cancelled': 'order_cancelled',
    'customers/create': 'customer_created',
    'checkouts/create': 'checkout_abandoned',
    'checkouts/update': 'checkout_abandoned',
  };
  
  return mapping[topic] || null;
}

// =============================================
// EXPORT DEFAULT
// =============================================

export default {
  getActiveRulesForEvent,
  executeAutomationRules,
  mapShopifyEventToTrigger,
};
