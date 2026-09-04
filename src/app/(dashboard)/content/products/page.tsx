'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  ShoppingBag,
  MagnifyingGlass,
  PencilSimple,
  Eye,
  EyeSlash,
  ArrowLeft,
  Package,
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  Plus,
  ArrowSquareOut,
  WarningCircle,
} from '@phosphor-icons/react'
import { useStoreStore } from '@/stores'
import { NewProductModal, CreatedProductNotice, type NewProductResult } from '@/components/products/NewProductModal'

// Formata preço respeitando a moeda da loja (Dr. Melaxin usa USD;
// outras lojas podem usar BRL/EUR/MXN/etc). Intl.NumberFormat
// escolhe o símbolo + locale corretos automaticamente.
const CURRENCY_LOCALE: Record<string, string> = {
  BRL: 'pt-BR', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB',
  ARS: 'es-AR', MXN: 'es-MX', CLP: 'es-CL', COP: 'es-CO',
}
function formatProductPrice(value: number | null | undefined, currency: string | null | undefined): string {
  const code = (currency || 'BRL').toUpperCase()
  const locale = CURRENCY_LOCALE[code] || 'en-US'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0))
  } catch {
    return `${code} ${(Number(value || 0)).toFixed(2)}`
  }
}

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
  // null means inventory not tracked at the variant level (Shopify
  // returns -1 for those). The UI shows "—" instead of a fake 0.
  totalInventory: number | null
  /** O que a Shopify diz sobre poder comprar. null = ainda não informado. */
  available: boolean | null
  /** Escondido de todos os feeds dinâmicos de e-mail (decisão da Worder). */
  hiddenFromFeeds: boolean
  tags: string
  variants: any[]
  images: { url: string; alt: string | null }[]
  createdAt: string
  updatedAt: string
}

interface CatalogMeta {
  currency: string
  publicDomain: string | null
  adminSlug: string | null
  canCreate: boolean
  missingScopes: string[]
}

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: 'Ativo', color: 'bg-emerald-500/10 text-emerald-600' },
  draft: { label: 'Rascunho', color: 'bg-zinc-500/10 text-gray-600' },
  archived: { label: 'Arquivado', color: 'bg-red-500/10 text-red-600' },
}

type FeedFilter = 'all' | 'visible' | 'hidden'

