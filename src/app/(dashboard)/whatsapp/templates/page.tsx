'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Plus, Search, RefreshCw, History, X, FileText, AlertTriangle, Pencil } from 'lucide-react'
import { useAuthStore } from '@/stores'
import {
  TemplateBuilder,
  type TemplateAccountOption,
  type TemplateSubmitPayload,
  type TemplateInitialValue,
} from '@/components/whatsapp/TemplateBuilder'
import { TemplateStatusBadge, type TemplateStatus } from '@/components/whatsapp/TemplateStatusBadge'
import { TemplateCategoryHistoryModal, type CategoryChange } from '@/components/whatsapp/TemplateCategoryHistoryModal'
import { authedFetch } from '@/lib/api/authed-fetch'

interface Template {
  id: string
  name: string
  language?: string
  category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  status?: TemplateStatus | string
  body?: string
  body_text?: string
  header_text?: string
  footer_text?: string
  buttons?: any[]
  content?: string
  use_count?: number
  created_at?: string
  components?: any[]
  rejection_reason?: string | null
  waba_id?: string | null
}

// Translate Meta's rejection reason codes to readable pt-BR text. When
// the value isn't a known code (Meta sometimes returns freeform text),
// show it as-is.
const REJECTION_REASONS: Record<string, string> = {
  ABUSIVE_CONTENT: 'Conteudo considerado abusivo pela Meta.',
  INVALID_FORMAT: 'Formato invalido. Revise variaveis, botoes e exemplos.',
  SCAM: 'Conteudo sinalizado como possivel golpe/fraude.',
  PROMOTIONAL: 'Conteudo promocional em categoria nao permitida.',
  TAG_CONTENT_MISMATCH: 'A categoria nao corresponde ao conteudo do template.',
  NONE: 'A Meta nao informou um motivo especifico.',
}

function formatRejectionReason(reason: string): string {
  if (!reason) return REJECTION_REASONS.NONE
  const key = reason.toUpperCase().replace(/\s+/g, '_')
  return REJECTION_REASONS[key] || reason
}

// Best-effort body preview from either the flat columns or the synced
// Meta `components` array.
function templatePreview(t: Template): string {
  if (t.body) return t.body
  if (t.body_text) return t.body_text
  if (Array.isArray(t.components)) {
    const body = t.components.find((c: any) => c?.type === 'BODY')
    if (body?.text) return body.text
  }
  if (t.content) return t.content
  return 'Sem conteudo'
}

