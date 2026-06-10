'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  Flag,
  RotateCcw,
  Loader2,
} from 'lucide-react'
import { Button, ScorePill } from '@/components/agents/ui/primitives'
import { buildScenarioSummary, type ScenarioResult } from '@/lib/ai/test-runner'

/**
 * Test-run screen (`scn` scenarios + `run-row` + `bub-flag`). Reachable from the
 * Avaliação view; renders inside the EvalView's <AgentsTheme> wrapper, so it
 * does NOT wrap itself.
 *
 * Bloco F3: wired to real scenario execution via /api/ai/agents/[id]/test-runs.
 */

type ScnStatus = 'pass' | 'flag' | 'grave'

const STATUS_META: Record<ScnStatus, { tone: 'green' | 'amber' | 'red'; icon: typeof CheckCircle2; bg: string; fg: string; cls: string; label: string }> = {
  pass: { tone: 'green', icon: CheckCircle2, bg: 'var(--green-tint)', fg: 'var(--green)', cls: '', label: 'OK' },
  flag: { tone: 'amber', icon: AlertTriangle, bg: 'var(--amber-tint)', fg: 'var(--amber)', cls: 'flag', label: 'Atenção' },
  grave: { tone: 'red', icon: XCircle, bg: 'var(--red-tint)', fg: 'var(--red)', cls: 'grave', label: 'Grave' },
}

interface TestRunViewProps {
  agentId: string
  organizationId: string
  /** version label being tested, e.g. "v3 · rascunho" */
  versionLabel?: string
  onBack: () => void
}

