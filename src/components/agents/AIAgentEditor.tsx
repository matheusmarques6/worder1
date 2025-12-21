'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Bot,
  Database,
  Zap,
  Plug,
  UserCircle,
  Settings,
  Save,
  Loader2,
  ArrowLeft,
  Power,
  PowerOff,
  Trash2,
  MessageSquare,
  ChevronRight,
  Sparkles,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'

// Tabs
import SourcesTab from './tabs/SourcesTab'
import ActionsTab from './tabs/ActionsTab'
import IntegrationsTab from './tabs/IntegrationsTab'
import PersonaTab from './tabs/PersonaTab'
import SettingsTab from './tabs/SettingsTab'
import AgentPreview from './AgentPreview'

// Types
export interface AIAgent {
  id: string
  organization_id: string
  name: string
  description?: string
  system_prompt?: string
  provider: string
  model: string
  temperature: number
  max_tokens: number
  is_active: boolean
  persona: AgentPersona
  settings: AgentSettings
  total_messages: number
  total_conversations: number
  total_tokens_used: number
  avg_response_time_ms?: number
  created_at: string
  updated_at: string
}

export interface AgentPersona {
  role_description: string
  tone: 'casual' | 'friendly' | 'professional'
  response_length: 'short' | 'medium' | 'long'
  language: 'pt-BR' | 'en' | 'es' | 'auto'
  reply_delay: number
  guidelines: string[]
}

export interface AgentSettings {
  channels: {
    all_channels: boolean
    channel_ids: string[]
  }
  pipelines: {
    all_pipelines: boolean
    pipeline_ids: string[]
    stage_ids: string[]
  }
  schedule: {
    always_active: boolean
    timezone: string
    hours: { start: string; end: string }
    days: string[]
  }
  behavior: {
    activate_on: 'new_message' | 'pipeline_stage' | 'manual'
    stop_on_human_reply: boolean
    cooldown_after_transfer: number
    max_messages_per_conversation: number
  }
}

export interface AgentSource {
  id: string
  agent_id: string
  source_type: 'url' | 'file' | 'text' | 'products'
  name: string
  url?: string
  pages_crawled?: number
  file_url?: string
  file_size_bytes?: number
  original_filename?: string
  text_content?: string
  integration_id?: string
  integration_type?: string
  products_count?: number
  status: 'pending' | 'processing' | 'ready' | 'error'
  error_message?: string
  chunks_count: number
  created_at: string
}

export interface AgentAction {
  id: string
  agent_id: string
  name: string
  description?: string
  is_active: boolean
  priority: number
  conditions: {
    match_type: 'all' | 'any'
    items: ActionCondition[]
  }
  actions: ActionDo[]
  times_triggered: number
  created_at: string
}

export interface ActionCondition {
  id: string
  type: 'intent' | 'sentiment' | 'contains' | 'time' | 'custom'
  intent?: string
  custom_intent?: string
  sentiment?: string
  keywords?: string[]
  time_range?: { start: string; end: string }
  days?: string[]
}

export interface ActionDo {
  id: string
  type: 'transfer' | 'exact_message' | 'use_source' | 'ask_for' | 'dont_mention' | 'bring_up'
  transfer_to?: 'queue' | 'agent_id'
  agent_id?: string
  message?: string
  source_id?: string
  ask_field?: string
  custom_field?: string
  topic?: string
}

export interface AgentIntegration {
  id: string
  agent_id: string
  integration_id?: string
  integration_type: 'shopify' | 'woocommerce' | 'nuvemshop'
  sync_products: boolean
  sync_orders: boolean
  allow_price_info: boolean
  allow_stock_info: boolean
  last_sync_at?: string
  products_synced: number
  sync_status: string
}

