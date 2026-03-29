'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase'
import { useAuthStore } from '@/stores'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Users,
  Mail,
  MessageCircle,
  DollarSign,
  Plus,
  FileText,
  Upload,
  Zap,
  ChevronDown,
  Play,
} from 'lucide-react'

type Period = '7d' | '30d' | '90d'

interface KPIs {
  activeContacts: number
  emailsSent: number
  whatsappSent: number
  revenue: number
}

interface Campaign {
  id: string
  name: string
  status: string
  created_at: string
}

interface Automation {
  id: string
  name: string
  status: string
  created_at: string
}

interface ChartPoint {
  date: string
  label: string
  count: number
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function getPeriodDate(period: Period): string {
  const now = new Date()
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  now.setDate(now.getDate() - days)
  return now.toISOString()
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value)
}

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [period, setPeriod] = useState<Period>('30d')
  const [periodOpen, setPeriodOpen] = useState(false)
  const [kpis, setKpis] = useState<KPIs>({
    activeContacts: 0,
    emailsSent: 0,
    whatsappSent: 0,
    revenue: 0,
  })
  const [chartData, setChartData] = useState<ChartPoint[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)

  const userName = user?.name?.split(' ')[0] || 'Usuário'

  const periodLabels: Record<Period, string> = {
    '7d': 'Últimos 7 dias',
    '30d': 'Últimos 30 dias',
    '90d': 'Últimos 90 dias',
  }

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createBrowserClient()
      const since = getPeriodDate(period)

      // Fetch KPIs
      let activeContacts = 0
      let emailsSent = 0
      let whatsappSent = 0
      let revenue = 0

      try {
        const { count } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true })
          .neq('status', 'unsubscribed')
        activeContacts = count ?? 0
      } catch {
        // table may not exist
      }

      try {
        const { count } = await supabase
          .from('email_sends')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', since)
        emailsSent = count ?? 0
      } catch {
        // table may not exist
      }

      try {
        const { count } = await supabase
          .from('whatsapp_messages')
          .select('*', { count: 'exact', head: true })
          .eq('is_outgoing', true)
          .gte('created_at', since)
        whatsappSent = count ?? 0
      } catch {
        // table may not exist
      }

      try {
        const { data } = await supabase
          .from('orders')
          .select('total_price')
          .gte('created_at', since)
        revenue = data?.reduce((sum: number, o: any) => sum + (Number(o.total_price) || 0), 0) ?? 0
      } catch {
        // table may not exist
      }

      setKpis({ activeContacts, emailsSent, whatsappSent, revenue })

      // Fetch chart data: email sends per day over last 30 days
      try {
        const thirtyDaysAgo = getPeriodDate('30d')
        const { data } = await supabase
          .from('email_sends')
          .select('created_at')
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: true })

        const grouped: Record<string, number> = {}
        const now = new Date()
        for (let i = 29; i >= 0; i--) {
          const d = new Date(now)
          d.setDate(d.getDate() - i)
          const key = d.toISOString().split('T')[0]
          grouped[key] = 0
        }
        data?.forEach((row: any) => {
          const key = new Date(row.created_at).toISOString().split('T')[0]
          if (grouped[key] !== undefined) {
            grouped[key]++
          }
        })

        const points: ChartPoint[] = Object.entries(grouped).map(([date, count]) => ({
          date,
          label: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
          }),
          count,
        }))
        setChartData(points)
      } catch {
        // generate empty chart data
        const points: ChartPoint[] = []
        const now = new Date()
        for (let i = 29; i >= 0; i--) {
          const d = new Date(now)
          d.setDate(d.getDate() - i)
          const key = d.toISOString().split('T')[0]
          points.push({
            date: key,
            label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
            count: 0,
          })
        }
        setChartData(points)
      }

      // Fetch recent campaigns
      try {
        const { data } = await supabase
          .from('email_campaigns')
          .select('id, name, status, created_at')
          .order('created_at', { ascending: false })
          .limit(5)
        setCampaigns(data ?? [])
      } catch {
        setCampaigns([])
      }

      // Fetch active automations
      try {
        const { data } = await supabase
          .from('automations')
          .select('id, name, status, created_at')
          .eq('status', 'active')
          .limit(5)
        setAutomations(data ?? [])
      } catch {
        setAutomations([])
      }

      setLoading(false)
    }

    fetchData()
  }, [period])

  const kpiCards = [
    {
      label: 'Contatos Ativos',
      value: formatNumber(kpis.activeContacts),
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Emails Enviados',
      value: formatNumber(kpis.emailsSent),
      icon: Mail,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      label: 'WhatsApp Enviados',
      value: formatNumber(kpis.whatsappSent),
      icon: MessageCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Receita',
      value: formatCurrency(kpis.revenue),
      icon: DollarSign,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ]

  const quickActions = [
    { label: 'Nova Campanha', href: '/campaigns/create', icon: Plus },
    { label: 'Novo Template', href: '/email/templates/new', icon: FileText },
    { label: 'Importar Contatos', href: '/contacts/import', icon: Upload },
    { label: 'Nova Automação', href: '/automations', icon: Zap },
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
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {getGreeting()}, {userName}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Aqui está o resumo da sua operação de marketing.
          </p>
        </div>

        {/* Period filter */}
        <div className="relative">
          <button
            onClick={() => setPeriodOpen(!periodOpen)}
            className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {periodLabels[period]}
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
          {periodOpen && (
            <div className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[180px]">
              {(Object.keys(periodLabels) as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPeriod(p)
                    setPeriodOpen(false)
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                    p === period ? 'text-orange-600 font-medium' : 'text-gray-700'
                  }`}
                >
                  {periodLabels[p]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="bg-white border border-gray-200 rounded-xl p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                {card.label}
              </span>
              <div className={`${card.bgColor} ${card.color} p-2 rounded-lg`}>
                <card.icon className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-semibold text-gray-900">
              {loading ? (
                <div className="h-8 w-24 bg-gray-100 rounded animate-pulse" />
              ) : (
                card.value
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Email Sends Chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Emails Enviados</h2>
            <p className="text-sm text-gray-500">Últimos 30 dias</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Mail className="w-4 h-4" />
            <span>
              {formatNumber(chartData.reduce((sum, p) => sum + p.count, 0))} total
            </span>
          </div>
        </div>
        <div className="h-[280px]">
          {loading ? (
            <div className="h-full w-full bg-gray-50 rounded-lg animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="emailGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F97316" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #E5E7EB',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: '#111827',
                  }}
                  labelStyle={{ color: '#6B7280', marginBottom: 4 }}
                  formatter={(value: number) => [formatNumber(value), 'Envios']}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#F97316"
                  strokeWidth={2}
                  fill="url(#emailGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Two columns: Campaigns + Automations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Recent Campaigns */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900">Campanhas Recentes</h2>
            <Link
              href="/campaigns"
              className="text-sm text-orange-600 hover:text-orange-700 font-medium"
            >
              Ver todas
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-8">
              <Mail className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Nenhuma campanha ainda.</p>
              <Link
                href="/campaigns/create"
                className="text-sm text-orange-600 hover:text-orange-700 font-medium mt-1 inline-block"
              >
                Criar primeira campanha
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((c) => (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-orange-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {c.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(c.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  {statusBadge(c.status)}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Active Automations */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-900">Automações Ativas</h2>
            <Link
              href="/automations"
              className="text-sm text-orange-600 hover:text-orange-700 font-medium"
            >
              Ver todas
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : automations.length === 0 ? (
            <div className="text-center py-8">
              <Zap className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Nenhuma automação ativa.</p>
              <Link
                href="/automations"
                className="text-sm text-orange-600 hover:text-orange-700 font-medium mt-1 inline-block"
              >
                Criar automação
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {automations.map((a) => (
                <Link
                  key={a.id}
                  href={`/automations/${a.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Zap className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {a.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(a.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-green-600">
                    <Play className="w-3 h-3 fill-current" />
                    <span className="text-xs font-medium">Ativa</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Ações Rápidas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50 transition-colors"
            >
              <action.icon className="w-4 h-4" />
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
