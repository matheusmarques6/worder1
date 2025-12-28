'use client'

// =============================================
// Shopify Config Modal (Simplificado)
// src/components/integrations/shopify/ShopifyConfigModal.tsx
//
// Modal de configuração da integração Shopify
// Foco em: Status da conexão, webhooks, credenciais e tags
// Automações de deals são configuradas em CRM > Automações
// =============================================

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  CheckCircle,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Trash2,
  Plus,
  Zap,
  ShoppingCart,
  Users,
  Package,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { WebhookStatusTable } from '../WebhookStatusTable'

// =============================================
// TYPES
// =============================================

interface ShopifyStore {
  id: string
  name: string
  domain: string
  email?: string
  connectionStatus: 'active' | 'warning' | 'error'
  statusMessage?: string
  healthCheckedAt?: string
  totalOrders?: number
  totalCustomers?: number
  lastSyncAt?: string
}

interface ShopifyConfigModalProps {
  isOpen: boolean
  onClose: () => void
  store: ShopifyStore | null
  organizationId: string
  onDisconnect?: () => void
  onSave?: () => void
}

// =============================================
// MAIN COMPONENT
// =============================================

export function ShopifyConfigModal({
  isOpen,
  onClose,
  store,
  organizationId,
  onDisconnect,
  onSave,
}: ShopifyConfigModalProps) {
  // State
  const [activeTab, setActiveTab] = useState<'status' | 'settings'>('status')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [checkingHealth, setCheckingHealth] = useState(false)

  // Webhook URL
  const webhookUrl = store
    ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app'}/api/webhooks/shopify/${store.id}`
    : ''

  // =============================================
  // EFFECTS
  // =============================================

  useEffect(() => {
    if (isOpen && store) {
      // Load store settings
      loadSettings()
    }
  }, [isOpen, store])

  const loadSettings = async () => {
    if (!store) return

    try {
      const res = await fetch(
        `/api/integrations/shopify/${store.id}/settings?organizationId=${organizationId}`
      )
      const data = await res.json()
      if (data.tags) {
        setTags(data.tags)
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
  }

  // =============================================
  // HANDLERS
  // =============================================

  const handleCopyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleAddTag = () => {
    const tag = newTag.trim().toLowerCase()
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
      setNewTag('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag))
  }

  const handleCheckHealth = async () => {
    if (!store) return

    setCheckingHealth(true)
    try {
      await fetch('/api/integrations/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'shopify',
          integrationId: store.id,
        }),
      })
      // Refresh settings
      loadSettings()
    } catch (error) {
      console.error('Error checking health:', error)
    } finally {
      setCheckingHealth(false)
    }
  }

  const handleSave = async () => {
    if (!store) return

    setSaving(true)
    try {
      await fetch(`/api/integrations/shopify/${store.id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          tags,
        }),
      })
      onSave?.()
      onClose()
    } catch (error) {
      console.error('Error saving settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Tem certeza que deseja desconectar esta loja? Os dados serão mantidos.')) {
      return
    }
    onDisconnect?.()
    onClose()
  }

  // =============================================
  // RENDER
  // =============================================

  if (!isOpen || !store) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-2xl bg-dark-800 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-dark-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#95BF47]/20 rounded-lg">
                <ShoppingCart className="w-5 h-5 text-[#95BF47]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Configurar Shopify
                </h2>
                <p className="text-sm text-dark-400">{store.name}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-dark-700">
            <button
              onClick={() => setActiveTab('status')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'status'
                  ? 'text-primary-400 border-b-2 border-primary-500'
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              Status
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === 'settings'
                  ? 'text-primary-400 border-b-2 border-primary-500'
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              Configurações
            </button>
          </div>

          {/* Content */}
          <div className="p-5 max-h-[60vh] overflow-y-auto">
            {activeTab === 'status' ? (
              <div className="space-y-6">
                {/* Connection Status */}
                <div className="p-4 bg-dark-900 border border-dark-700 rounded-xl">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      {store.connectionStatus === 'active' ? (
                        <div className="p-2 bg-green-500/20 rounded-lg">
                          <CheckCircle className="w-5 h-5 text-green-400" />
                        </div>
                      ) : (
                        <div className="p-2 bg-red-500/20 rounded-lg">
                          <AlertCircle className="w-5 h-5 text-red-400" />
                        </div>
                      )}
                      <div>
                        <p className={`font-medium ${
                          store.connectionStatus === 'active' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {store.connectionStatus === 'active' ? 'Conectado' : 'Erro na conexão'}
                        </p>
                        <p className="text-sm text-dark-400">
                          {store.domain}.myshopify.com
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleCheckHealth}
                      disabled={checkingHealth}
                      className="flex items-center gap-2 px-3 py-2 bg-dark-800 hover:bg-dark-700 disabled:opacity-50 text-dark-300 rounded-lg text-sm transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 ${checkingHealth ? 'animate-spin' : ''}`} />
                      Verificar
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-dark-700">
                    <div className="text-center">
                      <Package className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                      <p className="text-lg font-semibold text-white">{store.totalOrders || 0}</p>
                      <p className="text-xs text-dark-400">Pedidos</p>
                    </div>
                    <div className="text-center">
                      <Users className="w-5 h-5 text-green-400 mx-auto mb-1" />
                      <p className="text-lg font-semibold text-white">{store.totalCustomers || 0}</p>
                      <p className="text-xs text-dark-400">Clientes</p>
                    </div>
                    <div className="text-center">
                      <Zap className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                      <p className="text-sm text-white">
                        {store.lastSyncAt
                          ? formatDistanceToNow(new Date(store.lastSyncAt), { addSuffix: true, locale: ptBR })
                          : '-'
                        }
                      </p>
                      <p className="text-xs text-dark-400">Última sync</p>
                    </div>
                  </div>
                </div>

                {/* Webhooks Status */}
                <div>
                  <h3 className="text-sm font-medium text-dark-300 mb-3">Webhooks Instalados</h3>
                  <WebhookStatusTable
                    storeId={store.id}
                    organizationId={organizationId}
                  />
                </div>

                {/* Webhook URL */}
                <div>
                  <h3 className="text-sm font-medium text-dark-300 mb-3">URL do Webhook</h3>
                  <div className="flex items-center gap-2 p-3 bg-dark-900 border border-dark-700 rounded-xl">
                    <input
                      type="text"
                      value={webhookUrl}
                      readOnly
                      className="flex-1 bg-transparent text-sm text-dark-300 font-mono truncate"
                    />
                    <button
                      onClick={handleCopyWebhook}
                      className="flex items-center gap-2 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-white rounded-lg text-sm transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 text-green-400" />
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
                    Configure esta URL nas configurações de webhook do Shopify
                  </p>
                </div>

                {/* Link to Automations */}
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-amber-300 font-medium">
                        Configure automações de deals
                      </p>
                      <p className="text-xs text-amber-400/80 mt-1">
                        Crie regras para criar deals automaticamente quando pedidos são criados, pagos, etc.
                      </p>
                      <a
                        href="/crm?tab=automations"
                        className="inline-flex items-center gap-1 mt-2 text-sm text-amber-400 hover:text-amber-300"
                      >
                        Ir para Automações
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Tags */}
                <div>
                  <h3 className="text-sm font-medium text-dark-300 mb-3">Tags Automáticas</h3>
                  <p className="text-xs text-dark-500 mb-3">
                    Estas tags serão adicionadas automaticamente a todos os contatos do Shopify
                  </p>
                  
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="text"
                      value={newTag}
                      onChange={e => setNewTag(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                      placeholder="Nova tag..."
                      className="flex-1 px-4 py-2 bg-dark-900 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500 transition-colors"
                    />
                    <button
                      onClick={handleAddTag}
                      className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-xl transition-colors"
                    >
                      Adicionar
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {tags.length === 0 ? (
                      <p className="text-sm text-dark-500">Nenhuma tag configurada</p>
                    ) : (
                      tags.map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-primary-500/20 text-primary-400 rounded-full text-sm"
                        >
                          {tag}
                          <button
                            onClick={() => handleRemoveTag(tag)}
                            className="p-0.5 hover:bg-primary-500/30 rounded-full"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Import */}
                <div>
                  <h3 className="text-sm font-medium text-dark-300 mb-3">Importação</h3>
                  <div className="p-4 bg-dark-900 border border-dark-700 rounded-xl">
                    <p className="text-sm text-dark-300 mb-3">
                      Importe clientes existentes do Shopify para o CRM
                    </p>
                    <button className="flex items-center gap-2 px-4 py-2 bg-[#95BF47] hover:bg-[#7da03a] text-white rounded-xl font-medium transition-colors">
                      <Users className="w-4 h-4" />
                      Importar Clientes
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-5 border-t border-dark-700">
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Desconectar
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2 text-dark-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-[#95BF47] hover:bg-[#7da03a] disabled:opacity-50 text-white rounded-xl font-medium transition-colors"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Salvar
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
