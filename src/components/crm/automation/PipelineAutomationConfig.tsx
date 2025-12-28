'use client'

// =============================================
// Pipeline Automation Config Modal
// src/components/crm/automation/PipelineAutomationConfig.tsx
//
// Modal completo para configurar automações de uma pipeline
// =============================================

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Plus,
  Settings,
  Trash2,
  Zap,
  ArrowRight,
  ShoppingCart,
  MessageCircle,
  Flame,
  ShoppingBag,
  FileText,
  Link,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { useAuthStore } from '@/stores'

// =============================================
// TYPES
// =============================================

interface ConnectedIntegration {
  id: string
  type: string
  name: string
  icon: string
  color: string
  isConnected: boolean
  details: any
  events: Array<{
    id: string
    label: string
    description: string
    category: string
  }>
  filters: Array<{
    id: string
    label: string
    type: 'number' | 'text' | 'tags' | 'boolean'
    placeholder?: string
  }>
}

interface AutomationRule {
  id: string
  name: string
  source_type: string
  trigger_event: string
  filters: Record<string, any>
  initial_stage_id: string | null
  initial_stage?: { id: string; name: string; color: string }
  is_enabled: boolean
  deals_created_count: number
  position: number
}

interface Stage {
  id: string
  name: string
  color: string
  position: number
}

interface Pipeline {
  id: string
  name: string
  color: string
  stages: Stage[]
}

interface PipelineAutomationConfigProps {
  isOpen: boolean
  onClose: () => void
  pipeline: Pipeline | null
  onSave?: () => void
}

// =============================================
// ICON MAP
// =============================================

const ICON_MAP: Record<string, any> = {
  ShoppingCart,
  MessageCircle,
  Flame,
  ShoppingBag,
  FileText,
  Link,
}

const COLOR_MAP: Record<string, string> = {
  green: 'text-green-400 bg-green-500/20',
  emerald: 'text-emerald-400 bg-emerald-500/20',
  orange: 'text-orange-400 bg-orange-500/20',
  purple: 'text-purple-400 bg-purple-500/20',
  blue: 'text-blue-400 bg-blue-500/20',
  gray: 'text-gray-400 bg-gray-500/20',
}

// =============================================
// MAIN COMPONENT
// =============================================

