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
  
  setStores: (stores: ShopifyStore[]) => void
  setCurrentStore: (store: ShopifyStore | null) => void
  addStore: (store: ShopifyStore) => void
  updateStore: (id: string, data: Partial<ShopifyStore>) => void
  removeStore: (id: string) => void
  setLoading: (loading: boolean) => void
  clearStores: () => void
}

export const useStoreStore = create<StoreState>()(
  persist(
    (set, get) => ({
      stores: [],
      currentStore: null,
      isLoading: false,
      
      setStores: (stores) => set({ stores }),
      
      // ✅ CORRIGIDO: Ao trocar de loja, limpar dados dos outros stores
      setCurrentStore: (newStore) => {
        const previousStore = get().currentStore;
        
        // Se mudou de loja (e não é a mesma), limpar todos os dados
        if (previousStore?.id !== newStore?.id) {
          console.log(`[Store] Trocando de loja: ${previousStore?.name || 'nenhuma'} → ${newStore?.name || 'nenhuma'}`);
          
          // Limpar CRM Store (contatos, deals, pipelines)
          useCRMStore.getState().clearAll();
          
          // Limpar WhatsApp Store
          useWhatsAppStore.getState().clearAll();
          
          // Limpar Automation Store  
          useAutomationStore.getState().clearAll();
          
        // Limpar Inbox Store (importar dinamicamente para evitar circular)
          import('./inboxStore').then(({ useInboxStore }) => {
            useInboxStore.getState().reset();
          });
        }
        
        set({ currentStore: newStore });
      },
      
      addStore: (store) => set((state) => ({ 
        stores: [...state.stores, store],
        currentStore: state.currentStore || store, // Auto-select if first store
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
      clearStores: () => set({ stores: [], currentStore: null, isLoading: false }),
    }),
    {
      name: 'worder-stores',
    }
  )
)

// ===============================
// AUTH STORE
// ===============================
interface AuthState {
  user: User | null
  isLoading: boolean
  error: string | null
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  logout: () => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  error: null,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  logout: () => {
    // ✅ CRÍTICO: Limpar TODOS os stores ao deslogar
    useStoreStore.getState().clearStores()
    useCRMStore.getState().clearAll()
    useWhatsAppStore.getState().clearAll()
    useAutomationStore.getState().clearAll()
    // Limpar Inbox Store
    import('./inboxStore').then(({ useInboxStore }) => {
      useInboxStore.getState().reset();
    });
    set({ user: null, isLoading: false, error: null })
  },
  signOut: async () => {
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      })
    } catch (e) {
      console.error('Logout error:', e)
    }
    // ✅ CRÍTICO: Limpar TODOS os stores ao deslogar
    useStoreStore.getState().clearStores()
    useCRMStore.getState().clearAll()
    useWhatsAppStore.getState().clearAll()
    useAutomationStore.getState().clearAll()
    import('./inboxStore').then(({ useInboxStore }) => {
      useInboxStore.getState().reset();
    });
    set({ user: null, isLoading: false, error: null })
  },
}))

// ===============================
// UI STORE
// ===============================
interface UIState {
  sidebarCollapsed: boolean
  currentPage: string
  searchQuery: string
  theme: 'dark' | 'light'
  toggleSidebar: () => void
  setCurrentPage: (page: string) => void
  setSearchQuery: (query: string) => void
  setTheme: (theme: 'dark' | 'light') => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      currentPage: 'dashboard',
      searchQuery: '',
      theme: 'dark',
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setCurrentPage: (currentPage) => set({ currentPage }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'worder-ui',
    }
  )
)

// ===============================
// CRM STORE
// ===============================
interface CRMState {
  pipelines: Pipeline[]
  selectedPipeline: Pipeline | null
  deals: Deal[]
  contacts: Contact[]
  selectedContact: Contact | null
  isLoading: boolean
  
  // Pipeline actions
  setPipelines: (pipelines: Pipeline[]) => void
  setSelectedPipeline: (pipeline: Pipeline | null) => void
  addPipeline: (pipeline: Pipeline) => void
  updatePipeline: (id: string, data: Partial<Pipeline>) => void
  deletePipeline: (id: string) => void
  
  // Stage actions (renamed from Column)
  addStage: (pipelineId: string, stage: PipelineStage) => void
  updateStage: (pipelineId: string, stageId: string, data: Partial<PipelineStage>) => void
  deleteStage: (pipelineId: string, stageId: string) => void
  reorderStages: (pipelineId: string, stages: PipelineStage[]) => void
  
  // Deal actions
  setDeals: (deals: Deal[]) => void
  addDeal: (deal: Deal) => void
  updateDeal: (id: string, data: Partial<Deal>) => void
  deleteDeal: (id: string) => void
  moveDeal: (dealId: string, stageId: string, position: number) => void
  
  // Contact actions
  setContacts: (contacts: Contact[]) => void
  setSelectedContact: (contact: Contact | null) => void
  addContact: (contact: Contact) => void
  updateContact: (id: string, data: Partial<Contact>) => void
  deleteContact: (id: string) => void
  
  setLoading: (loading: boolean) => void
  
  // ✅ NOVO: Limpar tudo ao trocar de loja
  clearAll: () => void
}

