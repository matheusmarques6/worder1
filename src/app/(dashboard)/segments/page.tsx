'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Users,
  Search,
  Plus,
  Loader2,
  Heart,
  UserX,
  RefreshCw,
  UserPlus,
  ShoppingCart,
  AlertTriangle,
  Crown,
  ShoppingBag,
  MoreVertical,
  Trash2,
  ChevronRight,
  Eye,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores'

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

export default function SegmentsPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchSegments = useCallback(async () => {
    if (!user?.organization_id) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        organization_id: user.organization_id,
        include_count: 'true',
      })
      const res = await fetch(`/api/segments?${params}`)
      if (res.ok) {
        const data = await res.json()
        let segs = data.segments || []
        if (segs.length === 0) {
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
    } finally {
      setLoading(false)
    }
  }, [user?.organization_id])

  useEffect(() => { fetchSegments() }, [fetchSegments])

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este segmento?')) return
    setDeleting(id)
    try {
      await fetch(`/api/segments?id=${id}`, { method: 'DELETE' })
      setSegments(prev => prev.filter(s => s.id !== id))
    } catch {} finally {
      setDeleting(null)
      setMenuOpen(null)
    }
  }

  const filtered = segments.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  )

  const totalContacts = segments.reduce((sum, s) => sum + (s.contact_count || 0), 0)
  const dynamicCount = segments.filter(s => s.segment_type === 'dynamic').length

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
            {segments.length} segmentos · {formatNumber(totalContacts)} contatos
          </p>
        </div>
        <Link
          href="/segments/new"
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Criar Segmento
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar segmentos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        />
      </div>

      {/* Segments List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-gray-200">
          <Users className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Nenhum segmento encontrado</p>
          <p className="text-gray-400 text-sm mt-1">
            {search ? 'Tente outro termo' : 'Crie seu primeiro segmento'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((segment, i) => {
            const iconConfig = segmentIcons[segment.name] || defaultIcon
            const Icon = iconConfig.icon
            const count = segment.contact_count || 0

            return (
              <motion.div
                key={segment.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => router.push(`/segments/${segment.id}`)}
                className="bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all group cursor-pointer"
              >
                <div className="flex items-center px-5 py-4">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-lg ${iconConfig.bg} flex items-center justify-center mr-4 flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${iconConfig.color}`} />
                  </div>

                  {/* Name & Description */}
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{segment.name}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        segment.segment_type === 'dynamic'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {segment.segment_type === 'dynamic' ? 'Dinâmico' : 'Estático'}
                      </span>
                    </div>
                    {segment.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{segment.description}</p>
                    )}
                  </div>

                  {/* Count */}
                  <div className="text-right mr-4">
                    <p className="text-lg font-bold text-gray-900">{formatNumber(count)}</p>
                    <p className="text-[10px] text-gray-400">contatos</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/segments/${segment.id}`) }}
                      className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                      title="Ver segmento"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === segment.id ? null : segment.id) }}
                        className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {menuOpen === segment.id && (
                        <div className="absolute right-0 top-10 z-20 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setMenuOpen(null); router.push(`/segments/${segment.id}`) }}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
                          >
                            <Eye className="w-4 h-4" />
                            Ver Segmento
                          </button>
                          <button
                            onClick={() => handleDelete(segment.id)}
                            disabled={deleting === segment.id}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                          >
                            <Trash2 className="w-4 h-4" />
                            {deleting === segment.id ? 'Excluindo...' : 'Excluir'}
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
