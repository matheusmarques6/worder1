'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BarChart3,
  Sparkles,
  ThumbsUp,
  MessageSquare,
  TrendingUp,
  Check,
  X,
  Wand2,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'
import { Button, Card, Gauge, RatingBar, DiffViewer } from '@/components/agents/ui/primitives'
import type { DiffLine } from '@/components/agents/ui/primitives'
import AgentSelect from '@/components/agents/ui/AgentSelect'

/**
 * Relatórios (reports hub) — gauge (score de qualidade), satisfação ESTIMADA
 * pela IA (estrelas + histograma) e sugestões de melhoria de prompt
 * (propose-card + diff). Wired a dados reais via GET/POST
 * /api/ai/agents/[id]/reports + /proposals/* (Bloco F5).
 *
 * Nota de produto: NÃO há captura real de CSAT. A "satisfação" é um proxy
 * estimado pela IA (notas do juiz → estrelas). Os tiles refletem isso.
 */

type Period = '7d' | '30d' | '90d'
const PERIODS: { id: Period; label: string }[] = [
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
]

interface Summary {
  quality: number
  csat: number
  conversations: number
  resolutionRate: number
}

interface DistributionBar {
  stars: number
  pct: number
}

interface Proposal {
  id: string
  title: string
  reason: string
  impact: string
  diff: DiffLine[]
}

interface ReportPayload {
  summary: Summary
  distribution: DistributionBar[]
  proposals: Proposal[]
}

// Cores do histograma de estrelas (5★ → 1★), na ordem retornada pela API.
const STAR_COLORS: Record<number, string> = {
  5: 'var(--green)',
  4: '#7CB342',
  3: 'var(--amber)',
  2: '#F2884B',
  1: 'var(--red)',
}

interface ReportsViewProps {
  organizationId: string
}

