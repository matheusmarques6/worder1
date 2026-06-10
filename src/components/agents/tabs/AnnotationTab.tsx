'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Tag,
  ThumbsUp,
  ThumbsDown,
  PencilLine,
  RefreshCw,
  Database,
  CheckCircle2,
  MessageSquare,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import { Button, Card } from '../ui/primitives'

/**
 * Anotação tab — the data-flywheel. Operators label recent conversation turns
 * (bom / ruim / correção) and write a corrected answer; labeled turns feed back
 * into evals and fine-tuning. Uses the scoped `annot`/`flywheel` classes.
 *
 * Bloco F2: wired to real data (GET /annotations + POST /annotations). "Salvar
 * anotações" envia apenas o delta (ratings/correções alterados vs o baseline).
 */

type Rating = 'good' | 'bad' | 'fix'

interface Turn {
  id: string
  question: string
  answer: string
  /** ISO created_at da trace */
  date: string
  /** rótulo pré-existente, se já anotado */
  rating?: Rating
  /** texto da correção, quando rating === 'fix' */
  correction?: string
}

interface FlywheelStats {
  annotated: number
  corrections: number
  for_fine_tune: number
  coverage: number
}

interface AnnotationTabProps {
  agentId: string
  organizationId: string
}

/** ISO → "12 mai · 09:10" (pt-BR curto, como no mock do Bloco E2) */
function formatTurnDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const date = d
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    .replace(' de ', ' ')
    .replace('.', '')
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`
}

const EMPTY_STATS: FlywheelStats = { annotated: 0, corrections: 0, for_fine_tune: 0, coverage: 0 }

export default function AnnotationTab({ agentId, organizationId }: AnnotationTabProps) {
  const { user } = useAuthStore()

  const [turns, setTurns] = useState<Turn[]>([])
  const [stats, setStats] = useState<FlywheelStats>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // estado local editável + baseline (o que veio do servidor) para o delta
  const [ratings, setRatings] = useState<Record<string, Rating>>({})
  const [corrections, setCorrections] = useState<Record<string, string>>({})
  const [baseRatings, setBaseRatings] = useState<Record<string, Rating>>({})
  const [baseCorrections, setBaseCorrections] = useState<Record<string, string>>({})

  const applyTurns = useCallback((list: Turn[]) => {
    const r: Record<string, Rating> = {}
    const c: Record<string, string> = {}
    for (const t of list) {
      if (t.rating) r[t.id] = t.rating
      if (t.correction) c[t.id] = t.correction
    }
    setTurns(list)
    setRatings(r)
    setCorrections(c)
    setBaseRatings(r)
    setBaseCorrections(c)
  }, [])

  const fetchAnnotations = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/ai/agents/${agentId}/annotations?limit=20&organization_id=${organizationId}`
      )
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Erro ao carregar anotações')
      }
      const data = await res.json()
      applyTurns(Array.isArray(data.turns) ? data.turns : [])
      setStats(data.stats || EMPTY_STATS)
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar anotações')
    } finally {
      setLoading(false)
    }
  }, [agentId, organizationId, applyTurns])

  useEffect(() => {
    fetchAnnotations()
  }, [fetchAnnotations])

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

  // delta de ratings/correções vs o baseline buscado
  const pendingChanges = useMemo(() => {
    const changes: Array<{ trace_id: string; rating: Rating | null; correction_text?: string }> = []
    const ids = new Set<string>([
      ...Object.keys(ratings),
      ...Object.keys(baseRatings),
      ...Object.keys(corrections),
      ...Object.keys(baseCorrections),
    ])
    for (const id of ids) {
      const rating = ratings[id] ?? null
      const baseRating = baseRatings[id] ?? null
      const correction = rating === 'fix' ? corrections[id] ?? '' : ''
      const baseCorrection = baseRating === 'fix' ? baseCorrections[id] ?? '' : ''
      if (rating !== baseRating || correction !== baseCorrection) {
        changes.push(
          rating === null
            ? { trace_id: id, rating: null }
            : { trace_id: id, rating, correction_text: rating === 'fix' ? correction : undefined }
        )
      }
    }
    return changes
  }, [ratings, corrections, baseRatings, baseCorrections])

  const handleSave = async () => {
    if (saving || pendingChanges.length === 0) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          user_id: user?.id ?? null,
          annotations: pendingChanges,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Erro ao salvar anotações')
      }
      const data = await res.json()
      // promove o estado local a novo baseline e atualiza o flywheel
      setBaseRatings(ratings)
      setBaseCorrections(corrections)
      if (data.stats) setStats(data.stats)
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar anotações')
    } finally {
      setSaving(false)
    }
  }

  const flywheelCells = [
    { id: 'f1', label: 'Anotadas (30d)', value: String(stats.annotated), icon: Tag },
    { id: 'f2', label: 'Correções', value: String(stats.corrections), icon: PencilLine },
    { id: 'f3', label: 'Para fine-tune', value: String(stats.for_fine_tune), icon: Database },
    { id: 'f4', label: 'Cobertura', value: `${stats.coverage}%`, icon: CheckCircle2 },
  ]

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

      {/* Error state (load ou save) */}
      {error && !loading && (
        <div className="callout red">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <Button variant="soft" size="sm" style={{ marginLeft: 'auto' }} onClick={fetchAnnotations}>
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Flywheel summary */}
      <div className="flywheel">
        {flywheelCells.map((cell) => {
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

      {loading ? (
        /* Loading state */
        <Card style={{ padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--brand)' }} />
          <span style={{ color: 'var(--text-2)' }}>Carregando conversas...</span>
        </Card>
      ) : turns.length === 0 ? (
        /* Empty state */
        !error && (
          <Card style={{ padding: 32, textAlign: 'center' }}>
            <p style={{ color: 'var(--text-2)', margin: 0 }}>
              Nenhuma conversa recente para anotar ainda.
            </p>
          </Card>
        )
      ) : (
        /* Recent turns to label */
        <Card style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <MessageSquare style={{ width: 16, height: 16, color: 'var(--brand)' }} />
            <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>Conversas recentes</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
              {annotatedCount} de {turns.length} anotadas
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {turns.map((turn) => {
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
                    <span style={{ fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{formatTurnDate(turn.date)}</span>
                  </div>

                  {/* rate buttons */}
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
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={saving || pendingChanges.length === 0}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Salvar anotações
            </Button>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              As anotações alimentam o flywheel de melhoria contínua.
            </span>
          </div>
        </Card>
      )}
    </div>
  )
}
