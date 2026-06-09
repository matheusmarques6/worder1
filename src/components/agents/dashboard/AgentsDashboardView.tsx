'use client'

import {
  Bot,
  Plus,
  Search,
  Power,
  PowerOff,
  Trash2,
  Settings,
  MessageSquare,
  MoreVertical,
  Loader2,
  AlertCircle,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react'
import { AIAgent } from '@/lib/ai/types'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'
import { Button } from '@/components/agents/ui/primitives'

type FilterStatus = 'all' | 'active' | 'inactive'

interface AgentsDashboardViewProps {
  agents: AIAgent[]
  filtered: AIAgent[]
  loading: boolean
  error: string
  searchQuery: string
  filterStatus: FilterStatus
  menuOpenId: string | null
  stats: { total: number; active: number; messages: number; conversations: number }
  onSearch: (q: string) => void
  onCycleFilter: () => void
  onRetry: () => void
  onCreate: () => void
  onSelect: (agentId: string) => void
  onToggleActive: (agent: AIAgent, e: React.MouseEvent) => void
  onDelete: (agentId: string) => void
  onMenuToggle: (agentId: string | null) => void
}

const FILTER_LABEL: Record<FilterStatus, string> = {
  all: 'Todos',
  active: 'Ativos',
  inactive: 'Inativos',
}

export default function AgentsDashboardView(props: AgentsDashboardViewProps) {
  const {
    agents,
    filtered,
    loading,
    error,
    searchQuery,
    filterStatus,
    menuOpenId,
    stats,
    onSearch,
    onCycleFilter,
    onRetry,
    onCreate,
    onSelect,
    onToggleActive,
    onDelete,
    onMenuToggle,
  } = props

  return (
    <AgentsTheme className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
      <div className="page">
        <div className="page-inner">
          {/* Page header */}
          <div className="ph">
            <div className="ph-ico">
              <Bot />
            </div>
            <div style={{ flex: 1 }}>
              <h1>Agentes de IA</h1>
              <p>Gerencie seus assistentes inteligentes que atendem 24/7</p>
            </div>
            <Button variant="primary" onClick={onCreate}>
              <Plus />
              Novo Agente
            </Button>
          </div>

          {/* Stats */}
          <div className="stat-grid">
            <Stat
              icon={<Bot />}
              tone="brand"
              label="Total de Agentes"
              value={stats.total.toLocaleString('pt-BR')}
            />
            <Stat
              icon={<Power />}
              tone="green"
              label="Ativos"
              value={stats.active.toLocaleString('pt-BR')}
            />
            <Stat
              icon={<MessageSquare />}
              tone="blue"
              label="Mensagens"
              value={stats.messages.toLocaleString('pt-BR')}
            />
            <Stat
              icon={<TrendingUp />}
              tone="purple"
              label="Conversas"
              value={stats.conversations.toLocaleString('pt-BR')}
            />
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <label className="search-field">
              <Search />
              <input
                className="field"
                type="text"
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Buscar agentes..."
              />
            </label>
            <Button variant="ghost" onClick={onCycleFilter}>
              {FILTER_LABEL[filterStatus]}
            </Button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="empty-wrap">
              <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: 'var(--brand)' }} />
            </div>
          ) : error ? (
            <div className="empty-wrap">
              <div className="empty-ico" style={{ background: 'var(--red-tint)', color: 'var(--red)' }}>
                <AlertCircle />
              </div>
              <h2>Erro ao carregar agentes</h2>
              <p>{error}</p>
              <Button variant="soft" onClick={onRetry}>
                Tentar novamente
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="empty-wrap">
              <div className="empty-ico">
                <Sparkles />
              </div>
              <h2>
                {searchQuery || filterStatus !== 'all'
                  ? 'Nenhum agente encontrado'
                  : 'Crie seu primeiro agente'}
              </h2>
              <p>
                {searchQuery || filterStatus !== 'all'
                  ? 'Tente ajustar a busca ou o filtro de status.'
                  : 'Agentes de IA respondem automaticamente às mensagens dos seus clientes, 24 horas por dia.'}
              </p>
              {!searchQuery && filterStatus === 'all' && (
                <Button variant="primary" onClick={onCreate}>
                  <Plus />
                  Criar Agente
                </Button>
              )}
            </div>
          ) : (
            <div className="agent-grid">
              {filtered.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  menuOpen={menuOpenId === agent.id}
                  onSelect={() => onSelect(agent.id)}
                  onToggleActive={(e) => onToggleActive(agent, e)}
                  onDelete={() => onDelete(agent.id)}
                  onMenuToggle={(open) => onMenuToggle(open ? agent.id : null)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* click-away for the open card menu */}
      {menuOpenId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 5 }} onClick={() => onMenuToggle(null)} />
      )}
    </AgentsTheme>
  )
}

