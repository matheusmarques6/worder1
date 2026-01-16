// =============================================
// Hook: useQueue
// Gerencia fila de atendimento
// =============================================

'use client'

import { useState, useCallback, useEffect } from 'react'

export interface QueueItem {
  id: string
  organization_id: string
  conversation_id: string
  contact_id?: string
  contact_name?: string
  contact_phone?: string
  instance_id?: string
  position?: number
  entered_at: string
  assigned_at?: string
  assigned_to?: string
  assigned_to_name?: string
  priority: number
  priority_reason?: string
  status: 'waiting' | 'assigned' | 'timeout' | 'cancelled'
  last_message_preview?: string
  wait_time_seconds?: number
  metadata?: Record<string, any>
  created_at: string
}

export interface QueueAgent {
  id: string
  organization_id: string
  user_id: string
  status: 'online' | 'busy' | 'away' | 'offline'
  status_message?: string
  current_conversations: number
  max_conversations: number
  last_activity_at: string
  went_online_at?: string
  skills?: string[]
  last_assigned_at?: string
  assignments_today: number
  completed_today: number
  on_break: boolean
  break_started_at?: string
  break_reason?: string
  profile?: {
    id: string
    full_name?: string
    email?: string
    avatar_url?: string
  }
}

export interface QueueSettings {
  id: string
  organization_id: string
  distribution_method: 'round_robin' | 'least_busy' | 'skill_based' | 'manual'
  max_conversations_per_agent: number
  max_wait_time_minutes: number
  business_hours: Record<string, any>
  out_of_hours_message: string
  queue_full_message: string
  welcome_message: string
  auto_assign_enabled: boolean
  notify_on_new_conversation: boolean
}

export interface QueueStats {
  waiting_count: number
  assigned_count: number
  online_agents: number
  busy_agents: number
  offline_agents: number
  avg_wait_time_seconds: number
  max_wait_time_seconds: number
}

export interface AgentMetrics {
  total: number
  online: number
  busy: number
  away: number
  offline: number
  on_break: number
  total_conversations: number
  available_capacity: number
}

interface UseQueueOptions {
  organizationId: string
  autoLoad?: boolean
  refreshInterval?: number
}

interface UseQueueReturn {
  items: QueueItem[]
  agents: QueueAgent[]
  settings: QueueSettings | null
  stats: QueueStats | null
  agentMetrics: AgentMetrics | null
  isLoading: boolean
  error: string | null
  loadQueue: () => Promise<void>
  loadAgents: () => Promise<void>
  loadSettings: () => Promise<void>
  updateSettings: (updates: Partial<QueueSettings>) => Promise<boolean>
  addToQueue: (conversationId: string, contactInfo?: any) => Promise<QueueItem | null>
  assignConversation: (queueItemId: string, agentId: string, agentName?: string) => Promise<boolean>
  triggerAutoAssign: () => Promise<boolean>
}

