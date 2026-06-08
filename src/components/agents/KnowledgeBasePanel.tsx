'use client'

// =============================================
// WORDER: Knowledge Base Panel
// Componente reutilizável — listar sources, upload docs, ver status.
// Migrado de /ai/knowledge para viver como aba em /whatsapp/ai-agents.
// =============================================

import { useEffect, useState, useCallback } from 'react'
import {
  BookOpen,
  FileText,
  Globe,
  MessageSquare,
  Loader2,
  Trash2,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  X,
  AlertCircle,
  ShoppingBag,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Agent {
  id: string
  name: string
  description: string
  is_active: boolean
}

interface Source {
  id: string
  agent_id: string
  name: string
  source_type: 'file' | 'url' | 'text' | 'faq' | 'shopify_products' | 'shopify_policies'
  status: 'pending' | 'processing' | 'ready' | 'error'
  chunks_count: number
  file_size: number | null
  error_message: string | null
  created_at: string
}

const SOURCE_ICONS: Record<string, any> = {
  file: FileText,
  url: Globe,
  text: MessageSquare,
  faq: MessageSquare,
  shopify_products: ShoppingBag,
  shopify_policies: FileText,
}

const SOURCE_LABELS: Record<string, string> = {
  file: 'Documento',
  url: 'URL',
  text: 'Texto',
  faq: 'FAQ',
  shopify_products: 'Produtos Shopify',
  shopify_policies: 'Políticas Shopify',
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: any }> = {
  pending: { label: 'Aguardando', className: 'bg-gray-100 text-gray-600', icon: Clock },
  processing: { label: 'Processando', className: 'bg-blue-50 text-blue-700 border border-blue-200', icon: Loader2 },
  ready: { label: 'Pronto', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: CheckCircle },
  error: { label: 'Erro', className: 'bg-red-50 text-red-700 border border-red-200', icon: XCircle },
}

export default function KnowledgeBasePanel({ organizationId: _organizationId }: { organizationId: string }) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2500)
  }

  // Load agents
  useEffect(() => {
    fetch('/api/ai/agents')
      .then(r => r.json())
      .then(d => {
        const list = Array.isArray(d) ? d : (d.agents || [])
        setAgents(list)
        if (list.length > 0 && !selectedAgent) setSelectedAgent(list[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Load sources when agent changes
  const loadSources = useCallback(async () => {
    if (!selectedAgent) return
    try {
      const res = await fetch(`/api/ai/agents/${selectedAgent}/sources`)
      if (res.ok) {
        const d = await res.json()
        setSources(Array.isArray(d) ? d : (d.sources || []))
      }
    } catch { setSources([]) }
  }, [selectedAgent])

  useEffect(() => { loadSources() }, [loadSources])

  const handleDelete = async (sourceId: string) => {
    if (!confirm('Remover esta fonte de conhecimento?')) return
    try {
      const res = await fetch(`/api/ai/agents/${selectedAgent}/sources/${sourceId}`, { method: 'DELETE' })
      if (res.ok) {
        setSources(prev => prev.filter(s => s.id !== sourceId))
        showToast('Fonte removida')
      }
    } catch { showToast('Erro ao remover', 'error') }
  }

  const handleReprocess = async (sourceId: string) => {
    try {
      await fetch(`/api/ai/agents/${selectedAgent}/sources/${sourceId}/reprocess`, { method: 'POST' })
      showToast('Reprocessamento iniciado')
      loadSources()
    } catch { showToast('Erro', 'error') }
  }

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {toast && (
        <div className={cn(
          'fixed top-20 right-6 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium',
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
        )}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Knowledge Base</h1>
            <p className="text-sm text-gray-500 mt-0.5">Documentos e fontes que alimentam os agentes de IA.</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          disabled={!selectedAgent}
          className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <Plus size={16} /> Adicionar fonte
        </button>
      </div>

      {/* Agent selector */}
      {agents.length > 1 && (
        <div className="flex gap-2">
          {agents.map(a => (
            <button
              key={a.id}
              onClick={() => setSelectedAgent(a.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
                selectedAgent === a.id
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              )}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {agents.length === 0 && (
        <div className="bg-white border border-dashed border-gray-200 rounded-xl p-12 text-center">
          <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum agente de IA criado.</p>
          <p className="text-xs text-gray-400 mt-1">Crie um agente na aba “Agentes” para adicionar fontes de conhecimento.</p>
        </div>
      )}

      {/* Sources list */}
      {selectedAgent && (
        <>
          {sources.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-200 rounded-xl p-12 text-center">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Nenhuma fonte de conhecimento adicionada.</p>
              <p className="text-xs text-gray-400 mt-1">Adicione documentos, URLs ou textos para que o agente possa consultá-los.</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-orange-500 hover:text-orange-600"
              >
                <Plus size={14} /> Adicionar primeira fonte
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">Fontes ({sources.length})</h2>
                <span className="text-xs text-gray-400">
                  {sources.filter(s => s.status === 'ready').length} prontas ·{' '}
                  {sources.reduce((s, x) => s + (x.chunks_count || 0), 0)} chunks
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {sources.map(src => {
                  const Icon = SOURCE_ICONS[src.source_type] || FileText
                  const sts = STATUS_CONFIG[src.status] || STATUS_CONFIG.pending
                  const StsIcon = sts.icon
                  return (
                    <div key={src.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 group">
                      <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                        <Icon size={18} className="text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{src.name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-gray-400">{SOURCE_LABELS[src.source_type]}</span>
                          {src.chunks_count > 0 && <span className="text-xs text-gray-400">{src.chunks_count} chunks</span>}
                          {src.file_size && <span className="text-xs text-gray-400">{(src.file_size / 1024).toFixed(0)}KB</span>}
                          <span className="text-xs text-gray-400">{new Date(src.created_at).toLocaleDateString('pt-BR')}</span>
                        </div>
                        {src.error_message && (
                          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                            <AlertCircle size={10} /> {src.error_message}
                          </p>
                        )}
                      </div>
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1', sts.className)}>
                        <StsIcon size={10} className={src.status === 'processing' ? 'animate-spin' : ''} />
                        {sts.label}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleReprocess(src.id)} className="p-1.5 rounded hover:bg-gray-100" title="Reprocessar">
                          <RefreshCw size={14} className="text-gray-400" />
                        </button>
                        <button onClick={() => handleDelete(src.id)} className="p-1.5 rounded hover:bg-red-50" title="Remover">
                          <Trash2 size={14} className="text-gray-400 hover:text-red-500" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Add source modal */}
      {showAddModal && selectedAgent && (
        <AddSourceModal
          agentId={selectedAgent}
          onClose={() => setShowAddModal(false)}
          onAdded={() => { showToast('Fonte adicionada'); loadSources() }}
        />
      )}
    </div>
  )
}

// ================================================================
function AddSourceModal({ agentId, onClose, onAdded }: { agentId: string; onClose: () => void; onAdded: () => void }) {
  const [sourceType, setSourceType] = useState<'text' | 'url' | 'faq'>('text')
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const types = [
    { value: 'text', label: 'Texto', icon: MessageSquare, desc: 'Cole informações sobre seu negócio' },
    { value: 'url', label: 'URL', icon: Globe, desc: 'Importe conteúdo de uma página web' },
    { value: 'faq', label: 'FAQ', icon: FileText, desc: 'Perguntas e respostas frequentes' },
  ] as const

  const submit = async () => {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, any> = {
        name: name.trim(),
        source_type: sourceType,
      }
      if (sourceType === 'url') body.url = url
      else body.content = content

      const res = await fetch(`/api/ai/agents/${agentId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Erro'); return }
      onAdded()
      onClose()
    } catch (e: any) { setError(e?.message) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Adicionar fonte de conhecimento</h3>
            <p className="text-xs text-gray-500 mt-0.5">O agente usará esta informação para responder perguntas.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100"><X size={18} className="text-gray-500" /></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Type selector */}
          <div className="grid grid-cols-3 gap-2">
            {types.map(t => {
              const Icon = t.icon
              return (
                <button
                  key={t.value}
                  onClick={() => setSourceType(t.value)}
                  className={cn(
                    'p-3 border rounded-lg text-left transition-colors',
                    sourceType === t.value ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'
                  )}
                >
                  <Icon size={16} className={sourceType === t.value ? 'text-orange-600' : 'text-gray-400'} />
                  <p className="text-sm font-medium text-gray-900 mt-1.5">{t.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{t.desc}</p>
                </button>
              )
            })}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nome</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Política de troca, FAQ de produtos, Sobre nós"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>

          {sourceType === 'url' ? (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">URL</label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://sualoja.com/politica-de-troca"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {sourceType === 'faq' ? 'Perguntas e Respostas' : 'Conteúdo'}
              </label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={8}
                placeholder={sourceType === 'faq'
                  ? 'P: Qual o prazo de entrega?\nR: O prazo é de 3 a 7 dias úteis.\n\nP: Posso trocar um produto?\nR: Sim, aceitamos trocas em até 30 dias.'
                  : 'Cole aqui informações sobre seu negócio, produtos, políticas, etc.'
                }
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">{content.length} caracteres</p>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={12} className="flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg">Cancelar</button>
          <button
            onClick={submit}
            disabled={saving || !name.trim() || (sourceType === 'url' ? !url : !content)}
            className="px-4 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Adicionar
          </button>
        </div>
      </div>
    </div>
  )
}
