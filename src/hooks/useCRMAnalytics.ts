'use client'

import { useState, useCallback, useEffect } from 'react'

// =============================================
// Types
// =============================================

export interface CRMSummary {
  total_deals: number
  total_value: number
  won_deals: number
  won_value: number
  lost_deals: number
  lost_value: number
  open_deals: number
  open_value: number
  conversion_rate: number | string
  avg_deal_value: number | string
}

export interface StageMetric {
  id: string
  name: string
  color: string
  position: number
  deals_count: number
  deals_value: number
  conversion_rate: number | string
  avg_time_seconds: number
  avg_time_formatted: string
}

export interface AgentMetric {
  id: string
  name: string
  email: string
  deals_count: number
  deals_value: number
  won_count: number
  won_value: number
  lost_count: number
  conversion_rate: number | string
}

export interface SourceMetric {
  source: string
  deals_count: number
  deals_value: number
  won_count: number
  won_value: number
  conversion_rate: number | string
}

export interface FunnelStage {
  stage: string
  color: string
  count: number
  value: number
  percentage: number | string
}

export interface TimelineData {
  date: string
  new_deals: number
  new_value: number
  won_deals: number
  won_value: number
  lost_deals: number
}

export interface CRMAnalyticsData {
  summary: CRMSummary
  stages: StageMetric[]
  agents: AgentMetric[]
  sources: SourceMetric[]
  funnel: FunnelStage[]
  timeline: TimelineData[]
  pipelines: any[]
  ltv: {
    average: number
    total_customers: number
  }
  period: {
    start: string
    end: string
    label: string
  }
}

interface UseCRMAnalyticsOptions {
  organizationId: string
  pipelineId?: string | null
  period?: '7d' | '30d' | '90d' | '1y'
  autoLoad?: boolean
}

interface UseCRMAnalyticsReturn {
  data: CRMAnalyticsData | null
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
  setPeriod: (period: '7d' | '30d' | '90d' | '1y') => void
  setPipelineId: (id: string | null) => void
}

// =============================================
// Hook
// =============================================

export function useCRMAnalytics({
  organizationId,
  pipelineId: initialPipelineId = null,
  period: initialPeriod = '30d',
  autoLoad = true,
}: UseCRMAnalyticsOptions): UseCRMAnalyticsReturn {
  const [data, setData] = useState<CRMAnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | '1y'>(initialPeriod)
  const [pipelineId, setPipelineId] = useState<string | null>(initialPipelineId)

  const fetchAnalytics = useCallback(async () => {
    if (!organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        period,
      })

      if (pipelineId) {
        params.append('pipeline_id', pipelineId)
      }

      const response = await fetch(`/api/crm/analytics?${params}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao carregar analytics')
      }

      setData(result)
    } catch (err: any) {
      console.error('[useCRMAnalytics] Error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, period, pipelineId])

  // Auto load
  useEffect(() => {
    if (autoLoad && organizationId) {
      fetchAnalytics()
    }
  }, [autoLoad, organizationId, period, pipelineId, fetchAnalytics])

  return {
    data,
    isLoading,
    error,
    refresh: fetchAnalytics,
    setPeriod,
    setPipelineId,
  }
}

export default useCRMAnalytics
