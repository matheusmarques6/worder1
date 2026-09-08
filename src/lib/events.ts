/**
 * EventBus - Porta de entrada de eventos para Automações
 *
 * Responsabilidades:
 * 1. Receber eventos de qualquer parte do sistema
 * 2. Registrar o evento (event_logs) e disparar webhooks outbound
 * 3. Delegar a criação dos runs ao dispatchTrigger — o ÚNICO motor de
 *    disparo — que aplica store-scope, filtros de audiência/payload,
 *    limite de frequência e idempotência
 * 4. Enfileirar os runs criados para execução imediata
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
  EMAIL_COMPLAINED = 'email.complained',
  EMAIL_UNSUBSCRIBED = 'email.unsubscribed',
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

  // E-commerce — pagamentos e logística (outbound webhooks v1)
  SHIPMENT_TRACKING_CREATED = 'shipment.tracking_created',
  PAYMENT_PIX_ABANDONED = 'payment.pix.abandoned',
  PAYMENT_BOLETO_ABANDONED = 'payment.boleto.abandoned',
  BROWSE_ABANDONED = 'browse.abandoned',

  // Outbound webhooks: aliases de catálogo público
  // Mantemos CONTACT_CREATED/CART_ABANDONED p/ compat interna das automações
  CUSTOMER_CREATED = 'customer.created',
  CHECKOUT_ABANDONED = 'checkout.abandoned',
}

// Mapeamento de EventType para trigger_type do banco
const EVENT_TO_TRIGGER_MAP: Record<EventType, string> = {
  [EventType.ORDER_CREATED]: 'trigger_order',
  [EventType.ORDER_PAID]: 'trigger_order_paid',
  [EventType.ORDER_FULFILLED]: 'trigger_order_fulfilled',
  // O tipo que existe na paleta do builder é trigger_cancelled_order —
  // o antigo trigger_order_cancelled não existe em lugar nenhum da UI,
  // então o gatilho de pedido cancelado nunca disparava.
  [EventType.ORDER_CANCELLED]: 'trigger_cancelled_order',
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
  [EventType.EMAIL_COMPLAINED]: 'trigger_email_complained',
  [EventType.EMAIL_UNSUBSCRIBED]: 'trigger_email_unsubscribed',
  [EventType.WHATSAPP_RECEIVED]: 'trigger_whatsapp',
  [EventType.WHATSAPP_READ]: 'trigger_whatsapp_read',
  [EventType.FORM_SUBMITTED]: 'trigger_form',
  [EventType.DATE_TRIGGER]: 'trigger_date',
  [EventType.SEGMENT_ENTERED]: 'trigger_segment',
  [EventType.SEGMENT_LEFT]: 'trigger_segment_left',
  [EventType.WEBHOOK_RECEIVED]: 'trigger_webhook',
  [EventType.SHIPMENT_TRACKING_CREATED]: 'trigger_shipment_tracking',
  [EventType.PAYMENT_PIX_ABANDONED]: 'trigger_payment_pix_abandoned',
  [EventType.PAYMENT_BOLETO_ABANDONED]: 'trigger_payment_boleto_abandoned',
  [EventType.BROWSE_ABANDONED]: 'trigger_browse_abandoned',
  [EventType.CUSTOMER_CREATED]: 'trigger_customer_created',
  [EventType.CHECKOUT_ABANDONED]: 'trigger_checkout_abandoned',
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

/**
 * Pure: extrai o store id de um payload de evento do EventBus, olhando os
 * locais conhecidos em ordem de precedência:
 *   data.store_id / data.storeId  (eventos que carregam a loja no topo)
 *   data._webhook_dispatch_meta.store_id  (eventos Shopify de outbound)
 * Retorna null quando não há contexto de loja (eventos não-loja) → o match
 * permanece org-wide (sem regressão). Exportado p/ teste unitário.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function extractEventPayloadStoreId(
  data: Record<string, any> | null | undefined
): string | null {
  const d: any = data || {};
  // uuid guard: o id extraído vai interpolado num .or() do PostgREST contra
  // a coluna uuid automations.store_id — um valor malformado/legado geraria
  // 22P02 (invalid input syntax for type uuid) e derrubaria o trigger path
  // inteiro. Cada candidato é testado NA ORDEM e o primeiro uuid válido
  // vence — um store_id legado malformado no topo não pode mais mascarar
  // um storeId/_webhook_dispatch_meta válido logo abaixo. Nenhum uuid →
  // trata como sem loja (org-wide).
  const candidates = [d.store_id, d.storeId, d._webhook_dispatch_meta?.store_id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && UUID_RE.test(candidate)) return candidate;
  }
  return null;
}

/**
 * Chave de idempotência canônica por EVENTO DE NEGÓCIO.
 *
 * O mesmo pedido chega por até três caminhos (webhook Shopify →
 * dispatchTrigger, EventBus.emit e pixel de checkout_completed) e cada um
 * criava seu próprio run: o contato entrava três vezes no mesmo fluxo.
 * Derivando a chave do id do recurso — e usando exatamente o formato que
 * os produtores diretos já usam (`trigger:placed_order:<id>` etc.) — o
 * primeiro caminho a chegar cria o run e os outros dois são descartados
 * pela janela de 24h do dispatchTrigger.
 *
 * Retorna undefined quando não há id estável no payload (aí não há dedup,
 * comportamento antigo preservado). Exportada para teste unitário.
 */
