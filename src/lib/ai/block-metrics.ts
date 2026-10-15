// O Construtor (plano IA M6 passo 31): métricas por bloco e diagnóstico.
// Puro e testado; as rotas só leem e repassam. Cada bloco do canvas
// (entradas, conhecimento, ferramentas, agente, limites, revisão,
// transferência, envio) recebe os números da janela, e o diagnóstico
// devolve avisos ligados ao nó que precisa de atenção.

import type { OutcomeRow } from './activity-summary'
import { computeKpis } from './activity-summary'

export interface ToolCallRow { tool_name: string; success: boolean; output: any; conversation_id: string | null }

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0)
const ratio = (a: number, b: number) => (b > 0 ? a / b : null)

export function blockMetrics(input: {
  outcomes: OutcomeRow[]
  toolCalls: ToolCallRow[]
  sources: Array<{ id: string; name: string }>
  entries: Array<{ id: string; kind: string; label: string }>
}) {
  const k = computeKpis(input.outcomes)
  const messages = input.outcomes.reduce((s, r) => s + r.messages_sent, 0)
  const blocked = input.outcomes.reduce((s, r) => s + r.blocked_count, 0)

  const sourceUse = new Map<string, number>()
  const byTool = new Map<string, { calls: number; ok: number; issued: number; denied: number }>()
  for (const call of input.toolCalls) {
    if (call.tool_name === 'search_knowledge') {
      const ids = new Set<string>((call.output?.chunks ?? []).map((c: any) => c?.source_id).filter(Boolean))
      for (const id of ids) sourceUse.set(id, (sourceUse.get(id) ?? 0) + 1)
      continue
    }
    const t = byTool.get(call.tool_name) ?? { calls: 0, ok: 0, issued: 0, denied: 0 }
    t.calls += 1
    if (call.success) t.ok += 1
    if (call.tool_name === 'create_coupon') {
      if (call.output?.decision === 'denied') t.denied += 1
      else if (call.success) t.issued += 1
    }
    byTool.set(call.tool_name, t)
  }

  return {
    entries: input.entries.map((e) => ({
      id: e.id, kind: e.kind, label: e.label,
      // O desfecho ainda não guarda a entrada (outcome.entry_id): com uma
      // entrada só, os números do agente SÃO os dela; com várias, null.
      conversations: input.entries.length === 1 ? k.conversations : null,
      first_response_ms: input.entries.length === 1 ? k.first_response_ms : null,
      purchase_rate: input.entries.length === 1 ? k.conversion : null,
    })),
    knowledge: input.sources.map((s) => ({ id: s.id, name: s.name, uses: sourceUse.get(s.id) ?? 0 })),
    tools: [...byTool.entries()].map(([name, t]) => ({
      name, calls: t.calls, success_rate: ratio(t.ok, t.calls),
      ...(name === 'create_coupon' ? { issued: t.issued, denied: t.denied } : {}),
    })),
    agent: {
      conversations: k.conversations, revenue: k.revenue, cost_usd: k.cost_usd,
      cost_per_conversation: k.cost_per_conversation, orders: k.orders,
    },
    adaptation: { adjusted_rate: null as number | null },
    limits: { blocked },
    review: { approved_rate: ratio(messages, messages + blocked), rejected: blocked },
    needs_person: { transferred: k.transfers, rate: k.conversations ? k.transfer_rate : null },
    transfer: { avg_wait_ms: null as number | null, reasons: countReasons(input.outcomes) },
    send: { replies: messages, resolved_rate: ratio(k.resolved_without_human, k.conversations) },
  }
}

function countReasons(rows: OutcomeRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) if (r.transferred) out[r.handoff_reason ?? 'sem motivo'] = (out[r.handoff_reason ?? 'sem motivo'] ?? 0) + 1
  return out
}

/** Item do diagnóstico no formato do protótipo (ISSUES): título, explicação
 *  e nível. `node` diz qual bloco do Construtor acender: 'agent', 'entries',
 *  'tools', 'tool:<nome>', 'knowledge', 'knowledge:<id>', 'review',
 *  'split' ou 'transfer'. Itens 'ok' entram na conta de "tudo certo". */
export interface Diagnostic {
  id: string
  lv: 'error' | 'warn' | 'ok'
  node: string
  t: string
  d: string
}