export default function TestRunView({ agentId, organizationId, versionLabel, onBack }: TestRunViewProps) {
  const [scenarios, setScenarios] = useState<ScenarioResult[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  /** null = nenhum run em andamento; 'all' = rodar tudo; <id> = re-executar um cenário */
  const [running, setRunning] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/test-runs`)
      if (!res.ok) throw new Error('Erro ao carregar cenários')
      const data = await res.json()
      setScenarios(data.scenarios || [])
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar cenários')
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    load()
  }, [load])

  const runAll = async () => {
    setRunning('all')
    setError('')
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/test-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('Erro ao executar os cenários')
      await res.json().catch(() => null)
      // Após rodar, recarrega o estado consolidado (cenários + último run).
      await load()
    } catch (err: any) {
      setError(err.message || 'Erro ao executar os cenários')
    } finally {
      setRunning(null)
    }
  }

  const rerun = async (scenarioId: string) => {
    setRunning(scenarioId)
    setError('')
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/test-runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_ids: [scenarioId] }),
      })
      if (!res.ok) throw new Error('Erro ao re-executar o cenário')
      await load()
    } catch (err: any) {
      setError(err.message || 'Erro ao re-executar o cenário')
    } finally {
      setRunning(null)
    }
  }

  const summary = buildScenarioSummary(scenarios)
  const { avg, passed, flagged } = summary
  const executedCount = scenarios.filter((s) => s.status !== null).length
  const busy = running !== null

  return (
    <div className="page">
      <div className="page-inner">
        {/* header */}
        <div className="ph">
          <button className="btn btn-icon btn-soft" onClick={onBack} title="Voltar para Avaliação">
            <ArrowLeft />
          </button>
          <div style={{ flex: 1 }}>
            <h1>Test-run</h1>
            <p>
              {versionLabel ? (
                <>
                  Execução dos cenários contra <span className="vtag">{versionLabel}</span>
                </>
              ) : (
                'Execução dos cenários contra a versão de produção'
              )}
            </p>
          </div>
          <Button variant="primary" onClick={runAll} disabled={busy || loading}>
            {running === 'all' ? <Loader2 className="animate-spin" /> : <Play />}
            Rodar tudo
          </Button>
        </div>

        {error && (
          <div className="callout red" style={{ marginBottom: 16 }}>
            <AlertTriangle />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="empty-wrap" style={{ padding: '60px 20px' }}>
            <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: 'var(--brand)' }} />
            <p style={{ marginTop: 12 }}>Carregando cenários…</p>
          </div>
        ) : scenarios.length === 0 ? (
          <div className="empty-wrap" style={{ padding: '60px 20px' }}>
            <div className="empty-ico">
              <Play />
            </div>
            <h2>Nenhum cenário ainda</h2>
            <p>Clique em &ldquo;Rodar tudo&rdquo; para gerar cenários iniciais e executá-los.</p>
          </div>
        ) : (
          <>
            {/* summary run rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              <div className="run-row">
                <span className="run-ico" style={{ background: 'var(--brand-tint)', color: 'var(--brand)' }}>
                  <Play style={{ width: 17, height: 17 }} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Pontuação média</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
                    {executedCount} de {scenarios.length} cenários executados
                  </div>
                </div>
                <ScorePill tone={avg >= 85 ? 'green' : avg >= 60 ? 'amber' : 'red'}>{avg}</ScorePill>
              </div>
              <div className="run-row">
                <span className="run-ico" style={{ background: 'var(--green-tint)', color: 'var(--green)' }}>
                  <CheckCircle2 style={{ width: 17, height: 17 }} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Aprovados</div>
                </div>
                <ScorePill tone="green">{passed}</ScorePill>
              </div>
              <div className="run-row">
                <span className="run-ico" style={{ background: 'var(--red-tint)', color: 'var(--red)' }}>
                  <Flag style={{ width: 17, height: 17 }} />
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Sinalizados</div>
                </div>
                <ScorePill tone="red">{flagged}</ScorePill>
              </div>
            </div>

            {/* scenarios */}
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: 12 }}>
              Cenários
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {scenarios.map((scn, i) => {
                const meta = scn.status ? STATUS_META[scn.status] : null
                const Icon = meta?.icon ?? Play
                const open = openId === scn.id
                const scnRunning = running === scn.id
                return (
                  <div key={scn.id} className={`scn ${meta?.cls ?? ''}`}>
                    <div
                      className="scn-head"
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenId(open ? null : scn.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setOpenId(open ? null : scn.id)
                        }
                      }}
                    >
                      <span className="scn-num">{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{scn.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
                          Persona: {scn.persona || '—'}
                        </div>
                      </div>
                      {meta ? (
                        <span className="chip" style={{ background: meta.bg, color: meta.fg }}>
                          <Icon />
                          {meta.label}
                        </span>
                      ) : (
                        <span className="chip" style={{ background: 'var(--surface-3)', color: 'var(--text-3)' }}>
                          Não executado
                        </span>
                      )}
                      {scn.status && typeof scn.score === 'number' ? (
                        <ScorePill tone={meta!.tone}>{scn.score}</ScorePill>
                      ) : (
                        <ScorePill tone="neutral">—</ScorePill>
                      )}
                      <button
                        type="button"
                        className="btn btn-icon btn-soft"
                        title="Re-executar este cenário"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation()
                          rerun(scn.id)
                        }}
                      >
                        {scnRunning ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                      </button>
                      <ChevronDown
                        style={{
                          width: 16,
                          height: 16,
                          color: 'var(--text-3)',
                          transition: '.2s',
                          transform: open ? 'rotate(180deg)' : 'none',
                        }}
                      />
                    </div>
                    {open && (
                      <div style={{ padding: '0 15px 15px' }} className="fade-in">
                        {scn.note && (
                          <div
                            className={`callout ${meta?.tone === 'red' ? 'red' : 'amber'}`}
                            style={{ marginBottom: 12 }}
                          >
                            <AlertTriangle />
                            <span>{scn.note}</span>
                          </div>
                        )}
                        {scn.transcript.length === 0 ? (
                          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                            Este cenário ainda não foi executado.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {scn.transcript.map((msg, mi) => (
                              <div
                                key={mi}
                                className={`mini-bub ${msg.role}${msg.flag ? ' bub-flag' : ''}`}
                                style={msg.flag ? { marginTop: 12 } : undefined}
                              >
                                {msg.flag && (
                                  <span className="flag-tag">
                                    <Flag style={{ width: 11, height: 11 }} />
                                    {msg.flag}
                                  </span>
                                )}
                                {msg.text}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
