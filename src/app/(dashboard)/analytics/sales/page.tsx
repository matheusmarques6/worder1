'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Clock,
  Users,
  BarChart3,
  PieChart,
  Activity,
  Award,
  RefreshCw,
  Calendar,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Filter,
  Briefcase,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart as RechartsPie,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts'
import { useAuthStore } from '@/stores'

// Types
interface KPIs {
  totalDeals: number
  wonDeals: number
  lostDeals: number
  openDeals: number
  totalWonValue: number
  totalLostValue: number
  totalOpenValue: number
  weightedPipeline: number
  winRate: number
  avgDealSize: number
  avgSalesCycle: number
}

interface TimelineData {
  date: string
  label: string
  created: number
  won: number
  lost: number
  wonValue: number
  lostValue: number
}

interface FunnelData {
  name: string
  color: string
  position: number
  count: number
  value: number
  conversionRate: number
}

interface WinLossData {
  date: string
  label: string
  won: number
  lost: number
  winRate: number
}

interface VelocityData {
  date: string
  label: string
  avgDays: number
  transitions: number
}

interface StagePerformance {
  name: string
  color: string
  position: number
  currentDeals: number
  currentValue: number
  avgTimeInStage: number
}

interface TopDeal {
  id: string
  title: string
  value: number
  probability: number
  stageName: string
  stageColor: string
  createdAt: string
}

interface AnalyticsData {
  period: string
  dateRange: { start: string; end: string }
  kpis: KPIs
  timeline: TimelineData[]
  funnel: FunnelData[]
  winLoss: WinLossData[]
  velocity: VelocityData[]
  stagePerformance: StagePerformance[]
  topDeals: TopDeal[]
}

const PERIODS = [
  { value: '30days', label: 'Últimos 30 dias' },
  { value: '3months', label: 'Últimos 3 meses' },
  { value: '6months', label: 'Últimos 6 meses' },
  { value: '12months', label: 'Últimos 12 meses' },
  { value: 'all', label: 'Todo o período' },
]

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const formatCompact = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return value.toString()
}

