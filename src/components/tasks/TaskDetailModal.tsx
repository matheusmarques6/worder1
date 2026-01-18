'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  CheckSquare,
  Clock,
  User,
  Building,
  DollarSign,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Edit,
  Trash2,
  Loader2,
  MapPin,
  Tag,
  FileText,
  ChevronRight,
} from 'lucide-react'
import type { Task } from '@/hooks/useTasks'
import Link from 'next/link'

interface TaskDetailModalProps {
  task: Task | null
  isOpen: boolean
  onClose: () => void
  onComplete: (id: string, outcome?: string) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  onEdit?: (task: Task) => void
}

// Helpers
const getTaskTypeIcon = (type: string) => {
  switch (type) {
    case 'call': return Phone
    case 'email': return Mail
    case 'whatsapp': return MessageSquare
    case 'meeting': return Calendar
    default: return CheckSquare
  }
}

const getTaskTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    task: 'Tarefa',
    call: 'Ligação',
    email: 'E-mail',
    whatsapp: 'WhatsApp',
    meeting: 'Reunião',
    followup: 'Follow-up',
    payment: 'Cobrança',
  }
  return labels[type] || 'Tarefa'
}

const getPriorityConfig = (priority: string) => {
  switch (priority) {
    case 'urgent': return { label: 'Urgente', color: 'bg-red-500/20 text-red-400', dot: 'bg-red-500' }
    case 'high': return { label: 'Alta', color: 'bg-orange-500/20 text-orange-400', dot: 'bg-orange-500' }
    case 'normal': return { label: 'Normal', color: 'bg-blue-500/20 text-blue-400', dot: 'bg-blue-500' }
    case 'low': return { label: 'Baixa', color: 'bg-gray-500/20 text-gray-400', dot: 'bg-gray-500' }
    default: return { label: priority, color: 'bg-gray-500/20 text-gray-400', dot: 'bg-gray-500' }
  }
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'completed': return { label: 'Concluída', color: 'bg-green-500/20 text-green-400' }
    case 'in_progress': return { label: 'Em Andamento', color: 'bg-blue-500/20 text-blue-400' }
    case 'pending': return { label: 'Pendente', color: 'bg-yellow-500/20 text-yellow-400' }
    case 'cancelled': return { label: 'Cancelada', color: 'bg-gray-500/20 text-gray-400' }
    default: return { label: status, color: 'bg-gray-500/20 text-gray-400' }
  }
}

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

const formatTime = (time: string) => {
  return time.slice(0, 5)
}

