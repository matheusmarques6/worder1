'use client'

// AISegmentInput — natural language → SegmentRule.
// Klaviyo/Omnisend parity feature: merchant types something like
// "clientes que compraram mais de 3 vezes nos últimos 90 dias e CLV
// acima de R$500" and we generate the rule tree for them. They can
// edit the result before saving.

import { useState } from 'react'
import { Sparkle, Loader2, Lightbulb } from 'lucide-react'
import type { SegmentRule } from '@/lib/segments/dsl'

interface Props {
  onGenerate: (rule: SegmentRule) => void
}

const EXAMPLES = [
  'Clientes VIP que não compram há 60 dias',
  'Carrinho abandonado nos últimos 7 dias com valor acima de R$200',
  'Clientes que compraram mais de 3 vezes e CLV alto',
  'Inscritos por email que abriram pelo menos um email no último mês',
]

export function AISegmentInput({ onGenerate }: Props) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showExamples, setShowExamples] = useState(false)

  async function submit() {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/segments/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), locale: 'pt-BR' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'falha ao gerar')
      onGenerate(data.rule)
      setPrompt('')
    } catch (err: any) {
      setError(err.message || 'erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-gradient-to-br from-purple-50 via-white to-blue-50 border border-purple-200 rounded-2xl p-4">
      <header className="flex items-center gap-2 mb-3">
        <Sparkle size={16} className="text-purple-500 fill-purple-500" />
        <h3 className="text-sm font-semibold text-gray-900">Descreva em linguagem natural</h3>
        <span className="ml-1 px-2 py-0.5 text-[10px] font-semibold bg-purple-500 text-white rounded-full uppercase tracking-wider">
          AI
        </span>
      </header>

      <div className="flex items-stretch gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
          }}
          placeholder='Ex: "clientes com mais de 3 pedidos no último mês e CLV acima de R$500"'
          rows={2}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-purple-500 resize-none bg-white"
        />
        <button
          type="button"
          onClick={submit}
          disabled={loading || !prompt.trim()}
          className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 shrink-0"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkle size={14} />}
          Gerar
        </button>
      </div>

      <div className="flex items-center justify-between mt-2">
        <button
          type="button"
          onClick={() => setShowExamples((v) => !v)}
          className="text-xs text-purple-600 hover:text-purple-700 inline-flex items-center gap-1"
        >
          <Lightbulb size={12} />
          Ver exemplos
        </button>
        <span className="text-[10px] text-gray-400">Cmd/Ctrl + Enter para enviar</span>
      </div>

      {showExamples && (
        <ul className="mt-2 space-y-1">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                onClick={() => { setPrompt(ex); setShowExamples(false) }}
                className="w-full text-left text-xs text-gray-700 hover:bg-white px-2 py-1.5 rounded transition-colors"
              >
                &ldquo;{ex}&rdquo;
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 mt-2">{error}</p>
      )}
    </div>
  )
}
