// =============================================
// HOOK: useInboxMessages
// CORRIGIDO: sendMedia + paginação real + polling
// =============================================

import { useState, useCallback, useRef } from 'react'
import type { InboxMessage } from '@/types/inbox'
import { authedFetch } from '@/lib/api/authed-fetch'

interface UseInboxMessagesReturn {
  messages: InboxMessage[]
  isLoading: boolean
  isSending: boolean
  isUploading: boolean
  error: string | null
  hasMore: boolean
  fetchMessages: (conversationId: string, reset?: boolean) => Promise<void>
  sendMessage: (params: SendMessageParams) => Promise<InboxMessage | OptedOutSignal | null>
  sendMedia: (params: SendMediaParams) => Promise<InboxMessage | OptedOutSignal | null>
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
  override?: { reason: string }
}

interface SendMediaParams {
  conversationId: string
  file: File
  mediaType: 'image' | 'video' | 'audio' | 'document'
  caption?: string
  override?: { reason: string }
}

// Onda 10 — sinal de que o contato esta opted_out e o atendente pode
// confirmar override. ChatPanel mostra dialog e re-chama com override.
export interface OptedOutSignal {
  optedOut: true
  overridable: boolean
  opted_out_at?: string | null
  opt_out_reason?: string | null
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

  // Track pending messages by temp ID for proper replacement
  const pendingMessagesRef = useRef<Map<string, string>>(new Map())

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

