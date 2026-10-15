'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import type { AgentEntry } from '@/lib/ai/agent-entries'
import { brl, num } from '@/lib/ai/brl'
import { Av, Icon } from './proto/ui'

export interface AgentListRow {
  id: string
  name: string | null
  role: string | null
  status: 'draft' | 'active' | 'paused'
  model: string | null
  entries: AgentEntry[]
  missions_count: number
  conversations_7d: number
  revenue_7d: number
  created_at: string
}

export const STATUS_LABEL: Record<AgentListRow['status'], { label: string; chip: string }> = {
  draft: { label: 'Rascunho', chip: 'chip ne' },
  active: { label: 'Ativo', chip: 'chip ok' },
  paused: { label: 'Pausado', chip: 'chip ne' },
}

export function initials(name: string | null): string {
  const parts = (name || 'A').trim().split(/\s+/)
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || 'A'
}

/** "Onde atua" no texto do protótipo: "WhatsApp (11) 4000-1234 · 2 fluxos",
 *  "Fluxo Carrinho abandonado · toque 2", "Sem canal". */
export function whereItActs(entries: AgentEntry[]): string {
  const numbers = entries.filter((e) => e.kind === 'whatsapp_account')
  const flows = entries.filter((e) => e.kind === 'flow_touch')
  const parts: string[] = []
  if (numbers.length === 1) parts.push(`WhatsApp ${numbers[0].label.split(' · ').pop()}`)
  else if (numbers.length > 1) parts.push(`${numbers.length} números`)
  if (flows.length === 1 && numbers.length === 0) parts.push(`Fluxo ${flows[0].label}`)
  else if (flows.length > 0) parts.push(`${flows.length} fluxo${flows.length > 1 ? 's' : ''}`)
  return parts.length > 0 ? parts.join(' · ') : 'Sem canal'
}

/** Lista de agentes do protótipo (AgentsList em "IA Telas P1"). Clicar abre o
 *  Construtor do agente em tela cheia. Dados de GET /api/ai/agents. */
export default function AgentsList({ organizationId }: { organizationId: string }) {
  const [agents, setAgents] = useState<AgentListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ai/agents?organization_id=${encodeURIComponent(organizationId)}`)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error || 'Erro ao carregar os agentes')
      setAgents(body.agents ?? [])
      setError(null)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => { void load() }, [load])

  return (
    <div className="pin">
      <div className="ph">
        <div><h1 className="h1">Agentes</h1><p className="lead">Canais e fluxos escolhem qual agente responde.</p></div>
        <Link className="btn pri" href="/ai/agentes/novo"><Icon n="plus" s={16} />Novo agente</Link>
      </div>
      {error && <div className="warn" style={{ marginBottom: 12 }}><Icon n="alert" s={16} /><div>{error}</div></div>}
      {loading ? (
        <div className="al">{[0, 1, 2].map((i) => <div key={i} className="al-row" style={{ height: 74, opacity: 0.5 }} />)}</div>
      ) : agents.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: 'center' }}>
          <div className="ct">Nenhum agente ainda</div>
          <p className="lead" style={{ margin: '6px auto 14px' }}>Comece por um modelo pronto ou do zero.</p>
          <Link className="btn pri" href="/ai/agentes/novo"><Icon n="plus" s={16} />Novo agente</Link>
        </div>
      ) : (
        <div className="al">
          {agents.map((a) => {
            const status = STATUS_LABEL[a.status] ?? STATUS_LABEL.draft
            return (
              <Link key={a.id} className="al-row" href={`/ai/construtor/${a.id}`} data-testid="agent-row">
                <Av name={a.name} s={40} />
                <div className="al-n"><b>{a.name || 'Sem nome'}</b><span>{a.role || 'Sem função'} · {whereItActs(a.entries)}</span></div>
                <span className={status.chip}>{status.label}</span>
                <div className="al-m"><b>{num(a.conversations_7d)}</b><span>conversas em 7 dias</span></div>
                <div className="al-m"><b>{a.revenue_7d ? brl(a.revenue_7d, 0) : 'R$ 0'}</b><span>receita atribuída</span></div>
                <Icon n="chevR" s={16} c="var(--tx3)" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
