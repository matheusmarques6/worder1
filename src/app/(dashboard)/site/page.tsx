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
  CheckCircle,
  ArrowRight,
  Lightning,
} from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import Link from 'next/link'

const kpis = [
  { title: 'Visitantes (30d)', value: '24.5K', change: '+8%', icon: Eye, color: 'text-blue-400' },
  { title: 'Leads Capturados', value: '1.842', change: '+22%', icon: UsersThree, color: 'text-emerald-400' },
  { title: 'Taxa de Conversão', value: '7.5%', change: '+1.2%', icon: TrendUp, color: 'text-[#F26B2A]' },
  { title: 'Cliques em Pop-ups', value: '3.1K', change: '+15%', icon: CursorClick, color: 'text-purple-400' },
]

const features = [
  {
    title: 'Formulários de Captura',
    description: 'Pop-ups, flyouts e formulários inline para captura de leads no seu site',
    icon: FileText,
    href: '/site/forms',
    stats: '6 ativos · 1.2K conversões',
    status: 'active',
  },
  {
    title: 'Chat Widget',
    description: 'Widget de chat com IA para atendimento e vendas direto no site',
    icon: ChatCircleDots,
    href: '/site/chat-widget',
    stats: '1 ativo · 340 conversas/mês',
    status: 'active',
  },
  {
    title: 'Pixel de Tracking',
    description: 'Rastreie visitantes, carrinhos abandonados e eventos de conversão',
    icon: Code,
    href: '/settings',
    stats: 'Instalado · 24.5K eventos/mês',
    status: 'active',
  },
  {
    title: 'Analytics do Site',
    description: 'Visualize funil de conversão, páginas mais visitadas e comportamento',
    icon: ChartLineUp,
    href: '/analytics',
    stats: '7.5% conversão geral',
    status: 'active',
  },
]

const quickActions = [
  { title: 'Criar Pop-up', description: 'Capture leads com pop-ups inteligentes', icon: Plus, href: '/site/forms' },
  { title: 'Configurar Chat', description: 'Ative atendimento IA no site', icon: ChatCircleDots, href: '/site/chat-widget' },
  { title: 'Ver Pixel', description: 'Instale o código de tracking', icon: Code, href: '/settings' },
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
            <h1 className="text-2xl font-bold font-display text-white">Site</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Formulários, chat widget, tracking e otimização</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity">
          <Plus size={16} weight="bold" />
          Novo Formulário
        </button>
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
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className={kpi.color} />
                <span className="text-xs text-zinc-500">{kpi.title}</span>
              </div>
              <p className="text-xl font-bold text-white">{kpi.value}</p>
              <div className="flex items-center gap-1 mt-1">
                <TrendUp size={12} className="text-emerald-400" weight="bold" />
                <span className="text-xs text-emerald-400">{kpi.change}</span>
              </div>
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
                className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-all cursor-pointer group h-full"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#F26B2A]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#F26B2A]/15 transition-colors">
                    <Icon size={24} className="text-[#F26B2A]" weight="duotone" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">{feature.title}</h3>
                      <ArrowRight size={16} className="text-zinc-600 group-hover:text-[#F26B2A] transition-colors" />
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{feature.description}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <CheckCircle size={12} className="text-emerald-400" weight="fill" />
                      <span className="text-xs text-zinc-500">{feature.stats}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </Link>
          )
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
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
                className="p-4 bg-zinc-800/30 rounded-lg hover:bg-zinc-800/50 transition-colors group"
              >
                <Icon size={20} className="text-zinc-500 group-hover:text-[#F26B2A] transition-colors mb-2" />
                <p className="text-sm text-white font-medium">{action.title}</p>
                <p className="text-xs text-zinc-600 mt-0.5">{action.description}</p>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Pixel Status */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Code size={20} className="text-emerald-400" />
          <div>
            <p className="text-sm text-white font-medium">Worder Pixel</p>
            <p className="text-xs text-zinc-500">Instalado e rastreando eventos em minhaloja.com.br</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400">Online</span>
          </div>
          <span className="text-xs text-zinc-500">Último evento: 2 min atrás</span>
        </div>
      </div>
    </div>
  )
}
