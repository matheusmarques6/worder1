'use client'

import { useState, useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  MessageSquare,
  Calendar,
  CheckSquare,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import type { Task } from '@/hooks/useTasks'

interface CalendarViewProps {
  tasks: Task[]
  onTaskClick: (task: Task) => void
}

// Helpers
const DAYS_OF_WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

const getTaskTypeIcon = (type: string) => {
  switch (type) {
    case 'call': return Phone
    case 'email': return Mail
    case 'whatsapp': return MessageSquare
    case 'meeting': return Calendar
    default: return CheckSquare
  }
}

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'urgent': return 'bg-red-500'
    case 'high': return 'bg-orange-500'
    case 'normal': return 'bg-blue-500'
    case 'low': return 'bg-gray-500'
    default: return 'bg-gray-500'
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'opacity-50 line-through'
    case 'in_progress': return 'border-l-2 border-l-blue-500'
    default: return ''
  }
}

export function CalendarView({ tasks, onTaskClick }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')

  // Calcular dias do mês
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    
    const days: Date[] = []
    
    // Adicionar dias do mês anterior para completar a primeira semana
    const startPadding = firstDay.getDay()
    for (let i = startPadding - 1; i >= 0; i--) {
      const d = new Date(year, month, -i)
      days.push(d)
    }
    
    // Adicionar todos os dias do mês
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i))
    }
    
    // Adicionar dias do próximo mês para completar a última semana
    const endPadding = 42 - days.length // 6 semanas * 7 dias
    for (let i = 1; i <= endPadding; i++) {
      days.push(new Date(year, month + 1, i))
    }
    
    return days
  }, [currentDate])

  // Agrupar tarefas por data
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    
    tasks.forEach(task => {
      const dateKey = new Date(task.due_date).toDateString()
      if (!map.has(dateKey)) {
        map.set(dateKey, [])
      }
      map.get(dateKey)!.push(task)
    })
    
    return map
  }, [tasks])

  // Navegação
  const goToPrevious = () => {
    setCurrentDate(prev => {
      const d = new Date(prev)
      d.setMonth(d.getMonth() - 1)
      return d
    })
  }

  const goToNext = () => {
    setCurrentDate(prev => {
      const d = new Date(prev)
      d.setMonth(d.getMonth() + 1)
      return d
    })
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const isToday = (date: Date) => {
    return date.toDateString() === new Date().toDateString()
  }

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth()
  }

  const isOverdue = (date: Date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return date < today
  }

  return (
    <div className="bg-dark-800/30 rounded-xl border border-dark-700/50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-dark-700/50">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">
            {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h2>
          <button
            onClick={goToToday}
            className="px-3 py-1 text-sm bg-dark-700 text-dark-300 rounded-lg 
                       hover:bg-dark-600 transition-colors"
          >
            Hoje
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex bg-dark-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === 'month' 
                  ? 'bg-primary-500 text-white' 
                  : 'text-dark-300 hover:text-white'
              }`}
            >
              Mês
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === 'week' 
                  ? 'bg-primary-500 text-white' 
                  : 'text-dark-300 hover:text-white'
              }`}
            >
              Semana
            </button>
          </div>

          {/* Navigation */}
          <button
            onClick={goToPrevious}
            className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goToNext}
            className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Days of Week Header */}
      <div className="grid grid-cols-7 border-b border-dark-700/50">
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className="py-2 text-center text-sm font-medium text-dark-400">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7">
        {calendarDays.map((date, index) => {
          const dateKey = date.toDateString()
          const dayTasks = tasksByDate.get(dateKey) || []
          const today = isToday(date)
          const currentMonth = isCurrentMonth(date)
          const overdue = isOverdue(date)

          return (
            <div
              key={index}
              className={`min-h-[120px] p-2 border-r border-b border-dark-700/30 
                          ${!currentMonth ? 'bg-dark-900/30' : ''} 
                          ${today ? 'bg-primary-500/5' : ''}`}
            >
              {/* Day Number */}
              <div className={`text-sm mb-1 ${
                today 
                  ? 'w-7 h-7 flex items-center justify-center bg-primary-500 text-white rounded-full mx-auto' 
                  : currentMonth 
                    ? 'text-white' 
                    : 'text-dark-600'
              }`}>
                {date.getDate()}
              </div>

              {/* Tasks */}
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map(task => (
                  <TaskPill
                    key={task.id}
                    task={task}
                    onClick={() => onTaskClick(task)}
                    isOverdue={overdue && task.status !== 'completed'}
                  />
                ))}
                
                {dayTasks.length > 3 && (
                  <div className="text-[10px] text-dark-400 text-center">
                    +{dayTasks.length - 3} mais
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 p-3 border-t border-dark-700/50 text-xs text-dark-400">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span>Urgente</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-orange-500" />
          <span>Alta</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span>Normal</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-gray-500" />
          <span>Baixa</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <AlertTriangle className="w-3 h-3 text-red-400" />
          <span>Atrasada</span>
        </div>
      </div>
    </div>
  )
}

// Task Pill Component
function TaskPill({ 
  task, 
  onClick, 
  isOverdue 
}: { 
  task: Task
  onClick: () => void
  isOverdue: boolean 
}) {
  const Icon = getTaskTypeIcon(task.type)
  const priorityColor = getPriorityColor(task.priority)

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-1 rounded text-[11px] truncate 
                  flex items-center gap-1 transition-colors
                  ${task.status === 'completed' 
                    ? 'bg-dark-700/50 text-dark-500 line-through' 
                    : isOverdue 
                      ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' 
                      : 'bg-dark-700 text-dark-200 hover:bg-dark-600'
                  }`}
    >
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
        task.status === 'completed' ? 'bg-green-500' : priorityColor
      }`} />
      <Icon className="w-3 h-3 flex-shrink-0" />
      <span className="truncate">{task.title}</span>
      {task.due_time && (
        <span className="text-[10px] text-dark-500 ml-auto flex-shrink-0">
          {task.due_time.slice(0, 5)}
        </span>
      )}
    </button>
  )
}

export default CalendarView
