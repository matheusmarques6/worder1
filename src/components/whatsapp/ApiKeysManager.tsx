'use client'

// =============================================
// WORDER: API Keys Manager
// Vive DENTRO do drawer "Motor & budget" da radial (único consumidor desde
// a 10.3) — uma coluna estreita, então o layout é lista vertical: header
// magro, cards empilhados. Nada de page/ph/grid por breakpoint de viewport,
// que num drawer de ~360px viravam mosaico quebrado.
// SÓ-UI — handlers/fetch/state inalterados.
// =============================================

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Key, Plus, Trash2, X, AlertCircle, CheckCircle, Eye, EyeOff, Loader2,
  ExternalLink, Info, Clock,
} from 'lucide-react'

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
  icon: string
  docsUrl: string
  createKeyUrl: string
  description: string
}> = {
  openai: { name: 'OpenAI', icon: '🤖', docsUrl: 'https://platform.openai.com/docs', createKeyUrl: 'https://platform.openai.com/api-keys', description: 'GPT-5.2, GPT-5.1, GPT-5, GPT-5 Pro/Mini/Nano' },
  anthropic: { name: 'Anthropic', icon: '🧠', docsUrl: 'https://docs.anthropic.com', createKeyUrl: 'https://console.anthropic.com/settings/keys', description: 'Claude Opus 4.5, Sonnet 4.5, Haiku 4.5' },
  google: { name: 'Google AI', icon: '✨', docsUrl: 'https://ai.google.dev/docs', createKeyUrl: 'https://aistudio.google.com/app/apikey', description: 'Gemini 2.0 Flash, Gemini 1.5 Pro/Flash' },
  groq: { name: 'Groq', icon: '⚡', docsUrl: 'https://console.groq.com/docs', createKeyUrl: 'https://console.groq.com/keys', description: 'Llama 3.3 70B, Llama 3.2 Vision (Ultra-rápido)' },
  mistral: { name: 'Mistral', icon: '🌀', docsUrl: 'https://docs.mistral.ai', createKeyUrl: 'https://console.mistral.ai/api-keys', description: 'Mistral Large, Codestral' },
  deepseek: { name: 'DeepSeek', icon: '🔍', docsUrl: 'https://platform.deepseek.com/docs', createKeyUrl: 'https://platform.deepseek.com/api_keys', description: 'DeepSeek V3, DeepSeek R1 (Muito barato)' },
  xai: { name: 'xAI', icon: '𝕏', docsUrl: 'https://docs.x.ai', createKeyUrl: 'https://console.x.ai', description: 'Grok 2, Grok 2 Vision' },
  cohere: { name: 'Cohere', icon: '🔗', docsUrl: 'https://docs.cohere.com', createKeyUrl: 'https://dashboard.cohere.com/api-keys', description: 'Command R+, RAG integrado' },
  together: { name: 'Together AI', icon: '🤝', docsUrl: 'https://docs.together.ai', createKeyUrl: 'https://api.together.xyz/settings/api-keys', description: 'Llama, Qwen, Mixtral' },
  openrouter: { name: 'OpenRouter', icon: '🌐', docsUrl: 'https://openrouter.ai/docs', createKeyUrl: 'https://openrouter.ai/keys', description: 'Acesso a todos os modelos' },
  perplexity: { name: 'Perplexity', icon: '🔎', docsUrl: 'https://docs.perplexity.ai', createKeyUrl: 'https://www.perplexity.ai/settings/api', description: 'Pesquisa na web em tempo real' },
  ollama: { name: 'Ollama', icon: '🦙', docsUrl: 'https://ollama.ai/docs', createKeyUrl: 'https://ollama.ai/download', description: 'Modelos locais (grátis)' },
}

