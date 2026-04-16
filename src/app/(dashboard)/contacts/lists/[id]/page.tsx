'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Search,
  Plus,
  X,
  UserPlus,
  Users,
  Loader2,
  Trash2,
  Mail,
  Phone,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface List {
  id: string
  name: string
  description: string | null
  color: string
  member_count: number
  created_at: string
}

interface Member {
  contact_id: string
  added_at: string
  contact: {
    id: string
    email: string | null
    first_name: string | null
    last_name: string | null
    phone: string | null
  } | null
}

interface Contact {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
}

export default function ListDetailPage() {
  const params = useParams()
  const router = useRouter()
  const listId = String(params.id)

  const [list, setList] = useState<List | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2200)
  }

  const load = useCallback(async () => {
    try {
      const [listRes, membersRes] = await Promise.all([
        fetch(`/api/lists/${listId}`),
        fetch(`/api/lists/${listId}/members?limit=500`),
      ])
      if (listRes.ok) {
        const d = await listRes.json()
        setList(d.list)
      }
      if (membersRes.ok) {
        const d = await membersRes.json()
        setMembers(d.members || [])
      }
    } finally {
      setLoading(false)
    }
  }, [listId])

  useEffect(() => { load() }, [load])

  const filteredMembers = members.filter((m) => {
    if (!search) return true
    const c = m.contact
    if (!c) return false
    const text = `${c.first_name || ''} ${c.last_name || ''} ${c.email || ''} ${c.phone || ''}`.toLowerCase()
    return text.includes(search.toLowerCase())
  })

  const handleRemove = async (contactId: string) => {
    if (!confirm('Remover este contato da lista?')) return
    const res = await fetch(`/api/lists/${listId}/members?contact_id=${contactId}`, { method: 'DELETE' })
    if (res.ok) {
      setMembers((prev) => prev.filter((m) => m.contact_id !== contactId))
      setList((prev) => (prev ? { ...prev, member_count: prev.member_count - 1 } : prev))
      showToast('Contato removido')
    } else {
      showToast('Erro ao remover', 'error')
    }
  }

  const handleDeleteList = async () => {
    if (!confirm(`Excluir a lista "${list?.name}"? Esta ação não pode ser desfeita.`)) return
    const res = await fetch(`/api/lists/${listId}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/contacts/lists')
    } else {
      showToast('Erro ao excluir lista', 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!list) {
    return (
      <div className="p-8 text-center text-gray-500">Lista não encontrada.</div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {toast && (
        <div
          className={cn(
            'fixed top-20 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium',
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          )}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/contacts/lists"
            className="p-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft size={18} className="text-gray-500" />
          </Link>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${list.color}15` }}
          >
            <Users size={22} style={{ color: list.color }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{list.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {list.member_count.toLocaleString('pt-BR')} contatos
              {list.description && ` · ${list.description}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDeleteList}
            className="px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
          >
            Excluir lista
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium"
          >
            <UserPlus size={16} />
            Adicionar contatos
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nome, email ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
        />
      </div>

      {/* Members */}
      {filteredMembers.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-12 text-center">
          <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {members.length === 0 ? 'Nenhum contato nesta lista ainda.' : 'Nenhum resultado para a busca.'}
          </p>
          {members.length === 0 && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-orange-500 hover:text-orange-600"
            >
              <Plus size={14} /> Adicionar primeiro contato
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Contato</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Email</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Telefone</th>
                <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Adicionado</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredMembers.map((m) => {
                const c = m.contact
                if (!c) return null
                const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email?.split('@')[0] || 'Sem nome'
                return (
                  <tr key={m.contact_id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white text-[11px] font-bold flex items-center justify-center">
                          {name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-gray-900">{name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {c.email && (
                        <span className="inline-flex items-center gap-1">
                          <Mail size={12} className="text-gray-400" />
                          {c.email}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {c.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={12} className="text-gray-400" />
                          {c.phone}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(m.added_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRemove(m.contact_id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-50 transition-all"
                        title="Remover da lista"
                      >
                        <Trash2 size={14} className="text-gray-400 hover:text-red-500" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add members modal */}
      {showAddModal && (
        <AddMembersModal
          listId={listId}
          existingIds={new Set(members.map((m) => m.contact_id))}
          onClose={() => setShowAddModal(false)}
          onAdded={(count) => {
            showToast(`${count} ${count === 1 ? 'contato adicionado' : 'contatos adicionados'}`)
            load()
          }}
        />
      )}
    </div>
  )
}

// ================================================================
// Add members modal (busca + multi-select)
// ================================================================
function AddMembersModal({
  listId,
  existingIds,
  onClose,
  onAdded,
}: {
  listId: string
  existingIds: Set<string>
  onClose: () => void
  onAdded: (count: number) => void
}) {
  const [search, setSearch] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const doSearch = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/contacts?search=${encodeURIComponent(q)}&limit=50`)
      if (res.ok) {
        const d = await res.json()
        setContacts(d.contacts || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => doSearch(search), 300)
    return () => clearTimeout(t)
  }, [search, doSearch])

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const handleAdd = async () => {
    if (selected.size === 0) return
    setSaving(true)
    try {
      const res = await fetch(`/api/lists/${listId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_ids: Array.from(selected) }),
      })
      if (res.ok) {
        const d = await res.json()
        onAdded(d.added || 0)
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Adicionar contatos à lista</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {selected.size} selecionados
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contatos..."
              autoFocus
              className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">
              Nenhum contato encontrado
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {contacts.map((c) => {
                const inList = existingIds.has(c.id)
                const isSelected = selected.has(c.id)
                const name = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email?.split('@')[0] || 'Sem nome'
                return (
                  <button
                    key={c.id}
                    disabled={inList}
                    onClick={() => toggle(c.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      inList ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                    )}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                        inList
                          ? 'bg-emerald-500 border-emerald-500'
                          : isSelected
                          ? 'bg-orange-500 border-orange-500'
                          : 'border-gray-300'
                      )}
                    >
                      {(inList || isSelected) && <Check size={12} className="text-white" />}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                      {name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                      <p className="text-xs text-gray-500 truncate">{c.email || c.phone}</p>
                    </div>
                    {inList && (
                      <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        Já na lista
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleAdd}
            disabled={saving || selected.size === 0}
            className="px-4 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Adicionar {selected.size > 0 && `(${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  )
}
