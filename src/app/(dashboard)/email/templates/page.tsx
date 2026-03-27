'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores'
import {
  Mail, Search, Plus, Pencil, Trash2, Loader2,
} from 'lucide-react'

interface Template {
  id: string
  name: string
  category: string
  thumbnail_url?: string
  updated_at: string
  created_at: string
}

const categoryLabels: Record<string, string> = {
  marketing: 'Marketing',
  transactional: 'Transacional',
  notification: 'Notificação',
  custom: 'Personalizado',
}

const categoryColors: Record<string, string> = {
  marketing: 'bg-brand-50 text-brand-700',
  transactional: 'bg-emerald-50 text-emerald-700',
  notification: 'bg-amber-50 text-amber-700',
  custom: 'bg-gray-100 text-gray-600',
}

export default function EmailTemplatesPage() {
  const router = useRouter()
  const { user } = useAuthStore()
  const [templates, setTemplates] = useState<Template[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchTemplates = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/email/templates')
      const data = await res.json()
      if (data.success) setTemplates(data.templates || [])
    } catch (err) {
      console.error('Error fetching templates:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este template?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/email/templates/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setTemplates(prev => prev.filter(t => t.id !== id))
      }
    } catch (err) {
      console.error('Error deleting template:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const filtered = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Templates de Email</h1>
          <p className="text-sm text-gray-500 mt-1">
            Crie e gerencie os templates para suas campanhas de email
          </p>
        </div>
        <button
          onClick={() => router.push('/email/templates/new')}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Criar Template
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar templates..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-200 rounded-lg">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Mail className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">
            {search ? 'Nenhum template encontrado' : 'Nenhum template criado'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {search
              ? 'Tente ajustar sua busca'
              : 'Comece criando seu primeiro template de email'}
          </p>
          {!search && (
            <button
              onClick={() => router.push('/email/templates/new')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-lg hover:bg-brand-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Criar Template
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(template => (
            <div
              key={template.id}
              className="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow relative group"
              onMouseEnter={() => setHoveredId(template.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {/* Thumbnail */}
              <div className="h-40 bg-gray-100 rounded-t-lg flex items-center justify-center">
                {template.thumbnail_url ? (
                  <img
                    src={template.thumbnail_url}
                    alt={template.name}
                    className="w-full h-full object-cover rounded-t-lg"
                  />
                ) : (
                  <Mail className="w-12 h-12 text-gray-300" />
                )}
              </div>

              {/* Content */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">
                    {template.name}
                  </h3>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full shrink-0 ${
                      categoryColors[template.category] || categoryColors.custom
                    }`}
                  >
                    {categoryLabels[template.category] || template.category}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  Atualizado em{' '}
                  {new Date(template.updated_at || template.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>

              {/* Hover Actions */}
              {hoveredId === template.id && (
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  <button
                    onClick={() => router.push(`/email/templates/${template.id}/edit`)}
                    className="p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4 text-gray-600" />
                  </button>
                  <button
                    onClick={() => handleDelete(template.id)}
                    disabled={deletingId === template.id}
                    className="p-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-red-50 transition-colors"
                    title="Excluir"
                  >
                    {deletingId === template.id ? (
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 text-red-500" />
                    )}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
