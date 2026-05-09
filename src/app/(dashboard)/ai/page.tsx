'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  MessageCircle,
  Pause,
  ArrowRight,
  Gauge,
  Plus,
  Sparkles,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import {
  Page,
  Card,
  Button,
  EmptyState,
  Spinner,
  Select,
  Num,
  SectionHeader,
} from '@/components/ai/ui/primitives'

// =============================================
// /ai — Visão geral do módulo IA. Agrega ai_executions +
// whatsapp_conversations da janela escolhida e mostra KPIs + ranking
// por agente + últimas atividades.
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
  if (Math.abs(d) < 0.0001) return null
  const sign = d > 0 ? '+' : ''
  const value =
    kind === 'pp' ? `${sign}${(d * 100).toFixed(1)}pp` : `${sign}${(d * 100).toFixed(1)}%`
  return { value, positive: d >= 0 }
}

const ROLE_LABEL: Record<string, string> = {
  pre_sales: 'Pré-venda',
  sales: 'Vendas',
  recovery: 'Recuperação',
  post_sales: 'Pós-venda',
  support: 'Atendimento',
  custom: 'Customizado',
}

const OUTCOME_DOT: Record<string, string> = {
  converted: 'bg-[#16A34A]',
  escalated: 'bg-[#F97316]',
  error: 'bg-[#DC2626]',
}

