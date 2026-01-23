'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Package,
  Search,
  RefreshCw,
  DollarSign,
  Edit2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Loader2,
  Save,
  Filter,
  Image as ImageIcon,
} from 'lucide-react'
import { useStoreStore } from '@/stores'

interface Variant {
  id: string
  title: string
  price: number
  compare_at_price: number | null
  sku: string
  inventory_quantity: number
  cost: number | null
  cost_currency: string
  cost_id: string | null
}

interface Product {
  id: string
  title: string
  vendor: string
  product_type: string
  status: string
  tags: string[]
  image: string | null
  price_min: number
  price_max: number
  variants: Variant[]
  variants_count: number
  has_cost: boolean
  cost: number | null
  cost_currency: string
  cost_id: string | null
  store_id: string
  store_name: string
}

const CURRENCIES = [
  { code: 'BRL', symbol: 'R$', name: 'Real Brasileiro' },
  { code: 'USD', symbol: '$', name: 'Dólar Americano' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'Libra Esterlina' },
  { code: 'CNY', symbol: '¥', name: 'Yuan Chinês' },
]

const formatCurrency = (value: number, currency = 'BRL') => {
  const curr = CURRENCIES.find(c => c.code === currency) || CURRENCIES[0]
  return `${curr.symbol} ${value.toFixed(2)}`
}

