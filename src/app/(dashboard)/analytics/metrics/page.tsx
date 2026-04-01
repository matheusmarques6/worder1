'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Search, Loader2, ShoppingCart, CreditCard, CheckCircle, Package, Box, Truck, XCircle, RotateCcw, Eye, Activity, Mail, MailOpen, MousePointerClick, MailX, UserMinus, MoreVertical, ChevronDown } from 'lucide-react'

const ICON_MAP: Record<string, any> = {
  ShoppingCart, CreditCard, CheckCircle, Package, Box, Truck, XCircle, RotateCcw, Eye, Activity,
  Mail, MailOpen, MousePointerClick, MailX, UserMinus,
}

interface Metric {
  key: string; label: string; icon: string; count: number; integration: string
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [integration, setIntegration] = useState('all')
  const [dropdownOpen, setDropdownOpen] = useState(false)

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

  const integrationLabel = integration === 'shopify' ? 'Shopify' : integration === 'worder' ? 'Worder' : 'Todas integrações'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Métricas</h1>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar métricas..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none bg-white" />
        </div>

        {/* Integration dropdown */}
        <div className="relative">
          <button onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-3.5 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors">
            {integration === 'shopify' && (
              <Image src="/integrations/shopify.svg" alt="Shopify" width={16} height={16} className="flex-shrink-0" />
            )}
            {integration === 'worder' && (
              <Image src="/logo.svg" alt="Worder" width={16} height={16} className="flex-shrink-0" />
            )}
            {integrationLabel}
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </button>
          {dropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
                {[
                  { value: 'all', label: 'Todas integrações', logo: null },
                  { value: 'shopify', label: 'Shopify', logo: '/integrations/shopify.svg' },
                  { value: 'worder', label: 'Worder', logo: '/logo.svg' },
                ].map(opt => (
                  <button key={opt.value} onClick={() => { setIntegration(opt.value); setDropdownOpen(false) }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left transition-colors ${integration === opt.value ? 'bg-gray-50 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}>
                    {opt.logo ? (
                      <Image src={opt.logo} alt="" width={18} height={18} className="flex-shrink-0" />
                    ) : (
                      <span className="w-[18px] h-[18px] rounded bg-gray-200 flex items-center justify-center text-[9px] text-gray-500 flex-shrink-0">All</span>
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Métrica ↑</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-sm text-gray-400">Nenhuma métrica encontrada</div>
        ) : (
          <div>
            {filtered.map(metric => {
              const Icon = ICON_MAP[metric.icon] || Activity
              const isShopify = metric.integration === 'shopify'
              return (
                <Link key={metric.key} href={`/analytics/metrics/${metric.key}`}
                  className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50 hover:bg-gray-50/80 transition-colors group">
                  <div className="flex items-center gap-3.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gray-50">
                      {isShopify ? (
                        <Image src="/integrations/icone shopify .png" alt="Shopify" width={22} height={22} className="object-contain" />
                      ) : (
                        <Image src="/logo.svg" alt="Worder" width={22} height={22} className="object-contain" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-gray-900 group-hover:text-brand-600 transition-colors">{metric.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {metric.count > 0 && (
                      <span className="text-sm font-medium text-gray-700">{metric.count.toLocaleString('pt-BR')}</span>
                    )}
                    <button onClick={e => e.preventDefault()} className="p-1 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">1 – {filtered.length} de {filtered.length}</span>
          </div>
        )}
      </div>
    </div>
  )
}
