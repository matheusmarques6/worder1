'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Target,
  Percent,
  Calendar,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Award,
  Clock,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Zap,
} from 'lucide-react'
import {
  useReports,
  ReportPeriod,
  FullReport,
} from '@/hooks/useReports'

// =============================================
// Types
// =============================================

interface ReportsDashboardProps {
  organizationId: string
  pipelineId?: string | null
}

// =============================================
// Helper Functions
// =============================================

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const formatPercent = (value: number): string => {
  return `${value.toFixed(1)}%`
}

const formatNumber = (value: number): string => {
  return new Intl.NumberFormat('pt-BR').format(value)
}

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1']

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: '7d', label: 'Ultimos 7 dias' },
  { value: '30d', label: 'Ultimos 30 dias' },
  { value: '90d', label: 'Ultimos 90 dias' },
  { value: 'mtd', label: 'Mes atual' },
  { value: 'ytd', label: 'Ano atual' },
  { value: '1y', label: 'Ultimo ano' },
]

// =============================================
// Main Component
// =============================================

export function ReportsDashboard({ organizationId, pipelineId }: ReportsDashboardProps) {
  const {
    report,
    isLoading,
    error,
    period,
    setPeriod,
    loadReport,
    exportReport,
  } = useReports({ organizationId, pipelineId })

  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'roi' | 'channels'>('overview')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Relatorios</h2>
          <p className="text-slate-400">Analise completa de performance e ROI</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {PERIOD_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <button
            onClick={() => loadReport()}
            disabled={isLoading}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
            <button
              onClick={() => exportReport('csv')}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-white rounded-md transition-colors flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-800/50 border border-slate-700 rounded-lg p-1 w-fit">
        {[
          { id: 'overview', label: 'Visao Geral', icon: BarChart3 },
          { id: 'sales', label: 'Vendas', icon: DollarSign },
          { id: 'roi', label: 'ROI', icon: TrendingUp },
          { id: 'channels', label: 'Canais', icon: PieChartIcon },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 text-sm rounded-md transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-violet-500 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 text-violet-400 mx-auto mb-4 animate-spin" />
          <p className="text-slate-400">Gerando relatorio...</p>
        </div>
      )}

      {/* Content */}
      {!isLoading && (
        <>
          {activeTab === 'overview' && <OverviewTab report={report} />}
          {activeTab === 'sales' && <SalesTab report={report} />}
          {activeTab === 'roi' && <ROITab report={report} />}
          {activeTab === 'channels' && <ChannelsTab report={report} />}
        </>
      )}
    </div>
  )
}

// =============================================
// Overview Tab
// =============================================

function OverviewTab({ report }: { report: FullReport }) {
  const { revenue, conversions, trends } = report

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Receita Total"
          value={formatCurrency(revenue?.total || 0)}
          change={revenue?.growth || 0}
          icon={DollarSign}
          color="emerald"
        />
        <MetricCard
          title="Negocios Fechados"
          value={formatNumber(revenue?.deals_closed || 0)}
          subtitle={`Ticket medio: ${formatCurrency(revenue?.average_ticket || 0)}`}
          icon={Target}
          color="violet"
        />
        <MetricCard
          title="Taxa de Conversao"
          value={formatPercent(conversions?.conversion_rate || 0)}
          subtitle={`Win rate: ${formatPercent(conversions?.win_rate || 0)}`}
          icon={Percent}
          color="cyan"
        />
        <MetricCard
          title="Ciclo Medio"
          value={`${conversions?.average_cycle_days || 0} dias`}
          subtitle={`${conversions?.total_leads || 0} leads no periodo`}
          icon={Clock}
          color="orange"
        />
      </div>

      {/* Target Progress */}
      {revenue && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Progresso da Meta</h3>
            <span className="text-sm text-slate-400">
              Meta: {formatCurrency(revenue.target)}
            </span>
          </div>
          <div className="h-4 bg-slate-700 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(revenue.target_progress, 100)}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className={`h-full rounded-full ${
                revenue.target_progress >= 100
                  ? 'bg-emerald-500'
                  : revenue.target_progress >= 70
                    ? 'bg-yellow-500'
                    : 'bg-violet-500'
              }`}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-2xl font-bold text-gray-900">
              {formatCurrency(revenue.total)}
            </span>
            <span className={`text-lg font-semibold ${
              revenue.target_progress >= 100 ? 'text-emerald-400' : 'text-violet-400'
            }`}>
              {formatPercent(revenue.target_progress)}
            </span>
          </div>
        </motion.div>
      )}

      {/* Trends Chart */}
      {trends && trends.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tendencias</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="date"
                  stroke="#64748b"
                  tickFormatter={(date) => new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                />
                <YAxis stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                  labelFormatter={(date) => new Date(date).toLocaleDateString('pt-BR')}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="leads"
                  name="Leads"
                  stroke="#8b5cf6"
                  fillOpacity={1}
                  fill="url(#colorLeads)"
                />
                <Area
                  type="monotone"
                  dataKey="conversions"
                  name="Conversoes"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {/* Funnel */}
      {conversions && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Funil de Conversao</h3>
          <div className="space-y-3">
            {[
              { label: 'Total Leads', value: conversions.total_leads, color: 'bg-slate-500' },
              { label: 'Leads Qualificados', value: conversions.qualified_leads, color: 'bg-violet-500' },
              { label: 'Oportunidades', value: conversions.opportunities, color: 'bg-cyan-500' },
              { label: 'Negocios Ganhos', value: conversions.deals_won, color: 'bg-emerald-500' },
            ].map((stage, index) => {
              const maxValue = conversions.total_leads || 1
              const width = (stage.value / maxValue) * 100
              return (
                <div key={stage.label} className="flex items-center gap-4">
                  <div className="w-40 text-sm text-slate-400">{stage.label}</div>
                  <div className="flex-1 h-8 bg-slate-700/50 rounded-lg overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${width}%` }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      className={`h-full ${stage.color} flex items-center justify-end pr-2`}
                    >
                      <span className="text-white text-sm font-medium">{stage.value}</span>
                    </motion.div>
                  </div>
                  <div className="w-16 text-right text-sm text-slate-400">
                    {formatPercent(width)}
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// =============================================
// Sales Tab
// =============================================

