'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft, Loader2, ShoppingCart, CreditCard, CheckCircle, Package, Box, Truck,
  XCircle, RotateCcw, Eye, Activity, Mail, MailOpen, MousePointerClick, MailX,
  UserMinus, ShoppingBag, MoreVertical, ChevronDown, ChevronRight, X, User,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const ICON_MAP: Record<string, any> = {
  ShoppingCart, CreditCard, CheckCircle, Package, Box, Truck, XCircle, RotateCcw, Eye, Activity,
  Mail, MailOpen, MousePointerClick, MailX, UserMinus, ShoppingBag,
}

const METRIC_INFO: Record<string, { label: string; icon: string; integration: string }> = {
  added_to_cart: { label: 'Added to Cart', icon: 'ShoppingCart', integration: 'shopify' },
  checkout_started: { label: 'Checkout Started', icon: 'CreditCard', integration: 'shopify' },
  checkout_completed: { label: 'Checkout Completed', icon: 'CheckCircle', integration: 'shopify' },
  placed_order: { label: 'Placed Order', icon: 'Package', integration: 'shopify' },
  ordered_product: { label: 'Ordered Product', icon: 'Box', integration: 'shopify' },
  fulfilled_order: { label: 'Fulfilled Order', icon: 'Truck', integration: 'shopify' },
  cancelled_order: { label: 'Cancelled Order', icon: 'XCircle', integration: 'shopify' },
  refunded_order: { label: 'Refunded Order', icon: 'RotateCcw', integration: 'shopify' },
  viewed_product: { label: 'Viewed Product', icon: 'Eye', integration: 'shopify' },
  active_on_site: { label: 'Active on Site', icon: 'Activity', integration: 'shopify' },
  email_received: { label: 'Email Received', icon: 'Mail', integration: 'worder' },
  email_opened: { label: 'Email Opened', icon: 'MailOpen', integration: 'worder' },
  email_clicked: { label: 'Email Clicked', icon: 'MousePointerClick', integration: 'worder' },
  email_bounced: { label: 'Email Bounced', icon: 'MailX', integration: 'worder' },
  email_unsubscribed: { label: 'Unsubscribed', icon: 'UserMinus', integration: 'worder' },
}

interface ChartPoint {
  date: string
  count: number
}

