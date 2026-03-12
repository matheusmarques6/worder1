import { create } from 'zustand'
import type { Automation } from '@/types'

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

  clearAll: () => set({
    automations: [],
    selectedAutomation: null,
    isLoading: false,
  }),
}))
