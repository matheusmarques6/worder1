// =============================================
// Page: Tasks
// /tasks
// Lista e gerencia tarefas
// =============================================

'use client'

import { useState } from 'react'
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
} from 'lucide-react'
import { useTasks, Task } from '@/hooks/useTasks'
import { useAuthStore } from '@/stores'
import { TaskCard } from '@/components/tasks/TaskCard'
import { CreateTaskModal } from '@/components/tasks/CreateTaskModal'

// =============================================
// SECTION COMPONENT
// =============================================

interface TaskSectionProps {
  title: string
  icon: any
  iconColor: string
  tasks: Task[]
  defaultOpen?: boolean
  onComplete: (id: string) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}

function TaskSection({
  title,
  icon: Icon,
  iconColor,
  tasks,
  defaultOpen = true,
  onComplete,
  onDelete,
}: TaskSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  if (tasks.length === 0) return null

  return (
    <div className="space-y-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full text-left group"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-dark-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-dark-500" />
        )}
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span className="font-medium text-white">{title}</span>
        <span className="text-sm text-dark-500">({tasks.length})</span>
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
              <TaskCard
                key={task.id}
                task={task}
                onComplete={onComplete}
                onDelete={onDelete}
              />
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
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')

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
    completeTask,
    deleteTask,
  } = useTasks({
    organizationId,
    filters: {
      status: statusFilter || undefined,
      type: typeFilter || undefined,
    },
    autoLoad: true,
  })

  // =============================================
  // HANDLERS
  // =============================================

  const handleCreate = async (params: any) => {
    const task = await createTask(params)
    return !!task
  }

  const handleComplete = async (id: string) => {
    return await completeTask(id)
  }

  const handleDelete = async (id: string) => {
    return await deleteTask(id)
  }

  const handleRefresh = () => {
    loadTasks()
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
          <h1 className="text-2xl font-bold text-white">Tarefas</h1>
          <p className="text-dark-400 mt-1">
            Gerencie suas atividades e compromissos
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
            Atualizar
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl 
                       hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Tarefa
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
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
              <div className="p-2 bg-primary-500/10 rounded-lg">
                <ListTodo className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.pending + stats.in_progress}</p>
                <p className="text-xs text-dark-400">Pendentes</p>
              </div>
            </div>
          </div>

          <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
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
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-dark-400" />
          <span className="text-sm text-dark-400">Filtrar:</span>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2">
          {[
            { value: '', label: 'Todas' },
            { value: 'pending', label: 'Pendentes' },
            { value: 'in_progress', label: 'Em andamento' },
            { value: 'completed', label: 'Concluídas' },
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

        {/* Type Filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-sm 
                     text-white focus:outline-none"
        >
          <option value="">Todos os tipos</option>
          <option value="call">Ligação</option>
          <option value="email">E-mail</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="meeting">Reunião</option>
          <option value="task">Tarefa</option>
          <option value="followup">Follow-up</option>
          <option value="payment">Cobrança</option>
        </select>
      </div>

      {/* Tasks List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <ListTodo className="w-8 h-8 text-dark-600" />
          </div>
          <h3 className="text-lg font-medium text-white mb-2">
            Nenhuma tarefa encontrada
          </h3>
          <p className="text-dark-400 max-w-sm mx-auto mb-6">
            Crie sua primeira tarefa para organizar suas atividades
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-xl 
                       hover:bg-primary-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Tarefa
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Overdue */}
          <TaskSection
            title="Atrasadas"
            icon={AlertTriangle}
            iconColor="text-error-400"
            tasks={grouped.overdue}
            onComplete={handleComplete}
            onDelete={handleDelete}
          />

          {/* Today */}
          <TaskSection
            title="Hoje"
            icon={Calendar}
            iconColor="text-amber-400"
            tasks={grouped.today}
            onComplete={handleComplete}
            onDelete={handleDelete}
          />

          {/* Tomorrow */}
          <TaskSection
            title="Amanhã"
            icon={Clock}
            iconColor="text-blue-400"
            tasks={grouped.tomorrow}
            onComplete={handleComplete}
            onDelete={handleDelete}
          />

          {/* Upcoming */}
          <TaskSection
            title="Próximas"
            icon={Calendar}
            iconColor="text-primary-400"
            tasks={grouped.upcoming}
            defaultOpen={false}
            onComplete={handleComplete}
            onDelete={handleDelete}
          />

          {/* Completed */}
          {statusFilter === 'completed' && (
            <TaskSection
              title="Concluídas"
              icon={CheckCircle}
              iconColor="text-success-400"
              tasks={grouped.completed}
              defaultOpen={false}
              onComplete={handleComplete}
              onDelete={handleDelete}
            />
          )}
        </div>
      )}

      {/* Create Modal */}
      <CreateTaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreate}
      />
    </div>
  )
}