const CostEditor = ({
  product,
  variant,
  onSave,
  onCancel,
}: {
  product: Product
  variant?: Variant
  onSave: (cost: number, currency: string) => void
  onCancel: () => void
}) => {
  const [cost, setCost] = useState(variant?.cost?.toString() || product.cost?.toString() || '')
  const [currency, setCurrency] = useState(variant?.cost_currency || product.cost_currency || 'BRL')
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (!cost || parseFloat(cost) < 0) return
    setIsSaving(true)
    await onSave(parseFloat(cost), currency)
    setIsSaving(false)
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        className="w-20 px-2 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
      >
        {CURRENCIES.map(c => (
          <option key={c.code} value={c.code}>{c.code}</option>
        ))}
      </select>
      <input
        type="number"
        step="0.01"
        min="0"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        placeholder="0.00"
        className="w-24 px-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary-500"
        autoFocus
      />
      <button
        onClick={handleSave}
        disabled={isSaving || !cost}
        className="p-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg disabled:opacity-50"
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
      </button>
      <button
        onClick={onCancel}
        className="p-1.5 bg-dark-700 hover:bg-dark-600 text-dark-400 rounded-lg"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

const ProductRow = ({
  product,
  onSaveCost,
}: {
  product: Product
  onSaveCost: (productId: string, variantId: string | null, cost: number, currency: string) => Promise<void>
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [editingProduct, setEditingProduct] = useState(false)
  const [editingVariant, setEditingVariant] = useState<string | null>(null)

  const handleSaveProductCost = async (cost: number, currency: string) => {
    await onSaveCost(product.id, null, cost, currency)
    setEditingProduct(false)
  }

  const handleSaveVariantCost = async (variantId: string, cost: number, currency: string) => {
    await onSaveCost(product.id, variantId, cost, currency)
    setEditingVariant(null)
  }

  const hasMultipleVariants = product.variants_count > 1

  return (
    <>
      <tr className="border-b border-dark-700/30 hover:bg-dark-700/20 transition-colors">
        <td className="px-4 py-3">
          {hasMultipleVariants && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-dark-700 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-dark-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-dark-400" />
              )}
            </button>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            {product.image ? (
              <img
                src={product.image}
                alt={product.title}
                className="w-10 h-10 rounded-lg object-cover bg-dark-700"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-dark-700 flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-dark-500" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium text-white truncate max-w-[200px]">{product.title}</p>
              <p className="text-xs text-dark-400">
                {product.variants_count} variante{product.variants_count > 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-dark-300">
          {product.price_min === product.price_max
            ? formatCurrency(product.price_min)
            : `${formatCurrency(product.price_min)} - ${formatCurrency(product.price_max)}`
          }
        </td>
        <td className="px-4 py-3">
          {editingProduct ? (
            <CostEditor
              product={product}
              onSave={handleSaveProductCost}
              onCancel={() => setEditingProduct(false)}
            />
          ) : (
            <div className="flex items-center gap-2">
              {product.cost !== null ? (
                <span className="text-white">{formatCurrency(product.cost, product.cost_currency)}</span>
              ) : (
                <span className="text-dark-500 italic">Não definido</span>
              )}
              <button
                onClick={() => setEditingProduct(true)}
                className="p-1.5 hover:bg-dark-700 rounded-lg text-dark-400 hover:text-white transition-colors"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </td>
        <td className="px-4 py-3">
          {product.has_cost ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
              <CheckCircle className="w-3 h-3" />
              Cadastrado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
              <AlertCircle className="w-3 h-3" />
              Pendente
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-dark-400 text-sm">
          {product.store_name}
        </td>
      </tr>

      {/* Variants */}
      <AnimatePresence>
        {isExpanded && hasMultipleVariants && (
          <motion.tr
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <td colSpan={6} className="px-0 py-0">
              <div className="bg-dark-800/50 border-y border-dark-700/30">
                <table className="w-full">
                  <tbody>
                    {product.variants.map((variant) => (
                      <tr key={variant.id} className="border-b border-dark-700/20 last:border-0">
                        <td className="w-10"></td>
                        <td className="px-4 py-2">
                          <div className="pl-8">
                            <p className="text-sm text-white">{variant.title}</p>
                            {variant.sku && <p className="text-xs text-dark-500">SKU: {variant.sku}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-sm text-dark-300">
                          {formatCurrency(variant.price)}
                        </td>
                        <td className="px-4 py-2">
                          {editingVariant === variant.id ? (
                            <CostEditor
                              product={product}
                              variant={variant}
                              onSave={(cost, currency) => handleSaveVariantCost(variant.id, cost, currency)}
                              onCancel={() => setEditingVariant(null)}
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              {variant.cost !== null ? (
                                <span className="text-sm text-white">
                                  {formatCurrency(variant.cost, variant.cost_currency)}
                                </span>
                              ) : (
                                <span className="text-sm text-dark-500 italic">-</span>
                              )}
                              <button
                                onClick={() => setEditingVariant(variant.id)}
                                className="p-1 hover:bg-dark-700 rounded text-dark-400 hover:text-white transition-colors"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2"></td>
                        <td className="px-4 py-2"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  )
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'with' | 'without'>('all')
  const [stats, setStats] = useState({ withCost: 0, withoutCost: 0, percentage: 0 })

  const { currentStore } = useStoreStore()

  const fetchProducts = useCallback(async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()

      if (currentStore?.id) {
        params.append('storeId', currentStore.id)
      }
      if (search) {
        params.append('search', search)
      }

      const response = await fetch(`/api/products?${params.toString()}`)
      const data = await response.json()

      if (response.ok) {
        setProducts(data.products || [])
        setStats(data.stats || { withCost: 0, withoutCost: 0, percentage: 0 })
      }
    } catch (error) {
      console.error('Error fetching products:', error)
    } finally {
      setIsLoading(false)
    }
  }, [currentStore, search])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const saveCost = async (productId: string, variantId: string | null, cost: number, currency: string) => {
    const product = products.find(p => p.id === productId)
    if (!product) return

    const variant = variantId ? product.variants.find(v => v.id === variantId) : null

    try {
      const response = await fetch('/api/products/costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: product.store_id,
          shopify_product_id: productId,
          shopify_variant_id: variantId,
          product_title: product.title,
          variant_title: variant?.title,
          sku: variant?.sku,
          cost_amount: cost,
          cost_currency: currency,
        }),
      })

      if (response.ok) {
        // Atualizar localmente
        setProducts(prev => prev.map(p => {
          if (p.id !== productId) return p

          if (variantId) {
            return {
              ...p,
              has_cost: true,
              variants: p.variants.map(v =>
                v.id === variantId
                  ? { ...v, cost, cost_currency: currency }
                  : v
              ),
            }
          } else {
            return {
              ...p,
              cost,
              cost_currency: currency,
              has_cost: true,
            }
          }
        }))

        // Atualizar stats
        setStats(prev => ({
          ...prev,
          withCost: prev.withCost + 1,
          withoutCost: Math.max(0, prev.withoutCost - 1),
          percentage: Math.round(((prev.withCost + 1) / products.length) * 100),
        }))
      }
    } catch (error) {
      console.error('Error saving cost:', error)
    }
  }

  const filteredProducts = products.filter(p => {
    if (filter === 'with') return p.has_cost
    if (filter === 'without') return !p.has_cost
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Produtos</h1>
          <p className="text-dark-400 mt-1">Gerencie os custos dos seus produtos</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchProducts}
            className="flex items-center gap-2 px-4 py-2.5 bg-dark-800/50 hover:bg-dark-700/50 border border-dark-700/50 rounded-xl text-dark-300 hover:text-white transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-dark-800/40 rounded-xl border border-dark-700/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary-500/20">
              <Package className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Total de Produtos</p>
              <p className="text-xl font-bold text-white">{products.length}</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-dark-800/40 rounded-xl border border-dark-700/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Com Custo Cadastrado</p>
              <p className="text-xl font-bold text-white">{stats.withCost}</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-dark-800/40 rounded-xl border border-dark-700/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-dark-400">Sem Custo</p>
              <p className="text-xl font-bold text-white">{stats.withoutCost}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="p-4 bg-dark-800/40 rounded-xl border border-dark-700/30">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-dark-400">Progresso de Cadastro de Custos</p>
          <p className="text-sm font-medium text-white">{stats.percentage}%</p>
        </div>
        <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all duration-500"
            style={{ width: `${stats.percentage}%` }}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-dark-800/50 border border-dark-700/50 rounded-xl text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
          />
        </div>

        <div className="flex items-center bg-dark-800/50 border border-dark-700/50 rounded-xl p-1">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === 'all' ? 'bg-dark-700 text-white' : 'text-dark-400 hover:text-white'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setFilter('with')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === 'with' ? 'bg-dark-700 text-white' : 'text-dark-400 hover:text-white'
            }`}
          >
            Com Custo
          </button>
          <button
            onClick={() => setFilter('without')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === 'without' ? 'bg-dark-700 text-white' : 'text-dark-400 hover:text-white'
            }`}
          >
            Sem Custo
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-dark-800/40 rounded-2xl border border-dark-700/30 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-dark-400" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Package className="w-12 h-12 text-dark-500 mb-4" />
            <p className="text-dark-400">Nenhum produto encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-dark-400 border-b border-dark-700/50">
                  <th className="px-4 py-4 w-10"></th>
                  <th className="px-4 py-4 font-medium">Produto</th>
                  <th className="px-4 py-4 font-medium">Preço de Venda</th>
                  <th className="px-4 py-4 font-medium">Custo</th>
                  <th className="px-4 py-4 font-medium">Status</th>
                  <th className="px-4 py-4 font-medium">Loja</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    onSaveCost={saveCost}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
