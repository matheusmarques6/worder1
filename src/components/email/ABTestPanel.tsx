'use client'

// =============================================
// WORDER: A/B Test configuration panel
// /components/email/ABTestPanel.tsx
//
// Componente usado no editor de campanha para configurar A/B test.
// Inspirado em Klaviyo/Omnisend.
// =============================================

import { useState } from 'react'
import { Beaker, Target, Clock, ChevronDown, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ABTestConfig {
  enabled: boolean
  percent: number
  variantB: {
    subject?: string
    preheader?: string
    template_id?: string
  } | null
  winner_metric: 'open_rate' | 'click_rate' | 'conversion_rate'
  duration_hours: number
}

interface ABTestPanelProps {
  variantA: { subject: string; preheader?: string }
  config: ABTestConfig
  onChange: (cfg: ABTestConfig) => void
}

const METRICS = [
  { value: 'open_rate', label: 'Taxa de abertura', description: 'Melhor para testar subject e preheader' },
  { value: 'click_rate', label: 'Taxa de cliques', description: 'Melhor para testar CTA e conteúdo' },
  { value: 'conversion_rate', label: 'Conversão', description: 'Melhor para testar oferta e público' },
] as const

const DURATIONS = [
  { value: 1, label: '1h' },
  { value: 2, label: '2h' },
  { value: 4, label: '4h' },
  { value: 8, label: '8h' },
  { value: 24, label: '24h' },
  { value: 48, label: '48h' },
]

export default function ABTestPanel({ variantA, config, onChange }: ABTestPanelProps) {
  const update = (patch: Partial<ABTestConfig>) => onChange({ ...config, ...patch })

  const toggle = () => {
    if (!config.enabled) {
      update({
        enabled: true,
        percent: 50,
        variantB: { subject: variantA.subject, preheader: variantA.preheader },
        winner_metric: config.winner_metric || 'open_rate',
        duration_hours: config.duration_hours || 4,
      })
    } else {
      update({ enabled: false, variantB: null })
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Toggle */}
      <div className="px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center',
            config.enabled ? 'bg-violet-50' : 'bg-gray-50'
          )}>
            <Beaker size={16} className={config.enabled ? 'text-violet-600' : 'text-gray-400'} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">A/B Testing</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {config.enabled
                ? `Enviando ${config.percent}% A / ${100 - config.percent}% B`
                : 'Teste duas variantes e escolha a vencedora automaticamente'}
            </p>
          </div>
        </div>
        <button
          onClick={toggle}
          className={cn(
            'relative w-10 h-6 rounded-full transition-colors',
            config.enabled ? 'bg-violet-500' : 'bg-gray-200'
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm',
              config.enabled && 'translate-x-4'
            )}
          />
        </button>
      </div>

      {config.enabled && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {/* Percent split */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                Distribuição
              </label>
              <span className="text-xs text-gray-500 tabular-nums">
                A: {config.percent}% · B: {100 - config.percent}%
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={90}
              step={10}
              value={config.percent}
              onChange={(e) => update({ percent: Number(e.target.value) })}
              className="w-full accent-violet-500"
            />
            <div className="flex items-center gap-1.5 mt-3">
              {[20, 30, 50, 70, 80].map((p) => (
                <button
                  key={p}
                  onClick={() => update({ percent: p })}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors',
                    config.percent === p
                      ? 'bg-violet-500 text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {p}/{100 - p}
                </button>
              ))}
            </div>
          </div>

          {/* Variant B content */}
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-violet-100 text-violet-700 text-[10px] font-bold">
                B
              </span>
              <span className="text-sm font-semibold text-gray-900">Variante B</span>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Assunto
              </label>
              <input
                type="text"
                value={config.variantB?.subject || ''}
                onChange={(e) =>
                  update({ variantB: { ...config.variantB, subject: e.target.value } })
                }
                placeholder={variantA.subject}
                className="w-full mt-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Variante A:{' '}
                <span className="font-medium text-gray-600">{variantA.subject || '—'}</span>
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Preheader (opcional)
              </label>
              <input
                type="text"
                value={config.variantB?.preheader || ''}
                onChange={(e) =>
                  update({ variantB: { ...config.variantB, preheader: e.target.value } })
                }
                placeholder="Preheader da variante B"
                className="w-full mt-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>
          </div>

          {/* Winner metric */}
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Target size={14} className="text-gray-400" />
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                Métrica vencedora
              </label>
            </div>
            <div className="space-y-2">
              {METRICS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => update({ winner_metric: m.value })}
                  className={cn(
                    'w-full flex items-start gap-3 p-3 text-left border rounded-lg transition-colors',
                    config.winner_metric === m.value
                      ? 'border-violet-500 bg-violet-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  )}
                >
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center',
                      config.winner_metric === m.value
                        ? 'border-violet-500 bg-violet-500'
                        : 'border-gray-300'
                    )}
                  >
                    {config.winner_metric === m.value && (
                      <CheckCircle size={10} className="text-white" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{m.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} className="text-gray-400" />
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                Tempo até escolher vencedor
              </label>
            </div>
            <div className="flex gap-1.5">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => update({ duration_hours: d.value })}
                  className={cn(
                    'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
                    config.duration_hours === d.value
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Após {config.duration_hours}h, a variante com melhor{' '}
              <strong className="text-gray-700">
                {METRICS.find((m) => m.value === config.winner_metric)?.label.toLowerCase()}
              </strong>{' '}
              será enviada aos contatos restantes automaticamente.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
