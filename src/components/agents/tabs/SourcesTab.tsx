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
  ChevronDown,
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Database className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Fontes de Conhecimento</h3>
            <p className="text-sm text-dark-400">Treine seu agente com informações do seu negócio</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="p-2 rounded-xl bg-dark-800/50 border border-dark-700/50 text-dark-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar Fonte
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
          <p className="text-2xl font-bold text-white">{sources.length}</p>
          <p className="text-sm text-dark-400">Fontes totais</p>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
          <p className="text-2xl font-bold text-green-400">{readySources}</p>
          <p className="text-sm text-dark-400">Prontas para uso</p>
        </div>
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4">
          <p className="text-2xl font-bold text-blue-400">{totalChunks}</p>
          <p className="text-sm text-dark-400">Chunks indexados</p>
        </div>
      </div>

      {/* Sources List */}
      {sources.length === 0 ? (
        <div className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-dark-700/50 flex items-center justify-center mx-auto mb-4">
            <Database className="w-8 h-8 text-dark-500" />
          </div>
          <h4 className="text-lg font-medium text-white mb-2">Nenhuma fonte adicionada</h4>
          <p className="text-sm text-dark-400 mb-4 max-w-md mx-auto">
            Adicione URLs, arquivos ou textos para treinar seu agente com informações específicas do seu negócio.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors"
          >
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
                className="bg-dark-800/50 border border-dark-700/50 rounded-xl p-4 hover:bg-dark-800/70 transition-colors group"
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl ${typeInfo.bg} flex items-center justify-center flex-shrink-0`}>
                    <TypeIcon className={`w-5 h-5 ${typeInfo.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-white font-medium truncate">{source.name}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.bg} ${statusInfo.color} flex items-center gap-1`}>
                        <StatusIcon className={`w-3 h-3 ${source.status === 'processing' ? 'animate-spin' : ''}`} />
                        {statusInfo.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-xs text-dark-500">{typeInfo.label}</span>
                      
                      {source.source_type === 'url' && source.url && (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          {source.url.slice(0, 40)}...
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}

                      {source.source_type === 'file' && source.original_filename && (
                        <span className="text-xs text-dark-400">{source.original_filename}</span>
                      )}

                      {source.chunks_count > 0 && (
                        <span className="text-xs text-dark-400">
                          {source.chunks_count} chunks
                        </span>
                      )}
                    </div>

                    {source.status === 'error' && source.error_message && (
                      <p className="text-xs text-red-400 mt-2">{source.error_message}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {source.status === 'error' && (
                      <button
                        onClick={() => handleReprocess(source.id)}
                        className="p-2 rounded-lg text-dark-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
                        title="Reprocessar"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(source.id)}
                      className="p-2 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
      <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-xl p-4">
        <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          Como funciona o RAG?
        </h4>
        <p className="text-sm text-dark-400">
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
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => { setShowAddModal(false); setAddType(null); setError(''); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-dark-800 rounded-2xl w-full max-w-lg border border-dark-700 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-dark-700">
                <h3 className="text-lg font-semibold text-white">
                  {addType ? `Adicionar ${sourceTypeConfig[addType].label}` : 'Adicionar Fonte'}
                </h3>
                <button
                  onClick={() => { setShowAddModal(false); setAddType(null); setError(''); }}
                  className="p-2 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4">
                {error && (
                  <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                {!addType ? (
                  /* Type Selection */
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setAddType('url')}
                      className="flex flex-col items-center gap-3 p-6 bg-dark-900/50 border border-dark-700/50 rounded-xl hover:bg-dark-900 hover:border-blue-500/30 transition-all group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Globe className="w-6 h-6 text-blue-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-white font-medium">URL</p>
                        <p className="text-xs text-dark-500">Site ou página web</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setAddType('file')}
                      className="flex flex-col items-center gap-3 p-6 bg-dark-900/50 border border-dark-700/50 rounded-xl hover:bg-dark-900 hover:border-green-500/30 transition-all group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Upload className="w-6 h-6 text-green-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-white font-medium">Arquivo</p>
                        <p className="text-xs text-dark-500">PDF, DOCX, TXT</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setAddType('text')}
                      className="flex flex-col items-center gap-3 p-6 bg-dark-900/50 border border-dark-700/50 rounded-xl hover:bg-dark-900 hover:border-purple-500/30 transition-all group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <FileText className="w-6 h-6 text-purple-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-white font-medium">Texto</p>
                        <p className="text-xs text-dark-500">Cole texto diretamente</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setAddType('products')}
                      className="flex flex-col items-center gap-3 p-6 bg-dark-900/50 border border-dark-700/50 rounded-xl hover:bg-dark-900 hover:border-orange-500/30 transition-all group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <ShoppingBag className="w-6 h-6 text-orange-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-white font-medium">Produtos</p>
                        <p className="text-xs text-dark-500">Via integração</p>
                      </div>
                    </button>
                  </div>
                ) : addType === 'url' ? (
                  /* URL Form */
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">URL do site</label>
                      <input
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://exemplo.com/pagina"
                        className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder:text-dark-500 focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                    <div className="flex items-start gap-2 p-3 bg-dark-900/50 rounded-lg">
                      <Info className="w-4 h-4 text-dark-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-dark-400">
                        O sistema irá crawlear até 100 páginas a partir desta URL.
                        Certifique-se de que o site é público e acessível.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setAddType(null); setUrlInput(''); }}
                        className="flex-1 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
                      >
                        Voltar
                      </button>
                      <button
                        onClick={handleAddUrl}
                        disabled={loading || !urlInput.trim()}
                        className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-dark-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
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
                      className="border-2 border-dashed border-dark-600 rounded-xl p-8 text-center cursor-pointer hover:border-green-500/50 hover:bg-green-500/5 transition-all"
                    >
                      <Upload className="w-12 h-12 text-dark-500 mx-auto mb-3" />
                      <p className="text-white font-medium mb-1">Clique para selecionar</p>
                      <p className="text-sm text-dark-500">PDF, DOCX, TXT até 25MB</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.txt,.csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    {loading && (
                      <div className="flex items-center justify-center gap-2 text-dark-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Enviando arquivo...</span>
                      </div>
                    )}
                    <button
                      onClick={() => setAddType(null)}
                      className="w-full py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
                    >
                      Voltar
                    </button>
                  </div>
                ) : addType === 'text' ? (
                  /* Text Form */
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">Nome da fonte</label>
                      <input
                        type="text"
                        value={textName}
                        onChange={(e) => setTextName(e.target.value)}
                        placeholder="Ex: FAQ, Políticas, Informações gerais"
                        className="w-full px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder:text-dark-500 focus:outline-none focus:border-purple-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-2">Conteúdo</label>
                      <textarea
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value.slice(0, 10000))}
                        placeholder="Cole aqui as informações que o agente deve conhecer..."
                        className="w-full h-40 px-4 py-3 bg-dark-900/50 border border-dark-700/50 rounded-xl text-white placeholder:text-dark-500 resize-none focus:outline-none focus:border-purple-500/50"
                      />
                      <p className="text-xs text-dark-500 mt-1 text-right">{textContent.length}/10000</p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setAddType(null); setTextName(''); setTextContent(''); }}
                        className="flex-1 py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
                      >
                        Voltar
                      </button>
                      <button
                        onClick={handleAddText}
                        disabled={loading || !textName.trim() || !textContent.trim()}
                        className="flex-1 py-2.5 bg-purple-500 hover:bg-purple-600 disabled:bg-dark-600 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
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
                      <ShoppingBag className="w-12 h-12 text-orange-400 mx-auto mb-3" />
                      <h4 className="text-white font-medium mb-2">Sincronizar Produtos</h4>
                      <p className="text-sm text-dark-400 mb-4">
                        Configure uma integração na aba "Integrações" para sincronizar
                        automaticamente os produtos da sua loja.
                      </p>
                    </div>
                    <button
                      onClick={() => setAddType(null)}
                      className="w-full py-2.5 bg-dark-700 hover:bg-dark-600 text-white rounded-xl font-medium transition-colors"
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
