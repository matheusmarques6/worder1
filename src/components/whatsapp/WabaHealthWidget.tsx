'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { getSupabaseClient } from '@/lib/supabase-client'
import {
  ShieldCheck, ShieldAlert, ShieldX, Shield,
  RefreshCw, Loader2, ExternalLink, Zap
} from 'lucide-react'

// =============================================
// Types
// =============================================

interface WabaHealthData {
  quality_rating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN'
  messaging_limit: string
  throughput_level: string
  phone_number: string
  instance_name: string
}

interface WabaHealthWidgetProps {
  organizationId: string
  /** Provide data directly instead of fetching */
  data?: WabaHealthData
  className?: string
}

// =============================================
// Constants
// =============================================

const QUALITY_MAP = {
  GREEN: {
    label: 'Alta',
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    icon: ShieldCheck,
    iconColor: 'text-emerald-500',
  },
  YELLOW: {
    label: 'Media',
    badge: 'bg-amber-50 text-amber-700 border border-amber-200',
    icon: ShieldAlert,
    iconColor: 'text-amber-500',
  },
  RED: {
    label: 'Baixa',
    badge: 'bg-red-50 text-red-700 border border-red-200',
    icon: ShieldX,
    iconColor: 'text-red-500',
  },
  UNKNOWN: {
    label: 'N/A',
    badge: 'bg-gray-100 text-gray-500',
    icon: Shield,
    iconColor: 'text-gray-400',
  },
}

const TIER_MAP: Record<string, { label: string; max: number; current: number }> = {
  TIER_NOT_SET: { label: '250 / dia', max: 250, current: 0 },
  TIER_250:  { label: '250 / dia', max: 250, current: 0 },
  TIER_1K:   { label: '1K / dia', max: 1000, current: 1 },
  TIER_10K:  { label: '10K / dia', max: 10000, current: 2 },
  TIER_100K: { label: '100K / dia', max: 100000, current: 3 },
  UNLIMITED: { label: 'Ilimitado', max: 100000, current: 4 },
}

const THROUGHPUT_MAP: Record<string, string> = {
  STANDARD: 'Padrao',
  HIGH: 'Alto',
}

// =============================================
// Component
// =============================================

export function WabaHealthWidget({
  organizationId,
  data: externalData,
  className,
}: WabaHealthWidgetProps) {
  const [data, setData] = useState<WabaHealthData | null>(externalData || null)
  const [loading, setLoading] = useState(!externalData)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data: { session } } = await getSupabaseClient().auth.getSession()
      const token = session?.access_token
      if (!token) {
        throw new Error('Sessão expirada. Faça login novamente.')
      }
      const res = await fetch('/api/whatsapp/cloud/accounts', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar')
      const account = (json.accounts || [])[0]
      if (account) {
        setData({
          quality_rating: account.quality_rating || 'UNKNOWN',
          messaging_limit: account.messaging_limit || 'TIER_NOT_SET',
          throughput_level: account.throughput_level || 'STANDARD',
          phone_number: account.display_phone_number || account.phone_number || '',
          instance_name: account.verified_name || '',
        })
      } else {
        setData(null)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    if (!externalData) fetchHealth()
  }, [externalData, fetchHealth])

  // Sync if parent passes new data
  useEffect(() => {
    if (externalData) setData(externalData)
  }, [externalData])

  if (loading) {
    return (
      <div className={cn('bg-white border border-gray-200 shadow-sm rounded-2xl p-4', className)}>
        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
          <span className="text-sm text-gray-400">Carregando saude...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('bg-white border border-gray-200 shadow-sm rounded-2xl p-4', className)}>
        <div className="flex items-center justify-between">
          <span className="text-sm text-red-500">{error}</span>
          <button
            onClick={fetchHealth}
            className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const ratingKey = data.quality_rating as keyof typeof QUALITY_MAP
  const quality = QUALITY_MAP[ratingKey] || QUALITY_MAP.UNKNOWN
  const QualityIcon = quality.icon
  const tier = TIER_MAP[data.messaging_limit] || { label: data.messaging_limit, max: 4, current: 0 }
  const tierProgress = tier.current > 0 ? (tier.current / 4) * 100 : 0
  const throughputLabel = THROUGHPUT_MAP[data.throughput_level] || data.throughput_level || 'N/A'

  return (
    <div className={cn('bg-white border border-gray-200 shadow-sm rounded-2xl p-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <QualityIcon className={cn('w-5 h-5', quality.iconColor)} />
          <span className="text-sm font-semibold text-gray-800">Saude WABA</span>
        </div>
        <button
          onClick={fetchHealth}
          className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400 hover:text-gray-600 transition-colors"
          title="Atualizar"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quality Badge */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500">Qualidade</span>
        <span
          className={cn(
            'inline-flex items-center rounded-full font-medium px-2.5 py-1 text-xs',
            quality.badge
          )}
        >
          {quality.label}
        </span>
      </div>

      {/* Messaging Tier Progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">Limite de Mensagens</span>
          <span className="text-xs font-medium text-gray-700">{tier.label}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-500"
            style={{ width: `${tierProgress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-gray-400">1K</span>
          <span className="text-[10px] text-gray-400">10K</span>
          <span className="text-[10px] text-gray-400">100K</span>
          <span className="text-[10px] text-gray-400">Ilim.</span>
        </div>
      </div>

      {/* Throughput */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500">Throughput</span>
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs font-medium text-gray-700">{throughputLabel}</span>
        </div>
      </div>

      {/* Help Link */}
      <a
        href="https://developers.facebook.com/docs/whatsapp/messaging-limits"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 transition-colors"
      >
        <ExternalLink className="w-3 h-3" />
        Como melhorar?
      </a>
    </div>
  )
}

export default WabaHealthWidget
