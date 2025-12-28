'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings,
  Trash2,
  Play,
  Pause,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  Zap,
  ShoppingCart,
  MessageSquare,
  X,
  Check,
  Users,
  ShoppingBag,
  AlertTriangle,
  Download,
  Unlink,
} from 'lucide-react'

// Import do modal de importação
import ShopifyImportModal from '@/components/integrations/shopify/ShopifyImportModal'

// =============================================
// Types
// =============================================

interface ShopifyStore {
  id: string
  shop_name: string | null
  shop_domain: string
  shop_email?: string | null
  is_active: boolean
  is_configured: boolean
  connection_status: string
  default_pipeline_id: string | null
  default_stage_id: string | null
  contact_type: string
  auto_tags: string[]
  sync_orders: boolean
  sync_customers: boolean
  sync_checkouts: boolean
  stage_mapping: Record<string, string>
  last_sync_at: string | null
  total_customers_imported: number
  total_orders_imported: number
  created_at: string
}

interface WhatsAppConfig {
  id: string
  business_name: string | null
  phone_number: string
  is_active: boolean
  connection_status: string
}

// =============================================
// Active Integrations Section Component
// =============================================

export default function ActiveIntegrationsSection({ 
  organizationId 
}: { 
  organizationId: string 
}) {
  const router = useRouter()
  const [shopifyStore, setShopifyStore] = useState<ShopifyStore | null>(null)
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<'shopify' | 'whatsapp' | null>(null)

  useEffect(() => {
    fetchActiveIntegrations()
  }, [organizationId])

  const fetchActiveIntegrations = async () => {
    setLoading(true)
    try {
      // Buscar Shopify
      const shopifyRes = await fetch(`/api/shopify/store?organizationId=${organizationId}`)
      if (shopifyRes.ok) {
        const shopifyData = await shopifyRes.json()
        if (shopifyData.store) {
          setShopifyStore(shopifyData.store)
        }
      }

      // Buscar WhatsApp
      const whatsappRes = await fetch(`/api/whatsapp/config?organizationId=${organizationId}`)
      if (whatsappRes.ok) {
        const whatsappData = await whatsappRes.json()
        if (whatsappData.config) {
          setWhatsappConfig(whatsappData.config)
        }
      }
    } catch (error) {
      console.error('Error fetching active integrations:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenConfig = (type: 'shopify' | 'whatsapp') => {
    setSelectedIntegration(type)
    setConfigModalOpen(true)
  }

  const handleCloseConfig = () => {
    setConfigModalOpen(false)
    setSelectedIntegration(null)
  }

  // Contagem de integrações ativas
  const activeCount = [shopifyStore?.is_active, whatsappConfig?.is_active].filter(Boolean).length
  const totalCount = [shopifyStore, whatsappConfig].filter(Boolean).length

  if (loading) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-5 h-5 text-primary-400" />
          <h2 className="text-lg font-semibold text-white">Suas Integrações</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="p-6 bg-dark-800/50 border border-dark-700 rounded-2xl animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-dark-700 rounded-xl" />
                <div className="flex-1">
                  <div className="h-5 bg-dark-700 rounded w-32 mb-2" />
                  <div className="h-4 bg-dark-700 rounded w-48" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Se não tem nenhuma integração ativa, não mostrar a seção
  if (!shopifyStore && !whatsappConfig) {
    return null
  }

  return (
    <>
      <div className="mb-8">
        {/* Header da seção */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary-400" />
            <h2 className="text-lg font-semibold text-white">Suas Integrações</h2>
            <span className="px-2 py-0.5 bg-primary-500/20 text-primary-400 text-xs font-medium rounded-full">
              {activeCount} ativas
            </span>
          </div>
          <button
            onClick={fetchActiveIntegrations}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-dark-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
        </div>

        {/* Cards das integrações */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Shopify Card */}
          {shopifyStore && (
            <ShopifyActiveCard
              store={shopifyStore}
              onConfigure={() => handleOpenConfig('shopify')}
              onRefresh={fetchActiveIntegrations}
            />
          )}

          {/* WhatsApp Card */}
          {whatsappConfig && (
            <WhatsAppActiveCard
              config={whatsappConfig}
              onConfigure={() => router.push('/whatsapp')}
            />
          )}
        </div>
      </div>

      {/* Modal de Configuração do Shopify */}
      <AnimatePresence>
        {configModalOpen && selectedIntegration === 'shopify' && shopifyStore && (
          <ShopifyConfigModal
            store={shopifyStore}
            organizationId={organizationId}
            onClose={handleCloseConfig}
            onSave={() => {
              fetchActiveIntegrations()
              handleCloseConfig()
            }}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// =============================================
// Shopify Active Card
// =============================================

function ShopifyActiveCard({
  store,
  onConfigure,
  onRefresh,
}: {
  store: ShopifyStore
  onConfigure: () => void
  onRefresh: () => void
}) {
  const [toggling, setToggling] = useState(false)

  const handleToggle = async () => {
    setToggling(true)
    try {
      await fetch(`/api/shopify/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          isActive: !store.is_active,
        }),
      })
      onRefresh()
    } catch (error) {
      console.error('Error toggling:', error)
    } finally {
      setToggling(false)
    }
  }

  const statusConfig = {
    active: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Conectado', icon: CheckCircle },
    error: { color: 'text-red-400', bg: 'bg-red-500/20', label: 'Erro', icon: AlertCircle },
    pending: { color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Pendente', icon: AlertTriangle },
    disconnected: { color: 'text-gray-400', bg: 'bg-gray-500/20', label: 'Desconectado', icon: X },
  }

  const status = statusConfig[store.connection_status as keyof typeof statusConfig] || statusConfig.pending
  const StatusIcon = status.icon

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        relative bg-dark-800/50 border rounded-2xl p-5 transition-all duration-200
        ${store.is_active 
          ? 'border-emerald-500/30 hover:border-emerald-500/50' 
          : 'border-dark-700/50 hover:border-dark-600'
        }
      `}
    >
      {/* Badge de status */}
      <div className="absolute -top-2 -right-2">
        <span className={`flex items-center gap-1 px-2 py-0.5 ${status.bg} ${status.color} rounded-full text-[10px] font-bold`}>
          <StatusIcon className="w-3 h-3" />
          {status.label}
        </span>
      </div>

      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="w-14 h-14 rounded-xl bg-[#96bf48]/20 flex items-center justify-center flex-shrink-0">
          <ShoppingCart className="w-7 h-7 text-[#96bf48]" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-white truncate">Shopify</h3>
          </div>
          <p className="text-sm text-dark-400 truncate">
            {store.shop_name || store.shop_domain}
          </p>
          
          {/* Stats */}
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1 text-xs text-dark-400">
              <Users className="w-3.5 h-3.5" />
              <span>{store.total_customers_imported || 0} clientes</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-dark-400">
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>{store.total_orders_imported || 0} pedidos</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onConfigure}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-dark-700/50 hover:bg-dark-700 rounded-xl text-sm text-white transition-colors"
        >
          <Settings className="w-4 h-4" />
          Configurar
        </button>
        <button
          onClick={handleToggle}
          disabled={toggling}
          className={`p-2.5 rounded-xl transition-colors ${
            store.is_active
              ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
              : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
          }`}
          title={store.is_active ? 'Pausar' : 'Ativar'}
        >
          {toggling ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : store.is_active ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>
        <a
          href={`https://${store.shop_domain}/admin`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2.5 rounded-xl bg-dark-700/50 text-dark-400 hover:text-white transition-colors"
          title="Abrir Admin do Shopify"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </motion.div>
  )
}

// =============================================
// WhatsApp Active Card
// =============================================

function WhatsAppActiveCard({
  config,
  onConfigure,
}: {
  config: WhatsAppConfig
  onConfigure: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        relative bg-dark-800/50 border rounded-2xl p-5 transition-all duration-200
        ${config.is_active 
          ? 'border-emerald-500/30 hover:border-emerald-500/50' 
          : 'border-dark-700/50 hover:border-dark-600'
        }
      `}
    >
      {/* Badge */}
      <div className="absolute -top-2 -right-2">
        <span className={`flex items-center gap-1 px-2 py-0.5 ${
          config.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'
        } rounded-full text-[10px] font-bold`}>
          {config.is_active ? <CheckCircle className="w-3 h-3" /> : <X className="w-3 h-3" />}
          {config.is_active ? 'Conectado' : 'Desconectado'}
        </span>
      </div>

      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="w-14 h-14 rounded-xl bg-[#25D366]/20 flex items-center justify-center flex-shrink-0">
          <MessageSquare className="w-7 h-7 text-[#25D366]" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate">WhatsApp Business</h3>
          <p className="text-sm text-dark-400 truncate">
            {config.business_name || config.phone_number}
          </p>
          <p className="text-xs text-dark-500 mt-1">
            {config.phone_number}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4">
        <button
          onClick={onConfigure}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-dark-700/50 hover:bg-dark-700 rounded-xl text-sm text-white transition-colors"
        >
          <Settings className="w-4 h-4" />
          Configurar
        </button>
      </div>
    </motion.div>
  )
}

// =============================================
// Shopify Config Modal
// =============================================

function ShopifyConfigModal({
  store,
  organizationId,
  onClose,
  onSave,
}: {
  store: ShopifyStore
  organizationId: string
  onClose: () => void
  onSave: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [checkingConnection, setCheckingConnection] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'ok' | 'error' | null>(null)

  const checkConnection = async () => {
    setCheckingConnection(true)
    setConnectionStatus(null)
    try {
      const response = await fetch(`/api/shopify/check-connection?storeId=${store.id}`)
      if (response.ok) {
        setConnectionStatus('ok')
      } else {
        setConnectionStatus('error')
      }
    } catch {
      setConnectionStatus('error')
    } finally {
      setCheckingConnection(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Tem certeza que deseja desconectar esta loja?')) return
    
    setLoading(true)
    try {
      const response = await fetch('/api/shopify/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store.id }),
      })

      if (response.ok) {
        onSave()
        onClose()
      }
    } catch (error) {
      console.error('Error disconnecting:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-dark-700">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#96bf48]/20 flex items-center justify-center">
              <ShoppingCart className="w-7 h-7 text-[#96bf48]" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white">Shopify</h2>
              <p className="text-sm text-dark-400">{store.shop_name || store.shop_domain}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="text-sm text-green-400">Conectado</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          
          {/* Informações da Loja */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-xl">
              <span className="text-dark-400 text-sm">Domínio</span>
              <span className="text-white text-sm font-medium">{store.shop_domain}</span>
            </div>
            {store.shop_email && (
              <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-xl">
                <span className="text-dark-400 text-sm">Email</span>
                <span className="text-white text-sm font-medium">{store.shop_email}</span>
              </div>
            )}
            <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-xl">
              <span className="text-dark-400 text-sm">Conectado em</span>
              <span className="text-white text-sm font-medium">
                {new Date(store.created_at).toLocaleDateString('pt-BR')}
              </span>
            </div>
          </div>

          {/* Status da Conexão */}
          <div className="flex items-center gap-3">
            <button
              onClick={checkConnection}
              disabled={checkingConnection}
              className="flex items-center gap-2 px-4 py-2 bg-dark-800 hover:bg-dark-700 rounded-xl text-white text-sm transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${checkingConnection ? 'animate-spin' : ''}`} />
              Verificar Conexão
            </button>
            {connectionStatus === 'ok' && (
              <span className="flex items-center gap-1.5 text-green-400 text-sm">
                <Check className="w-4 h-4" />
                Conexão OK
              </span>
            )}
            {connectionStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                Erro na conexão
              </span>
            )}
          </div>

          {/* Aviso sobre configurações */}
          <div className="p-4 bg-primary-500/10 border border-primary-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <Settings className="w-5 h-5 text-primary-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-white">Configurar Automações</h4>
                <p className="text-sm text-dark-400 mt-1">
                  As configurações de eventos, estágios e importação de clientes 
                  estão disponíveis na aba <strong>Automações</strong> dentro de cada Pipeline no CRM.
                </p>
              </div>
            </div>
          </div>

          {/* Webhook URL */}
          <div className="p-4 bg-dark-800/50 rounded-xl">
            <label className="block text-sm font-medium text-dark-300 mb-2">
              URL do Webhook
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/integrations/shopify/webhook`}
                className="flex-1 px-4 py-2 bg-dark-800 border border-dark-700 rounded-xl text-dark-400 text-sm"
              />
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/integrations/shopify/webhook`)}
                className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors text-sm"
              >
                Copiar
              </button>
            </div>
            <p className="text-xs text-dark-500 mt-2">
              Configure esta URL nas configurações de webhook do Shopify
            </p>
          </div>

          {/* Desconectar */}
          <div className="pt-4 border-t border-dark-700">
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors text-sm"
            >
              <Unlink className="w-4 h-4" />
              Desconectar Loja
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-dark-700 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors"
          >
            Fechar
          </button>
        </div>
      </motion.div>

      {/* Modal de Importação - mantido para compatibilidade */}
      <AnimatePresence>
        {showImportModal && (
          <ShopifyImportModal
            storeId={store.id}
            storeName={store.shop_name || store.shop_domain}
            organizationId={organizationId}
            onClose={() => setShowImportModal(false)}
            onSuccess={() => {
              setShowImportModal(false)
              onSave()
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}
