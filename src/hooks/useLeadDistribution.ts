'use client'

import { useState, useCallback, useEffect } from 'react'

// =============================================
// Types
// =============================================

export interface AgentConfig {
  agent_id: string
  agent_name?: string
  agent_email?: string
  weight?: number
  max_capacity?: number
  skills?: string[]
  is_available: boolean
}

export interface DistributionRuleConfig {
  agents: AgentConfig[]
  fallback_agent_id?: string
  max_leads_per_agent?: number
  reset_period?: 'daily' | 'weekly' | 'monthly'
  skills_required?: string[]
}

export interface DistributionRule {
  id: string
  organization_id: string
  store_id?: string
  name: string
  distribution_type: 'round_robin' | 'weighted' | 'capacity' | 'skill_based'
  is_active: boolean
  config: DistributionRuleConfig
  last_assigned_index: number
  created_at: string
  updated_at: string
  // Stats from API
  today_distributions?: number
  agent_distribution?: Record<string, number>
}

export interface DistributionLog {
  id: string
  rule_id: string
  lead_id: string
  assigned_to: string
  distribution_type: string
  reason?: string
  created_at: string
  profiles?: {
    id: string
    email: string
    full_name: string
  }
}

export interface CreateRuleParams {
  name: string
  distribution_type?: 'round_robin' | 'weighted' | 'capacity' | 'skill_based'
  config?: DistributionRuleConfig
}

export interface DistributeLeadParams {
  lead_id: string
  rule_id?: string
}

export interface DistributeLeadResult {
  assigned_to: string
  distribution_type: string
  reason: string
}

interface UseLeadDistributionOptions {
  organizationId: string
  storeId?: string | null
  autoLoad?: boolean
}

interface UseLeadDistributionReturn {
  rules: DistributionRule[]
  selectedRule: DistributionRule | null
  logs: DistributionLog[]
  isLoading: boolean
  error: string | null
  loadRules: () => Promise<void>
  loadRule: (id: string) => Promise<void>
  createRule: (params: CreateRuleParams) => Promise<DistributionRule | null>
  updateRule: (id: string, updates: Partial<DistributionRule>) => Promise<boolean>
  deleteRule: (id: string) => Promise<boolean>
  distributeLead: (params: DistributeLeadParams) => Promise<DistributeLeadResult | null>
  addAgent: (ruleId: string, agent: AgentConfig) => Promise<boolean>
  removeAgent: (ruleId: string, agentId: string) => Promise<boolean>
  updateAgentConfig: (ruleId: string, agentId: string, updates: Partial<AgentConfig>) => Promise<boolean>
}

// =============================================
// Hook
// =============================================

