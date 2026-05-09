'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { AlertTriangle, Search, Check, X, TrendingUp } from 'lucide-react'
import { AgentSubPageShell } from '@/components/ai/AgentSubPageShell'
import {
  Button,
  Card,
  EmptyState,
  Spinner,
  Badge,
  Num,
} from '@/components/ai/ui/primitives'

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
      pageDescription="Tópicos onde o agente teve dificuldade. Adicione fontes para resolver."
      actions={
        <Button
          onClick={runScan}
          loading={scanning}
          leadingIcon={<Search className="w-3.5 h-3.5" strokeWidth={1.75} />}
        >
          Rastrear gaps
        </Button>
      }
    >
      {scanResult && (
        <Card size="sm" className="mb-4">
          <p className="text-[13px] text-[#52525B]">{scanResult}</p>
        </Card>
      )}
      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <p className="text-[13px] text-red-700">{error}</p>
        </Card>
      )}

      <div className="inline-flex items-center gap-1 mb-5 p-1 bg-[#F4F4F5] rounded-[10px]">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key)}
            className={`px-3 py-1.5 rounded-[8px] text-[12px] font-semibold transition-colors ${
              statusFilter === s.key
                ? 'bg-white text-[#18181B] shadow-sm'
                : 'text-[#71717A] hover:text-[#18181B]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner />
        </div>
      ) : gaps.length === 0 ? (
        <EmptyState
          title={
            statusFilter === 'open'
              ? 'Nenhum gap aberto'
              : statusFilter === 'addressed'
              ? 'Nenhum gap resolvido'
              : 'Nenhum gap descartado'
          }
          description={
            statusFilter === 'open'
              ? 'Rode o rastreamento para detectar tópicos onde o agente precisou de ajuda.'
              : 'Mude o filtro acima ou rastreie novos gaps.'
          }
        />
      ) : (
        <div className="space-y-3">
          {gaps.map((g) => (
            <Card key={g.id} size="sm">
              <div className="flex items-start gap-4">
                <div className="inline-flex items-center justify-center w-9 h-9 rounded-[10px] bg-[#FFF7ED] border border-[#FED7AA] flex-shrink-0">
                  <AlertTriangle className="w-4 h-4 text-[#C2410C]" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-[14px] font-semibold text-[#18181B]">{g.topic}</h4>
                    <span className="inline-flex items-center gap-1 text-[12px] text-[#71717A]">
                      <TrendingUp className="w-3 h-3" strokeWidth={1.75} />
                      <Num>{g.frequency}</Num> ocorrências
                    </span>
                  </div>
                  {g.suggested_action && (
                    <p className="text-[12px] text-[#52525B] mt-2">
                      <span className="font-semibold">Sugestão:</span> {g.suggested_action}
                      {g.suggested_source_type && (
                        <Badge tone="subtle" className="ml-1.5">
                          {SOURCE_TYPE_LABEL[g.suggested_source_type] ?? g.suggested_source_type}
                        </Badge>
                      )}
                    </p>
                  )}
                  {g.sample_questions.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {g.sample_questions.slice(0, 3).map((q, i) => (
                        <p key={i} className="text-[12px] text-[#71717A] italic">
                          “{q}”
                        </p>
                      ))}
                      {g.sample_questions.length > 3 && (
                        <p className="text-[11px] text-[#A1A1AA]">
                          +{g.sample_questions.length - 3} outras
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {g.status === 'open' && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => updateStatus(g, 'addressed')}
                      leadingIcon={<Check className="w-3 h-3" strokeWidth={1.75} />}
                    >
                      Resolver
                    </Button>
                    <button
                      onClick={() => updateStatus(g, 'dismissed')}
                      className="p-1.5 text-[#A1A1AA] hover:text-[#52525B] hover:bg-[#F4F4F5] rounded-[6px] transition-colors"
                      title="Descartar"
                    >
                      <X className="w-4 h-4" strokeWidth={1.75} />
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </AgentSubPageShell>
  )
}
