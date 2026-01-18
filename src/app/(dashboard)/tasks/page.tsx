// =============================================
// Page: Tasks (Completa)
// /tasks
// Gerencia tarefas com 3 visualizações
// =============================================

'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  RefreshCw,
  Filter,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Clock,
  Loader2,
  ListTodo,
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  List,
  CalendarDays,
  Search,
  X,
  User,
  Building,
  Tag,
  Phone,
  Mail,
  MessageSquare,
} from 'lucide-react'
import { useTasks, Task } from '@/hooks/useTasks'
import { useAuthStore } from '@/stores'
import { TaskCard } from '@/components/tasks/TaskCard'
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal'
import { KanbanView } from '@/components/tasks/KanbanView'
import { CalendarView } from '@/components/tasks/CalendarView'
import { TaskDetailModal } from '@/components/tasks/TaskDetailModal'

// =============================================
// VIEW MODES
// =============================================

type ViewMode = 'list' | 'kanban' | 'calendar'

const VIEW_OPTIONS = [
  { id: 'list' as ViewMode, label: 'Lista', icon: List },
  { id: 'kanban' as ViewMode, label: 'Kanban', icon: LayoutGrid },
  { id: 'calendar' as ViewMode, label: 'Calendário', icon: CalendarDays },
]

// =============================================
// SECTION COMPONENT (LIST VIEW)
// =============================================

interface TaskSectionProps {
  title: string
  icon: any
  iconColor: string
  bgColor: string
  tasks: Task[]
  defaultOpen?: boolean
  onComplete: (id: string) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  onTaskClick: (task: Task) => void
}

