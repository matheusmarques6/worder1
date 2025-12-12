'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { cn, formatCurrency, formatPercentage, formatNumber } from '@/lib/utils'
import { Card, Badge } from '@/components/ui'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Mail,
  MousePointer,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  ExternalLink,
} from 'lucide-react'

// ===============================
// STAT CARD
// ===============================
interface StatCardProps {
  title: string
  value: string | number
  change?: number
  changeLabel?: string
  icon?: React.ReactNode
  iconColor?: string
  format?: 'currency' | 'percentage' | 'number' | 'none'
  delay?: number
}

export function StatCard({
  title,
  value,
  change,
  changeLabel = 'vs mês anterior',
  icon,
  iconColor = 'from-primary-500 to-primary-600',
  format = 'none',
  delay = 0,
}: StatCardProps) {
  const formattedValue = React.useMemo(() => {
    if (format === 'currency') return formatCurrency(Number(value))
    if (format === 'percentage') return formatPercentage(Number(value))
    if (format === 'number') return formatNumber(Number(value))
    return value
  }, [value, format])

  const isPositive = change && change > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
    >
      <Card
        variant="glass"
        hoverable
        className="relative overflow-hidden group"
      >
        {/* Background gradient effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-dark-400 text-sm font-medium mb-1">{title}</p>
            <p className="text-3xl font-bold text-dark-50 tracking-tight">
              {formattedValue}
            </p>
            {change !== undefined && (
              <div className="flex items-center gap-1.5 mt-2">
                <span
                  className={cn(
                    'flex items-center gap-0.5 text-sm font-medium',
                    isPositive ? 'text-success-400' : 'text-error-400'
                  )}
                >
                  {isPositive ? (
                    <ArrowUpRight className="w-4 h-4" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4" />
                  )}
                  {Math.abs(change).toFixed(1)}%
                </span>
                <span className="text-dark-500 text-sm">{changeLabel}</span>
              </div>
            )}
          </div>
          {icon && (
            <div
              className={cn(
                'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-lg',
                iconColor
              )}
            >
              {icon}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  )
}

// ===============================
// REVENUE CHART
// ===============================
interface RevenueChartProps {
  data: {
    date: string
    email_revenue: number
    total_revenue: number
  }[]
}

export function RevenueChart({ data }: RevenueChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null

    return (
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-4 shadow-xl">
        <p className="text-dark-300 text-sm mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-dark-400 text-sm">{entry.name}:</span>
            <span className="text-dark-100 font-medium">
              {formatCurrency(entry.value)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-dark-100">Receita</h3>
            <p className="text-dark-400 text-sm">E-mail Marketing vs Total</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-primary-500" />
              <span className="text-dark-400 text-sm">E-mail</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-accent-500" />
              <span className="text-dark-400 text-sm">Total</span>
            </div>
          </div>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="emailGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatCurrency(value).replace('R$', '')}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="total_revenue"
                name="Receita Total"
                stroke="#06b6d4"
                strokeWidth={2}
                fill="url(#totalGradient)"
              />
              <Area
                type="monotone"
                dataKey="email_revenue"
                name="E-mail Marketing"
                stroke="#8b5cf6"
                strokeWidth={2}
                fill="url(#emailGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </motion.div>
  )
}

// ===============================
// TOP CAMPAIGNS TABLE
// ===============================
interface TopCampaign {
  id: string
  name: string
  sent_date: string
  recipients: number
  revenue: number
  open_rate: number
  click_rate: number
}

interface TopCampaignsProps {
  campaigns: TopCampaign[]
}

export function TopCampaigns({ campaigns }: TopCampaignsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      <Card variant="glass">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-dark-100">Top Campanhas</h3>
            <p className="text-dark-400 text-sm">Últimos 30 dias</p>
          </div>
          <button className="text-primary-400 text-sm font-medium hover:text-primary-300 transition-colors">
            Ver todas
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left text-dark-400 text-xs font-medium uppercase tracking-wider pb-3">
                  Campanha
                </th>
                <th className="text-right text-dark-400 text-xs font-medium uppercase tracking-wider pb-3">
                  Receita
                </th>
                <th className="text-right text-dark-400 text-xs font-medium uppercase tracking-wider pb-3">
                  Abertura
                </th>
                <th className="text-right text-dark-400 text-xs font-medium uppercase tracking-wider pb-3">
                  Cliques
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/50">
              {campaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  className="group hover:bg-dark-800/30 transition-colors"
                >
                  <td className="py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center">
                        <Mail className="w-5 h-5 text-primary-400" />
                      </div>
                      <div>
                        <p className="text-dark-100 font-medium group-hover:text-primary-400 transition-colors">
                          {campaign.name}
                        </p>
                        <p className="text-dark-500 text-sm">
                          {formatNumber(campaign.recipients)} envios
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 text-right">
                    <span className="text-dark-100 font-semibold">
                      {formatCurrency(campaign.revenue)}
                    </span>
                  </td>
                  <td className="py-4 text-right">
                    <Badge variant={campaign.open_rate > 25 ? 'success' : 'warning'}>
                      {formatPercentage(campaign.open_rate)}
                    </Badge>
                  </td>
                  <td className="py-4 text-right">
                    <Badge variant={campaign.click_rate > 3 ? 'success' : 'warning'}>
                      {formatPercentage(campaign.click_rate)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  )
}

// ===============================
// FLOW PERFORMANCE
// ===============================
interface TopFlow {
  id: string
  name: string
  status: 'live' | 'paused'
  revenue: number
  recipients: number
  conversion_rate: number
}

interface FlowPerformanceProps {
  flows: TopFlow[]
}

export function FlowPerformance({ flows }: FlowPerformanceProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
    >
      <Card variant="glass">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-dark-100">Performance dos Flows</h3>
            <p className="text-dark-400 text-sm">Klaviyo automations</p>
          </div>
          <button className="p-2 rounded-lg hover:bg-dark-800 text-dark-400 transition-colors">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {flows.map((flow) => (
            <div
              key={flow.id}
              className="p-4 rounded-xl bg-dark-800/30 hover:bg-dark-800/50 transition-colors group cursor-pointer"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-dark-100 font-medium group-hover:text-primary-400 transition-colors">
                      {flow.name}
                    </h4>
                    <Badge variant={flow.status === 'live' ? 'success' : 'warning'}>
                      {flow.status === 'live' ? 'Ativo' : 'Pausado'}
                    </Badge>
                  </div>
                  <p className="text-dark-500 text-sm mt-1">
                    {formatNumber(flow.recipients)} contatos alcançados
                  </p>
                </div>
                <span className="text-dark-100 font-semibold">
                  {formatCurrency(flow.revenue)}
                </span>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full"
                      style={{ width: `${Math.min(flow.conversion_rate * 10, 100)}%` }}
                    />
                  </div>
                </div>
                <span className="text-dark-300 text-sm font-medium">
                  {formatPercentage(flow.conversion_rate)} conversão
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  )
}

// ===============================
// ATTRIBUTION PIE CHART
// ===============================
interface AttributionData {
  name: string
  value: number
  color: string
}

interface AttributionChartProps {
  data: AttributionData[]
}

export function AttributionChart({ data }: AttributionChartProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
    >
      <Card variant="glass">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-dark-100">Atribuição de Receita</h3>
            <p className="text-dark-400 text-sm">Por canal</p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="w-48 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="flex-1 space-y-3">
            {data.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-dark-300">{item.name}</span>
                </div>
                <span className="text-dark-100 font-semibold">
                  {formatPercentage(item.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </motion.div>
  )
}

// ===============================
// QUICK STATS ROW
// ===============================
interface QuickStat {
  label: string
  value: string
  icon: React.ReactNode
  trend?: 'up' | 'down'
}

interface QuickStatsProps {
  stats: QuickStat[]
}

export function QuickStats({ stats }: QuickStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
          className="flex items-center gap-3 p-4 rounded-xl bg-dark-800/30 border border-dark-700/50"
        >
          <div className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center text-dark-400">
            {stat.icon}
          </div>
          <div>
            <p className="text-dark-500 text-xs">{stat.label}</p>
            <p className="text-dark-100 font-semibold">{stat.value}</p>
          </div>
          {stat.trend && (
            <div className={cn('ml-auto', stat.trend === 'up' ? 'text-success-400' : 'text-error-400')}>
              {stat.trend === 'up' ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  )
}
