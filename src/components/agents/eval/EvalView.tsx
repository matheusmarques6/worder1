'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  ClipboardCheck,
  Play,
  Check,
  X,
  AlertTriangle,
  GitCompare,
  Scale,
  ListChecks,
  Filter,
  Loader2,
  Gauge,
} from 'lucide-react'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'
import { Button, Card, ScorePill } from '@/components/agents/ui/primitives'
import AgentSelect from '@/components/agents/ui/AgentSelect'
import TestRunView from '@/components/agents/testrun/TestRunView'

/**
 * Avaliação (eval) screen — version selector, criteria rows, judge×human
 * agreement (Cohen's kappa), and a filterable case list. Wired to real data
 * via GET/POST /api/ai/agents/[id]/evals (Bloco F4). Test-run is reachable via
 * the "Rodar test-run" button (renders in place).
 */

interface Version {
  id: string
  tag: string
  label: string
  score: number | null
  date: string
  current?: boolean
}

interface Criterion {
  id: string
  label: string
  pass: boolean
  detail: string
}

interface KappaRow {
  id: string
  label: string
  value?: number
  insufficient?: boolean
}

type CaseVerdict = 'pass' | 'fail'
interface EvalCase {
  id: string
  title: string
  input: string
  verdict: CaseVerdict
  score: number
  tags: string[]
}

interface EvalPayload {
  versions: Version[]
  criteria: Criterion[]
  kappa: KappaRow[]
  cases: EvalCase[]
}

function kappaTone(v: number): 'green' | 'amber' | 'red' {
  return v >= 0.8 ? 'green' : v >= 0.6 ? 'amber' : 'red'
}

interface EvalViewProps {
  organizationId: string
}

