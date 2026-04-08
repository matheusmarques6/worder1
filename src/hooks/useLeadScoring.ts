'use client'

import { useState, useCallback, useEffect } from 'react'

// =============================================
// Types
// =============================================

export interface ScoringFactors {
  email_opens: number
  email_clicks: number
  website_visits: number
  form_submissions: number
  meeting_scheduled: boolean
  proposal_requested: boolean
  pricing_viewed: boolean
  demo_requested: boolean
  response_time_minutes: number
  messages_sent: number
  messages_received: number
  days_since_last_contact: number
  deal_value: number
  company_size?: string
  industry_match?: boolean
  budget_confirmed?: boolean
}

export interface IntentSignal {
  type: string
  description: string
  weight: number
  detected_at: string
}

export interface LeadScore {
  id: string
  organization_id: string
  deal_id: string
  engagement_score: number
  fit_score: number
  intent_score: number
  total_score: number
  scoring_factors: ScoringFactors
  intent_signals: IntentSignal[]
  last_activity_at: string
  score_updated_at: string
  created_at: string
  deals?: {
    id: string
    title: string
    value: number
    status: string
    stage_id: string
    contact_id: string
    contacts?: {
      id: string
      first_name: string
      last_name: string
      email: string
    }
  }
}

export interface ScoringConfig {
  weights: {
    engagement: number
    fit: number
    intent: number
  }
  thresholds: {
    hot: number
    warm: number
    cold: number
  }
}

export interface ScoringStats {
  total: number
  hot: number
  warm: number
  cold: number
  average: number
}

interface UseLeadScoringOptions {
  organizationId: string
  autoLoad?: boolean
  category?: 'all' | 'hot' | 'warm' | 'cold'
}

interface UseLeadScoringReturn {
  scores: LeadScore[]
  stats: ScoringStats
  config: ScoringConfig | null
  isLoading: boolean
  error: string | null
  loadScores: () => Promise<void>
  getScore: (dealId: string) => Promise<LeadScore | null>
  calculateScore: (dealId: string) => Promise<LeadScore | null>
  bulkCalculate: (dealIds?: string[]) => Promise<{ processed: number; failed: number }>
  detectIntent: (dealId: string, content: string) => Promise<IntentSignal[]>
  addSignal: (dealId: string, signal: Partial<IntentSignal>) => Promise<boolean>
  getScoreLabel: (score: number) => 'hot' | 'warm' | 'cold'
  getScoreColor: (score: number) => string
}

// =============================================
// Hook
// =============================================

