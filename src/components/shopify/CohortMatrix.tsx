'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Users,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Calendar,
  ArrowRight,
  Info,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

// =============================================
// TYPES
// =============================================

interface CohortMatrixData {
  cohorts: string[]
  periods: number[]
  data: Record<string, Record<number, {
    customers: number
    active: number
    retention: number
    revenue: number
  }>>
  summary: {
    avgRetentionMonth1: number
    avgRetentionMonth3: number
    avgRetentionMonth6: number
    avgRetentionMonth12: number
    bestCohort: string
    worstCohort: string
  }
}

interface CohortMatrixProps {
  storeId: string
}

// =============================================
// HELPERS
// =============================================

function getRetentionColor(retention: number): string {
  if (retention >= 50) return 'bg-green-500'
  if (retention >= 30) return 'bg-green-400'
  if (retention >= 20) return 'bg-yellow-500'
  if (retention >= 10) return 'bg-orange-500'
  if (retention > 0) return 'bg-red-500'
  return 'bg-gray-700'
}

function getRetentionOpacity(retention: number): number {
  return Math.max(0.2, Math.min(1, retention / 100 + 0.2))
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(month) - 1]} ${year.slice(2)}`
}

// =============================================
// COMPONENT
// =============================================

export function CohortMatrix({ storeId }: CohortMatrixProps) {
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [matrixData, setMatrixData] = useState<CohortMatrixData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastCalculated, setLastCalculated] = useState<string | null>(null)
  const [maxMonths, setMaxMonths] = useState(12)

  // Fetch cohort data
  const fetchCohortData = async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch(
        `/api/shopify/analytics/cohort?storeId=${storeId}&view=matrix&maxCohorts=${maxMonths}`
      )
      const data = await res.json()

      if (data.success && data.data) {
        setMatrixData(data.data)
        setLastCalculated(data.data.calculatedAt || null)
      } else {
        setError(data.error || 'Erro ao carregar dados')
      }
    } catch (err) {
      setError('Erro ao carregar dados de cohort')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Calculate cohort
  const calculateCohort = async () => {
    try {
      setCalculating(true)
      setError(null)

      const res = await fetch('/api/shopify/analytics/cohort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, maxMonths }),
      })

      const data = await res.json()

      if (data.success) {
        await fetchCohortData()
      } else {
        setError(data.error || 'Erro ao calcular cohort')
      }
    } catch (err) {
      setError('Erro ao calcular cohort')
      console.error(err)
    } finally {
      setCalculating(false)
    }
  }

  useEffect(() => {
    if (storeId) {
      fetchCohortData()
    }
  }, [storeId, maxMonths])

  // Prepare retention curve data
  const retentionCurveData = matrixData?.periods.map(period => {
    const avgRetention = matrixData.cohorts.reduce((sum, cohort) => {
      const retention = matrixData.data[cohort]?.[period]?.retention || 0
      return sum + retention
    }, 0) / matrixData.cohorts.length

    return {
      month: `Mês ${period}`,
      retention: parseFloat(avgRetention.toFixed(1)),
    }
  }) || []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Análise de Cohort</h2>
          <p className="text-sm text-gray-400">
            Retenção de clientes por mês de primeira compra
          </p>
          {lastCalculated && (
            <p className="text-xs text-gray-500 mt-1">
              Última atualização: {new Date(lastCalculated).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={maxMonths}
            onChange={(e) => setMaxMonths(parseInt(e.target.value))}
            className="px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm"
          >
            <option value={6}>6 meses</option>
            <option value={12}>12 meses</option>
            <option value={18}>18 meses</option>
            <option value={24}>24 meses</option>
          </select>
          <button
            onClick={calculateCohort}
            disabled={calculating}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {calculating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {calculating ? 'Calculando...' : 'Recalcular'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      {matrixData?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#1a1a2e] rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
              <Calendar className="h-4 w-4" />
              Retenção Mês 1
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {matrixData.summary.avgRetentionMonth1.toFixed(1)}%
            </p>
          </div>
          <div className="bg-[#1a1a2e] rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
              <Calendar className="h-4 w-4" />
              Retenção Mês 3
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {matrixData.summary.avgRetentionMonth3.toFixed(1)}%
            </p>
          </div>
          <div className="bg-[#1a1a2e] rounded-xl p-4">
            <div className="flex items-center gap-2 text-green-400 text-sm mb-1">
              <TrendingUp className="h-4 w-4" />
              Melhor Cohort
            </div>
            <p className="text-lg font-bold text-gray-900">
              {formatMonth(matrixData.summary.bestCohort)}
            </p>
          </div>
          <div className="bg-[#1a1a2e] rounded-xl p-4">
            <div className="flex items-center gap-2 text-red-400 text-sm mb-1">
              <TrendingDown className="h-4 w-4" />
              Pior Cohort
            </div>
            <p className="text-lg font-bold text-gray-900">
              {formatMonth(matrixData.summary.worstCohort)}
            </p>
          </div>
        </div>
      )}

      {/* Retention Curve */}
      <div className="bg-[#1a1a2e] rounded-xl p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Curva de Retenção Média</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={retentionCurveData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="month"
                tick={{ fill: '#9ca3af', fontSize: 12 }}
              />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: 12 }}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1a1a2e',
                  border: '1px solid #333',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => [`${value}%`, 'Retenção']}
              />
              <Line
                type="monotone"
                dataKey="retention"
                stroke="#8b5cf6"
                strokeWidth={3}
                dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cohort Matrix */}
      {matrixData && matrixData.cohorts.length > 0 && (
        <div className="bg-[#1a1a2e] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Matriz de Retenção</h3>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Info className="h-4 w-4" />
              Cada célula mostra % de clientes que voltaram a comprar
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left text-gray-400 pb-3 pr-4 whitespace-nowrap">
                    Cohort
                  </th>
                  <th className="text-center text-gray-400 pb-3 px-2 whitespace-nowrap">
                    Clientes
                  </th>
                  {matrixData.periods.slice(0, 13).map(period => (
                    <th
                      key={period}
                      className="text-center text-gray-400 pb-3 px-2 whitespace-nowrap"
                    >
                      M{period}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixData.cohorts.slice(0, 12).map((cohort, idx) => {
                  const cohortData = matrixData.data[cohort]
                  const totalCustomers = cohortData?.[0]?.customers || 0

                  return (
                    <tr key={cohort} className="border-t border-gray-800">
                      <td className="py-2 pr-4 text-gray-300 whitespace-nowrap">
                        {formatMonth(cohort)}
                      </td>
                      <td className="py-2 px-2 text-center text-gray-400">
                        {totalCustomers}
                      </td>
                      {matrixData.periods.slice(0, 13).map(period => {
                        const data = cohortData?.[period]
                        const retention = data?.retention || 0
                        
                        // Period 0 is always 100%
                        if (period === 0) {
                          return (
                            <td key={period} className="py-2 px-2 text-center">
                              <div className="w-12 h-8 mx-auto rounded flex items-center justify-center bg-violet-500 text-white text-xs font-medium">
                                100%
                              </div>
                            </td>
                          )
                        }

                        // Future periods (no data yet)
                        const cohortDate = new Date(cohort + '-01')
                        const monthsSinceCohort = Math.floor(
                          (new Date().getTime() - cohortDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
                        )
                        
                        if (period > monthsSinceCohort) {
                          return (
                            <td key={period} className="py-2 px-2 text-center">
                              <div className="w-12 h-8 mx-auto rounded flex items-center justify-center bg-gray-800 text-gray-600 text-xs">
                                -
                              </div>
                            </td>
                          )
                        }

                        return (
                          <td key={period} className="py-2 px-2 text-center">
                            <motion.div
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: idx * 0.05 + period * 0.02 }}
                              className={`w-12 h-8 mx-auto rounded flex items-center justify-center text-xs font-medium ${getRetentionColor(retention)}`}
                              style={{ opacity: getRetentionOpacity(retention) }}
                              title={`${data?.active || 0} de ${totalCustomers} clientes`}
                            >
                              {retention > 0 ? `${retention.toFixed(0)}%` : '0%'}
                            </motion.div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-6 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-500" />
              <span className="text-gray-400">&gt; 30%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-yellow-500" />
              <span className="text-gray-400">20-30%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-orange-500" />
              <span className="text-gray-400">10-20%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-500" />
              <span className="text-gray-400">&lt; 10%</span>
            </div>
          </div>
        </div>
      )}

      {/* Insights */}
      <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20 rounded-xl p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-3">💡 Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-3">
            <ArrowRight className="h-5 w-5 text-violet-400 mt-0.5" />
            <div>
              <p className="text-gray-300">
                <strong>Retenção no 1º mês</strong> é crítica - é quando você perde mais clientes.
                Foque em campanhas de segunda compra.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ArrowRight className="h-5 w-5 text-violet-400 mt-0.5" />
            <div>
              <p className="text-gray-300">
                <strong>Compare cohorts</strong> para identificar o impacto de campanhas
                ou mudanças no produto.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ArrowRight className="h-5 w-5 text-violet-400 mt-0.5" />
            <div>
              <p className="text-gray-300">
                <strong>Retenção estável</strong> após 6 meses indica clientes leais.
                Invista em programas VIP.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ArrowRight className="h-5 w-5 text-violet-400 mt-0.5" />
            <div>
              <p className="text-gray-300">
                <strong>Queda brusca</strong> entre meses indica problema de experiência
                ou produto.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CohortMatrix
