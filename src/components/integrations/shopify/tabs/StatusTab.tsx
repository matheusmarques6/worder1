'use client'

// =============================================
// Status Tab
// /src/components/integrations/shopify/tabs/StatusTab.tsx
// =============================================

import { useState } from 'react'
import {
  CheckCircle,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Users,
  ShoppingBag,
  Package,
  Calendar,
  Globe,
  Mail,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

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

interface StatusTabProps {
  store: ShopifyStore
  organizationId: string
}

// =============================================
// COMPONENT
// =============================================

export function StatusTab({ store, organizationId }: StatusTabProps) {
  const [checkingConnection, setCheckingConnection] = useState(false)
  const [connectionResult, setConnectionResult] = useState<'ok' | 'error' | null>(null)

  const handleCheckConnection = async () => {
    setCheckingConnection(true)
    setConnectionResult(null)
    try {
      const res = await fetch(`/api/shopify/check-connection?storeId=${store.id}`)
      if (res.ok) {
        setConnectionResult('ok')
      } else {
        setConnectionResult('error')
      }
    } catch {
      setConnectionResult('error')
    } finally {
      setCheckingConnection(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <div className="p-5 bg-dark-800/50 border border-dark-700 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary-400" />
            Status da Conexão
          </h3>
          <div className="flex items-center gap-2">
            {store.connection_status === 'active' ? (
              <span className="flex items-center gap-1.5 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                Ativo
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                Erro
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-dark-900/50 rounded-xl">
              <span className="text-dark-400 text-sm flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Domínio
              </span>
              <span className="text-white text-sm font-medium">
                {store.shop_domain}.myshopify.com
              </span>
            </div>
            
            {store.shop_email && (
              <div className="flex items-center justify-between p-3 bg-dark-900/50 rounded-xl">
                <span className="text-dark-400 text-sm flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </span>
                <span className="text-white text-sm font-medium">
                  {store.shop_email}
                </span>
              </div>
            )}
            
            <div className="flex items-center justify-between p-3 bg-dark-900/50 rounded-xl">
              <span className="text-dark-400 text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Conectado em
              </span>
              <span className="text-white text-sm font-medium">
                {new Date(store.created_at).toLocaleDateString('pt-BR')}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleCheckConnection}
              disabled={checkingConnection}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-dark-700 hover:bg-dark-600 disabled:opacity-50 rounded-xl text-white text-sm transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${checkingConnection ? 'animate-spin' : ''}`} />
              Verificar Conexão
            </button>
            
            {connectionResult === 'ok' && (
              <div className="flex items-center justify-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-400 text-sm">Conexão OK!</span>
              </div>
            )}
            
            {connectionResult === 'error' && (
              <div className="flex items-center justify-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-400 text-sm">Falha na conexão</span>
              </div>
            )}
            
            <a
              href={`https://${store.shop_domain}.myshopify.com/admin`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-3 bg-[#96bf48]/20 hover:bg-[#96bf48]/30 rounded-xl text-[#96bf48] text-sm transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir Admin Shopify
            </a>
          </div>
        </div>
      </div>

      {/* Statistics Card */}
      <div className="p-5 bg-dark-800/50 border border-dark-700 rounded-2xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-primary-400" />
          Estatísticas
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-dark-900/50 rounded-xl text-center">
            <Users className="w-6 h-6 text-blue-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">
              {store.total_customers_imported || 0}
            </p>
            <p className="text-xs text-dark-400">Clientes Importados</p>
          </div>
          
          <div className="p-4 bg-dark-900/50 rounded-xl text-center">
            <ShoppingBag className="w-6 h-6 text-green-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">
              {store.total_orders_imported || 0}
            </p>
            <p className="text-xs text-dark-400">Pedidos Sincronizados</p>
          </div>
          
          <div className="p-4 bg-dark-900/50 rounded-xl text-center">
            <Package className="w-6 h-6 text-purple-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">
              -
            </p>
            <p className="text-xs text-dark-400">Deals Criados</p>
          </div>
          
          <div className="p-4 bg-dark-900/50 rounded-xl text-center">
            <Calendar className="w-6 h-6 text-amber-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-white">
              {store.last_sync_at
                ? formatDistanceToNow(new Date(store.last_sync_at), { 
                    addSuffix: true, 
                    locale: ptBR 
                  })
                : 'Nunca'
              }
            </p>
            <p className="text-xs text-dark-400">Última Sincronização</p>
          </div>
        </div>
      </div>

      {/* Webhook Info */}
      <div className="p-5 bg-dark-800/50 border border-dark-700 rounded-2xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-primary-400" />
          Webhook
        </h3>
        
        <div className="space-y-3">
          <div className="p-3 bg-dark-900/50 rounded-xl">
            <label className="block text-sm text-dark-400 mb-2">URL do Webhook</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/shopify/${store.id}`}
                className="flex-1 px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-dark-300 text-sm font-mono"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/shopify/${store.id}`)
                }}
                className="px-4 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-white text-sm transition-colors"
              >
                Copiar
              </button>
            </div>
          </div>
          
          <p className="text-xs text-dark-500">
            Configure esta URL nas configurações de webhook do Shopify para receber eventos em tempo real.
          </p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="flex gap-3">
        <a
          href={`/integrations/shopify/diagnostico?storeId=${store.id}`}
          className="flex items-center gap-2 px-4 py-2.5 bg-dark-700 hover:bg-dark-600 rounded-xl text-white text-sm transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Ver Diagnóstico Completo
        </a>
        <a
          href="/crm"
          className="flex items-center gap-2 px-4 py-2.5 bg-dark-700 hover:bg-dark-600 rounded-xl text-white text-sm transition-colors"
        >
          <Users className="w-4 h-4" />
          Ir para CRM
        </a>
      </div>
    </div>
  )
}

export default StatusTab
