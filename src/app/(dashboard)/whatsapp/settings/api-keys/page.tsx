'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Key,
  Plus,
  Trash2,
  Check,
  X,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Loader2,
  ExternalLink,
  Copy,
  Info,
  Zap,
  DollarSign,
  Clock,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'

interface ApiKey {
  id: string
  provider: string
  api_key_hint: string
  is_active: boolean
  is_valid: boolean
  last_validated_at?: string
  total_requests: number
  total_tokens_used: number
  last_used_at?: string
  created_at: string
}

const providerConfig: Record<string, {
  name: string
  color: string
  bgColor: string
  icon: string
  docsUrl: string
  createKeyUrl: string
  description: string
}> = {
  openai: {
    name: 'OpenAI',
    color: 'text-green-400',
    bgColor: 'bg-green-500/20',
    icon: '🤖',
    docsUrl: 'https://platform.openai.com/docs',
    createKeyUrl: 'https://platform.openai.com/api-keys',
    description: 'GPT-5.2, GPT-5.1, GPT-5, GPT-5 Pro/Mini/Nano',
  },
  anthropic: {
    name: 'Anthropic',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/20',
    icon: '🧠',
    docsUrl: 'https://docs.anthropic.com',
    createKeyUrl: 'https://console.anthropic.com/settings/keys',
    description: 'Claude Opus 4.5, Sonnet 4.5, Haiku 4.5',
  },
  google: {
    name: 'Google AI',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/20',
    icon: '✨',
    docsUrl: 'https://ai.google.dev/docs',
    createKeyUrl: 'https://aistudio.google.com/app/apikey',
    description: 'Gemini 2.0 Flash, Gemini 1.5 Pro/Flash',
  },
  groq: {
    name: 'Groq',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/20',
    icon: '⚡',
    docsUrl: 'https://console.groq.com/docs',
    createKeyUrl: 'https://console.groq.com/keys',
    description: 'Llama 3.3 70B, Llama 3.2 Vision (Ultra-rápido)',
  },
  mistral: {
    name: 'Mistral',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/20',
    icon: '🌀',
    docsUrl: 'https://docs.mistral.ai',
    createKeyUrl: 'https://console.mistral.ai/api-keys',
    description: 'Mistral Large, Codestral',
  },
  deepseek: {
    name: 'DeepSeek',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/20',
    icon: '🔍',
    docsUrl: 'https://platform.deepseek.com/docs',
    createKeyUrl: 'https://platform.deepseek.com/api_keys',
    description: 'DeepSeek V3, DeepSeek R1 (Muito barato)',
  },
  xai: {
    name: 'xAI',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/20',
    icon: '𝕏',
    docsUrl: 'https://docs.x.ai',
    createKeyUrl: 'https://console.x.ai',
    description: 'Grok 2, Grok 2 Vision',
  },
  cohere: {
    name: 'Cohere',
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/20',
    icon: '🔗',
    docsUrl: 'https://docs.cohere.com',
    createKeyUrl: 'https://dashboard.cohere.com/api-keys',
    description: 'Command R+, RAG integrado',
  },
  together: {
    name: 'Together AI',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
    icon: '🤝',
    docsUrl: 'https://docs.together.ai',
    createKeyUrl: 'https://api.together.xyz/settings/api-keys',
    description: 'Llama, Qwen, Mixtral',
  },
  openrouter: {
    name: 'OpenRouter',
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/20',
    icon: '🌐',
    docsUrl: 'https://openrouter.ai/docs',
    createKeyUrl: 'https://openrouter.ai/keys',
    description: 'Acesso a todos os modelos',
  },
  perplexity: {
    name: 'Perplexity',
    color: 'text-sky-400',
    bgColor: 'bg-sky-500/20',
    icon: '🔎',
    docsUrl: 'https://docs.perplexity.ai',
    createKeyUrl: 'https://www.perplexity.ai/settings/api',
    description: 'Pesquisa na web em tempo real',
  },
  ollama: {
    name: 'Ollama',
    color: 'text-gray-900',
    bgColor: 'bg-white/20',
    icon: '🦙',
    docsUrl: 'https://ollama.ai/docs',
    createKeyUrl: 'https://ollama.ai/download',
    description: 'Modelos locais (grátis)',
  },
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)

  const fetchApiKeys = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/api-keys')
      const data = await res.json()
      setApiKeys(data.keys || [])
    } catch (error) {
      console.error('Error fetching API keys:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchApiKeys()
  }, [])

  const handleDelete = async (provider: string) => {
    if (!confirm(`Tem certeza que deseja remover a API key do ${providerConfig[provider]?.name || provider}?`)) return

    try {
      const res = await fetch(`/api/api-keys?provider=${provider}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        fetchApiKeys()
      }
    } catch (error) {
      console.error('Error deleting API key:', error)
    }
  }

  // Providers configurados
  const configuredProviders = apiKeys.map(k => k.provider)
  
  // Providers disponíveis para adicionar
  const availableProviders = Object.keys(providerConfig).filter(
    p => !configuredProviders.includes(p)
  )

  return (
    <div className="min-h-screen bg-white p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-gray-500 text-sm mb-2">
          <Link href="/whatsapp/settings" className="hover:text-white">Configurações</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-900">API Keys</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
            <p className="text-gray-500 mt-1">
              Configure suas chaves de API para usar modelos de IA
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            disabled={availableProviders.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 disabled:from-dark-600 disabled:to-dark-600 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
            Adicionar Key
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="mb-6 p-4 rounded-xl bg-brand-50 border border-primary-500/20">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-brand-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-brand-500 font-medium mb-1">Como funciona</p>
            <p className="text-brand-600/80">
              Você usa suas próprias API keys e paga diretamente aos providers (OpenAI, Anthropic, etc).
              A Worder não cobra nada pelo uso de IA - você tem controle total sobre seus custos.
            </p>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Configured Keys */}
          {apiKeys.map((key) => {
            const config = providerConfig[key.provider] || {
              name: key.provider,
              color: 'text-gray-400',
              bgColor: 'bg-gray-500/20',
              icon: '🔑',
              description: '',
            }

            return (
              <motion.div
                key={key.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-gray-50 border rounded-xl p-5 ${
                  key.is_valid ? 'border-gray-200' : 'border-red-500/50'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl ${config.bgColor} flex items-center justify-center text-2xl`}>
                      {config.icon}
                    </div>
                    <div>
                      <h3 className={`font-medium ${config.color}`}>{config.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {key.is_valid ? (
                          <span className="flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle className="w-3 h-3" />
                            Válida
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-red-400">
                            <AlertCircle className="w-3 h-3" />
                            Inválida
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(key.provider)}
                    className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Key hint */}
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <code className="text-sm text-gray-600 font-mono">{key.api_key_hint}</code>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <p className="text-lg font-semibold text-gray-900">
                      {key.total_requests.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400">Requests</p>
                  </div>
                  <div className="text-center p-2 bg-gray-50 rounded-lg">
                    <p className="text-lg font-semibold text-gray-900">
                      {(key.total_tokens_used / 1000).toFixed(1)}K
                    </p>
                    <p className="text-xs text-gray-400">Tokens</p>
                  </div>
                </div>

                {/* Last used */}
                {key.last_used_at && (
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    Último uso: {new Date(key.last_used_at).toLocaleDateString('pt-BR')}
                  </div>
                )}

                {/* Update button */}
                <button
                  onClick={() => {
                    setSelectedProvider(key.provider)
                    setShowAddModal(true)
                  }}
                  className="w-full mt-4 py-2 rounded-lg bg-gray-100 text-gray-600 hover:text-white hover:bg-gray-100 transition-colors text-sm"
                >
                  Atualizar Key
                </button>
              </motion.div>
            )
          })}

          {/* Add New Card */}
          {availableProviders.length > 0 && (
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-5 hover:border-brand-400 hover:bg-gray-50 transition-all group min-h-[200px] flex flex-col items-center justify-center"
            >
              <div className="w-12 h-12 rounded-xl bg-gray-100 group-hover:bg-brand-100 flex items-center justify-center mb-3 transition-colors">
                <Plus className="w-6 h-6 text-gray-500 group-hover:text-brand-600" />
              </div>
              <p className="text-gray-500 group-hover:text-gray-900 font-medium">Adicionar API Key</p>
              <p className="text-xs text-gray-400 mt-1">
                {availableProviders.length} providers disponíveis
              </p>
            </button>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && apiKeys.length === 0 && (
        <div className="text-center py-12">
          <div className="w-20 h-20 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-4">
            <Key className="w-10 h-10 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhuma API key configurada</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Configure suas API keys para usar agentes de IA. Você paga diretamente aos providers.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 text-white rounded-xl font-medium transition-all"
          >
            <Plus className="w-5 h-5" />
            Adicionar Primeira Key
          </button>
        </div>
      )}

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddApiKeyModal
            selectedProvider={selectedProvider}
            availableProviders={selectedProvider ? [selectedProvider] : availableProviders}
            onClose={() => {
              setShowAddModal(false)
              setSelectedProvider(null)
            }}
            onSuccess={() => {
              setShowAddModal(false)
              setSelectedProvider(null)
              fetchApiKeys()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// Add API Key Modal
function AddApiKeyModal({
  selectedProvider,
  availableProviders,
  onClose,
  onSuccess,
}: {
  selectedProvider: string | null
  availableProviders: string[]
  onClose: () => void
  onSuccess: () => void
}) {
  const [provider, setProvider] = useState(selectedProvider || '')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [validation, setValidation] = useState<{ valid: boolean; error?: string } | null>(null)

  const handleSubmit = async () => {
    if (!provider || !apiKey) {
      setError('Selecione um provider e insira a API key')
      return
    }

    setLoading(true)
    setError('')
    setValidation(null)

    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: apiKey }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar API key')
      }

      setValidation(data.validation)

      if (data.validation?.valid) {
        setTimeout(onSuccess, 1500)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const config = provider ? providerConfig[provider] : null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {selectedProvider ? 'Atualizar API Key' : 'Adicionar API Key'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)] space-y-4">
          {/* Provider Selection */}
          {!selectedProvider && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                Provider
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {availableProviders.map((p) => {
                  const cfg = providerConfig[p]
                  if (!cfg) return null
                  return (
                    <button
                      key={p}
                      onClick={() => setProvider(p)}
                      className={`p-3 rounded-xl border transition-all text-left ${
                        provider === p
                          ? 'border-primary-500 bg-brand-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{cfg.icon}</span>
                        <div>
                          <p className={`text-sm font-medium ${cfg.color}`}>{cfg.name}</p>
                          <p className="text-xs text-gray-400 truncate">{cfg.description}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Provider Info */}
          {config && (
            <div className={`p-4 rounded-xl ${config.bgColor} border border-${config.color.replace('text-', '')}/20`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl">{config.icon}</span>
                <div>
                  <h3 className={`font-medium ${config.color}`}>{config.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{config.description}</p>
                  <div className="flex gap-3 mt-2">
                    <a
                      href={config.createKeyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-600 hover:text-brand-500 flex items-center gap-1"
                    >
                      Criar API Key <ExternalLink className="w-3 h-3" />
                    </a>
                    <a
                      href={config.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-500 hover:text-white flex items-center gap-1"
                    >
                      Documentação <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* API Key Input */}
          {provider && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Cole sua ${config?.name || provider} API key aqui`}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-dark-500 focus:outline-none focus:border-brand-400 pr-12 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}

          {/* Validation Result */}
          {validation && (
            <div className={`p-4 rounded-xl ${
              validation.valid 
                ? 'bg-green-500/10 border border-green-500/20' 
                : 'bg-red-500/10 border border-red-500/20'
            }`}>
              <div className="flex items-center gap-2">
                {validation.valid ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-green-400 font-medium">API key válida!</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <span className="text-red-400">{validation.error || 'API key inválida'}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading || !provider || !apiKey}
            className="w-full py-3 bg-gradient-to-r from-primary-500 to-accent-500 hover:from-primary-600 hover:to-accent-600 disabled:from-dark-600 disabled:to-dark-600 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Validando...
              </>
            ) : validation?.valid ? (
              <>
                <CheckCircle className="w-5 h-5" />
                Salvo!
              </>
            ) : (
              <>
                <Key className="w-5 h-5" />
                Salvar API Key
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
