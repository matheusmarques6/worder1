'use client'

// =============================================
// WORDER: AI Usage & Cost dashboard
// /settings/ai-usage
// =============================================

import { useEffect, useState } from 'react'
import { Sparkles, DollarSign, Zap, Loader2, Clock, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UsageData {
  period: string
  totals: {
    calls: number
    successful: number
    failed: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
    costUsd: number
    avgDurationMs: number
  }
  grouped: Array<{ key: string; calls: number; tokens: number; costUsd: number }>
}

const PERIODS = [
  { value: '24h', label: 'Últimas 24h' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '90d', label: '90 dias' },
]

const GROUP_BY = [
  { value: 'day', label: 'Dia' },
  { value: 'model', label: 'Modelo' },
  { value: 'feature', label: 'Feature' },
]

function fmtCost(usd: number) {
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

function fmtNum(n: number) {
  return n.toLocaleString('pt-BR')
}

export default function AiUsagePage() {
  const [period, setPeriod] = useState('30d')
  const [groupBy, setGroupBy] = useState<'day' | 'model' | 'feature'>('day')
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/ai/usage?period=${period}&group_by=${groupBy}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json()
      })
      .then((d) => {
        // Garantir que totals e grouped existem
        setData({
          period: d.period || period,
          totals: d.totals || { calls: 0, successful: 0, failed: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0, avgDurationMs: 0 },
          grouped: Array.isArray(d.grouped) ? d.grouped : [],
        })
      })
      .catch((e) => setError(e?.message || 'Erro ao carregar'))
      .finally(() => setLoading(false))
  }, [period, groupBy])

  if (loading && !data) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="p-8 max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Uso de IA</h1>
            <p className="text-sm text-gray-500 mt-0.5">Nenhum dado disponível ainda.</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Os dados de uso aparecerão aqui quando features de IA forem utilizadas.</p>
          <p className="text-xs text-gray-400 mt-2">Verifique se a migration do <code className="font-mono">ai_usage_logs</code> foi executada no Supabase.</p>
        </div>
      </div>
    )
  }
  if (!data) return null

  const grouped: Array<{ key: string; calls: number; tokens: number; costUsd: number }> = data.grouped || []
  const maxCost = Math.max(...grouped.map((g: any) => g.costUsd), 0.001)
  const successRate =
    data.totals.calls > 0 ? ((data.totals.successful / data.totals.calls) * 100).toFixed(1) : '—'

  return (
    <div className="p-8 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Uso de IA</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Custos e performance dos modelos de linguagem usados no sistema.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                period === p.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Custo total</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmtCost(data.totals.costUsd)}</p>
          <p className="text-xs text-gray-400 mt-1">no período</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Chamadas</span>
            <Zap className="w-4 h-4 text-orange-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmtNum(data.totals.calls)}</p>
          <p className="text-xs text-gray-400 mt-1">{successRate}% sucesso</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Tokens</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {(data.totals.totalTokens / 1000).toFixed(1)}k
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {fmtNum(data.totals.promptTokens)} in · {fmtNum(data.totals.completionTokens)} out
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500">Latência média</span>
            <Clock className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {data.totals.avgDurationMs}ms
          </p>
          <p className="text-xs text-gray-400 mt-1">por chamada</p>
        </div>
      </div>

      {/* Grouped chart */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Breakdown</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {grouped.length} grupos · ordenados por custo
            </p>
          </div>
          <div className="flex gap-1">
            {GROUP_BY.map((g) => (
              <button
                key={g.value}
                onClick={() => setGroupBy(g.value as any)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
                  groupBy === g.value
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {grouped.length === 0 ? (
          <div className="p-12 text-center">
            <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Nenhum uso de IA registrado no período.</p>
            <p className="text-xs text-gray-400 mt-1">
              Os custos aparecem aqui quando features de IA (WhatsApp agent, email AI, etc) forem usadas.
            </p>
          </div>
        ) : (
          <div className="p-6 space-y-3">
            {grouped.map((g) => {
              const pct = (g.costUsd / maxCost) * 100
              return (
                <div key={g.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-900 truncate">{g.key}</span>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-gray-400 tabular-nums">{fmtNum(g.calls)} calls</span>
                      <span className="text-gray-400 tabular-nums">
                        {(g.tokens / 1000).toFixed(1)}k tok
                      </span>
                      <span className="font-semibold text-emerald-700 tabular-nums">
                        {fmtCost(g.costUsd)}
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-600 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex items-start gap-3">
        <Sparkles className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-gray-500">
          <p>
            Custos calculados com base nos preços vigentes dos provedores (OpenAI, Anthropic, Google).
            Tracking via <code className="font-mono text-gray-700">trackAiUsage()</code> helper.
          </p>
        </div>
      </div>
    </div>
  )
}
