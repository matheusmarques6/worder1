'use client'

import { useState, useCallback, useEffect } from 'react'

// =============================================
// Types
// =============================================

export interface StageTimeStats {
  stage_id: string
  stage_name: string
  average_time_minutes: number
  min_time_minutes: number
  max_time_minutes: number
  deals_count: number
  current_deals: number
  total_time_minutes: number
}

export interface StageTimeSummary {
  total_stages: number
  average_cycle_minutes: number
  slowest_stage: string
  fastest_stage: string
}

export interface DealStageHistory {
  stage_name: string
  time_minutes: number
  entered_at: string
  left_at?: string
}

export interface DealTimeData {
  deal_id: string
  deal_title: string
  current_stage: string
  time_in_current_stage_minutes: number
  total_time_minutes: number
  stage_history: DealStageHistory[]
}

export interface StageHistoryEntry {
  id: string
  deal_id: string
  organization_id: string
  from_stage_id?: string
  to_stage_id: string
  changed_by?: string
  time_in_previous_stage_minutes?: number
  created_at: string
  from_stage?: {
    id: string
    name: string
  }
  to_stage?: {
    id: string
    name: string
  }
  profiles?: {
    id: string
    email: string
    full_name: string
  }
  deals?: {
    id: string
    title: string
  }
}

interface UseDealTimeTrackingOptions {
  organizationId: string
  pipelineId?: string | null
  autoLoad?: boolean
}

interface UseDealTimeTrackingReturn {
  stats: StageTimeStats[]
  summary: StageTimeSummary | null
  history: StageHistoryEntry[]
  isLoading: boolean
  error: string | null
  loadStats: () => Promise<void>
  loadHistory: () => Promise<void>
  getDealTimeData: (dealId: string) => Promise<DealTimeData | null>
  recordStageChange: (
    dealId: string,
    fromStageId: string | null,
    toStageId: string,
    changedBy?: string
  ) => Promise<{ history: StageHistoryEntry; time_in_previous_stage: number | null } | null>
  formatTime: (minutes: number) => string
  formatTimeShort: (minutes: number) => string
}

// =============================================
// Hook
// =============================================

export function useDealTimeTracking({
  organizationId,
  pipelineId,
  autoLoad = true,
}: UseDealTimeTrackingOptions): UseDealTimeTrackingReturn {
  const [stats, setStats] = useState<StageTimeStats[]>([])
  const [summary, setSummary] = useState<StageTimeSummary | null>(null)
  const [history, setHistory] = useState<StageHistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // =============================================
  // Load Stats
  // =============================================
  const loadStats = useCallback(async () => {
    if (!organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        type: 'stats',
      })

      if (pipelineId) {
        params.append('pipeline_id', pipelineId)
      }

      const response = await fetch(`/api/deal-time-tracking?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar estatisticas')
      }

      setStats(data.stats || [])
      setSummary(data.summary || null)
    } catch (err: any) {
      console.error('[useDealTimeTracking] Load stats error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, pipelineId])

  // =============================================
  // Load History
  // =============================================
  const loadHistory = useCallback(async () => {
    if (!organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        type: 'history',
      })

      if (pipelineId) {
        params.append('pipeline_id', pipelineId)
      }

      const response = await fetch(`/api/deal-time-tracking?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar historico')
      }

      setHistory(data.history || [])
    } catch (err: any) {
      console.error('[useDealTimeTracking] Load history error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, pipelineId])

  // =============================================
  // Get Deal Time Data
  // =============================================
  const getDealTimeData = useCallback(async (dealId: string): Promise<DealTimeData | null> => {
    if (!organizationId) {
      setError('Organizacao nao definida')
      return null
    }

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        deal_id: dealId,
        type: 'deal',
      })

      const response = await fetch(`/api/deal-time-tracking?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar dados do deal')
      }

      return data.deal
    } catch (err: any) {
      console.error('[useDealTimeTracking] Get deal data error:', err)
      setError(err.message)
      return null
    }
  }, [organizationId])

  // =============================================
  // Record Stage Change
  // =============================================
  const recordStageChange = useCallback(async (
    dealId: string,
    fromStageId: string | null,
    toStageId: string,
    changedBy?: string
  ): Promise<{ history: StageHistoryEntry; time_in_previous_stage: number | null } | null> => {
    if (!organizationId) {
      setError('Organizacao nao definida')
      return null
    }

    setError(null)

    try {
      const response = await fetch('/api/deal-time-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deal_id: dealId,
          organization_id: organizationId,
          from_stage_id: fromStageId,
          to_stage_id: toStageId,
          changed_by: changedBy,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao registrar mudanca')
      }

      // Update history
      setHistory(prev => [data.history, ...prev])

      return {
        history: data.history,
        time_in_previous_stage: data.time_in_previous_stage,
      }
    } catch (err: any) {
      console.error('[useDealTimeTracking] Record change error:', err)
      setError(err.message)
      return null
    }
  }, [organizationId])

  // =============================================
  // Format Time
  // =============================================
  const formatTime = useCallback((minutes: number): string => {
    if (minutes < 60) {
      return `${minutes} minuto${minutes !== 1 ? 's' : ''}`
    }

    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60

    if (hours < 24) {
      return mins > 0
        ? `${hours} hora${hours !== 1 ? 's' : ''} e ${mins} minuto${mins !== 1 ? 's' : ''}`
        : `${hours} hora${hours !== 1 ? 's' : ''}`
    }

    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24

    if (days < 7) {
      return remainingHours > 0
        ? `${days} dia${days !== 1 ? 's' : ''} e ${remainingHours}h`
        : `${days} dia${days !== 1 ? 's' : ''}`
    }

    const weeks = Math.floor(days / 7)
    const remainingDays = days % 7

    return remainingDays > 0
      ? `${weeks} semana${weeks !== 1 ? 's' : ''} e ${remainingDays} dia${remainingDays !== 1 ? 's' : ''}`
      : `${weeks} semana${weeks !== 1 ? 's' : ''}`
  }, [])

  const formatTimeShort = useCallback((minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}min`
    }

    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60

    if (hours < 24) {
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
    }

    const days = Math.floor(hours / 24)
    const remainingHours = hours % 24

    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
  }, [])

  // =============================================
  // Auto Load
  // =============================================
  useEffect(() => {
    if (autoLoad && organizationId) {
      loadStats()
    }
  }, [autoLoad, organizationId, pipelineId, loadStats])

  return {
    stats,
    summary,
    history,
    isLoading,
    error,
    loadStats,
    loadHistory,
    getDealTimeData,
    recordStageChange,
    formatTime,
    formatTimeShort,
  }
}

export default useDealTimeTracking