const OUTCOME_LABEL: Record<string, string> = {
  converted: 'Convertido',
  escalated: 'Escalado',
  error: 'Erro',
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
    <Page
      title="Inteligência Artificial"
      description="Visão geral dos seus agentes e do atendimento automatizado."
      actions={
        <>
          <Select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}>
            {periods.map((p) => (
              <option key={p.days} value={p.days}>
                {p.label}
              </option>
            ))}
          </Select>
          <Link href="/ai/agents/new">
            <Button
              variant="cta"
              leadingIcon={<Plus className="w-3.5 h-3.5" strokeWidth={1.75} />}
            >
              Novo agente
            </Button>
          </Link>
        </>
      }
    >
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      )}

      {error && !loading && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <p className="text-[13px] text-red-700">{error}</p>
        </Card>
      )}

      {!loading && data && data.counts.totalAgents === 0 && (
        <EmptyState
          title="Crie seu primeiro agente"
          description="Em 5 minutos seu agente já estará respondendo no WhatsApp."
          action={
            <Link href="/ai/agents/new">
              <Button
                variant="cta"
                leadingIcon={<Plus className="w-3.5 h-3.5" strokeWidth={1.75} />}
              >
                Novo agente
              </Button>
            </Link>
          }
        />
      )}

      {!loading && data && data.counts.totalAgents > 0 && (
        <div className="space-y-8">
          {/* KPIs principais */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              icon={<DollarSign className="w-4 h-4" strokeWidth={1.75} />}
              label="Receita atribuída"
              value={formatBRL(data.current.revenueBrl)}
              delta={formatDelta(data.delta.revenueBrl)}
              accent
            />
            <Kpi
              icon={<MessageCircle className="w-4 h-4" strokeWidth={1.75} />}
              label="Conversas atendidas"
              value={data.current.total.toLocaleString('pt-BR')}
              delta={formatDelta(data.delta.total)}
            />
            <Kpi
              icon={<TrendingUp className="w-4 h-4" strokeWidth={1.75} />}
              label="Taxa de conversão"
              value={formatPercent(data.current.conversionRate)}
              delta={formatDelta(data.delta.conversionRate, 'pp')}
            />
            <Kpi
              icon={<Gauge className="w-4 h-4" strokeWidth={1.75} />}
              label="Latência média"
              value={`${(data.current.avgDurationMs / 1000).toFixed(1)}s`}
            />
          </div>

          {/* KPIs secundários */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              icon={<DollarSign className="w-4 h-4" strokeWidth={1.75} />}
              label="Custo total"
              value={`$${data.current.costUsd.toFixed(2)}`}
              delta={(() => {
                const d = formatDelta(data.delta.costUsd)
                return d ? { ...d, positive: !d.positive } : null
              })()}
            />
            <Kpi
              icon={<Pause className="w-4 h-4" strokeWidth={1.75} />}
              label="IA pausada"
              value={data.counts.conversationsAIPaused.toLocaleString('pt-BR')}
            />
            <Kpi
              icon={<Sparkles className="w-4 h-4" strokeWidth={1.75} />}
              label="Agentes publicados"
              value={`${data.counts.publishedAgents} / ${data.counts.totalAgents}`}
            />
            <Kpi
              icon={<ArrowRight className="w-4 h-4" strokeWidth={1.75} />}
              label="Taxa de escalação"
              value={formatPercent(data.current.escalationRate)}
            />
          </div>

          {/* Performance por agente */}
          <section>
            <SectionHeader
              title="Performance por agente"
              description="Ranking pela janela selecionada acima."
            />
            <Card className="!p-0">
              {data.perAgent.length === 0 ? (
                <div className="px-7 py-10 text-center">
                  <p className="text-[13px] text-[#A1A1AA]">
                    Nenhuma execução registrada nesse período.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[#F4F4F5]">
                  {data.perAgent.map((row) => (
                    <li key={row.agent.id}>
                      <Link
                        href={`/ai/agents/${row.agent.id}`}
                        className="flex items-center gap-4 px-7 py-4 hover:bg-[#FAFAFA] transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-semibold text-[#18181B] truncate">
                            {row.agent.name}
                          </div>
                          <div className="text-[12px] text-[#A1A1AA]">
                            {ROLE_LABEL[row.agent.role] || row.agent.role}
                          </div>
                        </div>
                        <dl className="hidden sm:grid grid-cols-3 gap-8 text-[12px]">
                          <Stat label="Execuções" value={<Num>{row.metrics.total}</Num>} />
                          <Stat
                            label="Conversão"
                            value={<Num>{formatPercent(row.metrics.conversionRate)}</Num>}
                          />
                          <Stat
                            label="Custo"
                            value={<Num>${row.metrics.costUsd.toFixed(2)}</Num>}
                          />
                        </dl>
                        <ArrowRight
                          className="w-4 h-4 text-[#A1A1AA] flex-shrink-0"
                          strokeWidth={1.75}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          {/* Atividade recente */}
          <section>
            <SectionHeader
              title="Atividade recente"
              description="Últimas 10 execuções no período."
            />
            <Card className="!p-0">
              {data.recent.length === 0 ? (
                <div className="px-7 py-10 text-center">
                  <p className="text-[13px] text-[#A1A1AA]">Sem atividade no período.</p>
                </div>
              ) : (
                <ul className="divide-y divide-[#F4F4F5]">
                  {data.recent.map((r, i) => (
                    <li
                      key={`${r.agent_id}-${i}`}
                      className="flex items-center gap-3 px-7 py-3 text-[13px]"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          OUTCOME_DOT[r.outcome ?? ''] ?? 'bg-[#D4D4D8]'
                        }`}
                      />
                      <span className="text-[#18181B] font-medium">
                        {OUTCOME_LABEL[r.outcome ?? ''] ?? 'Execução'}
                      </span>
                      <span className="text-[#A1A1AA]">
                        <Num>
                          {r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : ''}
                          {r.cost_usd
                            ? `${r.duration_ms ? ' · ' : ''}$${Number(r.cost_usd).toFixed(4)}`
                            : ''}
                        </Num>
                      </span>
                      <span className="ml-auto text-[12px] text-[#A1A1AA]">
                        <Num>
                          {new Date(r.started_at).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Num>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </div>
      )}
    </Page>
  )
}

function Kpi({
  icon,
  label,
  value,
  delta,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  delta?: { value: string; positive: boolean } | null
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-[14px] border px-5 py-[18px] ${
        accent
          ? 'bg-[#FFF7ED] border-[#FED7AA]'
          : 'bg-white border-[#E4E4E7]'
      }`}
    >
      <div
        className={`flex items-center gap-1.5 mb-1.5 ${
          accent ? 'text-[#C2410C]' : 'text-[#A1A1AA]'
        }`}
      >
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p
        className={`text-[22px] font-bold ${accent ? 'text-[#C2410C]' : 'text-[#18181B]'}`}
        style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
      >
        {value}
      </p>
      {delta && (
        <span
          className={`inline-flex items-center gap-0.5 text-[12px] font-semibold mt-1 ${
            delta.positive ? 'text-[#16A34A]' : 'text-[#DC2626]'
          }`}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {delta.positive ? (
            <TrendingUp className="w-3 h-3" strokeWidth={2} />
          ) : (
            <TrendingDown className="w-3 h-3" strokeWidth={2} />
          )}
          {delta.value}
        </span>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide font-semibold text-[#A1A1AA]">{label}</dt>
      <dd className="text-[13px] font-semibold text-[#18181B] mt-0.5">{value}</dd>
    </div>
  )
}
