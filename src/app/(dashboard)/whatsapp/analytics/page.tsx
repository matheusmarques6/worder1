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
  Shield,
} from 'lucide-react'
import { QualityDashboard } from '@/components/whatsapp/quality'
import { useAuthStore } from '@/stores'
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
interface Campaign {
  id: string
  name: string
  status: 'completed' | 'active' | 'scheduled' | 'failed'
  sentAt: string
  enviadas: number
  entregues: number
  lidas: number
  respondidas: number
  falhas: number
  taxaEntrega: number
  taxaLeitura: number
  taxaResposta: number
}

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
        : 'bg-white border border-gray-200 hover:border-gray-300'
      }
    `}
  >
    {loading ? (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    ) : (
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${highlight ? 'bg-white/20' : 'bg-gray-100'}`}>
            <Icon className={`w-5 h-5 ${highlight ? 'text-white' : 'text-brand-600'}`} />
          </div>
          <div>
            <p className={`text-sm font-medium ${highlight ? 'text-white/80' : 'text-gray-500'}`}>{title}</p>
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
    className="bg-white border border-gray-200 rounded-xl p-4"
  >
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm text-gray-500">{title}</span>
      <span className="text-lg font-bold text-white">{formatPercent(value)}</span>
    </div>
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
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
    className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-all"
  >
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-purple-500/20">
          <Bot className="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <h4 className="font-semibold text-white">{agent.name}</h4>
          <p className="text-xs text-gray-500">{agent.provider} • {agent.model}</p>
        </div>
      </div>
      <div className={`px-2 py-1 rounded-lg text-xs font-medium ${
        agent.isActive 
          ? 'bg-green-500/10 text-green-400' 
          : 'bg-gray-100 text-gray-500'
      }`}>
        {agent.isActive ? 'Ativo' : 'Inativo'}
      </div>
    </div>
    
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-gray-100/30 rounded-lg p-3">
        <p className="text-xs text-gray-500 mb-1">Interações</p>
        <p className="text-lg font-bold text-white">{formatNumber(agent.interactions)}</p>
      </div>
      <div className="bg-gray-100/30 rounded-lg p-3">
        <p className="text-xs text-gray-500 mb-1">Taxa Sucesso</p>
        <p className="text-lg font-bold text-green-400">{formatPercent(agent.successRate)}</p>
      </div>
      <div className="bg-gray-100/30 rounded-lg p-3">
        <p className="text-xs text-gray-500 mb-1">Latência</p>
        <p className="text-lg font-bold text-white">{formatLatency(agent.avgLatency)}</p>
      </div>
      <div className="bg-gray-100/30 rounded-lg p-3">
        <p className="text-xs text-gray-500 mb-1">Custo</p>
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
    className="flex flex-col items-center justify-center py-16 px-8 bg-gray-50 rounded-2xl border border-gray-200/30 border-dashed"
  >
    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
      <Icon className="w-8 h-8 text-gray-500" />
    </div>
    <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
    <p className="text-gray-500 text-center max-w-md">{description}</p>
  </motion.div>
)