export default function WhatsAppTemplatesPage() {
  const { user } = useAuthStore()
  const organizationId = user?.organization_id || ''

  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showBuilder, setShowBuilder] = useState(false)
  const [builderInitial, setBuilderInitial] = useState<TemplateInitialValue | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const [historyTemplate, setHistoryTemplate] = useState<Template | null>(null)
  const [historyData, setHistoryData] = useState<CategoryChange[]>([])
  const [accounts, setAccounts] = useState<TemplateAccountOption[]>([])

  async function fetchAccounts() {
    try {
      const res = await authedFetch(`/api/whatsapp/business-accounts`)
      if (!res.ok) return
      const text = await res.text()
      const data = text ? JSON.parse(text) : {}
      const list = data.accounts || data.data || []
      setAccounts(
        list.map((a: any) => ({
          id: a.id,
          phone_number: a.phone_number,
          phone_display_name: a.phone_display_name,
        })),
      )
    } catch (e) {
      console.error('Error fetching accounts:', e)
    }
  }

  async function fetchTemplates() {
    setLoading(true)
    try {
      const qs = organizationId ? `?organizationId=${organizationId}&status=` : ''
      const res = await fetch(`/api/whatsapp/templates${qs}`)
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || [])
      }
    } catch (e) {
      console.error('Error fetching templates:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
    fetchAccounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId])

  async function handleCreateTemplate(input: TemplateSubmitPayload) {
    setSubmitting(true)
    try {
      const res = await authedFetch('/api/whatsapp/cloud/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: input.accountId,
          name: input.name,
          language: input.language,
          category: input.category,
          components: input.components,
        }),
      })
      const text = await res.text()
      const data = text ? (() => { try { return JSON.parse(text) } catch { return { error: text.slice(0, 200) } } })() : {}
      if (res.ok) {
        setShowBuilder(false)
        setBuilderInitial(undefined)
        fetchTemplates()
      } else {
        alert(`Erro ao criar template: ${data.error || data.details || `HTTP ${res.status}`}`)
      }
    } catch (e: any) {
      alert(`Erro ao criar template: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  function openNewBuilder() {
    setBuilderInitial(undefined)
    setShowBuilder(true)
  }

  function openResubmitBuilder(template: Template) {
    // Pre-fill the builder with the rejected template's content so the
    // user can fix it and resubmit. Meta does not allow re-creating the
    // same name+language while it exists, so we suggest a new name.
    setBuilderInitial({
      accountId: template.waba_id || undefined,
      name: `${template.name}_v2`.slice(0, 512),
      language: template.language,
      category: template.category,
      components: template.components,
      header_text: template.header_text,
      body_text: template.body_text || template.body || template.content,
      footer_text: template.footer_text,
      buttons: template.buttons,
    })
    setShowBuilder(true)
  }

  function closeBuilder() {
    if (submitting) return
    setShowBuilder(false)
    setBuilderInitial(undefined)
  }

  async function openHistory(template: Template) {
    setHistoryTemplate(template)
    try {
      const res = await fetch(`/api/whatsapp/templates/${template.id}/history`)
      if (res.ok) {
        const data = await res.json()
        setHistoryData(data.history || [])
      } else {
        setHistoryData([])
      }
    } catch {
      setHistoryData([])
    }
  }

  const filtered = templates.filter(
    (t) => !search || t.name?.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-primary-500" />
            Templates WhatsApp
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Templates da Cloud API (Meta) com status oficial
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchTemplates}
            className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Atualizar
          </button>
          <button
            onClick={openNewBuilder}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl text-sm font-medium transition"
          >
            <Plus className="w-4 h-4" />
            Novo Template
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum template encontrado</h3>
          <p className="text-sm text-gray-500 mb-4">
            Crie seu primeiro template para usar com a Cloud API.
          </p>
          <button
            onClick={openNewBuilder}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-xl text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Criar Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((template) => {
            const status = (template.status?.toString().toUpperCase() || 'PENDING') as TemplateStatus
            return (
              <div
                key={template.id}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow flex flex-col"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 flex-1 pr-2">{template.name}</h3>
                  <TemplateStatusBadge status={status} size="sm" />
                </div>
                <p className="text-xs text-gray-500 mb-3 line-clamp-3 flex-1">
                  {templatePreview(template)}
                </p>
                <div className="flex items-center gap-2 mb-3">
                  {template.category && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {template.category}
                    </span>
                  )}
                  {template.language && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {template.language}
                    </span>
                  )}
                </div>
                {status === 'REJECTED' && (
                  <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                      <span className="text-xs font-medium text-red-700">Rejeitado pela Meta</span>
                    </div>
                    <p className="text-xs text-red-600 break-words">
                      {template.rejection_reason
                        ? formatRejectionReason(template.rejection_reason)
                        : 'A Meta nao informou um motivo especifico. Revise o conteudo e reenvie.'}
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-auto">
                  <span className="text-xs text-gray-400">
                    {template.use_count != null ? `${template.use_count} usos` : ''}
                  </span>
                  <div className="flex items-center gap-3">
                    {status === 'REJECTED' && (
                      <button
                        onClick={() => openResubmitBuilder(template)}
                        className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
                      >
                        <Pencil className="w-3 h-3" />
                        Editar e reenviar
                      </button>
                    )}
                    <button
                      onClick={() => openHistory(template)}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
                    >
                      <History className="w-3 h-3" />
                      Historico
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* TemplateBuilder Modal */}
      <AnimatePresence>
        {showBuilder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto"
            onClick={closeBuilder}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-4xl my-8 max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  {builderInitial ? 'Editar e reenviar template' : 'Novo Template'}
                </h2>
                <button
                  onClick={closeBuilder}
                  disabled={submitting}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-y-auto p-5">
                {builderInitial && (
                  <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                    Reenviando um template rejeitado. A Meta nao permite reutilizar o mesmo nome enquanto o template existir &mdash; ajuste o nome (sugerimos um sufixo) e corrija o conteudo antes de enviar.
                  </div>
                )}
                <TemplateBuilder
                  key={builderInitial ? `resubmit-${builderInitial.name}` : 'new'}
                  accounts={accounts}
                  onSubmit={handleCreateTemplate}
                  isSubmitting={submitting}
                  initialValue={builderInitial}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Modal */}
      {historyTemplate && (
        <TemplateCategoryHistoryModal
          open={!!historyTemplate}
          onClose={() => setHistoryTemplate(null)}
          templateName={historyTemplate.name}
          history={historyData}
        />
      )}
    </div>
  )
}
