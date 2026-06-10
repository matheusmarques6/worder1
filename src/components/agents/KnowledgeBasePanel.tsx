'use client'

// =============================================
// WORDER: Knowledge Base Panel
// Componente reutilizável — listar sources, upload docs, ver status.
// Migrado de /ai/knowledge para viver como aba em /whatsapp/ai-agents.
// Reskin Bloco C: usa o design system escopado `.agents-theme` (renderizado
// dentro do <AgentsTheme> da page). SÓ-UI — handlers/fetch inalterados.
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

// status → chip tone class (scoped) + icon
const STATUS_CONFIG: Record<string, { label: string; chip: string; icon: any }> = {
  pending: { label: 'Aguardando', chip: '', icon: Clock },
  processing: { label: 'Processando', chip: 'chip-blue', icon: Loader2 },
  ready: { label: 'Pronto', chip: 'chip-green', icon: CheckCircle },
  error: { label: 'Erro', chip: 'chip-red', icon: XCircle },
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
    return (
      <div className="page">
        <div className="empty-wrap">
          <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: 'var(--brand)' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-inner" style={{ maxWidth: 980 }}>
        {toast && (
          <div
            className={`chip ${toast.type === 'success' ? 'chip-green' : 'chip-red'}`}
            style={{ position: 'fixed', top: 80, right: 24, zIndex: 70, height: 36, boxShadow: 'var(--sh-md)' }}
          >
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div className="ph">
          <div className="ph-ico" style={{ background: 'var(--purple-tint)', color: 'var(--purple)' }}>
            <BookOpen />
          </div>
          <div style={{ flex: 1 }}>
            <h1>Knowledge Base</h1>
            <p>Documentos e fontes que alimentam os agentes de IA.</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            disabled={!selectedAgent}
            className="btn btn-primary"
          >
            <Plus /> Adicionar fonte
          </button>
        </div>

        {/* Agent selector */}
        {agents.length > 1 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
            {agents.map(a => (
              <button
                key={a.id}
                onClick={() => setSelectedAgent(a.id)}
                className={`btn btn-sm ${selectedAgent === a.id ? 'btn-soft' : 'btn-ghost'}`}
                style={selectedAgent === a.id ? { background: 'var(--brand-tint)', color: 'var(--brand-ink)' } : undefined}
              >
                {a.name}
              </button>
            ))}
          </div>
        )}

        {agents.length === 0 && (
          <div className="card empty-wrap" style={{ padding: '48px 20px' }}>
            <div className="empty-ico">
              <BookOpen />
            </div>
            <h2>Nenhum agente de IA criado</h2>
            <p>Crie um agente na aba “Agentes” para adicionar fontes de conhecimento.</p>
          </div>
        )}

        {/* Sources list */}
        {selectedAgent && (
          <>
            {sources.length === 0 ? (
              <div className="card empty-wrap" style={{ padding: '48px 20px' }}>
                <div className="empty-ico">
                  <FileText />
                </div>
                <h2>Nenhuma fonte de conhecimento</h2>
                <p>Adicione documentos, URLs ou textos para que o agente possa consultá-los.</p>
                <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
                  <Plus /> Adicionar primeira fonte
                </button>
              </div>
            ) : (
              <div className="card">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 18px',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.01em' }}>Fontes ({sources.length})</h2>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {sources.filter(s => s.status === 'ready').length} prontas ·{' '}
                    {sources.reduce((s, x) => s + (x.chunks_count || 0), 0)} chunks
                  </span>
                </div>
                <div>
                  {sources.map((src, i) => {
                    const Icon = SOURCE_ICONS[src.source_type] || FileText
                    const sts = STATUS_CONFIG[src.status] || STATUS_CONFIG.pending
                    const StsIcon = sts.icon
                    return (
                      <div
                        key={src.id}
                        className="group"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          padding: '14px 18px',
                          borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                        }}
                      >
                        <div className="act-ico" style={{ background: 'var(--surface-3)', color: 'var(--text-3)' }}>
                          <Icon size={18} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="act-t truncate">{src.name}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
                            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{SOURCE_LABELS[src.source_type]}</span>
                            {src.chunks_count > 0 && <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{src.chunks_count} chunks</span>}
                            {src.file_size && <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{(src.file_size / 1024).toFixed(0)}KB</span>}
                            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{new Date(src.created_at).toLocaleDateString('pt-BR')}</span>
                          </div>
                          {src.error_message && (
                            <p style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <AlertCircle size={11} /> {src.error_message}
                            </p>
                          )}
                        </div>
                        <span className={`chip ${sts.chip}`} style={{ height: 24 }}>
                          <StsIcon size={12} className={src.status === 'processing' ? 'animate-spin' : ''} />
                          {sts.label}
                        </span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleReprocess(src.id)} className="btn btn-soft btn-icon btn-sm" title="Reprocessar">
                            <RefreshCw size={14} />
                          </button>
                          <button onClick={() => handleDelete(src.id)} className="btn btn-soft btn-icon btn-sm" title="Remover">
                            <Trash2 size={14} />
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3 className="modal-title">Adicionar fonte de conhecimento</h3>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>O agente usará esta informação para responder perguntas.</p>
          </div>
          <button onClick={onClose} className="modal-x"><X size={18} /></button>
        </div>

        <div className="modal-body space-y-5">
          {/* Type selector */}
          <div className="seg">
            {types.map(t => {
              const Icon = t.icon
              return (
                <button
                  key={t.value}
                  onClick={() => setSourceType(t.value)}
                  className={`selcard${sourceType === t.value ? ' on' : ''}`}
                  style={{ padding: 13 }}
                >
                  <Icon size={16} style={{ color: sourceType === t.value ? 'var(--brand)' : 'var(--text-3)' }} />
                  <p style={{ fontSize: 13.5, fontWeight: 700, marginTop: 6 }}>{t.label}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.35 }}>{t.desc}</p>
                </button>
              )
            })}
          </div>

          <div>
            <label className="label">Nome</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Política de troca, FAQ de produtos, Sobre nós"
              className="field"
            />
          </div>

          {sourceType === 'url' ? (
            <div>
              <label className="label">URL</label>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://sualoja.com/politica-de-troca"
                className="field"
                style={{ fontFamily: 'var(--mono)' }}
              />
            </div>
          ) : (
            <div>
              <label className="label">
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
                className="field"
                style={{ minHeight: 160 }}
              />
              <p className="hint">{content.length} caracteres</p>
            </div>
          )}

          {error && (
            <div className="callout red">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        <div className="modal-foot" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-soft">Cancelar</button>
          <button
            onClick={submit}
            disabled={saving || !name.trim() || (sourceType === 'url' ? !url : !content)}
            className="btn btn-primary"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Adicionar
          </button>
        </div>
      </div>
    </div>
  )
}
