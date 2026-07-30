// =============================================
// Gravacao dos passos AO VIVO de uma execucao do agente
// (tabela whatsapp_ai_run_steps).
//
// Contrato central: gravar progresso NUNCA pode quebrar nem atrasar a resposta
// do agente. Todo erro aqui e engolido com log — a feature e observabilidade,
// e observabilidade que derruba o que observa e pior que nao ter.
//
// O vocabulario de passos vive em run-steps-shared.ts (puro), porque o painel
// do inbox e client-side e nao pode importar este modulo (supabaseAdmin).
//
// Consumido por: useCloudInboxRealtime (canal de steps) -> AgentActivity.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';
import { wlog } from '@/lib/observability/whatsapp-logger';
import type { AiRunStep } from './run-steps-shared';

// Re-export para quem grava passos nao precisar conhecer os dois modulos.
export {
  AI_RUN_STEPS,
  AI_RUN_STEP_LABELS,
  TERMINAL_AI_RUN_STEPS,
  describeToolCall,
  isTerminalAiRunStep,
  type AiRunStep,
} from './run-steps-shared';

export interface RecordAiStepParams {
  organizationId: string;
  conversationId: string;
  runId: string;
  step: AiRunStep;
  agentId?: string | null;
  /** Texto curto ja pronto para exibicao. */
  detail?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Grava um passo. Best-effort: resolve sempre, nunca lanca.
 */
export async function recordAiStep(params: RecordAiStepParams): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('whatsapp_ai_run_steps').insert({
      organization_id: params.organizationId,
      conversation_id: params.conversationId,
      run_id: params.runId,
      agent_id: params.agentId ?? null,
      step: params.step,
      detail: params.detail ?? null,
      metadata: params.metadata ?? null,
    });
    if (error) {
      // Caso esperado ate a migration 20260730 rodar: tabela inexistente.
      // Warn (nao error) para nao poluir o alerting de quem nao aplicou ainda.
      wlog.warn('whatsapp.ai.step_insert_failed', {
        conversation_id: params.conversationId,
        step: params.step,
        error: error.message,
      });
    }
  } catch (e: any) {
    wlog.warn('whatsapp.ai.step_insert_threw', {
      conversation_id: params.conversationId,
      step: params.step,
      error: e?.message,
    });
  }
}