export default function SalesAnalyticsPage() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [period, setPeriod] = useState('6months')
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false)

  const organizationId = user?.organization_id

  const fetchData = async () => {
    if (!organizationId) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/analytics/sales?organizationId=${organizationId}&period=${period}`)
      
      if (!res.ok) {
        throw new Error('Erro ao carregar dados de analytics')
      }

      const result = await res.json()
      setData(result)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [organizationId, period])

  if (!organizationId) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <p className="text-dark-400">Faça login para ver os analytics</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <BarChart3 className="w-7 h-7 text-primary-400" />
            Analytics de Vendas
          </h1>
          <p className="text-dark-400 mt-1">
            Acompanhe a performance do seu pipeline de vendas
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <div className="relative">
            <button
              onClick={() => setShowPeriodDropdown(!showPeriodDropdown)}
              className="flex items-center gap-2 px-4 py-2.5 bg-dark-800 border border-dark-700 rounded-xl text-white hover:border-dark-600 transition-colors"
            >
              <Calendar className="w-4 h-4 text-dark-400" />
              <span>{PERIODS.find(p => p.value === period)?.label}</span>
              <ChevronDown className="w-4 h-4 text-dark-400" />
            </button>

            {showPeriodDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowPeriodDropdown(false)} 
                />
                <div className="absolute right-0 top-full mt-2 w-48 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-20 py-1">
                  {PERIODS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => {
                        setPeriod(p.value)
                        setShowPeriodDropdown(false)
                      }}
                      className={`w-full px-4 py-2.5 text-left text-sm hover:bg-dark-700 transition-colors ${
                        period === p.value ? 'text-primary-400' : 'text-dark-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Refresh */}
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2.5 bg-dark-800 border border-dark-700 rounded-xl text-dark-400 hover:text-white hover:border-dark-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && !data && (
        <div className="min-h-[400px] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Content */}
      {data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Valor Ganho"
              value={formatCurrency(data.kpis.totalWonValue)}
              icon={DollarSign}
              color="green"
              subtitle={`${data.kpis.wonDeals} deals fechados`}
            />
            <KPICard
              title="Pipeline Aberto"
              value={formatCurrency(data.kpis.totalOpenValue)}
              icon={Briefcase}
              color="blue"
              subtitle={`Ponderado: ${formatCurrency(data.kpis.weightedPipeline)}`}
            />
            <KPICard
              title="Win Rate"
              value={`${data.kpis.winRate}%`}
              icon={Target}
              color="purple"
              subtitle={`${data.kpis.wonDeals} ganhos / ${data.kpis.wonDeals + data.kpis.lostDeals} fechados`}
            />
            <KPICard
              title="Ciclo Médio"
              value={`${data.kpis.avgSalesCycle} dias`}
              icon={Clock}
              color="amber"
              subtitle={`Ticket médio: ${formatCurrency(data.kpis.avgDealSize)}`}
            />
          </div>

          {/* Charts Row 1: Timeline + Win/Loss */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Timeline */}
            <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary-400" />
                Evolução de Receita
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.timeline}>
                    <defs>
                      <linearGradient id="wonGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="lostGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis 
                      dataKey="label" 
                      stroke="#71717a" 
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="#71717a" 
                      fontSize={12}
                      tickLine={false}
                      tickFormatter={(v) => formatCompact(v)}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid #27272a',
                        borderRadius: '12px',
                      }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="wonValue"
                      name="Ganho"
                      stroke="#22c55e"
                      fill="url(#wonGradient)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="lostValue"
                      name="Perdido"
                      stroke="#ef4444"
                      fill="url(#lostGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Win Rate Over Time */}
            <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-primary-400" />
                Win Rate ao Longo do Tempo
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.winLoss}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis 
                      dataKey="label" 
                      stroke="#71717a" 
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      yAxisId="left"
                      stroke="#71717a" 
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      stroke="#71717a" 
                      fontSize={12}
                      tickLine={false}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid #27272a',
                        borderRadius: '12px',
                      }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="won" name="Ganhos" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="left" dataKey="lost" name="Perdidos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Line 
                      yAxisId="right" 
                      type="monotone" 
                      dataKey="winRate" 
                      name="Win Rate" 
                      stroke="#8b5cf6" 
                      strokeWidth={3}
                      dot={{ fill: '#8b5cf6', strokeWidth: 2 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Charts Row 2: Funnel + Velocity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Funnel */}
            <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-primary-400" />
                Funil de Conversão
              </h3>
              <div className="space-y-3">
                {data.funnel.map((stage, index) => (
                  <div key={stage.name} className="relative">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: stage.color }}
                        />
                        <span className="text-sm text-white font-medium">{stage.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-dark-400">{stage.count} deals</span>
                        <span className="text-primary-400 font-medium">{stage.conversionRate}%</span>
                      </div>
                    </div>
                    <div className="h-8 bg-dark-800 rounded-lg overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${stage.conversionRate}%` }}
                        transition={{ duration: 0.8, delay: index * 0.1 }}
                        className="h-full rounded-lg flex items-center justify-end pr-3"
                        style={{ backgroundColor: stage.color }}
                      >
                        <span className="text-xs text-white font-medium">
                          {formatCurrency(stage.value)}
                        </span>
                      </motion.div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sales Velocity */}
            <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary-400" />
                Velocidade de Vendas
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.velocity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis 
                      dataKey="label" 
                      stroke="#71717a" 
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="#71717a" 
                      fontSize={12}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid #27272a',
                        borderRadius: '12px',
                      }}
                      formatter={(value: number, name: string) => [
                        name === 'avgDays' ? `${value} dias` : value,
                        name === 'avgDays' ? 'Tempo Médio' : 'Transições'
                      ]}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="avgDays" 
                      name="Tempo Médio (dias)" 
                      stroke="#06b6d4" 
                      strokeWidth={2}
                      dot={{ fill: '#06b6d4', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Charts Row 3: Stage Performance + Top Deals */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stage Performance */}
            <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary-400" />
                Performance por Estágio
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.stagePerformance} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                    <XAxis type="number" stroke="#71717a" fontSize={12} tickLine={false} />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      stroke="#71717a" 
                      fontSize={12}
                      tickLine={false}
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid #27272a',
                        borderRadius: '12px',
                      }}
                      formatter={(value: number, name: string) => [
                        name === 'currentValue' ? formatCurrency(value) :
                        name === 'avgTimeInStage' ? `${value} dias` : value,
                        name === 'currentValue' ? 'Valor' :
                        name === 'avgTimeInStage' ? 'Tempo Médio' : 'Deals'
                      ]}
                    />
                    <Legend />
                    <Bar 
                      dataKey="currentDeals" 
                      name="Deals Ativos" 
                      fill="#8b5cf6" 
                      radius={[0, 4, 4, 0]}
                    />
                    <Bar 
                      dataKey="avgTimeInStage" 
                      name="Dias no Estágio" 
                      fill="#06b6d4" 
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Deals */}
            <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Award className="w-5 h-5 text-primary-400" />
                Top 5 Deals em Aberto
              </h3>
              <div className="space-y-3">
                {data.topDeals.length > 0 ? (
                  data.topDeals.map((deal, index) => (
                    <motion.div
                      key={deal.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center gap-4 p-3 bg-dark-800/50 border border-dark-700/50 rounded-xl hover:border-dark-600 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{deal.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className="text-xs px-2 py-0.5 rounded"
                            style={{
                              backgroundColor: `${deal.stageColor}20`,
                              color: deal.stageColor,
                            }}
                          >
                            {deal.stageName}
                          </span>
                          <span className="text-xs text-dark-500">
                            {deal.probability}% prob.
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-green-400 font-semibold">
                          {formatCurrency(deal.value)}
                        </p>
                        <p className="text-xs text-dark-500">
                          {new Date(deal.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center py-8 text-dark-400">
                    <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Nenhum deal em aberto</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Deals Created Over Time */}
          <div className="bg-dark-900 border border-dark-800 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-primary-400" />
              Deals Criados vs Fechados
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis 
                    dataKey="label" 
                    stroke="#71717a" 
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#71717a" 
                    fontSize={12}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #27272a',
                      borderRadius: '12px',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="created" name="Criados" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="won" name="Ganhos" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="lost" name="Perdidos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// KPI Card Component
function KPICard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string
  value: string
  icon: any
  color: 'green' | 'blue' | 'purple' | 'amber' | 'red'
  subtitle?: string
}) {
  const colorClasses = {
    green: 'bg-green-500/10 text-green-400 border-green-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red: 'bg-red-500/10 text-red-400 border-red-500/20',
  }

  const iconColorClasses = {
    green: 'bg-green-500/20 text-green-400',
    blue: 'bg-blue-500/20 text-blue-400',
    purple: 'bg-purple-500/20 text-purple-400',
    amber: 'bg-amber-500/20 text-amber-400',
    red: 'bg-red-500/20 text-red-400',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-dark-900 border rounded-2xl p-5 ${colorClasses[color].split(' ')[2]}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${iconColorClasses[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-dark-400 text-sm mb-1">{title}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {subtitle && (
        <p className="text-sm text-dark-500 mt-1">{subtitle}</p>
      )}
    </motion.div>
  )
}
