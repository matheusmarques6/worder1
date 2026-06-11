'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  ChevronDown,
  Check,
  Loader2,
  Sparkles,
  KeyRound,
  AlertTriangle,
} from 'lucide-react'
import { AgentsTheme } from './ui/AgentsTheme'

export interface LLMModel {
  id: string
  name: string
  provider: string
  description?: string
  context_window?: number
  input_price?: number
  output_price?: number
  is_available?: boolean
}

interface ModelSelectorProps {
  provider: string
  model: string
  onProviderChange: (provider: string) => void
  onModelChange: (model: string) => void
  temperature?: number
  onTemperatureChange?: (temp: number) => void
  showTemperature?: boolean
  className?: string
}

const providerConfig: Record<string, { name: string; color: string; bg: string }> = {
  openai: { name: 'OpenAI', color: 'text-green-400', bg: 'bg-green-500/20' },
  anthropic: { name: 'Anthropic', color: 'text-orange-400', bg: 'bg-orange-500/20' },
  google: { name: 'Google', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  groq: { name: 'Groq', color: 'text-purple-400', bg: 'bg-purple-500/20' },
  together: { name: 'Together', color: 'text-pink-400', bg: 'bg-pink-500/20' },
  mistral: { name: 'Mistral', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  openrouter: { name: 'OpenRouter', color: 'text-indigo-400', bg: 'bg-indigo-500/20' },
}

// Aliases — UI/db normaliza 'gemini' como 'google'. Se vier um, conta pelos dois.
const PROVIDER_ALIASES: Record<string, string[]> = {
  google: ['google', 'gemini'],
  gemini: ['gemini', 'google'],
}

function expandConfigured(set: Set<string>): Set<string> {
  const out = new Set<string>(set)
  for (const p of set) {
    for (const alias of PROVIDER_ALIASES[p] || []) out.add(alias)
  }
  return out
}

export default function ModelSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  temperature = 0.7,
  onTemperatureChange,
  showTemperature = true,
  className = '',
}: ModelSelectorProps) {
  const [models, setModels] = useState<LLMModel[]>([])
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    Promise.all([fetchModels(), fetchConfiguredProviders()]).finally(() => setLoading(false))
  }, [])

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/ai/models')
      if (res.ok) {
        const data = await res.json()
        setModels(data.models || [])
      }
    } catch (err) {
      console.error('Error fetching models:', err)
      // Fallback models — usados apenas quando a API falha.
      setModels([
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', description: 'Rápido e econômico' },
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: 'Mais inteligente' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', description: 'Equilíbrio perfeito' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google', description: 'Rápido' },
      ])
    }
  }

  // Lista os providers que ja tem chave cadastrada/valida em
  // organization_api_keys (UI Configurações → API Keys).
  const fetchConfiguredProviders = async () => {
    try {
      const res = await fetch('/api/api-keys')
      if (res.ok) {
        const data = await res.json()
        const active = (data.keys || [])
          .filter((k: any) => k.is_active !== false && k.is_valid !== false)
          .map((k: any) => k.provider as string)
        setConfiguredProviders(expandConfigured(new Set(active)))
      }
    } catch (err) {
      console.error('Error fetching configured api keys:', err)
    }
  }

  // Providers oferecidos = intersecao (modelos cadastrados) ∩ (chaves configuradas).
  // Inclui o provider atual mesmo sem chave (pra nao virar undefined no agente
  // ja salvo) com flag visual.
  const allProvidersFromModels = [...new Set(models.map((m) => m.provider))]
  const providers = allProvidersFromModels.filter(
    (p) => configuredProviders.has(p) || p === provider,
  )
  const hasAnyConfigured = configuredProviders.size > 0
  const currentProviderHasKey = configuredProviders.has(provider)

  // Get models for selected provider
  const providerModels = models.filter(m => m.provider === provider)

  // Get current model info
  const currentModel = models.find(m => m.id === model)
  const currentProviderInfo = providerConfig[provider] || { name: provider, color: 'text-gray-500', bg: 'bg-gray-100' }

  return (
    <AgentsTheme className={`space-y-4 ${className}`}>
      {/* Aviso global: nenhuma chave configurada ainda */}
      {!hasAnyConfigured && (
        <div className="callout" style={{ borderColor: 'var(--amber)', background: 'var(--amber-tint)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--amber)' }} />
          <div className="flex-1">
            <p style={{ color: 'var(--text)' }}>
              <strong>Nenhuma chave de IA configurada.</strong> Cadastre uma em{' '}
              <a
                href="/whatsapp/ai-agents?tab=api-keys"
                style={{ color: 'var(--brand-ink)', textDecoration: 'underline' }}
              >
                Configurações → API Keys
              </a>{' '}
              antes de ativar o agente.
            </p>
          </div>
        </div>
      )}

      {/* Aviso pontual: provider atual sem chave (agente salvo apontando pra provedor descadastrado) */}
      {hasAnyConfigured && !currentProviderHasKey && (
        <div className="callout" style={{ borderColor: 'var(--red)', background: 'var(--red-tint)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--red)' }} />
          <div className="flex-1">
            <p style={{ color: 'var(--text)' }}>
              O provedor <strong>{providerConfig[provider]?.name || provider}</strong> nao tem chave ativa.
              Escolha um provedor configurado abaixo ou cadastre a chave em{' '}
              <a
                href="/whatsapp/ai-agents?tab=api-keys"
                style={{ color: 'var(--brand-ink)', textDecoration: 'underline' }}
              >
                Configurações → API Keys
              </a>.
            </p>
          </div>
        </div>
      )}

      {/* Provider Selection */}
      <div>
        <label className="label">Provedor</label>
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => {
            const info = providerConfig[p] || { name: p, color: 'text-gray-500', bg: 'bg-gray-100' }
            const isSelected = provider === p
            const hasKey = configuredProviders.has(p)

            return (
              <button
                key={p}
                onClick={() => {
                  onProviderChange(p)
                  const firstModel = models.find(m => m.provider === p)
                  if (firstModel) onModelChange(firstModel.id)
                }}
                className={`chip ${isSelected ? 'chip-brand' : 'chip-outline'}`}
                title={hasKey ? `${info.name} — chave configurada` : `${info.name} — sem chave (cadastre em API Keys)`}
              >
                {hasKey ? (
                  <KeyRound className="w-3.5 h-3.5" style={{ color: 'var(--green)' }} />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {info.name}
                {!hasKey && (
                  <span className="text-xs" style={{ color: 'var(--text-3)', marginLeft: 4 }}>
                    sem chave
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {providers.length === 0 && !loading && (
          <p className="text-xs" style={{ color: 'var(--text-3)', marginTop: 8 }}>
            Nenhum provedor disponivel. Cadastre uma chave em Configurações → API Keys.
          </p>
        )}
      </div>

      {/* Model Selection */}
      <div>
        <label className="label">Modelo</label>

        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--brand)' }} />
          </div>
        ) : (
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="model-row w-full"
            >
              <div className="model-logo" style={{ background: 'var(--brand)' }}>
                <Brain className="w-4 h-4" />
              </div>
              <div className="text-left flex-1">
                <p className="model-name">{currentModel?.name || model}</p>
                {currentModel?.description && (
                  <p className="model-desc">{currentModel.description}</p>
                )}
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`} style={{ color: 'var(--text-3)' }} />
            </button>

            <AnimatePresence>
              {showDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="menu absolute z-20 w-full mt-2 max-h-64 overflow-y-auto"
                >
                  {providerModels.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        onModelChange(m.id)
                        setShowDropdown(false)
                      }}
                      className="w-full flex items-center gap-3"
                    >
                      <Brain className="w-4 h-4" style={{ color: model === m.id ? 'var(--brand)' : 'var(--text-4)' }} />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm" style={{ color: 'var(--text)' }}>{m.name}</p>
                        {m.description && (
                          <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>{m.description}</p>
                        )}
                      </div>
                      {m.context_window && (
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>{(m.context_window / 1000).toFixed(0)}k</span>
                      )}
                      {model === m.id && (
                        <Check className="w-4 h-4" style={{ color: 'var(--brand)' }} />
                      )}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Temperature Slider */}
      {showTemperature && onTemperatureChange && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label" style={{ marginBottom: 0 }}>Temperatura</label>
            <span className="text-sm" style={{ color: 'var(--brand-ink)' }}>{temperature}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={temperature}
            onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
            className="range"
          />
          <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-3)' }}>
            <span>Preciso</span>
            <span>Criativo</span>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </AgentsTheme>
  )
}
