'use client'

import { useEffect, useState } from 'react'
import { Flame } from 'lucide-react'

/**
 * 10.8 — o momento visível fora de Momentos: banner de LEITURA em Campanhas e
 * no editor de Fluxos, lendo a view active_commercial_moments (ativo é
 * computado pelo relógio — a mesma verdade do runtime). Sem momento ativo,
 * não renderiza nada.
 */

interface ActiveMoment {
  id: string
  name: string
  ends_at: string
  public_claim: string | null
}

export default function MomentBanner() {
  const [moments, setMoments] = useState<ActiveMoment[]>([])

  useEffect(() => {
    let alive = true
    fetch('/api/ai/moments/active')
      .then((res) => (res.ok ? res.json() : { moments: [] }))
      .then((payload) => { if (alive) setMoments(payload.moments ?? []) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  if (moments.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
      {moments.map((m) => (
        <div key={m.id} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          background: '#FFF3EA', border: '1px solid #FFE8D6', borderRadius: 10,
          fontSize: 12.5, color: '#C2410C',
        }}>
          <Flame size={14} />
          <span>
            <b>Momento «{m.name}» ativo</b> até{' '}
            {new Date(m.ends_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            {m.public_claim ? <> — a IA pode afirmar: “{m.public_claim}”</> : null}
          </span>
        </div>
      ))}
    </div>
  )
}
