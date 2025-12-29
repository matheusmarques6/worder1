'use client'

// =============================================
// Sales Forecast Page
// src/app/(dashboard)/crm/forecast/page.tsx
// =============================================

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Clock,
  BarChart3,
  ChevronDown,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { useAuthStore } from '@/stores'

// =============================================
// TYPES
// =============================================

interface ForecastData {
  period: string
  periodLabel: string
  metrics: {
    totalPipeline: number
    weightedPipeline: number
    dealCount: number
    avgDealValue: number
  }
  byCommitLevel: {
    omit: number
    pipeline: number
    bestCase: number
    commit: number
  }
  byStage: Array<{
    id: string
    name: string
    color: string
    probability: number
    count: number
    value: number
    weightedValue: number
  }>
  performance: {
    won: { count: number; value: number }
    lost: { count: number; value: number }
    winRate: number
  }
  vsPrevious: {
    previousWonValue: number
    changePercent: number
  }
  velocity: Array<{
    stageId: string
    stageName: string
    avgTimeHours: number
    dealsCount: number
  }>
  topDeals: Array<{
    id: string
    title: string
    value: number
    stage: string
    probability: number
    contact: { name: string; email: string } | null
  }>
}

// =============================================
// HELPER FUNCTIONS
// =============================================

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatTime(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)}min`
  if (hours < 24) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

// =============================================
// COMPONENTS
// =============================================

function KPICard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  color = 'primary',
}: { 
  title: string
  value: string
  subtitle?: string
  icon: any
  trend?: { value: number; label: string }
  color?: 'primary' | 'success' | 'warning' | 'danger'
}) {
  const colorClasses = {
    primary: 'text-primary-400 bg-primary-500/20',
    success: 'text-green-400 bg-green-500/20',
    warning: 'text-yellow-400 bg-yellow-500/20',
    danger: 'text-red-400 bg-red-500/20',
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-dark-800/50 rounded-xl p-5 border border-dark-700/50"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs ${trend.value >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend.value >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <h3 className="text-2xl font-bold text-white mb-1">{value}</h3>
      <p className="text-sm text-dark-400">{title}</p>
      {subtitle && <p className="text-xs text-dark-500 mt-1">{subtitle}</p>}
    </motion.div>
  )
}

function StageFunnel({ stages }: { stages: ForecastData['byStage'] }) {
  const maxValue = Math.max(...stages.map(s => s.value), 1)
  
  return (
    <div className="space-y-3">
      {stages.map((stage, index) => (
        <div key={stage.id} className="relative">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: stage.color }}
              />
              <span className="text-sm font-medium text-white">{stage.name}</span>
              <span className="text-xs text-dark-400">({stage.count})</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-medium text-white">{formatCurrency(stage.value)}</span>
              <span className="text-xs text-dark-500 ml-2">{stage.probability}%</span>
            </div>
          </div>
          <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(stage.value / maxValue) * 100}%` }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="h-full rounded-full"
              style={{ backgroundColor: stage.color }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-dark-500">Ponderado: {formatCurrency(stage.weightedValue)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function VelocityTable({ velocity }: { velocity: ForecastData['velocity'] }) {
  if (velocity.length === 0) {
    return (
      <div className="text-center py-8 text-dark-400">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Sem dados de velocidade ainda</p>
        <p className="text-xs">Mova deals entre estágios para começar a medir</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-2">
      {velocity.map(v => (
        <div key={v.stageId} className="flex items-center justify-between p-3 bg-dark-700/30 rounded-lg">
          <span className="text-sm text-white">{v.stageName}</span>
          <div className="text-right">
            <span className="text-sm font-medium text-primary-400">{formatTime(v.avgTimeHours)}</span>
            <span className="text-xs text-dark-500 ml-2">({v.dealsCount} deals)</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function TopDealsTable({ deals }: { deals: ForecastData['topDeals'] }) {
  if (deals.length === 0) {
    return (
      <div className="text-center py-8 text-dark-400">
        <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>Nenhum deal aberto</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-2">
      {deals.map(deal => (
        <div key={deal.id} className="flex items-center justify-between p-3 bg-dark-700/30 rounded-lg">
          <div>
            <p className="text-sm font-medium text-white">{deal.title}</p>
            <p className="text-xs text-dark-400">
              {deal.contact?.name || 'Sem contato'} • {deal.stage}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-success-400">{formatCurrency(deal.value)}</p>
            <p className="text-xs text-dark-500">{deal.probability}%</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// =============================================
// MAIN PAGE
// =============================================

export default function ForecastPage() {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month')
  const [data, setData] = useState<ForecastData | null>(null)
  
  const fetchForecast = useCallback(async () => {
    if (!organizationId) return
    
    setLoading(true)
    setError(null)
    
    try {
      const res = await fetch(
        `/api/deals/forecast?organizationId=${organizationId}&period=${period}`
      )
      
      if (!res.ok) {
        throw new Error('Erro ao carregar forecast')
      }
      
      const result = await res.json()
      setData(result)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [organizationId, period])
  
  useEffect(() => {
    fetchForecast()
  }, [fetchForecast])
  
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-red-400">
        <AlertCircle className="w-12 h-12 mb-4" />
        <p>{error}</p>
        <button 
          onClick={fetchForecast}
          className="mt-4 px-4 py-2 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    )
  }
  
  if (!data) return null
  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Forecast de Vendas</h1>
          <p className="text-dark-400">Previsão e métricas do pipeline</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <div className="relative">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="appearance-none bg-dark-800 border border-dark-700 rounded-lg px-4 py-2 pr-10 text-white focus:outline-none focus:border-primary-500"
            >
              <option value="month">Este Mês</option>
              <option value="quarter">Este Trimestre</option>
              <option value="year">Este Ano</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400 pointer-events-none" />
          </div>
          
          <button
            onClick={fetchForecast}
            disabled={loading}
            className="p-2 bg-dark-800 border border-dark-700 rounded-lg hover:bg-dark-700 transition-colors"
          >
            <RefreshCw className={`w-5 h-5 text-dark-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Pipeline Total"
          value={formatCurrency(data.metrics.totalPipeline)}
          subtitle={`${data.metrics.dealCount} deals abertos`}
          icon={DollarSign}
          color="primary"
        />
        <KPICard
          title="Pipeline Ponderado"
          value={formatCurrency(data.metrics.weightedPipeline)}
          subtitle="Valor × Probabilidade"
          icon={Target}
          color="success"
        />
        <KPICard
          title={`Ganhos (${data.periodLabel})`}
          value={formatCurrency(data.performance.won.value)}
          subtitle={`${data.performance.won.count} deals ganhos`}
          icon={TrendingUp}
          color="success"
          trend={data.vsPrevious.changePercent !== 0 ? {
            value: data.vsPrevious.changePercent,
            label: 'vs período anterior'
          } : undefined}
        />
        <KPICard
          title="Win Rate"
          value={`${data.performance.winRate}%`}
          subtitle={`${data.performance.won.count} ganhos / ${data.performance.won.count + data.performance.lost.count} fechados`}
          icon={BarChart3}
          color={data.performance.winRate >= 30 ? 'success' : 'warning'}
        />
      </div>
      
      {/* Commit Level Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-dark-800/50 rounded-xl p-4 border border-dark-700/50">
          <p className="text-xs text-dark-400 mb-1">Commit</p>
          <p className="text-xl font-bold text-green-400">{formatCurrency(data.byCommitLevel.commit)}</p>
        </div>
        <div className="bg-dark-800/50 rounded-xl p-4 border border-dark-700/50">
          <p className="text-xs text-dark-400 mb-1">Best Case</p>
          <p className="text-xl font-bold text-blue-400">{formatCurrency(data.byCommitLevel.bestCase)}</p>
        </div>
        <div className="bg-dark-800/50 rounded-xl p-4 border border-dark-700/50">
          <p className="text-xs text-dark-400 mb-1">Pipeline</p>
          <p className="text-xl font-bold text-yellow-400">{formatCurrency(data.byCommitLevel.pipeline)}</p>
        </div>
        <div className="bg-dark-800/50 rounded-xl p-4 border border-dark-700/50">
          <p className="text-xs text-dark-400 mb-1">Omitido</p>
          <p className="text-xl font-bold text-dark-400">{formatCurrency(data.byCommitLevel.omit)}</p>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Funnel */}
        <div className="lg:col-span-2 bg-dark-800/50 rounded-xl p-6 border border-dark-700/50">
          <h2 className="text-lg font-semibold text-white mb-4">Funil de Vendas</h2>
          <StageFunnel stages={data.byStage} />
        </div>
        
        {/* Velocity */}
        <div className="bg-dark-800/50 rounded-xl p-6 border border-dark-700/50">
          <h2 className="text-lg font-semibold text-white mb-4">Velocidade por Estágio</h2>
          <VelocityTable velocity={data.velocity} />
        </div>
      </div>
      
      {/* Top Deals */}
      <div className="bg-dark-800/50 rounded-xl p-6 border border-dark-700/50">
        <h2 className="text-lg font-semibold text-white mb-4">Top 5 Deals</h2>
        <TopDealsTable deals={data.topDeals} />
      </div>
    </div>
  )
}
