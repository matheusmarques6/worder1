'use client'

// =============================================
// Automations Panel - Painel Principal de Automações
// src/components/crm/automations/AutomationsPanel.tsx
// =============================================

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Zap,
  ArrowRight,
  ShoppingCart,
  MessageCircle,
  Flame,
  Settings,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  History,
  TrendingUp,
  Target,
  Activity,
  ExternalLink,
  RefreshCw,
  Link,
  ShoppingBag,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import { CreateDealRuleModal } from './CreateDealRuleModal'
import { MoveStageRuleModal } from './MoveStageRuleModal'
import { AutomationLogsModal } from './AutomationLogsModal'

// =============================================
// TYPES
// =============================================

interface AutomationRule {
  id: string
  name: string
  source_type: string
  trigger_event: string
  action_type: 'create_deal' | 'move_stage' | 'update_deal'
  filters: Record<string, any>
  pipeline_id: string
  pipeline?: { id: string; name: string; color: string }
  initial_stage_id: string | null
  initial_stage?: { id: string; name: string; color: string }
  target_stage_id?: string | null
  target_stage?: { id: string; name: string; color: string }
  from_stage_id?: string | null
  is_enabled: boolean
  deals_created_count: number
  deals_moved_count: number
  created_at: string
}

interface ConnectedIntegration {
  id: string
  type: string
  name: string
  icon: string
  color: string
  isConnected: boolean
  events: Array<{
    id: string
    label: string
    description: string
    category: 'create_deal' | 'move_stage'
  }>
}

interface AutomationStats {
  totalRules: number
  activeRules: number
  dealsCreatedMonth: number
  dealsMovedMonth: number
  errorsWeek: number
}

interface AutomationLog {
  id: string
  status: 'success' | 'error' | 'skipped'
  source_type: string
  event_type: string
  message: string
  created_at: string
  deal_id?: string
  contact_id?: string
  metadata?: Record<string, any>
}

interface Pipeline {
  id: string
  name: string
  color: string
  stages: Array<{ id: string; name: string; color: string; position: number }>
}

// =============================================
// ICON MAP
// =============================================

const SOURCE_ICONS: Record<string, any> = {
  shopify: ShoppingCart,
  whatsapp: MessageCircle,
  hotmart: Flame,
  woocommerce: ShoppingBag,
  webhook: Link,
}

const SOURCE_COLORS: Record<string, string> = {
  shopify: 'text-green-400 bg-green-500/20',
  whatsapp: 'text-emerald-400 bg-emerald-500/20',
  hotmart: 'text-orange-400 bg-orange-500/20',
  woocommerce: 'text-purple-400 bg-purple-500/20',
  webhook: 'text-blue-400 bg-blue-500/20',
}

const SOURCE_NAMES: Record<string, string> = {
  shopify: 'Shopify',
  whatsapp: 'WhatsApp',
  hotmart: 'Hotmart',
  woocommerce: 'WooCommerce',
  webhook: 'Webhook',
}

// =============================================
// MAIN COMPONENT
// =============================================

