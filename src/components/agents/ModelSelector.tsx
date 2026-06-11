'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  ChevronDown,
  Check,
  Loader2,
  Sparkles,
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
  const [loading, setLoading] = useState(true)
  const [showDropdown, setShowDropdown] = useState(false)

  // Fetch models
  useEffect(() => {
    fetchModels()
  }, [])

  const fetchModels = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/models')
      if (res.ok) {
        const data = await res.json()
        setModels(data.models || [])
      }
    } catch (err) {
      console.error('Error fetching models:', err)
      // Fallback models
      setModels([
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', description: 'Rápido e econômico' },
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', description: 'Mais inteligente' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', description: 'Melhor custo-benefício' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', description: 'Equilíbrio perfeito' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', description: 'Mais poderoso' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', description: 'Contexto longo' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'google', description: 'Rápido' },
        { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B', provider: 'groq', description: 'Open source' },
        { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', provider: 'groq', description: 'MoE' },
      ])
    } finally {
      setLoading(false)
    }
  }

  // Get unique providers
  const providers = [...new Set(models.map(m => m.provider))]

  // Get models for selected provider
  const providerModels = models.filter(m => m.provider === provider)

  // Get current model info
  const currentModel = models.find(m => m.id === model)
  const currentProviderInfo = providerConfig[provider] || { name: provider, color: 'text-gray-500', bg: 'bg-gray-100' }

  return (
    <AgentsTheme className={`space-y-4 ${className}`}>
      {/* Provider Selection */}
      <div>
        <label className="label">Provedor</label>
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => {
            const info = providerConfig[p] || { name: p, color: 'text-gray-500', bg: 'bg-gray-100' }
            const isSelected = provider === p

            return (
              <button
                key={p}
                onClick={() => {
                  onProviderChange(p)
                  const firstModel = models.find(m => m.provider === p)
                  if (firstModel) onModelChange(firstModel.id)
                }}
                className={`chip ${isSelected ? 'chip-brand' : 'chip-outline'}`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                {info.name}
              </button>
            )
          })}
        </div>
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
