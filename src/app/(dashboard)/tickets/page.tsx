// =============================================
// Page: Tickets
// /tickets
// Lista e gerencia tickets de suporte
// =============================================

'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  RefreshCw,
  Filter,
  Search,
  Ticket,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Tag,
  Loader2,
  MoreVertical,
  MessageSquare,
  ExternalLink,
} from 'lucide-react'
import { useTickets, Ticket as TicketType } from '@/hooks/useTickets'
import { useStore } from '@/hooks/useStore'
import { CreateTicketModal } from '@/components/tickets/CreateTicketModal'

// =============================================
// HELPERS
// =============================================

const formatDate = (date: string) => {
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 60) return `há ${diffMins}min`
  if (diffHours < 24) return `há ${diffHours}h`
  if (diffDays < 7) return `há ${diffDays}d`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: 'Aberto', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: AlertCircle },
  in_progress: { label: 'Em Andamento', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: Clock },
  waiting_customer: { label: 'Aguard. Cliente', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20', icon: User },
  waiting_internal: { label: 'Aguard. Interno', color: 'bg-pink-500/10 text-pink-400 border-pink-500/20', icon: Clock },
  resolved: { label: 'Resolvido', color: 'bg-success-500/10 text-success-400 border-success-500/20', icon: CheckCircle },
  closed: { label: 'Fechado', color: 'bg-dark-500/10 text-dark-400 border-dark-500/20', icon: XCircle },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'Baixa', color: 'text-dark-400' },
  normal: { label: 'Normal', color: 'text-blue-400' },
  high: { label: 'Alta', color: 'text-amber-400' },
  urgent: { label: 'Urgente', color: 'text-error-400' },
}

const CATEGORY_EMOJI: Record<string, string> = {
  delivery: '📦',
  payment: '💳',
  product: '📱',
  refund: '💰',
  question: '❓',
  bug: '🐛',
  feature: '💡',
  other: '📋',
}

// =============================================
// TICKET CARD COMPONENT
// =============================================

interface TicketCardProps {
  ticket: TicketType
  onSelect: (ticket: TicketType) => void
  onStatusChange: (id: string, status: string) => Promise<boolean>
}

