'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database,
  Plus,
  Upload,
  Link,
  FileText,
  ShoppingBag,
  Trash2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2,
  File,
  Globe,
  X,
  Info,
  Sparkles,
  ExternalLink,
  Clock,
} from 'lucide-react'
import { AgentSource } from '@/lib/ai/types'

interface SourcesTabProps {
  agentId: string
  organizationId: string
  sources: AgentSource[]
  onSourcesChange: (sources: AgentSource[]) => void
  onRefresh: () => void
}

type SourceType = 'url' | 'file' | 'text' | 'products'

const sourceTypeConfig = {
  url: { icon: Globe, label: 'URL', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  file: { icon: File, label: 'Arquivo', color: 'text-green-400', bg: 'bg-green-500/20' },
  text: { icon: FileText, label: 'Texto', color: 'text-purple-400', bg: 'bg-purple-500/20' },
  products: { icon: ShoppingBag, label: 'Produtos', color: 'text-orange-400', bg: 'bg-orange-500/20' },
}

const statusConfig = {
  pending: { label: 'Pendente', color: 'text-yellow-400', bg: 'bg-yellow-500/20', icon: Clock },
  processing: { label: 'Processando', color: 'text-blue-400', bg: 'bg-blue-500/20', icon: Loader2 },
  ready: { label: 'Pronto', color: 'text-green-400', bg: 'bg-green-500/20', icon: CheckCircle },
  error: { label: 'Erro', color: 'text-red-400', bg: 'bg-red-500/20', icon: AlertCircle },
}

export default function SourcesTab({
  agentId,
  organizationId,
  sources,
  onSourcesChange,
  onRefresh,
}: SourcesTabProps) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [addType, setAddType] = useState<SourceType | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Form states
  const [urlInput, setUrlInput] = useState('')
  const [textName, setTextName] = useState('')
  const [textContent, setTextContent] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Add URL source
  const handleAddUrl = async () => {
    if (!urlInput.trim()) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/ai/agents/${agentId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          source_type: 'url',
          name: new URL(urlInput).hostname,
          url: urlInput,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao adicionar URL')
      }

      setUrlInput('')
      setShowAddModal(false)
      setAddType(null)
      onRefresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Add file source
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('organization_id', organizationId)
      formData.append('agent_id', agentId)

      const res = await fetch(`/api/ai/agents/${agentId}/sources/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao fazer upload')
      }

      setShowAddModal(false)
      setAddType(null)
      onRefresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Add text source
  const handleAddText = async () => {
    if (!textName.trim() || !textContent.trim()) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/ai/agents/${agentId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          source_type: 'text',
          name: textName,
          text_content: textContent,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erro ao adicionar texto')
      }

      setTextName('')
      setTextContent('')
      setShowAddModal(false)
      setAddType(null)
      onRefresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Delete source
  const handleDelete = async (sourceId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta fonte?')) return

    try {
      const res = await fetch(`/api/ai/agents/${agentId}/sources/${sourceId}?organization_id=${organizationId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        onSourcesChange(sources.filter(s => s.id !== sourceId))
      }
    } catch (err) {
      console.error('Error deleting source:', err)
    }
  }

  // Reprocess source
  const handleReprocess = async (sourceId: string) => {
    try {
      await fetch(`/api/ai/agents/${agentId}/sources/${sourceId}/reprocess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organizationId }),
      })
      onRefresh()
    } catch (err) {
      console.error('Error reprocessing source:', err)
    }
  }

  // Stats
  const totalChunks = sources.reduce((sum, s) => sum + (s.chunks_count || 0), 0)
  const readySources = sources.filter(s => s.status === 'ready').length

  return (
    <div className="editor-content-inner space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="sec-head">
          <div className="sec-ico">
            <Database />
          </div>
          <div>
            <h3 className="sec-t">Fontes de Conhecimento</h3>
            <p className="sec-s">Treine seu agente com informações do seu negócio</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onRefresh} className="btn btn-ghost btn-icon" aria-label="Atualizar">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Adicionar Fonte
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="tile">
          <p className="tile-v">{sources.length}</p>
          <p className="tile-k">Fontes totais</p>
        </div>
        <div className="tile">
          <p className="tile-v" style={{ color: 'var(--green)' }}>{readySources}</p>
          <p className="tile-k">Prontas para uso</p>
        </div>
        <div className="tile">
          <p className="tile-v" style={{ color: 'var(--blue)' }}>{totalChunks}</p>
          <p className="tile-k">Chunks indexados</p>
        </div>
      </div>

      {/* Sources List */}
      {sources.length === 0 ? (
        <div className="card text-center" style={{ padding: 32 }}>
          <div className="empty-ico" style={{ margin: '0 auto 16px' }}>
            <Database />
          </div>
          <h4 className="text-lg font-medium mb-2" style={{ color: 'var(--text)' }}>Nenhuma fonte adicionada</h4>
          <p className="text-sm mb-4 max-w-md mx-auto" style={{ color: 'var(--text-3)' }}>
            Adicione URLs, arquivos ou textos para treinar seu agente com informações específicas do seu negócio.
          </p>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary" style={{ display: 'inline-flex' }}>
            <Plus className="w-4 h-4" />
            Adicionar Primeira Fonte
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((source) => {
            const typeInfo = sourceTypeConfig[source.source_type]
            const statusInfo = statusConfig[source.status]
            const TypeIcon = typeInfo.icon
            const StatusIcon = statusInfo.icon

            return (
              <motion.div
                key={source.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="act-row group"
              >
                <div className="flex items-start gap-4 w-full">
                  {/* Icon */}
                  <div className="act-ico" style={{ background: 'var(--brand-tint)', color: 'var(--brand)' }}>
                    <TypeIcon className="w-5 h-5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="act-t truncate">{source.name}</h4>
                      <span className="chip" style={{ height: 22 }}>
                        <StatusIcon className={`w-3 h-3 ${source.status === 'processing' ? 'animate-spin' : ''}`} />
                        {statusInfo.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>{typeInfo.label}</span>

                      {source.source_type === 'url' && source.url && (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs flex items-center gap-1"
                          style={{ color: 'var(--blue)' }}
                        >
                          {source.url.slice(0, 40)}...
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}

                      {source.source_type === 'file' && source.original_filename && (
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>{source.original_filename}</span>
                      )}

                      {source.chunks_count > 0 && (
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                          {source.chunks_count} chunks
                        </span>
                      )}
                    </div>

                    {source.status === 'error' && source.error_message && (
                      <p className="text-xs mt-2" style={{ color: 'var(--red)' }}>{source.error_message}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {(source.status === 'error' || source.status === 'ready') && (
                      <button
                        onClick={() => handleReprocess(source.id)}
                        className="btn btn-soft btn-icon btn-sm"
                        title="Reprocessar"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(source.id)}
                      className="btn btn-soft btn-icon btn-sm"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Info Box */}
      <div className="callout blue" style={{ flexDirection: 'column', gap: 6 }}>
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Como funciona o RAG?
        </h4>
        <p className="text-sm">
          Seus documentos são processados, divididos em partes menores (chunks) e indexados.
          Quando o cliente faz uma pergunta, o sistema busca os chunks mais relevantes e os inclui
          no contexto da IA, permitindo respostas precisas baseadas no seu conteúdo.
        </p>
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => { setShowAddModal(false); setAddType(null); setError(''); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="modal"
              style={{ maxWidth: 520 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="modal-head">
                <h3 className="modal-title">
                  {addType ? `Adicionar ${sourceTypeConfig[addType].label}` : 'Adicionar Fonte'}
                </h3>
                <button
                  onClick={() => { setShowAddModal(false); setAddType(null); setError(''); }}
                  className="modal-x"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="modal-body">
                {error && (
                  <div className="callout red mb-4">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                {!addType ? (
                  /* Type Selection */
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setAddType('url')}
                      className="selcard"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24 }}
                    >
                      <div className="act-ico" style={{ width: 48, height: 48, background: 'var(--blue-tint)', color: 'var(--blue)' }}>
                        <Globe className="w-6 h-6" />
                      </div>
                      <div className="text-center">
                        <p className="font-medium" style={{ color: 'var(--text)' }}>URL</p>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>Site ou página web</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setAddType('file')}
                      className="selcard"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24 }}
                    >
                      <div className="act-ico" style={{ width: 48, height: 48, background: 'var(--green-tint)', color: 'var(--green)' }}>
                        <Upload className="w-6 h-6" />
                      </div>
                      <div className="text-center">
                        <p className="font-medium" style={{ color: 'var(--text)' }}>Arquivo</p>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>PDF, DOCX, TXT</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setAddType('text')}
                      className="selcard"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24 }}
                    >
                      <div className="act-ico" style={{ width: 48, height: 48, background: 'var(--purple-tint)', color: 'var(--purple)' }}>
                        <FileText className="w-6 h-6" />
                      </div>
                      <div className="text-center">
                        <p className="font-medium" style={{ color: 'var(--text)' }}>Texto</p>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>Cole texto diretamente</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setAddType('products')}
                      className="selcard"
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24 }}
                    >
                      <div className="act-ico" style={{ width: 48, height: 48, background: 'var(--brand-tint)', color: 'var(--brand)' }}>
                        <ShoppingBag className="w-6 h-6" />
                      </div>
                      <div className="text-center">
                        <p className="font-medium" style={{ color: 'var(--text)' }}>Produtos</p>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>Via integração</p>
                      </div>
                    </button>
                  </div>
                ) : addType === 'url' ? (
                  /* URL Form */
                  <div className="space-y-4">
                    <div>
                      <label className="label">URL do site</label>
                      <input
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://exemplo.com/pagina"
                        className="field"
                      />
                    </div>
                    <div className="callout">
                      <Info className="w-4 h-4 flex-shrink-0" />
                      <p>
                        O sistema irá crawlear até 100 páginas a partir desta URL.
                        Certifique-se de que o site é público e acessível.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setAddType(null); setUrlInput(''); }}
                        className="btn btn-soft btn-block"
                      >
                        Voltar
                      </button>
                      <button
                        onClick={handleAddUrl}
                        disabled={loading || !urlInput.trim()}
                        className="btn btn-primary btn-block"
                      >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        Adicionar
                      </button>
                    </div>
                  </div>
                ) : addType === 'file' ? (
                  /* File Upload */
                  <div className="space-y-4">
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="kb-add"
                      style={{ flexDirection: 'column', padding: 32 }}
                    >
                      <Upload className="w-12 h-12 mb-3" style={{ color: 'var(--text-4)' }} />
                      <p className="font-medium mb-1" style={{ color: 'var(--text)' }}>Clique para selecionar</p>
                      <p className="text-sm" style={{ color: 'var(--text-3)' }}>PDF, DOCX, TXT até 25MB</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    {loading && (
                      <div className="flex items-center justify-center gap-2" style={{ color: 'var(--text-3)' }}>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Enviando arquivo...</span>
                      </div>
                    )}
                    <button
                      onClick={() => setAddType(null)}
                      className="btn btn-soft btn-block"
                    >
                      Voltar
                    </button>
                  </div>
                ) : addType === 'text' ? (
                  /* Text Form */
                  <div className="space-y-4">
                    <div>
                      <label className="label">Nome da fonte</label>
                      <input
                        type="text"
                        value={textName}
                        onChange={(e) => setTextName(e.target.value)}
                        placeholder="Ex: FAQ, Políticas, Informações gerais"
                        className="field"
                      />
                    </div>
                    <div>
                      <label className="label">Conteúdo</label>
                      <textarea
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value.slice(0, 10000))}
                        placeholder="Cole aqui as informações que o agente deve conhecer..."
                        className="field"
                        style={{ minHeight: 160 }}
                      />
                      <p className="hint text-right">{textContent.length}/10000</p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setAddType(null); setTextName(''); setTextContent(''); }}
                        className="btn btn-soft btn-block"
                      >
                        Voltar
                      </button>
                      <button
                        onClick={handleAddText}
                        disabled={loading || !textName.trim() || !textContent.trim()}
                        className="btn btn-primary btn-block"
                      >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        Adicionar
                      </button>
                    </div>
                  </div>
                ) : addType === 'products' ? (
                  /* Products Info */
                  <div className="space-y-4">
                    <div className="text-center py-6">
                      <ShoppingBag className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--brand)' }} />
                      <h4 className="font-medium mb-2" style={{ color: 'var(--text)' }}>Sincronizar Produtos</h4>
                      <p className="text-sm mb-4" style={{ color: 'var(--text-3)' }}>
                        Configure uma integração na aba "Integrações" para sincronizar
                        automaticamente os produtos da sua loja.
                      </p>
                    </div>
                    <button
                      onClick={() => setAddType(null)}
                      className="btn btn-soft btn-block"
                    >
                      Voltar
                    </button>
                  </div>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
