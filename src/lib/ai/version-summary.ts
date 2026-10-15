// Resumo por área do que mudou entre duas configurações de agente (plano IA
// M4 passo 25). Puro: as linhas vão para ai_agent_versions.change_summary e
// para o modal "o que muda em relação a hoje" ao restaurar.

import { TOOL_CATALOG } from './tools/catalog'

export interface VersionableConfig {
  system_prompt?: string | null
  persona?: Record<string, any> | null
  settings?: Record<string, any> | null
}

const TOOL_LABEL = new Map(TOOL_CATALOG.map((t) => [t.name, t.label]))
const TONE: Record<string, string> = { casual: 'Casual', friendly: 'Amigável', professional: 'Profissional', luxury: 'Luxo' }
const LENGTH: Record<string, string> = { short: 'curto', medium: 'médio', long: 'longo' }

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function setDiff(before: string[], after: string[]) {
  return { added: after.filter((x) => !before.includes(x)), removed: before.filter((x) => !after.includes(x)) }
}

function quoteAll(items: string[], label = (x: string) => x): string {
  return items.map((x) => `“${label(x)}”`).join(', ')
}

export function summarizeChanges(before: VersionableConfig, after: VersionableConfig): string[] {
  const lines: string[] = []
  const pb = before.persona ?? {}
  const pa = after.persona ?? {}
  const sb = before.settings ?? {}
  const sa = after.settings ?? {}

  if ((before.system_prompt ?? '').trim() !== (after.system_prompt ?? '').trim()) {
    lines.push('Instruções: texto base alterado')
  }
  if (pb.tone !== pa.tone && pa.tone) lines.push(`Identidade: voz ${TONE[pb.tone] ?? pb.tone ?? '—'} → ${TONE[pa.tone] ?? pa.tone}`)
  if (pb.response_length !== pa.response_length && pa.response_length) {
    lines.push(`Adaptação: tamanho ${LENGTH[pb.response_length] ?? pb.response_length ?? '—'} → ${LENGTH[pa.response_length] ?? pa.response_length}`)
  }
  if (pb.language !== pa.language && pa.language) lines.push(`Identidade: idioma ${pb.language ?? '—'} → ${pa.language}`)

  const tools = setDiff(list(sb.tools?.enabled), list(sa.tools?.enabled))
  if (tools.added.length) lines.push(`Ferramentas: ligou ${quoteAll(tools.added, (n) => TOOL_LABEL.get(n) ?? n)}`)
  if (tools.removed.length) lines.push(`Ferramentas: desligou ${quoteAll(tools.removed, (n) => TOOL_LABEL.get(n) ?? n)}`)

  const blocked = setDiff(list(sb.safety?.blocked_topics), list(sa.safety?.blocked_topics))
  if (blocked.added.length) lines.push(`Limites: novo assunto proibido ${quoteAll(blocked.added)}`)
  if (blocked.removed.length) lines.push(`Limites: liberou ${quoteAll(blocked.removed)}`)
  const rules = setDiff(list(pb.guidelines), list(pa.guidelines))
  if (rules.added.length) lines.push(`Limites: nova regra ${quoteAll(rules.added)}`)
  if (rules.removed.length) lines.push(`Limites: removeu a regra ${quoteAll(rules.removed)}`)

  const keywords = setDiff(list(sb.safety?.handoff_keywords), list(sa.safety?.handoff_keywords))
  if (keywords.added.length) lines.push(`Transferência: novas palavras ${quoteAll(keywords.added)}`)
  if (keywords.removed.length) lines.push(`Transferência: removeu ${quoteAll(keywords.removed)}`)
  if ((sb.safety?.handoff_confirmation_message ?? '') !== (sa.safety?.handoff_confirmation_message ?? '')) {
    lines.push('Transferência: mensagem de confirmação alterada')
  }

  const judgeName = (j: any) => String(j?.name || j?.criterion || 'juiz')
  const judgesB: any[] = Array.isArray(sb.judges?.custom) ? sb.judges.custom : []
  const judgesA: any[] = Array.isArray(sa.judges?.custom) ? sa.judges.custom : []
  const judges = setDiff(judgesB.map((j) => j.id), judgesA.map((j) => j.id))
  for (const id of judges.added) lines.push(`Revisão: novo juiz “${judgeName(judgesA.find((j) => j.id === id))}”`)
  for (const id of judges.removed) lines.push(`Revisão: removeu o juiz “${judgeName(judgesB.find((j) => j.id === id))}”`)
  for (const j of judgesA) {
    const old = judgesB.find((b) => b.id === j.id)
    if (old && (old.active !== false) !== (j.active !== false)) lines.push(`Revisão: ${j.active === false ? 'pausou' : 'reativou'} “${judgeName(j)}”`)
  }

  const db = sb.delivery ?? {}
  const da = sa.delivery ?? {}
  if (db.debounce_seconds !== da.debounce_seconds && da.debounce_seconds !== undefined) {
    lines.push(`Entrega: espera ${db.debounce_seconds ?? '—'}s → ${da.debounce_seconds}s`)
  }
  if ((db.split_bubbles !== false) !== (da.split_bubbles !== false)) lines.push(`Entrega: ${da.split_bubbles === false ? 'uma mensagem só' : 'divide em balões'}`)

  const behaviorB = JSON.stringify(sb.behavior ?? {})
  const behaviorA = JSON.stringify(sa.behavior ?? {})
  if (behaviorB !== behaviorA) lines.push('Comportamento: ativação/pausas alteradas')
  if (JSON.stringify(sb.schedule ?? {}) !== JSON.stringify(sa.schedule ?? {})) lines.push('Horário: alterado')

  return lines
}

/** Rótulo curto da versão a partir do resumo. */
export function labelFromSummary(lines: string[]): string {
  if (lines.length === 0) return 'Sem mudanças de configuração'
  if (lines.length === 1) return lines[0]
  return `${lines[0]} (+${lines.length - 1})`
}
