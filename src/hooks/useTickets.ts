// =============================================
// Hook: useTickets
// Gerencia tickets de suporte
// =============================================

'use client'

import { useState, useCallback, useEffect } from 'react'

export interface Ticket {
  id: string
  organization_id: string
  store_id?: string
  ticket_number: number
  title: string
  description?: string
  category: 'delivery' | 'payment' | 'product' | 'refund' | 'question' | 'bug' | 'feature' | 'other'
  subcategory?: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  status: 'open' | 'in_progress' | 'waiting_customer' | 'waiting_internal' | 'resolved' | 'closed'
  contact_id?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  order_id?: string
  order_number?: string
  conversation_id?: string
  deal_id?: string
  assigned_to?: string
  assigned_to_name?: string
  assigned_at?: string
  team_id?: string
  team_name?: string
  sla_due_at?: string
  sla_breached: boolean
  first_response_at?: string
  first_response_sla_met?: boolean
  resolved_at?: string
  resolved_by?: string
  resolved_by_name?: string
  resolution_notes?: string
  resolution_time_minutes?: number
  satisfaction_rating?: number
  satisfaction_comment?: string
  tags?: string[]
  custom_fields?: Record<string, any>
  source: string
  created_by?: string
  created_by_name?: string
  created_at: string
  updated_at: string
}

export interface TicketComment {
  id: string
  ticket_id: string
  content: string
  content_html?: string
  is_internal: boolean
  is_system: boolean
  attachments?: { name: string; url: string; type: string; size: number }[]
  user_id?: string
  user_name?: string
  user_email?: string
  user_avatar_url?: string
  created_at: string
}

export interface TicketStats {
  total: number
  open: number
  in_progress: number
  waiting_customer: number
  waiting_internal: number
  resolved: number
  closed: number
  sla_breached: number
}

export interface TicketFilters {
  status?: string
  category?: string
  priority?: string
  assignedTo?: string
  contactId?: string
  orderId?: string
  search?: string
}

export interface CreateTicketParams {
  title: string
  description?: string
  category?: string
  priority?: string
  contact_id?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
  order_id?: string
  order_number?: string
  conversation_id?: string
  assigned_to?: string
  assigned_to_name?: string
  sla_hours?: number
  tags?: string[]
}

interface UseTicketsOptions {
  organizationId: string
  filters?: TicketFilters
  autoLoad?: boolean
  limit?: number
}

interface UseTicketsReturn {
  tickets: Ticket[]
  stats: TicketStats | null
  isLoading: boolean
  error: string | null
  selectedTicket: Ticket | null
  comments: TicketComment[]
  loadTickets: () => Promise<void>
  loadStats: () => Promise<void>
  loadTicket: (id: string) => Promise<void>
  createTicket: (params: CreateTicketParams) => Promise<Ticket | null>
  updateTicket: (id: string, updates: Partial<Ticket>) => Promise<boolean>
  deleteTicket: (id: string) => Promise<boolean>
  addComment: (ticketId: string, content: string, isInternal?: boolean) => Promise<TicketComment | null>
  resolveTicket: (id: string, notes?: string) => Promise<boolean>
  closeTicket: (id: string) => Promise<boolean>
  setSelectedTicket: (ticket: Ticket | null) => void
}