function TaskSection({
  title,
  icon: Icon,
  iconColor,
  bgColor,
  tasks,
  defaultOpen = true,
  onComplete,
  onDelete,
  onTaskClick,
}: TaskSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  if (tasks.length === 0) return null

  return (
    <div className="space-y-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 w-full text-left group"
      >
        <div className={`p-1.5 rounded-lg ${bgColor}`}>
          {isOpen ? (
            <ChevronDown className={`w-4 h-4 ${iconColor}`} />
          ) : (
            <ChevronRight className={`w-4 h-4 ${iconColor}`} />
          )}
        </div>
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span className="font-medium text-white">{title}</span>
        <span className={`px-2 py-0.5 text-xs rounded-full ${bgColor} ${iconColor}`}>
          {tasks.length}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 pl-6"
          >
            {tasks.map((task) => (
              <div key={task.id} onClick={() => onTaskClick(task)} className="cursor-pointer">
                <TaskCard
                  task={task}
                  onComplete={onComplete}
                  onDelete={onDelete}
                />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// =============================================
// MAIN PAGE COMPONENT
// =============================================

export default function TasksPage() {
  const { user } = useAuthStore()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  
  // Filtros
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [priorityFilter, setPriorityFilter] = useState<string>('')
  const [assignedFilter, setAssignedFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Obter organization_id do usuário
  const organizationId = user?.organization_id || user?.user_metadata?.organization_id || ''

  const {
    tasks,
    grouped,
    stats,
    isLoading,
    error,
    loadTasks,
    loadStats,
    createTask,
    updateTask,
    completeTask,
    deleteTask,
  } = useTasks({
    organizationId,
    filters: {
      status: statusFilter || undefined,
      type: typeFilter || undefined,
      priority: priorityFilter || undefined,
      assignedTo: assignedFilter || undefined,
    },
    autoLoad: true,
  })

  // Filtrar por busca
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks
    
    const query = searchQuery.toLowerCase()
    return tasks.filter(task => 
      task.title.toLowerCase().includes(query) ||
      task.description?.toLowerCase().includes(query) ||
      task.contact?.name?.toLowerCase().includes(query) ||
      task.contact?.phone_number?.includes(query) ||
      task.deal?.title?.toLowerCase().includes(query)
    )
  }, [tasks, searchQuery])

  // Reagrupar tarefas filtradas
  const filteredGrouped = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    return {
      overdue: filteredTasks.filter(t => {
        const dueDate = new Date(t.due_date)
        return t.status !== 'completed' && dueDate < today
      }),
      today: filteredTasks.filter(t => {
        const dueDate = new Date(t.due_date)
        return t.status !== 'completed' && 
               dueDate >= today && 
               dueDate < tomorrow
      }),
      tomorrow: filteredTasks.filter(t => {
        const dueDate = new Date(t.due_date)
        const dayAfter = new Date(tomorrow)
        dayAfter.setDate(dayAfter.getDate() + 1)
        return t.status !== 'completed' && 
               dueDate >= tomorrow && 
               dueDate < dayAfter
      }),
      upcoming: filteredTasks.filter(t => {
        const dueDate = new Date(t.due_date)
        const dayAfter = new Date(tomorrow)
        dayAfter.setDate(dayAfter.getDate() + 1)
        return t.status !== 'completed' && dueDate >= dayAfter
      }),
      completed: filteredTasks.filter(t => t.status === 'completed'),
    }
  }, [filteredTasks])

  // =============================================
  // HANDLERS
  // =============================================

  const handleCreate = async (params: any) => {
    const task = await createTask(params)
    return !!task
  }

  const handleComplete = async (id: string, outcome?: string) => {
    return await completeTask(id, outcome)
  }

  const handleDelete = async (id: string) => {
    return await deleteTask(id)
  }

  const handleRefresh = () => {
    loadTasks()
    loadStats()
  }

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task)
  }

  const handleDragEnd = async (taskId: string, newStatus: string) => {
    await updateTask(taskId, { status: newStatus as any })
    loadTasks()
  }

  const clearFilters = () => {
    setStatusFilter('')
    setTypeFilter('')
    setPriorityFilter('')
    setAssignedFilter('')
    setSearchQuery('')
  }

  const hasActiveFilters = statusFilter || typeFilter || priorityFilter || assignedFilter || searchQuery

  // =============================================
  // RENDER
  // =============================================

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Tarefas</h1>
          <p className="text-dark-400 mt-1">
            Gerencie suas atividades e compromissos
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex bg-dark-700 rounded-xl p-1">
            {VIEW_OPTIONS.map(option => (
              <button
                key={option.id}
                onClick={() => setViewMode(option.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  viewMode === option.id
                    ? 'bg-primary-500 text-white'
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                <option.icon className="w-4 h-4" />
                <span className="text-sm hidden sm:inline">{option.label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-dark-700 text-white rounded-xl 
                       hover:bg-dark-600 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl 
                       hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nova Tarefa</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className={`bg-dark-800/50 border rounded-xl p-4 transition-colors cursor-pointer
                          ${statusFilter === '' && !hasActiveFilters ? 'border-primary-500/50' : 'border-dark-700/50 hover:border-dark-600'}`}
               onClick={() => { setStatusFilter(''); }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-500/10 rounded-lg">
                <ListTodo className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
                <p className="text-xs text-dark-400">Total</p>
              </div>
            </div>
          </div>

          <div className={`bg-dark-800/50 border rounded-xl p-4 transition-colors cursor-pointer
                          ${statusFilter === '' && stats.overdue > 0 ? 'border-red-500/50' : 'border-dark-700/50 hover:border-dark-600'}`}
               onClick={() => { setStatusFilter(''); }}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-error-500/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-error-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-error-400">{stats.overdue}</p>
                <p className="text-xs text-dark-400">Atrasadas</p>
              </div>
            </div>
          </div>

          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <Calendar className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-400">{stats.due_today}</p>
                <p className="text-xs text-dark-400">Hoje</p>
              </div>
            </div>
          </div>

          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Clock className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-400">{stats.due_tomorrow}</p>
                <p className="text-xs text-dark-400">Amanhã</p>
              </div>
            </div>
          </div>

          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <Calendar className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.due_this_week}</p>
                <p className="text-xs text-dark-400">Esta semana</p>
              </div>
            </div>
          </div>

          <div className={`bg-dark-800/50 border rounded-xl p-4 transition-colors cursor-pointer
                          ${statusFilter === 'completed' ? 'border-green-500/50' : 'border-dark-700/50 hover:border-dark-600'}`}
               onClick={() => setStatusFilter(statusFilter === 'completed' ? '' : 'completed')}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success-500/10 rounded-lg">
                <CheckCircle className="w-5 h-5 text-success-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-success-400">{stats.completed}</p>
                <p className="text-xs text-dark-400">Concluídas</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar tarefas, contatos, deals..."
            className="w-full pl-10 pr-10 py-2.5 bg-dark-800 border border-dark-700 rounded-xl 
                       text-white placeholder:text-dark-500 focus:outline-none focus:border-primary-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-dark-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors ${
            showFilters || hasActiveFilters
              ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
              : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
          }`}
        >
          <Filter className="w-4 h-4" />
          <span>Filtros</span>
          {hasActiveFilters && (
            <span className="w-2 h-2 rounded-full bg-primary-500" />
          )}
        </button>
      </div>

      {/* Expanded Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl space-y-4">
              <div className="flex flex-wrap gap-4">
                {/* Status Filter */}
                <div>
                  <label className="block text-xs text-dark-400 mb-1.5">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm 
                               text-white focus:outline-none focus:border-primary-500 min-w-[140px]"
                  >
                    <option value="">Todos</option>
                    <option value="pending">Pendentes</option>
                    <option value="in_progress">Em andamento</option>
                    <option value="completed">Concluídas</option>
                  </select>
                </div>

                {/* Type Filter */}
                <div>
                  <label className="block text-xs text-dark-400 mb-1.5">Tipo</label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm 
                               text-white focus:outline-none focus:border-primary-500 min-w-[140px]"
                  >
                    <option value="">Todos</option>
                    <option value="task">Tarefa</option>
                    <option value="call">Ligação</option>
                    <option value="email">E-mail</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="meeting">Reunião</option>
                    <option value="followup">Follow-up</option>
                    <option value="payment">Cobrança</option>
                  </select>
                </div>

                {/* Priority Filter */}
                <div>
                  <label className="block text-xs text-dark-400 mb-1.5">Prioridade</label>
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm 
                               text-white focus:outline-none focus:border-primary-500 min-w-[140px]"
                  >
                    <option value="">Todas</option>
                    <option value="urgent">Urgente</option>
                    <option value="high">Alta</option>
                    <option value="normal">Normal</option>
                    <option value="low">Baixa</option>
                  </select>
                </div>

                {/* Assigned Filter */}
                <div>
                  <label className="block text-xs text-dark-400 mb-1.5">Atribuição</label>
                  <select
                    value={assignedFilter}
                    onChange={(e) => setAssignedFilter(e.target.value)}
                    className="px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-sm 
                               text-white focus:outline-none focus:border-primary-500 min-w-[140px]"
                  >
                    <option value="">Todos</option>
                    <option value={user?.id || ''}>Minhas tarefas</option>
                    <option value="unassigned">Não atribuídas</option>
                  </select>
                </div>
              </div>

              {hasActiveFilters && (
                <div className="flex items-center justify-between pt-2 border-t border-dark-700/50">
                  <span className="text-sm text-dark-400">
                    {filteredTasks.length} tarefa(s) encontrada(s)
                  </span>
                  <button
                    onClick={clearFilters}
                    className="text-sm text-primary-400 hover:text-primary-300"
                  >
                    Limpar filtros
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <ListTodo className="w-8 h-8 text-dark-600" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">
            {hasActiveFilters ? 'Nenhuma tarefa encontrada' : 'Nenhuma tarefa ainda'}
          </h3>
          <p className="text-dark-400 max-w-sm mx-auto mb-6">
            {hasActiveFilters 
              ? 'Tente ajustar os filtros para encontrar tarefas'
              : 'Crie sua primeira tarefa para organizar suas atividades'
            }
          </p>
          {!hasActiveFilters && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl 
                         hover:bg-primary-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nova Tarefa
            </button>
          )}
        </div>
      ) : (
        <>
          {/* LIST VIEW */}
          {viewMode === 'list' && (
            <div className="space-y-6">
              <TaskSection
                title="Atrasadas"
                icon={AlertTriangle}
                iconColor="text-error-400"
                bgColor="bg-error-500/10"
                tasks={filteredGrouped.overdue}
                onComplete={handleComplete}
                onDelete={handleDelete}
                onTaskClick={handleTaskClick}
              />

              <TaskSection
                title="Hoje"
                icon={Calendar}
                iconColor="text-amber-400"
                bgColor="bg-amber-500/10"
                tasks={filteredGrouped.today}
                onComplete={handleComplete}
                onDelete={handleDelete}
                onTaskClick={handleTaskClick}
              />

              <TaskSection
                title="Amanhã"
                icon={Clock}
                iconColor="text-blue-400"
                bgColor="bg-blue-500/10"
                tasks={filteredGrouped.tomorrow}
                onComplete={handleComplete}
                onDelete={handleDelete}
                onTaskClick={handleTaskClick}
              />

              <TaskSection
                title="Próximas"
                icon={Calendar}
                iconColor="text-primary-400"
                bgColor="bg-primary-500/10"
                tasks={filteredGrouped.upcoming}
                defaultOpen={false}
                onComplete={handleComplete}
                onDelete={handleDelete}
                onTaskClick={handleTaskClick}
              />

              {statusFilter === 'completed' && (
                <TaskSection
                  title="Concluídas"
                  icon={CheckCircle}
                  iconColor="text-success-400"
                  bgColor="bg-success-500/10"
                  tasks={filteredGrouped.completed}
                  defaultOpen={true}
                  onComplete={handleComplete}
                  onDelete={handleDelete}
                  onTaskClick={handleTaskClick}
                />
              )}
            </div>
          )}

          {/* KANBAN VIEW */}
          {viewMode === 'kanban' && (
            <KanbanView
              tasks={filteredTasks}
              onComplete={handleComplete}
              onDelete={handleDelete}
              onTaskClick={handleTaskClick}
              onDragEnd={handleDragEnd}
            />
          )}

          {/* CALENDAR VIEW */}
          {viewMode === 'calendar' && (
            <CalendarView
              tasks={filteredTasks}
              onTaskClick={handleTaskClick}
            />
          )}
        </>
      )}

      {/* Create Modal */}
      <CreateTaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
      />

      {/* Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onComplete={handleComplete}
        onDelete={handleDelete}
      />
    </div>
  )
}
