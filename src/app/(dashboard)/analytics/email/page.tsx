'use client'

import { useState, useEffect } from 'react'
import {
  Mail,
  Send,
  Eye,
  MousePointer,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  CheckCircle,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

// Types
interface EmailMetrics {
  emailsSent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  openRate: string
  clickRate: string
  bounceRate: string
}

interface TimelineEntry {
  date: string
  sent: number
  opened: number
  clicked: number
}

interface Campaign {
  id: string
  name: string
  subject?: string
  status?: string
  created_at: string
  sent_count?: number
  open_rate?: number
  click_rate?: number
}

interface AnalyticsData {
  metrics: EmailMetrics | null
  timeline: TimelineEntry[]
  campaigns: Campaign[]
}

// KPI Card
function KPICard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'orange',
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color?: 'orange' | 'blue' | 'green' | 'red'
}) {
  const colorMap = {
    orange: 'bg-orange-50 text-orange-500',
    blue: 'bg-blue-50 text-blue-500',
    green: 'bg-green-50 text-green-500',
    red: 'bg-red-50 text-red-500',
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      <div className={`w-10 h-10 rounded-xl ${colorMap[color]} flex items-center justify-center mb-4`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-1">{value}</div>
      <div className="text-sm font-medium text-gray-500">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

// Deliverability Score
function DeliverabilityScore({ metrics }: { metrics: EmailMetrics }) {
  const delivered = metrics.delivered
  const total = metrics.emailsSent
  const score = total > 0 ? Math.round((delivered / total) * 100) : 0

  const getColor = (s: number) => {
    if (s >= 95) return { bar: 'bg-green-500', text: 'text-green-600', label: 'Excelente' }
    if (s >= 85) return { bar: 'bg-blue-500', text: 'text-blue-600', label: 'Bom' }
    if (s >= 70) return { bar: 'bg-amber-500', text: 'text-amber-600', label: 'Regular' }
    return { bar: 'bg-red-500', text: 'text-red-600', label: 'Ruim' }
  }

  const { bar, text, label } = getColor(score)

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <CheckCircle className="w-5 h-5 text-orange-500" />
        <h3 className="text-base font-semibold text-gray-900">Score de Entregabilidade</h3>
      </div>
      <div className="flex items-end gap-3 mb-3">
        <span className={`text-4xl font-bold ${text}`}>{score}%</span>
        <span className={`text-sm font-medium ${text} mb-1`}>{label}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${bar}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div className="text-gray-500">
          Enviados: <span className="font-semibold text-gray-700">{total.toLocaleString('pt-BR')}</span>
        </div>
        <div className="text-gray-500">
          Entregues: <span className="font-semibold text-gray-700">{delivered.toLocaleString('pt-BR')}</span>
        </div>
      </div>
    </div>
  )
}

// Main Page
export default function EmailAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData>({
    metrics: null,
    timeline: [],
    campaigns: [],
  })
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  const fetchData = async (d: number = days) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/analytics/email-dashboard?days=${d}`)
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setData(json)
    } catch {
      // Keep zeros on error
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [days])

  const metrics = data.metrics || {
    emailsSent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    openRate: '0',
    clickRate: '0',
    bounceRate: '0',
  }

  const isEmpty = metrics.emailsSent === 0

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics de Email</h1>
          <p className="text-gray-500 mt-1">Performance das suas campanhas de email marketing</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Days selector */}
          <div className="flex items-center gap-1 border border-gray-200 rounded-xl p-1 bg-white">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  days === d
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Empty state notice */}
      {isEmpty && !loading && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0" />
          <p className="text-sm text-orange-700">
            Configure email marketing para ver métricas. Os dados aparecerão aqui assim que você enviar suas primeiras campanhas.
          </p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={Send}
          label="Emails Enviados"
          value={metrics.emailsSent.toLocaleString('pt-BR')}
          sub={`${metrics.delivered.toLocaleString('pt-BR')} entregues`}
          color="orange"
        />
        <KPICard
          icon={Eye}
          label="Open Rate"
          value={`${metrics.openRate}%`}
          sub={`${metrics.opened.toLocaleString('pt-BR')} abertos`}
          color="blue"
        />
        <KPICard
          icon={MousePointer}
          label="Click Rate"
          value={`${metrics.clickRate}%`}
          sub={`${metrics.clicked.toLocaleString('pt-BR')} cliques`}
          color="green"
        />
        <KPICard
          icon={AlertTriangle}
          label="Bounce Rate"
          value={`${metrics.bounceRate}%`}
          sub={`${metrics.bounced.toLocaleString('pt-BR')} bounces`}
          color="red"
        />
      </div>

      {/* Chart + Deliverability Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Line Chart */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-6">Emails ao Longo do Tempo</h3>
          {data.timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.timeline} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="date"
                  stroke="#9ca3af"
                  fontSize={11}
                  tickFormatter={(v) => {
                    const d = new Date(v)
                    return `${d.getDate()}/${d.getMonth() + 1}`
                  }}
                />
                <YAxis stroke="#9ca3af" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                  labelFormatter={(v) => new Date(v).toLocaleDateString('pt-BR')}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }} />
                <Line
                  type="monotone"
                  dataKey="sent"
                  name="Enviados"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="opened"
                  name="Abertos"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="clicked"
                  name="Clicados"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Mail className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">Sem dados de timeline disponíveis</p>
            </div>
          )}
        </div>

        {/* Deliverability Score */}
        <DeliverabilityScore metrics={metrics} />
      </div>

      {/* Top Campaigns Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Campanhas Recentes</h3>
          <p className="text-sm text-gray-500 mt-0.5">Últimas campanhas de email marketing</p>
        </div>
        {data.campaigns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Campanha</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Enviados</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Open Rate</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Click Rate</th>
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Data</th>
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((campaign, index) => (
                  <tr
                    key={campaign.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${index === data.campaigns.length - 1 ? 'border-b-0' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900 text-sm">{campaign.name}</div>
                      {campaign.subject && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{campaign.subject}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        campaign.status === 'sent' || campaign.status === 'completed'
                          ? 'bg-green-50 text-green-700'
                          : campaign.status === 'draft'
                          ? 'bg-gray-100 text-gray-600'
                          : campaign.status === 'scheduled'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-orange-50 text-orange-700'
                      }`}>
                        {campaign.status || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-700 font-medium">
                      {(campaign.sent_count || 0).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-700">
                      {campaign.open_rate !== undefined ? `${campaign.open_rate.toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-700">
                      {campaign.click_rate !== undefined ? `${campaign.click_rate.toFixed(1)}%` : '-'}
                    </td>
                    <td className="px-6 py-4 text-right text-xs text-gray-400">
                      {new Date(campaign.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Mail className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium text-gray-500">Nenhuma campanha encontrada</p>
            <p className="text-xs text-gray-400 mt-1">Configure email marketing para ver métricas</p>
          </div>
        )}
      </div>
    </div>
  )
}
