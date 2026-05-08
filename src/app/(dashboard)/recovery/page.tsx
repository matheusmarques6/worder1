'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ShoppingCart,
  ShoppingBag,
  QrCode,
  FileText,
  CreditCard,
  DollarSign,
  TrendingUp,
  CheckCircle,
  Clock,
  Loader2,
  Search,
  Eye,
  MessageCircle,
  Send,
  AlertCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { useStoreStore } from '@/stores'
import { cn } from '@/lib/utils'

type TabKey = 'cart' | 'checkout' | 'pix' | 'boleto' | 'card'

interface RecoveryItem {
  id: string
  customer_name: string
  customer_email: string
  customer_phone?: string
  amount: number
  // Currency from the underlying checkout/order — NOT hardcoded BRL.
  // A UK Shopify store ships checkouts with currency='GBP', a US one
  // with 'USD', etc. The recovery page just formats whatever each row
  // sends back, so cross-store reports keep the right symbol per row.
  currency: string
  status: 'pending' | 'abandoned' | 'sent' | 'recovered' | 'expired' | 'failed'
  type: TabKey
  created_at: string
  recovered_at?: string
  items_count: number
}

interface RecoveryStats {
  total_abandoned: number
  total_recovered: number
  recovery_rate: number
  total_value_recovered: number
}

const tabs: { key: TabKey; label: string; icon: any }[] = [
  { key: 'cart', label: 'Carrinho', icon: ShoppingCart },
  { key: 'checkout', label: 'Checkout', icon: ShoppingBag },
  { key: 'pix', label: 'PIX', icon: QrCode },
  { key: 'boleto', label: 'Boleto', icon: FileText },
  { key: 'card', label: 'Cartão', icon: CreditCard },
]

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: 'Não recuperado', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  abandoned: { label: 'Não recuperado', className: 'bg-amber-50 text-amber-700 border border-amber-200' },
  sent: { label: 'Contatado', className: 'bg-blue-50 text-blue-700 border border-blue-200' },
  recovered: { label: 'Recuperado', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  expired: { label: 'Expirado', className: 'bg-gray-50 text-gray-600 border border-gray-200' },
  failed: { label: 'Falhou', className: 'bg-red-50 text-red-700 border border-red-200' },
}

// Format using the row's actual currency. Locale picks an Intl format
// that matches the currency naturally (GBP → en-GB style "£297.44",
// BRL → pt-BR style "R$ 297,44", USD → en-US style "$297.44").
const formatCurrency = (value: number, currency = 'BRL') => {
  const cur = (currency || 'BRL').toUpperCase()
  // Map currency → preferred locale for natural number/symbol layout.
  const localeMap: Record<string, string> = {
    BRL: 'pt-BR',
    USD: 'en-US',
    EUR: 'de-DE',
    GBP: 'en-GB',
    CAD: 'en-CA',
    AUD: 'en-AU',
    JPY: 'ja-JP',
    MXN: 'es-MX',
    ARS: 'es-AR',
  }
  const locale = localeMap[cur] || 'en-US'
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: cur }).format(value)
  } catch {
    // Unknown ISO code (custom currencies) — fall back to plain number + suffix
    return `${value.toFixed(2)} ${cur}`
  }
}

const formatNumber = (n: number) => new Intl.NumberFormat('pt-BR').format(n)