const isOverdue = (date: string, status: string) => {
  if (status === 'completed') return false
  return new Date(date) < new Date(new Date().toDateString())
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function TaskDetailModal({
  task,
  isOpen,
  onClose,
  onComplete,
  onDelete,
  onEdit,
}: TaskDetailModalProps) {
  const [isCompleting, setIsCompleting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showOutcomeForm, setShowOutcomeForm] = useState(false)
  const [outcome, setOutcome] = useState('')

  if (!task) return null

  const Icon = getTaskTypeIcon(task.type)
  const priorityConfig = getPriorityConfig(task.priority)
  const statusConfig = getStatusConfig(task.status)
  const overdue = isOverdue(task.due_date, task.status)

  const handleComplete = async () => {
    if (showOutcomeForm) {
      setIsCompleting(true)
      const success = await onComplete(task.id, outcome || undefined)
      setIsCompleting(false)
      if (success) {
        setShowOutcomeForm(false)
        setOutcome('')
        onClose()
      }
    } else {
      setShowOutcomeForm(true)
    }
  }

  const handleQuickComplete = async () => {
    setIsCompleting(true)
    const success = await onComplete(task.id)
    setIsCompleting(false)
    if (success) onClose()
  }

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja excluir esta tarefa?')) return
    
    setIsDeleting(true)
    const success = await onDelete(task.id)
    setIsDeleting(false)
    if (success) onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-dark-800 shadow-2xl z-50 
                       overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-dark-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${priorityConfig.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-dark-400">{getTaskTypeLabel(task.type)}</span>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs rounded-full ${statusConfig.color}`}>
                      {statusConfig.label}
                    </span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${priorityConfig.color}`}>
                      {priorityConfig.label}
                    </span>
                  </div>
                </div>
              </div>
              
              <button
                onClick={onClose}
                className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Title & Description */}
              <div>
                <h2 className="text-xl font-semibold text-white mb-2">{task.title}</h2>
                {task.description && (
                  <p className="text-dark-300 whitespace-pre-wrap">{task.description}</p>
                )}
              </div>

              {/* Due Date */}
              <div className={`p-4 rounded-xl ${
                overdue 
                  ? 'bg-red-500/10 border border-red-500/30' 
                  : 'bg-dark-700/50'
              }`}>
                <div className="flex items-center gap-3">
                  {overdue && <AlertTriangle className="w-5 h-5 text-red-400" />}
                  <Calendar className={`w-5 h-5 ${overdue ? 'text-red-400' : 'text-dark-400'}`} />
                  <div>
                    <p className={`font-medium ${overdue ? 'text-red-400' : 'text-white'}`}>
                      {formatDate(task.due_date)}
                    </p>
                    {task.due_time && (
                      <p className="text-sm text-dark-400">
                        às {formatTime(task.due_time)}
                      </p>
                    )}
                    {overdue && (
                      <p className="text-xs text-red-400 mt-1">Esta tarefa está atrasada</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Assigned User */}
              {task.assigned_to_name && (
                <div className="flex items-center gap-3 p-3 bg-dark-700/30 rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center">
                    <User className="w-5 h-5 text-primary-400" />
                  </div>
                  <div>
                    <p className="text-xs text-dark-400">Atribuído a</p>
                    <p className="text-white font-medium">{task.assigned_to_name}</p>
                  </div>
                </div>
              )}

              {/* Contact Info */}
              {task.contact && (
                <div className="p-4 bg-dark-700/30 rounded-xl">
                  <h3 className="text-sm font-medium text-dark-400 mb-3">Contato</h3>
                  <div className="flex items-center gap-3">
                    {task.contact.profile_picture_url ? (
                      <img 
                        src={task.contact.profile_picture_url} 
                        alt="" 
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-primary-500/20 flex items-center justify-center">
                        <User className="w-6 h-6 text-primary-400" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-medium text-white">
                        {task.contact.name || task.contact.phone_number}
                      </p>
                      <p className="text-sm text-dark-400">{task.contact.phone_number}</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 mt-3">
                    <Link
                      href={`/whatsapp/inbox?phone=${task.contact.phone_number}`}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-500/20 
                                 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-sm"
                    >
                      <MessageSquare className="w-4 h-4" />
                      WhatsApp
                    </Link>
                    <Link
                      href={`/crm/contacts?id=${task.contact.id}`}
                      className="flex-1 flex items-center justify-center gap-2 py-2 bg-dark-600 
                                 text-dark-300 rounded-lg hover:bg-dark-500 transition-colors text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Ver no CRM
                    </Link>
                  </div>
                </div>
              )}

              {/* Deal Info */}
              {task.deal && (
                <div className="p-4 bg-dark-700/30 rounded-xl">
                  <h3 className="text-sm font-medium text-dark-400 mb-3">Deal Vinculado</h3>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center">
                        <DollarSign className="w-5 h-5 text-primary-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">{task.deal.title}</p>
                        <p className="text-lg font-bold text-primary-400">
                          {formatCurrency(task.deal.value)}
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/crm?deal=${task.deal.id}`}
                      className="p-2 text-dark-400 hover:text-white hover:bg-dark-600 rounded-lg transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Link>
                  </div>
                </div>
              )}

              {/* Tags */}
              {task.tags && task.tags.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-dark-400 mb-2">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {task.tags.map((tag, i) => (
                      <span 
                        key={i}
                        className="px-2.5 py-1 bg-dark-700 text-dark-300 text-xs rounded-lg"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="space-y-2 text-sm text-dark-500">
                <p>Criada em {new Date(task.created_at).toLocaleString('pt-BR')}</p>
                {task.created_by_name && <p>Por {task.created_by_name}</p>}
                {task.completed_at && (
                  <p className="text-green-400">
                    Concluída em {new Date(task.completed_at).toLocaleString('pt-BR')}
                    {task.completed_by_name && ` por ${task.completed_by_name}`}
                  </p>
                )}
                {task.outcome && (
                  <div className="p-3 bg-dark-700/50 rounded-lg mt-2">
                    <p className="text-xs text-dark-400 mb-1">Resultado:</p>
                    <p className="text-dark-200">{task.outcome}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-dark-700 space-y-3">
              {/* Outcome Form */}
              {showOutcomeForm && task.status !== 'completed' && (
                <div className="p-3 bg-dark-700/50 rounded-xl space-y-2">
                  <label className="text-sm text-dark-400">Resultado (opcional)</label>
                  <textarea
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    placeholder="Descreva o resultado da tarefa..."
                    className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg 
                               text-white text-sm placeholder:text-dark-500 
                               focus:outline-none focus:border-primary-500 resize-none"
                    rows={2}
                  />
                </div>
              )}

              <div className="flex gap-2">
                {task.status !== 'completed' && (
                  <>
                    <button
                      onClick={handleComplete}
                      disabled={isCompleting}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 
                                 bg-green-500 text-white rounded-xl hover:bg-green-600 
                                 transition-colors disabled:opacity-50"
                    >
                      {isCompleting ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          {showOutcomeForm ? 'Confirmar' : 'Concluir'}
                        </>
                      )}
                    </button>
                    
                    {showOutcomeForm && (
                      <button
                        onClick={handleQuickComplete}
                        disabled={isCompleting}
                        className="px-4 py-2.5 bg-dark-700 text-dark-300 rounded-xl 
                                   hover:bg-dark-600 transition-colors text-sm"
                      >
                        Pular
                      </button>
                    )}
                  </>
                )}

                {onEdit && (
                  <button
                    onClick={() => onEdit(task)}
                    className="p-2.5 bg-dark-700 text-dark-300 rounded-xl 
                               hover:bg-dark-600 transition-colors"
                  >
                    <Edit className="w-5 h-5" />
                  </button>
                )}

                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="p-2.5 bg-red-500/10 text-red-400 rounded-xl 
                             hover:bg-red-500/20 transition-colors"
                >
                  {isDeleting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Trash2 className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default TaskDetailModal
