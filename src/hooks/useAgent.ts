'use client'

import { useState, useEffect, useCallback } from 'react'
import type {
  AIAgent,
  AgentSource,
  AgentAction,
  AgentIntegration,
  TestAgentResponse,
} from '@/types/ai-agents'

// =====================================================
// HOOK: useAgent
// Gerencia o estado de um agente específico
// =====================================================

interface UseAgentReturn {
  agent: AIAgent | null
  sources: AgentSource[]
  actions: AgentAction[]
  integrations: AgentIntegration[]
  loading: boolean
  error: string | null
  // Actions
  fetchAgent: () => Promise<void>
  updateAgent: (updates: Partial<AIAgent>) => void
  saveAgent: () => Promise<boolean>
  deleteAgent: () => Promise<boolean>
  toggleActive: () => Promise<boolean>
  // Source actions
  fetchSources: () => Promise<void>
  addSource: (data: Partial<AgentSource>) => Promise<AgentSource | null>
  deleteSource: (sourceId: string) => Promise<boolean>
  reprocessSource: (sourceId: string) => Promise<boolean>
  // Action actions
  fetchActions: () => Promise<void>
  addAction: (data: Partial<AgentAction>) => Promise<AgentAction | null>
  updateAction: (actionId: string, data: Partial<AgentAction>) => Promise<boolean>
  deleteAction: (actionId: string) => Promise<boolean>
  // Integration actions
  fetchIntegrations: () => Promise<void>
  // Test
  testAgent: (message: string, history?: Array<{role: string, content: string}>) => Promise<TestAgentResponse | null>
  // State
  hasChanges: boolean
  saving: boolean
}

