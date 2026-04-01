'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ExternalLink, RefreshCw, Trash2, Settings, ShoppingBag, CheckCircle, AlertCircle, Wifi, WifiOff } from 'lucide-react'
import { useStoreStore, useAuthStore } from '@/stores'

interface ConnectedStore {
  id: string
  shop_domain: string
  shop_name: string
  access_token: string
  status: string
  initial_sync_completed: boolean
  pixel_installed: boolean
  installed_at: string
  last_sync_at: string | null
  sync_status: string
  orders_count: number
  customers_count: number
  products_count: number
}

export default function IntegrationsPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { stores } = useStoreStore()
  const [loading, setLoading] = useState(true)
  const [connectedStores, setConnectedStores] = useState<ConnectedStore[]>([])
  const [syncing, setSyncing] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  useEffect(() => {
    async function loadStores() {
      try {
        const res = await fetch('/api/integrations/shopify/status')
        if (res.ok) {
          const data = await res.json()
          if (data.stores) setConnectedStores(data.stores)
          else if (data.store) setConnectedStores([data.store])
        }
      } catch (e) {
        console.error('Failed to load integrations:', e)
      }
      setLoading(false)
    }
    loadStores()
  }, [])

  const handleSync = async (storeId: string) => {
    setSyncing(storeId)
    try {
      await fetch('/api/shopify/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId }),
      })
      // Reload after sync
      const res = await fetch('/api/integrations/shopify/status')
      if (res.ok) {
        const data = await res.json()
        if (data.stores) setConnectedStores(data.stores)
        else if (data.store) setConnectedStores([data.store])
      }
    } catch (e) {
      console.error('Sync failed:', e)
    }
    setSyncing(null)
  }

  const handleDisconnect = async (storeId: string) => {
    if (!confirm('Desconectar esta loja? Os dados sincronizados serão mantidos.')) return
    setDisconnecting(storeId)
    try {
      await fetch(`/api/integrations/shopify/${storeId}/disconnect`, { method: 'POST' })
      setConnectedStores(prev => prev.filter(s => s.id !== storeId))
    } catch (e) {
      console.error('Disconnect failed:', e)
    }
    setDisconnecting(null)
  }

  const handleConnect = () => {
    router.push('/integrations/shopify')
  }

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Integrações</h1>
          <p className="text-sm text-gray-500 mt-0.5">Conecte suas ferramentas e plataformas</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* E-Commerce Section */}
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">E-commerce</h2>

            {/* Connected stores */}
            {connectedStores.map(store => (
              <div key={store.id} className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4">
                {/* Store header */}
                <div className="px-6 py-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#95BF47]/10 rounded-xl flex items-center justify-center">
                      <ShoppingBag className="w-6 h-6 text-[#95BF47]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-gray-900">{store.shop_name || 'Shopify'}</h3>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full bg-emerald-50 text-emerald-700">
                          <Wifi className="w-3 h-3" /> Conectada
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">{store.shop_domain}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleSync(store.id)} disabled={syncing === store.id}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
                      {syncing === store.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Sincronizar
                    </button>
                    <button onClick={() => router.push('/integrations/shopify')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <Settings className="w-4 h-4" />
                      Configurar
                    </button>
                    <button onClick={() => handleDisconnect(store.id)} disabled={disconnecting === store.id}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-red-600 bg-white border border-gray-200 rounded-lg hover:bg-red-50 hover:border-red-200 disabled:opacity-50 transition-colors">
                      {disconnecting === store.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Store stats */}
                <div className="border-t border-gray-100 px-6 py-4">
                  <div className="grid grid-cols-4 gap-6">
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase">Pedidos</p>
                      <p className="text-lg font-semibold text-gray-900 mt-0.5">{(store.orders_count || 0).toLocaleString('pt-BR')}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase">Clientes</p>
                      <p className="text-lg font-semibold text-gray-900 mt-0.5">{(store.customers_count || 0).toLocaleString('pt-BR')}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase">Produtos</p>
                      <p className="text-lg font-semibold text-gray-900 mt-0.5">{(store.products_count || 0).toLocaleString('pt-BR')}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase">Última Sync</p>
                      <p className="text-sm font-medium text-gray-900 mt-1">{formatDate(store.last_sync_at)}</p>
                    </div>
                  </div>
                </div>

                {/* Status indicators */}
                <div className="border-t border-gray-100 px-6 py-3">
                  <div className="flex items-center gap-4 text-xs">
                    <span className={`flex items-center gap-1 ${store.initial_sync_completed ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {store.initial_sync_completed ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      Sync {store.initial_sync_completed ? 'Completa' : 'Pendente'}
                    </span>
                    <span className={`flex items-center gap-1 ${store.pixel_installed ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {store.pixel_installed ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      Pixel {store.pixel_installed ? 'Instalado' : 'Não instalado'}
                    </span>
                    <span className="text-gray-400">
                      Conectada em {formatDate(store.installed_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {/* Add new Shopify store */}
            <button onClick={handleConnect}
              className="w-full flex items-center justify-between p-5 bg-white rounded-xl border border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-all group">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                  <ShoppingBag className="w-6 h-6 text-gray-400" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-semibold text-gray-900">Conectar loja Shopify</h3>
                  <p className="text-sm text-gray-500">Sincronize pedidos, clientes e produtos automaticamente</p>
                </div>
              </div>
              <span className="text-sm font-medium text-gray-500 group-hover:text-gray-700">Conectar →</span>
            </button>
          </div>

          {/* Coming Soon */}
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Em Breve</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { name: 'WooCommerce', desc: 'Integração com WordPress', icon: '🛒' },
                { name: 'Nuvemshop', desc: 'Plataforma líder na América Latina', icon: '☁️' },
                { name: 'Meta Ads', desc: 'Facebook e Instagram Ads', icon: '📘' },
                { name: 'Google Ads', desc: 'Campanhas de pesquisa e display', icon: '🔍' },
              ].map(item => (
                <div key={item.name} className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 opacity-60">
                  <span className="text-2xl">{item.icon}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{item.name}</p>
                    <p className="text-xs text-gray-400">{item.desc}</p>
                  </div>
                  <span className="ml-auto text-[10px] font-medium text-gray-400 uppercase bg-gray-100 px-2 py-0.5 rounded">Em breve</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
