'use client'

import { useEffect, useState } from 'react'
import { Activity, Loader2 } from 'lucide-react'
import { Card } from '@/components/agents/ui/primitives'
import type { RuntimeActivityRow } from '@/lib/ai/activity'

/**
 * Trilha única (Adendo §B, 9.4): as conversas do runtime novo, com missão
 * dona, custo somado e o último veredito do Judge — lidas das views de
 * compatibilidade sobre internal.* via /api/ai/activity. É org-escopada
 * (independe do agente selecionado acima): um agente por loja é o destino.
 * O restante da aba (legado) segue visível como consulta histórica.
 */

const VERDICT_COLORS: Record<string, string> = {
  pass: 'var(--green)',
  fail: 'var(--amber)',
  critical: 'var(--red)',
}

function when(row: RuntimeActivityRow): string {
  const iso = row.last_inbound_at ?? row.created_at
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function cost(row: RuntimeActivityRow): string {
  if (row.cost_usd == null) return '—'
  return `$${Number(row.cost_usd).toFixed(4)}`
}

export default function RuntimeActivitySection() {
  const [rows, setRows] = useState<RuntimeActivityRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/ai/activity')
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => null)
          throw new Error(d?.error || 'Erro ao carregar a trilha do runtime')
        }
        return res.json()
      })
      .then((payload) => {
        if (alive) setRows(payload.conversations ?? [])
      })
      .catch((e) => {
        if (alive) setError(e.message)
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <Card style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Activity size={16} style={{ color: 'var(--orange)' }} />
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
          Conversas do runtime
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
          trilha única — missão · custo · judge
        </span>
      </div>

      {error ? (
        <p style={{ fontSize: 13, color: 'var(--red)' }}>{error}</p>
      ) : rows === null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-3)' }} />
          <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Carregando…</span>
        </div>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
          Nenhuma conversa do runtime ainda — as conversas aparecem aqui quando a
          loja migra para o runtime novo (aba Limites → migração).
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-3)' }}>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Quando</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Canal</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Missão</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Chamadas</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Tools</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Custo</th>
                <th style={{ padding: '6px 8px', fontWeight: 600 }}>Judge</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.conversation_id}
                  style={{ borderTop: '1px solid var(--line)', color: 'var(--text)' }}
                >
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{when(row)}</td>
                  <td style={{ padding: '6px 8px' }}>{row.last_channel ?? '—'}</td>
                  <td style={{ padding: '6px 8px' }}>
                    {row.mission_event_type ?? 'descoberta'}
                  </td>
                  <td style={{ padding: '6px 8px' }}>{row.llm_calls ?? 0}</td>
                  <td style={{ padding: '6px 8px' }}>{row.tool_calls ?? 0}</td>
                  <td style={{ padding: '6px 8px' }}>{cost(row)}</td>
                  <td style={{ padding: '6px 8px' }}>
                    {row.last_judge_verdict ? (
                      <span
                        style={{
                          color: VERDICT_COLORS[row.last_judge_verdict] ?? 'var(--text)',
                          fontWeight: 700,
                        }}
                      >
                        {row.last_judge_verdict}
                        {row.last_judge_score != null
                          ? ` (${Number(row.last_judge_score).toFixed(2)})`
                          : ''}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
