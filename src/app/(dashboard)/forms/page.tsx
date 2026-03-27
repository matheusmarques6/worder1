'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  Plus, FileText, Users, Settings,
  Loader2, Search, Trash2, Copy, ExternalLink,
  CheckCircle, Clock, Archive, MoreVertical,
  Zap, X, Code,
} from 'lucide-react'

interface Form {
  id: string
  name: string
  slug: string
  description: string | null
  type?: 'popup' | 'embedded' | 'landing'
  status: 'draft' | 'published' | 'archived'
  submissions_count: number
  views_count: number
  pipeline: { id: string; name: string; color: string } | null
  facebook_pixel_id: string | null
  google_ads_id: string | null
  created_at: string
  updated_at: string
}

const statusConfig: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  draft: { label: 'Rascunho', className: 'bg-yellow-100 text-yellow-700', icon: Clock },
  published: { label: 'Ativo', className: 'bg-green-100 text-green-700', icon: CheckCircle },
  archived: { label: 'Inativo', className: 'bg-gray-100 text-gray-600', icon: Archive },
}

const typeConfig: Record<string, { label: string; className: string }> = {
  popup: { label: 'Popup', className: 'bg-purple-100 text-purple-700' },
  embedded: { label: 'Embedded', className: 'bg-blue-100 text-blue-700' },
  landing: { label: 'Landing', className: 'bg-green-100 text-green-700' },
}

