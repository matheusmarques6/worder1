'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { X, Search, Loader2, Ban, Pencil } from 'lucide-react'
import { useStoreStore } from '@/stores'

interface ProductFeed {
  id: string
  name: string
  feed_type: string
  fallback_type?: string
  time_period?: string
  filters?: any[]
  /** shopify_product_id dos produtos que este feed nunca mostra. */
  excluded_product_ids?: string[]
  created_at?: string
}

interface ProductFeedModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (feed: ProductFeed) => void
  onEdit?: (feed: ProductFeed) => void
  currentFeedId?: string
}

const FEED_TYPES = [
  { value: 'recently_viewed', label: 'Produtos visualizados recentemente' },
  { value: 'bestsellers', label: 'Produtos mais vendidos' },
  { value: 'newest', label: 'Produtos mais recentes' },
  { value: 'most_viewed', label: 'Produtos mais vistos' },
  { value: 'cart_items', label: 'Produtos no carrinho' },
  { value: 'recommendations', label: 'Produtos recomendados' },
  { value: 'trigger_cart', label: 'Produtos do Carrinho Abandonado' },
  { value: 'trigger_viewed_product', label: 'Produto Visualizado (evento)' },
  { value: 'trigger_order', label: 'Produtos do Pedido' },
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

const brl = (v: number) => `R$ ${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ── Ver todos os feeds ──
export function ViewFeedsModal({ isOpen, onClose, onSelect, onEdit, currentFeedId }: ProductFeedModalProps) {
  const [feeds, setFeeds] = useState<ProductFeed[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(currentFeedId || '')
  const [loading, setLoading] = useState(true)
  // Feeds da loja selecionada (mais os da organização inteira). Os
  // produtos em si só são escolhidos no envio, pela loja do e-mail.
  const { currentStore } = useStoreStore()
  const storeId = currentStore?.id

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    const qs = storeId ? `?store_id=${encodeURIComponent(storeId)}` : ''
    fetch(`/api/email/product-feeds${qs}`)
      .then(r => r.json())
      .then(data => setFeeds(Array.isArray(data) ? data : data.feeds || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isOpen, storeId])

  if (!isOpen) return null

  const filtered = search ? feeds.filter(f => f.name.toLowerCase().includes(search.toLowerCase())) : feeds

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-[640px] max-w-full max-h-[70vh] flex flex-col">
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
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Criado em</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-400">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-400">Nenhum feed encontrado</td></tr>
              ) : filtered.map(feed => {
                const excl = feed.excluded_product_ids?.length || 0
                return (
                  <tr key={feed.id} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(feed.id)}>
                    <td className="px-6 py-3">
                      <div className="flex items-start gap-3">
                        <input type="radio" checked={selected === feed.id} onChange={() => setSelected(feed.id)}
                          className="mt-1 w-4 h-4 text-brand-500 border-gray-300" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{feed.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {FEED_TYPES.find(t => t.value === feed.feed_type)?.label || feed.feed_type}
                          </p>
                          {excl > 0 && (
                            <span className="inline-flex items-center gap-1 mt-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                              <Ban className="w-3 h-3" />
                              {excl} produto{excl === 1 ? '' : 's'} excluído{excl === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {feed.created_at ? new Date(feed.created_at).toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {onEdit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onEdit(feed); onClose() }}
                          title="Editar feed e produtos excluídos"
                          className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-100"
                        >
                          <Pencil className="w-3 h-3" />Editar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
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

// ── Produtos excluídos do feed ──
interface PickerProduct { id: string; title: string; image: string | null; price: number; vendor?: string; type?: string; hiddenGlobally?: boolean }

/**
 * Escolha dos produtos que NÃO podem aparecer no feed. O feed monta a
 * lista sozinho (mais vendidos, carrinho abandonado…); aqui o lojista tira
 * da jogada o que nunca deve ir para o cliente — fora de linha, brinde,
 * produto em disputa. Vale só para ESTE feed; para esconder de todos os
 * feeds existe o "ocultar dos feeds" na tela de Produtos.
 */
function ExcludedProducts({ excluded, onChange }: { excluded: string[]; onChange: (ids: string[]) => void }) {
  const { currentStore } = useStoreStore()
  const storeId = currentStore?.id
  const [products, setProducts] = useState<PickerProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    if (loaded || loading) return
    setLoading(true)
    setError(null)
    const qs = storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''
    fetch(`/api/products${qs}`)
      .then(r => r.json())
      .then(data => {
        const raw: any[] = Array.isArray(data) ? data : data.products || []
        setProducts(raw.map((p) => ({
          id: String(p.shopify_product_id || p.id),
          title: p.title || 'Produto',
          image: p.image || p.image_url || null,
          price: p.price ?? p.price_min ?? 0,
          vendor: p.vendor || undefined,
          type: p.product_type || undefined,
          hiddenGlobally: !!p.hidden_from_feeds,
        })))
        setLoaded(true)
      })
      .catch(() => setError('Não foi possível carregar os produtos da loja.'))
      .finally(() => setLoading(false))
  }, [storeId, loaded, loading])

  // Carrega o catálogo só quando a seção é aberta — a busca vai à Shopify.
  useEffect(() => { if (open) load() }, [open, load])

  const byId = useMemo(() => new Map(products.map(p => [p.id, p])), [products])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q ? products.filter(p => p.title.toLowerCase().includes(q) || (p.vendor || '').toLowerCase().includes(q)) : products
    return list.slice(0, 200)
  }, [products, search])

  const toggle = (id: string) => onChange(excluded.includes(id) ? excluded.filter(x => x !== id) : [...excluded, id])

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-gray-900">Algum produto não pode aparecer neste feed?</label>
        {excluded.length > 0 && (
          <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
            {excluded.length} excluído{excluded.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-2">
        Os escolhidos aqui nunca entram neste feed — nem quando o cliente coloca no carrinho ou compra.
      </p>

      {/* Excluídos atuais */}
      {excluded.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {excluded.map(id => {
            const p = byId.get(id)
            return (
              <span key={id} className="inline-flex items-center gap-1.5 bg-gray-100 border border-gray-200 rounded-lg pl-1 pr-1.5 py-1 text-xs text-gray-800 max-w-[240px]">
                {p?.image
                  ? <img src={p.image} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0" />
                  : <span className="w-5 h-5 rounded bg-gray-200 flex-shrink-0" />}
                <span className="truncate">{p?.title || (loaded ? `Produto ${id}` : id)}</span>
                <button type="button" onClick={() => toggle(id)} title="Voltar a permitir" className="text-gray-400 hover:text-red-500 flex-shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {!open ? (
        <button type="button" onClick={() => setOpen(true)}
          className="text-sm font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
          {excluded.length ? 'Alterar produtos excluídos' : 'Excluir produtos'}
        </button>
      ) : (
        <div className="border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <Search className="w-4 h-4 text-gray-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto da loja"
              className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none" />
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-700">Fechar</button>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando produtos...
              </div>
            ) : error ? (
              <div className="py-6 text-center text-sm text-red-600">
                {error}
                <button type="button" onClick={() => { setLoaded(false); load() }} className="ml-2 underline">Tentar de novo</button>
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                {products.length === 0 ? 'Nenhum produto na loja selecionada.' : 'Nenhum produto encontrado.'}
              </p>
            ) : filtered.map(p => {
              const on = excluded.includes(p.id)
              return (
                <label key={p.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-b border-gray-50 last:border-0 ${on ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(p.id)} className="w-4 h-4 rounded border-gray-300 text-brand-500" />
                  {p.image
                    ? <img src={p.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                    : <span className="w-8 h-8 rounded bg-gray-100 flex-shrink-0" />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-gray-900 truncate">{p.title}</span>
                    <span className="block text-xs text-gray-500">
                      {brl(p.price)}{p.type ? ` · ${p.type}` : ''}
                      {p.hiddenGlobally && <span className="text-gray-400"> · já oculto em todos os feeds</span>}
                    </span>
                  </span>
                  {on && <span className="text-xs font-medium text-amber-700 flex-shrink-0">Excluído</span>}
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Criar / editar feed de produtos ──
export function CreateFeedModal({ isOpen, onClose, onCreate, editFeed }: {
  isOpen: boolean; onClose: () => void; onCreate: (feed: ProductFeed) => void; editFeed?: ProductFeed | null
}) {
  const isEdit = !!editFeed
  const [name, setName] = useState('')
  const [feedType, setFeedType] = useState('recently_viewed')
  const [fallbackType, setFallbackType] = useState('bestsellers')
  const [timePeriod, setTimePeriod] = useState('3d')
  const [filters, setFilters] = useState<{ field: string; operator: string; value: string }[]>([])
  const [excluded, setExcluded] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // O feed nasce na loja selecionada.
  const { currentStore } = useStoreStore()

  // Abrir o modal recarrega o formulário: em branco para criar, com os
  // valores do feed para editar.
  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setName(editFeed?.name || '')
    setFeedType(editFeed?.feed_type || 'recently_viewed')
    setFallbackType(editFeed?.fallback_type || 'bestsellers')
    setTimePeriod(editFeed?.time_period || '3d')
    setFilters(Array.isArray(editFeed?.filters) ? (editFeed!.filters as any[]) : [])
    setExcluded(Array.isArray(editFeed?.excluded_product_ids) ? editFeed!.excluded_product_ids!.map(String) : [])
  }, [isOpen, editFeed])

  if (!isOpen) return null

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: name.trim(), feed_type: feedType, fallback_type: fallbackType, time_period: timePeriod, filters,
        excluded_product_ids: excluded,
        ...(isEdit ? {} : { store_id: currentStore?.id || null }),
      }
      const res = await fetch(isEdit ? `/api/email/product-feeds/${editFeed!.id}` : '/api/email/product-feeds', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Não foi possível salvar o feed.')
        setSaving(false)
        return
      }
      const feed = data.feed || data
      if (!feed?.id) {
        setError('O feed foi salvo sem identificador. Recarregue a página e tente de novo.')
        setSaving(false)
        return
      }
      onCreate(feed)
      onClose()
      setName('')
      setFilters([])
      setExcluded([])
    } catch (err: any) {
      setError(err?.message || 'Falha na conexão.')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-[600px] max-w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Editar feed de produtos' : 'Criar feed de produtos'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-5 space-y-5 overflow-y-auto">
          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-1">Qual o nome deste feed de produtos?</label>
            <p className="text-xs text-gray-500 mb-2">O nome pode conter apenas letras, números e underscores.</p>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="feed_nome"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none" />
          </div>

          {/* Tipo principal */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">Quais produtos os clientes devem ver primeiro?</label>
            <select value={feedType} onChange={e => setFeedType(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:border-brand-500 outline-none">
              {FEED_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Reserva */}
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

          {/* Produtos excluídos */}
          <ExcludedProducts excluded={excluded} onChange={setExcluded} />

          {/* Filtros */}
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
                  className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" placeholder="valor" />
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

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Fechar</button>
          <button onClick={handleSave} disabled={!name.trim() || saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-gray-900 rounded-lg hover:bg-gray-800 disabled:opacity-50">
            {saving ? 'Salvando...' : isEdit ? 'Salvar alterações' : 'Criar feed de produtos'}
          </button>
        </div>
      </div>
    </div>
  )
}
