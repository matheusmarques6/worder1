'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ShoppingCart,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  Package,
  User,
  Clock,
  DollarSign,
  CheckCircle,
  XCircle,
  AlertCircle,
  Truck,
  CreditCard,
  Store,
  Loader2,
  Eye,
  X,
} from 'lucide-react'
import { useStoreStore } from '@/stores'

interface Order {
  id: string
  name: string
  order_number: string
  created_at: string
  customer: {
    name: string
    email: string
    phone?: string
  }
  financial_status: string
  fulfillment_status: string
  currency: string
  subtotal_price: number
  total_discounts: number
  total_shipping: number
  total_tax: number
  total_price: number
  line_items_count: number
  line_items: any[]
  store_id: string
  store_name: string
  tags?: string
  gateway?: string
}

const formatCurrency = (value: number, currency = 'BRL') => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value)
}

const formatDate = (dateStr: string) => {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr))
}

const StatusBadge = ({ status, type }: { status: string; type: 'financial' | 'fulfillment' }) => {
  const configs: Record<string, { color: string; icon: React.ElementType; label: string }> = {
    // Financial
    paid: { color: 'bg-green-500/20 text-green-400', icon: CheckCircle, label: 'Pago' },
    pending: { color: 'bg-yellow-500/20 text-yellow-400', icon: Clock, label: 'Pendente' },
    refunded: { color: 'bg-red-500/20 text-red-400', icon: XCircle, label: 'Reembolsado' },
    partially_refunded: { color: 'bg-orange-500/20 text-orange-400', icon: AlertCircle, label: 'Parcial' },
    voided: { color: 'bg-gray-500/20 text-gray-400', icon: XCircle, label: 'Cancelado' },
    // Fulfillment
    fulfilled: { color: 'bg-green-500/20 text-green-400', icon: CheckCircle, label: 'Enviado' },
    unfulfilled: { color: 'bg-yellow-500/20 text-yellow-400', icon: Package, label: 'Não enviado' },
    partial: { color: 'bg-blue-500/20 text-blue-400', icon: Truck, label: 'Parcial' },
  }

  const config = configs[status] || { color: 'bg-gray-500/20 text-gray-400', icon: AlertCircle, label: status }
  const Icon = config.icon

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

const OrderDetailsModal = ({ order, onClose }: { order: Order; onClose: () => void }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative bg-white rounded-2xl border border-gray-200 p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center">
            <ShoppingCart className="w-6 h-6 text-brand-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Pedido {order.name}</h2>
            <p className="text-gray-500 text-sm">{formatDate(order.created_at)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-500 mb-1">Status Pagamento</p>
            <StatusBadge status={order.financial_status} type="financial" />
          </div>
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-500 mb-1">Status Envio</p>
            <StatusBadge status={order.fulfillment_status} type="fulfillment" />
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Cliente</h3>
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="text-white font-medium">{order.customer.name}</p>
            <p className="text-gray-500 text-sm">{order.customer.email}</p>
            {order.customer.phone && (
              <p className="text-gray-500 text-sm">{order.customer.phone}</p>
            )}
          </div>
        </div>

        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Itens ({order.line_items_count})</h3>
          <div className="space-y-2">
            {order.line_items?.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div className="flex-1">
                  <p className="text-white font-medium text-sm">{item.title}</p>
                  {item.variant_title && item.variant_title !== 'Default Title' && (
                    <p className="text-gray-500 text-xs">{item.variant_title}</p>
                  )}
                  {item.sku && <p className="text-gray-400 text-xs">SKU: {item.sku}</p>}
                </div>
                <div className="text-right">
                  <p className="text-white text-sm">{item.quantity}x {formatCurrency(item.price)}</p>
                  <p className="text-gray-500 text-xs">{formatCurrency(item.quantity * item.price)}</p>
                </div>
              </div>
            ))}
            {order.line_items_count > 3 && (
              <p className="text-center text-gray-500 text-sm py-2">
                +{order.line_items_count - 3} outros itens
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-white">{formatCurrency(order.subtotal_price)}</span>
            </div>
            {order.total_discounts > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Descontos</span>
                <span className="text-green-400">-{formatCurrency(order.total_discounts)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Frete</span>
              <span className="text-white">{formatCurrency(order.total_shipping)}</span>
            </div>
            {order.total_tax > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Impostos</span>
                <span className="text-white">{formatCurrency(order.total_tax)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-gray-200">
              <span className="text-white font-semibold">Total</span>
              <span className="text-white font-semibold text-lg">{formatCurrency(order.total_price)}</span>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const { currentStore, stores } = useStoreStore()

  const fetchOrders = useCallback(async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()

      if (currentStore?.id) {
        params.append('storeId', currentStore.id)
      }
      if (search) {
        params.append('search', search)
      }
      if (selectedStatus) {
        params.append('financialStatus', selectedStatus)
      }

      const response = await fetch(`/api/orders?${params.toString()}`)
      const data = await response.json()

      if (response.ok) {
        setOrders(data.orders || [])
      }
    } catch (error) {
      console.error('Error fetching orders:', error)
    } finally {
      setIsLoading(false)
    }
  }, [currentStore, search, selectedStatus])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Stats
  const totalRevenue = orders.reduce((sum, o) => sum + o.total_price, 0)
  const paidOrders = orders.filter(o => o.financial_status === 'paid').length
  const pendingOrders = orders.filter(o => o.financial_status === 'pending').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-gray-500 mt-1">Gerencie os pedidos da sua loja</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchOrders}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-600 hover:text-white transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-brand-100">
              <ShoppingCart className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Pedidos</p>
              <p className="text-xl font-bold text-gray-900">{orders.length}</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <DollarSign className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Receita Total</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pagos</p>
              <p className="text-xl font-bold text-gray-900">{paidOrders}</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <Clock className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pendentes</p>
              <p className="text-xl font-bold text-gray-900">{pendingOrders}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por número, cliente ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
          />
        </div>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-white focus:outline-none focus:border-primary-500"
        >
          <option value="">Todos os status</option>
          <option value="paid">Pago</option>
          <option value="pending">Pendente</option>
          <option value="refunded">Reembolsado</option>
        </select>
      </div>

      {/* Orders List */}
      <div className="bg-gray-50 rounded-2xl border border-gray-200/30 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <ShoppingCart className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-500">Nenhum pedido encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b border-gray-200">
                  <th className="px-6 py-4 font-medium">Pedido</th>
                  <th className="px-6 py-4 font-medium">Cliente</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Envio</th>
                  <th className="px-6 py-4 font-medium text-right">Total</th>
                  <th className="px-6 py-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-gray-200/30 hover:bg-gray-100/20 transition-colors cursor-pointer"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-white">{order.name}</p>
                        <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-white">{order.customer.name}</p>
                        <p className="text-xs text-gray-500">{order.customer.email}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={order.financial_status} type="financial" />
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={order.fulfillment_status} type="fulfillment" />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-medium text-white">{formatCurrency(order.total_price)}</p>
                      <p className="text-xs text-gray-500">{order.line_items_count} itens</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); }}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4 text-gray-500" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <OrderDetailsModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </div>
  )
}
