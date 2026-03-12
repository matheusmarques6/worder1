'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ChartLineUp,
  TrendUp,
  TrendDown,
  CurrencyDollar,
  UsersThree,
  ShoppingCartSimple,
  Lightning,
  Robot,
  EnvelopeSimple,
  WhatsappLogo,
  ChatCircle,
  DeviceMobileSpeaker,
  ArrowClockwise,
  CaretDown,
  Funnel,
  ArrowsClockwise,
  ArrowSquareOut,
  CalendarBlank,
  Barcode,
  CreditCard,
  PixLogo,
  Megaphone,
  UserPlus,
  Package,
} from '@phosphor-icons/react'
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
} from 'recharts'
import { useStoreStore } from '@/stores'

// ============================================
// Types
// ============================================

interface DashboardData {
  heroMetric: number
  heroChange: number
  primaryKpis: {
    title: string
    value: string
    change: string
    positive: boolean
    icon: string
  }[]
  secondaryKpis: {
    title: string
    value: string
    change: string
    positive: boolean
  }[]
}

// ============================================
// Mock Data
// ============================================

const revenueChartData = [
  { date: 'Mar 01', total: 12400, atribuida: 4200 },
  { date: 'Mar 02', total: 14200, atribuida: 5800 },
  { date: 'Mar 03', total: 11800, atribuida: 3900 },
  { date: 'Mar 04', total: 16500, atribuida: 7200 },
  { date: 'Mar 05', total: 18900, atribuida: 8100 },
  { date: 'Mar 06', total: 15200, atribuida: 6400 },
  { date: 'Mar 07', total: 19800, atribuida: 9200 },
  { date: 'Mar 08', total: 17400, atribuida: 7800 },
  { date: 'Mar 09', total: 21200, atribuida: 10100 },
  { date: 'Mar 10', total: 19600, atribuida: 8900 },
  { date: 'Mar 11', total: 22800, atribuida: 11200 },
  { date: 'Mar 12', total: 24100, atribuida: 12400 },
]

const channelData = [
  { channel: 'E-mail', revenue: 18450, color: '#3B82F6' },
  { channel: 'WhatsApp', revenue: 12300, color: '#25D366' },
  { channel: 'SMS', revenue: 4200, color: '#8B5CF6' },
  { channel: 'Chat Web', revenue: 2850, color: '#F26B2A' },
]

const topAutomations = [
  { name: 'Carrinho Abandonado', status: 'Ativo', channel: 'WhatsApp', revenue: 'R$ 8.290', change: '+12%' },
  { name: 'PIX Pendente', status: 'Ativo', channel: 'WhatsApp', revenue: 'R$ 5.120', change: '+28%' },
  { name: 'Win-back 60d', status: 'Ativo', channel: 'E-mail', revenue: 'R$ 3.450', change: '+8%' },
  { name: 'Pós-Compra Review', status: 'Ativo', channel: 'E-mail', revenue: 'R$ 2.100', change: '+5%' },
  { name: 'Boleto Pendente', status: 'Ativo', channel: 'WhatsApp', revenue: 'R$ 1.890', change: '+15%' },
]

const recentCampaigns = [
  { name: 'Black Friday Esquenta', opened: '32.1%', clicked: '8.4%', revenue: 'R$ 8.290', date: '10/03' },
  { name: 'Dia do Consumidor', opened: '28.5%', clicked: '6.2%', revenue: 'R$ 5.450', date: '08/03' },
  { name: 'Coleção Outono', opened: '35.2%', clicked: '11.1%', revenue: 'R$ 4.120', date: '05/03' },
  { name: 'Flash Sale Weekend', opened: '40.8%', clicked: '15.2%', revenue: 'R$ 6.780', date: '01/03' },
  { name: 'Cupom Aniversário', opened: '52.1%', clicked: '22.4%', revenue: 'R$ 3.200', date: '28/02' },
]

const periods = ['Hoje', '7 dias', '30 dias', '90 dias', 'Custom']

