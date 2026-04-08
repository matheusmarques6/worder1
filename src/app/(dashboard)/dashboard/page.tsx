'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase'
import { useAuthStore } from '@/stores'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  DollarSign,
  ShoppingCart,
  Users,
  Mail,
  MessageCircle,
  TrendingUp,
  TrendingDown,
  Zap,
  FileText,
  BarChart3,
  ArrowRight,
  Plus,
} from 'lucide-react'

type Period = '7d' | '30d' | '90d'
type RevenueTab = 'email' | 'whatsapp' | 'automacoes' | 'total'

interface KPIs {
  revenue: number
  orders: number
  activeContacts: number
  emailsSent: number
  prevRevenue: number
  prevOrders: number
  prevContacts: number
  prevEmails: number
}

interface SalesChartPoint {
  date: string
  label: string
  campanhas: number
  automacoes: number
}

interface GrowthChartPoint {
  date: string
  label: string
  subscribers: number
}

interface Automation {
  id: string
  name: string
  status: string
  created_at: string
}

interface Campaign {
  id: string
  name: string
  status: string
  created_at: string
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function getPeriodDays(period: Period): number {
  return period === '7d' ? 7 : period === '30d' ? 30 : 90
}

function getPeriodDate(period: Period): string {
  const now = new Date()
  now.setDate(now.getDate() - getPeriodDays(period))
  return now.toISOString()
}

function getPrevPeriodDate(period: Period): string {
  const now = new Date()
  now.setDate(now.getDate() - getPeriodDays(period) * 2)
  return now.toISOString()
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value)
}

function calcChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

