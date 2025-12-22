'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Copy,
  Settings,
} from 'lucide-react'
import { useAuthStore } from '@/stores'

// Importar componentes de integração específicos
import WhatsAppCloudConnect from '@/components/integrations/whatsapp/WhatsAppCloudConnect'
import EvolutionConnect from '@/components/integrations/whatsapp/EvolutionConnect'

interface Integration {
  id: string
  slug: string
  name: string
  short_description: string
  description: string
  icon_url: string
  color: string
  auth_type: string
}

interface InstalledIntegration {
  id: string
  integration_id: string
  status: string
  configuration: any
  webhook_url?: string
}

export default function IntegrationConfigPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuthStore()
  const slug = params.slug as string

  const [integration, setIntegration] = useState<Integration | null>(null)
  const [installed, setInstalled] = useState<InstalledIntegration | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'cloud' | 'evolution'>('cloud')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (slug) {
      loadIntegration()
    }
  }, [slug, user])

  const loadIntegration = async () => {
    try {
      setLoading(true)

      // Buscar integração pelo slug
      const intRes = await fetch(`/api/integrations?search=${slug}`)
      const intData = await intRes.json()
      const int = intData.integrations?.find((i: Integration) => i.slug === slug)

      if (!int) {
        setError('Integração não encontrada')
        return
      }

      setIntegration(int)

      // Buscar se já está instalada
      if (user?.organization_id) {
        const instRes = await fetch(`/api/integrations/installed?organizationId=${user.organization_id}`)
        const instData = await instRes.json()
        const inst = instData.installed?.find((i: any) => i.integration_id === int.id)
        setInstalled(inst || null)
      }
    } catch (err) {
      console.error('Error:', err)
      setError('Erro ao carregar integração')
    } finally {
      setLoading(false)
    }
  }

  const handleInstall = async () => {
    if (!user?.organization_id || !integration) return

    try {
      const res = await fetch('/api/integrations/installed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: user.organization_id,
          integrationId: integration.id,
        }),
      })

      if (res.ok) {
        loadIntegration()
      }
    } catch (err) {
      console.error('Error:', err)
    }
  }

  const copyWebhookUrl = () => {
    if (installed?.id) {
      const url = `${window.location.origin}/api/webhooks/${installed.id}`
      navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    )
  }

  if (error || !integration) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-lg text-dark-300">{error || 'Integração não encontrada'}</p>
          <button
            onClick={() => router.push('/integrations')}
            className="mt-4 px-4 py-2 bg-primary-500 rounded-xl text-white"
          >
            Voltar
          </button>
        </div>
      </div>
    )
  }

  // Renderizar componente específico baseado no slug
  const renderIntegrationContent = () => {
    switch (slug) {
      case 'whatsapp':
        return (
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex gap-2 p-1 bg-dark-800 rounded-xl w-fit">
              <button
                onClick={() => setActiveTab('cloud')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'cloud'
                    ? 'bg-primary-500 text-white'
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                API Oficial (Cloud)
              </button>
              <button
                onClick={() => setActiveTab('evolution')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'evolution'
                    ? 'bg-primary-500 text-white'
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                QR Code (Evolution)
              </button>
            </div>

            {/* Content */}
            <div className="bg-dark-800/50 border border-dark-700 rounded-2xl p-6">
              {activeTab === 'cloud' ? (
                <WhatsAppCloudConnect />
              ) : (
                <EvolutionConnect />
              )}
            </div>
          </div>
        )

      // Adicione outros casos conforme necessário
      case 'shopify':
      case 'google-forms':
      case 'google-sheets':
      case 'typeform':
      case 'facebook-leads':
      case 'hubspot':
      default:
        // Renderizar configuração genérica via webhook
        return (
          <div className="bg-dark-800/50 border border-dark-700 rounded-2xl p-6 space-y-6">
            <div className="flex items-center gap-4 mb-6">
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${integration.color}20` }}
              >
                {integration.icon_url ? (
                  <img src={integration.icon_url} alt="" className="w-10 h-10" />
                ) : (
                  <span style={{ color: integration.color }} className="text-2xl font-bold">
                    {integration.name[0]}
                  </span>
                )}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{integration.name}</h2>
                <p className="text-dark-400">{integration.short_description}</p>
              </div>
            </div>

            {!installed ? (
              <div className="text-center py-8">
                <p className="text-dark-400 mb-4">
                  Clique em instalar para começar a configurar esta integração.
                </p>
                <button
                  onClick={handleInstall}
                  className="px-6 py-3 bg-primary-500 hover:bg-primary-600 rounded-xl text-white font-medium"
                >
                  Instalar {integration.name}
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Status */}
                <div className="flex items-center gap-3">
                  <span className="text-dark-400">Status:</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    installed.status === 'active'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : installed.status === 'error'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-amber-500/20 text-amber-400'
                  }`}>
                    {installed.status === 'active' ? 'Ativo' : 
                     installed.status === 'error' ? 'Erro' : 'Configurando'}
                  </span>
                </div>

                {/* Webhook URL */}
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    URL do Webhook
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/api/webhooks/${installed.id}`}
                      className="flex-1 px-4 py-3 bg-dark-900 border border-dark-700 rounded-xl text-dark-300 text-sm font-mono"
                    />
                    <button
                      onClick={copyWebhookUrl}
                      className="px-4 py-3 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors flex items-center gap-2"
                    >
                      {copied ? (
                        <>
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                          Copiado!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copiar
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-dark-500 mt-2">
                    Configure esta URL nas configurações de webhook do {integration.name}
                  </p>
                </div>

                {/* Instructions */}
                <div className="p-4 bg-dark-900 rounded-xl">
                  <h3 className="font-semibold text-white mb-3">Como configurar:</h3>
                  <ol className="space-y-2 text-sm text-dark-400 list-decimal list-inside">
                    <li>Acesse as configurações do {integration.name}</li>
                    <li>Vá para a seção de Webhooks ou Integrações</li>
                    <li>Cole a URL do webhook acima</li>
                    <li>Selecione os eventos que deseja receber</li>
                    <li>Salve e ative o webhook</li>
                  </ol>
                </div>

                {/* Documentation Link */}
                <a
                  href="#"
                  className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  Ver documentação completa
                </a>
              </div>
            )}
          </div>
        )
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push('/integrations')}
            className="p-2 hover:bg-dark-800 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-dark-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">
              Configurar {integration.name}
            </h1>
            <p className="text-dark-400">{integration.short_description}</p>
          </div>
        </div>

        {/* Content */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {renderIntegrationContent()}
        </motion.div>
      </div>
    </div>
  )
}
