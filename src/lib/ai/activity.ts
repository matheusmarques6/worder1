// Trilha única do runtime (Adendo §B, 9.4).
//
// A Atividade lê a trilha NOVA (internal.llm_calls/tool_calls/judge_scores +
// conversations) pelas views de compatibilidade `ai_runtime_activity*` —
// leitura de service_role, então o escopo de org vive AQUI, na query, sempre.
// O detalhe de uma conversa só sai depois de provar que ela é da org (guarda
// anti-IDOR: id de conversa não é capability).
//
// Os legados (agent_traces/ai_message_logs) ficam congelados para consulta
// histórica — este módulo não os toca.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface RuntimeActivityRow {
  conversation_id: string;
  organization_id: string;
  contact_id: string | null;
  last_channel: string | null;
  last_inbound_at: string | null;
  created_at: string;
  mission_version_id: string | null;
  mission_event_type: string | null;
  mission_objective: string | null;
  llm_calls: number | null;
  cost_usd: number | null;
  tool_calls: number | null;
  last_judge_verdict: 'pass' | 'fail' | 'critical' | null;
  last_judge_score: number | null;
}

export interface RuntimeActivityDetail {
  conversation: RuntimeActivityRow;
  calls: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
}

export async function listRuntimeActivity(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<RuntimeActivityRow[]> {
  const { data, error } = await supabase
    .from('ai_runtime_activity')
    .select('*')
    .eq('organization_id', organizationId)
    .order('last_inbound_at', { ascending: false, nullsFirst: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as RuntimeActivityRow[];
}

export async function runtimeConversationDetail(
  supabase: SupabaseClient,
  organizationId: string,
  conversationId: string,
): Promise<RuntimeActivityDetail | null> {
  const { data: rows, error } = await supabase
    .from('ai_runtime_activity')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('conversation_id', conversationId)
    .limit(1);
  if (error) throw new Error(error.message);
  const conversation = (rows ?? [])[0] as RuntimeActivityRow | undefined;
  if (!conversation) return null;

  // As views ai_runtime_activity_calls/_tools não têm security_invoker (nenhuma
  // view desta trilha tem), então a RLS das tabelas internal.* não é avaliada
  // aqui — o .eq('organization_id', ...) abaixo É a fronteira de tenancy, não
  // um reforço da RLS. Hoje o guard `if (!conversation) return null` acima já
  // barra o vazamento, mas essa proteção é por ordem de execução: some se
  // alguém reordenar o fluxo ou extrair este trecho. Por isso o filtro vai
  // explícito aqui também, mesmo parecendo redundante. Não remova achando que
  // "já está protegido" — releia este comentário antes de simplificar.
  const [calls, tools] = await Promise.all([
    supabase
      .from('ai_runtime_activity_calls')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }),
    supabase
      .from('ai_runtime_activity_tools')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true }),
  ]);
  if (calls.error) throw new Error(calls.error.message);
  if (tools.error) throw new Error(tools.error.message);

  return {
    conversation,
    calls: (calls.data ?? []) as Array<Record<string, unknown>>,
    tools: (tools.data ?? []) as Array<Record<string, unknown>>,
  };
}
