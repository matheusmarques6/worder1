'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Bot,
  Database,
  Zap,
  Wrench,
  Plug,
  UserCircle,
  Settings,
  History,
  Tag,
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
import ToolsTab from './tabs/ToolsTab'
import IntegrationsTab from './tabs/IntegrationsTab'
import PersonaTab from './tabs/PersonaTab'
import SettingsTab from './tabs/SettingsTab'
import VersionsTab from './tabs/VersionsTab'
import AnnotationTab from './tabs/AnnotationTab'
import AgentPreview from './AgentPreview'

// Scoped design system ("Agentes de IA" redesign)
import { AgentsTheme } from './ui/AgentsTheme'
import { Button } from './ui/primitives'
import { useAuthStore } from '@/stores'

// Types - importar do módulo central
import {
  AIAgent,
  AgentPersona,
  AgentSettings,
  AgentSource,
  AgentAction,
  ActionCondition,
  ActionDo,
  AgentIntegration,
} from '@/lib/ai/types'

// Re-export para compatibilidade
export type {
  AIAgent,
  AgentPersona,
  AgentSettings,
  AgentSource,
  AgentAction,
  ActionCondition,
  ActionDo,
  AgentIntegration,
}

// Tab Configuration — order/labels match the mockup; the scoped `.tab` style
// handles active/idle colors, so no per-tab Tailwind palette is needed here.
const tabs = [
  { id: 'persona', label: 'Persona', icon: UserCircle },
  { id: 'sources', label: 'Fontes', icon: Database },
  { id: 'actions', label: 'Ações', icon: Zap },
  { id: 'tools', label: 'Ferramentas', icon: Wrench },
  { id: 'integrations', label: 'Integrações', icon: Plug },
  { id: 'settings', label: 'Configurações', icon: Settings },
  { id: 'versions', label: 'Versões', icon: History },
  { id: 'annotation', label: 'Anotação', icon: Tag },
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
  const { user } = useAuthStore()
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

  // Refetch silencioso (sem flash de loading) — usado após rollback de versão
  const refreshAgent = async () => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}?organization_id=${organizationId}`)
      if (res.ok) {
        const data = await res.json()
        setAgent(data.agent)
        setHasChanges(false)
      }
    } catch (err) {
      console.error('Error refreshing agent:', err)
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
          ...agent,
          organization_id: organizationId,
          user_id: user?.id ?? null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        // P1-1: ativacao bloqueada por falta de chave do provider — mensagem
        // acionavel apontando pra aba API Keys.
        if (data.error === 'provider_key_missing') {
          throw new Error(
            `O provedor "${data.provider}" não tem chave de API ativa. ` +
              'Cadastre em Agentes IA → aba API Keys e salve de novo.',
          )
        }
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
      <AgentsTheme>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="editor-overlay items-center justify-center"
        >
          <div className="card" style={{ padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--brand)' }} />
            <p style={{ color: 'var(--text-2)' }}>Carregando agente...</p>
          </div>
        </motion.div>
      </AgentsTheme>
    )
  }

  // Render error
  if (!agent) {
    return (
      <AgentsTheme>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="editor-overlay items-center justify-center"
        >
          <div className="card" style={{ padding: 32, maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <AlertCircle className="w-12 h-12" style={{ color: 'var(--red)' }} />
            <p style={{ color: 'var(--text)', textAlign: 'center' }}>Agente não encontrado</p>
            <Button variant="soft" onClick={onClose}>Voltar</Button>
          </div>
        </motion.div>
      </AgentsTheme>
    )
  }

  return (
    <AgentsTheme>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="editor-overlay"
    >
      {/* Main Editor */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="editor-panel"
      >
        {/* Header */}
        <div className="editor-head">
          <div className="flex items-center gap-4">
            <Button variant="soft" size="icon" onClick={onClose} aria-label="Voltar">
              <ArrowLeft className="w-5 h-5" />
            </Button>

            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: agent.is_active ? 'var(--brand-tint)' : 'var(--surface-3)' }}
              >
                <Bot className="w-5 h-5" style={{ color: agent.is_active ? 'var(--brand)' : 'var(--text-3)' }} />
              </div>
              <div>
                <h2 className="font-semibold" style={{ color: 'var(--text)' }}>{agent.name}</h2>
                <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                  {agent.provider} • {agent.model}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Preview Button */}
            <Button
              variant={showPreview ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Preview</span>
            </Button>

            {/* Toggle Active */}
            <Button
              variant={agent.is_active ? 'primary' : 'soft'}
              size="sm"
              onClick={handleToggleActive}
            >
              {agent.is_active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
              <span>{agent.is_active ? 'Ativo' : 'Inativo'}</span>
            </Button>

            {/* Delete Button */}
            <Button
              className="btn-danger"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="w-4 h-4" />
              <span>Excluir</span>
            </Button>

            {/* Save Button */}
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving || !hasChanges}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Salvar</span>
            </Button>
          </div>
        </div>

        {/* Alerts */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="callout red"
              style={{ margin: '14px 20px 0' }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
              <button onClick={() => setError('')} className="ml-auto" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="callout green"
              style={{ margin: '14px 20px 0' }}
            >
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>{success}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs Navigation */}
        <div className="editor-tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id

            // Count badges
            let badge = ''
            if (tab.id === 'sources') badge = sources.length > 0 ? `${sources.length}` : ''
            if (tab.id === 'actions') badge = actions.length > 0 ? `${actions.length}` : ''
            if (tab.id === 'tools') {
              const enabledCount = agent.settings?.tools?.enabled?.length || 0
              badge = enabledCount > 0 ? `${enabledCount}` : ''
            }
            if (tab.id === 'integrations') badge = integrations.filter(i => i.sync_status === 'synced').length > 0 ? `${integrations.filter(i => i.sync_status === 'synced').length}` : ''

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab ${isActive ? 'on' : ''}`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {badge && <span className="chip" style={{ height: 20, padding: '0 8px' }}>{badge}</span>}
              </button>
            )
          })}
        </div>

        {/* Tab Content */}
        <div className="editor-body">
          <div className="editor-content" style={{ width: showPreview ? '50%' : '100%' }}>
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

              {activeTab === 'tools' && (
                <motion.div
                  key="tools"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="h-full"
                >
                  <ToolsTab agent={agent} onUpdate={updateAgent} />
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

              {activeTab === 'versions' && (
                <motion.div
                  key="versions"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="h-full"
                >
                  <VersionsTab
                    agentId={agentId}
                    organizationId={organizationId}
                    onRolledBack={refreshAgent}
                  />
                </motion.div>
              )}

              {activeTab === 'annotation' && (
                <motion.div
                  key="annotation"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="h-full"
                >
                  <AnnotationTab
                    agentId={agentId}
                    organizationId={organizationId}
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
                className="overflow-hidden"
                style={{ borderLeft: '1px solid var(--border)' }}
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
            className="modal-overlay"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="modal"
              style={{ maxWidth: 440 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-body">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--red-tint)' }}>
                    <Trash2 className="w-6 h-6" style={{ color: 'var(--red)' }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Excluir Agente</h3>
                    <p className="text-sm" style={{ color: 'var(--text-3)' }}>Esta ação não pode ser desfeita</p>
                  </div>
                </div>

                <p className="mb-6" style={{ color: 'var(--text-2)' }}>
                  Tem certeza que deseja excluir o agente <strong style={{ color: 'var(--text)' }}>{agent.name}</strong>?
                  Todas as fontes, ações e configurações serão perdidas.
                </p>

                <div className="flex gap-3">
                  <Button variant="soft" block onClick={() => setShowDeleteConfirm(false)}>
                    Cancelar
                  </Button>
                  <Button className="btn-danger btn-block" onClick={handleDelete}>
                    Excluir
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
    </AgentsTheme>
  )
}
