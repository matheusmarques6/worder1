'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Download, Search, Loader2 } from 'lucide-react'

interface OptRecord {
  id: string
  phone: string
  status: 'opted_in' | 'opted_out'
  opted_in_at?: string
  opted_out_at?: string
  opt_in_source: string
  opt_out_reason?: string
}

export function OptStatusTab({ organizationId }: { organizationId: string }) {
  const [items, setItems] = useState<OptRecord[]>([])
  const [stats, setStats] = useState({ total: 0, opted_in: 0, opted_out: 0, rate: '0' })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'opted_in' | 'opted_out'>('all')

  useEffect(() => { load() }, [organizationId, filter, search])

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ organizationId })
      if (filter !== 'all') params.append('status', filter)
      if (search) params.append('search', search)
      const res = await fetch(`/api/whatsapp/opt-status?${params}`)
      if (res.ok) {
        const d = await res.json()
        setItems(d.data || [])
        if (d.stats) setStats(d.stats)
      }
    } catch { /* */ }
    setLoading(false)
  }

  function exportCsv() {
    const csv = [
      ['Telefone', 'Status', 'Data Opt-in', 'Data Opt-out', 'Origem', 'Motivo'].join(','),
      ...items.map(i => [
        i.phone, i.status,
        i.opted_in_at || '', i.opted_out_at || '',
        i.opt_in_source, (i.opt_out_reason || '').replace(/,/g, ';'),
      ].join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `opt-status-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Opt-in / Opt-out</h3>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-green-600">Opt-in</p>
          <p className="text-2xl font-bold text-green-600">{stats.opted_in}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-red-600">Opt-out</p>
          <p className="text-2xl font-bold text-red-600">{stats.opted_out}</p>
          <p className="text-xs text-gray-500">Taxa: {stats.rate}%</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar telefone..." className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value as typeof filter)} className="px-3 py-2 border rounded-lg text-sm">
          <option value="all">Todos</option>
          <option value="opted_in">Opt-in</option>
          <option value="opted_out">Opt-out</option>
        </select>
        <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
          <Download className="w-4 h-4" /> CSV
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Nenhum registro encontrado</div>
      ) : (
        <div className="bg-white border rounded-xl divide-y">
          {items.map(i => (
            <div key={i.id} className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                {i.status === 'opted_in' ? <CheckCircle className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
                <div>
                  <p className="font-medium text-sm">{i.phone}</p>
                  <p className="text-xs text-gray-500">
                    {i.status === 'opted_in' ? `Opt-in em ${new Date(i.opted_in_at!).toLocaleDateString('pt-BR')}` : `Opt-out em ${new Date(i.opted_out_at!).toLocaleDateString('pt-BR')}`}
                    {' - '}{i.opt_in_source}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
