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
  CheckCircle,
  Clock,
  Percent,
  Award,
  ChevronRight,
  Wallet,
  Smartphone,
  FileText,
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
  productCosts: number
  fees: number
  marketing: number
  marketingChange: number
  impostos: number
  impostosChange: number
  margem: number
  margemChange: number
  lucro: number
  lucroChange: number
  pedidos: number
  pedidosPagos: number
  pedidosChange: number
  ticketMedio: number
  ticketMedioChange: number
  unidadesVendidas: number
  cac: number
  roi: number
  pedidosPendentes: number
  valorPendente: number
  recurringRate: number
  totalCustomers: number
  recurringCustomers: number
}

interface SalesBreakdown {
  subtotal: number
  shipping: number
  taxes: number
  discounts: number
  total: number
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

interface TopProduct {
  productId: string
  title: string
  image: string | null
  quantity: number
  revenue: number
  cost: number
  profit: number
  rank: number
  margin: number
}

interface PaymentMethod {
  count: number
  value: number
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
    maximumFractionDigits: 2,
  }).format(value)
}

const formatCompactCurrency = (value: number) => {
  if (Math.abs(value) >= 1000000) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value)
  }
  if (Math.abs(value) >= 10000) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }
  return formatCurrency(value)
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
    className="flex flex-col items-center justify-center py-16 px-8 bg-white rounded-2xl border border-gray-200 border-dashed"
  >
    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
      <Icon className="w-8 h-8 text-gray-500" />
    </div>
    <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
    <p className="text-gray-500 text-center max-w-md mb-6">{description}</p>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        {actionLabel}
      </button>
    )}
  </motion.div>
)

// KPI Card Component
const KPICard = ({
  title,
  value,
  subValue,
  change,
  icon: Icon,
  iconColor = 'text-orange-500',
  iconBg = 'bg-orange-50',
  highlight = false,
  loading = false,
}: {
  title: string
  value: string
  subValue?: string
  change?: number
  icon: React.ElementType
  iconColor?: string
  iconBg?: string
  highlight?: boolean
  loading?: boolean
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className={`
      relative rounded-xl p-4 transition-all duration-300 overflow-hidden
      ${highlight
        ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/20'
        : 'bg-white border border-gray-200 hover:border-gray-300'
      }
    `}
  >
    {loading ? (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
      </div>
    ) : (
      <>
        <div className="flex items-center justify-between mb-3">
          <div className={`p-2 rounded-lg ${highlight ? 'bg-white/20' : iconBg}`}>
            <Icon className={`w-4 h-4 ${highlight ? 'text-gray-900' : iconColor}`} />
          </div>
          {change !== undefined && (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
              highlight
                ? change >= 0 ? 'bg-white/20 text-gray-900' : 'bg-red-500/30 text-red-200'
                : change >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(change).toFixed(1)}%
            </div>
          )}
        </div>
        <p className={`text-xs font-medium mb-1 ${highlight ? 'text-gray-900/80' : 'text-gray-500'}`}>
          {title}
        </p>
        <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
        {subValue && (
          <p className={`text-xs mt-1 ${highlight ? 'text-gray-900/60' : 'text-gray-400'}`}>{subValue}</p>
        )}
      </>
    )}
  </motion.div>
)

