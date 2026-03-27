'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  Crown,
  Heart,
  Star,
  Clock,
  AlertTriangle,
  Moon,
  Skull,
  TrendingUp,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  Mail,
  Target,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

// =============================================
// TYPES
// =============================================

interface RFMScore {
  shopify_customer_id: string
  customer_email: string | null
  recency_score: number
  frequency_score: number
  monetary_score: number
  days_since_last_order: number
  total_orders: number
  total_spent: number
  average_order_value: number
  segment: string
  segment_label: string
  first_order_date: string | null
  last_order_date: string | null
}

interface RFMSummary {
  segment: string
  label: string
  count: number
  percentage: number
  avgRecency: number
  avgFrequency: number
  avgMonetary: number
  totalRevenue: number
}

interface RFMDashboardProps {
  storeId: string
}

// =============================================
// SEGMENT CONFIG
// =============================================

const SEGMENT_CONFIG: Record<string, {
  icon: React.ElementType
  color: string
  bgColor: string
  description: string
  action: string
}> = {
  champion: {
    icon: Crown,
    color: '#22c55e',
    bgColor: 'bg-green-500/10',
    description: 'Compraram recentemente, frequentemente e gastam muito',
    action: 'Ofereça programa VIP exclusivo',
  },
  loyal: {
    icon: Heart,
    color: '#3b82f6',
    bgColor: 'bg-blue-500/10',
    description: 'Gastam bem e compram com frequência',
    action: 'Peça indicações e avaliações',
  },
  potential_loyalist: {
    icon: Star,
    color: '#8b5cf6',
    bgColor: 'bg-purple-500/10',
    description: 'Clientes recentes com boa frequência',
    action: 'Ofereça programa de fidelidade',
  },
  recent: {
    icon: TrendingUp,
    color: '#06b6d4',
    bgColor: 'bg-cyan-500/10',
    description: 'Compraram recentemente mas sem histórico',
    action: 'Envie boas-vindas e segunda compra',
  },
  promising: {
    icon: Target,
    color: '#eab308',
    bgColor: 'bg-yellow-500/10',
    description: 'Compradores recentes com potencial',
    action: 'Nurture com conteúdo relevante',
  },
  need_attention: {
    icon: AlertTriangle,
    color: '#f97316',
    bgColor: 'bg-orange-500/10',
    description: 'Acima da média mas não compram há tempo',
    action: 'Reative com ofertas personalizadas',
  },
  about_to_sleep: {
    icon: Moon,
    color: '#a855f7',
    bgColor: 'bg-purple-500/10',
    description: 'Abaixo da média, podem dormir em breve',
    action: 'Envie email de "sentimos sua falta"',
  },
  at_risk: {
    icon: AlertTriangle,
    color: '#ef4444',
    bgColor: 'bg-red-500/10',
    description: 'Gastaram muito mas não compram há tempo',
    action: 'Campanha de reativação urgente',
  },
  cant_lose: {
    icon: Heart,
    color: '#dc2626',
    bgColor: 'bg-red-500/10',
    description: 'Grandes compradores que pararam',
    action: 'Contato pessoal ou oferta exclusiva',
  },
  hibernating: {
    icon: Clock,
    color: '#6b7280',
    bgColor: 'bg-gray-500/10',
    description: 'Última compra há muito tempo, baixa frequência',
    action: 'Campanha de desconto agressivo',
  },
  lost: {
    icon: Skull,
    color: '#374151',
    bgColor: 'bg-gray-500/10',
    description: 'Baixo valor e há muito tempo sem comprar',
    action: 'Considere remover da lista ativa',
  },
}

// =============================================
// COMPONENT
// =============================================

