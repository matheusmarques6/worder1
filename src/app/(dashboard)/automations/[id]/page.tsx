'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Lightning,
  Play,
  Pause,
  PencilSimple,
  Copy,
  Trash,
  Export,
  CheckCircle,
  XCircle,
  Clock,
  EnvelopeSimple,
  WhatsappLogo,
  DeviceMobileSpeaker,
  ShoppingCartSimple,
  UsersThree,
  CurrencyDollar,
  TrendUp,
  Eye,
  CursorClick,
  Timer,
  ArrowsSplit,
  FunnelSimple,
  ChatCircle,
  Warning,
  ChartLineUp,
  CalendarBlank,
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

// ── Mock Data ────────────────────────────────

const mockAutomation = {
  id: '1',
  name: 'Carrinho Abandonado - E-mail + WhatsApp',
  description: 'Sequência de recuperação multicanal para carrinhos abandonados. Envia e-mail após 1h, WhatsApp após 4h e SMS com cupom após 24h.',
  status: 'active' as const,
  trigger: 'Carrinho abandonado',
  triggerType: 'cart_abandoned',
  createdAt: '2025-11-15T10:00:00Z',
  lastEdited: '2026-03-08T14:30:00Z',
  totalContacts: 4820,
  totalRuns: 4820,
  successfulRuns: 4456,
  failedRuns: 32,
  revenue: 128400,
  conversionRate: 18.2,
}

const kpis = [
  { title: 'Total de Execuções', value: '4.820', icon: Lightning, color: '#F26B2A' },
  { title: 'Taxa de Conversão', value: '18.2%', change: '+3.1% vs média', icon: TrendUp, color: '#22C55E' },
  { title: 'Receita Gerada', value: 'R$ 128.4K', change: 'R$ 26.64/contato', icon: CurrencyDollar, color: '#F5A623' },
  { title: 'Contatos Ativos', value: '342', subtitle: 'No fluxo agora', icon: UsersThree, color: '#3B82F6' },
]

const performanceData = [
  { date: '01 Mar', runs: 180, conversions: 32, revenue: 4800 },
  { date: '03 Mar', runs: 210, conversions: 38, revenue: 5700 },
  { date: '05 Mar', runs: 165, conversions: 30, revenue: 4500 },
  { date: '07 Mar', runs: 240, conversions: 44, revenue: 6600 },
  { date: '09 Mar', runs: 195, conversions: 36, revenue: 5400 },
  { date: '11 Mar', runs: 220, conversions: 42, revenue: 6300 },
  { date: '13 Mar', runs: 250, conversions: 48, revenue: 7200 },
]

const flowSteps = [
  { id: '1', type: 'trigger', name: 'Carrinho Abandonado', desc: 'Quando um carrinho é abandonado', icon: ShoppingCartSimple, color: 'text-yellow-400', bgColor: 'bg-yellow-500/10', stats: { entered: 4820 } },
  { id: '2', type: 'delay', name: 'Esperar 1 hora', desc: 'Time delay', icon: Timer, color: 'text-zinc-400', bgColor: 'bg-zinc-500/10', stats: { entered: 4820 } },
  { id: '3', type: 'email', name: 'E-mail: Esqueceu algo?', desc: 'Lembrete com itens do carrinho', icon: EnvelopeSimple, color: 'text-blue-400', bgColor: 'bg-blue-500/10', stats: { entered: 4820, opened: 2120, clicked: 890, converted: 445 } },
  { id: '4', type: 'condition', name: 'Comprou?', desc: 'Verificar se converteu', icon: ArrowsSplit, color: 'text-purple-400', bgColor: 'bg-purple-500/10', stats: { yes: 445, no: 4375 } },
  { id: '5', type: 'delay', name: 'Esperar 3 horas', desc: 'Time delay', icon: Timer, color: 'text-zinc-400', bgColor: 'bg-zinc-500/10', stats: { entered: 4375 } },
  { id: '6', type: 'whatsapp', name: 'WhatsApp: Oferta especial', desc: 'Mensagem com desconto exclusivo', icon: WhatsappLogo, color: 'text-[#25D366]', bgColor: 'bg-[#25D366]/10', stats: { entered: 4375, delivered: 4200, replied: 680, converted: 312 } },
  { id: '7', type: 'condition', name: 'Comprou?', desc: 'Verificar se converteu', icon: ArrowsSplit, color: 'text-purple-400', bgColor: 'bg-purple-500/10', stats: { yes: 312, no: 4063 } },
  { id: '8', type: 'delay', name: 'Esperar 20 horas', desc: 'Time delay', icon: Timer, color: 'text-zinc-400', bgColor: 'bg-zinc-500/10', stats: { entered: 4063 } },
  { id: '9', type: 'sms', name: 'SMS: Último aviso + cupom', desc: 'SMS com cupom de 15% OFF', icon: DeviceMobileSpeaker, color: 'text-purple-400', bgColor: 'bg-purple-500/10', stats: { entered: 4063, delivered: 3920, clicked: 520, converted: 121 } },
]

