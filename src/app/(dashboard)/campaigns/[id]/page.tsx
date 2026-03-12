'use client'

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

const mockCampaign = {
  id: '1',
  name: 'Black Friday - Esquenta',
  channel: 'email',
  status: 'sent',
  sentAt: '10/03/2026 às 14:00',
  audience: 'Todos os Contatos',
  recipients: 12450,
  subject: '🔥 Esquenta Black Friday: até 70% OFF!',
  sender: 'promo@minhaloja.com.br',
  replyTo: 'suporte@minhaloja.com.br',
}

const kpis = [
  { title: 'Envios', value: '12.450', change: null, icon: PaperPlaneTilt, color: '#3B82F6' },
  { title: 'Taxa de Abertura', value: '32.1%', change: '+4.2% vs média', icon: Eye, color: '#22C55E' },
  { title: 'Taxa de Cliques', value: '8.4%', change: '+1.8% vs média', icon: CursorClick, color: '#F26B2A' },
  { title: 'Receita Gerada', value: 'R$ 8.290', change: 'R$ 0.67/email', icon: CurrencyDollar, color: '#F5A623' },
]

const performanceData = [
  { hour: '14h', opens: 420, clicks: 35 },
  { hour: '15h', opens: 1200, clicks: 98 },
  { hour: '16h', opens: 1800, clicks: 156 },
  { hour: '17h', opens: 2400, clicks: 210 },
  { hour: '18h', opens: 2900, clicks: 280 },
  { hour: '19h', opens: 3200, clicks: 340 },
  { hour: '20h', opens: 3500, clicks: 390 },
  { hour: '21h', opens: 3700, clicks: 420 },
  { hour: '22h', opens: 3850, clicks: 450 },
  { hour: '23h', opens: 3920, clicks: 480 },
  { hour: '00h', opens: 3960, clicks: 510 },
  { hour: '02h', opens: 3990, clicks: 530 },
]

const deviceData = [
  { device: 'Mobile', opens: 62, clicks: 58 },
  { device: 'Desktop', opens: 28, clicks: 32 },
  { device: 'Tablet', opens: 7, clicks: 8 },
  { device: 'Outros', opens: 3, clicks: 2 },
]

const timeline = [
  { time: '14:00', event: 'Campanha enviada para 12.450 contatos', status: 'done' },
  { time: '14:02', event: '12.318 e-mails entregues (98.9%)', status: 'done' },
  { time: '14:05', event: 'Primeiras aberturas detectadas', status: 'done' },
  { time: '14:15', event: '1.000 aberturas atingidas', status: 'done' },
  { time: '15:00', event: 'Primeiro clique convertido em compra', status: 'done' },
  { time: '16:30', event: 'Meta de 25% abertura atingida', status: 'done' },
  { time: '18:00', event: 'Relatório parcial: 32.1% abertura', status: 'done' },
  { time: '20:00', event: 'Receita acumulada: R$ 8.290', status: 'done' },
]

const topLinks = [
  { url: '/colecao/black-friday', clicks: 280, pct: 26.8 },
  { url: '/produto/tenis-runner-pro', clicks: 156, pct: 14.9 },
  { url: '/cupom/ESQUENTA50', clicks: 134, pct: 12.8 },
  { url: '/carrinho', clicks: 98, pct: 9.4 },
  { url: '/colecao/mais-vendidos', clicks: 76, pct: 7.3 },
]

const deliveryDetails = [
  { label: 'Entregues', value: '12.318', pct: '98.9%', color: 'text-emerald-400' },
  { label: 'Bounced', value: '132', pct: '1.1%', color: 'text-red-400' },
  { label: 'Unsubscribed', value: '24', pct: '0.2%', color: 'text-yellow-400' },
  { label: 'Spam Reports', value: '3', pct: '0.02%', color: 'text-red-400' },
]

const statusConfig: Record<string, { label: string; color: string }> = {
  sent: { label: 'Enviada', color: 'bg-emerald-500/10 text-emerald-400' },
  active: { label: 'Ativa', color: 'bg-blue-500/10 text-blue-400' },
  draft: { label: 'Rascunho', color: 'bg-zinc-500/10 text-zinc-400' },
  scheduled: { label: 'Agendada', color: 'bg-yellow-500/10 text-yellow-400' },
}

const channelIcons: Record<string, React.ComponentType<any>> = {
  email: EnvelopeSimple,
  whatsapp: WhatsappLogo,
  sms: DeviceMobileSpeaker,
}

export default function CampaignDetailPage() {
  const router = useRouter()
  const params = useParams()
  const status = statusConfig[mockCampaign.status] || statusConfig.sent
  const ChannelIcon = channelIcons[mockCampaign.channel] || EnvelopeSimple

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
              <h1 className="text-2xl font-bold font-display text-white">{mockCampaign.name}</h1>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status.color}`}>{status.label}</span>
            </div>
            <p className="text-sm text-zinc-400 mt-0.5">Enviada em {mockCampaign.sentAt} · {mockCampaign.audience} · {mockCampaign.recipients.toLocaleString('pt-BR')} destinatários</p>
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Performance Chart */}
        <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-1">Performance nas Primeiras 48h</h3>
          <p className="text-xs text-zinc-500 mb-4">Acumulado de aberturas e cliques</p>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={performanceData}>
              <defs>
                <linearGradient id="gradOpens" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22C55E" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="hour" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                labelStyle={{ color: '#fff' }}
              />
              <Area type="monotone" dataKey="opens" stroke="#22C55E" fill="url(#gradOpens)" strokeWidth={2} name="Aberturas" />
              <Area type="monotone" dataKey="clicks" stroke="#F26B2A" fill="none" strokeWidth={2} name="Cliques" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Device Breakdown */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Por Dispositivo</h3>
          <div className="space-y-4">
            {deviceData.map((d) => (
              <div key={d.device}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-zinc-400">{d.device}</span>
                  <span className="text-sm text-white font-medium">{d.opens}%</span>
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#F26B2A] to-[#F5A623] rounded-full" style={{ width: `${d.opens}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline + Top Links */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timeline */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Timeline da Campanha</h3>
          <div className="space-y-3">
            {timeline.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <CheckCircle size={14} className="text-emerald-400" weight="fill" />
                  </div>
                  {i < timeline.length - 1 && <div className="w-px h-6 bg-zinc-800 mt-1" />}
                </div>
                <div>
                  <p className="text-sm text-white">{item.event}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Links */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Top Links Clicados</h3>
          <div className="space-y-3">
            {topLinks.map((link, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-zinc-800/50 last:border-0">
                <span className="text-xs text-zinc-600 w-5">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-blue-400 truncate font-mono">{link.url}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm text-white font-medium">{link.clicks} cliques</p>
                  <p className="text-xs text-zinc-500">{link.pct}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
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
            <p className="text-sm text-white">{mockCampaign.subject}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Remetente</p>
            <p className="text-sm text-white font-mono">{mockCampaign.sender}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Reply-to</p>
            <p className="text-sm text-white font-mono">{mockCampaign.replyTo}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Canal</p>
            <div className="flex items-center gap-2">
              <ChannelIcon size={16} className="text-[#F26B2A]" weight="fill" />
              <p className="text-sm text-white capitalize">{mockCampaign.channel}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-zinc-500 mb-1">Audiência</p>
            <p className="text-sm text-white">{mockCampaign.audience}</p>
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
