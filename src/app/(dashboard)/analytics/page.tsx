'use client'

import { useState } from 'react'
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

const periods = ['7d', '30d', '90d', '12m']

const revenueData = [
  { date: '01 Mar', email: 12400, whatsapp: 8200, sms: 3100, total: 23700 },
  { date: '03 Mar', email: 14200, whatsapp: 9100, sms: 2800, total: 26100 },
  { date: '05 Mar', email: 11800, whatsapp: 10400, sms: 3400, total: 25600 },
  { date: '07 Mar', email: 16500, whatsapp: 11200, sms: 4100, total: 31800 },
  { date: '09 Mar', email: 15100, whatsapp: 9800, sms: 3600, total: 28500 },
  { date: '11 Mar', email: 18200, whatsapp: 12600, sms: 4800, total: 35600 },
  { date: '13 Mar', email: 17400, whatsapp: 11900, sms: 5200, total: 34500 },
]

const engagementData = [
  { date: '01 Mar', opens: 4200, clicks: 1800, conversions: 340 },
  { date: '03 Mar', opens: 4800, clicks: 2100, conversions: 390 },
  { date: '05 Mar', opens: 3900, clicks: 1600, conversions: 310 },
  { date: '07 Mar', opens: 5200, clicks: 2400, conversions: 450 },
  { date: '09 Mar', opens: 4600, clicks: 2000, conversions: 380 },
  { date: '11 Mar', opens: 5800, clicks: 2700, conversions: 520 },
  { date: '13 Mar', opens: 5400, clicks: 2500, conversions: 490 },
]

const channelBreakdown = [
  { name: 'E-mail', value: 45, color: '#F26B2A' },
  { name: 'WhatsApp', value: 30, color: '#25D366' },
  { name: 'SMS', value: 15, color: '#8B5CF6' },
  { name: 'Chat Web', value: 10, color: '#3B82F6' },
]

const topCampaigns = [
  { name: 'Promoção Dia do Consumidor', channel: 'email', sent: 12400, opened: 4960, clicked: 1488, revenue: 'R$ 18.200' },
  { name: 'Carrinho Abandonado - 1h', channel: 'whatsapp', sent: 3200, opened: 2880, clicked: 1280, revenue: 'R$ 12.800' },
  { name: 'Flash Sale Março', channel: 'email', sent: 8900, opened: 3560, clicked: 890, revenue: 'R$ 9.450' },
  { name: 'PIX Pendente - Lembrete', channel: 'whatsapp', sent: 1800, opened: 1620, clicked: 720, revenue: 'R$ 7.200' },
  { name: 'Newsletter Semanal', channel: 'sms', sent: 5400, opened: 2160, clicked: 540, revenue: 'R$ 4.100' },
]

const kpis = [
  { title: 'Receita Atribuída', value: 'R$ 186.400', change: '+18.2%', positive: true, icon: CurrencyDollar },
  { title: 'Mensagens Enviadas', value: '48.200', change: '+12.5%', positive: true, icon: EnvelopeSimple },
  { title: 'Taxa de Abertura', value: '42.3%', change: '+3.1%', positive: true, icon: Eye },
  { title: 'Taxa de Cliques', value: '8.7%', change: '-0.4%', positive: false, icon: CursorClick },
  { title: 'Taxa de Conversão', value: '3.2%', change: '+0.6%', positive: true, icon: ArrowsClockwise },
  { title: 'Contatos Ativos', value: '24.500', change: '+8.3%', positive: true, icon: UsersThree },
]

const channelIcon: Record<string, React.ComponentType<any>> = {
  email: EnvelopeSimple,
  whatsapp: WhatsappLogo,
  sms: DeviceMobileSpeaker,
  chat: ChatCircle,
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('30d')
  const [chartView, setChartView] = useState<'revenue' | 'engagement'>('revenue')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Analytics</h1>
          <p className="text-sm text-zinc-400 mt-1">Visão geral de performance de todos os canais</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-zinc-800/50 rounded-lg p-1">
            {periods.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  period === p ? 'bg-[#F26B2A] text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors text-sm">
            <Export size={16} />
            Exportar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className="text-zinc-500" />
                <span className="text-xs text-zinc-500">{kpi.title}</span>
              </div>
              <p className="text-lg font-bold text-white">{kpi.value}</p>
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
        <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex gap-2">
              <button
                onClick={() => setChartView('revenue')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  chartView === 'revenue' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Receita
              </button>
              <button
                onClick={() => setChartView('engagement')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  chartView === 'engagement' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
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
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Receita por Canal</h3>
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
                  <span className="text-zinc-400">{ch.name}</span>
                </div>
                <span className="text-white font-medium">{ch.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Campaigns Table */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Top Campanhas por Receita</h3>
          <button className="text-xs text-[#F26B2A] hover:text-[#F5A623] transition-colors">
            Ver todas →
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-xs text-zinc-500 font-medium pb-3">Campanha</th>
                <th className="text-left text-xs text-zinc-500 font-medium pb-3">Canal</th>
                <th className="text-right text-xs text-zinc-500 font-medium pb-3">Envios</th>
                <th className="text-right text-xs text-zinc-500 font-medium pb-3">Aberturas</th>
                <th className="text-right text-xs text-zinc-500 font-medium pb-3">Cliques</th>
                <th className="text-right text-xs text-zinc-500 font-medium pb-3">Receita</th>
              </tr>
            </thead>
            <tbody>
              {topCampaigns.map((camp, i) => {
                const ChannelIcon = channelIcon[camp.channel] || EnvelopeSimple
                return (
                  <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3 text-sm text-white">{camp.name}</td>
                    <td className="py-3">
                      <ChannelIcon
                        size={18}
                        className={
                          camp.channel === 'whatsapp' ? 'text-green-400' :
                          camp.channel === 'sms' ? 'text-purple-400' : 'text-[#F26B2A]'
                        }
                      />
                    </td>
                    <td className="py-3 text-sm text-zinc-400 text-right">{camp.sent.toLocaleString('pt-BR')}</td>
                    <td className="py-3 text-sm text-zinc-400 text-right">{camp.opened.toLocaleString('pt-BR')}</td>
                    <td className="py-3 text-sm text-zinc-400 text-right">{camp.clicked.toLocaleString('pt-BR')}</td>
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
