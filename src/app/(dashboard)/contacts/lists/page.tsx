'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  ListBullets,
  Plus,
  MagnifyingGlass,
  UsersThree,
  PencilSimple,
  Trash,
  ArrowLeft,
  Clock,
  CheckCircle,
  EnvelopeSimple,
  WhatsappLogo,
  DeviceMobileSpeaker,
  Export,
  Lightning,
  FunnelSimple,
  Copy,
} from '@phosphor-icons/react'
import { Loader2 } from 'lucide-react'
import { useAuthStore, useStoreStore } from '@/stores'
import { useConfirm } from '@/components/ui/ConfirmDialog'

interface ContactList {
  id: string
  name: string
  description?: string
  segment_type: string
  contact_count: number
  color?: string
  icon?: string
  rules?: any[]
  created_at: string
  updated_at?: string
}

const formatNumber = (n: number) => new Intl.NumberFormat('pt-BR').format(n)

export default function ContactListsPage() {
  const [lists, setLists] = useState<ContactList[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'dynamic' | 'static'>('all')
  const { user } = useAuthStore()
  const { currentStore } = useStoreStore()
  const hasHydrated = useStoreStore((s) => s._hasHydrated)
  const { confirm } = useConfirm()

  const fetchLists = useCallback(async () => {
    if (!user?.organization_id) return
    setLoading(true)
    try {
      // Filtra por store ativa pra que a tela de listas reflita
      // só os segmentos daquela loja. Antes pegava todos da org e
      // o "Total de Contatos" inflava com contatos de lojas irmãs.
      const params = new URLSearchParams({
        organization_id: user.organization_id,
        include_count: 'true',
      })
      if (currentStore?.id) params.set('store_id', currentStore.id)
      const res = await fetch(`/api/segments?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setLists(data.segments || [])
      }
    } catch (err) {
      console.error('Failed to fetch lists:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.organization_id, currentStore?.id])

  useEffect(() => {
    if (!hasHydrated) return
    fetchLists()
  }, [fetchLists, hasHydrated, currentStore?.id])

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Excluir lista?',
      description: 'Os contatos não serão deletados, apenas a lista será removida.',
      confirmLabel: 'Excluir lista',
      destructive: true,
    })
    if (!ok) return
    try {
      await fetch(`/api/segments?id=${id}`, { method: 'DELETE' })
      setLists(prev => prev.filter(l => l.id !== id))
    } catch {}
  }

  const filtered = lists.filter((l) => {
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'all' || l.segment_type === typeFilter
    return matchSearch && matchType
  })

  const totalContacts = lists.reduce((a, l) => a + (l.contact_count || 0), 0)
  const dynamicCount = lists.filter(l => l.segment_type === 'dynamic').length
  const staticCount = lists.filter(l => l.segment_type === 'static').length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/contacts" className="p-2 rounded-lg hover:bg-gray-50 transition-colors">
            <ArrowLeft size={18} className="text-gray-500" />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <ListBullets size={22} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">Listas de Contatos</h1>
            <p className="text-sm text-gray-500 mt-0.5">{lists.length} listas · {formatNumber(totalContacts)} contatos</p>
          </div>
        </div>
        <Link
          href="/segments/new"
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Nova Lista
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Total de Contatos</p>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(totalContacts)}</p>
        </div>
        <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Listas Dinâmicas</p>
          <p className="text-2xl font-bold text-gray-900">{dynamicCount}</p>
          <p className="text-xs text-emerald-600 mt-0.5">Atualizam automaticamente</p>
        </div>
        <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Listas Estáticas</p>
          <p className="text-2xl font-bold text-gray-900">{staticCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">Manuais / importação</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar listas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-brand-500"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'dynamic', 'static'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                typeFilter === t ? 'bg-brand-500 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t === 'all' ? 'Todas' : t === 'dynamic' ? 'Dinâmicas' : 'Estáticas'}
            </button>
          ))}
        </div>
      </div>

      {/* Lists */}
      {filtered.length === 0 ? (
        <div className="bg-white/50 border border-gray-200 rounded-xl p-12 text-center">
          <UsersThree size={32} className="text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {lists.length === 0
              ? 'Nenhuma lista criada ainda. Crie segmentos na aba Segmentos.'
              : 'Nenhuma lista encontrada.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((list, i) => (
            <motion.div
              key={list.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="bg-white/50 border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    list.segment_type === 'dynamic' ? 'bg-brand-50' : 'bg-gray-50'
                  }`}>
                    {list.segment_type === 'dynamic' ? (
                      <Lightning size={18} className="text-brand-500" weight="fill" />
                    ) : (
                      <ListBullets size={18} className="text-gray-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{list.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        list.segment_type === 'dynamic'
                          ? 'bg-brand-50 text-brand-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {list.segment_type === 'dynamic' ? 'Dinâmica' : 'Estática'}
                      </span>
                    </div>
                    {list.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{list.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{formatNumber(list.contact_count || 0)}</p>
                    <p className="text-[10px] text-gray-400">contatos</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/segments?id=${list.id}`} className="p-1.5 rounded hover:bg-gray-100">
                      <PencilSimple size={14} className="text-gray-400" />
                    </Link>
                    <button onClick={() => handleDelete(list.id)} className="p-1.5 rounded hover:bg-red-50">
                      <Trash size={14} className="text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
