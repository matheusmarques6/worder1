'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Robot,
  Plus,
  PencilSimple,
  Trash,
  Play,
  Pause,
  Lightning,
  ChatCircle,
  WhatsappLogo,
  EnvelopeSimple,
  Globe,
  CheckCircle,
  Clock,
  TrendUp,
  Copy,
  Eye,
  GearSix,
  ArrowSquareOut,
  Warning,
  Brain,
  Sparkle,
  UsersThree,
  ShoppingCart,
} from '@phosphor-icons/react'
import Link from 'next/link'

interface AIAgent {
  id: string
  name: string
  description: string
  status: 'active' | 'draft' | 'paused'
  channels: string[]
  model: string
  totalConversations: number
  avgResponseTime: string
  satisfaction: number
  resolvedRate: number
  lastActive: string
}

const agents: AIAgent[] = [
  {
    id: '1',
    name: 'Atendimento Geral',
    description: 'Responde dúvidas frequentes sobre produtos, entregas e trocas. Escala para humano quando necessário.',
    status: 'active',
    channels: ['whatsapp', 'chat'],
    model: 'Claude 4.5 Sonnet',
    totalConversations: 2840,
    avgResponseTime: '< 3s',
    satisfaction: 94,
    resolvedRate: 78,
    lastActive: '2 min atrás',
  },
  {
    id: '2',
    name: 'Vendas & Recomendações',
    description: 'Recomenda produtos com base no perfil do cliente e histórico de compras. Envia links diretos.',
    status: 'active',
    channels: ['whatsapp'],
    model: 'Claude 4.5 Sonnet',
    totalConversations: 1420,
    avgResponseTime: '< 5s',
    satisfaction: 91,
    resolvedRate: 65,
    lastActive: '8 min atrás',
  },
  {
    id: '3',
    name: 'Recuperação de Carrinho',
    description: 'Aborda clientes com carrinhos abandonados via WhatsApp com ofertas personalizadas.',
    status: 'active',
    channels: ['whatsapp'],
    model: 'Claude Haiku 4.5',
    totalConversations: 680,
    avgResponseTime: '< 2s',
    satisfaction: 88,
    resolvedRate: 42,
    lastActive: '15 min atrás',
  },
  {
    id: '4',
    name: 'Pós-Venda',
    description: 'Acompanha entregas, coleta feedback e solicita avaliações após a compra.',
    status: 'paused',
    channels: ['whatsapp', 'email'],
    model: 'Claude Haiku 4.5',
    totalConversations: 340,
    avgResponseTime: '< 4s',
    satisfaction: 92,
    resolvedRate: 85,
    lastActive: '3 dias atrás',
  },
  {
    id: '5',
    name: 'FAQ do Site',
    description: 'Widget de chat no site para responder perguntas sobre a loja, políticas e produtos.',
    status: 'draft',
    channels: ['chat'],
    model: 'Claude Haiku 4.5',
    totalConversations: 0,
    avgResponseTime: '—',
    satisfaction: 0,
    resolvedRate: 0,
    lastActive: 'Nunca',
  },
]

const kpis = [
  { title: 'Agentes Ativos', value: '3', icon: Robot, color: '#F26B2A' },
  { title: 'Conversas (30d)', value: '4.940', change: '+32%', icon: ChatCircle, color: '#3B82F6' },
  { title: 'Taxa de Resolução', value: '72%', change: '+5%', icon: CheckCircle, color: '#22C55E' },
  { title: 'Satisfação Média', value: '92%', change: '+2%', icon: TrendUp, color: '#A855F7' },
]

const statusConfig: Record<string, { label: string; color: string; dotColor: string }> = {
  active: { label: 'Ativo', color: 'bg-emerald-500/10 text-emerald-400', dotColor: 'bg-emerald-400' },
  draft: { label: 'Rascunho', color: 'bg-zinc-500/10 text-zinc-400', dotColor: 'bg-zinc-400' },
  paused: { label: 'Pausado', color: 'bg-yellow-500/10 text-yellow-400', dotColor: 'bg-yellow-400' },
}

const channelIcons: Record<string, { icon: React.ComponentType<any>; color: string }> = {
  whatsapp: { icon: WhatsappLogo, color: 'text-[#25D366]' },
  email: { icon: EnvelopeSimple, color: 'text-blue-400' },
  chat: { icon: Globe, color: 'text-zinc-400' },
}