export function useLeadDistribution({
  organizationId,
  storeId,
  autoLoad = true,
}: UseLeadDistributionOptions): UseLeadDistributionReturn {
  const [rules, setRules] = useState<DistributionRule[]>([])
  const [selectedRule, setSelectedRule] = useState<DistributionRule | null>(null)
  const [logs, setLogs] = useState<DistributionLog[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // =============================================
  // Load All Rules
  // =============================================
  const loadRules = useCallback(async () => {
    if (!organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ organization_id: organizationId })

      if (storeId) {
        params.append('store_id', storeId)
      }

      const response = await fetch(`/api/lead-distribution?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar regras')
      }

      setRules(data.rules || [])
    } catch (err: any) {
      console.error('[useLeadDistribution] Load error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId, storeId])

  // =============================================
  // Load Single Rule with Logs
  // =============================================
  const loadRule = useCallback(async (id: string) => {
    if (!organizationId) return

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        rule_id: id,
        include_logs: 'true',
      })

      const response = await fetch(`/api/lead-distribution?${params}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao carregar regra')
      }

      setSelectedRule(data.rule)
      setLogs(data.logs || [])
    } catch (err: any) {
      console.error('[useLeadDistribution] Load rule error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }, [organizationId])

  // =============================================
  // Create Rule
  // =============================================
  const createRule = useCallback(async (params: CreateRuleParams): Promise<DistributionRule | null> => {
    if (!organizationId) {
      setError('Organizacao nao definida')
      return null
    }

    setError(null)

    try {
      const response = await fetch('/api/lead-distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          store_id: storeId,
          ...params,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao criar regra')
      }

      await loadRules()
      return data.rule
    } catch (err: any) {
      console.error('[useLeadDistribution] Create error:', err)
      setError(err.message)
      return null
    }
  }, [organizationId, storeId, loadRules])

  // =============================================
  // Update Rule
  // =============================================
  const updateRule = useCallback(async (id: string, updates: Partial<DistributionRule>): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch('/api/lead-distribution', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao atualizar regra')
      }

      setRules(prev => prev.map(r => (r.id === id ? { ...r, ...data.rule } : r)))

      if (selectedRule?.id === id) {
        setSelectedRule(prev => prev ? { ...prev, ...data.rule } : null)
      }

      return true
    } catch (err: any) {
      console.error('[useLeadDistribution] Update error:', err)
      setError(err.message)
      return false
    }
  }, [selectedRule])

  // =============================================
  // Delete Rule
  // =============================================
  const deleteRule = useCallback(async (id: string): Promise<boolean> => {
    setError(null)

    try {
      const response = await fetch(`/api/lead-distribution?id=${id}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao excluir regra')
      }

      setRules(prev => prev.filter(r => r.id !== id))

      if (selectedRule?.id === id) {
        setSelectedRule(null)
        setLogs([])
      }

      return true
    } catch (err: any) {
      console.error('[useLeadDistribution] Delete error:', err)
      setError(err.message)
      return false
    }
  }, [selectedRule])

  // =============================================
  // Distribute Lead
  // =============================================
  const distributeLead = useCallback(async (params: DistributeLeadParams): Promise<DistributeLeadResult | null> => {
    if (!organizationId) {
      setError('Organizacao nao definida')
      return null
    }

    setError(null)

    try {
      const response = await fetch('/api/lead-distribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'distribute',
          organization_id: organizationId,
          store_id: storeId,
          ...params,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao distribuir lead')
      }

      // Reload rules to update stats
      await loadRules()

      return {
        assigned_to: data.assigned_to,
        distribution_type: data.distribution_type,
        reason: data.reason,
      }
    } catch (err: any) {
      console.error('[useLeadDistribution] Distribute error:', err)
      setError(err.message)
      return null
    }
  }, [organizationId, storeId, loadRules])

  // =============================================
  // Add Agent to Rule
  // =============================================
  const addAgent = useCallback(async (ruleId: string, agent: AgentConfig): Promise<boolean> => {
    const rule = rules.find(r => r.id === ruleId)
    if (!rule) {
      setError('Regra nao encontrada')
      return false
    }

    const config = { ...rule.config }
    const existingIndex = config.agents.findIndex(a => a.agent_id === agent.agent_id)

    if (existingIndex >= 0) {
      config.agents[existingIndex] = { ...config.agents[existingIndex], ...agent }
    } else {
      config.agents.push(agent)
    }

    return updateRule(ruleId, { config })
  }, [rules, updateRule])

  // =============================================
  // Remove Agent from Rule
  // =============================================
  const removeAgent = useCallback(async (ruleId: string, agentId: string): Promise<boolean> => {
    const rule = rules.find(r => r.id === ruleId)
    if (!rule) {
      setError('Regra nao encontrada')
      return false
    }

    const config = { ...rule.config }
    config.agents = config.agents.filter(a => a.agent_id !== agentId)

    return updateRule(ruleId, { config })
  }, [rules, updateRule])

  // =============================================
  // Update Agent Config
  // =============================================
  const updateAgentConfig = useCallback(async (
    ruleId: string,
    agentId: string,
    updates: Partial<AgentConfig>
  ): Promise<boolean> => {
    const rule = rules.find(r => r.id === ruleId)
    if (!rule) {
      setError('Regra nao encontrada')
      return false
    }

    const config = { ...rule.config }
    const agentIndex = config.agents.findIndex(a => a.agent_id === agentId)

    if (agentIndex < 0) {
      setError('Agente nao encontrado na regra')
      return false
    }

    config.agents[agentIndex] = { ...config.agents[agentIndex], ...updates }

    return updateRule(ruleId, { config })
  }, [rules, updateRule])

  // =============================================
  // Auto Load
  // =============================================
  useEffect(() => {
    if (autoLoad && organizationId) {
      loadRules()
    }
  }, [autoLoad, organizationId, storeId, loadRules])

  return {
    rules,
    selectedRule,
    logs,
    isLoading,
    error,
    loadRules,
    loadRule,
    createRule,
    updateRule,
    deleteRule,
    distributeLead,
    addAgent,
    removeAgent,
    updateAgentConfig,
  }
}

export default useLeadDistribution
