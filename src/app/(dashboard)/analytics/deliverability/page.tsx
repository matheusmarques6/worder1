'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  EnvelopeSimple,
  CheckCircle,
  XCircle,
  Warning,
  ArrowBendUpRight,
  ShieldCheck,
  Globe,
  TrendUp,
  TrendDown,
  CaretDown,
} from '@phosphor-icons/react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const deliveryData = [
  { date: '01 Mar', delivered: 4800, bounced: 120, complaints: 8 },
  { date: '03 Mar', delivered: 5200, bounced: 95, complaints: 5 },
  { date: '05 Mar', delivered: 4600, bounced: 140, complaints: 12 },
  { date: '07 Mar', delivered: 5800, bounced: 88, complaints: 4 },
  { date: '09 Mar', delivered: 5100, bounced: 110, complaints: 7 },
  { date: '11 Mar', delivered: 6200, bounced: 75, complaints: 3 },
  { date: '13 Mar', delivered: 5900, bounced: 92, complaints: 6 },
]

const ispData = [
  { name: 'Gmail', delivered: 94.2, opens: 42.1, inbox: 91.5, spam: 2.7 },
  { name: 'Outlook', delivered: 96.8, opens: 38.4, inbox: 94.2, spam: 1.6 },
  { name: 'Yahoo', delivered: 92.1, opens: 35.7, inbox: 88.3, spam: 3.8 },
  { name: 'UOL', delivered: 95.4, opens: 40.2, inbox: 93.1, spam: 2.3 },
  { name: 'Hotmail', delivered: 93.7, opens: 37.9, inbox: 90.8, spam: 2.9 },
]

const domainHealth = [
  { domain: 'worder.com.br', status: 'healthy', spf: true, dkim: true, dmarc: true, reputation: 92 },
  { domain: 'mail.worder.com.br', status: 'healthy', spf: true, dkim: true, dmarc: true, reputation: 89 },
]

const kpis = [
  { title: 'Taxa de Entrega', value: '97.8%', change: '+0.3%', positive: true, icon: CheckCircle },
  { title: 'Bounce Rate', value: '1.8%', change: '-0.2%', positive: true, icon: XCircle },
  { title: 'Spam Reports', value: '0.08%', change: '-0.02%', positive: true, icon: Warning },
  { title: 'Inbox Placement', value: '92.4%', change: '+1.2%', positive: true, icon: EnvelopeSimple },
]

export default function DeliverabilityPage() {
  const [period, setPeriod] = useState('30d')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-white">Entregabilidade</h1>
          <p className="text-sm text-zinc-400 mt-1">Monitore a saúde dos seus envios e reputação de domínio</p>
        </div>
        <div className="flex bg-zinc-800/50 rounded-lg p-1">
          {['7d', '30d', '90d'].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                period === p ? 'bg-[#F26B2A] text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
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
              className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className="text-zinc-500" />
                <span className="text-xs text-zinc-500">{kpi.title}</span>
              </div>
              <p className="text-xl font-bold text-white">{kpi.value}</p>
              <span className={`text-xs ${kpi.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                {kpi.change}
              </span>
            </motion.div>
          )
        })}
      </div>

      {/* Delivery Chart */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-white mb-4">Volume de Entrega</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={deliveryData}>
            <defs>
              <linearGradient id="gradDelivered" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
            <YAxis stroke="#71717a" fontSize={12} />
            <Tooltip
              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
              labelStyle={{ color: '#fff' }}
            />
            <Area type="monotone" dataKey="delivered" stroke="#10B981" fill="url(#gradDelivered)" strokeWidth={2} name="Entregues" />
            <Area type="monotone" dataKey="bounced" stroke="#EF4444" fill="none" strokeWidth={2} name="Bounced" />
            <Area type="monotone" dataKey="complaints" stroke="#F59E0B" fill="none" strokeWidth={2} name="Reclamações" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ISP Breakdown */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Performance por Provedor</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-xs text-zinc-500 font-medium pb-3">Provedor</th>
                  <th className="text-right text-xs text-zinc-500 font-medium pb-3">Entrega</th>
                  <th className="text-right text-xs text-zinc-500 font-medium pb-3">Aberturas</th>
                  <th className="text-right text-xs text-zinc-500 font-medium pb-3">Inbox</th>
                  <th className="text-right text-xs text-zinc-500 font-medium pb-3">Spam</th>
                </tr>
              </thead>
              <tbody>
                {ispData.map((isp) => (
                  <tr key={isp.name} className="border-b border-zinc-800/50">
                    <td className="py-3 text-sm text-white font-medium">{isp.name}</td>
                    <td className="py-3 text-sm text-zinc-400 text-right">{isp.delivered}%</td>
                    <td className="py-3 text-sm text-zinc-400 text-right">{isp.opens}%</td>
                    <td className="py-3 text-sm text-emerald-400 text-right">{isp.inbox}%</td>
                    <td className="py-3 text-sm text-red-400 text-right">{isp.spam}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Domain Health */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Saúde do Domínio</h3>
          <div className="space-y-4">
            {domainHealth.map((domain) => (
              <div key={domain.domain} className="bg-zinc-800/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Globe size={16} className="text-zinc-400" />
                    <span className="text-sm text-white font-medium">{domain.domain}</span>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">
                    Saudável
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="text-center">
                    <div className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center ${domain.spf ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                      <ShieldCheck size={16} className={domain.spf ? 'text-emerald-400' : 'text-red-400'} />
                    </div>
                    <span className="text-xs text-zinc-500 mt-1 block">SPF</span>
                  </div>
                  <div className="text-center">
                    <div className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center ${domain.dkim ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                      <ShieldCheck size={16} className={domain.dkim ? 'text-emerald-400' : 'text-red-400'} />
                    </div>
                    <span className="text-xs text-zinc-500 mt-1 block">DKIM</span>
                  </div>
                  <div className="text-center">
                    <div className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center ${domain.dmarc ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                      <ShieldCheck size={16} className={domain.dmarc ? 'text-emerald-400' : 'text-red-400'} />
                    </div>
                    <span className="text-xs text-zinc-500 mt-1 block">DMARC</span>
                  </div>
                  <div className="text-center">
                    <div className="mx-auto w-8 h-8 rounded-full flex items-center justify-center bg-zinc-700">
                      <span className="text-xs font-bold text-white">{domain.reputation}</span>
                    </div>
                    <span className="text-xs text-zinc-500 mt-1 block">Score</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
