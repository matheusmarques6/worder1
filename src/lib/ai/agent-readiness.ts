// Prontidão de um agente (plano IA, M2 passo 15 — o checklist mínimo que a
// ativação exige até o M4 trazer a avaliação automática): chave do
// provedor, pelo menos uma missão não arquivada e handoff configurado.
// A parte pura é testável sem banco; a leitura mora em loadReadiness.

import type { SupabaseClient } from '@supabase/supabase-js'
import { hasActiveProviderKey } from './provider-key-check'

export interface ReadinessItem {
  id: 'provider_key' | 'mission' | 'handoff' | 'entry' | 'eval'
  ok: boolean
  label: string
  detail: string
  /** false = aviso: não bloqueia a ativação. */
  blocking: boolean
}

export const EVAL_PASS_SCORE = 70

export interface Readiness {
  ready: boolean
  items: ReadinessItem[]
}

export function computeReadiness(input: {
  hasProviderKey: boolean
  provider: string
  missionsCount: number
  handoffKeywords: string[]
  handoffToolEnabled: boolean
  entriesCount: number
  /** Passo 26: nota e graves da avaliação da versão em uso (null = nunca avaliada). */
  evalScore?: number | null
  evalGrave?: number | null
}): Readiness {
  const evalScore = input.evalScore ?? null
  const evalGrave = input.evalGrave ?? null
  const evaluated = evalScore !== null
  const handoffOk = input.handoffToolEnabled || input.handoffKeywords.length > 0
  const items: ReadinessItem[] = [
    {
      id: 'provider_key',
      ok: input.hasProviderKey,
      blocking: true,
      label: 'Chave de IA conectada',
      detail: input.hasProviderKey
        ? `Usa a chave ${input.provider} da conta.`
        : `Sem a chave ${input.provider}, o agente não responde. Conecte em Configurações › Integrações.`,
    },
    {
      id: 'mission',
      ok: input.missionsCount > 0,
      blocking: true,
      label: 'Uma missão ativa',
      detail:
        input.missionsCount > 0
          ? `${input.missionsCount} missão(ões) prontas para usar.`
          : 'Sem missão, o agente não sabe o que fazer quando o cliente chama.',
    },
    {
      id: 'handoff',
      ok: handoffOk,
      blocking: true,
      label: 'Transferência configurada',
      detail: handoffOk
        ? input.handoffKeywords.length > 0
          ? `Transfere para a equipe com ${input.handoffKeywords.slice(0, 2).map((k) => `"${k}"`).join(' e ')}.`
          : 'Transfere para a equipe quando precisar de uma pessoa.'
        : 'Sem isto, o agente não tem para quem passar a conversa quando não souber responder.',
    },
    {
      id: 'entry',
      ok: input.entriesCount > 0,
      blocking: false,
      label: 'Número de WhatsApp',
      detail:
        input.entriesCount > 0
          ? `${input.entriesCount} entrada(s) ligada(s).`
          : 'Sem número, o agente só responde nos toques de fluxo em que for escolhido.',
    },
    {
      id: 'eval',
      // Protótipo: a avaliação sem cenário Grave é obrigatória para ativar
      // (nunca avaliado também bloqueia). Nota abaixo do mínimo é aviso no texto.
      ok: evaluated && (evalGrave ?? 0) === 0,
      blocking: true,
      label: 'Avaliação sem cenário Grave',
      detail: !evaluated
        ? 'Roda os cenários de Conversação e Segurança com o agente. Leva cerca de 1 minuto.'
        : (evalGrave ?? 0) > 0
          ? `${evalGrave} cenário(s) Grave(s) na última avaliação. Nota ${Math.round(evalScore!)}.`
          : `Nota ${Math.round(evalScore!)}${evalScore! < EVAL_PASS_SCORE ? `, abaixo de ${EVAL_PASS_SCORE}` : ''}.`,
    },
  ]
  return { ready: items.every((i) => i.ok || !i.blocking), items }
}

export async function loadReadiness(
  supabase: SupabaseClient,
  organizationId: string,
  agent: { id: string; provider?: string | null; settings?: any },
): Promise<Readiness> {
  const provider = agent.provider || 'openai'
  const [hasKey, missions, entries, version] = await Promise.all([
    hasActiveProviderKey(supabase, organizationId, provider),
    supabase
      .from('ai_missions')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('agent_id', agent.id)
      .neq('status', 'archived'),
    supabase
      .from('ai_agent_entries')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('agent_id', agent.id)
      .eq('active', true),
    supabase
      .from('ai_agent_versions')
      .select('eval_score, eval_grave')
      .eq('organization_id', organizationId)
      .eq('agent_id', agent.id)
      .eq('status', 'produção')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const settings = agent.settings ?? {}
  return computeReadiness({
    hasProviderKey: hasKey,
    provider,
    missionsCount: missions.count ?? 0,
    handoffKeywords: Array.isArray(settings?.safety?.handoff_keywords)
      ? settings.safety.handoff_keywords
      : [],
    handoffToolEnabled: Array.isArray(settings?.tools?.enabled)
      ? settings.tools.enabled.includes('transfer_to_human')
      : false,
    entriesCount: entries.count ?? 0,
    evalScore: version.data?.eval_score === null || version.data?.eval_score === undefined ? null : Number(version.data.eval_score),
    evalGrave: version.data?.eval_grave ?? null,
  })
}