export function useQueue({
  organizationId,
  autoLoad = true,
  refreshInterval = 30000, // 30 segundos
}: UseQueueOptions): UseQueueReturn {
  const [items, setItems] = useState<QueueItem[]>([])
  const [agents, setAgents] = useState<QueueAgent[]>([])
  const [settings, setSettings] = useState<QueueSettings | null>(null)
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [agentMetrics, setAgentMetrics] = useState<AgentMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // =============================================
  // CARREGAR FILA
  // =============================================
  const loadQueue = useCallback(async () => {
    if (!organizationId) return

    try {
      const response = await fetch(
        `/api/queue/items?organization_id=${organizationId}&status=waiting`
      )
      const data = await response.json()

      if (!response.ok) throw new Error(data.error)

      setItems(data.items || [])
      setStats(data.stats || null)
    } catch (err: any) {
      console.error('[useQueue] Load items error:', err)
      setError(err.message)
    }
  }, [organizationId])

  // =============================================
  // CARREGAR AGENTES
  // =============================================
  const loadAgents = useCallback(async () => {
    if (!organizationId) return

    try {
      const response = await fetch(
        `/api/queue/agents?organization_id=${organizationId}`
      )
      const data = await response.json()

      if (!response.ok) throw new Error(data.error)

      setAgents(data.agents || [])
      setAgentMetrics(data.metrics || null)
    } catch (err: any) {
      console.error('[useQueue] Load agents error:', err)
    }
  }, [organizationId])

  // =============================================
  // CARREGAR CONFIGURAÇÕES
  // =============================================
  const loadSettings = useCallback(async () => {
    if (!organizationId) return

    try {
      const response = await fetch(
        `/api/queue/settings?organization_id=${organizationId}`
      )
      const data = await response.json()

      if (!response.ok) throw new Error(data.error)

      setSettings(data.settings || null)
    } catch (err: any) {
      console.error('[useQueue] Load settings error:', err)
    }
  }, [organizationId])

  // =============================================
  // ATUALIZAR CONFIGURAÇÕES
  // =============================================
  const updateSettings = useCallback(async (updates: Partial<QueueSettings>): Promise<boolean> => {
    if (!organizationId) return false

    try {
      const response = await fetch('/api/queue/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          ...updates,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      setSettings(data.settings)
      return true
    } catch (err: any) {
      console.error('[useQueue] Update settings error:', err)
      setError(err.message)
      return false
    }
  }, [organizationId])

  // =============================================
  // ADICIONAR À FILA
  // =============================================
  const addToQueue = useCallback(async (
    conversationId: string,
    contactInfo?: { name?: string; phone?: string; id?: string }
  ): Promise<QueueItem | null> => {
    if (!organizationId) return null

    try {
      const response = await fetch('/api/queue/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          conversation_id: conversationId,
          contact_name: contactInfo?.name,
          contact_phone: contactInfo?.phone,
          contact_id: contactInfo?.id,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      await loadQueue()
      return data.item
    } catch (err: any) {
      console.error('[useQueue] Add to queue error:', err)
      setError(err.message)
      return null
    }
  }, [organizationId, loadQueue])

  // =============================================
  // ATRIBUIR CONVERSA
  // =============================================
  const assignConversation = useCallback(async (
    queueItemId: string,
    agentId: string,
    agentName?: string
  ): Promise<boolean> => {
    if (!organizationId) return false

    try {
      const response = await fetch('/api/queue/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          queue_item_id: queueItemId,
          agent_id: agentId,
          agent_name: agentName,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      await loadQueue()
      await loadAgents()
      return true
    } catch (err: any) {
      console.error('[useQueue] Assign error:', err)
      setError(err.message)
      return false
    }
  }, [organizationId, loadQueue, loadAgents])

  // =============================================
  // TRIGGER AUTO ASSIGN
  // =============================================
  const triggerAutoAssign = useCallback(async (): Promise<boolean> => {
    if (!organizationId) return false

    try {
      const response = await fetch('/api/queue/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          auto: true,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      await loadQueue()
      await loadAgents()
      return data.assigned
    } catch (err: any) {
      console.error('[useQueue] Auto assign error:', err)
      return false
    }
  }, [organizationId, loadQueue, loadAgents])

  // =============================================
  // AUTO LOAD E REFRESH
  // =============================================
  useEffect(() => {
    if (!autoLoad || !organizationId) return

    const loadAll = async () => {
      setIsLoading(true)
      await Promise.all([loadQueue(), loadAgents(), loadSettings()])
      setIsLoading(false)
    }

    loadAll()

    // Auto refresh
    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        loadQueue()
        loadAgents()
      }, refreshInterval)

      return () => clearInterval(interval)
    }
  }, [autoLoad, organizationId, loadQueue, loadAgents, loadSettings, refreshInterval])

  return {
    items,
    agents,
    settings,
    stats,
    agentMetrics,
    isLoading,
    error,
    loadQueue,
    loadAgents,
    loadSettings,
    updateSettings,
    addToQueue,
    assignConversation,
    triggerAutoAssign,
  }
}

export default useQueue
