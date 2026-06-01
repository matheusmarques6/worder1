// =============================================
// Page: Ticket Detail
// /tickets/[id]
// Detalhes, atribuição, status e comentários de um ticket
// =============================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Loader2,
  ChevronDown,
  Mail,
  Phone,
  MessageSquare,
  Send,
  Lock,
  Tag,
  Calendar,
  Trash2,
  RefreshCw,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import type { Ticket, TicketComment } from '@/hooks/useTickets'

// =============================================
// HELPERS
// =============================================

const formatDateTime = (date: string) => {
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatRelative = (date: string) => {
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'agora'
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

const STATUS_OPTIONS = ['open', 'in_progress', 'waiting_customer', 'waiting_internal', 'resolved', 'closed']

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'Baixa', color: 'text-gray-500' },
  normal: { label: 'Normal', color: 'text-blue-400' },
  high: { label: 'Alta', color: 'text-amber-400' },
  urgent: { label: 'Urgente', color: 'text-error-400' },
}

const CATEGORY_CONFIG: Record<string, { label: string; emoji: string }> = {
  delivery: { label: 'Entrega', emoji: '📦' },
  payment: { label: 'Pagamento', emoji: '💳' },
  product: { label: 'Produto', emoji: '📱' },
  refund: { label: 'Reembolso', emoji: '💰' },
  question: { label: 'Dúvida', emoji: '❓' },
  bug: { label: 'Problema', emoji: '🐛' },
  feature: { label: 'Sugestão', emoji: '💡' },
  other: { label: 'Outro', emoji: '📋' },
}

interface OrgUser {
  id: string
  name: string
  email: string
  avatar_url?: string
  role?: string
}

// =============================================
// MAIN PAGE COMPONENT
// =============================================

