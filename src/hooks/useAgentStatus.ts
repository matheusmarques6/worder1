// =============================================
// Hook: useAgentStatus
// Gerencia status do agente logado
// =============================================

'use client'

import { useState, useCallback, useEffect } from 'react'

export interface AgentStatus {
  id: string
  organization_id: string
  user_id: string
  status: 'online' | 'busy' | 'away' | 'offline'
  status_message?: string
  current_conversations: number
  max_conversations: number
  last_activity_at: string
  went_online_at?: string
  went_offline_at?: string
  skills?: string[]
  last_assigned_at?: string
  assignments_today: number
  completed_today: number
  on_break: boolean
  break_started_at?: string
  break_reason?: string
}

interface UseAgentStatusOptions {
  organizationId: string
  userId: string
  autoLoad?: boolean
  heartbeatInterval?: number // Intervalo para atualizar atividade
}

interface UseAgentStatusReturn {
  status: AgentStatus | null
  isLoading: boolean
  error: string | null
  loadStatus: () => Promise<void>
  goOnline: () => Promise<boolean>
  goOffline: () => Promise<boolean>
  goBusy: () => Promise<boolean>
  goAway: (message?: string) => Promise<boolean>
  toggleBreak: (reason?: string) => Promise<boolean>
  updateMaxConversations: (max: number) => Promise<boolean>
  decrementConversations: () => Promise<boolean>
}

export function useAgentStatus({
  organizationId,
  userId,
  autoLoad = true,
  heartbeatInterval = 60000, // 1 minuto
}: UseAgentStatusOptions): UseAgentStatusReturn {
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // =============================================
  // CARREGAR STATUS
  // =============================================
  const loadStatus = useCallback(async () => {
    if (!organizationId || !userId) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/agents/status?organization_id=${organizationId}&user_id=${userId}`
      )
      const data = await response.json()

      if (!response.ok) throw new Error(data.error)

      setStatus(data.status)
    } catch (err: any) {
      console.error('[useAgentStatus] Load error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, userId])

  // =============================================
  // ATUALIZAR STATUS
  // =============================================
  const updateStatus = useCallback(async (updates: Partial<AgentStatus>): Promise<boolean> => {
    if (!organizationId || !userId) return false

    try {
      const response = await fetch('/api/agents/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          user_id: userId,
          ...updates,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      setStatus(data.status)
      return true
    } catch (err: any) {
      console.error('[useAgentStatus] Update error:', err)
      setError(err.message)
      return false
    }
  }, [organizationId, userId])

  // =============================================
  // AÇÕES RÁPIDAS
  // =============================================
  const goOnline = useCallback(async () => {
    return updateStatus({ status: 'online', on_break: false })
  }, [updateStatus])

  const goOffline = useCallback(async () => {
    return updateStatus({ status: 'offline', on_break: false })
  }, [updateStatus])

  const goBusy = useCallback(async () => {
    return updateStatus({ status: 'busy' })
  }, [updateStatus])

  const goAway = useCallback(async (message?: string) => {
    return updateStatus({ status: 'away', status_message: message })
  }, [updateStatus])

  const toggleBreak = useCallback(async (reason?: string) => {
    if (!status) return false
    return updateStatus({
      on_break: !status.on_break,
      break_reason: !status.on_break ? reason : undefined,
    })
  }, [status, updateStatus])

  const updateMaxConversations = useCallback(async (max: number) => {
    return updateStatus({ max_conversations: max })
  }, [updateStatus])

  const decrementConversations = useCallback(async () => {
    if (!status || status.current_conversations <= 0) return false
    
    try {
      const response = await fetch('/api/agents/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          user_id: userId,
          current_conversations: Math.max(0, status.current_conversations - 1),
          completed_today: (status.completed_today || 0) + 1,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      setStatus(data.status)
      return true
    } catch (err: any) {
      console.error('[useAgentStatus] Decrement error:', err)
      return false
    }
  }, [organizationId, userId, status])

  // =============================================
  // AUTO LOAD E HEARTBEAT
  // =============================================
  useEffect(() => {
    if (autoLoad && organizationId && userId) {
      loadStatus()
    }
  }, [autoLoad, organizationId, userId, loadStatus])

  // Heartbeat para manter atividade
  useEffect(() => {
    if (!heartbeatInterval || !organizationId || !userId || !status?.status || status.status === 'offline') {
      return
    }

    const interval = setInterval(async () => {
      // Apenas atualizar last_activity_at
      try {
        await fetch('/api/agents/status', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organization_id: organizationId,
            user_id: userId,
          }),
        })
      } catch (err) {
        // Silenciar erros de heartbeat
      }
    }, heartbeatInterval)

    return () => clearInterval(interval)
  }, [heartbeatInterval, organizationId, userId, status?.status])

  return {
    status,
    isLoading,
    error,
    loadStatus,
    goOnline,
    goOffline,
    goBusy,
    goAway,
    toggleBreak,
    updateMaxConversations,
    decrementConversations,
  }
}

export default useAgentStatus