export default function EvalView({ organizationId }: EvalViewProps) {
  const [agentId, setAgentId] = useState<string | null>(null)
  const [showTestRun, setShowTestRun] = useState(false)

  const [data, setData] = useState<EvalPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedVersion, setSelectedVersion] = useState<string | null>(null)
  const [activeTags, setActiveTags] = useState<string[]>([])

  const fetchEval = useCallback(async () => {
    if (!agentId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/evals`)
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || 'Erro ao carregar avaliação')
      }
      const payload: EvalPayload = await res.json()
      setData(payload)
      setSelectedVersion(payload.versions.find((v) => v.current)?.id ?? payload.versions[0]?.id ?? null)
      setActiveTags([])
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar avaliação')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    if (agentId) fetchEval()
    else {
      setData(null)
      setError(null)
    }
  }, [agentId, fetchEval])

  const runEvaluation = async () => {
    if (!agentId || running) return
    setRunning(true)
    setError(null)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/evals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || 'Erro ao rodar avaliação')
      }
      const payload: EvalPayload = await res.json()
      setData(payload)
      setSelectedVersion(payload.versions.find((v) => v.current)?.id ?? payload.versions[0]?.id ?? null)
      setActiveTags([])
    } catch (e: any) {
      setError(e.message || 'Erro ao rodar avaliação')
    } finally {
      setRunning(false)
    }
  }

  const toggleTag = (tag: string) =>
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))

  const versions = data?.versions ?? []
  const criteria = data?.criteria ?? []
  const kappa = data?.kappa ?? []
  const cases = data?.cases ?? []

  const allTags = Array.from(new Set(cases.flatMap((c) => c.tags)))
  const filteredCases =
    activeTags.length === 0 ? cases : cases.filter((c) => activeTags.some((t) => c.tags.includes(t)))

  const current = versions.find((v) => v.id === selectedVersion)
  const hasResults = cases.length > 0 || criteria.length > 0

  if (showTestRun && agentId) {
    return (
      <AgentsTheme className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
        <TestRunView
          agentId={agentId}
          organizationId={organizationId}
          onBack={() => setShowTestRun(false)}
        />
      </AgentsTheme>
    )
  }

  return (
    <AgentsTheme className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
      <div className="page">
        <div className="page-inner">
          {/* header */}
          <div className="ph">
            <div className="ph-ico">
              <ClipboardCheck />
            </div>
            <div style={{ flex: 1 }}>
              <h1>Avaliação</h1>
              <p>Compare versões, audite critérios e rode test-runs antes de publicar</p>
            </div>
            <AgentSelect organizationId={organizationId} value={agentId} onChange={setAgentId} />
            <Button variant="ghost" onClick={runEvaluation} disabled={!agentId || running || loading}>
              {running ? <Loader2 className="animate-spin" /> : <Gauge />}
              {running ? 'Avaliando…' : 'Rodar avaliação'}
            </Button>
            <Button variant="primary" onClick={() => setShowTestRun(true)} disabled={!agentId}>
              <Play />
              Rodar test-run
            </Button>
          </div>

          {/* no agent selected */}
          {!agentId ? (
            <Card style={{ padding: 16 }}>
              <div className="empty-wrap" style={{ padding: '48px 20px' }}>
                <div className="empty-ico">
                  <ClipboardCheck />
                </div>
                <h2>Selecione um agente</h2>
                <p>Escolha um agente para ver critérios, concordância e casos de avaliação.</p>
              </div>
            </Card>
          ) : loading ? (
            <Card style={{ padding: 16 }}>
              <div className="empty-wrap" style={{ padding: '48px 20px' }}>
                <div className="empty-ico">
                  <Loader2 className="animate-spin" />
                </div>
                <h2>Carregando avaliação…</h2>
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
                <Button variant="ghost" onClick={fetchEval} style={{ marginTop: 12 }}>
                  Tentar de novo
                </Button>
              </div>
            </Card>
          ) : !hasResults ? (
            <Card style={{ padding: 16 }}>
              <div className="empty-wrap" style={{ padding: '48px 20px' }}>
                <div className="empty-ico">
                  <Gauge />
                </div>
                <h2>Nenhuma avaliação ainda</h2>
                <p>Rode a avaliação para gerar critérios, casos e a concordância juiz × humano.</p>
                <Button variant="primary" onClick={runEvaluation} disabled={running} style={{ marginTop: 12 }}>
                  {running ? <Loader2 className="animate-spin" /> : <Gauge />}
                  {running ? 'Avaliando…' : 'Rodar avaliação'}
                </Button>
              </div>
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
              {/* left: version selector */}
              <Card style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <GitCompare style={{ width: 16, height: 16, color: 'var(--brand)' }} />
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>Versões</span>
                </div>
                {versions.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Sem versões publicadas ainda.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {versions.map((v) => {
                      const sel = selectedVersion === v.id
                      return (
                        <button
                          key={v.id}
                          type="button"
                          className={`vrow${v.current ? ' cur' : ''}${sel ? ' sel' : ''}`}
                          onClick={() => setSelectedVersion(v.id)}
                        >
                          <span className="vtag">{v.tag}</span>
                          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{v.label}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>{v.date}</div>
                          </div>
                          {v.score === null ? (
                            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>—</span>
                          ) : (
                            <ScorePill tone={v.score >= 85 ? 'green' : v.score >= 60 ? 'amber' : 'red'}>
                              {v.score}
                            </ScorePill>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </Card>

              {/* right column */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* criteria */}
                <Card style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <ListChecks style={{ width: 16, height: 16, color: 'var(--brand)' }} />
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>Critérios</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
                      {current?.tag}
                    </span>
                  </div>
                  {criteria.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Sem critérios ainda.</p>
                  ) : (
                    criteria.map((c) => (
                      <div key={c.id} className="crit">
                        <span
                          className="crit-ico"
                          style={
                            c.pass
                              ? { background: 'var(--green-tint)', color: 'var(--green)' }
                              : { background: 'var(--red-tint)', color: 'var(--red)' }
                          }
                        >
                          {c.pass ? <Check /> : <X />}
                        </span>
                        <div>
                          <span style={{ fontWeight: 700, color: 'var(--text)' }}>{c.label}</span>
                          <div style={{ color: 'var(--text-3)', marginTop: 1 }}>{c.detail}</div>
                        </div>
                      </div>
                    ))
                  )}
                </Card>

                {/* kappa */}
                <Card style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Scale style={{ width: 16, height: 16, color: 'var(--brand)' }} />
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>
                      Concordância juiz × humano
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 6px' }}>
                    Cohen&apos;s kappa entre o juiz LLM e a revisão humana.
                  </p>
                  {kappa.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Sem dados de concordância ainda.</p>
                  ) : (
                    kappa.map((k) => {
                      const insufficient = k.insufficient || typeof k.value !== 'number'
                      const value = k.value ?? 0
                      const tone = kappaTone(value)
                      const c =
                        tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : 'var(--red)'
                      return (
                        <div key={k.id} className="kappa-row">
                          <span style={{ flex: '0 0 200px', fontSize: 12.5, color: 'var(--text-2)' }}>{k.label}</span>
                          {insufficient ? (
                            <>
                              <div className="rbar">
                                <div style={{ width: '0%', background: 'var(--text-3)' }} />
                              </div>
                              <span style={{ fontSize: 11.5, color: 'var(--text-3)', minWidth: 36, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                dados insuficientes
                              </span>
                            </>
                          ) : (
                            <>
                              <div className="rbar">
                                <div style={{ width: `${value * 100}%`, background: c }} />
                              </div>
                              <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 700, color: c, minWidth: 36, textAlign: 'right' }}>
                                {value.toFixed(2)}
                              </span>
                            </>
                          )}
                        </div>
                      )
                    })
                  )}
                </Card>

                {/* cases */}
                <Card style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Filter style={{ width: 16, height: 16, color: 'var(--brand)' }} />
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>
                      Casos de avaliação
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
                      {filteredCases.length} de {cases.length}
                    </span>
                  </div>

                  {/* tag filters */}
                  {allTags.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                      {allTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className={`fail-tag${activeTags.includes(tag) ? ' on' : ''}`}
                          onClick={() => toggleTag(tag)}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}

                  {cases.length === 0 ? (
                    <div className="empty-wrap" style={{ padding: '40px 20px' }}>
                      <div className="empty-ico">
                        <ClipboardCheck />
                      </div>
                      <h2>Nenhum caso avaliado ainda</h2>
                      <p>Rode a avaliação para gerar casos a partir de anotações e cenários.</p>
                    </div>
                  ) : filteredCases.length === 0 ? (
                    <div className="empty-wrap" style={{ padding: '40px 20px' }}>
                      <div className="empty-ico">
                        <ClipboardCheck />
                      </div>
                      <h2>Nenhum caso com esses filtros</h2>
                      <p>Remova um filtro para ver mais casos de avaliação.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {filteredCases.map((c) => (
                        <div key={c.id} className="case-card">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span
                              className="crit-ico"
                              style={
                                c.verdict === 'pass'
                                  ? { background: 'var(--green-tint)', color: 'var(--green)' }
                                  : { background: 'var(--red-tint)', color: 'var(--red)' }
                              }
                            >
                              {c.verdict === 'pass' ? <Check /> : <AlertTriangle />}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{c.title}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                “{c.input}”
                              </div>
                            </div>
                            <ScorePill tone={c.verdict === 'pass' ? 'green' : 'red'}>{c.score}</ScorePill>
                          </div>
                          {c.tags.length > 0 && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                              {c.tags.map((t) => (
                                <span key={t} className="vtag">{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </AgentsTheme>
  )
}
