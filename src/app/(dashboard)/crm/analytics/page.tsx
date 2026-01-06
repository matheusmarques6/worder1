'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign,
  Target,
  TrendingUp,
  TrendingDown,
  Percent,
  Clock,
  Users,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  Check,
  Lightbulb,
  BarChart3,
  PieChart,
  Award,
  X,
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
} from 'recharts'
import { useAuthStore, useStoreStore } from '@/stores' // ✅ MODIFICADO

// ==========================================
// TYPES
// ==========================================
interface Pipeline {
  id: string
  name: string
  color: string
}

interface KPIs {
  pipelineTotal: number
  weightedTotal: number
  wonValue: number
  lostValue: number
  winRate: number
  avgTicket: number
  avgCycleDays: number
  totalDeals: number
  openDeals: number
  wonDeals: number
  lostDeals: number
  variations: {
    wonValue: number
    winRate: number
    avgTicket: number
    avgCycleDays: number
  }
}

interface CommitLevel {
  level: string
  label: string
  value: number
  dealCount: number
  color: string
}

interface PipelineMetrics {
  id: string
  name: string
  color: string
  metrics: {
    totalValue: number
    wonValue: number
    winRate: number
    avgTicket: number
    avgCycleDays: number
    totalDeals: number
    openDeals: number
    wonDeals: number
    lostDeals: number
  }
}

interface FunnelStage {
  id: string
  name: string
  color: string
  position: number
  probability: number
  count: number
  value: number
  weightedValue: number
  percentage: number
}

interface VelocityStage {
  stageId: string
  stageName: string
  position: number
  avgHours: number
  avgDays: number
  transitions: number
}

interface TopDeal {
  id: string
  title: string
  value: number
  probability: number
  stageName: string
  stageColor: string
  contactName: string | null
  createdAt: string
  expectedCloseDate: string | null
}

interface DealAtRisk {
  id: string
  title: string
  value: number
  stageName: string
  stageColor: string
  daysSinceUpdate: number
  updatedAt: string
}

interface Insight {
  type: 'positive' | 'negative' | 'neutral'
  message: string
}

