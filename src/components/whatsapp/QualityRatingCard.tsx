'use client'

import { cn } from '@/lib/utils'
import {
  ShieldCheck, ShieldAlert, ShieldX, Shield, Zap
} from 'lucide-react'

// =============================================
// Types
// =============================================

export type QualityRating = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN'

interface QualityRatingCardProps {
  qualityRating: QualityRating
  messagingLimitTier: string
  throughputLevel?: string
  className?: string
}

// =============================================
// Constants
// =============================================

const RATING_CONFIG: Record<QualityRating, {
  label: string
  description: string
  bgCard: string
  borderCard: string
  textColor: string
  dotColor: string
  icon: typeof ShieldCheck
}> = {
  GREEN: {
    label: 'Alta',
    description: 'Qualidade excelente, sem restricoes',
    bgCard: 'bg-emerald-50/50',
    borderCard: 'border-emerald-200',
    textColor: 'text-emerald-600',
    dotColor: 'bg-emerald-500',
    icon: ShieldCheck,
  },
  YELLOW: {
    label: 'Media',
    description: 'Qualidade em observacao, tome cuidado',
    bgCard: 'bg-amber-50/50',
    borderCard: 'border-amber-200',
    textColor: 'text-amber-600',
    dotColor: 'bg-amber-500',
    icon: ShieldAlert,
  },
  RED: {
    label: 'Baixa',
    description: 'Risco de restricao, melhore agora',
    bgCard: 'bg-red-50/50',
    borderCard: 'border-red-200',
    textColor: 'text-red-600',
    dotColor: 'bg-red-500',
    icon: ShieldX,
  },
  UNKNOWN: {
    label: 'Nao Verificado',
    description: 'Qualidade ainda nao foi verificada',
    bgCard: 'bg-gray-50',
    borderCard: 'border-gray-200',
    textColor: 'text-gray-500',
    dotColor: 'bg-gray-400',
    icon: Shield,
  },
}

const TIER_INFO: Record<string, { label: string; step: number }> = {
  TIER_NOT_SET: { label: '250 msg/dia', step: 0 },
  TIER_250:  { label: '250 msg/dia', step: 0 },
  TIER_1K:   { label: '1.000 msg/dia', step: 1 },
  TIER_10K:  { label: '10.000 msg/dia', step: 2 },
  TIER_100K: { label: '100.000 msg/dia', step: 3 },
  UNLIMITED: { label: 'Ilimitado', step: 4 },
}

const THROUGHPUT_LABELS: Record<string, string> = {
  STANDARD: 'Padrao (80 msg/s)',
  HIGH: 'Alto (1.000 msg/s)',
}

const TOTAL_STEPS = 4

// =============================================
// Component
// =============================================

export function QualityRatingCard({
  qualityRating,
  messagingLimitTier,
  throughputLevel,
  className,
}: QualityRatingCardProps) {
  const config = RATING_CONFIG[qualityRating] || RATING_CONFIG.UNKNOWN
  const Icon = config.icon
  const tier = TIER_INFO[messagingLimitTier] || { label: messagingLimitTier || 'Desconhecido', step: 0 }
  const throughput = throughputLevel
    ? THROUGHPUT_LABELS[throughputLevel] || throughputLevel
    : null

  return (
    <div
      className={cn(
        'rounded-2xl border p-5',
        config.bgCard,
        config.borderCard,
        className
      )}
    >
      {/* Quality rating header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-xl', config.bgCard)}>
            <Icon className={cn('w-6 h-6', config.textColor)} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Qualidade do Numero</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn('w-2 h-2 rounded-full', config.dotColor)} />
              <span className={cn('text-sm font-medium', config.textColor)}>
                {config.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-4">{config.description}</p>

      {/* Messaging limit */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-600">Limite de Mensagens</span>
          <span className="text-xs font-semibold text-gray-800">{tier.label}</span>
        </div>

        {/* Step progress */}
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-2 flex-1 rounded-full transition-all duration-500',
                i < tier.step ? 'bg-brand-500' : 'bg-gray-200'
              )}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-gray-400">1K</span>
          <span className="text-[10px] text-gray-400">10K</span>
          <span className="text-[10px] text-gray-400">100K</span>
          <span className="text-[10px] text-gray-400">Ilim.</span>
        </div>
      </div>

      {/* Throughput badge */}
      {throughput && (
        <div className="flex items-center justify-between pt-3 border-t border-gray-200/60">
          <span className="text-xs text-gray-500">Throughput</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <Zap className="w-3 h-3" />
            {throughput}
          </span>
        </div>
      )}
    </div>
  )
}

export default QualityRatingCard
