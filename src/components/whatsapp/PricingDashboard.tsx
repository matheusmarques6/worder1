'use client'

import { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import {
  estimateMonthlySpend,
  formatCurrency as formatPricingCurrency,
  BRAZIL_PRICING,
  type PricingCategory,
  type MessageWithCategory,
  type MonthlyEstimate,
} from '@/lib/whatsapp/pricing'
import {
  DollarSign, TrendingUp, MessageSquare, Gift,
  AlertCircle, RefreshCw, Loader2
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from 'recharts'

// =============================================
// Types
// =============================================

interface PricingDashboardProps {
  organizationId: string
  /** Provide conversation data directly */
  conversations?: MessageWithCategory[]
  className?: string
}

// =============================================
// Constants
// =============================================

const CATEGORY_CONFIG: Record<PricingCategory, { label: string; color: string; fill: string }> = {
  marketing:       { label: 'Marketing',     color: 'text-orange-600', fill: '#f97316' },
  utility:         { label: 'Utilidade',      color: 'text-blue-600',   fill: '#3b82f6' },
  authentication:  { label: 'Autenticacao',   color: 'text-purple-600', fill: '#8b5cf6' },
  service:         { label: 'Servico',        color: 'text-emerald-600', fill: '#10b981' },
}

// =============================================
// Component
// =============================================

export function PricingDashboard({
  organizationId,
  conversations: externalConversations,
  className,
}: PricingDashboardProps) {
  const [conversations, setConversations] = useState<MessageWithCategory[]>(externalConversations || [])
  const [loading, setLoading] = useState(!externalConversations)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!externalConversations) {
      setLoading(false)
    }
  }, [externalConversations])

  useEffect(() => {
    if (externalConversations) setConversations(externalConversations)
  }, [externalConversations])

  // Calculate monthly estimate
  const estimate: MonthlyEstimate = useMemo(
    () => estimateMonthlySpend(conversations),
    [conversations]
  )

  // Chart data for PieChart
  const chartData = useMemo(() => {
    return (Object.entries(estimate.breakdown) as [PricingCategory, { count: number; cost: number }][])
      .filter(([, v]) => v.count > 0)
      .map(([cat, v]) => ({
        name: CATEGORY_CONFIG[cat].label,
        value: v.cost,
        count: v.count,
        fill: CATEGORY_CONFIG[cat].fill,
      }))
  }, [estimate])

  // Projection (remaining days * daily rate)
  const projection = useMemo(() => {
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const daysPassed = now.getDate()
    if (daysPassed === 0) return estimate.total
    const dailyRate = estimate.total / daysPassed
    return Math.round(dailyRate * daysInMonth * 100) / 100
  }, [estimate.total])

  if (loading) {
    return (
      <Card className={cn('flex items-center justify-center py-12', className)}>
        <Spinner size="lg" />
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={cn('p-6', className)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-500">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
          <button
            onClick={fetchConversations}
            className="p-2 rounded-lg hover:bg-gray-50 text-gray-400 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </Card>
    )
  }

  const totalConversations = Object.values(estimate.breakdown).reduce((s, b) => s + b.count, 0)

  return (
    <div className={cn('space-y-6', className)}>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={DollarSign}
          label="Gasto Atual"
          value={formatPricingCurrency(estimate.total)}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-500"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Projecao Mensal"
          value={formatPricingCurrency(projection)}
          iconBg="bg-blue-50"
          iconColor="text-blue-500"
        />
        <SummaryCard
          icon={MessageSquare}
          label="Conversas"
          value={totalConversations.toLocaleString('pt-BR')}
          iconBg="bg-orange-50"
          iconColor="text-orange-500"
        />
        <SummaryCard
          icon={Gift}
          label="Gratuitas (Servico)"
          value={estimate.free_tier_conversations.toLocaleString('pt-BR')}
          subtext="de 1.000/mes"
          iconBg="bg-purple-50"
          iconColor="text-purple-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Distribuicao por Categoria</h3>
          {chartData.length > 0 ? (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatPricingCurrency(value)}
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '12px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value: string) => (
                      <span className="text-xs text-gray-600">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-400">
              <div className="text-center">
                <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma conversa no periodo</p>
              </div>
            </div>
          )}
        </Card>

        {/* Breakdown Table */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Detalhamento</h3>
          <div className="space-y-3">
            {(Object.entries(CATEGORY_CONFIG) as [PricingCategory, typeof CATEGORY_CONFIG[PricingCategory]][]).map(
              ([cat, config]) => {
                const data = estimate.breakdown[cat]
                return (
                  <div
                    key={cat}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: config.fill }}
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-700">{config.label}</p>
                        <p className="text-xs text-gray-400">
                          {data.count.toLocaleString('pt-BR')} conversa(s)
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-800">
                        {formatPricingCurrency(data.cost)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatPricingCurrency(BRAZIL_PRICING[cat])}/conv
                      </p>
                    </div>
                  </div>
                )
              }
            )}
          </div>

          {/* Pricing reference */}
          <div className="mt-4 pt-3 border-t border-gray-200">
            <p className="text-[11px] text-gray-400">
              Precos por conversa (24h) para o Brasil. Servico: 1.000 conversas gratuitas/mes por WABA.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}

// =============================================
// Sub-Component
// =============================================

function SummaryCard({
  icon: Icon,
  label,
  value,
  subtext,
  iconBg,
  iconColor,
}: {
  icon: typeof DollarSign
  label: string
  value: string
  subtext?: string
  iconBg: string
  iconColor: string
}) {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={cn('p-2 rounded-xl', iconBg)}>
          <Icon className={cn('w-4 h-4', iconColor)} />
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      {subtext && <p className="text-xs text-gray-400 mt-0.5">{subtext}</p>}
    </div>
  )
}

export default PricingDashboard
