'use client'

import { useState } from 'react'
import {
  BarChart3,
  Sparkles,
  ThumbsUp,
  MessageSquare,
  TrendingUp,
  Check,
  X,
  Wand2,
} from 'lucide-react'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'
import { Button, Card, Gauge, RatingBar, DiffViewer } from '@/components/agents/ui/primitives'
import type { DiffLine } from '@/components/agents/ui/primitives'

/**
 * Relatórios (reports hub) — mockup `gauge` (quality score), `stars` CSAT,
 * `rbar` distribution bars, and `propose-card` + `diff` prompt-improvement
 * suggestions. Self-wraps in <AgentsTheme> (like AgentsDashboardView).
 *
 * VISUAL ONLY — every dataset below is in-file mock; Bloco F wires real data.
 */

type Period = '7d' | '30d' | '90d'
const PERIODS: { id: Period; label: string }[] = [
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
]

// MOCK — wired to real data in Bloco F
interface Summary {
  quality: number
  csat: number
  conversations: number
  resolutionRate: number
}
const MOCK_SUMMARY: Record<Period, Summary> = {
  '7d': { quality: 88, csat: 4.6, conversations: 312, resolutionRate: 91 },
  '30d': { quality: 84, csat: 4.4, conversations: 1284, resolutionRate: 88 },
  '90d': { quality: 81, csat: 4.3, conversations: 3960, resolutionRate: 86 },
}

// MOCK — wired to real data in Bloco F. CSAT distribution (5★ → 1★).
const MOCK_DISTRIBUTION: { stars: number; pct: number; color: string }[] = [
  { stars: 5, pct: 62, color: 'var(--green)' },
  { stars: 4, pct: 22, color: '#7CB342' },
  { stars: 3, pct: 9, color: 'var(--amber)' },
  { stars: 2, pct: 4, color: '#F2884B' },
  { stars: 1, pct: 3, color: 'var(--red)' },
]

interface Proposal {
  id: string
  title: string
  reason: string
  impact: string
  diff: DiffLine[]
}

// MOCK — wired to real data in Bloco F
const MOCK_PROPOSALS: Proposal[] = [
  {
    id: 'p1',
    title: 'Acolher antes de resolver em casos sensíveis',
    reason: 'Detectado em 7 conversas de reembolso com CSAT baixo.',
    impact: '+0.3 CSAT estimado',
    diff: [
      { type: 'ctx', text: 'Você é um atendente de suporte da loja.' },
      { type: 'rem', text: 'Responda de forma direta e objetiva.' },
      { type: 'add', text: 'Em pedidos de reembolso ou reclamações, reconheça a frustração do cliente antes de explicar a política.' },
    ],
  },
  {
    id: 'p2',
    title: 'Sempre citar a fonte ao informar preços',
    reason: '2 respostas informaram valores sem referência à base.',
    impact: 'Reduz alucinação de preço',
    diff: [
      { type: 'ctx', text: 'Ao informar valores de planos:' },
      { type: 'add', text: 'Use exclusivamente os preços da base de conhecimento e nunca estime valores.' },
    ],
  },
]

export default function ReportsView() {
  const [period, setPeriod] = useState<Period>('30d')
  const s = MOCK_SUMMARY[period]

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

          {/* top row: quality gauge + CSAT + volume tiles */}
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

            {/* CSAT */}
            <Card style={{ padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="stat-ico" style={{ background: 'var(--amber-tint)', color: 'var(--amber)' }}>
                  <ThumbsUp style={{ width: 16, height: 16 }} />
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>Satisfação (CSAT)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '12px 0 8px' }}>
                <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--text)' }}>
                  {s.csat.toFixed(1)}
                </span>
                <RatingBar value={s.csat} />
              </div>
              {/* distribution bars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {MOCK_DISTRIBUTION.map((d) => (
                  <div key={d.stars} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)', width: 22 }}>
                      {d.stars}★
                    </span>
                    <div className="rbar">
                      <div style={{ width: `${d.pct}%`, background: d.color }} />
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
            <Tile icon={<ThumbsUp />} tone="amber" label="CSAT médio" value={s.csat.toFixed(1)} />
          </div>

          {/* prompt-improvement proposals */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Sparkles style={{ width: 17, height: 17, color: 'var(--brand)' }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Sugestões de melhoria</span>
          </div>

          {MOCK_PROPOSALS.length === 0 ? (
            <Card>
              <div className="empty-wrap" style={{ padding: '40px 20px' }}>
                <div className="empty-ico">
                  <Sparkles />
                </div>
                <h2>Sem sugestões no período</h2>
                <p>Quando detectarmos padrões de melhoria nas conversas, eles aparecerão aqui.</p>
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {MOCK_PROPOSALS.map((p) => (
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
                      <span className="chip chip-green">{p.impact}</span>
                    </div>

                    <div style={{ margin: '14px 0' }}>
                      <DiffViewer lines={p.diff} />
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                      <Button variant="primary" size="sm">
                        <Check />
                        Aplicar sugestão
                      </Button>
                      <Button variant="ghost" size="sm">
                        <X />
                        Dispensar
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
