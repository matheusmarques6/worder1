'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ChartLineUp,
  CurrencyDollar,
  EnvelopeSimple,
  Eye,
  CursorClick,
  UsersThree,
  CalendarBlank,
  Export,
} from '@phosphor-icons/react'
import { useStoreStore } from '@/stores'

// ── Types ──

interface OverviewData {
  worderRevenue: number
  worderOrders: number
  worderShare: number
  worderDelta: number
  campaignsRevenue: number
  campaignsOrders: number
  automationsRevenue: number
  automationsOrders: number
  storeRevenue: number
  storeOrders: number
  series: Array<{ label: string; campanhas: number; automacoes: number; fora: number }>
  channels: { email: number; whatsapp: number; sms: number }
  recentCampaigns: Array<{
    id: string
    name: string
    status: string
    sends: number
    openRate: number
    clickRate: number
    revenue: number
  }>
  topAutomations: Array<{
    id: string
    name: string
    status: string
    sends: number
    conversionRate: number
    revenue: number
  }>
  hasShopify: boolean
}

interface AnalyticsBaseData {
  metrics: {
    totalContacts: number
    totalDeals: number
    totalRevenue: number
    wonDeals: number
  }
}

interface EmailDashboardData {
  metrics: {
    emailsSent: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    openRate: string
    clickRate: string
    bounceRate: string
  } | null
}

// ── Helpers ──

const periods = ['7d', '30d', '90d'] as const
type Period = (typeof periods)[number]

function rangeForApi(p: Period): string {
  return p
}

