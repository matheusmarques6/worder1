'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  RefreshCw,
  ChevronDown,
  DollarSign,
  Target,
  TrendingUp,
  TrendingDown,
  Percent,
  Clock,
  Users,
  AlertTriangle,
  Award,
  Lightbulb,
  BarChart3,
  Activity,
  ArrowRight,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
  Sankey,
  FunnelChart,
  Funnel,
  LabelList,
} from 'recharts'

// ==========================================
// TYPES
// ==========================================
interface PipelineAnalyticsData {
  pipeline: {
    id: string
    name: string
    color: string
    description?: string
  }
  period: {
    label: string
    start: string
    end: string
  }
  kpis: {
    totalDeals: number
    openDeals: number
    wonDeals: number
    lostDeals: number
    totalValue: number
    openValue: number
    wonValue: number
    lostValue: number
    winRate: number
    avgTicket: number
    avgCycleDays: number
  }
  funnel: Array<{
    id: string
    name: string
    color: string
    position: number
    probability: number
    isWon: boolean
    isLost: boolean
    count: number
    value: number
    weightedValue: number
    percentage: number
    avgTimeInStage: number
  }>
  velocity: Array<{
    stageId: string
    stageName: string
    position: number
    avgHours: number
    avgDays: number
    transitions: number
  }>
  topDeals: Array<{
    id: string
    title: string
    value: number
    stageName: string
    stageColor: string
    probability: number
    contactName: string | null
    createdAt: string
    expectedCloseDate: string | null
  }>
  dealsAtRisk: Array<{
    id: string
    title: string
    value: number
    stageName: string
    stageColor: string
    daysSinceUpdate: number
    updatedAt: string
  }>
  timeline: Array<{
    date: string
    label: string
    wonValue: number
    wonCount: number
    lostValue: number
    lostCount: number
    createdCount: number
  }>
  dealsBySource: Array<{
    source: string
    count: number
    value: number
  }>
  dealsByOwner: Array<{
    id: string
    name: string
    count: number
    value: number
    won: number
    lost: number
    winRate: number
  }>
  stageConversions: Array<{
    from: { id: string; name: string; color: string }
    to: { id: string; name: string; color: string }
    transitions: number
    conversionRate: number
  }>
  forecast: {
    pipeline: number
    weighted: number
    committed: number
    bestCase: number
  }
  insights: Array<{
    type: 'positive' | 'negative' | 'neutral'
    message: string
  }>
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
const formatCurrency = (value: number) => {
  if (value >= 1000000) {
    return `R$ ${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `R$ ${(value / 1000).toFixed(1)}K`
  }
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const formatFullCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// ==========================================
// COMPONENTS
// ==========================================

// KPI Card Component
function KPICard({
  icon: Icon,
  label,
  value,
  subtext,
  variation,
  color = 'primary',
  format = 'currency',
}: {
  icon: any
  label: string
  value: number
  subtext?: string
  variation?: number
  color?: 'primary' | 'green' | 'amber' | 'red' | 'blue'
  format?: 'currency' | 'percent' | 'number' | 'days'
}) {
  const colorClasses = {
    primary: 'bg-primary-500/20 text-primary-400',
    green: 'bg-green-500/20 text-green-400',
    amber: 'bg-amber-500/20 text-amber-400',
    red: 'bg-red-500/20 text-red-400',
    blue: 'bg-blue-500/20 text-blue-400',
  }

  const formatValue = () => {
    switch (format) {
      case 'currency':
        return formatCurrency(value)
      case 'percent':
        return `${value.toFixed(1)}%`
      case 'days':
        return `${value.toFixed(1)} dias`
      case 'number':
        return value.toLocaleString('pt-BR')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-gray-200 rounded-2xl p-5"
    >
      <div className={`w-10 h-10 rounded-xl ${colorClasses[color]} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-1">{formatValue()}</div>
      <div className="text-sm text-gray-400 mb-2">{label}</div>
      {(subtext || variation !== undefined) && (
        <div className="flex items-center gap-2">
          {subtext && <span className="text-xs text-gray-500">{subtext}</span>}
          {variation !== undefined && variation !== 0 && (
            <span className={`text-xs flex items-center gap-1 ${variation > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {variation > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {variation > 0 ? '+' : ''}
              {variation.toFixed(1)}%
            </span>
          )}
        </div>
      )}
    </motion.div>
  )
}

// Funnel Chart Component
function SalesFunnel({ data }: { data: PipelineAnalyticsData['funnel'] }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Funil de Vendas</h3>
        <div className="text-center text-gray-400 py-8">Sem dados de funil</div>
      </div>
    )
  }

  const maxValue = Math.max(...data.map(s => s.value))
  const activeStages = data.filter(s => !s.isWon && !s.isLost)
  const wonStage = data.find(s => s.isWon)
  const lostStage = data.find(s => s.isLost)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Grafico de funil</h3>

      {/* Funnel Visualization */}
      <div className="space-y-2 mb-6">
        {activeStages.map((stage, index) => {
          const widthPercent = maxValue > 0 ? Math.max((stage.value / maxValue) * 100, 20) : 20

          return (
            <div key={stage.id} className="relative">
              <div className="flex items-center gap-4">
                <div className="w-28 flex items-center gap-2 flex-shrink-0">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: stage.color || '#6366f1' }}
                  />
                  <span className="text-sm text-gray-700 truncate">{stage.name}</span>
                </div>

                <div className="flex-1 relative">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${widthPercent}%` }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="h-12 rounded-lg flex items-center justify-between px-4 relative overflow-hidden"
                    style={{ backgroundColor: stage.color || '#6366f1' }}
                  >
                    <span className="text-white text-sm font-medium z-10">
                      {stage.count} negocio{stage.count !== 1 ? 's' : ''}
                    </span>
                    <span className="text-gray-600 text-sm z-10">
                      {formatCurrency(stage.value)}
                    </span>

                    {/* Percentage badge */}
                    <div className="absolute right-0 top-0 bottom-0 flex items-center">
                      <div className="bg-white/20 backdrop-blur-sm rounded-l-full px-3 py-1">
                        <span className="text-white text-xs font-medium">
                          {stage.percentage.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </motion.div>
                </div>

                <div className="w-24 text-right flex-shrink-0">
                  <div className="text-xs text-gray-400">Tempo medio</div>
                  <div className="text-sm text-gray-700">
                    {stage.avgTimeInStage > 24
                      ? `${(stage.avgTimeInStage / 24).toFixed(1)} dias`
                      : stage.avgTimeInStage > 0
                        ? `${stage.avgTimeInStage.toFixed(0)}h`
                        : '-'}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Won/Lost Summary */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200/50">
        {wonStage && (
          <div className="flex items-center gap-3 p-3 bg-green-500/10 rounded-xl">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <div className="text-sm text-green-400 font-medium">{wonStage.name}</div>
              <div className="text-lg font-bold text-gray-900">{formatCurrency(wonStage.value)}</div>
              <div className="text-xs text-gray-400">{wonStage.count} negocios</div>
            </div>
          </div>
        )}

        {lostStage && (
          <div className="flex items-center gap-3 p-3 bg-red-500/10 rounded-xl">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <div className="text-sm text-red-400 font-medium">{lostStage.name}</div>
              <div className="text-lg font-bold text-gray-900">{formatCurrency(lostStage.value)}</div>
              <div className="text-xs text-gray-400">{lostStage.count} negocios</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Stage Conversion Flow
function StageConversionFlow({ data, stages }: { data: PipelineAnalyticsData['stageConversions']; stages: PipelineAnalyticsData['funnel'] }) {
  if (!data || data.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Taxa de Conversao entre Estagios</h3>
      <div className="space-y-4">
        {data.map((conv, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="flex items-center gap-2 w-32">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: conv.from.color }}
              />
              <span className="text-sm text-gray-700 truncate">{conv.from.name}</span>
            </div>

            <div className="flex-1 relative">
              <div className="h-2 bg-gray-200 rounded-full">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${conv.conversionRate}%` }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                />
              </div>
              <div className="absolute -top-5 left-1/2 transform -translate-x-1/2 text-xs text-gray-400">
                {conv.conversionRate.toFixed(0)}%
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-gray-500" />

            <div className="flex items-center gap-2 w-32">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: conv.to.color }}
              />
              <span className="text-sm text-gray-700 truncate">{conv.to.name}</span>
            </div>

            <div className="text-xs text-gray-400 w-16 text-right">
              {conv.transitions} trans.
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Velocity Section
function VelocitySection({ data }: { data: PipelineAnalyticsData['velocity'] }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Velocidade por Estagio</h3>
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <Clock className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">Sem dados de velocidade ainda</p>
        </div>
      </div>
    )
  }

  const maxDays = Math.max(...data.map(v => v.avgDays))

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Velocidade por Estagio</h3>
      <div className="space-y-3">
        {data.map((stage, index) => (
          <div key={stage.stageId}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-700">{stage.stageName}</span>
              <span className="text-sm font-medium text-gray-600">{stage.avgDays.toFixed(1)} dias</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: maxDays > 0 ? `${(stage.avgDays / maxDays) * 100}%` : '0%' }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Timeline Chart
function TimelineChart({ data }: { data: PipelineAnalyticsData['timeline'] }) {
  if (!data || data.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Evolucao de Negocios</h3>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorWonTimeline" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorLostTimeline" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} />
          <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
            labelStyle={{ color: '#fff' }}
            formatter={(value: number, name: string) => [
              formatFullCurrency(value),
              name === 'wonValue' ? 'Ganhos' : 'Perdidos',
            ]}
          />
          <Area type="monotone" dataKey="wonValue" stroke="#22c55e" fillOpacity={1} fill="url(#colorWonTimeline)" name="wonValue" />
          <Area type="monotone" dataKey="lostValue" stroke="#ef4444" fillOpacity={1} fill="url(#colorLostTimeline)" name="lostValue" />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-xs text-gray-400">Valor Ganho</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-xs text-gray-400">Valor Perdido</span>
        </div>
      </div>
    </div>
  )
}

// Deals by Source
function DealsBySource({ data }: { data: PipelineAnalyticsData['dealsBySource'] }) {
  if (!data || data.length === 0) return null

  const colors = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#f59e0b']
  const total = data.reduce((sum, d) => sum + d.count, 0)

  const chartData = data.map((d, i) => ({
    name: d.source.charAt(0).toUpperCase() + d.source.slice(1),
    value: d.count,
    fill: colors[i % colors.length],
  }))

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Negocios por Origem</h3>
      <ResponsiveContainer width="100%" height={200}>
        <RechartsPieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            dataKey="value"
            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
            labelLine={false}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => `${value} negocios`}
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
          />
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  )
}

// Deals by Owner
function DealsByOwner({ data }: { data: PipelineAnalyticsData['dealsByOwner'] }) {
  if (!data || data.length === 0) return null

  const colors = ['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899']
  const totalDeals = data.reduce((sum, d) => sum + d.count, 0)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Atendimentos por atendentes</h3>
      <p className="text-xs text-gray-400 mb-4">Atendimento iniciados por atendentes no periodo</p>

      <div className="flex gap-6">
        {/* Pie Chart */}
        <div className="w-1/2">
          <ResponsiveContainer width="100%" height={200}>
            <RechartsPieChart>
              <Pie
                data={data.map((d, i) => ({ name: d.name, value: d.count, fill: colors[i % colors.length] }))}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => `${value} negocios`}
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
              />
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="w-1/2 space-y-2">
          {data.slice(0, 7).map((owner, index) => {
            const percentage = totalDeals > 0 ? ((owner.count / totalDeals) * 100).toFixed(0) : 0
            return (
              <div key={owner.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: colors[index % colors.length] }}
                  />
                  <span className="text-sm text-gray-700 truncate max-w-[120px]">{owner.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    Atendimentos: {owner.count}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{percentage}%</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Top Deals
function TopDeals({ data }: { data: PipelineAnalyticsData['topDeals'] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Award className="w-5 h-5 text-amber-400" />
        <h3 className="text-lg font-semibold text-gray-900">Top 10 Negocios em Aberto</h3>
      </div>
      {data.length === 0 ? (
        <div className="text-center text-gray-400 py-6 text-sm">Nenhum negocio em aberto</div>
      ) : (
        <div className="space-y-3">
          {data.map((deal, index) => (
            <div key={deal.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{deal.title}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: deal.stageColor }} />
                  <span className="text-xs text-gray-400">{deal.stageName}</span>
                  {deal.contactName && (
                    <>
                      <span className="text-xs text-gray-500">-</span>
                      <span className="text-xs text-gray-400">{deal.contactName}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-900">{formatCurrency(deal.value)}</div>
                <div className="text-xs text-gray-400">{deal.probability}% prob.</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Deals at Risk
function DealsAtRisk({ data }: { data: PipelineAnalyticsData['dealsAtRisk'] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-red-400" />
        <h3 className="text-lg font-semibold text-gray-900">Negocios em Risco</h3>
      </div>
      {data.length === 0 ? (
        <div className="text-center text-gray-400 py-6 text-sm">
          <span className="text-green-400">OK</span> Nenhum negocio parado
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((deal) => (
            <div key={deal.id} className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{deal.title}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-red-400">{deal.daysSinceUpdate} dias parado</span>
                  <span className="text-xs text-gray-500">-</span>
                  <span className="text-xs text-gray-400">{deal.stageName}</span>
                </div>
              </div>
              <div className="text-sm font-semibold text-gray-900">{formatCurrency(deal.value)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Forecast Section
function ForecastSection({ data }: { data: PipelineAnalyticsData['forecast'] }) {
  const items = [
    { label: 'Pipeline Total', value: data.pipeline, color: 'bg-blue-500' },
    { label: 'Valor Ponderado', value: data.weighted, color: 'bg-purple-500' },
    { label: 'Committed (75%+)', value: data.committed, color: 'bg-green-500' },
    { label: 'Best Case (50%+)', value: data.bestCase, color: 'bg-amber-500' },
  ]

  const maxValue = Math.max(...items.map(i => i.value))

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Previsao (Forecast)</h3>
      <div className="grid grid-cols-4 gap-4">
        {items.map((item) => (
          <div key={item.label} className="text-center">
            <div className="text-2xl font-bold text-gray-900 mb-1">{formatCurrency(item.value)}</div>
            <div className="text-xs text-gray-400 mb-2">{item.label}</div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${item.color}`}
                style={{ width: maxValue > 0 ? `${(item.value / maxValue) * 100}%` : '0%' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Insights Section
function InsightsSection({ insights }: { insights: PipelineAnalyticsData['insights'] }) {
  if (!insights || insights.length === 0) return null

  const iconMap = {
    positive: <TrendingUp className="w-4 h-4 text-green-400" />,
    negative: <TrendingDown className="w-4 h-4 text-red-400" />,
    neutral: <Lightbulb className="w-4 h-4 text-amber-400" />,
  }

  const bgMap = {
    positive: 'bg-green-500/10 border-green-500/20',
    negative: 'bg-red-500/10 border-red-500/20',
    neutral: 'bg-amber-500/10 border-amber-500/20',
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-5 h-5 text-amber-400" />
        <h3 className="text-lg font-semibold text-gray-900">Insights</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {insights.map((insight, index) => (
          <div
            key={index}
            className={`flex items-start gap-3 p-3 rounded-xl border ${bgMap[insight.type]}`}
          >
            <div className="mt-0.5">{iconMap[insight.type]}</div>
            <p className="text-sm text-gray-700">{insight.message}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ==========================================
// MAIN PAGE COMPONENT
// ==========================================
export default function PipelineAnalyticsPage() {
  const params = useParams()
  const router = useRouter()
  const pipelineId = params.id as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<PipelineAnalyticsData | null>(null)
  const [period, setPeriod] = useState('month')
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false)

  const periods = [
    { value: 'today', label: 'Hoje' },
    { value: 'week', label: 'Ultima semana' },
    { value: 'month', label: 'Ultimo mes' },
    { value: 'quarter', label: 'Ultimo trimestre' },
    { value: 'year', label: 'Ultimo ano' },
  ]

  const fetchData = useCallback(async () => {
    if (!pipelineId) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/pipelines/${pipelineId}/analytics?period=${period}`)

      if (!response.ok) {
        throw new Error('Failed to fetch pipeline analytics')
      }

      const result = await response.json()
      setData(result)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [pipelineId, period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 mb-4">
          {error}
        </div>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              {data?.pipeline.color && (
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: data.pipeline.color }}
                />
              )}
              <h1 className="text-2xl font-bold text-gray-900">{data?.pipeline.name}</h1>
            </div>
            <p className="text-gray-400 mt-1">Dashboard de Analytics - {data?.period.label}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <div className="relative">
            <button
              onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 hover:bg-white transition-colors"
            >
              <span className="font-medium">{periods.find((p) => p.value === period)?.label}</span>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 transition-transform ${showPeriodDropdown ? 'rotate-180' : ''}`}
              />
            </button>

            <AnimatePresence>
              {showPeriodDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowPeriodDropdown(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden"
                  >
                    {periods.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => {
                          setPeriod(p.value)
                          setShowPeriodDropdown(false)
                        }}
                        className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                          period === p.value
                            ? 'bg-primary-500/20 text-primary-400'
                            : 'text-white hover:bg-gray-100'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-400 hover:text-white hover:bg-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {data && (
        <div className="space-y-6">
          {/* KPIs Row 1 - Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white/50 border-2 border-primary-500/50 rounded-2xl p-5">
              <div className="text-xs text-gray-400 mb-1">Total negocios</div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(data.kpis.totalValue)}</div>
              <div className="text-sm text-gray-400 mt-1">{data.kpis.totalDeals} negocios</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="text-xs text-gray-400 mb-1">Total ganhos</div>
              <div className="text-2xl font-bold text-green-400">{formatCurrency(data.kpis.wonValue)}</div>
              <div className="text-sm text-gray-400 mt-1">{data.kpis.wonDeals} negocios</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="text-xs text-gray-400 mb-1">Total perdidos</div>
              <div className="text-2xl font-bold text-red-400">{formatCurrency(data.kpis.lostValue)}</div>
              <div className="text-sm text-gray-400 mt-1">{data.kpis.lostDeals} negocios</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="text-xs text-gray-400 mb-1">Total em aberto</div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(data.kpis.openValue)}</div>
              <div className="text-sm text-gray-400 mt-1">{data.kpis.openDeals} negocios</div>
            </div>
          </div>

          {/* Funnel */}
          <SalesFunnel data={data.funnel} />

          {/* KPIs Row 2 */}
          <div className="grid grid-cols-4 gap-4">
            <KPICard icon={Percent} label="Win Rate" value={data.kpis.winRate} format="percent" color="amber" />
            <KPICard icon={DollarSign} label="Ticket Medio" value={data.kpis.avgTicket} color="primary" />
            <KPICard icon={Clock} label="Ciclo de Vendas" value={data.kpis.avgCycleDays} format="days" color="blue" />
            <KPICard
              icon={AlertTriangle}
              label="Negocios em Risco"
              value={data.dealsAtRisk.length}
              format="number"
              color="red"
              subtext={`Parados ha mais de 7 dias`}
            />
          </div>

          {/* Forecast */}
          <ForecastSection data={data.forecast} />

          {/* Stage Conversions */}
          <StageConversionFlow data={data.stageConversions} stages={data.funnel} />

          {/* Charts Row */}
          <div className="grid grid-cols-2 gap-6">
            <DealsByOwner data={data.dealsByOwner} />
            <DealsBySource data={data.dealsBySource} />
          </div>

          {/* Velocity & Timeline */}
          <div className="grid grid-cols-2 gap-6">
            <VelocitySection data={data.velocity} />
            <TimelineChart data={data.timeline} />
          </div>

          {/* Top Deals & At Risk */}
          <div className="grid grid-cols-2 gap-6">
            <TopDeals data={data.topDeals} />
            <DealsAtRisk data={data.dealsAtRisk} />
          </div>

          {/* Insights */}
          <InsightsSection insights={data.insights} />
        </div>
      )}
    </div>
  )
}
