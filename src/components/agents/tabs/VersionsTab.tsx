'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  History,
  GitCompare,
  RotateCcw,
  User,
  Clock,
  AlertTriangle,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { useAuthStore } from '@/stores'
import { Button, Card, DiffViewer } from '../ui/primitives'
import type { DiffLine } from '../ui/primitives'

/**
 * Versões tab — version history with a before/after diff and a rollback action
 * guarded by a confirm modal. Reuses the `vrow`/`vtag` rows (already in
 * agents-theme.css) and the `DiffViewer` primitive from E1.
 *
 * Bloco F1: wired to real data (GET /versions + POST /versions/[id]/rollback).
 */

interface AgentVersion {
  id: string
  tag: string
  label: string
  author: string
  date: string
  /** rollout tag shown as a chip, e.g. "produção" / "rascunho" */
  status: 'produção' | 'rascunho' | 'arquivada'
  current?: boolean
  /** diff vs the previous version */
  diff: DiffLine[]
}

interface VersionsTabProps {
  agentId: string
  organizationId: string
  onRolledBack?: () => void
}

const STATUS_TONE: Record<AgentVersion['status'], { bg: string; fg: string }> = {
  produção: { bg: 'var(--green-tint)', fg: 'var(--green)' },
  rascunho: { bg: 'var(--amber-tint)', fg: 'var(--amber)' },
  arquivada: { bg: 'var(--surface-3)', fg: 'var(--text-3)' },
}

/** ISO → "12 mai · 09:10" (pt-BR curto, como no mock do Bloco E2) */
function formatVersionDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const date = d
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    .replace(' de ', ' ')
    .replace('.', '')
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`
}

function mapVersions(raw: AgentVersion[]): AgentVersion[] {
  return (raw || []).map((v) => ({ ...v, date: formatVersionDate(v.date) }))
}

export default function VersionsTab({ agentId, organizationId, onRolledBack }: VersionsTabProps) {
  const { user } = useAuthStore()
  const [versions, setVersions] = useState<AgentVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string>('')
  const [showRollback, setShowRollback] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)

  const fetchVersions = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/versions?organization_id=${organizationId}`)
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Erro ao carregar versões')
      }
      const data = await res.json()
      const mapped = mapVersions(data.versions || [])
      setVersions(mapped)
      setSelected((prev) => (mapped.some((v) => v.id === prev) ? prev : mapped[0]?.id ?? ''))
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar versões')
    } finally {
      setLoading(false)
    }
  }, [agentId, organizationId])

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions])

  const current = versions.find((v) => v.id === selected) ?? versions[0]

  const handleRollback = async () => {
    if (!current || current.current || rollingBack) return
    setRollingBack(true)
    setError('')
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/versions/${current.id}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organizationId, user_id: user?.id ?? null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || 'Erro ao reverter versão')
      }
      const data = await res.json()
      const mapped = mapVersions(data.versions || [])
      setVersions(mapped)
      setSelected(mapped[0]?.id ?? '')
      setShowRollback(false)
      onRolledBack?.()
    } catch (err: any) {
      setError(err.message || 'Erro ao reverter versão')
      setShowRollback(false)
    } finally {
      setRollingBack(false)
    }
  }

  return (
    <div className="editor-content-inner space-y-6">
      {/* Header */}
      <div className="sec-head">
        <div className="sec-ico">
          <History />
        </div>
        <div>
          <h3 className="sec-t">Versões</h3>
          <p className="sec-s">Compare o histórico de versões e reverta quando precisar</p>
        </div>
      </div>

      {/* Error state (load ou rollback) */}
      {error && !loading && (
        <div className="callout red">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <Button variant="soft" size="sm" style={{ marginLeft: 'auto' }} onClick={fetchVersions}>
            Tentar novamente
          </Button>
        </div>
      )}

      {loading ? (
        /* Loading state */
        <Card style={{ padding: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--brand)' }} />
          <span style={{ color: 'var(--text-2)' }}>Carregando versões...</span>
        </Card>
      ) : versions.length === 0 ? (
        /* Empty state */
        !error && (
          <Card style={{ padding: 32, textAlign: 'center' }}>
            <p style={{ color: 'var(--text-2)', margin: 0 }}>
              Nenhuma versão ainda — salve o agente para criar a primeira.
            </p>
          </Card>
        )
      ) : current ? (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
          {/* left: version list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {versions.map((v) => {
              const sel = selected === v.id
              const tone = STATUS_TONE[v.status]
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={sel}
                  className={`vrow${v.current ? ' cur' : ''}${sel ? ' sel' : ''}`}
                  onClick={() => setSelected(v.id)}
                >
                  <span className="vtag">{v.tag}</span>
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {v.label}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <User style={{ width: 11, height: 11 }} /> {v.author}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Clock style={{ width: 11, height: 11 }} /> {v.date}
                      </span>
                    </div>
                  </div>
                  <span className="score-pill" style={{ background: tone.bg, color: tone.fg }}>
                    {v.status}
                  </span>
                </button>
              )
            })}
          </div>

          {/* right: diff vs previous + rollback */}
          <Card style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <GitCompare style={{ width: 16, height: 16, color: 'var(--brand)' }} />
              <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>
                Diferenças desta versão
              </span>
              <span className="vtag" style={{ marginLeft: 'auto' }}>{current.tag}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 12px' }}>
              Alterações no prompt em relação à versão anterior.
            </p>

            <DiffViewer lines={current.diff} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
              <Button
                variant="soft"
                size="sm"
                disabled={current.current}
                onClick={() => setShowRollback(true)}
              >
                <RotateCcw className="w-4 h-4" />
                Reverter para {current.tag}
              </Button>
              {current.current && (
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Esta já é a versão atual.
                </span>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {/* Rollback confirmation modal */}
      <AnimatePresence>
        {showRollback && current && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => !rollingBack && setShowRollback(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="modal"
              style={{ maxWidth: 440 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-body">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--amber-tint)' }}>
                    <AlertTriangle className="w-6 h-6" style={{ color: 'var(--amber)' }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Reverter versão</h3>
                    <p className="text-sm" style={{ color: 'var(--text-3)' }}>Cria um rascunho a partir de {current.tag}</p>
                  </div>
                </div>

                <p className="mb-6" style={{ color: 'var(--text-2)' }}>
                  Deseja reverter para <strong style={{ color: 'var(--text)' }}>{current.tag} · {current.label}</strong>?
                  O prompt atual será substituído pelo desta versão.
                </p>

                <div className="flex gap-3">
                  <Button variant="soft" block disabled={rollingBack} onClick={() => setShowRollback(false)}>
                    Cancelar
                  </Button>
                  <Button variant="primary" block disabled={rollingBack} onClick={handleRollback}>
                    {rollingBack && <Loader2 className="w-4 h-4 animate-spin" />}
                    Reverter
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
