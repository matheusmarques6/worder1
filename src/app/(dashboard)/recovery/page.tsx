'use client'

import { useState, useEffect } from 'react'
import { ShoppingCart, CreditCard, QrCode, FileText, RefreshCcw, Send, Eye, TrendingUp, AlertCircle } from 'lucide-react'

interface RecoveryItem {
  id: string
  type: 'cart' | 'pix' | 'boleto' | 'card_declined'
  contact_name: string
  contact_email: string
  contact_phone?: string
  amount: number
  items_count?: number
  order_number?: string
  status: 'pending' | 'sent' | 'recovered' | 'expired'
  decline_reason?: string
  created_at: string
  expires_at?: string
}

interface RecoveryStats {
  pending: number
  recovered_month: number
  recovery_rate: number
  revenue_recovered: number
}

const tabs = [
  { id: 'cart', label: 'Carrinhos', icon: ShoppingCart },
  { id: 'pix', label: 'PIX', icon: QrCode },
  { id: 'boleto', label: 'Boleto', icon: FileText },
  { id: 'card_declined', label: 'Cartão', icon: CreditCard },
] as const

export default function RecoveryPage() {
  const [activeTab, setActiveTab] = useState<string>('cart')
  const [items, setItems] = useState<RecoveryItem[]>([])
  const [stats, setStats] = useState<RecoveryStats>({ pending: 0, recovered_month: 0, recovery_rate: 0, revenue_recovered: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/recovery?type=${activeTab}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
        setStats(data.stats || stats)
      }
    } catch (err) {
      console.error('Error loading recovery data:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-amber-50 text-amber-700 border border-amber-200',
      sent: 'bg-orange-50 text-orange-700 border border-orange-200',
      recovered: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      expired: 'bg-gray-100 text-gray-600 border border-gray-200',
    }
    const labels: Record<string, string> = {
      pending: 'Pendente',
      sent: 'Enviado',
      recovered: 'Recuperado',
      expired: 'Expirado',
    }
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
        {labels[status] || status}
      </span>
    )
  }

  const kpiCards = [
    { label: 'Pendentes', value: stats.pending, icon: AlertCircle, color: 'text-amber-600' },
    { label: 'Recuperados (mês)', value: stats.recovered_month, icon: RefreshCcw, color: 'text-emerald-600' },
    { label: 'Taxa Recuperação', value: `${stats.recovery_rate.toFixed(1)}%`, icon: TrendingUp, color: 'text-brand-600' },
    { label: 'Receita Recuperada', value: formatCurrency(stats.revenue_recovered), icon: CreditCard, color: 'text-emerald-600' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Recuperação de Vendas</h1>
        <p className="text-sm text-gray-500 mt-1">Carrinhos abandonados, PIX, boletos e cartões recusados</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center ${kpi.color}`}>
                <kpi.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-gray-500">{kpi.label}</p>
                <p className="text-xl font-bold text-gray-900">{typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="flex border-b border-gray-200">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">Carregando...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <ShoppingCart className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-600">Nenhum item encontrado</p>
              <p className="text-xs text-gray-400 mt-1">Itens de recuperação aparecerão aqui quando detectados</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contato</th>
                  {activeTab === 'card_declined' && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pedido</th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {activeTab === 'cart' ? 'Itens' : activeTab === 'card_declined' ? 'Motivo' : 'Vencimento'}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{item.contact_name}</p>
                      <p className="text-xs text-gray-500">{item.contact_email}</p>
                    </td>
                    {activeTab === 'card_declined' && (
                      <td className="px-6 py-4 text-sm text-gray-900">{item.order_number || '-'}</td>
                    )}
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatCurrency(item.amount)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {activeTab === 'cart' ? `${item.items_count || 0} itens` :
                       activeTab === 'card_declined' ? (item.decline_reason || 'Recusado') :
                       item.expires_at ? formatDate(item.expires_at) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(item.created_at)}</td>
                    <td className="px-6 py-4">{getStatusBadge(item.status)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="Enviar WhatsApp">
                          <Send className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Ver detalhes">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
