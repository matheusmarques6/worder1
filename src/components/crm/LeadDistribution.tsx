'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  Settings,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  ChevronRight,
  X,
  UserPlus,
  UserMinus,
  Shuffle,
  Scale,
  Target,
  Zap,
  Activity,
  CheckCircle,
  Clock,
  TrendingUp,
  BarChart3,
  User,
  Mail,
} from 'lucide-react'
import {
  useLeadDistribution,
  DistributionRule,
  AgentConfig,
  CreateRuleParams,
} from '@/hooks/useLeadDistribution'

// =============================================
// Types
// =============================================

interface LeadDistributionProps {
  organizationId: string
  storeId?: string | null
  availableAgents?: Array<{
    id: string
    email: string
    full_name: string
  }>
}

// =============================================
// Helper Functions
// =============================================

const getDistributionTypeIcon = (type: string) => {
  switch (type) {
    case 'round_robin':
      return <Shuffle className="w-4 h-4" />
    case 'weighted':
      return <Scale className="w-4 h-4" />
    case 'capacity':
      return <Target className="w-4 h-4" />
    case 'skill_based':
      return <Zap className="w-4 h-4" />
    default:
      return <Users className="w-4 h-4" />
  }
}

const getDistributionTypeLabel = (type: string): string => {
  switch (type) {
    case 'round_robin':
      return 'Round Robin'
    case 'weighted':
      return 'Ponderado'
    case 'capacity':
      return 'Por Capacidade'
    case 'skill_based':
      return 'Por Habilidades'
    default:
      return type
  }
}

const getDistributionTypeDescription = (type: string): string => {
  switch (type) {
    case 'round_robin':
      return 'Distribui leads igualmente entre os agentes em sequencia'
    case 'weighted':
      return 'Distribui leads com base no peso configurado de cada agente'
    case 'capacity':
      return 'Distribui leads para agentes com mais capacidade disponivel'
    case 'skill_based':
      return 'Distribui leads com base nas habilidades requeridas'
    default:
      return ''
  }
}

// =============================================
// Main Component
// =============================================