const channelBreakdown = [
  { channel: 'E-mail', sent: 4820, converted: 445, rate: 9.2, revenue: 58200 },
  { channel: 'WhatsApp', sent: 4375, converted: 312, rate: 7.1, revenue: 42800 },
  { channel: 'SMS', sent: 4063, converted: 121, rate: 3.0, revenue: 27400 },
]

const recentActivity = [
  { id: '1', contact: 'Maria S.', event: 'Converteu após WhatsApp', time: '12 min atrás', value: 'R$ 349,90', status: 'success' },
  { id: '2', contact: 'João P.', event: 'Abriu e-mail de recuperação', time: '28 min atrás', value: null, status: 'info' },
  { id: '3', contact: 'Ana L.', event: 'Clicou no link do SMS', time: '45 min atrás', value: null, status: 'info' },
  { id: '4', contact: 'Pedro M.', event: 'Converteu após e-mail', time: '1h atrás', value: 'R$ 189,90', status: 'success' },
  { id: '5', contact: 'Carla R.', event: 'WhatsApp não entregue', time: '2h atrás', value: null, status: 'error' },
  { id: '6', contact: 'Lucas F.', event: 'Entrou no fluxo', time: '2h atrás', value: null, status: 'info' },
]

const statusConfig = {
  active: { label: 'Ativo', color: 'bg-emerald-500/10 text-emerald-400', dotColor: 'bg-emerald-400' },
  draft: { label: 'Rascunho', color: 'bg-zinc-500/10 text-zinc-400', dotColor: 'bg-zinc-400' },
  paused: { label: 'Pausado', color: 'bg-yellow-500/10 text-yellow-400', dotColor: 'bg-yellow-400' },
}