export default function RecoveryPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>('cart')
  const [items, setItems] = useState<RecoveryItem[]>([])
  const [stats, setStats] = useState<RecoveryStats>({
    total_abandoned: 0,
    total_recovered: 0,
    recovery_rate: 0,
    total_value_recovered: 0,
  })
  const [loading, setLoading] = useState(true)
  // "Sincronizar com Shopify" — pulls abandoned checkouts from Shopify
  // GraphQL into shopify_checkouts so the recovery list matches
  // Shopify Admin's "Checkouts abandonados" page even when webhooks
  // missed deliveries (HMAC mismatch, network drops, pre-alias era).
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // sendingWhatsApp kept for UI state parity even though wa.me opens instantly
  const [sendingWhatsApp] = useState<string | null>(null)
  const { currentStore } = useStoreStore()

  const fetchRecovery = useCallback(async () => {
    if (!currentStore?.id) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ type: activeTab })
      if (currentStore) params.set('store_id', currentStore?.id || '')
      const res = await fetch(`/api/recovery?${params}`)
      if (res.ok) {
        const data = await res.json()
        // Map API-level status → UI-friendly status
        // API: pending | abandoned | recovered | converted
        // UI:  pending | sent    | recovered | expired | failed
        const statusMap: Record<string, RecoveryItem['status']> = {
          pending: 'pending',
          abandoned: 'abandoned',
          recovered: 'recovered',
          converted: 'recovered',
          expired: 'expired',
          failed: 'failed',
          sent: 'sent',
        }
        const rawItems = (data.items || []).map((item: any) => ({
          id: item.id,
          customer_name: item.contact_name || item.customer_name || 'Cliente',
          customer_email: item.email || item.customer_email || '',
          customer_phone: item.phone || item.customer_phone || '',
          amount: parseFloat(item.value || item.amount || '0'),
          // Carry through the per-item currency from the API so each row
          // formats with its own symbol (£, $, €, R$, etc).
          currency: item.currency || 'BRL',
          status: statusMap[item.status] || 'pending',
          type: item.type || activeTab,
          created_at: item.created_at,
          recovered_at: item.recovered_at,
          items_count: item.items_count || 1,
        }))
        setItems(rawItems)
        const s = data.stats || {}
        setStats({
          total_abandoned: s.total || s.total_abandoned || 0,
          total_recovered: s.recovered || s.total_recovered || 0,
          recovery_rate: parseFloat(s.recovery_rate || '0') || 0,
          total_value_recovered: s.revenue_recovered || s.total_value_recovered || 0,
        })
      }
    } catch (err) {
      console.error('Failed to fetch recovery data:', err)
    } finally {
      setLoading(false)
    }
  }, [activeTab, currentStore])

  useEffect(() => {
    fetchRecovery()
  }, [fetchRecovery])

  const handleSendWhatsApp = (item: RecoveryItem) => {
    // Click-to-chat: open WhatsApp with a prefilled recovery message.
    // Pre-existing endpoint /api/recovery/[id]/whatsapp was never implemented.
    const phone = (item.customer_phone || '').replace(/\D/g, '')
    if (!phone) return
    const name = item.customer_name || 'Olá'
    const value = formatCurrency(item.amount, item.currency)
    const text = encodeURIComponent(
      `Oi ${name}! Vi que você deixou itens no carrinho (${value}). Posso te ajudar a finalizar a compra?`
    )
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener,noreferrer')
  }

  const filtered = items.filter(
    (item) =>
      item.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      item.customer_email.toLowerCase().includes(search.toLowerCase())
  )

  const kpis = [
    {
      label: 'TOTAL ABANDONOS',
      value: formatNumber(stats.total_abandoned),
      icon: ShoppingCart,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
    },
    {
      label: 'RECUPERADOS',
      value: formatNumber(stats.total_recovered),
      icon: CheckCircle,
      color: 'text-emerald-500',
      bg: 'bg-emerald-50',
    },
    {
      label: 'TAXA RECUPERAÇÃO',
      value: `${stats.recovery_rate.toFixed(1)}%`,
      icon: TrendingUp,
      color: 'text-blue-500',
      bg: 'bg-blue-50',
    },
    {
      label: 'VALOR RECUPERADO',
      // Aggregate stats use the active store's currency. Per-row values
      // still show their own currency above (a store with mixed-currency
      // checkouts gets each row formatted naturally).
      value: formatCurrency(stats.total_value_recovered, currentStore?.currency || 'BRL'),
      icon: DollarSign,
      color: 'text-brand-500',
      bg: 'bg-brand-50',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Recuperação de Vendas</h1>
          <p className="text-sm text-gray-500 mt-1">
            Recupere vendas perdidas por abandono de carrinho e pagamentos não concluídos
          </p>
        </div>
        <button
          onClick={async () => {
            if (!currentStore?.id || syncing) return
            setSyncing(true)
            setSyncResult(null)
            try {
              const res = await fetch('/api/integrations/shopify/sync-checkouts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ storeId: currentStore.id }),
              })
              const j = await res.json()
              if (j.success) {
                setSyncResult(`${j.fetched} buscados · ${j.inserted} novos · ${j.updated} atualizados${j.contacts_linked ? ` · ${j.contacts_linked} contatos vinculados` : ''}`)
                await fetchRecovery()
              } else {
                setSyncResult(j.error || 'Falhou.')
              }
            } catch (e: any) {
              setSyncResult(e?.message || 'Erro de rede')
            } finally {
              setSyncing(false)
              setTimeout(() => setSyncResult(null), 8000)
            }
          }}
          disabled={syncing}
          className="px-3.5 py-2 text-[13px] font-semibold bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition-colors flex items-center gap-1.5 flex-shrink-0"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
          {syncing ? 'Sincronizando…' : 'Sincronizar com Shopify'}
        </button>
      </div>
      {syncResult && (
        <div className="px-3.5 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[12px] text-emerald-800">
          {syncResult}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white border border-gray-200 rounded-lg shadow-sm p-5"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 ${kpi.bg} rounded-full flex items-center justify-center`}
                >
                  <Icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    {kpi.label}
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">{kpi.value}</p>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Tabs */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="flex border-b border-gray-200">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-brand-500 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Search within tab */}
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
          </div>
        )}

        {/* Empty State */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <RefreshCw className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="text-base font-medium text-gray-500 mb-1">
              Nenhum item de recuperação
            </h3>
            <p className="text-sm text-gray-400">
              {search
                ? 'Tente ajustar sua busca'
                : `Não há registros de ${tabs.find((t) => t.key === activeTab)?.label.toLowerCase()} pendentes`}
            </p>
          </div>
        )}

        {/* Table */}
        {!loading && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Cliente
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Valor
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Itens
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Data
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const status = statusConfig[item.status] || statusConfig.pending
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {item.customer_name}
                          </p>
                          <p className="text-xs text-gray-500">{item.customer_email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${status.className}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-gray-900">
                          {formatCurrency(item.amount, item.currency)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-gray-900">{item.items_count}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm text-gray-500">
                          {new Date(item.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.customer_phone && item.status !== 'recovered' && (
                            <button
                              onClick={() => handleSendWhatsApp(item)}
                              disabled={sendingWhatsApp === item.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                              title="Enviar WhatsApp"
                            >
                              {sendingWhatsApp === item.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <MessageCircle className="w-3.5 h-3.5" />
                              )}
                              WhatsApp
                            </button>
                          )}
                          <button
                            onClick={() => router.push(`/recovery/${item.id}`)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                            title="Ver detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
