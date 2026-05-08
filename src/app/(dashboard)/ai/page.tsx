'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Robot,
  Lightning,
  WhatsappLogo,
  EnvelopeSimple,
  ShoppingCartSimple,
  PixLogo,
  Barcode,
  CreditCard,
  CurrencyDollar,
  TrendUp,
  ArrowClockwise,
  ChatCircleDots,
  Brain,
  Gauge,
  ToggleRight,
  ToggleLeft,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  Gear,
} from '@phosphor-icons/react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

// Dados reais de IA virão de queries em ai_executions / ai_costs_daily na F3.
// Por enquanto exibimos placeholders zerados ao invés de mocks.
const aiKpis: Array<{
  title: string
  value: string
  change: string
  positive: boolean
  icon: typeof CurrencyDollar
  highlight?: boolean
}> = [
  { title: 'Receita Recuperada pela IA', value: 'R$ 0', change: '—', positive: true, icon: CurrencyDollar, highlight: true },
  { title: 'Mensagens IA Enviadas', value: '0', change: '—', positive: true, icon: ChatCircleDots },
  { title: 'Taxa de Recuperação', value: '0%', change: '—', positive: true, icon: ArrowClockwise },
  { title: 'ROI da IA', value: '—', change: '—', positive: true, icon: TrendUp },
]

const recoveryChannels: Array<{
  id: string
  title: string
  icon: typeof ShoppingCartSimple
  enabled: boolean
  channel: string
  recovered: string
  sent: number
  rate: number
  avgTime: string
}> = []

const recoveryTimeline: Array<{ time: string; recovered: number }> = []

const recentRecoveries: Array<{
  customer: string
  type: string
  value: string
  channel: string
  time: string
  status: 'recovered' | 'sent' | 'failed'
}> = []

const incentiveRules: Array<{
  step: number
  time: string
  action: string
  discount: string
  channel: string
}> = []

export default function AIPage() {
  const [enabledChannels, setEnabledChannels] = useState<Record<string, boolean>>({
    cart: true,
    pix: true,
    boleto: true,
    card: false,
  })

  const toggleChannel = (id: string) => {
    setEnabledChannels(prev => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center">
            <Robot size={22} className="text-brand-500" weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">Worder AI</h1>
            <p className="text-sm text-gray-500 mt-0.5">Recuperação inteligente com IA conversacional</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm text-emerald-400 font-medium">IA Ativa</span>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm">
            <Gear size={16} />
            Configurar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {aiKpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`border rounded-xl p-4 ${
                kpi.highlight
                  ? 'bg-brand-50 border-brand-200'
                  : 'bg-white/50 border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className={kpi.highlight ? 'text-brand-600' : 'text-gray-500'} />
                <span className={`text-xs ${kpi.highlight ? 'text-[#F5A623]' : 'text-gray-500'}`}>{kpi.title}</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{kpi.value}</p>
              <span className="text-xs text-emerald-400">{kpi.change}</span>
            </motion.div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recovery Channels */}
        <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Canais de Recuperação</h3>
          <div className="space-y-3">
            {recoveryChannels.map((ch) => {
              const Icon = ch.icon
              const isEnabled = enabledChannels[ch.id]
              return (
                <div key={ch.id} className={`bg-gray-50/30 rounded-lg p-4 border ${isEnabled ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Icon size={20} className={isEnabled ? 'text-brand-600' : 'text-gray-400'} />
                      <span className="text-sm text-gray-700 font-medium">{ch.title}</span>
                      <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-500">
                        {ch.channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'}
                      </span>
                    </div>
                    <button onClick={() => toggleChannel(ch.id)}>
                      {isEnabled ? (
                        <ToggleRight size={28} className="text-emerald-400" weight="fill" />
                      ) : (
                        <ToggleLeft size={28} className="text-gray-400" weight="fill" />
                      )}
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <span className="text-xs text-gray-500">Recuperado</span>
                      <p className="text-sm font-semibold text-emerald-400">{ch.recovered}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Enviados</span>
                      <p className="text-sm font-medium text-gray-900">{ch.sent}</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Taxa</span>
                      <p className="text-sm font-medium text-gray-900">{ch.rate}%</p>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Tempo Médio</span>
                      <p className="text-sm font-medium text-gray-900">{ch.avgTime}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recovery Timeline Chart */}
        <div className="space-y-6">
          <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Receita Recuperada — Hoje</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={recoveryTimeline}>
                <defs>
                  <linearGradient id="gradRecovery" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="time" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff' }}
                  formatter={(value: number) => [`R$ ${value.toLocaleString('pt-BR')}`, 'Recuperado']}
                />
                <Area type="monotone" dataKey="recovered" stroke="#10B981" fill="url(#gradRecovery)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Progressive Incentives */}
          <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Incentivos Progressivos</h3>
            <div className="space-y-2">
              {incentiveRules.map((rule) => (
                <div key={rule.step} className="flex items-center gap-3 py-2 border-b border-gray-200/50 last:border-0">
                  <div className="w-6 h-6 rounded-full bg-brand-500/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-brand-600">{rule.step}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-700">{rule.action}</span>
                      <span className="text-xs text-gray-500">• {rule.time}</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-500">{rule.channel}</span>
                  <span className={`text-xs font-medium ${rule.discount !== '—' ? 'text-emerald-400' : 'text-gray-400'}`}>
                    {rule.discount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Recoveries */}
      <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Recuperações Recentes</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left text-xs text-gray-500 font-medium pb-3">Cliente</th>
                <th className="text-left text-xs text-gray-500 font-medium pb-3">Tipo</th>
                <th className="text-left text-xs text-gray-500 font-medium pb-3">Valor</th>
                <th className="text-left text-xs text-gray-500 font-medium pb-3">Canal</th>
                <th className="text-left text-xs text-gray-500 font-medium pb-3">Tempo</th>
                <th className="text-left text-xs text-gray-500 font-medium pb-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentRecoveries.map((rec, i) => (
                <tr key={i} className="border-b border-gray-200/50 hover:bg-gray-50/30">
                  <td className="py-3 text-sm text-gray-700">{rec.customer}</td>
                  <td className="py-3 text-sm text-gray-500">{rec.type}</td>
                  <td className="py-3 text-sm text-gray-700 font-medium">{rec.value}</td>
                  <td className="py-3 text-sm text-gray-500">{rec.channel}</td>
                  <td className="py-3 text-sm text-gray-500">{rec.time}</td>
                  <td className="py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      rec.status === 'recovered' ? 'bg-emerald-500/10 text-emerald-400' :
                      rec.status === 'sent' ? 'bg-blue-500/10 text-blue-400' :
                      'bg-red-500/10 text-red-400'
                    }`}>
                      {rec.status === 'recovered' && <CheckCircle size={12} weight="fill" />}
                      {rec.status === 'sent' && <Clock size={12} />}
                      {rec.status === 'failed' && <XCircle size={12} weight="fill" />}
                      {rec.status === 'recovered' ? 'Recuperado' : rec.status === 'sent' ? 'Enviado' : 'Falhou'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
