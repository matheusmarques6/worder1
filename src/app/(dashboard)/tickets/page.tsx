// =============================================
// Page: Tickets
// /tickets
// Lista e gerencia tickets de suporte
// =============================================

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { useAuthStore } from '@/stores'
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
  closed: { label: 'Fechado', color: 'bg-gray-300/10 text-gray-500 border-gray-300/20', icon: XCircle },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'Baixa', color: 'text-gray-500' },
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
  onOpen: (id: string) => void
  onStatusChange: (id: string, status: string) => Promise<boolean>
}

function TicketCard({ ticket, onOpen, onStatusChange }: TicketCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const statusConfig = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open
  const priorityConfig = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal
  const StatusIcon = statusConfig.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-50 border border-gray-200 rounded-xl p-4 hover:bg-white
                 transition-colors cursor-pointer group"
      onClick={() => onOpen(ticket.id)}
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
                <span className="text-xs font-mono text-gray-400">#{ticket.ticket_number}</span>
                <span className="text-lg">{CATEGORY_EMOJI[ticket.category] || '📋'}</span>
              </div>
              <h4 className="font-medium text-gray-900 mt-1">{ticket.title}</h4>
            </div>

            {/* Menu */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 hover:bg-gray-100 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
              >
                <MoreVertical className="w-4 h-4 text-gray-500" />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-8 w-44 bg-gray-100 border border-gray-300 rounded-xl shadow-xl overflow-hidden z-10">
                  <button
                    onClick={() => {
                      onStatusChange(ticket.id, 'in_progress')
                      setShowMenu(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
                  >
                    <Clock className="w-4 h-4" />
                    Em Andamento
                  </button>
                  <button
                    onClick={() => {
                      onStatusChange(ticket.id, 'waiting_customer')
                      setShowMenu(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
                  >
                    <User className="w-4 h-4" />
                    Aguard. Cliente
                  </button>
                  <button
                    onClick={() => {
                      onStatusChange(ticket.id, 'resolved')
                      setShowMenu(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-success-400 hover:bg-gray-200"
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
            <p className="text-sm text-gray-500 mt-2 line-clamp-2">{ticket.description}</p>
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
              <span className="text-gray-400 flex items-center gap-1">
                <User className="w-3 h-3" />
                {ticket.contact_name}
              </span>
            )}

            {ticket.assigned_to_name && (
              <span className="text-brand-600 flex items-center gap-1">
                → {ticket.assigned_to_name}
              </span>
            )}

            <span className="text-gray-400">{formatDate(ticket.created_at)}</span>

            {ticket.sla_breached && (
              <span className="text-error-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                SLA
              </span>
            )}

            <span className="ml-auto text-gray-400 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Abrir
              <ExternalLink className="w-3 h-3" />
            </span>
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
  const router = useRouter()
  const { user } = useAuthStore()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  // Obter organization_id do usuário
  const organizationId = user?.organization_id || user?.user_metadata?.organization_id || ''

  const {
    tickets,
    stats,
    isLoading,
    error,
    loadTickets,
    loadStats,
    createTicket,
    updateTicket,
  } = useTickets({
    organizationId,
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
          <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
          <p className="text-gray-500 mt-1">
            Gerencie solicitações e problemas dos clientes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-900 rounded-xl 
                       hover:bg-gray-200 transition-colors"
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
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <p className="text-xl font-bold text-gray-900">{stats.total}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <p className="text-xl font-bold text-blue-400">{stats.open}</p>
            <p className="text-xs text-gray-500">Abertos</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <p className="text-xl font-bold text-amber-400">{stats.in_progress}</p>
            <p className="text-xs text-gray-500">Em Andamento</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <p className="text-xl font-bold text-purple-400">{stats.waiting_customer}</p>
            <p className="text-xs text-gray-500">Aguard. Cliente</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <p className="text-xl font-bold text-success-400">{stats.resolved}</p>
            <p className="text-xs text-gray-500">Resolvidos</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <p className="text-xl font-bold text-gray-500">{stats.closed}</p>
            <p className="text-xs text-gray-500">Fechados</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <p className="text-xl font-bold text-error-400">{stats.sla_breached}</p>
            <p className="text-xs text-gray-500">SLA Violado</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por título ou #número..."
            className="w-full pl-10 pr-4 py-2 bg-gray-100 border border-gray-300 rounded-xl 
                       text-gray-900 placeholder-dark-500 focus:outline-none focus:border-primary-500"
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
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
          className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-sm 
                     text-gray-900 focus:outline-none"
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
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
            <Ticket className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nenhum ticket encontrado
          </h3>
          <p className="text-gray-500 max-w-sm mx-auto mb-6">
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
                onOpen={(id) => { router.push(`/tickets/${id}`) }}
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
