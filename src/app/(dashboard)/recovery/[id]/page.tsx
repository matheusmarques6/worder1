'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Mail,
  Phone,
  ShoppingCart,
  ShoppingBag,
  ExternalLink,
  Copy,
  Check,
  MessageCircle,
  Loader2,
  Clock,
  CheckCircle,
  RefreshCw,
  XCircle,
  Store as StoreIcon,
  Package,
  Calendar,
  User,
  AlertCircle,
} from 'lucide-react'

interface RecoveryDetail {
  id: string
  type: 'cart' | 'checkout'
  status: string
  contact_id: string | null
  contact: {
    id: string | null
    name: string
    email: string | null
    phone: string | null
    total_orders: number | null
    total_spent: number | null
  }
  store: {
    id: string
    shop_domain: string
    shop_name: string | null
  } | null
  totals: {
    total_price: number
    subtotal_price: number
    total_tax: number
    total_discounts: number
    currency: string
  }
  items: Array<{
    title: string
    variant_title: string | null
    quantity: number
    price: number
    image_url: string | null
    sku: string | null
  }>
  recovery_url: string | null
  timestamps: {
    created_at: string | null
    updated_at: string | null
    abandoned_at: string | null
    recovered_at: string | null
    converted_at: string | null
  }
  events: Array<{
    id: string
    event_type: string
    occurred_at: string
    properties: Record<string, any>
    monetary_value: number | null
    currency: string | null
  }>
}

const statusConfig: Record<string, { label: string; className: string; icon: any }> = {
  pending: {
    label: 'Pendente',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
    icon: Clock,
  },
  abandoned: {
    label: 'Abandonado',
    className: 'bg-orange-50 text-orange-700 border border-orange-200',
    icon: AlertCircle,
  },
  recovered: {
    label: 'Recuperado',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    icon: CheckCircle,
  },
  converted: {
    label: 'Convertido',
    className: 'bg-blue-50 text-blue-700 border border-blue-200',
    icon: CheckCircle,
  },
  expired: {
    label: 'Expirado',
    className: 'bg-gray-50 text-gray-600 border border-gray-200',
    icon: XCircle,
  },
}

const eventLabels: Record<string, string> = {
  checkout_started: 'Iniciou checkout',
  checkout_abandoned: 'Abandonou checkout',
  checkout_completed: 'Concluiu checkout',
  added_to_cart: 'Adicionou ao carrinho',
  placed_order: 'Realizou pedido',
}

const formatCurrency = (value: number, currency = 'BRL') =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value)

