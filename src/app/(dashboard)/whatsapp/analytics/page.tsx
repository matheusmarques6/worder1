'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  Send,
  CheckCheck,
  Eye,
  MessageSquare,
  AlertTriangle,
  Bot,
  Zap,
  Clock,
  DollarSign,
  Users,
  RefreshCw,
  Download,
  Filter,
  Loader2,
  BarChart3,
  Target,
  Percent,
  Activity,
} from 'lucide-react'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

// Types
interface CampaignMetrics {
  enviadas: number
  enviadasChange: number
  entregues: number
  entreguesChange: number
  lidas: number
  lidasChange: number
  respondidas: number
  respondidasChange: number
  falhas: number
  falhasChange: number
  taxaEntrega: number
  taxaLeitura: number
  taxaResposta: number
}

interface AIMetrics {
  totalInteracoes: number
  interacoesChange: number
  tokensUsados: number
  tokensChange: number
  custoTotal: number
  custoChange: number
  latenciaMedia: number
  latenciaChange: number
  taxaSucesso: number
  sucessoChange: number
  taxaResolucao: number
  resolucaoChange: number
}

interface Agent {
  id: string
  name: string
  provider: string
  model: string
  interactions: number
  successRate: number
  avgLatency: number
  cost: number
  isActive: boolean
}

// Date range options
const dateRanges = [
  { id: 'today', label: 'Hoje' },
  { id: 'yesterday', label: 'Ontem' },
  { id: '7d', label: '7 Dias' },
  { id: '30d', label: '30 Dias' },
  { id: '90d', label: '90 Dias' },
  { id: 'all', label: 'Todo período' },
]

// Format helpers
const formatNumber = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return new Intl.NumberFormat('pt-BR').format(value)
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value)
}

const formatPercent = (value: number) => `${value.toFixed(1)}%`

const formatLatency = (ms: number) => {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms.toFixed(0)}ms`
}

// Metric Card Component - Same style as Dashboard
const MetricCard = ({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  highlight = false,
  loading = false,
  suffix = '',
}: {
  title: string
  value: string
  change?: number
  icon: React.ElementType
  highlight?: boolean
  loading?: boolean
  suffix?: string
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`
      relative rounded-xl p-5 transition-all duration-300
      ${highlight 
        ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/20' 
        : 'bg-dark-800/60 border border-dark-700/50 hover:border-dark-600'
      }
    `}
  >
    {loading ? (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-6 h-6 animate-spin text-dark-400" />
      </div>
    ) : (
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${highlight ? 'bg-white/20' : 'bg-dark-700/50'}`}>
            <Icon className={`w-5 h-5 ${highlight ? 'text-white' : 'text-primary-400'}`} />
          </div>
          <div>
            <p className={`text-sm font-medium ${highlight ? 'text-white/80' : 'text-dark-400'}`}>{title}</p>
            <p className="text-2xl font-bold mt-0.5 text-white">{value}{suffix}</p>
          </div>
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
            highlight 
              ? change >= 0 ? 'bg-white/20 text-white' : 'bg-red-500/30 text-red-200'
              : change >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>
    )}
  </motion.div>
)

