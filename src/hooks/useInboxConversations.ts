import { useState, useCallback, useRef } from 'react'
import type {
  InboxConversation,
  ConversationFilters,
  Pagination
} from '@/types/inbox'
import { authedFetch } from '@/lib/api/authed-fetch'

interface UseInboxConversationsReturn {
  conversations: InboxConversation[]
  selectedConversation: InboxConversation | null
  isLoading: boolean      // ✅ Primeira carga (mostra loader)
  isRefreshing: boolean   // ✅ Polling silencioso (não mostra loader)
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

// ✅ CORREÇÃO: Recebe storeId e organizationId (ambos podem ser null)
export function useInboxConversations(organizationId: string | null, storeId?: string | null): UseInboxConversationsReturn {
  const [conversations, setConversations] = useState<InboxConversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<InboxConversation | null>(null)
  const [isLoading, setIsLoading] = useState(false)      // ✅ Primeira carga
  const [isRefreshing, setIsRefreshing] = useState(false) // ✅ Polling silencioso
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [filters, setFilters] = useState<ConversationFilters>({})
  
  // ✅ Flag para saber se já carregou uma vez
  const hasLoadedOnce = useRef(false)

  // ✅ Debounce: evita chamadas simultâneas
  const isFetchingRef = useRef(false)

  const fetchConversations = useCallback(async (newFilters?: ConversationFilters) => {
    // ✅ Debounce: ignora chamadas enquanto outra está em andamento
    if (isFetchingRef.current) {
      return
    }
    if (!organizationId) {
      console.log('⚠️ No organizationId yet, waiting...')
      return
    }
    
    // ✅ CRÍTICO: Exigir storeId para buscar conversas
    if (!storeId) {
      console.log('⚠️ No storeId yet, waiting...')
      setConversations([])
      return
    }
    
    // ✅ CORREÇÃO: Só mostra loading na PRIMEIRA carga
    if (!hasLoadedOnce.current) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true) // Polling silencioso
    }
    setError(null)
    isFetchingRef.current = true

    try {
      const currentFilters = newFilters || filters
      const params = new URLSearchParams({
        organizationId,
        storeId, // ✅ CRÍTICO: Passar storeId
        ...(currentFilters.status && currentFilters.status !== 'all' && { status: currentFilters.status }),
        ...(currentFilters.assignedTo && currentFilters.assignedTo !== 'all' && { assignedTo: currentFilters.assignedTo }),
        ...(currentFilters.priority && currentFilters.priority !== 'all' && { priority: currentFilters.priority }),
        ...(currentFilters.botActive !== undefined && { botActive: String(currentFilters.botActive) }),
        ...(currentFilters.tag && { tag: currentFilters.tag }),
        ...(currentFilters.search && { search: currentFilters.search }),
      })

      console.log('📡 Fetching conversations:', `/api/whatsapp/inbox/conversations?${params}`)
      
      const response = await authedFetch(`/api/whatsapp/inbox/conversations?${params}`)
      const data = await response.json()

      console.log('📥 API Response:', { 
        ok: response.ok, 
        conversationsCount: data.conversations?.length,
        storeId,
        error: data.error 
      })

      if (!response.ok) throw new Error(data.error || 'Failed to fetch conversations')

      setConversations(data.conversations || [])
      setPagination(data.pagination || null)
      hasLoadedOnce.current = true // ✅ Marca que já carregou
      
      if (newFilters) {
        setFilters(newFilters)
      }
    } catch (err) {
      console.error('❌ Error fetching conversations:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
      isFetchingRef.current = false
    }
  }, [organizationId, storeId, filters])

  const selectConversation = useCallback((conversation: InboxConversation | null) => {
    setSelectedConversation(conversation)
    
    if (conversation && conversation.unread_count > 0) {
      markAsRead(conversation.id)
    }
  }, [])

  const updateConversation = useCallback(async (id: string, updates: Partial<InboxConversation>) => {
    try {
      const response = await authedFetch(`/api/whatsapp/inbox/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })

      if (!response.ok) throw new Error('Failed to update conversation')

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

  const closeConversation = useCallback(async (id: string, resolution?: string) => {
    await updateConversation(id, { 
      status: 'closed',
      ...(resolution && { resolution })
    } as Partial<InboxConversation>)
  }, [updateConversation])

  const assignConversation = useCallback(async (id: string, agentId: string | null) => {
    await updateConversation(id, { 
      assigned_to: agentId,
      assigned_agent_id: agentId 
    } as Partial<InboxConversation>)
  }, [updateConversation])

  const toggleBot = useCallback(async (id: string, isActive: boolean, reason?: string) => {
    try {
      const response = await authedFetch(`/api/whatsapp/inbox/conversations/${id}/bot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_enabled: isActive,
          reason
        })
      })

      if (!response.ok) throw new Error('Failed to toggle bot')

      setConversations(prev => 
        prev.map(c => c.id === id ? { ...c, ai_enabled: isActive, is_bot_active: isActive } : c)
      )
      
      if (selectedConversation?.id === id) {
        setSelectedConversation(prev => prev ? { ...prev, ai_enabled: isActive, is_bot_active: isActive } : null)
      }
    } catch (err) {
      throw err
    }
  }, [selectedConversation])

  const markAsRead = useCallback(async (id: string) => {
    try {
      await authedFetch(`/api/whatsapp/inbox/conversations/${id}/read`, {
        method: 'POST'
      })
      
      setConversations(prev => 
        prev.map(c => c.id === id ? { ...c, unread_count: 0 } : c)
      )
    } catch (err) {
      console.error('Error marking as read:', err)
    }
  }, [])

  const refresh = useCallback(async () => {
    await fetchConversations(filters)
  }, [fetchConversations, filters])

  return {
    conversations,
    selectedConversation,
    isLoading,
    isRefreshing, // ✅ NOVO: polling silencioso
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
    refresh,
  }
}
