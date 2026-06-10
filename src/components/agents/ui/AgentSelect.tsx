'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bot } from 'lucide-react'

/**
 * Seletor de agente compartilhado (reutilizado por EvalView e, em F5, ReportsView).
 * Busca `GET /api/ai/agents?organization_id=` (mesmo fetch do AIAgentList),
 * é controlado (value/onChange) e persiste a seleção no query param `?agent=`
 * (next/navigation, como a página já faz com `?tab=`). Usa o estilo `.field`.
 */

interface AgentOption {
  id: string
  name: string
}

interface AgentSelectProps {
  organizationId: string
  value: string | null
  onChange: (agentId: string) => void
  className?: string
}

export default function AgentSelect({ organizationId, value, onChange, className }: AgentSelectProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/ai/agents?organization_id=${organizationId}`)
        if (!res.ok) throw new Error('Erro ao carregar agentes')
        const data = await res.json()
        if (cancelled) return
        const list: AgentOption[] = (data.agents || []).map((a: any) => ({ id: a.id, name: a.name }))
        setAgents(list)

        // Resolve seleção inicial: ?agent= válido, senão o value atual, senão o primeiro.
        const fromParam = searchParams?.get('agent')
        const valid = (id: string | null | undefined) => !!id && list.some((a) => a.id === id)
        if (!valid(value)) {
          if (valid(fromParam)) onChange(fromParam as string)
          else if (list.length > 0) onChange(list[0].id)
        }
      } catch {
        if (!cancelled) setAgents([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId])

  const persistAndChange = (agentId: string) => {
    onChange(agentId)
    const params = new URLSearchParams(searchParams?.toString() || '')
    params.set('agent', agentId)
    const qs = params.toString()
    router.replace(`/whatsapp/ai-agents${qs ? `?${qs}` : ''}`)
  }

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 240 }}>
      <Bot style={{ width: 16, height: 16, color: 'var(--brand)', flexShrink: 0 }} />
      <select
        className="field"
        value={value ?? ''}
        disabled={loading || agents.length === 0}
        onChange={(e) => persistAndChange(e.target.value)}
        aria-label="Selecionar agente"
        style={{ flex: 1 }}
      >
        {loading ? (
          <option value="">Carregando…</option>
        ) : agents.length === 0 ? (
          <option value="">Nenhum agente</option>
        ) : (
          <>
            {!value && <option value="">Selecione um agente</option>}
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </>
        )}
      </select>
    </div>
  )
}
