'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Users, Search, Plus, Loader2, Heart, UserX, RefreshCw, UserPlus,
  ShoppingCart, AlertTriangle, Crown, ShoppingBag, MoreVertical,
  Trash2, Eye, ArrowUpDown, Archive, ArchiveRestore, Star,
  SlidersHorizontal,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore, useStoreStore } from '@/stores'

interface Segment {
  id: string
  name: string
  description?: string
  segment_type: string
  contact_count: number
  rules?: any[]
  color?: string
  icon?: string
  is_active?: boolean
  created_at: string
  updated_at?: string
}

const segmentIcons: Record<string, { icon: any; color: string; bg: string }> = {
  'Engajados 30d': { icon: Heart, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  'Não Engajados 90d': { icon: UserX, color: 'text-gray-600', bg: 'bg-gray-100' },
  'Recorrentes 2+': { icon: RefreshCw, color: 'text-blue-600', bg: 'bg-blue-50' },
  'Novos 7d': { icon: UserPlus, color: 'text-violet-600', bg: 'bg-violet-50' },
  'Nunca Comprou': { icon: ShoppingCart, color: 'text-amber-600', bg: 'bg-amber-50' },
  'Risco de Churn': { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  'VIP': { icon: Crown, color: 'text-orange-600', bg: 'bg-orange-50' },
  'Carrinho Abandonado': { icon: ShoppingBag, color: 'text-pink-600', bg: 'bg-pink-50' },
}

const defaultIcon = { icon: Users, color: 'text-gray-600', bg: 'bg-gray-100' }
const formatNumber = (n: number) => isNaN(n) ? '0' : new Intl.NumberFormat('pt-BR').format(n)

type SortBy = 'name' | 'recent' | 'count'
type ViewMode = 'active' | 'archived'

const FAV_KEY = 'worder:segment_favs'

function loadFavs(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(FAV_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

function saveFavs(favs: Set<string>) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(favs))) } catch {}
}

