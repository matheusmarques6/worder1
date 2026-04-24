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

type TabKey = 'cart' | 'checkout' | 'pix' | 'boleto' | 'card'

interface RecoveryItem {
  id: string
  customer_name: string
  customer_email: string
  customer_phone?: string
  amount: number
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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

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
    const value = formatCurrency(item.amount)
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
      value: formatCurrency(stats.total_value_recovered),
      icon: DollarSign,
      color: 'text-brand-500',
      bg: 'bg-brand-50',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Recuperação de Vendas</h1>
        <p className="text-sm text-gray-500 mt-1">
          Recupere vendas perdidas por abandono de carrinho e pagamentos não concluídos
        </p>
      </div>

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
                          {formatCurrency(item.amount)}
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
