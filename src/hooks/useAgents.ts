'use client'

import { useState, useEffect, useCallback } from 'react'
import { useStoreStore } from '@/stores' // ✅ NOVO

// Types
export interface Agent {
  id: string
  organization_id: string
  store_id?: string // ✅ NOVO
  type: 'human' | 'ai'
  name: string
  email?: string
  avatar_url?: string
  is_active: boolean
  status: 'online' | 'offline' | 'away' | 'busy'
  last_seen_at?: string
  user_id?: string
  total_conversations: number
  total_messages: number
  avg_response_time_seconds?: number
  ai_config?: AIConfig
  permissions?: AgentPermissions
  stats?: {
    active_chats: number
    resolved_chats: number
  }
  created_at: string
  updated_at: string
}

export interface AIConfig {
  provider: string
  model: string
  model_id?: string
  temperature: number
  max_tokens: number
  system_prompt?: string
  greeting_message?: string
  away_message?: string
  transfer_keywords?: string[]
  transfer_to_queue: boolean
  transfer_after_messages?: number
  use_pipelines?: boolean
  pipeline_ids?: string[]
  use_whatsapp?: boolean
  whatsapp_number_ids?: string[]
  schedule?: {
    timezone: string
    hours: { start: string; end: string }
    days: string[]
  }
  always_active?: boolean
  only_when_no_human?: boolean
}

export interface AgentPermissions {
  access_level: 'owner' | 'admin' | 'agent'
  whatsapp_access_all: boolean
  whatsapp_allowed_numbers?: string[]
  whatsapp_can_send?: boolean
  whatsapp_can_transfer?: boolean
  pipeline_access_all: boolean
  pipeline_allowed_ids?: string[]
  pipeline_can_edit?: boolean
}

export interface CreateAgentData {
  type: 'human' | 'ai'
  name: string
  email?: string
  password?: string
  ai_config?: Partial<AIConfig>
}

export interface UpdateAgentData {
  name?: string
  email?: string
  is_active?: boolean
  status?: 'online' | 'offline' | 'away' | 'busy'
  ai_config?: Partial<AIConfig>
}

interface UseAgentsReturn {
  agents: Agent[]
  humanAgents: Agent[]
  aiAgents: Agent[]
  loading: boolean
  error: string | null
  stats: {
    total: number
    humans: number
    ais: number
    online: number
    activeChats: number
  }
  refetch: () => Promise<void>
  createAgent: (data: CreateAgentData) => Promise<Agent>
  updateAgent: (id: string, data: UpdateAgentData) => Promise<Agent>
  deleteAgent: (id: string) => Promise<void>
  toggleAgentStatus: (id: string, isActive: boolean) => Promise<void>
  assignChat: (conversationId: string, agentId: string | null) => Promise<void>
  resolveChat: (conversationId: string) => Promise<void>
}