export default function SettingsAgentsPage() {
  const router = useRouter()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/settings')}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-[#F26B2A]/10 flex items-center justify-center">
            <Robot size={22} className="text-[#F26B2A]" weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-white">Agentes de IA</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Configure agentes inteligentes para atendimento automático</p>
          </div>
        </div>
        <Link
          href="/whatsapp/ai-agents"
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white text-sm font-medium rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-[#F26B2A]/20"
        >
          <Plus size={16} weight="bold" />
          Novo Agente
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
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-zinc-500 font-medium">{kpi.title}</p>
                  <p className="text-2xl font-bold text-white mt-1">{kpi.value}</p>
                  {kpi.change && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <TrendUp size={12} className="text-emerald-400" weight="bold" />
                      <span className="text-xs text-emerald-400">{kpi.change}</span>
                    </div>
                  )}
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${kpi.color}15` }}>
                  <Icon size={20} style={{ color: kpi.color }} weight="duotone" />
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Agents List */}
      <div className="space-y-4">
        {agents.map((agent, i) => {
          const status = statusConfig[agent.status]
          return (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-[#F26B2A]/10 flex items-center justify-center flex-shrink-0">
                    <Brain size={24} className="text-[#F26B2A]" weight="duotone" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-base font-semibold text-white">{agent.name}</h3>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${status.dotColor} ${agent.status === 'active' ? 'animate-pulse' : ''}`} />
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.color}`}>{status.label}</span>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed">{agent.description}</p>

                    {/* Channels & Model */}
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-600">Canais:</span>
                        <div className="flex items-center gap-1">
                          {agent.channels.map((ch) => {
                            const cfg = channelIcons[ch]
                            if (!cfg) return null
                            const ChIcon = cfg.icon
                            return <ChIcon key={ch} size={14} className={cfg.color} weight="fill" />
                          })}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Sparkle size={12} className="text-purple-400" weight="fill" />
                        <span className="text-xs text-zinc-500">{agent.model}</span>
                      </div>
                      <span className="text-xs text-zinc-600">Último: {agent.lastActive}</span>
                    </div>

                    {/* Stats */}
                    {agent.status !== 'draft' && (
                      <div className="flex items-center gap-6 mt-4">
                        <div>
                          <p className="text-xs text-zinc-600">Conversas</p>
                          <p className="text-sm text-white font-medium">{agent.totalConversations.toLocaleString('pt-BR')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-600">Tempo de Resposta</p>
                          <p className="text-sm text-emerald-400 font-medium">{agent.avgResponseTime}</p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-600">Resolução</p>
                          <p className="text-sm text-blue-400 font-medium">{agent.resolvedRate}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-600">Satisfação</p>
                          <div className="flex items-center gap-1">
                            <p className="text-sm text-[#F26B2A] font-medium">{agent.satisfaction}%</p>
                            {agent.satisfaction >= 90 && <TrendUp size={12} className="text-emerald-400" weight="bold" />}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                  <button className="p-2 rounded-lg hover:bg-zinc-800 transition-colors" title="Editar">
                    <PencilSimple size={16} className="text-zinc-500 hover:text-white" />
                  </button>
                  <button className="p-2 rounded-lg hover:bg-zinc-800 transition-colors" title="Duplicar">
                    <Copy size={16} className="text-zinc-500 hover:text-white" />
                  </button>
                  {agent.status === 'active' ? (
                    <button className="p-2 rounded-lg hover:bg-yellow-500/10 transition-colors" title="Pausar">
                      <Pause size={16} className="text-zinc-500 hover:text-yellow-400" weight="fill" />
                    </button>
                  ) : agent.status !== 'draft' ? (
                    <button className="p-2 rounded-lg hover:bg-emerald-500/10 transition-colors" title="Ativar">
                      <Play size={16} className="text-zinc-500 hover:text-emerald-400" weight="fill" />
                    </button>
                  ) : null}
                  <button className="p-2 rounded-lg hover:bg-red-500/10 transition-colors" title="Excluir">
                    <Trash size={16} className="text-zinc-500 hover:text-red-400" />
                  </button>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Global Settings */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <GearSix size={16} className="text-[#F26B2A]" />
          Configurações Globais
        </h3>
        <div className="space-y-4">
          {[
            { label: 'Escalação Automática', desc: 'Escalar para humano quando o agente não souber responder', enabled: true },
            { label: 'Horário de Funcionamento', desc: 'Respeitar horário comercial (IA responde fora do horário)', enabled: true },
            { label: 'Coleta de Feedback', desc: 'Pedir avaliação ao final de cada conversa', enabled: true },
            { label: 'Limite de Mensagens', desc: 'Limitar a 50 mensagens por conversa antes de escalar', enabled: false },
            { label: 'Modo Debug', desc: 'Mostrar reasoning do agente nas notas internas', enabled: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm text-white font-medium">{item.label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
              </div>
              <button className={`w-11 h-6 rounded-full transition-colors ${item.enabled ? 'bg-[#F26B2A]' : 'bg-zinc-700'}`}>
                <div className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform ${item.enabled ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