export function buildEventIdempotencyKey(
  eventType: EventType,
  payload: EventPayload
): string | undefined {
  const d: any = payload?.data || {};
  const orderId = payload.order_id || d.order_id || d.orderId || d.id;
  const checkoutId = d.checkout_id || d.checkoutId || d.token || d.cart_token;

  switch (eventType) {
    case EventType.ORDER_CREATED:
      return orderId ? `trigger:placed_order:${orderId}` : undefined;
    case EventType.ORDER_PAID:
      return orderId ? `trigger:order_paid:${orderId}` : undefined;
    case EventType.ORDER_FULFILLED:
      return orderId ? `trigger:fulfilled_order:${orderId}` : undefined;
    case EventType.ORDER_CANCELLED:
      return orderId ? `trigger:cancelled_order:${orderId}` : undefined;
    case EventType.CART_ABANDONED:
    case EventType.CHECKOUT_ABANDONED:
      return checkoutId ? `trigger:checkout_abandoned:${checkoutId}` : undefined;
    case EventType.CONTACT_CREATED:
      // Um contato só entra no welcome flow uma vez, venha o signup do
      // Shopify, do CRM ou do Klaviyo.
      return payload.contact_id ? `trigger:signup:${payload.contact_id}` : undefined;
    default:
      return undefined;
  }
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

      // 1.5. Outbound webhooks dispatch (fallback silencioso — não pode
      // quebrar o fluxo de automação). Só dispatcha eventos do catálogo v1
      // e quando o handler origem setou _webhook_dispatch_meta no payload.
      try {
        const OUTBOUND_V1_CATALOG = new Set([
          'order.created', 'order.paid', 'order.fulfilled', 'order.cancelled',
          'checkout.abandoned', 'customer.created', 'shipment.tracking_created',
          'payment.pix.abandoned', 'payment.boleto.abandoned', 'browse.abandoned',
        ]);
        if (OUTBOUND_V1_CATALOG.has(eventType) && payload.data?._webhook_dispatch_meta) {
          const meta = payload.data._webhook_dispatch_meta;
          const { dispatchToOutbound } = await import('./webhooks/outbound-dispatcher');
          await dispatchToOutbound({
            eventType: eventType as any,
            organizationId: payload.organization_id,
            storeId: meta.store_id,
            sourceEventId: meta.source_event_id,
            source: meta.source,
            store: meta.store,
            data: payload.data,
          });
        }
      } catch (err) {
        console.error('[EventBus] outbound dispatch failed:', err);
      }

      // 2. Disparar automações via dispatchTrigger — o MESMO motor do
      // caminho moderno. Antes este path criava runs por conta própria e
      // ignorava audience_filters, trigger_filters, frequency_config e
      // idempotência: os filtros e a regra de re-entrada configurados no
      // editor eram silenciosamente descartados para todo gatilho servido
      // pelo EventBus (signup, pedido pago/enviado, deals, webhook...).
      const triggerType = EVENT_TO_TRIGGER_MAP[eventType];
      if (!triggerType) {
        console.log(`[EventBus] No trigger mapping for ${eventType} — event logged only`);
        return result;
      }

      const { dispatchTrigger } = await import('./automation/trigger-dispatcher');
      const dispatch = await dispatchTrigger({
        organizationId: payload.organization_id,
        triggerType,
        triggerData: payload.data,
        contactId: payload.contact_id || null,
        dealId: payload.deal_id || null,
        storeId: this.getPayloadStoreId(payload),
        // As condições legadas do trigger_config (tag, estágio, valor
        // mínimo, pipeline, webhook) continuam valendo — agora como um
        // filtro a mais dentro do pipeline unificado.
        matchConfig: (cfg) => this.matchesTriggerConditions({ trigger_config: cfg }, payload),
        // Chave canônica por evento de negócio: o mesmo pedido chegando
        // pelo webhook, pelo EventBus e pelo pixel converge na mesma
        // chave e gera UM run, não três.
        idempotencyKey: buildEventIdempotencyKey(eventType, payload),
      });

      if (dispatch.runsCreated === 0) {
        console.log(`[EventBus] No runs created for ${eventType} in org ${payload.organization_id}`);
        return result;
      }

      console.log(`[EventBus] ${dispatch.runsCreated} run(s) created for ${eventType}`);

      // 3. Enfileirar cada run para execução imediata. O dispatchTrigger
      // só cria o run (o cron process-runs o pegaria depois); enfileirar
      // aqui preserva a latência baixa que este path sempre teve.
      for (const runId of dispatch.runIds) {
        try {
          await this.enqueueRun(runId);
          result.runIds.push(runId);
          result.automationsTriggered++;
        } catch (error: any) {
          console.error(`[EventBus] Error enqueueing run ${runId}:`, error);
          result.errors?.push(`Run ${runId}: ${error.message}`);
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
      // Hoist o store id para o topo do payload logado. Para eventos Shopify
      // ele vive em data._webhook_dispatch_meta.store_id; hoisting garante
      // que, se este event_logs for (re)processado pelo event-processor / RPC,
      // o store-scope engate corretamente (flows da loja OU org-wide).
      const storeId = this.getPayloadStoreId(payload);
      const loggedPayload = storeId
        ? { ...(payload.data || {}), store_id: storeId, storeId }
        : payload.data;
      await supabase.from('event_logs').insert({
        organization_id: payload.organization_id,
        event_type: eventType,
        contact_id: payload.contact_id || null,
        deal_id: payload.deal_id || null,
        payload: loggedPayload,
        source: payload.source || 'system',
        created_at: payload.timestamp || new Date().toISOString(),
      });
    } catch (error) {
      // Log silencioso - não falhar a emissão por erro de log
      console.warn('[EventBus] Failed to log event:', error);
    }
  }

  /**
   * Extrai o store id de um EventPayload, olhando os locais conhecidos:
   * data.store_id / data.storeId (eventos que já carregam a loja no topo,
   * ex: cart.abandoned do cron) e data._webhook_dispatch_meta.store_id
   * (eventos Shopify de checkout abandonado que carregam a loja na meta
   * de outbound webhook). Retorna null quando não há contexto de loja
   * (eventos não-loja: segment, deal, form sem loja, email events) — nesse
   * caso o comportamento permanece org-wide (sem regressão).
   */
  private getPayloadStoreId(payload: EventPayload): string | null {
    return extractEventPayloadStoreId(payload?.data);
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

    // Verificar cada condição configurada. O editor grava as chaves em
    // camelCase (tagName, minValue, pipelineId, stageId, webhookId) e
    // fluxos antigos/API em snake_case — aceitar as duas grafias, senão
    // o filtro configurado na UI era silenciosamente ignorado aqui.

    // Tag específica
    const cfgTag = config.tag_name || config.tagName;
    if (cfgTag && payload.data.tag_name) {
      if (cfgTag !== payload.data.tag_name) {
        return false;
      }
    }

    // Estágio específico
    const cfgStage = config.stage_id || config.stageId;
    if (cfgStage && payload.data.to_stage_id) {
      if (cfgStage !== payload.data.to_stage_id) {
        return false;
      }
    }

    // Valor mínimo
    const cfgMinValue = config.min_value ?? config.minValue;
    if (cfgMinValue && payload.data.total_value) {
      if (parseFloat(payload.data.total_value) < parseFloat(cfgMinValue)) {
        return false;
      }
    }

    // Pipeline específica
    const cfgPipeline = config.pipeline_id || config.pipelineId;
    if (cfgPipeline && payload.data.pipeline_id) {
      if (cfgPipeline !== payload.data.pipeline_id) {
        return false;
      }
    }

    // Webhook ID específico
    const cfgWebhook = config.webhook_id || config.webhookId;
    if (cfgWebhook && payload.data.webhook_id) {
      if (cfgWebhook !== payload.data.webhook_id) {
        return false;
      }
    }

    return true;
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
