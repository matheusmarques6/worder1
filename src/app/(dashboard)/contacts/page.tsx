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
} from '@phosphor-icons/react'
import { Loader2 } from 'lucide-react'
import { useAuthStore, useStoreStore } from '@/stores'

const PAGE_SIZE = 50

export default function ContactsPage() {
  const { user } = useAuthStore()
  const { currentStore } = useStoreStore()
  const [contacts, setContacts] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      })
      if (currentStore?.id) params.set('storeId', currentStore.id)
      if (search) params.set('search', search)

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
  }, [page, search, currentStore?.id])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

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
      const res = await fetch('/api/shopify/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncType: 'customers' }),
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

      {/* Search */}
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
      </div>

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
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors group">
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
    </div>
  )
}
