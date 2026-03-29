'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  DeviceMobileSpeaker,
  PaperPlaneTilt,
  CurrencyDollar,
  Eye,
  CursorClick,
  TrendUp,
  Plus,
  MagnifyingGlass,
  Clock,
  CheckCircle,
  XCircle,
  Pause,
  CaretDown,
  ChatText,
  UsersThree,
  Lightning,
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

const smsKpis = [
  { title: 'SMS Enviados', value: '12.400', change: '+18%', positive: true, icon: PaperPlaneTilt },
  { title: 'Taxa de Entrega', value: '96.8%', change: '+0.4%', positive: true, icon: CheckCircle },
  { title: 'Taxa de Cliques', value: '4.2%', change: '+0.8%', positive: true, icon: CursorClick },
  { title: 'Receita Atribuída', value: 'R$ 18.400', change: '+22%', positive: true, icon: CurrencyDollar },
]

const smsPerformance = [
  { date: '01 Mar', sent: 1800, delivered: 1740, clicked: 73 },
  { date: '03 Mar', sent: 2100, delivered: 2030, clicked: 85 },
  { date: '05 Mar', sent: 1600, delivered: 1548, clicked: 65 },
  { date: '07 Mar', sent: 2400, delivered: 2322, clicked: 98 },
  { date: '09 Mar', sent: 1900, delivered: 1838, clicked: 77 },
  { date: '11 Mar', sent: 2200, delivered: 2130, clicked: 89 },
  { date: '13 Mar', sent: 2400, delivered: 2322, clicked: 98 },
]

const smsCampaigns = [
  { name: 'Flash Sale - 50% OFF', status: 'sent', sent: 4200, delivered: 4066, clicked: 168, revenue: 'R$ 8.200', date: '12 Mar' },
  { name: 'Lembrete PIX - 24h', status: 'active', sent: 1800, delivered: 1742, clicked: 87, revenue: 'R$ 4.600', date: '11 Mar' },
  { name: 'Cupom Aniversário', status: 'sent', sent: 3200, delivered: 3098, clicked: 124, revenue: 'R$ 3.800', date: '10 Mar' },
  { name: 'Reativação 60d', status: 'scheduled', sent: 0, delivered: 0, clicked: 0, revenue: '—', date: '14 Mar' },
  { name: 'Confirmação de Pedido', status: 'active', sent: 3200, delivered: 3136, clicked: 156, revenue: 'R$ 1.800', date: 'Automação' },
]

const smsTemplates = [
  { name: 'Promoção Relâmpago', preview: '⚡ [LOJA]: Só HOJE! [DESCONTO]% OFF em tudo. Use o cupom [CUPOM]. Compre agora: [LINK]', uses: 24 },
  { name: 'Lembrete de Pagamento', preview: '[LOJA]: Oi [NOME]! Seu pagamento de R$ [VALOR] está pendente. Pague aqui: [LINK]', uses: 18 },
  { name: 'Rastreamento', preview: '[LOJA]: [NOME], seu pedido #[PEDIDO] foi enviado! Rastreie: [LINK]', uses: 45 },
  { name: 'Cupom de Aniversário', preview: '🎂 [LOJA]: Feliz aniversário, [NOME]! Presente especial: [DESCONTO]% OFF. Use: [CUPOM] [LINK]', uses: 12 },
]

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  sent: { label: 'Enviado', color: 'bg-blue-500/10 text-blue-400', icon: CheckCircle },
  active: { label: 'Ativo', color: 'bg-emerald-500/10 text-emerald-400', icon: Lightning },
  scheduled: { label: 'Agendado', color: 'bg-yellow-500/10 text-yellow-400', icon: Clock },
  paused: { label: 'Pausado', color: 'bg-zinc-500/10 text-gray-500', icon: Pause },
}