export const useCRMStore = create<CRMState>((set) => ({
  pipelines: [],
  selectedPipeline: null,
  deals: [],
  contacts: [],
  selectedContact: null,
  isLoading: false,
  
  // Pipeline actions
  setPipelines: (pipelines) => set({ pipelines }),
  setSelectedPipeline: (selectedPipeline) => set({ selectedPipeline }),
  addPipeline: (pipeline) => set((state) => ({ pipelines: [...state.pipelines, pipeline] })),
  updatePipeline: (id, data) => set((state) => ({
    pipelines: state.pipelines.map((p) => (p.id === id ? { ...p, ...data } : p)),
    selectedPipeline: state.selectedPipeline?.id === id 
      ? { ...state.selectedPipeline, ...data } 
      : state.selectedPipeline,
  })),
  deletePipeline: (id) => set((state) => ({
    pipelines: state.pipelines.filter((p) => p.id !== id),
    selectedPipeline: state.selectedPipeline?.id === id ? null : state.selectedPipeline,
  })),
  
  // Stage actions
  addStage: (pipelineId, stage) => set((state) => ({
    pipelines: state.pipelines.map((p) => 
      p.id === pipelineId ? { ...p, stages: [...(p.stages || []), stage] } : p
    ),
    selectedPipeline: state.selectedPipeline?.id === pipelineId 
      ? { ...state.selectedPipeline, stages: [...(state.selectedPipeline.stages || []), stage] } 
      : state.selectedPipeline,
  })),
  updateStage: (pipelineId, stageId, data) => set((state) => ({
    pipelines: state.pipelines.map((p) => 
      p.id === pipelineId 
        ? { ...p, stages: (p.stages || []).map((s) => s.id === stageId ? { ...s, ...data } : s) } 
        : p
    ),
  })),
  deleteStage: (pipelineId, stageId) => set((state) => ({
    pipelines: state.pipelines.map((p) => 
      p.id === pipelineId 
        ? { ...p, stages: (p.stages || []).filter((s) => s.id !== stageId) } 
        : p
    ),
  })),
  reorderStages: (pipelineId, stages) => set((state) => ({
    pipelines: state.pipelines.map((p) => 
      p.id === pipelineId ? { ...p, stages } : p
    ),
    selectedPipeline: state.selectedPipeline?.id === pipelineId 
      ? { ...state.selectedPipeline, stages } 
      : state.selectedPipeline,
  })),
  
  // Deal actions
  setDeals: (deals) => set({ deals }),
  addDeal: (deal) => set((state) => ({ deals: [...state.deals, deal] })),
  updateDeal: (id, data) => set((state) => ({
    deals: state.deals.map((d) => (d.id === id ? { ...d, ...data } : d)),
  })),
  deleteDeal: (id) => set((state) => ({
    deals: state.deals.filter((d) => d.id !== id),
  })),
  moveDeal: (dealId, stageId, position) => set((state) => ({
    deals: state.deals.map((d) => 
      d.id === dealId ? { ...d, stage_id: stageId, position } : d
    ),
  })),
  
  // Contact actions
  setContacts: (contacts) => set({ contacts }),
  setSelectedContact: (selectedContact) => set({ selectedContact }),
  addContact: (contact) => set((state) => ({ contacts: [...state.contacts, contact] })),
  updateContact: (id, data) => set((state) => ({
    contacts: state.contacts.map((c) => (c.id === id ? { ...c, ...data } : c)),
  })),
  deleteContact: (id) => set((state) => ({
    contacts: state.contacts.filter((c) => c.id !== id),
  })),
  
  setLoading: (isLoading) => set({ isLoading }),
  
  // ✅ NOVO: Limpar tudo
  clearAll: () => set({
    pipelines: [],
    selectedPipeline: null,
    deals: [],
    contacts: [],
    selectedContact: null,
    isLoading: false,
  }),
}))

// ===============================
// WHATSAPP STORE
// ===============================
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
  
  // ✅ NOVO: Limpar tudo ao trocar de loja
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
  
  // ✅ NOVO: Limpar tudo
  clearAll: () => set({
    conversations: [],
    selectedConversation: null,
    messages: {},
    isLoading: false,
    isConnected: false,
  }),
}))

// ===============================
// AUTOMATION STORE
// ===============================
interface AutomationState {
  automations: Automation[]
  selectedAutomation: Automation | null
  isLoading: boolean
  
  setAutomations: (automations: Automation[]) => void
  setSelectedAutomation: (automation: Automation | null) => void
  addAutomation: (automation: Automation) => void
  updateAutomation: (id: string, data: Partial<Automation>) => void
  deleteAutomation: (id: string) => void
  setLoading: (loading: boolean) => void
  
  // ✅ NOVO: Limpar tudo ao trocar de loja
  clearAll: () => void
}

export const useAutomationStore = create<AutomationState>((set) => ({
  automations: [],
  selectedAutomation: null,
  isLoading: false,
  
  setAutomations: (automations) => set({ automations }),
  setSelectedAutomation: (selectedAutomation) => set({ selectedAutomation }),
  addAutomation: (automation) => set((state) => ({ 
    automations: [...state.automations, automation] 
  })),
  updateAutomation: (id, data) => set((state) => ({
    automations: state.automations.map((a) => (a.id === id ? { ...a, ...data } : a)),
    selectedAutomation: state.selectedAutomation?.id === id 
      ? { ...state.selectedAutomation, ...data } 
      : state.selectedAutomation,
  })),
  deleteAutomation: (id) => set((state) => ({
    automations: state.automations.filter((a) => a.id !== id),
    selectedAutomation: state.selectedAutomation?.id === id ? null : state.selectedAutomation,
  })),
  setLoading: (isLoading) => set({ isLoading }),
  
  // ✅ NOVO: Limpar tudo
  clearAll: () => set({
    automations: [],
    selectedAutomation: null,
    isLoading: false,
  }),
}))

// ===============================
// RE-EXPORT INBOX STORE
// ===============================
export { useInboxStore, useSelectedConversation, useFilteredConversations, useConversationMessages } from './inboxStore'
export type { Conversation, Message, WhatsAppNumber } from './inboxStore'
