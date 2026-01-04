import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { 
  User, 
  Pipeline, 
  PipelineStage, 
  Deal, 
  Contact, 
  WhatsAppConversation,
  Automation 
} from '@/types'

// ===============================
// STORE (SHOPIFY) STORE
// ✅ SEM PERSIST - dados vêm do servidor
// ===============================
export interface ShopifyStore {
  id: string
  name: string
  domain: string
  email?: string
  currency?: string
  isActive: boolean
  totalOrders?: number
  totalRevenue?: number
  lastSyncAt?: string
}

interface StoreState {
  stores: ShopifyStore[]
  currentStore: ShopifyStore | null
  isLoading: boolean
  error: string | null
  
  setStores: (stores: ShopifyStore[]) => void
  setCurrentStore: (store: ShopifyStore | null) => void
  addStore: (store: ShopifyStore) => void
  updateStore: (id: string, data: Partial<ShopifyStore>) => void
  removeStore: (id: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearStores: () => void
}

// ✅ SEM PERSIST! Dados devem vir do servidor a cada login
export const useStoreStore = create<StoreState>((set, get) => ({
  stores: [],
  currentStore: null,
  isLoading: false,
  error: null,
  
  setStores: (stores) => set({ stores, error: null }),
  setCurrentStore: (currentStore) => set({ currentStore }),
  addStore: (store) => set((state) => ({ 
    stores: [...state.stores, store],
    currentStore: state.currentStore || store,
  })),
  updateStore: (id, data) => set((state) => ({
    stores: state.stores.map((s) => (s.id === id ? { ...s, ...data } : s)),
    currentStore: state.currentStore?.id === id 
      ? { ...state.currentStore, ...data } 
      : state.currentStore,
  })),
  removeStore: (id) => set((state) => ({
    stores: state.stores.filter((s) => s.id !== id),
    currentStore: state.currentStore?.id === id 
      ? state.stores.find(s => s.id !== id) || null 
      : state.currentStore,
  })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearStores: () => set({ stores: [], currentStore: null, error: null, isLoading: false }),
}))

// ===============================
// AUTH STORE
// ✅ SEM PERSIST - sessão gerenciada pelo Supabase
// ===============================
interface AuthState {
  user: User | null
  isLoading: boolean
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  logout: () => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => {
    useStoreStore.getState().clearStores()
    useCRMStore.getState().clearAll()
    useWhatsAppStore.getState().clearAll()
    useAutomationStore.getState().clearAll()
    set({ user: null, isLoading: false })
  },
  signOut: async () => {
    try {
      useStoreStore.getState().clearStores()
      useCRMStore.getState().clearAll()
      useWhatsAppStore.getState().clearAll()
      useAutomationStore.getState().clearAll()
      set({ user: null, isLoading: false })
    } catch (error) {
      console.error('Logout error:', error)
    }
  },
}))

