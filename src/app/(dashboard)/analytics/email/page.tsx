'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Mail,
  MousePointer,
  Eye,
  TrendingUp,
  TrendingDown,
  Users,
  UserPlus,
  UserMinus,
  DollarSign,
  Target,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  AlertCircle,
  Loader2,
  Link as LinkIcon,
} from 'lucide-react'

// Types
interface KPI {
  value: string | number
  change: number
}

interface Campaign {
  id: string
  name: string
  status: string
  type: string
  sent: number
  delivered: number
  opened: number
  clicked: number
  converted: number
  revenue: number
  openRate: string
  clickRate: string
  sentAt: string
}

interface Flow {
  id: string
  name: string
  status: string
  triggered: number
  opened: number
  clicked: number
  revenue: number
  openRate: string
  clickRate: string
}

interface EmailList {
  id: string
  name: string
  profileCount: number
}

interface EmailData {
  connected: boolean
  account?: {
    id: string
    name: string
    lastSync: string
  }
  kpis?: {
    openRate: KPI
    clickRate: KPI
    conversionRate: KPI
    revenue: KPI
    roi: KPI
    subscribers: KPI
    bounceRate: KPI
    unsubscribeRate: KPI
  }
  totals?: {
    sent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    unsubscribed: number
    revenue: number
    conversions: number
  }
  funnel?: Array<{
    stage: string
    value: number
    percent: number
  }>
  campaigns?: Campaign[]
  flows?: Flow[]
  lists?: EmailList[]
}

// Date range options
const dateRanges = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 Dias' },
  { id: '30d', label: '30 Dias' },
  { id: '90d', label: '90 Dias' },
]

// Format helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value)
}

const formatNumber = (value: number) => {
  return new Intl.NumberFormat('pt-BR').format(value)
}

// Empty State Component
const EmptyState = ({ 
  title, 
  description, 
  actionLabel, 
  onAction,
}: {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col items-center justify-center py-16 px-8 bg-dark-800/40 rounded-2xl border border-dark-700/30 border-dashed"
  >
    <div className="w-16 h-16 rounded-2xl bg-dark-700/50 flex items-center justify-center mb-4">
      <Mail className="w-8 h-8 text-dark-400" />
    </div>
    <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
    <p className="text-dark-400 text-center max-w-md mb-6">{description}</p>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
      >
        <LinkIcon className="w-4 h-4" />
        {actionLabel}
      </button>
    )}
  </motion.div>
)

// KPI Card Component
const KPICard = ({
  title,
  value,
  change,
  icon: Icon,
  color,
  loading = false,
}: {
  title: string
  value: string
  change?: number
  icon: React.ElementType
  color: string
  loading?: boolean
}) => {
  const isPositive = (change || 0) >= 0
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-dark-800/50 rounded-xl p-4 border border-dark-700/50"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg bg-gradient-to-br ${color}`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-white mb-1">
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : value}
      </div>
      <div className="text-xs text-dark-400">{title}</div>
    </motion.div>
  )
}

// Campaign Row Component
const CampaignRow = ({ campaign }: { campaign: Campaign }) => {
  const statusColors: Record<string, string> = {
    sent: 'bg-green-500/20 text-green-400',
    scheduled: 'bg-blue-500/20 text-blue-400',
    draft: 'bg-dark-600 text-dark-400',
    cancelled: 'bg-red-500/20 text-red-400',
  }

  return (
    <tr className="border-b border-dark-700/50 hover:bg-dark-700/20 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-dark-700/50 rounded-lg">
            <Send className="w-4 h-4 text-primary-400" />
          </div>
          <div>
            <div className="font-medium text-white text-sm">{campaign.name}</div>
            <div className="text-xs text-dark-400">
              {campaign.sentAt ? new Date(campaign.sentAt).toLocaleDateString('pt-BR') : '-'}
            </div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <span className={`px-2 py-1 rounded-full text-xs ${statusColors[campaign.status] || 'bg-dark-600 text-dark-400'}`}>
          {campaign.status === 'sent' ? 'Enviado' : campaign.status}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-dark-300">{formatNumber(campaign.sent)}</td>
      <td className="py-3 px-4 text-sm text-dark-300">{formatNumber(campaign.opened)}</td>
      <td className="py-3 px-4 text-sm text-dark-300">{formatNumber(campaign.clicked)}</td>
      <td className="py-3 px-4">
        <span className="text-sm text-green-400">{campaign.openRate}%</span>
      </td>
      <td className="py-3 px-4">
        <span className="text-sm text-blue-400">{campaign.clickRate}%</span>
      </td>
      <td className="py-3 px-4 text-sm text-primary-400 font-medium">
        {formatCurrency(campaign.revenue)}
      </td>
    </tr>
  )
}

