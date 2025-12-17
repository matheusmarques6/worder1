'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DollarSign,
  Eye,
  MousePointer,
  Users,
  Target,
  TrendingUp,
  Filter,
  Download,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Play,
  Pause,
  Heart,
  MessageCircle,
  Share2,
  UserPlus,
  Clock,
  Percent,
  Video,
  AlertCircle,
  CheckCircle,
  Loader2,
  Link2,
  ExternalLink,
  Trash2,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import {
  useTikTokDashboard,
  useCampaignManagement,
  useTikTokConnection,
  useTikTokSync,
  TikTokCampaign,
} from '@/hooks/useTikTokAds'

// ==========================================
// COMPONENTS
// ==========================================

// TikTok Icon
const TikTokIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
  </svg>
)

// Loading Skeleton
const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse bg-dark-700/50 rounded ${className}`} />
)

// KPI Card Component
const KPICard = ({ 
  title, 
  value, 
  change, 
  trend, 
  icon: Icon, 
  color,
  loading 
}: { 
  title: string
  value: string
  change?: string
  trend?: 'up' | 'down'
  icon: any
  color: string
  loading?: boolean
}) => {
  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-dark-800/50 border border-dark-700/50">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="w-20 h-4" />
          <Skeleton className="w-8 h-8 rounded-lg" />
        </div>
        <Skeleton className="w-24 h-8 mb-2" />
        <Skeleton className="w-16 h-4" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl bg-dark-800/50 border border-dark-700/50 hover:border-dark-600/50 transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-dark-400 text-sm">{title}</span>
        <div className={`p-2 rounded-lg bg-gradient-to-br ${color} bg-opacity-20`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {change && (
        <div className="flex items-center gap-1 mt-2">
          {trend === 'up' ? (
            <ArrowUpRight className="w-4 h-4 text-green-400" />
          ) : (
            <ArrowDownRight className="w-4 h-4 text-red-400" />
          )}
          <span className={trend === 'up' ? 'text-green-400' : 'text-red-400'}>
            {change}
          </span>
        </div>
      )}
    </motion.div>
  )
}

// Status Badge Component
const StatusBadge = ({ status }: { status: TikTokCampaign['status'] }) => {
  const configs = {
    active: { icon: Play, text: 'Ativa', bg: 'bg-green-500/20', color: 'text-green-400' },
    paused: { icon: Pause, text: 'Pausada', bg: 'bg-yellow-500/20', color: 'text-yellow-400' },
    deleted: { icon: Trash2, text: 'Deletada', bg: 'bg-red-500/20', color: 'text-red-400' },
    pending: { icon: Clock, text: 'Pendente', bg: 'bg-blue-500/20', color: 'text-blue-400' },
    unknown: { icon: AlertCircle, text: 'Desconhecido', bg: 'bg-gray-500/20', color: 'text-gray-400' },
  }
  
  const config = configs[status] || configs.unknown
  const Icon = config.icon
  
  return (
    <span className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${config.bg} ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.text}
    </span>
  )
}

// Empty State Component
const EmptyState = ({ 
  icon: Icon, 
  title, 
  description, 
  action 
}: { 
  icon: any
  title: string
  description: string
  action?: React.ReactNode
}) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="p-4 rounded-full bg-dark-700/50 mb-4">
      <Icon className="w-8 h-8 text-dark-400" />
    </div>
    <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
    <p className="text-dark-400 max-w-md mb-6">{description}</p>
    {action}
  </div>
)

// Error Alert Component
const ErrorAlert = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
    <p className="text-red-400 flex-1">{message}</p>
    {onRetry && (
      <button 
        onClick={onRetry}
        className="px-3 py-1 text-sm bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
      >
        Tentar novamente
      </button>
    )}
  </div>
)

// Connect TikTok Component
const ConnectTikTok = ({ onConnect, loading, error }: { onConnect: () => void; loading: boolean; error?: string | null }) => {
  const isNotConfigured = error?.toLowerCase().includes('not configured')
  
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="p-6 rounded-2xl bg-gradient-to-br from-pink-500/10 to-cyan-500/10 border border-dark-700/50 mb-6"
      >
        <TikTokIcon className="w-16 h-16 text-white" />
      </motion.div>
      <h2 className="text-2xl font-bold text-white mb-3">Conecte sua conta TikTok Ads</h2>
      <p className="text-dark-400 max-w-md mb-8">
        Conecte sua conta do TikTok Business Center para visualizar métricas de campanhas, 
        engajamento e performance de vídeos em tempo real.
      </p>
      
      {isNotConfigured ? (
        <div className="max-w-lg mb-6 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
          <div className="flex items-start gap-3 text-left">
            <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-yellow-400 font-medium mb-2">Configuração Necessária</p>
              <p className="text-yellow-400/80 text-sm mb-3">
                Para usar a integração com TikTok Ads, configure as seguintes variáveis de ambiente no Vercel:
              </p>
              <div className="bg-dark-900/50 rounded-lg p-3 font-mono text-xs text-yellow-300">
                <div>TIKTOK_APP_ID=seu_app_id</div>
                <div>TIKTOK_APP_SECRET=seu_app_secret</div>
              </div>
              <a 
                href="https://business-api.tiktok.com/portal" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-sm text-cyan-400 hover:text-cyan-300"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Criar App no TikTok for Business
              </a>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={onConnect}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-cyan-500 
                     text-white font-semibold rounded-xl hover:opacity-90 transition-all disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Link2 className="w-5 h-5" />
          )}
          {loading ? 'Conectando...' : 'Conectar TikTok Ads'}
        </button>
      )}
    </div>
  )
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return value.toLocaleString('pt-BR')
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}

function formatTime(seconds: number): string {
  return `${seconds.toFixed(1)}s`
}

// ==========================================
// MAIN PAGE COMPONENT
// ==========================================

export default function TikTokAdsPage() {
  const [dateRange, setDateRange] = useState('7d')
  const [selectedTab, setSelectedTab] = useState<'campaigns' | 'creatives' | 'audience'>('campaigns')
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null)
  
  // Get organization from auth store
  const { user } = useAuthStore()
  const organizationId = user?.organization_id || null

  // Hooks
  const {
    loading,
    error,
    kpis,
    engagement,
    videoFunnel,
    campaigns,
    isConnected,
    needsReauth,
    account,
    refetch,
  } = useTikTokDashboard(organizationId, dateRange)

  const {
    loading: campaignLoading,
    error: campaignError,
    updateCampaignStatus,
    clearError: clearCampaignError,
  } = useCampaignManagement(organizationId)

  const {
    connecting,
    error: connectionError,
    connect,
  } = useTikTokConnection(organizationId)

  const {
    syncing,
    lastSyncAt,
    sync,
  } = useTikTokSync(organizationId)

  // Close action menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActionMenuOpen(null)
    if (actionMenuOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [actionMenuOpen])

  // Handle campaign status toggle
  const handleToggleCampaignStatus = async (campaign: TikTokCampaign) => {
    const newStatus = campaign.status === 'active' ? 'DISABLE' : 'ENABLE'
    const success = await updateCampaignStatus([campaign.campaign_id], newStatus)
    if (success) {
      refetch()
    }
    setActionMenuOpen(null)
  }

  // Handle sync
  const handleSync = async () => {
    const success = await sync()
    if (success) {
      refetch()
    }
  }

  // Build KPI cards data
  const kpiCards = kpis ? [
    { title: 'Gasto Total', value: formatCurrency(kpis.spend), icon: DollarSign, color: 'from-pink-500 to-rose-500' },
    { title: 'Impressões', value: formatNumber(kpis.impressions), icon: Eye, color: 'from-cyan-500 to-blue-500' },
    { title: 'Alcance', value: formatNumber(kpis.reach), icon: Users, color: 'from-purple-500 to-violet-500' },
    { title: 'Cliques', value: formatNumber(kpis.clicks), icon: MousePointer, color: 'from-green-500 to-emerald-500' },
    { title: 'CTR', value: formatPercent(kpis.ctr), icon: Target, color: 'from-yellow-500 to-orange-500' },
    { title: 'CPC', value: formatCurrency(kpis.cpc), icon: DollarSign, color: 'from-emerald-500 to-green-600' },
    { title: 'CPM', value: formatCurrency(kpis.cpm), icon: DollarSign, color: 'from-blue-500 to-cyan-500' },
    { title: 'Video Views', value: formatNumber(kpis.videoViews), icon: Video, color: 'from-rose-500 to-pink-600' },
    { title: 'Avg Watch Time', value: formatTime(kpis.avgWatchTime), icon: Clock, color: 'from-orange-500 to-amber-500' },
    { title: 'Conversões', value: formatNumber(kpis.conversions), icon: Target, color: 'from-violet-500 to-purple-600' },
    { title: 'CVR', value: formatPercent(kpis.cvr), icon: Percent, color: 'from-indigo-500 to-blue-600' },
    { title: 'ROAS', value: `${kpis.roas.toFixed(1)}x`, icon: TrendingUp, color: 'from-primary-500 to-accent-500' },
  ] : []

  // Build engagement cards data
  const engagementCards = engagement ? [
    { metric: 'Likes', value: formatNumber(engagement.likes), icon: Heart, color: 'from-red-500 to-rose-500' },
    { metric: 'Comentários', value: formatNumber(engagement.comments), icon: MessageCircle, color: 'from-blue-500 to-cyan-500' },
    { metric: 'Compartilhamentos', value: formatNumber(engagement.shares), icon: Share2, color: 'from-green-500 to-emerald-500' },
    { metric: 'Visitas ao Perfil', value: formatNumber(engagement.profileVisits), icon: Users, color: 'from-purple-500 to-violet-500' },
    { metric: 'Novos Seguidores', value: formatNumber(engagement.follows), icon: UserPlus, color: 'from-pink-500 to-rose-500' },
  ] : []

  // ==========================================
  // RENDER
  // ==========================================

  // Show connect screen if not connected
  if (!loading && !isConnected) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-pink-500/20 to-cyan-500/20">
            <TikTokIcon />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">TikTok Ads</h1>
            <p className="text-dark-400 mt-1">Performance e métricas de engajamento</p>
          </div>
        </div>
        
        {connectionError && !connectionError.toLowerCase().includes('not configured') && (
          <ErrorAlert message={connectionError} />
        )}
        
        <ConnectTikTok onConnect={connect} loading={connecting} error={connectionError} />
      </div>
    )
  }

  // Show reauth warning if needed
  const showReauthWarning = isConnected && needsReauth

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-pink-500/20 to-cyan-500/20">
            <TikTokIcon />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">TikTok Ads</h1>
            <p className="text-dark-400 mt-1">
              {account?.advertiser_name || 'Performance e métricas de engajamento'}
            </p>
          </div>
          {isConnected && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-500/20 text-green-400">
              <CheckCircle className="w-3 h-3" />
              Conectado
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Date Range Selector */}
          <div className="flex items-center bg-dark-800/50 rounded-xl p-1">
            {[
              { label: 'Hoje', value: 'today' },
              { label: 'Ontem', value: 'yesterday' },
              { label: '7 Dias', value: '7d' },
              { label: '30 Dias', value: '30d' },
              { label: 'Este Mês', value: 'month' },
            ].map((range) => (
              <button
                key={range.value}
                onClick={() => setDateRange(range.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  dateRange === range.value
                    ? 'bg-gradient-to-r from-pink-500 to-cyan-500 text-white'
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <button 
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-dark-700/50 hover:bg-dark-700 
                       rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span className="text-sm">{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>

          <button className="flex items-center gap-2 px-4 py-2 bg-dark-700/50 hover:bg-dark-700 rounded-xl transition-colors">
            <Download className="w-4 h-4" />
            <span className="text-sm">Exportar</span>
          </button>
        </div>
      </div>

      {/* Reauth Warning */}
      {showReauthWarning && (
        <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <p className="text-yellow-400 flex-1">
            Sua conexão com o TikTok expirou. Reconecte para continuar visualizando dados atualizados.
          </p>
          <button 
            onClick={connect}
            disabled={connecting}
            className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition-colors"
          >
            {connecting ? 'Reconectando...' : 'Reconectar'}
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <ErrorAlert message={error} onRetry={refetch} />
      )}

      {campaignError && (
        <ErrorAlert message={campaignError} onRetry={clearCampaignError} />
      )}

      {/* KPIs Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {loading ? (
          Array(12).fill(0).map((_, i) => (
            <KPICard
              key={i}
              title=""
              value=""
              icon={DollarSign}
              color=""
              loading={true}
            />
          ))
        ) : (
          kpiCards.map((kpi, idx) => (
            <KPICard
              key={idx}
              title={kpi.title}
              value={kpi.value}
              icon={kpi.icon}
              color={kpi.color}
            />
          ))
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Engagement Metrics */}
        <div className="lg:col-span-1 p-6 rounded-2xl bg-dark-800/50 border border-dark-700/50">
          <h3 className="text-lg font-semibold text-white mb-4">Engajamento</h3>
          
          {loading ? (
            <div className="space-y-4">
              {Array(5).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : engagementCards.length > 0 ? (
            <div className="space-y-3">
              {engagementCards.map((item, idx) => {
                const Icon = item.icon
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-center gap-4 p-3 rounded-xl bg-dark-700/30 hover:bg-dark-700/50 transition-colors"
                  >
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${item.color}`}>
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-dark-400">{item.metric}</p>
                      <p className="text-lg font-semibold text-white">{item.value}</p>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          ) : (
            <p className="text-dark-400 text-sm">Nenhum dado de engajamento disponível</p>
          )}
        </div>

        {/* Video Funnel */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-dark-800/50 border border-dark-700/50">
          <h3 className="text-lg font-semibold text-white mb-4">Funil de Vídeo</h3>
          
          {loading ? (
            <div className="space-y-3">
              {Array(7).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : videoFunnel.length > 0 ? (
            <div className="space-y-3">
              {videoFunnel.map((stage, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="relative"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-dark-300">{stage.stage}</span>
                    <span className="text-sm font-medium text-white">
                      {formatNumber(stage.value)} ({stage.percent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-8 bg-dark-700/50 rounded-lg overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${stage.percent}%` }}
                      transition={{ duration: 0.5, delay: idx * 0.05 }}
                      className="h-full bg-gradient-to-r from-pink-500 to-cyan-500 rounded-lg"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-dark-400 text-sm">Nenhum dado de funil disponível</p>
          )}
        </div>
      </div>

      {/* Campaigns/Creatives/Audience Tabs */}
      <div className="p-6 rounded-2xl bg-dark-800/50 border border-dark-700/50">
        {/* Tab Headers */}
        <div className="flex items-center gap-4 mb-6 border-b border-dark-700/50 pb-4">
          {[
            { id: 'campaigns', label: 'Campanhas' },
            { id: 'creatives', label: 'Criativos' },
            { id: 'audience', label: 'Audiência' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id as typeof selectedTab)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                selectedTab === tab.id
                  ? 'bg-gradient-to-r from-pink-500/20 to-cyan-500/20 text-white'
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {selectedTab === 'campaigns' && (
            <motion.div
              key="campaigns"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              {loading ? (
                <div className="space-y-4">
                  {Array(4).fill(0).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-xl" />
                  ))}
                </div>
              ) : campaigns.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-dark-400 border-b border-dark-700/50">
                        <th className="pb-4 text-left font-medium">Campanha</th>
                        <th className="pb-4 font-medium">Status</th>
                        <th className="pb-4 font-medium">Objetivo</th>
                        <th className="pb-4 font-medium text-right">Orçamento</th>
                        <th className="pb-4 font-medium text-right">Gasto</th>
                        <th className="pb-4 font-medium text-right">Impr.</th>
                        <th className="pb-4 font-medium text-right">Cliques</th>
                        <th className="pb-4 font-medium text-right">Conv.</th>
                        <th className="pb-4 font-medium text-right">ROAS</th>
                        <th className="pb-4 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((campaign) => (
                        <tr 
                          key={campaign.id} 
                          className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors"
                        >
                          <td className="py-4">
                            <p className="font-medium text-white">{campaign.name}</p>
                            <p className="text-xs text-dark-500 mt-1">ID: {campaign.campaign_id}</p>
                          </td>
                          <td className="py-4">
                            <StatusBadge status={campaign.status} />
                          </td>
                          <td className="py-4">
                            <span className="text-dark-300 text-sm">{campaign.objective_label}</span>
                          </td>
                          <td className="py-4 text-right text-dark-300">
                            {formatCurrency(campaign.budget)}
                            <span className="text-xs text-dark-500 block">{campaign.budget_mode}</span>
                          </td>
                          <td className="py-4 text-right text-dark-300">
                            {campaign.spend !== undefined ? formatCurrency(campaign.spend) : '-'}
                          </td>
                          <td className="py-4 text-right text-dark-300">
                            {campaign.impressions !== undefined ? formatNumber(campaign.impressions) : '-'}
                          </td>
                          <td className="py-4 text-right text-dark-300">
                            {campaign.clicks !== undefined ? formatNumber(campaign.clicks) : '-'}
                          </td>
                          <td className="py-4 text-right text-dark-300">
                            {campaign.conversions !== undefined ? campaign.conversions : '-'}
                          </td>
                          <td className="py-4 text-right">
                            {campaign.roas !== undefined ? (
                              <span className="text-green-400 font-medium">{campaign.roas.toFixed(1)}x</span>
                            ) : '-'}
                          </td>
                          <td className="py-4 text-right relative">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation()
                                setActionMenuOpen(actionMenuOpen === campaign.id ? null : campaign.id)
                              }}
                              className="p-2 hover:bg-dark-700/50 rounded-lg transition-colors"
                            >
                              <MoreHorizontal className="w-4 h-4 text-dark-400" />
                            </button>
                            
                            {/* Action Menu */}
                            {actionMenuOpen === campaign.id && (
                              <div 
                                className="absolute right-0 top-full mt-1 w-48 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-10"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => handleToggleCampaignStatus(campaign)}
                                  disabled={campaignLoading}
                                  className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm hover:bg-dark-700/50 transition-colors"
                                >
                                  {campaign.status === 'active' ? (
                                    <>
                                      <Pause className="w-4 h-4" />
                                      Pausar Campanha
                                    </>
                                  ) : (
                                    <>
                                      <Play className="w-4 h-4" />
                                      Ativar Campanha
                                    </>
                                  )}
                                </button>
                                <a
                                  href={`https://ads.tiktok.com/i18n/perf?aadvid=${account?.advertiser_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm hover:bg-dark-700/50 transition-colors border-t border-dark-700/50"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                  Ver no TikTok Ads
                                </a>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={Target}
                  title="Nenhuma campanha encontrada"
                  description="Você ainda não possui campanhas no TikTok Ads. Crie sua primeira campanha para começar a ver métricas aqui."
                  action={
                    <a
                      href={`https://ads.tiktok.com/i18n/perf?aadvid=${account?.advertiser_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-500 to-cyan-500 text-white rounded-xl"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Criar no TikTok Ads
                    </a>
                  }
                />
              )}
            </motion.div>
          )}

          {selectedTab === 'creatives' && (
            <motion.div
              key="creatives"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <EmptyState
                icon={Video}
                title="Criativos em breve"
                description="A análise de criativos estará disponível em uma próxima atualização."
              />
            </motion.div>
          )}

          {selectedTab === 'audience' && (
            <motion.div
              key="audience"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <EmptyState
                icon={Users}
                title="Audiência em breve"
                description="Os insights de audiência estarão disponíveis em uma próxima atualização."
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Last Sync Info */}
      {lastSyncAt && (
        <p className="text-center text-xs text-dark-500">
          Última sincronização: {new Date(lastSyncAt).toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  )
}
