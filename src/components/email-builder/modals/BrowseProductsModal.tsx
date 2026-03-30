'use client'

import { useState, useEffect } from 'react'
import { X, Search, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'

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
  buttonText?: string
}

interface BrowseProductsModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (products: Product[]) => void
  maxProducts?: number
}

export function BrowseProductsModal({ isOpen, onClose, onSelect, maxProducts = 9 }: BrowseProductsModalProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'selected'>('all')

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    fetch('/api/products')
      .then(r => r.json())
      .then(data => {
        const prods = Array.isArray(data) ? data : data.products || data.data || []
        setProducts(prods)
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false))
  }, [isOpen])

  if (!isOpen) return null

  const filtered = products.filter(p => {
    if (search && !p.title?.toLowerCase().includes(search.toLowerCase()) && !p.shopify_product_id?.includes(search)) return false
    if (category && p.category !== category) return false
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

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col">
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
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white">
            <option value="">Todas categorias</option>
          </select>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6">
          <button onClick={() => setTab('all')}
            className={`py-2.5 px-4 text-xs font-medium border-b-2 -mb-px ${tab === 'all' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}>
            Todos os produtos
          </button>
          <button onClick={() => setTab('selected')}
            className={`py-2.5 px-4 text-xs font-medium border-b-2 -mb-px ${tab === 'selected' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}>
            Selecionados ({selected.size})
          </button>
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">Carregando produtos...</div>
          ) : (tab === 'all' ? filtered : selectedProducts).length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              {tab === 'all' ? 'Nenhum produto encontrado' : 'Nenhum produto selecionado'}
            </div>
          ) : (
            <div>
              {(tab === 'all' ? filtered : selectedProducts).map(product => (
                <div key={product.id}
                  onClick={() => toggleProduct(product.id)}
                  className="flex items-center gap-3 px-6 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors">
                  <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleProduct(product.id)}
                    className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 flex-shrink-0" />
                  <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    {product.image_url ? (
                      <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-[10px]">IMG</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{product.title}</p>
                    <p className="text-xs text-gray-400">
                      {product.shopify_product_id && `ID: ${product.shopify_product_id}`}
                      {product.updated_at && ` · ${new Date(product.updated_at).toLocaleDateString('pt-BR')}`}
                    </p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${product.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {product.status === 'active' ? 'Publicado' : product.status || 'Ativo'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={handleAdd} disabled={selected.size === 0}
            className="px-4 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50">
            Adicionar produtos
          </button>
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
              {expandedId === product.id ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
              <span className="text-xs font-medium text-gray-900 truncate">{product.title}</span>
            </div>
            <button onClick={e => { e.stopPropagation(); onChange(products.filter((_, j) => j !== i)) }}
              className="p-1 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
          {expandedId === product.id && (
            <div className="px-3 py-2 space-y-2">
              <div>
                <label className="text-[10px] text-gray-500">Nome do produto</label>
                <input type="text" value={product.title || ''} onChange={e => {
                  const next = [...products]; next[i] = { ...next[i], title: e.target.value }; onChange(next)
                }} className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500">Preço</label>
                <input type="number" value={product.price || 0} onChange={e => {
                  const next = [...products]; next[i] = { ...next[i], price: Number(e.target.value) }; onChange(next)
                }} className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500">Descrição</label>
                <textarea value={product.description || ''} onChange={e => {
                  const next = [...products]; next[i] = { ...next[i], description: e.target.value }; onChange(next)
                }} rows={2} className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none resize-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500">Texto do botão</label>
                <input type="text" value={(product as any).buttonText || 'Comprar'} onChange={e => {
                  const next = [...products]; next[i] = { ...next[i], buttonText: e.target.value } as any; onChange(next)
                }} className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-gray-500">URL do produto</label>
                <input type="text" value={product.url || ''} onChange={e => {
                  const next = [...products]; next[i] = { ...next[i], url: e.target.value }; onChange(next)
                }} className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none" />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
