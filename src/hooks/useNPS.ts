'use client'

import { useState, useCallback, useEffect } from 'react'

// =============================================
// Types
// =============================================

export interface NPSSurvey {
  id: string
  organization_id: string
  store_id?: string
  created_by?: string
  name: string
  question: string
  follow_up_question?: string
  trigger_type: 'manual' | 'after_purchase' | 'after_close' | 'scheduled'
  trigger_delay_hours: number
  channel: 'whatsapp' | 'email' | 'sms' | 'in_app'
  total_sent: number
  total_responses: number
  promoters_count: number
  passives_count: number
  detractors_count: number
  nps_score: number | string
  response_rate: number | string
  is_active: boolean
  created_at: string
  updated_at: string
  profiles?: {
    id: string
    email: string
    full_name: string
  }
}

export interface NPSResponse {
  id: string
  organization_id: string
  survey_id: string
  contact_id?: string
  deal_id?: string
  score: number
  category: 'promoter' | 'passive' | 'detractor'
  feedback?: string
  sentiment?: string
  channel?: string
  conversation_id?: string
  responded_at: string
  created_at: string
  contacts?: {
    id: string
    first_name?: string
    last_name?: string
    email?: string
    phone?: string
  }
}

export interface CreateSurveyParams {
  name: string
  question?: string
  follow_up_question?: string
  trigger_type?: 'manual' | 'after_purchase' | 'after_close' | 'scheduled'
  trigger_delay_hours?: number
  channel?: 'whatsapp' | 'email' | 'sms' | 'in_app'
}

export interface SubmitResponseParams {
  survey_id: string
  contact_id?: string
  deal_id?: string
  score: number
  feedback?: string
  channel?: string
  conversation_id?: string
}

interface UseNPSOptions {
  organizationId: string
  storeId?: string | null
  autoLoad?: boolean
}

interface UseNPSReturn {
  surveys: NPSSurvey[]
  selectedSurvey: NPSSurvey | null
  responses: NPSResponse[]
  isLoading: boolean
  error: string | null
  loadSurveys: () => Promise<void>
  loadSurvey: (id: string) => Promise<void>
  createSurvey: (params: CreateSurveyParams) => Promise<NPSSurvey | null>
  updateSurvey: (id: string, updates: Partial<NPSSurvey>) => Promise<boolean>
  deleteSurvey: (id: string) => Promise<boolean>
  submitResponse: (params: SubmitResponseParams) => Promise<boolean>
  sendSurvey: (surveyId: string, contactIds: string[]) => Promise<boolean>
}

// =============================================
// Hook
// =============================================

export function useNPS({
  organizationId,
  storeId,
  autoLoad = true,
}: UseNPSOptions): UseNPSReturn {
  const [surveys, setSurveys] = useState<NPSSurvey[]>([])
  const [selectedSurvey, setSelectedSurvey] = useState<NPSSurvey | null>(null)
  const [responses, setResponses] = useState<NPSResponse[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // =============================================
  // Load All Surveys
  // =============================================
  const loadSurveys = useCallback(async () => {
    if (!organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ organization_id: organizationId })

      const response = await fetch(`/api/nps?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar pesquisas')
      }

      setSurveys(data.surveys || [])
    } catch (err: any) {
      console.error('[useNPS] Load error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId])

  // =============================================
  // Load Single Survey with Responses
  // =============================================
  const loadSurvey = useCallback(async (id: string) => {
    if (!organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        survey_id: id,
        include_responses: 'true',
      })

      const response = await fetch(`/api/nps?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar pesquisa')
      }

      setSelectedSurvey(data.survey)
      setResponses(data.responses || [])
    } catch (err: any) {
      console.error('[useNPS] Load survey error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId])

  // =============================================
  // Create Survey
  // =============================================
  const createSurvey = useCallback(async (params: CreateSurveyParams): Promise<NPSSurvey | null> => {
    if (!organizationId) {
      setError('Organização não definida')
      return null
    }

    setError(null)

    try {
      const response = await fetch('/api/nps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_survey',
          organization_id: organizationId,
          store_id: storeId,
          ...params,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar pesquisa')
      }

      await loadSurveys()
      return data.survey
    } catch (err: any) {
      console.error('[useNPS] Create error:', err)
      setError(err.message)
      return null
    }
  }, [organizationId, storeId, loadSurveys])

  // =============================================
  // Update Survey
  // =============================================
  const updateSurvey = useCallback(async (id: string, updates: Partial<NPSSurvey>): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch('/api/nps', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atualizar pesquisa')
      }

      setSurveys(prev => prev.map(s => (s.id === id ? { ...s, ...data.survey } : s)))

      if (selectedSurvey?.id === id) {
        setSelectedSurvey(prev => prev ? { ...prev, ...data.survey } : null)
      }

      return true
    } catch (err: any) {
      console.error('[useNPS] Update error:', err)
      setError(err.message)
      return false
    }
  }, [selectedSurvey])

  // =============================================
  // Delete Survey
  // =============================================
  const deleteSurvey = useCallback(async (id: string): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch(`/api/nps?id=${id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao excluir pesquisa')
      }

      setSurveys(prev => prev.filter(s => s.id !== id))

      if (selectedSurvey?.id === id) {
        setSelectedSurvey(null)
        setResponses([])
      }

      return true
    } catch (err: any) {
      console.error('[useNPS] Delete error:', err)
      setError(err.message)
      return false
    }
  }, [selectedSurvey])

  // =============================================
  // Submit Response
  // =============================================
  const submitResponse = useCallback(async (params: SubmitResponseParams): Promise<boolean> => {
    if (!organizationId) {
      setError('Organização não definida')
      return false
    }

    setError(null)

    try {
      const response = await fetch('/api/nps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit_response',
          organization_id: organizationId,
          ...params,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao enviar resposta')
      }

      // Reload survey to update stats
      if (selectedSurvey?.id === params.survey_id) {
        await loadSurvey(params.survey_id)
      }

      return true
    } catch (err: any) {
      console.error('[useNPS] Submit error:', err)
      setError(err.message)
      return false
    }
  }, [organizationId, selectedSurvey, loadSurvey])

  // =============================================
  // Send Survey to Contacts
  // =============================================
  const sendSurvey = useCallback(async (surveyId: string, contactIds: string[]): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch('/api/nps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_survey',
          survey_id: surveyId,
          contact_ids: contactIds,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao enviar pesquisa')
      }

      await loadSurveys()
      return true
    } catch (err: any) {
      console.error('[useNPS] Send error:', err)
      setError(err.message)
      return false
    }
  }, [loadSurveys])

  // =============================================
  // Auto Load
  // =============================================
  useEffect(() => {
    if (autoLoad && organizationId) {
      loadSurveys()
    }
  }, [autoLoad, organizationId, loadSurveys])

  return {
    surveys,
    selectedSurvey,
    responses,
    isLoading,
    error,
    loadSurveys,
    loadSurvey,
    createSurvey,
    updateSurvey,
    deleteSurvey,
    submitResponse,
    sendSurvey,
  }
}

export default useNPS
