'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plug,
  ShoppingBag,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  Settings,
  Trash2,
  Plus,
  Package,
  Clock,
  DollarSign,
  Sparkles,
} from 'lucide-react'
import { AgentIntegration } from '../AIAgentEditor'

interface IntegrationsTabProps {
  agentId: string
  organizationId: string
  integrations: AgentIntegration[]
  onIntegrationsChange: (integrations: AgentIntegration[]) => void
  onRefresh: () => void
}

interface AvailableIntegration {
  id: string
  type: 'shopify' | 'woocommerce' | 'nuvemshop'
  name: string
  store_url?: string
  is_connected: boolean
}

const integrationTypeConfig = {
  shopify: {
    name: 'Shopify',
    icon: '/integrations/shopify.svg',
    color: 'text-green-400',
    bg: 'bg-green-500/20',
    description: 'Produtos, pedidos e clientes',
  },
  woocommerce: {
    name: 'WooCommerce',
    icon: '/integrations/woocommerce.svg',
    color: 'text-purple-400',
    bg: 'bg-purple-500/20',
    description: 'Produtos e pedidos',
  },
  nuvemshop: {
    name: 'Nuvemshop',
    icon: '/integrations/nuvemshop.svg',
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    description: 'Produtos e pedidos',
  },
}

export default function IntegrationsTab({
  agentId,
  organizationId,
  integrations,
  onIntegrationsChange,
  onRefresh,
}: IntegrationsTabProps) {
  const [availableIntegrations, setAvailableIntegrations] = useState<AvailableIntegration[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [selectedType, setSelectedType] = useState<string | null>(null)

  // Fetch available integrations
  useEffect(() => {
    fetchAvailableIntegrations()
  }, [organizationId])

  const fetchAvailableIntegrations = async () => {
    setLoading(true)
    try {
      // Fetch from different integration endpoints
      const [shopifyRes] = await Promise.all([
        fetch(`/api/shopify?organization_id=${organizationId}`),
      ])

      const integrationsList: AvailableIntegration[] = []

      if (shopifyRes.ok) {
        const data = await shopifyRes.json()
        if (data.stores) {
          data.stores.forEach((store: any) => {
            integrationsList.push({
              id: store.id,
              type: 'shopify',
              name: store.store_name || store.shop_domain,
              store_url: store.shop_domain,
              is_connected: store.is_active,
            })
          })
        }
      }

      setAvailableIntegrations(integrationsList)
    } catch (err) {
      console.error('Error fetching integrations:', err)
    } finally {
      setLoading(false)
    }
  }

  // Connect integration to agent
  const handleConnect = async (integration: AvailableIntegration) => {
    try {
      const res = await fetch(`/api/ai/agents/${agentId}/integrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          integration_id: integration.id,
          integration_type: integration.type,
        }),
      })

      if (res.ok) {
        onRefresh()
        setShowConnectModal(false)
      }
    } catch (err) {
      console.error('Error connecting integration:', err)
    }
  }

  // Disconnect integration
  const handleDisconnect = async (integrationId: string) => {
    if (!confirm('Tem certeza que deseja desconectar esta integração?')) return

    try {
      const res = await fetch(`/api/ai/agents/${agentId}/integrations/${integrationId}?organization_id=${organizationId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        onIntegrationsChange(integrations.filter(i => i.id !== integrationId))
      }
    } catch (err) {
      console.error('Error disconnecting integration:', err)
    }
  }

  // Sync products
  const handleSync = async (integrationId: string) => {
    setSyncing(integrationId)
    try {
      await fetch(`/api/ai/agents/${agentId}/integrations/${integrationId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organizationId }),
      })
      onRefresh()
    } catch (err) {
      console.error('Error syncing:', err)
    } finally {
      setSyncing(null)
    }
  }

  // Update integration settings
  const handleUpdateSettings = async (integrationId: string, settings: Partial<AgentIntegration>) => {
    try {
      await fetch(`/api/ai/agents/${agentId}/integrations/${integrationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          ...settings,
        }),
      })
      onIntegrationsChange(integrations.map(i => 
        i.id === integrationId ? { ...i, ...settings } : i
      ))
    } catch (err) {
      console.error('Error updating settings:', err)
    }
  }

  // Get connected integration IDs
  const connectedIds = integrations.map(i => i.integration_id)

  // Available to connect (not already connected)
  const availableToConnect = availableIntegrations.filter(i => !connectedIds.includes(i.id))

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
            <Plug className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Integrações</h3>
            <p className="text-sm text-dark-400">Conecte dados de e-commerce ao agente</p>
          </div>
        </div>

        {availableToConnect.length > 0 && (
          <button
            onClick={() => setShowConnectModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Conectar
          </button>
        )}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
        </div>
      ) : integrations.length === 0 ? (
        /* Empty State */
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-dark-700/50 flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="w-8 h-8 text-dark-500" />
          </div>
          <h4 className="text-lg font-medium text-white mb-2">Nenhuma integração conectada</h4>
          <p className="text-sm text-dark-400 mb-4 max-w-md mx-auto">
            Conecte sua loja virtual para que o agente possa consultar produtos,
            preços e status de pedidos em tempo real.
          </p>
          
          {availableIntegrations.length > 0 ? (
            <button
              onClick={() => setShowConnectModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Conectar Integração
            </button>
          ) : (
            <p className="text-sm text-dark-500">
              Nenhuma integração disponível. Configure primeiro em Configurações → Integrações.
            </p>
          )}
        </div>
      ) : (
        /* Connected Integrations */
        <div className="space-y-4">
          {integrations.map((integration) => {
            const typeConfig = integrationTypeConfig[integration.integration_type]
            const isSyncing = syncing === integration.id

            return (
              <motion.div
                key={integration.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-dark-800/50 border border-dark-700/50 rounded-xl overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center gap-4 p-4">
                  <div className={`w-12 h-12 rounded-xl ${typeConfig.bg} flex items-center justify-center`}>
                    <ShoppingBag className={`w-6 h-6 ${typeConfig.color}`} />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-white font-medium">{typeConfig.name}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        integration.sync_status === 'synced' 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {integration.sync_status === 'synced' ? 'Sincronizado' : 'Pendente'}
                      </span>
                    </div>
                    <p className="text-sm text-dark-500">{typeConfig.description}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSync(integration.id)}
                      disabled={isSyncing}
                      className="flex items-center gap-2 px-3 py-2 bg-dark-700/50 hover:bg-dark-700 text-dark-300 hover:text-white rounded-lg transition-colors"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span className="text-sm">Sincronizar</span>
                    </button>

                    <button
                      onClick={() => handleDisconnect(integration.id)}
                      className="p-2 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 px-4 pb-4">
                  <div className="bg-dark-900/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-dark-400 mb-1">
                      <Package className="w-4 h-4" />
                      <span className="text-xs">Produtos</span>
                    </div>
                    <p className="text-lg font-semibold text-white">{integration.products_synced || 0}</p>
                  </div>

                  <div className="bg-dark-900/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-dark-400 mb-1">
                      <Clock className="w-4 h-4" />
                      <span className="text-xs">Última Sync</span>
                    </div>
                    <p className="text-sm text-white">
                      {integration.last_sync_at 
                        ? new Date(integration.last_sync_at).toLocaleDateString('pt-BR')
                        : 'Nunca'}
                    </p>
                  </div>

                  <div className="bg-dark-900/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-dark-400 mb-1">
                      <DollarSign className="w-4 h-4" />
                      <span className="text-xs">Preços</span>
                    </div>
                    <p className="text-sm text-white">
                      {integration.allow_price_info ? 'Habilitado' : 'Desabilitado'}
                    </p>
                  </div>
                </div>

                {/* Settings */}
                <div className="border-t border-dark-700/50 p-4 space-y-3">
                  <p className="text-sm font-medium text-dark-300">Permissões do Agente</p>
                  
                  <label className="flex items-center justify-between p-2 rounded-lg hover:bg-dark-900/50 cursor-pointer">
                    <span className="text-sm text-dark-300">Sincronizar produtos automaticamente</span>
                    <input
                      type="checkbox"
                      checked={integration.sync_products}
                      onChange={(e) => handleUpdateSettings(integration.id, { sync_products: e.target.checked })}
                      className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-green-500"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2 rounded-lg hover:bg-dark-900/50 cursor-pointer">
                    <span className="text-sm text-dark-300">Consultar pedidos do cliente</span>
                    <input
                      type="checkbox"
                      checked={integration.sync_orders}
                      onChange={(e) => handleUpdateSettings(integration.id, { sync_orders: e.target.checked })}
                      className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-green-500"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2 rounded-lg hover:bg-dark-900/50 cursor-pointer">
                    <span className="text-sm text-dark-300">Informar preços</span>
                    <input
                      type="checkbox"
                      checked={integration.allow_price_info}
                      onChange={(e) => handleUpdateSettings(integration.id, { allow_price_info: e.target.checked })}
                      className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-green-500"
                    />
                  </label>

                  <label className="flex items-center justify-between p-2 rounded-lg hover:bg-dark-900/50 cursor-pointer">
                    <span className="text-sm text-dark-300">Informar disponibilidade de estoque</span>
                    <input
                      type="checkbox"
                      checked={integration.allow_stock_info}
                      onChange={(e) => handleUpdateSettings(integration.id, { allow_stock_info: e.target.checked })}
                      className="w-4 h-4 rounded bg-dark-700 border-dark-600 text-green-500"
                    />
                  </label>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-xl p-4">
        <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-green-400" />
          O que o agente pode fazer com integrações?
        </h4>
        <ul className="text-sm text-dark-400 space-y-1">
          <li>• Recomendar produtos baseado nas preferências do cliente</li>
          <li>• Informar preços e disponibilidade em tempo real</li>
          <li>• Consultar status de pedidos (quando o cliente fornece o número)</li>
          <li>• Sugerir produtos relacionados e fazer upsell</li>
        </ul>
      </div>

      {/* Connect Modal */}
      <AnimatePresence>
        {showConnectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setShowConnectModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-dark-800 rounded-2xl w-full max-w-md border border-dark-700 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-dark-700">
                <h3 className="text-lg font-semibold text-white">Conectar Integração</h3>
                <button
                  onClick={() => setShowConnectModal(false)}
                  className="p-2 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {availableToConnect.length === 0 ? (
                  <p className="text-sm text-dark-500 text-center py-4">
                    Todas as integrações disponíveis já estão conectadas.
                  </p>
                ) : (
                  availableToConnect.map((integration) => {
                    const typeConfig = integrationTypeConfig[integration.type]
                    
                    return (
                      <button
                        key={integration.id}
                        onClick={() => handleConnect(integration)}
                        className="w-full flex items-center gap-4 p-4 bg-dark-900/50 rounded-xl hover:bg-dark-900 transition-colors text-left"
                      >
                        <div className={`w-12 h-12 rounded-xl ${typeConfig.bg} flex items-center justify-center`}>
                          <ShoppingBag className={`w-6 h-6 ${typeConfig.color}`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-white font-medium">{typeConfig.name}</p>
                          <p className="text-sm text-dark-500">{integration.name}</p>
                        </div>
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      </button>
                    )
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
