'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Database,
  Crosshair,
  UsersThree,
  CheckCircle,
  Warning,
  ArrowSquareOut,
  Spinner,
} from '@phosphor-icons/react'
import { useStoreStore } from '@/stores'

// Real per-store event metric (from /api/analytics/metrics)
interface EventMetric {
  key: string
  label: string
  icon: string
  count: number
  integration: string
}

// Real pixel/connection state (from /api/integrations/shopify/status)
interface PixelState {
  connected: boolean
  pixelInstalled: boolean
  shopDomain: string | null
}

export default function DataPage() {
  const { currentStore } = useStoreStore()
  const hasHydrated = useStoreStore((s) => s._hasHydrated)

  const [loading, setLoading] = useState(true)
  const [hasStore, setHasStore] = useState(true)
  const [events, setEvents] = useState<EventMetric[]>([])
  const [profiles, setProfiles] = useState<number | null>(null)
  const [pixel, setPixel] = useState<PixelState | null>(null)

  useEffect(() => {
    if (!hasHydrated) return
    const storeId = currentStore?.id
    if (!storeId) {
      setHasStore(false)
      setLoading(false)
      return
    }
    setHasStore(true)
    setLoading(true)

    Promise.all([
      // Real event counts over the last 30 days for this store.
      fetch(`/api/analytics/metrics?storeId=${storeId}&days=30`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      // Real profile (contact) count for this store.
      fetch(`/api/contacts/count?store_id=${storeId}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      // Real pixel / connection state for this store.
      fetch(`/api/integrations/shopify/status?store_id=${storeId}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([metricsRes, countRes, statusRes]) => {
        const metrics: EventMetric[] = Array.isArray(metricsRes?.metrics) ? metricsRes.metrics : []
        setEvents(metrics)
        setProfiles(typeof countRes?.count === 'number' ? countRes.count : null)
        setPixel({
          connected: !!statusRes?.connected,
          pixelInstalled: !!statusRes?.store?.pixelInstalled,
          shopDomain: statusRes?.store?.shopDomain || null,
        })
      })
      .finally(() => setLoading(false))
  }, [currentStore?.id, hasHydrated])

  // Only events with real activity, ordered by volume.
  const activeEvents = events
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count)
  const totalEvents = activeEvents.reduce((sum, e) => sum + e.count, 0)

  const pixelActive = !!pixel?.connected && !!pixel?.pixelInstalled

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size={32} className="text-gray-400 animate-spin" />
      </div>
    )
  }

  if (!hasStore) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center">
            <Database size={22} className="text-white" weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">Worder Data</h1>
            <p className="text-sm text-gray-500 mt-0.5">Rastreamento de eventos e perfis dos seus contatos</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-500">
          <UsersThree size={40} className="text-gray-300 mx-auto mb-4" />
          <p className="font-medium text-gray-700">Conecte sua loja para ver seus dados</p>
          <p className="text-sm mt-1">Vincule uma loja Shopify para começar a rastrear eventos e unificar perfis.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center">
          <Database size={22} className="text-white" weight="fill" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-display text-gray-900">Worder Data</h1>
          <p className="text-sm text-gray-500 mt-0.5">Rastreamento de eventos e perfis dos seus contatos</p>
        </div>
      </div>

      {/* KPIs — real values only */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <UsersThree size={16} className="text-gray-500" />
            <span className="text-xs text-gray-500">Perfis</span>
          </div>
          <p className="text-xl font-bold text-gray-900">
            {profiles !== null ? profiles.toLocaleString('pt-BR') : '—'}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Crosshair size={16} className="text-gray-500" />
            <span className="text-xs text-gray-500">Eventos rastreados (30 dias)</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{totalEvents.toLocaleString('pt-BR')}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database size={16} className="text-gray-500" />
            <span className="text-xs text-gray-500">Tipos de evento ativos</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{activeEvents.length.toLocaleString('pt-BR')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pixel status — derived from real connection/event state */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Crosshair size={16} className="text-brand-600" />
            Pixel de Rastreamento
          </h3>
          {pixelActive ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle size={16} className="text-emerald-500" weight="fill" />
              <span className="text-xs text-emerald-700">
                Pixel ativo{pixel?.shopDomain ? ` em ${pixel.shopDomain}` : ''} — recebendo dados
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <Warning size={16} className="text-amber-500" weight="fill" />
                <span className="text-xs text-amber-700">
                  {pixel?.connected
                    ? 'Nenhum evento do pixel detectado ainda nesta loja.'
                    : 'Pixel ainda não instalado nesta loja.'}
                </span>
              </div>
              <Link
                href="/settings/tracking/install"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Instalar pixel
                <ArrowSquareOut size={14} />
              </Link>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-4">
            Veja instruções de instalação e o código do pixel em{' '}
            <Link href="/settings/tracking/install" className="text-brand-600 hover:underline">
              Configurações → Instalar pixel
            </Link>
            .
          </p>
        </div>

        {/* Event tracking — real counts */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Crosshair size={16} className="text-brand-600" />
            Eventos Rastreados (últimos 30 dias)
          </h3>
          {activeEvents.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-500">Nenhum evento rastreado ainda.</p>
              <p className="text-xs text-gray-400 mt-1">
                Os eventos aparecem aqui assim que o pixel começar a receber dados.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeEvents.map((ev) => (
                <div
                  key={ev.key}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <span className="text-sm text-gray-700">{ev.label}</span>
                    <span className="text-xs text-gray-400 ml-2 font-mono">{ev.key}</span>
                  </div>
                  <span className="text-sm text-gray-600">{ev.count.toLocaleString('pt-BR')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
