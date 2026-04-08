'use client'

import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Plus,
  Settings,
  Trash2,
  RefreshCw,
  ChevronRight,
  X,
  Timer,
  TrendingUp,
  TrendingDown,
  Users,
  MessageSquare,
  Bell,
  ToggleLeft,
  ToggleRight,
  Activity,
  AlertCircle,
  Search,
  Eye,
} from 'lucide-react'
import {
  useSLA,
  SLAConfig,
  SLAMetric,
  SLAStats,
  CreateConfigParams,
} from '@/hooks/useSLA'

// =============================================
// Types
// =============================================

interface SLADashboardProps {
  organizationId: string
  storeId?: string | null
}

// =============================================
// Helper Functions
// =============================================

const formatMinutes = (minutes: number): string => {
  if (Math.abs(minutes) < 60) {
    return `${Math.abs(minutes)}min`
  }
  const hours = Math.floor(Math.abs(minutes) / 60)
  const mins = Math.abs(minutes) % 60
  return `${hours}h ${mins}min`
}

const formatDateTime = (dateStr: string): string => {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'resolved':
      return 'text-emerald-400'
    case 'in_progress':
      return 'text-blue-400'
    case 'pending':
      return 'text-yellow-400'
    case 'breached':
      return 'text-red-400'
    default:
      return 'text-slate-400'
  }
}

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'resolved':
      return 'Resolvido'
    case 'in_progress':
      return 'Em Andamento'
    case 'pending':
      return 'Pendente'
    case 'breached':
      return 'Violado'
    default:
      return status
  }
}

const getPriorityColor = (priority: string): string => {
  switch (priority) {
    case 'urgent':
      return 'bg-red-500/20 text-red-400'
    case 'high':
      return 'bg-orange-500/20 text-orange-400'
    case 'normal':
      return 'bg-blue-500/20 text-blue-400'
    case 'low':
      return 'bg-slate-500/20 text-slate-400'
    default:
      return 'bg-slate-500/20 text-slate-400'
  }
}

// =============================================
// Main Component
// =============================================

