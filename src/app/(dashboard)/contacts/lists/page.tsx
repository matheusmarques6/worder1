'use client'

// Static Contact Lists — Klaviyo/Omnisend style.
//
// Lists are MANUALLY managed audience sets (CSV import, form opt-in,
// integration). Dynamic rule-based audiences live under /segments.
// This page intentionally shows only contact_lists rows — it is the
// counterpart to /segments which targets customer_segments.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
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
  Archive,
  Upload,
  FileText,
  Sparkle,
} from '@phosphor-icons/react'
import { Loader2 } from 'lucide-react'
import { useAuthStore, useStoreStore } from '@/stores'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { NewListModal } from '@/components/lists/NewListModal'

interface ContactList {
  id: string
  name: string
  description?: string
  color?: string
  icon?: string
  source: 'manual' | 'csv_import' | 'form' | 'integration' | 'migrated_static_segment'
  source_metadata: Record<string, unknown>
  total_contacts: number
  is_archived: boolean
  organization_id: string
  store_id: string | null
  created_at: string
  updated_at: string
}

const SOURCE_LABEL: Record<ContactList['source'], string> = {
  manual: 'Manual',
  csv_import: 'CSV',
  form: 'Formulário',
  integration: 'Integração',
  migrated_static_segment: 'Migrado',
}

