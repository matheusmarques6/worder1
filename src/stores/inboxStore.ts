import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Types
export interface Contact {
  id: string
  phone_number: string
  name?: string
  profile_picture_url?: string
  email?: string
  tags?: string[]
}

export interface Conversation {
  id: string
  whatsapp_number_id: string
  contact_id: string
  contact?: Contact
  status: 'open' | 'closed' | 'pending'
  last_message?: string
  last_message_at?: string
  unread_count: number
  assigned_agent_id?: string
  assigned_agent?: {
    id: string
    name: string
    type: 'human' | 'ai'
  }
  ai_enabled?: boolean
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  whatsapp_number_id: string
  message_id?: string
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'template'
  content?: string
  media_url?: string
  media_mime_type?: string
  is_from_me: boolean
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  created_at: string
  // AI
  is_ai_generated?: boolean
  ai_model?: string
}

export interface WhatsAppNumber {
  id: string
  phone_number: string
  display_name?: string
  provider: 'meta_cloud' | 'evolution'
  is_connected: boolean
  is_active: boolean
}

export interface Agent {
  id: string
  name: string
  type: 'human' | 'ai'
  status: 'online' | 'offline' | 'away' | 'busy'
  is_active: boolean
}

// Store State
interface InboxState {
  // Data
  conversations: Conversation[]
  messages: Record<string, Message[]> // keyed by conversation_id
  whatsappNumbers: WhatsAppNumber[]
  agents: Agent[]
  
  // Selection
  selectedNumberId: string | null
  selectedConversationId: string | null
  
  // Filters
  searchQuery: string
  statusFilter: 'all' | 'open' | 'closed' | 'pending'
  agentFilter: string | null // agent_id or null for all
  
  // UI State
  isLoading: boolean
  isSending: boolean
  error: string | null
  
  // Actions
  setConversations: (conversations: Conversation[]) => void
  addConversation: (conversation: Conversation) => void
  updateConversation: (id: string, updates: Partial<Conversation>) => void
  
  setMessages: (conversationId: string, messages: Message[]) => void
  addMessage: (conversationId: string, message: Message) => void
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void
  
  setWhatsAppNumbers: (numbers: WhatsAppNumber[]) => void
  setAgents: (agents: Agent[]) => void
  
  setSelectedNumber: (numberId: string | null) => void
  setSelectedConversation: (conversationId: string | null) => void
  
  setSearchQuery: (query: string) => void
  setStatusFilter: (status: 'all' | 'open' | 'closed' | 'pending') => void
  setAgentFilter: (agentId: string | null) => void
  
  setLoading: (loading: boolean) => void
  setSending: (sending: boolean) => void
  setError: (error: string | null) => void
  
  // Computed
  getFilteredConversations: () => Conversation[]
  getSelectedConversation: () => Conversation | null
  getConversationMessages: (conversationId: string) => Message[]
  
  // Realtime handlers
  handleNewMessage: (message: Message) => void
  handleConversationUpdate: (conversation: Conversation) => void
  handleMessageStatusUpdate: (messageId: string, status: string) => void
  
  // Reset
  reset: () => void
  clearAll: () => void
}

const initialState = {
  conversations: [],
  messages: {},
  whatsappNumbers: [],
  agents: [],
  selectedNumberId: null,
  selectedConversationId: null,
  searchQuery: '',
  statusFilter: 'all' as const,
  agentFilter: null,
  isLoading: false,
  isSending: false,
  error: null,
}