export function SLADashboard({ organizationId, storeId }: SLADashboardProps) {
  const {
    configs,
    selectedConfig,
    metrics,
    stats,
    isLoading,
    error,
    loadConfigs,
    loadConfig,
    createConfig,
    updateConfig,
    deleteConfig,
    checkBreaches,
    getTimeRemaining,
  } = useSLA({ organizationId, storeId })

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showMetricsModal, setShowMetricsModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  // Check breaches periodically
  useEffect(() => {
    const interval = setInterval(() => {
      checkBreaches()
    }, 60000) // Check every minute

    return () => clearInterval(interval)
  }, [checkBreaches])

  // Handle check breaches
  const handleCheckBreaches = async () => {
    setIsChecking(true)
    try {
      const result = await checkBreaches()
      if (result.first_response > 0 || result.resolution > 0) {
        // Could show a toast notification here
      }
    } finally {
      setIsChecking(false)
    }
  }

  // Handle view metrics
  const handleViewMetrics = async (config: SLAConfig) => {
    await loadConfig(config.id)
    setShowMetricsModal(true)
  }

  // Handle toggle active
  const handleToggleActive = async (config: SLAConfig) => {
    await updateConfig(config.id, { is_active: !config.is_active })
  }

  // Handle delete
  const handleDelete = async (id: string) => {
    if (deletingId === id) {
      await deleteConfig(id)
      setDeletingId(null)
    } else {
      setDeletingId(id)
      setTimeout(() => setDeletingId(null), 3000)
    }
  }

  // Calculate overall stats
  const overallStats = useMemo(() => {
    const activeConfigs = configs.filter(c => c.is_active).length
    const totalTracked = configs.reduce((sum, c) => sum + (c.total_tracked || 0), 0)
    const avgCompliance = configs.length > 0
      ? configs.reduce((sum, c) => sum + (c.compliance_rate || 100), 0) / configs.length
      : 100

    return { activeConfigs, totalTracked, avgCompliance }
  }, [configs])

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <p className="text-sm text-slate-400">SLAs Ativos</p>
              <p className="text-2xl font-bold text-gray-900">{overallStats.activeConfigs}</p>
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
              <MessageSquare className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Conversas Rastreadas</p>
              <p className="text-2xl font-bold text-gray-900">{overallStats.totalTracked}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`border rounded-xl p-4 ${
            overallStats.avgCompliance >= 90 ? 'bg-emerald-500/10 border-emerald-500/30' :
            overallStats.avgCompliance >= 70 ? 'bg-yellow-500/10 border-yellow-500/30' :
            'bg-red-500/10 border-red-500/30'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              overallStats.avgCompliance >= 90 ? 'bg-emerald-500/20' :
              overallStats.avgCompliance >= 70 ? 'bg-yellow-500/20' :
              'bg-red-500/20'
            }`}>
              {overallStats.avgCompliance >= 90 ? (
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              ) : overallStats.avgCompliance >= 70 ? (
                <Activity className="w-5 h-5 text-yellow-400" />
              ) : (
                <TrendingDown className="w-5 h-5 text-red-400" />
              )}
            </div>
            <div>
              <p className="text-sm text-slate-400">Compliance Medio</p>
              <p className={`text-2xl font-bold ${
                overallStats.avgCompliance >= 90 ? 'text-emerald-400' :
                overallStats.avgCompliance >= 70 ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                {overallStats.avgCompliance.toFixed(1)}%
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <Bell className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Verificar Violacoes</p>
              <button
                onClick={handleCheckBreaches}
                disabled={isChecking}
                className="text-sm text-orange-400 hover:text-orange-300 font-medium flex items-center gap-1"
              >
                {isChecking ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                Verificar Agora
              </button>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-gray-900">Configuracoes de SLA</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadConfigs()}
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
            Novo SLA
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Configs List */}
      <div className="space-y-3">
        <AnimatePresence>
          {configs.map((config, index) => (
            <motion.div
              key={config.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.05 }}
              className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start gap-4">
                {/* Compliance Badge */}
                <div className={`flex-shrink-0 w-16 h-16 rounded-xl flex flex-col items-center justify-center ${
                  (config.compliance_rate || 100) >= 90 ? 'bg-emerald-500/20' :
                  (config.compliance_rate || 100) >= 70 ? 'bg-yellow-500/20' :
                  'bg-red-500/20'
                }`}>
                  <span className={`text-xl font-bold ${
                    (config.compliance_rate || 100) >= 90 ? 'text-emerald-400' :
                    (config.compliance_rate || 100) >= 70 ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>
                    {(config.compliance_rate || 100).toFixed(0)}%
                  </span>
                  <span className="text-xs text-slate-400">SLA</span>
                </div>

                {/* Config Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-medium text-gray-900 truncate">{config.name}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      config.is_active
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-600/50 text-slate-400'
                    }`}>
                      {config.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>

                  {config.description && (
                    <p className="text-sm text-slate-400 mb-2">{config.description}</p>
                  )}

                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Timer className="w-4 h-4" />
                      <span>1a Resposta: {config.first_response_minutes}min</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Clock className="w-4 h-4" />
                      <span>Resolucao: {formatMinutes(config.resolution_minutes)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Activity className="w-4 h-4" />
                      <span>{config.total_tracked || 0} conversas</span>
                    </div>
                  </div>
                </div>

                {/* Business Hours */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs text-slate-400 mb-1">Horario Comercial</p>
                  {config.business_hours_only ? (
                    <p className="text-sm text-gray-700">
                      {config.business_hours_start} - {config.business_hours_end}
                    </p>
                  ) : (
                    <p className="text-sm text-slate-300">24/7</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleViewMetrics(config)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                    title="Ver Metricas"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleToggleActive(config)}
                    className={`p-2 hover:bg-slate-700 rounded-lg transition-colors ${
                      config.is_active ? 'text-emerald-400' : 'text-slate-400 hover:text-emerald-400'
                    }`}
                    title={config.is_active ? 'Desativar' : 'Ativar'}
                  >
                    {config.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(config.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      deletingId === config.id
                        ? 'bg-red-500 text-white'
                        : 'text-slate-400 hover:text-red-400 hover:bg-slate-700'
                    }`}
                    title={deletingId === config.id ? 'Clique novamente para confirmar' : 'Excluir'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Empty State */}
        {configs.length === 0 && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <Clock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum SLA configurado</h3>
            <p className="text-slate-400 mb-4">
              Configure acordos de nivel de servico para monitorar tempos de resposta
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Criar SLA
            </button>
          </motion.div>
        )}

        {/* Loading */}
        {isLoading && configs.length === 0 && (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 text-violet-400 mx-auto mb-4 animate-spin" />
            <p className="text-slate-400">Carregando configuracoes...</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      <CreateSLAModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={async (params) => {
          const result = await createConfig(params)
          if (result) {
            setShowCreateModal(false)
          }
        }}
      />

      {/* Metrics Modal */}
      <MetricsModal
        isOpen={showMetricsModal}
        onClose={() => setShowMetricsModal(false)}
        config={selectedConfig}
        metrics={metrics}
        stats={stats}
        getTimeRemaining={getTimeRemaining}
      />
    </div>
  )
}

// =============================================
// Create SLA Modal
// =============================================

interface CreateSLAModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (params: CreateConfigParams) => Promise<void>
}

function CreateSLAModal({ isOpen, onClose, onSave }: CreateSLAModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [firstResponse, setFirstResponse] = useState(15)
  const [resolution, setResolution] = useState(240)
  const [businessHoursOnly, setBusinessHoursOnly] = useState(true)
  const [businessStart, setBusinessStart] = useState('09:00')
  const [businessEnd, setBusinessEnd] = useState('18:00')
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return

    setIsSaving(true)
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        first_response_minutes: firstResponse,
        resolution_minutes: resolution,
        business_hours_only: businessHoursOnly,
        business_hours_start: businessStart,
        business_hours_end: businessEnd,
        business_days: [1, 2, 3, 4, 5],
      })
      setName('')
      setDescription('')
      setFirstResponse(15)
      setResolution(240)
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
          <h2 className="text-lg font-semibold text-gray-900">Nova Configuracao SLA</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Nome do SLA *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: SLA Padrao Atendimento"
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Descricao
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descricao opcional..."
              rows={2}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                1a Resposta (minutos)
              </label>
              <input
                type="number"
                value={firstResponse}
                onChange={(e) => setFirstResponse(parseInt(e.target.value) || 15)}
                min={1}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Resolucao (minutos)
              </label>
              <input
                type="number"
                value={resolution}
                onChange={(e) => setResolution(parseInt(e.target.value) || 240)}
                min={1}
                className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
            <span className="text-sm text-slate-300">Apenas horario comercial</span>
            <button
              onClick={() => setBusinessHoursOnly(!businessHoursOnly)}
              className={`w-12 h-6 rounded-full transition-colors ${
                businessHoursOnly ? 'bg-violet-500' : 'bg-slate-600'
              }`}
            >
              <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                businessHoursOnly ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {businessHoursOnly && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Inicio
                </label>
                <input
                  type="time"
                  value={businessStart}
                  onChange={(e) => setBusinessStart(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">
                  Fim
                </label>
                <input
                  type="time"
                  value={businessEnd}
                  onChange={(e) => setBusinessEnd(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>
          )}
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
              <CheckCircle className="w-4 h-4" />
            )}
            Criar SLA
          </button>
        </div>
      </motion.div>
    </div>
  )
}

// =============================================
// Metrics Modal
// =============================================

interface MetricsModalProps {
  isOpen: boolean
  onClose: () => void
  config: SLAConfig | null
  metrics: SLAMetric[]
  stats: SLAStats | null
  getTimeRemaining: (target: string) => { minutes: number; isBreached: boolean }
}

function MetricsModal({ isOpen, onClose, config, metrics, stats, getTimeRemaining }: MetricsModalProps) {
  if (!isOpen || !config) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-4xl bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{config.name}</h2>
            <p className="text-sm text-slate-400">Metricas e conversas rastreadas</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="p-4 border-b border-slate-700 bg-slate-800/50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{stats.total_conversations}</p>
                <p className="text-sm text-slate-400">Total</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-400">{stats.within_sla}</p>
                <p className="text-sm text-slate-400">Dentro do SLA</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-400">{stats.breached_first_response}</p>
                <p className="text-sm text-slate-400">1a Resp Violada</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-400">{stats.breached_resolution}</p>
                <p className="text-sm text-slate-400">Resolucao Violada</p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-slate-700">
              <div className="text-center">
                <p className="text-sm text-slate-400">Tempo medio 1a resposta</p>
                <p className="text-lg font-semibold text-gray-900">{formatMinutes(stats.average_first_response_minutes)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-slate-400">Tempo medio resolucao</p>
                <p className="text-lg font-semibold text-gray-900">{formatMinutes(stats.average_resolution_minutes)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-slate-400">Compliance</p>
                <p className={`text-lg font-semibold ${
                  stats.sla_compliance_rate >= 90 ? 'text-emerald-400' :
                  stats.sla_compliance_rate >= 70 ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {stats.sla_compliance_rate.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Metrics List */}
        <div className="flex-1 overflow-y-auto p-4">
          {metrics.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">Nenhuma conversa rastreada ainda</p>
            </div>
          ) : (
            <div className="space-y-2">
              {metrics.map((metric) => {
                const firstResponseRemaining = metric.first_response_actual
                  ? null
                  : getTimeRemaining(metric.first_response_target)
                const resolutionRemaining = metric.status === 'resolved'
                  ? null
                  : getTimeRemaining(metric.resolution_target)

                return (
                  <div
                    key={metric.id}
                    className="bg-slate-700/30 border border-slate-600/50 rounded-lg p-4"
                  >
                    <div className="flex items-start gap-4">
                      {/* Status Icon */}
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        metric.status === 'resolved' ? 'bg-emerald-500/20' :
                        metric.status === 'breached' ? 'bg-red-500/20' :
                        metric.status === 'in_progress' ? 'bg-blue-500/20' :
                        'bg-yellow-500/20'
                      }`}>
                        {metric.status === 'resolved' ? (
                          <CheckCircle className="w-5 h-5 text-emerald-400" />
                        ) : metric.status === 'breached' ? (
                          <XCircle className="w-5 h-5 text-red-400" />
                        ) : metric.status === 'in_progress' ? (
                          <Activity className="w-5 h-5 text-blue-400" />
                        ) : (
                          <Clock className="w-5 h-5 text-yellow-400" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={getStatusColor(metric.status)}>
                            {getStatusLabel(metric.status)}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${getPriorityColor(metric.priority)}`}>
                            {metric.priority}
                          </span>
                          {metric.contacts && (
                            <span className="text-sm text-slate-400">
                              {metric.contacts.first_name} {metric.contacts.last_name}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-sm">
                          {/* First Response */}
                          <div className="flex items-center gap-1.5">
                            <Timer className={`w-4 h-4 ${
                              metric.first_response_breached ? 'text-red-400' :
                              metric.first_response_actual ? 'text-emerald-400' :
                              firstResponseRemaining && firstResponseRemaining.minutes < 5 ? 'text-orange-400' :
                              'text-slate-400'
                            }`} />
                            <span className="text-slate-400">1a Resp:</span>
                            {metric.first_response_actual ? (
                              <span className={metric.first_response_breached ? 'text-red-400' : 'text-emerald-400'}>
                                {metric.first_response_breached ? 'Violado' : 'OK'}
                              </span>
                            ) : firstResponseRemaining ? (
                              <span className={firstResponseRemaining.isBreached ? 'text-red-400' : 'text-white'}>
                                {firstResponseRemaining.isBreached ? 'Violado' : `${formatMinutes(firstResponseRemaining.minutes)} restantes`}
                              </span>
                            ) : null}
                          </div>

                          {/* Resolution */}
                          <div className="flex items-center gap-1.5">
                            <Clock className={`w-4 h-4 ${
                              metric.resolution_breached ? 'text-red-400' :
                              metric.status === 'resolved' ? 'text-emerald-400' :
                              resolutionRemaining && resolutionRemaining.minutes < 30 ? 'text-orange-400' :
                              'text-slate-400'
                            }`} />
                            <span className="text-slate-400">Resolucao:</span>
                            {metric.status === 'resolved' ? (
                              <span className={metric.resolution_breached ? 'text-red-400' : 'text-emerald-400'}>
                                {metric.resolution_breached ? 'Violado' : 'OK'}
                              </span>
                            ) : resolutionRemaining ? (
                              <span className={resolutionRemaining.isBreached ? 'text-red-400' : 'text-white'}>
                                {resolutionRemaining.isBreached ? 'Violado' : `${formatMinutes(resolutionRemaining.minutes)} restantes`}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {/* Time */}
                      <div className="text-right text-sm text-slate-400">
                        {formatDateTime(metric.created_at)}
                      </div>
                    </div>
                  </div>
                )
              })}
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

export default SLADashboard
