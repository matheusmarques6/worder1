'use client'

import { useState, useCallback, useEffect } from 'react'

// =============================================
// Types
// =============================================

export interface EscalationRule {
  level: number
  after_minutes: number
  notify_emails: string[]
  notify_slack?: boolean
  auto_assign_to?: string
}

export interface PriorityMultipliers {
  low: number
  normal: number
  high: number
  urgent: number
}

export interface SLAConfig {
  id: string
  organization_id: string
  store_id?: string
  name: string
  description?: string
  first_response_minutes: number
  resolution_minutes: number
  business_hours_only: boolean
  business_hours_start: string
  business_hours_end: string
  business_days: number[]
  priority_multipliers: PriorityMultipliers
  escalation_rules: EscalationRule[]
  is_active: boolean
  created_at: string
  updated_at: string
  // Stats from API
  total_tracked?: number
  compliance_rate?: number
}

export interface SLAMetric {
  id: string
  organization_id: string
  sla_config_id: string
  conversation_id: string
  contact_id?: string
  assigned_to?: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  first_response_target: string
  first_response_actual?: string
  first_response_breached: boolean
  resolution_target: string
  resolution_actual?: string
  resolution_breached: boolean
  escalation_level: number
  status: 'pending' | 'in_progress' | 'resolved' | 'breached'
  created_at: string
  updated_at: string
  profiles?: {
    id: string
    email: string
    full_name: string
  }
  contacts?: {
    id: string
    first_name: string
    last_name: string
  }
}

export interface SLAStats {
  total_conversations: number
  within_sla: number
  breached_first_response: number
  breached_resolution: number
  average_first_response_minutes: number
  average_resolution_minutes: number
  sla_compliance_rate: number
}

export interface CreateConfigParams {
  name: string
  description?: string
  first_response_minutes?: number
  resolution_minutes?: number
  business_hours_only?: boolean
  business_hours_start?: string
  business_hours_end?: string
  business_days?: number[]
  priority_multipliers?: PriorityMultipliers
  escalation_rules?: EscalationRule[]
}

export interface TrackConversationParams {
  sla_config_id: string
  conversation_id: string
  contact_id?: string
  assigned_to?: string
  priority?: 'low' | 'normal' | 'high' | 'urgent'
}

interface UseSLAOptions {
  organizationId: string
  storeId?: string | null
  autoLoad?: boolean
}

interface UseSLAReturn {
  configs: SLAConfig[]
  selectedConfig: SLAConfig | null
  metrics: SLAMetric[]
  stats: SLAStats | null
  isLoading: boolean
  error: string | null
  loadConfigs: () => Promise<void>
  loadConfig: (id: string, period?: string) => Promise<void>
  createConfig: (params: CreateConfigParams) => Promise<SLAConfig | null>
  updateConfig: (id: string, updates: Partial<SLAConfig>) => Promise<boolean>
  deleteConfig: (id: string) => Promise<boolean>
  trackConversation: (params: TrackConversationParams) => Promise<SLAMetric | null>
  recordFirstResponse: (metricId: string) => Promise<boolean>
  recordResolution: (metricId: string) => Promise<boolean>
  escalate: (metricId: string) => Promise<boolean>
  checkBreaches: () => Promise<{ first_response: number; resolution: number }>
  getTimeRemaining: (target: string) => { minutes: number; isBreached: boolean }
}

// =============================================
// Hook
// =============================================