// ===============================
// UI STORE  
// ✅ ESTE SIM pode ter persist (preferências de UI)
// ===============================
interface UIState {
  sidebarCollapsed: boolean
  currentPage: string
  searchQuery: string
  toggleSidebar: () => void
  setCurrentPage: (page: string) => void
  setSearchQuery: (query: string) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      currentPage: 'dashboard',
      searchQuery: '',
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setCurrentPage: (currentPage) => set({ currentPage }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
    }),
    {
      name: 'worder-ui-storage',
      partialize: (state) => ({ 
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
)

// ===============================
// CRM STORE
// ✅ SEM PERSIST - dados vêm do servidor
// ===============================
interface CRMState {
  pipelines: Pipeline[]
  stages: PipelineStage[]
  deals: Deal[]
  contacts: Contact[]
  currentPipeline: Pipeline | null
  isLoading: boolean
  error: string | null
  
  setPipelines: (pipelines: Pipeline[]) => void
  setStages: (stages: PipelineStage[]) => void
  setDeals: (deals: Deal[]) => void
  setContacts: (contacts: Contact[]) => void
  setCurrentPipeline: (pipeline: Pipeline | null) => void
  addDeal: (deal: Deal) => void
  updateDeal: (id: string, data: Partial<Deal>) => void
  moveDeal: (dealId: string, stageId: string, position: number) => void
  removeDeal: (id: string) => void
  addContact: (contact: Contact) => void
  updateContact: (id: string, data: Partial<Contact>) => void
  removeContact: (id: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearAll: () => void
}

export const useCRMStore = create<CRMState>((set) => ({
  pipelines: [],
  stages: [],
  deals: [],
  contacts: [],
  currentPipeline: null,
  isLoading: false,
  error: null,
  
  setPipelines: (pipelines) => set({ pipelines }),
  setStages: (stages) => set({ stages }),
  setDeals: (deals) => set({ deals }),
  setContacts: (contacts) => set({ contacts }),
  setCurrentPipeline: (currentPipeline) => set({ currentPipeline }),
  addDeal: (deal) => set((state) => ({ deals: [...state.deals, deal] })),
  updateDeal: (id, data) => set((state) => ({
    deals: state.deals.map((d) => (d.id === id ? { ...d, ...data } : d)),
  })),
  moveDeal: (dealId, stageId, position) => set((state) => ({
    deals: state.deals.map((d) => 
      d.id === dealId ? { ...d, stage_id: stageId, position } : d
    ),
  })),
  removeDeal: (id) => set((state) => ({
    deals: state.deals.filter((d) => d.id !== id),
  })),
  addContact: (contact) => set((state) => ({ contacts: [...state.contacts, contact] })),
  updateContact: (id, data) => set((state) => ({
    contacts: state.contacts.map((c) => (c.id === id ? { ...c, ...data } : c)),
  })),
  removeContact: (id) => set((state) => ({
    contacts: state.contacts.filter((c) => c.id !== id),
  })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearAll: () => set({
    pipelines: [],
    stages: [],
    deals: [],
    contacts: [],
    currentPipeline: null,
    isLoading: false,
    error: null,
  }),
}))

// ===============================
// WHATSAPP STORE
// ✅ SEM PERSIST - dados vêm do servidor
// ===============================
interface WhatsAppState {
  conversations: WhatsAppConversation[]
  currentConversation: WhatsAppConversation | null
  isConnected: boolean
  isLoading: boolean
  error: string | null
  
  setConversations: (conversations: WhatsAppConversation[]) => void
  setCurrentConversation: (conversation: WhatsAppConversation | null) => void
  addConversation: (conversation: WhatsAppConversation) => void
  updateConversation: (id: string, data: Partial<WhatsAppConversation>) => void
  setConnected: (connected: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearAll: () => void
}

export const useWhatsAppStore = create<WhatsAppState>((set) => ({
  conversations: [],
  currentConversation: null,
  isConnected: false,
  isLoading: false,
  error: null,
  
  setConversations: (conversations) => set({ conversations }),
  setCurrentConversation: (currentConversation) => set({ currentConversation }),
  addConversation: (conversation) => set((state) => ({
    conversations: [...state.conversations, conversation],
  })),
  updateConversation: (id, data) => set((state) => ({
    conversations: state.conversations.map((c) => (c.id === id ? { ...c, ...data } : c)),
  })),
  setConnected: (isConnected) => set({ isConnected }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearAll: () => set({
    conversations: [],
    currentConversation: null,
    isConnected: false,
    isLoading: false,
    error: null,
  }),
}))

// ===============================
// AUTOMATION STORE
// ✅ SEM PERSIST - dados vêm do servidor
// ===============================
interface AutomationState {
  automations: Automation[]
  isLoading: boolean
  error: string | null
  
  setAutomations: (automations: Automation[]) => void
  addAutomation: (automation: Automation) => void
  updateAutomation: (id: string, data: Partial<Automation>) => void
  removeAutomation: (id: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearAll: () => void
}

export const useAutomationStore = create<AutomationState>((set) => ({
  automations: [],
  isLoading: false,
  error: null,
  
  setAutomations: (automations) => set({ automations }),
  addAutomation: (automation) => set((state) => ({
    automations: [...state.automations, automation],
  })),
  updateAutomation: (id, data) => set((state) => ({
    automations: state.automations.map((a) => (a.id === id ? { ...a, ...data } : a)),
  })),
  removeAutomation: (id) => set((state) => ({
    automations: state.automations.filter((a) => a.id !== id),
  })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  clearAll: () => set({
    automations: [],
    isLoading: false,
    error: null,
  }),
}))

// Re-export do inboxStore
export { useInboxStore, useSelectedConversation, useFilteredConversations, useConversationMessages } from './inboxStore'
export type { Conversation, Message, WhatsAppNumber } from './inboxStore'
