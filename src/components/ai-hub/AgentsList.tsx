'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bot, Loader2, MessageCircle, Plus, Workflow } from 'lucide-react'
import { Card } from '@/components/agents/ui/primitives'
import type { AgentEntry } from '@/lib/ai/agent-entries'

/**
 * A lista de agentes do protótipo (plano IA, M2 passo 16): avatar, nome,
 * função, onde atua, estado, conversas 7d, receita 7d (0 até o M5).
 * Dados de GET /api/ai/agents (passo 15).
 */

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
  draft: { label: 'Rascunho', chip: 'chip chip-outline' },
  active: { label: 'Ativo', chip: 'chip chip-green' },
  paused: { label: 'Pausado', chip: 'chip chip-red' },
}

export function initials(name: string | null): string {
  const parts = (name || 'A').trim().split(/\s+/)
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || 'A'
}

export function whereItActs(entries: AgentEntry[]): string {
  const numbers = entries.filter((e) => e.kind === 'whatsapp_account')
  const flows = entries.filter((e) => e.kind === 'flow_touch')
  const parts: string[] = []
  if (numbers.length === 1) parts.push(numbers[0].label)
  else if (numbers.length > 1) parts.push(`${numbers.length} números`)
  if (flows.length > 0) parts.push(`${flows.length} fluxo${flows.length > 1 ? 's' : ''}`)
  return parts.length > 0 ? parts.join(' · ') : 'Nenhuma entrada'
}

export default function AgentsList({ organizationId }: { organizationId: string }) {
  const router = useRouter()
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
    <div style={{ padding: 22, maxWidth: 1080, width: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.01em' }}>Agentes</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            Cada agente atua em números e fluxos; quem responde cada conversa é decidido por essas entradas.
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <Link href="/ai/agentes/novo" className="btn btn-primary btn-sm">
          <Plus size={14} />Novo agente
        </Link>
      </div>

      {error && <p style={{ fontSize: 12.5, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', padding: 24 }}>
          <Loader2 size={16} className="animate-spin" />Carregando…
        </div>
      ) : agents.length === 0 ? (
        <Card style={{ padding: 28, textAlign: 'center' }}>
          <Bot size={28} style={{ color: 'var(--text-3)', margin: '0 auto 10px' }} />
          <div style={{ fontSize: 15, fontWeight: 800 }}>Nenhum agente ainda</div>
          <p style={{ fontSize: 13, color: 'var(--text-3)', margin: '6px 0 14px' }}>
            Comece por um modelo (vendas, pós-compra, recuperação) ou do zero.
          </p>
          <Link href="/ai/agentes/novo" className="btn btn-primary btn-sm">
            <Plus size={14} />Criar o primeiro agente
          </Link>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {agents.map((agent) => {
            const status = STATUS_LABEL[agent.status] ?? STATUS_LABEL.draft
            return (
              <button
                key={agent.id}
                type="button"
                className="act-row"
                style={{ textAlign: 'left', cursor: 'pointer', gap: 14, padding: '14px 16px' }}
                onClick={() => router.push(`/ai/agentes/${agent.id}`)}
                data-testid="agent-row"
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center',
                  background: 'var(--brand-soft, #FFF3EA)', color: 'var(--brand, #F97316)',
                  fontWeight: 800, fontSize: 13, flexShrink: 0,
                }}>
                  {initials(agent.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="act-t" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {agent.name || 'Sem nome'}
                    <span className={status.chip}>{status.label}</span>
                  </div>
                  <div className="act-d">
                    {agent.role || 'Sem função definida'}
                    {' · '}
                    <span title="Onde atua">
                      {agent.entries.some((e) => e.kind === 'whatsapp_account') && <MessageCircle size={11} style={{ display: 'inline', marginRight: 3 }} />}
                      {agent.entries.some((e) => e.kind === 'flow_touch') && <Workflow size={11} style={{ display: 'inline', marginRight: 3 }} />}
                      {whereItActs(agent.entries)}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 22, flexShrink: 0 }}>
                  <Metric label="Conversas 7d" value={String(agent.conversations_7d)} />
                  <Metric label="Receita 7d" value={`R$ ${agent.revenue_7d.toFixed(0)}`} muted />
                  <Metric label="Missões" value={String(agent.missions_count)} />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ textAlign: 'right', minWidth: 72 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: muted ? 'var(--text-3)' : 'var(--text)' }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    </div>
  )
}
