'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Users,
  Settings,
  Edit3,
  Loader2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Save,
} from 'lucide-react'
import { useAuthStore } from '@/stores'

interface Segment {
  id: string
  name: string
  description?: string
  segment_type: string
  contact_count: number
  rules?: any[]
  rules_logic?: string
  color?: string
  created_at: string
  updated_at?: string
}

interface Contact {
  id: string
  email: string
  first_name?: string
  last_name?: string
  phone?: string
  total_orders?: number
  total_spent?: number
  created_at: string
}

export default function SegmentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const segmentId = params.id as string
  const { user } = useAuthStore()

  const [segment, setSegment] = useState<Segment | null>(null)
  const [members, setMembers] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'members' | 'definition' | 'settings'>('members')
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [page, setPage] = useState(1)
  const [totalMembers, setTotalMembers] = useState(0)
  const pageSize = 50

  const fetchSegment = useCallback(async () => {
    if (!user?.organization_id || !segmentId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/segments?id=${segmentId}&organization_id=${user.organization_id}&include_count=true`)
      if (res.ok) {
        const data = await res.json()
        if (data.segment) {
          setSegment(data.segment)
          setEditName(data.segment.name)
          setEditDesc(data.segment.description || '')
          setTotalMembers(data.segment.contact_count || 0)
        }
      }
    } catch (err) {
      console.error('Failed to load segment:', err)
    } finally {
      setLoading(false)
    }
  }, [segmentId, user?.organization_id])

  const fetchMembers = useCallback(async () => {
    if (!segmentId) return
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      })
      const res = await fetch(`/api/segments/${segmentId}/members?${params}`)
      if (res.ok) {
        const data = await res.json()
        setMembers(data.contacts || [])
        setTotalMembers(data.pagination?.total || 0)
      }
    } catch {}
  }, [segmentId, page])

  useEffect(() => { fetchSegment() }, [fetchSegment])
  useEffect(() => { if (segment) fetchMembers() }, [segment, fetchMembers])

  const handleSave = async () => {
    if (!editName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/segments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: segmentId,
          name: editName.trim(),
          description: editDesc.trim() || null,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setSegment(data.segment)
      }
    } catch {} finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Excluir este segmento permanentemente?')) return
    try {
      await fetch(`/api/segments?id=${segmentId}`, { method: 'DELETE' })
      router.push('/segments')
    } catch {}
  }

  const handleCopyId = () => {
    navigator.clipboard.writeText(segmentId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!segment) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Segmento não encontrado</p>
        <Link href="/segments" className="text-brand-600 text-sm mt-2 inline-block">Voltar</Link>
      </div>
    )
  }

  const totalPages = Math.ceil(totalMembers / pageSize)

  const tabs = [
    { id: 'members' as const, label: `Membros (${totalMembers.toLocaleString('pt-BR')})` },
    { id: 'definition' as const, label: 'Definição' },
    { id: 'settings' as const, label: 'Configurações' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/segments" className="text-brand-600 text-sm flex items-center gap-1 hover:underline">
            <ArrowLeft className="w-4 h-4" />
            Segmentos
          </Link>
        </div>
        <button
          onClick={handleDelete}
          className="flex items-center gap-2 px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Excluir
        </button>
      </div>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{segment.name}</h1>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
            segment.segment_type === 'dynamic' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'
          }`}>
            {segment.segment_type === 'dynamic' ? 'Segmento Dinâmico' : 'Segmento Estático'}
          </span>
        </div>
        {segment.description && (
          <p className="text-sm text-gray-500 mt-1">{segment.description}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-500 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Members Tab */}
      {activeTab === 'members' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {members.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Nenhum membro neste segmento</p>
              <p className="text-gray-400 text-sm mt-1">As condições do segmento não correspondem a nenhum contato</p>
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">Contato</th>
                    <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">Email</th>
                    <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">Telefone</th>
                    <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">Pedidos</th>
                    <th className="text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider px-4 py-2.5">Adicionado</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`/contacts/${c.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                          {c.first_name || c.last_name ? `${c.first_name || ''} ${c.last_name || ''}`.trim() : c.email?.split('@')[0]}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{c.email || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{c.phone || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{c.total_orders || 0}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(c.created_at).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50/50">
                  <p className="text-xs text-gray-500">
                    {((page - 1) * pageSize + 1)}–{Math.min(page * pageSize, totalMembers)} de {totalMembers.toLocaleString('pt-BR')}
                  </p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                      className="p-1.5 rounded hover:bg-gray-200 text-gray-500 disabled:opacity-30">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-gray-600 px-2">Página {page} de {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                      className="p-1.5 rounded hover:bg-gray-200 text-gray-500 disabled:opacity-30">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Definition Tab */}
      {activeTab === 'definition' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Definição do Segmento</h2>
          <p className="text-sm text-gray-500">Condições que definem quais contatos pertencem a este segmento</p>

          {segment.rules && segment.rules.length > 0 ? (
            <div className="space-y-3 mt-4">
              {segment.rules.map((rule: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {i > 0 && (
                    <span className="text-xs font-semibold text-gray-500 bg-white px-2 py-0.5 rounded border">
                      {segment.rules_logic || 'AND'}
                    </span>
                  )}
                  <span className="text-sm font-medium text-gray-700">{rule.field}</span>
                  <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded border">{rule.operator}</span>
                  <span className="text-sm text-gray-900 font-medium">{String(rule.value)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4">Nenhuma condição definida</p>
          )}

          <div className="pt-4 border-t border-gray-200">
            <Link
              href={`/segments/new?edit=${segmentId}`}
              className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors w-fit"
            >
              <Edit3 className="w-4 h-4" />
              Editar Definição
            </Link>
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Detalhes</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Segmento</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full max-w-md border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
                className="w-full max-w-md border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Segment ID</label>
              <div className="flex items-center gap-2">
                <code className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 font-mono">
                  {segmentId.slice(0, 12)}...
                </code>
                <button
                  onClick={handleCopyId}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Copiar ID"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving || !editName.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </button>
            </div>
          </div>

          <div className="bg-white border border-red-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-red-700 mb-2">Zona de Perigo</h3>
            <p className="text-xs text-gray-500 mb-4">Excluir este segmento permanentemente.</p>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 text-sm transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Segmento
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
