// =============================================
// Hook: useTasks
// Gerencia tarefas
// =============================================

'use client'

import { useState, useCallback, useEffect } from 'react'

export interface Task {
  id: string
  organization_id: string
  store_id?: string
  contact_id?: string
  deal_id?: string
  conversation_id?: string
  ticket_id?: string
  title: string
  description?: string
  type: 'call' | 'email' | 'whatsapp' | 'meeting' | 'task' | 'followup' | 'payment'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  due_date: string
  due_time?: string
  all_day: boolean
  reminder_at?: string
  reminder_sent: boolean
  assigned_to?: string
  assigned_to_name?: string
  created_by?: string
  created_by_name?: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  completed_at?: string
  completed_by?: string
  completed_by_name?: string
  outcome?: string
  outcome_type?: string
  tags?: string[]
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
  // Joins
  contact?: {
    id: string
    name?: string
    phone_number: string
    profile_picture_url?: string
  }
  deal?: {
    id: string
    title: string
    value: number
    status: string
  }
}

export interface TaskStats {
  total: number
  pending: number
  in_progress: number
  completed: number
  cancelled: number
  overdue: number
  due_today: number
  due_tomorrow: number
  due_this_week: number
}

export interface TaskFilters {
  status?: string
  assignedTo?: string
  contactId?: string
  dealId?: string
  type?: string
  priority?: string
  dueDateStart?: string
  dueDateEnd?: string
  overdue?: boolean
}

export interface CreateTaskParams {
  title: string
  description?: string
  type?: string
  priority?: string
  due_date: string
  due_time?: string
  all_day?: boolean
  reminder_at?: string
  assigned_to?: string
  assigned_to_name?: string
  contact_id?: string
  deal_id?: string
  conversation_id?: string
  ticket_id?: string
  tags?: string[]
  metadata?: Record<string, any>
}

interface UseTasksOptions {
  organizationId: string
  filters?: TaskFilters
  autoLoad?: boolean
  limit?: number
}

interface GroupedTasks {
  overdue: Task[]
  today: Task[]
  tomorrow: Task[]
  upcoming: Task[]
  completed: Task[]
}

interface UseTasksReturn {
  tasks: Task[]
  grouped: GroupedTasks
  stats: TaskStats | null
  isLoading: boolean
  error: string | null
  loadTasks: () => Promise<void>
  loadStats: () => Promise<void>
  createTask: (params: CreateTaskParams) => Promise<Task | null>
  updateTask: (id: string, updates: Partial<Task>) => Promise<boolean>
  completeTask: (id: string, outcome?: string, outcomeType?: string) => Promise<boolean>
  deleteTask: (id: string) => Promise<boolean>
}

export function useTasks({
  organizationId,
  filters = {},
  autoLoad = true,
  limit = 100,
}: UseTasksOptions): UseTasksReturn {
  const [tasks, setTasks] = useState<Task[]>([])
  const [grouped, setGrouped] = useState<GroupedTasks>({
    overdue: [],
    today: [],
    tomorrow: [],
    upcoming: [],
    completed: [],
  })
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // =============================================
  // CARREGAR TAREFAS
  // =============================================
  const loadTasks = useCallback(async () => {
    if (!organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        limit: limit.toString(),
      })

      if (filters.status) params.append('status', filters.status)
      if (filters.assignedTo) params.append('assigned_to', filters.assignedTo)
      if (filters.contactId) params.append('contact_id', filters.contactId)
      if (filters.dealId) params.append('deal_id', filters.dealId)
      if (filters.type) params.append('type', filters.type)
      if (filters.priority) params.append('priority', filters.priority)
      if (filters.dueDateStart) params.append('due_date_start', filters.dueDateStart)
      if (filters.dueDateEnd) params.append('due_date_end', filters.dueDateEnd)
      if (filters.overdue) params.append('overdue', 'true')

      const response = await fetch(`/api/tasks?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar tarefas')
      }

      setTasks(data.tasks || [])
      setGrouped(data.grouped || { overdue: [], today: [], tomorrow: [], upcoming: [], completed: [] })
    } catch (err: any) {
      console.error('[useTasks] Load error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, filters, limit])

  // =============================================
  // CARREGAR ESTATÍSTICAS
  // =============================================
  const loadStats = useCallback(async () => {
    if (!organizationId) return

    try {
      const params = new URLSearchParams({ organization_id: organizationId })
      if (filters.assignedTo) params.append('assigned_to', filters.assignedTo)

      const response = await fetch(`/api/tasks/stats?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar estatísticas')
      }

      setStats(data.stats)
    } catch (err: any) {
      console.error('[useTasks] Stats error:', err)
    }
  }, [organizationId, filters.assignedTo])

  // =============================================
  // CRIAR TAREFA
  // =============================================
  const createTask = useCallback(async (params: CreateTaskParams): Promise<Task | null> => {
    if (!organizationId) {
      setError('Organização não definida')
      return null
    }

    setError(null)

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          ...params,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar tarefa')
      }

      // Recarregar lista
      await loadTasks()
      await loadStats()

      return data.task
    } catch (err: any) {
      console.error('[useTasks] Create error:', err)
      setError(err.message)
      return null
    }
  }, [organizationId, loadTasks, loadStats])

  // =============================================
  // ATUALIZAR TAREFA
  // =============================================
  const updateTask = useCallback(async (id: string, updates: Partial<Task>): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atualizar tarefa')
      }

      // Atualizar estado local
      setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...data.task } : t)))
      await loadStats()

      return true
    } catch (err: any) {
      console.error('[useTasks] Update error:', err)
      setError(err.message)
      return false
    }
  }, [loadStats])

  // =============================================
  // COMPLETAR TAREFA
  // =============================================
  const completeTask = useCallback(async (
    id: string,
    outcome?: string,
    outcomeType?: string
  ): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch(`/api/tasks/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, outcome_type: outcomeType }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao completar tarefa')
      }

      // Recarregar
      await loadTasks()
      await loadStats()

      return true
    } catch (err: any) {
      console.error('[useTasks] Complete error:', err)
      setError(err.message)
      return false
    }
  }, [loadTasks, loadStats])

  // =============================================
  // DELETAR TAREFA
  // =============================================
  const deleteTask = useCallback(async (id: string): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao remover tarefa')
      }

      // Remover do estado local
      setTasks(prev => prev.filter(t => t.id !== id))
      await loadStats()

      return true
    } catch (err: any) {
      console.error('[useTasks] Delete error:', err)
      setError(err.message)
      return false
    }
  }, [loadStats])

  // =============================================
  // AUTO LOAD
  // =============================================
  useEffect(() => {
    if (autoLoad && organizationId) {
      loadTasks()
      loadStats()
    }
  }, [autoLoad, organizationId, loadTasks, loadStats])

  return {
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
  }
}

export default useTasks
