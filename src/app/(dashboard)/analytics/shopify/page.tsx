'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Users,
  Package,
  RefreshCw,
  Calendar,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Truck,
  Tag,
  RotateCcw,
  CreditCard,
  BarChart3,
  PieChart,
} from 'lucide-react'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

// Types
interface ShopifyAnalytics {
  // Resumo
  vendasBrutas: number
  vendasBrutasChange: number
  taxaClientesRecorrentes: number
  taxaClientesRecorrentesChange: number
  pedidosProcessados: number
  pedidosProcessadosChange: number
  pedidos: number
  pedidosChange: number
  
  // Detalhamento
  descontos: number
  descontosChange: number
  devolucoes: number
  devolucoesChange: number
  vendasLiquidas: number
  vendasLiquidasChange: number
  cobrancasFrete: number
  cobrancasFreteChange: number
  tributos: number
  tributosChange: number
  totalVendas: number
  totalVendasChange: number
  
  // Ticket médio
  ticketMedio: number
  ticketMedioChange: number
  
  // Dados para gráficos
  vendasPorDia: Array<{ date: string; vendas: number; anterior: number }>
  vendasPorProduto: Array<{ nome: string; vendas: number; quantidade: number; change: number }>
  vendasPorCanal: Array<{ nome: string; vendas: number }>
  
  // Clientes
  clientesNovos: number
  clientesRecorrentes: number
}

const COLORS = ['#f97316', '#22c55e', '#3b82f6', '#eab308', '#ec4899', '#8b5cf6']

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
  const prefix = value >= 0 ? '+' : ''
  return `${prefix}${value.toFixed(0)}%`
}

// Componente de Card de Métrica
const MetricCard = ({ 
  title, 
  value, 
  change, 
  icon: Icon,
  format = 'currency',
  small = false,
}: {
  title: string
  value: number
  change?: number
  icon?: React.ElementType
  format?: 'currency' | 'number' | 'percent'
  small?: boolean
}) => {
  const formattedValue = format === 'currency' 
    ? formatCurrency(value) 
    : format === 'percent' 
      ? `${value.toFixed(2)}%`
      : formatNumber(value)

  return (
    <div className={`bg-dark-800/60 border border-dark-700/50 rounded-xl ${small ? 'p-4' : 'p-5'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-dark-400 mb-1">{title}</p>
          <p className={`font-bold text-white ${small ? 'text-xl' : 'text-2xl'}`}>{formattedValue}</p>
        </div>
        {Icon && (
          <div className="p-2 rounded-lg bg-dark-700/50">
            <Icon className="w-5 h-5 text-primary-400" />
          </div>
        )}
      </div>
      {change !== undefined && (
        <div className={`flex items-center gap-1 mt-2 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span className="text-sm font-medium">{formatPercent(change)}</span>
        </div>
      )}
    </div>
  )
}

