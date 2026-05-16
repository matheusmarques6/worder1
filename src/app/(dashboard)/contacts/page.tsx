'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  UsersThree,
  UserPlus,
  MagnifyingGlass,
  FunnelSimple,
  EnvelopeSimple,
  WhatsappLogo,
  DotsThree,
  CurrencyDollar,
  CaretLeft,
  CaretRight,
  ArrowsClockwise,
  ShoppingCart,
  Export,
  Tag,
  Trash,
  X,
  CaretDown,
  CheckSquare,
  Square,
  MinusSquare,
} from '@phosphor-icons/react'
import { Loader2 } from 'lucide-react'
import { useAuthStore, useStoreStore } from '@/stores'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const PAGE_SIZE = 50

export default function ContactsPage() {
  const { user } = useAuthStore()
  const { currentStore } = useStoreStore()
  const { confirm } = useConfirm()
  const [contacts, setContacts] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  // Sort
  const [sort, setSort] = useState('recent')
  const [showSortDropdown, setShowSortDropdown] = useState(false)

  // Filters
  const [showFilters, setShowFilters] = useState(false)
  const [filterSource, setFilterSource] = useState('')
  const [filterSubscribed, setFilterSubscribed] = useState('')
  const [filterTags, setFilterTags] = useState('')

  // Bulk select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkMessage, setBulkMessage] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [bulkTagValue, setBulkTagValue] = useState('')

  const fetchContacts = useCallback(async () => {
    if (!currentStore?.id) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      })
      if (currentStore?.id) params.set('storeId', currentStore.id)
      if (search) params.set('search', search)
      if (sort && sort !== 'recent') params.set('sort', sort)
      if (filterSource) params.set('source', filterSource)
      if (filterSubscribed) params.set('subscribed', filterSubscribed)
      if (filterTags) params.set('tags', filterTags)

      const res = await fetch(`/api/contacts?${params}`)
      if (res.ok) {
        const data = await res.json()
        setContacts(data.contacts || [])
        setTotalCount(data.pagination?.total || data.contacts?.length || 0)
      }
    } catch (err) {
      console.error('Failed to fetch contacts:', err)
    } finally {
      setLoading(false)
    }
  }, [page, search, currentStore?.id, sort, filterSource, filterSubscribed, filterTags])

  // Hydration gate: zustand currentStore is undefined for ~1 frame
  // after F5; without this guard the first fetch lands without a
  // storeId and the server falls back to the org's default store —
  // which on a multi-store org leaks the wrong contacts in.
  const hasHydrated = useStoreStore((s) => s._hasHydrated)
  useEffect(() => {
    if (!hasHydrated) return
    fetchContacts()
  }, [fetchContacts, hasHydrated])

  // Debounce search
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  const handleSync = async () => {
    setSyncing(true)
    setSyncMessage('')
    try {
      const syncBody: Record<string, string> = { syncType: 'customers' }
      if (currentStore?.id) syncBody.storeId = currentStore.id
      const res = await fetch('/api/shopify/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncBody),
      })
      const data = await res.json()
      if (data.data) {
        setSyncMessage(`${data.data.customers || 0} contatos sincronizados`)
        fetchContacts()
      } else {
        setSyncMessage(data.error || 'Erro')
      }
    } catch {
      setSyncMessage('Erro ao sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  // Clear selection when contacts change
  useEffect(() => {
    setSelectedIds(new Set())
  }, [contacts])

  // Export handler
  const handleExport = () => {
    if (!currentStore?.id) return
    window.open(`/api/contacts/export?storeId=${currentStore.id}`, '_blank')
  }

  // Bulk actions
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(contacts.map((c: any) => c.id)))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const ok = await confirm({
      title: `Excluir ${selectedIds.size} contato${selectedIds.size > 1 ? 's' : ''}?`,
      description: 'Esta ação é definitiva. Os contatos serão removidos do seu CRM e de todas as listas.',
      confirmLabel: 'Excluir',
      destructive: true,
    })
    if (!ok) return
    setBulkLoading(true)
    setBulkMessage('')
    try {
      const res = await fetch('/api/contacts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          contactIds: Array.from(selectedIds),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setBulkMessage(data.message)
        setSelectedIds(new Set())
        fetchContacts()
      } else {
        setBulkMessage(data.error || 'Erro ao excluir')
      }
    } catch {
      setBulkMessage('Erro ao excluir contatos')
    } finally {
      setBulkLoading(false)
    }
  }

  const handleBulkAddTag = async () => {
    if (selectedIds.size === 0 || !bulkTagValue.trim()) return
    setBulkLoading(true)
    setBulkMessage('')
    try {
      const res = await fetch('/api/contacts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addTags',
          contactIds: Array.from(selectedIds),
          options: { tags: bulkTagValue.split(',').map(t => t.trim()).filter(Boolean) },
        }),
      })
      const data = await res.json()
      if (data.success) {
        setBulkMessage(data.message)
        setSelectedIds(new Set())
        setShowTagInput(false)
        setBulkTagValue('')
        fetchContacts()
      } else {
        setBulkMessage(data.error || 'Erro ao adicionar tags')
      }
    } catch {
      setBulkMessage('Erro ao adicionar tags')
    } finally {
      setBulkLoading(false)
    }
  }

  const sortOptions = [
    { value: 'recent', label: 'Mais recente' },
    { value: 'name_asc', label: 'Nome A-Z' },
    { value: 'most_orders', label: 'Mais pedidos' },
    { value: 'highest_spent', label: 'Maior valor gasto' },
  ]

  const activeFilterCount = [filterSource, filterSubscribed, filterTags].filter(Boolean).length

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const startIdx = (page - 1) * PAGE_SIZE + 1
  const endIdx = Math.min(page * PAGE_SIZE, totalCount)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contatos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalCount > 0 ? `${totalCount.toLocaleString('pt-BR')} contatos` : 'Gerencie sua base de contatos'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 px-3.5 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <ArrowsClockwise className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sync Shopify'}
          </button>
          <Link
            href="/contacts/lists"
            className="flex items-center gap-2 px-3.5 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Tag className="w-4 h-4" />
            Listas & Segmentos
          </Link>
          <Link
            href="/crm/contacts"
            className="flex items-center gap-2 px-3.5 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Novo Contato
          </Link>
        </div>
      </div>

      {/* Sync Message */}
      {syncMessage && (
        <div className={`px-4 py-2.5 rounded-lg text-sm ${
          syncMessage.includes('Erro') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
        }`}>
          {syncMessage}
        </div>
      )}

      {/* Bulk Message */}
      {bulkMessage && (
        <div className={`px-4 py-2.5 rounded-lg text-sm ${
          bulkMessage.includes('Erro') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
        }`}>
          {bulkMessage}
        </div>
      )}

      {/* Search + Sort + Filter + Export */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, email ou telefone..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
          />
        </div>

        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSortDropdown(!showSortDropdown)}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors bg-white"
          >
            {sortOptions.find(o => o.value === sort)?.label || 'Mais recente'}
            <CaretDown className="w-3.5 h-3.5" />
          </button>
          {showSortDropdown && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 min-w-[160px]">
              {sortOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setSort(opt.value); setShowSortDropdown(false); setPage(1) }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors ${sort === opt.value ? 'text-brand-600 font-medium bg-brand-50' : 'text-gray-700'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filter Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-colors ${
            activeFilterCount > 0
              ? 'border-brand-300 bg-brand-50 text-brand-700'
              : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white'
          }`}
        >
          <FunnelSimple className="w-4 h-4" />
          Filtros
          {activeFilterCount > 0 && (
            <span className="ml-0.5 bg-brand-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Export Button */}
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors bg-white"
        >
          <Export className="w-4 h-4" />
          Exportar
        </button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Filtros</h3>
            <button
              onClick={() => { setFilterSource(''); setFilterSubscribed(''); setFilterTags(''); setPage(1) }}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Limpar filtros
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Subscription Status */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status de inscrição</label>
              <select
                value={filterSubscribed}
                onChange={(e) => { setFilterSubscribed(e.target.value); setPage(1) }}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              >
                <option value="">Todos</option>
                <option value="true">Inscrito</option>
                <option value="false">Não inscrito</option>
              </select>
            </div>
            {/* Source */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fonte</label>
              <select
                value={filterSource}
                onChange={(e) => { setFilterSource(e.target.value); setPage(1) }}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              >
                <option value="">Todas</option>
                <option value="manual">Manual</option>
                <option value="import">Importação</option>
                <option value="shopify">Shopify</option>
                <option value="form">Formulário</option>
              </select>
            </div>
            {/* Tags */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tags (separar por vírgula)</label>
              <input
                type="text"
                value={filterTags}
                onChange={(e) => { setFilterTags(e.target.value); setPage(1) }}
                placeholder="ex: vip, novo"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <UsersThree className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">Nenhum contato encontrado</p>
            <p className="text-gray-400 text-sm mt-1">
              {search ? 'Tente outro termo de busca' : 'Clique em "Sync Shopify" para importar'}
            </p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-200">
                  <th className="w-10 px-4 py-2.5">
                    <button onClick={toggleSelectAll} className="text-gray-400 hover:text-gray-600 transition-colors">
                      {selectedIds.size === contacts.length && contacts.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-brand-500" weight="fill" />
                      ) : selectedIds.size > 0 ? (
                        <MinusSquare className="w-4 h-4 text-brand-500" weight="fill" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">Contato</th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">E-mail</th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">Telefone</th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">Pedidos</th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">Gasto Total</th>
                  <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">Fonte</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c: any) => (
                  <tr key={c.id} className={`border-b border-gray-100 hover:bg-gray-50/50 transition-colors group ${selectedIds.has(c.id) ? 'bg-brand-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleSelect(c.id)} className="text-gray-400 hover:text-gray-600 transition-colors">
                        {selectedIds.has(c.id) ? (
                          <CheckSquare className="w-4 h-4 text-brand-500" weight="fill" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/contacts/${c.id}`} className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-[11px] font-bold text-brand-600 flex-shrink-0">
                          {(c.first_name?.[0] || c.email?.[0] || '?').toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-gray-900 group-hover:text-brand-600 transition-colors truncate max-w-[180px]">
                          {c.first_name || c.last_name ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : c.email?.split('@')[0] || '—'}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 truncate max-w-[200px]">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.phone || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{c.total_orders || 0}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                      {c.total_spent ? `R$ ${parseFloat(c.total_spent).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
                        {c.source || 'shopify'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/contacts/${c.id}`} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                        <DotsThree className="w-4 h-4" weight="bold" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50/50">
              <p className="text-xs text-gray-500">
                {startIdx}–{endIdx} de {totalCount.toLocaleString('pt-BR')}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded hover:bg-gray-200 text-gray-500 disabled:opacity-30 transition-colors"
                >
                  <CaretLeft className="w-4 h-4" weight="bold" />
                </button>
                <span className="text-xs text-gray-600 px-2">
                  Página {page} de {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded hover:bg-gray-200 text-gray-500 disabled:opacity-30 transition-colors"
                >
                  <CaretRight className="w-4 h-4" weight="bold" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4">
          <span className="text-sm font-medium">
            {selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}
          </span>
          <div className="w-px h-5 bg-gray-700" />
          {showTagInput ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={bulkTagValue}
                onChange={(e) => setBulkTagValue(e.target.value)}
                placeholder="Tag(s) separadas por vírgula"
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 w-48"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleBulkAddTag() }}
              />
              <button
                onClick={handleBulkAddTag}
                disabled={bulkLoading || !bulkTagValue.trim()}
                className="px-3 py-1.5 bg-brand-500 rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50"
              >
                Adicionar
              </button>
              <button
                onClick={() => { setShowTagInput(false); setBulkTagValue('') }}
                className="p-1 rounded hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowTagInput(true)}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 rounded-lg text-sm hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <Tag className="w-3.5 h-3.5" />
                Adicionar tag
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 rounded-lg text-sm hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                <Trash className="w-3.5 h-3.5" />
                Excluir selecionados
              </button>
            </>
          )}
          <button
            onClick={() => { setSelectedIds(new Set()); setShowTagInput(false); setBulkTagValue('') }}
            className="p-1 rounded hover:bg-gray-800 transition-colors ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
