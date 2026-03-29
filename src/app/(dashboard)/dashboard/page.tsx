export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  Users,
  Mail,
  MessageSquare,
  DollarSign,
  ArrowRight,
  Zap,
  BarChart3,
  Send,
  PlusCircle,
} from 'lucide-react'
import Link from 'next/link'

// Format helpers
function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value)
}

export default async function DashboardPage() {
  // --- Fetch KPI data ---
  let activeContacts = 0
  let emailsSent30d = 0
  let whatsappSent30d = 0
  let revenue30d = 0

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString()

  // Active contacts
  try {
    const { count } = await supabaseAdmin
      .from('contacts')
      .select('*', { count: 'exact', head: true })
    activeContacts = count ?? 0
  } catch (err) {
    console.error('Dashboard: failed to fetch contacts count', err)
  }

  // Emails sent in last 30 days
  try {
    const { data } = await supabaseAdmin
      .from('email_campaigns')
      .select('total_sent')
      .gte('sent_at', thirtyDaysAgoISO)
    emailsSent30d = (data ?? []).reduce((sum: number, c: any) => sum + (c.total_sent || 0), 0)
  } catch (err) {
    console.error('Dashboard: failed to fetch email campaigns', err)
  }

  // WhatsApp messages sent in last 30 days
  try {
    const { count } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('*', { count: 'exact', head: true })
      .eq('is_outgoing', true)
      .gte('created_at', thirtyDaysAgoISO)
    whatsappSent30d = count ?? 0
  } catch (err) {
    console.error('Dashboard: failed to fetch whatsapp messages', err)
  }

  // Revenue in last 30 days
  try {
    const { data } = await supabaseAdmin
      .from('shopify_orders')
      .select('total_price')
      .gte('created_at', thirtyDaysAgoISO)
    revenue30d = (data ?? []).reduce((sum: number, o: any) => sum + (parseFloat(o.total_price) || 0), 0)
  } catch (err) {
    console.error('Dashboard: failed to fetch revenue', err)
  }

  // --- Fetch recent campaigns ---
  let recentCampaigns: any[] = []
  try {
    const { data } = await supabaseAdmin
      .from('email_campaigns')
      .select('id, name, status, total_sent, total_opened, sent_at, created_at')
      .order('created_at', { ascending: false })
      .limit(5)
    recentCampaigns = data ?? []
  } catch (err) {
    console.error('Dashboard: failed to fetch recent campaigns', err)
  }

  // --- Fetch active automations ---
  let activeAutomations: any[] = []
  try {
    const { data } = await supabaseAdmin
      .from('automations')
      .select('id, name, status, created_at, updated_at')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(5)
    activeAutomations = data ?? []
  } catch (err) {
    console.error('Dashboard: failed to fetch automations', err)
  }

  const kpis = [
    {
      label: 'Contatos Ativos',
      value: formatNumber(activeContacts),
      icon: Users,
    },
    {
      label: 'Emails Enviados (30d)',
      value: formatNumber(emailsSent30d),
      icon: Mail,
    },
    {
      label: 'WhatsApp Enviados (30d)',
      value: formatNumber(whatsappSent30d),
      icon: MessageSquare,
    },
    {
      label: 'Receita (30d)',
      value: formatCurrency(revenue30d),
      icon: DollarSign,
    },
  ]

  function statusLabel(status: string) {
    const map: Record<string, { text: string; cls: string }> = {
      draft: { text: 'Rascunho', cls: 'bg-gray-100 text-gray-600' },
      scheduled: { text: 'Agendada', cls: 'bg-blue-50 text-blue-600' },
      sending: { text: 'Enviando', cls: 'bg-yellow-50 text-yellow-700' },
      sent: { text: 'Enviada', cls: 'bg-green-50 text-green-700' },
      active: { text: 'Ativo', cls: 'bg-green-50 text-green-700' },
      paused: { text: 'Pausada', cls: 'bg-gray-100 text-gray-600' },
    }
    const s = map[status] ?? { text: status, cls: 'bg-gray-100 text-gray-600' }
    return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>{s.text}</span>
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Visao geral do seu marketing</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <div
              key={kpi.label}
              className="bg-white border border-gray-200 rounded-lg p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-gray-100">
                  <Icon className="w-4 h-4 text-gray-600" />
                </div>
              </div>
              <p className="text-xs font-medium text-gray-500 uppercase">{kpi.label}</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">{kpi.value}</p>
            </div>
          )
        })}
      </div>

      {/* Two-column section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Campaigns */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Campanhas Recentes</h2>
            <Link
              href="/campaigns"
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {recentCampaigns.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Nome</th>
                    <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase">Enviados</th>
                    <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase">Abertos</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCampaigns.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 text-gray-900 font-medium truncate max-w-[180px]">{c.name}</td>
                      <td className="py-2.5">{statusLabel(c.status)}</td>
                      <td className="py-2.5 text-right text-gray-600">{formatNumber(c.total_sent || 0)}</td>
                      <td className="py-2.5 text-right text-gray-600">{formatNumber(c.total_opened || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Mail className="w-8 h-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">Nenhuma campanha encontrada</p>
            </div>
          )}
        </div>

        {/* Active Automations */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Automacoes Ativas</h2>
            <Link
              href="/automations"
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {activeAutomations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Nome</th>
                    <th className="text-left py-2 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-right py-2 text-xs font-medium text-gray-500 uppercase">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {activeAutomations.map((a) => (
                    <tr key={a.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 text-gray-900 font-medium truncate max-w-[200px]">{a.name}</td>
                      <td className="py-2.5">{statusLabel(a.status)}</td>
                      <td className="py-2.5 text-right text-gray-500 text-xs">
                        {new Date(a.updated_at).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Zap className="w-8 h-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">Nenhuma automacao ativa</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/campaigns/create"
          className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
        >
          <div className="p-2 rounded-lg bg-blue-50">
            <Send className="w-4 h-4 text-blue-600" />
          </div>
          <span className="text-sm font-medium text-gray-900">Nova Campanha</span>
        </Link>

        <Link
          href="/automations"
          className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
        >
          <div className="p-2 rounded-lg bg-purple-50">
            <Zap className="w-4 h-4 text-purple-600" />
          </div>
          <span className="text-sm font-medium text-gray-900">Criar Automacao</span>
        </Link>

        <Link
          href="/contacts/import"
          className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
        >
          <div className="p-2 rounded-lg bg-green-50">
            <PlusCircle className="w-4 h-4 text-green-600" />
          </div>
          <span className="text-sm font-medium text-gray-900">Importar Contatos</span>
        </Link>

        <Link
          href="/analytics"
          className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
        >
          <div className="p-2 rounded-lg bg-orange-50">
            <BarChart3 className="w-4 h-4 text-orange-600" />
          </div>
          <span className="text-sm font-medium text-gray-900">Ver Analytics</span>
        </Link>
      </div>
    </div>
  )
}
