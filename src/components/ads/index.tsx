'use client'

import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ExternalLink,
  Play,
  Eye,
  MousePointer,
  Target,
  DollarSign,
  BarChart3,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

// Formatters
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

const formatPercent = (value: number) => {
  return `${value.toFixed(2)}%`
}

// Platform Icons
export const FacebookIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)

export const GoogleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24">
    <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.51 4.418 1.49L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115Z"/>
    <path fill="#34A853" d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.04 3.067A11.965 11.965 0 0 0 12 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987Z"/>
    <path fill="#4A90E2" d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21Z"/>
    <path fill="#FBBC05" d="M5.277 14.268A7.12 7.12 0 0 1 4.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 0 0 0 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067Z"/>
  </svg>
)

export const TiktokIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
  </svg>
)

// Platform Badge
interface PlatformBadgeProps {
  platform: 'meta' | 'google' | 'tiktok'
  size?: 'sm' | 'md'
}

export const PlatformBadge = ({ platform, size = 'sm' }: PlatformBadgeProps) => {
  const config = {
    meta: { bg: 'bg-blue-600', icon: <FacebookIcon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} /> },
    google: { bg: 'bg-white', icon: <GoogleIcon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} /> },
    tiktok: { bg: 'bg-zinc-800', icon: <TiktokIcon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} /> },
  }
  
  return (
    <span className={`${config[platform].bg} ${size === 'sm' ? 'p-1.5' : 'p-2'} rounded-lg inline-flex items-center justify-center`}>
      {config[platform].icon}
    </span>
  )
}

// Ads Platform Card
interface AdsPlatformCardProps {
  platform: 'meta' | 'google' | 'tiktok'
  spend: number
  spendChange: number
  revenue: number
  roas: number
  cpa: number
  isConnected?: boolean
  onConnect?: () => void
  onSync?: () => void
  isSyncing?: boolean
}

