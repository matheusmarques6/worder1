'use client'

import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Users,
  Percent,
} from 'lucide-react'

// =============================================
// TYPES
// =============================================

interface CohortSummary {
  avgRetentionMonth1: number
  avgRetentionMonth3: number
  bestCohort: string
  worstCohort: string
}

interface CohortSectionProps {
  data: {
    months: string[]
    matrix: Record<string, Record<number, { retention: number; active: number; total: number }>>
    summary: CohortSummary
  }
}

// =============================================
// HELPERS
// =============================================

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(month) - 1]} ${year.slice(2)}`
}

function getRetentionColor(retention: number): string {
  // Gradiente de laranja (Worder) para cinza
  if (retention >= 40) return 'bg-primary-500'
  if (retention >= 30) return 'bg-primary-400'
  if (retention >= 20) return 'bg-accent-500'
  if (retention >= 10) return 'bg-accent-400/70'
  if (retention > 0) return 'bg-dark-500'
  return 'bg-dark-700'
}

function getRetentionTextColor(retention: number): string {
  if (retention >= 20) return 'text-white'
  if (retention > 0) return 'text-dark-300'
  return 'text-dark-500'
}

// =============================================
// COMPONENT
// =============================================

export function CohortSection({ data }: CohortSectionProps) {
  const { months, matrix, summary } = data

  // Pegar os últimos 8 meses para exibição
  const displayMonths = months.slice(-8)
  const periods = [0, 1, 2, 3, 4, 5, 6]

  // Calcular curva de retenção média
  const retentionCurve = periods.map(period => {
    const retentions = displayMonths
      .map(month => matrix[month]?.[period]?.retention || 0)
      .filter(r => r > 0)
    
    if (retentions.length === 0) return 0
    return retentions.reduce((a, b) => a + b, 0) / retentions.length
  })

  return (
    <div className="space-y-6">
      {/* KPIs Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-dark-700/30 rounded-xl border border-dark-600/50">
          <div className="flex items-center gap-2 text-dark-400 text-sm mb-1">
            <Percent className="w-4 h-4" />
            Retenção Mês 1
          </div>
          <p className="text-2xl font-bold text-white">{summary.avgRetentionMonth1}%</p>
        </div>
        
        <div className="p-4 bg-dark-700/30 rounded-xl border border-dark-600/50">
          <div className="flex items-center gap-2 text-dark-400 text-sm mb-1">
            <Percent className="w-4 h-4" />
            Retenção Mês 3
          </div>
          <p className="text-2xl font-bold text-white">{summary.avgRetentionMonth3}%</p>
        </div>

        {summary.bestCohort && (
          <div className="p-4 bg-primary-500/10 rounded-xl border border-primary-500/30">
            <div className="flex items-center gap-2 text-primary-400 text-sm mb-1">
              <TrendingUp className="w-4 h-4" />
              Melhor Cohort
            </div>
            <p className="text-2xl font-bold text-primary-400">
              {formatMonth(summary.bestCohort)}
            </p>
          </div>
        )}

        {summary.worstCohort && (
          <div className="p-4 bg-dark-700/30 rounded-xl border border-dark-600/50">
            <div className="flex items-center gap-2 text-dark-400 text-sm mb-1">
              <TrendingDown className="w-4 h-4" />
              Pior Cohort
            </div>
            <p className="text-2xl font-bold text-dark-300">
              {formatMonth(summary.worstCohort)}
            </p>
          </div>
        )}
      </div>

      {/* Retention Curve */}
      <div className="p-4 bg-dark-700/30 rounded-xl border border-dark-600/50">
        <h4 className="text-sm font-medium text-dark-300 mb-4">Curva de Retenção Média</h4>
        <div className="flex items-end gap-2 h-32">
          {retentionCurve.map((retention, index) => (
            <div key={index} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex flex-col items-center">
                <span className="text-xs text-dark-400 mb-1">
                  {retention > 0 ? `${retention.toFixed(0)}%` : '-'}
                </span>
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(retention, 2)}%` }}
                  transition={{ delay: index * 0.1, duration: 0.5 }}
                  className={`
                    w-full rounded-t
                    ${index === 0 ? 'bg-primary-500' : 'bg-gradient-to-t from-primary-500/30 to-primary-500'}
                  `}
                  style={{ 
                    minHeight: retention > 0 ? '8px' : '2px',
                    maxHeight: '100%',
                    height: `${retention}%`,
                  }}
                />
              </div>
              <span className="text-xs text-dark-500">M{index}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cohort Matrix */}
      {displayMonths.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-dark-300 mb-3">Matriz de Retenção</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left text-xs text-dark-500 uppercase pb-3 pr-4">
                    Cohort
                  </th>
                  <th className="text-center text-xs text-dark-500 uppercase pb-3 px-2">
                    Total
                  </th>
                  {periods.map(period => (
                    <th key={period} className="text-center text-xs text-dark-500 uppercase pb-3 px-2">
                      M{period}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayMonths.map((month, rowIndex) => {
                  const cohortData = matrix[month]
                  const totalCustomers = cohortData?.[0]?.total || 0

                  return (
                    <tr key={month} className="border-t border-dark-700/30">
                      <td className="py-2 pr-4 text-dark-300 whitespace-nowrap">
                        {formatMonth(month)}
                      </td>
                      <td className="py-2 px-2 text-center text-dark-400">
                        {totalCustomers}
                      </td>
                      {periods.map((period, colIndex) => {
                        const cellData = cohortData?.[period]
                        const retention = cellData?.retention || 0
                        
                        // Período 0 é sempre 100%
                        if (period === 0) {
                          return (
                            <td key={period} className="py-2 px-2 text-center">
                              <motion.div
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: rowIndex * 0.05 + colIndex * 0.02 }}
                                className="inline-flex items-center justify-center w-12 h-8 rounded bg-primary-500 text-white text-xs font-medium"
                              >
                                100%
                              </motion.div>
                            </td>
                          )
                        }

                        // Verificar se é futuro (sem dados)
                        const cohortDate = new Date(month + '-01')
                        const monthsSinceCohort = Math.floor(
                          (new Date().getTime() - cohortDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
                        )
                        
                        if (period > monthsSinceCohort) {
                          return (
                            <td key={period} className="py-2 px-2 text-center">
                              <div className="inline-flex items-center justify-center w-12 h-8 rounded bg-dark-700/30 text-dark-600 text-xs">
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
                              transition={{ delay: rowIndex * 0.05 + colIndex * 0.02 }}
                              className={`
                                inline-flex items-center justify-center w-12 h-8 rounded text-xs font-medium
                                ${getRetentionColor(retention)} ${getRetentionTextColor(retention)}
                              `}
                              title={`${cellData?.active || 0} de ${totalCustomers} clientes`}
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
          <div className="flex items-center justify-center gap-4 mt-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-primary-500" />
              <span className="text-dark-400">&gt; 30%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-accent-500" />
              <span className="text-dark-400">20-30%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-accent-400/70" />
              <span className="text-dark-400">10-20%</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-dark-500" />
              <span className="text-dark-400">&lt; 10%</span>
            </div>
          </div>
        </div>
      )}

      {/* Insights */}
      <div className="p-4 bg-gradient-to-r from-primary-500/10 to-accent-500/5 rounded-xl border border-primary-500/20">
        <h4 className="text-sm font-medium text-white mb-3">💡 Insights</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-primary-400 mt-0.5">→</span>
            <p className="text-dark-300">
              <strong className="text-white">Retenção no 1º mês</strong> é crítica. 
              Foque em campanhas de segunda compra.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary-400 mt-0.5">→</span>
            <p className="text-dark-300">
              <strong className="text-white">Compare cohorts</strong> para identificar 
              o impacto de campanhas ou mudanças.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary-400 mt-0.5">→</span>
            <p className="text-dark-300">
              <strong className="text-white">Retenção estável</strong> após 3 meses 
              indica clientes leais.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-primary-400 mt-0.5">→</span>
            <p className="text-dark-300">
              <strong className="text-white">Queda brusca</strong> entre meses indica 
              problema de experiência.
            </p>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {displayMonths.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-4 rounded-full bg-dark-700/50 mb-4">
            <Calendar className="w-8 h-8 text-dark-500" />
          </div>
          <p className="text-dark-400">
            Dados insuficientes para análise de cohort.
          </p>
          <p className="text-sm text-dark-500 mt-2">
            É necessário ter pedidos de pelo menos 2 meses.
          </p>
        </div>
      )}
    </div>
  )
}

export default CohortSection