// Tab Configuration
const tabs = [
  { id: 'sources', label: 'Fontes', icon: Database, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  { id: 'actions', label: 'Ações', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  { id: 'integrations', label: 'Integrações', icon: Plug, color: 'text-green-400', bg: 'bg-green-500/20' },
  { id: 'persona', label: 'Persona', icon: UserCircle, color: 'text-purple-400', bg: 'bg-purple-500/20' },
  { id: 'settings', label: 'Configurações', icon: Settings, color: 'text-orange-400', bg: 'bg-orange-500/20' },
] as const

type TabId = typeof tabs[number]['id']

interface AIAgentEditorProps {
  agentId: string
  organizationId: string
  onClose: () => void
  onUpdate?: () => void
  onDelete?: () => void
}

export default function AIAgentEditor({
  agentId,
  organizationId,
  onClose,
  onUpdate,
  onDelete,
}: AIAgentEditorProps) {
  // State
  const [agent, setAgent] = useState<AIAgent | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('persona')
  const [hasChanges, setHasChanges] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Data for tabs
  const [sources, setSources] = useState<AgentSource[]>([])
  const [actions, setActions] = useState<AgentAction[]>([])
  const [integrations, setIntegrations] = useState<AgentIntegration[]>([])

  // Fetch agent data
  useEffect(() => {
    fetchAgent()
    fetchSources()
    fetchActions()
    fetchIntegrations()
  }, [agentId])

  const fetchAgent = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}?organization_id=${organizationId}`)
      if (!res.ok) throw new Error('Erro ao carregar agente')
      const data = await res.json()
      setAgent(data.agent)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchSources = async () => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/sources?organization_id=${organizationId}`)
      if (res.ok) {
        const data = await res.json()
        setSources(data.sources || [])
      }
    } catch (err) {
      console.error('Error fetching sources:', err)
    }
  }

  const fetchActions = async () => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/actions?organization_id=${organizationId}`)
      if (res.ok) {
        const data = await res.json()
        setActions(data.actions || [])
      }
    } catch (err) {
      console.error('Error fetching actions:', err)
    }
  }

  const fetchIntegrations = async () => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/integrations?organization_id=${organizationId}`)
      if (res.ok) {
        const data = await res.json()
        setIntegrations(data.integrations || [])
      }
    } catch (err) {
      console.error('Error fetching integrations:', err)
    }
  }

  // Update agent
  const updateAgent = (updates: Partial<AIAgent>) => {
    if (!agent) return
    setAgent({ ...agent, ...updates })
    setHasChanges(true)
  }

  // Save agent
  const handleSave = async () => {
    if (!agent) return
    setSaving(true)
    setError('')
    setSuccess('')

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

      setSuccess('Agente salvo com sucesso!')
      setHasChanges(false)
      onUpdate?.()

      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Toggle active status
  const handleToggleActive = async () => {
    if (!agent) return
    
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
        onUpdate?.()
      }
    } catch (err) {
      console.error('Error toggling agent:', err)
    }
  }

  // Delete agent
  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}?organization_id=${organizationId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        onDelete?.()
        onClose()
      } else {
        const data = await res.json()
        setError(data.error || 'Erro ao excluir')
      }
    } catch (err: any) {
      setError(err.message)
    }
    setShowDeleteConfirm(false)
  }

  // Render loading
  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      >
        <div className="bg-dark-800 rounded-2xl p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
          <p className="text-dark-300">Carregando agente...</p>
        </div>
      </motion.div>
    )
  }

  // Render error
  if (!agent) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
      >
        <div className="bg-dark-800 rounded-2xl p-8 flex flex-col items-center gap-4 max-w-md">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <p className="text-white text-center">Agente não encontrado</p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-xl"
          >
            Voltar
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex"
    >
      {/* Main Editor */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="ml-auto h-full w-full max-w-5xl bg-dark-900 border-l border-dark-700 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-dark-700 bg-dark-800/50">
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                agent.is_active ? 'bg-purple-500/20' : 'bg-dark-700'
              }`}>
                <Bot className={`w-5 h-5 ${agent.is_active ? 'text-purple-400' : 'text-dark-500'}`} />
              </div>
              <div>
                <h2 className="text-white font-semibold">{agent.name}</h2>
                <p className="text-xs text-dark-400">
                  {agent.provider} • {agent.model}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Preview Button */}
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors ${
                showPreview 
                  ? 'bg-primary-500/20 text-primary-400' 
                  : 'bg-dark-700 text-dark-300 hover:text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span className="text-sm">Preview</span>
            </button>

            {/* Toggle Active */}
            <button
              onClick={handleToggleActive}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-colors ${
                agent.is_active
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-dark-700 text-dark-400'
              }`}
            >
              {agent.is_active ? (
                <>
                  <Power className="w-4 h-4" />
                  <span className="text-sm">Ativo</span>
                </>
              ) : (
                <>
                  <PowerOff className="w-4 h-4" />
                  <span className="text-sm">Inativo</span>
                </>
              )}
            </button>

            {/* Delete Button */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-2 rounded-xl bg-dark-700 text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                hasChanges
                  ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white hover:from-primary-600 hover:to-accent-600'
                  : 'bg-dark-700 text-dark-500 cursor-not-allowed'
              }`}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span className="text-sm">Salvar</span>
            </button>
          </div>
        </div>

        {/* Alerts */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-4 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-400"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
              <button onClick={() => setError('')} className="ml-auto">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mx-4 mt-4 p-3 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-2 text-green-400"
            >
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{success}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs Navigation */}
        <div className="flex gap-1 p-4 border-b border-dark-700 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            
            // Count badges
            let badge = ''
            if (tab.id === 'sources') badge = sources.length > 0 ? `${sources.length}` : ''
            if (tab.id === 'actions') badge = actions.length > 0 ? `${actions.length}` : ''
            if (tab.id === 'integrations') badge = integrations.filter(i => i.sync_status === 'synced').length > 0 ? `${integrations.filter(i => i.sync_status === 'synced').length}` : ''

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? `${tab.bg} ${tab.color}`
                    : 'text-dark-400 hover:text-white hover:bg-dark-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm">{tab.label}</span>
                {badge && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                    isActive ? 'bg-white/20' : 'bg-dark-700'
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden flex">
          <div className={`flex-1 overflow-y-auto ${showPreview ? 'w-1/2' : 'w-full'}`}>
            <AnimatePresence mode="wait">
              {activeTab === 'sources' && (
                <motion.div
                  key="sources"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="h-full"
                >
                  <SourcesTab
                    agentId={agentId}
                    organizationId={organizationId}
                    sources={sources}
                    onSourcesChange={setSources}
                    onRefresh={fetchSources}
                  />
                </motion.div>
              )}

              {activeTab === 'actions' && (
                <motion.div
                  key="actions"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="h-full"
                >
                  <ActionsTab
                    agentId={agentId}
                    organizationId={organizationId}
                    actions={actions}
                    onActionsChange={setActions}
                    onRefresh={fetchActions}
                  />
                </motion.div>
              )}

              {activeTab === 'integrations' && (
                <motion.div
                  key="integrations"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="h-full"
                >
                  <IntegrationsTab
                    agentId={agentId}
                    organizationId={organizationId}
                    integrations={integrations}
                    onIntegrationsChange={setIntegrations}
                    onRefresh={fetchIntegrations}
                  />
                </motion.div>
              )}

              {activeTab === 'persona' && (
                <motion.div
                  key="persona"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="h-full"
                >
                  <PersonaTab
                    agent={agent}
                    onUpdate={updateAgent}
                  />
                </motion.div>
              )}

              {activeTab === 'settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="h-full"
                >
                  <SettingsTab
                    agent={agent}
                    organizationId={organizationId}
                    onUpdate={updateAgent}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Preview Panel */}
          <AnimatePresence>
            {showPreview && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: '50%', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="border-l border-dark-700 overflow-hidden"
              >
                <AgentPreview
                  agent={agent}
                  onClose={() => setShowPreview(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-dark-800 rounded-2xl p-6 max-w-md w-full border border-dark-700"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Excluir Agente</h3>
                  <p className="text-sm text-dark-400">Esta ação não pode ser desfeita</p>
                </div>
              </div>

              <p className="text-dark-300 mb-6">
                Tem certeza que deseja excluir o agente <strong className="text-white">{agent.name}</strong>? 
                Todas as fontes, ações e configurações serão perdidas.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
