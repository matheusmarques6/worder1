'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Target,
  Clock,
  BarChart3,
  PieChart,
  ArrowRight,
  ChevronDown,
  RefreshCw,
  Filter,
  Download,
  Calendar,
  Zap,
  Trophy,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { useCRMAnalytics } from '@/hooks/useCRMAnalytics'

// =============================================
// UTILITY FUNCTIONS
// =============================================

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const formatNumber = (value: number) => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return value.toString()
}

const formatPercent = (value: number | string) => {
  const num = typeof value === 'string' ? parseFloat(value) : value
  return `${num.toFixed(1)}%`
}

// =============================================
// METRIC CARD COMPONENT
// =============================================

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  trend?: {
    value: number
    label: string
  }
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info'
  size?: 'sm' | 'md' | 'lg'
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  color = 'primary',
  size = 'md',
}: MetricCardProps) {
  const colorClasses = {
    primary: 'from-primary-500/20 to-primary-500/5 border-primary-500/30',
    success: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30',
    warning: 'from-amber-500/20 to-amber-500/5 border-amber-500/30',
    error: 'from-red-500/20 to-red-500/5 border-red-500/30',
    info: 'from-blue-500/20 to-blue-500/5 border-blue-500/30',
  }

  const iconColorClasses = {
    primary: 'text-primary-400',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
    info: 'text-blue-400',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        relative overflow-hidden rounded-2xl border
        bg-gradient-to-br ${colorClasses[color]}
        p-${size === 'sm' ? 4 : size === 'md' ? 5 : 6}
      `}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-500 text-sm font-medium">{title}</p>
          <p className={`font-bold text-gray-900 mt-1 ${size === 'lg' ? 'text-3xl' : 'text-2xl'}`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-gray-500 text-xs mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              {trend.value >= 0 ? (
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-400" />
              )}
              <span className={trend.value >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                {trend.value >= 0 ? '+' : ''}{trend.value}%
              </span>
              <span className="text-gray-500 text-xs">{trend.label}</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-xl bg-white ${iconColorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </motion.div>
  )
}

// =============================================
// FUNNEL CHART COMPONENT
// =============================================

interface FunnelChartProps {
  data: Array<{
    stage: string
    color: string
    count: number
    value: number
    percentage: number | string
  }>
}

function FunnelChart({ data }: FunnelChartProps) {
  const maxCount = Math.max(...data.map(d => d.count))

  return (
    <div className="space-y-3">
      {data.map((stage, index) => {
        const width = maxCount > 0 ? (stage.count / maxCount) * 100 : 0

        return (
          <motion.div
            key={stage.stage}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="relative"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: stage.color }}
                />
                <span className="text-sm font-medium text-gray-900">{stage.stage}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">{stage.count} negócios</span>
                <span className="text-sm font-medium text-emerald-400">
                  {formatCurrency(stage.value)}
                </span>
              </div>
            </div>
            <div className="h-8 bg-white rounded-lg overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${width}%` }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="h-full rounded-lg flex items-center justify-end px-3"
                style={{ backgroundColor: stage.color + '40' }}
              >
                <span className="text-xs font-medium text-gray-900">
                  {stage.percentage}%
                </span>
              </motion.div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

// =============================================
// STAGE METRICS TABLE
// =============================================

interface StageMetricsTableProps {
  stages: Array<{
    id: string
    name: string
    color: string
    deals_count: number
    deals_value: number
    conversion_rate: number | string
    avg_time_formatted: string
  }>
}

function StageMetricsTable({ stages }: StageMetricsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Etapa</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Negócios</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Valor</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Conversão</th>
            <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Tempo Médio</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((stage) => (
            <motion.tr
              key={stage.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="border-b border-gray-200 hover:bg-white"
            >
              <td className="py-3 px-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="text-sm font-medium text-gray-900">{stage.name}</span>
                </div>
              </td>
              <td className="py-3 px-4 text-right">
                <span className="text-sm text-gray-600">{stage.deals_count}</span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className="text-sm font-medium text-emerald-400">
                  {formatCurrency(stage.deals_value)}
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className="text-sm text-gray-600">{stage.conversion_rate}%</span>
              </td>
              <td className="py-3 px-4 text-right">
                <span className="text-sm text-gray-500">{stage.avg_time_formatted}</span>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// =============================================
// AGENT LEADERBOARD
// =============================================

interface AgentLeaderboardProps {
  agents: Array<{
    id: string
    name: string
    deals_count: number
    won_value: number
    conversion_rate: number | string
  }>
}

function AgentLeaderboard({ agents }: AgentLeaderboardProps) {
  return (
    <div className="space-y-3">
      {agents.slice(0, 5).map((agent, index) => (
        <motion.div
          key={agent.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className="flex items-center gap-3 p-3 bg-white rounded-xl"
        >
          <div className={`
            w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
            ${index === 0 ? 'bg-amber-500/20 text-amber-400' :
              index === 1 ? 'bg-gray-400/20 text-gray-300' :
              index === 2 ? 'bg-orange-600/20 text-orange-400' :
              'bg-gray-100 text-gray-500'}
          `}>
            {index + 1}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{agent.name}</p>
            <p className="text-xs text-gray-500">{agent.deals_count} negócios</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-emerald-400">
              {formatCurrency(agent.won_value)}
            </p>
            <p className="text-xs text-gray-500">{agent.conversion_rate}% conv.</p>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// =============================================
// SOURCE BREAKDOWN
// =============================================

interface SourceBreakdownProps {
  sources: Array<{
    source: string
    deals_count: number
    won_value: number
    conversion_rate: number | string
  }>
}

function SourceBreakdown({ sources }: SourceBreakdownProps) {
  const totalDeals = sources.reduce((sum, s) => sum + s.deals_count, 0)

  const sourceColors: Record<string, string> = {
    'facebook': '#1877F2',
    'instagram': '#E4405F',
    'google': '#4285F4',
    'tiktok': '#000000',
    'youtube': '#FF0000',
    'linkedin': '#0A66C2',
    'direct': '#8B5CF6',
    'organic': '#10B981',
    'referral': '#F59E0B',
  }

  return (
    <div className="space-y-3">
      {sources.slice(0, 6).map((source, index) => {
        const percentage = totalDeals > 0 ? (source.deals_count / totalDeals) * 100 : 0
        const color = sourceColors[source.source.toLowerCase()] || '#6366F1'

        return (
          <motion.div
            key={source.source}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-700 capitalize">{source.source}</span>
              <span className="text-xs text-gray-500">{source.deals_count} ({percentage.toFixed(0)}%)</span>
            </div>
            <div className="h-2 bg-white rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 0.5 }}
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
              />
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

// =============================================
// MAIN DASHBOARD COMPONENT
// =============================================

interface CRMDashboardProps {
  organizationId: string
}

export function CRMDashboard({ organizationId }: CRMDashboardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d')
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null)

  const { data, isLoading, error, refresh, setPeriod, setPipelineId } = useCRMAnalytics({
    organizationId,
    period: selectedPeriod,
    pipelineId: selectedPipeline,
  })

  const handlePeriodChange = (period: '7d' | '30d' | '90d' | '1y') => {
    setSelectedPeriod(period)
    setPeriod(period)
  }

  const handlePipelineChange = (pipelineId: string | null) => {
    setSelectedPipeline(pipelineId)
    setPipelineId(pipelineId)
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500">Carregando analytics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-gray-900 font-medium">Erro ao carregar dados</p>
          <p className="text-gray-500 text-sm mt-1">{error}</p>
          <button
            onClick={refresh}
            className="mt-4 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard CRM</h1>
          <p className="text-gray-500 mt-1">
            Métricas de {data.period.label === '7d' ? '7 dias' :
              data.period.label === '30d' ? '30 dias' :
              data.period.label === '90d' ? '90 dias' : '1 ano'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <div className="flex items-center gap-1 p-1 bg-white rounded-xl">
            {(['7d', '30d', '90d', '1y'] as const).map((period) => (
              <button
                key={period}
                onClick={() => handlePeriodChange(period)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  selectedPeriod === period
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                {period === '7d' ? '7D' : period === '30d' ? '30D' : period === '90d' ? '90D' : '1A'}
              </button>
            ))}
          </div>

          {/* Pipeline Selector */}
          {data.pipelines.length > 0 && (
            <select
              value={selectedPipeline || ''}
              onChange={(e) => handlePipelineChange(e.target.value || null)}
              className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Todas as pipelines</option>
              {data.pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </select>
          )}

          {/* Refresh Button */}
          <button
            onClick={refresh}
            disabled={isLoading}
            className="p-2 bg-white hover:bg-gray-100 rounded-xl text-gray-500 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total de Negócios"
          value={formatCurrency(data.summary.total_value)}
          subtitle={`${data.summary.total_deals} negócios`}
          icon={<DollarSign className="w-6 h-6" />}
          color="primary"
          size="lg"
        />
        <MetricCard
          title="Ganhos"
          value={formatCurrency(data.summary.won_value)}
          subtitle={`${data.summary.won_deals} negócios fechados`}
          icon={<CheckCircle className="w-6 h-6" />}
          color="success"
        />
        <MetricCard
          title="Perdidos"
          value={formatCurrency(data.summary.lost_value)}
          subtitle={`${data.summary.lost_deals} negócios perdidos`}
          icon={<XCircle className="w-6 h-6" />}
          color="error"
        />
        <MetricCard
          title="Em Aberto"
          value={formatCurrency(data.summary.open_value)}
          subtitle={`${data.summary.open_deals} negócios ativos`}
          icon={<Target className="w-6 h-6" />}
          color="warning"
        />
      </div>

      {/* KPIs Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-gray-200 rounded-xl">
          <p className="text-gray-500 text-sm">Taxa de Conversão</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{data.summary.conversion_rate}%</p>
        </div>
        <div className="p-4 bg-white border border-gray-200 rounded-xl">
          <p className="text-gray-500 text-sm">Ticket Médio</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrency(parseFloat(data.summary.avg_deal_value as string) || 0)}
          </p>
        </div>
        <div className="p-4 bg-white border border-gray-200 rounded-xl">
          <p className="text-gray-500 text-sm">LTV Médio</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatCurrency(data.ltv.average)}
          </p>
        </div>
        <div className="p-4 bg-white border border-gray-200 rounded-xl">
          <p className="text-gray-500 text-sm">Clientes com LTV</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {data.ltv.total_customers}
          </p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel Chart */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Gráfico de Funil</h2>
            <BarChart3 className="w-5 h-5 text-gray-500" />
          </div>
          <FunnelChart data={data.funnel} />
        </div>

        {/* Stage Metrics */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Métricas por Etapa</h2>
            <Clock className="w-5 h-5 text-gray-500" />
          </div>
          <StageMetricsTable stages={data.stages} />
        </div>

        {/* Agent Leaderboard */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Top Vendedores</h2>
            <Trophy className="w-5 h-5 text-amber-400" />
          </div>
          {data.agents.length > 0 ? (
            <AgentLeaderboard agents={data.agents} />
          ) : (
            <p className="text-gray-500 text-center py-8">Nenhum vendedor com negócios</p>
          )}
        </div>

        {/* Source Breakdown */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Origem dos Leads</h2>
            <PieChart className="w-5 h-5 text-gray-500" />
          </div>
          {data.sources.length > 0 ? (
            <SourceBreakdown sources={data.sources} />
          ) : (
            <p className="text-gray-500 text-center py-8">Nenhuma origem identificada</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default CRMDashboard
