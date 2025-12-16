/**
 * EventBus - Sistema Central de Eventos para Automações
 * 
 * Este módulo é o coração do sistema de automações. Ele é responsável por:
 * 1. Receber eventos de qualquer parte do sistema
 * 2. Encontrar automações que devem ser disparadas
 * 3. Criar registros de execução
 * 4. Enfileirar para processamento assíncrono
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================
// TIPOS DE EVENTOS
// ============================================

export enum EventType {
  // E-commerce (Shopify)
  ORDER_CREATED = 'order.created',
  ORDER_PAID = 'order.paid',
  ORDER_FULFILLED = 'order.fulfilled',
  ORDER_CANCELLED = 'order.cancelled',
  CHECKOUT_CREATED = 'checkout.created',
  CHECKOUT_UPDATED = 'checkout.updated',
  CART_ABANDONED = 'cart.abandoned',
  
  // Contatos
  CONTACT_CREATED = 'contact.created',
  CONTACT_UPDATED = 'contact.updated',
  CONTACT_DELETED = 'contact.deleted',
  TAG_ADDED = 'tag.added',
  TAG_REMOVED = 'tag.removed',
  
  // CRM / Pipeline
  DEAL_CREATED = 'deal.created',
  DEAL_UPDATED = 'deal.updated',
  DEAL_STAGE_CHANGED = 'deal.stage_changed',
  DEAL_WON = 'deal.won',
  DEAL_LOST = 'deal.lost',
  DEAL_VALUE_CHANGED = 'deal.value_changed',
  DEAL_ASSIGNED = 'deal.assigned',
  
  // Comunicação
  EMAIL_OPENED = 'email.opened',
  EMAIL_CLICKED = 'email.clicked',
  EMAIL_BOUNCED = 'email.bounced',
  WHATSAPP_RECEIVED = 'whatsapp.received',
  WHATSAPP_READ = 'whatsapp.read',
  
  // Formulários / Landing Pages
  FORM_SUBMITTED = 'form.submitted',
  
  // Agendamento
  DATE_TRIGGER = 'date.trigger',
  SEGMENT_ENTERED = 'segment.entered',
  SEGMENT_LEFT = 'segment.left',
  
  // Webhooks customizados
  WEBHOOK_RECEIVED = 'webhook.received',
}

// Mapeamento de EventType para trigger_type do banco
const EVENT_TO_TRIGGER_MAP: Record<EventType, string> = {
  [EventType.ORDER_CREATED]: 'trigger_order',
  [EventType.ORDER_PAID]: 'trigger_order_paid',
  [EventType.ORDER_FULFILLED]: 'trigger_order_fulfilled',
  [EventType.ORDER_CANCELLED]: 'trigger_order_cancelled',
  [EventType.CHECKOUT_CREATED]: 'trigger_checkout',
  [EventType.CHECKOUT_UPDATED]: 'trigger_checkout',
  [EventType.CART_ABANDONED]: 'trigger_abandon',
  [EventType.CONTACT_CREATED]: 'trigger_signup',
  [EventType.CONTACT_UPDATED]: 'trigger_contact_updated',
  [EventType.CONTACT_DELETED]: 'trigger_contact_deleted',
  [EventType.TAG_ADDED]: 'trigger_tag',
  [EventType.TAG_REMOVED]: 'trigger_tag_removed',
  [EventType.DEAL_CREATED]: 'trigger_deal_created',
  [EventType.DEAL_UPDATED]: 'trigger_deal_updated',
  [EventType.DEAL_STAGE_CHANGED]: 'trigger_deal_stage',
  [EventType.DEAL_WON]: 'trigger_deal_won',
  [EventType.DEAL_LOST]: 'trigger_deal_lost',
  [EventType.DEAL_VALUE_CHANGED]: 'trigger_deal_value',
  [EventType.DEAL_ASSIGNED]: 'trigger_deal_assigned',
  [EventType.EMAIL_OPENED]: 'trigger_email_opened',
  [EventType.EMAIL_CLICKED]: 'trigger_email_clicked',
  [EventType.EMAIL_BOUNCED]: 'trigger_email_bounced',
  [EventType.WHATSAPP_RECEIVED]: 'trigger_whatsapp',
  [EventType.WHATSAPP_READ]: 'trigger_whatsapp_read',
  [EventType.FORM_SUBMITTED]: 'trigger_form',
  [EventType.DATE_TRIGGER]: 'trigger_date',
  [EventType.SEGMENT_ENTERED]: 'trigger_segment',
  [EventType.SEGMENT_LEFT]: 'trigger_segment_left',
  [EventType.WEBHOOK_RECEIVED]: 'trigger_webhook',
};

// ============================================
// INTERFACES
// ============================================

export interface EventPayload {
  organization_id: string;
  contact_id?: string;
  deal_id?: string;
  order_id?: string;
  email?: string;
  phone?: string;
  data: Record<string, any>;
  source?: string;
  timestamp?: string;
}

export interface EmitResult {
  success: boolean;
  automationsTriggered: number;
  runIds: string[];
  errors?: string[];
}

// ============================================
// EVENTBUS CLASS
// ============================================

class EventBusClass {
  private supabase: SupabaseClient | null = null;

  private getSupabase(): SupabaseClient {
    if (!this.supabase) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase credentials not configured');
      }

      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
    return this.supabase;
  }

  /**
   * Emite um evento e dispara automações correspondentes
   */
  async emit(eventType: EventType, payload: EventPayload): Promise<EmitResult> {
    const result: EmitResult = {
      success: true,
      automationsTriggered: 0,
      runIds: [],
      errors: [],
    };

    try {
      const supabase = this.getSupabase();

      // 1. Registrar o evento no log
      await this.logEvent(eventType, payload);

      // 2. Buscar automações ativas que correspondem ao trigger
      const triggerType = EVENT_TO_TRIGGER_MAP[eventType];
      const automations = await this.findMatchingAutomations(
        payload.organization_id,
        triggerType,
        payload
      );

      if (automations.length === 0) {
        console.log(`[EventBus] No automations found for ${eventType} in org ${payload.organization_id}`);
        return result;
      }

      console.log(`[EventBus] Found ${automations.length} automations for ${eventType}`);

      // 3. Para cada automação, criar um run e enfileirar
      for (const automation of automations) {
        try {
          const runId = await this.createAutomationRun(automation, payload);
          
          // 4. Enfileirar para processamento assíncrono
          await this.enqueueRun(runId);
          
          result.runIds.push(runId);
          result.automationsTriggered++;
        } catch (error: any) {
          console.error(`[EventBus] Error triggering automation ${automation.id}:`, error);
          result.errors?.push(`Automation ${automation.id}: ${error.message}`);
        }
      }

      return result;
    } catch (error: any) {
      console.error('[EventBus] Error emitting event:', error);
      result.success = false;
      result.errors?.push(error.message);
      return result;
    }
  }

  /**
   * Registra o evento no log para auditoria
   */
  private async logEvent(eventType: EventType, payload: EventPayload): Promise<void> {
    try {
      const supabase = this.getSupabase();
      await supabase.from('event_logs').insert({
        organization_id: payload.organization_id,
        event_type: eventType,
        contact_id: payload.contact_id || null,
        deal_id: payload.deal_id || null,
        payload: payload.data,
        source: payload.source || 'system',
        created_at: payload.timestamp || new Date().toISOString(),
      });
    } catch (error) {
      // Log silencioso - não falhar a emissão por erro de log
      console.warn('[EventBus] Failed to log event:', error);
    }
  }

  /**
   * Busca automações ativas que correspondem ao trigger
   */
  private async findMatchingAutomations(
    organizationId: string,
    triggerType: string,
    payload: EventPayload
  ): Promise<any[]> {
    const supabase = this.getSupabase();

    // Buscar automações ativas com o trigger correspondente
    const { data: automations, error } = await supabase
      .from('automations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('trigger_type', triggerType)
      .eq('status', 'active');

    if (error) {
      throw error;
    }

    // Filtrar por condições adicionais do trigger_config
    const matchingAutomations = (automations || []).filter((automation) => {
      return this.matchesTriggerConditions(automation, payload);
    });

    return matchingAutomations;
  }

  /**
   * Verifica se o payload atende às condições do trigger
   */
  private matchesTriggerConditions(automation: any, payload: EventPayload): boolean {
    const config = automation.trigger_config || {};

    // Se não há condições, sempre corresponde
    if (Object.keys(config).length === 0) {
      return true;
    }

    // Verificar cada condição configurada
    
    // Tag específica
    if (config.tag_name && payload.data.tag_name) {
      if (config.tag_name !== payload.data.tag_name) {
        return false;
      }
    }

    // Estágio específico
    if (config.stage_id && payload.data.to_stage_id) {
      if (config.stage_id !== payload.data.to_stage_id) {
        return false;
      }
    }

    // Valor mínimo
    if (config.min_value && payload.data.total_value) {
      if (parseFloat(payload.data.total_value) < parseFloat(config.min_value)) {
        return false;
      }
    }

    // Pipeline específica
    if (config.pipeline_id && payload.data.pipeline_id) {
      if (config.pipeline_id !== payload.data.pipeline_id) {
        return false;
      }
    }

    // Webhook ID específico
    if (config.webhook_id && payload.data.webhook_id) {
      if (config.webhook_id !== payload.data.webhook_id) {
        return false;
      }
    }

    return true;
  }

  /**
   * Cria um registro de execução de automação
   */
  private async createAutomationRun(automation: any, payload: EventPayload): Promise<string> {
    const supabase = this.getSupabase();

    // Preparar contexto inicial
    const initialContext = {
      organization_id: payload.organization_id,
      automation_id: automation.id,
      contact_id: payload.contact_id,
      deal_id: payload.deal_id,
      order_id: payload.order_id,
      email: payload.email,
      phone: payload.phone,
      trigger_type: automation.trigger_type,
      trigger_data: payload.data,
      triggered_at: new Date().toISOString(),
    };

    // Criar o run
    const { data: run, error } = await supabase
      .from('automation_runs')
      .insert({
        automation_id: automation.id,
        contact_id: payload.contact_id || null,
        status: 'pending',
        metadata: initialContext,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return run.id;
  }

  /**
   * Enfileira execução (usando QStash se disponível, senão executa direto)
   */
  private async enqueueRun(runId: string): Promise<void> {
    const qstashToken = process.env.QSTASH_TOKEN;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;

    if (qstashToken && appUrl) {
      // Usar QStash para execução assíncrona
      try {
        const { enqueueAutomationRun } = await import('./queue');
        await enqueueAutomationRun(runId);
        console.log(`[EventBus] Queued run ${runId} via QStash`);
      } catch (error) {
        console.warn('[EventBus] QStash not available, falling back to direct execution');
        await this.executeRunDirect(runId);
      }
    } else {
      // Fallback: executar diretamente (não recomendado em produção)
      console.log(`[EventBus] Executing run ${runId} directly (no queue configured)`);
      await this.executeRunDirect(runId);
    }
  }

  /**
   * Execução direta (fallback quando QStash não está configurado)
   */
  private async executeRunDirect(runId: string): Promise<void> {
    // Importa dinamicamente para evitar circular dependency
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';
    
    try {
      // Faz chamada HTTP para o worker
      const response = await fetch(`${appUrl}/api/workers/automation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Request': 'true', // Marker para bypass de auth
        },
        body: JSON.stringify({
          type: 'automation_run',
          data: { runId },
        }),
      });

      if (!response.ok) {
        throw new Error(`Worker returned ${response.status}`);
      }
    } catch (error) {
      console.error(`[EventBus] Direct execution failed for run ${runId}:`, error);
    }
  }

  /**
   * Busca detalhes de um contato pelo ID
   */
  async getContact(contactId: string): Promise<any> {
    const supabase = this.getSupabase();
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();
    return data;
  }

  /**
   * Busca detalhes de um contato pelo email
   */
  async getContactByEmail(organizationId: string, email: string): Promise<any> {
    const supabase = this.getSupabase();
    const { data } = await supabase
      .from('contacts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('email', email)
      .single();
    return data;
  }

  /**
   * Cria ou atualiza um contato
   */
  async upsertContact(organizationId: string, contactData: any): Promise<any> {
    const supabase = this.getSupabase();
    
    // Primeiro tenta encontrar por email
    if (contactData.email) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('email', contactData.email)
        .single();

      if (existing) {
        // Atualizar
        const { data, error } = await supabase
          .from('contacts')
          .update({
            ...contactData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    }

    // Criar novo
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        organization_id: organizationId,
        ...contactData,
        tags: contactData.tags || [],
        custom_fields: contactData.custom_fields || {},
        total_orders: contactData.total_orders || 0,
        total_spent: contactData.total_spent || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

let eventBusInstance: EventBusClass | null = null;

export function getEventBus(): EventBusClass {
  if (!eventBusInstance) {
    eventBusInstance = new EventBusClass();
  }
  return eventBusInstance;
}

// Export conveniente
export const EventBus = {
  emit: async (eventType: EventType, payload: EventPayload) => {
    return getEventBus().emit(eventType, payload);
  },
  getContact: async (contactId: string) => {
    return getEventBus().getContact(contactId);
  },
  getContactByEmail: async (organizationId: string, email: string) => {
    return getEventBus().getContactByEmail(organizationId, email);
  },
  upsertContact: async (organizationId: string, contactData: any) => {
    return getEventBus().upsertContact(organizationId, contactData);
  },
};

export default EventBus;