export function useSLA({
  organizationId,
  storeId,
  autoLoad = true,
}: UseSLAOptions): UseSLAReturn {
  const [configs, setConfigs] = useState<SLAConfig[]>([])
  const [selectedConfig, setSelectedConfig] = useState<SLAConfig | null>(null)
  const [metrics, setMetrics] = useState<SLAMetric[]>([])
  const [stats, setStats] = useState<SLAStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // =============================================
  // Load All Configs
  // =============================================
  const loadConfigs = useCallback(async () => {
    if (!organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ organization_id: organizationId })

      const response = await fetch(`/api/sla?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar configuracoes')
      }

      setConfigs(data.configs || [])
    } catch (err: any) {
      console.error('[useSLA] Load error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId])

  // =============================================
  // Load Single Config with Metrics
  // =============================================
  const loadConfig = useCallback(async (id: string, period = '7d') => {
    if (!organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        config_id: id,
        include_metrics: 'true',
        period,
      })

      const response = await fetch(`/api/sla?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar configuracao')
      }

      setSelectedConfig(data.config)
      setMetrics(data.metrics || [])
      setStats(data.stats)
    } catch (err: any) {
      console.error('[useSLA] Load config error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId])

  // =============================================
  // Create Config
  // =============================================
  const createConfig = useCallback(async (params: CreateConfigParams): Promise<SLAConfig | null> => {
    if (!organizationId) {
      setError('Organizacao nao definida')
      return null
    }

    setError(null)

    try {
      const response = await fetch('/api/sla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          store_id: storeId,
          ...params,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar configuracao')
      }

      await loadConfigs()
      return data.config
    } catch (err: any) {
      console.error('[useSLA] Create error:', err)
      setError(err.message)
      return null
    }
  }, [organizationId, storeId, loadConfigs])

  // =============================================
  // Update Config
  // =============================================
  const updateConfig = useCallback(async (id: string, updates: Partial<SLAConfig>): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch('/api/sla', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atualizar configuracao')
      }

      setConfigs(prev => prev.map(c => (c.id === id ? { ...c, ...data.config } : c)))

      if (selectedConfig?.id === id) {
        setSelectedConfig(prev => prev ? { ...prev, ...data.config } : null)
      }

      return true
    } catch (err: any) {
      console.error('[useSLA] Update error:', err)
      setError(err.message)
      return false
    }
  }, [selectedConfig])

  // =============================================
  // Delete Config
  // =============================================
  const deleteConfig = useCallback(async (id: string): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch(`/api/sla?id=${id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao excluir configuracao')
      }

      setConfigs(prev => prev.filter(c => c.id !== id))

      if (selectedConfig?.id === id) {
        setSelectedConfig(null)
        setMetrics([])
        setStats(null)
      }

      return true
    } catch (err: any) {
      console.error('[useSLA] Delete error:', err)
      setError(err.message)
      return false
    }
  }, [selectedConfig])

  // =============================================
  // Track Conversation
  // =============================================
  const trackConversation = useCallback(async (params: TrackConversationParams): Promise<SLAMetric | null> => {
    if (!organizationId) {
      setError('Organizacao nao definida')
      return null
    }

    setError(null)

    try {
      const response = await fetch('/api/sla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'track',
          organization_id: organizationId,
          ...params,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao iniciar rastreamento')
      }

      return data.metric
    } catch (err: any) {
      console.error('[useSLA] Track error:', err)
      setError(err.message)
      return null
    }
  }, [organizationId])

  // =============================================
  // Record First Response
  // =============================================
  const recordFirstResponse = useCallback(async (metricId: string): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch('/api/sla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_metric',
          metric_id: metricId,
          event: 'first_response',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao registrar resposta')
      }

      // Update local metrics
      setMetrics(prev => prev.map(m =>
        m.id === metricId ? { ...m, ...data.metric } : m
      ))

      return true
    } catch (err: any) {
      console.error('[useSLA] First response error:', err)
      setError(err.message)
      return false
    }
  }, [])

  // =============================================
  // Record Resolution
  // =============================================
  const recordResolution = useCallback(async (metricId: string): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch('/api/sla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_metric',
          metric_id: metricId,
          event: 'resolved',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao registrar resolucao')
      }

      // Update local metrics
      setMetrics(prev => prev.map(m =>
        m.id === metricId ? { ...m, ...data.metric } : m
      ))

      return true
    } catch (err: any) {
      console.error('[useSLA] Resolution error:', err)
      setError(err.message)
      return false
    }
  }, [])

  // =============================================
  // Escalate
  // =============================================
  const escalate = useCallback(async (metricId: string): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch('/api/sla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_metric',
          metric_id: metricId,
          event: 'escalate',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao escalar')
      }

      // Update local metrics
      setMetrics(prev => prev.map(m =>
        m.id === metricId ? { ...m, ...data.metric } : m
      ))

      return true
    } catch (err: any) {
      console.error('[useSLA] Escalate error:', err)
      setError(err.message)
      return false
    }
  }, [])

  // =============================================
  // Check Breaches
  // =============================================
  const checkBreaches = useCallback(async (): Promise<{ first_response: number; resolution: number }> => {
    if (!organizationId) {
      return { first_response: 0, resolution: 0 }
    }

    try {
      const response = await fetch('/api/sla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'check_breaches',
          organization_id: organizationId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error)
      }

      // Reload configs to update stats
      await loadConfigs()

      return {
        first_response: data.first_response_breaches || 0,
        resolution: data.resolution_breaches || 0,
      }
    } catch (err: any) {
      console.error('[useSLA] Check breaches error:', err)
      return { first_response: 0, resolution: 0 }
    }
  }, [organizationId, loadConfigs])

  // =============================================
  // Get Time Remaining
  // =============================================
  const getTimeRemaining = useCallback((target: string): { minutes: number; isBreached: boolean } => {
    const now = new Date().getTime()
    const targetTime = new Date(target).getTime()
    const diffMinutes = Math.round((targetTime - now) / (1000 * 60))

    return {
      minutes: diffMinutes,
      isBreached: diffMinutes < 0,
    }
  }, [])

  // =============================================
  // Auto Load
  // =============================================
  useEffect(() => {
    if (autoLoad && organizationId) {
      loadConfigs()
    }
  }, [autoLoad, organizationId, loadConfigs])

  return {
    configs,
    selectedConfig,
    metrics,
    stats,
    isLoading,
    error,
    loadConfigs,
    loadConfig,
    createConfig,
    updateConfig,
    deleteConfig,
    trackConversation,
    recordFirstResponse,
    recordResolution,
    escalate,
    checkBreaches,
    getTimeRemaining,
  }
}

export default useSLA
