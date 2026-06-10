'use client'

import { useState } from 'react'
import {
  Tag,
  ThumbsUp,
  ThumbsDown,
  PencilLine,
  RefreshCw,
  Database,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react'
import { Button, Card } from '../ui/primitives'

/**
 * Anotação tab — the data-flywheel. Operators label recent conversation turns
 * (bom / ruim / correção) and write a corrected answer; labeled turns feed back
 * into evals and fine-tuning. Uses the scoped `annot`/`flywheel` classes.
 *
 * VISUAL ONLY — every dataset below is in-file mock; the rate/save actions are
 * inert placeholders. Bloco F wires real data + persistence.
 */

type Rating = 'good' | 'bad' | 'fix'

// MOCK — wired to real data in Bloco F
interface Turn {
  id: string
  question: string
  answer: string
  date: string
  /** pre-existing label, if already annotated */
  rating?: Rating
}

// MOCK — wired to real data in Bloco F
const MOCK_TURNS: Turn[] = [
  {
    id: 't1',
    question: 'Quanto custa o plano anual?',
    answer: 'O plano anual sai por R$ 1.200, com 2 meses grátis em relação ao mensal.',
    date: 'hoje · 11:02',
    rating: 'good',
  },
  {
    id: 't2',
    question: 'Quero reembolso de uma compra de 40 dias atrás.',
    answer: 'Claro! Vou processar seu reembolso integral agora mesmo.',
    date: 'hoje · 10:48',
  },
  {
    id: 't3',
    question: 'Posso tomar esse suplemento junto com meu remédio?',
    answer: 'Sim, pode tomar tranquilo, não tem problema nenhum.',
    date: 'ontem · 18:21',
    rating: 'bad',
  },
  {
    id: 't4',
    question: 'Tem o tamanho M em estoque?',
    answer: 'Sim, temos 12 unidades do tamanho M disponíveis.',
    date: 'ontem · 16:05',
  },
]

// MOCK — wired to real data in Bloco F. Flywheel = labeled turns → evals → fine-tune.
const MOCK_FLYWHEEL = [
  { id: 'f1', label: 'Anotadas (30d)', value: '482', icon: Tag },
  { id: 'f2', label: 'Correções', value: '63', icon: PencilLine },
  { id: 'f3', label: 'Para fine-tune', value: '120', icon: Database },
  { id: 'f4', label: 'Cobertura', value: '74%', icon: CheckCircle2 },
]

export default function AnnotationTab() {
  // MOCK — local-only labels; not persisted (Bloco F).
  const [ratings, setRatings] = useState<Record<string, Rating>>(() =>
    Object.fromEntries(MOCK_TURNS.filter((t) => t.rating).map((t) => [t.id, t.rating!])),
  )
  const [corrections, setCorrections] = useState<Record<string, string>>({})

  const rate = (id: string, value: Rating) =>
    setRatings((prev) => {
      if (prev[id] === value) {
        // toggle off — drop the key so the record stays truthful
        const { [id]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [id]: value }
    })

  const annotatedCount = Object.values(ratings).filter(Boolean).length

  return (
    <div className="editor-content-inner space-y-6">
      {/* Header */}
      <div className="sec-head">
        <div className="sec-ico">
          <Tag />
        </div>
        <div>
          <h3 className="sec-t">Anotação</h3>
          <p className="sec-s">Rotule conversas para alimentar avaliações e melhorias do agente</p>
        </div>
      </div>

      {/* Flywheel summary */}
      <div className="flywheel">
        {MOCK_FLYWHEEL.map((cell) => {
          const Icon = cell.icon
          return (
            <div key={cell.id} className="fw-cell">
              <Icon />
              <div className="fw-v">{cell.value}</div>
              <div className="fw-k">{cell.label}</div>
            </div>
          )
        })}
      </div>

      {/* Recent turns to label */}
      <Card style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <MessageSquare style={{ width: 16, height: 16, color: 'var(--brand)' }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>Conversas recentes</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
            {annotatedCount} de {MOCK_TURNS.length} anotadas
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {MOCK_TURNS.map((turn) => {
            const rating = ratings[turn.id]
            const showFix = rating === 'fix'
            return (
              <div key={turn.id} className={`annot${rating ? ' on' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="annot-msg">
                      <span className="who">Cliente:</span> {turn.question}
                    </div>
                    <div className="annot-msg" style={{ marginTop: 6 }}>
                      <span className="who">Agente:</span> {turn.answer}
                    </div>
                  </div>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{turn.date}</span>
                </div>

                {/* rate buttons — update local UI state only (persisted in Bloco F) */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    type="button"
                    aria-pressed={rating === 'good'}
                    className={`rate-btn good${rating === 'good' ? ' on' : ''}`}
                    onClick={() => rate(turn.id, 'good')}
                  >
                    <ThumbsUp /> Boa
                  </button>
                  <button
                    type="button"
                    aria-pressed={rating === 'bad'}
                    className={`rate-btn bad${rating === 'bad' ? ' on' : ''}`}
                    onClick={() => rate(turn.id, 'bad')}
                  >
                    <ThumbsDown /> Ruim
                  </button>
                  <button
                    type="button"
                    aria-pressed={rating === 'fix'}
                    className={`rate-btn fix${rating === 'fix' ? ' on' : ''}`}
                    onClick={() => rate(turn.id, 'fix')}
                  >
                    <PencilLine /> Correção
                  </button>
                </div>

                {/* correction textarea — shown when "Correção" is selected */}
                {showFix && (
                  <div style={{ marginTop: 12 }}>
                    <span className="label">Resposta corrigida</span>
                    <textarea
                      className="field"
                      style={{ minHeight: 90 }}
                      placeholder="Escreva como o agente deveria ter respondido..."
                      value={corrections[turn.id] ?? ''}
                      onChange={(e) =>
                        setCorrections((prev) => ({ ...prev, [turn.id]: e.target.value }))
                      }
                    />
                    <p className="hint">Esta correção vira um caso de avaliação e exemplo de treino.</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
          {/* Inert — saving is wired to real data in Bloco F */}
          <Button variant="primary" size="sm">
            <RefreshCw className="w-4 h-4" />
            Salvar anotações
          </Button>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            As anotações alimentam o flywheel de melhoria contínua.
          </span>
        </div>
      </Card>
    </div>
  )
}
