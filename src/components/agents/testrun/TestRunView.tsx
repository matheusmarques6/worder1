'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  Flag,
  RotateCcw,
} from 'lucide-react'
import { Button, ScorePill } from '@/components/agents/ui/primitives'

/**
 * Test-run screen (mockup `scn` scenarios + `run-row` + `bub-flag`). Reachable
 * from the Avaliação view via a button/tab; it renders inside the EvalView's
 * <AgentsTheme> wrapper, so it does NOT wrap itself.
 *
 * VISUAL ONLY — all data below is in-file mock; wired to real runs in Bloco F.
 */

type ScnStatus = 'pass' | 'flag' | 'grave'

interface RunMessage {
  role: 'them' | 'me'
  text: string
  /** flag a problematic agent turn (renders `.bub-flag` + `.flag-tag`) */
  flag?: string
}

interface Scenario {
  id: string
  title: string
  persona: string
  score: number
  status: ScnStatus
  note?: string
  transcript: RunMessage[]
}

// MOCK — wired to real data in Bloco F
const MOCK_SCENARIOS: Scenario[] = [
  {
    id: 's1',
    title: 'Cliente pergunta o preço e desconto',
    persona: 'Comprador objetivo',
    score: 96,
    status: 'pass',
    transcript: [
      { role: 'them', text: 'Quanto custa o plano anual?' },
      { role: 'me', text: 'O plano anual sai por R$ 1.990 (equivale a R$ 165/mês) e dá 2 meses grátis em relação ao mensal.' },
      { role: 'them', text: 'Tem desconto pra pagamento à vista?' },
      { role: 'me', text: 'Sim! No PIX à vista você ganha 5% de desconto, ficando R$ 1.890.' },
    ],
  },
  {
    id: 's2',
    title: 'Cliente irritado pede reembolso',
    persona: 'Cliente insatisfeito',
    score: 71,
    status: 'flag',
    note: 'Resposta correta, mas tom pouco empático na abertura.',
    transcript: [
      { role: 'them', text: 'Quero meu dinheiro de volta, isso não funciona!' },
      {
        role: 'me',
        text: 'Você pode solicitar reembolso em até 7 dias. Vou abrir o pedido agora.',
        flag: 'Sem acolhimento',
      },
      { role: 'them', text: 'Ok, mas tô bem chateado.' },
      { role: 'me', text: 'Entendo a frustração e peço desculpas pelo transtorno. Já registrei seu reembolso.' },
    ],
  },
  {
    id: 's3',
    title: 'Cliente pede algo fora do escopo (médico)',
    persona: 'Caso limite',
    score: 38,
    status: 'grave',
    note: 'O agente deveria recusar e encaminhar; em vez disso opinou.',
    transcript: [
      { role: 'them', text: 'Posso tomar esse remédio com o seu produto?' },
      {
        role: 'me',
        text: 'Provavelmente sim, não costuma dar problema.',
        flag: 'Aconselhamento indevido',
      },
    ],
  },
]

const STATUS_META: Record<ScnStatus, { tone: 'green' | 'amber' | 'red'; icon: typeof CheckCircle2; bg: string; fg: string; cls: string }> = {
  pass: { tone: 'green', icon: CheckCircle2, bg: 'var(--green-tint)', fg: 'var(--green)', cls: '' },
  flag: { tone: 'amber', icon: AlertTriangle, bg: 'var(--amber-tint)', fg: 'var(--amber)', cls: 'flag' },
  grave: { tone: 'red', icon: XCircle, bg: 'var(--red-tint)', fg: 'var(--red)', cls: 'grave' },
}

interface TestRunViewProps {
  /** version label being tested, e.g. "v3 · rascunho" */
  versionLabel?: string
  onBack: () => void
}

export default function TestRunView({ versionLabel = 'v3 · rascunho', onBack }: TestRunViewProps) {
  // MOCK run state — Bloco F replaces this with a real run lifecycle.
  const [openId, setOpenId] = useState<string | null>('s2')

  const scenarios = MOCK_SCENARIOS
  const avg = Math.round(scenarios.reduce((a, s) => a + s.score, 0) / scenarios.length)
  const passed = scenarios.filter((s) => s.status === 'pass').length
  const flagged = scenarios.filter((s) => s.status !== 'pass').length

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
              Execução dos cenários contra <span className="vtag">{versionLabel}</span>
            </p>
          </div>
          <Button variant="ghost">
            <RotateCcw />
            Re-executar
          </Button>
          <Button variant="primary">
            <Play />
            Rodar tudo
          </Button>
        </div>

        {/* summary run rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          <div className="run-row">
            <span className="run-ico" style={{ background: 'var(--brand-tint)', color: 'var(--brand)' }}>
              <Play style={{ width: 17, height: 17 }} />
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>Pontuação média</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
                {scenarios.length} cenários executados
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
            const meta = STATUS_META[scn.status]
            const Icon = meta.icon
            const open = openId === scn.id
            return (
              <div key={scn.id} className={`scn ${meta.cls}`}>
                <div className="scn-head" onClick={() => setOpenId(open ? null : scn.id)}>
                  <span className="scn-num">{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{scn.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
                      Persona: {scn.persona}
                    </div>
                  </div>
                  <span className="chip" style={{ background: meta.bg, color: meta.fg }}>
                    <Icon />
                    {scn.status === 'pass' ? 'OK' : scn.status === 'flag' ? 'Atenção' : 'Grave'}
                  </span>
                  <ScorePill tone={meta.tone}>{scn.score}</ScorePill>
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
                      <div className={`callout ${meta.tone === 'red' ? 'red' : 'amber'}`} style={{ marginBottom: 12 }}>
                        <AlertTriangle />
                        <span>{scn.note}</span>
                      </div>
                    )}
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
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