export function LeadDistribution({
  organizationId,
  storeId,
  availableAgents = [],
}: LeadDistributionProps) {
  const {
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
    addAgent,
    removeAgent,
    updateAgentConfig,
  } = useLeadDistribution({ organizationId, storeId })

  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showConfigModal, setShowConfigModal] = useState(false)
  const [showLogsModal, setShowLogsModal] = useState(false)
  const [editingRule, setEditingRule] = useState<DistributionRule | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Filter rules
  const filteredRules = useMemo(() => {
    return rules.filter(rule =>
      rule.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [rules, searchQuery])

  // Overall stats
  const overallStats = useMemo(() => {
    const activeRules = rules.filter(r => r.is_active).length
    const totalDistributions = rules.reduce((sum, r) => sum + (r.today_distributions || 0), 0)
    const totalAgents = new Set(rules.flatMap(r => r.config.agents.map(a => a.agent_id))).size

    return { activeRules, totalDistributions, totalAgents }
  }, [rules])

  // Handle edit rule config
  const handleConfigRule = async (rule: DistributionRule) => {
    await loadRule(rule.id)
    setEditingRule(rule)
    setShowConfigModal(true)
  }

  // Handle view logs
  const handleViewLogs = async (rule: DistributionRule) => {
    await loadRule(rule.id)
    setShowLogsModal(true)
  }

  // Handle toggle active
  const handleToggleActive = async (rule: DistributionRule) => {
    await updateRule(rule.id, { is_active: !rule.is_active })
  }

  // Handle delete
  const handleDelete = async (id: string) => {
    if (deletingId === id) {
      await deleteRule(id)
      setDeletingId(null)
    } else {
      setDeletingId(id)
      setTimeout(() => setDeletingId(null), 3000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Settings className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Regras Ativas</p>
              <p className="text-2xl font-bold text-white">{overallStats.activeRules}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Distribuicoes Hoje</p>
              <p className="text-2xl font-bold text-white">{overallStats.totalDistributions}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Agentes Configurados</p>
              <p className="text-2xl font-bold text-white">{overallStats.totalAgents}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar regras..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadRules()}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Regra
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Rules List */}
      <div className="space-y-3">
        <AnimatePresence>
          {filteredRules.map((rule, index) => (
            <motion.div
              key={rule.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.05 }}
              className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start gap-4">
                {/* Type Icon */}
                <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${
                  rule.is_active ? 'bg-violet-500/20' : 'bg-slate-700/50'
                }`}>
                  {getDistributionTypeIcon(rule.distribution_type)}
                </div>

                {/* Rule Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-medium text-white truncate">{rule.name}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      rule.is_active
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-600/50 text-slate-400'
                    }`}>
                      {rule.is_active ? 'Ativa' : 'Inativa'}
                    </span>
                  </div>

                  <p className="text-sm text-slate-400 mb-3">
                    {getDistributionTypeLabel(rule.distribution_type)} - {getDistributionTypeDescription(rule.distribution_type)}
                  </p>

                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Users className="w-4 h-4" />
                      <span>{rule.config.agents.length} agentes</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Activity className="w-4 h-4" />
                      <span>{rule.today_distributions || 0} hoje</span>
                    </div>
                    {rule.config.agents.filter(a => a.is_available).length < rule.config.agents.length && (
                      <div className="flex items-center gap-1.5 text-yellow-400">
                        <Clock className="w-4 h-4" />
                        <span>{rule.config.agents.filter(a => !a.is_available).length} indisponiveis</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Agent Distribution Mini Chart */}
                {rule.agent_distribution && Object.keys(rule.agent_distribution).length > 0 && (
                  <div className="flex-shrink-0 w-24">
                    <p className="text-xs text-slate-400 mb-2">Distribuicao</p>
                    <div className="space-y-1">
                      {Object.entries(rule.agent_distribution).slice(0, 3).map(([agentId, count]) => (
                        <div key={agentId} className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-violet-500"
                              style={{ width: `${Math.min((count as number / (rule.today_distributions || 1)) * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400 w-4">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleViewLogs(rule)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    title="Ver Historico"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleConfigRule(rule)}
                    className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors"
                    title="Configurar Agentes"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(rule)}
                    className={`p-2 hover:bg-slate-700 rounded-lg transition-colors ${
                      rule.is_active ? 'text-emerald-400' : 'text-slate-400 hover:text-emerald-400'
                    }`}
                    title={rule.is_active ? 'Desativar' : 'Ativar'}
                  >
                    {rule.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      deletingId === rule.id
                        ? 'bg-red-500 text-white'
                        : 'text-slate-400 hover:text-red-400 hover:bg-slate-700'
                    }`}
                    title={deletingId === rule.id ? 'Clique novamente para confirmar' : 'Excluir'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Empty State */}
        {filteredRules.length === 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <Shuffle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              {searchQuery ? 'Nenhuma regra encontrada' : 'Nenhuma regra criada'}
            </h3>
            <p className="text-slate-400 mb-4">
              {searchQuery
                ? 'Tente ajustar os filtros de busca'
                : 'Configure regras de distribuicao para automatizar a atribuicao de leads'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Criar Regra
              </button>
            )}
          </motion.div>
        )}

        {/* Loading State */}
        {isLoading && rules.length === 0 && (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 text-violet-400 mx-auto mb-4 animate-spin" />
            <p className="text-slate-400">Carregando regras...</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <CreateRuleModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={async (params) => {
          const result = await createRule(params)
          if (result) {
            setShowCreateModal(false)
          }
        }}
      />

      {/* Config Modal */}
      <ConfigRuleModal
        isOpen={showConfigModal}
        onClose={() => {
          setShowConfigModal(false)
          setEditingRule(null)
        }}
        rule={editingRule || selectedRule}
        availableAgents={availableAgents}
        onAddAgent={async (agent) => {
          if (editingRule || selectedRule) {
            await addAgent((editingRule || selectedRule)!.id, agent)
          }
        }}
        onRemoveAgent={async (agentId) => {
          if (editingRule || selectedRule) {
            await removeAgent((editingRule || selectedRule)!.id, agentId)
          }
        }}
        onUpdateAgent={async (agentId, updates) => {
          if (editingRule || selectedRule) {
            await updateAgentConfig((editingRule || selectedRule)!.id, agentId, updates)
          }
        }}
        onUpdateRule={async (updates) => {
          if (editingRule || selectedRule) {
            await updateRule((editingRule || selectedRule)!.id, updates)
          }
        }}
      />

      {/* Logs Modal */}
      <LogsModal
        isOpen={showLogsModal}
        onClose={() => setShowLogsModal(false)}
        rule={selectedRule}
        logs={logs}
      />
    </div>
  )
}

// =============================================
// Create Rule Modal
// =============================================

interface CreateRuleModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (params: CreateRuleParams) => Promise<void>
}

function CreateRuleModal({ isOpen, onClose, onSave }: CreateRuleModalProps) {
  const [name, setName] = useState('')
  const [distributionType, setDistributionType] = useState<'round_robin' | 'weighted' | 'capacity' | 'skill_based'>('round_robin')
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return

    setIsSaving(true)
    try {
      await onSave({
        name: name.trim(),
        distribution_type: distributionType,
        config: { agents: [] },
      })
      setName('')
      setDistributionType('round_robin')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-slate-800 border border-slate-700 rounded-xl shadow-xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Nova Regra de Distribuicao</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Nome da Regra *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Distribuicao Equipe Vendas"
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Tipo de Distribuicao
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(['round_robin', 'weighted', 'capacity', 'skill_based'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setDistributionType(type)}
                  className={`p-3 rounded-lg border transition-colors text-left ${
                    distributionType === type
                      ? 'border-violet-500 bg-violet-500/20'
                      : 'border-slate-600 bg-slate-700/30 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {getDistributionTypeIcon(type)}
                    <span className="font-medium text-white">{getDistributionTypeLabel(type)}</span>
                  </div>
                  <p className="text-xs text-slate-400">{getDistributionTypeDescription(type)}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || isSaving}
            className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
          >
            {isSaving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Criar Regra
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// =============================================
// Config Rule Modal
// =============================================

interface ConfigRuleModalProps {
  isOpen: boolean
  onClose: () => void
  rule: DistributionRule | null
  availableAgents: Array<{ id: string; email: string; full_name: string }>
  onAddAgent: (agent: AgentConfig) => Promise<void>
  onRemoveAgent: (agentId: string) => Promise<void>
  onUpdateAgent: (agentId: string, updates: Partial<AgentConfig>) => Promise<void>
  onUpdateRule: (updates: Partial<DistributionRule>) => Promise<void>
}

function ConfigRuleModal({
  isOpen,
  onClose,
  rule,
  availableAgents,
  onAddAgent,
  onRemoveAgent,
  onUpdateAgent,
  onUpdateRule,
}: ConfigRuleModalProps) {
  const [selectedAgentId, setSelectedAgentId] = useState('')

  const handleAddAgent = async () => {
    if (!selectedAgentId) return

    const agent = availableAgents.find(a => a.id === selectedAgentId)
    if (!agent) return

    await onAddAgent({
      agent_id: agent.id,
      agent_name: agent.full_name,
      agent_email: agent.email,
      weight: 1,
      max_capacity: 50,
      skills: [],
      is_available: true,
    })

    setSelectedAgentId('')
  }

  if (!isOpen || !rule) return null

  const configuredAgentIds = rule.config.agents.map(a => a.agent_id)
  const unassignedAgents = availableAgents.filter(a => !configuredAgentIds.includes(a.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-white">{rule.name}</h2>
            <p className="text-sm text-slate-400">Configurar agentes e parametros</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Add Agent */}
          {unassignedAgents.length > 0 && (
            <div className="flex items-center gap-3">
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="">Selecionar agente...</option>
                {unassignedAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.full_name} ({agent.email})
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddAgent}
                disabled={!selectedAgentId}
                className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Adicionar
              </button>
            </div>
          )}

          {/* Agents List */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-400">Agentes Configurados ({rule.config.agents.length})</h3>

            {rule.config.agents.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-600 rounded-lg">
                <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400">Nenhum agente configurado</p>
              </div>
            ) : (
              rule.config.agents.map((agent) => (
                <div
                  key={agent.agent_id}
                  className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center">
                      <User className="w-5 h-5 text-slate-300" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-white truncate">{agent.agent_name || 'Agente'}</p>
                      <p className="text-sm text-slate-400 truncate">{agent.agent_email}</p>
                    </div>

                    {/* Availability Toggle */}
                    <button
                      onClick={() => onUpdateAgent(agent.agent_id, { is_available: !agent.is_available })}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm ${
                        agent.is_available
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-slate-600/50 text-slate-400'
                      }`}
                    >
                      {agent.is_available ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5" />
                          Disponivel
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5" />
                          Indisponivel
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => onRemoveAgent(agent.agent_id)}
                      className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-600/50 rounded-lg transition-colors"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Config Fields based on distribution type */}
                  {rule.distribution_type === 'weighted' && (
                    <div className="mt-3 pt-3 border-t border-slate-600/50">
                      <label className="block text-xs text-slate-400 mb-1">Peso</label>
                      <input
                        type="number"
                        value={agent.weight || 1}
                        onChange={(e) => onUpdateAgent(agent.agent_id, { weight: parseInt(e.target.value) || 1 })}
                        min={1}
                        max={10}
                        className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                      />
                    </div>
                  )}

                  {rule.distribution_type === 'capacity' && (
                    <div className="mt-3 pt-3 border-t border-slate-600/50">
                      <label className="block text-xs text-slate-400 mb-1">Capacidade Maxima</label>
                      <input
                        type="number"
                        value={agent.max_capacity || 50}
                        onChange={(e) => onUpdateAgent(agent.agent_id, { max_capacity: parseInt(e.target.value) || 50 })}
                        min={1}
                        className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                      />
                    </div>
                  )}

                  {rule.distribution_type === 'skill_based' && (
                    <div className="mt-3 pt-3 border-t border-slate-600/50">
                      <label className="block text-xs text-slate-400 mb-1">Habilidades (separadas por virgula)</label>
                      <input
                        type="text"
                        value={(agent.skills || []).join(', ')}
                        onChange={(e) => onUpdateAgent(agent.agent_id, { skills: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                        placeholder="vendas, suporte, tecnico"
                        className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm"
                      />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Skill Requirements (for skill_based) */}
          {rule.distribution_type === 'skill_based' && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 mb-2">Habilidades Requeridas para Novos Leads</h3>
              <input
                type="text"
                value={(rule.config.skills_required || []).join(', ')}
                onChange={(e) => onUpdateRule({
                  config: {
                    ...rule.config,
                    skills_required: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  }
                })}
                placeholder="vendas, portugues"
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400"
              />
            </div>
          )}

          {/* Fallback Agent */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 mb-2">Agente de Fallback</h3>
            <select
              value={rule.config.fallback_agent_id || ''}
              onChange={(e) => onUpdateRule({
                config: { ...rule.config, fallback_agent_id: e.target.value || undefined }
              })}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="">Nenhum (erro se ninguem disponivel)</option>
              {availableAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.full_name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">
              Usado quando nenhum agente esta disponivel
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end p-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-colors"
          >
            Concluir
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// =============================================
// Logs Modal
// =============================================

interface LogsModalProps {
  isOpen: boolean
  onClose: () => void
  rule: DistributionRule | null
  logs: Array<{
    id: string
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
  }>
}

function LogsModal({ isOpen, onClose, rule, logs }: LogsModalProps) {
  if (!isOpen || !rule) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-white">Historico de Distribuicao</h2>
            <p className="text-sm text-slate-400">{rule.name} - Ultimas 100 distribuicoes</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {logs.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">Nenhuma distribuicao registrada ainda</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg"
                >
                  <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
                    <ChevronRight className="w-4 h-4 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">
                      Lead distribuido para{' '}
                      <span className="font-medium">{log.profiles?.full_name || log.assigned_to}</span>
                    </p>
                    <p className="text-xs text-slate-400">{log.reason}</p>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(log.created_at).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end p-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  )
}

export default LeadDistribution
