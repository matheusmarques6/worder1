import { create } from 'zustand'
import type { User } from '@/types'
import { useStoreStore } from './storeStore'
import { useCRMStore } from './crmStore'
import { useWhatsAppStore } from './whatsappStore'
import { useAutomationStore } from './automationStore'

function clearAllStores() {
  useStoreStore.getState().clearStores()
  useCRMStore.getState().clearAll()
  useWhatsAppStore.getState().clearAll()
  useAutomationStore.getState().clearAll()
  import('./inboxStore').then(({ useInboxStore }) => {
    useInboxStore.getState().reset();
  });
}

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
    clearAllStores()
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
    clearAllStores()
    set({ user: null, isLoading: false, error: null })
  },
}))