export default function SMSPage() {
  const [period, setPeriod] = useState('30d')
  const [tab, setTab] = useState<'campaigns' | 'templates'>('campaigns')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
            <DeviceMobileSpeaker size={22} className="text-purple-400" weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">SMS Marketing</h1>
            <p className="text-sm text-gray-500 mt-0.5">Envie campanhas e automações via SMS</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-50/50 rounded-lg p-1">
            {['7d', '30d', '90d'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  period === p ? 'bg-purple-500 text-white' : 'text-gray-500 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium">
            <Plus size={16} />
            Novo SMS
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {smsKpis.map((kpi, i) => {
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
                <Icon size={16} className="text-gray-500" />
                <span className="text-xs text-gray-500">{kpi.title}</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{kpi.value}</p>
              <span className="text-xs text-emerald-400">{kpi.change}</span>
            </motion.div>
          )
        })}
      </div>

      {/* Performance Chart */}
      <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Performance de SMS</h3>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={smsPerformance}>
            <defs>
              <linearGradient id="gradSmsSent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
            <YAxis stroke="#71717a" fontSize={12} />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
              labelStyle={{ color: '#fff' }}
            />
            <Area type="monotone" dataKey="sent" stroke="#8B5CF6" fill="url(#gradSmsSent)" strokeWidth={2} name="Enviados" />
            <Area type="monotone" dataKey="delivered" stroke="#10B981" fill="none" strokeWidth={2} name="Entregues" />
            <Area type="monotone" dataKey="clicked" stroke="#F26B2A" fill="none" strokeWidth={2} name="Cliques" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-0">
        {[
          { id: 'campaigns' as const, label: 'Campanhas', icon: PaperPlaneTilt },
          { id: 'templates' as const, label: 'Templates', icon: ChatText },
        ].map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? 'border-purple-500 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-white'
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'campaigns' ? (
        <div className="bg-white/50 border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left text-xs text-gray-500 font-medium p-4 pb-3">Campanha</th>
                <th className="text-left text-xs text-gray-500 font-medium p-4 pb-3">Status</th>
                <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Enviados</th>
                <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Entregues</th>
                <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Cliques</th>
                <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Receita</th>
                <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Data</th>
              </tr>
            </thead>
            <tbody>
              {smsCampaigns.map((camp, i) => {
                const status = statusConfig[camp.status]
                const StatusIcon = status.icon
                return (
                  <tr key={i} className="border-b border-gray-200/50 hover:bg-gray-50/30 transition-colors cursor-pointer">
                    <td className="p-4 text-sm text-gray-700 font-medium">{camp.name}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        <StatusIcon size={12} weight="fill" />
                        {status.label}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-500 text-right">{camp.sent.toLocaleString('pt-BR')}</td>
                    <td className="p-4 text-sm text-gray-500 text-right">{camp.delivered.toLocaleString('pt-BR')}</td>
                    <td className="p-4 text-sm text-gray-500 text-right">{camp.clicked.toLocaleString('pt-BR')}</td>
                    <td className="p-4 text-sm text-emerald-400 font-medium text-right">{camp.revenue}</td>
                    <td className="p-4 text-sm text-gray-500 text-right">{camp.date}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {smsTemplates.map((tmpl, i) => (
            <motion.div
              key={tmpl.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white/50 border border-gray-200 rounded-xl p-5 hover:border-gray-200 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-gray-900">{tmpl.name}</h4>
                <span className="text-xs text-gray-500">{tmpl.uses} usos</span>
              </div>
              <div className="bg-gray-50/50 rounded-lg p-3 mb-3">
                <p className="text-xs text-gray-500 leading-relaxed font-mono">{tmpl.preview}</p>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">{tmpl.preview.length} caracteres</span>
                <button className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
                  Usar template →
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Credits Info */}
      <div className="bg-white/50 border border-gray-200 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DeviceMobileSpeaker size={20} className="text-purple-400" />
          <div>
            <p className="text-sm text-gray-700 font-medium">Créditos SMS</p>
            <p className="text-xs text-gray-500">8.600 créditos restantes de 20.000</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32 h-2 bg-gray-50 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full" style={{ width: '43%' }} />
          </div>
          <button className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
            Comprar créditos
          </button>
        </div>
      </div>
    </div>
  )
}
