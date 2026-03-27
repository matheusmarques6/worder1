'use client'

import { useState } from 'react'
import {
  CheckSquare,
  Plus,
  Clock,
  AlertTriangle,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  User,
  CheckCircle,
  Circle,
  ChevronRight,
  Loader2,
  MoreVertical,
  Trash2,
  Edit,
} from 'lucide-react'
import type { InboxTask } from '@/types/inbox'

interface TasksTabProps {
  contactId: string
  tasks: InboxTask[]
  isLoading: boolean
  onCreateTask: (task: Partial<InboxTask>) => Promise<void>
  onCompleteTask: (taskId: string, outcome?: string) => Promise<void>
  onDeleteTask: (taskId: string) => Promise<void>
  onRefresh: () => void
}

// Helpers
const formatDate = (date?: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })
}

const formatTime = (time?: string) => {
  if (!time) return ''
  return time.slice(0, 5)
}

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

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'urgent': return 'text-red-400 bg-red-500/10'
    case 'high': return 'text-orange-400 bg-orange-500/10'
    case 'normal': return 'text-blue-400 bg-blue-500/10'
    case 'low': return 'text-gray-400 bg-gray-500/10'
    default: return 'text-gray-400 bg-gray-500/10'
  }
}

export function TasksTab({
  contactId,
  tasks,
  isLoading,
  onCreateTask,
  onCompleteTask,
  onDeleteTask,
  onRefresh,
}: TasksTabProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [completingId, setCompletingId] = useState<string | null>(null)
  
  // Agrupar tarefas
  const overdueTasks = tasks.filter(t => t.is_overdue && t.status !== 'completed')
  const todayTasks = tasks.filter(t => t.is_today && !t.is_overdue && t.status !== 'completed')
  const upcomingTasks = tasks.filter(t => !t.is_overdue && !t.is_today && t.status !== 'completed')
  const completedTasks = tasks.filter(t => t.status === 'completed').slice(0, 5)

  const handleComplete = async (taskId: string) => {
    setCompletingId(taskId)
    try {
      await onCompleteTask(taskId)
    } finally {
      setCompletingId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-900 flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-brand-600" />
          Tarefas
          {tasks.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-gray-100 rounded-md">
              {tasks.filter(t => t.status !== 'completed').length}
            </span>
          )}
        </h4>
        <button
          onClick={() => setShowCreateModal(true)}
          className="p-1.5 text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Tarefas Atrasadas */}
      {overdueTasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-red-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="font-medium">Atrasadas ({overdueTasks.length})</span>
          </div>
          {overdueTasks.map(task => (
            <TaskCard 
              key={task.id} 
              task={task} 
              onComplete={handleComplete}
              isCompleting={completingId === task.id}
            />
          ))}
        </div>
      )}

      {/* Tarefas de Hoje */}
      {todayTasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-yellow-400">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-medium">Hoje ({todayTasks.length})</span>
          </div>
          {todayTasks.map(task => (
            <TaskCard 
              key={task.id} 
              task={task} 
              onComplete={handleComplete}
              isCompleting={completingId === task.id}
            />
          ))}
        </div>
      )}

      {/* Próximas Tarefas */}
      {upcomingTasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Calendar className="w-3.5 h-3.5" />
            <span className="font-medium">Próximas ({upcomingTasks.length})</span>
          </div>
          {upcomingTasks.map(task => (
            <TaskCard 
              key={task.id} 
              task={task} 
              onComplete={handleComplete}
              isCompleting={completingId === task.id}
            />
          ))}
        </div>
      )}

      {/* Concluídas Recentes */}
      {completedTasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-green-400">
            <CheckCircle className="w-3.5 h-3.5" />
            <span className="font-medium">Concluídas</span>
          </div>
          {completedTasks.map(task => (
            <TaskCard 
              key={task.id} 
              task={task} 
              onComplete={handleComplete}
              isCompleting={false}
              completed
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {tasks.length === 0 && (
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 
                          flex items-center justify-center">
            <CheckSquare className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 mb-3">Nenhuma tarefa</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="text-sm text-brand-600 hover:text-brand-500 font-medium"
          >
            Criar tarefa
          </button>
        </div>
      )}

      {/* Modal de Criação */}
      {showCreateModal && (
        <CreateTaskModal
          contactId={contactId}
          onClose={() => setShowCreateModal(false)}
          onCreate={async (task) => {
            await onCreateTask(task)
            setShowCreateModal(false)
            onRefresh()
          }}
        />
      )}
    </div>
  )
}

// Task Card Component
function TaskCard({ 
  task, 
  onComplete, 
  isCompleting,
  completed = false 
}: { 
  task: InboxTask
  onComplete: (id: string) => void
  isCompleting: boolean
  completed?: boolean
}) {
  const Icon = getTaskTypeIcon(task.type)
  
  return (
    <div className={`p-3 bg-gray-50 rounded-xl border transition-all ${
      task.is_overdue ? 'border-red-500/30' : 
      task.is_today ? 'border-yellow-500/30' : 
      'border-transparent'
    } ${completed ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={() => !completed && onComplete(task.id)}
          disabled={isCompleting || completed}
          className={`mt-0.5 flex-shrink-0 ${
            completed 
              ? 'text-green-400' 
              : 'text-gray-400 hover:text-brand-600'
          } transition-colors`}
        >
          {isCompleting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : completed ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <Circle className="w-5 h-5" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Icon className="w-3.5 h-3.5 text-gray-500" />
            <span className={`text-xs ${getPriorityColor(task.priority)} px-1.5 py-0.5 rounded`}>
              {getTaskTypeLabel(task.type)}
            </span>
          </div>
          
          <p className={`text-sm text-white mb-1 ${completed ? 'line-through' : ''}`}>
            {task.title}
          </p>
          
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className={task.is_overdue ? 'text-red-400' : ''}>
              {formatDate(task.due_date)}
              {task.due_time && ` ${formatTime(task.due_time)}`}
            </span>
            
            {task.assigned_to_name && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {task.assigned_to_name.split(' ')[0]}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Create Task Modal
function CreateTaskModal({
  contactId,
  onClose,
  onCreate,
}: {
  contactId: string
  onClose: () => void
  onCreate: (task: Partial<InboxTask>) => Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('task')
  const [priority, setPriority] = useState('normal')
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0])
  const [dueTime, setDueTime] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setIsSubmitting(true)
    try {
      await onCreate({
        title: title.trim(),
        type: type as any,
        priority: priority as any,
        due_date: dueDate,
        due_time: dueTime || undefined,
        description: description.trim() || undefined,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Nova Tarefa</h3>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Título */}
          <div>
            <label className="block text-sm text-gray-500 mb-1">Título *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Ligar para confirmar pedido"
              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg 
                         text-white placeholder:text-gray-400 focus:outline-none focus:border-primary-500"
              autoFocus
            />
          </div>

          {/* Tipo e Prioridade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg 
                           text-white focus:outline-none focus:border-primary-500"
              >
                <option value="task">Tarefa</option>
                <option value="call">Ligação</option>
                <option value="email">E-mail</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="meeting">Reunião</option>
                <option value="followup">Follow-up</option>
                <option value="payment">Cobrança</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Prioridade</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg 
                           text-white focus:outline-none focus:border-primary-500"
              >
                <option value="low">Baixa</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
          </div>

          {/* Data e Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Data *</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg 
                           text-white focus:outline-none focus:border-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-500 mb-1">Hora</label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg 
                           text-white focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-sm text-gray-500 mb-1">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes adicionais..."
              rows={3}
              className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg 
                         text-white placeholder:text-gray-400 focus:outline-none focus:border-primary-500
                         resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-white rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg 
                         hover:bg-primary-600 transition-colors disabled:opacity-50
                         flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Criar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default TasksTab
