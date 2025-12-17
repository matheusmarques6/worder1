'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, Smartphone, Bot, Key, QrCode, Check, X, Loader2, Eye, EyeOff,
  Plus, Trash2, RefreshCw, Zap, Globe, MessageSquare, ChevronDown, Copy,
  Wifi, WifiOff, AlertCircle
} from 'lucide-react'

// Tipos
interface MetaConfig {
  id?: string
  phone_number_id: string
  waba_id: string
  access_token: string
  business_name?: string
  phone_number?: string
  is_active: boolean
}

interface AIConfig {
  id?: string
  provider: 'openai' | 'anthropic' | 'gemini' | 'deepseek'
  model: string
  api_key?: string
  system_prompt?: string
  temperature: number
  max_tokens: number
  is_active: boolean
}

interface Instance {
  id: string
  title: string
  unique_id: string
  phone_number?: string
  status: 'GENERATING' | 'ACTIVE' | 'INACTIVE' | 'BANNED'
  online_status: 'available' | 'unavailable'
  api_type: 'META' | 'EVOLUTION'
  qr_code?: string
  api_url?: string
}

const AI_MODELS = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o (Mais capaz)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Rápido)' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (Barato)' },
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (Rápido)' },
  ],
  gemini: [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek Chat' },
  ],
}