// Componente de linha de detalhamento
const DetailRow = ({
  label,
  value,
  change,
  isNegative = false,
}: {
  label: string
  value: number
  change?: number
  isNegative?: boolean
}) => (
  <div className="flex items-center justify-between py-3 border-b border-dark-700/30 last:border-0">
    <span className={`text-sm ${isNegative ? 'text-red-400' : 'text-dark-300'}`}>{label}</span>
    <div className="flex items-center gap-3">
      <span className={`font-medium ${isNegative ? 'text-red-400' : 'text-white'}`}>
        {isNegative ? '-' : ''}{formatCurrency(Math.abs(value))}
      </span>
      {change !== undefined && (
        <span className={`text-xs px-2 py-0.5 rounded ${change >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {formatPercent(change)}
        </span>
      )}
    </div>
  </div>
)

export default function ShopifyAnalyticsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState('7d')
  const [data, setData] = useState<ShopifyAnalytics | null>(null)

  const periods = [
    { id: 'today', label: 'Hoje' },
    { id: 'yesterday', label: 'Ontem' },
    { id: '7d', label: '7 dias' },
    { id: '30d', label: '30 dias' },
    { id: '90d', label: '90 dias' },
  ]

  const fetchData = async () => {
    try {
      const response = await fetch(`/api/analytics/shopify?period=${selectedPeriod}`)
      const result = await response.json()
      
      if (result.success) {
        setData(result.data)
      }
    } catch (error) {
      console.error('Error fetching Shopify analytics:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [selectedPeriod])

  const handleRefresh = () => {
    setIsRefreshing(true)
    fetchData()
  }

  const handleSync = async () => {
    setIsRefreshing(true)
    try {
      const response = await fetch('/api/shopify/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const result = await response.json()
      if (result.success) {
        fetchData()
      }
    } catch (error) {
      console.error('Sync error:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Shopify Analytics</h1>
          <p className="text-dark-400 mt-1">Análise detalhada das vendas da sua loja</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <div className="flex items-center bg-dark-800/50 border border-dark-700/50 rounded-xl p-1">
            {periods.map((period) => (
              <button
                key={period.id}
                onClick={() => setSelectedPeriod(period.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                  selectedPeriod === period.id
                    ? 'bg-dark-700 text-white'
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>

          {/* Sync Button */}
          <button
            onClick={handleSync}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
        </div>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Vendas brutas"
          value={data?.vendasBrutas || 0}
          change={data?.vendasBrutasChange}
          icon={DollarSign}
        />
        <MetricCard
          title="Taxa de clientes recorrentes"
          value={data?.taxaClientesRecorrentes || 0}
          change={data?.taxaClientesRecorrentesChange}
          icon={Users}
          format="percent"
        />
        <MetricCard
          title="Pedidos processados"
          value={data?.pedidosProcessados || 0}
          change={data?.pedidosProcessadosChange}
          icon={Package}
          format="number"
        />
        <MetricCard
          title="Pedidos"
          value={data?.pedidos || 0}
          change={data?.pedidosChange}
          icon={ShoppingCart}
          format="number"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Over Time Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 p-6 bg-dark-800/40 rounded-2xl border border-dark-700/30"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-white">Total de vendas ao longo do tempo</h3>
              <p className="text-2xl font-bold text-primary-400 mt-1">
                {formatCurrency(data?.totalVendas || 0)}
                {data?.totalVendasChange !== undefined && (
                  <span className={`text-sm ml-2 ${data.totalVendasChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatPercent(data.totalVendasChange)}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.vendasPorDia || []}>
                <defs>
                  <linearGradient id="colorVendas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorAnterior" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => `R$ ${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '12px',
                  }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Area
                  type="monotone"
                  dataKey="vendas"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorVendas)"
                  name="Período atual"
                />
                <Area
                  type="monotone"
                  dataKey="anterior"
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  fillOpacity={1}
                  fill="url(#colorAnterior)"
                  name="Período anterior"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Sales Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 bg-dark-800/40 rounded-2xl border border-dark-700/30"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Detalhamento do total de vendas</h3>
          
          <div className="space-y-1">
            <DetailRow label="Vendas brutas" value={data?.vendasBrutas || 0} change={data?.vendasBrutasChange} />
            <DetailRow label="Descontos" value={data?.descontos || 0} change={data?.descontosChange} isNegative />
            <DetailRow label="Devoluções" value={data?.devolucoes || 0} change={data?.devolucoesChange} isNegative />
            <DetailRow label="Vendas líquidas" value={data?.vendasLiquidas || 0} change={data?.vendasLiquidasChange} />
            <DetailRow label="Cobranças de frete" value={data?.cobrancasFrete || 0} change={data?.cobrancasFreteChange} />
            <DetailRow label="Tributos" value={data?.tributos || 0} change={data?.tributosChange} />
            <div className="pt-2 mt-2 border-t border-dark-600">
              <DetailRow label="Total de vendas" value={data?.totalVendas || 0} change={data?.totalVendasChange} />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales by Channel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 bg-dark-800/40 rounded-2xl border border-dark-700/30"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Total de vendas por canal</h3>
          
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={data?.vendasPorCanal || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="vendas"
                  nameKey="nome"
                >
                  {(data?.vendasPorCanal || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => formatCurrency(value)}
                />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 space-y-2">
            {(data?.vendasPorCanal || []).map((canal, index) => (
              <div key={canal.nome} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-dark-300">{canal.nome}</span>
                </div>
                <span className="text-white font-medium">{formatCurrency(canal.vendas)}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Average Order Value */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 bg-dark-800/40 rounded-2xl border border-dark-700/30"
        >
          <h3 className="text-lg font-semibold text-white mb-2">Valor médio do pedido</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-white">{formatCurrency(data?.ticketMedio || 0)}</p>
            {data?.ticketMedioChange !== undefined && (
              <span className={`text-sm ${data.ticketMedioChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatPercent(data.ticketMedioChange)}
              </span>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="p-4 bg-dark-700/30 rounded-xl">
              <p className="text-sm text-dark-400">Clientes novos</p>
              <p className="text-xl font-bold text-white mt-1">{formatNumber(data?.clientesNovos || 0)}</p>
            </div>
            <div className="p-4 bg-dark-700/30 rounded-xl">
              <p className="text-sm text-dark-400">Clientes recorrentes</p>
              <p className="text-xl font-bold text-white mt-1">{formatNumber(data?.clientesRecorrentes || 0)}</p>
            </div>
          </div>
        </motion.div>

        {/* Top Products */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 bg-dark-800/40 rounded-2xl border border-dark-700/30"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Total de vendas por produto</h3>
          
          <div className="space-y-3">
            {(data?.vendasPorProduto || []).slice(0, 5).map((produto, index) => (
              <div key={produto.nome} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{produto.nome}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary-500 rounded-full"
                        style={{ width: `${(produto.vendas / (data?.vendasPorProduto?.[0]?.vendas || 1)) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-dark-400">{formatCurrency(produto.vendas)}</span>
                  </div>
                </div>
                {produto.change !== undefined && (
                  <span className={`text-xs px-2 py-0.5 rounded ${produto.change >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {formatPercent(produto.change)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Additional Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Descontos aplicados"
          value={data?.descontos || 0}
          change={data?.descontosChange}
          icon={Tag}
          small
        />
        <MetricCard
          title="Cobranças de frete"
          value={data?.cobrancasFrete || 0}
          change={data?.cobrancasFreteChange}
          icon={Truck}
          small
        />
        <MetricCard
          title="Devoluções"
          value={data?.devolucoes || 0}
          change={data?.devolucoesChange}
          icon={RotateCcw}
          small
        />
        <MetricCard
          title="Tributos"
          value={data?.tributos || 0}
          change={data?.tributosChange}
          icon={CreditCard}
          small
        />
      </div>
    </div>
  )
}
