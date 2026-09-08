'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, Search, ChevronDown, ChevronUp, Trash2, Loader2 } from 'lucide-react'
import { useStoreStore } from '@/stores'

interface Product {
  id: string
  title: string
  price: number
  compare_at_price?: number
  image_url?: string
  url?: string
  handle?: string
  description?: string
  shopify_product_id?: string
  updated_at?: string
  status?: string
  category?: string
  collections?: string[]
  buttonText?: string
  /** Escondido dos feeds dinâmicos pelo lojista; ainda pode ser escolhido à mão. */
  hidden_from_feeds?: boolean
}

interface RawProduct {
  id: any
  title: string
  image?: string | null
  product_type?: string
  vendor?: string
  status?: string
  price_min?: number
  price_max?: number
  variants?: { price: number; compare_at_price?: number | null }[]
  store_name?: string
  tags?: string[]
  collections?: string[]
  // From shopify_products table
  image_url?: string
  price?: number
  compare_at_price?: number
  handle?: string
  url?: string
  shopify_product_id?: string
  hidden_from_feeds?: boolean
}

interface BrowseProductsModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (products: Product[]) => void
  maxProducts?: number
}

function normalizeProduct(raw: RawProduct, storeDomain?: string): Product {
  const price = raw.price ?? raw.price_min ?? raw.variants?.[0]?.price ?? 0
  const comparePrice = raw.compare_at_price ?? raw.variants?.[0]?.compare_at_price ?? undefined
  const imageUrl = raw.image_url || raw.image || ''
  const handle = raw.handle || ''
  const productUrl = raw.url || (handle && storeDomain ? `https://${storeDomain}/products/${handle}` : '')

  return {
    id: String(raw.id),
    title: raw.title || '',
    price: typeof price === 'string' ? parseFloat(price) : price,
    compare_at_price: comparePrice ? (typeof comparePrice === 'string' ? parseFloat(comparePrice) : comparePrice) : undefined,
    image_url: imageUrl,
    url: productUrl,
    handle,
    category: raw.product_type || '',
    collections: raw.collections || (raw.product_type ? [raw.product_type] : []),
    status: raw.status,
    shopify_product_id: raw.shopify_product_id || String(raw.id),
    hidden_from_feeds: raw.hidden_from_feeds === true,
  }
}

