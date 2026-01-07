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
  ShoppingCart,
  Clock,
  Percent,
  AlertCircle,
  CheckCircle,
  Loader2,
  Link2,
  ExternalLink,
  Trash2,
  Plus,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react'
import { useStoreStore } from '@/stores'
import { useFacebookAds } from '@/hooks/useFacebookAds'
import { formatDateRange } from '@/types/facebook'

// ==========================================
// COMPONENTS
// ==========================================

// Meta/Facebook Icon
const MetaIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)

// Loading Skeleton
const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`animate-pulse bg-dark-700/50 rounded ${className}`} />
)

// Format helpers
const formatCurrency = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '-'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

const formatNumber = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '-'
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return value.toLocaleString('pt-BR')
}

const formatPercent = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '-'
  return `${value.toFixed(2)}%`
}

const formatROAS = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return '-'
  return `${value.toFixed(2)}x`
}

// KPI Card Component
const KPICard = ({ 
  title, 
  value, 
  change, 
  trend, 
  icon: Icon, 
  color,
  loading,
  invertColors = false
}: { 
  title: string
  value: string
  change?: number | null
  trend?: 'up' | 'down' | 'neutral'
  icon: any
  color: string
  loading?: boolean
  invertColors?: boolean
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

  const isPositive = change !== undefined && change !== null && change > 0
  const isNegative = change !== undefined && change !== null && change < 0
  const actualTrend = invertColors 
    ? (isPositive ? 'down' : isNegative ? 'up' : 'neutral')
    : (isPositive ? 'up' : isNegative ? 'down' : 'neutral')

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
      {change !== undefined && change !== null && (
        <div className="flex items-center gap-1 mt-2">
          {actualTrend === 'up' ? (
            <ArrowUpRight className="w-4 h-4 text-green-400" />
          ) : actualTrend === 'down' ? (
            <ArrowDownRight className="w-4 h-4 text-red-400" />
          ) : null}
          <span className={actualTrend === 'up' ? 'text-green-400' : actualTrend === 'down' ? 'text-red-400' : 'text-dark-400'}>
            {change > 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
        </div>
      )}
    </motion.div>
  )
}

// Status Badge Component
const StatusBadge = ({ status }: { status: string }) => {
  const configs: Record<string, { icon: any; text: string; bg: string; color: string }> = {
    ACTIVE: { icon: Play, text: 'Ativa', bg: 'bg-green-500/20', color: 'text-green-400' },
    PAUSED: { icon: Pause, text: 'Pausada', bg: 'bg-yellow-500/20', color: 'text-yellow-400' },
    DELETED: { icon: Trash2, text: 'Deletada', bg: 'bg-red-500/20', color: 'text-red-400' },
    ARCHIVED: { icon: Clock, text: 'Arquivada', bg: 'bg-gray-500/20', color: 'text-gray-400' },
  }
  
  const config = configs[status] || { icon: AlertCircle, text: status, bg: 'bg-gray-500/20', color: 'text-gray-400' }
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

// Connect Meta Component - Espelhado do TikTok
const ConnectMeta = ({ onConnect, loading }: { onConnect: () => void; loading: boolean }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-dark-700/50 mb-6"
      >
        <MetaIcon className="w-16 h-16 text-blue-500" />
      </motion.div>
      <h2 className="text-2xl font-bold text-white mb-3">Conecte sua conta Meta Ads</h2>
      <p className="text-dark-400 max-w-md mb-8">
        Conecte suas contas de anúncios do Meta (Facebook/Instagram) para visualizar métricas, 
        gerenciar campanhas e acompanhar resultados em tempo real.
      </p>
      
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onConnect}
        disabled={loading}
        className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Plus className="w-5 h-5" />
        )}
        Conectar conta Meta
      </motion.button>
    </div>
  )
}

// ==========================================
// MAIN PAGE COMPONENT
// ==========================================

