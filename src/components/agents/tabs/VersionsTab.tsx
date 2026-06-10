'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  History,
  GitCompare,
  RotateCcw,
  User,
  Clock,
  AlertTriangle,
} from 'lucide-react'
import { Button, Card, DiffViewer } from '../ui/primitives'
import type { DiffLine } from '../ui/primitives'

/**
 * Versões tab — version history with a before/after diff and a (visual-only)
 * rollback action guarded by a confirm modal. Reuses the `vrow`/`vtag` rows
 * (already in agents-theme.css) and the `DiffViewer` primitive from E1.
 *
 * VISUAL ONLY — every dataset below is in-file mock; Bloco F wires real data.
 */

// MOCK — wired to real data in Bloco F
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

// MOCK — wired to real data in Bloco F
const MOCK_VERSIONS: AgentVersion[] = [
  {
    id: 'v3',
    tag: 'v3',
    label: 'Tom mais empático em reembolsos',
    author: 'Mariana Alves',
    date: 'hoje · 14:20',
    status: 'rascunho',
    current: true,
    diff: [
      { type: 'ctx', text: 'Você é um assistente de suporte ao cliente.' },
      { type: 'rem', text: 'Responda de forma objetiva e direta.' },
      { type: 'add', text: 'Acolha o cliente antes de resolver casos sensíveis.' },
      { type: 'add', text: 'Em reembolsos, confirme a política antes de prometer prazos.' },
      { type: 'ctx', text: 'Nunca invente valores ou datas.' },
    ],
  },
  {
    id: 'v2',
    tag: 'v2',
    label: 'Adiciona citação de fonte (RAG)',
    author: 'Carlos Pereira',
    date: '12 mai · 09:10',
    status: 'produção',
    diff: [
      { type: 'ctx', text: 'Você é um assistente de suporte ao cliente.' },
      { type: 'add', text: 'Sempre cite a fonte usada para responder.' },
      { type: 'ctx', text: 'Responda de forma objetiva e direta.' },
    ],
  },
  {
    id: 'v1',
    tag: 'v1',
    label: 'Versão inicial',
    author: 'Mariana Alves',
    date: '02 mai · 16:42',
    status: 'arquivada',
    diff: [
      { type: 'add', text: 'Você é um assistente de suporte ao cliente.' },
      { type: 'add', text: 'Responda de forma objetiva e direta.' },
    ],
  },
]

const STATUS_TONE: Record<AgentVersion['status'], { bg: string; fg: string }> = {
  produção: { bg: 'var(--green-tint)', fg: 'var(--green)' },
  rascunho: { bg: 'var(--amber-tint)', fg: 'var(--amber)' },
  arquivada: { bg: 'var(--surface-3)', fg: 'var(--text-3)' },
}

export default function VersionsTab() {
  const [selected, setSelected] = useState<string>('v3')
  const [showRollback, setShowRollback] = useState(false)

  const current = MOCK_VERSIONS.find((v) => v.id === selected) ?? MOCK_VERSIONS[0]

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

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
        {/* left: version list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MOCK_VERSIONS.map((v) => {
            const sel = selected === v.id
            const tone = STATUS_TONE[v.status]
            return (
              <button
                key={v.id}
                type="button"
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

      {/* Rollback confirmation modal — inert (visual only) */}
      <AnimatePresence>
        {showRollback && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowRollback(false)}
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
                  <Button variant="soft" block onClick={() => setShowRollback(false)}>
                    Cancelar
                  </Button>
                  {/* Inert — rollback is wired to real data in Bloco F */}
                  <Button variant="primary" block onClick={() => setShowRollback(false)}>
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
