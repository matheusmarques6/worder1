'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  EnvelopeSimple,
  Eye,
  CursorClick,
  CurrencyDollar,
  PaperPlaneTilt,
  ChartLineUp,
  CheckCircle,
  XCircle,
  Warning,
  Clock,
  Export,
  Copy,
  Repeat,
  Pause,
  WhatsappLogo,
  DeviceMobileSpeaker,
  Globe,
  UsersThree,
  ArrowSquareOut,
  SpinnerGap,
} from '@phosphor-icons/react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { createBrowserClient } from '@/lib/supabase'

interface CampaignData {
  id: string
  name: string
  channel?: string
  status: string
  subject?: string
  sender_name?: string
  sender_email?: string
  reply_to?: string
  scheduled_at?: string
  sent_at?: string
  total_sent?: number
  total_delivered?: number
  total_opened?: number
  total_clicked?: number
  total_bounced?: number
  total_unsubscribed?: number
  total_spam?: number
  attributed_revenue?: number
  created_at: string
}

const statusConfig: Record<string, { label: string; color: string }> = {
  sent: { label: 'Enviada', color: 'bg-emerald-500/10 text-emerald-400' },
  active: { label: 'Ativa', color: 'bg-blue-500/10 text-blue-400' },
  draft: { label: 'Rascunho', color: 'bg-zinc-500/10 text-zinc-400' },
  scheduled: { label: 'Agendada', color: 'bg-yellow-500/10 text-yellow-400' },
  sending: { label: 'Enviando', color: 'bg-blue-500/10 text-blue-400' },
}

const channelIcons: Record<string, React.ComponentType<any>> = {
  email: EnvelopeSimple,
  whatsapp: WhatsappLogo,
  sms: DeviceMobileSpeaker,
}

