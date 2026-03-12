'use client'

import {
  Globe,
  FileText,
  ChatCircleDots,
  Plus,
  Eye,
  TrendUp,
  UsersThree,
  CursorClick,
} from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import Link from 'next/link'

const cards = [
  {
    title: 'Formulários',
    description: 'Pop-ups, flyouts e formulários inline para captura de leads',
    icon: FileText,
    href: '/forms',
    count: 6,
    metric: '1.2K conversões',
  },
  {
    title: 'Chat Widget',
    description: 'Widget de chat para atendimento e vendas no site',
    icon: ChatCircleDots,
    href: '/site/chat-widget',
    count: 1,
    metric: 'Ativo',
  },
]

const kpis = [
  { title: 'Visitantes (30d)', value: '24.5K', change: '+8%', icon: Eye },
  { title: 'Leads Capturados', value: '1.842', change: '+22%', icon: UsersThree },
  { title: 'Taxa de Conversão', value: '7.5%', change: '+1.2%', icon: TrendUp },
  { title: 'Cliques em Pop-ups', value: '3.1K', change: '+15%', icon: CursorClick },
]

export default function SitePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Site</h1>
          <p className="text-sm text-dark-400 mt-1">Formulários de captura e widget de chat</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-[#F26B2A]/20">
          <Plus className="w-4 h-4" weight="bold" />
          Novo Formulário
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
                  <div className="flex items-center gap-1 mt-2">
                    <TrendUp className="w-3.5 h-3.5 text-green-400" weight="bold" />
                    <span className="text-xs font-medium text-green-400">{kpi.change}</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center">
                  <Icon className="w-5 h-5 text-dark-400" weight="duotone" />
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Link key={card.title} href={card.href}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] p-6 hover:border-[#F26B2A]/20 hover:bg-white/[0.02] transition-all duration-200 cursor-pointer group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#F26B2A]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#F26B2A]/15 transition-colors">
                    <Icon className="w-6 h-6 text-[#F26B2A]" weight="duotone" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white font-display">{card.title}</h3>
                    <p className="text-sm text-dark-400 mt-1">{card.description}</p>
                    <div className="flex items-center gap-4 mt-3">
                      <span className="text-xs text-dark-500">{card.count} ativo{card.count > 1 ? 's' : ''}</span>
                      <span className="text-xs text-[#F26B2A] font-medium">{card.metric}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
