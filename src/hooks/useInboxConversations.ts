import { useState, useCallback } from 'react'
import type { 
  InboxConversation, 
  ConversationFilters, 
  Pagination 
} from '@/types/inbox'

interface UseInboxConversationsReturn {
  conversations: InboxConversation[]
  selectedConversation: InboxConversation | null
  isLoading: boolean
  error: string | null
  pagination: Pagination | null
  filters: ConversationFilters
  
  // Actions
  fetchConversations: (filters?: ConversationFilters) => Promise<void>
  selectConversation: (conversation: InboxConversation | null) => void
  updateConversation: (id: string, updates: Partial<InboxConversation>) => Promise<void>
  closeConversation: (id: string, resolution?: string) => Promise<void>
  assignConversation: (id: string, agentId: string | null) => Promise<void>
  toggleBot: (id: string, isActive: boolean, reason?: string) => Promise<void>
  markAsRead: (id: string) => Promise<void>
  setFilters: (filters: ConversationFilters) => void
  refresh: () => Promise<void>
}

export function useInboxConversations(organizationId: string): UseInboxConversationsReturn {
  const [conversations, setConversations] = useState<InboxConversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<InboxConversation | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [filters, setFilters] = useState<ConversationFilters>({})

  const fetchConversations = useCallback(async (newFilters?: ConversationFilters) => {
    if (!organizationId) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      const currentFilters = newFilters || filters
      const params = new URLSearchParams({
        organizationId,
        ...(currentFilters.status && currentFilters.status !== 'all' && { status: currentFilters.status }),
        ...(currentFilters.assignedTo && currentFilters.assignedTo !== 'all' && { assignedTo: currentFilters.assignedTo }),
        ...(currentFilters.priority && currentFilters.priority !== 'all' && { priority: currentFilters.priority }),
        ...(currentFilters.botActive !== undefined && { botActive: String(currentFilters.botActive) }),
        ...(currentFilters.tag && { tag: currentFilters.tag }),
        ...(currentFilters.search && { search: currentFilters.search }),
      })

      const response = await fetch(`/api/whatsapp/inbox/conversations?${params}`)
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to fetch conversations')

      setConversations(data.conversations || [])
      setPagination(data.pagination || null)
      
      if (newFilters) {
        setFilters(newFilters)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, filters])

  const selectConversation = useCallback((conversation: InboxConversation | null) => {
    setSelectedConversation(conversation)
    
    // Marca como lido ao selecionar
    if (conversation && conversation.unread_count > 0) {
      markAsRead(conversation.id)
    }
  }, [])

  const updateConversation = useCallback(async (id: string, updates: Partial<InboxConversation>) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })

      if (!response.ok) throw new Error('Failed to update conversation')

      const { conversation } = await response.json()
      
      // Atualiza na lista
      setConversations(prev => 
        prev.map(c => c.id === id ? { ...c, ...conversation } : c)
      )
      
      // Atualiza selecionada se for a mesma
      if (selectedConversation?.id === id) {
        setSelectedConversation(prev => prev ? { ...prev, ...conversation } : null)
      }
    } catch (err) {
      throw err
    }
  }, [selectedConversation])

  const closeConversation = useCallback(async (id: string, resolution?: string) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/conversations/${id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution })
      })

      if (!response.ok) throw new Error('Failed to close conversation')

      // Atualiza na lista
      setConversations(prev => 
        prev.map(c => c.id === id ? { ...c, status: 'closed' } : c)
      )
      
      if (selectedConversation?.id === id) {
        setSelectedConversation(prev => prev ? { ...prev, status: 'closed' } : null)
      }
    } catch (err) {
      throw err
    }
  }, [selectedConversation])

  const assignConversation = useCallback(async (id: string, agentId: string | null) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/conversations/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId })
      })

      if (!response.ok) throw new Error('Failed to assign conversation')

      const { conversation } = await response.json()
      
      setConversations(prev => 
        prev.map(c => c.id === id ? { ...c, ...conversation } : c)
      )
      
      if (selectedConversation?.id === id) {
        setSelectedConversation(prev => prev ? { ...prev, ...conversation } : null)
      }
    } catch (err) {
      throw err
    }
  }, [selectedConversation])

  const toggleBot = useCallback(async (id: string, isActive: boolean, reason?: string) => {
    try {
      const response = await fetch(`/api/whatsapp/inbox/conversations/${id}/bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive, reason })
      })

      if (!response.ok) throw new Error('Failed to toggle bot')

      const { conversation } = await response.json()
      
      setConversations(prev => 
        prev.map(c => c.id === id ? { ...c, is_bot_active: isActive } : c)
      )
      
      if (selectedConversation?.id === id) {
        setSelectedConversation(prev => prev ? { ...prev, is_bot_active: isActive } : null)
      }
    } catch (err) {
      throw err
    }
  }, [selectedConversation])

  const markAsRead = useCallback(async (id: string) => {
    try {
      await fetch(`/api/whatsapp/inbox/conversations/${id}/read`, {
        method: 'POST'
      })
      
      setConversations(prev => 
        prev.map(c => c.id === id ? { ...c, unread_count: 0 } : c)
      )
      
      if (selectedConversation?.id === id) {
        setSelectedConversation(prev => prev ? { ...prev, unread_count: 0 } : null)
      }
    } catch (err) {
      console.error('Failed to mark as read:', err)
    }
  }, [selectedConversation])

  const refresh = useCallback(async () => {
    await fetchConversations(filters)
  }, [fetchConversations, filters])

  return {
    conversations,
    selectedConversation,
    isLoading,
    error,
    pagination,
    filters,
    fetchConversations,
    selectConversation,
    updateConversation,
    closeConversation,
    assignConversation,
    toggleBot,
    markAsRead,
    setFilters,
    refresh
  }
}
