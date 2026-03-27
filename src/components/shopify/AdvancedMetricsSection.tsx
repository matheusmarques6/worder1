'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Users,
  TrendingUp,
  BarChart3,
  RefreshCw,
} from 'lucide-react'
import { RFMSection } from './RFMSection'
import { CohortSection } from './CohortSection'

// =============================================
// TYPES
// =============================================

interface RFMSegment {
  segment: string
  label: string
  color: string
  count: number
  totalRevenue: number
  avgOrders: number
  percentage: number
}

interface TopCustomer {
  email: string
  segment: string
  totalSpent: number
  totalOrders: number
  daysSinceLast: number
  rfmScore: string
}

interface CohortSummary {
  avgRetentionMonth1: number
  avgRetentionMonth3: number
  bestCohort: string
  worstCohort: string
}

interface AdvancedMetricsData {
  rfm: {
    totalCustomers: number
    segments: RFMSegment[]
    topCustomers: TopCustomer[]
  }
  cohort: {
    months: string[]
    matrix: Record<string, Record<number, { retention: number; active: number; total: number }>>
    summary: CohortSummary
  }
  calculatedAt: string
}

interface AdvancedMetricsSectionProps {
  storeId: string | null
}

// =============================================
// COMPONENT
// =============================================

export function AdvancedMetricsSection({ storeId }: AdvancedMetricsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [data, setData] = useState<AdvancedMetricsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'rfm' | 'cohort'>('rfm')

  const fetchData = async () => {
    if (!storeId) return
    
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/shopify/analytics/advanced?storeId=${storeId}`)
      const result = await response.json()

      if (result.success) {
        setData(result.data)
      } else {
        setError(result.error || 'Erro ao carregar dados')
      }
    } catch (err) {
      setError('Erro de conexão')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isExpanded && !data && storeId) {
      fetchData()
    }
  }, [isExpanded, storeId])

  const handleToggle = () => {
    setIsExpanded(!isExpanded)
  }

  const handleRefresh = () => {
    fetchData()
  }

  if (!storeId) return null

  return (
    <div className="mt-8">
      {/* Botão de expansão */}
      <motion.button
        onClick={handleToggle}
        className="w-full group"
        whileHover={{ scale: 1.005 }}
        whileTap={{ scale: 0.995 }}
      >
        <div className={`
          flex items-center justify-between p-4 rounded-xl 
          bg-gradient-to-r from-primary-500/10 to-accent-500/10
          border border-primary-500/20 hover:border-primary-500/40
          transition-all duration-300
          ${isExpanded ? 'rounded-b-none border-b-0' : ''}
        `}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-brand-100">
              <BarChart3 className="w-5 h-5 text-brand-600" />
            </div>
            <div className="text-left">
              <h3 className="text-base font-semibold text-gray-900">
                Métricas Avançadas
              </h3>
              <p className="text-sm text-gray-500">
                Segmentação RFM e Análise de Cohort
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {data && (
              <span className="text-xs text-gray-400 hidden sm:block">
                {data.rfm.totalCustomers} clientes analisados
              </span>
            )}
            <div className={`
              p-2 rounded-lg transition-colors
              ${isExpanded ? 'bg-brand-100' : 'bg-gray-100 group-hover:bg-brand-50'}
            `}>
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-brand-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500 group-hover:text-brand-600" />
              )}
            </div>
          </div>
        </div>
      </motion.button>

      {/* Conteúdo expansível */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="
              p-6 rounded-b-xl 
              bg-gray-50 border border-t-0 border-primary-500/20
            ">
              {/* Loading state */}
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center gap-3 text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
                    <span>Calculando métricas...</span>
                  </div>
                </div>
              )}

              {/* Error state */}
              {error && !isLoading && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-red-400 mb-4">{error}</p>
                  <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-white transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Tentar novamente
                  </button>
                </div>
              )}

              {/* Data loaded */}
              {data && !isLoading && (
                <div className="space-y-6">
                  {/* Tabs */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
                      <button
                        onClick={() => setActiveTab('rfm')}
                        className={`
                          flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                          ${activeTab === 'rfm' 
                            ? 'bg-primary-500 text-white shadow-glow' 
                            : 'text-gray-500 hover:text-white hover:bg-gray-200/50'
                          }
                        `}
                      >
                        <Users className="w-4 h-4" />
                        RFM
                      </button>
                      <button
                        onClick={() => setActiveTab('cohort')}
                        className={`
                          flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                          ${activeTab === 'cohort' 
                            ? 'bg-primary-500 text-white shadow-glow' 
                            : 'text-gray-500 hover:text-white hover:bg-gray-200/50'
                          }
                        `}
                      >
                        <TrendingUp className="w-4 h-4" />
                        Cohort
                      </button>
                    </div>

                    <button
                      onClick={handleRefresh}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-white bg-gray-100 hover:bg-gray-200/50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                      Atualizar
                    </button>
                  </div>

                  {/* Tab content */}
                  <AnimatePresence mode="wait">
                    {activeTab === 'rfm' && (
                      <motion.div
                        key="rfm"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                      >
                        <RFMSection data={data.rfm} />
                      </motion.div>
                    )}

                    {activeTab === 'cohort' && (
                      <motion.div
                        key="cohort"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                      >
                        <CohortSection data={data.cohort} />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Footer */}
                  <div className="pt-4 border-t border-gray-200/30 text-center">
                    <p className="text-xs text-gray-400">
                      Última atualização: {new Date(data.calculatedAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!data && !isLoading && !error && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="p-4 rounded-full bg-gray-100 mb-4">
                    <BarChart3 className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 mb-4">Nenhum dado disponível</p>
                  <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg text-white transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Calcular métricas
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default AdvancedMetricsSection