export function PipelineAutomationConfig({
  isOpen,
  onClose,
  pipeline,
  onSave,
}: PipelineAutomationConfigProps) {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id

  // State
  const [activeTab, setActiveTab] = useState<'automations' | 'transitions'>('automations')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [connectedIntegrations, setConnectedIntegrations] = useState<ConnectedIntegration[]>([])
  const [notConfiguredIntegrations, setNotConfiguredIntegrations] = useState<any[]>([])
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [expandedSources, setExpandedSources] = useState<string[]>([])
  
  // Modals
  const [showAddSource, setShowAddSource] = useState(false)
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null)
  const [newRuleSource, setNewRuleSource] = useState<string | null>(null)

  // =============================================
  // DATA FETCHING
  // =============================================

  const fetchConnectedIntegrations = useCallback(async () => {
    if (!organizationId) return

    try {
      const res = await fetch(`/api/integrations/connected?organizationId=${organizationId}`)
      const data = await res.json()
      
      if (data.connected) {
        setConnectedIntegrations(data.connected)
      }
      if (data.notConfigured) {
        setNotConfiguredIntegrations(data.notConfigured)
      }
    } catch (error) {
      console.error('Error fetching integrations:', error)
    }
  }, [organizationId])

  const fetchRules = useCallback(async () => {
    if (!organizationId || !pipeline) return

    try {
      const res = await fetch(
        `/api/pipelines/${pipeline.id}/automations?organizationId=${organizationId}`
      )
      const data = await res.json()
      
      if (data.rules) {
        setRules(data.rules)
        // Expandir fontes que têm regras
        const sourcesWithRules = [...new Set(data.rules.map((r: AutomationRule) => r.source_type))]
        setExpandedSources(sourcesWithRules as string[])
      }
    } catch (error) {
      console.error('Error fetching rules:', error)
    }
  }, [organizationId, pipeline])

  useEffect(() => {
    if (isOpen && pipeline) {
      setLoading(true)
      Promise.all([
        fetchConnectedIntegrations(),
        fetchRules()
      ]).finally(() => setLoading(false))
    }
  }, [isOpen, pipeline, fetchConnectedIntegrations, fetchRules])

  // =============================================
  // HANDLERS
  // =============================================

  const toggleSource = (sourceType: string) => {
    setExpandedSources(prev => 
      prev.includes(sourceType) 
        ? prev.filter(s => s !== sourceType)
        : [...prev, sourceType]
    )
  }

  const handleToggleRule = async (rule: AutomationRule) => {
    if (!organizationId || !pipeline) return

    try {
      const res = await fetch(`/api/pipelines/${pipeline.id}/automations/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          isEnabled: !rule.is_enabled,
        }),
      })

      if (res.ok) {
        setRules(prev => prev.map(r => 
          r.id === rule.id ? { ...r, is_enabled: !r.is_enabled } : r
        ))
      }
    } catch (error) {
      console.error('Error toggling rule:', error)
    }
  }

  const handleDeleteRule = async (rule: AutomationRule) => {
    if (!organizationId || !pipeline) return
    if (!confirm(`Excluir a regra "${rule.name}"?`)) return

    try {
      const res = await fetch(
        `/api/pipelines/${pipeline.id}/automations/${rule.id}?organizationId=${organizationId}`,
        { method: 'DELETE' }
      )

      if (res.ok) {
        setRules(prev => prev.filter(r => r.id !== rule.id))
      }
    } catch (error) {
      console.error('Error deleting rule:', error)
    }
  }

  const handleSaveRule = async (formData: any) => {
    if (!organizationId || !pipeline) return
    setSaving(true)

    try {
      const sourceType = newRuleSource || editingRule?.source_type
      const isEditing = !!editingRule

      const payload = {
        organizationId,
        name: formData.name,
        sourceType,
        triggerEvent: formData.triggerEvent,
        filters: formData.filters || {},
        initialStageId: formData.initialStageId,
        isEnabled: formData.isEnabled ?? true,
      }

      const url = isEditing
        ? `/api/pipelines/${pipeline.id}/automations/${editingRule.id}`
        : `/api/pipelines/${pipeline.id}/automations`

      const res = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        await fetchRules()
        setEditingRule(null)
        setNewRuleSource(null)
        onSave?.()
      } else {
        // Mostrar erro ao usuário
        const errorMessage = data.error || 'Erro ao salvar regra'
        alert(`Erro: ${errorMessage}\n\nVerifique se a migration foi executada no Supabase.`)
        console.error('Error saving rule:', data)
      }
    } catch (error) {
      console.error('Error saving rule:', error)
      alert('Erro de conexão ao salvar regra. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  // =============================================
  // RENDER
  // =============================================

  if (!isOpen || !pipeline) return null

  const sortedStages = [...(pipeline.stages || [])].sort((a, b) => a.position - b.position)

  // Agrupar regras por fonte
  const rulesBySource = rules.reduce((acc, rule) => {
    if (!acc[rule.source_type]) acc[rule.source_type] = []
    acc[rule.source_type].push(rule)
    return acc
  }, {} as Record<string, AutomationRule[]>)

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-dark-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-dark-700 shadow-2xl"
        >
          {/* Header */}
          <div className="p-4 border-b border-dark-700 flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: pipeline.color || '#f97316' }}
            />
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-white">
                Automações: {pipeline.name}
              </h2>
              <p className="text-dark-400 text-sm">
                Configure quais eventos criam deals automaticamente
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-dark-700 px-4">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('automations')}
                className={`flex items-center gap-2 py-3 border-b-2 transition-colors ${
                  activeTab === 'automations'
                    ? 'border-primary-500 text-white'
                    : 'border-transparent text-dark-400 hover:text-dark-200'
                }`}
              >
                <Zap className="w-4 h-4" />
                Criar Deals
              </button>
              <button
                onClick={() => setActiveTab('transitions')}
                className={`flex items-center gap-2 py-3 border-b-2 transition-colors ${
                  activeTab === 'transitions'
                    ? 'border-primary-500 text-white'
                    : 'border-transparent text-dark-400 hover:text-dark-200'
                }`}
              >
                <ArrowRight className="w-4 h-4" />
                Mover Estágios
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : activeTab === 'automations' ? (
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-medium">Fontes de Dados</h3>
                    <p className="text-dark-500 text-sm">
                      Eventos que criam deals nesta pipeline
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddSource(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Nova Regra
                  </button>
                </div>

                {/* Integrações conectadas */}
                {connectedIntegrations.length === 0 ? (
                  <div className="text-center py-8 bg-dark-900/50 rounded-xl border border-dark-700">
                    <AlertCircle className="w-12 h-12 text-dark-600 mx-auto mb-3" />
                    <p className="text-dark-400">Nenhuma integração conectada</p>
                    <p className="text-dark-500 text-sm mt-1">
                      Configure suas integrações na aba Integrações
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {connectedIntegrations.map(integration => {
                      const Icon = ICON_MAP[integration.icon] || Link
                      const colorClass = COLOR_MAP[integration.color] || COLOR_MAP.gray
                      const integrationRules = rulesBySource[integration.type] || []
                      const isExpanded = expandedSources.includes(integration.type)
                      const activeRulesCount = integrationRules.filter(r => r.is_enabled).length

                      return (
                        <div
                          key={integration.id}
                          className="border border-dark-700 rounded-xl overflow-hidden"
                        >
                          {/* Integration Header */}
                          <div
                            className={`p-3 flex items-center gap-3 cursor-pointer hover:bg-dark-700/50 transition-colors`}
                            onClick={() => toggleSource(integration.type)}
                          >
                            <button className="text-dark-400">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass.split(' ')[1]}`}>
                              <Icon className={`w-4 h-4 ${colorClass.split(' ')[0]}`} />
                            </div>
                            <span className="text-white font-medium flex-1">
                              {integration.name}
                            </span>
                            {integrationRules.length > 0 && (
                              <span className="text-dark-500 text-sm">
                                {activeRulesCount}/{integrationRules.length} regra(s) ativa(s)
                              </span>
                            )}
                          </div>

                          {/* Rules */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="border-t border-dark-700 overflow-hidden"
                              >
                                <div className="p-3 space-y-2">
                                  {integrationRules.length === 0 ? (
                                    <p className="text-dark-500 text-sm text-center py-3">
                                      Nenhuma regra configurada
                                    </p>
                                  ) : (
                                    integrationRules.map(rule => {
                                      const event = integration.events.find(
                                        e => e.id === rule.trigger_event
                                      )
                                      return (
                                        <div
                                          key={rule.id}
                                          className="flex items-center gap-3 p-3 bg-dark-900/50 rounded-lg group"
                                        >
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleToggleRule(rule)
                                            }}
                                            className={`w-10 h-5 rounded-full transition-colors ${
                                              rule.is_enabled ? 'bg-green-500' : 'bg-dark-600'
                                            }`}
                                          >
                                            <div
                                              className={`w-4 h-4 rounded-full bg-white transform transition-transform ${
                                                rule.is_enabled ? 'translate-x-5' : 'translate-x-0.5'
                                              }`}
                                            />
                                          </button>
                                          <div className="flex-1 min-w-0">
                                            <p className={`text-sm truncate ${rule.is_enabled ? 'text-white' : 'text-dark-500'}`}>
                                              {rule.name}
                                            </p>
                                            <p className="text-dark-500 text-xs">
                                              {event?.label || rule.trigger_event}
                                              {rule.initial_stage && (
                                                <span> → {rule.initial_stage.name}</span>
                                              )}
                                            </p>
                                          </div>
                                          <span className="text-dark-600 text-xs">
                                            {rule.deals_created_count} deals
                                          </span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setEditingRule(rule)
                                            }}
                                            className="p-1.5 text-dark-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                                          >
                                            <Settings className="w-4 h-4" />
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleDeleteRule(rule)
                                            }}
                                            className="p-1.5 text-dark-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                      )
                                    })
                                  )}

                                  <button
                                    onClick={() => setNewRuleSource(integration.type)}
                                    className="w-full py-2 text-sm text-dark-500 hover:text-white border border-dashed border-dark-700 rounded-lg hover:border-dark-500 transition-colors"
                                  >
                                    + Adicionar regra de {integration.name}
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Integrações não configuradas */}
                {notConfiguredIntegrations.length > 0 && (
                  <div className="pt-4 border-t border-dark-700">
                    <p className="text-dark-600 text-xs mb-2">
                      Integrações não configuradas:
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {notConfiguredIntegrations.map(int => (
                        <span
                          key={int.type}
                          className="px-2 py-1 bg-dark-900 border border-dark-800 rounded text-dark-600 text-xs"
                        >
                          {int.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <ArrowRight className="w-12 h-12 text-dark-600 mx-auto mb-3" />
                <p className="text-dark-400">Transições automáticas</p>
                <p className="text-dark-500 text-sm mt-1">
                  Em breve: mova deals entre estágios automaticamente
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-dark-700 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
            >
              Fechar
            </button>
          </div>
        </motion.div>
      </div>

      {/* Add Source Modal */}
      <AddSourceModal
        isOpen={showAddSource}
        onClose={() => setShowAddSource(false)}
        integrations={connectedIntegrations}
        existingSources={Object.keys(rulesBySource)}
        onSelect={(sourceType) => {
          setShowAddSource(false)
          setNewRuleSource(sourceType)
        }}
      />

      {/* Rule Config Modal */}
      <RuleConfigModal
        isOpen={!!newRuleSource || !!editingRule}
        onClose={() => {
          setNewRuleSource(null)
          setEditingRule(null)
        }}
        sourceType={newRuleSource || editingRule?.source_type || ''}
        integration={connectedIntegrations.find(
          i => i.type === (newRuleSource || editingRule?.source_type)
        )}
        stages={sortedStages}
        rule={editingRule}
        onSave={handleSaveRule}
        saving={saving}
      />
    </>
  )
}

// =============================================
// ADD SOURCE MODAL
// =============================================

interface AddSourceModalProps {
  isOpen: boolean
  onClose: () => void
  integrations: ConnectedIntegration[]
  existingSources: string[]
  onSelect: (sourceType: string) => void
}

function AddSourceModal({
  isOpen,
  onClose,
  integrations,
  existingSources,
  onSelect,
}: AddSourceModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-dark-800 rounded-2xl w-full max-w-md border border-dark-700 shadow-2xl"
      >
        <div className="p-4 border-b border-dark-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Adicionar Regra</h2>
          <button
            onClick={onClose}
            className="p-2 text-dark-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <p className="text-dark-400 text-sm mb-4">
            Selecione uma integração:
          </p>

          <div className="grid grid-cols-2 gap-3">
            {integrations.map(integration => {
              const Icon = ICON_MAP[integration.icon] || Link
              const colorClass = COLOR_MAP[integration.color] || COLOR_MAP.gray

              return (
                <button
                  key={integration.id}
                  onClick={() => onSelect(integration.type)}
                  className="p-4 bg-dark-900 border border-dark-700 rounded-xl hover:border-dark-500 hover:bg-dark-850 transition-all text-left group"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${colorClass.split(' ')[1]}`}>
                    <Icon className={`w-5 h-5 ${colorClass.split(' ')[0]}`} />
                  </div>
                  <p className="text-white font-medium">{integration.name}</p>
                  <p className="text-dark-500 text-xs mt-0.5">
                    {integration.events.length} eventos
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// =============================================
// RULE CONFIG MODAL
// =============================================

interface RuleConfigModalProps {
  isOpen: boolean
  onClose: () => void
  sourceType: string
  integration?: ConnectedIntegration
  stages: Stage[]
  rule: AutomationRule | null
  onSave: (data: any) => void
  saving: boolean
}

function RuleConfigModal({
  isOpen,
  onClose,
  sourceType,
  integration,
  stages,
  rule,
  onSave,
  saving,
}: RuleConfigModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    triggerEvent: '',
    filters: {} as Record<string, any>,
    initialStageId: '',
    isEnabled: true,
  })

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (rule) {
        setFormData({
          name: rule.name,
          triggerEvent: rule.trigger_event,
          filters: rule.filters || {},
          initialStageId: rule.initial_stage_id || stages[0]?.id || '',
          isEnabled: rule.is_enabled,
        })
      } else {
        setFormData({
          name: '',
          triggerEvent: '',
          filters: {},
          initialStageId: stages[0]?.id || '',
          isEnabled: true,
        })
      }
    }
  }, [isOpen, rule, stages])

  if (!isOpen || !integration) return null

  const Icon = ICON_MAP[integration.icon] || Link
  const colorClass = COLOR_MAP[integration.color] || COLOR_MAP.gray
  const selectedEvent = integration.events.find(e => e.id === formData.triggerEvent)

  const handleSubmit = () => {
    if (!formData.name || !formData.triggerEvent) return
    onSave(formData)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-dark-800 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-dark-700 shadow-2xl"
      >
        {/* Header */}
        <div className="p-4 border-b border-dark-700 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClass.split(' ')[1]}`}>
            <Icon className={`w-4 h-4 ${colorClass.split(' ')[0]}`} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white">
              {rule ? 'Editar' : 'Nova'} Regra - {integration.name}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 text-dark-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Nome da Regra
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Pedidos pagos acima de R$500"
              className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white placeholder-dark-500 focus:border-primary-500 focus:outline-none"
            />
          </div>

          {/* Evento */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              <Zap className="w-4 h-4 inline mr-1" />
              Evento que Dispara
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {integration.events.map(event => (
                <label
                  key={event.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    formData.triggerEvent === event.id
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-dark-700 hover:border-dark-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="triggerEvent"
                    value={event.id}
                    checked={formData.triggerEvent === event.id}
                    onChange={e => setFormData({ ...formData, triggerEvent: e.target.value })}
                    className="sr-only"
                  />
                  <div className="flex-1">
                    <p className={`text-sm ${formData.triggerEvent === event.id ? 'text-white' : 'text-dark-300'}`}>
                      {event.label}
                    </p>
                    <p className="text-xs text-dark-500">{event.description}</p>
                  </div>
                  {formData.triggerEvent === event.id && (
                    <CheckCircle className="w-4 h-4 text-primary-400" />
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Filtros */}
          {integration.filters.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Filtros (opcional)
              </label>
              <div className="space-y-3 p-3 bg-dark-900 rounded-lg border border-dark-700">
                {integration.filters.map(filter => (
                  <div key={filter.id}>
                    <label className="block text-xs text-dark-500 mb-1">
                      {filter.label}
                    </label>
                    {filter.type === 'number' ? (
                      <input
                        type="number"
                        value={formData.filters[filter.id] || ''}
                        onChange={e => setFormData({
                          ...formData,
                          filters: {
                            ...formData.filters,
                            [filter.id]: e.target.value ? Number(e.target.value) : undefined,
                          },
                        })}
                        placeholder={filter.placeholder}
                        className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white text-sm focus:border-primary-500 focus:outline-none"
                      />
                    ) : filter.type === 'tags' ? (
                      <input
                        type="text"
                        value={(formData.filters[filter.id] || []).join(', ')}
                        onChange={e => setFormData({
                          ...formData,
                          filters: {
                            ...formData.filters,
                            [filter.id]: e.target.value.split(',').map(t => t.trim()).filter(Boolean),
                          },
                        })}
                        placeholder={filter.placeholder}
                        className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white text-sm placeholder-dark-600 focus:border-primary-500 focus:outline-none"
                      />
                    ) : filter.type === 'boolean' ? (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.filters[filter.id] || false}
                          onChange={e => setFormData({
                            ...formData,
                            filters: {
                              ...formData.filters,
                              [filter.id]: e.target.checked,
                            },
                          })}
                          className="rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500"
                        />
                        <span className="text-sm text-dark-400">{filter.placeholder || 'Ativar'}</span>
                      </label>
                    ) : (
                      <input
                        type="text"
                        value={formData.filters[filter.id] || ''}
                        onChange={e => setFormData({
                          ...formData,
                          filters: {
                            ...formData.filters,
                            [filter.id]: e.target.value,
                          },
                        })}
                        placeholder={filter.placeholder}
                        className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-white text-sm placeholder-dark-600 focus:border-primary-500 focus:outline-none"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Estágio inicial */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              <ArrowRight className="w-4 h-4 inline mr-1" />
              Estágio Inicial
            </label>
            <select
              value={formData.initialStageId}
              onChange={e => setFormData({ ...formData, initialStageId: e.target.value })}
              className="w-full px-3 py-2 bg-dark-900 border border-dark-700 rounded-lg text-white focus:border-primary-500 focus:outline-none"
            >
              <option value="">Selecione um estágio</option>
              {stages.map(stage => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-dark-500 mt-1">
              Deals criados entrarão neste estágio
            </p>
          </div>

          {/* Toggle ativo */}
          <label className="flex items-center justify-between p-3 bg-dark-900 rounded-lg border border-dark-700 cursor-pointer">
            <div>
              <p className="text-white text-sm font-medium">Regra Ativa</p>
              <p className="text-dark-500 text-xs">Regras inativas não criam deals</p>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, isEnabled: !formData.isEnabled })}
              className={`w-12 h-6 rounded-full transition-colors ${
                formData.isEnabled ? 'bg-green-500' : 'bg-dark-600'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transform transition-transform ${
                  formData.isEnabled ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-dark-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-dark-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.name || !formData.triggerEvent || saving}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {rule ? 'Salvar' : 'Criar Regra'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export default PipelineAutomationConfig
