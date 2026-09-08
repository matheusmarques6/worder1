/**
 * EVENT PROCESSOR
 * Processa eventos do banco e dispara automações correspondentes
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { enqueueAutomationRun, enqueueAutomationStep, calculateDelaySeconds } from '../queue';

// ============================================
// TYPES
// ============================================

export interface EventRecord {
  id: string;
  organization_id: string;
  event_type: string;
  contact_id?: string;
  deal_id?: string;
  payload: Record<string, any>;
  source: string;
  processed: boolean;
  created_at: string;
}

export interface AutomationMatch {
  automation_id: string;
  automation_name: string;
  trigger_type: string;
}

export interface ProcessResult {
  eventId: string;
  success: boolean;
  automationsTriggered: number;
  runIds: string[];
  error?: string;
}

// ============================================
// EVENT PROCESSOR CLASS
// ============================================

class EventProcessorClass {
  private supabase: SupabaseClient | null = null;

  private getSupabase(): SupabaseClient {
    if (!this.supabase) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase credentials not configured');
      }

      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
    return this.supabase;
  }

  /**
   * Processa um evento específico pelo ID
   */
  async processEvent(eventId: string): Promise<ProcessResult> {
    const supabase = this.getSupabase();
    const result: ProcessResult = {
      eventId,
      success: true,
      automationsTriggered: 0,
      runIds: [],
    };

    try {
      // 1. Buscar o evento
      const { data: event, error: eventError } = await supabase
        .from('event_logs')
        .select('*')
        .eq('id', eventId)
        .single();

      if (eventError || !event) {
        throw new Error(`Event not found: ${eventId}`);
      }

      if (event.processed) {
        console.log(`[EventProcessor] Event ${eventId} already processed`);
        return result;
      }

      // 2. Buscar automações que correspondem ao evento
      // Map event types to trigger types
      const EVENT_TO_TRIGGER: Record<string, string> = {
        'checkout_started': 'trigger_checkout_abandoned',
        'abandoned_cart': 'trigger_abandon',
        'placed_order': 'trigger_order',
        'first_purchase': 'trigger_first_purchase',
        'repeat_purchase': 'trigger_repeat_purchase',
        'order_paid': 'trigger_order_paid',
        'fulfilled_order': 'trigger_fulfilled_order',
        'cancelled_order': 'trigger_cancelled_order',
        'viewed_product': 'trigger_viewed_product',
        'viewed_collection': 'trigger_viewed_collection',
        'page_viewed': 'trigger_viewed_page',
        'browse_abandoned': 'trigger_browse_abandoned',
        'added_to_cart': 'trigger_added_to_cart',
        'active_on_site': 'trigger_active_on_site',
        'form_submitted': 'trigger_form_submitted',
        'customer_created': 'trigger_signup',
        'contact_created': 'trigger_signup',
        'custom_event': 'trigger_custom_event',
        // WhatsApp
        'whatsapp_received': 'trigger_whatsapp',
        'whatsapp_keyword': 'trigger_whatsapp_keyword',
        'whatsapp_first_message': 'trigger_whatsapp_first_message',
        'ctwa_ad': 'trigger_ctwa_ad',
        // E-commerce
        'back_in_stock': 'trigger_back_in_stock',
        // CRM
        'rfm_segment_change': 'trigger_rfm_segment_change',
      };

      const triggerType = EVENT_TO_TRIGGER[event.event_type] || `trigger_${event.event_type}`;

      // Multi-tenant: store id do evento (fica no payload — event_logs não
      // tem coluna store dedicada). Quando presente, escopamos o match para
      // flows dessa loja OU org-wide (store_id NULL) — mesma semântica do
      // path moderno. Ausente → org-wide (eventos não-loja intactos).
      const eventStoreIdRaw =
        (event.payload?.storeId as string) || (event.payload?.store_id as string) || null;
      // uuid guard: o id vai interpolado num .or() contra a coluna uuid
      // automations.store_id — valor malformado geraria 22P02 e derrubaria
      // o processamento do evento. Não-uuid → trata como org-wide (null).
      const eventStoreId: string | null =
        typeof eventStoreIdRaw === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventStoreIdRaw)
          ? eventStoreIdRaw
          : null;

      // 2. Disparo via dispatchTrigger — o MESMO motor do caminho moderno.
      // Antes este path fazia seu próprio match (RPC find_matching_automations
      // com um CASE incompleto, mais uma query de fallback) e criava os runs
      // à mão, ignorando audience_filters, trigger_filters, frequency_config
      // e idempotência. Delegar remove a dependência da RPC (que só existe
      // em migrations-archive) e devolve a esses gatilhos os filtros e a
      // regra de re-entrada configurados no editor.
      const { dispatchTrigger } = await import('./trigger-dispatcher');
      const dispatch = await dispatchTrigger({
        organizationId: event.organization_id,
        triggerType,
        triggerData: event.payload || {},
        contactId: event.contact_id || null,
        dealId: event.deal_id || null,
        storeId: eventStoreId,
        // Condições legadas por event_type (keyword, segmento, RFM, produto)
        // seguem valendo dentro do pipeline unificado.
        matchConfig: (cfg) => matchesTriggerConfig(event.event_type, cfg, event.payload),
        // Reprocessar a mesma linha de event_logs não pode enrolar o
        // contato duas vezes.
        idempotencyKey: `event_log:${event.id}`,
      });

      console.log(`[EventProcessor] ${dispatch.runsCreated} run(s) created for event ${event.event_type}`);

      // 3. Enfileirar os runs criados para execução imediata (o cron
      // process-runs os pegaria depois; enfileirar preserva a latência).
      for (const runId of dispatch.runIds) {
        try {
          const messageId = await enqueueAutomationRun(runId);
          if (!messageId) {
            // Sem QStash: dispara direto, sem aguardar (o cron cobre falha).
            this.triggerDirectExecution(runId);
          }
          result.runIds.push(runId);
          result.automationsTriggered++;
        } catch (error: any) {
          console.error(`[EventProcessor] Error enqueueing run ${runId}:`, error);
        }
      }

      // 4. Marcar evento como processado
      await supabase
        .from('event_logs')
        .update({ 
          processed: true, 
          processed_at: new Date().toISOString() 
        })
        .eq('id', eventId);

      return result;

    } catch (error: any) {
      console.error('[EventProcessor] Error processing event:', error);
      
      // Marcar evento com erro
      await supabase
        .from('event_logs')
        .update({ 
          processed: true, 
          processed_at: new Date().toISOString(),
          error_message: error.message,
        })
        .eq('id', eventId);

      result.success = false;
      result.error = error.message;
      return result;
    }
  }

  /**
   * Processa eventos pendentes (batch)
   */
  async processPendingEvents(limit: number = 100): Promise<{
    processed: number;
    errors: number;
    results: ProcessResult[];
  }> {
    const supabase = this.getSupabase();
    
    // Buscar eventos não processados
    const { data: events, error } = await supabase
      .from('event_logs')
      .select('id')
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw error;
    }

    const results: ProcessResult[] = [];
    let processed = 0;
    let errors = 0;

    for (const event of (events || [])) {
      const result = await this.processEvent(event.id);
      results.push(result);
      
      if (result.success) {
        processed++;
      } else {
        errors++;
      }
    }

    return { processed, errors, results };
  }

  /**
   * Execução direta quando QStash não está disponível
   */
  private async triggerDirectExecution(runId: string): Promise<void> {
    let appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';
    
    // Garantir que tem protocolo
    if (!appUrl.startsWith('http://') && !appUrl.startsWith('https://')) {
      appUrl = `https://${appUrl}`;
    }
    
    console.log(`[EventProcessor] Direct execution URL: ${appUrl}/api/workers/automation`);
    
    try {
      const response = await fetch(`${appUrl}/api/workers/automation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Request': 'true',
        },
        body: JSON.stringify({
          action: 'execute_run',
          runId,
        }),
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error(`[EventProcessor] Direct execution failed for run ${runId}:`, error);
      } else {
        console.log(`[EventProcessor] Direct execution triggered for run ${runId}`);
      }
    } catch (error) {
      console.error(`[EventProcessor] Error triggering direct execution for run ${runId}:`, error);
      // O cron vai pegar runs pendentes
    }
  }

  /**
   * Agenda um step para execução futura (delay)
   */
  async scheduleDelayedStep(
    runId: string,
    nodeId: string,
    delayValue: number,
    delayUnit: 'minutes' | 'hours' | 'days',
    context: Record<string, any>
  ): Promise<string | null> {
    const supabase = this.getSupabase();
    const delaySeconds = calculateDelaySeconds(delayValue, delayUnit);
    
    // Atualizar o run para status 'waiting'
    await supabase
      .from('automation_runs')
      .update({
        status: 'waiting',
        current_node_id: nodeId,
        waiting_until: new Date(Date.now() + delaySeconds * 1000).toISOString(),
      })
      .eq('id', runId);

    // Enfileirar com delay
    const messageId = await enqueueAutomationStep(runId, nodeId, context, delaySeconds);
    
    console.log(`[EventProcessor] Scheduled step ${nodeId} for run ${runId} in ${delayValue} ${delayUnit}`);
    
    return messageId;
  }

  /**
   * Retoma execução de um run após delay
   */
  async resumeRun(runId: string, nodeId: string): Promise<void> {
    const supabase = this.getSupabase();
    
    // Buscar o run com a automação para verificar status
    const { data: run, error: runError } = await supabase
      .from('automation_runs')
      .select('*, automations!inner(id, status)')
      .eq('id', runId)
      .single();

    if (runError || !run) {
      console.error(`[EventProcessor] Run not found for resume: ${runId}`);
      return;
    }

    // ⚠️ CRITICAL: Check if automation is still active
    const automation = (run as any).automations;
    if (automation?.status !== 'active') {
      console.log(`[EventProcessor] Automation ${automation?.id} is not active, cancelling resume for run ${runId}`);
      
      await supabase
        .from('automation_runs')
        .update({
          status: 'cancelled',
          waiting_until: null,
          completed_at: new Date().toISOString(),
          last_error: `Automação desativada (status: ${automation?.status})`,
        })
        .eq('id', runId);
      
      return;
    }
    
    // Atualizar status
    await supabase
      .from('automation_runs')
      .update({
        status: 'running',
        waiting_until: null,
      })
      .eq('id', runId);

    // Enfileirar para continuar execução
    const messageId = await enqueueAutomationRun(runId, { delay: 0 });
    
    if (!messageId) {
      await this.triggerDirectExecution(runId);
    }
  }
}

// ============================================
// HELPER: Match event payload against trigger_config
// ============================================

function matchesTriggerConfig(
  eventType: string,
  config: Record<string, any>,
  payload: Record<string, any>
): boolean {
  if (!config || Object.keys(config).length === 0) return true;

  // Keyword match (trigger_whatsapp_keyword): config.keywords = ['cupom', 'desconto'] or config.keyword = 'cupom'
  if (eventType === 'whatsapp_keyword' || eventType === 'whatsapp_received') {
    const configuredKeywords: string[] = Array.isArray(config.keywords)
      ? config.keywords
      : config.keyword
      ? [config.keyword]
      : [];
    if (configuredKeywords.length > 0) {
      const text = (payload.message_text || payload.text || '').toString().toLowerCase();
      if (!text) return false;
      const matchMode = config.match_mode || 'contains'; // 'contains' | 'exact' | 'starts_with'
      const matched = configuredKeywords.some((kw) => {
        const k = kw.toLowerCase().trim();
        if (!k) return false;
        if (matchMode === 'exact') return text === k;
        if (matchMode === 'starts_with') return text.startsWith(k);
        return text.includes(k);
      });
      if (!matched) return false;
    }
  }

  // RFM segment change (trigger_rfm_segment_change): o defaultConfig do
  // catálogo grava fromSegment/toSegment (camel) — aceitar as duas grafias.
  if (eventType === 'rfm_segment_change') {
    const cfgTo = config.to_segment || config.toSegment;
    const cfgFrom = config.from_segment || config.fromSegment;
    if (cfgTo && payload.to_segment !== cfgTo) return false;
    if (cfgFrom && payload.from_segment !== cfgFrom) return false;
  }

  // Back in stock (trigger_back_in_stock): config.product_id (specific product only)
  if (eventType === 'back_in_stock') {
    if (config.product_id && String(payload.product_id) !== String(config.product_id)) return false;
  }

  // CTWA ad (trigger_ctwa_ad): config.ad_id / config.source_id
  if (eventType === 'ctwa_ad') {
    if (config.ad_id && payload.ad_id !== config.ad_id) return false;
    if (config.source_id && payload.source_id !== config.source_id) return false;
  }

  // Generic fallthrough: tag / stage / pipeline (matches EventBus logic)
  if (config.tag_name && payload.tag_name && config.tag_name !== payload.tag_name) return false;
  if (config.stage_id && payload.to_stage_id && config.stage_id !== payload.to_stage_id) return false;
  if (config.pipeline_id && payload.pipeline_id && config.pipeline_id !== payload.pipeline_id) return false;

  return true;
}

// ============================================
// SINGLETON EXPORT
// ============================================

let processorInstance: EventProcessorClass | null = null;

export function getEventProcessor(): EventProcessorClass {
  if (!processorInstance) {
    processorInstance = new EventProcessorClass();
  }
  return processorInstance;
}

export const EventProcessor = {
  processEvent: (eventId: string) => getEventProcessor().processEvent(eventId),
  processPendingEvents: (limit?: number) => getEventProcessor().processPendingEvents(limit),
  scheduleDelayedStep: (
    runId: string,
    nodeId: string,
    delayValue: number,
    delayUnit: 'minutes' | 'hours' | 'days',
    context: Record<string, any>
  ) => getEventProcessor().scheduleDelayedStep(runId, nodeId, delayValue, delayUnit, context),
  resumeRun: (runId: string, nodeId: string) => getEventProcessor().resumeRun(runId, nodeId),
};

export default EventProcessor;
