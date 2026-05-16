'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Megaphone,
  Plus,
  EnvelopeSimple,
  WhatsappLogo,
  ChatCircle,
  DeviceMobileSpeaker,
  TrendUp,
  TrendDown,
  Eye,
  CursorClick,
  CurrencyDollar,
  PaperPlaneTilt,
  FunnelSimple,
  MagnifyingGlass,
  SpinnerGap,
} from '@phosphor-icons/react'
import { useStoreStore } from '@/stores/storeStore'
import { useToast } from '@/components/ui/Toast'

interface Campaign {
  id: string
  name: string
  channel?: string
  status: string
  subject?: string
  sender_email?: string
  reply_to?: string
  scheduled_at?: string
  sent_at?: string
  total_sent?: number
  total_delivered?: number
  total_opened?: number
  total_clicked?: number
  attributed_revenue?: number
  created_at: string
}

const channelIcons: Record<string, React.ReactNode> = {
  email: <EnvelopeSimple className="w-4 h-4 text-blue-400" weight="fill" />,
  whatsapp: <WhatsappLogo className="w-4 h-4 text-[#25D366]" weight="fill" />,
  sms: <DeviceMobileSpeaker className="w-4 h-4 text-purple-400" weight="fill" />,
  chat: <ChatCircle className="w-4 h-4 text-[#F26B2A]" weight="fill" />,
}

const statusColors: Record<string, string> = {
  'sent': 'bg-green-500/10 text-green-400',
  'active': 'bg-blue-500/10 text-blue-400',
  'draft': 'bg-gray-100 text-gray-500',
  'scheduled': 'bg-amber-500/10 text-amber-400',
  'sending': 'bg-blue-500/10 text-blue-400',
}

const statusLabels: Record<string, string> = {
  'sent': 'Enviada',
  'active': 'Ativa',
  'draft': 'Rascunho',
  'scheduled': 'Agendada',
  'sending': 'Enviando',
}

type ChannelFilter = 'all' | 'email' | 'whatsapp' | 'sms' | 'chat'
type StatusFilter = 'all' | 'draft' | 'scheduled' | 'sending' | 'sent' | 'active'

