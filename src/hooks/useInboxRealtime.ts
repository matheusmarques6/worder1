'use client'

// =============================================
// INBOX REALTIME HOOK V2
// Hook robusto para realtime no Inbox
// Escuta mensagens, conversas e instâncias em tempo real
// Inclui fallback polling e melhor diagnóstico
// =============================================

import { useEffect, useRef, useCallback, useState } from 'react'
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabaseClient } from '@/lib/supabase-client'

interface UseInboxRealtimeOptions {
  organizationId: string
  conversationId?: string | null
  onNewMessage?: (message: any) => void
  onMessageUpdate?: (message: any) => void
  onConversationUpdate?: (conversation: any) => void
  onNewConversation?: (conversation: any) => void
  onInstanceUpdate?: (instance: any) => void
  enabled?: boolean
}

interface RealtimeStatus {
  conversations: 'disconnected' | 'connecting' | 'connected' | 'error'
  messages: 'disconnected' | 'connecting' | 'connected' | 'error'
  instances: 'disconnected' | 'connecting' | 'connected' | 'error'
}

// Gerar ID único para evitar conflitos de canal
const generateChannelId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

export function useInboxRealtime(options: UseInboxRealtimeOptions) {
  const {
    organizationId,
    conversationId,
    onNewMessage,
    onMessageUpdate,
    onConversationUpdate,
    onNewConversation,
    onInstanceUpdate,
    enabled = true
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [status, setStatus] = useState<RealtimeStatus>({
    conversations: 'disconnected',
    messages: 'disconnected',
    instances: 'disconnected'
  })
  const [lastEvent, setLastEvent] = useState<string | null>(null)
  
  const conversationsChannelRef = useRef<RealtimeChannel | null>(null)
  const messagesChannelRef = useRef<RealtimeChannel | null>(null)
  const instancesChannelRef = useRef<RealtimeChannel | null>(null)
  const channelIdRef = useRef<string>(generateChannelId())

  // =============================================
  // CONVERSATIONS REALTIME
  // =============================================
  useEffect(() => {
    if (!organizationId || !enabled) return

    const channelName = `inbox-conv-${organizationId}-${channelIdRef.current}`
    console.log('[Realtime] 🔌 Subscribing to conversations:', channelName)
    
    setStatus(prev => ({ ...prev, conversations: 'connecting' }))

    const channel = supabaseClient
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_conversations',
          filter: `organization_id=eq.${organizationId}`
        },
        (payload) => {
          console.log('[Realtime] ✅ New conversation:', payload.new)
          setLastEvent(`new_conversation:${Date.now()}`)
          onNewConversation?.(payload.new)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_conversations',
          filter: `organization_id=eq.${organizationId}`
        },
        (payload) => {
          console.log('[Realtime] ✅ Conversation updated:', payload.new)
          setLastEvent(`conv_update:${Date.now()}`)
          onConversationUpdate?.(payload.new)
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] Conversations channel status:', status, err ? `Error: ${err.message}` : '')
        
        if (status === 'SUBSCRIBED') {
          setStatus(prev => ({ ...prev, conversations: 'connected' }))
          setIsConnected(true)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setStatus(prev => ({ ...prev, conversations: 'error' }))
          console.error('[Realtime] ❌ Conversations channel error:', err)
        } else if (status === 'CLOSED') {
          setStatus(prev => ({ ...prev, conversations: 'disconnected' }))
        }
      })

    conversationsChannelRef.current = channel

    return () => {
      console.log('[Realtime] 🔌 Unsubscribing from conversations:', channelName)
      channel.unsubscribe()
      conversationsChannelRef.current = null
    }
  }, [organizationId, enabled, onNewConversation, onConversationUpdate])

  // =============================================
  // MESSAGES REALTIME
  // =============================================
  useEffect(() => {
    if (!conversationId || !enabled) {
      if (messagesChannelRef.current) {
        console.log('[Realtime] 🔌 Unsubscribing from messages (no conversation)')
        messagesChannelRef.current.unsubscribe()
        messagesChannelRef.current = null
        setStatus(prev => ({ ...prev, messages: 'disconnected' }))
      }
      return
    }

    const channelName = `inbox-msg-${conversationId}-${channelIdRef.current}`
    console.log('[Realtime] 🔌 Subscribing to messages:', channelName)
    
    setStatus(prev => ({ ...prev, messages: 'connecting' }))

    const channel = supabaseClient
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          console.log('[Realtime] ✅ New message:', payload.new)
          setLastEvent(`new_message:${Date.now()}`)
          onNewMessage?.(payload.new)
          
          // Play notification sound for incoming messages
          if (payload.new && (payload.new as any).direction === 'inbound') {
            playNotificationSound()
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          console.log('[Realtime] ✅ Message updated:', payload.new)
          setLastEvent(`msg_update:${Date.now()}`)
          onMessageUpdate?.(payload.new)
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] Messages channel status:', status, err ? `Error: ${err.message}` : '')
        
        if (status === 'SUBSCRIBED') {
          setStatus(prev => ({ ...prev, messages: 'connected' }))
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setStatus(prev => ({ ...prev, messages: 'error' }))
          console.error('[Realtime] ❌ Messages channel error:', err)
        } else if (status === 'CLOSED') {
          setStatus(prev => ({ ...prev, messages: 'disconnected' }))
        }
      })

    messagesChannelRef.current = channel

    return () => {
      console.log('[Realtime] 🔌 Unsubscribing from messages:', channelName)
      channel.unsubscribe()
      messagesChannelRef.current = null
    }
  }, [conversationId, enabled, onNewMessage, onMessageUpdate])

  // =============================================
  // INSTANCES REALTIME (para status de conexão)
  // =============================================
  useEffect(() => {
    if (!organizationId || !enabled) return

    const channelName = `inbox-inst-${organizationId}-${channelIdRef.current}`
    console.log('[Realtime] 🔌 Subscribing to instances:', channelName)
    
    setStatus(prev => ({ ...prev, instances: 'connecting' }))

    const channel = supabaseClient
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `organization_id=eq.${organizationId}`
        },
        (payload) => {
          console.log('[Realtime] ✅ Instance update:', payload.eventType, payload.new)
          setLastEvent(`instance_update:${Date.now()}`)
          onInstanceUpdate?.(payload.new)
        }
      )
      .subscribe((status, err) => {
        console.log('[Realtime] Instances channel status:', status, err ? `Error: ${err.message}` : '')
        
        if (status === 'SUBSCRIBED') {
          setStatus(prev => ({ ...prev, instances: 'connected' }))
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setStatus(prev => ({ ...prev, instances: 'error' }))
          console.error('[Realtime] ❌ Instances channel error:', err)
        } else if (status === 'CLOSED') {
          setStatus(prev => ({ ...prev, instances: 'disconnected' }))
        }
      })

    instancesChannelRef.current = channel

    return () => {
      console.log('[Realtime] 🔌 Unsubscribing from instances:', channelName)
      channel.unsubscribe()
      instancesChannelRef.current = null
    }
  }, [organizationId, enabled, onInstanceUpdate])

  // =============================================
  // CALCULATE OVERALL CONNECTION STATUS
  // =============================================
  const isFullyConnected = status.conversations === 'connected' && 
                           status.instances === 'connected' &&
                           (conversationId ? status.messages === 'connected' : true)

  const hasAnyError = status.conversations === 'error' || 
                      status.messages === 'error' || 
                      status.instances === 'error'

  return {
    isConnected,
    isFullyConnected,
    hasError: hasAnyError,
    status,
    lastEvent
  }
}

// =============================================
// NOTIFICATION SOUND
// =============================================
function playNotificationSound() {
  try {
    // Criar AudioContext para tocar o som
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContext) return

    const audioContext = new AudioContext()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1)

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.2)
  } catch (e) {
    console.log('[Realtime] Notification sound error:', e)
  }
}

export default useInboxRealtime