function SalesTab({ report }: { report: FullReport }) {
  const { sales } = report

  if (!sales) {
    return (
      <div className="text-center py-12">
        <Activity className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400">Nenhum dado de vendas disponivel</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Agent Performance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance por Agente</h3>

        {sales.by_agent.length === 0 ? (
          <p className="text-slate-400 text-center py-8">Nenhum dado de agentes disponivel</p>
        ) : (
          <>
            <div className="h-80 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sales.by_agent} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis type="number" stroke="#64748b" />
                  <YAxis dataKey="agent_name" type="category" stroke="#64748b" width={120} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Bar dataKey="revenue" name="Receita" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-slate-400 border-b border-slate-700">
                    <th className="pb-3 font-medium">Agente</th>
                    <th className="pb-3 font-medium text-right">Leads</th>
                    <th className="pb-3 font-medium text-right">Ganhos</th>
                    <th className="pb-3 font-medium text-right">Perdidos</th>
                    <th className="pb-3 font-medium text-right">Win Rate</th>
                    <th className="pb-3 font-medium text-right">Receita</th>
                    <th className="pb-3 font-medium text-right">Ticket Medio</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.by_agent.map((agent, index) => (
                    <tr key={agent.agent_id} className="border-b border-slate-700/50">
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          {index === 0 && <Award className="w-5 h-5 text-yellow-400" />}
                          <span className="text-white">{agent.agent_name}</span>
                        </div>
                      </td>
                      <td className="py-3 text-right text-slate-300">{agent.leads_assigned}</td>
                      <td className="py-3 text-right text-emerald-400">{agent.deals_won}</td>
                      <td className="py-3 text-right text-red-400">{agent.deals_lost}</td>
                      <td className="py-3 text-right">
                        <span className={`${agent.win_rate >= 50 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                          {formatPercent(agent.win_rate)}
                        </span>
                      </td>
                      <td className="py-3 text-right text-violet-400 font-medium">
                        {formatCurrency(agent.revenue)}
                      </td>
                      <td className="py-3 text-right text-slate-300">
                        {formatCurrency(agent.average_ticket)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </motion.div>

      {/* Stage Performance */}
      {sales.by_stage.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Desempenho por Etapa</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {sales.by_stage.map((stage) => (
              <div
                key={stage.stage_name}
                className="bg-slate-700/30 rounded-lg p-4"
              >
                <p className="text-sm text-slate-400 mb-1">{stage.stage_name}</p>
                <p className="text-2xl font-bold text-gray-900">{stage.deals_count}</p>
                <div className="flex items-center justify-between mt-2 text-sm">
                  <span className="text-slate-400">Valor total</span>
                  <span className="text-violet-400">{formatCurrency(stage.total_value)}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// =============================================
// ROI Tab
// =============================================

function ROITab({ report }: { report: FullReport }) {
  const { roi } = report

  if (!roi) {
    return (
      <div className="text-center py-12">
        <TrendingUp className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400">Nenhum dado de ROI disponivel</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ROI KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="ROI"
          value={formatPercent(roi.roi_percentage)}
          subtitle={`Retorno: ${formatCurrency(roi.total_return)}`}
          icon={TrendingUp}
          color={roi.roi_percentage >= 100 ? 'emerald' : roi.roi_percentage >= 0 ? 'yellow' : 'red'}
        />
        <MetricCard
          title="CAC"
          value={formatCurrency(roi.cac)}
          subtitle="Custo de Aquisicao"
          icon={DollarSign}
          color="orange"
        />
        <MetricCard
          title="LTV"
          value={formatCurrency(roi.ltv)}
          subtitle="Valor Vitalicio"
          icon={Users}
          color="cyan"
        />
        <MetricCard
          title="LTV/CAC"
          value={`${roi.ltv_cac_ratio}x`}
          subtitle={`Payback: ${roi.payback_months} meses`}
          icon={Zap}
          color={roi.ltv_cac_ratio >= 3 ? 'emerald' : roi.ltv_cac_ratio >= 1 ? 'yellow' : 'red'}
        />
      </div>

      {/* Investment vs Return */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Investimento vs Retorno</h3>
        <div className="grid grid-cols-2 gap-8">
          <div className="text-center">
            <p className="text-sm text-slate-400 mb-2">Investimento Total</p>
            <p className="text-4xl font-bold text-orange-400">{formatCurrency(roi.total_investment)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-slate-400 mb-2">Retorno Total</p>
            <p className="text-4xl font-bold text-emerald-400">{formatCurrency(roi.total_return)}</p>
          </div>
        </div>
        <div className="mt-6 h-4 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-emerald-500"
            style={{ width: `${Math.min((roi.total_return / (roi.total_investment + roi.total_return)) * 100, 100)}%` }}
          />
        </div>
      </motion.div>

      {/* Campaigns */}
      {roi.campaigns.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance de Campanhas</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-slate-400 border-b border-slate-700">
                  <th className="pb-3 font-medium">Campanha</th>
                  <th className="pb-3 font-medium text-right">Investimento</th>
                  <th className="pb-3 font-medium text-right">Retorno</th>
                  <th className="pb-3 font-medium text-right">ROI</th>
                  <th className="pb-3 font-medium text-right">Leads</th>
                  <th className="pb-3 font-medium text-right">Conversoes</th>
                </tr>
              </thead>
              <tbody>
                {roi.campaigns.map((campaign) => (
                  <tr key={campaign.name} className="border-b border-slate-700/50">
                    <td className="py-3 text-white">{campaign.name}</td>
                    <td className="py-3 text-right text-orange-400">{formatCurrency(campaign.investment)}</td>
                    <td className="py-3 text-right text-emerald-400">{formatCurrency(campaign.return_value)}</td>
                    <td className="py-3 text-right">
                      <span className={campaign.roi >= 100 ? 'text-emerald-400' : campaign.roi >= 0 ? 'text-yellow-400' : 'text-red-400'}>
                        {formatPercent(campaign.roi)}
                      </span>
                    </td>
                    <td className="py-3 text-right text-slate-300">{campaign.leads_generated}</td>
                    <td className="py-3 text-right text-slate-300">{campaign.conversions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  )
}

// =============================================
// Channels Tab
// =============================================

function ChannelsTab({ report }: { report: FullReport }) {
  const { channels } = report

  if (!channels || channels.channels.length === 0) {
    return (
      <div className="text-center py-12">
        <PieChartIcon className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400">Nenhum dado de canais disponivel</p>
      </div>
    )
  }

  const pieData = channels.channels.map((ch, i) => ({
    name: ch.name,
    value: ch.revenue,
    color: COLORS[i % COLORS.length],
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Receita por Canal</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Bar Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Leads e Conversoes por Canal</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channels.channels}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar dataKey="leads" name="Leads" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="conversions" name="Conversoes" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Channel Details Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-slate-800/50 border border-slate-700 rounded-xl p-6"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Detalhes por Canal</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-slate-400 border-b border-slate-700">
                <th className="pb-3 font-medium">Canal</th>
                <th className="pb-3 font-medium text-right">Leads</th>
                <th className="pb-3 font-medium text-right">Conversoes</th>
                <th className="pb-3 font-medium text-right">Taxa de Conversao</th>
                <th className="pb-3 font-medium text-right">Receita</th>
              </tr>
            </thead>
            <tbody>
              {channels.channels.map((channel, index) => (
                <tr key={channel.name} className="border-b border-slate-700/50">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-white">{channel.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-right text-slate-300">{channel.leads}</td>
                  <td className="py-3 text-right text-emerald-400">{channel.conversions}</td>
                  <td className="py-3 text-right text-cyan-400">{formatPercent(channel.conversion_rate)}</td>
                  <td className="py-3 text-right text-violet-400 font-medium">{formatCurrency(channel.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  )
}

// =============================================
// Metric Card Component
// =============================================

interface MetricCardProps {
  title: string
  value: string
  change?: number
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  color: 'emerald' | 'violet' | 'cyan' | 'orange' | 'red' | 'yellow'
}

function MetricCard({ title, value, change, subtitle, icon: Icon, color }: MetricCardProps) {
  const colorClasses = {
    emerald: 'bg-emerald-500/20 text-emerald-400',
    violet: 'bg-violet-500/20 text-violet-400',
    cyan: 'bg-cyan-500/20 text-cyan-400',
    orange: 'bg-orange-500/20 text-orange-400',
    red: 'bg-red-500/20 text-red-400',
    yellow: 'bg-yellow-500/20 text-yellow-400',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-800/50 border border-slate-700 rounded-xl p-4"
    >
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg ${colorClasses[color]} flex items-center justify-center`}>
          <Icon className="w-5 h-5" />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-sm ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {change >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-sm text-slate-400">{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      </div>
    </motion.div>
  )
}

export default ReportsDashboard
