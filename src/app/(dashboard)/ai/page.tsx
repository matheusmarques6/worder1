'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Sparkle as Sparkles,
  TrendUp as TrendingUp,
  CurrencyDollar,
  ChatCircleDots,
  Pause,
  ArrowRight,
  Gauge,
  Plus,
} from '@phosphor-icons/react'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores'

// =============================================
// /ai — Visão geral do módulo IA. Lê do endpoint
// /api/ai/overview, que agrega ai_executions + whatsapp_conversations.
// Sem dados, mostra empty state com CTA.
// =============================================

interface OverviewResponse {
  window: { days: number; since: string }
  counts: {
    totalAgents: number
    publishedAgents: number
    conversationsWithAI: number
    conversationsAIPaused: number
  }
  current: {
    total: number
    avgDurationMs: number
    tokensIn: number
    tokensOut: number
    tokensTotal: number
    costUsd: number
    revenueBrl: number
    escalated: number
    converted: number
    escalationRate: number
    conversionRate: number
  }
  previous: OverviewResponse['current']
  delta: {
    total: number
    costUsd: number
    revenueBrl: number
    conversionRate: number
  }
  perAgent: Array<{
    agent: { id: string; name: string; role: string; status: string }
    metrics: OverviewResponse['current']
  }>
  recent: Array<{
    agent_id: string
    outcome: string | null
    cost_usd: number | null
    duration_ms: number | null
    started_at: string
  }>
}

const periods: { label: string; days: number }[] = [
  { label: 'Últimos 7 dias', days: 7 },
  { label: 'Últimos 30 dias', days: 30 },
  { label: 'Últimos 90 dias', days: 90 },
]

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatPercent(v: number) {
  return `${(v * 100).toFixed(1)}%`
}

function formatDelta(d: number, kind: 'percent' | 'pp' = 'percent') {
  if (Math.abs(d) < 0.0001) return '—'
  const sign = d > 0 ? '+' : ''
  return kind === 'pp' ? `${sign}${(d * 100).toFixed(1)}pp` : `${sign}${(d * 100).toFixed(1)}%`
}

const ROLE_LABEL: Record<string, string> = {
  pre_sales: 'Pré-venda',
  sales: 'Vendas',
  recovery: 'Recuperação',
  post_sales: 'Pós-venda',
  support: 'Atendimento',
  custom: 'Customizado',
}