interface FeedEvent {
  id: string
  contactId: string
  contactName: string
  contactEmail: string
  eventType: string
  properties: any
  monetaryValue: number | null
  currency: string | null
  occurredAt: string
  receivedAt: string
  shopifyResourceId: string | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function formatChartDate(date: string) {
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// JSON properties modal
function PropertiesModal({ properties, onClose }: { properties: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Propriedades do Evento</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-auto max-h-[calc(80vh-60px)]">
          <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-4 overflow-auto whitespace-pre-wrap break-words">
            {JSON.stringify(properties, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}

// Items table for line items
function ItemsTable({ items }: { items: any[] }) {
  if (!items || items.length === 0) return null

  return (
    <div className="mt-3 ml-11 border border-gray-100 rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-gray-500">
            <th className="text-left px-3 py-2 font-medium">Produto</th>
            <th className="text-right px-3 py-2 font-medium">Qtd</th>
            <th className="text-right px-3 py-2 font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, i: number) => (
            <tr key={i} className="border-t border-gray-50">
              <td className="px-3 py-2 text-gray-700">
                {item.title || item.name || item.product_title || 'Item'}
                {item.variant_title && <span className="text-gray-400 ml-1">({item.variant_title})</span>}
              </td>
              <td className="px-3 py-2 text-right text-gray-600">{item.quantity || 1}</td>
              <td className="px-3 py-2 text-right text-gray-600">
                {item.price ? `R$ ${Number(item.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Single feed event row
function FeedEventRow({ event }: { event: FeedEvent }) {
  const [expanded, setExpanded] = useState(false)
  const [showProps, setShowProps] = useState(false)

  const items = event.properties?.Items || event.properties?.line_items || null

  return (
    <>
      <div className="px-5 py-4 border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {items && items.length > 0 ? (
              <button onClick={() => setExpanded(!expanded)} className="mt-0.5 p-0.5 text-gray-400 hover:text-gray-600">
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : (
              <div className="w-5" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5 text-gray-400" />
                <Link href={event.contactId ? `/contacts/${event.contactId}` : '#'}
                  className="text-sm font-medium text-gray-900 hover:text-brand-600 transition-colors">
                  {event.contactName}
                </Link>
              </div>
              {event.contactEmail && (
                <p className="text-xs text-gray-400 mt-0.5 ml-5.5">{event.contactEmail}</p>
              )}
              {event.monetaryValue && (
                <p className="text-xs text-green-600 mt-1 ml-5.5 font-medium">
                  {event.currency || 'BRL'} {Number(event.monetaryValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{formatDateTime(event.occurredAt)}</span>
            <button
              onClick={() => setShowProps(true)}
              className="p-1 text-gray-300 hover:text-gray-500 transition-colors"
              title="Ver propriedades"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>
        {expanded && items && <ItemsTable items={items} />}
      </div>
      {showProps && <PropertiesModal properties={event.properties} onClose={() => setShowProps(false)} />}
    </>
  )
}

export default function MetricDetailPage() {
  const params = useParams()
  const metricKey = params.metric as string
  const info = METRIC_INFO[metricKey] || { label: metricKey, icon: 'Activity', integration: 'shopify' }
  const Icon = ICON_MAP[info.icon] || Activity
  const isShopify = info.integration === 'shopify'

  const [tab, setTab] = useState<'chart' | 'feed'>('chart')
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)

  // Chart state
  const [chartData, setChartData] = useState<ChartPoint[]>([])
  const [total, setTotal] = useState(0)

  // Feed state
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [feedTotal, setFeedTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 20

  const fetchChart = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/analytics/metrics/${metricKey}?tab=chart&days=${days}`)
      const data = await res.json()
      setChartData(data.chartData || [])
      setTotal(data.total || 0)
    } catch {
      setChartData([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [metricKey, days])

  const fetchFeed = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/analytics/metrics/${metricKey}?tab=feed&page=${p}&limit=${limit}`)
      const data = await res.json()
      setEvents(data.events || [])
      setFeedTotal(data.total || 0)
    } catch {
      setEvents([])
      setFeedTotal(0)
    } finally {
      setLoading(false)
    }
  }, [metricKey])

  useEffect(() => {
    if (tab === 'chart') {
      fetchChart()
    } else {
      fetchFeed(page)
    }
  }, [tab, days, page, fetchChart, fetchFeed])

  const totalPages = Math.ceil(feedTotal / limit)

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Back link */}
      <Link href="/analytics/metrics" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Metricas
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isShopify ? 'bg-[#95BF47]/10' : 'bg-brand-50'}`}>
          <Icon className={`w-5 h-5 ${isShopify ? 'text-[#95BF47]' : 'text-brand-500'}`} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{info.label}</h1>
          <p className="text-sm text-gray-500 capitalize">{info.integration}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-gray-200 mb-6">
        {[
          { key: 'chart' as const, label: 'Grafico' },
          { key: 'feed' as const, label: 'Atividades' },
        ].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setPage(1) }}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              tab === t.key
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart Tab */}
      {tab === 'chart' && (
        <div>
          {/* Controls */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Periodo:</span>
              <div className="flex border border-gray-200 rounded-lg overflow-hidden">
                {[
                  { value: 7, label: '7 dias' },
                  { value: 30, label: '30 dias' },
                  { value: 90, label: '90 dias' },
                ].map(d => (
                  <button key={d.value} onClick={() => setDays(d.value)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      days === d.value ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                    }`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-sm text-gray-500">
              Total: <span className="font-semibold text-gray-900">{total.toLocaleString('pt-BR')}</span>
            </div>
          </div>

          {/* Chart */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : chartData.length === 0 ? (
              <div className="text-center py-24 text-sm text-gray-400">Nenhum dado disponivel para o periodo selecionado</div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatChartDate}
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                      fontSize: '12px',
                    }}
                    labelFormatter={(label) => formatDate(label)}
                    formatter={(value: number) => [value.toLocaleString('pt-BR'), 'Eventos']}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={isShopify ? '#95BF47' : '#F97316'}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Feed Tab */}
      {tab === 'feed' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Atividade Recente</p>
            <p className="text-xs text-gray-400">{feedTotal.toLocaleString('pt-BR')} evento{feedTotal !== 1 ? 's' : ''}</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-16 text-sm text-gray-400">Nenhuma atividade encontrada</div>
          ) : (
            <>
              {events.map(event => (
                <FeedEventRow key={event.id} event={event} />
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400">
                    Pagina {page} de {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Proximo
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
