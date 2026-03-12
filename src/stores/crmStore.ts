import { create } from 'zustand'
import type { Pipeline, PipelineStage, Deal, Contact } from '@/types'

interface CRMState {
  pipelines: Pipeline[]
  selectedPipeline: Pipeline | null
  deals: Deal[]
  contacts: Contact[]
  selectedContact: Contact | null
  isLoading: boolean

  setPipelines: (pipelines: Pipeline[]) => void
  setSelectedPipeline: (pipeline: Pipeline | null) => void
  addPipeline: (pipeline: Pipeline) => void
  updatePipeline: (id: string, data: Partial<Pipeline>) => void
  deletePipeline: (id: string) => void

  addStage: (pipelineId: string, stage: PipelineStage) => void
  updateStage: (pipelineId: string, stageId: string, data: Partial<PipelineStage>) => void
  deleteStage: (pipelineId: string, stageId: string) => void
  reorderStages: (pipelineId: string, stages: PipelineStage[]) => void

  setDeals: (deals: Deal[]) => void
  addDeal: (deal: Deal) => void
  updateDeal: (id: string, data: Partial<Deal>) => void
  deleteDeal: (id: string) => void
  moveDeal: (dealId: string, stageId: string, position: number) => void

  setContacts: (contacts: Contact[]) => void
  setSelectedContact: (contact: Contact | null) => void
  addContact: (contact: Contact) => void
  updateContact: (id: string, data: Partial<Contact>) => void
  deleteContact: (id: string) => void

  setLoading: (loading: boolean) => void
  clearAll: () => void
}

export const useCRMStore = create<CRMState>((set) => ({
  pipelines: [],
  selectedPipeline: null,
  deals: [],
  contacts: [],
  selectedContact: null,
  isLoading: false,

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

  clearAll: () => set({
    pipelines: [],
    selectedPipeline: null,
    deals: [],
    contacts: [],
    selectedContact: null,
    isLoading: false,
  }),
}))
