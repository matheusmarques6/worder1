'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Mail,
  Send,
  Eye,
  MousePointerClick,
  Plus,
  Search,
  Loader2,
  MoreVertical,
  Calendar,
  Users,
  ChevronRight,
  BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import { useStoreStore } from '@/stores'

interface Campaign {
  id: string
  name: string
  subject: string
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed'
  recipients_count: number
  sent_count: number
  open_rate: number
  click_rate: number
  scheduled_at?: string
  sent_at?: string
  created_at: string
}

interface CampaignStats {
  total: number
  sent: number
  avg_open_rate: number
  avg_click_rate: number
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-gray-50 text-gray-600 border border-gray-200' },
  scheduled: { label: 'Agendada', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  sending: { label: 'Enviando', className: 'bg-orange-50 text-orange-700 border border-orange-200' },
  sent: { label: 'Enviada', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  failed: { label: 'Falhou', className: 'bg-red-50 text-red-700 border border-red-200' },
}

const formatNumber = (n: number) => new Intl.NumberFormat('pt-BR').format(n)
const formatPercent = (n: number) => `${n.toFixed(1)}%`

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats] = useState<CampaignStats>({ total: 0, sent: 0, avg_open_rate: 0, avg_click_rate: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const { currentStore } = useStoreStore()

  const fetchCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (currentStore) params.set('store_id', currentStore?.id || '')
      const res = await fetch(`/api/email/campaigns?${params}`)
      if (res.ok) {
        const data = await res.json()
        setCampaigns(data.campaigns || [])
        setStats(data.stats || { total: 0, sent: 0, avg_open_rate: 0, avg_click_rate: 0 })
      }
    } catch (err) {
      console.error('Failed to fetch campaigns:', err)
    } finally {
      setLoading(false)
    }
  }, [currentStore])

  useEffect(() => {
    fetchCampaigns()
  }, [fetchCampaigns])

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  const kpis = [
    {
      label: 'TOTAL CAMPANHAS',
      value: formatNumber(stats.total),
      icon: Mail,
      color: 'text-brand-500',
      bg: 'bg-brand-50',
    },
    {
      label: 'ENVIADAS',
      value: formatNumber(stats.sent),
      icon: Send,
      color: 'text-emerald-500',
      bg: 'bg-emerald-50',
    },
    {
      label: 'TAXA ABERTURA',
      value: formatPercent(stats.avg_open_rate),
      icon: Eye,
      color: 'text-blue-500',
      bg: 'bg-blue-50',
    },
    {
      label: 'TAXA CLIQUE',
      value: formatPercent(stats.avg_click_rate),
      icon: MousePointerClick,
      color: 'text-purple-500',
      bg: 'bg-purple-50',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Campanhas de Email</h1>
          <p className="text-sm text-gray-500 mt-1">
            Gerencie e acompanhe suas campanhas de email marketing
          </p>
        </div>
        <Link
          href="/email/campaigns/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Campanha
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white border border-gray-200 rounded-lg shadow-sm p-5"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${kpi.bg} rounded-full flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    {kpi.label}
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">{kpi.value}</p>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar campanhas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Send className="w-7 h-7 text-gray-400" />
          </div>
          <h3 className="text-base font-medium text-gray-500 mb-1">
            Nenhuma campanha encontrada
          </h3>
          <p className="text-sm text-gray-400 mb-6">
            {search ? 'Tente ajustar sua busca' : 'Crie sua primeira campanha de email'}
          </p>
          {!search && (
            <Link
              href="/email/campaigns/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nova Campanha
            </Link>
          )}
        </div>
      )}

      {/* Table */}
      {!loading && filtered.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Campanha
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Destinatários
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Abertura
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Cliques
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Data
                  </th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((campaign) => {
                  const status = statusConfig[campaign.status] || statusConfig.draft
                  return (
                    <tr
                      key={campaign.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{campaign.name}</p>
                          <p className="text-xs text-gray-500 truncate max-w-xs">
                            {campaign.subject}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-gray-900">
                          {formatNumber(campaign.recipients_count)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-gray-900">
                          {formatPercent(campaign.open_rate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-gray-900">
                          {formatPercent(campaign.click_rate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-gray-500">
                          {new Date(
                            campaign.sent_at || campaign.scheduled_at || campaign.created_at
                          ).toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/email/campaigns/${campaign.id}`}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Link>
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
