'use client'

import { useState } from 'react'
import { Sparkles, Loader2, Copy, RefreshCw } from 'lucide-react'

interface CopilotSidebarProps {
  conversationId: string
  organizationId: string
  lastInboundMessage?: string
  onInsertSuggestion: (text: string) => void
}

export function CopilotSidebar({
  conversationId,
  organizationId,
  lastInboundMessage,
  onInsertSuggestion,
}: CopilotSidebarProps) {
  const [suggestion, setSuggestion] = useState('')
  const [loading, setLoading] = useState(false)

  async function fetchSuggestion() {
    if (!lastInboundMessage) return
    setLoading(true)
    setSuggestion('')
    try {
      const res = await fetch(`/api/whatsapp/ai/copilot?organizationId=${organizationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          lastMessage: lastInboundMessage,
        }),
      })
      if (res.ok) {
        const { data } = await res.json()
        setSuggestion(data?.suggestion || '')
      }
    } catch { /* */ }
    setLoading(false)
  }

  return (
    <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl border border-cyan-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-600" />
          <h4 className="text-sm font-semibold text-cyan-900">Copilot IA</h4>
        </div>
        <button
          onClick={fetchSuggestion}
          disabled={loading || !lastInboundMessage}
          className="p-1 text-cyan-600 hover:bg-cyan-100 rounded disabled:opacity-50"
          title="Gerar sugestao"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      {!lastInboundMessage ? (
        <p className="text-xs text-cyan-700">Aguardando mensagem do contato...</p>
      ) : !suggestion && !loading ? (
        <button
          onClick={fetchSuggestion}
          className="w-full text-left p-2 bg-white rounded-lg text-xs text-cyan-700 hover:bg-cyan-100 transition-colors"
        >
          Clique para gerar sugestao de resposta
        </button>
      ) : loading ? (
        <div className="p-2 text-xs text-cyan-700">Gerando sugestao...</div>
      ) : (
        <div className="space-y-2">
          <div className="p-2 bg-white rounded-lg text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
            {suggestion}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onInsertSuggestion(suggestion)}
              className="flex-1 px-2 py-1.5 bg-cyan-500 text-white rounded text-xs font-medium hover:bg-cyan-600"
            >
              Usar sugestao
            </button>
            <button
              onClick={() => { navigator.clipboard.writeText(suggestion) }}
              className="p-1.5 bg-white text-cyan-600 rounded hover:bg-cyan-100"
              title="Copiar"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
