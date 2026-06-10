'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plug,
  ShoppingBag,
  RefreshCw,
  CheckCircle,
  Loader2,
  Trash2,
  Plus,
  Package,
  Clock,
  DollarSign,
  Sparkles,
  X,
} from 'lucide-react'
import { AgentIntegration } from '@/lib/ai/types'

interface IntegrationsTabProps {
  agentId: string
  organizationId: string
  integrations: AgentIntegration[]
  onIntegrationsChange: (integrations: AgentIntegration[]) => void
  onRefresh: () => void
}

interface AvailableIntegration {
  id: string
  type: 'shopify'
  name: string
  store_url?: string
  is_connected: boolean
}

const integrationTypeConfig: Record<
  'shopify' | 'woocommerce' | 'nuvemshop',
  { name: string; icon: string; color: string; bg: string; description: string }
> = {
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
    description: 'Produtos, pedidos e clientes',
  },
  nuvemshop: {
    name: 'Nuvemshop',
    icon: '/integrations/nuvemshop.svg',
    color: 'text-blue-400',
    bg: 'bg-blue-500/20',
    description: 'Produtos, pedidos e clientes',
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
    <div className="editor-content-inner space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="sec-head">
          <div className="sec-ico">
            <Plug />
          </div>
          <div>
            <h3 className="sec-t">Integrações</h3>
            <p className="sec-s">Conecte dados de e-commerce ao agente</p>
          </div>
        </div>

        {availableToConnect.length > 0 && (
          <button
            onClick={() => setShowConnectModal(true)}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" />
            Conectar
          </button>
        )}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand)' }} />
        </div>
      ) : integrations.length === 0 ? (
        /* Empty State */
        <div className="card text-center" style={{ padding: 32 }}>
          <div className="empty-ico" style={{ margin: '0 auto 16px' }}>
            <ShoppingBag />
          </div>
          <h4 className="text-lg font-medium mb-2" style={{ color: 'var(--text)' }}>Nenhuma integração conectada</h4>
          <p className="text-sm mb-4 max-w-md mx-auto" style={{ color: 'var(--text-3)' }}>
            Conecte sua loja virtual para que o agente possa consultar produtos,
            preços e status de pedidos em tempo real.
          </p>

          {availableIntegrations.length > 0 ? (
            <button
              onClick={() => setShowConnectModal(true)}
              className="btn btn-primary"
              style={{ display: 'inline-flex' }}
            >
              <Plus className="w-4 h-4" />
              Conectar Integração
            </button>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>
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
                className="card overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center gap-4 p-4">
                  <div className="act-ico" style={{ width: 48, height: 48, background: 'var(--green-tint)', color: 'var(--green)' }}>
                    <ShoppingBag className="w-6 h-6" />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium" style={{ color: 'var(--text)' }}>{typeConfig.name}</h4>
                      <span className={`chip ${integration.sync_status === 'synced' ? 'chip-green' : ''}`}>
                        {integration.sync_status === 'synced' ? 'Sincronizado' : 'Pendente'}
                      </span>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text-3)' }}>{typeConfig.description}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSync(integration.id)}
                      disabled={isSyncing}
                      className="btn btn-soft btn-sm"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>Sincronizar</span>
                    </button>

                    <button
                      onClick={() => handleDisconnect(integration.id)}
                      className="btn btn-soft btn-icon btn-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 px-4 pb-4">
                  <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
                    <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--text-3)' }}>
                      <Package className="w-4 h-4" />
                      <span className="text-xs">Produtos</span>
                    </div>
                    <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{integration.products_synced || 0}</p>
                  </div>

                  <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
                    <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--text-3)' }}>
                      <Clock className="w-4 h-4" />
                      <span className="text-xs">Última Sync</span>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                      {integration.last_sync_at
                        ? new Date(integration.last_sync_at).toLocaleDateString('pt-BR')
                        : 'Nunca'}
                    </p>
                  </div>

                  <div className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
                    <div className="flex items-center gap-2 mb-1" style={{ color: 'var(--text-3)' }}>
                      <DollarSign className="w-4 h-4" />
                      <span className="text-xs">Preços</span>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                      {integration.allow_price_info ? 'Habilitado' : 'Desabilitado'}
                    </p>
                  </div>
                </div>

                {/* Settings */}
                <div className="p-4 space-y-3" style={{ borderTop: '1px solid var(--border)' }}>
                  <p className="label" style={{ marginBottom: 0 }}>Permissões do Agente</p>

                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--text-2)' }}>Sincronizar produtos automaticamente</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={integration.sync_products}
                      onClick={() => handleUpdateSettings(integration.id, { sync_products: !integration.sync_products })}
                      className={`tog ${integration.sync_products ? 'on' : ''}`}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--text-2)' }}>Consultar pedidos do cliente</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={integration.sync_orders}
                      onClick={() => handleUpdateSettings(integration.id, { sync_orders: !integration.sync_orders })}
                      className={`tog ${integration.sync_orders ? 'on' : ''}`}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--text-2)' }}>Informar preços</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={integration.allow_price_info}
                      onClick={() => handleUpdateSettings(integration.id, { allow_price_info: !integration.allow_price_info })}
                      className={`tog ${integration.allow_price_info ? 'on' : ''}`}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--text-2)' }}>Informar disponibilidade de estoque</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={integration.allow_stock_info}
                      onClick={() => handleUpdateSettings(integration.id, { allow_stock_info: !integration.allow_stock_info })}
                      className={`tog ${integration.allow_stock_info ? 'on' : ''}`}
                    />
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Info Box */}
      <div className="callout green" style={{ flexDirection: 'column', gap: 6 }}>
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          O que o agente pode fazer com integrações?
        </h4>
        <ul className="text-sm space-y-1">
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
            className="modal-overlay"
            onClick={() => setShowConnectModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="modal"
              style={{ maxWidth: 440 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-head">
                <h3 className="modal-title">Conectar Integração</h3>
                <button onClick={() => setShowConnectModal(false)} className="modal-x">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="modal-body space-y-3">
                {availableToConnect.length === 0 ? (
                  <p className="text-sm text-center py-4" style={{ color: 'var(--text-3)' }}>
                    Todas as integrações disponíveis já estão conectadas.
                  </p>
                ) : (
                  availableToConnect.map((integration) => {
                    const typeConfig = integrationTypeConfig[integration.type]

                    return (
                      <button
                        key={integration.id}
                        onClick={() => handleConnect(integration)}
                        className="selcard w-full flex items-center gap-4"
                      >
                        <div className="act-ico" style={{ width: 48, height: 48, background: 'var(--green-tint)', color: 'var(--green)' }}>
                          <ShoppingBag className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium" style={{ color: 'var(--text)' }}>{typeConfig.name}</p>
                          <p className="text-sm" style={{ color: 'var(--text-3)' }}>{integration.name}</p>
                        </div>
                        <CheckCircle className="w-5 h-5" style={{ color: 'var(--green)' }} />
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