/* ---------------- Stat ---------------- */
const STAT_TONE: Record<string, { bg: string; fg: string }> = {
  brand: { bg: 'var(--brand-tint)', fg: 'var(--brand)' },
  green: { bg: 'var(--green-tint)', fg: 'var(--green)' },
  blue: { bg: 'var(--blue-tint)', fg: 'var(--blue)' },
  purple: { bg: 'var(--purple-tint)', fg: 'var(--purple)' },
}

function Stat({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode
  tone: keyof typeof STAT_TONE
  label: string
  value: string
}) {
  const c = STAT_TONE[tone]
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="stat-ico" style={{ background: c.bg, color: c.fg }}>
          {icon}
        </span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-val">{value}</div>
    </div>
  )
}

/* ---------------- AgentCard ---------------- */
function AgentCard({
  agent,
  menuOpen,
  onSelect,
  onToggleActive,
  onDelete,
  onMenuToggle,
}: {
  agent: AIAgent
  menuOpen: boolean
  onSelect: () => void
  onToggleActive: (e: React.MouseEvent) => void
  onDelete: () => void
  onMenuToggle: (open: boolean) => void
}) {
  const active = agent.is_active
  const avBg = active ? 'var(--brand-tint)' : 'var(--surface-3)'
  const avFg = active ? 'var(--brand)' : 'var(--text-3)'

  return (
    <div
      className="agent-card fade-up"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect()
      }}
      style={{ opacity: active ? 1 : 0.78 }}
    >
      <div className="row">
        <span className="agent-av" style={{ background: avBg, color: avFg }}>
          <Bot style={{ width: 24, height: 24 }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="agent-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {agent.name}
          </div>
          <div className="agent-role">
            {active ? (
              <span className="live">
                <span className="pulse" />
                Ativo
              </span>
            ) : (
              'Inativo'
            )}
            {' · '}
            {agent.provider} / {agent.model}
          </div>
        </div>

        {/* actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <button
            className="btn btn-icon btn-soft"
            title={active ? 'Desativar' : 'Ativar'}
            onClick={onToggleActive}
            style={
              active
                ? { background: 'var(--green-tint)', color: 'var(--green)' }
                : undefined
            }
          >
            {active ? <Power /> : <PowerOff />}
          </button>
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-icon btn-soft"
              onClick={(e) => {
                e.stopPropagation()
                onMenuToggle(!menuOpen)
              }}
            >
              <MoreVertical />
            </button>
            {menuOpen && (
              <div
                className="menu pop"
                style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 10 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button onClick={onSelect}>
                  <Settings />
                  Configurar
                </button>
                <button className="danger" onClick={onDelete}>
                  <Trash2 />
                  Excluir
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* metrics */}
      <div className="agent-meta">
        <div className="agent-metric">
          <div className="v">{(agent.total_messages || 0).toLocaleString('pt-BR')}</div>
          <div className="k">Mensagens</div>
        </div>
        <div className="agent-metric">
          <div className="v">{(agent.total_conversations || 0).toLocaleString('pt-BR')}</div>
          <div className="k">Conversas</div>
        </div>
        <div className="agent-metric">
          <div className="v" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Users style={{ width: 14, height: 14, color: 'var(--text-3)' }} />
            {new Date(agent.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
          </div>
          <div className="k">Atualizado</div>
        </div>
      </div>
    </div>
  )
}
