'use client'

import { useState } from 'react'
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
} from '@phosphor-icons/react'

const kpis = [
  { title: 'Campanhas Ativas', value: '12', icon: Megaphone, color: '#F26B2A' },
  { title: 'Envios (30d)', value: '45.2K', icon: PaperPlaneTilt, color: '#3B82F6' },
  { title: 'Taxa de Abertura', value: '32.4%', change: '+2.1%', positive: true, icon: Eye, color: '#22C55E' },
  { title: 'Receita Atribuída', value: 'R$ 28.450', change: '+15%', positive: true, icon: CurrencyDollar, color: '#F5A623' },
]

const mockCampaigns = [
  { id: '1', name: 'Black Friday - Esquenta', channel: 'email', status: 'Enviada', sent: '12.450', opened: '32.1%', clicked: '8.4%', revenue: 'R$ 8.290', date: '10/03/2026' },
  { id: '2', name: 'Recuperação PIX Março', channel: 'whatsapp', status: 'Ativa', sent: '3.200', opened: '89.2%', clicked: '24.1%', revenue: 'R$ 12.150', date: '08/03/2026' },
  { id: '3', name: 'Lançamento Coleção', channel: 'email', status: 'Rascunho', sent: '-', opened: '-', clicked: '-', revenue: '-', date: '12/03/2026' },
  { id: '4', name: 'Win-back 90 dias', channel: 'sms', status: 'Agendada', sent: '-', opened: '-', clicked: '-', revenue: '-', date: '15/03/2026' },
]

const channelIcons: Record<string, React.ReactNode> = {
  email: <EnvelopeSimple className="w-4 h-4 text-blue-400" weight="fill" />,
  whatsapp: <WhatsappLogo className="w-4 h-4 text-[#25D366]" weight="fill" />,
  sms: <DeviceMobileSpeaker className="w-4 h-4 text-purple-400" weight="fill" />,
  chat: <ChatCircle className="w-4 h-4 text-[#F26B2A]" weight="fill" />,
}

const statusColors: Record<string, string> = {
  'Enviada': 'bg-green-500/10 text-green-400',
  'Ativa': 'bg-blue-500/10 text-blue-400',
  'Rascunho': 'bg-dark-700 text-dark-400',
  'Agendada': 'bg-amber-500/10 text-amber-400',
}

export default function CampaignsPage() {
  const [search, setSearch] = useState('')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Campanhas</h1>
          <p className="text-sm text-dark-400 mt-1">Crie e gerencie campanhas multicanal</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-[#F26B2A]/20">
          <Plus className="w-4 h-4" weight="bold" />
          Criar Campanha
        </button>
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
              className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-dark-400 font-medium">{kpi.title}</p>
                  <p className="text-2xl font-bold text-white mt-1 font-display">{kpi.value}</p>
                  {kpi.change && (
                    <div className="flex items-center gap-1 mt-2">
                      {kpi.positive ? <TrendUp className="w-3.5 h-3.5 text-green-400" weight="bold" /> : <TrendDown className="w-3.5 h-3.5 text-red-400" weight="bold" />}
                      <span className={`text-xs font-medium ${kpi.positive ? 'text-green-400' : 'text-red-400'}`}>{kpi.change}</span>
                    </div>
                  )}
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
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            placeholder="Buscar campanhas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#1A1A1A] border border-white/[0.06] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-dark-500 focus:outline-none focus:border-[#F26B2A]/40 transition-colors"
          />
        </div>
        <button className="flex items-center gap-2 px-3 py-2.5 bg-[#1A1A1A] border border-white/[0.06] rounded-xl text-sm text-dark-400 hover:text-white hover:border-white/[0.12] transition-colors">
          <FunnelSimple className="w-4 h-4" />
          Filtros
        </button>
      </div>

      {/* Table */}
      <div className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#111111]">
              <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Campanha</th>
              <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Canal</th>
              <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Status</th>
              <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Envios</th>
              <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Abertura</th>
              <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Cliques</th>
              <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Receita</th>
              <th className="text-left text-xs font-semibold text-dark-400 uppercase tracking-wider px-5 py-3">Data</th>
            </tr>
          </thead>
          <tbody>
            {mockCampaigns.map((campaign) => (
              <tr key={campaign.id} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer">
                <td className="px-5 py-4 text-sm font-medium text-white">{campaign.name}</td>
                <td className="px-5 py-4">{channelIcons[campaign.channel]}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[campaign.status]}`}>
                    {campaign.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-sm text-dark-300">{campaign.sent}</td>
                <td className="px-5 py-4 text-sm text-dark-300">{campaign.opened}</td>
                <td className="px-5 py-4 text-sm text-dark-300">{campaign.clicked}</td>
                <td className="px-5 py-4 text-sm font-medium text-white">{campaign.revenue}</td>
                <td className="px-5 py-4 text-sm text-dark-400">{campaign.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
