// =============================================
// WhatsApp Configuration Store
// Manages: instances, templates, queues,
//          quick replies, AI agents, settings
// =============================================

import { create } from 'zustand'
import type {
  WhatsAppInstance,
  Queue,
  QuickReply,
  AIAgent,
  WhatsAppTemplate,
  BusinessHours,
  Tag,
  WidgetConfig,
} from '@/lib/services/whatsapp/types'

interface WhatsAppConfigState {
  // Data
  instances: WhatsAppInstance[]
  queues: Queue[]
  quickReplies: QuickReply[]
  aiAgents: AIAgent[]
  templates: WhatsAppTemplate[]
  businessHours: BusinessHours[]
  tags: Tag[]
  widgetConfig: WidgetConfig | null

  // UI
  isLoading: boolean
  error: string | null

  // Actions
  setInstances: (instances: WhatsAppInstance[]) => void
  addInstance: (instance: WhatsAppInstance) => void
  updateInstance: (id: string, updates: Partial<WhatsAppInstance>) => void
  removeInstance: (id: string) => void

  setQueues: (queues: Queue[]) => void
  addQueue: (queue: Queue) => void
  updateQueue: (id: string, updates: Partial<Queue>) => void
  removeQueue: (id: string) => void

  setQuickReplies: (replies: QuickReply[]) => void
  addQuickReply: (reply: QuickReply) => void
  updateQuickReply: (id: string, updates: Partial<QuickReply>) => void
  removeQuickReply: (id: string) => void

  setAIAgents: (agents: AIAgent[]) => void
  addAIAgent: (agent: AIAgent) => void
  updateAIAgent: (id: string, updates: Partial<AIAgent>) => void
  removeAIAgent: (id: string) => void

  setTemplates: (templates: WhatsAppTemplate[]) => void
  addTemplate: (template: WhatsAppTemplate) => void
  updateTemplate: (id: string, updates: Partial<WhatsAppTemplate>) => void

  setBusinessHours: (hours: BusinessHours[]) => void
  setTags: (tags: Tag[]) => void
  setWidgetConfig: (config: WidgetConfig | null) => void

  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

const initialState = {
  instances: [] as WhatsAppInstance[],
  queues: [] as Queue[],
  quickReplies: [] as QuickReply[],
  aiAgents: [] as AIAgent[],
  templates: [] as WhatsAppTemplate[],
  businessHours: [] as BusinessHours[],
  tags: [] as Tag[],
  widgetConfig: null as WidgetConfig | null,
  isLoading: false,
  error: null as string | null,
}

export const useWhatsAppConfigStore = create<WhatsAppConfigState>()((set) => ({
  ...initialState,

  setInstances: (instances) => set({ instances }),
  addInstance: (instance) =>
    set((s) => ({ instances: [...s.instances, instance] })),
  updateInstance: (id, updates) =>
    set((s) => ({
      instances: s.instances.map((i) => (i.id === id ? { ...i, ...updates } : i)),
    })),
  removeInstance: (id) =>
    set((s) => ({ instances: s.instances.filter((i) => i.id !== id) })),

  setQueues: (queues) => set({ queues }),
  addQueue: (queue) => set((s) => ({ queues: [...s.queues, queue] })),
  updateQueue: (id, updates) =>
    set((s) => ({
      queues: s.queues.map((q) => (q.id === id ? { ...q, ...updates } : q)),
    })),
  removeQueue: (id) =>
    set((s) => ({ queues: s.queues.filter((q) => q.id !== id) })),

  setQuickReplies: (replies) => set({ quickReplies: replies }),
  addQuickReply: (reply) =>
    set((s) => ({ quickReplies: [...s.quickReplies, reply] })),
  updateQuickReply: (id, updates) =>
    set((s) => ({
      quickReplies: s.quickReplies.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    })),
  removeQuickReply: (id) =>
    set((s) => ({ quickReplies: s.quickReplies.filter((r) => r.id !== id) })),

  setAIAgents: (agents) => set({ aiAgents: agents }),
  addAIAgent: (agent) =>
    set((s) => ({ aiAgents: [...s.aiAgents, agent] })),
  updateAIAgent: (id, updates) =>
    set((s) => ({
      aiAgents: s.aiAgents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),
  removeAIAgent: (id) =>
    set((s) => ({ aiAgents: s.aiAgents.filter((a) => a.id !== id) })),

  setTemplates: (templates) => set({ templates }),
  addTemplate: (template) =>
    set((s) => ({ templates: [...s.templates, template] })),
  updateTemplate: (id, updates) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    })),

  setBusinessHours: (hours) => set({ businessHours: hours }),
  setTags: (tags) => set({ tags }),
  setWidgetConfig: (config) => set({ widgetConfig: config }),

  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}))
