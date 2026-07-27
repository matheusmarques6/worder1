'use client'

// =============================================
// CLOUD INBOX REALTIME HOOK
//
// Assina as tabelas BASE do Cloud API (whatsapp_cloud_conversations /
// whatsapp_cloud_messages). Postgres Realtime nao publica VIEWs, entao
// a view whatsapp_inbox_messages NAO pode ser assinada — assinamos as
// tabelas e mapeamos o payload pro shape que o InboxContent espera.
//
// Auth: o client do browser e anon (login via cookie httpOnly), e as
// tabelas cloud tem RLS org-scoped. Sem realtime.setAuth(jwt) o servidor
// de realtime nao entrega NENHUM evento. O token vem do endpoint
// /api/auth/realtime-token, que devolve tambem `expiresAt` (epoch seconds
// do claim `exp` do JWT); a renovacao e agendada com base nesse valor
// (com margem de seguranca), caindo no fallback de 45min so se
// `expiresAt` vier ausente/invalido.
// =============================================

import { useEffect, useRef, useState } from 'react'
import { supabaseClient } from '@/lib/supabase-client'
import { authedFetch } from '@/lib/api/authed-fetch'
import {
  mapCloudConversationRow,
  mapCloudMessageRow,
  type RealtimeConversationEvent,
} from '@/lib/whatsapp/inbox-realtime-mappers'
import type { InboxMessage } from '@/types/inbox'

const TOKEN_REFRESH_MS = 45 * 60 * 1000 // fallback: sem expiresAt, renova em 45min (JWT expira em 1h)
const TOKEN_RETRY_MS = 10 * 1000 // 1 retry rapido antes de cair no fallback, pra falha transiente nao compor
const TOKEN_MIN_REFRESH_MS = 30 * 1000 // nunca agenda renovacao mais cedo que isso (evita martelar em token invalido)
const TOKEN_SAFETY_MARGIN_MS = 60 * 1000 // renova este tanto ANTES do expiresAt real

/**
 * Calcula em quanto tempo renovar o token, a partir do `expiresAt` (epoch
 * seconds) devolvido por /api/auth/realtime-token. Se `expiresAt` estiver
 * ausente/invalido, cai no fallback fixo de 45min — nunca deixa de agendar
 * a proxima renovacao.
 */
function computeRenewalDelayMs(expiresAt: unknown): number {
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
    return TOKEN_REFRESH_MS
  }
  const rawDelay = expiresAt * 1000 - Date.now() - TOKEN_SAFETY_MARGIN_MS
  return Math.max(rawDelay, TOKEN_MIN_REFRESH_MS)
}

type ChannelState = 'idle' | 'connected' | 'error'

interface UseCloudInboxRealtimeOptions {
  organizationId: string | null
  conversationId?: string | null
  onNewConversation?: (conversation: RealtimeConversationEvent) => void
  onConversationUpdate?: (conversation: RealtimeConversationEvent) => void
  onNewMessage?: (message: InboxMessage) => void
  onMessageUpdate?: (message: InboxMessage) => void
  enabled?: boolean
}

interface UseCloudInboxRealtimeReturn {
  isConnected: boolean
  hasError: boolean
}

