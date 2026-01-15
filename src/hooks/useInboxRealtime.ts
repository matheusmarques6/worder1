'use client'

// =============================================
// INBOX REALTIME HOOK
// Hook simplificado para realtime no Inbox
// Escuta mensagens, conversas e instâncias em tempo real
// =============================================

import { useEffect, useRef, useCallback, useState } from 'react'
import { RealtimeChannel } from '@supabase/supabase-js'
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
  const conversationsChannelRef = useRef<RealtimeChannel | null>(null)
  const messagesChannelRef = useRef<RealtimeChannel | null>(null)
  const instancesChannelRef = useRef<RealtimeChannel | null>(null)

  // =============================================
  // CONVERSATIONS REALTIME
  // =============================================
  useEffect(() => {
    if (!organizationId || !enabled) return

    console.log('[Realtime] Subscribing to conversations for org:', organizationId)

    const channel = supabaseClient
      .channel(`inbox-conversations-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_conversations',
          filter: `organization_id=eq.${organizationId}`
        },
        (payload) => {
          console.log('[Realtime] New conversation:', payload.new)
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
          console.log('[Realtime] Conversation updated:', payload.new)
          onConversationUpdate?.(payload.new)
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Conversations channel status:', status)
        setIsConnected(status === 'SUBSCRIBED')
      })

    conversationsChannelRef.current = channel

    return () => {
      console.log('[Realtime] Unsubscribing from conversations')
      channel.unsubscribe()
    }
  }, [organizationId, enabled, onNewConversation, onConversationUpdate])

  // =============================================
  // MESSAGES REALTIME
  // =============================================
  useEffect(() => {
    if (!conversationId || !enabled) {
      if (messagesChannelRef.current) {
        console.log('[Realtime] Unsubscribing from messages (no conversation)')
        messagesChannelRef.current.unsubscribe()
        messagesChannelRef.current = null
      }
      return
    }

    console.log('[Realtime] Subscribing to messages for conversation:', conversationId)

    const channel = supabaseClient
      .channel(`inbox-messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          console.log('[Realtime] New message:', payload.new)
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
          console.log('[Realtime] Message updated:', payload.new)
          onMessageUpdate?.(payload.new)
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Messages channel status:', status)
      })

    messagesChannelRef.current = channel

    return () => {
      console.log('[Realtime] Unsubscribing from messages')
      channel.unsubscribe()
    }
  }, [conversationId, enabled, onNewMessage, onMessageUpdate])

  // =============================================
  // INSTANCES REALTIME (para status de conexão)
  // =============================================
  useEffect(() => {
    if (!organizationId || !enabled) return

    console.log('[Realtime] Subscribing to instances for org:', organizationId)

    const channel = supabaseClient
      .channel(`inbox-instances-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `organization_id=eq.${organizationId}`
        },
        (payload) => {
          console.log('[Realtime] Instance update:', payload)
          onInstanceUpdate?.(payload.new)
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Instances channel status:', status)
      })

    instancesChannelRef.current = channel

    return () => {
      console.log('[Realtime] Unsubscribing from instances')
      channel.unsubscribe()
    }
  }, [organizationId, enabled, onInstanceUpdate])

  return {
    isConnected
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
