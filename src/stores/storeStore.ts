import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useCRMStore } from './crmStore'
import { useWhatsAppStore } from './whatsappStore'
import { useAutomationStore } from './automationStore'

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
  // App Embed activation state. embedInstalled goes true the first time
  // worder.js phones home via /api/storefront/embed-ping; embedInstalledAt
  // records when. The forms dashboard reads these to nudge merchants
  // who haven't toggled the Theme App Embed in the Shopify theme editor.
  embedInstalled?: boolean
  embedInstalledAt?: string | null
  webhooksRegistered?: boolean
}

interface StoreState {
  stores: ShopifyStore[]
  currentStore: ShopifyStore | null
  isLoading: boolean
  _hasHydrated: boolean

  setStores: (stores: ShopifyStore[]) => void
  setCurrentStore: (store: ShopifyStore | null) => void
  addStore: (store: ShopifyStore) => void
  updateStore: (id: string, data: Partial<ShopifyStore>) => void
  removeStore: (id: string) => void
  setLoading: (loading: boolean) => void
  clearStores: () => void
  setHasHydrated: (state: boolean) => void
}

export const useStoreStore = create<StoreState>()(
  persist(
    (set, get) => ({
      stores: [],
      currentStore: null,
      isLoading: false,
      _hasHydrated: false,

      setStores: (stores) => set({ stores }),

      setCurrentStore: (newStore) => {
        const previousStore = get().currentStore;

        if (previousStore?.id !== newStore?.id) {
          console.log(`[Store] Trocando de loja: ${previousStore?.name || 'nenhuma'} → ${newStore?.name || 'nenhuma'}`);

          useCRMStore.getState().clearAll();
          useWhatsAppStore.getState().clearAll();
          useAutomationStore.getState().clearAll();

          import('./inboxStore').then(({ useInboxStore }) => {
            useInboxStore.getState().reset();
          });
        }

        set({ currentStore: newStore });
      },

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
      clearStores: () => set({ stores: [], currentStore: null, isLoading: false }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'worder-stores',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
