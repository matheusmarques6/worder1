'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Mail, Plus, Loader2, Send, Eye, MousePointerClick, FileText,
  BarChart3,
} from 'lucide-react'

interface Campaign {
  id: string
  name: string
  status: string
  subject: string
  sent_at: string | null
  scheduled_at: string | null
  created_at: string
  total_recipients: number
  total_sent: number
  total_opened: number
  total_clicked: number
  open_rate: number
  click_rate: number
}

interface Stats {
  total: number
  sent: number
  draft: number
  scheduled: number
}

const statusConfig: Record<string, { label: string; classes: string }> = {
  draft: { label: 'Rascunho', classes: 'bg-gray-100 text-gray-600' },
  scheduled: { label: 'Agendada', classes: 'bg-amber-50 text-amber-700' },
  sending: { label: 'Enviando', classes: 'bg-orange-50 text-orange-700' },
  sent: { label: 'Enviada', classes: 'bg-emerald-50 text-emerald-700' },
  failed: { label: 'Falhou', classes: 'bg-red-50 text-red-700' },
}

export default function CampaignsPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, sent: 0, draft: 0, scheduled: 0 })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        const res = await fetch('/api/email/campaigns')
        const data = await res.json()
        if (data.success) {
          setCampaigns(data.campaigns || [])
          if (data.stats) setStats(data.stats)
        }
      } catch (err) {
        console.error('Error fetching campaigns:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchCampaigns()
  }, [])

  const avgOpenRate = campaigns.length > 0
    ? campaigns.filter(c => c.status === 'sent').reduce((sum, c) => sum + (c.open_rate || 0), 0) /
      Math.max(campaigns.filter(c => c.status === 'sent').length, 1)
    : 0

  const avgClickRate = campaigns.length > 0
    ? campaigns.filter(c => c.status === 'sent').reduce((sum, c) => sum + (c.click_rate || 0), 0) /
      Math.max(campaigns.filter(c => c.status === 'sent').length, 1)
    : 0

  const kpis = [
    { label: 'Total', value: stats.total, icon: FileText, color: 'text-gray-600' },
    { label: 'Enviadas', value: stats.sent, icon: Send, color: 'text-emerald-600' },
    { label: 'Taxa Abertura', value: `${avgOpenRate.toFixed(1)}%`, icon: Eye, color: 'text-brand-600' },
    { label: 'Taxa Clique', value: `${avgClickRate.toFixed(1)}%`, icon: MousePointerClick, color: 'text-blue-600' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campanhas de Email</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gerencie e acompanhe suas campanhas de email marketing
          </p>
        </div>
        <button
          onClick={() => router.push('/email/campaigns/new')}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Campanha
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white border border-gray-200 rounded-lg shadow-sm p-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center">
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium">{kpi.label}</p>
                <p className="text-xl font-bold text-gray-900">{kpi.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && campaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-200 rounded-lg">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Mail className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">Nenhuma campanha criada</h3>
          <p className="text-sm text-gray-500 mb-4">
            Comece criando sua primeira campanha de email
          </p>
          <button
            onClick={() => router.push('/email/campaigns/new')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Campanha
          </button>
        </div>
      )}

      {/* Table */}
      {!isLoading && campaigns.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Data Envio</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Destinatarios</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Abertos</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Clicados</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => {
                  const status = statusConfig[campaign.status] || statusConfig.draft
                  return (
                    <tr
                      key={campaign.id}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/email/campaigns/${campaign.id}`)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{campaign.name}</p>
                        {campaign.subject && (
                          <p className="text-xs text-gray-500 truncate max-w-xs">{campaign.subject}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${status.classes}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {campaign.sent_at
                          ? new Date(campaign.sent_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : campaign.scheduled_at
                            ? new Date(campaign.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 font-medium">
                        {campaign.total_recipients || campaign.total_sent || 0}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900">
                        {campaign.open_rate ? `${campaign.open_rate.toFixed(1)}%` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900">
                        {campaign.click_rate ? `${campaign.click_rate.toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
