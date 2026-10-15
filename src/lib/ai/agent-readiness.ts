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
      label: 'Chave do provedor',
      detail: input.hasProviderKey
        ? `Chave ${input.provider} ativa`
        : `Cadastre uma chave ${input.provider} em Configurações › Integrações`,
    },
    {
      id: 'mission',
      ok: input.missionsCount > 0,
      blocking: true,
      label: 'Pelo menos uma missão',
      detail:
        input.missionsCount > 0
          ? `${input.missionsCount} missão(ões) do agente`
          : 'Crie ou semeie uma missão para este agente',
    },
    {
      id: 'handoff',
      ok: handoffOk,
      blocking: true,
      label: 'Caminho para humano',
      detail: handoffOk
        ? 'Ferramenta transfer_to_human ligada ou palavras de handoff definidas'
        : 'Ligue transfer_to_human ou defina palavras de handoff',
    },
    {
      id: 'entry',
      ok: input.entriesCount > 0,
      blocking: false,
      label: 'Onde atua',
      detail:
        input.entriesCount > 0
          ? `${input.entriesCount} entrada(s)`
          : 'Sem número ou fluxo ligado: só responde se for o único agente ativo',
    },
    {
      id: 'eval',
      ok: evaluated && evalScore! >= EVAL_PASS_SCORE && (evalGrave ?? 0) === 0,
      // Casos graves bloqueiam; nota baixa ou nunca avaliado é só aviso.
      blocking: evaluated && (evalGrave ?? 0) > 0,
      label: 'Avaliação automática',
      detail: !evaluated
        ? 'Ainda não avaliado — rode a avaliação antes de ligar'
        : (evalGrave ?? 0) > 0
          ? `${evalGrave} caso(s) grave(s) na última avaliação (nota ${Math.round(evalScore!)})`
          : `Nota ${Math.round(evalScore!)}${evalScore! < EVAL_PASS_SCORE ? ` — abaixo de ${EVAL_PASS_SCORE}` : ''}`,
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