export function useAgents(): UseAgentsReturn {
  const { currentStore } = useStoreStore() // ✅ NOVO
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ✅ NOVO: storeId atual
  const storeId = currentStore?.id

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    // ✅ NOVO: Não buscar se não tiver loja selecionada
    if (!storeId) {
      setAgents([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // ✅ CORRIGIDO: Incluir storeId na URL
      const res = await fetch(`/api/whatsapp/agents?include_stats=true&storeId=${storeId}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao carregar agentes')
      }

      setAgents(data.agents || [])
    } catch (err: any) {
      setError(err.message)
      console.error('Error fetching agents:', err)
    } finally {
      setLoading(false)
    }
  }, [storeId]) // ✅ NOVO: Dependência do storeId

  // ✅ NOVO: Recarregar quando loja mudar
  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  // Computed values
  const humanAgents = agents.filter(a => a.type === 'human')
  const aiAgents = agents.filter(a => a.type === 'ai')
  
  // ✅ PROTEÇÃO: Garantir que agents é array
  const safeAgents = Array.isArray(agents) ? agents : []
  const stats = {
    total: safeAgents.length,
    humans: humanAgents.length,
    ais: aiAgents.length,
    online: safeAgents.filter(a => a.status === 'online' && a.is_active).length,
    activeChats: safeAgents.reduce((sum, a) => sum + (a.stats?.active_chats || 0), 0),
  }

  // Create agent
  const createAgent = async (data: CreateAgentData): Promise<Agent> => {
    // ✅ NOVO: Incluir store_id ao criar agente
    const res = await fetch('/api/whatsapp/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, store_id: storeId }),
    })

    const result = await res.json()

    if (!res.ok) {
      throw new Error(result.error || 'Erro ao criar agente')
    }

    await fetchAgents()
    return result.agent
  }

  // Update agent
  const updateAgent = async (id: string, data: UpdateAgentData): Promise<Agent> => {
    const res = await fetch('/api/whatsapp/agents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...data }),
    })

    const result = await res.json()

    if (!res.ok) {
      throw new Error(result.error || 'Erro ao atualizar agente')
    }

    await fetchAgents()
    return result.agent
  }

  // Delete agent
  const deleteAgent = async (id: string): Promise<void> => {
    const res = await fetch(`/api/whatsapp/agents?id=${id}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      const result = await res.json()
      throw new Error(result.error || 'Erro ao excluir agente')
    }

    await fetchAgents()
  }

  // Toggle status
  const toggleAgentStatus = async (id: string, isActive: boolean): Promise<void> => {
    await updateAgent(id, { is_active: isActive })
  }

  // Assign chat
  const assignChat = async (conversationId: string, agentId: string | null): Promise<void> => {
    const res = await fetch('/api/whatsapp/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'assign',
        conversation_id: conversationId,
        agent_id: agentId,
      }),
    })

    if (!res.ok) {
      const result = await res.json()
      throw new Error(result.error || 'Erro ao atribuir chat')
    }

    await fetchAgents()
  }

  // Resolve chat
  const resolveChat = async (conversationId: string): Promise<void> => {
    const res = await fetch('/api/whatsapp/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resolve',
        conversation_id: conversationId,
      }),
    })

    if (!res.ok) {
      const result = await res.json()
      throw new Error(result.error || 'Erro ao resolver chat')
    }

    await fetchAgents()
  }

  return {
    agents,
    humanAgents,
    aiAgents,
    loading,
    error,
    stats,
    refetch: fetchAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    toggleAgentStatus,
    assignChat,
    resolveChat,
  }
}

// Hook para modelos de IA
export function useAIModels() {
  const [models, setModels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchModels = useCallback(async (provider?: string) => {
    setLoading(true)
    setError(null)

    try {
      const url = provider 
        ? `/api/ai/models?provider=${provider}` 
        : '/api/ai/models'
      
      const res = await fetch(url)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao carregar modelos')
      }

      setModels(data.models || [])
    } catch (err: any) {
      setError(err.message)
      console.error('Error fetching models:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  // Group by provider
  const modelsByProvider = models.reduce((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = []
    acc[model.provider].push(model)
    return acc
  }, {} as Record<string, any[]>)

  return {
    models,
    modelsByProvider,
    loading,
    error,
    refetch: fetchModels,
  }
}

// Hook para API keys
export function useApiKeys() {
  const [keys, setKeys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchKeys = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/api-keys')
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao carregar API keys')
      }

      setKeys(data.keys || [])
    } catch (err: any) {
      setError(err.message)
      console.error('Error fetching API keys:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKeys()
  }, [fetchKeys])

  const addKey = async (provider: string, apiKey: string) => {
    const res = await fetch('/api/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, api_key: apiKey }),
    })

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || 'Erro ao adicionar API key')
    }

    await fetchKeys()
    return data
  }

  const deleteKey = async (provider: string) => {
    const res = await fetch(`/api/api-keys?provider=${provider}`, {
      method: 'DELETE',
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Erro ao remover API key')
    }

    await fetchKeys()
  }

  const hasValidKey = (provider: string) => {
    return keys.some(k => k.provider === provider && k.is_valid)
  }

  return {
    keys,
    loading,
    error,
    refetch: fetchKeys,
    addKey,
    deleteKey,
    hasValidKey,
  }
}
