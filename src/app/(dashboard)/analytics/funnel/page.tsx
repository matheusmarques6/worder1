'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  FunnelSimple,
  Eye,
  CursorClick,
  ShoppingCart,
  CreditCard,
  TrendUp,
} from '@phosphor-icons/react'
import { useStoreStore } from '@/stores'

interface FunnelStep {
  label: string
  eventType: string
  value: number
  pct: number
  color: string
}

const FUNNEL_STEPS_CONFIG = [
  { label: 'Visualizou Pagina', eventType: 'page_viewed', color: '#F26B2A' },
  { label: 'Visualizou Produto', eventType: 'viewed_product', color: '#F5A623' },
  { label: 'Adicionou ao Carrinho', eventType: 'added_to_cart', color: '#3B82F6' },
  { label: 'Iniciou Checkout', eventType: 'checkout_started', color: '#8B5CF6' },
  { label: 'Completou Checkout', eventType: 'checkout_completed', color: '#10B981' },
]

export default function FunnelPage() {
  const [funnelSteps, setFunnelSteps] = useState<FunnelStep[]>([])
  const [loading, setLoading] = useState(true)
  const { currentStore } = useStoreStore()

  useEffect(() => {
    if (!currentStore?.id) {
      setLoading(false)
      setFunnelSteps([])
      return
    }

    setLoading(true)
    const params = new URLSearchParams({
      storeId: currentStore.id,
      integration: 'shopify',
    })
    fetch(`/api/analytics/metrics?${params}`)
      .then(r => r.json())
      .then(data => {
        const metrics = data.metrics || []
        const countMap: Record<string, number> = {}
        for (const m of metrics) {
          countMap[m.key] = m.count || 0
        }

        const topValue = Math.max(
          ...FUNNEL_STEPS_CONFIG.map(s => countMap[s.eventType] || 0),
          1
        )

        const steps: FunnelStep[] = FUNNEL_STEPS_CONFIG.map(s => {
          const value = countMap[s.eventType] || 0
          return {
            label: s.label,
            eventType: s.eventType,
            value,
            pct: topValue > 0 ? Math.round((value / topValue) * 1000) / 10 : 0,
            color: s.color,
          }
        })

        setFunnelSteps(steps)
      })
      .catch(() => setFunnelSteps([]))
      .finally(() => setLoading(false))
  }, [currentStore?.id])

  const isEmpty = !loading && (funnelSteps.length === 0 || funnelSteps.every(s => s.value === 0))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display text-gray-900">Funil de Conversao</h1>
        <p className="text-sm text-gray-500 mt-1">Acompanhe cada etapa do funil de e-commerce</p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-white/50 border border-gray-200 rounded-xl p-6 animate-pulse">
          <div className="h-4 w-48 bg-gray-200 rounded mb-6" />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-4 w-24 bg-gray-200 rounded" />
                <div className="flex-1 h-10 bg-gray-200 rounded-lg" style={{ width: `${100 - i * 18}%` }} />
                <div className="h-4 w-12 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {isEmpty && (
        <div className="bg-white/50 border border-gray-200 rounded-xl p-12 text-center">
          <FunnelSimple size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            Nenhum dado de funil disponivel
          </h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Instale o pixel Worder na sua loja Shopify para comecar a rastrear eventos de e-commerce
            como visualizacoes de produto, carrinho e checkout.
          </p>
        </div>
      )}

      {/* Funnel Visualization */}
      {!loading && !isEmpty && (
        <>
          <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-6">Funil de E-commerce — Ultimos 30 dias</h3>
            <div className="space-y-3">
              {funnelSteps.map((step, i) => (
                <motion.div
                  key={step.eventType}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-4"
                >
                  <span className="text-sm text-gray-500 w-40 text-right">{step.label}</span>
                  <div className="flex-1 relative">
                    <div className="h-10 bg-gray-50/30 rounded-lg overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(step.pct, 2)}%` }}
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
                  {i < funnelSteps.length - 1 && funnelSteps[i + 1].value > 0 && step.value > 0 && (
                    <span className="text-xs text-gray-400 w-20">
                      ↓ {((funnelSteps[i + 1].value / step.value) * 100).toFixed(1)}%
                    </span>
                  )}
                  {(i >= funnelSteps.length - 1 || funnelSteps[i + 1].value === 0 || step.value === 0) && i < funnelSteps.length - 1 && (
                    <span className="text-xs text-gray-400 w-20">—</span>
                  )}
                </motion.div>
              ))}
            </div>
          </div>

          {/* Step-to-step conversion rates */}
          <div className="bg-white/50 border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Taxa de Conversao entre Etapas</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {funnelSteps.slice(1).map((step, i) => {
                const prevStep = funnelSteps[i]
                const rate = prevStep.value > 0 ? ((step.value / prevStep.value) * 100) : 0
                return (
                  <motion.div
                    key={step.eventType}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white/50 border border-gray-200 rounded-xl p-4"
                  >
                    <div className="text-xs text-gray-500 mb-1">
                      {prevStep.label} → {step.label}
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {rate.toFixed(1)}%
                    </p>
                    <div className="text-xs text-gray-400 mt-1">
                      {prevStep.value.toLocaleString('pt-BR')} → {step.value.toLocaleString('pt-BR')}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
