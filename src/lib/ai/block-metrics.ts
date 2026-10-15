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

export interface Diagnostic { id: string; severity: 'error' | 'warning'; node: string; message: string }

export function diagnose(input: {
  hasProviderKey: boolean
  provider: string
  activeMissions: Array<{ id: string; event_type: string; concession: any }>
  enabledTools: string[]
  handoffKeywords: string[]
  sources: Array<{ id: string; name: string; status: string | null }>
  blocked7d: number
  monthlyCapUsd: number | null
  monthSpendUsd: number
}): Diagnostic[] {
  const out: Diagnostic[] = []
  if (!input.hasProviderKey) {
    out.push({ id: 'no_key', severity: 'error', node: 'agent', message: `Sem chave ${input.provider}: o agente não responde.` })
  }
  if (input.activeMissions.length === 0) {
    out.push({ id: 'no_mission', severity: 'error', node: 'entries', message: 'Nenhuma missão ativa: o agente fica em silêncio em toda conversa.' })
  }
  for (const m of input.activeMissions) {
    const kind = m.concession?.kind
    if (kind && kind !== 'none' && !input.enabledTools.includes('create_coupon')) {
      out.push({ id: `coupon_off:${m.id}`, severity: 'warning', node: 'tools', message: `A missão ${m.event_type} autoriza desconto, mas a ferramenta de cupom está desligada.` })
    }
  }
  if (!input.enabledTools.includes('transfer_to_human') && input.handoffKeywords.length === 0) {
    out.push({ id: 'no_handoff', severity: 'error', node: 'transfer', message: 'Sem caminho para uma pessoa: ligue Transferir ou defina palavras de transferência.' })
  }
  for (const s of input.sources) {
    if (s.status === 'error') out.push({ id: `source_error:${s.id}`, severity: 'warning', node: 'knowledge', message: `A fonte "${s.name}" falhou ao processar.` })
    else if (s.status === 'pending' || s.status === 'processing') out.push({ id: `source_sync:${s.id}`, severity: 'warning', node: 'knowledge', message: `A fonte "${s.name}" ainda está sincronizando.` })
  }
  if (input.blocked7d >= 5) {
    out.push({ id: 'many_blocks', severity: 'warning', node: 'review', message: `A revisão segurou ${input.blocked7d} respostas em 7 dias — veja os critérios no Testar.` })
  }
  if (input.monthlyCapUsd && input.monthlyCapUsd > 0 && input.monthSpendUsd / input.monthlyCapUsd >= 0.8) {
    const pct = Math.round((input.monthSpendUsd / input.monthlyCapUsd) * 100)
    out.push({ id: 'cap_80', severity: pct >= 100 ? 'error' : 'warning', node: 'agent', message: `Teto mensal em ${pct}% (US$ ${input.monthSpendUsd.toFixed(2)} de US$ ${input.monthlyCapUsd.toFixed(2)}).` })
  }
  return out
}

export function monthSpend(rows: Array<{ cost_usd: unknown }>): number {
  return Math.round(rows.reduce((s, r) => s + num(r.cost_usd), 0) * 10000) / 10000
}
