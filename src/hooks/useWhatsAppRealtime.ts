// =============================================
// REALTIME HOOK - Supabase Realtime
// CORRIGIDO: Sem store side-effects, apenas callbacks
// =============================================

'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import type { WhatsAppConversation, WhatsAppMessage } from '@/types';

function getRealtimeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('[Realtime] Missing Supabase config');
    return null;
  }
  return createBrowserClient(url, key);
}

interface UseRealtimeOptions {
  organizationId?: string;
  conversationId?: string;
  onNewMessage?: (message: WhatsAppMessage) => void;
  onConversationUpdate?: (conversation: WhatsAppConversation) => void;
  onConversationInsert?: (conversation: WhatsAppConversation) => void;
  onStatusUpdate?: (message: Partial<WhatsAppMessage>) => void;
  enabled?: boolean;
}

interface UseRealtimeReturn {
  isConnected: boolean;
  broadcastTyping: (isTyping: boolean) => void;
  reconnect: () => void;
}

export function useWhatsAppRealtime(options: UseRealtimeOptions = {}): UseRealtimeReturn {
  const {
    organizationId,
    conversationId,
    onNewMessage,
    onConversationUpdate,
    onConversationInsert,
    onStatusUpdate,
    enabled = true,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const convChannelRef = useRef<RealtimeChannel | null>(null);
  const msgChannelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof getRealtimeClient>>(null);

  // Inicializar cliente
  useEffect(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = getRealtimeClient();
    }
  }, []);

  // =============================================
  // SUBSCRIÇÃO DE CONVERSAS
  // =============================================
  useEffect(() => {
    if (!organizationId || !enabled || !supabaseRef.current) return;

    const supabase = supabaseRef.current;
    const channelName = `conversations:${organizationId}`;
    
    console.log('[Realtime] Subscribing to conversations:', channelName);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_conversations',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          console.log('📥 [Realtime] Conversation INSERT:', payload.new?.id);
          const newConv = payload.new as WhatsAppConversation;
          if (newConv?.id) {
            onConversationInsert?.(newConv);
            onConversationUpdate?.(newConv);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_conversations',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          console.log('📝 [Realtime] Conversation UPDATE:', payload.new?.id);
          const updatedConv = payload.new as WhatsAppConversation;
          if (updatedConv?.id) {
            onConversationUpdate?.(updatedConv);
          }
        }
      )
      .subscribe((status) => {
        console.log('🔌 [Realtime] Conversations channel:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    convChannelRef.current = channel;

    return () => {
      console.log('[Realtime] Unsubscribing from conversations');
      channel.unsubscribe();
      convChannelRef.current = null;
    };
  }, [organizationId, enabled, onConversationUpdate, onConversationInsert]);

  // =============================================
  // SUBSCRIÇÃO DE MENSAGENS (por conversa)
  // =============================================
  useEffect(() => {
    if (!conversationId || !enabled || !supabaseRef.current) {
      if (msgChannelRef.current) {
        msgChannelRef.current.unsubscribe();
        msgChannelRef.current = null;
      }
      return;
    }

    const supabase = supabaseRef.current;
    const channelName = `messages:${conversationId}`;
    
    console.log('[Realtime] Subscribing to messages:', channelName);

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('📨 [Realtime] Message INSERT:', payload.new?.id);
          const newMessage = payload.new as WhatsAppMessage;
          if (newMessage?.id) {
            onNewMessage?.(newMessage);
            // Som de notificação para mensagens recebidas
            if (newMessage.direction === 'inbound') {
              try {
                new Audio('/sounds/notification.mp3').play().catch(() => {});
              } catch {}
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('📝 [Realtime] Message UPDATE (status):', payload.new?.id, payload.new?.status);
          const updatedMessage = payload.new as Partial<WhatsAppMessage>;
          if (updatedMessage?.id) {
            onStatusUpdate?.(updatedMessage);
          }
        }
      )
      .subscribe((status) => {
        console.log('🔌 [Realtime] Messages channel:', status);
      });

    msgChannelRef.current = channel;

    return () => {
      console.log('[Realtime] Unsubscribing from messages');
      channel.unsubscribe();
      msgChannelRef.current = null;
    };
  }, [conversationId, enabled, onNewMessage, onStatusUpdate]);

  // =============================================
  // BROADCAST TYPING
  // =============================================
  const broadcastTyping = useCallback((isTyping: boolean) => {
    if (!conversationId || !convChannelRef.current) return;
    convChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { conversationId, isTyping },
    });
  }, [conversationId]);

  // =============================================
  // RECONNECT
  // =============================================
  const reconnect = useCallback(() => {
    if (convChannelRef.current) {
      convChannelRef.current.unsubscribe();
      convChannelRef.current = null;
    }
    if (msgChannelRef.current) {
      msgChannelRef.current.unsubscribe();
      msgChannelRef.current = null;
    }
    // useEffects vão recriar os canais
  }, []);

  return {
    isConnected,
    broadcastTyping,
    reconnect,
  };
}

// =============================================
// HOOK PARA NOTIFICAÇÕES DESKTOP
// =============================================
export function useDesktopNotifications() {
  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission !== 'denied') {
      return (await Notification.requestPermission()) === 'granted';
    }
    return false;
  }, []);

  const showNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (typeof window === 'undefined' || Notification.permission !== 'granted') return;
    const n = new Notification(title, { icon: '/icon-192.png', ...options });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 5000);
    return n;
  }, []);

  return {
    requestPermission,
    showNotification,
    isSupported: typeof window !== 'undefined' && 'Notification' in window,
    permission: typeof window !== 'undefined' && 'Notification' in window 
      ? Notification.permission 
      : 'denied',
  };
}