export function AutomationsPanel() {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id

  // State
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<AutomationStats>({
    totalRules: 0,
    activeRules: 0,
    dealsCreatedMonth: 0,
    dealsMovedMonth: 0,
    errorsWeek: 0,
  })
  const [createDealRules, setCreateDealRules] = useState<AutomationRule[]>([])
  const [moveStageRules, setMoveStageRules] = useState<AutomationRule[]>([])
  const [connectedIntegrations, setConnectedIntegrations] = useState<ConnectedIntegration[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [recentLogs, setRecentLogs] = useState<AutomationLog[]>([])
  const [expandedSources, setExpandedSources] = useState<string[]>(['shopify', 'whatsapp'])

  // Modals
  const [showCreateDealModal, setShowCreateDealModal] = useState(false)
  const [showMoveStageModal, setShowMoveStageModal] = useState(false)
  const [showLogsModal, setShowLogsModal] = useState(false)
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null)
  const [selectedSource, setSelectedSource] = useState<string | null>(null)

  // =============================================
  // DATA FETCHING
  // =============================================

  const fetchData = useCallback(async () => {
    if (!organizationId) return

    setLoading(true)
    try {
      // Fetch all data in parallel
      const [rulesRes, integrationsRes, pipelinesRes, logsRes, statsRes] = await Promise.all([
        fetch(`/api/automations/rules?organizationId=${organizationId}`),
        fetch(`/api/integrations/connected?organizationId=${organizationId}`),
        fetch(`/api/deals?organizationId=${organizationId}&type=pipelines`),
        fetch(`/api/automations/logs?organizationId=${organizationId}&limit=10`),
        fetch(`/api/automations/stats?organizationId=${organizationId}`),
      ])

      const [rulesData, integrationsData, pipelinesData, logsData, statsData] = await Promise.all([
        rulesRes.json(),
        integrationsRes.json(),
        pipelinesRes.json(),
        logsRes.json(),
        statsRes.json(),
      ])

      // Process rules by action type
      const allRules = rulesData.rules || []
      setCreateDealRules(allRules.filter((r: AutomationRule) => r.action_type === 'create_deal'))
      setMoveStageRules(allRules.filter((r: AutomationRule) => r.action_type === 'move_stage'))

      // Connected integrations
      setConnectedIntegrations(integrationsData.connected || [])

      // Pipelines
      setPipelines(pipelinesData.pipelines || [])

      // Logs
      setRecentLogs(logsData.logs || [])

      // Stats
      if (statsData) {
        setStats({
          totalRules: statsData.totalRules || allRules.length,
          activeRules: statsData.activeRules || allRules.filter((r: AutomationRule) => r.is_enabled).length,
          dealsCreatedMonth: statsData.dealsCreatedMonth || 0,
          dealsMovedMonth: statsData.dealsMovedMonth || 0,
          errorsWeek: statsData.errorsWeek || 0,
        })
      }

      // Expand sources with rules
      const sourcesWithRules = [...new Set(allRules.map((r: AutomationRule) => r.source_type))]
      if (sourcesWithRules.length > 0) {
        setExpandedSources(sourcesWithRules as string[])
      }

    } catch (error) {
      console.error('Error fetching automation data:', error)
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // =============================================
  // HANDLERS
  // =============================================

  const toggleSource = (source: string) => {
    setExpandedSources(prev =>
      prev.includes(source)
        ? prev.filter(s => s !== source)
        : [...prev, source]
    )
  }

  const handleToggleRule = async (rule: AutomationRule) => {
    try {
      await fetch(`/api/automations/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_enabled: !rule.is_enabled,
          organizationId,
        }),
      })
      fetchData()
    } catch (error) {
      console.error('Error toggling rule:', error)
    }
  }

  const handleDeleteRule = async (rule: AutomationRule) => {
    if (!confirm(`Tem certeza que deseja excluir a regra "${rule.name}"?`)) return

    try {
      await fetch(`/api/automations/rules/${rule.id}?organizationId=${organizationId}`, {
        method: 'DELETE',
      })
      fetchData()
    } catch (error) {
      console.error('Error deleting rule:', error)
    }
  }

  const handleEditRule = (rule: AutomationRule) => {
    setEditingRule(rule)
    if (rule.action_type === 'create_deal') {
      setShowCreateDealModal(true)
    } else {
      setShowMoveStageModal(true)
    }
  }

  const handleAddRule = (source: string, actionType: 'create_deal' | 'move_stage') => {
    setSelectedSource(source)
    setEditingRule(null)
    if (actionType === 'create_deal') {
      setShowCreateDealModal(true)
    } else {
      setShowMoveStageModal(true)
    }
  }

  // =============================================
  // RENDER HELPERS
  // =============================================

  const getRulesBySource = (rules: AutomationRule[], source: string) => {
    return rules.filter(r => r.source_type === source)
  }

  const renderRuleCard = (rule: AutomationRule) => {
    return (
      <div
        key={rule.id}
        className={`
          p-4 rounded-xl border transition-all
          ${rule.is_enabled
            ? 'bg-dark-800/50 border-dark-700/50 hover:border-dark-600'
            : 'bg-dark-900/50 border-dark-800 opacity-60'
          }
        `}
      >
        <div className="flex items-start gap-3">
          {/* Status Indicator */}
          <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${rule.is_enabled ? 'bg-green-500' : 'bg-dark-600'}`} />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-white truncate">{rule.name}</h4>
              {!rule.is_enabled && (
                <span className="text-xs text-dark-500">(inativo)</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-sm text-dark-400">
              <span>Evento: {rule.trigger_event}</span>
              <ArrowRight className="w-3 h-3" />
              {rule.action_type === 'create_deal' ? (
                <span>
                  Pipeline: <span className="text-white">{rule.pipeline?.name || '-'}</span>
                  {' → '}
                  Estágio: <span className="text-white">{rule.initial_stage?.name || '-'}</span>
                </span>
              ) : (
                <span>
                  Mover para: <span className="text-white">{rule.target_stage?.name || '-'}</span>
                </span>
              )}
            </div>

            {/* Filters Summary */}
            {rule.filters && Object.keys(rule.filters).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {rule.filters.min_value && (
                  <span className="px-2 py-0.5 text-xs bg-dark-700 rounded-full text-dark-300">
                    Valor ≥ R$ {rule.filters.min_value}
                  </span>
                )}
                {rule.filters.max_value && (
                  <span className="px-2 py-0.5 text-xs bg-dark-700 rounded-full text-dark-300">
                    Valor ≤ R$ {rule.filters.max_value}
                  </span>
                )}
                {rule.filters.include_tags?.length > 0 && (
                  <span className="px-2 py-0.5 text-xs bg-dark-700 rounded-full text-dark-300">
                    Tags: {rule.filters.include_tags.join(', ')}
                  </span>
                )}
              </div>
            )}

            {/* Stats */}
            <div className="mt-2 text-xs text-dark-500">
              {rule.action_type === 'create_deal'
                ? `${rule.deals_created_count || 0} deals criados`
                : `${rule.deals_moved_count || 0} deals movidos`
              }
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleToggleRule(rule)}
              className={`p-2 rounded-lg transition-colors ${
                rule.is_enabled
                  ? 'text-green-400 hover:bg-green-500/20'
                  : 'text-dark-500 hover:bg-dark-700'
              }`}
              title={rule.is_enabled ? 'Desativar' : 'Ativar'}
            >
              {rule.is_enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
            </button>
            <button
              onClick={() => handleEditRule(rule)}
              className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
              title="Editar"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDeleteRule(rule)}
              className="p-2 text-dark-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Excluir"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  const renderSourceSection = (source: string, rules: AutomationRule[], actionType: 'create_deal' | 'move_stage') => {
    const Icon = SOURCE_ICONS[source] || Zap
    const colorClass = SOURCE_COLORS[source] || 'text-gray-400 bg-gray-500/20'
    const name = SOURCE_NAMES[source] || source
    const sourceRules = getRulesBySource(rules, source)
    const activeCount = sourceRules.filter(r => r.is_enabled).length
    const isExpanded = expandedSources.includes(source)
    const integration = connectedIntegrations.find(i => i.type === source)

    if (!integration?.isConnected) return null

    return (
      <div key={source} className="border border-dark-700/50 rounded-xl overflow-hidden">
        {/* Source Header */}
        <button
          onClick={() => toggleSource(source)}
          className="w-full flex items-center justify-between p-4 bg-dark-800/30 hover:bg-dark-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${colorClass}`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h4 className="font-medium text-white">{name}</h4>
              <p className="text-xs text-dark-400">
                {activeCount} regra{activeCount !== 1 ? 's' : ''} ativa{activeCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-dark-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-dark-400" />
          )}
        </button>

        {/* Rules List */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-t border-dark-700/50"
            >
              <div className="p-4 space-y-3">
                {sourceRules.length === 0 ? (
                  <p className="text-sm text-dark-500 text-center py-4">
                    Nenhuma regra configurada
                  </p>
                ) : (
                  sourceRules.map(rule => renderRuleCard(rule))
                )}

                {/* Add Rule Button */}
                <button
                  onClick={() => handleAddRule(source, actionType)}
                  className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-dark-700 hover:border-primary-500/50 rounded-xl text-dark-400 hover:text-primary-400 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar regra</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // =============================================
  // LOADING STATE
  // =============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    )
  }

  // =============================================
  // MAIN RENDER
  // =============================================

  const connectedSources = connectedIntegrations.filter(i => i.isConnected).map(i => i.type)

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Automações</h2>
        <p className="text-dark-400">Configure como eventos externos criam e movem deals automaticamente</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-500/20 rounded-lg">
              <Zap className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.totalRules}</p>
              <p className="text-xs text-dark-400">Regras totais</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Activity className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.activeRules}</p>
              <p className="text-xs text-dark-400">Ativas</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.dealsCreatedMonth}</p>
              <p className="text-xs text-dark-400">Deals criados/mês</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-dark-800/50 border border-dark-700/50 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.errorsWeek}</p>
              <p className="text-xs text-dark-400">Erros (7 dias)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create Deals Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-primary-400" />
              Criar Deals
            </h3>
            <p className="text-sm text-dark-400">
              Regras que criam deals automaticamente quando eventos acontecem
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedSource(null)
              setEditingRule(null)
              setShowCreateDealModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Regra
          </button>
        </div>

        <div className="space-y-3">
          {connectedSources.length === 0 ? (
            <div className="p-8 bg-dark-800/30 border border-dark-700/50 rounded-xl text-center">
              <Zap className="w-12 h-12 text-dark-600 mx-auto mb-3" />
              <h4 className="font-medium text-white mb-2">Nenhuma integração conectada</h4>
              <p className="text-sm text-dark-400 mb-4">
                Conecte uma integração para configurar automações
              </p>
              <a
                href="/integrations"
                className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 text-sm"
              >
                Ir para Integrações
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          ) : (
            connectedSources.map(source => renderSourceSection(source, createDealRules, 'create_deal'))
          )}
        </div>
      </div>

      {/* Move Stages Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-blue-400" />
              Mover Estágios
            </h3>
            <p className="text-sm text-dark-400">
              Regras que movem deals entre estágios automaticamente
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedSource(null)
              setEditingRule(null)
              setShowMoveStageModal(true)
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Regra
          </button>
        </div>

        <div className="space-y-3">
          {connectedSources.length === 0 ? (
            <div className="p-8 bg-dark-800/30 border border-dark-700/50 rounded-xl text-center">
              <ArrowRight className="w-12 h-12 text-dark-600 mx-auto mb-3" />
              <p className="text-sm text-dark-400">
                Configure integrações para mover deals automaticamente
              </p>
            </div>
          ) : (
            connectedSources.map(source => renderSourceSection(source, moveStageRules, 'move_stage'))
          )}
        </div>
      </div>

      {/* Recent Logs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-amber-400" />
            Logs Recentes
          </h3>
          <button
            onClick={() => setShowLogsModal(true)}
            className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
          >
            Ver Todos
          </button>
        </div>

        <div className="bg-dark-800/30 border border-dark-700/50 rounded-xl overflow-hidden">
          {recentLogs.length === 0 ? (
            <div className="p-8 text-center">
              <History className="w-12 h-12 text-dark-600 mx-auto mb-3" />
              <p className="text-sm text-dark-400">Nenhum log registrado ainda</p>
            </div>
          ) : (
            <div className="divide-y divide-dark-700/50">
              {recentLogs.map(log => {
                const Icon = SOURCE_ICONS[log.source_type] || Zap
                const time = new Date(log.created_at)
                const timeStr = time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                const dateStr = time.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

                return (
                  <div key={log.id} className="flex items-center gap-3 p-3 hover:bg-dark-800/30 transition-colors">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      log.status === 'success' ? 'bg-green-500' :
                      log.status === 'error' ? 'bg-red-500' :
                      'bg-amber-500'
                    }`} />
                    <span className="text-xs text-dark-500 w-20 flex-shrink-0">
                      {dateStr} {timeStr}
                    </span>
                    <Icon className="w-4 h-4 text-dark-400 flex-shrink-0" />
                    <span className="text-sm text-dark-300 truncate flex-1">
                      {log.message}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <CreateDealRuleModal
        isOpen={showCreateDealModal}
        onClose={() => {
          setShowCreateDealModal(false)
          setEditingRule(null)
          setSelectedSource(null)
        }}
        onSave={fetchData}
        rule={editingRule}
        selectedSource={selectedSource}
        integrations={connectedIntegrations}
        pipelines={pipelines}
      />

      <MoveStageRuleModal
        isOpen={showMoveStageModal}
        onClose={() => {
          setShowMoveStageModal(false)
          setEditingRule(null)
          setSelectedSource(null)
        }}
        onSave={fetchData}
        rule={editingRule}
        selectedSource={selectedSource}
        integrations={connectedIntegrations}
        pipelines={pipelines}
      />

      <AutomationLogsModal
        isOpen={showLogsModal}
        onClose={() => setShowLogsModal(false)}
      />
    </div>
  )
}
