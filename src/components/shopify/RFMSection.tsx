'use client'

import { motion } from 'framer-motion'
import {
  Crown,
  Heart,
  Star,
  UserPlus,
  Target,
  AlertTriangle,
  Moon,
  Skull,
  TrendingDown,
  Users,
  DollarSign,
  ShoppingCart,
} from 'lucide-react'

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

interface RFMSectionProps {
  data: {
    totalCustomers: number
    segments: RFMSegment[]
    topCustomers: TopCustomer[]
  }
}

// =============================================
// SEGMENT ICONS
// =============================================

const SEGMENT_ICONS: Record<string, React.ElementType> = {
  champion: Crown,
  loyal: Heart,
  potential_loyalist: Star,
  recent: UserPlus,
  promising: Target,
  need_attention: AlertTriangle,
  about_to_sleep: Moon,
  at_risk: TrendingDown,
  cant_lose: Heart,
  hibernating: Moon,
  lost: Skull,
}

// =============================================
// HELPERS
// =============================================

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const formatNumber = (value: number) => {
  return new Intl.NumberFormat('pt-BR').format(value)
}

// =============================================
// COMPONENT
// =============================================

export function RFMSection({ data }: RFMSectionProps) {
  const { totalCustomers, segments, topCustomers } = data

  // Calcular totais para KPIs
  const totalRevenue = segments.reduce((sum, s) => sum + s.totalRevenue, 0)
  const avgOrdersOverall = totalCustomers > 0 
    ? segments.reduce((sum, s) => sum + (s.avgOrders * s.count), 0) / totalCustomers 
    : 0

  // Segmentos de destaque
  const champions = segments.find(s => s.segment === 'champion')
  const atRisk = segments.find(s => s.segment === 'at_risk')
  const cantLose = segments.find(s => s.segment === 'cant_lose')

  return (
    <div className="space-y-6">
      {/* KPIs Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-gray-100/30 rounded-xl border border-gray-300/50">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Users className="w-4 h-4" />
            Total de Clientes
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(totalCustomers)}</p>
        </div>
        
        <div className="p-4 bg-gray-100/30 rounded-xl border border-gray-300/50">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <DollarSign className="w-4 h-4" />
            Receita Total
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
        </div>

        <div className="p-4 bg-gray-100/30 rounded-xl border border-gray-300/50">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <ShoppingCart className="w-4 h-4" />
            Média de Pedidos
          </div>
          <p className="text-2xl font-bold text-gray-900">{avgOrdersOverall.toFixed(1)}</p>
        </div>

        <div className="p-4 bg-brand-50 rounded-xl border border-brand-300">
          <div className="flex items-center gap-2 text-brand-600 text-sm mb-1">
            <Crown className="w-4 h-4" />
            Campeões
          </div>
          <p className="text-2xl font-bold text-brand-600">
            {champions?.count || 0}
            <span className="text-sm font-normal text-gray-500 ml-2">
              ({champions?.percentage || 0}%)
            </span>
          </p>
        </div>
      </div>

      {/* Segments Grid */}
      <div>
        <h4 className="text-sm font-medium text-gray-600 mb-3">Distribuição por Segmento</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {segments.map((segment, index) => {
            const Icon = SEGMENT_ICONS[segment.segment] || Users
            const isHighlight = ['champion', 'loyal', 'at_risk', 'cant_lose'].includes(segment.segment)
            
            return (
              <motion.div
                key={segment.segment}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`
                  p-3 rounded-xl transition-all cursor-default
                  ${isHighlight 
                    ? 'bg-gray-100 border border-brand-300 hover:border-brand-400' 
                    : 'bg-gray-100/30 border border-gray-300/30 hover:border-gray-300/50'
                  }
                `}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div 
                    className="p-1.5 rounded-lg"
                    style={{ backgroundColor: `${segment.color}20` }}
                  >
                    <Icon 
                      className="w-3.5 h-3.5" 
                      style={{ color: segment.color }}
                    />
                  </div>
                  <span className="text-xl font-bold text-gray-900">{segment.count}</span>
                </div>
                <p className="text-xs text-gray-500 truncate" title={segment.label}>
                  {segment.label}
                </p>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-gray-400">{segment.percentage}%</span>
                  <span className="text-gray-500">{formatCurrency(segment.totalRevenue)}</span>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1 bg-gray-200/50 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all"
                    style={{ 
                      width: `${Math.min(segment.percentage * 2, 100)}%`,
                      backgroundColor: segment.color,
                      opacity: 0.7,
                    }}
                  />
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Campeões */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-primary-500/10 to-accent-500/5 border border-primary-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="w-5 h-5 text-brand-600" />
            <span className="font-medium text-gray-900">Campeões</span>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            {champions?.count || 0} clientes que compram frequentemente e gastam muito.
          </p>
          <p className="text-xs text-brand-600">
            💡 Ofereça programa VIP exclusivo
          </p>
        </div>

        {/* Em Risco */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-red-500/10 to-orange-500/5 border border-red-500/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-red-400" />
            <span className="font-medium text-gray-900">Em Risco</span>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            {(atRisk?.count || 0) + (cantLose?.count || 0)} clientes valiosos que pararam de comprar.
          </p>
          <p className="text-xs text-red-400">
            ⚠️ Campanha de reativação urgente
          </p>
        </div>

        {/* Potenciais */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-accent-500/10 to-primary-500/5 border border-accent-500/20">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-5 h-5 text-accent-400" />
            <span className="font-medium text-gray-900">Potenciais Leais</span>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            {segments.find(s => s.segment === 'potential_loyalist')?.count || 0} clientes com potencial de crescimento.
          </p>
          <p className="text-xs text-accent-400">
            🎯 Nurture com ofertas personalizadas
          </p>
        </div>
      </div>

      {/* Top Customers Table */}
      {topCustomers.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-600 mb-3">Top 10 Clientes por Receita</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-200">
                  <th className="pb-3 pr-4">Cliente</th>
                  <th className="pb-3 pr-4">Segmento</th>
                  <th className="pb-3 pr-4 text-right">Gasto Total</th>
                  <th className="pb-3 pr-4 text-right">Pedidos</th>
                  <th className="pb-3 pr-4 text-right">Última Compra</th>
                  <th className="pb-3 text-center">RFM</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((customer, index) => (
                  <motion.tr 
                    key={index}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-b border-gray-200/30 hover:bg-gray-100/20"
                  >
                    <td className="py-3 pr-4">
                      <span className="text-white truncate block max-w-[150px]" title={customer.email}>
                        {customer.email}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="px-2 py-1 rounded text-xs bg-gray-200/50 text-gray-600">
                        {customer.segment}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right font-medium text-brand-600">
                      {formatCurrency(customer.totalSpent)}
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-600">
                      {customer.totalOrders}
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-500">
                      {customer.daysSinceLast}d atrás
                    </td>
                    <td className="py-3 text-center">
                      <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                        {customer.rfmScore}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default RFMSection
