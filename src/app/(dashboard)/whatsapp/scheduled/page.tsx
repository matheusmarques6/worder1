// =============================================
// Page: Scheduled Messages
// /whatsapp/scheduled
// Lista e gerencia mensagens agendadas
// =============================================

'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock,
  Send,
  X,
  Trash2,
  RefreshCw,
  Calendar,
  User,
  Phone,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Filter,
  Repeat,
  Play,
  MoreVertical,
} from 'lucide-react'
import { useScheduledMessages, ScheduledMessage } from '@/hooks/useScheduledMessages'
import { useAuthStore } from '@/stores'

// =============================================
// HELPERS
// =============================================

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatDateTime = (date: string) => {
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getStatusConfig = (status: string) => {
  const configs: Record<string, { label: string; color: string; icon: any }> = {
    pending: {
      label: 'Agendada',
      color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      icon: Clock,
    },
    sent: {
      label: 'Enviada',
      color: 'bg-success-500/10 text-success-400 border-success-500/20',
      icon: CheckCircle,
    },
    failed: {
      label: 'Falhou',
      color: 'bg-error-500/10 text-error-400 border-error-500/20',
      icon: XCircle,
    },
    cancelled: {
      label: 'Cancelada',
      color: 'bg-dark-500/10 text-dark-400 border-dark-500/20',
      icon: X,
    },
  }
  return configs[status] || configs.pending
}

const getRecurrenceLabel = (recurrence?: string | null) => {
  if (!recurrence) return null
  const labels: Record<string, string> = {
    daily: 'Diário',
    weekly: 'Semanal',
    monthly: 'Mensal',
  }
  return labels[recurrence]
}

// =============================================
// MESSAGE CARD COMPONENT
// =============================================

interface MessageCardProps {
  message: ScheduledMessage
  onCancel: (id: string) => void
  onDelete: (id: string) => void
  onSendNow: (id: string) => void
  isActioning: boolean
}

function MessageCard({ message, onCancel, onDelete, onSendNow, isActioning }: MessageCardProps) {
  const [showActions, setShowActions] = useState(false)
  const statusConfig = getStatusConfig(message.status)
  const StatusIcon = statusConfig.icon
  const recurrenceLabel = getRecurrenceLabel(message.recurrence)
  const isPending = message.status === 'pending'
  const scheduledDate = new Date(message.scheduled_at)
  const isOverdue = isPending && scheduledDate < new Date()

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`bg-dark-800/50 border border-dark-700/50 rounded-xl p-4 hover:bg-dark-800 
                  transition-colors ${isOverdue ? 'border-amber-500/30' : ''}`}
    >
      <div className="flex items-start gap-4">
        {/* Status Icon */}
        <div className={`p-2.5 rounded-xl ${statusConfig.color}`}>
          <StatusIcon className="w-5 h-5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">
                  {message.contact_name || message.phone_number}
                </span>
                {message.contact_name && (
                  <span className="text-xs text-dark-500">
                    {message.phone_number}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full border ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
                {recurrenceLabel && (
                  <span className="flex items-center gap-1 text-xs text-primary-400">
                    <Repeat className="w-3 h-3" />
                    {recurrenceLabel}
                  </span>
                )}
                {isOverdue && (
                  <span className="text-xs text-amber-400">
                    (atrasada)
                  </span>
                )}
              </div>
            </div>

            {/* Actions Menu */}
            <div className="relative">
              <button
                onClick={() => setShowActions(!showActions)}
                className="p-1.5 hover:bg-dark-700 rounded-lg transition-colors"
              >
                <MoreVertical className="w-4 h-4 text-dark-400" />
              </button>

              <AnimatePresence>
                {showActions && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute right-0 top-8 w-40 bg-dark-700 border border-dark-600 
                               rounded-xl shadow-xl overflow-hidden z-10"
                  >
                    {isPending && (
                      <>
                        <button
                          onClick={() => {
                            onSendNow(message.id)
                            setShowActions(false)
                          }}
                          disabled={isActioning}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white 
                                     hover:bg-dark-600 transition-colors"
                        >
                          <Play className="w-4 h-4" />
                          Enviar Agora
                        </button>
                        <button
                          onClick={() => {
                            onCancel(message.id)
                            setShowActions(false)
                          }}
                          disabled={isActioning}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-400 
                                     hover:bg-dark-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          Cancelar
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        onDelete(message.id)
                        setShowActions(false)
                      }}
                      disabled={isActioning}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error-400 
                                 hover:bg-dark-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Excluir
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Message Preview */}
          <p className="text-sm text-dark-300 line-clamp-2 mb-3">
            {message.content}
          </p>

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-dark-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDate(message.scheduled_at)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatTime(message.scheduled_at)}
            </span>
            {message.sent_at && (
              <span className="flex items-center gap-1 text-success-400">
                <CheckCircle className="w-3.5 h-3.5" />
                Enviada {formatDateTime(message.sent_at)}
              </span>
            )}
            {message.error_message && (
              <span className="flex items-center gap-1 text-error-400" title={message.error_message}>
                <AlertCircle className="w-3.5 h-3.5" />
                Erro
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

export default function ScheduledMessagesPage() {
  const { user } = useAuthStore()
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [actioningId, setActioningId] = useState<string | null>(null)

  // Obter organization_id do usuário
  const organizationId = user?.organization_id || user?.user_metadata?.organization_id || ''

  const {
    messages,
    stats,
    isLoading,
    error,
    loadMessages,
    cancelMessage,
    deleteMessage,
    sendNow,
  } = useScheduledMessages({
    organizationId,
    status: statusFilter || undefined,
    autoLoad: true,
  })

  // =============================================
  // HANDLERS
  // =============================================

  const handleCancel = async (id: string) => {
    setActioningId(id)
    await cancelMessage(id)
    setActioningId(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este agendamento?')) return
    setActioningId(id)
    await deleteMessage(id)
    setActioningId(null)
  }

  const handleSendNow = async (id: string) => {
    if (!confirm('Enviar esta mensagem agora?')) return
    setActioningId(id)
    await sendNow(id)
    setActioningId(null)
  }

  // =============================================
  // RENDER
  // =============================================

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Mensagens Agendadas</h1>
          <p className="text-dark-400 mt-1">
            Gerencie suas mensagens programadas para envio futuro
          </p>
        </div>
        <button
          onClick={loadMessages}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-dark-700 text-white rounded-xl 
                     hover:bg-dark-600 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.pending}</p>
              <p className="text-sm text-dark-400">Agendadas</p>
            </div>
          </div>
        </div>

        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-success-500/10 rounded-lg">
              <CheckCircle className="w-5 h-5 text-success-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.sent}</p>
              <p className="text-sm text-dark-400">Enviadas</p>
            </div>
          </div>
        </div>

        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-error-500/10 rounded-lg">
              <XCircle className="w-5 h-5 text-error-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.failed}</p>
              <p className="text-sm text-dark-400">Falharam</p>
            </div>
          </div>
        </div>

        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-dark-500/10 rounded-lg">
              <X className="w-5 h-5 text-dark-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.cancelled}</p>
              <p className="text-sm text-dark-400">Canceladas</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-dark-400" />
          <span className="text-sm text-dark-400">Filtrar:</span>
        </div>
        <div className="flex gap-2">
          {[
            { value: '', label: 'Todas' },
            { value: 'pending', label: 'Agendadas' },
            { value: 'sent', label: 'Enviadas' },
            { value: 'failed', label: 'Falharam' },
            { value: 'cancelled', label: 'Canceladas' },
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
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-error-500/10 border border-error-500/20 rounded-xl">
          <AlertCircle className="w-5 h-5 text-error-400" />
          <p className="text-error-400">{error}</p>
        </div>
      )}

      {/* Messages List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-dark-600" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">
            Nenhuma mensagem agendada
          </h3>
          <p className="text-dark-400 max-w-sm mx-auto">
            Você pode agendar mensagens diretamente no chat clicando no ícone de relógio
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {messages.map((message) => (
              <MessageCard
                key={message.id}
                message={message}
                onCancel={handleCancel}
                onDelete={handleDelete}
                onSendNow={handleSendNow}
                isActioning={actioningId === message.id}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
