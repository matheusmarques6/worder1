'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  ChevronDown,
  Check,
  Loader2,
  Sparkles,
  Zap,
  DollarSign,
} from 'lucide-react'

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
  const currentProviderInfo = providerConfig[provider] || { name: provider, color: 'text-dark-400', bg: 'bg-dark-700' }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Provider Selection */}
      <div>
        <label className="block text-sm font-medium text-dark-300 mb-2">Provedor</label>
        <div className="flex flex-wrap gap-2">
          {providers.map((p) => {
            const info = providerConfig[p] || { name: p, color: 'text-dark-400', bg: 'bg-dark-700' }
            const isSelected = provider === p
            
            return (
              <button
                key={p}
                onClick={() => {
                  onProviderChange(p)
                  const firstModel = models.find(m => m.provider === p)
                  if (firstModel) onModelChange(firstModel.id)
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  isSelected
                    ? `${info.bg} ${info.color} border border-current/30`
                    : 'bg-dark-800/50 text-dark-400 border border-dark-700/50 hover:text-white hover:bg-dark-800'
                }`}
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
        <label className="block text-sm font-medium text-dark-300 mb-2">Modelo</label>
        
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 text-primary-400 animate-spin" />
          </div>
        ) : (
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full flex items-center justify-between px-4 py-3 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white hover:bg-dark-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg ${currentProviderInfo.bg} flex items-center justify-center`}>
                  <Brain className={`w-4 h-4 ${currentProviderInfo.color}`} />
                </div>
                <div className="text-left">
                  <p className="text-sm text-white">{currentModel?.name || model}</p>
                  {currentModel?.description && (
                    <p className="text-xs text-dark-500">{currentModel.description}</p>
                  )}
                </div>
              </div>
              <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {showDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute z-20 w-full mt-2 bg-dark-800 border border-dark-700 rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto"
                >
                  {providerModels.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        onModelChange(m.id)
                        setShowDropdown(false)
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        model === m.id
                          ? 'bg-primary-500/10 border-l-2 border-primary-500'
                          : 'hover:bg-dark-700/50 border-l-2 border-transparent'
                      }`}
                    >
                      <Brain className={`w-4 h-4 ${model === m.id ? 'text-primary-400' : 'text-dark-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white">{m.name}</p>
                        {m.description && (
                          <p className="text-xs text-dark-500 truncate">{m.description}</p>
                        )}
                      </div>
                      {m.context_window && (
                        <span className="text-xs text-dark-500">{(m.context_window / 1000).toFixed(0)}k</span>
                      )}
                      {model === m.id && (
                        <Check className="w-4 h-4 text-primary-400" />
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
            <label className="text-sm font-medium text-dark-300">Temperatura</label>
            <span className="text-sm text-primary-400">{temperature}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={temperature}
            onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
          />
          <div className="flex justify-between text-xs text-dark-500 mt-1">
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
    </div>
  )
}
