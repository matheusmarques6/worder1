// =============================================
// REALTIME HOOK - Supabase Realtime
// Escuta mensagens e conversas em tempo real
// =============================================

'use client';

import { useEffect, useCallback, useRef } from 'react';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { useWhatsAppStore } from '@/stores';
import type { WhatsAppConversation, WhatsAppMessage } from '@/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface UseRealtimeOptions {
  organizationId?: string;
  conversationId?: string;
  onNewMessage?: (message: WhatsAppMessage) => void;
  onConversationUpdate?: (conversation: WhatsAppConversation) => void;
  onStatusUpdate?: (status: any) => void;
}

export function useWhatsAppRealtime(options: UseRealtimeOptions = {}) {
  const {
    organizationId,
    conversationId,
    onNewMessage,
    onConversationUpdate,
    onStatusUpdate,
  } = options;

  const { 
    addMessage, 
    updateConversation, 
    setConversations,
    conversations,
    setConnected 
  } = useWhatsAppStore();

  const channelRef = useRef<RealtimeChannel | null>(null);
  const msgChannelRef = useRef<RealtimeChannel | null>(null);

  // =============================================
  // SUBSCRIÇÃO DE CONVERSAS
  // =============================================
  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel(`conversations:${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_conversations',
          filter: `organization_id=eq.${organizationId}`,
        },
        (payload) => {
          console.log('📥 Conversation update:', payload);

          if (payload.eventType === 'INSERT') {
            const newConv = payload.new as WhatsAppConversation;
            if (newConv && newConv.id) {
              setConversations([newConv, ...conversations]);
              onConversationUpdate?.(newConv);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedConv = payload.new as WhatsAppConversation;
            if (updatedConv && updatedConv.id) {
              updateConversation(updatedConv.id, updatedConv);
              onConversationUpdate?.(updatedConv);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('🔌 Conversations channel status:', status);
        setConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [organizationId, conversations, setConversations, updateConversation, onConversationUpdate, setConnected]);

  // =============================================
  // SUBSCRIÇÃO DE MENSAGENS
  // =============================================
  useEffect(() => {
    if (!conversationId) {
      if (msgChannelRef.current) {
        msgChannelRef.current.unsubscribe();
        msgChannelRef.current = null;
      }
      return;
    }

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('📨 New message:', payload);
          const newMessage = payload.new as WhatsAppMessage;
          if (newMessage && newMessage.id) {
            addMessage(conversationId, newMessage);
            onNewMessage?.(newMessage);

            if (newMessage.direction === 'inbound') {
              playNotificationSound();
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
          console.log('📝 Message status update:', payload);
          onStatusUpdate?.(payload.new);
        }
      )
      .subscribe((status) => {
        console.log('🔌 Messages channel status:', status);
      });

    msgChannelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [conversationId, addMessage, onNewMessage, onStatusUpdate]);

  // =============================================
  // NOTIFICAÇÃO SONORA
  // =============================================
  const playNotificationSound = useCallback(() => {
    try {
      const audio = new Audio('/sounds/notification.mp3');
      audio.volume = 0.5;
      audio.play().catch(() => {
        console.log('Audio autoplay blocked');
      });
    } catch (e) {
      console.log('Notification sound error:', e);
    }
  }, []);

  const broadcastTyping = useCallback((isTyping: boolean) => {
    if (!conversationId || !channelRef.current) return;

    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { conversationId, isTyping },
    });
  }, [conversationId]);

  const broadcastPresence = useCallback((status: 'online' | 'away' | 'offline') => {
    if (!channelRef.current) return;

    channelRef.current.track({
      status,
      timestamp: new Date().toISOString(),
    });
  }, []);

  return {
    broadcastTyping,
    broadcastPresence,
  };
}

// =============================================
// HOOK PARA NOTIFICAÇÕES DESKTOP
// =============================================
export function useDesktopNotifications() {
  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }, []);

  const showNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (typeof window === 'undefined') return;
    
    if (Notification.permission === 'granted') {
      const notification = new Notification(title, {
        icon: '/icon-192.png',
        badge: '/icon-72.png',
        ...options,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      setTimeout(() => notification.close(), 5000);

      return notification;
    }
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

export function createRealtimeSubscription(organizationId: string) {
  const channel = supabase
    .channel(`org:${organizationId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'whatsapp_conversations',
        filter: `organization_id=eq.${organizationId}`,
      },
      (payload) => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('whatsapp:conversation', { detail: payload }));
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'whatsapp_messages',
      },
      (payload) => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('whatsapp:message', { detail: payload }));
        }
      }
    )
    .subscribe();

  return () => channel.unsubscribe();
}
