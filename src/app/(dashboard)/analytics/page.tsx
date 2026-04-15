'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ChartLineUp,
  TrendUp,
  TrendDown,
  CurrencyDollar,
  EnvelopeSimple,
  WhatsappLogo,
  DeviceMobileSpeaker,
  ChatCircle,
  UsersThree,
  Eye,
  CursorClick,
  ArrowsClockwise,
  CalendarBlank,
  CaretDown,
  Export,
  FunnelSimple,
} from '@phosphor-icons/react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

const periods = ['7d', '30d', '90d', '12m'] as const
type Period = typeof periods[number]

const iconMap: Record<string, React.ComponentType<any>> = {
  CurrencyDollar, EnvelopeSimple, Eye, CursorClick, ArrowsClockwise, UsersThree,
}

const channelIcon: Record<string, React.ComponentType<any>> = {
  email: EnvelopeSimple,
  whatsapp: WhatsappLogo,
  sms: DeviceMobileSpeaker,
  chat: ChatCircle,
}

interface OverviewData {
  kpis: Array<{ title: string; value: string; change: string; positive: boolean; icon: string }>
  revenueSeries: Array<{ date: string; email: number; whatsapp: number; sms: number; total: number }>
  engagementSeries: Array<{ date: string; opens: number; clicks: number; conversions: number }>
  channelBreakdown: Array<{ name: string; value: number; color: string }>
  topCampaigns: Array<{ name: string; channel: string; sent: number; opened: number; clicked: number; revenue: string }>
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d')
  const [chartView, setChartView] = useState<'revenue' | 'engagement'>('revenue')
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/analytics/overview?period=${period}`)
      .then((r) => r.json())
      .then((json) => { if (!cancelled) setData(json) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period])

  const kpis = data?.kpis || []
  const revenueData = data?.revenueSeries || []
  const engagementData = data?.engagementSeries || []
  const channelBreakdown = data?.channelBreakdown || []
  const topCampaigns = data?.topCampaigns || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">Visão geral de performance de todos os canais</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-50/50 rounded-lg p-1">
            {periods.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  period === p ? 'bg-brand-500 text-white' : 'text-gray-500 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm">
            <Export size={16} />
            Exportar
          </button>
        </div>
      </div>

      {/* KPIs */}
      {loading && (
        <div className="text-xs text-gray-500">Carregando dados…</div>
      )}
      {!loading && kpis.length === 0 && (
        <div className="bg-white/50 border border-dashed border-gray-200 rounded-xl p-8 text-center text-sm text-gray-500">
          Sem dados no período selecionado. Envie uma campanha ou conecte uma loja para começar a ver analytics.
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = iconMap[kpi.icon] || CurrencyDollar
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white/50 border border-gray-200 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className="text-gray-500" />
                <span className="text-xs text-gray-500">{kpi.title}</span>
              </div>
              <p className="text-lg font-bold text-gray-900">{kpi.value}</p>
              <span className={`text-xs ${kpi.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                {kpi.change}
              </span>
            </motion.div>
          )
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="lg:col-span-2 bg-white/50 border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-2">
              <button
                onClick={() => setChartView('revenue')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  chartView === 'revenue' ? 'bg-gray-100 text-white' : 'text-gray-500 hover:text-white'
                }`}
              >
                Receita
              </button>
              <button
                onClick={() => setChartView('engagement')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  chartView === 'engagement' ? 'bg-gray-100 text-white' : 'text-gray-500 hover:text-white'
                }`}
              >
                Engajamento
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            {chartView === 'revenue' ? (
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="gradEmail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F26B2A" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F26B2A" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradWhatsapp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#25D366" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#25D366" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradSms" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff' }}
                  formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, '']}
                />
                <Area type="monotone" dataKey="email" stroke="#F26B2A" fill="url(#gradEmail)" strokeWidth={2} name="E-mail" />
                <Area type="monotone" dataKey="whatsapp" stroke="#25D366" fill="url(#gradWhatsapp)" strokeWidth={2} name="WhatsApp" />
                <Area type="monotone" dataKey="sms" stroke="#8B5CF6" fill="url(#gradSms)" strokeWidth={2} name="SMS" />
              </AreaChart>
            ) : (
              <AreaChart data={engagementData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="opens" stroke="#F26B2A" fill="url(#gradEmail)" strokeWidth={2} name="Aberturas" />
                <Area type="monotone" dataKey="clicks" stroke="#3B82F6" fill="none" strokeWidth={2} name="Cliques" />
                <Area type="monotone" dataKey="conversions" stroke="#10B981" fill="none" strokeWidth={2} name="Conversões" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Channel Breakdown */}
        <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Receita por Canal</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={channelBreakdown}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={4}
                dataKey="value"
              >
                {channelBreakdown.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                formatter={(value: number) => [`${value}%`, '']}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-4">
            {channelBreakdown.map((ch) => (
              <div key={ch.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ch.color }} />
                  <span className="text-gray-500">{ch.name}</span>
                </div>
                <span className="text-gray-900 font-medium">{ch.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Campaigns Table */}
      <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Top Campanhas por Receita</h3>
          <button className="text-xs text-[#F26B2A] hover:text-[#F5A623] transition-colors">
            Ver todas →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left text-xs text-gray-500 font-medium pb-3">Campanha</th>
                <th className="text-left text-xs text-gray-500 font-medium pb-3">Canal</th>
                <th className="text-right text-xs text-gray-500 font-medium pb-3">Envios</th>
                <th className="text-right text-xs text-gray-500 font-medium pb-3">Aberturas</th>
                <th className="text-right text-xs text-gray-500 font-medium pb-3">Cliques</th>
                <th className="text-right text-xs text-gray-500 font-medium pb-3">Receita</th>
              </tr>
            </thead>
            <tbody>
              {topCampaigns.map((camp, i) => {
                const ChannelIcon = channelIcon[camp.channel] || EnvelopeSimple
                return (
                  <tr key={i} className="border-b border-gray-200/50 hover:bg-gray-50/30 transition-colors">
                    <td className="py-3 text-sm text-gray-700">{camp.name}</td>
                    <td className="py-3">
                      <ChannelIcon
                        size={18}
                        className={
                          camp.channel === 'whatsapp' ? 'text-green-400' :
                          camp.channel === 'sms' ? 'text-purple-400' : 'text-[#F26B2A]'
                        }
                      />
                    </td>
                    <td className="py-3 text-sm text-gray-500 text-right">{camp.sent.toLocaleString('pt-BR')}</td>
                    <td className="py-3 text-sm text-gray-500 text-right">{camp.opened.toLocaleString('pt-BR')}</td>
                    <td className="py-3 text-sm text-gray-500 text-right">{camp.clicked.toLocaleString('pt-BR')}</td>
                    <td className="py-3 text-sm text-emerald-400 font-medium text-right">{camp.revenue}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