const formatNumber = (n: number) => new Intl.NumberFormat('pt-BR').format(n)

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  const diffMin = Math.round((Date.now() - t) / 60000)
  if (diffMin < 1) return 'agora mesmo'
  if (diffMin < 60) return `${diffMin}min atrás`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH}h atrás`
  const diffD = Math.round(diffH / 24)
  if (diffD < 30) return `${diffD}d atrás`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export default function ContactListsPage() {
  const [lists, setLists] = useState<ContactList[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | ContactList['source']>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const router = useRouter()
  const { user } = useAuthStore()
  const { currentStore } = useStoreStore()
  const hasHydrated = useStoreStore((s) => s._hasHydrated)
  const { confirm } = useConfirm()

  const fetchLists = useCallback(async () => {
    if (!user?.organization_id) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (currentStore?.id) params.set('store_id', currentStore.id)
      if (showArchived) params.set('include_archived', 'true')
      const res = await fetch(`/api/lists?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setLists(data.lists || [])
      }
    } catch (err) {
      console.error('Failed to fetch lists:', err)
    } finally {
      setLoading(false)
    }
  }, [user?.organization_id, currentStore?.id, showArchived])

  useEffect(() => {
    if (!hasHydrated) return
    fetchLists()
  }, [fetchLists, hasHydrated])

  async function handleArchive(id: string) {
    const ok = await confirm({
      title: 'Arquivar lista?',
      description: 'A lista some da visualização padrão mas você pode reativá-la depois. Os contatos não são removidos.',
      confirmLabel: 'Arquivar',
    })
    if (!ok) return
    await fetch(`/api/lists/${id}`, { method: 'DELETE' })
    setLists((prev) => prev.filter((l) => l.id !== id))
  }

  const filtered = lists.filter((l) => {
    const matchSearch = !search || l.name.toLowerCase().includes(search.toLowerCase())
    const matchSource = sourceFilter === 'all' || l.source === sourceFilter
    return matchSearch && matchSource
  })

  const totalContacts = lists.reduce((a, l) => a + (l.total_contacts || 0), 0)
  const fromImport = lists.filter((l) => l.source === 'csv_import').length
  const fromForms = lists.filter((l) => l.source === 'form').length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/contacts" className="p-2 rounded-lg hover:bg-gray-50 transition-colors">
            <ArrowLeft size={18} className="text-gray-500" />
          </Link>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <ListBullets size={22} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-display text-gray-900">Listas de contatos</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {lists.length} listas · {formatNumber(totalContacts)} contatos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/segments"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Sparkle size={14} />
            Segmentos dinâmicos
          </Link>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Nova lista
          </button>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Total de contatos</p>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(totalContacts)}</p>
        </div>
        <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Via importação</p>
          <p className="text-2xl font-bold text-gray-900">{fromImport}</p>
          <p className="text-xs text-gray-400 mt-0.5">Listas criadas por CSV</p>
        </div>
        <div className="bg-white/50 border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-500 mb-1">Via formulários</p>
          <p className="text-2xl font-bold text-gray-900">{fromForms}</p>
          <p className="text-xs text-gray-400 mt-0.5">Captados em forms</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
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
          {(['all', 'manual', 'csv_import', 'form', 'integration'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSourceFilter(t)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                sourceFilter === t ? 'bg-brand-500 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t === 'all' ? 'Todas' : SOURCE_LABEL[t]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowArchived((v) => !v)}
          className={`px-3 py-1.5 text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 ${
            showArchived ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Archive size={14} />
          {showArchived ? 'Ocultar arquivadas' : 'Mostrar arquivadas'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          hasAny={lists.length > 0}
          onNew={() => setShowNewModal(true)}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((list, i) => (
            <motion.div
              key={list.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.2) }}
              className="bg-white/50 border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center justify-between">
                <Link
                  href={`/contacts/lists/${list.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${list.color || '#F97316'}1A` }}
                  >
                    <ListBullets size={18} style={{ color: list.color || '#F97316' }} weight="fill" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900 truncate">{list.name}</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500 shrink-0">
                        {SOURCE_LABEL[list.source]}
                      </span>
                      {list.is_archived && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 shrink-0">
                          Arquivada
                        </span>
                      )}
                    </div>
                    {list.description && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{list.description}</p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Atualizada {formatRelative(list.updated_at)}
                    </p>
                  </div>
                </Link>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{formatNumber(list.total_contacts)}</p>
                    <p className="text-[10px] text-gray-400">contatos</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link href={`/contacts/lists/${list.id}`} className="p-1.5 rounded hover:bg-gray-100">
                      <PencilSimple size={14} className="text-gray-400" />
                    </Link>
                    <button
                      onClick={() => handleArchive(list.id)}
                      className="p-1.5 rounded hover:bg-red-50"
                      title="Arquivar lista"
                    >
                      <Trash size={14} className="text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <NewListModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreated={(id) => {
          setShowNewModal(false)
          // SPA navigation — full reload was wiping form state and
          // re-fetching the entire bundle.
          router.push(`/contacts/lists/${id}`)
        }}
      />
    </div>
  )
}

function EmptyState({ hasAny, onNew }: { hasAny: boolean; onNew: () => void }) {
  return (
    <div className="bg-white/50 border border-gray-200 rounded-xl p-10 text-center">
      <UsersThree size={32} className="text-gray-400 mx-auto mb-3" />
      <p className="text-sm text-gray-500 mb-6">
        {hasAny ? 'Nenhuma lista encontrada com esse filtro.' : 'Você ainda não criou nenhuma lista.'}
      </p>
      {!hasAny && (
        <div className="grid grid-cols-3 gap-3 max-w-2xl mx-auto">
          <button
            onClick={onNew}
            className="border border-gray-200 rounded-xl p-5 hover:border-brand-500 hover:bg-brand-50 transition-colors text-left group"
          >
            <Plus size={20} className="text-gray-400 group-hover:text-brand-500 mb-2" />
            <p className="font-medium text-gray-900 text-sm">Lista manual</p>
            <p className="text-xs text-gray-500 mt-1">Adicionar contatos um a um ou em lote</p>
          </button>
          <button
            onClick={onNew}
            className="border border-gray-200 rounded-xl p-5 hover:border-brand-500 hover:bg-brand-50 transition-colors text-left group"
          >
            <Upload size={20} className="text-gray-400 group-hover:text-brand-500 mb-2" />
            <p className="font-medium text-gray-900 text-sm">Importar CSV</p>
            <p className="text-xs text-gray-500 mt-1">Upload de planilha com contatos</p>
          </button>
          <Link
            href="/forms"
            className="border border-gray-200 rounded-xl p-5 hover:border-brand-500 hover:bg-brand-50 transition-colors text-left group block"
          >
            <FileText size={20} className="text-gray-400 group-hover:text-brand-500 mb-2" />
            <p className="font-medium text-gray-900 text-sm">Via formulário</p>
            <p className="text-xs text-gray-500 mt-1">Capturar contatos pelo site</p>
          </Link>
        </div>
      )}
    </div>
  )
}
