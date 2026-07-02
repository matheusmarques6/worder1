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
  Code,
  ChartLineUp,
  Cookie,
  ShieldCheck,
  ArrowRight,
  Lightning,
} from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import Link from 'next/link'

const kpis = [
  { title: 'Visitantes (30d)', value: '—', change: null, icon: Eye, color: 'text-blue-400' },
  { title: 'Leads Capturados', value: '—', change: null, icon: UsersThree, color: 'text-emerald-400' },
  { title: 'Taxa de Conversão', value: '—', change: null, icon: TrendUp, color: 'text-[#F26B2A]' },
  { title: 'Cliques em Pop-ups', value: '—', change: null, icon: CursorClick, color: 'text-purple-400' },
]

const features = [
  {
    title: 'Formulários de Captura',
    description: 'Pop-ups, flyouts e formulários inline para captura de leads no seu site',
    icon: FileText,
    href: '/site/forms',
    stats: 'Criar e gerenciar formulários',
  },
  {
    title: 'Chat Widget',
    description: 'Widget de chat com IA para atendimento e vendas direto no site',
    icon: ChatCircleDots,
    href: '/site/chat-widget',
    stats: 'Configurar widget',
  },
  {
    title: 'Pixel de Tracking',
    description: 'Rastreie visitantes, carrinhos abandonados e eventos de conversão',
    icon: Code,
    href: '/settings/tracking/install',
    stats: 'Instalar código de tracking',
  },
  {
    title: 'Analytics do Site',
    description: 'Visualize funil de conversão, páginas mais visitadas e comportamento',
    icon: ChartLineUp,
    href: '/analytics',
    stats: 'Ver relatórios',
  },
]

const quickActions = [
  { title: 'Criar Pop-up', description: 'Capture leads com pop-ups inteligentes', icon: Plus, href: '/site/forms' },
  { title: 'Configurar Chat', description: 'Ative atendimento IA no site', icon: ChatCircleDots, href: '/site/chat-widget' },
  { title: 'Ver Pixel', description: 'Instale o código de tracking', icon: Code, href: '/settings/tracking/install' },
  { title: 'Banner LGPD', description: 'Configure o banner de cookies', icon: Cookie, href: '/settings/lgpd' },
]

export default function SitePage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <Globe size={22} className="text-blue-400" weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">Site</h1>
            <p className="text-sm text-gray-500 mt-0.5">Formulários, chat widget, tracking e otimização</p>
          </div>
        </div>
        <Link
          href="/site/forms"
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus size={16} weight="bold" />
          Novo Formulário
        </Link>
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
              className="bg-white/50 border border-gray-200 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className={kpi.color} />
                <span className="text-xs text-gray-500">{kpi.title}</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{kpi.value}</p>
              {kpi.change ? (
                <div className="flex items-center gap-1 mt-1">
                  <TrendUp size={12} className="text-emerald-400" weight="bold" />
                  <span className="text-xs text-emerald-400">{kpi.change}</span>
                </div>
              ) : (
                <p className="text-xs text-gray-400 mt-1">Sem dados ainda</p>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {features.map((feature, i) => {
          const Icon = feature.icon
          return (
            <Link key={feature.title} href={feature.href}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white/50 border border-gray-200 rounded-xl p-6 hover:border-gray-200 transition-all cursor-pointer group h-full"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-500/15 transition-colors">
                    <Icon size={24} className="text-[#F26B2A]" weight="duotone" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900">{feature.title}</h3>
                      <ArrowRight size={16} className="text-gray-400 group-hover:text-[#F26B2A] transition-colors" />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{feature.description}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <ArrowRight size={12} className="text-gray-400" weight="bold" />
                      <span className="text-xs text-gray-500">{feature.stats}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </Link>
          )
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Lightning size={16} className="text-[#F26B2A]" />
          Ações Rápidas
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon
            return (
              <Link
                key={action.title}
                href={action.href}
                className="p-4 bg-gray-50/30 rounded-lg hover:bg-gray-50/50 transition-colors group"
              >
                <Icon size={20} className="text-gray-500 group-hover:text-[#F26B2A] transition-colors mb-2" />
                <p className="text-sm text-gray-700 font-medium">{action.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{action.description}</p>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Pixel Status */}
      <div className="bg-white/50 border border-gray-200 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Code size={20} className="text-gray-400" />
          <div>
            <p className="text-sm text-gray-700 font-medium">Worder Pixel</p>
            <p className="text-xs text-gray-500">Instale o pixel para começar a rastrear eventos do seu site</p>
          </div>
        </div>
        <Link
          href="/settings/tracking/install"
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium rounded-lg transition-colors"
        >
          Instalar pixel
          <ArrowRight size={14} weight="bold" />
        </Link>
      </div>
    </div>
  )
}