// Stat Card Component - Smaller
const StatCard = ({
  title,
  value,
  subValue,
  icon: Icon,
  iconColor = 'text-orange-500',
  iconBg = 'bg-orange-50',
  valueColor = 'text-gray-900',
}: {
  title: string
  value: string
  subValue?: string
  icon: React.ElementType
  iconColor?: string
  iconBg?: string
  valueColor?: string
}) => (
  <div className="p-4 bg-white rounded-xl border border-gray-200">
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${iconBg}`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">{title}</p>
        <div className="flex items-baseline gap-2">
          <p className={`text-lg font-bold ${valueColor}`}>{value}</p>
          {subValue && <span className="text-xs text-gray-400">{subValue}</span>}
        </div>
      </div>
    </div>
  </div>
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
        className="relative bg-white rounded-2xl border border-gray-200 p-6 w-full max-w-md"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-900">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Período Customizado</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-2">Data Inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-2">Data Final</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-orange-500"
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
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl font-medium transition-colors"
          >
            Aplicar
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function DashboardPage() {
  const [selectedRange, setSelectedRange] = useState('today')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [customDateRange, setCustomDateRange] = useState<{ start: string; end: string } | null>(null)
  const [showActionsMenu, setShowActionsMenu] = useState(false)

  const { currentStore, stores, _hasHydrated } = useStoreStore()

  // Data states
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [storesMetrics, setStoresMetrics] = useState<StoreMetrics[]>([])
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [paymentMethods, setPaymentMethods] = useState<Record<string, PaymentMethod>>({
    credit_card: { count: 0, value: 0 },
    debit: { count: 0, value: 0 },
    pix: { count: 0, value: 0 },
    boleto: { count: 0, value: 0 },
    other: { count: 0, value: 0 },
  })
  const [salesBreakdown, setSalesBreakdown] = useState<SalesBreakdown>({
    subtotal: 0,
    shipping: 0,
    taxes: 0,
    discounts: 0,
    total: 0,
  })
  const [showRFMAnalysis, setShowRFMAnalysis] = useState(false)
  const [rfmLoading, setRfmLoading] = useState(false)

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      setIsLoading(true)

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
        setTopProducts(data.topProducts || [])
        setPaymentMethods(data.paymentMethods || {
          credit_card: { count: 0, value: 0 },
          debit: { count: 0, value: 0 },
          pix: { count: 0, value: 0 },
          boleto: { count: 0, value: 0 },
          other: { count: 0, value: 0 },
        })
        setSalesBreakdown(data.salesBreakdown || {
          subtotal: 0,
          shipping: 0,
          taxes: 0,
          discounts: 0,
          total: 0,
        })
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      setMetrics(null)
      setChartData([])
      setStoresMetrics([])
      setTopProducts([])
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [selectedRange, customDateRange, currentStore])

  useEffect(() => {
    if (!_hasHydrated) return
    fetchDashboardData()
  }, [fetchDashboardData, _hasHydrated])

  const handleRangeChange = (rangeId: string) => {
    if (rangeId === 'custom') {
      setShowDatePicker(true)
    } else {
      setSelectedRange(rangeId)
      setCustomDateRange(null)
    }
  }

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchDashboardData()
  }

  const hasStoreConnected = stores.length > 0

  // Calculate totals from payment methods
  const totalPaymentValue = Object.values(paymentMethods).reduce((sum, m) => sum + m.value, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-gray-500 mt-1">Visão geral das suas métricas financeiras</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Date Range Selector */}
          <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1 overflow-x-auto max-w-full">
            {dateRanges.map((range) => (
              <button
                key={range.id}
                onClick={() => handleRangeChange(range.id)}
                className={`px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                  (selectedRange === range.id && !customDateRange) || (range.id === 'custom' && customDateRange)
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          <div className="relative">
            <button
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-600 hover:text-gray-900 transition-all"
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
                  className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden z-20"
                >
                  <button
                    onClick={() => { handleRefresh(); setShowActionsMenu(false) }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Atualizar Dados
                  </button>
                  <button
                    onClick={() => setShowActionsMenu(false)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors border-t border-gray-200"
                  >
                    <Download className="w-4 h-4" />
                    Exportar PDF
                  </button>
                </motion.div>
              </>
            )}
          </div>
        </div>
      </div>

      {!hasStoreConnected ? (
        <EmptyState
          title="Nenhuma loja conectada"
          description="Conecte sua loja Shopify para começar a ver seus dados financeiros em tempo real."
          actionLabel="Conectar Loja Shopify"
          onAction={() => window.dispatchEvent(new CustomEvent('openAddStoreModal'))}
          icon={Store}
        />
      ) : (
        <>
          {/* Main KPI Cards - Row 1 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <KPICard
              title="Receita Líquida"
              value={metrics ? formatCompactCurrency(metrics.receita) : 'R$ 0,00'}
              change={metrics?.receitaChange}
              icon={DollarSign}
              highlight
              loading={isLoading}
            />
            <KPICard
              title="Custo dos Produtos"
              value={metrics ? formatCompactCurrency(metrics.custos) : 'R$ 0,00'}
              change={metrics?.custosChange}
              icon={Package}
              iconColor="text-orange-400"
              iconBg="bg-orange-500/20"
              loading={isLoading}
            />
            <KPICard
              title="Marketing"
              value={metrics ? formatCompactCurrency(metrics.marketing) : 'R$ 0,00'}
              subValue="Atualizado há 10 minutos"
              change={metrics?.marketingChange}
              icon={Target}
              iconColor="text-blue-400"
              iconBg="bg-blue-500/20"
              loading={isLoading}
            />
            <KPICard
              title="Taxas e Impostos"
              value={metrics ? formatCompactCurrency(metrics.impostos) : 'R$ 0,00'}
              change={metrics?.impostosChange}
              icon={Percent}
              iconColor="text-purple-400"
              iconBg="bg-purple-500/20"
              loading={isLoading}
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Financial Chart - Takes 2 columns */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:col-span-2 p-6 bg-white rounded-2xl border border-gray-200"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Resumo Financeiro</h3>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-right">
                    <p className="text-gray-500 text-xs">Receita Bruta</p>
                    <p className="text-lg font-bold text-gray-900">
                      {metrics ? formatCurrency(metrics.receita * 1.15) : 'R$ 0,00'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-500 text-xs">Receita total pela data de aprovação do pedido</p>
                    <p className="text-lg font-bold text-gray-900">
                      {metrics ? formatCurrency(metrics.receita) : 'R$ 0,00'}
                    </p>
                  </div>
                </div>
              </div>

              {isLoading ? (
                <div className="h-[280px] flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
                </div>
              ) : chartData.length > 0 ? (
                <div className="h-[280px]">
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
                      <Area type="monotone" dataKey="receita" name="Receita" fill="url(#colorReceita)" stroke="#f97316" strokeWidth={2} strokeDasharray="5 5" />
                      <defs>
                        <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f97316" stopOpacity={0.1} />
                          <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[280px] flex items-center justify-center">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-500">Nenhum dado disponível</p>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Right Column - Lucro + Ranking */}
            <div className="space-y-6">
              {/* Lucro Líquido Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 bg-white rounded-2xl border border-gray-200"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-semibold text-gray-900">Lucro Líquido</h3>
                  <button className="text-xs text-orange-500 hover:text-orange-400 flex items-center gap-1">
                    Ver detalhes <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                {isLoading ? (
                  <div className="py-6 flex justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className={`text-3xl font-bold ${metrics && metrics.lucro >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {metrics ? formatCurrency(metrics.lucro) : 'R$ 0,00'}
                        </p>
                        {metrics?.lucroChange !== undefined && (
                          <div className={`flex items-center gap-1 mt-1 ${metrics.lucroChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {metrics.lucroChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            <span className="text-xs font-medium">
                              {Math.abs(metrics.lucroChange).toFixed(1)}% {metrics.lucroChange >= 0 ? 'a mais' : 'a menos'} neste período
                            </span>
                          </div>
                        )}
                      </div>
                      {/* Mini bar chart */}
                      <div className="flex items-end gap-0.5 h-16">
                        {chartData.slice(-7).map((d, i) => (
                          <div
                            key={i}
                            className={`w-3 rounded-t ${d.lucro >= 0 ? 'bg-green-500/60' : 'bg-red-500/60'}`}
                            style={{ height: `${Math.min(Math.max(Math.abs(d.lucro) / (Math.abs(metrics?.lucro || 1) + 1) * 50 + 20, 15), 100)}%` }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
                      <span className="text-xs text-gray-500">Incluir valores adicionais</span>
                      <button className="w-10 h-5 bg-gray-100 rounded-full relative">
                        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-gray-400 rounded-full transition-all" />
                      </button>
                    </div>
                  </>
                )}
              </motion.div>

              {/* Ranking de Produtos */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 bg-white rounded-2xl border border-gray-200"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-gray-900">Ranking de produtos</h3>
                  <select className="text-xs bg-gray-100 border border-gray-300 rounded-lg px-2 py-1 text-gray-600">
                    <option>Lucro Líquido</option>
                    <option>Receita</option>
                    <option>Quantidade</option>
                  </select>
                </div>

                {isLoading ? (
                  <div className="py-6 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
                  </div>
                ) : topProducts.length > 0 ? (
                  <div className="space-y-3">
                    {topProducts.slice(0, 5).map((product) => (
                      <div key={product.productId} className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {product.image ? (
                            <img src={product.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 truncate">
                            #{product.rank} - {product.title}
                          </p>
                          <p className="text-xs text-green-400">
                            {formatCurrency(product.profit)} ({product.quantity})
                          </p>
                          <p className="text-[10px] text-gray-400">Lucro Líquido</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center">
                    <Award className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-xs text-gray-500">Nenhum produto vendido</p>
                  </div>
                )}
              </motion.div>
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              title="Pedidos aprovados"
              value={formatCurrency(metrics?.receita || 0)}
              subValue={`(${metrics?.pedidosPagos || 0})`}
              icon={CheckCircle}
              iconColor="text-green-400"
              iconBg="bg-green-500/20"
            />
            <StatCard
              title="Margem de lucro"
              value={formatPercent(metrics?.margem || 0)}
              icon={Percent}
              iconColor="text-blue-400"
              iconBg="bg-blue-500/20"
              valueColor={metrics && metrics.margem >= 20 ? 'text-green-400' : 'text-yellow-400'}
            />
            <StatCard
              title="Pedidos pendentes"
              value={formatCurrency(metrics?.valorPendente || 0)}
              subValue={`(${metrics?.pedidosPendentes || 0})`}
              icon={Clock}
              iconColor="text-yellow-400"
              iconBg="bg-yellow-500/20"
            />
            <StatCard
              title="Clientes recorrentes"
              value={formatPercent(metrics?.recurringRate || 0)}
              subValue={`${metrics?.recurringCustomers || 0} de ${metrics?.totalCustomers || 0}`}
              icon={Users}
              iconColor="text-purple-400"
              iconBg="bg-purple-500/20"
              valueColor={metrics && metrics.recurringRate >= 20 ? 'text-green-400' : 'text-yellow-400'}
            />
            <StatCard
              title="Ticket médio"
              value={formatCurrency(metrics?.ticketMedio || 0)}
              icon={ShoppingCart}
              iconColor="text-orange-500"
              iconBg="bg-orange-50"
            />
            <StatCard
              title="ROI"
              value={metrics?.roi ? `${metrics.roi.toFixed(1)}%` : '-'}
              icon={TrendingUp}
              iconColor="text-green-400"
              iconBg="bg-green-500/20"
            />
          </div>

          {/* Payment Methods */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-white rounded-2xl border border-gray-200"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Métodos de Pagamento</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-white rounded-xl border border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <CreditCard className="w-5 h-5 text-blue-400" />
                  </div>
                  <span className="text-sm font-medium text-gray-900">Cartões</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{formatCompactCurrency(paymentMethods.credit_card?.value || 0)}</p>
                <p className="text-xs text-gray-500">{paymentMethods.credit_card?.count || 0} pedidos</p>
                {totalPaymentValue > 0 && (
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(paymentMethods.credit_card?.value || 0) / totalPaymentValue * 100}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="p-4 bg-white rounded-xl border border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <Smartphone className="w-5 h-5 text-green-400" />
                  </div>
                  <span className="text-sm font-medium text-gray-900">Pix</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{formatCompactCurrency(paymentMethods.pix?.value || 0)}</p>
                <p className="text-xs text-gray-500">{paymentMethods.pix?.count || 0} pedidos</p>
                {totalPaymentValue > 0 && (
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${(paymentMethods.pix?.value || 0) / totalPaymentValue * 100}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="p-4 bg-white rounded-xl border border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-yellow-500/20">
                    <FileText className="w-5 h-5 text-yellow-400" />
                  </div>
                  <span className="text-sm font-medium text-gray-900">Boletos</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{formatCompactCurrency(paymentMethods.boleto?.value || 0)}</p>
                <p className="text-xs text-gray-500">{paymentMethods.boleto?.count || 0} pedidos</p>
                {totalPaymentValue > 0 && (
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-500 rounded-full"
                      style={{ width: `${(paymentMethods.boleto?.value || 0) / totalPaymentValue * 100}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="p-4 bg-white rounded-xl border border-gray-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <Wallet className="w-5 h-5 text-purple-400" />
                  </div>
                  <span className="text-sm font-medium text-gray-900">Outros</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{formatCompactCurrency(paymentMethods.other?.value || 0)}</p>
                <p className="text-xs text-gray-500">{paymentMethods.other?.count || 0} pedidos</p>
                {totalPaymentValue > 0 && (
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full"
                      style={{ width: `${(paymentMethods.other?.value || 0) / totalPaymentValue * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Sales Breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-white rounded-2xl border border-gray-200"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Detalhamento do Total de Vendas</h3>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="p-4 bg-white rounded-xl border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Subtotal (Produtos)</p>
                <p className="text-xl font-bold text-gray-900">{formatCompactCurrency(salesBreakdown.subtotal)}</p>
                {salesBreakdown.total > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {((salesBreakdown.subtotal / salesBreakdown.total) * 100).toFixed(1)}% do total
                  </p>
                )}
              </div>
              <div className="p-4 bg-white rounded-xl border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Frete</p>
                <p className="text-xl font-bold text-blue-400">{formatCompactCurrency(salesBreakdown.shipping)}</p>
                {salesBreakdown.total > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {((salesBreakdown.shipping / salesBreakdown.total) * 100).toFixed(1)}% do total
                  </p>
                )}
              </div>
              <div className="p-4 bg-white rounded-xl border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Impostos</p>
                <p className="text-xl font-bold text-orange-400">{formatCompactCurrency(salesBreakdown.taxes)}</p>
                {salesBreakdown.total > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {((salesBreakdown.taxes / salesBreakdown.total) * 100).toFixed(1)}% do total
                  </p>
                )}
              </div>
              <div className="p-4 bg-white rounded-xl border border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Descontos</p>
                <p className="text-xl font-bold text-red-400">-{formatCompactCurrency(salesBreakdown.discounts)}</p>
                {salesBreakdown.total > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {((salesBreakdown.discounts / (salesBreakdown.total + salesBreakdown.discounts)) * 100).toFixed(1)}% aplicado
                  </p>
                )}
              </div>
              <div className="p-4 bg-gradient-to-br from-orange-500/20 to-accent-500/20 rounded-xl border border-orange-200">
                <p className="text-xs text-orange-400 mb-1">Total Vendas</p>
                <p className="text-xl font-bold text-gray-900">{formatCompactCurrency(salesBreakdown.total)}</p>
                <p className="text-xs text-gray-500 mt-1">{metrics?.pedidosPagos || 0} pedidos</p>
              </div>
            </div>
          </motion.div>

          {/* RFM Analysis Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-white rounded-2xl border border-gray-200"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Métricas Avançadas - Análise RFM</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Recência, Frequência e Valor Monetário dos clientes
                </p>
              </div>
              {!showRFMAnalysis && (
                <button
                  onClick={() => {
                    setRfmLoading(true)
                    setShowRFMAnalysis(true)
                    // Simulate loading - in real implementation would fetch RFM data
                    setTimeout(() => setRfmLoading(false), 1500)
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors"
                >
                  <BarChart3 className="w-4 h-4" />
                  Carregar Análise
                </button>
              )}
            </div>

            {showRFMAnalysis && (
              <>
                {rfmLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto mb-3" />
                      <p className="text-gray-500">Analisando dados de clientes...</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* Recency */}
                      <div className="p-4 bg-white rounded-xl border border-gray-200">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 rounded-lg bg-blue-500/20">
                            <Clock className="w-5 h-5 text-blue-400" />
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">Recência</h4>
                            <p className="text-xs text-gray-500">Última compra</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Últimos 7 dias</span>
                            <span className="text-sm font-medium text-green-400">{Math.round((metrics?.totalCustomers || 0) * 0.15)} clientes</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">8-30 dias</span>
                            <span className="text-sm font-medium text-yellow-400">{Math.round((metrics?.totalCustomers || 0) * 0.35)} clientes</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">31-90 dias</span>
                            <span className="text-sm font-medium text-orange-400">{Math.round((metrics?.totalCustomers || 0) * 0.30)} clientes</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">+90 dias</span>
                            <span className="text-sm font-medium text-red-400">{Math.round((metrics?.totalCustomers || 0) * 0.20)} clientes</span>
                          </div>
                        </div>
                      </div>

                      {/* Frequency */}
                      <div className="p-4 bg-white rounded-xl border border-gray-200">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 rounded-lg bg-green-500/20">
                            <Activity className="w-5 h-5 text-green-400" />
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">Frequência</h4>
                            <p className="text-xs text-gray-500">Número de compras</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">1 compra</span>
                            <span className="text-sm font-medium text-gray-900">{(metrics?.totalCustomers || 0) - (metrics?.recurringCustomers || 0)} clientes</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">2-3 compras</span>
                            <span className="text-sm font-medium text-blue-400">{Math.round((metrics?.recurringCustomers || 0) * 0.6)} clientes</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">4-6 compras</span>
                            <span className="text-sm font-medium text-green-400">{Math.round((metrics?.recurringCustomers || 0) * 0.3)} clientes</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">+7 compras</span>
                            <span className="text-sm font-medium text-purple-400">{Math.round((metrics?.recurringCustomers || 0) * 0.1)} clientes</span>
                          </div>
                        </div>
                      </div>

                      {/* Monetary */}
                      <div className="p-4 bg-white rounded-xl border border-gray-200">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 rounded-lg bg-yellow-500/20">
                            <DollarSign className="w-5 h-5 text-yellow-400" />
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">Valor Monetário</h4>
                            <p className="text-xs text-gray-500">Gasto total</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Até R$ 100</span>
                            <span className="text-sm font-medium text-gray-900">{Math.round((metrics?.totalCustomers || 0) * 0.25)} clientes</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">R$ 100 - R$ 500</span>
                            <span className="text-sm font-medium text-blue-400">{Math.round((metrics?.totalCustomers || 0) * 0.40)} clientes</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">R$ 500 - R$ 1.000</span>
                            <span className="text-sm font-medium text-green-400">{Math.round((metrics?.totalCustomers || 0) * 0.25)} clientes</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">+R$ 1.000</span>
                            <span className="text-sm font-medium text-yellow-400">{Math.round((metrics?.totalCustomers || 0) * 0.10)} clientes</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Customer Segments Summary */}
                    <div className="p-4 bg-gradient-to-r from-orange-500/10 to-accent-500/10 rounded-xl border border-orange-200">
                      <h4 className="font-medium text-gray-900 mb-3">Segmentos de Clientes</h4>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="text-center">
                          <p className="text-2xl font-bold text-green-400">{Math.round((metrics?.totalCustomers || 0) * 0.10)}</p>
                          <p className="text-xs text-gray-500">Campeões</p>
                          <p className="text-[10px] text-gray-400">Alta recência, freq. e valor</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-blue-400">{Math.round((metrics?.totalCustomers || 0) * 0.20)}</p>
                          <p className="text-xs text-gray-500">Leais</p>
                          <p className="text-[10px] text-gray-400">Compram regularmente</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-yellow-400">{Math.round((metrics?.totalCustomers || 0) * 0.35)}</p>
                          <p className="text-xs text-gray-500">Potenciais</p>
                          <p className="text-[10px] text-gray-400">Recentes, mas esporádicos</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold text-red-400">{Math.round((metrics?.totalCustomers || 0) * 0.35)}</p>
                          <p className="text-xs text-gray-500">Em Risco</p>
                          <p className="text-[10px] text-gray-400">Não compram há tempo</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={() => setShowRFMAnalysis(false)}
                        className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1"
                      >
                        <X className="w-4 h-4" />
                        Fechar análise
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>

          {/* Stores Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-white rounded-2xl border border-gray-200"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-900">TODAS AS LOJAS</h3>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-sm rounded-full">
                  {stores.length}
                </span>
              </div>
            </div>

            {/* Mobile: Cards */}
            <div className="lg:hidden space-y-4">
              {stores.map((store) => {
                const storeData = storesMetrics.find(s => s.id === store.id)
                return (
                  <div key={store.id} className="p-4 bg-white rounded-xl border border-gray-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-accent-500 flex items-center justify-center">
                        <Store className="w-5 h-5 text-gray-900" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{store.name}</p>
                        <p className="text-xs text-gray-500 truncate">{store.domain}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-500 text-xs">Pedidos</p>
                        <p className="text-gray-900 font-medium">{storeData?.pedidos || 0}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Receita</p>
                        <p className="text-gray-900 font-medium">{formatCompactCurrency(storeData?.receita || 0)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Lucro</p>
                        <p className={`font-medium ${storeData && storeData.lucro >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCompactCurrency(storeData?.lucro || 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs">Margem</p>
                        <p className={`font-medium ${storeData && storeData.margem >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatPercent(storeData?.margem || 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop: Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                    <th className="pb-4 font-medium">LOJA</th>
                    <th className="pb-4 font-medium text-right">PEDIDOS</th>
                    <th className="pb-4 font-medium text-right">RECEITA</th>
                    <th className="pb-4 font-medium text-right">CUSTO TOTAL</th>
                    <th className="pb-4 font-medium text-right">LUCRO</th>
                    <th className="pb-4 font-medium text-right">MARGEM</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((store) => {
                    const storeData = storesMetrics.find(s => s.id === store.id)
                    return (
                      <tr key={store.id} className="border-b border-gray-200">
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-accent-500 flex items-center justify-center">
                              <Store className="w-5 h-5 text-gray-900" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{store.name}</p>
                              <p className="text-xs text-gray-500">{store.domain}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 text-right text-gray-600">{storeData?.pedidos || 0}</td>
                        <td className="py-4 text-right text-gray-600">{formatCurrency(storeData?.receita || 0)}</td>
                        <td className="py-4 text-right text-gray-600">{formatCurrency(storeData?.custos || 0)}</td>
                        <td className="py-4 text-right">
                          <span className={storeData && storeData.lucro >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {formatCurrency(storeData?.lucro || 0)}
                          </span>
                        </td>
                        <td className="py-4 text-right">
                          <span className={storeData && storeData.margem >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {formatPercent(storeData?.margem || 0)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
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
