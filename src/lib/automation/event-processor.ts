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

      // 2. Buscar automações que correspondem
      const { data: automations, error: autoError } = await supabase
        .rpc('find_matching_automations', {
          p_organization_id: event.organization_id,
          p_event_type: event.event_type,
          p_payload: event.payload,
        });

      if (autoError) {
        console.error('[EventProcessor] Error finding automations:', autoError);
        throw autoError;
      }

      console.log(`[EventProcessor] Found ${automations?.length || 0} automations for event ${event.event_type}`);

      // 3. Criar runs para cada automação
      for (const automation of (automations || [])) {
        try {
          const runId = await this.createAndQueueRun(
            automation.automation_id,
            event
          );
          
          if (runId) {
            result.runIds.push(runId);
            result.automationsTriggered++;
          }
        } catch (error: any) {
          console.error(`[EventProcessor] Error creating run for automation ${automation.automation_id}:`, error);
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
   * Cria um automation_run e enfileira para execução
   */
  private async createAndQueueRun(
    automationId: string,
    event: EventRecord
  ): Promise<string | null> {
    const supabase = this.getSupabase();

    // Buscar a automação para pegar os nodes/edges
    const { data: automation, error: autoError } = await supabase
      .from('automations')
      .select('*')
      .eq('id', automationId)
      .single();

    if (autoError || !automation) {
      throw new Error(`Automation not found: ${automationId}`);
    }

    // ⚠️ CRITICAL: Double-check if automation is still active
    // (could have been deactivated between find_matching_automations and now)
    if (automation.status !== 'active') {
      console.log(`[EventProcessor] Automation ${automationId} is no longer active (status: ${automation.status}), skipping`);
      return null;
    }

    // Criar contexto inicial
    const initialContext = {
      organization_id: event.organization_id,
      automation_id: automationId,
      automation_name: automation.name,
      contact_id: event.contact_id,
      deal_id: event.deal_id,
      trigger_type: automation.trigger_type,
      trigger_data: event.payload,
      triggered_at: new Date().toISOString(),
      event_id: event.id,
    };

    // Criar o run
    const { data: run, error: runError } = await supabase
      .from('automation_runs')
      .insert({
        automation_id: automationId,
        contact_id: event.contact_id || null,
        status: 'pending',
        metadata: initialContext,
        trigger_event_id: event.id,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (runError) {
      throw runError;
    }

    console.log(`[EventProcessor] Created run ${run.id} for automation ${automationId}`);

    // Enfileirar para execução
    console.log(`[EventProcessor] Enqueueing run ${run.id}...`);
    console.log(`[EventProcessor] QSTASH_TOKEN configured: ${!!process.env.QSTASH_TOKEN}`);
    console.log(`[EventProcessor] APP_URL: ${process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL}`);
    
    const messageId = await enqueueAutomationRun(run.id);
    
    console.log(`[EventProcessor] QStash messageId: ${messageId || 'null - using fallback'}`);
    
    if (!messageId) {
      // Fallback: executar diretamente se QStash não disponível
      console.log(`[EventProcessor] QStash not available, triggering direct execution`);
      // Não aguardar para não bloquear, o cron vai pegar se falhar
      this.triggerDirectExecution(run.id);
    } else {
      console.log(`[EventProcessor] Run ${run.id} enqueued successfully with messageId: ${messageId}`);
    }

    return run.id;
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
