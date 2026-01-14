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
        <div className="p-4 bg-dark-700/30 rounded-xl border border-dark-600/50">
          <div className="flex items-center gap-2 text-dark-400 text-sm mb-1">
            <Users className="w-4 h-4" />
            Total de Clientes
          </div>
          <p className="text-2xl font-bold text-white">{formatNumber(totalCustomers)}</p>
        </div>
        
        <div className="p-4 bg-dark-700/30 rounded-xl border border-dark-600/50">
          <div className="flex items-center gap-2 text-dark-400 text-sm mb-1">
            <DollarSign className="w-4 h-4" />
            Receita Total
          </div>
          <p className="text-2xl font-bold text-white">{formatCurrency(totalRevenue)}</p>
        </div>

        <div className="p-4 bg-dark-700/30 rounded-xl border border-dark-600/50">
          <div className="flex items-center gap-2 text-dark-400 text-sm mb-1">
            <ShoppingCart className="w-4 h-4" />
            Média de Pedidos
          </div>
          <p className="text-2xl font-bold text-white">{avgOrdersOverall.toFixed(1)}</p>
        </div>

        <div className="p-4 bg-primary-500/10 rounded-xl border border-primary-500/30">
          <div className="flex items-center gap-2 text-primary-400 text-sm mb-1">
            <Crown className="w-4 h-4" />
            Campeões
          </div>
          <p className="text-2xl font-bold text-primary-400">
            {champions?.count || 0}
            <span className="text-sm font-normal text-dark-400 ml-2">
              ({champions?.percentage || 0}%)
            </span>
          </p>
        </div>
      </div>

      {/* Segments Grid */}
      <div>
        <h4 className="text-sm font-medium text-dark-300 mb-3">Distribuição por Segmento</h4>
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
                    ? 'bg-dark-700/50 border border-primary-500/30 hover:border-primary-500/50' 
                    : 'bg-dark-700/30 border border-dark-600/30 hover:border-dark-500/50'
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
                  <span className="text-xl font-bold text-white">{segment.count}</span>
                </div>
                <p className="text-xs text-dark-400 truncate" title={segment.label}>
                  {segment.label}
                </p>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-dark-500">{segment.percentage}%</span>
                  <span className="text-dark-400">{formatCurrency(segment.totalRevenue)}</span>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1 bg-dark-600/50 rounded-full overflow-hidden">
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
            <Crown className="w-5 h-5 text-primary-400" />
            <span className="font-medium text-white">Campeões</span>
          </div>
          <p className="text-sm text-dark-300 mb-3">
            {champions?.count || 0} clientes que compram frequentemente e gastam muito.
          </p>
          <p className="text-xs text-primary-400">
            💡 Ofereça programa VIP exclusivo
          </p>
        </div>

        {/* Em Risco */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-red-500/10 to-orange-500/5 border border-red-500/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-red-400" />
            <span className="font-medium text-white">Em Risco</span>
          </div>
          <p className="text-sm text-dark-300 mb-3">
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
            <span className="font-medium text-white">Potenciais Leais</span>
          </div>
          <p className="text-sm text-dark-300 mb-3">
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
          <h4 className="text-sm font-medium text-dark-300 mb-3">Top 10 Clientes por Receita</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-dark-500 uppercase border-b border-dark-700/50">
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
                    className="border-b border-dark-700/30 hover:bg-dark-700/20"
                  >
                    <td className="py-3 pr-4">
                      <span className="text-white truncate block max-w-[150px]" title={customer.email}>
                        {customer.email}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="px-2 py-1 rounded text-xs bg-dark-600/50 text-dark-300">
                        {customer.segment}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right font-medium text-primary-400">
                      {formatCurrency(customer.totalSpent)}
                    </td>
                    <td className="py-3 pr-4 text-right text-dark-300">
                      {customer.totalOrders}
                    </td>
                    <td className="py-3 pr-4 text-right text-dark-400">
                      {customer.daysSinceLast}d atrás
                    </td>
                    <td className="py-3 text-center">
                      <span className="font-mono text-xs text-dark-400 bg-dark-700/50 px-2 py-1 rounded">
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
