'use client'

// =============================================
// TemplatePickerModal — composer-side picker with two tabs:
//
//   1. "Oficiais Meta": APPROVED templates from whatsapp_templates.
//      Selecting one opens a variable form; submit dispatches a
//      type=template send via /send-template route.
//
//   2. "Modelos rapidos": whatsapp_quick_replies. Selecting one
//      expands the content into the composer input (does NOT send).
//
// Both feeds come from existing routes:
//   - GET /api/whatsapp/templates?organizationId=X&status=APPROVED
//   - GET /api/whatsapp/inbox/quick-replies
//
// The actual send-template call is made by the parent via
// onSendTemplate(); this modal only collects inputs.
// =============================================

import { useEffect, useMemo, useState } from 'react'
import { X, Search, FileText, MessageSquare, Loader2, ChevronLeft, Send } from 'lucide-react'
import { authedFetch } from '@/lib/api/authed-fetch'
import { Badge } from '@/components/ui/Badge'

export interface SendTemplatePayload {
  templateName: string
  language: string
  parameters: string[]
}

interface TemplateRow {
  id: string
  name: string
  language: string
  category: string
  status: string
  body_text: string | null
  body_variables: number | null
  header_text: string | null
  footer_text: string | null
}

interface QuickReplyRow {
  id: string
  shortcut: string
  title: string
  content: string
  category: string
}

interface TemplatePickerModalProps {
  open: boolean
  organizationId: string
  onClose: () => void
  onSendTemplate: (payload: SendTemplatePayload) => Promise<void>
  onSelectQuickReply: (content: string) => void
  isSending?: boolean
}

function countBodyVariables(bodyText: string | null | undefined): number {
  if (!bodyText) return 0
  const m = bodyText.match(/\{\{\s*\d+\s*\}\}/g)
  return m ? m.length : 0
}

function renderPreview(bodyText: string, params: string[]): string {
  return bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => {
    const idx = parseInt(n, 10) - 1
    return params[idx] || `{{${n}}}`
  })
}