export default function CampaignsPage() {
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const { currentStore } = useStoreStore()
  const toast = useToast()
  // Hydration gate. On F5 refresh zustand reads currentStore from
  // localStorage asynchronously; if the effect fires before that
  // completes, currentStore.id is undefined and the fetch returns
  // the org's first store's campaigns — which on a multi-store org
  // (Dr. Melaxin + Based) is the wrong store. Wait for hydration.
  const hasHydrated = useStoreStore((s) => s._hasHydrated)
  const [loadError, setLoadError] = useState<string | null>(null)

  const fetchCampaigns = useCallback(async () => {
    if (!currentStore?.id) return
    try {
      setLoading(true)
      setLoadError(null)
      const url = `/api/email/campaigns?storeId=${currentStore.id}`
      const res = await fetch(url)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = data?.error || `Erro ${res.status} ao carregar campanhas`
        setCampaigns([])
        setLoadError(msg)
        toast.error('Falha ao carregar campanhas', msg)
        return
      }
      const data = await res.json()
      setCampaigns(data.campaigns || [])
    } catch (err: any) {
      // Surface a real error instead of just an empty page.
      console.error('Failed to fetch campaigns:', err)
      setCampaigns([])
      const msg = err?.message || 'Falha de rede ao carregar campanhas'
      setLoadError(msg)
      toast.error('Falha ao carregar campanhas', msg)
    } finally {
      setLoading(false)
    }
  }, [currentStore?.id, toast])

  useEffect(() => {
    if (!hasHydrated) return
    fetchCampaigns()
  }, [fetchCampaigns, hasHydrated])

  const activeCampaigns = campaigns.filter(c => c.status === 'active' || c.status === 'sending').length
  const totalSent = campaigns.reduce((sum, c) => sum + (c.total_sent || 0), 0)
  const totalOpened = campaigns.reduce((sum, c) => sum + (c.total_opened || 0), 0)
  const totalRevenue = campaigns.reduce((sum, c) => sum + (c.attributed_revenue || 0), 0)
  const openRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0'

  const kpis = [
    { title: 'Campanhas Ativas', value: String(activeCampaigns), icon: Megaphone, color: '#F26B2A' },
    { title: 'Envios (total)', value: totalSent >= 1000 ? `${(totalSent / 1000).toFixed(1)}K` : String(totalSent), icon: PaperPlaneTilt, color: '#3B82F6' },
    { title: 'Taxa de Abertura', value: `${openRate}%`, icon: Eye, color: '#22C55E' },
    { title: 'Receita Atribuída', value: `R$ ${totalRevenue.toLocaleString('pt-BR')}`, icon: CurrencyDollar, color: '#F5A623' },
  ]

  const filteredCampaigns = campaigns.filter(c => {
    if (search && !c.name?.toLowerCase().includes(search.toLowerCase())) return false
    if (channelFilter !== 'all' && (c.channel || 'email') !== channelFilter) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-gray-900">Campanhas</h1>
          <p className="text-sm text-gray-500 mt-1">Crie e gerencie campanhas multicanal</p>
        </div>
        <Link href="/campaigns/create" className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity shadow-sm">
          <Plus className="w-4 h-4" weight="bold" />
          Criar Campanha
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl border border-gray-200 p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500 font-medium">{kpi.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1 font-display">{kpi.value}</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${kpi.color}15` }}>
                  <Icon className="w-5 h-5" style={{ color: kpi.color }} weight="duotone" />
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar campanhas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>
        {/* Filtros inline — antes era um botão sem onClick. Agora
            filtra por canal e status diretamente; o input de busca
            ao lado continua filtrando por nome. */}
        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value as ChannelFilter)}
          className="appearance-none bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-[#F26B2A] transition-colors cursor-pointer"
        >
          <option value="all">Todos os canais</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="chat">Chat</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="appearance-none bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-[#F26B2A] transition-colors cursor-pointer"
        >
          <option value="all">Todos os status</option>
          <option value="draft">Rascunho</option>
          <option value="scheduled">Agendada</option>
          <option value="sending">Enviando</option>
          <option value="sent">Enviada</option>
          <option value="active">Ativa</option>
        </select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <SpinnerGap className="w-8 h-8 text-[#F26B2A] animate-spin" />
        </div>
      )}

      {/* Error State — surfaces fetch failures instead of silently
          rendering an empty list. Includes a retry that re-fires
          the same fetch so the merchant doesn't have to F5. */}
      {!loading && loadError && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Falha ao carregar campanhas</h3>
          <p className="text-sm text-gray-500 max-w-sm mb-4">{loadError}</p>
          <button
            onClick={() => fetchCampaigns()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Empty State (now distinct from error — only fires when fetch succeeded but returned []). */}
      {!loading && !loadError && filteredCampaigns.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Megaphone className="w-16 h-16 text-gray-600 mb-4" weight="duotone" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Nenhuma campanha encontrada</h3>
          <p className="text-sm text-gray-500 mb-5">Crie sua primeira campanha para começar.</p>
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white bg-[#F26B2A] hover:bg-[#E55A1A] rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Criar campanha
          </Link>
        </div>
      )}

      {/* Table — `overflow-x-auto` keeps the layout intact on narrow
          screens while less-critical columns collapse via `hidden`
          breakpoint utilities. Below 640px (sm) we show only
          Campaign + Status; tablet picks up Canal/Envios/Data;
          desktop shows everything. */}
      {!loading && filteredCampaigns.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 sm:px-5 py-3">Campanha</th>
                <th className="hidden md:table-cell text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Canal</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 sm:px-5 py-3">Status</th>
                <th className="hidden sm:table-cell text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Envios</th>
                <th className="hidden lg:table-cell text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Abertura</th>
                <th className="hidden lg:table-cell text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Cliques</th>
                <th className="hidden xl:table-cell text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Receita</th>
                <th className="hidden md:table-cell text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-5 py-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {filteredCampaigns.map((campaign) => {
                const sent = campaign.total_sent || 0
                const opened = campaign.total_opened || 0
                const clicked = campaign.total_clicked || 0
                const revenue = campaign.attributed_revenue || 0
                const openRatePct = sent > 0 ? `${((opened / sent) * 100).toFixed(1)}%` : '-'
                const clickRatePct = sent > 0 ? `${((clicked / sent) * 100).toFixed(1)}%` : '-'
                const channel = campaign.channel || 'email'
                const statusLabel = statusLabels[campaign.status] || campaign.status
                const statusColor = statusColors[campaign.status] || 'bg-gray-100 text-gray-500'
                const dateStr = campaign.sent_at || campaign.scheduled_at || campaign.created_at
                const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('pt-BR') : '-'

                return (
                  <tr key={campaign.id} onClick={() => window.location.href = `/campaigns/${campaign.id}`} className="border-t border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer">
                    <td className="px-3 sm:px-5 py-4 text-sm font-medium text-gray-900">{campaign.name}</td>
                    <td className="hidden md:table-cell px-5 py-4">{channelIcons[channel] || channelIcons.email}</td>
                    <td className="px-3 sm:px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-5 py-4 text-sm text-gray-600">{sent > 0 ? sent.toLocaleString('pt-BR') : '-'}</td>
                    <td className="hidden lg:table-cell px-5 py-4 text-sm text-gray-600">{openRatePct}</td>
                    <td className="hidden lg:table-cell px-5 py-4 text-sm text-gray-600">{clickRatePct}</td>
                    <td className="hidden xl:table-cell px-5 py-4 text-sm font-medium text-gray-900">{revenue > 0 ? `R$ ${revenue.toLocaleString('pt-BR')}` : '-'}</td>
                    <td className="hidden md:table-cell px-5 py-4 text-sm text-gray-500">{formattedDate}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
