import { useState, useCallback, useRef, useEffect } from 'react'
import type { InboxMessage } from '@/types/inbox'

interface UseInboxMessagesReturn {
  messages: InboxMessage[]
  isLoading: boolean
  isSending: boolean
  error: string | null
  hasMore: boolean
  
  // Actions
  fetchMessages: (conversationId: string) => Promise<void>
  sendMessage: (params: SendMessageParams) => Promise<InboxMessage | null>
  loadMore: () => Promise<void>
  addMessage: (message: InboxMessage) => void
  updateMessageStatus: (messageId: string, status: InboxMessage['status']) => void
  clear: () => void
}

interface SendMessageParams {
  conversationId: string
  content?: string
  messageType?: InboxMessage['message_type']
  mediaUrl?: string
  mediaMimeType?: string
  mediaFilename?: string
  templateId?: string
  templateName?: string
  templateVariables?: Record<string, any>
  replyToMessageId?: string
  sentByUserId?: string
  sentByUserName?: string
}

export function useInboxMessages(): UseInboxMessagesReturn {
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const pageRef = useRef(1)

  const fetchMessages = useCallback(async (conversationId: string) => {
    setIsLoading(true)
    setError(null)
    setCurrentConversationId(conversationId)
    pageRef.current = 1

    try {
      const response = await fetch(
        `/api/whatsapp/inbox/conversations/${conversationId}/messages?page=1&limit=50`
      )
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to fetch messages')

      setMessages(data.messages || [])
      setHasMore(data.pagination?.hasMore || false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (!currentConversationId || isLoading || !hasMore) return

    setIsLoading(true)
    pageRef.current += 1

    try {
      const oldestMessage = messages[0]
      const response = await fetch(
        `/api/whatsapp/inbox/conversations/${currentConversationId}/messages?page=${pageRef.current}&limit=50${
          oldestMessage ? `&before=${oldestMessage.created_at}` : ''
        }`
      )
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to load more messages')

      setMessages(prev => [...(data.messages || []), ...prev])
      setHasMore(data.pagination?.hasMore || false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [currentConversationId, isLoading, hasMore, messages])

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
            mediaUrl: params.mediaUrl,
            mediaMimeType: params.mediaMimeType,
            mediaFilename: params.mediaFilename,
            templateId: params.templateId,
            templateName: params.templateName,
            templateVariables: params.templateVariables,
            replyToMessageId: params.replyToMessageId,
            sentByUserId: params.sentByUserId,
            sentByUserName: params.sentByUserName,
          })
        }
      )

      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to send message')

      const newMessage = data.message
      setMessages(prev => [...prev, newMessage])
      
      return newMessage
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setIsSending(false)
    }
  }, [])

  const addMessage = useCallback((message: InboxMessage) => {
    setMessages(prev => {
      // Evita duplicatas
      if (prev.some(m => m.id === message.id)) return prev
      return [...prev, message]
    })
  }, [])

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

  const clear = useCallback(() => {
    setMessages([])
    setCurrentConversationId(null)
    setHasMore(false)
    pageRef.current = 1
  }, [])

  return {
    messages,
    isLoading,
    isSending,
    error,
    hasMore,
    fetchMessages,
    sendMessage,
    loadMore,
    addMessage,
    updateMessageStatus,
    clear
  }
}
