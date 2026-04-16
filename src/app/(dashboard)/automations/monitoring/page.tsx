'use client'

// =============================================
// WORDER: Automation monitoring dashboard
// /automations/monitoring
// =============================================

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  TrendingUp,
  Loader2,
  RefreshCw,
  ArrowLeft,
  AlertCircle,
  Server,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Monitoring {
  totals: {
    total24h: number
    completed24h: number
    failed24h: number
    running: number
    waiting: number
    deadLetters: number
    activeAutomations: number
  }
  alerts: Array<{
    type: string
    severity: 'warning' | 'error'
    automationId?: string
    message: string
    count?: number
  }>
  topErrors: Array<{ error: string; count: number }>
  hourly: Array<{ time: string; total: number; success: number; failed: number }>
  perAutomation: Array<{
    automationId: string
    total: number
    success: number
    failed: number
    running: number
    waiting: number
    failureRate: number
  }>
}

export default function AutomationMonitoringPage() {
  const [data, setData] = useState<Monitoring | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/automations/monitoring', { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
    const i = setInterval(load, 30000) // auto-refresh a cada 30s
    return () => clearInterval(i)
  }, [])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    )
  }
  if (!data) return null

  const t = data.totals
  const successRate = t.total24h > 0 ? ((t.completed24h / t.total24h) * 100).toFixed(1) : '—'
  const maxHourly = Math.max(...data.hourly.map((h) => h.total), 1)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/automations" className="p-2 rounded-lg hover:bg-gray-50">
            <ArrowLeft size={18} className="text-gray-500" />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
            <Activity className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Monitoramento</h1>
            <p className="text-sm text-gray-500 mt-0.5">Últimas 24h · Atualiza a cada 30s</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((a, i) => (
            <div
              key={i}
              className={cn(
                'border rounded-xl p-4 flex items-start gap-3',
                a.severity === 'error'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-amber-50 border-amber-200'
              )}
            >
              <AlertTriangle
                className={cn(
                  'w-5 h-5 flex-shrink-0 mt-0.5',
                  a.severity === 'error' ? 'text-red-500' : 'text-amber-500'
                )}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    'text-sm font-medium',
                    a.severity === 'error' ? 'text-red-900' : 'text-amber-900'
                  )}
                >
                  {a.message}
                </p>
                {a.automationId && (
                  <Link
                    href={`/automations/${a.automationId}`}
                    className={cn(
                      'text-xs font-medium mt-0.5 inline-flex items-center gap-1',
                      a.severity === 'error' ? 'text-red-700 hover:text-red-800' : 'text-amber-700 hover:text-amber-800'
                    )}
                  >
                    Ver automação →
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi icon={Zap} label="Runs 24h" value={t.total24h.toLocaleString('pt-BR')} sub={`${successRate}% sucesso`} />
        <Kpi
          icon={CheckCircle}
          label="Concluídas"
          value={t.completed24h.toLocaleString('pt-BR')}
          color="emerald"
        />
        <Kpi icon={XCircle} label="Falharam" value={t.failed24h.toLocaleString('pt-BR')} color="red" />
        <Kpi icon={Clock} label="Em execução" value={(t.running + t.waiting).toLocaleString('pt-BR')} sub={`${t.running} running · ${t.waiting} waiting`} />
      </div>

      {/* Hourly chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Throughput por hora</h2>
            <p className="text-xs text-gray-500 mt-0.5">Runs criadas nas últimas 24h</p>
          </div>
          <TrendingUp className="w-4 h-4 text-gray-400" />
        </div>
        <div className="flex items-end gap-1 h-32">
          {data.hourly.map((h, i) => {
            const heightPct = (h.total / maxHourly) * 100
            const failPct = h.total > 0 ? (h.failed / h.total) * 100 : 0
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group cursor-pointer">
                <div className="flex-1 w-full flex flex-col-reverse min-h-0">
                  <div
                    className="bg-emerald-400 rounded-t w-full transition-all"
                    style={{ height: `${heightPct * (1 - failPct / 100)}%` }}
                  />
                  {failPct > 0 && (
                    <div
                      className="bg-red-400 w-full transition-all"
                      style={{ height: `${heightPct * (failPct / 100)}%` }}
                    />
                  )}
                </div>
                <span className="text-[9px] text-gray-400 group-hover:text-gray-900">
                  {h.time.slice(11, 13)}h
                </span>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-emerald-400" /> Sucesso
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-red-400" /> Falha
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top errors */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <h2 className="text-base font-semibold text-gray-900">Principais erros</h2>
          </div>
          {data.topErrors.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              ✨ Nenhum erro nas últimas 24h.
            </div>
          ) : (
            <div className="space-y-2">
              {data.topErrors.map((e, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-red-50/50 rounded-lg border border-red-100">
                  <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full flex-shrink-0">
                    {e.count}×
                  </span>
                  <p className="text-xs text-gray-700 flex-1 font-mono leading-relaxed">{e.error}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Queue health */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-4 h-4 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">Saúde da infraestrutura</h2>
          </div>
          <div className="space-y-3">
            <HealthRow
              label="Automações ativas"
              value={t.activeAutomations}
              status={t.activeAutomations > 0 ? 'ok' : 'warn'}
            />
            <HealthRow
              label="Dead letters (fila email)"
              value={t.deadLetters}
              status={t.deadLetters === 0 ? 'ok' : t.deadLetters < 10 ? 'warn' : 'error'}
            />
            <HealthRow
              label="Runs presas em running"
              value={t.running}
              status={t.running < 5 ? 'ok' : 'warn'}
            />
          </div>
        </div>
      </div>

      {/* Per-automation */}
      {data.perAutomation.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Por automação</h2>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Automação</th>
                <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Total</th>
                <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Sucesso</th>
                <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Falha</th>
                <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Taxa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.perAutomation
                .sort((a, b) => b.total - a.total)
                .map((a) => {
                  const succRate = a.total > 0 ? ((a.success / a.total) * 100).toFixed(0) : '0'
                  return (
                    <tr key={a.automationId} className="hover:bg-gray-50">
                      <td className="px-6 py-3">
                        <Link href={`/automations/${a.automationId}`} className="text-sm font-medium text-gray-900 hover:text-orange-500">
                          {a.automationId.slice(0, 8)}…
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{a.total}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-emerald-700">{a.success}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-red-700">{a.failed}</td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={cn(
                            'text-xs font-semibold px-2 py-0.5 rounded-full',
                            a.failureRate > 0.2
                              ? 'bg-red-50 text-red-700'
                              : a.failureRate > 0.05
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700'
                          )}
                        >
                          {succRate}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub, color = 'gray' }: any) {
  const colorMap: Record<string, string> = {
    gray: 'text-gray-400',
    emerald: 'text-emerald-500',
    red: 'text-red-500',
    amber: 'text-amber-500',
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <Icon className={cn('w-4 h-4', colorMap[color])} />
      </div>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

function HealthRow({ label, value, status }: { label: string; value: number; status: 'ok' | 'warn' | 'error' }) {
  const color =
    status === 'ok' ? 'text-emerald-600 bg-emerald-50' :
    status === 'warn' ? 'text-amber-600 bg-amber-50' :
    'text-red-600 bg-red-50'
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-700">{label}</span>
      <span className={cn('text-sm font-semibold tabular-nums px-2 py-0.5 rounded-full', color)}>
        {value}
      </span>
    </div>
  )
}