export default function ReportsView({ organizationId }: ReportsViewProps) {
  const [agentId, setAgentId] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('30d')

  const [data, setData] = useState<ReportPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  const fetchReport = useCallback(async () => {
    if (!agentId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/reports?period=${period}`)
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || 'Erro ao carregar relatório')
      }
      const payload: ReportPayload = await res.json()
      setData(payload)
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar relatório')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [agentId, period])

  useEffect(() => {
    if (agentId) fetchReport()
    else {
      setData(null)
      setError(null)
    }
  }, [agentId, period, fetchReport])

  const generate = async () => {
    if (!agentId || generating) return
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/proposals/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || 'Erro ao gerar sugestões')
      }
      const payload: { proposals: Proposal[] } = await res.json()
      setData((prev) => (prev ? { ...prev, proposals: payload.proposals } : prev))
    } catch (e: any) {
      setError(e.message || 'Erro ao gerar sugestões')
    } finally {
      setGenerating(false)
    }
  }

  const act = async (proposalId: string, action: 'apply' | 'dismiss') => {
    if (!agentId || acting) return
    setActing(proposalId)
    // Remoção otimista
    setData((prev) =>
      prev ? { ...prev, proposals: prev.proposals.filter((p) => p.id !== proposalId) } : prev
    )
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/proposals/${proposalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || 'Erro ao processar a sugestão')
      }
      const payload: { proposals: Proposal[] } = await res.json()
      // Aplicar muda o prompt → recarrega os agregados também.
      if (action === 'apply') await fetchReport()
      else setData((prev) => (prev ? { ...prev, proposals: payload.proposals } : prev))
    } catch (e: any) {
      setError(e.message || 'Erro ao processar a sugestão')
      // Reverte a remoção otimista recarregando.
      await fetchReport()
    } finally {
      setActing(null)
    }
  }

  const s = data?.summary
  const distribution = data?.distribution ?? []
  const proposals = data?.proposals ?? []

  return (
    <AgentsTheme className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
      <div className="page">
        <div className="page-inner">
          {/* header */}
          <div className="ph">
            <div className="ph-ico">
              <BarChart3 />
            </div>
            <div style={{ flex: 1 }}>
              <h1>Relatórios</h1>
              <p>Qualidade, satisfação e oportunidades de melhoria dos seus agentes</p>
            </div>
            <AgentSelect organizationId={organizationId} value={agentId} onChange={setAgentId} />
            <div className="rep-period">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={period === p.id ? 'on' : ''}
                  onClick={() => setPeriod(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* states: no-agent / loading / error */}
          {!agentId ? (
            <Card style={{ padding: 16 }}>
              <div className="empty-wrap" style={{ padding: '48px 20px' }}>
                <div className="empty-ico">
                  <BarChart3 />
                </div>
                <h2>Selecione um agente</h2>
                <p>Escolha um agente para ver qualidade, satisfação estimada e sugestões.</p>
              </div>
            </Card>
          ) : loading ? (
            <Card style={{ padding: 16 }}>
              <div className="empty-wrap" style={{ padding: '48px 20px' }}>
                <div className="empty-ico">
                  <Loader2 className="animate-spin" />
                </div>
                <h2>Carregando relatório…</h2>
              </div>
            </Card>
          ) : error ? (
            <Card style={{ padding: 16 }}>
              <div className="empty-wrap" style={{ padding: '48px 20px' }}>
                <div className="empty-ico" style={{ color: 'var(--red)' }}>
                  <AlertTriangle />
                </div>
                <h2>Não foi possível carregar</h2>
                <p>{error}</p>
                <Button variant="ghost" onClick={fetchReport} style={{ marginTop: 12 }}>
                  Tentar de novo
                </Button>
              </div>
            </Card>
          ) : s ? (
            <>
              {/* top row: quality gauge + satisfação estimada tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                {/* quality */}
                <Card style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 18 }}>
                  <Gauge value={s.quality} label="qualidade" />
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>Score de qualidade</div>
                    <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '4px 0 0', lineHeight: 1.5 }}>
                      Média ponderada de aderência ao escopo, tom e precisão das respostas no período.
                    </p>
                  </div>
                </Card>

                {/* satisfação estimada (IA) */}
                <Card style={{ padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="stat-ico" style={{ background: 'var(--amber-tint)', color: 'var(--amber)' }}>
                      <ThumbsUp style={{ width: 16, height: 16 }} />
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>
                      Satisfação estimada (IA)
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '12px 0 2px' }}>
                    <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text)' }}>
                      {s.csat.toFixed(1)}
                    </span>
                    <RatingBar value={s.csat} />
                  </div>
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '0 0 8px', lineHeight: 1.4 }}>
                    Estimativa do modelo a partir das notas de avaliação — não é um CSAT coletado do cliente.
                  </p>
                  {/* distribution bars (histograma de estrelas estimadas) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {distribution.map((d) => (
                      <div key={d.stars} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', width: 22 }}>
                          {d.stars}★
                        </span>
                        <div className="rbar">
                          <div style={{ width: `${d.pct}%`, background: STAR_COLORS[d.stars] || 'var(--text-3)' }} />
                        </div>
                        <span style={{ fontSize: 11.5, color: 'var(--text-3)', width: 32, textAlign: 'right' }}>
                          {d.pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* volume tiles */}
              <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 24 }}>
                <Tile icon={<MessageSquare />} tone="blue" label="Conversas" value={s.conversations.toLocaleString('pt-BR')} />
                <Tile icon={<TrendingUp />} tone="green" label="Taxa de resolução" value={`${s.resolutionRate}%`} />
                <Tile icon={<ThumbsUp />} tone="amber" label="Satisfação estimada" value={s.csat.toFixed(1)} />
              </div>

              {/* prompt-improvement proposals */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Sparkles style={{ width: 17, height: 17, color: 'var(--brand)' }} />
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Sugestões de melhoria</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generate}
                  disabled={generating}
                  style={{ marginLeft: 'auto' }}
                >
                  {generating ? <Loader2 className="animate-spin" /> : <Wand2 />}
                  {generating ? 'Gerando…' : 'Gerar sugestões'}
                </Button>
              </div>

              {proposals.length === 0 ? (
                <Card>
                  <div className="empty-wrap" style={{ padding: '40px 20px' }}>
                    <div className="empty-ico">
                      <Sparkles />
                    </div>
                    <h2>Sem sugestões no período</h2>
                    <p>Clique em “Gerar sugestões” para a IA propor melhorias a partir das conversas.</p>
                  </div>
                </Card>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {proposals.map((p) => (
                    <div key={p.id} className="propose-card">
                      <div style={{ padding: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <span className="stat-ico" style={{ background: 'var(--brand)', color: '#fff', flex: '0 0 auto' }}>
                            <Wand2 style={{ width: 16, height: 16 }} />
                          </span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)' }}>{p.title}</div>
                            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3 }}>{p.reason}</div>
                          </div>
                          {p.impact && <span className="chip chip-green">{p.impact}</span>}
                        </div>

                        <div style={{ margin: '14px 0' }}>
                          <DiffViewer lines={p.diff} />
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => act(p.id, 'apply')}
                            disabled={acting === p.id}
                          >
                            {acting === p.id ? <Loader2 className="animate-spin" /> : <Check />}
                            Aplicar sugestão
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => act(p.id, 'dismiss')}
                            disabled={acting === p.id}
                          >
                            <X />
                            Dispensar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </AgentsTheme>
  )
}

/* ---------------- Tile ---------------- */
const TILE_TONE: Record<string, { bg: string; fg: string }> = {
  brand: { bg: 'var(--brand-tint)', fg: 'var(--brand)' },
  green: { bg: 'var(--green-tint)', fg: 'var(--green)' },
  blue: { bg: 'var(--blue-tint)', fg: 'var(--blue)' },
  amber: { bg: 'var(--amber-tint)', fg: 'var(--amber)' },
}

function Tile({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode
  tone: keyof typeof TILE_TONE
  label: string
  value: string
}) {
  const c = TILE_TONE[tone]
  return (
    <div className="stat">
      <div className="stat-top">
        <span className="stat-ico" style={{ background: c.bg, color: c.fg }}>
          {icon}
        </span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-val">{value}</div>
    </div>
  )
}
