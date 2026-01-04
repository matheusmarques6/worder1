import { create } from 'zustand'

// ===============================
// INBOX STORE - WhatsApp Inbox
// ✅ SEM PERSIST - dados vêm do servidor
// ===============================

export interface WhatsAppNumber {
  id: string
  phone: string
  name: string
  isConnected: boolean
  provider: 'evolution' | 'cloud'
  instanceName?: string
}

export interface Message {
  id: string
  conversation_id: string
  content: string
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker'
  direction: 'inbound' | 'outbound'
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  sender_name?: string
  sender_phone?: string
  media_url?: string
  media_mime_type?: string
  timestamp: string
  created_at: string
  metadata?: Record<string, unknown>
}

export interface Conversation {
  id: string
  organization_id: string
  whatsapp_number_id: string
  contact_phone: string
  contact_name: string
  contact_avatar?: string
  last_message?: string
  last_message_at?: string
  unread_count: number
  status: 'open' | 'closed' | 'pending'
  assigned_agent_id?: string
  assigned_agent_name?: string
  bot_enabled: boolean
  tags: string[]
  created_at: string
  updated_at: string
  messages?: Message[]
}

interface InboxFilters {
  status: 'all' | 'open' | 'closed' | 'pending'
  assignedTo: 'all' | 'me' | 'unassigned' | string
  search: string
  tags: string[]
  numberId: string | null
}

interface InboxState {
  // Data
  conversations: Conversation[]
  currentConversation: Conversation | null
  messages: Record<string, Message[]>
  whatsappNumbers: WhatsAppNumber[]
  currentNumber: WhatsAppNumber | null
  
  // UI State
  isLoading: boolean
  isLoadingMessages: boolean
  error: string | null
  filters: InboxFilters
  
  // Actions - Conversations
  setConversations: (conversations: Conversation[]) => void
  addConversation: (conversation: Conversation) => void
  updateConversation: (id: string, data: Partial<Conversation>) => void
  removeConversation: (id: string) => void
  setCurrentConversation: (conversation: Conversation | null) => void
  
  // Actions - Messages
  setMessages: (conversationId: string, messages: Message[]) => void
  addMessage: (conversationId: string, message: Message) => void
  updateMessage: (conversationId: string, messageId: string, data: Partial<Message>) => void
  
  // Actions - WhatsApp Numbers
  setWhatsAppNumbers: (numbers: WhatsAppNumber[]) => void
  setCurrentNumber: (number: WhatsAppNumber | null) => void
  updateNumber: (id: string, data: Partial<WhatsAppNumber>) => void
  
  // Actions - UI
  setLoading: (loading: boolean) => void
  setLoadingMessages: (loading: boolean) => void
  setError: (error: string | null) => void
  setFilters: (filters: Partial<InboxFilters>) => void
  resetFilters: () => void
  
  // Actions - Cleanup
  clearAll: () => void
}

const defaultFilters: InboxFilters = {
  status: 'all',
  assignedTo: 'all',
  search: '',
  tags: [],
  numberId: null,
}

export const useInboxStore = create<InboxState>((set, get) => ({
  // Initial State
  conversations: [],
  currentConversation: null,
  messages: {},
  whatsappNumbers: [],
  currentNumber: null,
  isLoading: false,
  isLoadingMessages: false,
  error: null,
  filters: { ...defaultFilters },
  
  // Conversations
  setConversations: (conversations) => set({ conversations, error: null }),
  addConversation: (conversation) => set((state) => ({
    conversations: [conversation, ...state.conversations.filter(c => c.id !== conversation.id)],
  })),
  updateConversation: (id, data) => set((state) => ({
    conversations: state.conversations.map((c) => 
      c.id === id ? { ...c, ...data } : c
    ),
    currentConversation: state.currentConversation?.id === id 
      ? { ...state.currentConversation, ...data }
      : state.currentConversation,
  })),
  removeConversation: (id) => set((state) => ({
    conversations: state.conversations.filter((c) => c.id !== id),
    currentConversation: state.currentConversation?.id === id ? null : state.currentConversation,
  })),
  setCurrentConversation: (currentConversation) => set({ currentConversation }),
  
  // Messages
  setMessages: (conversationId, messages) => set((state) => ({
    messages: { ...state.messages, [conversationId]: messages },
  })),
  addMessage: (conversationId, message) => set((state) => ({
    messages: {
      ...state.messages,
      [conversationId]: [...(state.messages[conversationId] || []), message],
    },
  })),
  updateMessage: (conversationId, messageId, data) => set((state) => ({
    messages: {
      ...state.messages,
      [conversationId]: (state.messages[conversationId] || []).map((m) =>
        m.id === messageId ? { ...m, ...data } : m
      ),
    },
  })),
  
  // WhatsApp Numbers
  setWhatsAppNumbers: (whatsappNumbers) => set({ whatsappNumbers }),
  setCurrentNumber: (currentNumber) => set({ currentNumber }),
  updateNumber: (id, data) => set((state) => ({
    whatsappNumbers: state.whatsappNumbers.map((n) =>
      n.id === id ? { ...n, ...data } : n
    ),
    currentNumber: state.currentNumber?.id === id
      ? { ...state.currentNumber, ...data }
      : state.currentNumber,
  })),
  
  // UI
  setLoading: (isLoading) => set({ isLoading }),
  setLoadingMessages: (isLoadingMessages) => set({ isLoadingMessages }),
  setError: (error) => set({ error }),
  setFilters: (filters) => set((state) => ({
    filters: { ...state.filters, ...filters },
  })),
  resetFilters: () => set({ filters: { ...defaultFilters } }),
  
  // Cleanup
  clearAll: () => set({
    conversations: [],
    currentConversation: null,
    messages: {},
    whatsappNumbers: [],
    currentNumber: null,
    isLoading: false,
    isLoadingMessages: false,
    error: null,
    filters: { ...defaultFilters },
  }),
}))

// Selectors
export const useSelectedConversation = () => useInboxStore((state) => state.currentConversation)

export const useFilteredConversations = () => useInboxStore((state) => {
  const { conversations, filters } = state
  
  return conversations.filter((conv) => {
    // Status filter
    if (filters.status !== 'all' && conv.status !== filters.status) return false
    
    // Number filter
    if (filters.numberId && conv.whatsapp_number_id !== filters.numberId) return false
    
    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase()
      const matchesName = conv.contact_name?.toLowerCase().includes(search)
      const matchesPhone = conv.contact_phone?.includes(search)
      const matchesMessage = conv.last_message?.toLowerCase().includes(search)
      if (!matchesName && !matchesPhone && !matchesMessage) return false
    }
    
    // Tags filter
    if (filters.tags.length > 0) {
      const hasTag = filters.tags.some(tag => conv.tags?.includes(tag))
      if (!hasTag) return false
    }
    
    return true
  })
})

export const useConversationMessages = (conversationId: string | undefined) => 
  useInboxStore((state) => conversationId ? state.messages[conversationId] || [] : [])