export function useCloudInboxRealtime(
  options: UseCloudInboxRealtimeOptions,
): UseCloudInboxRealtimeReturn {
  const { organizationId, conversationId, enabled = true } = options

  const [authReady, setAuthReady] = useState(false)
  const [conversationsState, setConversationsState] = useState<ChannelState>('idle')
  const [messagesState, setMessagesState] = useState<ChannelState>('idle')

  // Callbacks em ref: a identidade deles muda a cada render do
  // InboxContent e NAO pode derrubar/recriar canal (bug do hook legado
  // que tinha callbacks nas deps do useEffect).
  const callbacksRef = useRef(options)
  callbacksRef.current = options

  // ---- Auth do Realtime ----
  useEffect(() => {
    if (!enabled || !organizationId) return
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    // Ja tentou 1 retry rapido para a falha atual? Evita martelar o
    // endpoint: 1 retry em 10s, se falhar de novo cai pro fallback de 45min.
    let hasRetried = false

    const scheduleNext = (delayMs: number) => {
      if (cancelled) return
      timeoutId = setTimeout(applyToken, delayMs)
    }

    const handleFailure = () => {
      if (!hasRetried) {
        hasRetried = true
        scheduleNext(TOKEN_RETRY_MS)
      } else {
        // 2a falha seguida: para de tentar rapido, volta pro fallback fixo
        // e reseta o contador pro proximo ciclo poder retry-once de novo.
        hasRetried = false
        scheduleNext(TOKEN_REFRESH_MS)
      }
    }

    const applyToken = async () => {
      try {
        const res = await authedFetch('/api/auth/realtime-token')
        if (cancelled) return
        if (!res.ok) {
          console.warn('[CloudRealtime] realtime-token failed:', res.status)
          handleFailure()
          return
        }
        const data = await res.json()
        if (cancelled) return
        if (!data.token) {
          console.warn('[CloudRealtime] realtime-token response missing token')
          handleFailure()
          return
        }
        // setAuth propaga o token para canais ja conectados tambem
        supabaseClient.realtime.setAuth(data.token)
        setAuthReady(true)
        hasRetried = false
        scheduleNext(computeRenewalDelayMs(data.expiresAt))
      } catch (err) {
        if (cancelled) return
        console.warn('[CloudRealtime] Failed to fetch realtime token:', err)
        handleFailure()
      }
    }

    applyToken()
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [enabled, organizationId])

  // ---- Canal de conversas (org inteira) ----
  useEffect(() => {
    if (!enabled || !organizationId || !authReady) return

    const channelName = `cloud-inbox-conv-${organizationId}`
    console.log('[CloudRealtime] Subscribing:', channelName)

    const channel = supabaseClient
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_cloud_conversations',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          callbacksRef.current.onNewConversation?.(
            mapCloudConversationRow(payload.new as Record<string, any>),
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_cloud_conversations',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          callbacksRef.current.onConversationUpdate?.(
            mapCloudConversationRow(payload.new as Record<string, any>),
          )
        },
      )
      .subscribe((status, err) => {
        console.log('[CloudRealtime] conversations status:', status, err?.message || '')
        if (status === 'SUBSCRIBED') {
          setConversationsState('connected')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConversationsState('error')
        } else if (status === 'CLOSED') {
          setConversationsState('idle')
        }
      })

    return () => {
      console.log('[CloudRealtime] Unsubscribing:', channelName)
      supabaseClient.removeChannel(channel)
      setConversationsState('idle')
    }
  }, [enabled, organizationId, authReady])

  // ---- Canal de mensagens (conversa selecionada) ----
  useEffect(() => {
    if (!enabled || !organizationId || !conversationId || !authReady) return

    const channelName = `cloud-inbox-msg-${conversationId}`
    // Compound filter (comma-joined, suportado pelo @supabase/realtime-js):
    // organization_id ALEM de conversation_id — o contrato exige os dois
    // canais filtrados por organization_id (RLS ja re-checa isso no server,
    // mas o filtro do client tem que casar com o contrato escrito).
    const messagesFilter = `organization_id=eq.${organizationId},conversation_id=eq.${conversationId}`
    console.log('[CloudRealtime] Subscribing:', channelName)

    const channel = supabaseClient
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_cloud_messages',
          filter: messagesFilter,
        },
        (payload) => {
          const message = mapCloudMessageRow(payload.new as Record<string, any>)
          callbacksRef.current.onNewMessage?.(message)
          if (message.direction === 'inbound') {
            playNotificationSound()
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_cloud_messages',
          filter: messagesFilter,
        },
        (payload) => {
          callbacksRef.current.onMessageUpdate?.(
            mapCloudMessageRow(payload.new as Record<string, any>),
          )
        },
      )
      .subscribe((status, err) => {
        console.log('[CloudRealtime] messages status:', status, err?.message || '')
        if (status === 'SUBSCRIBED') {
          setMessagesState('connected')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setMessagesState('error')
        } else if (status === 'CLOSED') {
          setMessagesState('idle')
        }
      })

    return () => {
      console.log('[CloudRealtime] Unsubscribing:', channelName)
      supabaseClient.removeChannel(channel)
      setMessagesState('idle')
    }
  }, [enabled, organizationId, conversationId, authReady])

  return {
    // O canal de conversas e o "coracao" do inbox: e ele que dita se o
    // polling pode relaxar para 30s (Task 5).
    isConnected: conversationsState === 'connected',
    hasError: conversationsState === 'error' || messagesState === 'error',
  }
}

// Mesmo beep do hook legado (useInboxRealtime) — o legado nao exporta a
// funcao e sera aposentado, entao a copia vive aqui.
function playNotificationSound() {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextCtor) return

    const audioContext = new AudioContextCtor()
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
    console.log('[CloudRealtime] Notification sound error:', e)
  }
}

export default useCloudInboxRealtime
