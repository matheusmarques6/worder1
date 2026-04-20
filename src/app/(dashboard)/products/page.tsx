'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
  Settings,
  Percent,
  Upload,
  CheckSquare,
  Square,
  Trash2,
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

interface TaxSettings {
  default_cost_percentage: number
  default_cost_currency: string
  payment_gateway_fee: number
  payment_fixed_fee: number
}

const CURRENCIES = [
  { code: 'BRL', symbol: 'R$', name: 'Real' },
  { code: 'USD', symbol: '$', name: 'Dólar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'CNY', symbol: '¥', name: 'Yuan' },
]

const formatCurrency = (value: number, currency = 'BRL') => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// Default Cost Config Modal
const DefaultCostModal = ({
  isOpen,
  onClose,
  settings,
  onSave,
}: {
  isOpen: boolean
  onClose: () => void
  settings: TaxSettings
  onSave: (percentage: number) => Promise<void>
}) => {
  const [percentage, setPercentage] = useState(settings.default_cost_percentage.toString())
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setPercentage(settings.default_cost_percentage.toString())
  }, [settings.default_cost_percentage])

  const handleSave = async () => {
    const value = parseFloat(percentage)
    if (isNaN(value) || value < 0 || value > 100) return
    setIsSaving(true)
    await onSave(value)
    setIsSaving(false)
    onClose()
  }

  if (!isOpen) return null

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
        className="relative bg-white rounded-2xl border border-gray-200 p-6 w-full max-w-md"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-brand-100">
            <Percent className="w-6 h-6 text-brand-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Custo Padrão</h2>
            <p className="text-sm text-gray-500">Configuração para produtos sem custo cadastrado</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-2">
              Porcentagem do preço de venda
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                className="w-full px-4 py-3 pr-12 bg-white border border-gray-200 rounded-xl text-gray-900 text-lg font-medium focus:outline-none focus:border-primary-500"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">%</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Exemplo: Para um produto de R$ 100,00 com {percentage || 0}% de custo, o custo será {formatCurrency(100 * (parseFloat(percentage) || 0) / 100)}
            </p>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-gray-900 font-medium">Importante</p>
                <p className="text-gray-500 mt-1">
                  Este valor será usado para calcular automaticamente o custo de produtos que ainda não têm custo cadastrado manualmente.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving || !percentage}
            className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            Salvar Configuração
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Bulk Edit Modal
const BulkEditModal = ({
  isOpen,
  onClose,
  selectedProducts,
  onSave,
}: {
  isOpen: boolean
  onClose: () => void
  selectedProducts: Product[]
  onSave: (cost: number, currency: string, applyToVariants: boolean) => Promise<void>
}) => {
  const [cost, setCost] = useState('')
  const [currency, setCurrency] = useState('BRL')
  const [applyToVariants, setApplyToVariants] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    const value = parseFloat(cost)
    if (isNaN(value) || value < 0) return
    setIsSaving(true)
    await onSave(value, currency, applyToVariants)
    setIsSaving(false)
    onClose()
  }

  if (!isOpen) return null

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
        className="relative bg-white rounded-2xl border border-gray-200 p-6 w-full max-w-md"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-xl bg-blue-500/20">
            <Upload className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Edição em Massa</h2>
            <p className="text-sm text-gray-500">{selectedProducts.length} produto(s) selecionado(s)</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-500 mb-2">Custo Unitário</label>
            <div className="flex gap-2">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-24 px-3 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-primary-500"
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
                className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-primary-500"
                autoFocus
              />
            </div>
          </div>

          <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={applyToVariants}
              onChange={(e) => setApplyToVariants(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
            />
            <div>
              <p className="text-gray-900 font-medium">Aplicar a todas as variantes</p>
              <p className="text-xs text-gray-500">O custo será aplicado a cada variante individualmente</p>
            </div>
          </label>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-white hover:bg-gray-100 text-gray-900 rounded-xl font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !cost}
              className="flex-1 py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              Aplicar
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// Inline Cost Editor
const CostEditor = ({
  initialCost,
  initialCurrency,
  onSave,
  onCancel,
}: {
  initialCost: number | null
  initialCurrency: string
  onSave: (cost: number, currency: string) => Promise<void>
  onCancel: () => void
}) => {
  const [cost, setCost] = useState(initialCost?.toString() || '')
  const [currency, setCurrency] = useState(initialCurrency || 'BRL')
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (!cost || parseFloat(cost) < 0) return
    setIsSaving(true)
    await onSave(parseFloat(cost), currency)
    setIsSaving(false)
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        className="w-16 px-1.5 py-1 bg-gray-100 border border-gray-300 rounded text-gray-900 text-xs focus:outline-none focus:border-primary-500"
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
        className="w-20 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm focus:outline-none focus:border-primary-500"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <button
        onClick={handleSave}
        disabled={isSaving || !cost}
        className="p-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded disabled:opacity-50"
      >
        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </button>
      <button
        onClick={onCancel}
        className="p-1 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// Product Row Component
const ProductRow = ({
  product,
  isSelected,
  onSelect,
  onSaveCost,
  defaultCostPercentage,
}: {
  product: Product
  isSelected: boolean
  onSelect: (selected: boolean) => void
  onSaveCost: (productId: string, variantId: string | null, cost: number, currency: string) => Promise<void>
  defaultCostPercentage: number
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [editingProduct, setEditingProduct] = useState(false)
  const [editingVariant, setEditingVariant] = useState<string | null>(null)

  const hasMultipleVariants = product.variants_count > 1
  const estimatedCost = product.price_min * (defaultCostPercentage / 100)

  return (
    <>
      <tr className={`border-b border-gray-200/30 hover:bg-gray-100/20 transition-colors ${isSelected ? 'bg-primary-500/5' : ''}`}>
        {/* Checkbox */}
        <td className="px-3 py-3">
          <button
            onClick={() => onSelect(!isSelected)}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            {isSelected ? (
              <CheckSquare className="w-5 h-5 text-brand-600" />
            ) : (
              <Square className="w-5 h-5 text-gray-400" />
            )}
          </button>
        </td>

        {/* Expand */}
        <td className="px-2 py-3">
          {hasMultipleVariants && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </button>
          )}
        </td>

        {/* Product */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-3">
            {product.image ? (
              <img
                src={product.image}
                alt={product.title}
                className="w-10 h-10 rounded-lg object-cover bg-gray-100 flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <ImageIcon className="w-5 h-5 text-gray-400" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium text-gray-900 truncate max-w-[250px]">{product.title}</p>
              <p className="text-xs text-gray-500">
                {product.variants_count} variante{product.variants_count > 1 ? 's' : ''} • {product.vendor || 'Sem marca'}
              </p>
            </div>
          </div>
        </td>

        {/* Price */}
        <td className="px-3 py-3 text-gray-600 text-sm">
          {product.price_min === product.price_max
            ? formatCurrency(product.price_min)
            : `${formatCurrency(product.price_min)} - ${formatCurrency(product.price_max)}`
          }
        </td>

        {/* Cost */}
        <td className="px-3 py-3">
          {editingProduct ? (
            <CostEditor
              initialCost={product.cost}
              initialCurrency={product.cost_currency}
              onSave={async (cost, currency) => {
                await onSaveCost(product.id, null, cost, currency)
                setEditingProduct(false)
              }}
              onCancel={() => setEditingProduct(false)}
            />
          ) : (
            <div className="flex items-center gap-2">
              {product.cost !== null ? (
                <span className="text-gray-900 text-sm font-medium">
                  {formatCurrency(product.cost, product.cost_currency)}
                </span>
              ) : (
                <span className="text-gray-400 text-sm italic" title={`Estimado: ${formatCurrency(estimatedCost)}`}>
                  ~{formatCurrency(estimatedCost)}
                </span>
              )}
              <button
                onClick={() => setEditingProduct(true)}
                className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-white transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </td>

        {/* Margin */}
        <td className="px-3 py-3">
          {(() => {
            const cost = product.cost ?? estimatedCost
            const margin = ((product.price_min - cost) / product.price_min) * 100
            const isEstimated = product.cost === null
            return (
              <span className={`text-sm font-medium ${margin >= 30 ? 'text-green-400' : margin >= 15 ? 'text-yellow-400' : 'text-red-400'} ${isEstimated ? 'opacity-50' : ''}`}>
                {margin.toFixed(1)}%
              </span>
            )
          })()}
        </td>

        {/* Status */}
        <td className="px-3 py-3">
          {product.has_cost ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
              <CheckCircle className="w-3 h-3" />
              OK
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400">
              <AlertCircle className="w-3 h-3" />
              Pendente
            </span>
          )}
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
            <td colSpan={7} className="px-0 py-0">
              <div className="bg-gray-50 border-y border-gray-200/30">
                <table className="w-full">
                  <tbody>
                    {product.variants.map((variant) => {
                      const variantEstimatedCost = variant.price * (defaultCostPercentage / 100)
                      return (
                        <tr key={variant.id} className="border-b border-gray-200/20 last:border-0">
                          <td className="w-10"></td>
                          <td className="w-8"></td>
                          <td className="px-3 py-2">
                            <div className="pl-6">
                              <p className="text-sm text-gray-700">{variant.title}</p>
                              {variant.sku && <p className="text-xs text-gray-400">SKU: {variant.sku}</p>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-sm text-gray-600">
                            {formatCurrency(variant.price)}
                          </td>
                          <td className="px-3 py-2">
                            {editingVariant === variant.id ? (
                              <CostEditor
                                initialCost={variant.cost}
                                initialCurrency={variant.cost_currency}
                                onSave={async (cost, currency) => {
                                  await onSaveCost(product.id, variant.id, cost, currency)
                                  setEditingVariant(null)
                                }}
                                onCancel={() => setEditingVariant(null)}
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                {variant.cost !== null ? (
                                  <span className="text-sm text-gray-700">
                                    {formatCurrency(variant.cost, variant.cost_currency)}
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-400 italic">
                                    ~{formatCurrency(variantEstimatedCost)}
                                  </span>
                                )}
                                <button
                                  onClick={() => setEditingVariant(variant.id)}
                                  className="p-0.5 hover:bg-gray-100 rounded text-gray-500 hover:text-white transition-colors"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {(() => {
                              const cost = variant.cost ?? variantEstimatedCost
                              const margin = ((variant.price - cost) / variant.price) * 100
                              const isEstimated = variant.cost === null
                              return (
                                <span className={`text-xs font-medium ${margin >= 30 ? 'text-green-400' : margin >= 15 ? 'text-yellow-400' : 'text-red-400'} ${isEstimated ? 'opacity-50' : ''}`}>
                                  {margin.toFixed(1)}%
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-3 py-2"></td>
                        </tr>
                      )
                    })}
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [showDefaultCostModal, setShowDefaultCostModal] = useState(false)
  const [taxSettings, setTaxSettings] = useState<TaxSettings>({
    default_cost_percentage: 35,
    default_cost_currency: 'BRL',
    payment_gateway_fee: 0,
    payment_fixed_fee: 0,
  })

  const { currentStore } = useStoreStore()

  // Fetch products
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

  // Fetch tax settings
  const fetchTaxSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/taxes')
      const data = await response.json()
      if (response.ok && data.settings) {
        setTaxSettings(data.settings)
      }
    } catch (error) {
      console.error('Error fetching tax settings:', error)
    }
  }, [])

  useEffect(() => {
    fetchProducts()
    fetchTaxSettings()
  }, [fetchProducts, fetchTaxSettings])

  // Save default cost percentage
  const saveDefaultCostPercentage = async (percentage: number) => {
    try {
      await fetch('/api/settings/taxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_cost_percentage: percentage }),
      })
      setTaxSettings(prev => ({ ...prev, default_cost_percentage: percentage }))
    } catch (error) {
      console.error('Error saving default cost:', error)
    }
  }

  // Save individual cost
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
        // Update local state
        setProducts(prev => prev.map(p => {
          if (p.id !== productId) return p

          if (variantId) {
            return {
              ...p,
              has_cost: true,
              variants: p.variants.map(v =>
                v.id === variantId ? { ...v, cost, cost_currency: currency } : v
              ),
            }
          } else {
            return { ...p, cost, cost_currency: currency, has_cost: true }
          }
        }))

        // Update stats
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

  // Bulk save costs
  const bulkSaveCosts = async (cost: number, currency: string, applyToVariants: boolean) => {
    const selectedProducts = products.filter(p => selectedIds.has(p.id))

    for (const product of selectedProducts) {
      if (applyToVariants && product.variants.length > 0) {
        for (const variant of product.variants) {
          await saveCost(product.id, variant.id, cost, currency)
        }
      } else {
        await saveCost(product.id, null, cost, currency)
      }
    }

    setSelectedIds(new Set())
  }

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (filter === 'with') return p.has_cost
      if (filter === 'without') return !p.has_cost
      return true
    })
  }, [products, filter])

  // Select all
  const handleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)))
    }
  }

  const selectedProducts = products.filter(p => selectedIds.has(p.id))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custos de Produtos</h1>
          <p className="text-gray-500 mt-1">Gerencie os custos para calcular sua margem de lucro</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDefaultCostModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-600 hover:text-white transition-all"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Custo Padrão:</span>
            <span className="font-medium text-gray-900">{taxSettings.default_cost_percentage}%</span>
          </button>
          <button
            onClick={fetchProducts}
            className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl text-gray-600 hover:text-white transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-brand-100">
              <Package className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-xl font-bold text-gray-900">{products.length}</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Cadastrados</p>
              <p className="text-xl font-bold text-gray-900">{stats.withCost}</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <AlertCircle className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Pendentes</p>
              <p className="text-xl font-bold text-gray-900">{stats.withoutCost}</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Percent className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Progresso</p>
              <p className="text-xl font-bold text-gray-900">{stats.percentage}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200/30">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-gray-500">Produtos com custo cadastrado</p>
          <p className="text-sm font-medium text-gray-900">{stats.withCost} de {products.length}</p>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all duration-500"
            style={{ width: `${stats.percentage}%` }}
          />
        </div>
      </div>

      {/* Filters & Bulk Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-dark-500 focus:outline-none focus:border-primary-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl p-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === 'all' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-white'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilter('with')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === 'with' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-white'
              }`}
            >
              Com Custo
            </button>
            <button
              onClick={() => setFilter('without')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filter === 'without' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-white'
              }`}
            >
              Sem Custo
            </button>
          </div>

          {selectedIds.size > 0 && (
            <button
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
            >
              <Edit2 className="w-4 h-4" />
              Editar {selectedIds.size}
            </button>
          )}
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-gray-50 rounded-2xl border border-gray-200/30 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Package className="w-12 h-12 text-gray-400 mb-4" />
            <p className="text-gray-500">Nenhum produto encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200 bg-gray-50">
                  <th className="px-3 py-3 font-medium w-10">
                    <button
                      onClick={handleSelectAll}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      {selectedIds.size === filteredProducts.length ? (
                        <CheckSquare className="w-5 h-5 text-brand-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-2 py-3 font-medium w-8"></th>
                  <th className="px-3 py-3 font-medium">PRODUTO</th>
                  <th className="px-3 py-3 font-medium">PREÇO</th>
                  <th className="px-3 py-3 font-medium">CUSTO</th>
                  <th className="px-3 py-3 font-medium">MARGEM</th>
                  <th className="px-3 py-3 font-medium">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    isSelected={selectedIds.has(product.id)}
                    onSelect={(selected) => {
                      const newSet = new Set(selectedIds)
                      if (selected) {
                        newSet.add(product.id)
                      } else {
                        newSet.delete(product.id)
                      }
                      setSelectedIds(newSet)
                    }}
                    onSaveCost={saveCost}
                    defaultCostPercentage={taxSettings.default_cost_percentage}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showDefaultCostModal && (
          <DefaultCostModal
            isOpen={showDefaultCostModal}
            onClose={() => setShowDefaultCostModal(false)}
            settings={taxSettings}
            onSave={saveDefaultCostPercentage}
          />
        )}
        {showBulkModal && (
          <BulkEditModal
            isOpen={showBulkModal}
            onClose={() => setShowBulkModal(false)}
            selectedProducts={selectedProducts}
            onSave={bulkSaveCosts}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
