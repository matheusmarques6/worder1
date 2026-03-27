'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
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
  MoreVertical,
  Trash2,
  CheckCircle,
  AlertTriangle,
  GripVertical,
} from 'lucide-react'
import type { Task } from '@/hooks/useTasks'

interface KanbanViewProps {
  tasks: Task[]
  onComplete: (id: string) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  onTaskClick: (task: Task) => void
  onDragEnd?: (taskId: string, newStatus: string) => void
}

// Colunas do Kanban
const COLUMNS = [
  { id: 'pending', title: 'Pendentes', color: 'border-yellow-500', bgColor: 'bg-yellow-500/10' },
  { id: 'in_progress', title: 'Em Andamento', color: 'border-blue-500', bgColor: 'bg-blue-500/10' },
  { id: 'completed', title: 'Concluídas', color: 'border-green-500', bgColor: 'bg-green-500/10' },
]

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
    case 'urgent': return { label: 'Urgente', color: 'bg-red-500/20 text-red-400 border-red-500/30' }
    case 'high': return { label: 'Alta', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' }
    case 'normal': return { label: 'Normal', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' }
    case 'low': return { label: 'Baixa', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' }
    default: return { label: priority, color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' }
  }
}

const formatDate = (date: string) => {
  const d = new Date(date)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  
  if (d.toDateString() === today.toDateString()) return 'Hoje'
  if (d.toDateString() === tomorrow.toDateString()) return 'Amanhã'
  
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

const isOverdue = (date: string, status: string) => {
  if (status === 'completed') return false
  return new Date(date) < new Date(new Date().toDateString())
}

export function KanbanView({
  tasks,
  onComplete,
  onDelete,
  onTaskClick,
  onDragEnd,
}: KanbanViewProps) {
  const [draggedTask, setDraggedTask] = useState<string | null>(null)

  // Agrupar tarefas por status
  const tasksByColumn = COLUMNS.reduce((acc, column) => {
    acc[column.id] = tasks.filter(t => t.status === column.id)
    return acc
  }, {} as Record<string, Task[]>)

  const handleDragStart = (taskId: string) => {
    setDraggedTask(taskId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    if (draggedTask && onDragEnd) {
      onDragEnd(draggedTask, columnId)
    }
    setDraggedTask(null)
  }

  const handleDragEndNative = () => {
    setDraggedTask(null)
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[600px]">
      {COLUMNS.map(column => (
        <div
          key={column.id}
          className="flex-shrink-0 w-80"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, column.id)}
        >
          {/* Column Header */}
          <div className={`flex items-center gap-2 p-3 rounded-t-xl border-t-2 ${column.color} ${column.bgColor}`}>
            <span className="font-medium text-white">{column.title}</span>
            <span className="px-2 py-0.5 text-xs bg-gray-100 rounded-full text-gray-600">
              {tasksByColumn[column.id]?.length || 0}
            </span>
          </div>

          {/* Column Content */}
          <div className="bg-gray-50 rounded-b-xl p-2 min-h-[500px] space-y-2">
            <AnimatePresence>
              {tasksByColumn[column.id]?.map(task => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  onComplete={onComplete}
                  onDelete={onDelete}
                  onClick={() => onTaskClick(task)}
                  onDragStart={() => handleDragStart(task.id)}
                  onDragEnd={handleDragEndNative}
                  isDragging={draggedTask === task.id}
                />
              ))}
            </AnimatePresence>

            {tasksByColumn[column.id]?.length === 0 && (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                Nenhuma tarefa
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// Kanban Card Component
function KanbanCard({
  task,
  onComplete,
  onDelete,
  onClick,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  task: Task
  onComplete: (id: string) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  onClick: () => void
  onDragStart: () => void
  onDragEnd: () => void
  isDragging: boolean
}) {
  const [showMenu, setShowMenu] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  
  const Icon = getTaskTypeIcon(task.type)
  const priorityConfig = getPriorityConfig(task.priority)
  const overdue = isOverdue(task.due_date, task.status)

  const handleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsCompleting(true)
    await onComplete(task.id)
    setIsCompleting(false)
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm('Tem certeza que deseja excluir esta tarefa?')) {
      await onDelete(task.id)
    }
    setShowMenu(false)
  }

  const handleNativeDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'move'
    onDragStart()
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      <div
        draggable
        onDragStart={handleNativeDragStart}
        onDragEnd={onDragEnd}
        onClick={onClick}
        className={`bg-white border border-gray-200 rounded-xl p-3 cursor-pointer 
                    hover:border-gray-300 transition-all group ${
                      overdue ? 'border-l-2 border-l-red-500' : ''
                    }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${priorityConfig.color}`}>
              <Icon className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] text-gray-500 uppercase">
              {getTaskTypeLabel(task.type)}
            </span>
          </div>
          
          <div className="flex items-center gap-1">
            <GripVertical className="w-4 h-4 text-gray-500 opacity-0 group-hover:opacity-100 cursor-grab" />
            
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
                className="p-1 text-gray-400 hover:text-white rounded transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-32 bg-gray-100 rounded-lg shadow-lg 
                                border border-gray-300 py-1 z-10">
                  <button
                    onClick={handleComplete}
                    className="w-full px-3 py-1.5 text-left text-sm text-gray-600 
                               hover:bg-gray-200 flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Concluir
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full px-3 py-1.5 text-left text-sm text-red-400 
                               hover:bg-gray-200 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Excluir
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Title */}
        <h4 className="text-sm font-medium text-gray-900 mb-2 line-clamp-2">
          {task.title}
        </h4>

        {/* Due Date */}
        <div className={`flex items-center gap-1.5 text-xs mb-2 ${
          overdue ? 'text-red-400' : 'text-gray-500'
        }`}>
          {overdue && <AlertTriangle className="w-3 h-3" />}
          <Clock className="w-3 h-3" />
          <span>{formatDate(task.due_date)}</span>
          {task.due_time && <span>às {task.due_time.slice(0, 5)}</span>}
        </div>

        {/* Contact/Deal Info */}
        {(task.contact || task.deal) && (
          <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-gray-200">
            {task.contact && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                {task.contact.profile_picture_url ? (
                  <img 
                    src={task.contact.profile_picture_url} 
                    alt="" 
                    className="w-4 h-4 rounded-full"
                  />
                ) : (
                  <User className="w-3 h-3" />
                )}
                <span className="truncate max-w-[100px]">
                  {task.contact.name || task.contact.phone_number}
                </span>
              </div>
            )}
            
            {task.deal && (
              <div className="flex items-center gap-1.5 text-xs text-brand-600">
                <DollarSign className="w-3 h-3" />
                <span className="truncate max-w-[100px]">{task.deal.title}</span>
              </div>
            )}
          </div>
        )}

        {/* Assigned User */}
        {task.assigned_to_name && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-2">
            <User className="w-3 h-3" />
            <span>{task.assigned_to_name}</span>
          </div>
        )}

        {/* Complete Button */}
        {task.status !== 'completed' && (
          <button
            onClick={handleComplete}
            disabled={isCompleting}
            className="w-full mt-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg 
                       hover:bg-brand-100 hover:text-brand-600 transition-colors
                       flex items-center justify-center gap-1.5"
          >
            {isCompleting ? (
              <span className="animate-pulse">Concluindo...</span>
            ) : (
              <>
                <CheckCircle className="w-3.5 h-3.5" />
                Marcar como concluída
              </>
            )}
          </button>
        )}
      </div>
    </motion.div>
  )
}

export default KanbanView