export default function TicketDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuthStore()
  const ticketId = params?.id as string

  const organizationId = user?.organization_id || user?.user_metadata?.organization_id || ''

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [comments, setComments] = useState<TicketComment[]>([])
  const [users, setUsers] = useState<OrgUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  const [updating, setUpdating] = useState(false)

  // Comentário
  const [commentText, setCommentText] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const [sendingComment, setSendingComment] = useState(false)

  // =============================================
  // LOAD
  // =============================================
  const loadTicket = useCallback(async () => {
    if (!organizationId || !ticketId) return

    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/tickets/${ticketId}?organization_id=${organizationId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar ticket')

      setTicket(data.ticket)
      setComments(data.comments || [])
    } catch (err: any) {
      console.error('[TicketDetail] Load error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, ticketId])

  const loadUsers = useCallback(async () => {
    if (!organizationId) return
    try {
      const res = await fetch(`/api/users?organization_id=${organizationId}`)
      const data = await res.json()
      if (res.ok) setUsers(data.users || [])
    } catch (err) {
      console.error('[TicketDetail] Load users error:', err)
    }
  }, [organizationId])

  useEffect(() => {
    loadTicket()
    loadUsers()
  }, [loadTicket, loadUsers])

  // =============================================
  // UPDATE TICKET (status, assignment, etc)
  // =============================================
  const updateTicket = async (updates: Partial<Ticket>) => {
    if (!ticket) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          updated_by: user?.id,
          updated_by_name: user?.name,
          ...updates,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar ticket')
      setTicket((prev) => (prev ? { ...prev, ...data.ticket } : data.ticket))
    } catch (err: any) {
      console.error('[TicketDetail] Update error:', err)
      setError(err.message)
    } finally {
      setUpdating(false)
    }
  }

  const handleStatusChange = async (status: string) => {
    setShowStatusMenu(false)
    await updateTicket({ status } as Partial<Ticket>)
  }

  const handleAssign = async (assignee: OrgUser | null) => {
    setShowAssignMenu(false)
    await updateTicket({
      assigned_to: assignee?.id || null,
      assigned_to_name: assignee?.name || null,
    } as Partial<Ticket>)
  }

  // =============================================
  // COMMENTS
  // =============================================
  const handleAddComment = async () => {
    if (!ticket || !commentText.trim()) return
    setSendingComment(true)
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          content: commentText.trim(),
          is_internal: isInternal,
          user_id: user?.id,
          user_name: user?.name,
          user_email: user?.email,
          user_avatar_url: user?.avatar_url,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar comentário')

      setComments((prev) => [...prev, data.comment])
      setCommentText('')
      setIsInternal(false)
      // Recarregar para refletir mudanças de status automáticas (ex: waiting_customer -> in_progress)
      loadTicket()
    } catch (err: any) {
      console.error('[TicketDetail] Comment error:', err)
      setError(err.message)
    } finally {
      setSendingComment(false)
    }
  }

  // =============================================
  // RENDER
  // =============================================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      </div>
    )
  }

  if (error && !ticket) {
    return (
      <div className="p-6">
        <button
          onClick={() => router.push('/tickets')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Tickets
        </button>
        <div className="flex items-center gap-2 p-4 bg-error-500/10 border border-error-500/20 rounded-xl">
          <AlertCircle className="w-5 h-5 text-error-400" />
          <p className="text-error-400">{error}</p>
        </div>
      </div>
    )
  }

  if (!ticket) return null

  const statusConfig = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open
  const priorityConfig = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal
  const categoryConfig = CATEGORY_CONFIG[ticket.category] || CATEGORY_CONFIG.other
  const StatusIcon = statusConfig.icon

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Back + actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/tickets')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Tickets
        </button>
        <button
          onClick={loadTicket}
          disabled={updating || isLoading}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-900 rounded-xl hover:bg-gray-200 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${updating ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error inline */}
      {error && ticket && (
        <div className="flex items-center gap-2 p-3 bg-error-500/10 border border-error-500/20 rounded-xl">
          <AlertCircle className="w-4 h-4 text-error-400" />
          <p className="text-error-400 text-sm">{error}</p>
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl ${statusConfig.color}`}>
            <StatusIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-mono text-gray-400">#{ticket.ticket_number}</span>
              <span className="text-lg">{categoryConfig.emoji}</span>
              <span className="text-xs text-gray-500">{categoryConfig.label}</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{ticket.title}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
              <span className={`px-2.5 py-0.5 rounded-full border ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
              <span className={`flex items-center gap-1 ${priorityConfig.color}`}>
                Prioridade: {priorityConfig.label}
              </span>
              <span className="text-gray-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Criado {formatRelative(ticket.created_at)}
              </span>
              {ticket.sla_breached && (
                <span className="text-error-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  SLA violado
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Status + Assignment controls */}
        <div className="flex flex-wrap items-center gap-3 mt-6 pt-6 border-t border-gray-200">
          {/* Status dropdown */}
          <div className="relative">
            <span className="block text-xs text-gray-500 mb-1.5">Status</span>
            <button
              onClick={() => {
                setShowStatusMenu(!showStatusMenu)
                setShowAssignMenu(false)
              }}
              disabled={updating}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              <StatusIcon className="w-4 h-4" />
              {statusConfig.label}
              <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showStatusMenu ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showStatusMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute left-0 top-full mt-2 w-52 bg-gray-100 border border-gray-300 rounded-xl shadow-xl overflow-hidden z-20"
                >
                  {STATUS_OPTIONS.map((s) => {
                    const cfg = STATUS_CONFIG[s]
                    const Icon = cfg.icon
                    return (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(s)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-200 transition-colors ${
                          ticket.status === s ? 'text-gray-900 font-medium' : 'text-gray-700'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {cfg.label}
                        {ticket.status === s && <CheckCircle className="w-3.5 h-3.5 ml-auto text-success-400" />}
                      </button>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Assignment dropdown */}
          <div className="relative">
            <span className="block text-xs text-gray-500 mb-1.5">Responsável</span>
            <button
              onClick={() => {
                setShowAssignMenu(!showAssignMenu)
                setShowStatusMenu(false)
              }}
              disabled={updating}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              <User className="w-4 h-4 text-gray-500" />
              {ticket.assigned_to_name || 'Não atribuído'}
              <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showAssignMenu ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showAssignMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute left-0 top-full mt-2 w-60 max-h-72 overflow-y-auto bg-gray-100 border border-gray-300 rounded-xl shadow-xl overflow-hidden z-20"
                >
                  <button
                    onClick={() => handleAssign(null)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    <XCircle className="w-4 h-4 text-gray-400" />
                    Não atribuído
                  </button>
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleAssign(u)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-200 transition-colors ${
                        ticket.assigned_to === u.id ? 'text-gray-900 font-medium' : 'text-gray-700'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-white">
                          {u.name?.[0]?.toUpperCase() || '?'}
                        </span>
                      </div>
                      <span className="truncate">{u.name}</span>
                      {ticket.assigned_to === u.id && <CheckCircle className="w-3.5 h-3.5 ml-auto text-success-400 flex-shrink-0" />}
                    </button>
                  ))}
                  {users.length === 0 && (
                    <p className="px-3 py-3 text-xs text-gray-500 text-center">Nenhum usuário encontrado</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column: description + comments */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          {ticket.description && (
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
              <h2 className="text-sm font-medium text-gray-500 mb-3">Descrição</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
            </div>
          )}

          {/* Comments / Notes thread */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
            <h2 className="text-sm font-medium text-gray-500 mb-4 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Comentários e Notas
              <span className="text-gray-400">({comments.length})</span>
            </h2>

            {/* Thread */}
            <div className="space-y-4 mb-6">
              {comments.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Nenhum comentário ainda</p>
                </div>
              ) : (
                comments.map((comment) => (
                  <motion.div
                    key={comment.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 ${comment.is_internal ? 'bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 -mx-1' : ''}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-white">
                        {comment.user_name?.[0]?.toUpperCase() || 'S'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">
                          {comment.user_name || 'Sistema'}
                        </span>
                        {comment.is_internal && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            <Lock className="w-2.5 h-2.5" />
                            Nota interna
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{formatRelative(comment.created_at)}</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-gray-200 pt-4">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={isInternal ? 'Escreva uma nota interna (não visível ao cliente)...' : 'Escreva um comentário...'}
                rows={3}
                className={`w-full px-4 py-3 bg-gray-100 border rounded-xl text-gray-900 placeholder-dark-500 focus:outline-none resize-none transition-colors ${
                  isInternal ? 'border-amber-500/40 focus:border-amber-500' : 'border-gray-300 focus:border-primary-500'
                }`}
              />
              <div className="flex items-center justify-between mt-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 bg-gray-100 text-amber-500"
                  />
                  <span className="text-sm text-gray-600 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" />
                    Nota interna
                  </span>
                </label>
                <button
                  onClick={handleAddComment}
                  disabled={sendingComment || !commentText.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                  {sendingComment ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Enviar
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar: contact + meta */}
        <div className="space-y-6">
          {/* Contact */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
            <h2 className="text-sm font-medium text-gray-500 mb-4">Contato</h2>
            {ticket.contact_name || ticket.contact_email || ticket.contact_phone ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-white">
                      {ticket.contact_name?.[0]?.toUpperCase() || '?'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {ticket.contact_name || 'Sem nome'}
                    </p>
                  </div>
                </div>
                {ticket.contact_email && (
                  <a
                    href={`mailto:${ticket.contact_email}`}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-brand-600 transition-colors"
                  >
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{ticket.contact_email}</span>
                  </a>
                )}
                {ticket.contact_phone && (
                  <a
                    href={`tel:${ticket.contact_phone}`}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-brand-600 transition-colors"
                  >
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{ticket.contact_phone}</span>
                  </a>
                )}
                {ticket.contact_id && (
                  <a
                    href={`/contacts/${ticket.contact_id}`}
                    className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:underline mt-1"
                  >
                    Ver perfil do contato
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Nenhum contato vinculado</p>
            )}
          </div>

          {/* Details */}
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-medium text-gray-500">Detalhes</h2>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Categoria</span>
              <span className="text-gray-700">{categoryConfig.emoji} {categoryConfig.label}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Prioridade</span>
              <span className={priorityConfig.color}>{priorityConfig.label}</span>
            </div>
            {ticket.order_number && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Pedido</span>
                <span className="text-gray-700">#{ticket.order_number}</span>
              </div>
            )}
            {ticket.sla_due_at && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Prazo SLA</span>
                <span className={ticket.sla_breached ? 'text-error-400' : 'text-gray-700'}>
                  {formatDateTime(ticket.sla_due_at)}
                </span>
              </div>
            )}
            {ticket.first_response_at && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">1ª resposta</span>
                <span className="text-gray-700">{formatRelative(ticket.first_response_at)}</span>
              </div>
            )}
            {ticket.resolved_at && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Resolvido em</span>
                <span className="text-gray-700">{formatRelative(ticket.resolved_at)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Atualizado</span>
              <span className="text-gray-700">{formatRelative(ticket.updated_at)}</span>
            </div>

            {/* Tags */}
            {ticket.tags && ticket.tags.length > 0 && (
              <div className="pt-2">
                <span className="text-gray-400 text-sm flex items-center gap-1 mb-2">
                  <Tag className="w-3.5 h-3.5" />
                  Tags
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {ticket.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-full bg-brand-100 text-brand-600 text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Click outside to close menus */}
      {(showStatusMenu || showAssignMenu) && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => {
            setShowStatusMenu(false)
            setShowAssignMenu(false)
          }}
        />
      )}
    </div>
  )
}
