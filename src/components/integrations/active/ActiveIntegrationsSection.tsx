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
}

interface WhatsAppConfig {
  id: string
  business_name: string | null
  phone_number: string
  is_active: boolean
  connection_status: string
}

interface Pipeline {
  id: string
  name: string
  stages: { id: string; name: string; color: string; sort_order: number }[]
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
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [showImportModal, setShowImportModal] = useState(false)
  
  // Form state
  const [selectedPipeline, setSelectedPipeline] = useState(store.default_pipeline_id || '')
  const [selectedStage, setSelectedStage] = useState(store.default_stage_id || '')
  const [contactType, setContactType] = useState(store.contact_type || 'auto')
  const [syncOrders, setSyncOrders] = useState(store.sync_orders ?? true)
  const [syncCustomers, setSyncCustomers] = useState(store.sync_customers ?? true)
  const [syncCheckouts, setSyncCheckouts] = useState(store.sync_checkouts ?? true)
  const [autoTags, setAutoTags] = useState<string[]>(store.auto_tags || ['shopify'])
  const [newTag, setNewTag] = useState('')

  useEffect(() => {
    fetchPipelines()
  }, [])

  const fetchPipelines = async () => {
    try {
      const res = await fetch(`/api/deals?type=pipelines&organizationId=${organizationId}`)
      const data = await res.json()
      setPipelines(data.pipelines || [])
    } catch (error) {
      console.error('Error fetching pipelines:', error)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/shopify/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          defaultPipelineId: selectedPipeline || null,
          defaultStageId: selectedStage || null,
          contactType,
          syncOrders,
          syncCustomers,
          syncCheckouts,
          autoTags,
        }),
      })

      if (response.ok) {
        onSave()
      }
    } catch (error) {
      console.error('Error saving config:', error)
    } finally {
      setLoading(false)
    }
  }

  const addTag = () => {
    if (newTag.trim() && !autoTags.includes(newTag.trim())) {
      setAutoTags([...autoTags, newTag.trim()])
      setNewTag('')
    }
  }

  const removeTag = (tag: string) => {
    setAutoTags(autoTags.filter(t => t !== tag))
  }

  const selectedPipelineData = pipelines.find(p => p.id === selectedPipeline)

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
        className="w-full max-w-2xl bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="p-6 border-b border-dark-700 sticky top-0 bg-dark-900 z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#96bf48]/20 flex items-center justify-center">
              <ShoppingCart className="w-7 h-7 text-[#96bf48]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Configurar Shopify</h2>
              <p className="text-sm text-dark-400">{store.shop_name || store.shop_domain}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Pipeline e Estágio */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Pipeline padrão
              </label>
              <select
                value={selectedPipeline}
                onChange={(e) => {
                  setSelectedPipeline(e.target.value)
                  setSelectedStage('')
                }}
                className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500"
              >
                <option value="">Selecione um pipeline</option>
                {pipelines.map((pipeline) => (
                  <option key={pipeline.id} value={pipeline.id}>
                    {pipeline.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-dark-500 mt-1">
                Onde os deals serão criados
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                Estágio inicial
              </label>
              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                disabled={!selectedPipeline}
                className="w-full px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white focus:outline-none focus:border-primary-500 disabled:opacity-50"
              >
                <option value="">Selecione um estágio</option>
                {selectedPipelineData?.stages
                  ?.sort((a, b) => a.sort_order - b.sort_order)
                  .map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-dark-500 mt-1">
                Estágio inicial dos novos deals
              </p>
            </div>
          </div>

          {/* Tipo de Contato */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Tipo de contato
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'lead', label: 'Lead', desc: 'Todos são leads' },
                { value: 'customer', label: 'Cliente', desc: 'Todos são clientes' },
                { value: 'auto', label: 'Automático', desc: 'Lead → Cliente ao comprar' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setContactType(option.value)}
                  className={`p-3 rounded-xl border-2 transition-all text-left ${
                    contactType === option.value
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-dark-700 hover:border-dark-600'
                  }`}
                >
                  <span className={`block font-medium ${
                    contactType === option.value ? 'text-primary-400' : 'text-white'
                  }`}>
                    {option.label}
                  </span>
                  <span className="block text-xs text-dark-400 mt-0.5">
                    {option.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Eventos para sincronizar */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Eventos para sincronizar
            </label>
            <div className="space-y-2">
              {[
                { key: 'syncCustomers', value: syncCustomers, setter: setSyncCustomers, label: 'Novos clientes', desc: 'Criar contato quando cliente se cadastrar' },
                { key: 'syncOrders', value: syncOrders, setter: setSyncOrders, label: 'Novos pedidos', desc: 'Criar deal e atualizar contato em cada pedido' },
                { key: 'syncCheckouts', value: syncCheckouts, setter: setSyncCheckouts, label: 'Carrinhos abandonados', desc: 'Detectar e criar deal para carrinhos abandonados' },
              ].map((event) => (
                <label
                  key={event.key}
                  className="flex items-start gap-3 p-3 bg-dark-800/50 rounded-xl cursor-pointer hover:bg-dark-800 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={event.value}
                    onChange={(e) => event.setter(e.target.checked)}
                    className="w-5 h-5 mt-0.5 rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-0"
                  />
                  <div>
                    <span className="block text-white font-medium">{event.label}</span>
                    <span className="block text-xs text-dark-400">{event.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Tags automáticas */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Tags automáticas
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addTag()}
                placeholder="Nova tag..."
                className="flex-1 px-4 py-2 bg-dark-800 border border-dark-700 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
              />
              <button
                onClick={addTag}
                className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors"
              >
                Adicionar
              </button>
            </div>
            {autoTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {autoTags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2.5 py-1 bg-primary-500/20 text-primary-400 rounded-lg text-sm"
                  >
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-primary-300">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-dark-500 mt-2">
              Estas tags serão adicionadas automaticamente aos contatos do Shopify
            </p>
          </div>

          {/* Importar Clientes Existentes */}
          <div className="p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <Download className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-medium text-white">Importar Clientes Existentes</h4>
                <p className="text-sm text-dark-400 mt-1">
                  Importe todos os clientes já cadastrados no Shopify para o CRM
                </p>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="mt-3 flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white text-sm font-medium transition-colors"
                >
                  <Users className="w-4 h-4" />
                  Importar Clientes
                </button>
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
              Configure esta URL nas configurações de webhook do Shopify (se necessário)
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-dark-700 flex items-center justify-end gap-3 sticky bottom-0 bg-dark-900">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-dark-700 hover:bg-dark-600 rounded-xl text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 rounded-xl text-white font-medium transition-colors"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Salvar
          </button>
        </div>
      </motion.div>

      {/* Modal de Importação */}
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
