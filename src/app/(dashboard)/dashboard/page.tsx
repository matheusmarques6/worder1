'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  ShoppingCart,
  Filter,
  Download,
  RefreshCw,
  Target,
  Package,
  CreditCard,
  BarChart3,
  Store,
  Activity,
  ChevronDown,
  AlertCircle,
  Link as LinkIcon,
  Plus,
  Loader2,
  X,
} from 'lucide-react'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Legend,
  Area,
} from 'recharts'
import { useStoreStore } from '@/stores'

// Types
interface DashboardMetrics {
  receita: number
  receitaChange: number
  custos: number
  custosChange: number
  marketing: number
  marketingChange: number
  impostos: number
  impostosChange: number
  margem: number
  margemChange: number
  lucro: number
  lucroChange: number
  pedidos: number
  pedidosChange: number
  ticketMedio: number
  ticketMedioChange: number
}

interface ChartData {
  date: string
  receita: number
  custos: number
  marketing: number
  impostos: number
  lucro: number
}

interface StoreMetrics {
  id: string
  name: string
  domain: string
  pedidos: number
  receita: number
  custos: number
  lucro: number
  margem: number
}

interface IntegrationStatus {
  shopify: boolean
  klaviyo: boolean
  meta: boolean
  google: boolean
  tiktok: boolean
}

interface TotalsData {
  pedidos: number
  pedidosPagos: number
  receita: number
}

// Date range options
const dateRanges = [
  { id: 'today', label: 'Hoje' },
  { id: 'yesterday', label: 'Ontem' },
  { id: '7d', label: '7 Dias' },
  { id: '30d', label: 'Este mês' },
  { id: '90d', label: '90 Dias' },
  { id: 'all', label: 'Todo período' },
  { id: 'custom', label: 'Customizado' },
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

const formatPercent = (value: number) => {
  return `${value.toFixed(1)}%`
}

// Empty State Component
const EmptyState = ({ 
  title, 
  description, 
  actionLabel, 
  onAction,
  icon: Icon = AlertCircle 
}: {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
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
    <p className="text-dark-400 text-center max-w-md mb-6">{description}</p>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        {actionLabel}
      </button>
    )}
  </motion.div>
)

// Integration Alert Component
const IntegrationAlert = ({ 
  platform, 
  onConnect 
}: { 
  platform: string
  onConnect: () => void 
}) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    className="flex items-center gap-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl"
  >
    <div className="p-2 rounded-lg bg-yellow-500/20">
      <AlertCircle className="w-5 h-5 text-yellow-400" />
    </div>
    <div className="flex-1">
      <p className="text-sm font-medium text-white">
        {platform} não conectado
      </p>
      <p className="text-xs text-dark-400">
        Conecte para ver dados reais nesta seção
      </p>
    </div>
    <button
      onClick={onConnect}
      className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-sm font-medium transition-colors"
    >
      <LinkIcon className="w-4 h-4" />
      Conectar
    </button>
  </motion.div>
)

