'use client'

/**
 * Onda 13 — Slider de tamanho da resposta da IA (max_tokens).
 *
 * Por que existe: modelos com reasoning (Gemini 3.5+, o3, R1...) consomem
 * tokens "pensando" ANTES de escrever. max_tokens muito baixo => texto
 * final vazio (incidente real 12/06: agente com 500 tokens devolvia ''
 * na 2a pergunta, virava bot mudo). Default agora e 2048, com sugestoes
 * graduadas e explicacao do trade-off direto na UI.
 */

import { useId } from 'react'
import { Coins, Info } from 'lucide-react'

interface MaxTokensSliderProps {
  value: number
  onChange: (value: number) => void
}

const MIN_TOKENS = 256
const MAX_TOKENS = 8192
const RECOMMENDED = 2048

const PRESETS = [
  { value: 512, label: 'Curto', hint: 'respostas diretas (saudacoes, FAQ simples)' },
  { value: 2048, label: 'Padrão', hint: 'recomendado pra WhatsApp', recommended: true },
  { value: 4096, label: 'Longo', hint: 'instrucoes detalhadas, listas' },
  { value: 8192, label: 'Máximo', hint: 'respostas extensas, raciocinio complexo' },
]

function classify(v: number): string {
  if (v < 1024) return 'Curto (~3-5 linhas no chat)'
  if (v < 3072) return 'Padrão — equilíbrio recomendado'
  if (v < 6144) return 'Longo — boas pra explicações detalhadas'
  return 'Máximo — risco de respostas longas demais pra WhatsApp'
}

function priceEstimate(v: number): string {
  // Ordem de grandeza pra OpenRouter Gemini Flash / GPT-4o mini:
  // ~$0.30 a $0.60 por 1M tokens de output. Custo por mensagem ≈ v * 5e-7.
  const cents = (v * 0.00005).toFixed(2)
  return `~$${cents} por resposta no pior caso`
}

export function MaxTokensSlider({ value, onChange }: MaxTokensSliderProps) {
  const id = useId()
  const v = Math.min(MAX_TOKENS, Math.max(MIN_TOKENS, Number(value) || RECOMMENDED))

  return (
    <div style={{ marginTop: 20 }}>
      <div className="flex items-center justify-between mb-2">
        <label htmlFor={id} className="label" style={{ marginBottom: 0 }}>
          Tamanho máximo da resposta
        </label>
        <span className="text-sm font-medium" style={{ color: 'var(--brand-ink)' }}>
          {v.toLocaleString('pt-BR')} tokens
        </span>
      </div>

      <input
        id={id}
        type="range"
        min={MIN_TOKENS}
        max={MAX_TOKENS}
        step={128}
        value={v}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="range"
      />

      <div className="flex flex-wrap gap-2 mt-3">
        {PRESETS.map((p) => {
          const selected = v === p.value
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              className={`chip ${selected ? 'chip-brand' : 'chip-outline'}`}
              title={p.hint}
              style={{ position: 'relative' }}
            >
              {p.label} · {p.value < 1000 ? p.value : `${(p.value / 1024).toFixed(p.value % 1024 === 0 ? 0 : 1)}k`}
              {p.recommended && (
                <span
                  className="text-[10px]"
                  style={{
                    marginLeft: 6,
                    padding: '0 6px',
                    borderRadius: 999,
                    background: 'var(--green-tint, rgba(16,185,129,0.15))',
                    color: 'var(--green, #059669)',
                    fontWeight: 600,
                  }}
                >
                  recomendado
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        {classify(v)}
      </p>

      <div
        className="callout"
        style={{
          marginTop: 12,
          background: 'var(--surface-2, rgba(0,0,0,0.02))',
          border: '1px solid var(--border)',
        }}
      >
        <Info className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-3)' }} />
        <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
          <p style={{ marginBottom: 4 }}>
            <strong>Modelos com raciocínio</strong> (Gemini 3.5+, o-series, DeepSeek R1)
            consomem parte desse limite pensando <em>antes</em> de escrever.
            Abaixo de 1024 tokens, a resposta pode chegar vazia.
          </p>
          <p className="flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
            <Coins className="w-3 h-3" />
            {priceEstimate(v)}
          </p>
        </div>
      </div>
    </div>
  )
}