function TicketCard({ ticket, onSelect, onStatusChange }: TicketCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const statusConfig = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open
  const priorityConfig = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal
  const StatusIcon = statusConfig.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4 hover:bg-dark-800 
                 transition-colors cursor-pointer group"
      onClick={() => onSelect(ticket)}
    >
      <div className="flex items-start gap-4">
        {/* Status Icon */}
        <div className={`p-2.5 rounded-xl ${statusConfig.color}`}>
          <StatusIcon className="w-5 h-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-dark-500">#{ticket.ticket_number}</span>
                <span className="text-lg">{CATEGORY_EMOJI[ticket.category] || '📋'}</span>
              </div>
              <h4 className="font-medium text-white mt-1">{ticket.title}</h4>
            </div>

            {/* Menu */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 hover:bg-dark-700 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
              >
                <MoreVertical className="w-4 h-4 text-dark-400" />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-8 w-44 bg-dark-700 border border-dark-600 rounded-xl shadow-xl overflow-hidden z-10">
                  <button
                    onClick={() => {
                      onStatusChange(ticket.id, 'in_progress')
                      setShowMenu(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-dark-600"
                  >
                    <Clock className="w-4 h-4" />
                    Em Andamento
                  </button>
                  <button
                    onClick={() => {
                      onStatusChange(ticket.id, 'waiting_customer')
                      setShowMenu(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-dark-600"
                  >
                    <User className="w-4 h-4" />
                    Aguard. Cliente
                  </button>
                  <button
                    onClick={() => {
                      onStatusChange(ticket.id, 'resolved')
                      setShowMenu(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-success-400 hover:bg-dark-600"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Resolver
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {ticket.description && (
            <p className="text-sm text-dark-400 mt-2 line-clamp-2">{ticket.description}</p>
          )}

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
            <span className={`px-2 py-0.5 rounded-full border ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
            
            {ticket.priority !== 'normal' && (
              <span className={priorityConfig.color}>• {priorityConfig.label}</span>
            )}

            {ticket.contact_name && (
              <span className="text-dark-500 flex items-center gap-1">
                <User className="w-3 h-3" />
                {ticket.contact_name}
              </span>
            )}

            {ticket.assigned_to_name && (
              <span className="text-primary-400 flex items-center gap-1">
                → {ticket.assigned_to_name}
              </span>
            )}

            <span className="text-dark-500">{formatDate(ticket.created_at)}</span>

            {ticket.sla_breached && (
              <span className="text-error-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                SLA
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// =============================================
// MAIN PAGE COMPONENT
// =============================================

export default function TicketsPage() {
  const { currentStore } = useStore()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  const {
    tickets,
    stats,
    isLoading,
    error,
    loadTickets,
    loadStats,
    createTicket,
    updateTicket,
    setSelectedTicket,
  } = useTickets({
    organizationId: currentStore?.organization_id || '',
    filters: {
      status: statusFilter || undefined,
      category: categoryFilter || undefined,
      search: searchQuery || undefined,
    },
    autoLoad: true,
  })

  // =============================================
  // HANDLERS
  // =============================================

  const handleCreate = async (params: any) => {
    const ticket = await createTicket(params)
    return !!ticket
  }

  const handleStatusChange = async (id: string, status: string) => {
    return await updateTicket(id, { status } as any)
  }

  const handleRefresh = () => {
    loadTickets()
    loadStats()
  }

  // =============================================
  // RENDER
  // =============================================

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Tickets</h1>
          <p className="text-dark-400 mt-1">
            Gerencie solicitações e problemas dos clientes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-dark-700 text-white rounded-xl 
                       hover:bg-dark-600 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl 
                       hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Ticket
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-3">
            <p className="text-xl font-bold text-white">{stats.total}</p>
            <p className="text-xs text-dark-400">Total</p>
          </div>
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-3">
            <p className="text-xl font-bold text-blue-400">{stats.open}</p>
            <p className="text-xs text-dark-400">Abertos</p>
          </div>
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-3">
            <p className="text-xl font-bold text-amber-400">{stats.in_progress}</p>
            <p className="text-xs text-dark-400">Em Andamento</p>
          </div>
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-3">
            <p className="text-xl font-bold text-purple-400">{stats.waiting_customer}</p>
            <p className="text-xs text-dark-400">Aguard. Cliente</p>
          </div>
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-3">
            <p className="text-xl font-bold text-success-400">{stats.resolved}</p>
            <p className="text-xs text-dark-400">Resolvidos</p>
          </div>
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-3">
            <p className="text-xl font-bold text-dark-400">{stats.closed}</p>
            <p className="text-xs text-dark-400">Fechados</p>
          </div>
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-3">
            <p className="text-xl font-bold text-error-400">{stats.sla_breached}</p>
            <p className="text-xs text-dark-400">SLA Violado</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por título ou #número..."
            className="w-full pl-10 pr-4 py-2 bg-dark-700 border border-dark-600 rounded-xl 
                       text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
          />
        </div>

        {/* Status Filter */}
        <div className="flex gap-2">
          {[
            { value: '', label: 'Todos' },
            { value: 'active', label: 'Ativos' },
            { value: 'open', label: 'Abertos' },
            { value: 'in_progress', label: 'Em Andamento' },
            { value: 'resolved', label: 'Resolvidos' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                statusFilter === value
                  ? 'bg-primary-500 text-white'
                  : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Category Filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-sm 
                     text-white focus:outline-none"
        >
          <option value="">Todas categorias</option>
          <option value="delivery">📦 Entrega</option>
          <option value="payment">💳 Pagamento</option>
          <option value="product">📱 Produto</option>
          <option value="refund">💰 Reembolso</option>
          <option value="question">❓ Dúvida</option>
          <option value="bug">🐛 Problema</option>
          <option value="feature">💡 Sugestão</option>
          <option value="other">📋 Outro</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-error-500/10 border border-error-500/20 rounded-xl">
          <AlertCircle className="w-5 h-5 text-error-400" />
          <p className="text-error-400">{error}</p>
        </div>
      )}

      {/* Tickets List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Ticket className="w-8 h-8 text-dark-600" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">
            Nenhum ticket encontrado
          </h3>
          <p className="text-dark-400 max-w-sm mx-auto mb-6">
            Crie um novo ticket para registrar uma solicitação ou problema
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl 
                       hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Ticket
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onSelect={setSelectedTicket}
                onStatusChange={handleStatusChange}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create Modal */}
      <CreateTicketModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
      />
    </div>
  )
}
