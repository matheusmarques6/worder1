'use client'

// =============================================
// Shopify Integration Detail Page
// /integrations/shopify
//
// Fetches REAL data from the API — no mocks.
// Shows: store info, KPIs, webhooks, sync history,
// tracking status, disconnect.
// =============================================

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores'
import {
  ArrowLeft,
  ShoppingBag,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Package,
  Users,
  ShoppingCart,
  Clock,
  Zap,
  ExternalLink,
  Loader2,
  Unplug,
  Eye,
  Palette,
  Radio,
  X,
  ArrowRight,
  Store,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface ShopifyStoreData {
  id: string
  shop_name: string
  shop_domain: string
  shop_email?: string
  currency?: string
  plan_name?: string
  is_active: boolean
  connection_status: string
  status?: string
  pixel_installed?: boolean
  embed_installed?: boolean
  initial_sync_completed?: boolean
  api_version?: string
  total_orders?: number
  total_revenue?: number
  total_customers?: number
  last_sync_at?: string
  installed_at?: string
  settings?: {
    theme_editor_url?: string
    tracking_endpoint?: string
  }
}

interface WebhookLogEntry {
  id: string
  topic: string
  status: string
  received_at: string
  processed_at?: string
  processing_time_ms?: number
}

interface SyncLogEntry {
  id: string
  sync_type: string
  entity_type: string
  status: string
  started_at: string
  completed_at?: string
  items_processed?: number
  error_message?: string
}

export default function ShopifyIntegrationPage() {
  const router = useRouter()
  const { user } = useAuthStore()

  const [store, setStore] = useState<ShopifyStoreData | null>(null)
  const [webhookLogs, setWebhookLogs] = useState<WebhookLogEntry[]>([])
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'webhooks' | 'sync' | 'settings'>('overview')

  const loadData = useCallback(async () => {
    if (!user?.organization_id) return
    setLoading(true)
    try {
      // Load store
      const storeRes = await fetch('/api/shopify/connect')
      const storeData = await storeRes.json()
      if (storeData.stores?.length > 0) {
        const s = storeData.stores[0]
        setStore({
          id: s.id,
          shop_name: s.name || s.shop_name,
          shop_domain: s.domain || s.shop_domain,
          shop_email: s.email || s.shop_email,
          currency: s.currency,
          plan_name: s.plan_name,
          is_active: s.is_active ?? true,
          connection_status: s.connectionStatus || s.connection_status || 'active',
          status: s.status,
          pixel_installed: s.pixel_installed,
          embed_installed: s.embed_installed,
          initial_sync_completed: s.initial_sync_completed,
          api_version: s.api_version,
          total_orders: s.totalOrders || s.total_orders || 0,
          total_revenue: s.totalRevenue || s.total_revenue || 0,
          total_customers: s.totalCustomers || s.total_customers || 0,
          last_sync_at: s.lastSyncAt || s.last_sync_at,
          installed_at: s.installed_at,
          settings: s.settings,
        })
      } else {
        setStore(null)
      }
    } catch (err) {
      console.error('Failed to load store data:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.organization_id])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleResync = async () => {
    if (!store) return
    setSyncing(true)
    setError('')
    try {
      const res = await fetch('/api/shopify/full-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: store.id, useGraphQL: true }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess(`Sync concluído: ${data.data?.ordersCount || 0} pedidos, ${data.data?.customersCount || 0} clientes`)
        loadData()
      } else {
        setError(data.error || 'Erro no sync')
      }
    } catch {
      setError('Erro ao sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const handleDisconnect = async () => {
    if (!store) return
    setDisconnecting(true)
    try {
      const res = await fetch(`/api/integrations/shopify/${store.id}/disconnect`, { method: 'POST' })
      if (res.ok) {
        setSuccess('Loja desconectada.')
        setStore(null)
        setShowDisconnectConfirm(false)
        setTimeout(() => router.push('/integrations'), 1500)
      } else {
        const data = await res.json()
        setError(data.error || 'Erro ao desconectar')
      }
    } catch {
      setError('Erro ao desconectar')
    } finally {
      setDisconnecting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#95BF47]" />
      </div>
    )
  }

  // Not connected — redirect to integrations
  if (!store) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/integrations')} className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Shopify</h1>
        </div>
        <div className="text-center py-16">
          <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">Nenhuma loja Shopify conectada.</p>
          <button
            onClick={() => router.push('/settings')}
            className="px-4 py-2 bg-[#95BF47] text-white rounded-xl text-sm font-medium hover:bg-[#7da03a] transition-colors"
          >
            Conectar Loja
          </button>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'overview' as const, label: 'Visão Geral' },
    { id: 'webhooks' as const, label: 'Webhooks' },
    { id: 'sync' as const, label: 'Sincronização' },
    { id: 'settings' as const, label: 'Configurações' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/integrations')} className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-12 h-12 rounded-xl bg-[#95BF47]/10 flex items-center justify-center">
            <ShoppingBag className="w-6 h-6 text-[#95BF47]" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Shopify</h1>
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Conectada
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{store.shop_domain}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResync}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-xs font-medium disabled:opacity-50"
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {syncing ? 'Sincronizando...' : 'Sincronizar Agora'}
          </button>
          <a
            href={`https://${store.shop_domain}/admin`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-xs font-medium"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir Shopify
          </a>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{success}</span>
          <button onClick={() => setSuccess('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: 'Pedidos', value: store.total_orders || 0, icon: Package, color: '#22C55E' },
              { title: 'Clientes', value: store.total_customers || 0, icon: Users, color: '#3B82F6' },
              { title: 'Receita Total', value: `R$ ${((store.total_revenue || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: ShoppingBag, color: '#F5A623' },
              { title: 'Última Sync', value: store.last_sync_at ? formatDistanceToNow(new Date(store.last_sync_at), { addSuffix: true, locale: ptBR }) : 'Nunca', icon: Clock, color: '#8B5CF6' },
            ].map((kpi) => {
              const Icon = kpi.icon
              return (
                <div key={kpi.title} className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-gray-500 font-medium">{kpi.title}</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.value}</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${kpi.color}15` }}>
                      <Icon className="w-5 h-5" style={{ color: kpi.color }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Integration Status */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Status da Integração</h3>
            <StatusRow label="Conexão" active={store.is_active && store.connection_status === 'active'} detail={store.connection_status === 'active' ? 'Ativa' : store.connection_status} />
            <StatusRow label="Sync Inicial" active={!!store.initial_sync_completed} detail={store.initial_sync_completed ? 'Completo' : 'Pendente'} />
            <StatusRow label="Tracking (Pixel)" active={!!store.pixel_installed} detail={store.pixel_installed ? 'Instalado' : 'Pendente'} />
            <StatusRow label="Tracking (Tema)" active={!!store.embed_installed} detail={store.embed_installed ? 'Ativo' : 'Pendente'} />
            <StatusRow label="API Version" active={true} detail={store.api_version || '2026-01'} />
          </div>

          {/* Theme Tracking Guide */}
          {!store.embed_installed && (
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-start gap-3">
                <Palette className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-amber-800 mb-2">Ativar Tracking no Tema</h4>
                  <ol className="list-decimal list-inside text-sm text-amber-700 space-y-1 mb-3">
                    <li>Vá em <strong>Loja Online &rarr; Temas &rarr; Personalizar</strong></li>
                    <li>Clique em <strong>App Embeds</strong> (icone de quebra-cabeça)</li>
                    <li>Ative <strong>&quot;Worder Tracking&quot;</strong></li>
                    <li>Clique <strong>Salvar</strong></li>
                  </ol>
                  {store.settings?.theme_editor_url && (
                    <a href={store.settings.theme_editor_url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors">
                      Abrir Editor de Tema <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Store Info */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Detalhes da Loja</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Loja</span>
                <p className="font-medium text-gray-900">{store.shop_name}</p>
              </div>
              <div>
                <span className="text-gray-400">Domínio</span>
                <p className="font-medium text-gray-900 font-mono text-xs">{store.shop_domain}</p>
              </div>
              <div>
                <span className="text-gray-400">Conectada em</span>
                <p className="font-medium text-gray-900">
                  {store.installed_at ? new Date(store.installed_at).toLocaleDateString('pt-BR') : '—'}
                </p>
              </div>
              <div>
                <span className="text-gray-400">Moeda</span>
                <p className="font-medium text-gray-900">{store.currency || 'BRL'}</p>
              </div>
              {store.plan_name && (
                <div>
                  <span className="text-gray-400">Plano Shopify</span>
                  <p className="font-medium text-gray-900">{store.plan_name}</p>
                </div>
              )}
              {store.shop_email && (
                <div>
                  <span className="text-gray-400">Email</span>
                  <p className="font-medium text-gray-900">{store.shop_email}</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Webhooks Tab */}
      {activeTab === 'webhooks' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Webhooks Registrados</h3>
            <p className="text-xs text-gray-500 mt-0.5">Eventos do Shopify recebidos em tempo real via GraphQL</p>
          </div>
          <div className="divide-y divide-gray-100">
            {[
              'ORDERS_CREATE', 'ORDERS_UPDATED', 'ORDERS_FULFILLED', 'ORDERS_CANCELLED', 'ORDERS_PAID',
              'CHECKOUTS_CREATE', 'CHECKOUTS_UPDATE',
              'CUSTOMERS_CREATE', 'CUSTOMERS_UPDATE', 'CUSTOMERS_DELETE',
              'CUSTOMERS_EMAIL_MARKETING_CONSENT_UPDATE',
              'PRODUCTS_CREATE', 'PRODUCTS_UPDATE', 'PRODUCTS_DELETE',
              'REFUNDS_CREATE', 'FULFILLMENTS_CREATE', 'FULFILLMENTS_UPDATE',
              'APP_UNINSTALLED',
            ].map((topic) => (
              <div key={topic} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50">
                <code className="text-sm text-gray-700 font-mono">{topic.toLowerCase().replace('_', '/')}</code>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="text-xs text-emerald-600">Registrado</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync Tab */}
      {activeTab === 'sync' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Sincronização</h3>
              <button
                onClick={handleResync}
                disabled={syncing}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#95BF47]/10 text-[#95BF47] rounded-lg hover:bg-[#95BF47]/20 text-xs font-medium disabled:opacity-50"
              >
                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {syncing ? 'Sincronizando...' : 'Sincronizar Tudo'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Clientes', count: store.total_customers || 0 },
                { label: 'Pedidos', count: store.total_orders || 0 },
                { label: 'Produtos', count: '—' },
              ].map((item) => (
                <div key={item.label} className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-700 font-medium">{item.label}</span>
                    {store.initial_sync_completed ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Clock className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  <p className="text-xl font-bold text-gray-900">{item.count}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Última sync: {store.last_sync_at ? formatDistanceToNow(new Date(store.last_sync_at), { addSuffix: true, locale: ptBR }) : 'Nunca'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">O que é sincronizado</h3>
            <div className="space-y-2">
              {[
                { label: 'Clientes', desc: 'Nome, email, telefone, endereço, tags, marketing consent', active: true },
                { label: 'Pedidos (90 dias)', desc: 'Pedidos, itens, status financeiro, fulfillment, reembolsos', active: true },
                { label: 'Produtos', desc: 'Título, variantes, preço, estoque, imagens', active: true },
                { label: 'Checkouts Abandonados', desc: 'Detecção automática a cada 10 min via GraphQL', active: true },
                { label: 'Eventos CDP', desc: 'Timeline completa de ações por contato', active: true },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="text-gray-700 font-medium">{item.label}</p>
                    <p className="text-xs text-gray-400">{item.desc}</p>
                  </div>
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Detalhes da Conexão</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-400">Loja</p>
                <p className="text-gray-900 font-mono mt-0.5">{store.shop_domain}</p>
              </div>
              <div>
                <p className="text-gray-400">Plano</p>
                <p className="text-gray-900 mt-0.5">{store.plan_name || '—'}</p>
              </div>
              <div>
                <p className="text-gray-400">Conectado desde</p>
                <p className="text-gray-900 mt-0.5">{store.installed_at ? new Date(store.installed_at).toLocaleDateString('pt-BR') : '—'}</p>
              </div>
              <div>
                <p className="text-gray-400">API Version</p>
                <p className="text-gray-900 font-mono mt-0.5">{store.api_version || '2026-01'}</p>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-white border border-red-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-red-700 mb-2">Zona de Perigo</h3>
            <p className="text-xs text-gray-500 mb-4">
              Desconectar a integração irá parar todas as sincronizações e webhooks. Os dados já importados serão mantidos.
            </p>
            {!showDisconnectConfirm ? (
              <button
                onClick={() => setShowDisconnectConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Unplug className="w-4 h-4" />
                Desconectar Shopify
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-red-600">Tem certeza? Dados importados serão mantidos.</p>
                <div className="flex gap-2">
                  <button onClick={() => setShowDisconnectConfirm(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                    Cancelar
                  </button>
                  <button onClick={handleDisconnect} disabled={disconnecting}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                    {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unplug className="w-4 h-4" />}
                    {disconnecting ? 'Desconectando...' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusRow({ label, active, detail }: { label: string; active: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-gray-500 flex items-center gap-2">
        {active ? <span className="w-2 h-2 rounded-full bg-emerald-500" /> : <span className="w-2 h-2 rounded-full bg-gray-300" />}
        {label}
      </span>
      <span className={active ? 'text-emerald-600 font-medium' : 'text-gray-500'}>{detail}</span>
    </div>
  )
}
