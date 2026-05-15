'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  ShoppingBag,
  MagnifyingGlass,
  PencilSimple,
  Eye,
  ArrowLeft,
  CurrencyDollar,
  Package,
  ArrowsClockwise,
  Export,
  CheckCircle,
  XCircle,
} from '@phosphor-icons/react'
import { useStoreStore } from '@/stores'

interface Product {
  id: string
  shopifyProductId: string
  title: string
  handle: string
  vendor: string | null
  productType: string | null
  status: string
  price: number
  compareAtPrice: number | null
  sku: string | null
  totalInventory: number
  tags: string
  variants: any[]
  images: { url: string; alt: string | null }[]
  createdAt: string
  updatedAt: string
}

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: 'Ativo', color: 'bg-emerald-500/10 text-emerald-600' },
  draft: { label: 'Rascunho', color: 'bg-zinc-500/10 text-gray-600' },
  archived: { label: 'Arquivado', color: 'bg-red-500/10 text-red-600' },
}

export default function ProductsPage() {
  const { currentStore } = useStoreStore()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'title' | 'price' | 'totalInventory' | 'updatedAt'>('updatedAt')
  const [storeId, setStoreId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchProducts = useCallback(async () => {
    if (!currentStore?.id) return
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (currentStore?.id) params.set('storeId', currentStore.id)
      const res = await fetch(`/api/products/shopify?${params}`)
      if (!res.ok) throw new Error('Falha ao carregar produtos')
      const data = await res.json()
      setProducts(data.products || [])
      setStoreId(data.storeId || null)
    } catch (err: any) {
      console.error('Error fetching products:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentStore?.id])

  const hasHydrated = useStoreStore((s) => s._hasHydrated)
  useEffect(() => {
    if (!hasHydrated) return
    fetchProducts()
  }, [fetchProducts, hasHydrated])

  const handleSync = async () => {
    if (syncing) return
    try {
      setSyncing(true)
      setError(null)
      const syncBody: Record<string, string> = { syncType: 'products' }
      if (currentStore?.id) syncBody.storeId = currentStore.id
      const res = await fetch('/api/shopify/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncBody),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Sync failed (${res.status})`)
      }
      if (data.errors && data.errors.length > 0) {
        setError(`Sync parcial: ${data.errors[0]}`)
      }
      console.log('[Products] Sync result:', data)
      await fetchProducts()
    } catch (err: any) {
      console.error('Sync error:', err)
      setError(err.message || 'Erro desconhecido no sync')
    } finally {
      setSyncing(false)
    }
  }

  // Compute KPIs from real data
  const totalProducts = products.length
  const activeProducts = products.filter((p) => p.status === 'active').length
  const outOfStock = products.filter((p) => p.totalInventory === 0).length

  const kpis = [
    { title: 'Total de Produtos', value: totalProducts.toString(), icon: ShoppingBag, color: 'text-[#F26B2A]' },
    { title: 'Ativos', value: activeProducts.toString(), icon: CheckCircle, color: 'text-emerald-600' },
    { title: 'Sem Estoque', value: outOfStock.toString(), icon: XCircle, color: 'text-red-600' },
    { title: 'Rascunhos', value: products.filter((p) => p.status === 'draft').length.toString(), icon: Package, color: 'text-gray-600' },
  ]

  // Collect unique product types for filtering
  const productTypes = ['all', ...new Set(products.map((p) => p.productType).filter(Boolean))] as string[]

  const filtered = products
    .filter((p) => {
      const matchSearch =
        !search ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(search.toLowerCase())) ||
        (p.vendor && p.vendor.toLowerCase().includes(search.toLowerCase()))
      const matchStatus = statusFilter === 'all' || p.status === statusFilter
      return matchSearch && matchStatus
    })
    .sort((a, b) => {
      if (sortBy === 'price') return b.price - a.price
      if (sortBy === 'totalInventory') return b.totalInventory - a.totalInventory
      if (sortBy === 'updatedAt') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      return a.title.localeCompare(b.title)
    })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <ArrowsClockwise size={32} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/content" className="p-2 rounded-lg hover:bg-gray-50 transition-colors">
            <ArrowLeft size={18} className="text-gray-500" />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <ShoppingBag size={22} className="text-[#F26B2A]" weight="fill" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">Produtos</h1>
            <p className="text-sm text-gray-500 mt-0.5">Catalogo sincronizado da sua loja</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 text-xs disabled:opacity-50"
          >
            <ArrowsClockwise size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando...' : 'Sync Produtos'}
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 text-xs">
            <Export size={14} />
            Exportar
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          return (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white/50 border border-gray-200 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className={kpi.color} />
                <span className="text-xs text-gray-500">{kpi.title}</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{kpi.value}</p>
            </motion.div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por nome, SKU ou fornecedor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {['all', 'active', 'draft', 'archived'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === s ? 'bg-brand-500 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {s === 'all' ? 'Todos' : s === 'active' ? 'Ativos' : s === 'draft' ? 'Rascunhos' : 'Arquivados'}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none"
        >
          <option value="updatedAt">Mais recentes</option>
          <option value="price">Maior preco</option>
          <option value="totalInventory">Mais estoque</option>
          <option value="title">Nome A-Z</option>
        </select>
      </div>

      {/* Products Table */}
      {filtered.length === 0 ? (
        <div className="bg-white/50 border border-gray-200 rounded-xl p-12 text-center">
          <Package size={32} className="text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {products.length === 0 ? 'Nenhum produto sincronizado ainda. Clique em "Sync Produtos" para importar.' : 'Nenhum produto encontrado com os filtros atuais.'}
          </p>
        </div>
      ) : (
        <div className="bg-white/50 border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left text-xs text-gray-500 font-medium p-4 pb-3">Produto</th>
                <th className="text-left text-xs text-gray-500 font-medium p-4 pb-3">SKU</th>
                <th className="text-left text-xs text-gray-500 font-medium p-4 pb-3">Status</th>
                <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Preco</th>
                <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Estoque</th>
                <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Tipo</th>
                <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const status = statusConfig[product.status] || { label: product.status, color: 'bg-zinc-500/10 text-gray-600' }
                const imageUrl = product.images?.[0]?.url
                return (
                  <tr key={product.id} className="border-b border-gray-200/50 hover:bg-gray-50/30 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={product.title}
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                            <Package size={18} className="text-gray-400" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm text-gray-900 font-medium">{product.title}</p>
                          {product.vendor && <p className="text-xs text-gray-500">{product.vendor}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <code className="text-xs text-gray-600 font-mono">{product.sku || '—'}</code>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <p className="text-sm text-gray-900 font-medium">
                        R$ {product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      {product.compareAtPrice && (
                        <p className="text-xs text-gray-400 line-through">
                          R$ {product.compareAtPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <span
                        className={`text-sm ${
                          product.totalInventory === 0
                            ? 'text-red-600'
                            : product.totalInventory < 20
                            ? 'text-yellow-600'
                            : 'text-gray-600'
                        }`}
                      >
                        {product.totalInventory}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-gray-600 text-right">{product.productType || '—'}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-1 justify-end">
                        <button className="p-1.5 rounded hover:bg-gray-50 transition-colors">
                          <Eye size={14} className="text-gray-500" />
                        </button>
                        <button className="p-1.5 rounded hover:bg-gray-50 transition-colors">
                          <PencilSimple size={14} className="text-gray-500" />
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

      {/* Sync Info */}
      <div className="bg-white/50 border border-gray-200 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowsClockwise size={18} className="text-gray-500" />
          <div>
            <p className="text-sm text-gray-600">
              {totalProducts} produtos sincronizados
            </p>
            <p className="text-xs text-gray-400">Clique em "Sync Produtos" para atualizar</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${storeId ? 'bg-emerald-400' : 'bg-gray-400'}`} />
          <span className={`text-xs ${storeId ? 'text-emerald-600' : 'text-gray-500'}`}>
            {storeId ? 'Conectado' : 'Desconectado'}
          </span>
        </div>
      </div>
    </div>
  )
}