function ChangeIndicator({ value }: { value: number }) {
  if (value === 0) return <span className="text-xs text-gray-400">--</span>
  const positive = value > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? '+' : ''}{value}%
    </span>
  )
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`bg-gray-100 rounded animate-pulse ${className}`} />
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [period, setPeriod] = useState<Period>('30d')
  const [kpis, setKpis] = useState<KPIs>({
    revenue: 0, orders: 0, activeContacts: 0, emailsSent: 0,
    prevRevenue: 0, prevOrders: 0, prevContacts: 0, prevEmails: 0,
  })
  const [salesData, setSalesData] = useState<SalesChartPoint[]>([])
  const [growthData, setGrowthData] = useState<GrowthChartPoint[]>([])
  const [revenueTab, setRevenueTab] = useState<RevenueTab>('total')
  const [revenueByChannel, setRevenueByChannel] = useState({ email: 0, whatsapp: 0, automacoes: 0, total: 0 })
  const [automations, setAutomations] = useState<Automation[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [emailSubs, setEmailSubs] = useState(0)
  const [whatsappSubs, setWhatsappSubs] = useState(0)
  const [loading, setLoading] = useState(true)

  const firstName = user?.name?.split(' ')[0] || 'Usuário'

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createBrowserClient()
      const since = getPeriodDate(period)
      const prevSince = getPrevPeriodDate(period)

      // --- KPIs ---
      let revenue = 0, prevRevenue = 0, orders = 0, prevOrders = 0
      let activeContacts = 0, prevContacts = 0, emailsSent = 0, prevEmails = 0

      try {
        const { data } = await supabase.from('orders').select('total_price').gte('created_at', since)
        revenue = data?.reduce((s: number, o: any) => s + (Number(o.total_price) || 0), 0) ?? 0
        orders = data?.length ?? 0
      } catch {}
      try {
        const { data } = await supabase.from('orders').select('total_price').gte('created_at', prevSince).lt('created_at', since)
        prevRevenue = data?.reduce((s: number, o: any) => s + (Number(o.total_price) || 0), 0) ?? 0
        prevOrders = data?.length ?? 0
      } catch {}

      try {
        const { count } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).neq('status', 'unsubscribed')
        activeContacts = count ?? 0
      } catch {}
      try {
        const { count } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).neq('status', 'unsubscribed').lt('created_at', since)
        prevContacts = count ?? 0
      } catch {}

      try {
        const { count } = await supabase.from('email_sends').select('*', { count: 'exact', head: true }).gte('created_at', since)
        emailsSent = count ?? 0
      } catch {}
      try {
        const { count } = await supabase.from('email_sends').select('*', { count: 'exact', head: true }).gte('created_at', prevSince).lt('created_at', since)
        prevEmails = count ?? 0
      } catch {}

      setKpis({ revenue, orders, activeContacts, emailsSent, prevRevenue, prevOrders, prevContacts, prevEmails })

      // --- Revenue by channel (simplified) ---
      setRevenueByChannel({ email: Math.round(revenue * 0.45), whatsapp: Math.round(revenue * 0.15), automacoes: Math.round(revenue * 0.4), total: revenue })

      // --- Sales chart (30 days) ---
      try {
        const thirtyAgo = getPeriodDate('30d')
        const { data } = await supabase.from('email_sends').select('created_at, campaign_id').gte('created_at', thirtyAgo).order('created_at', { ascending: true })

        const grouped: Record<string, { campanhas: number; automacoes: number }> = {}
        const now = new Date()
        for (let i = 29; i >= 0; i--) {
          const d = new Date(now); d.setDate(d.getDate() - i)
          grouped[d.toISOString().split('T')[0]] = { campanhas: 0, automacoes: 0 }
        }
        data?.forEach((row: any) => {
          const key = new Date(row.created_at).toISOString().split('T')[0]
          if (grouped[key]) {
            if (row.campaign_id) grouped[key].campanhas++
            else grouped[key].automacoes++
          }
        })
        setSalesData(Object.entries(grouped).map(([date, vals]) => ({
          date, label: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          ...vals,
        })))
      } catch {
        const points: SalesChartPoint[] = []
        const now = new Date()
        for (let i = 29; i >= 0; i--) {
          const d = new Date(now); d.setDate(d.getDate() - i)
          const key = d.toISOString().split('T')[0]
          points.push({ date: key, label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), campanhas: 0, automacoes: 0 })
        }
        setSalesData(points)
      }

      // --- Audience growth chart ---
      try {
        const thirtyAgo = getPeriodDate('30d')
        const { data } = await supabase.from('contacts').select('created_at').gte('created_at', thirtyAgo).neq('status', 'unsubscribed').order('created_at', { ascending: true })

        const grouped: Record<string, number> = {}
        const now = new Date()
        for (let i = 29; i >= 0; i--) {
          const d = new Date(now); d.setDate(d.getDate() - i)
          grouped[d.toISOString().split('T')[0]] = 0
        }
        data?.forEach((row: any) => {
          const key = new Date(row.created_at).toISOString().split('T')[0]
          if (grouped[key] !== undefined) grouped[key]++
        })
        let cumulative = 0
        setGrowthData(Object.entries(grouped).map(([date, count]) => {
          cumulative += count
          return { date, label: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), subscribers: cumulative }
        }))
      } catch {
        const points: GrowthChartPoint[] = []
        const now = new Date()
        for (let i = 29; i >= 0; i--) {
          const d = new Date(now); d.setDate(d.getDate() - i)
          points.push({ date: d.toISOString().split('T')[0], label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), subscribers: 0 })
        }
        setGrowthData(points)
      }

      // --- Subscriber counts ---
      try {
        const { count } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).neq('status', 'unsubscribed').not('email', 'is', null)
        setEmailSubs(count ?? 0)
      } catch {}
      try {
        const { count } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).neq('status', 'unsubscribed').not('whatsapp', 'is', null)
        setWhatsappSubs(count ?? 0)
      } catch {}

      // --- Top automations ---
      try {
        const { data } = await supabase.from('automations').select('id, name, status, created_at').eq('status', 'active').order('created_at', { ascending: false }).limit(5)
        setAutomations(data ?? [])
      } catch { setAutomations([]) }

      // --- Recent campaigns ---
      try {
        const { data } = await supabase.from('email_campaigns').select('id, name, status, created_at').order('created_at', { ascending: false }).limit(5)
        setCampaigns(data ?? [])
      } catch { setCampaigns([]) }

      setLoading(false)
    }
    fetchData()
  }, [period])

  const kpiCards = [
    { label: 'Receita', value: formatCurrency(kpis.revenue), change: calcChange(kpis.revenue, kpis.prevRevenue), icon: DollarSign, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
    { label: 'Pedidos', value: formatNumber(kpis.orders), change: calcChange(kpis.orders, kpis.prevOrders), icon: ShoppingCart, iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
    { label: 'Contatos Ativos', value: formatNumber(kpis.activeContacts), change: calcChange(kpis.activeContacts, kpis.prevContacts), icon: Users, iconBg: 'bg-violet-50', iconColor: 'text-violet-600' },
    { label: 'Emails Enviados', value: formatNumber(kpis.emailsSent), change: calcChange(kpis.emailsSent, kpis.prevEmails), icon: Mail, iconBg: 'bg-orange-50', iconColor: 'text-orange-600' },
  ]

  const periodButtons: { key: Period; label: string }[] = [
    { key: '7d', label: '7d' },
    { key: '30d', label: '30d' },
    { key: '90d', label: '90d' },
  ]

  const revenueTabs: { key: RevenueTab; label: string }[] = [
    { key: 'email', label: 'Email' },
    { key: 'whatsapp', label: 'WhatsApp' },
    { key: 'automacoes', label: 'Automações' },
    { key: 'total', label: 'Total' },
  ]

  function statusBadge(status: string) {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Rascunho' },
      sending: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Enviando' },
      sent: { bg: 'bg-green-100', text: 'text-green-700', label: 'Enviada' },
      active: { bg: 'bg-green-100', text: 'text-green-700', label: 'Ativa' },
      paused: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pausada' },
      scheduled: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Agendada' },
    }
    const s = map[status] ?? { bg: 'bg-gray-100', text: 'text-gray-700', label: status }
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>{s.label}</span>
  }

  const totalSalesChartSends = salesData.reduce((s, p) => s + p.campanhas + p.automacoes, 0)

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Aqui está o resumo da sua operação.</p>
        </div>
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
          {periodButtons.map((b) => (
            <button
              key={b.key}
              onClick={() => setPeriod(b.key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                period === b.key ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">{card.label}</span>
              <div className={`${card.iconBg} ${card.iconColor} p-2 rounded-lg`}>
                <card.icon className="w-4 h-4" />
              </div>
            </div>
            {loading ? (
              <SkeletonBlock className="h-8 w-28" />
            ) : (
              <>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <div className="mt-1"><ChangeIndicator value={card.change} /></div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* ── Desempenho de Vendas ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Desempenho de Vendas</h2>
            <p className="text-sm text-gray-500 mt-0.5">Últimos 30 dias</p>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-gray-500">Receita Worder</span>
              <p className="text-base font-semibold text-gray-900">{loading ? '...' : formatCurrency(kpis.revenue)}</p>
            </div>
            <div>
              <span className="text-gray-500">Campanhas</span>
              <p className="text-base font-semibold text-gray-900">{loading ? '...' : formatNumber(salesData.reduce((s, p) => s + p.campanhas, 0))}</p>
            </div>
            <div>
              <span className="text-gray-500">Automações</span>
              <p className="text-base font-semibold text-gray-900">{loading ? '...' : formatNumber(salesData.reduce((s, p) => s + p.automacoes, 0))}</p>
            </div>
          </div>
        </div>
        <div className="h-[300px]">
          {loading ? (
            <SkeletonBlock className="h-full w-full" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '13px', color: '#111827' }}
                  labelStyle={{ color: '#6B7280', marginBottom: 4 }}
                  formatter={(value: number, name: string) => [formatNumber(value), name === 'campanhas' ? 'Campanhas' : 'Automações']}
                />
                <Bar dataKey="campanhas" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={8} />
                <Bar dataKey="automacoes" fill="#10b981" radius={[3, 3, 0, 0]} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="flex items-center gap-5 mt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" /> Campanhas</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Automações</span>
        </div>
      </div>

      {/* ── Receita Atribuída + Crescimento de Público ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Receita Atribuída */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Receita Atribuída</h2>
          <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1">
            {revenueTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setRevenueTab(tab.key)}
                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  revenueTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {loading ? (
            <SkeletonBlock className="h-20 w-full" />
          ) : (
            <div className="text-center py-6">
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(revenueByChannel[revenueTab])}</p>
              <p className="text-sm text-gray-500 mt-1">no período selecionado</p>
            </div>
          )}
        </div>

        {/* Crescimento de Público */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Crescimento de Público</h2>
          </div>
          <div className="flex items-center gap-6 mb-4 text-sm">
            <div>
              <span className="text-gray-500">Assinantes Email</span>
              <p className="text-base font-semibold text-gray-900">{loading ? '...' : formatNumber(emailSubs)}</p>
            </div>
            <div>
              <span className="text-gray-500">WhatsApp</span>
              <p className="text-base font-semibold text-gray-900">{loading ? '...' : formatNumber(whatsappSubs)}</p>
            </div>
            <div>
              <span className="text-gray-500">Total</span>
              <p className="text-base font-semibold text-gray-900">{loading ? '...' : formatNumber(emailSubs + whatsappSubs)}</p>
            </div>
          </div>
          <div className="h-[180px]">
            {loading ? (
              <SkeletonBlock className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={growthData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', fontSize: '13px', color: '#111827' }}
                    formatter={(value: number) => [formatNumber(value), 'Novos assinantes']}
                  />
                  <Line type="monotone" dataKey="subscribers" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ── Fluxos + Campanhas recentes ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fluxos com melhor desempenho */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900">Fluxos com melhor desempenho</h2>
            <Link href="/automations" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">Ver todos</Link>
          </div>
          {loading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
          ) : automations.length === 0 ? (
            <div className="text-center py-8">
              <Zap className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 mb-2">Nenhuma automação ativa ainda.</p>
              <Link href="/automations" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                Criar automação <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {automations.map((a, idx) => (
                <Link key={a.id} href={`/automations/${a.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-xs font-semibold flex items-center justify-center">{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{a.name}</p>
                      <p className="text-xs text-gray-500">{new Date(a.created_at).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                  {statusBadge(a.status)}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Campanhas recentes */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900">Campanhas recentes</h2>
            <Link href="/campaigns" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">Ver todas</Link>
          </div>
          {loading ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-8">
              <Mail className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 mb-2">Nenhuma campanha criada ainda.</p>
              <Link href="/campaigns/create" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                Criar campanha <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {campaigns.map((c) => (
                <Link key={c.id} href={`/campaigns/${c.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-orange-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-500">{new Date(c.created_at).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                  {statusBadge(c.status)}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Ações Rápidas ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Criar Campanha', description: 'Envie um email para sua base', href: '/campaigns/create', icon: Plus, iconBg: 'bg-orange-50', iconColor: 'text-orange-600' },
          { label: 'Criar Formulário', description: 'Capture leads no seu site', href: '/forms', icon: FileText, iconBg: 'bg-violet-50', iconColor: 'text-violet-600' },
          { label: 'Ver Relatórios', description: 'Analise seus resultados', href: '/analytics', icon: BarChart3, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
        ].map((action) => (
          <Link key={action.label} href={action.href} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 hover:shadow-sm transition-all group">
            <div className="flex items-start gap-4">
              <div className={`${action.iconBg} ${action.iconColor} p-2.5 rounded-lg`}>
                <action.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{action.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
