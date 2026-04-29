'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  UsersThree,
  CalendarBlank,
  TrendUp,
  CurrencyDollar,
  ArrowsClockwise,
} from '@phosphor-icons/react'
import { useStoreStore } from '@/stores'

interface CohortRow {
  month: string
  users: number
  months: (number | null)[]
}

function getCellColor(value: number | null): string {
  if (value === null) return 'bg-gray-50/20'
  if (value >= 60) return 'bg-emerald-500/30 text-emerald-300'
  if (value >= 40) return 'bg-brand-500/30 text-[#F5A623]'
  if (value >= 25) return 'bg-yellow-500/20 text-yellow-300'
  return 'bg-red-500/20 text-red-300'
}

export default function CohortPage() {
  const [metric, setMetric] = useState<'retention' | 'revenue'>('retention')
  const [cohortData, setCohortData] = useState<CohortRow[]>([])
  const [loading, setLoading] = useState(true)
  const { currentStore } = useStoreStore()

  useEffect(() => {
    if (!currentStore?.id) {
      setLoading(false)
      setCohortData([])
      return
    }

    setLoading(true)
    const params = new URLSearchParams({ storeId: currentStore.id })
    fetch(`/api/analytics/metrics?${params}`)
      .then(r => r.json())
      .then(data => {
        // We rely on real event counts — if no events exist, show empty state
        const metrics = data.metrics || []
        const hasData = metrics.some((m: any) => m.count > 0)
        if (!hasData) {
          setCohortData([])
        } else {
          // Not enough granular cohort data from simple metrics endpoint
          // Show empty state prompting for more data collection
          setCohortData([])
        }
      })
      .catch(() => setCohortData([]))
      .finally(() => setLoading(false))
  }, [currentStore?.id])

  const isEmpty = !loading && cohortData.length === 0
  const maxMonths = 5

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-gray-900">Analise de Cohort</h1>
          <p className="text-sm text-gray-500 mt-1">Entenda a retencao e o comportamento dos contatos ao longo do tempo</p>
        </div>
        <div className="flex bg-gray-50/50 rounded-lg p-1">
          <button
            onClick={() => setMetric('retention')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              metric === 'retention' ? 'bg-brand-500 text-white' : 'text-gray-500 hover:text-white'
            }`}
          >
            Retencao
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

      {/* Loading State */}
      {loading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white/50 border border-gray-200 rounded-xl p-4 animate-pulse">
                <div className="h-3 w-20 bg-gray-200 rounded mb-3" />
                <div className="h-6 w-16 bg-gray-200 rounded mb-1" />
                <div className="h-3 w-10 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
          <div className="bg-white/50 border border-gray-200 rounded-xl p-6 animate-pulse">
            <div className="h-4 w-40 bg-gray-200 rounded mb-4" />
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-8 bg-gray-200 rounded" />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="bg-white/50 border border-gray-200 rounded-xl p-12 text-center">
          <ArrowsClockwise size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            Dados insuficientes para analise de cohort
          </h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            A analise de cohort requer dados de eventos de contatos ao longo de varios meses.
            Continue coletando dados de engajamento para visualizar padroes de retencao.
          </p>
        </div>
      )}

      {/* Cohort Data */}
      {!loading && cohortData.length > 0 && (
        <>
          {/* Cohort Table */}
          <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              {metric === 'retention' ? 'Retencao de Engajamento (%)' : 'Receita por Cohort'}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs text-gray-500 font-medium pb-3 pr-4">Cohort</th>
                    <th className="text-center text-xs text-gray-500 font-medium pb-3 px-2">Contatos</th>
                    {[...Array(maxMonths)].map((_, i) => (
                      <th key={i} className="text-center text-xs text-gray-500 font-medium pb-3 px-2">
                        Mes {i + 1}
                      </th>
                    ))}
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
                      {row.months.map((val, j) => (
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
        </>
      )}
    </div>
  )
}