export function TemplatePickerModal({
  open,
  organizationId,
  onClose,
  onSendTemplate,
  onSelectQuickReply,
  isSending = false,
}: TemplatePickerModalProps) {
  const [tab, setTab] = useState<'official' | 'quick'>('official')
  const [search, setSearch] = useState('')
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [quickReplies, setQuickReplies] = useState<QuickReplyRow[]>([])
  const [loadingT, setLoadingT] = useState(false)
  const [loadingQ, setLoadingQ] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TemplateRow | null>(null)
  const [params, setParams] = useState<string[]>([])

  useEffect(() => {
    if (!open) {
      setSelected(null)
      setParams([])
      setSearch('')
      setError(null)
      return
    }
    loadTemplates()
    loadQuickReplies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId])

  async function loadTemplates() {
    setLoadingT(true)
    setError(null)
    try {
      const res = await authedFetch(
        `/api/whatsapp/templates?organizationId=${encodeURIComponent(organizationId)}&status=APPROVED`,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`)
        setTemplates([])
        return
      }
      setTemplates(data.templates || [])
    } catch (e: any) {
      setError(e?.message || 'Erro de rede')
      setTemplates([])
    } finally {
      setLoadingT(false)
    }
  }

  async function loadQuickReplies() {
    setLoadingQ(true)
    try {
      const res = await authedFetch(`/api/whatsapp/inbox/quick-replies`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) setQuickReplies(data.quickReplies || data.data || [])
    } catch { /* silent */ }
    finally { setLoadingQ(false) }
  }

  const filteredT = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return templates
    return templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.body_text || '').toLowerCase().includes(q),
    )
  }, [templates, search])

  const filteredQ = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^\//, '')
    if (!q) return quickReplies
    return quickReplies.filter(r =>
      r.shortcut.toLowerCase().replace(/^\//, '').includes(q) ||
      r.title.toLowerCase().includes(q) ||
      r.content.toLowerCase().includes(q),
    )
  }, [quickReplies, search])

  function handlePickTemplate(t: TemplateRow) {
    const n = countBodyVariables(t.body_text)
    setSelected(t)
    setParams(Array(n).fill(''))
  }

  function handlePickQuickReply(r: QuickReplyRow) {
    onSelectQuickReply(r.content)
    onClose()
  }

  async function handleSubmitTemplate() {
    if (!selected) return
    const expected = countBodyVariables(selected.body_text)
    if (params.some((p, i) => i < expected && !p.trim())) {
      setError('Preencha todas as variaveis')
      return
    }
    setError(null)
    try {
      await onSendTemplate({
        templateName: selected.name,
        language: selected.language,
        parameters: params.slice(0, expected),
      })
      onClose()
    } catch (e: any) {
      setError(e?.message || 'Falha ao enviar template')
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            {selected && (
              <button
                onClick={() => { setSelected(null); setParams([]); setError(null) }}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-600"
                title="Voltar"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-gray-900">
              {selected ? selected.name : 'Templates e modelos'}
            </h2>
            {selected && (
              <Badge variant="primary" size="sm">{selected.language}</Badge>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {!selected && (
          <>
            <div className="flex items-center border-b border-gray-200">
              <button
                onClick={() => setTab('official')}
                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === 'official'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <FileText className="w-4 h-4 inline mr-1.5" />
                Oficiais Meta
              </button>
              <button
                onClick={() => setTab('quick')}
                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === 'quick'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <MessageSquare className="w-4 h-4 inline mr-1.5" />
                Modelos rapidos
              </button>
            </div>

            <div className="px-5 py-3 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={tab === 'official' ? 'Buscar template...' : 'Buscar atalho...'}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {tab === 'official' && (
                <>
                  {loadingT ? (
                    <div className="flex items-center justify-center py-12 text-gray-500">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Carregando...
                    </div>
                  ) : error ? (
                    <div className="text-center py-8 text-sm text-red-600">{error}</div>
                  ) : filteredT.length === 0 ? (
                    <div className="text-center py-12 text-sm text-gray-500">
                      Nenhum template aprovado encontrado.
                      <br />
                      <span className="text-xs">Crie em WhatsApp &gt; Templates.</span>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {filteredT.map(t => {
                        const vars = countBodyVariables(t.body_text)
                        return (
                          <li key={t.id}>
                            <button
                              onClick={() => handlePickTemplate(t)}
                              className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-primary-400 hover:bg-orange-50 transition-colors"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-gray-900 text-sm">{t.name}</span>
                                <Badge variant="success" size="sm">APPROVED</Badge>
                                <Badge variant="default" size="sm">{t.category}</Badge>
                                <Badge variant="default" size="sm">{t.language}</Badge>
                                {vars > 0 && (
                                  <Badge variant="warning" size="sm">{vars} variavel(is)</Badge>
                                )}
                              </div>
                              <p className="text-xs text-gray-600 line-clamp-2">
                                {t.body_text || '(sem corpo)'}
                              </p>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </>
              )}

              {tab === 'quick' && (
                <>
                  {loadingQ ? (
                    <div className="flex items-center justify-center py-12 text-gray-500">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Carregando...
                    </div>
                  ) : filteredQ.length === 0 ? (
                    <div className="text-center py-12 text-sm text-gray-500">
                      Nenhum atalho encontrado.
                      <br />
                      <span className="text-xs">Crie em WhatsApp &gt; Configuracoes &gt; Atalhos.</span>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {filteredQ.map(r => (
                        <li key={r.id}>
                          <button
                            onClick={() => handlePickQuickReply(r)}
                            className="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-primary-400 hover:bg-orange-50 transition-colors"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <code className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-mono">
                                {r.shortcut}
                              </code>
                              <span className="font-medium text-gray-900 text-sm">{r.title}</span>
                            </div>
                            <p className="text-xs text-gray-600 line-clamp-2">{r.content}</p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {selected && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {selected.header_text && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">CABECALHO</p>
                  <p className="text-sm text-gray-900">{selected.header_text}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">CORPO</p>
                <p className="text-sm text-gray-900 whitespace-pre-wrap">
                  {selected.body_text}
                </p>
              </div>

              {selected.footer_text && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">RODAPE</p>
                  <p className="text-xs text-gray-500">{selected.footer_text}</p>
                </div>
              )}

              {params.length > 0 && (
                <div className="border-t border-gray-200 pt-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700">
                    Preencha as variaveis
                  </p>
                  {params.map((value, idx) => (
                    <div key={idx}>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Variavel {`{{${idx + 1}}}`}
                      </label>
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => {
                          const next = params.slice()
                          next[idx] = e.target.value
                          setParams(next)
                        }}
                        placeholder={`Valor para {{${idx + 1}}}`}
                        className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  ))}

                  <div className="border-t border-dashed border-gray-200 pt-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">PREVIEW</p>
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-900 whitespace-pre-wrap">
                      {renderPreview(selected.body_text || '', params)}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            <div className="flex gap-3 px-5 py-4 border-t border-gray-200">
              <button
                onClick={onClose}
                disabled={isSending}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmitTemplate}
                disabled={isSending}
                className="flex-1 px-4 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                ) : (
                  <><Send className="w-4 h-4" /> Enviar template</>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default TemplatePickerModal
