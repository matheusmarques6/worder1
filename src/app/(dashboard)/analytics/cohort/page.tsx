'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  UsersThree,
  CalendarBlank,
  TrendUp,
  CurrencyDollar,
  ArrowsClockwise,
} from '@phosphor-icons/react'

const cohortData = [
  { month: 'Out 2025', users: 1200, m1: 68, m2: 45, m3: 32, m4: 28, m5: 24 },
  { month: 'Nov 2025', users: 1450, m1: 72, m2: 48, m3: 35, m4: 30, m5: null },
  { month: 'Dez 2025', users: 1680, m1: 65, m2: 42, m3: 31, m4: null, m5: null },
  { month: 'Jan 2026', users: 1920, m1: 70, m2: 46, m3: null, m4: null, m5: null },
  { month: 'Fev 2026', users: 2100, m1: 74, m2: null, m3: null, m4: null, m5: null },
  { month: 'Mar 2026', users: 2340, m1: null, m2: null, m3: null, m4: null, m5: null },
]

const retentionKpis = [
  { title: 'Retenção Mês 1', value: '70.8%', change: '+2.3%', positive: true, icon: ArrowsClockwise },
  { title: 'Retenção Mês 3', value: '32.7%', change: '+1.4%', positive: true, icon: ArrowsClockwise },
  { title: 'LTV Médio', value: 'R$ 284', change: '+12%', positive: true, icon: CurrencyDollar },
  { title: 'Novos Contatos/Mês', value: '2.340', change: '+18%', positive: true, icon: UsersThree },
]

const channelRetention = [
  { channel: 'E-mail + WhatsApp', m1: 78, m2: 52, m3: 38, ltv: 'R$ 342' },
  { channel: 'Apenas E-mail', m1: 65, m2: 40, m3: 28, ltv: 'R$ 218' },
  { channel: 'Apenas WhatsApp', m1: 72, m2: 44, m3: 30, ltv: 'R$ 256' },
  { channel: 'SMS + E-mail', m1: 60, m2: 38, m3: 26, ltv: 'R$ 198' },
]

function getCellColor(value: number | null): string {
  if (value === null) return 'bg-gray-50/20'
  if (value >= 60) return 'bg-emerald-500/30 text-emerald-300'
  if (value >= 40) return 'bg-brand-500/30 text-[#F5A623]'
  if (value >= 25) return 'bg-yellow-500/20 text-yellow-300'
  return 'bg-red-500/20 text-red-300'
}

export default function CohortPage() {
  const [metric, setMetric] = useState<'retention' | 'revenue'>('retention')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-gray-900">Análise de Cohort</h1>
          <p className="text-sm text-gray-500 mt-1">Entenda a retenção e o comportamento dos contatos ao longo do tempo</p>
        </div>
        <div className="flex bg-gray-50/50 rounded-lg p-1">
          <button
            onClick={() => setMetric('retention')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              metric === 'retention' ? 'bg-brand-500 text-white' : 'text-gray-500 hover:text-white'
            }`}
          >
            Retenção
          </button>
          <button
            onClick={() => setMetric('revenue')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              metric === 'revenue' ? 'bg-brand-500 text-white' : 'text-gray-500 hover:text-white'
            }`}
          >
            Receita
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {retentionKpis.map((kpi, i) => {
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
              <span className={`text-xs ${kpi.positive ? 'text-emerald-400' : 'text-red-400'}`}>
                {kpi.change}
              </span>
            </motion.div>
          )
        })}
      </div>

      {/* Cohort Table */}
      <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          {metric === 'retention' ? 'Retenção de Engajamento (%)' : 'Receita por Cohort'}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left text-xs text-gray-500 font-medium pb-3 pr-4">Cohort</th>
                <th className="text-center text-xs text-gray-500 font-medium pb-3 px-2">Contatos</th>
                <th className="text-center text-xs text-gray-500 font-medium pb-3 px-2">Mês 1</th>
                <th className="text-center text-xs text-gray-500 font-medium pb-3 px-2">Mês 2</th>
                <th className="text-center text-xs text-gray-500 font-medium pb-3 px-2">Mês 3</th>
                <th className="text-center text-xs text-gray-500 font-medium pb-3 px-2">Mês 4</th>
                <th className="text-center text-xs text-gray-500 font-medium pb-3 px-2">Mês 5</th>
              </tr>
            </thead>
            <tbody>
              {cohortData.map((row, i) => (
                <motion.tr
                  key={row.month}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="border-b border-gray-200/50"
                >
                  <td className="py-3 text-sm text-gray-700 font-medium pr-4">{row.month}</td>
                  <td className="py-3 text-sm text-gray-500 text-center px-2">
                    {row.users.toLocaleString('pt-BR')}
                  </td>
                  {[row.m1, row.m2, row.m3, row.m4, row.m5].map((val, j) => (
                    <td key={j} className="py-3 px-2">
                      <div className={`text-center text-sm font-medium rounded-md py-1 ${getCellColor(val)}`}>
                        {val !== null ? `${val}%` : '—'}
                      </div>
                    </td>
                  ))}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Channel Retention Comparison */}
      <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Retenção por Estratégia de Canal</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left text-xs text-gray-500 font-medium pb-3">Estratégia</th>
                <th className="text-center text-xs text-gray-500 font-medium pb-3">Mês 1</th>
                <th className="text-center text-xs text-gray-500 font-medium pb-3">Mês 2</th>
                <th className="text-center text-xs text-gray-500 font-medium pb-3">Mês 3</th>
                <th className="text-right text-xs text-gray-500 font-medium pb-3">LTV Médio</th>
              </tr>
            </thead>
            <tbody>
              {channelRetention.map((ch) => (
                <tr key={ch.channel} className="border-b border-gray-200/50">
                  <td className="py-3 text-sm text-gray-700 font-medium">{ch.channel}</td>
                  <td className="py-3 px-2">
                    <div className={`text-center text-sm font-medium rounded-md py-1 ${getCellColor(ch.m1)}`}>
                      {ch.m1}%
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    <div className={`text-center text-sm font-medium rounded-md py-1 ${getCellColor(ch.m2)}`}>
                      {ch.m2}%
                    </div>
                  </td>
                  <td className="py-3 px-2">
                    <div className={`text-center text-sm font-medium rounded-md py-1 ${getCellColor(ch.m3)}`}>
                      {ch.m3}%
                    </div>
                  </td>
                  <td className="py-3 text-sm text-emerald-400 font-medium text-right">{ch.ltv}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          * Contatos engajados em múltiplos canais apresentam retenção significativamente maior
        </p>
      </div>
    </div>
  )
}