export function BrowseProductsModal({ isOpen, onClose, onSelect, maxProducts = 9 }: BrowseProductsModalProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [collections, setCollections] = useState<{id: number; title: string; products_count: number}[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'selected'>('all')
  const [storeDomain, setStoreDomain] = useState('')
  // Produtos e domínio da loja SELECIONADA. Sem isto o modal pedia os
  // produtos de todas as lojas da organização e montava os links com o
  // domínio da primeira que viesse.
  const { currentStore } = useStoreStore()
  const storeId = currentStore?.id

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    setSelected(new Set())
    setTab('all')

    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''
    fetch(`/api/products${qs}`)
      .then(r => r.json())
      .then(data => {
        const rawProds: RawProduct[] = Array.isArray(data) ? data : data.products || data.data || []
        // Domínio da loja selecionada (o principal, não o myshopify).
        const stores: any[] = data.stores || []
        const mine = storeId ? stores.find((s) => s.id === storeId) : (stores.length === 1 ? stores[0] : null)
        const domain = mine?.primaryDomain || mine?.domain || ''
        setStoreDomain(domain)
        setCollections(data.collections || [])
        setProducts(rawProds.map(p => normalizeProduct(p, domain)))
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false))
  }, [isOpen, storeId])

  // Use collections from API (fallback to product categories)
  const categories = useMemo(() => {
    if (collections.length > 0) return []
    const cats = new Set<string>()
    products.forEach(p => { if (p.category) cats.add(p.category) })
    return Array.from(cats).sort()
  }, [products, collections])

  if (!isOpen) return null

  const filtered = products.filter(p => {
    if (search) {
      const q = search.toLowerCase()
      if (!p.title?.toLowerCase().includes(q) && !p.shopify_product_id?.includes(search)) return false
    }
    if (category && !(p.collections || []).includes(category) && p.category !== category) return false
    return true
  })

  const toggleProduct = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else if (next.size < maxProducts) next.add(id)
    setSelected(next)
  }

  const handleAdd = () => {
    const selectedProducts = products.filter(p => selected.has(p.id))
    onSelect(selectedProducts)
    onClose()
  }

  const selectedProducts = products.filter(p => selected.has(p.id))
  const displayList = tab === 'all' ? filtered : selectedProducts

  const formatPrice = (v: number) => {
    if (!v) return ''
    return `R$ ${v.toFixed(2).replace('.', ',')}`
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-[620px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Procurar produtos</h2>
            <p className="text-xs text-gray-500 mt-0.5">Escolha até {maxProducts} produtos do seu catálogo.</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Search + Filters */}
        <div className="px-6 py-3 space-y-2 border-b border-gray-100">
          <div className="flex items-center border border-gray-200 rounded-lg px-3 py-2">
            <Search className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome ou ID do produto"
              className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none" />
          </div>
          {collections.length > 0 ? (
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white">
              <option value="">Todas coleções ({products.length})</option>
              {collections.map(c => (
                <option key={c.id} value={c.title}>{c.title} ({c.products_count})</option>
              ))}
            </select>
          ) : categories.length > 0 ? (
            <select value={category} onChange={e => setCategory(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white">
              <option value="">Todas categorias ({products.length})</option>
              {categories.map(c => (
                <option key={c} value={c}>{c} ({products.filter(p => p.category === c).length})</option>
              ))}
            </select>
          ) : null}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6">
          <button onClick={() => setTab('all')}
            className={`py-2.5 px-4 text-xs font-medium border-b-2 -mb-px ${tab === 'all' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}>
            Todos os produtos ({filtered.length})
          </button>
          <button onClick={() => setTab('selected')}
            className={`py-2.5 px-4 text-xs font-medium border-b-2 -mb-px ${tab === 'selected' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}>
            Selecionados ({selected.size})
          </button>
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <span className="text-sm">Carregando produtos...</span>
            </div>
          ) : displayList.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              {tab === 'all' ? 'Nenhum produto encontrado' : 'Nenhum produto selecionado'}
            </div>
          ) : (
            <div>
              {displayList.map(product => (
                <div key={product.id}
                  onClick={() => toggleProduct(product.id)}
                  className={`flex items-center gap-3 px-6 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors ${selected.has(product.id) ? 'bg-brand-50/30' : ''}`}>
                  <input type="checkbox" checked={selected.has(product.id)} readOnly
                    className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 flex-shrink-0 pointer-events-none" />
                  <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    {product.image_url ? (
                      <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-[10px]">SEM FOTO</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {product.title}
                      {product.hidden_from_feeds && (
                        <span className="ml-2 inline-block align-middle px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200" title="Este produto não entra em feeds dinâmicos; aqui você o escolhe à mão.">
                          Oculto dos feeds
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {product.compare_at_price && product.compare_at_price > product.price && (
                        <span className="text-xs text-gray-400 line-through">{formatPrice(product.compare_at_price)}</span>
                      )}
                      <span className="text-xs font-semibold text-gray-700">{formatPrice(product.price)}</span>
                      {product.category && <span className="text-[10px] text-gray-400">· {product.category}</span>}
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${product.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {product.status === 'active' ? 'Ativo' : product.status || 'Ativo'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
          <span className="text-xs text-gray-400">{selected.size} de {maxProducts} selecionados</span>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button onClick={handleAdd} disabled={selected.size === 0}
              className="px-4 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50">
              Adicionar {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Static Products Editor (shown in sidebar after selection) ──
export function StaticProductsEditor({ products, onChange }: {
  products: Product[]; onChange: (products: Product[]) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="space-y-1">
      <p className="text-[12px] font-medium text-gray-700 mb-2">Produtos</p>
      {products.map((product, i) => (
        <div key={product.id} className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer"
            onClick={() => setExpandedId(expandedId === product.id ? null : product.id)}>
            <div className="flex items-center gap-2 min-w-0">
              {expandedId === product.id ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
              {product.image_url && (
                <img src={product.image_url} alt="" className="w-6 h-6 rounded object-cover flex-shrink-0" />
              )}
              <span className="text-xs font-medium text-gray-900 truncate">{product.title}</span>
            </div>
            <button onClick={e => { e.stopPropagation(); onChange(products.filter((_, j) => j !== i)) }}
              className="p-1 text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          {expandedId === product.id && (
            <div className="p-3 space-y-2 text-xs border-t border-gray-100">
              <div>
                <label className="text-gray-500 block mb-0.5">Nome</label>
                <input value={product.title} onChange={e => {
                  const updated = [...products]; updated[i] = { ...updated[i], title: e.target.value }; onChange(updated)
                }} className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 focus:border-brand-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-gray-500 block mb-0.5">Preço</label>
                  <input type="number" value={product.price || 0} step="0.01" onChange={e => {
                    const updated = [...products]; updated[i] = { ...updated[i], price: parseFloat(e.target.value) || 0 }; onChange(updated)
                  }} className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 focus:border-brand-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-gray-500 block mb-0.5">Preço comparativo</label>
                  <input type="number" value={product.compare_at_price || ''} step="0.01" onChange={e => {
                    const updated = [...products]; updated[i] = { ...updated[i], compare_at_price: parseFloat(e.target.value) || undefined }; onChange(updated)
                  }} className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 focus:border-brand-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="text-gray-500 block mb-0.5">URL do produto</label>
                <input value={product.url || ''} onChange={e => {
                  const updated = [...products]; updated[i] = { ...updated[i], url: e.target.value }; onChange(updated)
                }} className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 focus:border-brand-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-gray-500 block mb-0.5">URL da imagem</label>
                <input value={product.image_url || ''} onChange={e => {
                  const updated = [...products]; updated[i] = { ...updated[i], image_url: e.target.value }; onChange(updated)
                }} className="w-full px-2 py-1 border border-gray-200 rounded text-xs text-gray-900 focus:border-brand-500 focus:outline-none" />
              </div>
              {product.image_url && (
                <img src={product.image_url} alt="" className="w-full h-24 object-contain rounded border border-gray-100" />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