function fmtCurrency(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtNumber(v: number): string {
  return v.toLocaleString('pt-BR')
}

function fmtPercent(v: number): string {
  return `${v.toFixed(1)}%`
}

// ── Loading skeleton ──

function KpiSkeleton() {
  return (
    <div className="bg-white/50 border border-gray-200 rounded-xl p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-4 h-4 bg-gray-200 rounded" />
        <div className="w-20 h-3 bg-gray-200 rounded" />
      </div>
      <div className="w-24 h-6 bg-gray-200 rounded mb-1" />
      <div className="w-12 h-3 bg-gray-200 rounded" />
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="bg-white/50 border border-gray-200 rounded-xl p-6 animate-pulse">
      <div className="w-48 h-5 bg-gray-200 rounded mb-4" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4">
            <div className="flex-1 h-4 bg-gray-200 rounded" />
            <div className="w-16 h-4 bg-gray-200 rounded" />
            <div className="w-16 h-4 bg-gray-200 rounded" />
            <div className="w-20 h-4 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="bg-white/50 border border-gray-200 rounded-xl p-6 animate-pulse">
      <div className="w-32 h-5 bg-gray-200 rounded mb-6" />
      <div className="w-full h-[300px] bg-gray-100 rounded" />
    </div>
  )
}

// ── Empty states ──

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <ChartLineUp size={40} className="mb-3 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

// ── Main component ──

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>('30d')
  const { currentStore } = useStoreStore()

  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [base, setBase] = useState<AnalyticsBaseData | null>(null)
  const [emailData, setEmailData] = useState<EmailDashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    const storeParam = currentStore?.id ? `&storeId=${currentStore.id}` : ''
    const range = rangeForApi(period)
    const daysMap: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90 }
    const days = daysMap[period]

    try {
      const [overviewRes, baseRes, emailRes] = await Promise.all([
        fetch(`/api/dashboard/overview?range=${range}${storeParam}`).then((r) =>
          r.ok ? r.json() : null
        ).catch(() => null),
        fetch(`/api/analytics`).then((r) =>
          r.ok ? r.json() : null
        ).catch(() => null),
        fetch(`/api/analytics/email-dashboard?days=${days}`).then((r) =>
          r.ok ? r.json() : null
        ).catch(() => null),
      ])

      setOverview(overviewRes)
      setBase(baseRes)
      setEmailData(emailRes)
    } catch {
      setError('Erro ao carregar dados de analytics.')
    } finally {
      setLoading(false)
    }
  }, [period, currentStore?.id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Derive KPI values from real data ──

  const totalContacts = base?.metrics?.totalContacts ?? null
  const totalRevenue = overview?.storeRevenue ?? (base?.metrics?.totalRevenue ?? null)
  const emailsSent = emailData?.metrics ? emailData.metrics.emailsSent : null
  const openRate = emailData?.metrics ? parseFloat(emailData.metrics.openRate) : null
  const clickRate = emailData?.metrics ? parseFloat(emailData.metrics.clickRate) : null
  const worderRevenue = overview?.worderRevenue ?? null

  const kpis = [
    {
      title: 'Contatos Totais',
      value: totalContacts !== null ? fmtNumber(totalContacts) : '—',
      icon: UsersThree,
    },
    {
      title: 'Receita Total da Loja',
      value: totalRevenue !== null ? fmtCurrency(totalRevenue) : '—',
      icon: CurrencyDollar,
    },
    {
      title: 'Receita Atribuída (Worder)',
      value: worderRevenue !== null ? fmtCurrency(worderRevenue) : '—',
      icon: CurrencyDollar,
    },
    {
      title: 'E-mails Enviados',
      value: emailsSent !== null ? fmtNumber(emailsSent) : '—',
      icon: EnvelopeSimple,
    },
    {
      title: 'Taxa de Abertura',
      value: openRate !== null && !isNaN(openRate) ? fmtPercent(openRate) : '—',
      icon: Eye,
    },
    {
      title: 'Taxa de Cliques',
      value: clickRate !== null && !isNaN(clickRate) ? fmtPercent(clickRate) : '—',
      icon: CursorClick,
    },
  ]

  // ── Channel revenue breakdown from overview ──

  const channels = overview?.channels
  const hasChannelData = channels && (channels.email > 0 || channels.whatsapp > 0 || channels.sms > 0)
  const channelTotal = hasChannelData ? channels.email + channels.whatsapp + channels.sms : 0

  const channelBreakdown = hasChannelData
    ? [
        { name: 'E-mail', value: channels.email, pct: channelTotal > 0 ? (channels.email / channelTotal) * 100 : 0, color: '#F26B2A' },
        { name: 'WhatsApp', value: channels.whatsapp, pct: channelTotal > 0 ? (channels.whatsapp / channelTotal) * 100 : 0, color: '#25D366' },
        { name: 'SMS', value: channels.sms, pct: channelTotal > 0 ? (channels.sms / channelTotal) * 100 : 0, color: '#8B5CF6' },
      ]
    : []

  // ── Recent campaigns from overview ──

  const recentCampaigns = overview?.recentCampaigns ?? []

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

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)
          : kpis.map((kpi, i) => {
              const Icon = kpi.icon
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
                </motion.div>
              )
            })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue time series from overview */}
        <div className="lg:col-span-2">
          {loading ? (
            <ChartSkeleton />
          ) : overview?.series && overview.series.length > 0 ? (
            <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Receita ao Longo do Tempo</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left text-xs text-gray-500 font-medium pb-2">Período</th>
                      <th className="text-right text-xs text-gray-500 font-medium pb-2">Campanhas</th>
                      <th className="text-right text-xs text-gray-500 font-medium pb-2">Automações</th>
                      <th className="text-right text-xs text-gray-500 font-medium pb-2">Outras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.series.map((row, i) => (
                      <tr key={i} className="border-b border-gray-200/50">
                        <td className="py-2 text-gray-700">{row.label}</td>
                        <td className="py-2 text-right text-gray-500">{fmtCurrency(row.campanhas)}</td>
                        <td className="py-2 text-right text-gray-500">{fmtCurrency(row.automacoes)}</td>
                        <td className="py-2 text-right text-gray-500">{fmtCurrency(row.fora)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Receita ao Longo do Tempo</h3>
              <EmptyState message="Nenhum dado de receita disponível para o período selecionado." />
            </div>
          )}
        </div>

        {/* Channel Breakdown */}
        <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Receita por Canal</h3>
          {loading ? (
            <div className="animate-pulse space-y-3">
              <div className="w-full h-[200px] bg-gray-100 rounded" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex justify-between">
                  <div className="w-20 h-3 bg-gray-200 rounded" />
                  <div className="w-12 h-3 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          ) : hasChannelData ? (
            <div className="space-y-3">
              {channelBreakdown.map((ch) => (
                <div key={ch.name}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ch.color }} />
                      <span className="text-gray-500">{ch.name}</span>
                    </div>
                    <span className="text-gray-900 font-medium">{fmtCurrency(ch.value)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{ width: `${ch.pct}%`, backgroundColor: ch.color }}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-100 text-xs text-gray-400">
                Total: {fmtCurrency(channelTotal)}
              </div>
            </div>
          ) : (
            <EmptyState message="Nenhuma receita por canal encontrada." />
          )}
        </div>
      </div>

      {/* Top Campaigns Table */}
      {loading ? (
        <TableSkeleton />
      ) : recentCampaigns.length > 0 ? (
        <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900">Campanhas Recentes</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 font-medium pb-3">Campanha</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-3">Status</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Envios</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Taxa Abertura</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Taxa Cliques</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Receita</th>
                </tr>
              </thead>
              <tbody>
                {recentCampaigns.map((camp) => (
                  <tr key={camp.id} className="border-b border-gray-200/50 hover:bg-gray-50/30 transition-colors">
                    <td className="py-3 text-sm text-gray-700">{camp.name}</td>
                    <td className="py-3 text-sm text-gray-500">{camp.status}</td>
                    <td className="py-3 text-sm text-gray-500 text-right">{fmtNumber(camp.sends)}</td>
                    <td className="py-3 text-sm text-gray-500 text-right">{fmtPercent(camp.openRate)}</td>
                    <td className="py-3 text-sm text-gray-500 text-right">{fmtPercent(camp.clickRate)}</td>
                    <td className="py-3 text-sm text-emerald-500 font-medium text-right">{fmtCurrency(camp.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Campanhas Recentes</h3>
          <EmptyState message="Nenhuma campanha com envios encontrada no período." />
        </div>
      )}

      {/* Top Automations */}
      {!loading && overview?.topAutomations && overview.topAutomations.length > 0 && (
        <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Top Automações</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 font-medium pb-3">Automação</th>
                  <th className="text-left text-xs text-gray-500 font-medium pb-3">Status</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Envios</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Taxa Conversão</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Receita</th>
                </tr>
              </thead>
              <tbody>
                {overview.topAutomations.map((auto) => (
                  <tr key={auto.id} className="border-b border-gray-200/50 hover:bg-gray-50/30 transition-colors">
                    <td className="py-3 text-sm text-gray-700">{auto.name}</td>
                    <td className="py-3 text-sm text-gray-500">{auto.status}</td>
                    <td className="py-3 text-sm text-gray-500 text-right">{fmtNumber(auto.sends)}</td>
                    <td className="py-3 text-sm text-gray-500 text-right">{fmtPercent(auto.conversionRate)}</td>
                    <td className="py-3 text-sm text-emerald-500 font-medium text-right">{fmtCurrency(auto.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
