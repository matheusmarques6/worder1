'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  EnvelopeSimple,
  CheckCircle,
  XCircle,
  Warning,
  ShieldCheck,
  Globe,
  TrendUp,
  TrendDown,
  Spinner,
  ThermometerHot,
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

interface DeliverabilityData {
  kpis: {
    deliveryRate: string
    bounceRate: string
    complaintRate: string
    openRate: string
    clickRate: string
    reputationScore: number
    totalSent: number
    totalDelivered: number
    totalBounced: number
    totalComplaints: number
  }
  deliveryChart: { date: string; delivered: number; bounced: number; complaints: number }[]
  ispBreakdown: { name: string; delivered: number; opens: number; inbox: number; spam: number }[]
  domainHealth: {
    domain: string
    status: string
    spf: boolean
    dkim: boolean
    dmarc: boolean
    reputation: number
    warmup: { day: number; dailyLimit: number } | null
  }[]
}

export default function DeliverabilityPage() {
  const [period, setPeriod] = useState('30d')
  const [data, setData] = useState<DeliverabilityData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
    setLoading(true)
    fetch(`/api/analytics/deliverability?days=${days}`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [period])

  const kpis = data ? [
    {
      title: 'Taxa de Entrega',
      value: `${data.kpis.deliveryRate}%`,
      detail: `${data.kpis.totalDelivered.toLocaleString('pt-BR')} de ${data.kpis.totalSent.toLocaleString('pt-BR')}`,
      positive: Number(data.kpis.deliveryRate) >= 95,
      icon: CheckCircle,
    },
    {
      title: 'Bounce Rate',
      value: `${data.kpis.bounceRate}%`,
      detail: `${data.kpis.totalBounced} bounces`,
      positive: Number(data.kpis.bounceRate) < 2,
      icon: XCircle,
    },
    {
      title: 'Spam Complaints',
      value: `${data.kpis.complaintRate}%`,
      detail: `${data.kpis.totalComplaints} reclamações`,
      positive: Number(data.kpis.complaintRate) < 0.1,
      icon: Warning,
    },
    {
      title: 'Reputation Score',
      value: `${data.kpis.reputationScore}/100`,
      detail: data.kpis.reputationScore >= 80 ? 'Saudável' : data.kpis.reputationScore >= 50 ? 'Atenção' : 'Crítico',
      positive: data.kpis.reputationScore >= 80,
      icon: EnvelopeSimple,
    },
  ] : []

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size={32} className="text-gray-400 animate-spin" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p>Sem dados de envio ainda. Envie sua primeira campanha para ver métricas.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-gray-900">Entregabilidade</h1>
          <p className="text-sm text-gray-500 mt-1">Monitore a saúde dos seus envios e reputação de domínio</p>
        </div>
        <div className="flex bg-gray-50/50 rounded-lg p-1">
          {['7d', '30d', '90d'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                period === p ? 'bg-brand-500 text-white' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Alert banners */}
      {Number(data.kpis.bounceRate) > 5 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <Warning size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Bounce rate crítico: {data.kpis.bounceRate}%</p>
            <p className="text-xs text-red-600 mt-1">Acima de 5% prejudica sua reputação. Limpe sua lista removendo emails inválidos.</p>
          </div>
        </div>
      )}
      {Number(data.kpis.complaintRate) > 0.1 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <Warning size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Spam complaints elevado: {data.kpis.complaintRate}%</p>
            <p className="text-xs text-amber-600 mt-1">Google exige abaixo de 0.3%. Ative Smart Sending e revise seu conteúdo.</p>
          </div>
        </div>
      )}

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
              className="bg-white border border-gray-200 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className="text-gray-500" />
                <span className="text-xs text-gray-500">{kpi.title}</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{kpi.value}</p>
              <div className="flex items-center gap-1 mt-1">
                {kpi.positive ? (
                  <TrendUp size={12} className="text-emerald-500" />
                ) : (
                  <TrendDown size={12} className="text-red-500" />
                )}
                <span className={`text-xs ${kpi.positive ? 'text-emerald-500' : 'text-red-500'}`}>
                  {kpi.detail}
                </span>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Delivery Chart */}
      {data.deliveryChart.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Volume de Entrega</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.deliveryChart}>
              <defs>
                <linearGradient id="gradDelivered" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                labelStyle={{ color: '#1e293b' }}
              />
              <Area type="monotone" dataKey="delivered" stroke="#10B981" fill="url(#gradDelivered)" strokeWidth={2} name="Entregues" />
              <Area type="monotone" dataKey="bounced" stroke="#EF4444" fill="none" strokeWidth={2} name="Bounced" />
              <Area type="monotone" dataKey="complaints" stroke="#F59E0B" fill="none" strokeWidth={2} name="Reclamações" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ISP Breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Performance por Provedor (ISP)</h3>
          {data.ispBreakdown.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">Dados ISP disponíveis após os primeiros envios</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs text-gray-500 font-medium pb-3">Provedor</th>
                    <th className="text-right text-xs text-gray-500 font-medium pb-3">Entrega</th>
                    <th className="text-right text-xs text-gray-500 font-medium pb-3">Aberturas</th>
                    <th className="text-right text-xs text-gray-500 font-medium pb-3">Inbox</th>
                    <th className="text-right text-xs text-gray-500 font-medium pb-3">Spam</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ispBreakdown.map((isp) => (
                    <tr key={isp.name} className="border-b border-gray-100">
                      <td className="py-3 text-sm text-gray-700 font-medium">{isp.name}</td>
                      <td className="py-3 text-sm text-gray-500 text-right">{isp.delivered}%</td>
                      <td className="py-3 text-sm text-gray-500 text-right">{isp.opens}%</td>
                      <td className={`py-3 text-sm text-right ${isp.inbox >= 90 ? 'text-emerald-500' : isp.inbox >= 80 ? 'text-amber-500' : 'text-red-500'}`}>
                        {isp.inbox}%
                      </td>
                      <td className={`py-3 text-sm text-right ${isp.spam < 0.5 ? 'text-gray-400' : 'text-red-500'}`}>
                        {isp.spam}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Domain Health */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Saúde do Domínio</h3>
          {data.domainHealth.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">
              Nenhum domínio configurado.{' '}
              <a href="/settings/email" className="text-violet-500 underline">Configurar domínio</a>
            </p>
          ) : (
            <div className="space-y-4">
              {data.domainHealth.map((domain) => (
                <div key={domain.domain} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Globe size={16} className="text-gray-500" />
                      <span className="text-sm text-gray-700 font-medium">{domain.domain}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {domain.warmup && (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-xs rounded-full flex items-center gap-1">
                          <ThermometerHot size={12} />
                          Warm-up dia {domain.warmup.day}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        domain.status === 'healthy' || domain.status === 'verified'
                          ? 'bg-emerald-50 text-emerald-600'
                          : domain.status === 'pending'
                          ? 'bg-amber-50 text-amber-600'
                          : 'bg-red-50 text-red-600'
                      }`}>
                        {domain.status === 'healthy' || domain.status === 'verified' ? 'Verificado' : domain.status === 'pending' ? 'Pendente' : domain.status}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: 'SPF', ok: domain.spf },
                      { label: 'DKIM', ok: domain.dkim },
                      { label: 'DMARC', ok: domain.dmarc },
                    ].map((check) => (
                      <div key={check.label} className="text-center">
                        <div className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center ${check.ok ? 'bg-emerald-50' : 'bg-red-50'}`}>
                          <ShieldCheck size={16} className={check.ok ? 'text-emerald-500' : 'text-red-400'} />
                        </div>
                        <span className="text-xs text-gray-500 mt-1 block">{check.label}</span>
                      </div>
                    ))}
                    <div className="text-center">
                      <div className="mx-auto w-8 h-8 rounded-full flex items-center justify-center bg-gray-100">
                        <span className={`text-xs font-bold ${
                          domain.reputation >= 80 ? 'text-emerald-600' : domain.reputation >= 50 ? 'text-amber-600' : 'text-red-600'
                        }`}>{domain.reputation}</span>
                      </div>
                      <span className="text-xs text-gray-500 mt-1 block">Score</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Thresholds reference */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Referência de Limites (Gmail/Yahoo)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Bounce Rate</p>
            <p className="font-medium text-gray-700">&lt; 2% <span className="text-emerald-500">bom</span> · &gt; 5% <span className="text-red-500">crítico</span></p>
          </div>
          <div>
            <p className="text-gray-500">Spam Complaint</p>
            <p className="font-medium text-gray-700">&lt; 0.1% <span className="text-emerald-500">bom</span> · &gt; 0.3% <span className="text-red-500">crítico</span></p>
          </div>
          <div>
            <p className="text-gray-500">Open Rate</p>
            <p className="font-medium text-gray-700">&gt; 20% <span className="text-emerald-500">bom</span> · &lt; 10% <span className="text-red-500">baixo</span></p>
          </div>
          <div>
            <p className="text-gray-500">Unsubscribe Rate</p>
            <p className="font-medium text-gray-700">&lt; 0.5% <span className="text-emerald-500">bom</span> · &gt; 1% <span className="text-red-500">alto</span></p>
          </div>
        </div>
      </div>
    </div>
  )
}
