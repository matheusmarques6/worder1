'use client'

import { useState, useEffect } from 'react'
import { X, Search, Plus } from 'lucide-react'

interface ProductFeed {
  id: string
  name: string
  feed_type: string
  time_period?: string
  filters?: any[]
  created_at?: string
}

interface ProductFeedModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (feed: ProductFeed) => void
  currentFeedId?: string
}

const FEED_TYPES = [
  { value: 'recently_viewed', label: 'Produtos visualizados recentemente' },
  { value: 'bestsellers', label: 'Produtos mais vendidos' },
  { value: 'newest', label: 'Produtos mais recentes' },
  { value: 'most_viewed', label: 'Produtos mais vistos' },
  { value: 'cart_items', label: 'Produtos no carrinho' },
  { value: 'recommendations', label: 'Produtos recomendados' },
]

const FALLBACK_TYPES = [
  { value: 'bestsellers', label: 'Produtos mais vendidos' },
  { value: 'newest', label: 'Produtos mais recentes' },
  { value: 'most_viewed', label: 'Produtos mais vistos' },
]

const TIME_PERIODS = [
  { value: '3d', label: 'últimos 3 dias' },
  { value: '7d', label: 'últimos 7 dias' },
  { value: '30d', label: 'últimos 30 dias' },
  { value: '90d', label: 'últimos 90 dias' },
]

const FILTER_FIELDS = [
  { value: 'category', label: 'Categoria' },
  { value: 'product_type', label: 'Tipo de produto' },
  { value: 'vendor', label: 'Fornecedor' },
  { value: 'tags', label: 'Tags' },
  { value: 'price', label: 'Preço' },
]

const FILTER_OPERATORS = [
  { value: 'includes', label: 'inclui' },
  { value: 'excludes', label: 'exclui' },
  { value: 'equals', label: 'é igual a' },
  { value: 'any_of', label: 'qualquer de' },
]

// ── View All Product Feeds Modal ──
export function ViewFeedsModal({ isOpen, onClose, onSelect, currentFeedId }: ProductFeedModalProps) {
  const [feeds, setFeeds] = useState<ProductFeed[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(currentFeedId || '')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    fetch('/api/email/product-feeds')
      .then(r => r.json())
      .then(data => setFeeds(Array.isArray(data) ? data : data.feeds || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isOpen])

  if (!isOpen) return null

  const filtered = search ? feeds.filter(f => f.name.toLowerCase().includes(search.toLowerCase())) : feeds

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-[600px] max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Ver todos os feeds de produtos</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="flex items-center flex-1 border border-gray-200 rounded-lg px-3 py-2">
              <Search className="w-4 h-4 text-gray-400 mr-2" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar feeds de produtos"
                className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none" />
            </div>
            {search && <button onClick={() => setSearch('')} className="text-sm text-brand-600 hover:text-brand-700">Limpar</button>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-6 py-2 text-xs font-medium text-gray-500">Feed</th>
                <th className="text-left px-6 py-2 text-xs font-medium text-gray-500">Atualizado em</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={2} className="px-6 py-8 text-center text-sm text-gray-400">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={2} className="px-6 py-8 text-center text-sm text-gray-400">Nenhum feed encontrado</td></tr>
              ) : filtered.map(feed => (
                <tr key={feed.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(feed.id)}>
                  <td className="px-6 py-3">
                    <div className="flex items-start gap-3">
                      <input type="radio" checked={selected === feed.id} onChange={() => setSelected(feed.id)}
                        className="mt-1 w-4 h-4 text-brand-500 border-gray-300" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{feed.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Show products from All categories.
                          {feed.feed_type === 'recently_viewed' && ' Show products a customer has recently viewed.'}
                          {feed.feed_type === 'bestsellers' && ' Show best-selling products.'}
                          {feed.feed_type === 'newest' && ' Show newest products.'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-xs text-gray-500">
                    {feed.created_at ? new Date(feed.created_at).toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && <p className="px-6 py-2 text-xs text-gray-400">{filtered.length} de {feeds.length}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Fechar</button>
          <button onClick={() => { const f = feeds.find(f => f.id === selected); if (f) { onSelect(f); onClose() } }}
            disabled={!selected}
            className="px-4 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50">
            Selecionar feed
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Create Product Feed Modal ──
export function CreateFeedModal({ isOpen, onClose, onCreate }: {
  isOpen: boolean; onClose: () => void; onCreate: (feed: ProductFeed) => void
}) {
  const [name, setName] = useState('')
  const [feedType, setFeedType] = useState('recently_viewed')
  const [fallbackType, setFallbackType] = useState('bestsellers')
  const [timePeriod, setTimePeriod] = useState('3d')
  const [filters, setFilters] = useState<{ field: string; operator: string; value: string }[]>([])
  const [saving, setSaving] = useState(false)

  if (!isOpen) return null

  const handleCreate = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/email/product-feeds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), feed_type: feedType, fallback_type: fallbackType, time_period: timePeriod, filters }),
      })
      const data = await res.json()
      if (data.id || data.feed?.id) {
        onCreate(data.feed || data)
        onClose()
      }
    } catch {}
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-[600px] max-w-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Criar feed de produtos</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Qual o nome deste feed de produtos?</label>
            <p className="text-xs text-gray-500 mb-2">O nome pode conter apenas letras, números e underscores.</p>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="feed_nome"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none" />
          </div>

          {/* Primary feed type */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Quais produtos os clientes devem ver primeiro?</label>
            <select value={feedType} onChange={e => setFeedType(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:border-brand-500 outline-none">
              {FEED_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Fallback */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Se o cliente tem histórico limitado, o que deve ver?</label>
            <div className="flex items-center gap-2">
              <select value={fallbackType} onChange={e => setFallbackType(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:border-brand-500 outline-none">
                {FALLBACK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <span className="text-sm text-gray-500">nos</span>
              <select value={timePeriod} onChange={e => setTimePeriod(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:border-brand-500 outline-none">
                {TIME_PERIODS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* Filters */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Quais filtros adicionais deseja aplicar?</label>
            {filters.map((f, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="text-sm text-gray-500">Mostrar produtos onde</span>
                <select value={f.field} onChange={e => { const nf = [...filters]; nf[i].field = e.target.value; setFilters(nf) }}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
                  {FILTER_FIELDS.map(ff => <option key={ff.value} value={ff.value}>{ff.label}</option>)}
                </select>
                <select value={f.operator} onChange={e => { const nf = [...filters]; nf[i].operator = e.target.value; setFilters(nf) }}
                  className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
                  {FILTER_OPERATORS.map(fo => <option key={fo.value} value={fo.value}>{fo.label}</option>)}
                </select>
                <input type="text" value={f.value} onChange={e => { const nf = [...filters]; nf[i].value = e.target.value; setFilters(nf) }}
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" placeholder="value" />
                <button onClick={() => setFilters(filters.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button onClick={() => setFilters([...filters, { field: 'category', operator: 'includes', value: '' }])}
              className="text-sm font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
              Adicionar Filtro
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Fechar</button>
          <button onClick={handleCreate} disabled={!name.trim() || saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50">
            {saving ? 'Criando...' : 'Criar feed de produtos'}
          </button>
        </div>
      </div>
    </div>
  )
}