export default function CampaignDetailPage() {
  const router = useRouter()
  const params = useParams()
  const [campaign, setCampaign] = useState<CampaignData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchCampaign = useCallback(async () => {
    if (!params.id) return
    try {
      setLoading(true)
      const supabase = createBrowserClient()
      const { data, error } = await supabase
        .from('email_campaigns')
        .select('*')
        .eq('id', params.id)
        .single()

      if (error) {
        console.error('Error fetching campaign:', error.message)
        setCampaign(null)
        return
      }
      setCampaign(data)
    } catch (err) {
      console.error('Failed to fetch campaign:', err)
      setCampaign(null)
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    fetchCampaign()
  }, [fetchCampaign])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <SpinnerGap className="w-8 h-8 text-[#F26B2A] animate-spin" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <EnvelopeSimple className="w-16 h-16 text-gray-600 mb-4" weight="duotone" />
        <h3 className="text-lg font-semibold text-white mb-1">Campanha não encontrada</h3>
        <p className="text-sm text-gray-500 mb-4">A campanha solicitada não existe ou foi removida.</p>
        <button
          onClick={() => router.push('/campaigns')}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-sm"
        >
          <ArrowLeft size={16} />
          Voltar para Campanhas
        </button>
      </div>
    )
  }

  const status = statusConfig[campaign.status] || statusConfig.sent
  const ChannelIcon = channelIcons[campaign.channel || 'email'] || EnvelopeSimple

  const sent = campaign.total_sent || 0
  const delivered = campaign.total_delivered || 0
  const opened = campaign.total_opened || 0
  const clicked = campaign.total_clicked || 0
  const revenue = campaign.attributed_revenue || 0
  const bounced = campaign.total_bounced || 0
  const unsubscribed = campaign.total_unsubscribed || 0
  const spam = campaign.total_spam || 0

  const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0'
  const clickRate = sent > 0 ? ((clicked / sent) * 100).toFixed(1) : '0'

  const kpis = [
    { title: 'Envios', value: sent.toLocaleString('pt-BR'), change: null, icon: PaperPlaneTilt, color: '#3B82F6' },
    { title: 'Taxa de Abertura', value: `${openRate}%`, change: null, icon: Eye, color: '#22C55E' },
    { title: 'Taxa de Cliques', value: `${clickRate}%`, change: null, icon: CursorClick, color: '#F26B2A' },
    { title: 'Receita Gerada', value: `R$ ${revenue.toLocaleString('pt-BR')}`, change: sent > 0 ? `R$ ${(revenue / sent).toFixed(2)}/email` : null, icon: CurrencyDollar, color: '#F5A623' },
  ]

  const deliveryDetails = [
    { label: 'Entregues', value: delivered.toLocaleString('pt-BR'), pct: sent > 0 ? `${((delivered / sent) * 100).toFixed(1)}%` : '0%', color: 'text-emerald-400' },
    { label: 'Bounced', value: bounced.toLocaleString('pt-BR'), pct: sent > 0 ? `${((bounced / sent) * 100).toFixed(1)}%` : '0%', color: 'text-red-400' },
    { label: 'Unsubscribed', value: unsubscribed.toLocaleString('pt-BR'), pct: sent > 0 ? `${((unsubscribed / sent) * 100).toFixed(1)}%` : '0%', color: 'text-yellow-400' },
    { label: 'Spam Reports', value: spam.toLocaleString('pt-BR'), pct: sent > 0 ? `${((spam / sent) * 100).toFixed(2)}%` : '0%', color: 'text-red-400' },
  ]

  const sentAtFormatted = campaign.sent_at
    ? new Date(campaign.sent_at).toLocaleString('pt-BR')
    : campaign.scheduled_at
    ? `Agendada para ${new Date(campaign.scheduled_at).toLocaleString('pt-BR')}`
    : new Date(campaign.created_at).toLocaleDateString('pt-BR')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/campaigns')}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <ChannelIcon size={20} className="text-[#F26B2A]" weight="fill" />
              <h1 className="text-2xl font-bold font-display text-white">{campaign.name}</h1>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status.color}`}>{status.label}</span>
            </div>
            <p className="text-sm text-zinc-400 mt-0.5">{sentAtFormatted} · {sent.toLocaleString('pt-BR')} destinatários</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-xs">
            <Copy size={14} />
            Duplicar
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-xs">
            <Export size={14} />
            Exportar
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white rounded-lg hover:opacity-90 text-xs font-medium">
            <Repeat size={14} />
            Reenviar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-zinc-500 font-medium">{kpi.title}</p>
                  <p className="text-2xl font-bold text-white mt-1">{kpi.value}</p>
                  {kpi.change && <p className="text-xs text-emerald-400 mt-0.5">{kpi.change}</p>}
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${kpi.color}15` }}>
                  <Icon size={20} style={{ color: kpi.color }} weight="duotone" />
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Delivery Details */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Detalhes da Entrega</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {deliveryDetails.map((item) => (
            <div key={item.label} className="bg-zinc-800/30 rounded-xl p-4">
              <p className="text-xs text-zinc-500">{item.label}</p>
              <p className={`text-2xl font-bold mt-1 ${item.color}`}>{item.value}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{item.pct}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Campaign Info */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Informações da Campanha</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Assunto</p>
            <p className="text-sm text-white">{campaign.subject || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Remetente</p>
            <p className="text-sm text-white font-mono">{campaign.sender_email || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Reply-to</p>
            <p className="text-sm text-white font-mono">{campaign.reply_to || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Canal</p>
            <div className="flex items-center gap-2">
              <ChannelIcon size={16} className="text-[#F26B2A]" weight="fill" />
              <p className="text-sm text-white capitalize">{campaign.channel || 'email'}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Criada em</p>
            <p className="text-sm text-white">{new Date(campaign.created_at).toLocaleDateString('pt-BR')}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">ID da Campanha</p>
            <p className="text-sm text-zinc-400 font-mono">{params.id}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
