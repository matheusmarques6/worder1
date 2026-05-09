'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus,
  Search,
  Sparkles,
  MessageCircle,
  Package,
  HeartHandshake,
  ShoppingCart,
  Headphones,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import type { Agent, AgentRole, AgentStatus } from '@/lib/ai/types'
import { statusLabel } from '@/lib/ai/ui/status'
import {
  Page,
  Card,
  Button,
  EmptyState,
  Input,
  Badge,
  Num,
} from '@/components/ai/ui/primitives'

const ROLE_LABEL: Record<AgentRole, { label: string; Icon: typeof Sparkles }> = {
  pre_sales: { label: 'Pré-venda', Icon: Sparkles },
  sales: { label: 'Vendas', Icon: ShoppingCart },
  recovery: { label: 'Recuperação', Icon: MessageCircle },
  post_sales: { label: 'Pós-venda', Icon: Package },
  support: { label: 'Atendimento', Icon: Headphones },
  custom: { label: 'Customizado', Icon: HeartHandshake },
}

const STATUS_TONE: Record<AgentStatus, 'success' | 'subtle' | 'neutral'> = {
  draft: 'neutral',
  simulating: 'subtle',
  published: 'success',
  paused: 'neutral',
  archived: 'neutral',
}

export default function AgentsListPage() {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id || user?.user_metadata?.organization_id
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'draft' | 'paused'>('all')

  const fetchAgents = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/ai/agents?organization_id=${organizationId}&limit=50`)
      const data = await res.json()
      setAgents(data.agents || [])
    } catch (err) {
      console.error('[agents/list]', err)
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const filtered = agents.filter((a) => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false
    if (search.trim() && !a.name.toLowerCase().includes(search.toLowerCase().trim())) return false
    return true
  })

  return (
    <Page
      title="Agentes"
      description="Configure e gerencie seus agentes de IA."
      actions={
        <>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A1A1AA]"
              strokeWidth={1.75}
            />
            <Input
              type="text"
              placeholder="Buscar agente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Link href="/ai/agents/new">
            <Button
              variant="cta"
              leadingIcon={<Plus className="w-3.5 h-3.5" strokeWidth={1.75} />}
            >
              Novo agente
            </Button>
          </Link>
        </>
      }
    >
      <div className="inline-flex items-center gap-1 mb-6 p-1 bg-[#F4F4F5] rounded-[10px]">
        {(['all', 'published', 'draft', 'paused'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-[8px] text-[12px] font-semibold transition-colors ${
              statusFilter === s
                ? 'bg-white text-[#18181B] shadow-sm'
                : 'text-[#71717A] hover:text-[#18181B]'
            }`}
          >
            {s === 'all' ? 'Todos' : statusLabel(s as AgentStatus)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white border border-[#E4E4E7] rounded-[14px] p-7 h-40 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={
            agents.length === 0 ? 'Crie seu primeiro agente' : 'Nenhum agente encontrado'
          }
          description={
            agents.length === 0
              ? 'Em 5 minutos seu agente já estará respondendo no WhatsApp.'
              : 'Ajuste os filtros ou crie um novo agente.'
          }
          action={
            agents.length === 0 ? (
              <Link href="/ai/agents/new">
                <Button
                  variant="cta"
                  leadingIcon={<Plus className="w-3.5 h-3.5" strokeWidth={1.75} />}
                >
                  Novo agente
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((agent) => {
            const role = ROLE_LABEL[agent.role] ?? ROLE_LABEL.custom
            const RoleIcon = role.Icon
            return (
              <Link
                key={agent.id}
                href={`/ai/agents/${agent.id}`}
                className="block bg-white border border-[#E4E4E7] rounded-[14px] px-7 py-6
                           hover:bg-[#FAFAFA] hover:border-[#D4D4D8] transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-[10px] bg-[#FAFAFA] border border-[#E4E4E7]">
                    <RoleIcon className="w-4.5 h-4.5 text-[#52525B]" strokeWidth={1.75} />
                  </div>
                  <Badge tone={STATUS_TONE[agent.status as AgentStatus]}>
                    {statusLabel(agent.status as AgentStatus)}
                  </Badge>
                </div>
                <h3
                  className="text-[15px] font-bold text-[#18181B] mb-0.5 truncate"
                  style={{ letterSpacing: '-0.01em' }}
                >
                  {agent.name}
                </h3>
                <p className="text-[12px] text-[#A1A1AA] mb-4">{role.label}</p>
                <div className="flex items-center gap-3 text-[12px] text-[#71717A] pt-3 border-t border-[#F4F4F5]">
                  <span>
                    <Num>{agent.total_conversations ?? 0}</Num> conversas
                  </span>
                  <span className="text-[#D4D4D8]">·</span>
                  <span>
                    <Num>{agent.total_messages ?? 0}</Num> mensagens
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </Page>
  )
}
