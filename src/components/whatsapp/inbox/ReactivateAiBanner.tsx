'use client'

/**
 * Onda 13 / P0-2 — Banner "Religar IA em massa".
 *
 * Aparece acima da lista de conversas quando existem conversas com IA
 * desligada por causa AUTOMATICA (chave ausente, budget excedido, erro
 * permanente do provider). Desligamento manual e transferencia pra humano
 * NUNCA entram aqui — a whitelist e do backend (reactivate-ai/route.ts).
 */

import { useState, useEffect, useCallback } from 'react'
import { Bot, RefreshCw } from 'lucide-react'
import { authedFetch } from '@/lib/api/authed-fetch'

interface ReactivateAiBannerProps {
  /** refetch da lista de conversas apos religar */
  onReactivated?: () => void
}

export function ReactivateAiBanner({ onReactivated }: ReactivateAiBannerProps) {
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)

  const fetchCount = useCallback(async () => {
    try {
      const res = await authedFetch('/api/whatsapp/inbox/conversations/reactivate-ai')
      if (res.ok) {
        const data = await res.json()
        setCount(data.count || 0)
      }
    } catch {
      // banner e best-effort; silencia
    }
  }, [])

  useEffect(() => {
    fetchCount()
  }, [fetchCount])

  const handleReactivate = async () => {
    const ok = window.confirm(
      `Religar a IA em ${count} conversa${count > 1 ? 's' : ''} pausada${count > 1 ? 's' : ''} automaticamente por problema do sistema (chave/orçamento/erro)?\n\n` +
        'Conversas desativadas manualmente ou transferidas para atendente NÃO serão alteradas.',
    )
    if (!ok) return

    setBusy(true)
    try {
      const res = await authedFetch('/api/whatsapp/inbox/conversations/reactivate-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        setCount(0)
        onReactivated?.()
      }
    } catch {
      // mantem o banner pra retentar
    } finally {
      setBusy(false)
    }
  }

  if (count === 0) return null

  return (
    <div className="mx-3 mt-3 p-3 rounded-lg border border-amber-300 bg-amber-50">
      <div className="flex items-start gap-2">
        <Bot className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-amber-800">
            IA pausada em <strong>{count}</strong> conversa{count > 1 ? 's' : ''} por
            problema do sistema (chave de IA, orçamento ou erro do provedor).
          </p>
          <button
            onClick={handleReactivate}
            disabled={busy}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-60"
          >
            {busy ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Bot className="w-3 h-3" />
            )}
            Religar IA
          </button>
        </div>
      </div>
    </div>
  )
}
