// =============================================
// Component: TaskCard
// Card de tarefa individual
// =============================================

'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Phone,
  Mail,
  MessageSquare,
  Video,
  CheckSquare,
  Bell,
  DollarSign,
  Calendar,
  Clock,
  User,
  MoreVertical,
  CheckCircle,
  Trash2,
  Pencil,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import type { Task } from '@/hooks/useTasks'

interface TaskCardProps {
  task: Task
  onComplete: (id: string) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  onEdit?: (task: Task) => void
  isActioning?: boolean
}

// =============================================
// HELPERS
// =============================================

const TYPE_CONFIG: Record<string, { icon: any; color: string; bgColor: string }> = {
  call: { icon: Phone, color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  email: { icon: Mail, color: 'text-amber-400', bgColor: 'bg-amber-500/10' },
  whatsapp: { icon: MessageSquare, color: 'text-green-400', bgColor: 'bg-green-500/10' },
  meeting: { icon: Video, color: 'text-purple-400', bgColor: 'bg-purple-500/10' },
  task: { icon: CheckSquare, color: 'text-brand-600', bgColor: 'bg-brand-50' },
  followup: { icon: Bell, color: 'text-pink-400', bgColor: 'bg-pink-500/10' },
  payment: { icon: DollarSign, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'Baixa', color: 'text-gray-500' },
  normal: { label: 'Normal', color: 'text-blue-400' },
  high: { label: 'Alta', color: 'text-amber-400' },
  urgent: { label: 'Urgente', color: 'text-error-400' },
}

const formatDate = (date: string) => {
  const d = new Date(date)
  const today = new Date()
  const tomorrow = new Date(Date.now() + 86400000)
  
  if (d.toDateString() === today.toDateString()) return 'Hoje'
  if (d.toDateString() === tomorrow.toDateString()) return 'Amanhã'
  
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

const formatTime = (time: string) => {
  return time.slice(0, 5)
}

const isOverdue = (dueDate: string, status: string) => {
  if (!['pending', 'in_progress'].includes(status)) return false
  return new Date(dueDate) < new Date(new Date().toDateString())
}

// =============================================
// COMPONENT
// =============================================

export function TaskCard({
  task,
  onComplete,
  onDelete,
  onEdit,
  isActioning,
}: TaskCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const typeConfig = TYPE_CONFIG[task.type] || TYPE_CONFIG.task
  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal
  const TypeIcon = typeConfig.icon
  const overdue = isOverdue(task.due_date, task.status)
  const isCompleted = task.status === 'completed'

  // =============================================
  // HANDLERS
  // =============================================

  const handleComplete = async () => {
    setCompleting(true)
    await onComplete(task.id)
    setCompleting(false)
  }

  const handleDelete = async () => {
    if (!confirm('Remover esta tarefa?')) return
    setDeleting(true)
    await onDelete(task.id)
    setDeleting(false)
  }

  // =============================================
  // RENDER
  // =============================================

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`group relative bg-gray-50 border rounded-xl p-4 hover:bg-white transition-all ${
        overdue 
          ? 'border-error-500/30 bg-error-500/5' 
          : isCompleted 
            ? 'border-gray-200 opacity-60' 
            : 'border-gray-200'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox/Icon */}
        <button
          onClick={handleComplete}
          disabled={completing || isCompleted}
          className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            isCompleted
              ? 'bg-success-500/20 text-success-400'
              : `${typeConfig.bgColor} ${typeConfig.color} hover:scale-105`
          }`}
        >
          {completing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isCompleted ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <TypeIcon className="w-5 h-5" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title & Priority */}
          <div className="flex items-start justify-between gap-2">
            <h4 className={`font-medium ${isCompleted ? 'line-through text-gray-400' : 'text-white'}`}>
              {task.title}
            </h4>
            
            {/* Menu */}
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 hover:bg-gray-100 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
              >
                <MoreVertical className="w-4 h-4 text-gray-500" />
              </button>

              {showMenu && (
                <div className="absolute right-0 top-8 w-36 bg-gray-100 border border-gray-300 rounded-xl shadow-xl overflow-hidden z-10">
                  {!isCompleted && (
                    <>
                      <button
                        onClick={() => {
                          handleComplete()
                          setShowMenu(false)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Concluir
                      </button>
                      {onEdit && (
                        <button
                          onClick={() => {
                            onEdit(task)
                            setShowMenu(false)
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
                        >
                          <Pencil className="w-4 h-4" />
                          Editar
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => {
                      handleDelete()
                      setShowMenu(false)
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error-400 hover:bg-gray-200"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remover
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {task.description && (
            <p className={`text-sm mt-1 line-clamp-2 ${isCompleted ? 'text-gray-400' : 'text-gray-500'}`}>
              {task.description}
            </p>
          )}

          {/* Meta Info */}
          <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
            {/* Date & Time */}
            <span className={`flex items-center gap-1 ${
              overdue ? 'text-error-400' : 'text-gray-400'
            }`}>
              {overdue && <AlertTriangle className="w-3 h-3" />}
              <Calendar className="w-3 h-3" />
              {formatDate(task.due_date)}
              {task.due_time && (
                <>
                  <Clock className="w-3 h-3 ml-1" />
                  {formatTime(task.due_time)}
                </>
              )}
            </span>

            {/* Priority */}
            {task.priority !== 'normal' && (
              <span className={`${priorityConfig.color}`}>
                • {priorityConfig.label}
              </span>
            )}

            {/* Contact */}
            {task.contact && (
              <span className="flex items-center gap-1 text-gray-500">
                <User className="w-3 h-3" />
                {task.contact.name || task.contact.phone_number}
              </span>
            )}

            {/* Deal */}
            {task.deal && (
              <span className="flex items-center gap-1 text-success-400">
                <DollarSign className="w-3 h-3" />
                {task.deal.title}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {(completing || deleting) && (
        <div className="absolute inset-0 bg-gray-50 rounded-xl flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
        </div>
      )}
    </motion.div>
  )
}

export default TaskCard
