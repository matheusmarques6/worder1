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
import { useToast } from '@/components/ui/Toast'
import { SendingHealthPanel } from '@/components/shared/SendingHealthPanel'

interface Campaign {
  id: string
  name: string
  subject: string
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed'
  /** Público resolvido no disparo. */
  total_recipients?: number | null
  /** Motivo da última falha, quando houve. */
  error_message?: string | null
  scheduled_at?: string
  sent_at?: string
  created_at: string
  /**
   * Números calculados pela rota a partir de email_sends. A tela lia
   * `recipients_count`, `sent_count` e `open_rate` do topo do objeto —
   * campos que a rota nunca mandou: a coluna de destinatários mostrava
   * NaN e as taxas, 0,0% para toda campanha.
   */
  stats?: {
    total: number
    delivered: number
    opened: number
    clicked: number
    bounced: number
    open_rate: string
    click_rate: string
  }
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

const formatNumber = (n: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR').format(Number(n) || 0)
const formatPercent = (n: number | string | null | undefined) =>
  `${(Number(n) || 0).toFixed(1).replace('.', ',')}%`

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [stats, setStats] = useState<CampaignStats>({ total: 0, sent: 0, avg_open_rate: 0, avg_click_rate: 0 })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const { currentStore } = useStoreStore()
  const toast = useToast()

  const fetchCampaigns = useCallback(async () => {
    // Antes esta função voltava sem fazer nada quando não havia loja
    // escolhida — e como o "carregando" começa ligado, quem ainda não
    // conectou uma loja ficava olhando o esqueleto da tabela para sempre.
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (currentStore?.id) params.set('store_id', currentStore.id)
      const res = await fetch(`/api/email/campaigns?${params}`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setCampaigns(data.campaigns || [])
        setStats(data.stats || { total: 0, sent: 0, avg_open_rate: 0, avg_click_rate: 0 })
      } else {
        // Silêncio aqui virava "nenhuma campanha", que é diferente de
        // "não consegui carregar".
        console.error('[Campanhas] falha ao carregar:', res.status, await res.text().catch(() => ''))
        setLoadError('Não foi possível carregar as campanhas. Recarregue a página.')
      }
    } catch (err) {
      console.error('Failed to fetch campaigns:', err)
      setLoadError('Não foi possível carregar as campanhas. Verifique sua conexão.')
    } finally {
      setLoading(false)
    }
  }, [currentStore?.id])

  /**
   * Destrava uma campanha presa em "sending" ou marcada como falha: ela
   * volta para rascunho e o lojista reenvia quando quiser. A rota já
   * existia e nunca funcionava — escrevia numa coluna que não existia no
   * banco e respondia "não está num estado que permite retentativa".
   */
  const retry = async (c: Campaign) => {
    setRetrying(c.id)
    try {
      const res = await fetch(`/api/email/campaigns/${c.id}/retry`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error('Não foi possível destravar', data.error || '')
        return
      }
      toast.success('Campanha de volta para rascunho', 'Revise e envie quando quiser.')
      await fetchCampaigns()
    } finally {
      setRetrying(null)
    }
  }

  const hasHydrated = useStoreStore((s) => s._hasHydrated)
  useEffect(() => {
    if (!hasHydrated) return
    fetchCampaigns()
  }, [fetchCampaigns, hasHydrated])

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

      {/* O que impede as mensagens de chegar. Fica ANTES dos números: de
          nada adianta a taxa de abertura se o domínio caiu. */}
      <SendingHealthPanel channel="email" />

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

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
                          {/* O motivo da falha, onde ele importa. Antes a
                              tela dizia "Falhou" e nada mais. */}
                          {campaign.error_message && (campaign.status === 'failed' || campaign.status === 'sending') && (
                            <p className="text-xs text-red-600 mt-1 max-w-md leading-snug">{campaign.error_message}</p>
                          )}
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
                          {formatNumber(campaign.total_recipients ?? campaign.stats?.total)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-gray-900">
                          {campaign.stats && campaign.stats.total > 0 ? formatPercent(campaign.stats.open_rate) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-gray-900">
                          {campaign.stats && campaign.stats.total > 0 ? formatPercent(campaign.stats.click_rate) : '—'}
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
                        <div className="flex items-center justify-end gap-1">
                          {(campaign.status === 'failed' || campaign.status === 'sending') && (
                            <button
                              onClick={() => retry(campaign)}
                              disabled={retrying === campaign.id}
                              title="Voltar para rascunho para reenviar"
                              className="text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-md px-2 py-1 disabled:opacity-50"
                            >
                              {retrying === campaign.id ? 'Destravando…' : 'Destravar'}
                            </button>
                          )}
                          <Link
                            href={`/email/campaigns/${campaign.id}`}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Link>
                        </div>
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
