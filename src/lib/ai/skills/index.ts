// =============================================
// Skills — micro-comportamentos do agente que disparam por phrase match.
//
// Diferente de tools (handler executável), skills são instruções de prompt
// adicionais que o runner injeta como mensagem system quando uma das
// trigger_phrases bate com a mensagem do usuário. Permite "modos" sem
// precisar de novo agente (ex: "modo orçamento", "modo agendamento").
//
// Match: case-insensitive, substring (não regex). Múltiplas skills podem
// disparar simultaneamente — todas as instruções entram no prompt.
// =============================================

import { getSupabaseAdmin } from '@/lib/supabase-admin'

export interface SkillRow {
  id: string
  agent_id: string
  organization_id: string
  name: string
  description: string | null
  trigger_phrases: string[]
  instructions: string
  tools_used: string[]
  enabled: boolean
  total_invocations: number
  total_successes: number
}

export interface MatchedSkill {
  skillId: string
  name: string
  instructions: string
}

/**
 * Detecta skills cujos trigger_phrases batem com o texto. Retorna no
 * máximo 3 (evita prompt-pollution).
 */
export async function matchSkills(
  agentId: string,
  text: string,
): Promise<MatchedSkill[]> {
  if (!text || !text.trim()) return []
  const supabase = getSupabaseAdmin()
  const { data: skills } = await supabase
    .from('ai_agent_skills')
    .select('id, name, trigger_phrases, instructions, enabled')
    .eq('agent_id', agentId)
    .eq('enabled', true)

  if (!skills || skills.length === 0) return []
  const lower = text.toLowerCase()

  const matches: MatchedSkill[] = []
  for (const s of skills) {
    const phrases = (s.trigger_phrases as string[]) ?? []
    const hit = phrases.some((p) => p && lower.includes(p.toLowerCase()))
    if (hit) {
      matches.push({
        skillId: s.id as string,
        name: s.name as string,
        instructions: s.instructions as string,
      })
      if (matches.length >= 3) break
    }
  }
  return matches
}

/**
 * Atualiza usage stats das skills que dispararam (best-effort, não
 * bloqueia o runner se falhar).
 */
export async function recordSkillInvocations(
  matched: MatchedSkill[],
  successful: boolean,
): Promise<void> {
  if (matched.length === 0) return
  const supabase = getSupabaseAdmin()
  for (const m of matched) {
    const { data: row } = await supabase
      .from('ai_agent_skills')
      .select('total_invocations, total_successes')
      .eq('id', m.skillId)
      .maybeSingle()
    if (!row) continue
    await supabase
      .from('ai_agent_skills')
      .update({
        total_invocations: (row.total_invocations ?? 0) + 1,
        total_successes: (row.total_successes ?? 0) + (successful ? 1 : 0),
      })
      .eq('id', m.skillId)
  }
}
