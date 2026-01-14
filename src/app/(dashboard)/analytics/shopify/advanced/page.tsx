'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  TrendingUp,
  BarChart3,
  Grid3X3,
  ArrowLeft,
  Store,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useStoreStore } from '@/stores'
import { RFMDashboard } from '@/components/shopify/RFMDashboard'
import { CohortMatrix } from '@/components/shopify/CohortMatrix'

// =============================================
// TYPES
// =============================================

type TabType = 'rfm' | 'cohort'

interface TabConfig {
  id: TabType
  label: string
  icon: React.ElementType
  description: string
}

// =============================================
// CONFIG
// =============================================

const TABS: TabConfig[] = [
  {
    id: 'rfm',
    label: 'Segmentação RFM',
    icon: Users,
    description: 'Análise de Recência, Frequência e Valor Monetário',
  },
  {
    id: 'cohort',
    label: 'Análise de Cohort',
    icon: Grid3X3,
    description: 'Retenção de clientes por mês de aquisição',
  },
]

// =============================================
// COMPONENT
// =============================================

export default function AdvancedAnalyticsPage() {
  const { currentStore } = useStoreStore()
  const storeId = currentStore?.id
  const [activeTab, setActiveTab] = useState<TabType>('rfm')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simular carregamento inicial
    const timer = setTimeout(() => setIsLoading(false), 500)
    return () => clearTimeout(timer)
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    )
  }

  if (!storeId) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <div className="w-16 h-16 bg-[#1a1a2e] rounded-2xl flex items-center justify-center mb-4">
          <Store className="w-8 h-8 text-gray-400" />
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Nenhuma loja selecionada</h2>
        <p className="text-gray-400 mb-6 max-w-md">
          Selecione uma loja Shopify no menu lateral para ver as métricas avançadas.
        </p>
        <Link
          href="/integrations/shopify"
          className="flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-colors"
        >
          <Store className="w-5 h-5" />
          Gerenciar Lojas
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/analytics/shopify"
            className="p-2 rounded-lg bg-[#1a1a2e] hover:bg-[#252540] transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Métricas Avançadas</h1>
            <p className="text-gray-400 mt-1">
              {currentStore?.name || 'Loja Shopify'} • Segmentação e Retenção
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-[#1a1a2e] p-1.5 rounded-xl">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
                isActive
                  ? 'bg-violet-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab Description */}
      <div className="flex items-center gap-3 p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl">
        <div className="p-2 rounded-lg bg-violet-500/20">
          {(() => {
            const activeTabConfig = TABS.find(t => t.id === activeTab)
            const Icon = activeTabConfig?.icon || BarChart3
            return <Icon className="w-5 h-5 text-violet-400" />
          })()}
        </div>
        <div>
          <h3 className="font-medium text-white">
            {TABS.find(t => t.id === activeTab)?.label}
          </h3>
          <p className="text-sm text-gray-400">
            {TABS.find(t => t.id === activeTab)?.description}
          </p>
        </div>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'rfm' && <RFMDashboard storeId={storeId} />}
          {activeTab === 'cohort' && <CohortMatrix storeId={storeId} />}
        </motion.div>
      </AnimatePresence>

      {/* Help Section */}
      <div className="bg-[#1a1a2e] rounded-xl p-6">
        <h3 className="text-lg font-medium text-white mb-4">📚 O que significam essas métricas?</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <h4 className="font-medium text-violet-400 mb-2">Segmentação RFM</h4>
            <ul className="space-y-2 text-gray-400">
              <li><strong className="text-gray-300">Recency (R):</strong> Quanto tempo desde a última compra</li>
              <li><strong className="text-gray-300">Frequency (F):</strong> Quantas vezes comprou</li>
              <li><strong className="text-gray-300">Monetary (M):</strong> Quanto gastou no total</li>
              <li className="text-gray-500">Scores de 1-5 baseados em quartis dos seus clientes</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-violet-400 mb-2">Análise de Cohort</h4>
            <ul className="space-y-2 text-gray-400">
              <li><strong className="text-gray-300">Cohort:</strong> Grupo de clientes por mês da primeira compra</li>
              <li><strong className="text-gray-300">Retenção:</strong> % que voltou a comprar em cada mês</li>
              <li><strong className="text-gray-300">Mês 0:</strong> Mês da primeira compra (sempre 100%)</li>
              <li className="text-gray-500">Compare cohorts para ver impacto de campanhas</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