// Custom Tooltip for Charts
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-xl">
      <p className="text-sm text-gray-500 mb-2">{label}</p>
      {payload.map((item: any, index: number) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="text-gray-600">{item.name}:</span>
          <span className="font-medium text-white">{formatNumber(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function WhatsAppAnalyticsPage() {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id || ''
  const [activeTab, setActiveTab] = useState<'campaigns' | 'ai' | 'quality'>('campaigns')
  const [dateRange, setDateRange] = useState('7d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // State for real API data
  const [campaignMetrics, setCampaignMetrics] = useState<CampaignMetrics | null>(null)
  const [aiMetrics, setAIMetrics] = useState<AIMetrics | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignChartData, setCampaignChartData] = useState<any[]>([])
  const [aiChartData, setAiChartData] = useState<any[]>([])
  const [providerData, setProviderData] = useState<any[]>([])

  // Fetch campaign analytics
  const fetchCampaignAnalytics = async () => {
    if (!organizationId) return

    try {
      const res = await fetch(`/api/whatsapp/analytics?organization_id=${organizationId}&period=${dateRange}`)
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Erro ao buscar analytics')

      // Map API response to component state
      setCampaignMetrics({
        enviadas: data.summary?.total_sent || 0,
        enviadasChange: data.trends?.sent_change || 0,
        entregues: data.summary?.total_delivered || 0,
        entreguesChange: data.trends?.delivered_change || 0,
        lidas: data.summary?.total_read || 0,
        lidasChange: data.trends?.read_change || 0,
        respondidas: data.summary?.total_replied || 0,
        respondidasChange: data.trends?.replied_change || 0,
        falhas: data.summary?.total_failed || 0,
        falhasChange: 0,
        taxaEntrega: data.summary?.delivery_rate || 0,
        taxaLeitura: data.summary?.read_rate || 0,
        taxaResposta: data.summary?.reply_rate || 0,
      })

      // Map campaigns
      const mappedCampaigns = (data.campaigns || []).map((c: any) => ({
        id: c.id,
        name: c.title,
        status: c.status === 'completed' ? 'completed' : c.status === 'running' ? 'active' : c.status,
        sentAt: c.started_at || c.created_at,
        enviadas: c.sent || 0,
        entregues: c.delivered || 0,
        lidas: c.read || 0,
        respondidas: c.replied || 0,
        falhas: c.failed || 0,
        taxaEntrega: c.delivery_rate || 0,
        taxaLeitura: c.read_rate || 0,
        taxaResposta: c.reply_rate || 0,
      }))
      setCampaigns(mappedCampaigns)

      // Map chart data
      const chartData = (data.chart_data || []).map((d: any) => ({
        date: new Date(d.date).toLocaleDateString('pt-BR', { weekday: 'short' }),
        enviadas: d.sent || 0,
        entregues: d.delivered || 0,
        lidas: d.read || 0,
        respondidas: d.replied || 0,
      }))
      setCampaignChartData(chartData)

    } catch (err: any) {
      console.error('Error fetching campaign analytics:', err)
    }
  }

  // Fetch AI analytics
  const fetchAIAnalytics = async () => {
    if (!organizationId) return

    try {
      const res = await fetch(`/api/whatsapp/ai/analytics?organization_id=${organizationId}&period=${dateRange}`)
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Erro ao buscar analytics de IA')

      // Map AI metrics
      setAIMetrics({
        totalInteracoes: data.summary?.total_interactions || 0,
        interacoesChange: data.trends?.interactions_change || 0,
        tokensUsados: data.summary?.total_tokens || 0,
        tokensChange: data.trends?.tokens_change || 0,
        custoTotal: data.summary?.estimated_cost_usd || 0,
        custoChange: data.trends?.cost_change || 0,
        latenciaMedia: data.summary?.avg_response_time_ms || 0,
        latenciaChange: data.trends?.latency_change || 0,
        taxaSucesso: data.summary?.success_rate || 0,
        sucessoChange: data.trends?.success_rate_change || 0,
        taxaResolucao: data.summary?.resolution_rate || 0,
        resolucaoChange: data.trends?.resolution_rate_change || 0,
      })

      // Map agents
      const mappedAgents = (data.agents || []).map((a: any) => ({
        id: a.id,
        name: a.name || `Agente ${a.id.slice(0, 8)}`,
        provider: a.provider || 'OpenAI',
        model: a.model || 'gpt-4o-mini',
        interactions: a.total_interactions || 0,
        successRate: 0,
        avgLatency: 0,
        cost: a.total_cost_usd || 0,
        isActive: a.is_active,
      }))
      setAgents(mappedAgents)

      // Map chart data
      const chartData = (data.chart_data || []).map((d: any) => ({
        date: new Date(d.date).toLocaleDateString('pt-BR', { weekday: 'short' }),
        interacoes: d.interactions || 0,
        tokens: d.tokens || 0,
        custo: d.cost_usd || 0,
      }))
      setAiChartData(chartData)

      // Map provider data
      const providers = data.by_provider || {}
      const providerList = Object.entries(providers).map(([name, p]: [string, any]) => ({
        name,
        value: p.percent || 0,
        color: name === 'OpenAI' ? '#10b981' : name === 'Anthropic' ? '#a855f7' : '#3b82f6',
      }))
      setProviderData(providerList.length > 0 ? providerList : [])

    } catch (err: any) {
      console.error('Error fetching AI analytics:', err)
    }
  }

  // Initial data fetch
  useEffect(() => {
    const fetchData = async () => {
      if (!organizationId) {
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        await Promise.all([
          fetchCampaignAnalytics(),
          fetchAIAnalytics(),
        ])
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [organizationId, dateRange])

  const handleRefresh = async () => {
    setLoading(true)
    try {
      await Promise.all([
        fetchCampaignAnalytics(),
        fetchAIAnalytics(),
      ])
    } finally {
      setLoading(false)
    }
  }

  // Show empty state if no organization
  if (!organizationId) {
    return (
      <div className="min-h-screen p-6 lg:p-8">
        <EmptyState
          title="Organização não encontrada"
          description="Selecione uma organização para ver os analytics de WhatsApp."
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics WhatsApp</h1>
          <p className="text-gray-500 mt-1">Métricas e performance das suas campanhas e agentes</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Date Range Filter */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
            {dateRanges.slice(0, 5).map((range) => (
              <button
                key={range.id}
                onClick={() => setDateRange(range.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  dateRange === range.id
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-500 hover:text-white hover:bg-gray-100'
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
            className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-500 hover:text-white hover:border-gray-300 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-500 hover:text-white hover:border-gray-300 transition-all">
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
              : 'bg-white border border-gray-200 text-gray-500 hover:text-white hover:border-gray-300'
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
              : 'bg-white border border-gray-200 text-gray-500 hover:text-white hover:border-gray-300'
          }`}
        >
          <Bot className="w-4 h-4" />
          Agentes IA
        </button>
        <button
          onClick={() => setActiveTab('quality')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${
            activeTab === 'quality'
              ? 'bg-primary-500 text-white'
              : 'bg-white border border-gray-200 text-gray-500 hover:text-white hover:border-gray-300'
          }`}
        >
          <Shield className="w-4 h-4" />
          Qualidade
        </button>
      </div>

      {/* Campaigns Tab */}
      {activeTab === 'campaigns' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* Empty state if no data */}
          {!loading && !campaignMetrics && campaigns.length === 0 ? (
            <EmptyState
              title="Nenhuma campanha encontrada"
              description="Você ainda não enviou nenhuma campanha de WhatsApp. Crie sua primeira campanha para ver os analytics aqui."
              icon={Send}
            />
          ) : (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <MetricCard
                  title="Enviadas"
                  value={formatNumber(campaignMetrics?.enviadas || 0)}
                  change={campaignMetrics?.enviadasChange}
                  icon={Send}
                  highlight
                  loading={loading}
                />
                <MetricCard
                  title="Entregues"
                  value={formatNumber(campaignMetrics?.entregues || 0)}
                  change={campaignMetrics?.entreguesChange}
                  icon={CheckCheck}
                  loading={loading}
                />
                <MetricCard
                  title="Lidas"
                  value={formatNumber(campaignMetrics?.lidas || 0)}
                  change={campaignMetrics?.lidasChange}
                  icon={Eye}
                  loading={loading}
                />
                <MetricCard
                  title="Respondidas"
                  value={formatNumber(campaignMetrics?.respondidas || 0)}
                  change={campaignMetrics?.respondidasChange}
                  icon={MessageSquare}
                  loading={loading}
                />
                <MetricCard
                  title="Falhas"
                  value={formatNumber(campaignMetrics?.falhas || 0)}
                  change={campaignMetrics?.falhasChange}
                  icon={AlertTriangle}
                  loading={loading}
                />
              </div>

              {/* Rates */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <RateCard title="Taxa de Entrega" value={campaignMetrics?.taxaEntrega || 0} color="bg-green-500" />
                <RateCard title="Taxa de Leitura" value={campaignMetrics?.taxaLeitura || 0} color="bg-blue-500" />
                <RateCard title="Taxa de Resposta" value={campaignMetrics?.taxaResposta || 0} color="bg-purple-500" />
              </div>

          {/* Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-gray-200 rounded-xl p-6"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Performance de Campanhas</h3>
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

          {/* Campaigns Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden"
          >
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Ranking de Campanhas</h3>
                  <p className="text-sm text-gray-500 mt-1">Ordenado por taxa de resposta no período</p>
                </div>
                <div className="flex items-center gap-2">
                  <select className="bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500">
                    <option value="response">Taxa de Resposta</option>
                    <option value="read">Taxa de Leitura</option>
                    <option value="delivery">Taxa de Entrega</option>
                    <option value="sent">Total Enviadas</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">#</th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Campanha</th>
                    <th className="text-left py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Enviadas</th>
                    <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Entregues</th>
                    <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Lidas</th>
                    <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Respondidas</th>
                    <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tx. Entrega</th>
                    <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tx. Leitura</th>
                    <th className="text-right py-4 px-6 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tx. Resposta</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns
                    .sort((a, b) => b.taxaResposta - a.taxaResposta)
                    .map((campaign, index) => (
                    <tr 
                      key={campaign.id} 
                      className="border-b border-gray-200/30 hover:bg-gray-100/20 transition-colors"
                    >
                      <td className="py-4 px-6">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm ${
                          index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                          index === 1 ? 'bg-gray-400/20 text-gray-300' :
                          index === 2 ? 'bg-orange-700/20 text-orange-400' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {index + 1}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div>
                          <p className="font-medium text-white">{campaign.name}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(campaign.sentAt).toLocaleDateString('pt-BR', { 
                              day: '2-digit', 
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                          campaign.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                          campaign.status === 'active' ? 'bg-blue-500/10 text-blue-400' :
                          campaign.status === 'scheduled' ? 'bg-yellow-500/10 text-yellow-400' :
                          'bg-red-500/10 text-red-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            campaign.status === 'completed' ? 'bg-green-400' :
                            campaign.status === 'active' ? 'bg-blue-400' :
                            campaign.status === 'scheduled' ? 'bg-yellow-400' :
                            'bg-red-400'
                          }`} />
                          {campaign.status === 'completed' ? 'Concluída' :
                           campaign.status === 'active' ? 'Ativa' :
                           campaign.status === 'scheduled' ? 'Agendada' : 'Falha'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <span className="text-white font-medium">{formatNumber(campaign.enviadas)}</span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <span className="text-white">{formatNumber(campaign.entregues)}</span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <span className="text-white">{formatNumber(campaign.lidas)}</span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <span className="text-white">{formatNumber(campaign.respondidas)}</span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-green-500 rounded-full" 
                              style={{ width: `${campaign.taxaEntrega}%` }}
                            />
                          </div>
                          <span className="text-green-400 text-sm font-medium w-12 text-right">
                            {formatPercent(campaign.taxaEntrega)}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 rounded-full" 
                              style={{ width: `${campaign.taxaLeitura}%` }}
                            />
                          </div>
                          <span className="text-blue-400 text-sm font-medium w-12 text-right">
                            {formatPercent(campaign.taxaLeitura)}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-purple-500 rounded-full" 
                              style={{ width: `${campaign.taxaResposta * 3}%` }}
                            />
                          </div>
                          <span className="text-purple-400 text-sm font-medium w-12 text-right">
                            {formatPercent(campaign.taxaResposta)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Footer */}
            <div className="p-4 bg-gray-100/30 border-t border-gray-200">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  Mostrando {campaigns.length} campanhas no período selecionado
                </span>
                <button className="text-brand-600 hover:text-brand-500 font-medium transition-colors">
                  Ver todas as campanhas →
                </button>
              </div>
            </div>
          </motion.div>
            </>
          )}
        </motion.div>
      )}

      {/* AI Tab */}
      {activeTab === 'ai' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* Empty state if no data */}
          {!loading && !aiMetrics && agents.length === 0 ? (
            <EmptyState
              title="Nenhum agente de IA configurado"
              description="Configure um agente de IA para WhatsApp para ver métricas de interação, tokens e custos."
              icon={Bot}
            />
          ) : (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <MetricCard
                  title="Interações"
                  value={formatNumber(aiMetrics?.totalInteracoes || 0)}
                  change={aiMetrics?.interacoesChange}
                  icon={MessageSquare}
                  highlight
                  loading={loading}
                />
                <MetricCard
                  title="Tokens Usados"
                  value={formatNumber(aiMetrics?.tokensUsados || 0)}
                  change={aiMetrics?.tokensChange}
                  icon={Zap}
                  loading={loading}
                />
                <MetricCard
                  title="Custo Total"
                  value={formatCurrency(aiMetrics?.custoTotal || 0)}
                  change={aiMetrics?.custoChange}
                  icon={DollarSign}
                  loading={loading}
                />
                <MetricCard
                  title="Latência Média"
                  value={formatLatency(aiMetrics?.latenciaMedia || 0)}
                  change={aiMetrics?.latenciaChange}
                  icon={Clock}
                  loading={loading}
                />
                <MetricCard
                  title="Taxa Sucesso"
                  value={formatPercent(aiMetrics?.taxaSucesso || 0)}
                  change={aiMetrics?.sucessoChange}
                  icon={Target}
                  loading={loading}
                />
                <MetricCard
                  title="Taxa Resolução"
                  value={formatPercent(aiMetrics?.taxaResolucao || 0)}
                  change={aiMetrics?.resolucaoChange}
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
              className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Performance IA</h3>
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
              className="bg-white border border-gray-200 rounded-xl p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Por Provider</h3>
              {providerData.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-500">
                  Sem dados de providers
                </div>
              ) : (
                <>
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
                          <span className="text-sm text-gray-600">{provider.name}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{provider.value}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          </div>

          {/* Agents Grid */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Agentes Configurados</h3>
            {agents.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Nenhum agente configurado ainda
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            )}
          </div>
            </>
          )}
        </motion.div>
      )}

      {/* Quality Tab */}
      {activeTab === 'quality' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <QualityDashboard organizationId={organizationId} />
        </motion.div>
      )}
    </div>
  )
}