const formatDateTime = (iso: string | null) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function RecoveryDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<RecoveryDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false)

  useEffect(() => {
    if (!params?.id) return
    setLoading(true)
    fetch(`/api/recovery/${params.id}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        return res.json()
      })
      .then((json) => setData(json))
      .catch((err) => setError(err.message || 'Erro ao carregar'))
      .finally(() => setLoading(false))
  }, [params?.id])

  const handleCopyRecoveryUrl = async () => {
    if (!data?.recovery_url) return
    await navigator.clipboard.writeText(data.recovery_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSendWhatsApp = async () => {
    if (!data) return
    setSendingWhatsApp(true)
    try {
      await fetch(`/api/recovery/${data.id}/whatsapp`, { method: 'POST' })
    } catch (err) {
      console.error('Failed to send WhatsApp:', err)
    } finally {
      setSendingWhatsApp(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="bg-white border border-red-200 rounded-lg p-6">
          <div className="flex items-center gap-3 text-red-700">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{error || 'Registro não encontrado'}</p>
          </div>
        </div>
      </div>
    )
  }

  const status = statusConfig[data.status] || statusConfig.pending
  const StatusIcon = status.icon
  const TypeIcon = data.type === 'checkout' ? ShoppingBag : ShoppingCart
  const typeLabel = data.type === 'checkout' ? 'Checkout abandonado' : 'Carrinho abandonado'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar para Recuperação
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-50 rounded-full flex items-center justify-center">
              <TypeIcon className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{typeLabel}</h1>
              <p className="text-sm text-gray-500">
                {data.contact.name} · {formatCurrency(data.totals.total_price, data.totals.currency)}
              </p>
            </div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-full ${status.className}`}
        >
          <StatusIcon className="w-3.5 h-3.5" />
          {status.label}
        </span>
      </div>

      {/* Quick actions */}
      {data.recovery_url && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-2">
            Link de recuperação
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 truncate">
              {data.recovery_url}
            </code>
            <button
              onClick={handleCopyRecoveryUrl}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <a
              href={data.recovery_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Abrir
            </a>
            {data.contact.phone && (
              <button
                onClick={handleSendWhatsApp}
                disabled={sendingWhatsApp}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50"
              >
                {sendingWhatsApp ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <MessageCircle className="w-3.5 h-3.5" />
                )}
                WhatsApp
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: items + totals */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">
                Itens ({data.items.length})
              </h2>
            </div>
            {data.items.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400 text-center">Nenhum item</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.items.map((item, i) => (
                  <div key={i} className="px-5 py-4 flex items-center gap-4">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt={item.title}
                        className="w-14 h-14 object-cover rounded-md border border-gray-200"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-gray-100 rounded-md flex items-center justify-center">
                        <Package className="w-5 h-5 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                      {item.variant_title && (
                        <p className="text-xs text-gray-500 truncate">{item.variant_title}</p>
                      )}
                      {item.sku && (
                        <p className="text-xs text-gray-400">SKU: {item.sku}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        {formatCurrency(item.price, data.totals.currency)}
                      </p>
                      <p className="text-xs text-gray-500">Qtd: {item.quantity}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="px-5 py-4 border-t border-gray-100 space-y-1.5">
              {data.totals.subtotal_price > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-900">
                    {formatCurrency(data.totals.subtotal_price, data.totals.currency)}
                  </span>
                </div>
              )}
              {data.totals.total_discounts > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Descontos</span>
                  <span className="text-emerald-600">
                    -{formatCurrency(data.totals.total_discounts, data.totals.currency)}
                  </span>
                </div>
              )}
              {data.totals.total_tax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Impostos</span>
                  <span className="text-gray-900">
                    {formatCurrency(data.totals.total_tax, data.totals.currency)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
                <span className="font-medium text-gray-900">Total</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(data.totals.total_price, data.totals.currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">Linha do tempo</h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              {data.events.length === 0 ? (
                <p className="text-sm text-gray-400">Sem eventos registrados</p>
              ) : (
                data.events.map((ev) => (
                  <div key={ev.id} className="flex items-start gap-3">
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-brand-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">
                        {eventLabels[ev.event_type] || ev.event_type}
                      </p>
                      <p className="text-xs text-gray-500">{formatDateTime(ev.occurred_at)}</p>
                    </div>
                    {ev.monetary_value != null && ev.monetary_value > 0 && (
                      <span className="text-xs text-gray-700 font-medium">
                        {formatCurrency(ev.monetary_value, ev.currency || 'BRL')}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: contact + meta */}
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <User className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">Cliente</h2>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{data.contact.name}</p>
                {data.contact_id && (
                  <Link
                    href={`/contacts/${data.contact_id}`}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    Ver perfil completo
                  </Link>
                )}
              </div>
              {data.contact.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  <a
                    href={`mailto:${data.contact.email}`}
                    className="text-gray-700 hover:text-gray-900 truncate"
                  >
                    {data.contact.email}
                  </a>
                </div>
              )}
              {data.contact.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-700">{data.contact.phone}</span>
                </div>
              )}
              {(data.contact.total_orders != null || data.contact.total_spent != null) && (
                <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-gray-500">Pedidos</p>
                    <p className="text-sm font-medium text-gray-900">
                      {data.contact.total_orders ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">LTV</p>
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(data.contact.total_spent ?? 0, data.totals.currency)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {data.store && (
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <StoreIcon className="w-4 h-4 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-900">Loja</h2>
              </div>
              <div className="px-5 py-4 space-y-1">
                <p className="text-sm font-medium text-gray-900">
                  {data.store.shop_name || data.store.shop_domain}
                </p>
                <p className="text-xs text-gray-500">{data.store.shop_domain}</p>
              </div>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">Datas</h2>
            </div>
            <div className="px-5 py-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Criado</span>
                <span className="text-gray-900">{formatDateTime(data.timestamps.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Atualizado</span>
                <span className="text-gray-900">{formatDateTime(data.timestamps.updated_at)}</span>
              </div>
              {data.timestamps.abandoned_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Abandonado</span>
                  <span className="text-gray-900">{formatDateTime(data.timestamps.abandoned_at)}</span>
                </div>
              )}
              {data.timestamps.recovered_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Recuperado</span>
                  <span className="text-emerald-600">{formatDateTime(data.timestamps.recovered_at)}</span>
                </div>
              )}
              {data.timestamps.converted_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Convertido</span>
                  <span className="text-blue-600">{formatDateTime(data.timestamps.converted_at)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
