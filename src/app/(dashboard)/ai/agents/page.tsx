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
  Loader2,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import type { Agent, AgentRole } from '@/lib/ai/types'

const ROLE_LABEL: Record<AgentRole, { label: string; Icon: typeof Sparkles }> = {
  pre_sales: { label: 'Pré-venda', Icon: Sparkles },
  sales: { label: 'Vendas', Icon: ShoppingCart },
  recovery: { label: 'Recuperação', Icon: MessageCircle },
  post_sales: { label: 'Pós-venda', Icon: Package },
  support: { label: 'Atendimento', Icon: Headphones },
  custom: { label: 'Customizado', Icon: HeartHandshake },
}

const STATUS_PILL: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  simulating: 'bg-blue-50 text-blue-700 border-blue-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paused: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  archived: 'bg-red-50 text-red-700 border-red-200',
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  simulating: 'Simulando',
  published: 'Publicado',
  paused: 'Pausado',
  archived: 'Arquivado',
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
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Agentes</h1>
          <p className="text-sm text-zinc-500 mt-1">Configure seus agentes de IA</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
              strokeWidth={1.75}
            />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 text-sm bg-white border border-zinc-200 rounded-md
                         focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
          </div>
          <Link
            href="/ai/agents/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm
                       font-medium rounded-md hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            Novo agente
          </Link>
        </div>
      </header>

      <div className="flex gap-2 flex-wrap">
        {(['all', 'published', 'draft', 'paused'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s
                ? 'bg-orange-50 text-orange-700 border-orange-200'
                : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            {s === 'all' ? 'Todos' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white border border-zinc-200 rounded-xl p-5 h-40 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-50 mb-3">
            <Sparkles className="w-6 h-6 text-orange-600" strokeWidth={1.75} />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-1">
            {agents.length === 0
              ? 'Crie seu primeiro agente'
              : 'Nenhum agente encontrado'}
          </h2>
          <p className="text-sm text-zinc-500 mb-4">
            {agents.length === 0
              ? 'Em 5 minutos seu agente já estará respondendo no WhatsApp.'
              : 'Ajuste os filtros ou crie um novo.'}
          </p>
          <Link
            href="/ai/agents/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm
                       font-medium rounded-md hover:bg-orange-600 transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={1.75} />
            Novo agente
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((agent) => {
            const role = ROLE_LABEL[agent.role] ?? ROLE_LABEL.custom
            const RoleIcon = role.Icon
            return (
              <Link
                key={agent.id}
                href={`/ai/agents/${agent.id}`}
                className="bg-white border border-zinc-200 rounded-xl p-5 hover:border-zinc-300
                           hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-orange-50">
                    <RoleIcon className="w-5 h-5 text-orange-600" strokeWidth={1.75} />
                  </div>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full border ${
                      STATUS_PILL[agent.status] ?? STATUS_PILL.draft
                    }`}
                  >
                    {STATUS_LABEL[agent.status] ?? agent.status}
                  </span>
                </div>
                <h3 className="text-base font-semibold text-zinc-900 mb-1 truncate">
                  {agent.name}
                </h3>
                <p className="text-xs text-zinc-500 mb-3">{role.label}</p>
                <div className="flex items-center gap-3 text-xs text-zinc-600 pt-3 border-t border-zinc-100">
                  <span>{agent.total_conversations ?? 0} conversas</span>
                  <span>·</span>
                  <span>{agent.total_messages ?? 0} mensagens</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