export function useAgent(agentId: string, organizationId: string): UseAgentReturn {
  // State
  const [agent, setAgent] = useState<AIAgent | null>(null)
  const [sources, setSources] = useState<AgentSource[]>([])
  const [actions, setActions] = useState<AgentAction[]>([])
  const [integrations, setIntegrations] = useState<AgentIntegration[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [originalAgent, setOriginalAgent] = useState<AIAgent | null>(null)

  // =====================================================
  // FETCH FUNCTIONS
  // =====================================================

  const fetchAgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}?organization_id=${organizationId}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao carregar agente')
      }
      const data = await res.json()
      setAgent(data.agent)
      setOriginalAgent(data.agent)
      setHasChanges(false)
    } catch (err: any) {
      setError(err.message)
    }
  }, [agentId, organizationId])

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/sources?organization_id=${organizationId}`)
      if (res.ok) {
        const data = await res.json()
        setSources(data.sources || [])
      }
    } catch (err) {
      console.error('Error fetching sources:', err)
    }
  }, [agentId, organizationId])

  const fetchActions = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/actions?organization_id=${organizationId}`)
      if (res.ok) {
        const data = await res.json()
        setActions(data.actions || [])
      }
    } catch (err) {
      console.error('Error fetching actions:', err)
    }
  }, [agentId, organizationId])

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/integrations?organization_id=${organizationId}`)
      if (res.ok) {
        const data = await res.json()
        setIntegrations(data.integrations || [])
      }
    } catch (err) {
      console.error('Error fetching integrations:', err)
    }
  }, [agentId, organizationId])

  // Initial fetch
  useEffect(() => {
    const loadAll = async () => {
      setLoading(true)
      setError(null)
      await Promise.all([
        fetchAgent(),
        fetchSources(),
        fetchActions(),
        fetchIntegrations(),
      ])
      setLoading(false)
    }
    loadAll()
  }, [fetchAgent, fetchSources, fetchActions, fetchIntegrations])

  // =====================================================
  // AGENT ACTIONS
  // =====================================================

  const updateAgent = useCallback((updates: Partial<AIAgent>) => {
    if (!agent) return
    setAgent({ ...agent, ...updates })
    setHasChanges(true)
  }, [agent])

  const saveAgent = useCallback(async (): Promise<boolean> => {
    if (!agent) return false
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/ai/agents/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          ...agent,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao salvar')
      }

      setOriginalAgent(agent)
      setHasChanges(false)
      return true
    } catch (err: any) {
      setError(err.message)
      return false
    } finally {
      setSaving(false)
    }
  }, [agent, agentId, organizationId])

  const deleteAgent = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}?organization_id=${organizationId}`, {
        method: 'DELETE',
      })
      return res.ok
    } catch (err: any) {
      setError(err.message)
      return false
    }
  }, [agentId, organizationId])

  const toggleActive = useCallback(async (): Promise<boolean> => {
    if (!agent) return false

    try {
      const res = await fetch(`/api/ai/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          is_active: !agent.is_active,
        }),
      })

      if (res.ok) {
        setAgent({ ...agent, is_active: !agent.is_active })
        return true
      }
      return false
    } catch (err) {
      console.error('Error toggling agent:', err)
      return false
    }
  }, [agent, agentId, organizationId])

  // =====================================================
  // SOURCE ACTIONS
  // =====================================================

  const addSource = useCallback(async (data: Partial<AgentSource>): Promise<AgentSource | null> => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          ...data,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Erro ao adicionar fonte')
      }

      const result = await res.json()
      await fetchSources()
      return result.source
    } catch (err: any) {
      setError(err.message)
      return null
    }
  }, [agentId, organizationId, fetchSources])

  const deleteSource = useCallback(async (sourceId: string): Promise<boolean> => {
    try {
      const res = await fetch(
        `/api/ai/agents/${agentId}/sources/${sourceId}?organization_id=${organizationId}`,
        { method: 'DELETE' }
      )
      if (res.ok) {
        setSources(prev => prev.filter(s => s.id !== sourceId))
        return true
      }
      return false
    } catch (err) {
      console.error('Error deleting source:', err)
      return false
    }
  }, [agentId, organizationId])

  const reprocessSource = useCallback(async (sourceId: string): Promise<boolean> => {
    try {
      const res = await fetch(
        `/api/ai/agents/${agentId}/sources/${sourceId}/reprocess`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organization_id: organizationId }),
        }
      )
      if (res.ok) {
        await fetchSources()
        return true
      }
      return false
    } catch (err) {
      console.error('Error reprocessing source:', err)
      return false
    }
  }, [agentId, organizationId, fetchSources])

  // =====================================================
  // ACTION ACTIONS
  // =====================================================

  const addAction = useCallback(async (data: Partial<AgentAction>): Promise<AgentAction | null> => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          ...data,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Erro ao criar ação')
      }

      const result = await res.json()
      await fetchActions()
      return result.action
    } catch (err: any) {
      setError(err.message)
      return null
    }
  }, [agentId, organizationId, fetchActions])

  const updateAction = useCallback(async (actionId: string, data: Partial<AgentAction>): Promise<boolean> => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/actions/${actionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          ...data,
        }),
      })
      if (res.ok) {
        await fetchActions()
        return true
      }
      return false
    } catch (err) {
      console.error('Error updating action:', err)
      return false
    }
  }, [agentId, organizationId, fetchActions])

  const deleteAction = useCallback(async (actionId: string): Promise<boolean> => {
    try {
      const res = await fetch(
        `/api/ai/agents/${agentId}/actions/${actionId}?organization_id=${organizationId}`,
        { method: 'DELETE' }
      )
      if (res.ok) {
        setActions(prev => prev.filter(a => a.id !== actionId))
        return true
      }
      return false
    } catch (err) {
      console.error('Error deleting action:', err)
      return false
    }
  }, [agentId, organizationId])

  // =====================================================
  // TEST
  // =====================================================

  const testAgent = useCallback(async (
    message: string,
    history: Array<{role: string, content: string}> = []
  ): Promise<TestAgentResponse | null> => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          message,
          conversation_history: history,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao testar agente')
      }

      return await res.json()
    } catch (err: any) {
      setError(err.message)
      return null
    }
  }, [agentId, organizationId])

  // =====================================================
  // RETURN
  // =====================================================

  return {
    agent,
    sources,
    actions,
    integrations,
    loading,
    error,
    hasChanges,
    saving,
    // Agent
    fetchAgent,
    updateAgent,
    saveAgent,
    deleteAgent,
    toggleActive,
    // Sources
    fetchSources,
    addSource,
    deleteSource,
    reprocessSource,
    // Actions
    fetchActions,
    addAction,
    updateAction,
    deleteAction,
    // Integrations
    fetchIntegrations,
    // Test
    testAgent,
  }
}

// =====================================================
// HOOK: useAgentsList
// Gerencia lista de agentes
// =====================================================

interface UseAgentsListReturn {
  agents: AIAgent[]
  loading: boolean
  error: string | null
  fetchAgents: () => Promise<void>
  createAgent: (data: Partial<AIAgent>) => Promise<AIAgent | null>
  deleteAgent: (agentId: string) => Promise<boolean>
  toggleAgent: (agentId: string) => Promise<boolean>
  stats: {
    total: number
    active: number
    totalMessages: number
    totalConversations: number
  }
}

export function useAgentsList(organizationId: string): UseAgentsListReturn {
  const [agents, setAgents] = useState<AIAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/ai/agents?organization_id=${organizationId}`)
      if (!res.ok) throw new Error('Erro ao carregar agentes')
      const data = await res.json()
      setAgents(data.agents || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const createAgent = useCallback(async (data: Partial<AIAgent>): Promise<AIAgent | null> => {
    try {
      const res = await fetch('/api/ai/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          ...data,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Erro ao criar agente')
      }

      const result = await res.json()
      await fetchAgents()
      return result.agent
    } catch (err: any) {
      setError(err.message)
      return null
    }
  }, [organizationId, fetchAgents])

  const deleteAgent = useCallback(async (agentId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}?organization_id=${organizationId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setAgents(prev => prev.filter(a => a.id !== agentId))
        return true
      }
      return false
    } catch (err) {
      console.error('Error deleting agent:', err)
      return false
    }
  }, [organizationId])

  const toggleAgent = useCallback(async (agentId: string): Promise<boolean> => {
    const agent = agents.find(a => a.id === agentId)
    if (!agent) return false

    try {
      const res = await fetch(`/api/ai/agents/${agentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          is_active: !agent.is_active,
        }),
      })

      if (res.ok) {
        setAgents(prev =>
          prev.map(a => a.id === agentId ? { ...a, is_active: !a.is_active } : a)
        )
        return true
      }
      return false
    } catch (err) {
      console.error('Error toggling agent:', err)
      return false
    }
  }, [agents, organizationId])

  const stats = {
    total: agents.length,
    active: agents.filter(a => a.is_active).length,
    totalMessages: agents.reduce((sum, a) => sum + (a.total_messages || 0), 0),
    totalConversations: agents.reduce((sum, a) => sum + (a.total_conversations || 0), 0),
  }

  return {
    agents,
    loading,
    error,
    fetchAgents,
    createAgent,
    deleteAgent,
    toggleAgent,
    stats,
  }
}

export default useAgent
