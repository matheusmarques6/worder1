import { create } from 'zustand'
import type { WhatsAppConversation } from '@/types'

interface WhatsAppState {
  conversations: WhatsAppConversation[]
  selectedConversation: WhatsAppConversation | null
  messages: Record<string, any[]>
  isLoading: boolean
  isConnected: boolean

  setConversations: (conversations: WhatsAppConversation[]) => void
  setSelectedConversation: (conversation: WhatsAppConversation | null) => void
  addConversation: (conversation: WhatsAppConversation) => void
  updateConversation: (id: string, data: Partial<WhatsAppConversation>) => void
  setMessages: (conversationId: string, messages: any[]) => void
  addMessage: (conversationId: string, message: any) => void
  setLoading: (loading: boolean) => void
  setConnected: (connected: boolean) => void
  clearAll: () => void
}

export const useWhatsAppStore = create<WhatsAppState>((set) => ({
  conversations: [],
  selectedConversation: null,
  messages: {},
  isLoading: false,
  isConnected: false,

  setConversations: (conversations) => set({ conversations }),
  setSelectedConversation: (selectedConversation) => set({ selectedConversation }),
  addConversation: (conversation) => set((state) => ({
    conversations: [conversation, ...state.conversations]
  })),
  updateConversation: (id, data) => set((state) => ({
    conversations: state.conversations.map((c) => (c.id === id ? { ...c, ...data } : c)),
    selectedConversation: state.selectedConversation?.id === id
      ? { ...state.selectedConversation, ...data }
      : state.selectedConversation,
  })),
  setMessages: (conversationId, messages) => set((state) => ({
    messages: { ...state.messages, [conversationId]: messages },
  })),
  addMessage: (conversationId, message) => set((state) => ({
    messages: {
      ...state.messages,
      [conversationId]: [...(state.messages[conversationId] || []), message]
    },
  })),
  setLoading: (isLoading) => set({ isLoading }),
  setConnected: (isConnected) => set({ isConnected }),

  clearAll: () => set({
    conversations: [],
    selectedConversation: null,
    messages: {},
    isLoading: false,
    isConnected: false,
  }),
}))
