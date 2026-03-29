'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Mail,
  Search,
  Plus,
  Loader2,
  Edit3,
  Trash2,
  MoreVertical,
  FileText,
  Tag,
} from 'lucide-react'
import Link from 'next/link'
import { useStoreStore } from '@/stores'

interface EmailTemplate {
  id: string
  name: string
  category: string
  subject?: string
  updated_at: string
  created_at: string
  thumbnail_url?: string
}

const categoryColors: Record<string, string> = {
  marketing: 'bg-blue-50 text-blue-700 border border-blue-200',
  transactional: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  notification: 'bg-amber-50 text-amber-700 border border-amber-200',
  custom: 'bg-gray-50 text-gray-700 border border-gray-200',
}

const categoryLabels: Record<string, string> = {
  marketing: 'Marketing',
  transactional: 'Transacional',
  notification: 'Notificação',
  custom: 'Personalizado',
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const { currentStore } = useStoreStore()

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (currentStore) params.set('store_id', currentStore?.id || '')
      if (search) params.set('search', search)
      const res = await fetch(`/api/email/templates?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || [])
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    } finally {
      setLoading(false)
    }
  }, [currentStore, search])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return
    try {
      const res = await fetch(`/api/email/templates/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== id))
      }
    } catch (err) {
      console.error('Failed to delete template:', err)
    }
    setActiveMenu(null)
  }

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Templates de Email</h1>
          <p className="text-sm text-gray-500 mt-1">
            Crie e gerencie seus templates de email
          </p>
        </div>
        <Link
          href="/email/templates/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Criar Template
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <FileText className="w-7 h-7 text-gray-400" />
          </div>
          <h3 className="text-base font-medium text-gray-500 mb-1">
            Nenhum template encontrado
          </h3>
          <p className="text-sm text-gray-400 mb-6">
            {search
              ? 'Tente ajustar sua busca'
              : 'Comece criando seu primeiro template de email'}
          </p>
          {!search && (
            <Link
              href="/email/templates/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Criar Template
            </Link>
          )}
        </div>
      )}

      {/* Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((template, i) => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="group bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow relative"
            >
              {/* Thumbnail */}
              <div className="h-40 bg-gray-100 flex items-center justify-center relative">
                {template.thumbnail_url ? (
                  <img
                    src={template.thumbnail_url}
                    alt={template.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Mail className="w-10 h-10 text-gray-300" />
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Link
                    href={`/email/templates/${template.id}/edit`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-900 text-sm font-medium rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                    Editar
                  </Link>
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {template.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                          categoryColors[template.category] || categoryColors.custom
                        }`}
                      >
                        <Tag className="w-3 h-3" />
                        {categoryLabels[template.category] || template.category}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      Atualizado em{' '}
                      {new Date(template.updated_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>

                  {/* Actions menu */}
                  <div className="relative">
                    <button
                      onClick={() =>
                        setActiveMenu(activeMenu === template.id ? null : template.id)
                      }
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {activeMenu === template.id && (
                      <div className="absolute right-0 top-8 z-10 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                        <Link
                          href={`/email/templates/${template.id}/edit`}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Edit3 className="w-4 h-4" />
                          Editar
                        </Link>
                        <button
                          onClick={() => handleDelete(template.id)}
                          className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                        >
                          <Trash2 className="w-4 h-4" />
                          Excluir
                        </button>
                      </div>
                    )}
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