export function RFMDashboard({ storeId }: RFMDashboardProps) {
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [summary, setSummary] = useState<RFMSummary[]>([])
  const [scores, setScores] = useState<RFMScore[]>([])
  const [selectedSegment, setSelectedSegment] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastCalculated, setLastCalculated] = useState<string | null>(null)

  // Fetch RFM data
  const fetchRFMData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch summary
      const summaryRes = await fetch(`/api/shopify/analytics/rfm?storeId=${storeId}&view=summary`)
      const summaryData = await summaryRes.json()

      if (summaryData.success && summaryData.data) {
        setSummary(summaryData.data.segments || [])
        setLastCalculated(summaryData.data.lastCalculated || null)
      }

      // Fetch scores
      const scoresRes = await fetch(`/api/shopify/analytics/rfm?storeId=${storeId}&view=scores`)
      const scoresData = await scoresRes.json()

      if (scoresData.success && scoresData.data) {
        setScores(scoresData.data || [])
      }
    } catch (err) {
      setError('Erro ao carregar dados RFM')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Calculate RFM
  const calculateRFM = async () => {
    try {
      setCalculating(true)
      setError(null)

      const res = await fetch('/api/shopify/analytics/rfm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })

      const data = await res.json()

      if (data.success) {
        await fetchRFMData()
      } else {
        setError(data.error || 'Erro ao calcular RFM')
      }
    } catch (err) {
      setError('Erro ao calcular RFM')
      console.error(err)
    } finally {
      setCalculating(false)
    }
  }

  useEffect(() => {
    if (storeId) {
      fetchRFMData()
    }
  }, [storeId])

  // Prepare chart data
  const pieData = summary.map(s => ({
    name: SEGMENT_CONFIG[s.segment]?.description || s.label,
    label: s.label,
    value: s.count,
    color: SEGMENT_CONFIG[s.segment]?.color || '#6b7280',
  })).filter(d => d.value > 0)

  const barData = summary.map(s => ({
    segment: s.label.substring(0, 10),
    revenue: s.totalRevenue,
    count: s.count,
    color: SEGMENT_CONFIG[s.segment]?.color || '#6b7280',
  })).filter(d => d.count > 0).sort((a, b) => b.revenue - a.revenue)

  // Filter scores by segment
  const filteredScores = selectedSegment
    ? scores.filter(s => s.segment === selectedSegment)
    : scores

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Segmentação RFM</h2>
          <p className="text-sm text-gray-400">
            Análise de Recência, Frequência e Valor Monetário
          </p>
          {lastCalculated && (
            <p className="text-xs text-gray-500 mt-1">
              Última atualização: {new Date(lastCalculated).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
        <button
          onClick={calculateRFM}
          disabled={calculating}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {calculating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {calculating ? 'Calculando...' : 'Recalcular'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Segment Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {summary.map(s => {
          const config = SEGMENT_CONFIG[s.segment] || {
            icon: Users,
            color: '#6b7280',
            bgColor: 'bg-gray-500/10',
          }
          const Icon = config.icon

          return (
            <motion.div
              key={s.segment}
              whileHover={{ scale: 1.02 }}
              onClick={() => setSelectedSegment(selectedSegment === s.segment ? null : s.segment)}
              className={`p-4 rounded-xl cursor-pointer transition-all ${
                selectedSegment === s.segment
                  ? 'ring-2 ring-violet-500 bg-violet-500/10'
                  : 'bg-[#1a1a2e] hover:bg-[#252540]'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className={`p-2 rounded-lg ${config.bgColor}`}
                  style={{ color: config.color }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-2xl font-bold text-gray-900">{s.count}</span>
              </div>
              <p className="text-xs text-gray-400 truncate">{s.label}</p>
              <p className="text-xs text-gray-500">{s.percentage.toFixed(1)}%</p>
            </motion.div>
          )
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <div className="bg-[#1a1a2e] rounded-xl p-6">
          <h3 className="text-lg font-medium text-white mb-4">Distribuição de Clientes</h3>
          <div className="h-72">
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
                  label={({ label, percent }) => `${label} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #333',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`${value} clientes`, 'Quantidade']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart - Revenue by Segment */}
        <div className="bg-[#1a1a2e] rounded-xl p-6">
          <h3 className="text-lg font-medium text-white mb-4">Receita por Segmento</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis
                  type="number"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  type="category"
                  dataKey="segment"
                  tick={{ fill: '#9ca3af', fontSize: 11 }}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #333',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Receita']}
                />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                  {barData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Segment Detail */}
      <AnimatePresence>
        {selectedSegment && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-[#1a1a2e] rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                {(() => {
                  const config = SEGMENT_CONFIG[selectedSegment]
                  const Icon = config?.icon || Users
                  return (
                    <>
                      <div
                        className={`p-3 rounded-lg ${config?.bgColor || 'bg-gray-500/10'}`}
                        style={{ color: config?.color || '#6b7280' }}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-white">
                          {summary.find(s => s.segment === selectedSegment)?.label}
                        </h3>
                        <p className="text-sm text-gray-400">{config?.description}</p>
                      </div>
                    </>
                  )
                })()}
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm text-gray-400">Ação Recomendada</p>
                  <p className="text-sm text-violet-400 font-medium">
                    {SEGMENT_CONFIG[selectedSegment]?.action}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedSegment(null)}
                  className="p-2 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <ChevronUp className="h-5 w-5 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Customer List */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <th className="pb-3 pr-4">Email</th>
                    <th className="pb-3 pr-4 text-center">R</th>
                    <th className="pb-3 pr-4 text-center">F</th>
                    <th className="pb-3 pr-4 text-center">M</th>
                    <th className="pb-3 pr-4 text-right">Total Gasto</th>
                    <th className="pb-3 pr-4 text-right">Pedidos</th>
                    <th className="pb-3 text-right">Última Compra</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredScores.slice(0, 10).map((score, idx) => (
                    <tr key={score.shopify_customer_id} className="border-t border-gray-800">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-gray-500" />
                          <span className="text-gray-300">
                            {score.customer_email || 'Sem email'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          score.recency_score >= 4 ? 'bg-green-500/20 text-green-400' :
                          score.recency_score >= 3 ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {score.recency_score}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          score.frequency_score >= 4 ? 'bg-green-500/20 text-green-400' :
                          score.frequency_score >= 3 ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {score.frequency_score}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          score.monetary_score >= 4 ? 'bg-green-500/20 text-green-400' :
                          score.monetary_score >= 3 ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {score.monetary_score}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right text-gray-300">
                        R$ {score.total_spent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 pr-4 text-right text-gray-300">
                        {score.total_orders}
                      </td>
                      <td className="py-3 text-right text-gray-400">
                        {score.days_since_last_order} dias
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredScores.length > 10 && (
                <p className="text-center text-sm text-gray-500 mt-4">
                  Mostrando 10 de {filteredScores.length} clientes
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            segments: ['at_risk', 'cant_lose'],
            title: 'Reativação Urgente',
            icon: AlertTriangle,
            color: 'red',
            count: summary.filter(s => ['at_risk', 'cant_lose'].includes(s.segment)).reduce((a, b) => a + b.count, 0),
          },
          {
            segments: ['champion', 'loyal'],
            title: 'Programa VIP',
            icon: Crown,
            color: 'green',
            count: summary.filter(s => ['champion', 'loyal'].includes(s.segment)).reduce((a, b) => a + b.count, 0),
          },
          {
            segments: ['recent', 'potential_loyalist'],
            title: 'Nurturing',
            icon: TrendingUp,
            color: 'blue',
            count: summary.filter(s => ['recent', 'potential_loyalist'].includes(s.segment)).reduce((a, b) => a + b.count, 0),
          },
        ].map(action => (
          <div
            key={action.title}
            className={`p-4 rounded-xl bg-${action.color}-500/10 border border-${action.color}-500/20`}
          >
            <div className="flex items-center gap-3 mb-2">
              <action.icon className={`h-5 w-5 text-${action.color}-400`} />
              <span className="font-medium text-white">{action.title}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{action.count}</p>
            <p className="text-sm text-gray-400">clientes elegíveis</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default RFMDashboard
