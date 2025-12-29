'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield, ShieldAlert, ShieldCheck, ShieldX,
  RefreshCw, TrendingUp, TrendingDown, Minus,
  Phone, Clock, AlertTriangle, CheckCircle,
  Loader2, ChevronDown, ChevronUp, History
} from 'lucide-react'

// =============================================
// TIPOS
// =============================================

interface QualityInstance {
  id: string
  instance_name: string
  phone_number: string
  phone_number_id: string
  status: string
  quality_rating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN'
  messaging_limit_tier: string
  quality_checked_at: string | null
}

interface QualityStats {
  total: number
  green: number
  yellow: number
  red: number
  unknown: number
  healthy_percent: number
  at_risk_percent: number
}

interface QualityChange {
  id: string
  phone_number_id: string
  quality_rating: string
  previous_rating: string
  checked_at: string
}

interface ChartDataPoint {
  date: string
  checks: number
  green: number
  yellow: number
  red: number
}

interface QualityDashboardProps {
  organizationId: string
  compact?: boolean // Modo compacto para sidebar/cards
}

// =============================================
// CONSTANTES
// =============================================

const QUALITY_CONFIG = {
  GREEN: {
    label: 'Alta',
    color: 'emerald',
    bgColor: 'bg-emerald-500/10',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    icon: ShieldCheck,
    description: 'Qualidade excelente, sem restrições',
  },
  YELLOW: {
    label: 'Média',
    color: 'amber',
    bgColor: 'bg-amber-500/10',
    textColor: 'text-amber-400',
    borderColor: 'border-amber-500/30',
    icon: ShieldAlert,
    description: 'Atenção: qualidade em observação',
  },
  RED: {
    label: 'Baixa',
    color: 'red',
    bgColor: 'bg-red-500/10',
    textColor: 'text-red-400',
    borderColor: 'border-red-500/30',
    icon: ShieldX,
    description: 'Crítico: risco de restrições',
  },
  UNKNOWN: {
    label: 'Desconhecido',
    color: 'slate',
    bgColor: 'bg-slate-500/10',
    textColor: 'text-slate-400',
    borderColor: 'border-slate-500/30',
    icon: Shield,
    description: 'Qualidade não verificada',
  },
}

const TIER_LABELS: Record<string, string> = {
  'TIER_1K': '1.000 msg/dia',
  'TIER_10K': '10.000 msg/dia',
  'TIER_100K': '100.000 msg/dia',
  'UNLIMITED': 'Ilimitado',
  'UNKNOWN': 'Não verificado',
}

// =============================================
// COMPONENTE PRINCIPAL
// =============================================