// Metric Card Component
const MetricCard = ({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  highlight = false,
  loading = false,
}: {
  title: string
  value: string
  change?: number
  icon: React.ElementType
  highlight?: boolean
  loading?: boolean
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
            <p className="text-2xl font-bold mt-0.5 text-white">{value}</p>
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

// Custom Date Picker Modal
const DatePickerModal = ({ 
  isOpen, 
  onClose, 
  onApply 
}: { 
  isOpen: boolean
  onClose: () => void
  onApply: (start: string, end: string) => void 
}) => {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative bg-dark-900 rounded-2xl border border-dark-700 p-6 w-full max-w-md"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-dark-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-semibold text-white mb-4">Período Customizado</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-dark-400 mb-2">Data Inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm text-dark-400 mb-2">Data Final</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500"
            />
          </div>
          <button
            onClick={() => {
              if (startDate && endDate) {
                onApply(startDate, endDate)
                onClose()
              }
            }}
            disabled={!startDate || !endDate}
            className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-dark-700 disabled:text-dark-500 text-white rounded-xl font-medium transition-colors"
          >
            Aplicar
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function DashboardPage() {
  const [selectedRange, setSelectedRange] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [customDateRange, setCustomDateRange] = useState<{ start: string; end: string } | null>(null)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  
  const { currentStore, stores } = useStoreStore()
  
  // Data states
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [storesMetrics, setStoresMetrics] = useState<StoreMetrics[]>([])
  const [integrations, setIntegrations] = useState<IntegrationStatus>({
    shopify: false,
    klaviyo: false,
    meta: false,
    google: false,
    tiktok: false,
  })
  const [totals, setTotals] = useState<TotalsData | null>(null)

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      setIsLoading(true)
      
      // Build query params
      const params = new URLSearchParams()
      params.append('range', selectedRange)
      if (customDateRange) {
        params.append('startDate', customDateRange.start)
        params.append('endDate', customDateRange.end)
      }
      if (currentStore?.id) {
        params.append('storeId', currentStore.id)
      }

      const response = await fetch(`/api/dashboard/metrics?${params.toString()}`)
      const data = await response.json()

      if (response.ok) {
        setMetrics(data.metrics || null)
        setChartData(data.chartData || [])
        setStoresMetrics(data.stores || [])
        setTotals(data.totals || null)
        setIntegrations(data.integrations || {
          shopify: stores.length > 0,
          klaviyo: false,
          meta: false,
          google: false,
          tiktok: false,
        })
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      // Set empty state on error
      setMetrics(null)
      setChartData([])
      setStoresMetrics([])
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [selectedRange, customDateRange, currentStore, stores.length])

  // Initial load and when filters change
  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  // Handle date range change
  const handleRangeChange = (rangeId: string) => {
    if (rangeId === 'custom') {
      setShowDatePicker(true)
    } else {
      setSelectedRange(rangeId)
      setCustomDateRange(null)
    }
  }

  // Handle refresh
  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchDashboardData()
  }

  // Handle export
  const handleExport = async (format: 'csv' | 'pdf') => {
    try {
      const params = new URLSearchParams()
      params.append('range', selectedRange)
      params.append('format', format)
      
      const response = await fetch(`/api/dashboard/export?${params.toString()}`)
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `dashboard-${selectedRange}.${format}`
        a.click()
      }
    } catch (error) {
      console.error('Export error:', error)
    }
    setShowActionsMenu(false)
  }

  // Check if has any store connected
  const hasStoreConnected = stores.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Financeiro</h1>
          <p className="text-dark-400 mt-1">Visão geral das suas métricas financeiras</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Filter Button */}
          <button className="flex items-center gap-2 px-4 py-2.5 bg-dark-800/50 hover:bg-dark-700/50 border border-dark-700/50 rounded-xl text-dark-300 hover:text-white transition-all">
            <Filter className="w-4 h-4" />
            Filtrar
          </button>

          {/* Date Range Selector */}
          <div className="flex items-center bg-dark-800/50 border border-dark-700/50 rounded-xl p-1">
            {dateRanges.map((range) => (
              <button
                key={range.id}
                onClick={() => handleRangeChange(range.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  (selectedRange === range.id && !customDateRange) || (range.id === 'custom' && customDateRange)
                    ? 'bg-dark-700 text-white'
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>

          {/* Actions Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              className="flex items-center gap-2 px-4 py-2.5 bg-dark-800/50 hover:bg-dark-700/50 border border-dark-700/50 rounded-xl text-dark-300 hover:text-white transition-all"
            >
              Ações
              <ChevronDown className={`w-4 h-4 transition-transform ${showActionsMenu ? 'rotate-180' : ''}`} />
            </button>
            
            {showActionsMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowActionsMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute right-0 top-full mt-2 w-48 bg-dark-800 border border-dark-700 rounded-xl shadow-xl overflow-hidden z-20"
                >
                  <button
                    onClick={() => handleExport('csv')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-dark-300 hover:text-white hover:bg-dark-700/50 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Exportar CSV
                  </button>
                  <button
                    onClick={() => handleExport('pdf')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-dark-300 hover:text-white hover:bg-dark-700/50 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Exportar PDF
                  </button>
                  <button
                    onClick={() => { handleRefresh(); setShowActionsMenu(false) }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-dark-300 hover:text-white hover:bg-dark-700/50 transition-colors border-t border-dark-700"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Atualizar Dados
                  </button>
                </motion.div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* No Store Connected State */}
      {!hasStoreConnected ? (
        <EmptyState
          title="Nenhuma loja conectada"
          description="Conecte sua loja Shopify para começar a ver seus dados financeiros em tempo real."
          actionLabel="Conectar Loja Shopify"
          onAction={() => {
            // Trigger add store modal - dispatch event
            window.dispatchEvent(new CustomEvent('openAddStoreModal'))
          }}
          icon={Store}
        />
      ) : (
        <>
          {/* Main KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricCard
              title="Receita Líquida"
              value={metrics ? formatCurrency(metrics.receita) : 'R$ 0,00'}
              change={metrics?.receitaChange}
              icon={DollarSign}
              highlight
              loading={isLoading}
            />
            <MetricCard
              title="Custo dos Produtos"
              value={metrics ? formatCurrency(metrics.custos) : 'R$ 0,00'}
              change={metrics?.custosChange}
              icon={Package}
              loading={isLoading}
            />
            <MetricCard
              title="Marketing"
              value={metrics ? formatCurrency(metrics.marketing) : 'R$ 0,00'}
              change={metrics?.marketingChange}
              icon={Target}
              loading={isLoading}
            />
            <MetricCard
              title="Taxas e Impostos"
              value={metrics ? formatCurrency(metrics.impostos) : 'R$ 0,00'}
              change={metrics?.impostosChange}
              icon={CreditCard}
              loading={isLoading}
            />
            <MetricCard
              title="Margem"
              value={metrics ? formatPercent(metrics.margem) : '0%'}
              change={metrics?.margemChange}
              icon={BarChart3}
              loading={isLoading}
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Financial Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:col-span-2 p-6 bg-dark-800/40 rounded-2xl border border-dark-700/30"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-white">Resumo Financeiro</h3>
                  <p className="text-sm text-dark-400">Receita vs Custos</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-right">
                    <p className="text-dark-400">Receita Bruta</p>
                    <p className="text-xl font-bold text-white">
                      {metrics ? formatCurrency(metrics.receita * 1.15) : 'R$ 0,00'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-dark-400">Receita total pela data de aprovação</p>
                    <p className="text-xl font-bold text-white">
                      {metrics ? formatCurrency(metrics.receita) : 'R$ 0,00'}
                    </p>
                  </div>
                </div>
              </div>

              {isLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
                </div>
              ) : chartData.length > 0 ? (
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                      <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1f2937',
                          border: '1px solid #374151',
                          borderRadius: '12px',
                        }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Legend />
                      <Bar dataKey="custos" name="Custos" fill="#f97316" stackId="stack" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="marketing" name="Marketing" fill="#22c55e" stackId="stack" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="impostos" name="Impostos" fill="#3b82f6" stackId="stack" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="lucro" name="Lucro" fill="#eab308" stackId="stack" radius={[4, 4, 0, 0]} />
                      <Area type="monotone" dataKey="receita" name="Receita" fill="url(#colorReceita)" stroke="#f97316" strokeWidth={2} />
                      <defs>
                        <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 text-dark-500 mx-auto mb-3" />
                    <p className="text-dark-400">Nenhum dado disponível para o período selecionado</p>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Net Profit Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 bg-dark-800/40 rounded-2xl border border-dark-700/30"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Lucro Líquido</h3>
                <button className="text-sm text-primary-400 hover:text-primary-300">
                  Ver detalhes →
                </button>
              </div>

              {isLoading ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
                </div>
              ) : (
                <>
                  <p className={`text-4xl font-bold ${metrics && metrics.lucro >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {metrics ? formatCurrency(metrics.lucro) : 'R$ 0,00'}
                  </p>
                  
                  {metrics?.lucroChange !== undefined && (
                    <div className={`flex items-center gap-2 mt-2 ${metrics.lucroChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {metrics.lucroChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      <span className="text-sm font-medium">
                        {Math.abs(metrics.lucroChange).toFixed(1)}% {metrics.lucroChange >= 0 ? 'a mais' : 'a menos'} neste período
                      </span>
                    </div>
                  )}

                  {/* Mini chart */}
                  <div className="mt-6 h-[120px] flex items-end gap-1">
                    {chartData.length > 0 ? (
                      chartData.map((d, i) => (
                        <div
                          key={i}
                          className={`flex-1 rounded-t ${d.lucro >= 0 ? 'bg-green-500/60' : 'bg-red-500/60'}`}
                          style={{ height: `${Math.min(Math.abs(d.lucro) / (metrics?.lucro || 1) * 50 + 20, 100)}%` }}
                        />
                      ))
                    ) : (
                      Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="flex-1 bg-dark-700/50 rounded-t" style={{ height: '30%' }} />
                      ))
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-dark-400">Incluir valores adicionais</span>
                    <button className="w-10 h-6 bg-dark-700 rounded-full relative">
                      <div className="absolute left-1 top-1 w-4 h-4 bg-dark-500 rounded-full" />
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>

          {/* Stores Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-dark-800/40 rounded-2xl border border-dark-700/30"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-white">TODAS AS LOJAS</h3>
                <span className="px-2 py-0.5 bg-dark-700 text-dark-300 text-sm rounded-full">
                  {stores.length}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-dark-400 border-b border-dark-700/50">
                    <th className="pb-4 font-medium">LOJA</th>
                    <th className="pb-4 font-medium text-right">PEDIDOS</th>
                    <th className="pb-4 font-medium text-right">RECEITA</th>
                    <th className="pb-4 font-medium text-right">CUSTO TOTAL</th>
                    <th className="pb-4 font-medium text-right">LUCRO</th>
                    <th className="pb-4 font-medium text-right">MARGEM DE LUCRO</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((store) => {
                    const storeData = storesMetrics.find(s => s.id === store.id)
                    return (
                      <tr key={store.id} className="border-b border-dark-700/30">
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
                              <Store className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <p className="font-medium text-white">{store.name}</p>
                              <p className="text-xs text-dark-400">{store.domain}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 text-right text-dark-300">
                          {storeData ? formatNumber(storeData.pedidos) : '-'}
                        </td>
                        <td className="py-4 text-right text-dark-300">
                          {storeData ? formatCurrency(storeData.receita) : '-'}
                        </td>
                        <td className="py-4 text-right text-dark-300">
                          {storeData ? formatCurrency(storeData.custos) : '-'}
                        </td>
                        <td className="py-4 text-right">
                          <span className={storeData && storeData.lucro >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {storeData ? formatCurrency(storeData.lucro) : '-'}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <span className={storeData && storeData.margem >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {storeData ? formatPercent(storeData.margem) : '-'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <MetricCard
              title="Pedidos"
              value={metrics ? formatNumber(metrics.pedidos) : '0'}
              change={metrics?.pedidosChange}
              icon={ShoppingCart}
              loading={isLoading}
            />
            <MetricCard
              title="Ticket Médio"
              value={metrics ? formatCurrency(metrics.ticketMedio) : 'R$ 0,00'}
              change={metrics?.ticketMedioChange}
              icon={CreditCard}
              loading={isLoading}
            />
            <MetricCard
              title="Clientes"
              value="0"
              icon={Users}
              loading={isLoading}
            />
            <MetricCard
              title="Unidades Vendidas"
              value="0"
              icon={Activity}
              loading={isLoading}
            />
          </div>
        </>
      )}

      {/* Date Picker Modal */}
      <DatePickerModal
        isOpen={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onApply={(start, end) => {
          setCustomDateRange({ start, end })
          setSelectedRange('custom')
        }}
      />
    </div>
  )
}
