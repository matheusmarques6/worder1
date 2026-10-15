'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Loader2, Play, X } from 'lucide-react'

/**
 * "Rodar avaliação" (plano IA M4 passo 26): dispara o pack no runtime e
 * acompanha o run até terminar, mostrando nota, graves e o que falhou.
 */

interface Run {
  id: string; status: 'running' | 'done' | 'failed'; aggregate_score: number | null
  summary: { passed?: number; total?: number; grave?: number; cost_usd?: number; error?: string
    scenarios?: Array<{ id: string; rubric: string; passed: boolean; grave: boolean; failed: string[]; reply: string | null; expectation: string }> }
}

export default function EvalRunner({ agentId, onDone }: { agentId: string; onDone?: () => void }) {
  const [run, setRun] = useState<Run | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const poll = (runId: string) => {
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ai/evals/${runId}`)
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || 'Falha ao consultar a avaliação')
        setRun(body)
        if (body.status === 'running') poll(runId)
        else { setBusy(false); onDone?.() }
      } catch (e: any) { setError(e.message); setBusy(false) }
    }, 4000)
  }

  const start = async () => {
    setBusy(true); setError(null); setRun(null)
    try {
      const res = await fetch('/api/ai/evals/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent_id: agentId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Não foi possível iniciar a avaliação')
      setRun({ id: body.run_id, status: 'running', aggregate_score: null, summary: {} })
      poll(body.run_id)
    } catch (e: any) { setError(e.message); setBusy(false) }
  }

  const failedScenarios = (run?.summary.scenarios ?? []).filter((s) => !s.passed)

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn btn-soft btn-sm" disabled={busy} onClick={() => void start()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {busy ? 'Avaliando (cerca de 1 min)…' : 'Rodar avaliação'}
        </button>
        {run?.status === 'done' && (
          <span style={{ fontSize: 12.5 }}>
            Nota <b>{Math.round(run.aggregate_score ?? 0)}</b> · {run.summary.passed}/{run.summary.total} cenários
            {run.summary.grave ? <span style={{ color: 'var(--red)' }}> · {run.summary.grave} grave(s)</span> : null}
          </span>
        )}
        {run?.status === 'failed' && <span style={{ fontSize: 12.5, color: 'var(--red)' }}>Falhou: {run.summary.error ?? 'erro'}</span>}
      </div>
      {error && <p style={{ fontSize: 12, color: 'var(--red)', margin: 0 }}>{error}</p>}
      {run?.status === 'done' && failedScenarios.length > 0 && (
        <div style={{ display: 'grid', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {failedScenarios.map((s) => (
            <div key={s.id} style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700 }}>
                {s.grave ? <AlertTriangle size={13} style={{ color: 'var(--red)' }} /> : <X size={13} style={{ color: 'var(--amber, #E0930B)' }} />}
                {s.id} <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>({s.rubric})</span>
              </div>
              <div style={{ color: 'var(--text-3)' }}>Esperado: {s.expectation}</div>
              {s.reply && <div>Respondeu: “{s.reply.slice(0, 200)}”</div>}
              {s.failed.length > 0 && <div style={{ color: 'var(--red)' }}>Falhou em: {s.failed.join(', ')}</div>}
            </div>
          ))}
        </div>
      )}
      {run?.status === 'done' && failedScenarios.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--green)', margin: 0, display: 'flex', gap: 4, alignItems: 'center' }}><Check size={13} />Todos os cenários passaram.</p>
      )}
    </div>
  )
}