export default function AutomationDetailPage() {
  const router = useRouter()
  const params = useParams()
  const automation = mockAutomation
  const status = statusConfig[automation.status]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/automations')}
            className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <Lightning size={20} className="text-[#F26B2A]" weight="fill" />
              <h1 className="text-2xl font-bold font-display text-white">{automation.name}</h1>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${status.dotColor} animate-pulse`} />
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status.color}`}>{status.label}</span>
              </div>
            </div>
            <p className="text-sm text-zinc-400 mt-0.5 max-w-2xl">{automation.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-xs">
            <PencilSimple size={14} />
            Editar Fluxo
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 text-xs">
            <Copy size={14} />
            Duplicar
          </button>
          {automation.status === 'active' ? (
            <button className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 text-yellow-400 rounded-lg hover:bg-yellow-500/20 text-xs font-medium">
              <Pause size={14} weight="fill" />
              Pausar
            </button>
          ) : (
            <button className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-[#F26B2A] to-[#F5A623] text-white rounded-lg hover:opacity-90 text-xs font-medium">
              <Play size={14} weight="fill" />
              Ativar
            </button>
          )}
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
                  {kpi.subtitle && <p className="text-xs text-zinc-500 mt-0.5">{kpi.subtitle}</p>}
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${kpi.color}15` }}>
                  <Icon size={20} style={{ color: kpi.color }} weight="duotone" />
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Chart + Channel Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-1">Performance (últimos 14 dias)</h3>
          <p className="text-xs text-zinc-500 mb-4">Execuções e conversões por dia</p>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={performanceData}>
              <defs>
                <linearGradient id="gradRuns" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F26B2A" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#F26B2A" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradConv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22C55E" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                labelStyle={{ color: '#fff' }}
              />
              <Area type="monotone" dataKey="runs" stroke="#F26B2A" fill="url(#gradRuns)" strokeWidth={2} name="Execuções" />
              <Area type="monotone" dataKey="conversions" stroke="#22C55E" fill="url(#gradConv)" strokeWidth={2} name="Conversões" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Channel Breakdown */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Por Canal</h3>
          <div className="space-y-4">
            {channelBreakdown.map((ch) => (
              <div key={ch.channel} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-300 font-medium">{ch.channel}</span>
                  <span className="text-sm text-white font-semibold">{ch.rate}%</span>
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#F26B2A] to-[#F5A623] rounded-full"
                    style={{ width: `${(ch.rate / 10) * 100}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>{ch.converted} conversões</span>
                  <span>R$ {(ch.revenue / 1000).toFixed(1)}K</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Flow Steps Visual */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-sm font-semibold text-white">Etapas do Fluxo</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Performance de cada etapa da automação</p>
          </div>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded-lg hover:text-white text-xs">
            <PencilSimple size={12} />
            Editar Fluxo
          </button>
        </div>
        <div className="space-y-1">
          {flowSteps.map((step, i) => {
            const Icon = step.icon
            return (
              <div key={step.id}>
                <div className="flex items-center gap-4 p-4 bg-zinc-800/30 rounded-xl hover:bg-zinc-800/50 transition-colors">
                  <div className={`w-10 h-10 rounded-xl ${step.bgColor} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={20} className={step.color} weight="fill" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-600 font-mono">#{i + 1}</span>
                      <p className="text-sm text-white font-medium">{step.name}</p>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{step.desc}</p>
                  </div>
                  <div className="flex items-center gap-6 flex-shrink-0">
                    {step.stats.entered !== undefined && (
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Entraram</p>
                        <p className="text-sm text-white font-medium">{step.stats.entered.toLocaleString('pt-BR')}</p>
                      </div>
                    )}
                    {step.stats.opened !== undefined && (
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Abriram</p>
                        <p className="text-sm text-blue-400 font-medium">{step.stats.opened.toLocaleString('pt-BR')}</p>
                      </div>
                    )}
                    {step.stats.delivered !== undefined && (
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Entregues</p>
                        <p className="text-sm text-blue-400 font-medium">{step.stats.delivered.toLocaleString('pt-BR')}</p>
                      </div>
                    )}
                    {step.stats.clicked !== undefined && (
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Clicaram</p>
                        <p className="text-sm text-[#F26B2A] font-medium">{step.stats.clicked.toLocaleString('pt-BR')}</p>
                      </div>
                    )}
                    {step.stats.replied !== undefined && (
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Responderam</p>
                        <p className="text-sm text-[#25D366] font-medium">{step.stats.replied.toLocaleString('pt-BR')}</p>
                      </div>
                    )}
                    {step.stats.converted !== undefined && (
                      <div className="text-right">
                        <p className="text-xs text-zinc-500">Converteram</p>
                        <p className="text-sm text-emerald-400 font-medium">{step.stats.converted.toLocaleString('pt-BR')}</p>
                      </div>
                    )}
                    {step.stats.yes !== undefined && (
                      <>
                        <div className="text-right">
                          <p className="text-xs text-zinc-500">Sim</p>
                          <p className="text-sm text-emerald-400 font-medium">{step.stats.yes.toLocaleString('pt-BR')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-zinc-500">Não</p>
                          <p className="text-sm text-zinc-400 font-medium">{step.stats.no?.toLocaleString('pt-BR')}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {i < flowSteps.length - 1 && (
                  <div className="flex justify-center py-1">
                    <div className="w-px h-4 bg-zinc-700" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Activity + Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Atividade Recente</h3>
          <div className="space-y-3">
            {recentActivity.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    item.status === 'success' ? 'bg-emerald-400' :
                    item.status === 'error' ? 'bg-red-400' :
                    'bg-blue-400'
                  }`} />
                  <div>
                    <p className="text-sm text-white">
                      <span className="font-medium">{item.contact}</span>
                      <span className="text-zinc-400"> — {item.event}</span>
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">{item.time}</p>
                  </div>
                </div>
                {item.value && (
                  <span className="text-sm text-emerald-400 font-medium">{item.value}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Automation Info */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Informações</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-zinc-500">Trigger</p>
                <p className="text-sm text-white mt-0.5">{automation.trigger}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Etapas</p>
                <p className="text-sm text-white mt-0.5">{flowSteps.length} etapas</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Criada em</p>
                <p className="text-sm text-white mt-0.5">{new Date(automation.createdAt).toLocaleDateString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Última edição</p>
                <p className="text-sm text-white mt-0.5">{new Date(automation.lastEdited).toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
            <div className="w-full h-px bg-zinc-800" />
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-zinc-800/30 rounded-lg p-3 text-center">
                <p className="text-xs text-zinc-500">Sucesso</p>
                <p className="text-lg font-bold text-emerald-400">{((automation.successfulRuns / automation.totalRuns) * 100).toFixed(1)}%</p>
              </div>
              <div className="bg-zinc-800/30 rounded-lg p-3 text-center">
                <p className="text-xs text-zinc-500">Falhas</p>
                <p className="text-lg font-bold text-red-400">{automation.failedRuns}</p>
              </div>
              <div className="bg-zinc-800/30 rounded-lg p-3 text-center">
                <p className="text-xs text-zinc-500">ROI</p>
                <p className="text-lg font-bold text-[#F26B2A]">8.2x</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
