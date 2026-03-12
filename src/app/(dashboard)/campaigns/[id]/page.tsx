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
  TrendUp,
  UsersThree,
  ChartLineUp,
  Clock,
  CheckCircle,
} from '@phosphor-icons/react'

const mockCampaign = {
  id: '1',
  name: 'Black Friday - Esquenta',
  channel: 'email',
  status: 'Enviada',
  sentAt: '10/03/2026 às 14:00',
  audience: 'Todos os Contatos',
  recipients: 12450,
  kpis: [
    { title: 'Envios', value: '12.450', icon: PaperPlaneTilt, color: '#3B82F6' },
    { title: 'Taxa de Abertura', value: '32.1%', icon: Eye, color: '#22C55E' },
    { title: 'Taxa de Cliques', value: '8.4%', icon: CursorClick, color: '#F26B2A' },
    { title: 'Receita Gerada', value: 'R$ 8.290', icon: CurrencyDollar, color: '#F5A623' },
  ],
  timeline: [
    { time: '14:00', event: 'Campanha enviada para 12.450 contatos', status: 'done' },
    { time: '14:05', event: 'Primeiras aberturas detectadas', status: 'done' },
    { time: '14:15', event: '1.000 aberturas atingidas', status: 'done' },
    { time: '15:00', event: 'Primeiro clique convertido em compra', status: 'done' },
    { time: '18:00', event: 'Relatório parcial: 32.1% abertura', status: 'done' },
  ],
}

export default function CampaignDetailPage() {
  const router = useRouter()
  const params = useParams()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/campaigns')}
          className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-dark-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" weight="bold" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-display text-white">{mockCampaign.name}</h1>
            <span className="text-xs px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 font-medium">{mockCampaign.status}</span>
          </div>
          <p className="text-sm text-dark-400 mt-0.5">Enviada em {mockCampaign.sentAt} para {mockCampaign.audience}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {mockCampaign.kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-dark-400 font-medium">{kpi.title}</p>
                  <p className="text-2xl font-bold text-white mt-1 font-display">{kpi.value}</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${kpi.color}15` }}>
                  <Icon className="w-5 h-5" style={{ color: kpi.color }} weight="duotone" />
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Performance Chart Placeholder */}
        <div className="lg:col-span-2 bg-[#1A1A1A] rounded-2xl border border-white/[0.06] p-6">
          <h3 className="text-base font-semibold text-white font-display mb-1">Performance ao Longo do Tempo</h3>
          <p className="text-xs text-dark-500 mb-6">Aberturas e cliques nas primeiras 48h</p>
          <div className="h-64 bg-[#111111] rounded-xl flex items-center justify-center">
            <div className="text-center">
              <ChartLineUp className="w-10 h-10 text-dark-600 mx-auto mb-2" weight="duotone" />
              <p className="text-sm text-dark-500">Gráfico de performance</p>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] p-6">
          <h3 className="text-base font-semibold text-white font-display mb-4">Timeline</h3>
          <div className="space-y-4">
            {mockCampaign.timeline.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400" weight="fill" />
                  </div>
                  {i < mockCampaign.timeline.length - 1 && (
                    <div className="w-px h-full bg-white/[0.06] mt-1" />
                  )}
                </div>
                <div className="pb-4">
                  <p className="text-sm text-white">{item.event}</p>
                  <p className="text-xs text-dark-500 mt-0.5">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Details Table */}
      <div className="bg-[#1A1A1A] rounded-2xl border border-white/[0.06] p-6">
        <h3 className="text-base font-semibold text-white font-display mb-4">Detalhes da Entrega</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Entregues', value: '12.318', pct: '98.9%' },
            { label: 'Bounced', value: '132', pct: '1.1%' },
            { label: 'Unsubscribed', value: '24', pct: '0.2%' },
            { label: 'Spam Reports', value: '3', pct: '0.02%' },
          ].map((item) => (
            <div key={item.label} className="p-4 bg-[#111111] rounded-xl">
              <p className="text-xs text-dark-500">{item.label}</p>
              <p className="text-lg font-bold text-white mt-1 font-display">{item.value}</p>
              <p className="text-xs text-dark-400 mt-0.5">{item.pct}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