export function useTickets({
  organizationId,
  filters = {},
  autoLoad = true,
  limit = 50,
}: UseTicketsOptions): UseTicketsReturn {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [stats, setStats] = useState<TicketStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [comments, setComments] = useState<TicketComment[]>([])

  // =============================================
  // CARREGAR TICKETS
  // =============================================
  const loadTickets = useCallback(async () => {
    if (!organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        limit: limit.toString(),
      })

      if (filters.status) params.append('status', filters.status)
      if (filters.category) params.append('category', filters.category)
      if (filters.priority) params.append('priority', filters.priority)
      if (filters.assignedTo) params.append('assigned_to', filters.assignedTo)
      if (filters.contactId) params.append('contact_id', filters.contactId)
      if (filters.orderId) params.append('order_id', filters.orderId)
      if (filters.search) params.append('search', filters.search)

      const response = await fetch(`/api/tickets?${params}`)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error)

      setTickets(data.tickets || [])
    } catch (err: any) {
      console.error('[useTickets] Load error:', err)
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

      const response = await fetch(`/api/tickets/stats?${params}`)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error)

      setStats(data.stats)
    } catch (err: any) {
      console.error('[useTickets] Stats error:', err)
    }
  }, [organizationId, filters.assignedTo])

  // =============================================
  // CARREGAR TICKET INDIVIDUAL
  // =============================================
  const loadTicket = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/tickets/${id}`)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error)

      setSelectedTicket(data.ticket)
      setComments(data.comments || [])
    } catch (err: any) {
      console.error('[useTickets] Load ticket error:', err)
      setError(err.message)
    }
  }, [])

  // =============================================
  // CRIAR TICKET
  // =============================================
  const createTicket = useCallback(async (params: CreateTicketParams): Promise<Ticket | null> => {
    if (!organizationId) return null

    setError(null)

    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          ...params,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      await loadTickets()
      await loadStats()

      return data.ticket
    } catch (err: any) {
      console.error('[useTickets] Create error:', err)
      setError(err.message)
      return null
    }
  }, [organizationId, loadTickets, loadStats])

  // =============================================
  // ATUALIZAR TICKET
  // =============================================
  const updateTicket = useCallback(async (id: string, updates: Partial<Ticket>): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch(`/api/tickets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      // Atualizar estado local
      setTickets(prev => prev.map(t => (t.id === id ? { ...t, ...data.ticket } : t)))
      if (selectedTicket?.id === id) {
        setSelectedTicket({ ...selectedTicket, ...data.ticket })
      }
      await loadStats()

      return true
    } catch (err: any) {
      console.error('[useTickets] Update error:', err)
      setError(err.message)
      return false
    }
  }, [selectedTicket, loadStats])

  // =============================================
  // DELETAR TICKET
  // =============================================
  const deleteTicket = useCallback(async (id: string): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch(`/api/tickets/${id}`, { method: 'DELETE' })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error)

      setTickets(prev => prev.filter(t => t.id !== id))
      if (selectedTicket?.id === id) {
        setSelectedTicket(null)
      }
      await loadStats()

      return true
    } catch (err: any) {
      console.error('[useTickets] Delete error:', err)
      setError(err.message)
      return false
    }
  }, [selectedTicket, loadStats])

  // =============================================
  // ADICIONAR COMENTÁRIO
  // =============================================
  const addComment = useCallback(async (
    ticketId: string,
    content: string,
    isInternal = false
  ): Promise<TicketComment | null> => {
    try {
      const response = await fetch(`/api/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          is_internal: isInternal,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      setComments(prev => [...prev, data.comment])

      return data.comment
    } catch (err: any) {
      console.error('[useTickets] Add comment error:', err)
      setError(err.message)
      return null
    }
  }, [])

  // =============================================
  // RESOLVER TICKET
  // =============================================
  const resolveTicket = useCallback(async (id: string, notes?: string): Promise<boolean> => {
    return updateTicket(id, {
      status: 'resolved',
      resolution_notes: notes,
    } as any)
  }, [updateTicket])

  // =============================================
  // FECHAR TICKET
  // =============================================
  const closeTicket = useCallback(async (id: string): Promise<boolean> => {
    return updateTicket(id, { status: 'closed' } as any)
  }, [updateTicket])

  // =============================================
  // AUTO LOAD
  // =============================================
  useEffect(() => {
    if (autoLoad && organizationId) {
      loadTickets()
      loadStats()
    }
  }, [autoLoad, organizationId, loadTickets, loadStats])

  return {
    tickets,
    stats,
    isLoading,
    error,
    selectedTicket,
    comments,
    loadTickets,
    loadStats,
    loadTicket,
    createTicket,
    updateTicket,
    deleteTicket,
    addComment,
    resolveTicket,
    closeTicket,
    setSelectedTicket,
  }
}

export default useTickets