// Flow Row Component  
const FlowRow = ({ flow }: { flow: Flow }) => {
  return (
    <tr className="border-b border-dark-700/50 hover:bg-dark-700/20 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Zap className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <div className="font-medium text-white text-sm">{flow.name}</div>
            <div className="text-xs text-dark-400">Automação</div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4">
        <span className={`px-2 py-1 rounded-full text-xs ${
          flow.status === 'live' ? 'bg-green-500/20 text-green-400' : 'bg-dark-600 text-dark-400'
        }`}>
          {flow.status === 'live' ? 'Ativo' : flow.status}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-dark-300">{formatNumber(flow.triggered)}</td>
      <td className="py-3 px-4 text-sm text-dark-300">{formatNumber(flow.opened)}</td>
      <td className="py-3 px-4 text-sm text-dark-300">{formatNumber(flow.clicked)}</td>
      <td className="py-3 px-4">
        <span className="text-sm text-green-400">{flow.openRate}%</span>
      </td>
      <td className="py-3 px-4">
        <span className="text-sm text-blue-400">{flow.clickRate}%</span>
      </td>
      <td className="py-3 px-4 text-sm text-primary-400 font-medium">
        {formatCurrency(flow.revenue)}
      </td>
    </tr>
  )
}

export default function EmailAnalyticsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('30d')
  const [activeTab, setActiveTab] = useState<'campaigns' | 'flows'>('campaigns')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [data, setData] = useState<EmailData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch data from API
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`/api/analytics/email?period=${selectedPeriod}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch data')
      }

      setData(result)
    } catch (err: any) {
      console.error('Email analytics error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [selectedPeriod])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    // Trigger Klaviyo sync first
    try {
      await fetch('/api/klaviyo?action=sync')
    } catch {}
    await fetchData()
  }

  // Not connected state
  if (!isLoading && data && !data.connected) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2">Analytics de Email</h1>
          <p className="text-dark-400">Métricas detalhadas das suas campanhas de email marketing</p>
        </div>
        
        <EmptyState
          title="Klaviyo não conectado"
          description="Conecte sua conta do Klaviyo para ver as métricas de email marketing em tempo real."
          actionLabel="Conectar Klaviyo"
          onAction={() => window.location.href = '/settings?tab=integrations'}
        />
      </div>
    )
  }

  // Loading state
  if (isLoading && !data) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      </div>
    )
  }

  const kpis = data?.kpis
  const funnel = data?.funnel || []
  const campaigns = data?.campaigns || []
  const flows = data?.flows || []

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Analytics de Email</h1>
          <p className="text-dark-400 text-sm">
            {data?.account?.name} • Última atualização: {
              data?.account?.lastSync 
                ? new Date(data.account.lastSync).toLocaleString('pt-BR')
                : '-'
            }
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex items-center gap-1 bg-dark-800/50 p-1 rounded-xl">
            {dateRanges.map((range) => (
              <button
                key={range.id}
                onClick={() => setSelectedPeriod(range.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  selectedPeriod === range.id
                    ? 'bg-dark-700 text-white'
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 bg-dark-800/50 hover:bg-dark-700/50 border border-dark-700/50 rounded-xl text-dark-300 hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Taxa de Abertura"
          value={`${kpis?.openRate?.value || 0}%`}
          change={kpis?.openRate?.change}
          icon={Eye}
          color="from-blue-500 to-blue-600"
          loading={isLoading}
        />
        <KPICard
          title="Taxa de Clique"
          value={`${kpis?.clickRate?.value || 0}%`}
          change={kpis?.clickRate?.change}
          icon={MousePointer}
          color="from-green-500 to-green-600"
          loading={isLoading}
        />
        <KPICard
          title="Taxa de Conversão"
          value={`${kpis?.conversionRate?.value || 0}%`}
          change={kpis?.conversionRate?.change}
          icon={Target}
          color="from-purple-500 to-purple-600"
          loading={isLoading}
        />
        <KPICard
          title="Receita Gerada"
          value={formatCurrency(Number(kpis?.revenue?.value) || 0)}
          change={kpis?.revenue?.change}
          icon={DollarSign}
          color="from-primary-500 to-accent-500"
          loading={isLoading}
        />
      </div>

      {/* Second row of KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="ROI de Email"
          value={`${kpis?.roi?.value || 0}x`}
          icon={TrendingUp}
          color="from-yellow-500 to-orange-500"
          loading={isLoading}
        />
        <KPICard
          title="Lista Ativa"
          value={formatNumber(Number(kpis?.subscribers?.value) || 0)}
          icon={Users}
          color="from-cyan-500 to-blue-500"
          loading={isLoading}
        />
        <KPICard
          title="Taxa de Bounce"
          value={`${kpis?.bounceRate?.value || 0}%`}
          icon={XCircle}
          color="from-red-500 to-rose-600"
          loading={isLoading}
        />
        <KPICard
          title="Unsubscribes"
          value={`${kpis?.unsubscribeRate?.value || 0}%`}
          icon={UserMinus}
          color="from-gray-500 to-gray-600"
          loading={isLoading}
        />
      </div>

      {/* Funnel */}
      {funnel.length > 0 && (
        <div className="bg-dark-800/50 rounded-xl p-6 border border-dark-700/50">
          <h2 className="text-lg font-semibold text-white mb-4">Funil de Email</h2>
          <div className="space-y-3">
            {funnel.map((stage, index) => (
              <div key={stage.stage} className="flex items-center gap-4">
                <div className="w-24 text-sm text-dark-400">{stage.stage}</div>
                <div className="flex-1 h-8 bg-dark-700/50 rounded-lg overflow-hidden">
                  <div
                    className={`h-full rounded-lg transition-all ${
                      index === 0 ? 'bg-blue-500' :
                      index === 1 ? 'bg-cyan-500' :
                      index === 2 ? 'bg-green-500' :
                      index === 3 ? 'bg-yellow-500' :
                      'bg-primary-500'
                    }`}
                    style={{ width: `${stage.percent}%` }}
                  />
                </div>
                <div className="w-20 text-right">
                  <span className="text-sm font-medium text-white">{formatNumber(stage.value)}</span>
                  <span className="text-xs text-dark-400 ml-1">({stage.percent.toFixed(1)}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campaigns & Flows Table */}
      <div className="bg-dark-800/50 rounded-xl border border-dark-700/50 overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center gap-4 p-4 border-b border-dark-700/50">
          <button
            onClick={() => setActiveTab('campaigns')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'campaigns'
                ? 'bg-primary-500/20 text-primary-400'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            Campanhas ({campaigns.length})
          </button>
          <button
            onClick={() => setActiveTab('flows')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'flows'
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            Automações ({flows.length})
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700/50 text-left">
                <th className="py-3 px-4 text-xs font-medium text-dark-400 uppercase">
                  {activeTab === 'campaigns' ? 'Campanha' : 'Automação'}
                </th>
                <th className="py-3 px-4 text-xs font-medium text-dark-400 uppercase">Status</th>
                <th className="py-3 px-4 text-xs font-medium text-dark-400 uppercase">
                  {activeTab === 'campaigns' ? 'Enviados' : 'Disparados'}
                </th>
                <th className="py-3 px-4 text-xs font-medium text-dark-400 uppercase">Abertos</th>
                <th className="py-3 px-4 text-xs font-medium text-dark-400 uppercase">Clicados</th>
                <th className="py-3 px-4 text-xs font-medium text-dark-400 uppercase">Taxa Abertura</th>
                <th className="py-3 px-4 text-xs font-medium text-dark-400 uppercase">Taxa Clique</th>
                <th className="py-3 px-4 text-xs font-medium text-dark-400 uppercase">Receita</th>
              </tr>
            </thead>
            <tbody>
              {activeTab === 'campaigns' ? (
                campaigns.length > 0 ? (
                  campaigns.map((campaign) => (
                    <CampaignRow key={campaign.id} campaign={campaign} />
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-dark-400">
                      Nenhuma campanha encontrada no período selecionado
                    </td>
                  </tr>
                )
              ) : (
                flows.length > 0 ? (
                  flows.map((flow) => (
                    <FlowRow key={flow.id} flow={flow} />
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-dark-400">
                      Nenhuma automação ativa encontrada
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lists */}
      {data?.lists && data.lists.length > 0 && (
        <div className="bg-dark-800/50 rounded-xl p-6 border border-dark-700/50">
          <h2 className="text-lg font-semibold text-white mb-4">Listas</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.lists.map((list) => (
              <div key={list.id} className="bg-dark-700/30 rounded-lg p-4">
                <div className="text-sm font-medium text-white mb-1">{list.name}</div>
                <div className="text-2xl font-bold text-primary-400">{formatNumber(list.profileCount)}</div>
                <div className="text-xs text-dark-400">contatos</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