// ============================================
// Icon mapping for KPIs
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const iconMap: Record<string, React.ComponentType<any>> = {
  revenue: CurrencyDollar,
  orders: Package,
  ticket: ShoppingCartSimple,
  leads: UserPlus,
}

// ============================================
// Custom Tooltip
// ============================================

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) {
  if (!active || !payload) return null
  return (
    <div className="bg-[#1A1A1A] border border-white/[0.08] rounded-xl px-4 py-3 shadow-2xl">
      <p className="text-xs text-dark-500 mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-dark-400 capitalize">{entry.dataKey === 'atribuida' ? 'Receita Atribuída' : 'Receita Total'}</span>
          <span className="font-semibold text-white ml-auto">R$ {(entry.value / 1000).toFixed(1)}K</span>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Dashboard Page
// ============================================

export default function DashboardPage() {
  const [period, setPeriod] = useState('30 dias')
  const [periodOpen, setPeriodOpen] = useState(false)
  const { currentStore } = useStoreStore()

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Dashboard</h1>
          <p className="text-sm text-dark-400 mt-1">
            Visão geral de {currentStore?.name || 'sua loja'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <div className="relative">
            <button
              onClick={() => setPeriodOpen(!periodOpen)}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1A1A1A] border border-white/[0.06] rounded-xl text-sm text-dark-300 hover:border-white/[0.12] transition-colors"
            >
              <CalendarBlank className="w-4 h-4 text-dark-500" weight="duotone" />
              {period}
              <CaretDown className={`w-3.5 h-3.5 text-dark-500 transition-transform ${periodOpen ? 'rotate-180' : ''}`} weight="bold" />
            </button>
            {periodOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute right-0 top-full mt-2 w-40 bg-[#1A1A1A] border border-white/[0.08] rounded-xl shadow-2xl z-50 py-1 overflow-hidden"
              >
                {periods.map((p) => (
                  <button
                    key={p}
                    onClick={() => { setPeriod(p); setPeriodOpen(false) }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      period === p ? 'text-[#F26B2A] bg-[#F26B2A]/5' : 'text-dark-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </motion.div>
            )}
          </div>
          <button className="p-2.5 bg-[#1A1A1A] border border-white/[0.06] rounded-xl text-dark-400 hover:text-white hover:border-white/[0.12] transition-colors">
            <ArrowsClockwise className="w-4 h-4" weight="bold" />
          </button>
        </div>
      </div>

      {/* ============================================ */}
      {/* HERO CARD — Receita Recuperada pela Worder   */}
      {/* ============================================ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-[#1A1A1A] via-[#1A1A1A] to-[#F26B2A]/30" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-radial from-[#F26B2A]/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative border border-white/[0.08] rounded-2xl p-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F26B2A] to-[#F5A623] flex items-center justify-center">
                  <Robot className="w-4 h-4 text-white" weight="fill" />
                </div>
                <span className="text-sm font-medium text-dark-400">Receita Recuperada pela Worder</span>
              </div>
              <p className="text-5xl font-bold text-white font-display tracking-tight">
                R$ 37.800
              </p>
              <div className="flex items-center gap-3 mt-3">
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-500/10">
                  <TrendUp className="w-3.5 h-3.5 text-green-400" weight="bold" />
                  <span className="text-xs font-semibold text-green-400">+24.5%</span>
                </div>
                <span className="text-sm text-dark-500">vs período anterior</span>
              </div>
            </div>
            <div className="hidden lg:flex flex-col items-end gap-3">
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-xs text-dark-500">Carrinhos Recuperados</p>
                  <p className="text-lg font-bold text-white font-display">142</p>
                </div>
                <div className="w-px h-10 bg-white/[0.06]" />
                <div className="text-right">
                  <p className="text-xs text-dark-500">PIX Recuperados</p>
                  <p className="text-lg font-bold text-white font-display">87</p>
                </div>
                <div className="w-px h-10 bg-white/[0.06]" />
                <div className="text-right">
                  <p className="text-xs text-dark-500">Taxa Recuperação</p>
                  <p className="text-lg font-bold text-[#F26B2A] font-display">38.6%</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-medium text-green-400">IA Ativa — 5 conversas agora</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ============================================ */}
      {/* PRIMARY KPIs                                 */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Receita Total', value: 'R$ 124.500', change: '+18.2%', positive: true, Icon: CurrencyDollar, color: '#F26B2A' },
          { title: 'Pedidos', value: '892', change: '+12.4%', positive: true, Icon: Package, color: '#3B82F6' },
          { title: 'Ticket Médio', value: 'R$ 139,57', change: '+4.8%', positive: true, Icon: ShoppingCartSimple, color: '#22C55E' },
          { title: 'Novos Leads', value: '1.842', change: '+32%', positive: true, Icon: UserPlus, color: '#F5A623' },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] p-5 hover:border-white/[0.1] transition-all duration-200"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-dark-400 font-medium">{kpi.title}</p>
                <p className="text-2xl font-bold text-white mt-1.5 font-display">{kpi.value}</p>
                <div className="flex items-center gap-1 mt-2">
                  {kpi.positive
                    ? <TrendUp className="w-3.5 h-3.5 text-green-400" weight="bold" />
                    : <TrendDown className="w-3.5 h-3.5 text-red-400" weight="bold" />}
                  <span className={`text-xs font-medium ${kpi.positive ? 'text-green-400' : 'text-red-400'}`}>{kpi.change}</span>
                  <span className="text-xs text-dark-500">vs 30d</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${kpi.color}15` }}>
                <kpi.Icon className="w-5 h-5" style={{ color: kpi.color }} weight="duotone" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ============================================ */}
      {/* SECONDARY KPIs                               */}
      {/* ============================================ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { title: 'Carrinhos Abandonados', value: 'R$ 47.8K', icon: ShoppingCartSimple, color: '#F59E0B' },
          { title: 'Valor Recuperado', value: 'R$ 18.4K', icon: ArrowClockwise, color: '#22C55E' },
          { title: 'PIX Pendentes', value: '23', icon: PixLogo, color: '#3B82F6' },
          { title: 'Atendimentos Ativos', value: '12', icon: ChatCircle, color: '#8B5CF6' },
          { title: 'Mensagens Enviadas', value: '4.2K', icon: EnvelopeSimple, color: '#06B6D4' },
          { title: 'Taxa Recuperação', value: '38.6%', icon: TrendUp, color: '#F26B2A' },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.title}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="bg-[#1A1A1A] rounded-xl border border-white/[0.06] p-4 hover:border-white/[0.1] transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} weight="duotone" />
              <p className="text-[10px] text-dark-500 font-medium truncate">{kpi.title}</p>
            </div>
            <p className="text-lg font-bold text-white font-display">{kpi.value}</p>
          </motion.div>
        ))}
      </div>

      {/* ============================================ */}
      {/* CHARTS ROW                                   */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 bg-[#1A1A1A] rounded-2xl border border-white/[0.06] p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-semibold text-white font-display">Receita</h3>
              <p className="text-xs text-dark-500 mt-0.5">Total vs Atribuída pela Worder</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-dark-500" />
                <span className="text-xs text-dark-400">Total</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#F26B2A]" />
                <span className="text-xs text-dark-400">Atribuída</span>
              </div>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueChartData}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#71717A" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#71717A" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorAtribuida" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F26B2A" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#F26B2A" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#71717A', fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717A', fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="total" stroke="#71717A" strokeWidth={2} fill="url(#colorTotal)" />
                <Area type="monotone" dataKey="atribuida" stroke="#F26B2A" strokeWidth={2} fill="url(#colorAtribuida)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue by Channel */}
        <div className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] p-6">
          <h3 className="text-base font-semibold text-white font-display mb-1">Receita por Canal</h3>
          <p className="text-xs text-dark-500 mb-6">Atribuição nos últimos 30 dias</p>
          <div className="space-y-4">
            {channelData.map((ch) => {
              const maxRevenue = Math.max(...channelData.map(c => c.revenue))
              const percentage = (ch.revenue / maxRevenue) * 100
              return (
                <div key={ch.channel}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      {ch.channel === 'E-mail' && <EnvelopeSimple className="w-4 h-4" style={{ color: ch.color }} weight="fill" />}
                      {ch.channel === 'WhatsApp' && <WhatsappLogo className="w-4 h-4" style={{ color: ch.color }} weight="fill" />}
                      {ch.channel === 'SMS' && <DeviceMobileSpeaker className="w-4 h-4" style={{ color: ch.color }} weight="fill" />}
                      {ch.channel === 'Chat Web' && <ChatCircle className="w-4 h-4" style={{ color: ch.color }} weight="fill" />}
                      <span className="text-sm text-dark-300">{ch.channel}</span>
                    </div>
                    <span className="text-sm font-semibold text-white">R$ {(ch.revenue / 1000).toFixed(1)}K</span>
                  </div>
                  <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.8, delay: 0.2 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: ch.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ============================================ */}
      {/* TABLES ROW                                   */}
      {/* ============================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Automations */}
        <div className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <h3 className="text-base font-semibold text-white font-display">Top Automações</h3>
            <a href="/automations" className="text-xs text-[#F26B2A] hover:text-[#F5A623] flex items-center gap-1 transition-colors">
              Ver todas <ArrowSquareOut className="w-3 h-3" weight="bold" />
            </a>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-[#111111]">
                <th className="text-left text-[10px] font-semibold text-dark-500 uppercase tracking-wider px-5 py-2.5">Nome</th>
                <th className="text-left text-[10px] font-semibold text-dark-500 uppercase tracking-wider px-5 py-2.5">Canal</th>
                <th className="text-left text-[10px] font-semibold text-dark-500 uppercase tracking-wider px-5 py-2.5">Receita</th>
                <th className="text-left text-[10px] font-semibold text-dark-500 uppercase tracking-wider px-5 py-2.5">Var.</th>
              </tr>
            </thead>
            <tbody>
              {topAutomations.map((auto) => (
                <tr key={auto.name} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Lightning className="w-3.5 h-3.5 text-[#F26B2A]" weight="fill" />
                      <span className="text-sm text-white">{auto.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      auto.channel === 'WhatsApp' ? 'bg-[#25D366]/10 text-[#25D366]' : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {auto.channel}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm font-medium text-white">{auto.revenue}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-medium text-green-400">{auto.change}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Recent Campaigns */}
        <div className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <h3 className="text-base font-semibold text-white font-display">Campanhas Recentes</h3>
            <a href="/campaigns" className="text-xs text-[#F26B2A] hover:text-[#F5A623] flex items-center gap-1 transition-colors">
              Ver todas <ArrowSquareOut className="w-3 h-3" weight="bold" />
            </a>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-[#111111]">
                <th className="text-left text-[10px] font-semibold text-dark-500 uppercase tracking-wider px-5 py-2.5">Nome</th>
                <th className="text-left text-[10px] font-semibold text-dark-500 uppercase tracking-wider px-5 py-2.5">Abertura</th>
                <th className="text-left text-[10px] font-semibold text-dark-500 uppercase tracking-wider px-5 py-2.5">Cliques</th>
                <th className="text-left text-[10px] font-semibold text-dark-500 uppercase tracking-wider px-5 py-2.5">Receita</th>
              </tr>
            </thead>
            <tbody>
              {recentCampaigns.map((campaign) => (
                <tr key={campaign.name} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Megaphone className="w-3.5 h-3.5 text-dark-500" weight="duotone" />
                      <span className="text-sm text-white">{campaign.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-dark-300">{campaign.opened}</td>
                  <td className="px-5 py-3 text-sm text-dark-300">{campaign.clicked}</td>
                  <td className="px-5 py-3 text-sm font-medium text-white">{campaign.revenue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