const brl2 = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function diagnose(input: {
  agentName: string
  hasProviderKey: boolean
  provider: string
  activeMissions: Array<{ id: string; event_type: string; display_name?: string | null; concession: any }>
  enabledTools: string[]
  handoffKeywords: string[]
  sources: Array<{ id: string; name: string; status: string | null }>
  blocked7d: number
  monthlyCapUsd: number | null
  monthSpendUsd: number
  /** Cotação USD→BRL para os valores do texto. */
  usdBrl: number
}): Diagnostic[] {
  const out: Diagnostic[] = []
  const n = input.agentName || 'O agente'
  const brl = (usd: number) => brl2(usd * input.usdBrl)

  if (!input.hasProviderKey) {
    out.push({ id: 'no_key', lv: 'error', node: 'agent', t: `Sem chave ${input.provider} conectada`, d: `Sem a chave, ${n} não responde ninguém. Conecte em Configurações › Integrações.` })
  } else {
    out.push({ id: 'key_ok', lv: 'ok', node: 'agent', t: 'Chave de IA conectada', d: `${n} usa a chave ${input.provider} da conta.` })
  }

  if (input.activeMissions.length === 0) {
    out.push({ id: 'no_mission', lv: 'error', node: 'entries', t: 'Nenhuma missão ativa', d: `Sem missão, ${n} fica em silêncio em toda conversa.` })
  } else {
    out.push({ id: 'mission_ok', lv: 'ok', node: 'entries', t: `${input.activeMissions.length} missão(ões) ativa(s)`, d: input.activeMissions.map((m) => m.display_name || m.event_type).join(' · ') })
  }

  for (const m of input.activeMissions) {
    const kind = m.concession?.kind
    if (!kind || kind === 'none') continue
    const label = m.display_name || m.event_type
    if (input.enabledTools.includes('create_coupon')) {
      out.push({ id: `coupon_ok:${m.id}`, lv: 'ok', node: 'tool:create_coupon', t: `${label} autoriza cupom e Criar cupom está ligado`, d: 'A trava dupla está completa para este fluxo.' })
    } else {
      out.push({ id: `coupon_off:${m.id}`, lv: 'warn', node: 'tools', t: `${label} autoriza cupom, mas Criar cupom está desligado`, d: 'O fluxo libera o desconto e o agente não consegue emitir. Ligue a ferramenta ou tire a autorização do toque.' })
    }
  }

  if (!input.enabledTools.includes('transfer_to_human') && input.handoffKeywords.length === 0) {
    out.push({ id: 'no_handoff', lv: 'error', node: 'transfer', t: 'Sem caminho para uma pessoa', d: `Sem isto, ${n} não tem para quem passar a conversa quando não souber responder.` })
  } else {
    out.push({ id: 'handoff_ok', lv: 'ok', node: 'split', t: 'Transferência configurada', d: input.handoffKeywords.length ? `Transfere com ${input.handoffKeywords.slice(0, 3).map((k) => `"${k}"`).join(', ')}.` : 'Transfere quando o agente decide que precisa de uma pessoa.' })
  }

  let sourcesOk = 0
  for (const s of input.sources) {
    if (s.status === 'error') out.push({ id: `source_error:${s.id}`, lv: 'warn', node: `knowledge:${s.id}`, t: `A fonte "${s.name}" falhou ao processar`, d: `Até corrigir, ${n} não consulta esse conteúdo.` })
    else if (s.status === 'pending' || s.status === 'processing') out.push({ id: `source_sync:${s.id}`, lv: 'warn', node: `knowledge:${s.id}`, t: `${s.name} ainda sincronizando`, d: `Até terminar, ${n} pode citar informação antiga dessa fonte.` })
    else sourcesOk += 1
  }
  if (sourcesOk > 0) out.push({ id: 'sources_ok', lv: 'ok', node: 'knowledge', t: `${sourcesOk} fonte(s) prontas`, d: 'Conteúdo processado e disponível para consulta.' })

  if (input.blocked7d >= 5) {
    out.push({ id: 'many_blocks', lv: 'warn', node: 'review', t: `A revisão reprovou ${input.blocked7d} respostas`, d: 'Em 7 dias. Vale revisar o texto dos critérios ou rodar o Testar com essas perguntas.' })
  } else {
    out.push({ id: 'review_ok', lv: 'ok', node: 'review', t: 'Revisão antes de enviar ligada', d: input.blocked7d ? `${input.blocked7d} resposta(s) reprovada(s) em 7 dias.` : 'Nenhuma resposta reprovada em 7 dias.' })
  }

  if (input.monthlyCapUsd && input.monthlyCapUsd > 0) {
    const ratio = input.monthSpendUsd / input.monthlyCapUsd
    const pct = Math.round(ratio * 100)
    if (ratio >= 0.8) {
      out.push({ id: 'cap_80', lv: ratio >= 1 ? 'error' : 'warn', node: 'agent', t: `Limite do mês em ${pct}%`, d: `${brl(input.monthSpendUsd)} de ${brl(input.monthlyCapUsd)}. Ao atingir o limite, ${n} pausa e avisa a equipe.` })
    } else {
      out.push({ id: 'cap_ok', lv: 'ok', node: 'agent', t: `Limite do mês em ${pct}%`, d: `${brl(input.monthSpendUsd)} de ${brl(input.monthlyCapUsd)}.` })
    }
  }
  return out
}

export function monthSpend(rows: Array<{ cost_usd: unknown }>): number {
  return Math.round(rows.reduce((s, r) => s + num(r.cost_usd), 0) * 10000) / 10000
}