interface AnalyticsData {
  period: string
  periodLabel: string
  dateRange: { start: string; end: string }
  pipelines: Pipeline[]
  selectedPipelineIds: string[]
  kpis: KPIs
  byCommitLevel: CommitLevel[]
  byPipeline: PipelineMetrics[] | null
  funnel: FunnelStage[]
  timeline: any[]
  velocity: VelocityStage[]
  topDeals: TopDeal[]
  dealsAtRisk: DealAtRisk[]
  insights: Insight[]
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const formatPercent = (value: number) => `${value.toFixed(1)}%`

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
  format = 'currency'
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
      case 'currency': return formatCurrency(value)
      case 'percent': return `${value.toFixed(1)}%`
      case 'days': return `${value.toFixed(1)} dias`
      case 'number': return value.toLocaleString('pt-BR')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-5"
    >
      <div className={`w-10 h-10 rounded-xl ${colorClasses[color]} flex items-center justify-center mb-3`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-white mb-1">{formatValue()}</div>
      <div className="text-sm text-dark-400 mb-2">{label}</div>
      {(subtext || variation !== undefined) && (
        <div className="flex items-center gap-2">
          {subtext && <span className="text-xs text-dark-500">{subtext}</span>}
          {variation !== undefined && variation !== 0 && (
            <span className={`text-xs flex items-center gap-1 ${variation > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {variation > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {variation > 0 ? '+' : ''}{variation.toFixed(1)}%
            </span>
          )}
        </div>
      )}
    </motion.div>
  )
}

// Pipeline Selector Component
function PipelineSelector({
  pipelines,
  selectedIds,
  onChange,
}: {
  pipelines: Pipeline[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  const togglePipeline = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  const selectAll = () => onChange(pipelines.map(p => p.id))
  const selectNone = () => onChange([])

  const displayText = selectedIds.length === 0 || selectedIds.length === pipelines.length
    ? 'Todos os Pipelines'
    : selectedIds.length === 1
    ? pipelines.find(p => p.id === selectedIds[0])?.name || 'Pipeline'
    : `${selectedIds.length} Pipelines`

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white hover:bg-dark-800 transition-colors min-w-[200px]"
      >
        <BarChart3 className="w-4 h-4 text-dark-400" />
        <span className="flex-1 text-left font-medium">{displayText}</span>
        <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute left-0 top-full mt-2 w-72 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-20 overflow-hidden"
            >
              <div className="p-2 border-b border-dark-700/50">
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-dark-400 hover:text-white bg-dark-700/50 rounded-lg transition-colors"
                  >
                    Todos
                  </button>
                  <button
                    onClick={selectNone}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-dark-400 hover:text-white bg-dark-700/50 rounded-lg transition-colors"
                  >
                    Nenhum
                  </button>
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto p-2">
                {pipelines.map(pipeline => (
                  <button
                    key={pipeline.id}
                    onClick={() => togglePipeline(pipeline.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-dark-700/50 transition-colors"
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        selectedIds.includes(pipeline.id) || selectedIds.length === 0
                          ? 'bg-primary-500 border-primary-500'
                          : 'border-dark-600'
                      }`}
                    >
                      {(selectedIds.includes(pipeline.id) || selectedIds.length === 0) && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: pipeline.color || '#6366f1' }}
                    />
                    <span className="text-sm text-white">{pipeline.name}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// Commit Level Cards
function CommitLevelSection({ data }: { data: CommitLevel[] }) {
  // ✅ PROTEÇÃO: Garantir que data é array
  const safeData = Array.isArray(data) ? data : []
  const total = safeData.reduce((sum, d) => sum + (d.value || 0), 0)

  if (safeData.length === 0) {
    return (
      <div className="bg-dark-800/30 border border-dark-700/30 rounded-xl p-4 text-center text-dark-400">
        Sem dados de forecast
      </div>
    )
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      {safeData.map(level => (
        <motion.div
          key={level.level}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-dark-800/30 border border-dark-700/30 rounded-xl p-4"
        >
          <div className="text-xs text-dark-400 mb-2">{level.label}</div>
          <div className="text-xl font-bold text-white">{formatCurrency(level.value)}</div>
          <div className="flex items-center gap-2 mt-2">
            <div 
              className="h-1.5 rounded-full flex-1 bg-dark-700"
            >
              <div 
                className="h-full rounded-full transition-all duration-500"
                style={{ 
                  width: total > 0 ? `${(level.value / total) * 100}%` : '0%',
                  backgroundColor: level.color 
                }}
              />
            </div>
            <span className="text-xs text-dark-500">{level.dealCount} deals</span>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// Pipeline Comparison Table
function PipelineComparisonTable({ data }: { data: PipelineMetrics[] }) {
  // ✅ PROTEÇÃO: Garantir que data é array
  const safeData = Array.isArray(data) ? data : []
  
  if (safeData.length === 0) return null

  const totals = {
    totalValue: safeData.reduce((sum, p) => sum + (p.metrics?.totalValue || 0), 0),
    wonValue: safeData.reduce((sum, p) => sum + (p.metrics?.wonValue || 0), 0),
    totalDeals: safeData.reduce((sum, p) => sum + (p.metrics?.totalDeals || 0), 0),
    wonDeals: safeData.reduce((sum, p) => sum + (p.metrics?.wonDeals || 0), 0),
    lostDeals: safeData.reduce((sum, p) => sum + (p.metrics?.lostDeals || 0), 0),
  }
  const avgWinRate = totals.wonDeals + totals.lostDeals > 0 
    ? (totals.wonDeals / (totals.wonDeals + totals.lostDeals)) * 100 
    : 0

  return (
    <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-dark-700/50">
        <h3 className="text-lg font-semibold text-white">Comparativo por Pipeline</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-dark-700/50">
              <th className="text-left px-5 py-3 text-xs font-medium text-dark-400 uppercase">Pipeline</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-dark-400 uppercase">Valor Total</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-dark-400 uppercase">Win Rate</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-dark-400 uppercase">Ciclo</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-dark-400 uppercase">Ticket</th>
              <th className="text-right px-5 py-3 text-xs font-medium text-dark-400 uppercase">Deals</th>
            </tr>
          </thead>
          <tbody>
            {safeData.map((pipeline, index) => (
              <tr key={pipeline.id} className="border-b border-dark-700/30 hover:bg-dark-700/20">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: pipeline.color }} />
                    <span className="text-sm font-medium text-white">{pipeline.name}</span>
                  </div>
                </td>
                <td className="text-right px-5 py-3 text-sm text-white font-medium">
                  {formatCurrency(pipeline.metrics.totalValue)}
                </td>
                <td className="text-right px-5 py-3">
                  <span className={`text-sm font-medium ${pipeline.metrics.winRate >= avgWinRate ? 'text-green-400' : 'text-amber-400'}`}>
                    {pipeline.metrics.winRate.toFixed(1)}%
                  </span>
                </td>
                <td className="text-right px-5 py-3 text-sm text-dark-300">
                  {pipeline.metrics.avgCycleDays.toFixed(0)}d
                </td>
                <td className="text-right px-5 py-3 text-sm text-dark-300">
                  {formatCurrency(pipeline.metrics.avgTicket)}
                </td>
                <td className="text-right px-5 py-3 text-sm text-dark-300">
                  {pipeline.metrics.totalDeals}
                </td>
              </tr>
            ))}
            <tr className="bg-dark-700/30">
              <td className="px-5 py-3">
                <span className="text-sm font-semibold text-white">Total</span>
              </td>
              <td className="text-right px-5 py-3 text-sm text-white font-semibold">
                {formatCurrency(totals.totalValue)}
              </td>
              <td className="text-right px-5 py-3 text-sm text-white font-semibold">
                {avgWinRate.toFixed(1)}%
              </td>
              <td className="text-right px-5 py-3 text-sm text-dark-300">-</td>
              <td className="text-right px-5 py-3 text-sm text-dark-300">-</td>
              <td className="text-right px-5 py-3 text-sm text-white font-semibold">
                {totals.totalDeals}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Pipeline Charts
function PipelineCharts({ data }: { data: PipelineMetrics[] }) {
  if (!data || data.length === 0) return null

  const barData = data.map(p => ({
    name: p.name,
    value: p.metrics.totalValue,
    color: p.color,
  }))

  const pieData = data.map(p => ({
    name: p.name,
    value: p.metrics.totalDeals,
    color: p.color,
  }))

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Bar Chart - Value by Pipeline */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Valor por Pipeline</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} stroke="#9ca3af" fontSize={11} />
            <YAxis type="category" dataKey="name" stroke="#9ca3af" fontSize={11} width={80} />
            <Tooltip 
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
              labelStyle={{ color: '#fff' }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {barData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || '#6366f1'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie Chart - Deals by Pipeline */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Deals por Pipeline</h3>
        <ResponsiveContainer width="100%" height={200}>
          <RechartsPieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              dataKey="value"
              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
              labelLine={false}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || '#6366f1'} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value: number) => `${value} deals`}
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
            />
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// Funnel Component
function SalesFunnel({ data }: { data: FunnelStage[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-5">
        <h3 className="text-lg font-semibold text-white mb-4">Funil de Vendas</h3>
        <div className="text-center text-dark-400 py-8">Sem dados de funil</div>
      </div>
    )
  }

  const maxValue = Math.max(...data.map(s => s.value))

  return (
    <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-5">
      <h3 className="text-lg font-semibold text-white mb-4">Funil de Vendas</h3>
      <div className="space-y-3">
        {data.map((stage, index) => (
          <div key={stage.id} className="group">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color || '#6366f1' }} />
                <span className="text-sm font-medium text-white">{stage.name}</span>
                <span className="text-xs text-dark-500">({stage.count})</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-white">{formatCurrency(stage.value)}</span>
                <span className="text-xs text-dark-500">{stage.probability}%</span>
              </div>
            </div>
            <div className="relative h-8 bg-dark-700/50 rounded-lg overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: maxValue > 0 ? `${(stage.value / maxValue) * 100}%` : '0%' }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="absolute inset-y-0 left-0 rounded-lg"
                style={{ backgroundColor: stage.color || '#6366f1' }}
              />
              <div className="absolute inset-0 flex items-center px-3">
                <span className="text-xs text-white/80">
                  Ponderado: {formatCurrency(stage.weightedValue)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Timeline Chart
function TimelineChart({ data }: { data: any[] }) {
  if (!data || data.length === 0) return null

  return (
    <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-5">
      <h3 className="text-lg font-semibold text-white mb-4">Evolução de Deals e Valor</h3>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorWon" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorLost" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} />
          <YAxis stroke="#9ca3af" fontSize={11} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
            labelStyle={{ color: '#fff' }}
            formatter={(value: number, name: string) => [
              formatCurrency(value),
              name === 'wonValue' ? 'Ganhos' : 'Perdidos'
            ]}
          />
          <Area type="monotone" dataKey="wonValue" stroke="#22c55e" fillOpacity={1} fill="url(#colorWon)" name="wonValue" />
          <Area type="monotone" dataKey="lostValue" stroke="#ef4444" fillOpacity={1} fill="url(#colorLost)" name="lostValue" />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-xs text-dark-400">Valor Ganho</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-xs text-dark-400">Valor Perdido</span>
        </div>
      </div>
    </div>
  )
}

// Velocity by Stage
function VelocitySection({ data }: { data: VelocityStage[] }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-5">
        <h3 className="text-lg font-semibold text-white mb-4">Velocidade por Estágio</h3>
        <div className="flex flex-col items-center justify-center py-8 text-dark-400">
          <Clock className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">Sem dados de velocidade ainda</p>
          <p className="text-xs text-dark-500">Mova deals entre estágios para começar a medir</p>
        </div>
      </div>
    )
  }

  const maxDays = Math.max(...data.map(v => v.avgDays))

  return (
    <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-5">
      <h3 className="text-lg font-semibold text-white mb-4">Velocidade por Estágio</h3>
      <div className="space-y-3">
        {data.map((stage, index) => (
          <div key={stage.stageId}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-white">{stage.stageName}</span>
              <span className="text-sm font-medium text-dark-300">{stage.avgDays.toFixed(1)} dias</span>
            </div>
            <div className="h-2 bg-dark-700/50 rounded-full overflow-hidden">
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

// Top Deals & Deals at Risk
function DealsSection({ topDeals, dealsAtRisk }: { topDeals: TopDeal[]; dealsAtRisk: DealAtRisk[] }) {
  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Top Deals */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Award className="w-5 h-5 text-amber-400" />
          <h3 className="text-lg font-semibold text-white">Top 5 Deals</h3>
        </div>
        {topDeals.length === 0 ? (
          <div className="text-center text-dark-400 py-6 text-sm">Nenhum deal em aberto</div>
        ) : (
          <div className="space-y-3">
            {topDeals.map((deal, index) => (
              <div key={deal.id} className="flex items-center gap-3 p-3 bg-dark-700/30 rounded-xl">
                <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{deal.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: deal.stageColor }} />
                    <span className="text-xs text-dark-400">{deal.stageName}</span>
                  </div>
                </div>
                <div className="text-sm font-semibold text-white">{formatCurrency(deal.value)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deals at Risk */}
      <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <h3 className="text-lg font-semibold text-white">Deals em Risco</h3>
        </div>
        {dealsAtRisk.length === 0 ? (
          <div className="text-center text-dark-400 py-6 text-sm">
            <span className="text-green-400">✓</span> Nenhum deal parado
          </div>
        ) : (
          <div className="space-y-3">
            {dealsAtRisk.slice(0, 5).map(deal => (
              <div key={deal.id} className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{deal.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-red-400">{deal.daysSinceUpdate} dias parado</span>
                    <span className="text-xs text-dark-500">•</span>
                    <span className="text-xs text-dark-400">{deal.stageName}</span>
                  </div>
                </div>
                <div className="text-sm font-semibold text-white">{formatCurrency(deal.value)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Insights Section
function InsightsSection({ insights }: { insights: Insight[] }) {
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
    <div className="bg-dark-800/50 border border-dark-700/50 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-5 h-5 text-amber-400" />
        <h3 className="text-lg font-semibold text-white">Insights</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {insights.map((insight, index) => (
          <div
            key={index}
            className={`flex items-start gap-3 p-3 rounded-xl border ${bgMap[insight.type]}`}
          >
            <div className="mt-0.5">{iconMap[insight.type]}</div>
            <p className="text-sm text-white">{insight.message}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ==========================================
// MAIN PAGE COMPONENT
// ==========================================
export default function AnalyticsPage() {
  const { user } = useAuthStore()
  const { currentStore } = useStoreStore() // ✅ NOVO
  const organizationId = user?.organization_id
  const storeId = currentStore?.id // ✅ NOVO

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [period, setPeriod] = useState('month')
  const [selectedPipelineIds, setSelectedPipelineIds] = useState<string[]>([])
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false)

  const periods = [
    { value: 'month', label: 'Este Mês' },
    { value: 'quarter', label: 'Este Trimestre' },
    { value: 'year', label: 'Este Ano' },
    { value: '30days', label: 'Últimos 30 Dias' },
    { value: '3months', label: 'Últimos 3 Meses' },
    { value: '6months', label: 'Últimos 6 Meses' },
  ]

  const fetchData = useCallback(async () => {
    // ✅ MODIFICADO: Verificar storeId também
    if (!organizationId || !storeId) {
      setData(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        organizationId,
        storeId, // ✅ NOVO
        period,
        includeComparison: 'true',
      })
      
      if (selectedPipelineIds.length > 0) {
        params.set('pipelineIds', selectedPipelineIds.join(','))
      }

      const response = await fetch(`/api/analytics/sales?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch analytics')
      }

      const result = await response.json()
      setData(result)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [organizationId, storeId, period, selectedPipelineIds]) // ✅ MODIFICADO

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ✅ NOVO: Verificar loja selecionada
  if (!organizationId || !storeId) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-dark-400">Selecione uma loja para ver analytics</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics de Vendas</h1>
          <p className="text-dark-400 mt-1">Análise completa do seu pipeline de vendas</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Pipeline Selector */}
          {data?.pipelines && (
            <PipelineSelector
              pipelines={data.pipelines}
              selectedIds={selectedPipelineIds}
              onChange={setSelectedPipelineIds}
            />
          )}

          {/* Period Selector */}
          <div className="relative">
            <button
              onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
              className="flex items-center gap-2 px-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white hover:bg-dark-800 transition-colors"
            >
              <span className="font-medium">{periods.find(p => p.value === period)?.label}</span>
              <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${showPeriodDropdown ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showPeriodDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowPeriodDropdown(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 top-full mt-2 w-48 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-20 overflow-hidden"
                  >
                    {periods.map(p => (
                      <button
                        key={p.value}
                        onClick={() => {
                          setPeriod(p.value)
                          setShowPeriodDropdown(false)
                        }}
                        className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                          period === p.value
                            ? 'bg-primary-500/20 text-primary-400'
                            : 'text-white hover:bg-dark-700/50'
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
            className="p-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-dark-400 hover:text-white hover:bg-dark-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && !data && (
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="w-8 h-8 text-primary-400 animate-spin" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Data */}
      {data && (
        <div className="space-y-6">
          {/* KPIs Row 1 */}
          <div className="grid grid-cols-4 gap-4">
            <KPICard
              icon={DollarSign}
              label="Pipeline Total"
              value={data.kpis.pipelineTotal}
              subtext={`${data.kpis.openDeals} deals abertos`}
              color="primary"
            />
            <KPICard
              icon={Target}
              label="Pipeline Ponderado"
              value={data.kpis.weightedTotal}
              subtext="Valor × Probabilidade"
              color="blue"
            />
            <KPICard
              icon={TrendingUp}
              label={`Ganhos (${data.periodLabel})`}
              value={data.kpis.wonValue}
              subtext={`${data.kpis.wonDeals} deals ganhos`}
              variation={data.kpis.variations.wonValue}
              color="green"
            />
            <KPICard
              icon={Percent}
              label="Win Rate"
              value={data.kpis.winRate}
              subtext={`${data.kpis.wonDeals} ganhos / ${data.kpis.wonDeals + data.kpis.lostDeals} fechados`}
              variation={data.kpis.variations.winRate}
              format="percent"
              color="amber"
            />
          </div>

          {/* KPIs Row 2 */}
          <div className="grid grid-cols-4 gap-4">
            <KPICard
              icon={DollarSign}
              label="Ticket Médio"
              value={data.kpis.avgTicket}
              variation={data.kpis.variations.avgTicket}
              color="primary"
            />
            <KPICard
              icon={Clock}
              label="Ciclo de Vendas"
              value={data.kpis.avgCycleDays}
              subtext="Dias até fechar"
              variation={data.kpis.variations.avgCycleDays}
              format="days"
              color="blue"
            />
            <KPICard
              icon={TrendingDown}
              label="Valor Perdido"
              value={data.kpis.lostValue}
              subtext={`${data.kpis.lostDeals} deals perdidos`}
              color="red"
            />
            <KPICard
              icon={Users}
              label="Total de Deals"
              value={data.kpis.totalDeals}
              format="number"
              color="primary"
            />
          </div>

          {/* Commit Level Section */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Forecast por Commit Level</h3>
            <CommitLevelSection data={data.byCommitLevel} />
          </div>

          {/* Pipeline Comparison (when multiple pipelines) */}
          {data.byPipeline && data.byPipeline.length > 1 && (
            <>
              <PipelineComparisonTable data={data.byPipeline} />
              <PipelineCharts data={data.byPipeline} />
            </>
          )}

          {/* Funnel & Velocity */}
          <div className="grid grid-cols-2 gap-6">
            <SalesFunnel data={data.funnel} />
            <VelocitySection data={data.velocity} />
          </div>

          {/* Timeline Chart */}
          {data.timeline && data.timeline.length > 0 && (
            <TimelineChart data={data.timeline} />
          )}

          {/* Top Deals & Deals at Risk */}
          <DealsSection topDeals={data.topDeals} dealsAtRisk={data.dealsAtRisk} />

          {/* Insights */}
          <InsightsSection insights={data.insights} />
        </div>
      )}
    </div>
  )
}