export default function MetaAdsPage() {
  const { currentStore } = useStoreStore()
  const [selectedTab, setSelectedTab] = useState<'campaigns' | 'adsets' | 'ads'>('campaigns')
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null)

  // Hooks
  const {
    accounts,
    activeAccounts,
    hasAccounts,
    accountsLoading,
    accountsError,
    connectAccount,
    
    selectedAccountIds,
    setSelectedAccountIds,
    dateRange,
    setDateRange,
    
    kpis,
    daily,
    kpisLoading,
    kpisError,
    
    campaigns,
    campaignsLoading,
    campaignsError,
    
    adsets,
    adsetsLoading,
    currentCampaign,
    
    ads,
    adsLoading,
    currentAdSet,
    
    viewLevel,
    selectCampaign,
    selectAdSet,
    goBack,
    goToCampaigns,
    
    toggleStatus,
    statusLoading,
    
    sync,
    syncing,
    lastSyncAt,
    
    refetchAll,
  } = useFacebookAds(currentStore?.id || '')

  // Close action menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setActionMenuOpen(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  // Sem loja selecionada
  if (!currentStore) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="p-4 rounded-full bg-dark-700/50 mb-4">
          <AlertCircle className="w-8 h-8 text-dark-400" />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Selecione uma loja</h3>
        <p className="text-dark-400 max-w-md">
          Para visualizar os dados do Meta Ads, selecione uma loja no menu lateral.
        </p>
      </div>
    )
  }

  // Loading accounts
  if (accountsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  // No accounts connected - Show connect screen
  if (!hasAccounts) {
    return <ConnectMeta onConnect={connectAccount} loading={accountsLoading} />
  }

  // Main dashboard
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3">
          {viewLevel !== 'campaigns' && (
            <button
              onClick={goBack}
              className="p-2 hover:bg-dark-700/50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-dark-400" />
            </button>
          )}
          <div className="p-3 rounded-xl bg-blue-500/20">
            <MetaIcon className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">
              {viewLevel === 'campaigns' && 'Meta Ads'}
              {viewLevel === 'adsets' && currentCampaign?.name}
              {viewLevel === 'ads' && currentAdSet?.name}
            </h1>
            <p className="text-dark-400 text-sm">
              {viewLevel === 'campaigns' && `${activeAccounts.length} conta${activeAccounts.length !== 1 ? 's' : ''} conectada${activeAccounts.length !== 1 ? 's' : ''}`}
              {viewLevel === 'adsets' && 'Conjuntos de anúncios'}
              {viewLevel === 'ads' && 'Anúncios'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Date Range Selector */}
          <div className="flex items-center bg-dark-800/50 rounded-xl p-1">
            {[
              { label: '7 Dias', days: 7 },
              { label: '14 Dias', days: 14 },
              { label: '30 Dias', days: 30 },
            ].map(({ label, days }) => {
              const today = new Date()
              const from = new Date(today)
              from.setDate(from.getDate() - days + 1)
              const isActive = dateRange.from === from.toISOString().split('T')[0]
              
              return (
                <button
                  key={days}
                  onClick={() => {
                    const newFrom = new Date()
                    newFrom.setDate(newFrom.getDate() - days + 1)
                    setDateRange({
                      from: newFrom.toISOString().split('T')[0],
                      to: today.toISOString().split('T')[0]
                    })
                  }}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                    isActive
                      ? 'bg-blue-500 text-white'
                      : 'text-dark-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <button 
            onClick={() => sync()}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-dark-800/50 hover:bg-dark-700/50 rounded-xl text-dark-300 hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>

          <button
            onClick={connectAccount}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-white transition-all"
          >
            <Plus className="w-4 h-4" />
            Nova conta
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      {viewLevel !== 'campaigns' && (
        <div className="flex items-center gap-2 text-sm">
          <button onClick={goToCampaigns} className="text-blue-400 hover:text-blue-300">
            Campanhas
          </button>
          <ChevronRight className="w-4 h-4 text-dark-500" />
          {viewLevel === 'adsets' && (
            <span className="text-dark-300">{currentCampaign?.name}</span>
          )}
          {viewLevel === 'ads' && (
            <>
              <button onClick={goBack} className="text-blue-400 hover:text-blue-300">
                {currentCampaign?.name}
              </button>
              <ChevronRight className="w-4 h-4 text-dark-500" />
              <span className="text-dark-300">{currentAdSet?.name}</span>
            </>
          )}
        </div>
      )}

      {/* Error Alert */}
      {(accountsError || kpisError || campaignsError) && (
        <ErrorAlert 
          message={accountsError || kpisError || campaignsError || 'Erro ao carregar dados'} 
          onRetry={refetchAll}
        />
      )}

      {/* KPI Cards - Only show on campaigns view */}
      {viewLevel === 'campaigns' && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <KPICard
            title="Investimento"
            value={formatCurrency(kpis?.spend.value)}
            change={kpis?.spend.change_percent}
            icon={DollarSign}
            color="from-blue-500 to-blue-600"
            loading={kpisLoading}
          />
          <KPICard
            title="Receita"
            value={formatCurrency(kpis?.revenue.value)}
            change={kpis?.revenue.change_percent}
            icon={ShoppingCart}
            color="from-green-500 to-emerald-600"
            loading={kpisLoading}
          />
          <KPICard
            title="ROAS"
            value={formatROAS(kpis?.roas.value)}
            change={kpis?.roas.change_percent}
            icon={TrendingUp}
            color="from-purple-500 to-violet-600"
            loading={kpisLoading}
          />
          <KPICard
            title="Compras"
            value={formatNumber(kpis?.purchases.value)}
            change={kpis?.purchases.change_percent}
            icon={ShoppingCart}
            color="from-cyan-500 to-blue-500"
            loading={kpisLoading}
          />
          <KPICard
            title="CPA"
            value={formatCurrency(kpis?.cpa.value)}
            change={kpis?.cpa.change_percent}
            icon={Target}
            color="from-orange-500 to-amber-500"
            loading={kpisLoading}
            invertColors
          />
        </div>
      )}

      {/* Campaigns Table */}
      {viewLevel === 'campaigns' && (
        <div className="bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Campanhas</h3>
            <span className="text-sm text-dark-400">{campaigns.length} campanha{campaigns.length !== 1 ? 's' : ''}</span>
          </div>

          {campaignsLoading ? (
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
                    <th className="pb-4 font-medium text-right">Gasto</th>
                    <th className="pb-4 font-medium text-right">Receita</th>
                    <th className="pb-4 font-medium text-right">ROAS</th>
                    <th className="pb-4 font-medium text-right">Compras</th>
                    <th className="pb-4 font-medium text-right">CPA</th>
                    <th className="pb-4 font-medium text-right">CTR</th>
                    <th className="pb-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => (
                    <tr 
                      key={campaign.id} 
                      className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors cursor-pointer"
                      onClick={() => selectCampaign(campaign.id)}
                    >
                      <td className="py-4">
                        <p className="font-medium text-white">{campaign.name}</p>
                        <p className="text-xs text-dark-500 mt-1">{campaign.objective}</p>
                      </td>
                      <td className="py-4">
                        <StatusBadge status={campaign.status} />
                      </td>
                      <td className="py-4 text-right text-dark-300">
                        {formatCurrency(campaign.metrics?.spend)}
                      </td>
                      <td className="py-4 text-right text-green-400">
                        {formatCurrency(campaign.metrics?.purchaseValue)}
                      </td>
                      <td className="py-4 text-right">
                        <span className={`font-medium ${
                          (campaign.metrics?.roas || 0) >= 2 ? 'text-green-400' : 
                          (campaign.metrics?.roas || 0) >= 1 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {formatROAS(campaign.metrics?.roas)}
                        </span>
                      </td>
                      <td className="py-4 text-right text-dark-300">
                        {campaign.metrics?.purchases || 0}
                      </td>
                      <td className="py-4 text-right text-dark-300">
                        {formatCurrency(campaign.metrics?.costPerPurchase)}
                      </td>
                      <td className="py-4 text-right text-dark-300">
                        {formatPercent(campaign.metrics?.ctr)}
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
                        
                        {actionMenuOpen === campaign.id && (
                          <div 
                            className="absolute right-0 top-full mt-1 w-48 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-10"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                toggleStatus(campaign.id, 'campaign', campaign.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')
                                setActionMenuOpen(null)
                              }}
                              disabled={statusLoading}
                              className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm hover:bg-dark-700/50 transition-colors"
                            >
                              {campaign.status === 'ACTIVE' ? (
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
                            <button
                              onClick={() => {
                                selectCampaign(campaign.id)
                                setActionMenuOpen(null)
                              }}
                              className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm hover:bg-dark-700/50 transition-colors border-t border-dark-700/50"
                            >
                              <ChevronRight className="w-4 h-4" />
                              Ver Ad Sets
                            </button>
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
              description="Não encontramos campanhas ativas no período selecionado. Tente alterar o período ou criar novas campanhas no Meta Business Suite."
              action={
                <a
                  href="https://business.facebook.com/adsmanager"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
                >
                  <ExternalLink className="w-4 h-4" />
                  Abrir Gerenciador de Anúncios
                </a>
              }
            />
          )}
        </div>
      )}

      {/* Ad Sets Table */}
      {viewLevel === 'adsets' && (
        <div className="bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Conjuntos de Anúncios</h3>
            <span className="text-sm text-dark-400">{adsets.length} conjunto{adsets.length !== 1 ? 's' : ''}</span>
          </div>

          {adsetsLoading ? (
            <div className="space-y-4">
              {Array(3).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : adsets.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-dark-400 border-b border-dark-700/50">
                    <th className="pb-4 text-left font-medium">Conjunto</th>
                    <th className="pb-4 font-medium">Status</th>
                    <th className="pb-4 font-medium text-right">Gasto</th>
                    <th className="pb-4 font-medium text-right">Receita</th>
                    <th className="pb-4 font-medium text-right">ROAS</th>
                    <th className="pb-4 font-medium text-right">CPA</th>
                    <th className="pb-4 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {adsets.map((adset) => (
                    <tr 
                      key={adset.id} 
                      className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors cursor-pointer"
                      onClick={() => selectAdSet(adset.id)}
                    >
                      <td className="py-4">
                        <p className="font-medium text-white">{adset.name}</p>
                      </td>
                      <td className="py-4">
                        <StatusBadge status={adset.status} />
                      </td>
                      <td className="py-4 text-right text-dark-300">
                        {formatCurrency(adset.metrics?.spend)}
                      </td>
                      <td className="py-4 text-right text-green-400">
                        {formatCurrency(adset.metrics?.purchaseValue)}
                      </td>
                      <td className="py-4 text-right">
                        <span className={`font-medium ${
                          (adset.metrics?.roas || 0) >= 2 ? 'text-green-400' : 'text-yellow-400'
                        }`}>
                          {formatROAS(adset.metrics?.roas)}
                        </span>
                      </td>
                      <td className="py-4 text-right text-dark-300">
                        {formatCurrency(adset.metrics?.costPerPurchase)}
                      </td>
                      <td className="py-4 text-right">
                        <ChevronRight className="w-4 h-4 text-dark-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Target}
              title="Nenhum conjunto de anúncios"
              description="Esta campanha não possui conjuntos de anúncios no período selecionado."
            />
          )}
        </div>
      )}

      {/* Ads Table */}
      {viewLevel === 'ads' && (
        <div className="bg-dark-800/50 backdrop-blur-sm border border-dark-700/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Anúncios</h3>
            <span className="text-sm text-dark-400">{ads.length} anúncio{ads.length !== 1 ? 's' : ''}</span>
          </div>

          {adsLoading ? (
            <div className="space-y-4">
              {Array(3).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : ads.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-dark-400 border-b border-dark-700/50">
                    <th className="pb-4 text-left font-medium">Anúncio</th>
                    <th className="pb-4 font-medium">Status</th>
                    <th className="pb-4 font-medium text-right">Gasto</th>
                    <th className="pb-4 font-medium text-right">Receita</th>
                    <th className="pb-4 font-medium text-right">ROAS</th>
                    <th className="pb-4 font-medium text-right">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((ad) => (
                    <tr 
                      key={ad.id} 
                      className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors"
                    >
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          {ad.creative?.thumbnail_url && (
                            <img 
                              src={ad.creative.thumbnail_url} 
                              alt={ad.name}
                              className="w-12 h-12 rounded-lg object-cover"
                            />
                          )}
                          <div>
                            <p className="font-medium text-white">{ad.name}</p>
                            {ad.creative?.title && (
                              <p className="text-xs text-dark-500 mt-1">{ad.creative.title}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <StatusBadge status={ad.status} />
                      </td>
                      <td className="py-4 text-right text-dark-300">
                        {formatCurrency(ad.metrics?.spend)}
                      </td>
                      <td className="py-4 text-right text-green-400">
                        {formatCurrency(ad.metrics?.purchaseValue)}
                      </td>
                      <td className="py-4 text-right">
                        <span className={`font-medium ${
                          (ad.metrics?.roas || 0) >= 2 ? 'text-green-400' : 'text-yellow-400'
                        }`}>
                          {formatROAS(ad.metrics?.roas)}
                        </span>
                      </td>
                      <td className="py-4 text-right text-dark-300">
                        {formatPercent(ad.metrics?.ctr)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Target}
              title="Nenhum anúncio"
              description="Este conjunto de anúncios não possui anúncios no período selecionado."
            />
          )}
        </div>
      )}

      {/* Last Sync Info */}
      {lastSyncAt && (
        <p className="text-center text-xs text-dark-500">
          Última sincronização: {new Date(lastSyncAt).toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  )
}
