'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Target, Plus, Users, ShoppingCart, Heart, AlertTriangle, Star, Clock, UserMinus, TrendingDown, Loader2, Trash2, Search } from 'lucide-react'

interface Segment {
  id: string
  name: string
  description?: string
  conditions: any[]
  contact_count?: number
  created_at: string
}

const presets = [
  { name: 'Engajados 30d', description: 'Abriram email ou compraram nos últimos 30 dias', icon: Heart, color: 'text-emerald-600 bg-emerald-50', conditions: [{ field: 'last_order_at', operator: 'greater_than', value: new Date(Date.now() - 30*86400000).toISOString() }] },
  { name: 'Não Engajados 90d', description: 'Sem interação nos últimos 90 dias', icon: UserMinus, color: 'text-gray-600 bg-gray-100', conditions: [{ field: 'last_order_at', operator: 'less_than', value: new Date(Date.now() - 90*86400000).toISOString() }] },
  { name: 'Recorrentes 2+', description: 'Clientes com 2 ou mais pedidos', icon: TrendingDown, color: 'text-blue-600 bg-blue-50', conditions: [{ field: 'total_orders', operator: 'greater_than', value: 1 }] },
  { name: 'Novos 7d', description: 'Criados nos últimos 7 dias', icon: Clock, color: 'text-brand-600 bg-brand-50', conditions: [{ field: 'created_at', operator: 'greater_than', value: new Date(Date.now() - 7*86400000).toISOString() }] },
  { name: 'Nunca Comprou', description: 'Contatos sem nenhum pedido', icon: ShoppingCart, color: 'text-amber-600 bg-amber-50', conditions: [{ field: 'total_orders', operator: 'equals', value: 0 }] },
  { name: 'Risco Churn 60d', description: 'Compraram antes mas sem atividade em 60 dias', icon: AlertTriangle, color: 'text-red-600 bg-red-50', conditions: [{ field: 'total_orders', operator: 'greater_than', value: 0 }, { field: 'last_order_at', operator: 'less_than', value: new Date(Date.now() - 60*86400000).toISOString() }] },
  { name: 'VIP >R$500', description: 'Clientes que gastaram mais de R$500', icon: Star, color: 'text-amber-600 bg-amber-50', conditions: [{ field: 'total_spent', operator: 'greater_than', value: 500 }] },
  { name: 'Abandono Carrinho', description: 'Abandonaram carrinho recentemente', icon: ShoppingCart, color: 'text-orange-600 bg-orange-50', conditions: [{ field: 'source', operator: 'equals', value: 'abandoned_cart' }] },
]

export default function SegmentsPage() {
  const router = useRouter()
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { loadSegments() }, [])

  const loadSegments = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/segments')
      if (res.ok) {
        const data = await res.json()
        setSegments(data.segments || [])
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const createFromPreset = async (preset: typeof presets[0]) => {
    try {
      const res = await fetch('/api/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: preset.name, description: preset.description, conditions: preset.conditions }),
      })
      if (res.ok) loadSegments()
    } catch (err) { console.error(err) }
  }

  const deleteSegment = async (id: string) => {
    if (!confirm('Excluir este segmento?')) return
    try {
      await fetch(`/api/segments/${id}`, { method: 'DELETE' })
      loadSegments()
    } catch (err) { console.error(err) }
  }

  const filtered = segments.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Segmentos</h1>
          <p className="text-sm text-gray-500 mt-1">Agrupe contatos por comportamento e características</p>
        </div>
        <button
          onClick={() => {
            const name = prompt('Nome do segmento:')
            if (name) {
              fetch('/api/segments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, conditions: [] }),
              }).then(() => loadSegments())
            }
          }}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Criar Segmento
        </button>
      </div>

      {/* Segments Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
        <div className="p-4 border-b border-gray-200">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar segmentos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-gray-300 rounded-lg placeholder:text-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Target className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600">Nenhum segmento criado</p>
            <p className="text-xs text-gray-400 mt-1">Crie segmentos ou use os prontos para usar abaixo</p>
          </div>
        ) : (
          <table className="w-full">
            <thead><tr className="bg-gray-50">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Condições</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Criado em</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
            </tr></thead>
            <tbody>
              {filtered.map((seg) => (
                <tr key={seg.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">{seg.name}</p>
                    {seg.description && <p className="text-xs text-gray-500 mt-0.5">{seg.description}</p>}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{seg.conditions?.length || 0} condições</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{new Date(seg.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => deleteSegment(seg.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Presets */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Prontos para Usar</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {presets.map((preset, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className={`w-10 h-10 rounded-lg ${preset.color} flex items-center justify-center mb-3`}>
                <preset.icon className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900">{preset.name}</h3>
              <p className="text-xs text-gray-500 mt-1 mb-3">{preset.description}</p>
              <button
                onClick={() => createFromPreset(preset)}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
              >
                Usar este segmento →
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
