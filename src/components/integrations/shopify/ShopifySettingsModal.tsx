'use client'

// =============================================
// Shopify Settings Modal
// /src/components/integrations/shopify/ShopifySettingsModal.tsx
//
// Modal completo de configuração Shopify com:
// - Status da conexão
// - Configuração de sincronização
// - Regras de automação
// - Importação de clientes
// =============================================

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Settings,
  Zap,
  Download,
  Activity,
  ShoppingCart,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'

// Tab Components
import { StatusTab } from './tabs/StatusTab'
import { SyncConfigTab } from './tabs/SyncConfigTab'
import { AutomationRulesTab } from './tabs/AutomationRulesTab'
import { ImportTab } from './tabs/ImportTab'

// =============================================
// TYPES
// =============================================

interface ShopifyStore {
  id: string
  shop_name: string | null
  shop_domain: string
  shop_email?: string | null
  is_active: boolean
  is_configured: boolean
  connection_status: string
  total_customers_imported: number
  total_orders_imported: number
  created_at: string
  last_sync_at: string | null
}

interface Pipeline {
  id: string
  name: string
  stages: {
    id: string
    name: string
    color: string
    position: number
  }[]
}

interface ShopifySettingsModalProps {
  isOpen: boolean
  onClose: () => void
  store: ShopifyStore
  organizationId: string
  onSave?: () => void
}

type TabId = 'status' | 'sync' | 'automations' | 'import'

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'status', label: 'Status', icon: <Activity className="w-4 h-4" /> },
  { id: 'sync', label: 'Sincronização', icon: <RefreshCw className="w-4 h-4" /> },
  { id: 'automations', label: 'Automações', icon: <Zap className="w-4 h-4" /> },
  { id: 'import', label: 'Importar', icon: <Download className="w-4 h-4" /> },
]

// =============================================
// MAIN COMPONENT
// =============================================

export function ShopifySettingsModal({
  isOpen,
  onClose,
  store,
  organizationId,
  onSave,
}: ShopifySettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('status')
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loadingPipelines, setLoadingPipelines] = useState(true)

  // =============================================
  // Load pipelines on mount
  // =============================================
  
  useEffect(() => {
    if (isOpen) {
      loadPipelines()
    }
  }, [isOpen, organizationId])

  const loadPipelines = async () => {
    setLoadingPipelines(true)
    try {
      // ✅ CORRIGIDO: Passar storeId para filtrar pipelines da loja
      const res = await fetch(`/api/deals?type=pipelines&organizationId=${organizationId}&storeId=${store.id}`)
      if (res.ok) {
        const data = await res.json()
        console.log('[ShopifySettings] Pipelines carregadas:', data.pipelines?.length || 0)
        setPipelines(data.pipelines || [])
      } else {
        console.error('[ShopifySettings] Erro ao carregar pipelines:', res.status)
      }
    } catch (error) {
      console.error('[ShopifySettings] Error loading pipelines:', error)
    } finally {
      setLoadingPipelines(false)
    }
  }

  // =============================================
  // Handlers
  // =============================================

  const handleSave = () => {
    onSave?.()
  }

  // =============================================
  // Render
  // =============================================

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-4xl max-h-[90vh] bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* ========================================
              Header
          ======================================== */}
          <div className="flex items-center justify-between p-5 border-b border-dark-700 flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#96bf48]/20 flex items-center justify-center">
                <ShoppingCart className="w-7 h-7 text-[#96bf48]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  Configurações Shopify
                </h2>
                <p className="text-sm text-dark-400">
                  {store.shop_name || store.shop_domain}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  store.connection_status === 'active' ? 'bg-green-500' : 'bg-red-500'
                }`} />
                <span className={`text-sm ${
                  store.connection_status === 'active' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {store.connection_status === 'active' ? 'Conectado' : 'Erro'}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-dark-700 rounded-lg text-dark-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ========================================
              Tabs Navigation
          ======================================== */}
          <div className="flex border-b border-dark-700 flex-shrink-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-primary-400'
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                {tab.icon}
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500"
                  />
                )}
              </button>
            ))}
          </div>

          {/* ========================================
              Tab Content
          ======================================== */}
          <div className="flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait">
              {activeTab === 'status' && (
                <motion.div
                  key="status"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                >
                  <StatusTab
                    store={store}
                    organizationId={organizationId}
                  />
                </motion.div>
              )}

              {activeTab === 'sync' && (
                <motion.div
                  key="sync"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                >
                  <SyncConfigTab
                    store={store}
                    organizationId={organizationId}
                    pipelines={pipelines}
                    loadingPipelines={loadingPipelines}
                    onSave={handleSave}
                  />
                </motion.div>
              )}

              {activeTab === 'automations' && (
                <motion.div
                  key="automations"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                >
                  <AutomationRulesTab
                    store={store}
                    organizationId={organizationId}
                    pipelines={pipelines}
                    loadingPipelines={loadingPipelines}
                  />
                </motion.div>
              )}

              {activeTab === 'import' && (
                <motion.div
                  key="import"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                >
                  <ImportTab
                    store={store}
                    organizationId={organizationId}
                    pipelines={pipelines}
                    onSuccess={handleSave}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default ShopifySettingsModal
