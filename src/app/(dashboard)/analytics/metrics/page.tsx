'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Search, Loader2, ShoppingCart, CreditCard, CheckCircle, Package, Box, Truck, XCircle, RotateCcw, Eye, Activity, Mail, MailOpen, MousePointerClick, MailX, UserMinus, MoreVertical, ShoppingBag } from 'lucide-react'

const ICON_MAP: Record<string, any> = {
  ShoppingCart, CreditCard, CheckCircle, Package, Box, Truck, XCircle, RotateCcw, Eye, Activity,
  Mail, MailOpen, MousePointerClick, MailX, UserMinus, ShoppingBag,
}

interface Metric {
  key: string; label: string; icon: string; count: number; integration: string
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [integration, setIntegration] = useState('all')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/analytics/metrics?integration=${integration}`)
      .then(r => r.json())
      .then(data => setMetrics(data.metrics || []))
      .catch(() => setMetrics([]))
      .finally(() => setLoading(false))
  }, [integration])

  const filtered = metrics.filter(m =>
    !search || m.label.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Metricas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Acompanhe todos os eventos rastreados</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar metricas..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:border-gray-400 focus:outline-none" />
        </div>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          {[
            { value: 'all', label: 'Todas' },
            { value: 'shopify', label: 'Shopify', color: '#95BF47' },
            { value: 'worder', label: 'Worder', color: '#F97316' },
          ].map(f => (
            <button key={f.value} onClick={() => setIntegration(f.value)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                integration === f.value ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}>
              {f.color && integration === f.value && (
                <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: f.color }} />
              )}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Metrica</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-400">Nenhuma metrica encontrada</div>
        ) : (
          <div>
            {filtered.map(metric => {
              const Icon = ICON_MAP[metric.icon] || Activity
              const isShopify = metric.integration === 'shopify'
              return (
                <Link key={metric.key} href={`/analytics/metrics/${metric.key}`}
                  className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isShopify ? 'bg-[#95BF47]/10' : 'bg-brand-50'}`}>
                      <Icon className={`w-4 h-4 ${isShopify ? 'text-[#95BF47]' : 'text-brand-500'}`} />
                    </div>
                    <span className="text-sm font-medium text-gray-900 group-hover:text-brand-600 transition-colors">{metric.label}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {metric.count > 0 && (
                      <span className="text-sm text-gray-500">{metric.count.toLocaleString('pt-BR')} nos ultimos 30 dias</span>
                    )}
                    <button className="p-1 text-gray-300 hover:text-gray-500"><MoreVertical className="w-4 h-4" /></button>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="px-5 py-3 text-xs text-gray-400">
            1 - {filtered.length} de {filtered.length}
          </div>
        )}
      </div>
    </div>
  )
}