export default function ProductsPage() {
  const { currentStore } = useStoreStore()
  const [products, setProducts] = useState<Product[]>([])
  const [meta, setMeta] = useState<CatalogMeta>({ currency: 'BRL', publicDomain: null, adminSlug: null, canCreate: true, missingScopes: [] })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('all')
  const [sortBy, setSortBy] = useState<'title' | 'price' | 'totalInventory' | 'updatedAt'>('updatedAt')
  const [storeId, setStoreId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [created, setCreated] = useState<NewProductResult | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

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
      setMeta({
        currency: data.currency || currentStore?.currency || 'BRL',
        publicDomain: data.publicDomain || null,
        adminSlug: data.adminSlug || null,
        canCreate: data.canCreate !== false,
        missingScopes: Array.isArray(data.missingScopes) ? data.missingScopes : [],
      })
    } catch (err: any) {
      console.error('Error fetching products:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentStore?.id, currentStore?.currency])

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
      await fetchProducts()
    } catch (err: any) {
      console.error('Sync error:', err)
      setError(err.message || 'Erro desconhecido no sync')
    } finally {
      setSyncing(false)
    }
  }

  // Ocultar/mostrar nos feeds: otimista, com volta atrás se a API falhar.
  const toggleFeedVisibility = async (product: Product) => {
    if (!storeId || togglingId) return
    const next = !product.hiddenFromFeeds
    setTogglingId(product.id)
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, hiddenFromFeeds: next } : p)))
    try {
      const res = await fetch('/api/products/shopify', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, productId: product.id, hiddenFromFeeds: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Falha ao atualizar (${res.status})`)
      }
    } catch (err: any) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, hiddenFromFeeds: !next } : p)))
      setError(err.message || 'Não foi possível alterar a visibilidade nos feeds')
    } finally {
      setTogglingId(null)
    }
  }

  const handleCreated = async (result: NewProductResult) => {
    setShowNew(false)
    setCreated(result)
    if (result.product) {
      setProducts((prev) => [result.product as Product, ...prev.filter((p) => p.id !== result.product.id)])
    }
    // Relê para pegar o que a Shopify completou (handle, imagens processadas).
    await fetchProducts()
  }

  // Compute KPIs from real data
  const totalProducts = products.length
  const activeProducts = products.filter((p) => p.status === 'active').length
  // "Sem estoque" só conta produtos que realmente rastreiam inventory ou
  // que a Shopify declarou indisponíveis.
  const outOfStock = products.filter((p) => p.available === false || (typeof p.totalInventory === 'number' && p.totalInventory <= 0)).length
  const hiddenCount = products.filter((p) => p.hiddenFromFeeds).length

  const kpis = [
    { title: 'Total de Produtos', value: totalProducts.toString(), icon: ShoppingBag, color: 'text-[#F26B2A]' },
    { title: 'Ativos', value: activeProducts.toString(), icon: CheckCircle, color: 'text-emerald-600' },
    { title: 'Sem Estoque', value: outOfStock.toString(), icon: XCircle, color: 'text-red-600' },
    { title: 'Ocultos dos feeds', value: hiddenCount.toString(), icon: EyeSlash, color: 'text-amber-600' },
  ]

  const filtered = products
    .filter((p) => {
      const matchSearch =
        !search ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(search.toLowerCase())) ||
        (p.vendor && p.vendor.toLowerCase().includes(search.toLowerCase()))
      const matchStatus = statusFilter === 'all' || p.status === statusFilter
      const matchFeed = feedFilter === 'all' || (feedFilter === 'hidden' ? p.hiddenFromFeeds : !p.hiddenFromFeeds)
      return matchSearch && matchStatus && matchFeed
    })
    .sort((a, b) => {
      if (sortBy === 'price') return b.price - a.price
      if (sortBy === 'totalInventory') return (b.totalInventory ?? -1) - (a.totalInventory ?? -1)
      if (sortBy === 'updatedAt') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      return a.title.localeCompare(b.title)
    })

  const storefrontUrl = (p: Product) => (meta.publicDomain && p.handle ? `https://${meta.publicDomain}/products/${p.handle}` : null)
  const adminUrl = (p: Product) => (meta.adminSlug && p.shopifyProductId ? `https://admin.shopify.com/store/${meta.adminSlug}/products/${p.shopifyProductId}` : null)

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
            <p className="text-sm text-gray-500 mt-0.5">Catálogo sincronizado da sua loja — preço e estoque acompanham a Shopify</p>
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
          <button
            onClick={() => setShowNew(true)}
            disabled={!storeId}
            className="flex items-center gap-2 px-3 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 text-xs font-semibold disabled:opacity-50"
          >
            <Plus size={14} weight="bold" />
            Novo produto
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {created && <CreatedProductNotice result={created} onDismiss={() => setCreated(null)} />}

      {!meta.canCreate && meta.missingScopes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm flex gap-2">
          <WarningCircle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Para criar produtos daqui, o app da Shopify precisa da permissão {meta.missingScopes.join(', ')}.</p>
            <p className="text-xs mt-1">Na Shopify: Apps → Desenvolver apps → seu app → Configuração → Escopos da Admin API. Adicione e reinstale o app; a Worder renova o token sozinha. Ocultar dos feeds e a sincronização funcionam normalmente.</p>
          </div>
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
        <div className="flex gap-1">
          {([
            { v: 'all', label: 'Feeds: todos' },
            { v: 'visible', label: 'Nos feeds' },
            { v: 'hidden', label: 'Ocultos' },
          ] as { v: FeedFilter; label: string }[]).map((f) => (
            <button
              key={f.v}
              onClick={() => setFeedFilter(f.v)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap ${
                feedFilter === f.v ? 'bg-amber-500 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-900 focus:outline-none"
        >
          <option value="updatedAt">Mais recentes</option>
          <option value="price">Maior preço</option>
          <option value="totalInventory">Mais estoque</option>
          <option value="title">Nome A-Z</option>
        </select>
      </div>

      {/* Products Table */}
      {filtered.length === 0 ? (
        <div className="bg-white/50 border border-gray-200 rounded-xl p-12 text-center">
          <Package size={32} className="text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {products.length === 0 ? 'Nenhum produto sincronizado ainda. Clique em "Sync Produtos" para importar ou em "Novo produto" para criar.' : 'Nenhum produto encontrado com os filtros atuais.'}
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
                <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Preço</th>
                <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Estoque</th>
                <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Tipo</th>
                <th className="text-right text-xs text-gray-500 font-medium p-4 pb-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const status = statusConfig[product.status] || { label: product.status, color: 'bg-zinc-500/10 text-gray-600' }
                const imageUrl = product.images?.[0]?.url
                const shopUrl = storefrontUrl(product)
                const editUrl = adminUrl(product)
                return (
                  <tr key={product.id} className={`border-b border-gray-200/50 hover:bg-gray-50/30 transition-colors ${product.hiddenFromFeeds ? 'opacity-75' : ''}`}>
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
                          <div className="flex items-center gap-2">
                            {product.vendor && <p className="text-xs text-gray-500">{product.vendor}</p>}
                            {product.hiddenFromFeeds && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                Oculto dos feeds
                              </span>
                            )}
                          </div>
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
                        {formatProductPrice(product.price, meta.currency)}
                      </p>
                      {product.compareAtPrice && (
                        <p className="text-xs text-gray-400 line-through">
                          {formatProductPrice(product.compareAtPrice, meta.currency)}
                        </p>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {product.available === false ? (
                        <span className="text-sm text-red-600" title="A Shopify informa que não dá para comprar agora">
                          {typeof product.totalInventory === 'number' ? product.totalInventory : 'Indisponível'}
                        </span>
                      ) : product.totalInventory === null ? (
                        <span className="text-sm text-gray-400" title="Sem controle de estoque na Shopify">—</span>
                      ) : (
                        <span
                          className={`text-sm ${
                            product.totalInventory <= 0
                              ? 'text-red-600'
                              : product.totalInventory < 20
                              ? 'text-yellow-600'
                              : 'text-gray-600'
                          }`}
                        >
                          {product.totalInventory}
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-gray-600 text-right">
                      {product.productType || product.vendor || '—'}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => toggleFeedVisibility(product)}
                          disabled={togglingId === product.id}
                          className={`p-1.5 rounded transition-colors ${product.hiddenFromFeeds ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'} disabled:opacity-50`}
                          title={product.hiddenFromFeeds ? 'Mostrar nos feeds de produto' : 'Ocultar de todos os feeds de produto'}
                          aria-label={product.hiddenFromFeeds ? 'Mostrar nos feeds' : 'Ocultar dos feeds'}
                        >
                          {product.hiddenFromFeeds
                            ? <EyeSlash size={14} className="text-amber-600" />
                            : <Eye size={14} className="text-gray-500" />}
                        </button>
                        {shopUrl && (
                          <a
                            href={shopUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-gray-50 transition-colors"
                            title="Ver na loja"
                            aria-label="Ver na loja"
                          >
                            <ArrowSquareOut size={14} className="text-gray-500" />
                          </a>
                        )}
                        {editUrl && (
                          <a
                            href={editUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-gray-50 transition-colors"
                            title="Editar na Shopify (preço, estoque, fotos)"
                            aria-label="Editar na Shopify"
                          >
                            <PencilSimple size={14} className="text-gray-500" />
                          </a>
                        )}
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
            <p className="text-xs text-gray-400">Preço, estoque e disponibilidade chegam pela Shopify em tempo real (webhooks). "Sync Produtos" força uma leitura completa.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${storeId ? 'bg-emerald-400' : 'bg-gray-400'}`} />
          <span className={`text-xs ${storeId ? 'text-emerald-600' : 'text-gray-500'}`}>
            {storeId ? 'Conectado' : 'Desconectado'}
          </span>
        </div>
      </div>

      {showNew && storeId && (
        <NewProductModal
          storeId={storeId}
          currency={meta.currency}
          onClose={() => setShowNew(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
