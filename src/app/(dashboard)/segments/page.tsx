'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Users,
  Search,
  Plus,
  Loader2,
  Zap,
  Heart,
  UserX,
  RefreshCw,
  UserPlus,
  ShoppingCart,
  AlertTriangle,
  Crown,
  ShoppingBag,
  MoreVertical,
  Edit3,
  Trash2,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { useStoreStore, useAuthStore } from '@/stores'

interface Segment {
  id: string
  name: string
  description?: string
  type: 'preset' | 'custom'
  count: number
  created_at: string
  updated_at: string
}

const presets = [
  {
    key: 'engaged_30d',
    name: 'Engajados 30d',
    description: 'Abriram ou clicaram em email nos últimos 30 dias',
    icon: Heart,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  {
    key: 'not_engaged_90d',
    name: 'Não Engajados 90d',
    description: 'Sem interação nos últimos 90 dias',
    icon: UserX,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
  },
  {
    key: 'recurring_2plus',
    name: 'Recorrentes 2+',
    description: 'Clientes com 2 ou mais compras',
    icon: RefreshCw,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  {
    key: 'new_7d',
    name: 'Novos 7d',
    description: 'Cadastrados nos últimos 7 dias',
    icon: UserPlus,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
  },
  {
    key: 'never_purchased',
    name: 'Nunca Comprou',
    description: 'Contatos que nunca realizaram uma compra',
    icon: ShoppingCart,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  {
    key: 'churn_risk_60d',
    name: 'Churn Risk 60d',
    description: 'Clientes inativos há mais de 60 dias',
    icon: AlertTriangle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
  {
    key: 'vip_500',
    name: 'VIP >R$500',
    description: 'Clientes com ticket médio acima de R$500',
    icon: Crown,
    color: 'text-brand-600',
    bg: 'bg-brand-50',
    border: 'border-brand-200',
  },
  {
    key: 'cart_abandonment',
    name: 'Abandono Carrinho',
    description: 'Abandonaram carrinho nos últimos 30 dias',
    icon: ShoppingBag,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
  },
]

const formatNumber = (n: number) => new Intl.NumberFormat('pt-BR').format(n)

export default function SegmentsPage() {
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const { currentStore } = useStoreStore()
  const { user } = useAuthStore()

  const fetchSegments = useCallback(async () => {
    if (!user?.organization_id) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('organization_id', user.organization_id)
      params.set('include_count', 'true')
      const res = await fetch(`/api/segments?${params}`)
      if (res.ok) {
        const data = await res.json()
        let segs = data.segments || []

        // Auto-seed default segments if none exist
        if (segs.length === 0) {
          await fetch('/api/segments/seed', { method: 'POST' })
          // Re-fetch after seeding
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

  useEffect(() => {
    fetchSegments()
  }, [fetchSegments])

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este segmento?')) return
    try {
      const res = await fetch(`/api/segments/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setSegments((prev) => prev.filter((s) => s.id !== id))
      }
    } catch (err) {
      console.error('Failed to delete segment:', err)
    }
    setActiveMenu(null)
  }

  const filteredSegments = segments.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Segmentos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Organize seus contatos em segmentos para campanhas direcionadas
          </p>
        </div>
        <Link
          href="/segments/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Criar Segmento
        </Link>
      </div>

      {/* Preset Cards */}
      <div>
        <h2 className="text-sm font-medium text-gray-700 mb-3">Segmentos Pré-definidos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {presets.map((preset, i) => {
            const Icon = preset.icon
            return (
              <motion.div
                key={preset.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`bg-white border ${preset.border} rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer group`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 ${preset.bg} rounded-full flex items-center justify-center flex-shrink-0`}
                  >
                    <Icon className={`w-4.5 h-4.5 ${preset.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{preset.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                      {preset.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar segmentos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      )}

      {/* Empty */}
      {!loading && filteredSegments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Users className="w-7 h-7 text-gray-400" />
          </div>
          <h3 className="text-base font-medium text-gray-500 mb-1">
            Nenhum segmento personalizado
          </h3>
          <p className="text-sm text-gray-400 mb-6">
            {search
              ? 'Tente ajustar sua busca'
              : 'Crie segmentos customizados para suas campanhas'}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && filteredSegments.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Segmento
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Tipo
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Contatos
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Atualizado
                  </th>
                  <th className="w-10 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredSegments.map((segment) => (
                  <tr
                    key={segment.id}
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{segment.name}</p>
                        {segment.description && (
                          <p className="text-xs text-gray-500 truncate max-w-xs">
                            {segment.description}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${
                          segment.type === 'preset'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-gray-50 text-gray-600 border border-gray-200'
                        }`}
                      >
                        {segment.type === 'preset' ? 'Pré-definido' : 'Personalizado'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-gray-900">{formatNumber(segment.count)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm text-gray-500">
                        {new Date(segment.updated_at).toLocaleDateString('pt-BR')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative">
                        <button
                          onClick={() =>
                            setActiveMenu(activeMenu === segment.id ? null : segment.id)
                          }
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {activeMenu === segment.id && (
                          <div className="absolute right-0 top-8 z-10 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                            <button className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left">
                              <Edit3 className="w-4 h-4" />
                              Editar
                            </button>
                            <button
                              onClick={() => handleDelete(segment.id)}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                            >
                              <Trash2 className="w-4 h-4" />
                              Excluir
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
