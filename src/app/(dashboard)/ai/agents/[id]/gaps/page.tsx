'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  AlertTriangle,
  Loader2,
  Search,
  Check,
  X,
  TrendingUp,
} from 'lucide-react'
import { AgentSubPageShell } from '@/components/ai/AgentSubPageShell'

interface GapRow {
  id: string
  topic: string
  sample_questions: string[]
  frequency: number
  confidence_avg: number | null
  suggested_action: string | null
  suggested_source_type: string | null
  status: 'open' | 'addressed' | 'dismissed'
  created_at: string
}

const STATUS_OPTIONS: { key: 'open' | 'addressed' | 'dismissed'; label: string }[] = [
  { key: 'open', label: 'Abertos' },
  { key: 'addressed', label: 'Resolvidos' },
  { key: 'dismissed', label: 'Descartados' },
]

const SOURCE_TYPE_LABEL: Record<string, string> = {
  url: 'URL',
  text: 'Texto',
  faq: 'FAQ',
  integration: 'Integração',
}

export default function AgentGapsPage() {
  const params = useParams<{ id: string }>()
  const agentId = params.id

  const [gaps, setGaps] = useState<GapRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'open' | 'addressed' | 'dismissed'>('open')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/ai/agents/${agentId}/knowledge-gaps?status=${statusFilter}`,
      )
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Falha ao carregar')
      setGaps(j.gaps ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [agentId, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  async function runScan() {
    setScanning(true)
    setScanResult(null)
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/knowledge-gaps/scan?days=7`, {
        method: 'POST',
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Falha ao rastrear')
      const fnd = j.topics_found ?? 0
      const upd = j.topics_upserted?.length ?? 0
      setScanResult(`${fnd} tópicos detectados · ${upd} atualizados`)
      await load()
    } catch (err) {
      setScanResult(err instanceof Error ? err.message : 'Erro')
    } finally {
      setScanning(false)
    }
  }

  async function updateStatus(gap: GapRow, newStatus: 'addressed' | 'dismissed') {
    const res = await fetch(`/api/ai/agents/${agentId}/knowledge-gaps/${gap.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) await load()
  }

  return (
    <AgentSubPageShell
      agentId={agentId}
      pageTitle="Gaps de conhecimento"
      pageDescription="Tópicos onde o agente teve dificuldade em responder. Adicione fontes para resolver."
      actions={
        <button
          onClick={runScan}
          disabled={scanning}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm
                     font-medium rounded-md hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {scanning ? (
            <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.75} />
          ) : (
            <Search className="w-4 h-4" strokeWidth={1.75} />
          )}
          Rastrear gaps
        </button>
      }
    >
      {scanResult && (
        <div className="bg-zinc-50 border border-zinc-200 text-zinc-700 text-sm rounded-md px-3 py-2 mb-4">
          {scanResult}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {/* Filtros de status */}
      <div className="flex items-center gap-1.5 mb-4">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s.key
                ? 'bg-orange-50 text-orange-700 border-orange-200'
                : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" strokeWidth={1.75} />
        </div>
      ) : gaps.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-50 mb-3">
            <AlertTriangle className="w-6 h-6 text-orange-600" strokeWidth={1.75} />
          </div>
          <h3 className="text-base font-semibold text-zinc-900 mb-1">
            {statusFilter === 'open'
              ? 'Nenhum gap aberto'
              : statusFilter === 'addressed'
              ? 'Nenhum gap resolvido'
              : 'Nenhum gap descartado'}
          </h3>
          <p className="text-sm text-zinc-500">
            {statusFilter === 'open'
              ? 'Rode o rastreamento para detectar tópicos onde o agente precisou de ajuda.'
              : 'Mude o filtro acima ou rastreie novos gaps.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {gaps.map((g) => (
            <div key={g.id} className="bg-white border border-zinc-200 rounded-xl p-4">
              <div className="flex items-start gap-4">
                <div className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-orange-50 border border-orange-100 flex-shrink-0">
                  <AlertTriangle className="w-4 h-4 text-orange-600" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold text-zinc-900">{g.topic}</h4>
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                      <TrendingUp className="w-3 h-3" strokeWidth={1.75} />
                      {g.frequency} ocorrências
                    </span>
                  </div>
                  {g.suggested_action && (
                    <p className="text-xs text-zinc-600 mt-2">
                      <span className="font-medium text-zinc-700">Sugestão:</span>{' '}
                      {g.suggested_action}
                      {g.suggested_source_type && (
                        <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded bg-zinc-50 border border-zinc-200 text-zinc-600">
                          {SOURCE_TYPE_LABEL[g.suggested_source_type] ??
                            g.suggested_source_type}
                        </span>
                      )}
                    </p>
                  )}
                  {g.sample_questions.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {g.sample_questions.slice(0, 3).map((q, i) => (
                        <p key={i} className="text-xs text-zinc-600 italic">
                          “{q}”
                        </p>
                      ))}
                      {g.sample_questions.length > 3 && (
                        <p className="text-xs text-zinc-400">
                          +{g.sample_questions.length - 3} outras
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {g.status === 'open' && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => updateStatus(g, 'addressed')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium
                                 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md
                                 hover:bg-emerald-100 transition-colors"
                      title="Marcar como resolvido"
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={1.75} />
                      Resolver
                    </button>
                    <button
                      onClick={() => updateStatus(g, 'dismissed')}
                      className="inline-flex items-center justify-center p-1.5 text-xs
                                 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50 rounded-md transition-colors"
                      title="Descartar"
                    >
                      <X className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AgentSubPageShell>
  )
}