export default function WhatsAppSettingsPage() {
  const [activeTab, setActiveTab] = useState<'meta' | 'instances' | 'ai'>('meta')
  
  // Meta API State
  const [metaConfig, setMetaConfig] = useState<MetaConfig>({
    phone_number_id: '',
    waba_id: '',
    access_token: '',
    is_active: true
  })
  const [showToken, setShowToken] = useState(false)
  const [metaLoading, setMetaLoading] = useState(false)
  const [metaSaved, setMetaSaved] = useState(false)

  // AI State
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    max_tokens: 1000,
    is_active: true
  })
  const [aiLoading, setAiLoading] = useState(false)
  const [aiTesting, setAiTesting] = useState(false)
  const [aiTestResult, setAiTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)

  // Instances State
  const [instances, setInstances] = useState<Instance[]>([])
  const [instancesLoading, setInstancesLoading] = useState(true)
  const [showNewInstance, setShowNewInstance] = useState(false)
  const [newInstanceTitle, setNewInstanceTitle] = useState('')
  const [evolutionUrl, setEvolutionUrl] = useState('')
  const [evolutionKey, setEvolutionKey] = useState('')
  const [qrLoading, setQrLoading] = useState<string | null>(null)

  // Load data
  useEffect(() => {
    loadMetaConfig()
    loadAIConfig()
    loadInstances()
  }, [])

  // =============================================
  // META API
  // =============================================
  const loadMetaConfig = async () => {
    try {
      const res = await fetch('/api/whatsapp/templates?action=config')
      const data = await res.json()
      if (data.config) {
        setMetaConfig(data.config)
      }
    } catch (e) {
      console.error('Error loading meta config:', e)
    }
  }

  const saveMetaConfig = async () => {
    setMetaLoading(true)
    try {
      const res = await fetch('/api/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_config', ...metaConfig })
      })
      const data = await res.json()
      if (data.success) {
        setMetaSaved(true)
        setTimeout(() => setMetaSaved(false), 3000)
      }
    } catch (e) {
      console.error('Error saving meta config:', e)
    } finally {
      setMetaLoading(false)
    }
  }

  // =============================================
  // AI CONFIG
  // =============================================
  const loadAIConfig = async () => {
    try {
      const res = await fetch('/api/whatsapp/ai?organization_id=default')
      const data = await res.json()
      if (data.configs?.[0]) {
        setAiConfig(data.configs[0])
      }
    } catch (e) {
      console.error('Error loading AI config:', e)
    }
  }

  const saveAIConfig = async () => {
    setAiLoading(true)
    try {
      const res = await fetch('/api/whatsapp/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'create_config',
          organization_id: 'default',
          ...aiConfig,
          api_key: aiConfig.api_key
        })
      })
      await res.json()
    } catch (e) {
      console.error('Error saving AI config:', e)
    } finally {
      setAiLoading(false)
    }
  }

  const testAI = async () => {
    if (!aiConfig.api_key) {
      setAiTestResult({ success: false, message: 'API Key é obrigatória' })
      return
    }

    setAiTesting(true)
    setAiTestResult(null)
    
    try {
      const res = await fetch('/api/whatsapp/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          provider: aiConfig.provider,
          api_key: aiConfig.api_key,
          model: aiConfig.model,
          test_message: 'Olá! Este é um teste de conexão.'
        })
      })
      const data = await res.json()
      
      if (data.success) {
        setAiTestResult({ success: true, message: `Conexão OK! Resposta: "${data.response.slice(0, 100)}..."` })
      } else {
        setAiTestResult({ success: false, message: data.error || 'Erro ao conectar' })
      }
    } catch (e: any) {
      setAiTestResult({ success: false, message: e.message })
    } finally {
      setAiTesting(false)
    }
  }

  // =============================================
  // INSTANCES
  // =============================================
  const loadInstances = async () => {
    try {
      const res = await fetch('/api/whatsapp/instances?organization_id=default')
      const data = await res.json()
      setInstances(data.instances || [])
    } catch (e) {
      console.error('Error loading instances:', e)
    } finally {
      setInstancesLoading(false)
    }
  }

  const createInstance = async () => {
    if (!newInstanceTitle) return

    try {
      const res = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          organization_id: 'default',
          title: newInstanceTitle,
          api_type: 'EVOLUTION',
          api_url: evolutionUrl,
          api_key: evolutionKey
        })
      })
      const data = await res.json()
      
      if (data.instance) {
        setInstances([data.instance, ...instances])
        setShowNewInstance(false)
        setNewInstanceTitle('')
      }
    } catch (e) {
      console.error('Error creating instance:', e)
    }
  }

  const generateQR = async (instanceId: string) => {
    setQrLoading(instanceId)
    try {
      const res = await fetch('/api/whatsapp/instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'qr', id: instanceId })
      })
      const data = await res.json()
      
      if (data.qr_code) {
        setInstances(instances.map(i => 
          i.id === instanceId ? { ...i, qr_code: data.qr_code, status: 'GENERATING' } : i
        ))
      } else if (data.status === 'ACTIVE') {
        setInstances(instances.map(i => 
          i.id === instanceId ? { ...i, status: 'ACTIVE', phone_number: data.phone_number } : i
        ))
      }
    } catch (e) {
      console.error('Error generating QR:', e)
    } finally {
      setQrLoading(null)
    }
  }

  const deleteInstance = async (instanceId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta instância?')) return

    try {
      await fetch(`/api/whatsapp/instances?id=${instanceId}`, { method: 'DELETE' })
      setInstances(instances.filter(i => i.id !== instanceId))
    } catch (e) {
      console.error('Error deleting instance:', e)
    }
  }

  // Webhook URL
  const webhookUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/whatsapp/webhook?org=default`
    : ''

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Settings className="w-7 h-7 text-violet-400" />
            Configurações WhatsApp
          </h1>
          <p className="text-slate-400 mt-1">Configure suas integrações e automações</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'meta', label: 'Meta API', icon: Globe },
            { id: 'instances', label: 'QR Code', icon: QrCode },
            { id: 'ai', label: 'IA Chatbot', icon: Bot },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {/* META API TAB */}
          {activeTab === 'meta' && (
            <motion.div
              key="meta"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-green-500/20 rounded-xl">
                  <Globe className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Meta WhatsApp Business API</h2>
                  <p className="text-sm text-slate-400">Conexão oficial via Meta Business Suite</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Phone Number ID</label>
                  <input
                    type="text"
                    value={metaConfig.phone_number_id}
                    onChange={e => setMetaConfig({ ...metaConfig, phone_number_id: e.target.value })}
                    placeholder="Ex: 123456789012345"
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">WABA ID (Business Account)</label>
                  <input
                    type="text"
                    value={metaConfig.waba_id}
                    onChange={e => setMetaConfig({ ...metaConfig, waba_id: e.target.value })}
                    placeholder="Ex: 123456789012345"
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Access Token</label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={metaConfig.access_token}
                      onChange={e => setMetaConfig({ ...metaConfig, access_token: e.target.value })}
                      placeholder="EAAxxxxxxxx..."
                      className="w-full px-4 py-3 pr-12 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                    />
                    <button
                      onClick={() => setShowToken(!showToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showToken ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Webhook URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={webhookUrl}
                      readOnly
                      className="flex-1 px-4 py-3 bg-slate-800/30 border border-slate-700/50 rounded-xl text-slate-400"
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(webhookUrl)}
                      className="px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-slate-400 hover:text-white"
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Configure este URL no Meta Business Suite</p>
                </div>

                <button
                  onClick={saveMetaConfig}
                  disabled={metaLoading}
                  className="w-full py-3 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {metaLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : metaSaved ? (
                    <>
                      <Check className="w-5 h-5" />
                      Salvo!
                    </>
                  ) : (
                    'Salvar Configuração'
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* INSTANCES TAB */}
          {activeTab === 'instances' && (
            <motion.div
              key="instances"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Add New Instance */}
              {!showNewInstance ? (
                <button
                  onClick={() => setShowNewInstance(true)}
                  className="w-full p-4 border-2 border-dashed border-slate-700/50 rounded-2xl text-slate-400 hover:text-white hover:border-violet-500/50 flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Adicionar Conexão QR Code
                </button>
              ) : (
                <div className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Nova Conexão</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Nome da Instância</label>
                      <input
                        type="text"
                        value={newInstanceTitle}
                        onChange={e => setNewInstanceTitle(e.target.value)}
                        placeholder="Ex: WhatsApp Principal"
                        className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Evolution API URL</label>
                      <input
                        type="text"
                        value={evolutionUrl}
                        onChange={e => setEvolutionUrl(e.target.value)}
                        placeholder="Ex: https://evolution.seudominio.com"
                        className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Evolution API Key</label>
                      <input
                        type="password"
                        value={evolutionKey}
                        onChange={e => setEvolutionKey(e.target.value)}
                        placeholder="Sua API Key"
                        className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowNewInstance(false)}
                        className="flex-1 py-3 bg-slate-800/50 text-slate-300 font-medium rounded-xl hover:bg-slate-800"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={createInstance}
                        className="flex-1 py-3 bg-violet-600 text-white font-medium rounded-xl hover:bg-violet-700"
                      >
                        Criar Instância
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Instances List */}
              {instancesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
                </div>
              ) : instances.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <QrCode className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Nenhuma instância configurada</p>
                </div>
              ) : (
                instances.map(instance => (
                  <div key={instance.id} className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl ${instance.status === 'ACTIVE' ? 'bg-green-500/20' : 'bg-slate-800/50'}`}>
                          {instance.status === 'ACTIVE' ? (
                            <Wifi className="w-6 h-6 text-green-400" />
                          ) : (
                            <WifiOff className="w-6 h-6 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">{instance.title}</h3>
                          <p className="text-sm text-slate-400">
                            {instance.phone_number || instance.unique_id}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          instance.status === 'ACTIVE' 
                            ? 'bg-green-500/20 text-green-400' 
                            : instance.status === 'GENERATING'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-slate-700/50 text-slate-400'
                        }`}>
                          {instance.status}
                        </span>
                        <button
                          onClick={() => deleteInstance(instance.id)}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* QR Code */}
                    {instance.status !== 'ACTIVE' && (
                      <div className="mt-4">
                        {instance.qr_code ? (
                          <div className="flex flex-col items-center p-4 bg-white rounded-xl">
                            <img 
                              src={instance.qr_code.startsWith('data:') ? instance.qr_code : `data:image/png;base64,${instance.qr_code}`} 
                              alt="QR Code" 
                              className="w-64 h-64"
                            />
                            <p className="mt-2 text-sm text-slate-600">Escaneie com o WhatsApp</p>
                          </div>
                        ) : (
                          <button
                            onClick={() => generateQR(instance.id)}
                            disabled={qrLoading === instance.id}
                            className="w-full py-3 bg-violet-600 text-white font-medium rounded-xl hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {qrLoading === instance.id ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <>
                                <QrCode className="w-5 h-5" />
                                Gerar QR Code
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </motion.div>
          )}

          {/* AI TAB */}
          {activeTab === 'ai' && (
            <motion.div
              key="ai"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-violet-500/20 rounded-xl">
                  <Bot className="w-6 h-6 text-violet-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Chatbot com IA</h2>
                  <p className="text-sm text-slate-400">Configure respostas automáticas inteligentes</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Provedor de IA</label>
                  <select
                    value={aiConfig.provider}
                    onChange={e => setAiConfig({ 
                      ...aiConfig, 
                      provider: e.target.value as any,
                      model: AI_MODELS[e.target.value as keyof typeof AI_MODELS]?.[0]?.id || ''
                    })}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-violet-500/50"
                  >
                    <option value="openai">OpenAI (ChatGPT)</option>
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="gemini">Google (Gemini)</option>
                    <option value="deepseek">DeepSeek</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Modelo</label>
                  <select
                    value={aiConfig.model}
                    onChange={e => setAiConfig({ ...aiConfig, model: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-violet-500/50"
                  >
                    {AI_MODELS[aiConfig.provider]?.map(model => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">API Key</label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={aiConfig.api_key || ''}
                      onChange={e => setAiConfig({ ...aiConfig, api_key: e.target.value })}
                      placeholder={`Sua ${aiConfig.provider} API Key`}
                      className="w-full px-4 py-3 pr-12 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                    />
                    <button
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Prompt do Sistema</label>
                  <textarea
                    value={aiConfig.system_prompt || ''}
                    onChange={e => setAiConfig({ ...aiConfig, system_prompt: e.target.value })}
                    placeholder="Ex: Você é um assistente de atendimento amigável..."
                    rows={4}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Temperatura: {aiConfig.temperature}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={aiConfig.temperature}
                      onChange={e => setAiConfig({ ...aiConfig, temperature: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Max Tokens</label>
                    <input
                      type="number"
                      value={aiConfig.max_tokens}
                      onChange={e => setAiConfig({ ...aiConfig, max_tokens: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:border-violet-500/50"
                    />
                  </div>
                </div>

                {/* Test Result */}
                {aiTestResult && (
                  <div className={`p-4 rounded-xl ${aiTestResult.success ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                    <div className="flex items-start gap-2">
                      {aiTestResult.success ? (
                        <Check className="w-5 h-5 text-green-400 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                      )}
                      <p className={`text-sm ${aiTestResult.success ? 'text-green-400' : 'text-red-400'}`}>
                        {aiTestResult.message}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={testAI}
                    disabled={aiTesting || !aiConfig.api_key}
                    className="flex-1 py-3 bg-slate-800/50 text-white font-medium rounded-xl hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {aiTesting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Zap className="w-5 h-5" />
                        Testar Conexão
                      </>
                    )}
                  </button>
                  <button
                    onClick={saveAIConfig}
                    disabled={aiLoading}
                    className="flex-1 py-3 bg-violet-600 text-white font-medium rounded-xl hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {aiLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      'Salvar Configuração'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
