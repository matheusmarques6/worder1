// =============================================
// Hook: useScheduledMessages
// Gerencia mensagens agendadas
// =============================================

'use client'

import { useState, useCallback, useEffect } from 'react'

export interface ScheduledMessage {
  id: string
  organization_id: string
  store_id?: string
  instance_id?: string
  instance_name?: string
  contact_id?: string
  conversation_id?: string
  phone_number: string
  contact_name?: string
  message_type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'template'
  content: string
  media_url?: string
  media_type?: string
  media_filename?: string
  template_name?: string
  template_params?: Record<string, any>
  scheduled_at: string
  timezone: string
  recurrence?: 'daily' | 'weekly' | 'monthly' | null
  recurrence_end_date?: string
  recurrence_count: number
  next_occurrence_at?: string
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  sent_at?: string
  error_message?: string
  error_code?: string
  message_id?: string
  metadata?: Record<string, any>
  created_by?: string
  created_by_name?: string
  created_at: string
  updated_at: string
}

export interface ScheduledMessageStats {
  pending: number
  sent: number
  failed: number
  cancelled: number
  total: number
}

export interface CreateScheduledMessageParams {
  instance_id?: string
  instance_name?: string
  contact_id?: string
  conversation_id?: string
  phone_number: string
  contact_name?: string
  message_type?: string
  content: string
  media_url?: string
  media_type?: string
  media_filename?: string
  scheduled_at: string
  timezone?: string
  recurrence?: 'daily' | 'weekly' | 'monthly' | null
  recurrence_end_date?: string
  metadata?: Record<string, any>
}

interface UseScheduledMessagesOptions {
  organizationId: string
  autoLoad?: boolean
  status?: string
  limit?: number
}

interface UseScheduledMessagesReturn {
  messages: ScheduledMessage[]
  stats: ScheduledMessageStats
  isLoading: boolean
  error: string | null
  loadMessages: () => Promise<void>
  createMessage: (params: CreateScheduledMessageParams) => Promise<ScheduledMessage | null>
  updateMessage: (id: string, updates: Partial<ScheduledMessage>) => Promise<boolean>
  cancelMessage: (id: string) => Promise<boolean>
  deleteMessage: (id: string) => Promise<boolean>
  sendNow: (id: string) => Promise<boolean>
}

export function useScheduledMessages({
  organizationId,
  autoLoad = true,
  status,
  limit = 50,
}: UseScheduledMessagesOptions): UseScheduledMessagesReturn {
  const [messages, setMessages] = useState<ScheduledMessage[]>([])
  const [stats, setStats] = useState<ScheduledMessageStats>({
    pending: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
    total: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // =============================================
  // CARREGAR MENSAGENS
  // =============================================
  const loadMessages = useCallback(async () => {
    if (!organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        limit: limit.toString(),
      })

      if (status) {
        params.append('status', status)
      }

      const response = await fetch(`/api/whatsapp/scheduled?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar agendamentos')
      }

      setMessages(data.messages || [])
      setStats(data.stats || { pending: 0, sent: 0, failed: 0, cancelled: 0, total: 0 })
    } catch (err: any) {
      console.error('[useScheduledMessages] Load error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, status, limit])

  // =============================================
  // CRIAR AGENDAMENTO
  // =============================================
  const createMessage = useCallback(async (
    params: CreateScheduledMessageParams
  ): Promise<ScheduledMessage | null> => {
    if (!organizationId) {
      setError('Organização não definida')
      return null
    }

    setError(null)

    try {
      const response = await fetch('/api/whatsapp/scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          ...params,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar agendamento')
      }

      // Adicionar ao estado local
      setMessages(prev => [data.message, ...prev].sort((a, b) => 
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      ))
      
      // Atualizar stats
      setStats(prev => ({
        ...prev,
        pending: prev.pending + 1,
        total: prev.total + 1,
      }))

      return data.message
    } catch (err: any) {
      console.error('[useScheduledMessages] Create error:', err)
      setError(err.message)
      return null
    }
  }, [organizationId])

  // =============================================
  // ATUALIZAR AGENDAMENTO
  // =============================================
  const updateMessage = useCallback(async (
    id: string,
    updates: Partial<ScheduledMessage>
  ): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch(`/api/whatsapp/scheduled/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          ...updates,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atualizar agendamento')
      }

      // Atualizar estado local
      setMessages(prev =>
        prev.map(msg => (msg.id === id ? { ...msg, ...data.message } : msg))
      )

      return true
    } catch (err: any) {
      console.error('[useScheduledMessages] Update error:', err)
      setError(err.message)
      return false
    }
  }, [organizationId])

  // =============================================
  // CANCELAR AGENDAMENTO
  // =============================================
  const cancelMessage = useCallback(async (id: string): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch(
        `/api/whatsapp/scheduled/${id}?organization_id=${encodeURIComponent(organizationId)}`,
        { method: 'DELETE' }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao cancelar agendamento')
      }

      // Atualizar estado local
      setMessages(prev =>
        prev.map(msg => (msg.id === id ? { ...msg, status: 'cancelled' } : msg))
      )

      // Atualizar stats
      setStats(prev => ({
        ...prev,
        pending: prev.pending - 1,
        cancelled: prev.cancelled + 1,
      }))

      return true
    } catch (err: any) {
      console.error('[useScheduledMessages] Cancel error:', err)
      setError(err.message)
      return false
    }
  }, [organizationId])

  // =============================================
  // DELETAR AGENDAMENTO
  // =============================================
  const deleteMessage = useCallback(async (id: string): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch(
        `/api/whatsapp/scheduled/${id}?hard=true&organization_id=${encodeURIComponent(organizationId)}`,
        { method: 'DELETE' }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao remover agendamento')
      }

      // Remover do estado local
      const removed = messages.find(m => m.id === id)
      setMessages(prev => prev.filter(msg => msg.id !== id))

      // Atualizar stats
      if (removed) {
        setStats(prev => ({
          ...prev,
          [removed.status]: prev[removed.status as keyof ScheduledMessageStats] - 1,
          total: prev.total - 1,
        }))
      }

      return true
    } catch (err: any) {
      console.error('[useScheduledMessages] Delete error:', err)
      setError(err.message)
      return false
    }
  }, [organizationId, messages])

  // =============================================
  // ENVIAR AGORA
  // =============================================
  const sendNow = useCallback(async (id: string): Promise<boolean> => {
    setError(null)

    try {
      // Atualizar para enviar imediatamente
      const response = await fetch(`/api/whatsapp/scheduled/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          scheduled_at: new Date().toISOString(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao enviar mensagem')
      }

      // Recarregar para pegar status atualizado
      await loadMessages()

      return true
    } catch (err: any) {
      console.error('[useScheduledMessages] SendNow error:', err)
      setError(err.message)
      return false
    }
  }, [organizationId, loadMessages])

  // =============================================
  // AUTO LOAD
  // =============================================
  useEffect(() => {
    if (autoLoad && organizationId) {
      loadMessages()
    }
  }, [autoLoad, organizationId, loadMessages])

  return {
    messages,
    stats,
    isLoading,
    error,
    loadMessages,
    createMessage,
    updateMessage,
    cancelMessage,
    deleteMessage,
    sendNow,
  }
}

export default useScheduledMessages
