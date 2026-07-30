// =============================================
// "O agente vai responder nesta conversa?" — avaliado ANTES de chegar
// mensagem.
//
// Por que existe: o badge do inbox dizia "Bot Ativo" olhando so
// conversation.ai_enabled. Mas quem cala o agente na maioria dos casos reais
// nao e essa flag — sao os guards de comportamento do cloud-runner
// (stop_on_human_reply, max_messages, activate_on, cooldown de transferencia).
// Resultado: badge verde, agente mudo, e nenhuma explicacao em lugar nenhum.
// Caso concreto: uma unica mensagem manual em 13/07 silenciou o agente para
// sempre naquela conversa, com o badge verde o tempo todo.
//
// Anti-divergencia: as duas consultas que decidem stop_on_human e max_messages
// vivem AQUI e sao importadas pelo cloud-runner. Reimplementa-las nos dois
// lados garantiria que um dia divergissem — e um badge que mente sobre o
// motivo e pior que um badge que so diz "ativo".
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';
import { isTransferCooldownActive } from './guards';

export type AiBlockerReason =
  | 'ai_disabled'
  | 'no_active_agent'
  | 'agent_not_found'
  | 'manual_activation_required'
  | 'transfer_cooldown'
  | 'max_messages'
  | 'stop_on_human';

export interface ConversationAiStatus {
  /** false => o agente NAO vai responder ao proximo inbound. */
  willRespond: boolean;
  reason: AiBlockerReason | null;
  /** Rotulo curto para o badge. */
  label: string;
  /** Explicacao acionavel (o que fazer para destravar). */
  detail?: string;
  agentId?: string;
  agentName?: string;
}

export const AI_BLOCKER_LABELS: Record<AiBlockerReason, string> = {
  ai_disabled: 'Bot desligado',
  no_active_agent: 'Sem agente',
  agent_not_found: 'Agente ausente',
  manual_activation_required: 'Bot não atribuído',
  transfer_cooldown: 'Bot em espera',
  max_messages: 'Limite atingido',
  stop_on_human: 'Bot pausado',
};

const AI_BLOCKER_DETAILS: Record<AiBlockerReason, string> = {
  ai_disabled: 'A IA foi desligada nesta conversa.',
  no_active_agent: 'Nenhum agente de IA ativo está configurado para este canal.',
  agent_not_found: 'O agente configurado não foi encontrado.',
  manual_activation_required:
    'Este agente é de ativação manual e não está atribuído a esta conversa.',
  transfer_cooldown:
    'A conversa foi transferida para um humano há pouco; o agente volta quando o cooldown terminar.',
  max_messages: 'O agente atingiu o limite de respostas configurado para uma conversa.',
  stop_on_human:
    'Alguém respondeu manualmente aqui, e o agente está configurado para parar quando isso acontece (stop_on_human_reply).',
};

/**
 * Existe alguma mensagem enviada manualmente por um humano nesta conversa?
 * Compartilhado com o guard stop_on_human_reply do cloud-runner.
 */
export async function hasHumanReply(
  organizationId: string,
  conversationId: string,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('whatsapp_cloud_messages')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversationId)
    .eq('sender', 'human')
    .limit(1)
    .maybeSingle();
  return !!data;
}

/**
 * Quantas respostas o agente ja enviou nesta conversa.
 * Compartilhado com o guard max_messages_per_conversation do cloud-runner.
 */
export async function countBotMessages(
  organizationId: string,
  conversationId: string,
): Promise<number> {
  const { count } = await supabaseAdmin
    .from('whatsapp_cloud_messages')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversationId)
    .eq('sent_by_bot', true);
  return count || 0;
}

/**
 * Avalia os guards na MESMA ordem do cloud-runner.
 *
 * O cooldown curto (5s entre respostas) fica de fora de proposito: e transiente
 * e some sozinho, entao mostra-lo no badge seria ruido piscando.
 */
export async function resolveConversationAiStatus(params: {
  conversation: {
    id: string;
    waba_id: string;
    ai_enabled?: boolean | null;
    ai_agent_id?: string | null;
    ai_transferred_at?: string | null;
  };
  organizationId: string;
}): Promise<ConversationAiStatus> {
  const { conversation, organizationId } = params;

  const blocked = (reason: AiBlockerReason, extra?: Partial<ConversationAiStatus>) => ({
    willRespond: false,
    reason,
    label: AI_BLOCKER_LABELS[reason],
    detail: AI_BLOCKER_DETAILS[reason],
    ...extra,
  });

  if (conversation.ai_enabled === false) return blocked('ai_disabled');

  const { data: agentRows } = await supabaseAdmin.rpc('get_active_agent_for_conversation', {
    p_organization_id: organizationId,
    p_channel_id: conversation.waba_id,
    p_pipeline_stage_id: null,
  });
  if (!agentRows || agentRows.length === 0) return blocked('no_active_agent');

  const agentId: string = agentRows[0].agent_id;

  const { data: agent } = await supabaseAdmin
    .from('ai_agents')
    .select('id, name, settings')
    .eq('id', agentId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (!agent) return blocked('agent_not_found', { agentId });

  const agentMeta = { agentId, agentName: agent.name as string | undefined };
  const behavior = (agent.settings as any)?.behavior || {};

  if (behavior.activate_on === 'manual' && conversation.ai_agent_id !== agentId) {
    return blocked('manual_activation_required', agentMeta);
  }

  if (
    isTransferCooldownActive({
      transferredAt: conversation.ai_transferred_at,
      cooldownSeconds: behavior.cooldown_after_transfer,
    })
  ) {
    return blocked('transfer_cooldown', agentMeta);
  }

  const maxMessages = Number(behavior.max_messages_per_conversation || 0);
  if (maxMessages > 0) {
    const sent = await countBotMessages(organizationId, conversation.id);
    if (sent >= maxMessages) return blocked('max_messages', agentMeta);
  }

  if (behavior.stop_on_human_reply !== false) {
    if (await hasHumanReply(organizationId, conversation.id)) {
      return blocked('stop_on_human', agentMeta);
    }
  }

  return { willRespond: true, reason: null, label: 'Bot ativo', ...agentMeta };
}