export function QualityDashboard({ organizationId, compact = false }: QualityDashboardProps) {
  const [instances, setInstances] = useState<QualityInstance[]>([])
  const [stats, setStats] = useState<QualityStats | null>(null)
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [recentChanges, setRecentChanges] = useState<QualityChange[]>([])
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  // Buscar dados
  const fetchDashboard = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch(`/api/whatsapp/quality?organization_id=${organizationId}&action=dashboard`)
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed to fetch')

      setInstances(data.instances || [])
      setStats(data.stats || null)
      setChartData(data.chart_data || [])
      setRecentChanges(data.recent_changes || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  // Verificar qualidade agora
  const checkQualityNow = async () => {
    setChecking(true)
    try {
      const res = await fetch('/api/whatsapp/quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organizationId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to check')
      }

      // Recarregar dashboard
      await fetchDashboard()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="w-5 h-5" />
          <span>{error}</span>
        </div>
        <button
          onClick={fetchDashboard}
          className="mt-2 text-sm text-red-400 hover:text-red-300"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  // Modo compacto (para cards/sidebar)
  if (compact) {
    return <CompactQualityCard instances={instances} stats={stats} onCheck={checkQualityNow} checking={checking} />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Qualidade do Número</h2>
          <p className="text-sm text-slate-400">
            Monitore a qualidade e limites de mensagens
          </p>
        </div>
        <button
          onClick={checkQualityNow}
          disabled={checking}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50 transition-all"
        >
          {checking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Verificar Agora
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Saudáveis"
            value={stats.green}
            total={stats.total}
            color="emerald"
            icon={ShieldCheck}
          />
          <StatCard
            label="Em Observação"
            value={stats.yellow}
            total={stats.total}
            color="amber"
            icon={ShieldAlert}
          />
          <StatCard
            label="Em Risco"
            value={stats.red}
            total={stats.total}
            color="red"
            icon={ShieldX}
          />
          <StatCard
            label="Não Verificados"
            value={stats.unknown}
            total={stats.total}
            color="slate"
            icon={Shield}
          />
        </div>
      )}

      {/* Instâncias */}
      <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 overflow-hidden">
        <div className="p-4 border-b border-slate-800/50">
          <h3 className="font-medium text-white">Números WhatsApp</h3>
        </div>
        
        {instances.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum número WhatsApp configurado</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {instances.map((instance) => (
              <InstanceRow key={instance.id} instance={instance} />
            ))}
          </div>
        )}
      </div>

      {/* Mudanças Recentes */}
      {recentChanges.length > 0 && (
        <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 overflow-hidden">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-slate-400" />
              <h3 className="font-medium text-white">Mudanças Recentes</h3>
              <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-xs">
                {recentChanges.length}
              </span>
            </div>
            {showHistory ? (
              <ChevronUp className="w-5 h-5 text-slate-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-400" />
            )}
          </button>

          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="divide-y divide-slate-800/50">
                  {recentChanges.map((change) => (
                    <QualityChangeRow key={change.id} change={change} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Gráfico (Simples) */}
      {chartData.length > 0 && (
        <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-4">
          <h3 className="font-medium text-white mb-4">Histórico (7 dias)</h3>
          <SimpleChart data={chartData} />
        </div>
      )}
    </div>
  )
}

// =============================================
// COMPONENTES AUXILIARES
// =============================================

function StatCard({
  label,
  value,
  total,
  color,
  icon: Icon,
}: {
  label: string
  value: number
  total: number
  color: string
  icon: any
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0

  return (
    <div className={`p-4 bg-${color}-500/10 border border-${color}-500/20 rounded-xl`}>
      <div className="flex items-center justify-between mb-2">
        <Icon className={`w-5 h-5 text-${color}-400`} />
        <span className={`text-2xl font-bold text-${color}-400`}>{value}</span>
      </div>
      <p className="text-sm text-slate-400">{label}</p>
      <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full bg-${color}-500 rounded-full transition-all`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

function InstanceRow({ instance }: { instance: QualityInstance }) {
  const config = QUALITY_CONFIG[instance.quality_rating] || QUALITY_CONFIG.UNKNOWN
  const Icon = config.icon
  const tierLabel = TIER_LABELS[instance.messaging_limit_tier] || instance.messaging_limit_tier

  return (
    <div className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
      <div className="flex items-center gap-4">
        <div className={`p-2 rounded-lg ${config.bgColor}`}>
          <Icon className={`w-5 h-5 ${config.textColor}`} />
        </div>
        <div>
          <p className="font-medium text-white">{instance.instance_name}</p>
          <p className="text-sm text-slate-400">{instance.phone_number}</p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* Qualidade */}
        <div className="text-right">
          <p className={`font-medium ${config.textColor}`}>{config.label}</p>
          <p className="text-xs text-slate-500">{config.description}</p>
        </div>

        {/* Tier */}
        <div className="text-right min-w-[120px]">
          <p className="text-sm text-slate-300">{tierLabel}</p>
          <p className="text-xs text-slate-500">Limite diário</p>
        </div>

        {/* Última verificação */}
        <div className="text-right min-w-[100px]">
          {instance.quality_checked_at ? (
            <>
              <p className="text-sm text-slate-300">
                {formatTimeAgo(instance.quality_checked_at)}
              </p>
              <p className="text-xs text-slate-500">Última verificação</p>
            </>
          ) : (
            <p className="text-xs text-slate-500">Nunca verificado</p>
          )}
        </div>
      </div>
    </div>
  )
}

function QualityChangeRow({ change }: { change: QualityChange }) {
  const prevConfig = QUALITY_CONFIG[change.previous_rating as keyof typeof QUALITY_CONFIG] || QUALITY_CONFIG.UNKNOWN
  const newConfig = QUALITY_CONFIG[change.quality_rating as keyof typeof QUALITY_CONFIG] || QUALITY_CONFIG.UNKNOWN

  const qualityOrder = { GREEN: 3, YELLOW: 2, RED: 1, UNKNOWN: 0 }
  const prevScore = qualityOrder[change.previous_rating as keyof typeof qualityOrder] || 0
  const newScore = qualityOrder[change.quality_rating as keyof typeof qualityOrder] || 0
  const improved = newScore > prevScore

  return (
    <div className="p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {improved ? (
          <TrendingUp className="w-5 h-5 text-emerald-400" />
        ) : (
          <TrendingDown className="w-5 h-5 text-red-400" />
        )}
        <div>
          <p className="text-sm text-slate-300">
            Qualidade mudou de{' '}
            <span className={prevConfig.textColor}>{prevConfig.label}</span>
            {' para '}
            <span className={newConfig.textColor}>{newConfig.label}</span>
          </p>
          <p className="text-xs text-slate-500">{change.phone_number_id}</p>
        </div>
      </div>
      <p className="text-xs text-slate-500">{formatTimeAgo(change.checked_at)}</p>
    </div>
  )
}

function CompactQualityCard({
  instances,
  stats,
  onCheck,
  checking,
}: {
  instances: QualityInstance[]
  stats: QualityStats | null
  onCheck: () => void
  checking: boolean
}) {
  // Pegar a pior qualidade
  const worstRating = instances.reduce((worst, inst) => {
    const order = { RED: 1, YELLOW: 2, UNKNOWN: 3, GREEN: 4 }
    const currentOrder = order[inst.quality_rating] || 4
    const worstOrder = order[worst as keyof typeof order] || 4
    return currentOrder < worstOrder ? inst.quality_rating : worst
  }, 'GREEN' as 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN')

  const config = QUALITY_CONFIG[worstRating]
  const Icon = config.icon

  return (
    <div className={`p-4 rounded-xl border ${config.bgColor} ${config.borderColor}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${config.textColor}`} />
          <span className="font-medium text-white">Qualidade WhatsApp</span>
        </div>
        <button
          onClick={onCheck}
          disabled={checking}
          className="p-1.5 rounded-lg hover:bg-slate-800/50 text-slate-400 hover:text-white transition-colors"
        >
          {checking ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className={`text-2xl font-bold ${config.textColor}`}>{config.label}</p>
          <p className="text-xs text-slate-500">{instances.length} número(s)</p>
        </div>

        {stats && (
          <div className="flex gap-2">
            <div className="text-center px-2">
              <p className="text-emerald-400 font-medium">{stats.green}</p>
              <p className="text-[10px] text-slate-500">OK</p>
            </div>
            <div className="text-center px-2">
              <p className="text-amber-400 font-medium">{stats.yellow}</p>
              <p className="text-[10px] text-slate-500">Médio</p>
            </div>
            <div className="text-center px-2">
              <p className="text-red-400 font-medium">{stats.red}</p>
              <p className="text-[10px] text-slate-500">Baixo</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SimpleChart({ data }: { data: ChartDataPoint[] }) {
  const maxValue = Math.max(...data.map(d => d.checks), 1)

  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((point, i) => {
        const greenHeight = (point.green / maxValue) * 100
        const yellowHeight = (point.yellow / maxValue) * 100
        const redHeight = (point.red / maxValue) * 100

        return (
          <div
            key={i}
            className="flex-1 flex flex-col justify-end gap-px"
            title={`${point.date}: ${point.checks} verificações`}
          >
            {redHeight > 0 && (
              <div
                className="bg-red-500 rounded-t"
                style={{ height: `${redHeight}%` }}
              />
            )}
            {yellowHeight > 0 && (
              <div
                className="bg-amber-500"
                style={{ height: `${yellowHeight}%` }}
              />
            )}
            {greenHeight > 0 && (
              <div
                className="bg-emerald-500 rounded-b"
                style={{ height: `${greenHeight}%` }}
              />
            )}
            <p className="text-[10px] text-slate-500 text-center mt-1">
              {point.date.split('-')[2]}
            </p>
          </div>
        )
      })}
    </div>
  )
}

// =============================================
// HELPERS
// =============================================

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Agora'
  if (diffMins < 60) return `${diffMins}min atrás`
  if (diffHours < 24) return `${diffHours}h atrás`
  if (diffDays === 1) return 'Ontem'
  if (diffDays < 7) return `${diffDays} dias atrás`
  return date.toLocaleDateString('pt-BR')
}

// =============================================
// EXPORTS
// =============================================

export default QualityDashboard