// Rate Card Component
const RateCard = ({
  title,
  value,
  color,
}: {
  title: string
  value: number
  color: string
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-4"
  >
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm text-dark-400">{title}</span>
      <span className="text-lg font-bold text-white">{formatPercent(value)}</span>
    </div>
    <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(value, 100)}%` }}
        transition={{ duration: 1, ease: 'easeOut' }}
        className={`h-full rounded-full ${color}`}
      />
    </div>
  </motion.div>
)

// Agent Card Component
const AgentCard = ({ agent }: { agent: Agent }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-5 hover:border-dark-600 transition-all"
  >
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-purple-500/20">
          <Bot className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h4 className="font-semibold text-white">{agent.name}</h4>
          <p className="text-xs text-dark-400">{agent.provider} • {agent.model}</p>
        </div>
      </div>
      <div className={`px-2 py-1 rounded-lg text-xs font-medium ${
        agent.isActive 
          ? 'bg-green-500/10 text-green-400' 
          : 'bg-dark-700 text-dark-400'
      }`}>
        {agent.isActive ? 'Ativo' : 'Inativo'}
      </div>
    </div>
    
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-dark-700/30 rounded-lg p-3">
        <p className="text-xs text-dark-400 mb-1">Interações</p>
        <p className="text-lg font-bold text-white">{formatNumber(agent.interactions)}</p>
      </div>
      <div className="bg-dark-700/30 rounded-lg p-3">
        <p className="text-xs text-dark-400 mb-1">Taxa Sucesso</p>
        <p className="text-lg font-bold text-green-400">{formatPercent(agent.successRate)}</p>
      </div>
      <div className="bg-dark-700/30 rounded-lg p-3">
        <p className="text-xs text-dark-400 mb-1">Latência</p>
        <p className="text-lg font-bold text-white">{formatLatency(agent.avgLatency)}</p>
      </div>
      <div className="bg-dark-700/30 rounded-lg p-3">
        <p className="text-xs text-dark-400 mb-1">Custo</p>
        <p className="text-lg font-bold text-yellow-400">{formatCurrency(agent.cost)}</p>
      </div>
    </div>
  </motion.div>
)

// Empty State Component
const EmptyState = ({ 
  title, 
  description, 
  icon: Icon = BarChart3 
}: {
  title: string
  description: string
  icon?: React.ElementType
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center py-16 px-8 bg-dark-800/40 rounded-2xl border border-dark-700/30 border-dashed"
  >
    <div className="w-16 h-16 rounded-2xl bg-dark-700/50 flex items-center justify-center mb-4">
      <Icon className="w-8 h-8 text-dark-400" />
    </div>
    <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
    <p className="text-dark-400 text-center max-w-md">{description}</p>
  </motion.div>
)

// Custom Tooltip for Charts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null
  return (
    <div className="bg-dark-900 border border-dark-700 rounded-lg p-3 shadow-xl">
      <p className="text-sm text-dark-400 mb-2">{label}</p>
      {payload.map((item: any, index: number) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-dark-300">{item.name}:</span>
          <span className="font-medium text-white">{formatNumber(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function WhatsAppAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'campaigns' | 'ai'>('campaigns')
  const [dateRange, setDateRange] = useState('7d')
  const [loading, setLoading] = useState(false)
  
  // Mock data - Replace with real API calls
  const [campaignMetrics, setCampaignMetrics] = useState<CampaignMetrics>({
    enviadas: 15420,
    enviadasChange: 12.5,
    entregues: 14850,
    entreguesChange: 10.2,
    lidas: 11200,
    lidasChange: 8.7,
    respondidas: 3450,
    respondidasChange: 15.3,
    falhas: 570,
    falhasChange: -5.2,
    taxaEntrega: 96.3,
    taxaLeitura: 75.4,
    taxaResposta: 22.4,
  })

  const [aiMetrics, setAIMetrics] = useState<AIMetrics>({
    totalInteracoes: 8540,
    interacoesChange: 18.2,
    tokensUsados: 2450000,
    tokensChange: 22.5,
    custoTotal: 245.80,
    custoChange: 15.3,
    latenciaMedia: 1250,
    latenciaChange: -8.5,
    taxaSucesso: 94.5,
    sucessoChange: 2.3,
    taxaResolucao: 78.2,
    resolucaoChange: 5.1,
  })

  const [agents, setAgents] = useState<Agent[]>([
    {
      id: '1',
      name: 'Atendente Principal',
      provider: 'OpenAI',
      model: 'gpt-4o-mini',
      interactions: 5420,
      successRate: 95.2,
      avgLatency: 1150,
      cost: 125.40,
      isActive: true,
    },
    {
      id: '2',
      name: 'Suporte Técnico',
      provider: 'Anthropic',
      model: 'claude-3-haiku',
      interactions: 2340,
      successRate: 93.8,
      avgLatency: 980,
      cost: 85.20,
      isActive: true,
    },
    {
      id: '3',
      name: 'Vendas',
      provider: 'OpenAI',
      model: 'gpt-4o',
      interactions: 780,
      successRate: 96.5,
      avgLatency: 1450,
      cost: 35.20,
      isActive: false,
    },
  ])

  // Chart data
  const campaignChartData = [
    { date: 'Seg', enviadas: 2100, entregues: 2020, lidas: 1520, respondidas: 420 },
    { date: 'Ter', enviadas: 2350, entregues: 2280, lidas: 1750, respondidas: 510 },
    { date: 'Qua', enviadas: 1980, entregues: 1900, lidas: 1420, respondidas: 380 },
    { date: 'Qui', enviadas: 2450, entregues: 2350, lidas: 1850, respondidas: 620 },
    { date: 'Sex', enviadas: 2680, entregues: 2580, lidas: 2100, respondidas: 720 },
    { date: 'Sáb', enviadas: 1850, entregues: 1780, lidas: 1320, respondidas: 410 },
    { date: 'Dom', enviadas: 2010, entregues: 1940, lidas: 1240, respondidas: 390 },
  ]

  const aiChartData = [
    { date: 'Seg', interacoes: 1150, tokens: 320000, custo: 32 },
    { date: 'Ter', interacoes: 1380, tokens: 390000, custo: 39 },
    { date: 'Qua', interacoes: 1020, tokens: 280000, custo: 28 },
    { date: 'Qui', interacoes: 1520, tokens: 420000, custo: 42 },
    { date: 'Sex', interacoes: 1680, tokens: 480000, custo: 48 },
    { date: 'Sáb', interacoes: 890, tokens: 250000, custo: 25 },
    { date: 'Dom', interacoes: 900, tokens: 260000, custo: 26 },
  ]

  const providerData = [
    { name: 'OpenAI', value: 65, color: '#10b981' },
    { name: 'Anthropic', value: 28, color: '#a855f7' },
    { name: 'Google', value: 7, color: '#3b82f6' },
  ]

  const handleRefresh = () => {
    setLoading(true)
    setTimeout(() => setLoading(false), 1000)
  }

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics WhatsApp</h1>
          <p className="text-dark-400 mt-1">Métricas e performance das suas campanhas e agentes</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Date Range Filter */}
          <div className="flex items-center gap-1 bg-dark-800/60 border border-dark-700/50 rounded-xl p-1">
            {dateRanges.slice(0, 5).map((range) => (
              <button
                key={range.id}
                onClick={() => setDateRange(range.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  dateRange === range.id
                    ? 'bg-primary-500 text-white'
                    : 'text-dark-400 hover:text-white hover:bg-dark-700/50'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2.5 bg-dark-800/60 border border-dark-700/50 rounded-xl text-dark-400 hover:text-white hover:border-dark-600 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button className="p-2.5 bg-dark-800/60 border border-dark-700/50 rounded-xl text-dark-400 hover:text-white hover:border-dark-600 transition-all">
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-8">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${
            activeTab === 'campaigns'
              ? 'bg-primary-500 text-white'
              : 'bg-dark-800/60 border border-dark-700/50 text-dark-400 hover:text-white hover:border-dark-600'
          }`}
        >
          <Send className="w-4 h-4" />
          Campanhas
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${
            activeTab === 'ai'
              ? 'bg-primary-500 text-white'
              : 'bg-dark-800/60 border border-dark-700/50 text-dark-400 hover:text-white hover:border-dark-600'
          }`}
        >
          <Bot className="w-4 h-4" />
          Agentes IA
        </button>
      </div>

      {/* Campaigns Tab */}
      {activeTab === 'campaigns' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricCard
              title="Enviadas"
              value={formatNumber(campaignMetrics.enviadas)}
              change={campaignMetrics.enviadasChange}
              icon={Send}
              highlight
              loading={loading}
            />
            <MetricCard
              title="Entregues"
              value={formatNumber(campaignMetrics.entregues)}
              change={campaignMetrics.entreguesChange}
              icon={CheckCheck}
              loading={loading}
            />
            <MetricCard
              title="Lidas"
              value={formatNumber(campaignMetrics.lidas)}
              change={campaignMetrics.lidasChange}
              icon={Eye}
              loading={loading}
            />
            <MetricCard
              title="Respondidas"
              value={formatNumber(campaignMetrics.respondidas)}
              change={campaignMetrics.respondidasChange}
              icon={MessageSquare}
              loading={loading}
            />
            <MetricCard
              title="Falhas"
              value={formatNumber(campaignMetrics.falhas)}
              change={campaignMetrics.falhasChange}
              icon={AlertTriangle}
              loading={loading}
            />
          </div>

          {/* Rates */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <RateCard title="Taxa de Entrega" value={campaignMetrics.taxaEntrega} color="bg-green-500" />
            <RateCard title="Taxa de Leitura" value={campaignMetrics.taxaLeitura} color="bg-blue-500" />
            <RateCard title="Taxa de Resposta" value={campaignMetrics.taxaResposta} color="bg-purple-500" />
          </div>

          {/* Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-6"
          >
            <h3 className="text-lg font-semibold text-white mb-6">Performance de Campanhas</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={campaignChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                  <YAxis stroke="#9ca3af" fontSize={12} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="enviadas" name="Enviadas" fill="#f97316" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="entregues" name="Entregues" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="lidas" name="Lidas" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                  <Line type="monotone" dataKey="respondidas" name="Respondidas" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* AI Tab */}
      {activeTab === 'ai' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <MetricCard
              title="Interações"
              value={formatNumber(aiMetrics.totalInteracoes)}
              change={aiMetrics.interacoesChange}
              icon={MessageSquare}
              highlight
              loading={loading}
            />
            <MetricCard
              title="Tokens Usados"
              value={formatNumber(aiMetrics.tokensUsados)}
              change={aiMetrics.tokensChange}
              icon={Zap}
              loading={loading}
            />
            <MetricCard
              title="Custo Total"
              value={formatCurrency(aiMetrics.custoTotal)}
              change={aiMetrics.custoChange}
              icon={DollarSign}
              loading={loading}
            />
            <MetricCard
              title="Latência Média"
              value={formatLatency(aiMetrics.latenciaMedia)}
              change={aiMetrics.latenciaChange}
              icon={Clock}
              loading={loading}
            />
            <MetricCard
              title="Taxa Sucesso"
              value={formatPercent(aiMetrics.taxaSucesso)}
              change={aiMetrics.sucessoChange}
              icon={Target}
              loading={loading}
            />
            <MetricCard
              title="Taxa Resolução"
              value={formatPercent(aiMetrics.taxaResolucao)}
              change={aiMetrics.resolucaoChange}
              icon={Activity}
              loading={loading}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Performance Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:col-span-2 bg-dark-800/60 border border-dark-700/50 rounded-xl p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-6">Performance IA</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={aiChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} />
                    <YAxis yAxisId="left" stroke="#9ca3af" fontSize={12} />
                    <YAxis yAxisId="right" orientation="right" stroke="#9ca3af" fontSize={12} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="interacoes" name="Interações" fill="#a855f7" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="custo" name="Custo (R$)" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Provider Breakdown */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-dark-800/60 border border-dark-700/50 rounded-xl p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-6">Por Provider</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={providerData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {providerData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-4">
                {providerData.map((provider) => (
                  <div key={provider.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: provider.color }} />
                      <span className="text-sm text-dark-300">{provider.name}</span>
                    </div>
                    <span className="text-sm font-medium text-white">{provider.value}%</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Agents Grid */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Agentes Configurados</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
