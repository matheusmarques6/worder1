'use client'

import { useState } from 'react'
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
} from 'lucide-react'
import { AgentsTheme } from '@/components/agents/ui/AgentsTheme'
import { Button, Card, ScorePill } from '@/components/agents/ui/primitives'
import TestRunView from '@/components/agents/testrun/TestRunView'

/**
 * Avaliação (eval) screen — mockup `vrow` version selector, `crit` criteria
 * rows, `kappa` judge×human agreement, and a filterable `case-card` list.
 * Self-wraps in <AgentsTheme> (like AgentsDashboardView). The Test-run screen
 * is reachable from here via the "Rodar test-run" button (renders in place).
 *
 * VISUAL ONLY — every dataset below is in-file mock; Bloco F wires real data.
 */

// MOCK — wired to real data in Bloco F
interface Version {
  id: string
  tag: string
  label: string
  score: number
  date: string
  current?: boolean
}

const MOCK_VERSIONS: Version[] = [
  { id: 'v3', tag: 'v3', label: 'Rascunho atual', score: 84, date: 'hoje', current: true },
  { id: 'v2', tag: 'v2', label: 'Tom mais empático', score: 81, date: '12 mai' },
  { id: 'v1', tag: 'v1', label: 'Versão inicial', score: 73, date: '02 mai' },
]

interface Criterion {
  id: string
  label: string
  pass: boolean
  detail: string
}

// MOCK — wired to real data in Bloco F
const MOCK_CRITERIA: Criterion[] = [
  { id: 'c1', label: 'Responde no escopo', pass: true, detail: 'Não opina fora do domínio do agente.' },
  { id: 'c2', label: 'Tom empático', pass: true, detail: 'Acolhe antes de resolver em casos sensíveis.' },
  { id: 'c3', label: 'Cita fonte (RAG)', pass: false, detail: '2 de 18 respostas sem fonte verificável.' },
  { id: 'c4', label: 'Não inventa preços', pass: true, detail: 'Valores sempre conferem com a base.' },
  { id: 'c5', label: 'Encaminha quando deve', pass: false, detail: 'Falhou em 1 caso limite (saúde).' },
]

interface KappaRow {
  id: string
  label: string
  value: number
}

// MOCK — wired to real data in Bloco F. Cohen's kappa: judge (LLM) × human.
const MOCK_KAPPA: KappaRow[] = [
  { id: 'k1', label: 'Concordância geral', value: 0.82 },
  { id: 'k2', label: 'Casos de reembolso', value: 0.74 },
  { id: 'k3', label: 'Casos limite', value: 0.61 },
]

type CaseVerdict = 'pass' | 'fail'
interface EvalCase {
  id: string
  title: string
  input: string
  verdict: CaseVerdict
  score: number
  tags: string[]
}

// MOCK — wired to real data in Bloco F
const MOCK_CASES: EvalCase[] = [
  { id: 'e1', title: 'Preço do plano anual', input: 'Quanto custa o plano anual?', verdict: 'pass', score: 96, tags: ['preço'] },
  { id: 'e2', title: 'Reembolso fora do prazo', input: 'Quero reembolso de 30 dias atrás', verdict: 'fail', score: 48, tags: ['reembolso', 'política'] },
  { id: 'e3', title: 'Pergunta médica', input: 'Posso tomar com remédio?', verdict: 'fail', score: 38, tags: ['fora-de-escopo'] },
  { id: 'e4', title: 'Disponibilidade de estoque', input: 'Tem o tamanho M?', verdict: 'pass', score: 88, tags: ['estoque'] },
  { id: 'e5', title: 'Falar com humano', input: 'Quero falar com atendente', verdict: 'pass', score: 92, tags: ['handoff'] },
]

const ALL_TAGS = Array.from(new Set(MOCK_CASES.flatMap((c) => c.tags)))

function kappaTone(v: number): 'green' | 'amber' | 'red' {
  return v >= 0.8 ? 'green' : v >= 0.6 ? 'amber' : 'red'
}

export default function EvalView() {
  const [selectedVersion, setSelectedVersion] = useState<string>('v3')
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [showTestRun, setShowTestRun] = useState(false)

  const toggleTag = (tag: string) =>
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))

  const filteredCases =
    activeTags.length === 0
      ? MOCK_CASES
      : MOCK_CASES.filter((c) => activeTags.some((t) => c.tags.includes(t)))

  const current = MOCK_VERSIONS.find((v) => v.id === selectedVersion)

  if (showTestRun) {
    return (
      <AgentsTheme className="h-full flex flex-col" style={{ background: 'var(--bg)' }}>
        <TestRunView versionLabel={`${current?.tag} · ${current?.label}`} onBack={() => setShowTestRun(false)} />
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
            <Button variant="primary" onClick={() => setShowTestRun(true)}>
              <Play />
              Rodar test-run
            </Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
            {/* left: version selector */}
            <Card style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <GitCompare style={{ width: 16, height: 16, color: 'var(--brand)' }} />
                <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>Versões</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {MOCK_VERSIONS.map((v) => {
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
                      <ScorePill tone={v.score >= 85 ? 'green' : v.score >= 60 ? 'amber' : 'red'}>
                        {v.score}
                      </ScorePill>
                    </button>
                  )
                })}
              </div>
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
                {MOCK_CRITERIA.map((c) => (
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
                ))}
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
                {MOCK_KAPPA.map((k) => {
                  const tone = kappaTone(k.value)
                  const c =
                    tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : 'var(--red)'
                  return (
                    <div key={k.id} className="kappa-row">
                      <span style={{ flex: '0 0 200px', fontSize: 12.5, color: 'var(--text-2)' }}>{k.label}</span>
                      <div className="rbar">
                        <div style={{ width: `${k.value * 100}%`, background: c }} />
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, fontWeight: 700, color: c, minWidth: 36, textAlign: 'right' }}>
                        {k.value.toFixed(2)}
                      </span>
                    </div>
                  )
                })}
              </Card>

              {/* cases */}
              <Card style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Filter style={{ width: 16, height: 16, color: 'var(--brand)' }} />
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>
                    Casos de avaliação
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
                    {filteredCases.length} de {MOCK_CASES.length}
                  </span>
                </div>

                {/* tag filters */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  {ALL_TAGS.map((tag) => (
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

                {filteredCases.length === 0 ? (
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
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                          {c.tags.map((t) => (
                            <span key={t} className="vtag">{t}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      </div>
    </AgentsTheme>
  )
}