export default function AIOverviewPage() {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id || user?.user_metadata?.organization_id
  const [days, setDays] = useState(30)
  const [data, setData] = useState<OverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/overview?days=${days}`)
      const j = await res.json()
      if (!res.ok) {
        setError(j.error || 'Falha ao carregar')
        return
      }
      setData(j as OverviewResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [days, organizationId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Inteligência Artificial</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Visão geral dos seus agentes e do atendimento automatizado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="px-3 py-2 bg-white border border-zinc-200 rounded-md text-sm
                       focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
          >
            {periods.map((p) => (
              <option key={p.days} value={p.days}>
                {p.label}
              </option>
            ))}
          </select>
          <Link
            href="/ai/agents/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm
                       font-medium rounded-md hover:bg-orange-600 transition-colors"
          >
            <Plus size={16} />
            Novo agente
          </Link>
        </div>
      </header>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" strokeWidth={1.75} />
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {!loading && data && data.counts.totalAgents === 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-50 mb-3">
            <Sparkles size={24} weight="regular" className="text-orange-600" />
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 mb-1">
            Crie seu primeiro agente
          </h2>
          <p className="text-sm text-zinc-500 mb-4">
            Em 5 minutos seu agente já estará respondendo no WhatsApp.
          </p>
          <Link
            href="/ai/agents/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm
                       font-medium rounded-md hover:bg-orange-600 transition-colors"
          >
            <Plus size={16} />
            Novo agente
          </Link>
        </div>
      )}

      {!loading && data && data.counts.totalAgents > 0 && (
        <>
          {/* KPI grid 4 col */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={<CurrencyDollar size={18} />}
              label="Receita atribuída"
              value={formatBRL(data.current.revenueBrl)}
              delta={formatDelta(data.delta.revenueBrl)}
              positive={data.delta.revenueBrl >= 0}
              highlight
            />
            <KpiCard
              icon={<ChatCircleDots size={18} />}
              label="Conversas atendidas"
              value={data.current.total.toLocaleString('pt-BR')}
              delta={formatDelta(data.delta.total)}
              positive={data.delta.total >= 0}
            />
            <KpiCard
              icon={<TrendingUp size={18} />}
              label="Taxa de conversão"
              value={formatPercent(data.current.conversionRate)}
              delta={formatDelta(data.delta.conversionRate, 'pp')}
              positive={data.delta.conversionRate >= 0}
            />
            <KpiCard
              icon={<Gauge size={18} />}
              label="Latência média"
              value={`${(data.current.avgDurationMs / 1000).toFixed(1)}s`}
              delta="—"
              positive={true}
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={<CurrencyDollar size={18} />}
              label="Custo total (USD)"
              value={`$${data.current.costUsd.toFixed(2)}`}
              delta={formatDelta(data.delta.costUsd)}
              positive={data.delta.costUsd <= 0}
            />
            <KpiCard
              icon={<Pause size={18} />}
              label="IA pausada"
              value={data.counts.conversationsAIPaused.toLocaleString('pt-BR')}
              delta="—"
              positive={true}
            />
            <KpiCard
              icon={<Sparkles size={18} weight="regular" />}
              label="Agentes publicados"
              value={`${data.counts.publishedAgents} / ${data.counts.totalAgents}`}
              delta="—"
              positive={true}
            />
            <KpiCard
              icon={<ArrowRight size={18} />}
              label="Taxa de escalação"
              value={formatPercent(data.current.escalationRate)}
              delta="—"
              positive={true}
            />
          </div>

          {/* Performance por agente */}
          <section className="bg-white border border-zinc-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-zinc-900 mb-4">
              Performance por agente
            </h2>
            {data.perAgent.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Nenhuma execução registrada nesse período.
              </p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {data.perAgent.map((row) => (
                  <Link
                    key={row.agent.id}
                    href={`/ai/agents/${row.agent.id}`}
                    className="flex items-center gap-4 py-3 hover:bg-zinc-50 -mx-2 px-2 rounded-md transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-zinc-900 truncate">
                        {row.agent.name}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {ROLE_LABEL[row.agent.role] || row.agent.role}
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-6 text-xs text-zinc-600">
                      <span>
                        <span className="text-zinc-900 font-medium">{row.metrics.total}</span>{' '}
                        execuções
                      </span>
                      <span>
                        <span className="text-zinc-900 font-medium">
                          {formatPercent(row.metrics.conversionRate)}
                        </span>{' '}
                        conv.
                      </span>
                      <span>
                        <span className="text-zinc-900 font-medium">
                          ${row.metrics.costUsd.toFixed(2)}
                        </span>{' '}
                        custo
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Atividade recente */}
          <section className="bg-white border border-zinc-200 rounded-xl p-6">
            <h2 className="text-base font-semibold text-zinc-900 mb-4">
              Atividade recente
            </h2>
            {data.recent.length === 0 ? (
              <p className="text-sm text-zinc-500">Sem atividade no período.</p>
            ) : (
              <ul className="space-y-2">
                {data.recent.map((r, i) => (
                  <li
                    key={`${r.agent_id}-${i}`}
                    className="flex items-center gap-3 text-xs text-zinc-700"
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        r.outcome === 'converted'
                          ? 'bg-emerald-500'
                          : r.outcome === 'escalated'
                          ? 'bg-amber-500'
                          : r.outcome === 'error'
                          ? 'bg-red-500'
                          : 'bg-zinc-300'
                      }`}
                    />
                    <span className="flex-1 truncate">
                      {r.outcome ?? 'Execução'} ·{' '}
                      <span className="text-zinc-500">
                        {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s · ` : ''}
                        {r.cost_usd ? `$${Number(r.cost_usd).toFixed(4)}` : ''}
                      </span>
                    </span>
                    <span className="text-zinc-400">
                      {new Date(r.started_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
  delta,
  positive,
  highlight = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  delta: string
  positive: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={`border rounded-xl p-4 ${
        highlight ? 'bg-orange-50 border-orange-200' : 'bg-white border-zinc-200'
      }`}
    >
      <div
        className={`flex items-center gap-2 mb-2 ${
          highlight ? 'text-orange-700' : 'text-zinc-500'
        }`}
      >
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p
        className={`text-xl font-semibold ${
          highlight ? 'text-orange-700' : 'text-zinc-900'
        }`}
      >
        {value}
      </p>
      {delta !== '—' && (
        <span
          className={`text-xs ${
            positive ? 'text-emerald-600' : 'text-red-600'
          }`}
        >
          {delta}
        </span>
      )}
    </div>
  )
}
