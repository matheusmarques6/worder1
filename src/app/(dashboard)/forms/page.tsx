'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  Plus, FileText, Eye, Users, BarChart3, Settings,
  Loader2, Search, Trash2, Copy, ExternalLink,
  CheckCircle, Clock, Archive, MoreVertical,
  Zap, Globe, X,
} from 'lucide-react'
import { useStoreStore } from '@/stores'

interface Form {
  id: string
  name: string
  slug: string
  description: string | null
  status: 'draft' | 'published' | 'archived'
  submissions_count: number
  views_count: number
  pipeline: { id: string; name: string; color: string } | null
  facebook_pixel_id: string | null
  google_ads_id: string | null
  created_at: string
  updated_at: string
}

const statusLabels: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: 'Rascunho', color: 'text-yellow-400 bg-yellow-500/10', icon: Clock },
  published: { label: 'Publicado', color: 'text-green-400 bg-green-500/10', icon: CheckCircle },
  archived: { label: 'Arquivado', color: 'text-gray-500 bg-gray-300/10', icon: Archive },
}

export default function FormsPage() {
  const { currentStore } = useStoreStore()
  const [forms, setForms] = useState<Form[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newFormName, setNewFormName] = useState('')
  const [newFormDescription, setNewFormDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)

  const fetchForms = useCallback(async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (currentStore?.id) {
        params.append('storeId', currentStore.id)
      }
      const res = await fetch(`/api/forms?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setForms(data.forms || [])
      }
    } catch (error) {
      console.error('Error fetching forms:', error)
    } finally {
      setIsLoading(false)
    }
  }, [currentStore])

  useEffect(() => {
    fetchForms()
  }, [fetchForms])

  const createForm = async () => {
    if (!newFormName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFormName,
          description: newFormDescription,
          store_id: currentStore?.id || null,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setForms(prev => [data.form, ...prev])
        setShowCreateModal(false)
        setNewFormName('')
        setNewFormDescription('')
        // Navigate to form builder
        window.location.href = `/forms/${data.form.id}`
      }
    } catch (error) {
      console.error('Error creating form:', error)
    } finally {
      setCreating(false)
    }
  }

  const deleteForm = async (formId: string) => {
    if (!confirm('Tem certeza que deseja deletar este formulario?')) return
    try {
      const res = await fetch(`/api/forms/${formId}`, { method: 'DELETE' })
      if (res.ok) {
        setForms(prev => prev.filter(f => f.id !== formId))
      }
    } catch (error) {
      console.error('Error deleting form:', error)
    }
  }

  const duplicateForm = async (form: Form) => {
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${form.name} (cópia)`,
          description: form.description,
          store_id: currentStore?.id || null,
        }),
      })
      if (res.ok) {
        fetchForms()
      }
    } catch (error) {
      console.error('Error duplicating form:', error)
    }
  }

  const filteredForms = forms.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const conversionRate = (form: Form) => {
    if (form.views_count === 0) return 0
    return ((form.submissions_count / form.views_count) * 100)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Formularios</h1>
          <p className="text-gray-500 mt-1">Crie formularios para captar leads e enviar eventos para suas plataformas de ads</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Formulario
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar formularios..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-white placeholder:text-gray-400 focus:outline-none focus:border-primary-500"
        />
      </div>

      {/* Forms Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
        </div>
      ) : filteredForms.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-2xl border border-gray-200/30 border-dashed"
        >
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-gray-500" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhum formulario criado</h3>
          <p className="text-gray-500 text-center max-w-md mb-6">
            Crie seu primeiro formulario para captar leads e enviar eventos para Facebook e Google Ads
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Criar Formulario
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredForms.map((form) => {
            const statusInfo = statusLabels[form.status]
            const StatusIcon = statusInfo.icon
            return (
              <motion.div
                key={form.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative bg-white border border-gray-200 rounded-xl p-5 hover:border-gray-300 transition-all group"
              >
                {/* Status badge */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${statusInfo.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusInfo.label}
                  </span>

                  {/* Menu */}
                  <div className="relative">
                    <button
                      onClick={() => setActiveMenu(activeMenu === form.id ? null : form.id)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-gray-100 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {activeMenu === form.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-xl z-20 py-1">
                          <Link
                            href={`/forms/${form.id}`}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-white hover:bg-gray-100"
                          >
                            <Settings className="w-4 h-4" />
                            Editar
                          </Link>
                          <Link
                            href={`/forms/${form.id}/submissions`}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-white hover:bg-gray-100"
                          >
                            <Users className="w-4 h-4" />
                            Submissions
                          </Link>
                          {form.status === 'published' && (
                            <a
                              href={`/embed/${form.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-white hover:bg-gray-100"
                            >
                              <ExternalLink className="w-4 h-4" />
                              Visualizar
                            </a>
                          )}
                          <button
                            onClick={() => { duplicateForm(form); setActiveMenu(null) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-white hover:bg-gray-100"
                          >
                            <Copy className="w-4 h-4" />
                            Duplicar
                          </button>
                          <button
                            onClick={() => { deleteForm(form.id); setActiveMenu(null) }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-4 h-4" />
                            Deletar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Form info */}
                <Link href={`/forms/${form.id}`} className="block">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-brand-600 transition-colors">
                    {form.name}
                  </h3>
                  {form.description && (
                    <p className="text-sm text-gray-500 line-clamp-2 mb-4">{form.description}</p>
                  )}
                </Link>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-200">
                  <div>
                    <p className="text-xs text-gray-400">Views</p>
                    <p className="text-lg font-bold text-white">{form.views_count}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Leads</p>
                    <p className="text-lg font-bold text-brand-600">{form.submissions_count}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Conversao</p>
                    <p className="text-lg font-bold text-green-400">{conversionRate(form).toFixed(1)}%</p>
                  </div>
                </div>

                {/* Integrations badges */}
                <div className="flex items-center gap-2 mt-3">
                  {form.pipeline && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                      <Zap className="w-3 h-3" />
                      {form.pipeline.name}
                    </span>
                  )}
                  {form.facebook_pixel_id && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400">
                      FB Pixel
                    </span>
                  )}
                  {form.google_ads_id && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400">
                      Google Ads
                    </span>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Create Form Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-2xl border border-gray-200 p-6 w-full max-w-md"
            >
              <button onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Novo Formulario</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-2">Nome do Formulario</label>
                  <input
                    type="text"
                    value={newFormName}
                    onChange={(e) => setNewFormName(e.target.value)}
                    placeholder="Ex: Diagnostico Gratuito"
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-white placeholder:text-gray-400 focus:outline-none focus:border-primary-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-2">Descricao (opcional)</label>
                  <textarea
                    value={newFormDescription}
                    onChange={(e) => setNewFormDescription(e.target.value)}
                    placeholder="Descreva o objetivo do formulario..."
                    rows={3}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-white placeholder:text-gray-400 focus:outline-none focus:border-primary-500 resize-none"
                  />
                </div>
                <button
                  onClick={createForm}
                  disabled={!newFormName.trim() || creating}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl font-medium transition-colors"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {creating ? 'Criando...' : 'Criar Formulario'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