export default function ApiKeysManager() {
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
      const res = await fetch(`/api/api-keys?provider=${provider}`, { method: 'DELETE' })
      if (res.ok) fetchApiKeys()
    } catch (error) {
      console.error('Error deleting API key:', error)
    }
  }

  const configuredProviders = apiKeys.map(k => k.provider)
  const availableProviders = Object.keys(providerConfig).filter(p => !configuredProviders.includes(p))

  return (
    <div>
      {/* Header magro — o título da área quem dá é o drawer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800 }}>
          <Key size={15} style={{ color: 'var(--text-3)' }} />
          API Keys
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          disabled={availableProviders.length === 0}
          className="btn btn-primary btn-sm"
        >
          <Plus />
          Adicionar
        </button>
      </div>

      {/* Info callout */}
      <div className="callout brand" style={{ flexDirection: 'column', gap: 4, marginBottom: 14 }}>
        <p style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Info className="w-4 h-4" />
          Como funciona
        </p>
        <p>
          Voce usa suas proprias API keys e paga diretamente aos providers (OpenAI, Anthropic, etc).
          A Worder nao cobra nada pelo uso de IA - voce tem controle total sobre seus custos.
        </p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0' }}>
          <Loader2 className="animate-spin" style={{ width: 26, height: 26, color: 'var(--brand)' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {apiKeys.map((key) => {
              const config = providerConfig[key.provider] || {
                name: key.provider, icon: '🔑', description: '', docsUrl: '', createKeyUrl: '',
              }
              return (
                <motion.div
                  key={key.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card"
                  style={{ padding: 18, borderColor: key.is_valid ? undefined : 'var(--red)' }}
                >
                  <div className="flex items-start justify-between" style={{ marginBottom: 16 }}>
                    <div className="flex items-center gap-3">
                      <div
                        className="agent-av"
                        style={{ background: 'var(--surface-3)', fontSize: 22 }}
                      >
                        {config.icon}
                      </div>
                      <div>
                        <h3 className="agent-name">{config.name}</h3>
                        <div style={{ marginTop: 4 }}>
                          {key.is_valid ? (
                            <span className="chip chip-green" style={{ height: 22 }}>
                              <CheckCircle className="w-3 h-3" />
                              Valida
                            </span>
                          ) : (
                            <span className="chip chip-red" style={{ height: 22 }}>
                              <AlertCircle className="w-3 h-3" />
                              Invalida
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(key.provider)}
                      className="btn btn-soft btn-icon btn-sm"
                      title="Remover"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div
                    style={{
                      marginBottom: 14,
                      padding: '10px 12px',
                      background: 'var(--surface-3)',
                      borderRadius: 10,
                    }}
                  >
                    <code style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--text-2)' }}>{key.api_key_hint}</code>
                  </div>

                  <div className="grid grid-cols-2 gap-3" style={{ marginBottom: 14 }}>
                    <div className="tile" style={{ textAlign: 'center', padding: '10px 12px' }}>
                      <p className="tile-v" style={{ fontSize: 18 }}>{key.total_requests.toLocaleString()}</p>
                      <p className="tile-k">Requests</p>
                    </div>
                    <div className="tile" style={{ textAlign: 'center', padding: '10px 12px' }}>
                      <p className="tile-v" style={{ fontSize: 18 }}>{(key.total_tokens_used / 1000).toFixed(1)}K</p>
                      <p className="tile-k">Tokens</p>
                    </div>
                  </div>

                  {key.last_used_at && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-3)' }}>
                      <Clock className="w-3 h-3" />
                      Ultimo uso: {new Date(key.last_used_at).toLocaleDateString('pt-BR')}
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setSelectedProvider(key.provider)
                      setShowAddModal(true)
                    }}
                    className="btn btn-soft btn-block btn-sm"
                    style={{ marginTop: 16 }}
                  >
                    Atualizar Key
                  </button>
                </motion.div>
              )
            })}

          {apiKeys.length > 0 && availableProviders.length > 0 && (
            <button
              onClick={() => setShowAddModal(true)}
              className="kb-add"
              style={{ flexDirection: 'row', minHeight: 52, gap: 10, justifyContent: 'center' }}
            >
              <div className="act-ico" style={{ width: 30, height: 30, background: 'var(--brand-tint)', color: 'var(--brand)' }}>
                <Plus className="w-4 h-4" />
              </div>
              <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 12.5 }}>
                Adicionar API Key
                <span style={{ fontWeight: 500, color: 'var(--text-3)' }}> · {availableProviders.length} providers</span>
              </p>
            </button>
          )}
        </div>
      )}

      {!loading && apiKeys.length === 0 && (
        <div style={{ textAlign: 'center', padding: '18px 8px 6px' }}>
          <div className="empty-ico" style={{ margin: '0 auto 10px' }}>
            <Key />
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>Nenhuma API key configurada</div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '5px 0 12px' }}>
            Configure suas API keys para usar agentes de IA. Voce paga diretamente aos providers.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-primary btn-sm"
          >
            <Plus />
            Adicionar Primeira Key
          </button>
        </div>
      )}

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
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar API key')
      setValidation(data.validation)
      if (data.validation?.valid) setTimeout(onSuccess, 1500)
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
      className="modal-overlay"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 className="modal-title">
            {selectedProvider ? 'Atualizar API Key' : 'Adicionar API Key'}
          </h2>
          <button onClick={onClose} className="modal-x">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="modal-body space-y-4">
          {!selectedProvider && (
            <div>
              <label className="label">Provider</label>
              <div className="grid grid-cols-2 gap-2" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {availableProviders.map((p) => {
                  const cfg = providerConfig[p]
                  if (!cfg) return null
                  return (
                    <button
                      key={p}
                      onClick={() => setProvider(p)}
                      className={`selcard${provider === p ? ' on' : ''}`}
                      style={{ padding: 12 }}
                    >
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 20 }}>{cfg.icon}</span>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700 }}>{cfg.name}</p>
                          <p className="truncate" style={{ fontSize: 11, color: 'var(--text-3)' }}>{cfg.description}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {config && (
            <div className="callout brand" style={{ alignItems: 'flex-start' }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{config.icon}</span>
              <div>
                <h3 style={{ fontWeight: 700 }}>{config.name}</h3>
                <p style={{ marginTop: 2 }}>{config.description}</p>
                <div className="flex gap-3" style={{ marginTop: 8 }}>
                  <a href={config.createKeyUrl} target="_blank" rel="noopener noreferrer"
                     style={{ fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Criar API Key <ExternalLink className="w-3 h-3" />
                  </a>
                  <a href={config.docsUrl} target="_blank" rel="noopener noreferrer"
                     style={{ fontSize: 11.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-3)' }}>
                    Documentacao <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {provider && (
            <div>
              <label className="label">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={`Cole sua ${config?.name || provider} API key aqui`}
                  className="field"
                  style={{ paddingRight: 44, fontFamily: 'var(--mono)' }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', background: 'none', border: 'none' }}
                >
                  {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}

          {validation && (
            <div className={`callout ${validation.valid ? 'green' : 'red'}`}>
              {validation.valid ? (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span style={{ fontWeight: 700 }}>API key valida!</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5" />
                  <span>{validation.error || 'API key invalida'}</span>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="callout red">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !provider || !apiKey}
            className="btn btn-primary btn-block btn-lg"
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