export const useInboxStore = create<InboxState>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Setters
      setConversations: (conversations) => set({ conversations }),
      
      addConversation: (conversation) => set((state) => ({
        conversations: [conversation, ...state.conversations.filter(c => c.id !== conversation.id)],
      })),
      
      updateConversation: (id, updates) => set((state) => ({
        conversations: state.conversations.map(c =>
          c.id === id ? { ...c, ...updates } : c
        ),
      })),

      setMessages: (conversationId, messages) => set((state) => ({
        messages: { ...state.messages, [conversationId]: messages },
      })),
      
      addMessage: (conversationId, message) => set((state) => {
        const existing = state.messages[conversationId] || []
        // Avoid duplicates
        if (existing.some(m => m.id === message.id)) {
          return state
        }
        return {
          messages: {
            ...state.messages,
            [conversationId]: [...existing, message],
          },
        }
      }),
      
      updateMessage: (conversationId, messageId, updates) => set((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: (state.messages[conversationId] || []).map(m =>
            m.id === messageId ? { ...m, ...updates } : m
          ),
        },
      })),

      setWhatsAppNumbers: (numbers) => set({ whatsappNumbers: numbers }),
      setAgents: (agents) => set({ agents }),

      setSelectedNumber: (numberId) => set({ 
        selectedNumberId: numberId,
        selectedConversationId: null, // Reset conversation when changing number
      }),
      
      setSelectedConversation: (conversationId) => set({ 
        selectedConversationId: conversationId,
      }),

      setSearchQuery: (query) => set({ searchQuery: query }),
      setStatusFilter: (status) => set({ statusFilter: status }),
      setAgentFilter: (agentId) => set({ agentFilter: agentId }),

      setLoading: (loading) => set({ isLoading: loading }),
      setSending: (sending) => set({ isSending: sending }),
      setError: (error) => set({ error }),

      // Computed
      getFilteredConversations: () => {
        const state = get()
        let filtered = state.conversations

        // Filter by number
        if (state.selectedNumberId) {
          filtered = filtered.filter(c => c.whatsapp_number_id === state.selectedNumberId)
        }

        // Filter by status
        if (state.statusFilter !== 'all') {
          filtered = filtered.filter(c => c.status === state.statusFilter)
        }

        // Filter by agent
        if (state.agentFilter) {
          filtered = filtered.filter(c => c.assigned_agent_id === state.agentFilter)
        }

        // Filter by search
        if (state.searchQuery) {
          const query = state.searchQuery.toLowerCase()
          filtered = filtered.filter(c => 
            c.contact?.name?.toLowerCase().includes(query) ||
            c.contact?.phone_number?.includes(query) ||
            c.last_message?.toLowerCase().includes(query)
          )
        }

        // Sort by last message
        filtered.sort((a, b) => {
          const aTime = new Date(a.last_message_at || a.updated_at).getTime()
          const bTime = new Date(b.last_message_at || b.updated_at).getTime()
          return bTime - aTime
        })

        return filtered
      },

      getSelectedConversation: () => {
        const state = get()
        if (!state.selectedConversationId) return null
        return state.conversations.find(c => c.id === state.selectedConversationId) || null
      },

      getConversationMessages: (conversationId) => {
        const state = get()
        return state.messages[conversationId] || []
      },

      // Realtime handlers
      handleNewMessage: (message) => {
        const state = get()
        
        // Add message
        state.addMessage(message.conversation_id, message)

        // Update conversation
        const conversation = state.conversations.find(c => c.id === message.conversation_id)
        if (conversation) {
          state.updateConversation(message.conversation_id, {
            last_message: message.content || `[${message.type}]`,
            last_message_at: message.created_at,
            unread_count: message.is_from_me ? conversation.unread_count : conversation.unread_count + 1,
          })
        }
      },

      handleConversationUpdate: (conversation) => {
        const state = get()
        const exists = state.conversations.some(c => c.id === conversation.id)
        
        if (exists) {
          state.updateConversation(conversation.id, conversation)
        } else {
          state.addConversation(conversation)
        }
      },

      handleMessageStatusUpdate: (messageId, status) => {
        const state = get()
        
        // Find and update message in all conversations
        Object.keys(state.messages).forEach(conversationId => {
          const messages = state.messages[conversationId]
          const messageIndex = messages.findIndex(m => m.id === messageId || m.message_id === messageId)
          
          if (messageIndex !== -1) {
            state.updateMessage(conversationId, messages[messageIndex].id, { status: status as any })
          }
        })
      },

      // Reset
      reset: () => set(initialState),
      
      // ✅ NOVO: Limpar dados (mantém preferências de UI)
      clearAll: () => set({
        conversations: [],
        messages: {},
        whatsappNumbers: [],
        agents: [],
        selectedConversationId: null,
        searchQuery: '',
        isLoading: false,
        isSending: false,
        error: null,
        // ✅ Mantém: selectedNumberId, statusFilter, agentFilter (preferências)
      }),
    }),
    {
      name: 'inbox-storage',
      // ✅ PARTIALIZE: Só persiste preferências de UI, NÃO dados do servidor
      partialize: (state) => ({
        selectedNumberId: state.selectedNumberId,
        statusFilter: state.statusFilter,
      }),
    }
  )
)

// Selectors (for performance)
export const useSelectedConversation = () => useInboxStore((state) => state.getSelectedConversation())
export const useFilteredConversations = () => useInboxStore((state) => state.getFilteredConversations())
export const useConversationMessages = (conversationId: string) => 
  useInboxStore((state) => state.getConversationMessages(conversationId))