export default function SegmentsPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const { currentStore } = useStoreStore()
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('recent')
  const [viewMode, setViewMode] = useState<ViewMode>('active')
  const [favs, setFavs] = useState<Set<string>>(new Set())

  useEffect(() => { setFavs(loadFavs()) }, [])

  const fetchSegments = useCallback(async (seed = true) => {
    if (!user?.organization_id) return
    try {
      const params = new URLSearchParams({
        organization_id: user.organization_id,
        include_count: 'true',
      })
      if (currentStore?.id) params.set('store_id', currentStore.id)
      const res = await fetch(`/api/segments?${params}`)
      if (res.ok) {
        const data = await res.json()
        let segs = data.segments || []
        if (segs.length === 0 && seed) {
          await fetch('/api/segments/seed', { method: 'POST' })
          const res2 = await fetch(`/api/segments?${params}`)
          if (res2.ok) {
            const data2 = await res2.json()
            segs = data2.segments || []
          }
        }
        setSegments(segs)
      }
    } catch (err) {
      console.error('Failed to fetch segments:', err)
    }
  }, [user?.organization_id, currentStore?.id])

  useEffect(() => {
    setLoading(true)
    fetchSegments().finally(() => setLoading(false))
  }, [fetchSegments])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchSegments(false)
    setRefreshing(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este segmento permanentemente?')) return
    setDeleting(id)
    try {
      await fetch(`/api/segments?id=${id}`, { method: 'DELETE' })
      setSegments((prev) => prev.filter((s) => s.id !== id))
    } catch {} finally {
      setDeleting(null)
      setMenuOpen(null)
    }
  }

  const handleArchive = async (id: string, archive: boolean) => {
    try {
      await fetch('/api/segments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !archive }),
      })
      setSegments((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_active: !archive } : s))
      )
    } catch {} finally {
      setMenuOpen(null)
    }
  }

  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveFavs(next)
      return next
    })
  }

  const visible = useMemo(() => {
    const base = segments.filter((s) => {
      const archived = s.is_active === false
      const matchView = viewMode === 'archived' ? archived : !archived
      const matchSearch =
        !search || s.name.toLowerCase().includes(search.toLowerCase())
      return matchView && matchSearch
    })
    const sorted = [...base].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name, 'pt-BR')
        case 'count':
          return (b.contact_count || 0) - (a.contact_count || 0)
        case 'recent':
        default:
          return (
            new Date(b.updated_at || b.created_at).getTime() -
            new Date(a.updated_at || a.created_at).getTime()
          )
      }
    })
    // Favorites pinned to top (only when viewing active)
    if (viewMode === 'active') {
      sorted.sort((a, b) => {
        const af = favs.has(a.id) ? 1 : 0
        const bf = favs.has(b.id) ? 1 : 0
        return bf - af
      })
    }
    return sorted
  }, [segments, search, sortBy, viewMode, favs])

  const activeCount = segments.filter((s) => s.is_active !== false).length
  const archivedCount = segments.filter((s) => s.is_active === false).length
  const totalContacts = segments
    .filter((s) => s.is_active !== false)
    .reduce((sum, s) => sum + (s.contact_count || 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Segmentos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCount} ativos · {formatNumber(totalContacts)} contatos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar contagens
          </button>
          <Link
            href="/segments/new"
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Criar segmento
          </Link>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[280px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar segmentos…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="appearance-none pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="recent">Mais recentes</option>
              <option value="name">Nome (A-Z)</option>
              <option value="count">Mais contatos</option>
            </select>
            <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          <div className="flex border border-gray-200 rounded-lg overflow-hidden bg-white text-sm">
            <button
              type="button"
              onClick={() => setViewMode('active')}
              className={`px-3 py-2 font-medium transition-colors ${
                viewMode === 'active'
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Ativos ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('archived')}
              className={`px-3 py-2 font-medium transition-colors ${
                viewMode === 'archived'
                  ? 'bg-brand-500 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Arquivados ({archivedCount})
            </button>
          </div>
        </div>
      </div>

      {/* Segments list */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-200">
          <Users className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">
            {viewMode === 'archived' ? 'Nenhum segmento arquivado' : 'Nenhum segmento encontrado'}
          </p>
          <p className="text-gray-400 text-sm mt-1 mb-4">
            {search
              ? 'Tente outro termo de busca'
              : viewMode === 'archived'
              ? 'Segmentos arquivados aparecerão aqui'
              : 'Crie seu primeiro segmento para começar a segmentar contatos'}
          </p>
          {!search && viewMode === 'active' && (
            <Link
              href="/segments/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600"
            >
              <Plus className="w-4 h-4" />
              Criar segmento
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((segment, i) => {
            const iconConfig = segmentIcons[segment.name] || defaultIcon
            const Icon = iconConfig.icon
            const count = segment.contact_count || 0
            const archived = segment.is_active === false
            const isFav = favs.has(segment.id)

            return (
              <motion.div
                key={segment.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.02 }}
                onClick={() => router.push(`/segments/${segment.id}`)}
                className={`bg-white border rounded-xl transition-all group cursor-pointer ${
                  archived
                    ? 'border-gray-200 opacity-75'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center px-5 py-4">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFav(segment.id)
                    }}
                    className={`p-1.5 rounded-md mr-2 transition-colors ${
                      isFav
                        ? 'text-amber-500 hover:text-amber-600'
                        : 'text-gray-300 hover:text-gray-400'
                    }`}
                    title={isFav ? 'Desfavoritar' : 'Favoritar'}
                  >
                    <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                  </button>

                  <div
                    className={`w-10 h-10 rounded-lg ${iconConfig.bg} flex items-center justify-center mr-4 flex-shrink-0`}
                  >
                    <Icon className={`w-5 h-5 ${iconConfig.color}`} />
                  </div>

                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900">{segment.name}</h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          segment.segment_type === 'dynamic'
                            ? 'bg-blue-50 text-blue-600'
                            : segment.segment_type === 'rfm'
                            ? 'bg-purple-50 text-purple-600'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {segment.segment_type === 'dynamic'
                          ? 'Dinâmico'
                          : segment.segment_type === 'rfm'
                          ? 'RFM'
                          : 'Estático'}
                      </span>
                      {archived && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">
                          Arquivado
                        </span>
                      )}
                    </div>
                    {segment.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {segment.description}
                      </p>
                    )}
                  </div>

                  <div className="text-right mr-4">
                    <p className="text-lg font-bold text-gray-900">{formatNumber(count)}</p>
                    <p className="text-[10px] text-gray-400">contatos</p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        router.push(`/segments/${segment.id}`)
                      }}
                      className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                      title="Ver segmento"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setMenuOpen(menuOpen === segment.id ? null : segment.id)
                        }}
                        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {menuOpen === segment.id && (
                        <div
                          className="absolute right-0 top-10 z-20 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => {
                              setMenuOpen(null)
                              router.push(`/segments/${segment.id}`)
                            }}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
                          >
                            <Eye className="w-4 h-4" />
                            Ver segmento
                          </button>
                          <button
                            onClick={() => {
                              setMenuOpen(null)
                              router.push(`/segments/new?edit=${segment.id}`)
                            }}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
                          >
                            <SlidersHorizontal className="w-4 h-4" />
                            Editar condições
                          </button>
                          <button
                            onClick={() => handleArchive(segment.id, !archived)}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
                          >
                            {archived ? (
                              <>
                                <ArchiveRestore className="w-4 h-4" />
                                Restaurar
                              </>
                            ) : (
                              <>
                                <Archive className="w-4 h-4" />
                                Arquivar
                              </>
                            )}
                          </button>
                          <div className="border-t border-gray-100 my-1" />
                          <button
                            onClick={() => handleDelete(segment.id)}
                            disabled={deleting === segment.id}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                            {deleting === segment.id ? 'Excluindo…' : 'Excluir'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
