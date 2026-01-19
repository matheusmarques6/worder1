// =============================================
// HOOK: useInboxMessages
// CORRIGIDO: sendMedia + paginação real + polling
// =============================================

import { useState, useCallback, useRef } from 'react'
import type { InboxMessage } from '@/types/inbox'

interface UseInboxMessagesReturn {
  messages: InboxMessage[]
  isLoading: boolean
  isSending: boolean
  isUploading: boolean
  error: string | null
  hasMore: boolean
  fetchMessages: (conversationId: string, reset?: boolean) => Promise<void>
  sendMessage: (params: SendMessageParams) => Promise<InboxMessage | null>
  sendMedia: (params: SendMediaParams) => Promise<InboxMessage | null>
  loadMore: () => Promise<void>
  addMessage: (message: InboxMessage) => void
  updateMessageStatus: (messageId: string, status: InboxMessage['status']) => void
  clear: () => void
  refetchLatest: () => Promise<void>
}

interface SendMessageParams {
  conversationId: string
  content?: string
  messageType?: InboxMessage['message_type']
}

interface SendMediaParams {
  conversationId: string
  file: File
  mediaType: 'image' | 'video' | 'audio' | 'document'
  caption?: string
}

const PAGE_SIZE = 50

export function useInboxMessages(): UseInboxMessagesReturn {
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  
  // Cursores para paginação
  const oldestCursorRef = useRef<string | null>(null)
  const newestCursorRef = useRef<string | null>(null)

  // =============================================
  // FETCH MESSAGES (com paginação real)
  // =============================================
  const fetchMessages = useCallback(async (conversationId: string, reset: boolean = true) => {
    if (reset) {
      setIsLoading(true)
      setError(null)
      setCurrentConversationId(conversationId)
      oldestCursorRef.current = null
      newestCursorRef.current = null
    }

    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
      
      // Se não é reset, buscar mensagens mais antigas
      if (!reset && oldestCursorRef.current) {
        params.set('before', oldestCursorRef.current)
      }

      const response = await fetch(
        `/api/whatsapp/inbox/conversations/${conversationId}/messages?${params}`
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to fetch messages')

      const fetchedMessages: InboxMessage[] = data.messages || []
      
      if (reset) {
        setMessages(fetchedMessages)
      } else {
        // Prepend mensagens mais antigas (sem duplicar)
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id))
          const newMsgs = fetchedMessages.filter(m => !existingIds.has(m.id))
          return [...newMsgs, ...prev]
        })
      }
      
      // Atualizar cursores
      if (fetchedMessages.length > 0) {
        const oldest = fetchedMessages[0]
        if (!oldestCursorRef.current || oldest.created_at < oldestCursorRef.current) {
          oldestCursorRef.current = oldest.created_at
        }
        const newest = fetchedMessages[fetchedMessages.length - 1]
        if (!newestCursorRef.current || newest.created_at > newestCursorRef.current) {
          newestCursorRef.current = newest.created_at
        }
      }
      
      setHasMore(data.hasMore ?? fetchedMessages.length >= PAGE_SIZE)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // =============================================
  // LOAD MORE (mensagens mais antigas)
  // =============================================
  const loadMore = useCallback(async () => {
    if (!currentConversationId || isLoading || !hasMore) return
    await fetchMessages(currentConversationId, false)
  }, [currentConversationId, isLoading, hasMore, fetchMessages])

  // =============================================
  // REFETCH LATEST (polling - busca novas mensagens)
  // =============================================
  const refetchLatest = useCallback(async () => {
    if (!currentConversationId) return
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (newestCursorRef.current) {
        params.set('after', newestCursorRef.current)
      }

      const response = await fetch(
        `/api/whatsapp/inbox/conversations/${currentConversationId}/messages?${params}`
      )
      const data = await response.json()
      if (!response.ok) return

      const fetchedMessages: InboxMessage[] = data.messages || []
      if (fetchedMessages.length > 0) {
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id))
          const newMsgs = fetchedMessages.filter(m => !existingIds.has(m.id))
          if (newMsgs.length === 0) return prev
          return [...prev, ...newMsgs]
        })
        const newest = fetchedMessages[fetchedMessages.length - 1]
        newestCursorRef.current = newest.created_at
      }
    } catch (err) {
      console.warn('[useInboxMessages] Polling error:', err)
    }
  }, [currentConversationId])

  // =============================================
  // SEND TEXT MESSAGE
  // =============================================
  const sendMessage = useCallback(async (params: SendMessageParams): Promise<InboxMessage | null> => {
    setIsSending(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/whatsapp/inbox/conversations/${params.conversationId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: params.content,
            messageType: params.messageType || 'text',
          })
        }
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to send message')

      const newMessage = data.message
      setMessages(prev => {
        if (prev.some(m => m.id === newMessage.id)) return prev
        return [...prev, newMessage]
      })
      if (newMessage.created_at) newestCursorRef.current = newMessage.created_at
      return newMessage
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setIsSending(false)
    }
  }, [])

  // =============================================
  // SEND MEDIA
  // =============================================
  const sendMedia = useCallback(async (params: SendMediaParams): Promise<InboxMessage | null> => {
    setIsUploading(true)
    setError(null)
    try {
      // Validar tamanho (16MB)
      if (params.file.size > 16 * 1024 * 1024) {
        throw new Error('Arquivo muito grande. Máximo: 16MB')
      }

      const formData = new FormData()
      formData.append('file', params.file)
      formData.append('mediaType', params.mediaType)
      if (params.caption) formData.append('caption', params.caption)

      const response = await fetch(
        `/api/whatsapp/inbox/conversations/${params.conversationId}/media`,
        { method: 'POST', body: formData }
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to upload media')
      if (!data.success) throw new Error(data.error || 'Evolution API failed')

      const newMessage = data.message
      if (newMessage) {
        setMessages(prev => {
          if (prev.some(m => m.id === newMessage.id)) return prev
          return [...prev, newMessage]
        })
        if (newMessage.created_at) newestCursorRef.current = newMessage.created_at
      }
      return newMessage
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar mídia')
      return null
    } finally {
      setIsUploading(false)
    }
  }, [])

  // =============================================
  // ADD MESSAGE (de realtime)
  // =============================================
  const addMessage = useCallback((message: InboxMessage) => {
    setMessages(prev => {
      if (prev.some(m => m.id === message.id)) return prev
      return [...prev, message].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    })
    if (message.created_at && (!newestCursorRef.current || message.created_at > newestCursorRef.current)) {
      newestCursorRef.current = message.created_at
    }
  }, [])

  // =============================================
  // UPDATE MESSAGE STATUS
  // =============================================
  const updateMessageStatus = useCallback((messageId: string, status: InboxMessage['status']) => {
    setMessages(prev =>
      prev.map(m =>
        m.id === messageId || m.meta_message_id === messageId
          ? { 
              ...m, 
              status,
              ...(status === 'delivered' && { delivered_at: new Date().toISOString() }),
              ...(status === 'read' && { read_at: new Date().toISOString() }),
            }
          : m
      )
    )
  }, [])

  // =============================================
  // CLEAR
  // =============================================
  const clear = useCallback(() => {
    setMessages([])
    setCurrentConversationId(null)
    setHasMore(false)
    oldestCursorRef.current = null
    newestCursorRef.current = null
  }, [])

  return {
    messages,
    isLoading,
    isSending,
    isUploading,
    error,
    hasMore,
    fetchMessages,
    sendMessage,
    sendMedia,
    loadMore,
    addMessage,
    updateMessageStatus,
    clear,
    refetchLatest,
  }
}