export const AdsPlatformCard = ({
  platform,
  spend,
  spendChange,
  revenue,
  roas,
  cpa,
  isConnected = false,
  onConnect,
  onSync,
  isSyncing = false,
}: AdsPlatformCardProps) => {
  const config = {
    meta: { 
      name: 'Facebook Ads', 
      gradient: 'from-blue-900/40 to-dark-900',
      border: 'border-blue-700/30',
      textColor: 'text-blue-400',
    },
    google: { 
      name: 'Google Ads', 
      gradient: 'from-red-900/30 to-dark-900',
      border: 'border-red-700/30',
      textColor: 'text-red-400',
    },
    tiktok: { 
      name: 'TikTok Ads', 
      gradient: 'from-dark-800 to-dark-900',
      border: 'border-dark-600',
      textColor: 'text-white',
    },
  }

  if (!isConnected) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-gradient-to-br ${config[platform].gradient} border ${config[platform].border} rounded-xl p-5`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <PlatformBadge platform={platform} size="md" />
            <span className="font-semibold text-white">{config[platform].name}</span>
          </div>
        </div>
        <div className="text-center py-6">
          <p className="text-dark-400 text-sm mb-4">Conecte sua conta para ver os dados</p>
          <button
            onClick={onConnect}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Conectar {config[platform].name}
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gradient-to-br ${config[platform].gradient} border ${config[platform].border} rounded-xl p-5`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <PlatformBadge platform={platform} size="md" />
          <span className="font-semibold text-white">{config[platform].name}</span>
        </div>
        <button 
          onClick={onSync}
          disabled={isSyncing}
          className="p-2 text-dark-400 hover:text-white rounded-lg hover:bg-dark-700/50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-dark-400">Gasto</p>
          <div className="flex items-baseline gap-2">
            <p className="text-lg font-bold text-white">{formatCurrency(spend)}</p>
            {spendChange !== 0 && (
              <span className={`text-xs ${spendChange > 0 ? 'text-error-400' : 'text-success-400'}`}>
                {spendChange > 0 ? '↑' : '↓'} {Math.abs(spendChange).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs text-dark-400">Receita</p>
          <p className="text-lg font-bold text-success-400">{formatCurrency(revenue)}</p>
        </div>
        <div>
          <p className="text-xs text-dark-400">ROAS</p>
          <p className={`text-lg font-bold ${config[platform].textColor}`}>{roas.toFixed(2)}x</p>
        </div>
        <div>
          <p className="text-xs text-dark-400">CPA</p>
          <p className="text-lg font-bold text-white">{formatCurrency(cpa)}</p>
        </div>
      </div>
    </motion.div>
  )
}

// Ads Trend Chart
interface AdsTrendChartProps {
  data: Array<{
    label: string
    meta: number
    google: number
    tiktok: number
  }>
}

export const AdsTrendChart = ({ data }: AdsTrendChartProps) => {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-dark-800/95 backdrop-blur-sm border border-dark-700/50 rounded-xl p-4 shadow-xl">
          <p className="text-sm font-medium text-white mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-dark-400">{entry.name}:</span>
              <span className="text-white font-medium">{formatCurrency(entry.value)}</span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-dark-800/40 rounded-2xl border border-dark-700/30"
    >
      <h3 className="font-semibold text-white mb-4">Gasto por Plataforma (últimos dias)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <XAxis 
            dataKey="label" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#71717a', fontSize: 12 }} 
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fill: '#71717a', fontSize: 12 }}
            tickFormatter={(value) => `R$${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area 
            type="monotone" 
            dataKey="meta" 
            name="Facebook"
            stackId="1" 
            stroke="#1877F2" 
            fill="#1877F2" 
            fillOpacity={0.6} 
          />
          <Area 
            type="monotone" 
            dataKey="google" 
            name="Google"
            stackId="1" 
            stroke="#EA4335" 
            fill="#EA4335" 
            fillOpacity={0.6} 
          />
          <Area 
            type="monotone" 
            dataKey="tiktok" 
            name="TikTok"
            stackId="1" 
            stroke="#71717a" 
            fill="#71717a" 
            fillOpacity={0.6} 
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-6 mt-4">
        <div className="flex items-center gap-2 text-sm text-dark-400">
          <div className="w-3 h-3 rounded-full bg-blue-600" /> Facebook
        </div>
        <div className="flex items-center gap-2 text-sm text-dark-400">
          <div className="w-3 h-3 rounded-full bg-red-500" /> Google
        </div>
        <div className="flex items-center gap-2 text-sm text-dark-400">
          <div className="w-3 h-3 rounded-full bg-dark-500" /> TikTok
        </div>
      </div>
    </motion.div>
  )
}

// Spend Distribution Chart
interface SpendDistributionProps {
  data: Array<{ name: string; value: number; color: string }>
}

export const SpendDistributionChart = ({ data }: SpendDistributionProps) => {
  const total = data.reduce((acc, item) => acc + item.value, 0)
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-dark-800/40 rounded-2xl border border-dark-700/30"
    >
      <h3 className="font-semibold text-white mb-2">Distribuição de Gastos</h3>
      <p className="text-sm text-dark-400 mb-4">Por plataforma de anúncios</p>
      
      <div className="flex items-center gap-8">
        <div className="w-40 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={4}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className="flex-1 space-y-3">
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-dark-300">{item.name}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-medium text-white">{formatCurrency(item.value)}</span>
                <span className="text-xs text-dark-500 ml-2">
                  ({total > 0 ? ((item.value / total) * 100).toFixed(0) : 0}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

// Top Ads List
interface TopAd {
  id: string
  name: string
  platform: 'meta' | 'google' | 'tiktok'
  spend: number
  revenue: number
  roas: number
  status?: string
}

interface TopAdsListProps {
  ads: TopAd[]
  onViewAll?: () => void
}

export const TopAdsList = ({ ads, onViewAll }: TopAdsListProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 bg-dark-800/40 rounded-2xl border border-dark-700/30"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-white">Top Anúncios</h3>
          <p className="text-sm text-dark-400">Por ROAS</p>
        </div>
        {onViewAll && (
          <button 
            onClick={onViewAll}
            className="text-sm text-primary-400 hover:text-primary-300 font-medium"
          >
            Ver todos →
          </button>
        )}
      </div>
      
      <div className="space-y-3">
        {ads.slice(0, 5).map((ad) => (
          <div
            key={ad.id}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-dark-800/50 transition-colors"
          >
            <PlatformBadge platform={ad.platform} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{ad.name}</p>
              <p className="text-xs text-dark-500">Gasto: {formatCurrency(ad.spend)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-success-400">{ad.roas.toFixed(2)}x</p>
              <p className="text-xs text-dark-500">ROAS</p>
            </div>
          </div>
        ))}
        
        {ads.length === 0 && (
          <div className="text-center py-8">
            <BarChart3 className="w-10 h-10 text-dark-600 mx-auto mb-2" />
            <p className="text-dark-400 text-sm">Nenhum anúncio encontrado</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// Ads Summary Cards Row
interface AdsSummaryProps {
  totalSpend: number
  spendChange: number
  cpa: number
  roas: number
  totalConversions: number
}

export const AdsSummaryCards = ({ totalSpend, spendChange, cpa, roas, totalConversions }: AdsSummaryProps) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div className="bg-dark-800/60 rounded-xl p-4 border border-dark-700/40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <DollarSign className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-dark-400">Total em Ads</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-lg font-bold text-white">{formatCurrency(totalSpend)}</span>
              {spendChange !== 0 && (
                <span className={`text-xs font-medium ${spendChange > 0 ? 'text-error-400' : 'text-success-400'}`}>
                  {spendChange > 0 ? '↑' : '↓'} {Math.abs(spendChange).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-dark-800/60 rounded-xl p-4 border border-dark-700/40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary-500/20">
            <Target className="w-4 h-4 text-primary-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-dark-400">CPA Médio</p>
            <span className="text-lg font-bold text-white">{formatCurrency(cpa)}</span>
          </div>
        </div>
      </div>
      
      <div className="bg-dark-800/60 rounded-xl p-4 border border-dark-700/40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-success-500/20">
            <TrendingUp className="w-4 h-4 text-success-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-dark-400">ROAS Geral</p>
            <span className="text-lg font-bold text-white">{roas.toFixed(2)}x</span>
          </div>
        </div>
      </div>
      
      <div className="bg-dark-800/60 rounded-xl p-4 border border-dark-700/40">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent-500/20">
            <MousePointer className="w-4 h-4 text-accent-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-dark-400">Conversões</p>
            <span className="text-lg font-bold text-white">{formatNumber(totalConversions)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Export all components
export default {
  PlatformBadge,
  AdsPlatformCard,
  AdsTrendChart,
  SpendDistributionChart,
  TopAdsList,
  AdsSummaryCards,
  FacebookIcon,
  GoogleIcon,
  TiktokIcon,
}
