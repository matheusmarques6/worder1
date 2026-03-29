'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import {
  Clock,
  TrendingUp,
  TrendingDown,
  Activity,
  RefreshCw,
  ChevronRight,
  X,
  Timer,
  Calendar,
  Users,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
} from 'lucide-react'
import {
  useDealTimeTracking,
  StageTimeStats,
  StageHistoryEntry,
  DealTimeData,
} from '@/hooks/useDealTimeTracking'

// =============================================
// Types
// =============================================

interface StageTimeAnalyticsProps {
  organizationId: string
  pipelineId?: string | null
}

// =============================================
// Helper Functions
// =============================================

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1']

const formatDateTime = (dateStr: string): string => {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// =============================================
// Main Component
// =============================================

export function StageTimeAnalytics({ organizationId, pipelineId }: StageTimeAnalyticsProps) {
  const {
    stats,
    summary,
    history,
    isLoading,
    error,
    loadStats,
    loadHistory,
    getDealTimeData,
    formatTime,
    formatTimeShort,
  } = useDealTimeTracking({ organizationId, pipelineId })

  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview')
  const [selectedDeal, setSelectedDeal] = useState<DealTimeData | null>(null)
  const [showDealModal, setShowDealModal] = useState(false)
  const [loadingDeal, setLoadingDeal] = useState(false)

  // Chart data
  const chartData = useMemo(() => {
    return stats.map((s, i) => ({
      name: s.stage_name,
      avgTime: s.average_time_minutes,
      deals: s.current_deals,
      color: COLORS[i % COLORS.length],
    }))
  }, [stats])

  // Handle view deal
  const handleViewDeal = async (dealId: string) => {
    setLoadingDeal(true)
    try {
      const data = await getDealTimeData(dealId)
      if (data) {
        setSelectedDeal(data)
        setShowDealModal(true)
      }
    } finally {
      setLoadingDeal(false)
    }
  }

  // Handle load history
  const handleLoadHistory = () => {
    if (activeTab === 'history' && history.length === 0) {
      loadHistory()
    }
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
              <Clock className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Ciclo Medio</p>
              <p className="text-xl font-bold text-gray-900">
                {summary ? formatTimeShort(summary.average_cycle_minutes) : '--'}
              </p>
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
              <p className="text-sm text-slate-400">Etapas</p>
              <p className="text-xl font-bold text-gray-900">{summary?.total_stages || 0}</p>
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
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Etapa Mais Lenta</p>
              <p className="text-sm font-medium text-gray-900 truncate">
                {summary?.slowest_stage || '--'}
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
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-slate-400">Etapa Mais Rapida</p>
              <p className="text-sm font-medium text-gray-900 truncate">
                {summary?.fastest_stage || '--'}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-slate-800/50 border border-slate-700 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              activeTab === 'overview'
                ? 'bg-violet-500 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Visao Geral
          </button>
          <button
            onClick={() => {
              setActiveTab('history')
              handleLoadHistory()
            }}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${
              activeTab === 'history'
                ? 'bg-violet-500 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Historico
          </button>
        </div>

        <button
          onClick={() => loadStats()}
          disabled={isLoading}
          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Content */}
      {activeTab === 'overview' ? (
        <div className="space-y-6">
          {/* Chart */}
          {chartData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Tempo Medio por Etapa</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      type="number"
                      stroke="#64748b"
                      tickFormatter={(value) => formatTimeShort(value)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="#64748b"
                      width={120}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                      }}
                      formatter={(value: number) => [formatTime(value), 'Tempo medio']}
                    />
                    <Bar dataKey="avgTime" radius={[0, 4, 4, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          {/* Stage Details */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Detalhes por Etapa</h3>
            <div className="space-y-3">
              {stats.map((stage, index) => (
                <div
                  key={stage.stage_id}
                  className="flex items-center gap-4 p-4 bg-slate-700/30 rounded-lg"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{stage.stage_name}</p>
                    <p className="text-sm text-slate-400">
                      {stage.deals_count} deals passaram por esta etapa
                    </p>
                  </div>

                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <p className="text-slate-400">Tempo Medio</p>
                      <p className="font-semibold text-gray-900">{formatTimeShort(stage.average_time_minutes)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-slate-400">Min</p>
                      <p className="font-semibold text-emerald-400">{formatTimeShort(stage.min_time_minutes)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-slate-400">Max</p>
                      <p className="font-semibold text-red-400">{formatTimeShort(stage.max_time_minutes)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-slate-400">Atuais</p>
                      <p className="font-semibold text-violet-400">{stage.current_deals}</p>
                    </div>
                  </div>
                </div>
              ))}

              {stats.length === 0 && !isLoading && (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400">Nenhuma estatistica disponivel</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* History List */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Movimentacoes Recentes</h3>

            {history.length === 0 && !isLoading ? (
              <div className="text-center py-8">
                <Activity className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                <p className="text-slate-400">Nenhuma movimentacao registrada</p>
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-colors cursor-pointer"
                    onClick={() => entry.deals?.id && handleViewDeal(entry.deals.id)}
                  >
                    <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
                      <ArrowRight className="w-4 h-4 text-violet-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">{entry.deals?.title || 'Deal'}</span>
                        {' movido de '}
                        <span className="text-slate-400">{entry.from_stage?.name || 'Inicio'}</span>
                        {' para '}
                        <span className="text-violet-400">{entry.to_stage?.name}</span>
                      </p>
                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span>{formatDateTime(entry.created_at)}</span>
                        {entry.time_in_previous_stage_minutes !== null && entry.time_in_previous_stage_minutes !== undefined && (
                          <span className="flex items-center gap-1">
                            <Timer className="w-3 h-3" />
                            {formatTimeShort(entry.time_in_previous_stage_minutes)} na etapa anterior
                          </span>
                        )}
                        {entry.profiles && (
                          <span>por {entry.profiles.full_name}</span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                ))}
              </div>
            )}

            {isLoading && history.length === 0 && (
              <div className="text-center py-8">
                <RefreshCw className="w-8 h-8 text-violet-400 mx-auto mb-4 animate-spin" />
                <p className="text-slate-400">Carregando historico...</p>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Deal Modal */}
      <DealTimeModal
        isOpen={showDealModal}
        onClose={() => {
          setShowDealModal(false)
          setSelectedDeal(null)
        }}
        deal={selectedDeal}
        formatTime={formatTime}
        formatTimeShort={formatTimeShort}
      />
    </div>
  )
}

// =============================================
// Deal Time Modal
// =============================================

interface DealTimeModalProps {
  isOpen: boolean
  onClose: () => void
  deal: DealTimeData | null
  formatTime: (minutes: number) => string
  formatTimeShort: (minutes: number) => string
}

function DealTimeModal({ isOpen, onClose, deal, formatTime, formatTimeShort }: DealTimeModalProps) {
  if (!isOpen || !deal) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg bg-slate-800 border border-slate-700 rounded-xl shadow-xl"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{deal.deal_title}</h2>
            <p className="text-sm text-slate-400">Timeline de etapas</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-700/30 rounded-lg p-3 text-center">
              <p className="text-sm text-slate-400">Etapa Atual</p>
              <p className="font-semibold text-violet-400">{deal.current_stage}</p>
            </div>
            <div className="bg-slate-700/30 rounded-lg p-3 text-center">
              <p className="text-sm text-slate-400">Tempo Total</p>
              <p className="font-semibold text-gray-900">{formatTimeShort(deal.total_time_minutes)}</p>
            </div>
          </div>

          <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm text-slate-300">Tempo na etapa atual</span>
            <span className="font-semibold text-violet-400">
              {formatTimeShort(deal.time_in_current_stage_minutes)}
            </span>
          </div>

          {/* Timeline */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-slate-400">Historico de Etapas</h3>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-700" />
              {deal.stage_history.map((stage, index) => (
                <div key={index} className="relative pl-10 pb-4">
                  <div className={`absolute left-2.5 w-3 h-3 rounded-full ${
                    index === deal.stage_history.length - 1
                      ? 'bg-violet-500'
                      : 'bg-slate-600'
                  }`} />
                  <div className="bg-slate-700/30 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900">{stage.stage_name}</p>
                      <p className={`text-sm ${
                        index === deal.stage_history.length - 1
                          ? 'text-violet-400'
                          : 'text-slate-400'
                      }`}>
                        {formatTimeShort(stage.time_minutes)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDateTime(stage.entered_at)}</span>
                      {stage.left_at && (
                        <>
                          <ArrowRight className="w-3 h-3" />
                          <span>{formatDateTime(stage.left_at)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
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

export default StageTimeAnalytics