      const response = await authedFetch(
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
  // REFETCH LATEST (polling - busca novas mensagens + status updates)
  // =============================================
  const refetchLatest = useCallback(async () => {
    if (!currentConversationId) return
    try {
      // Buscar mensagens mais recentes E atualizar status de todas as mensagens pendentes
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (newestCursorRef.current) {
        params.set('after', newestCursorRef.current)
      }

      const response = await authedFetch(
        `/api/whatsapp/inbox/conversations/${currentConversationId}/messages?${params}`
      )
      const data = await response.json()
      if (!response.ok) return

      const fetchedMessages: InboxMessage[] = data.messages || []

      setMessages(prev => {
        let updated = [...prev]
        let hasChanges = false

        // Adicionar novas mensagens
        for (const fetchedMsg of fetchedMessages) {
          const existingIdx = updated.findIndex(m => m.id === fetchedMsg.id || m.meta_message_id === fetchedMsg.meta_message_id)

          if (existingIdx === -1) {
            // Nova mensagem - verificar se não é uma duplicata de uma mensagem pendente
            const pendingIds = Array.from(pendingMessagesRef.current.values())
            if (!pendingIds.includes(fetchedMsg.id)) {
              updated.push(fetchedMsg)
              hasChanges = true
            }
          } else {
            // Mensagem existente - atualizar status se mudou
            const existing = updated[existingIdx]
            if (existing.status !== fetchedMsg.status) {
              updated[existingIdx] = { ...existing, status: fetchedMsg.status }
              hasChanges = true
            }
          }
        }

        // Ordenar por data
        if (hasChanges) {
          updated.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          return updated
        }

        return prev
      })

      // Atualizar cursor
      if (fetchedMessages.length > 0) {
        const newest = fetchedMessages[fetchedMessages.length - 1]
        if (!newestCursorRef.current || newest.created_at > newestCursorRef.current) {
          newestCursorRef.current = newest.created_at
        }
      }
    } catch (err) {
      console.warn('[useInboxMessages] Polling error:', err)
    }
  }, [currentConversationId])

  // =============================================
  // SEND TEXT MESSAGE - COM OPTIMISTIC UI MELHORADO
  // =============================================
  const sendMessage = useCallback(async (params: SendMessageParams): Promise<InboxMessage | OptedOutSignal | null> => {
    setIsSending(true)
    setError(null)

    // OPTIMISTIC UI - Adicionar mensagem imediatamente com status "pending"
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const optimisticMessage: InboxMessage = {
      id: tempId,
      conversation_id: params.conversationId,
      direction: 'outbound',
      message_type: params.messageType || 'text',
      content: params.content || '',
      status: 'pending',
      sent_by_bot: false,
      is_deleted: false,
      created_at: new Date().toISOString(),
    }

    // Adicionar mensagem otimista à lista
    setMessages(prev => [...prev, optimisticMessage])

    try {
      const url = params.override
        ? `/api/whatsapp/inbox/conversations/${params.conversationId}/messages?override=true&override_reason=${encodeURIComponent(params.override.reason)}`
        : `/api/whatsapp/inbox/conversations/${params.conversationId}/messages`
      const response = await authedFetch(
        url,
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

      // Onda 10 — 409 OPTED_OUT_OVERRIDABLE: remove a otimista e devolve
      // sinal pro ChatPanel mostrar dialog de override.
      if (response.status === 409 && (data?.code === 'OPTED_OUT_OVERRIDABLE' || data?.code === 'OPTED_OUT')) {
        setMessages(prev => prev.filter(m => m.id !== tempId))
        return {
          optedOut: true,
          overridable: data.code === 'OPTED_OUT_OVERRIDABLE',
          opted_out_at: data.contact_opted_out_at ?? null,
          opt_out_reason: data.opt_out_reason ?? null,
        } as OptedOutSignal
      }

      if (!response.ok) {
        // Se falhou, atualizar mensagem otimista para "failed".
        // Preservar `code` (Meta error code, ex: 190 = auth) pra UI
        // poder renderizar CTA contextual no balao.
        setMessages(prev => prev.map(m =>
          m.id === tempId
            ? {
                ...m,
                status: 'failed' as const,
                error_message: data.error,
                error_code: data.code != null ? String(data.code) : undefined,
              }
            : m
        ))
        setError(data.error || 'Failed to send message')
        return null
      }

      // Substituir mensagem otimista pela real com status correto
      const newMessage: InboxMessage = {
        ...data.message,
        // Garantir que o status seja 'sent' se a API retornou sucesso
        status: data.success ? 'sent' : (data.message?.status || 'sent'),
      }

      // Rastrear o mapeamento temp -> real para evitar duplicatas
      if (newMessage.id) {
        pendingMessagesRef.current.set(tempId, newMessage.id)
      }

      setMessages(prev => {
        // Remover a otimista e verificar duplicatas
        const filtered = prev.filter(m => m.id !== tempId)
        // Evitar adicionar se já existe (por real-time ou polling)
        if (filtered.some(m => m.id === newMessage.id)) return filtered
        return [...filtered, newMessage]
      })

      if (newMessage.created_at) newestCursorRef.current = newMessage.created_at
      return newMessage
    } catch (err) {
      // Se erro de rede, marcar como failed
      setMessages(prev => prev.map(m =>
        m.id === tempId
          ? { ...m, status: 'failed' as const, error_message: 'Erro de conexão' }
          : m
      ))
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setIsSending(false)
    }
  }, [])

  // =============================================
  // SEND MEDIA
  // =============================================
  const sendMedia = useCallback(async (params: SendMediaParams): Promise<InboxMessage | OptedOutSignal | null> => {
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

      const mediaUrl = params.override
        ? `/api/whatsapp/inbox/conversations/${params.conversationId}/media?override=true&override_reason=${encodeURIComponent(params.override.reason)}`
        : `/api/whatsapp/inbox/conversations/${params.conversationId}/media`
      const response = await authedFetch(
        mediaUrl,
        { method: 'POST', body: formData }
      )
      const data = await response.json()
      if (response.status === 409 && (data?.code === 'OPTED_OUT_OVERRIDABLE' || data?.code === 'OPTED_OUT')) {
        return {
          optedOut: true,
          overridable: data.code === 'OPTED_OUT_OVERRIDABLE',
          opted_out_at: data.contact_opted_out_at ?? null,
          opt_out_reason: data.opt_out_reason ?? null,
        } as OptedOutSignal
      }
      if (!response.ok) throw new Error(data.error || 'Failed to upload media')
      if (!data.success) throw new Error(data.error || 'Falha ao enviar mídia')

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
