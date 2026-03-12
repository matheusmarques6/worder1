import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UIState {
  sidebarCollapsed: boolean
  currentPage: string
  searchQuery: string
  theme: 'dark' | 'light'
  _hasHydrated: boolean
  toggleSidebar: () => void
  setCurrentPage: (page: string) => void
  setSearchQuery: (query: string) => void
  setTheme: (theme: 'dark' | 'light') => void
  setHasHydrated: (state: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      currentPage: 'dashboard',
      searchQuery: '',
      theme: 'dark',
      _hasHydrated: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setCurrentPage: (currentPage) => set({ currentPage }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setTheme: (theme) => set({ theme }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'worder-ui',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