export default function FormsPage() {
  const [forms, setForms] = useState<Form[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newFormName, setNewFormName] = useState('')
  const [newFormDescription, setNewFormDescription] = useState('')
  const [newFormType, setNewFormType] = useState<'popup' | 'embedded' | 'landing'>('embedded')
  const [creating, setCreating] = useState(false)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [embedModalForm, setEmbedModalForm] = useState<Form | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const fetchForms = useCallback(async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/forms')
      if (res.ok) {
        const data = await res.json()
        setForms(data.forms || [])
      }
    } catch (error) {
      console.error('Error fetching forms:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

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
        body: JSON.stringify({ name: newFormName, description: newFormDescription, type: newFormType }),
      })
      if (res.ok) {
        const data = await res.json()
        setForms(prev => [data.form, ...prev])
        setShowCreateModal(false)
        setNewFormName('')
        setNewFormDescription('')
        setNewFormType('embedded')
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
        body: JSON.stringify({ name: `${form.name} (cópia)`, description: form.description }),
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

  const getEmbedCode = (form: Form) => {
    const formType = form.type || 'embedded'
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://worder1.vercel.app'
    if (formType === 'popup') {
      return `<script src="${baseUrl}/embed/${form.id}.js"></script>`
    }
    return `<div data-worder-form="${form.id}"></div>\n<script src="${baseUrl}/embed/${form.id}.js"></script>`
  }

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCode(key)
    setTimeout(() => setCopiedCode(null), 2000)
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
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Criar Formulário
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
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
        />
      </div>

      {/* Forms Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : filteredForms.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-200 border-dashed"
        >
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhum formulario criado</h3>
          <p className="text-gray-500 text-center max-w-md mb-6">
            Crie seu primeiro formulario para captar leads e enviar eventos para Facebook e Google Ads
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Criar Formulário
          </button>
        </motion.div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Formulario</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Views</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Leads</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Conversão</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredForms.map((form) => {
                const statusInfo = statusConfig[form.status] || statusConfig.draft
                const StatusIcon = statusInfo.icon
                const formType = form.type || 'embedded'
                const typeInfo = typeConfig[formType] || typeConfig.embedded

                return (
                  <tr key={form.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-orange-500" />
                        </div>
                        <div>
                          <Link href={`/forms/${form.id}`} className="font-medium text-gray-900 hover:text-orange-600 transition-colors">
                            {form.name}
                          </Link>
                          {form.description && (
                            <p className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">{form.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            {form.pipeline && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                                <Zap className="w-2.5 h-2.5" />
                                {form.pipeline.name}
                              </span>
                            )}
                            {form.facebook_pixel_id && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">FB Pixel</span>
                            )}
                            {form.google_ads_id && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600">Google Ads</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${typeInfo.className}`}>
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.className}`}>
                        <StatusIcon className="w-3 h-3" />
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="font-medium text-gray-700">{form.views_count.toLocaleString()}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className="font-semibold text-orange-600">{form.submissions_count.toLocaleString()}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span className={`font-medium ${conversionRate(form) > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {conversionRate(form).toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {/* Embed code button */}
                        <button
                          onClick={() => setEmbedModalForm(form)}
                          title="Código de Incorporação"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                        >
                          <Code className="w-4 h-4" />
                        </button>

                        {/* More menu */}
                        <div className="relative">
                          <button
                            onClick={() => setActiveMenu(activeMenu === form.id ? null : form.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                          {activeMenu === form.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setActiveMenu(null)} />
                              <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1">
                                <Link
                                  href={`/forms/${form.id}`}
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                                >
                                  <Settings className="w-4 h-4" />
                                  Editar
                                </Link>
                                <Link
                                  href={`/forms/${form.id}/submissions`}
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                                >
                                  <Users className="w-4 h-4" />
                                  Submissions
                                </Link>
                                {form.status === 'published' && (
                                  <a
                                    href={`/embed/${form.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                    Visualizar
                                  </a>
                                )}
                                <button
                                  onClick={() => { duplicateForm(form); setActiveMenu(null) }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                                >
                                  <Copy className="w-4 h-4" />
                                  Duplicar
                                </button>
                                <button
                                  onClick={() => { deleteForm(form.id); setActiveMenu(null) }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Deletar
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-md"
            >
              <button onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Novo Formulário</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome do Formulário</label>
                  <input
                    type="text"
                    value={newFormName}
                    onChange={(e) => setNewFormName(e.target.value)}
                    placeholder="Ex: Diagnóstico Gratuito"
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && createForm()}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo de Formulário</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.entries(typeConfig) as [string, { label: string; className: string }][]).map(([key, cfg]) => (
                      <button
                        key={key}
                        onClick={() => setNewFormType(key as 'popup' | 'embedded' | 'landing')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                          newFormType === key
                            ? 'border-orange-400 bg-orange-50 text-orange-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {cfg.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Descrição (opcional)</label>
                  <textarea
                    value={newFormDescription}
                    onChange={(e) => setNewFormDescription(e.target.value)}
                    placeholder="Descreva o objetivo do formulário..."
                    rows={2}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-200 resize-none"
                  />
                </div>
                <button
                  onClick={createForm}
                  disabled={!newFormName.trim() || creating}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-100 disabled:text-gray-400 text-white rounded-xl font-medium transition-colors"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {creating ? 'Criando...' : 'Criar Formulário'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Embed Code Modal */}
      <AnimatePresence>
        {embedModalForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEmbedModalForm(null)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-lg"
            >
              <button onClick={() => setEmbedModalForm(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center">
                  <Code className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Código de Incorporação</h3>
                  <p className="text-sm text-gray-500">{embedModalForm.name}</p>
                </div>
              </div>

              {embedModalForm.status !== 'published' && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-700">Publique o formulário para que o embed funcione.</p>
                </div>
              )}

              <div className="space-y-4">
                {/* Script embed code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {(embedModalForm.type || 'embedded') === 'popup' ? 'Código Popup' : 'Código Embedded'}
                  </label>
                  <div className="relative">
                    <pre className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap font-mono">
                      {getEmbedCode(embedModalForm)}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(getEmbedCode(embedModalForm), 'embed')}
                      className="absolute top-2 right-2 p-1.5 bg-white border border-gray-200 hover:border-gray-300 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      {copiedCode === 'embed' ? <CheckCircle className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Direct link */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Link Direto</label>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={typeof window !== 'undefined' ? `${window.location.origin}/embed/${embedModalForm.id}` : `https://worder1.vercel.app/embed/${embedModalForm.id}`}
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 font-mono"
                    />
                    <button
                      onClick={() => copyToClipboard(
                        typeof window !== 'undefined' ? `${window.location.origin}/embed/${embedModalForm.id}` : `https://worder1.vercel.app/embed/${embedModalForm.id}`,
                        'link'
                      )}
                      className="p-2 bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      {copiedCode === 'link' ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