export function useLeadScoring({
  organizationId,
  autoLoad = true,
  category = 'all',
}: UseLeadScoringOptions): UseLeadScoringReturn {
  const [scores, setScores] = useState<LeadScore[]>([])
  const [stats, setStats] = useState<ScoringStats>({
    total: 0,
    hot: 0,
    warm: 0,
    cold: 0,
    average: 0,
  })
  const [config, setConfig] = useState<ScoringConfig | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // =============================================
  // Load All Scores
  // =============================================
  const loadScores = useCallback(async () => {
    if (!organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ organization_id: organizationId })

      if (category !== 'all') {
        params.append('category', category)
      }

      const response = await fetch(`/api/lead-scoring?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar scores')
      }

      setScores(data.scores || [])
      setStats(data.stats || { total: 0, hot: 0, warm: 0, cold: 0, average: 0 })
      setConfig(data.config || null)
    } catch (err: any) {
      console.error('[useLeadScoring] Load error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, category])

  // =============================================
  // Get Single Score
  // =============================================
  const getScore = useCallback(async (dealId: string): Promise<LeadScore | null> => {
    if (!organizationId) {
      setError('Organizacao nao definida')
      return null
    }

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        deal_id: dealId,
      })

      const response = await fetch(`/api/lead-scoring?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao buscar score')
      }

      return data.score
    } catch (err: any) {
      console.error('[useLeadScoring] Get score error:', err)
      setError(err.message)
      return null
    }
  }, [organizationId])

  // =============================================
  // Calculate Score for a Deal
  // =============================================
  const calculateScore = useCallback(async (dealId: string): Promise<LeadScore | null> => {
    if (!organizationId) {
      setError('Organizacao nao definida')
      return null
    }

    setError(null)

    try {
      const response = await fetch('/api/lead-scoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'calculate',
          deal_id: dealId,
          organization_id: organizationId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao calcular score')
      }

      // Update local state
      setScores(prev => {
        const index = prev.findIndex(s => s.deal_id === dealId)
        if (index >= 0) {
          const updated = [...prev]
          updated[index] = data.score
          return updated
        }
        return [data.score, ...prev]
      })

      return data.score
    } catch (err: any) {
      console.error('[useLeadScoring] Calculate error:', err)
      setError(err.message)
      return null
    }
  }, [organizationId])

  // =============================================
  // Bulk Calculate Scores
  // =============================================
  const bulkCalculate = useCallback(async (
    dealIds?: string[]
  ): Promise<{ processed: number; failed: number }> => {
    if (!organizationId) {
      setError('Organizacao nao definida')
      return { processed: 0, failed: 0 }
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/lead-scoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_calculate',
          organization_id: organizationId,
          deal_ids: dealIds,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao calcular scores em lote')
      }

      // Reload scores after bulk calculation
      await loadScores()

      return {
        processed: data.processed || 0,
        failed: data.failed || 0,
      }
    } catch (err: any) {
      console.error('[useLeadScoring] Bulk calculate error:', err)
      setError(err.message)
      return { processed: 0, failed: 0 }
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, loadScores])

  // =============================================
  // Detect Intent from Content
  // =============================================
  const detectIntent = useCallback(async (
    dealId: string,
    content: string
  ): Promise<IntentSignal[]> => {
    if (!organizationId || !content.trim()) {
      return []
    }

    try {
      const response = await fetch('/api/lead-scoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'detect_intent',
          deal_id: dealId,
          organization_id: organizationId,
          content,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao detectar intencao')
      }

      return data.signals || []
    } catch (err: any) {
      console.error('[useLeadScoring] Detect intent error:', err)
      return []
    }
  }, [organizationId])

  // =============================================
  // Add Intent Signal Manually
  // =============================================
  const addSignal = useCallback(async (
    dealId: string,
    signal: Partial<IntentSignal>
  ): Promise<boolean> => {
    if (!dealId || !signal.type) {
      setError('dealId e signal.type sao obrigatorios')
      return false
    }

    setError(null)

    try {
      const response = await fetch('/api/lead-scoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_signal',
          deal_id: dealId,
          signal,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao adicionar sinal')
      }

      return true
    } catch (err: any) {
      console.error('[useLeadScoring] Add signal error:', err)
      setError(err.message)
      return false
    }
  }, [])

  // =============================================
  // Helper: Get Score Label
  // =============================================
  const getScoreLabel = useCallback((score: number): 'hot' | 'warm' | 'cold' => {
    const thresholds = config?.thresholds || { hot: 80, warm: 50, cold: 0 }

    if (score >= thresholds.hot) return 'hot'
    if (score >= thresholds.warm) return 'warm'
    return 'cold'
  }, [config])

  // =============================================
  // Helper: Get Score Color
  // =============================================
  const getScoreColor = useCallback((score: number): string => {
    const label = getScoreLabel(score)

    switch (label) {
      case 'hot':
        return 'text-red-400'
      case 'warm':
        return 'text-orange-400'
      case 'cold':
        return 'text-blue-400'
      default:
        return 'text-slate-400'
    }
  }, [getScoreLabel])

  // =============================================
  // Auto Load
  // =============================================
  useEffect(() => {
    if (autoLoad && organizationId) {
      loadScores()
    }
  }, [autoLoad, organizationId, category, loadScores])

  return {
    scores,
    stats,
    config,
    isLoading,
    error,
    loadScores,
    getScore,
    calculateScore,
    bulkCalculate,
    detectIntent,
    addSignal,
    getScoreLabel,
    getScoreColor,
  }
}

export default useLeadScoring
