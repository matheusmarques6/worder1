'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  FunnelSimple,
  Eye,
  CursorClick,
  ShoppingCart,
  CreditCard,
  TrendUp,
  CaretDown,
  ArrowRight,
} from '@phosphor-icons/react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const funnelSteps = [
  { label: 'Enviados', value: 48200, pct: 100, color: '#F26B2A' },
  { label: 'Entregues', value: 47100, pct: 97.7, color: '#F5A623' },
  { label: 'Abertos', value: 19920, pct: 42.3, color: '#3B82F6' },
  { label: 'Clicaram', value: 4193, pct: 8.7, color: '#8B5CF6' },
  { label: 'Conversões', value: 1542, pct: 3.2, color: '#10B981' },
]

const funnelByChannel = [
  { channel: 'E-mail', sent: 28400, delivered: 27800, opened: 11120, clicked: 2272, converted: 852 },
  { channel: 'WhatsApp', sent: 12600, delivered: 12474, opened: 6237, clicked: 1373, converted: 504 },
  { channel: 'SMS', sent: 7200, delivered: 6826, opened: 2563, clicked: 548, converted: 186 },
]

const conversionBySource = [
  { source: 'Carrinho Abandonado', conversions: 420, revenue: 38200, rate: 12.4 },
  { source: 'PIX Pendente', conversions: 280, revenue: 24600, rate: 18.2 },
  { source: 'Campanha Promocional', conversions: 380, revenue: 42100, rate: 4.8 },
  { source: 'Boleto Pendente', conversions: 165, revenue: 18900, rate: 15.6 },
  { source: 'Win-back', conversions: 142, revenue: 16200, rate: 6.2 },
  { source: 'Pós-Compra', conversions: 155, revenue: 12400, rate: 8.1 },
]

const weeklyConversions = [
  { week: 'Sem 1', email: 180, whatsapp: 120, sms: 45 },
  { week: 'Sem 2', email: 210, whatsapp: 135, sms: 52 },
  { week: 'Sem 3', email: 195, whatsapp: 148, sms: 48 },
  { week: 'Sem 4', email: 267, whatsapp: 161, sms: 62 },
]

export default function FunnelPage() {
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-gray-900">Funil de Conversão</h1>
        <p className="text-sm text-gray-500 mt-1">Acompanhe cada etapa do funil de marketing</p>
      </div>

      {/* Visual Funnel */}
      <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-6">Funil Geral — Últimos 30 dias</h3>
        <div className="space-y-3">
          {funnelSteps.map((step, i) => (
            <motion.div
              key={step.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center gap-4"
            >
              <span className="text-sm text-gray-500 w-24 text-right">{step.label}</span>
              <div className="flex-1 relative">
                <div className="h-10 bg-gray-50/30 rounded-lg overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${step.pct}%` }}
                    transition={{ delay: i * 0.1 + 0.2, duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-lg flex items-center justify-end pr-3"
                    style={{ backgroundColor: step.color + '30', borderLeft: `3px solid ${step.color}` }}
                  >
                    <span className="text-sm font-medium text-gray-900">
                      {step.value.toLocaleString('pt-BR')}
                    </span>
                  </motion.div>
                </div>
              </div>
              <span className="text-sm font-medium text-gray-700 w-16">{step.pct}%</span>
              {i < funnelSteps.length - 1 && (
                <span className="text-xs text-gray-400 w-20">
                  ↓ {((funnelSteps[i + 1].value / step.value) * 100).toFixed(1)}%
                </span>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel by Channel */}
        <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Funil por Canal</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs text-gray-500 font-medium pb-3">Canal</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Envios</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Aberturas</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Cliques</th>
                  <th className="text-right text-xs text-gray-500 font-medium pb-3">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {funnelByChannel.map((ch) => (
                  <tr key={ch.channel} className="border-b border-gray-200/50">
                    <td className="py-3 text-sm text-gray-700 font-medium">{ch.channel}</td>
                    <td className="py-3 text-sm text-gray-500 text-right">{ch.sent.toLocaleString('pt-BR')}</td>
                    <td className="py-3 text-sm text-gray-500 text-right">
                      {ch.opened.toLocaleString('pt-BR')}
                      <span className="text-gray-400 text-xs ml-1">({((ch.opened / ch.sent) * 100).toFixed(1)}%)</span>
                    </td>
                    <td className="py-3 text-sm text-gray-500 text-right">
                      {ch.clicked.toLocaleString('pt-BR')}
                      <span className="text-gray-400 text-xs ml-1">({((ch.clicked / ch.sent) * 100).toFixed(1)}%)</span>
                    </td>
                    <td className="py-3 text-sm text-emerald-400 font-medium text-right">
                      {ch.converted.toLocaleString('pt-BR')}
                      <span className="text-emerald-600 text-xs ml-1">({((ch.converted / ch.sent) * 100).toFixed(1)}%)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Conversion by Source */}
        <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Conversões por Origem</h3>
          <div className="space-y-3">
            {conversionBySource.map((src) => (
              <div key={src.source} className="flex items-center justify-between py-2 border-b border-gray-200/50">
                <div>
                  <span className="text-sm text-gray-700">{src.source}</span>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-gray-500">{src.conversions} conv.</span>
                    <span className="text-xs text-emerald-400">R$ {src.revenue.toLocaleString('pt-BR')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-gray-50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#F26B2A] rounded-full"
                      style={{ width: `${Math.min(src.rate * 5, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-700 font-medium w-12 text-right">{src.rate}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weekly Conversions Chart */}
      <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Conversões Semanais por Canal</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={weeklyConversions}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="week" stroke="#71717a" fontSize={12} />
            <YAxis stroke="#71717a" fontSize={12} />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
              labelStyle={{ color: '#fff' }}
            />
            <Bar dataKey="email" fill="#F26B2A" radius={[4, 4, 0, 0]} name="E-mail" />
            <Bar dataKey="whatsapp" fill="#25D366" radius={[4, 4, 0, 0]} name="WhatsApp" />
            <Bar dataKey="sms" fill="#8B5CF6" radius={[4, 4, 0, 0]} name="SMS" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
